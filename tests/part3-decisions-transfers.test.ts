import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { aiUseCases, entities, organisations, processingActivities } from "@/db/schema";
import { cleanPart3Restriction, restrictionProvision } from "@/lib/dpa2018/part3-rights";
import { AutomatedDecisionRefused, admGaps, admRestriction, cleanAdm, type AdmRecord } from "@/lib/gdpr/automated-decisions";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { evaluate } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { validateTemplate } from "@/lib/templates/validate";
import { createUseCase } from "@/services/ai-register";
import {
  copyAutomatedDecisions,
  linkUseCaseToActivity,
  setAutomatedDecisions,
  regimeOfUseCase,
} from "@/services/automated-decisions";
import { recordRequest, recordRequestDecision } from "@/services/data-subject-requests";
import { setCompetentAuthority } from "@/services/entities";
import { createActivity } from "@/services/ropa";
import { shippedTemplatesMissing } from "@/services/templates";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "part 3 decisions test" };

after(() => pg.end());

const ALL_SAFEGUARDS = {
  information: { confirmed: true },
  representations: { confirmed: true },
  human_intervention: { confirmed: true },
  contest: { confirmed: true },
};
const SENSITIVE: AdmRecord = { automatedDecisions: true, admSpecialCategory: true, admSpecialCondition: null, admSafeguards: ALL_SAFEGUARDS };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Part 3 decisions ${label}`, slug: `p3d-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [force] = await db.insert(entities).values({ organisationId: org.id, name: "Constabulary", isDefault: true }).returning();
  await setCompetentAuthority({ organisationId: org.id, entityId: force.id, competentAuthority: true, defaultRegime: "dpa_part3", actor: SYSTEM });
  const custody = await createActivity({ organisationId: org.id, entityId: force.id, name: "Custody risk flags", actor: SYSTEM });
  const payroll = await createActivity({ organisationId: org.id, entityId: force.id, name: "Payroll", regime: "uk_gdpr", lawfulBases: ["contract"], actor: SYSTEM });
  const useCase = await createUseCase({
    organisationId: org.id, entityId: force.id, name: "Risk scoring", purpose: "Score custody risk.",
    systemType: "predictive", provenance: "built_in_house", actor: SYSTEM,
  });
  return { org, force, custody, payroll, useCase };
}

describe("automated decisions under Part 3, as checked", () => {
  it("takes Part 3's conditions and refuses the UK GDPR's, and the other way round", () => {
    assert.equal(cleanAdm({ ...SENSITIVE, admSpecialCondition: "required_by_law" }, "dpa_part3").admSpecialCondition, "required_by_law");
    assert.equal(cleanAdm({ ...SENSITIVE, admSpecialCondition: "explicit_consent" }, "dpa_part3").admSpecialCondition, "explicit_consent");
    assert.throws(() => cleanAdm({ ...SENSITIVE, admSpecialCondition: "contract_or_law" }, "dpa_part3"), /contract is not one/);
    assert.throws(() => cleanAdm({ ...SENSITIVE, admSpecialCondition: "required_by_law" }), /Part 3's condition/);
  });

  it("lets the safeguards be set aside only under Part 3, for a s.50C(4) reason, with reconsideration", () => {
    const aside = cleanAdm({ ...SENSITIVE, admSpecialCondition: "required_by_law", admSetAside: { reasons: ["d", "b"], reconsideration: " Custody sergeant reviews within 24 hours " } }, "dpa_part3");
    assert.deepEqual(aside.admSetAside, { reasons: ["b", "d"], reconsideration: "Custody sergeant reviews within 24 hours" });
    assert.throws(() => cleanAdm({ ...SENSITIVE, admSetAside: { reasons: ["b"], reconsideration: "" } }, "dpa_part3"), /reconsidered/);
    assert.throws(() => cleanAdm({ ...SENSITIVE, admSetAside: { reasons: [], reconsideration: "Reviewed" } }, "dpa_part3"), /reason/);
    assert.throws(() => cleanAdm({ ...SENSITIVE, admSetAside: { reasons: ["f"], reconsideration: "Reviewed" } }, "dpa_part3"), AutomatedDecisionRefused);
    assert.throws(() => cleanAdm({ ...SENSITIVE, admSetAside: { reasons: ["b"], reconsideration: "Reviewed" } }), /UK GDPR has no such/);
    assert.equal("admSetAside" in cleanAdm({ automatedDecisions: false }), false, "a UK GDPR save leaves any set-aside alone");
    assert.equal(cleanAdm({ automatedDecisions: false, admSetAside: null }, "dpa_part3").admSetAside, null);
  });

  it("reports gaps and restrictions by the regime's own rules", () => {
    const ea = { automatedDecisions: true, admSpecialCategory: false, admSpecialCondition: null, admSafeguards: ALL_SAFEGUARDS } as AdmRecord;
    assert.deepEqual(admGaps(ea, ["recognised_legitimate_interests"], "dpa_part3"), [], "no Article 22B(4) under Part 3");
    const contract = { ...SENSITIVE, admSpecialCondition: "contract_or_law" } as AdmRecord;
    assert.deepEqual(admGaps(contract, undefined, "dpa_part3"), ["adm_special_no_condition"]);
    assert.deepEqual(admGaps(contract), [], "regime unknown: any condition counts");
    assert.equal(admRestriction(contract, undefined, "dpa_part3").allowed, false);
    assert.match(admRestriction(SENSITIVE, undefined, "dpa_part3").why!, /section 50B/);
  });

  it("reads an AI use case as Part 3 only when every activity it is linked to is", () => {
    assert.equal(regimeOfUseCase([]), "uk_gdpr");
    assert.equal(regimeOfUseCase([{ regime: "dpa_part3" }]), "dpa_part3");
    assert.equal(regimeOfUseCase([{ regime: "dpa_part3" }, { regime: "uk_gdpr" }]), "uk_gdpr");
  });

  it("saves and copies under the regime of the record written to", async () => {
    const w = await world("adm");
    assert.equal(w.custody.regime, "dpa_part3");
    const record = { ...SENSITIVE, admSpecialCondition: "required_by_law", admSetAside: { reasons: ["b"], reconsideration: "Inspector reviews" } };
    await setAutomatedDecisions({ organisationId: w.org.id, side: "processing_activity", id: w.custody.id, record, actor: SYSTEM });
    const [saved] = await db.select().from(processingActivities).where(eq(processingActivities.id, w.custody.id));
    assert.deepEqual(saved.admSetAside, { reasons: ["b"], reconsideration: "Inspector reviews" });

    // Unlinked, the use case is read under the UK GDPR.
    await assert.rejects(
      setAutomatedDecisions({ organisationId: w.org.id, side: "ai_use_case", id: w.useCase.id, record, actor: SYSTEM }),
      /UK GDPR/,
    );
    await linkUseCaseToActivity({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.custody.id, actor: SYSTEM });
    await copyAutomatedDecisions({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.custody.id, to: "ai_use_case", actor: SYSTEM });
    const [copied] = await db.select().from(aiUseCases).where(eq(aiUseCases.id, w.useCase.id));
    assert.equal(copied.admSpecialCondition, "required_by_law");
    assert.deepEqual(copied.admSetAside, { reasons: ["b"], reconsideration: "Inspector reviews" });

    // Linked to a UK GDPR activity too, it is read under the UK GDPR, and Part 3's record will not copy there.
    await linkUseCaseToActivity({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.payroll.id, actor: SYSTEM });
    await assert.rejects(
      copyAutomatedDecisions({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.payroll.id, to: "processing_activity", actor: SYSTEM }),
      /Part 3's condition/,
    );
  });
});

describe("the national security exemption on a request", () => {
  it("is recorded as s.78A, only when confirmed required, with any s.79 certificate", async () => {
    const r = cleanPart3Restriction({ provision: "s78a", grounds: ["b"], nationalSecurityRequired: true, certificate: " NS/2026/14 ", personTold: false, notToldReason: "Would reveal an operation" });
    assert.deepEqual(r.grounds, []);
    assert.equal(r.certificate, "NS/2026/14");
    assert.equal(restrictionProvision(r), "DPA 2018 s.78A");
    assert.throws(() => cleanPart3Restriction({ provision: "s78a", personTold: true }), /required to safeguard national security/);

    const w = await world("s78a");
    const request = await recordRequest({
      organisationId: w.org.id, entityId: w.force.id, rights: ["access"], channel: "email", jurisdiction: "uk",
      receivedAt: new Date(Date.now() - 86_400_000), description: "What do you hold?", requesterName: "A person", actor: SYSTEM,
    });
    const decision = await recordRequestDecision({
      organisationId: w.org.id, requestId: request.id, kind: "part3_restriction", outcome: "refused", right: "access",
      detail: { provision: "s78a", nationalSecurityRequired: true, personTold: true }, rationale: "Required to safeguard national security.", actor: SYSTEM,
    });
    assert.equal(decision.statutoryBasis, "DPA 2018 s.78A");
  });
});

describe("the Part 3 transfer assessment", () => {
  const shipped = SYSTEM_TEMPLATES.find((t) => t.name === "Transfer assessment (law enforcement, Part 3)")!;

  it("is valid, offered only to competent authorities, and asks what each route needs", async () => {
    assert.equal(shipped.kind, "tra");
    assert.ok(shipped.competentAuthority);
    assert.deepEqual(validateTemplate(shipped.definition), []);
    const schema = templateDefinition.parse(shipped.definition).schema;

    const other = evaluate(schema, { recipient_type: "other", mechanism: "special", special_purpose: "d" });
    assert.equal(other.sections.other_recipient.visible, true);
    assert.equal(other.questions.special_override.required, true);
    assert.equal(other.sections.data_protection_test.visible, false);

    const own = evaluate(schema, { recipient_type: "relevant_authority", mechanism: "assessment", special_purpose: "a", member_state_origin: true });
    assert.equal(own.sections.other_recipient.visible, false);
    assert.equal(own.sections.data_protection_test.visible, true);
    assert.equal(own.questions.member_state_authorisation.required, true);
    assert.equal(own.questions.special_override.visible, false);

    const [org] = await db.insert(organisations).values({ name: "Transfers", slug: `p3t-${crypto.randomUUID().slice(0, 8)}` }).returning();
    const [force] = await db.insert(entities).values({ organisationId: org.id, name: "Force", isDefault: true }).returning();
    assert.ok(!(await shippedTemplatesMissing(org.id)).some((t) => t.name === shipped.name));
    await setCompetentAuthority({ organisationId: org.id, entityId: force.id, competentAuthority: true, actor: SYSTEM });
    assert.ok((await shippedTemplatesMissing(org.id)).some((t) => t.name === shipped.name));
  });
});
