import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations } from "@/db/schema";
import { dpoMissing } from "@/lib/dpa2018/public-authority";
import { PART3_SUBJECT_LABELS, Part3Refused, cleanPart3, part3Gaps, part3PolicyKey } from "@/lib/dpa2018/part3";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { evaluate } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { validateTemplate } from "@/lib/templates/validate";
import { setCompetentAuthority } from "@/services/entities";
import { createPolicyDocument, policyDocumentRegister } from "@/services/policy-documents";
import { HARD_GAPS, createActivity, loadActivity, updateActivity } from "@/services/ropa";
import { shippedTemplatesMissing } from "@/services/templates";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "part 3 test" };

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Part 3 ${label}`, slug: `part3-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [force] = await db.insert(entities).values({ organisationId: org.id, name: "Constabulary", isDefault: true }).returning();
  const [trust] = await db.insert(entities).values({ organisationId: org.id, name: "Charitable Trust" }).returning();
  return { org, force, trust };
}

const EMPTY = {
  part3Basis: null, sensitiveProcessing: null, sensitiveRoute: null, schedule8Condition: null,
  factOpinionMarked: null, logging: [], retentionFollowsPolicy: null, retentionPolicyNote: null,
};
const FULL_LOG = { system: "Records system", operations: ["collection", "alteration", "consultation", "disclosure", "combination", "erasure"] as never[], identifiesPeople: true, reviewer: "Professional Standards", lastChecked: "2026-10-01" };
const base = { entityId: "e", systems: [] as string[], subjectCategories: [PART3_SUBJECT_LABELS[0]] };

describe("the rules", () => {
  it("clears a Schedule 8 condition when the route is consent, and refuses what is not a ground", () => {
    const consent = cleanPart3({ sensitiveProcessing: true, sensitiveRoute: "consent", schedule8Condition: "sch8_p4" });
    assert.equal(consent.schedule8Condition, null);
    assert.equal(part3PolicyKey(consent), "part3_consent");
    const necessary = cleanPart3({ sensitiveProcessing: true, sensitiveRoute: "strictly_necessary", schedule8Condition: "sch8_p4" });
    assert.equal(part3PolicyKey(necessary), "sch8_p4");
    assert.equal(cleanPart3({ sensitiveProcessing: false, sensitiveRoute: "consent", retentionFollowsPolicy: true }).retentionFollowsPolicy, null);
    assert.throws(() => cleanPart3({ part3Basis: "whim" }), Part3Refused);
    assert.throws(() => cleanPart3({ sensitiveProcessing: true, sensitiveRoute: "strictly_necessary", schedule8Condition: "sch8_p10" }), Part3Refused);
    assert.throws(() => cleanPart3({ logging: [{ system: "X", lastChecked: "2999-01-01" }] }), /in the past/);
  });

  it("keeps a logging statement only for a named system, with the operations in the Act's order", () => {
    const r = cleanPart3({ logging: [{ system: " ", operations: ["erasure"] }, { system: "PNC", operations: ["erasure", "collection", "nonsense" as never] }] });
    assert.deepEqual(r.logging, [{ system: "PNC", operations: ["collection", "erasure"], identifiesPeople: false, reviewer: null, lastChecked: null }]);
  });

  it("reports what Part 3 asks, red where the law does not allow it as recorded", () => {
    const gaps = part3Gaps({ ...EMPTY, ...base, subjectCategories: ["Members of the public"], systems: ["Records system"], sensitiveProcessing: true }, { competentAuthority: false, coverage: [] });
    assert.deepEqual(gaps, [
      "part3_not_competent_authority", "part3_no_basis", "sensitive_no_route", "part3_retention_policy_unanswered",
      "fact_opinion_unanswered", "part3_categories_not_distinguished", "logging_missing",
    ]);
    for (const g of ["part3_not_competent_authority", "part3_no_basis", "sensitive_no_route", "sensitive_no_schedule8", "sensitive_no_policy_document"] as const) {
      assert.ok(HARD_GAPS.includes(g), g);
    }
    const sound = {
      ...EMPTY, ...base, systems: ["Records system"], part3Basis: "task" as const, sensitiveProcessing: true,
      sensitiveRoute: "strictly_necessary" as const, schedule8Condition: "sch8_p1" as const, factOpinionMarked: true,
      logging: [FULL_LOG], retentionFollowsPolicy: true,
    };
    assert.deepEqual(part3Gaps(sound, { competentAuthority: true, coverage: [{ entityId: null, conditions: ["sch8_p1"] }] }), []);
    assert.deepEqual(part3Gaps(sound, { competentAuthority: true, coverage: [{ entityId: null, conditions: ["sch8_p2"] }] }), ["sensitive_no_policy_document"]);
    assert.deepEqual(part3Gaps({ ...sound, schedule8Condition: null }, { competentAuthority: true }), ["sensitive_no_schedule8"]);
    assert.deepEqual(
      part3Gaps({ ...sound, logging: [{ ...FULL_LOG, operations: ["collection"] as never[] }] }, { competentAuthority: true }),
      ["logging_incomplete"],
    );
  });

  it("requires a DPO of a competent authority (s.69)", () => {
    assert.equal(dpoMissing({ publicAuthority: false, competentAuthority: true, dpo: null }, null), true);
    assert.equal(dpoMissing({ publicAuthority: false, competentAuthority: false, dpo: null }, null), false);
  });
});

describe("the Part 3 DPIA", () => {
  const shipped = SYSTEM_TEMPLATES.find((t) => t.name === "Data protection impact assessment (law enforcement, Part 3)")!;

  it("is valid, offered only to competent authorities, and asks the Schedule 8 condition only where strictly necessary", async () => {
    assert.ok(shipped.competentAuthority);
    assert.deepEqual(validateTemplate(shipped.definition), []);
    const schema = templateDefinition.parse(shipped.definition).schema;
    const consent = evaluate(schema, { sensitive_processing: true, sensitive_route: "consent" });
    assert.equal(consent.questions.schedule8_condition.visible, false);
    assert.equal(consent.questions.policy_document.required, true);
    const necessary = evaluate(schema, { sensitive_processing: true, sensitive_route: "strictly_necessary" });
    assert.equal(necessary.questions.schedule8_condition.required, true);

    const w = await world("templates");
    assert.ok(!(await shippedTemplatesMissing(w.org.id)).some((t) => t.name === shipped.name));
    await setCompetentAuthority({ organisationId: w.org.id, entityId: w.force.id, competentAuthority: true, actor: SYSTEM });
    assert.ok((await shippedTemplatesMissing(w.org.id)).some((t) => t.name === shipped.name));
  });
});

describe("the register", () => {
  it("makes Part 3 available only on a competent authority, and starts new records under its default", async () => {
    const w = await world("regime");
    await assert.rejects(
      createActivity({ organisationId: w.org.id, entityId: w.force.id, name: "Custody", regime: "dpa_part3", actor: SYSTEM }),
      /competent authority/,
    );
    const staff = await createActivity({ organisationId: w.org.id, entityId: w.force.id, name: "Staff records", actor: SYSTEM });
    assert.equal(staff.regime, "uk_gdpr");
    await assert.rejects(
      updateActivity({ activityId: staff.id, organisationId: w.org.id, changes: { regime: "dpa_part3" }, actor: SYSTEM }),
      /competent authority/,
    );

    await setCompetentAuthority({ organisationId: w.org.id, entityId: w.force.id, competentAuthority: true, defaultRegime: "dpa_part3", actor: SYSTEM });
    const custody = await createActivity({ organisationId: w.org.id, entityId: w.force.id, name: "Custody records", actor: SYSTEM });
    assert.equal(custody.regime, "dpa_part3");
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, w.force.id), eq(auditEvents.action, "entity.competent_authority_changed")));
    assert.deepEqual(event.after, { competentAuthority: true, defaultRegime: "dpa_part3" });

    const loaded = (await loadActivity(custody.id, w.org.id))!;
    assert.ok(loaded.gaps.includes("part3_no_basis"));
    assert.ok(!loaded.gaps.includes("lawful_basis"), "the UK GDPR's questions do not apply");
    assert.ok(!loaded.gaps.includes("part3_not_competent_authority"));

    await setCompetentAuthority({ organisationId: w.org.id, entityId: w.force.id, competentAuthority: false, defaultRegime: "dpa_part3", actor: SYSTEM });
    assert.equal((await db.select().from(entities).where(eq(entities.id, w.force.id)))[0].defaultRegime, "uk_gdpr");
    assert.ok((await loadActivity(custody.id, w.org.id))!.gaps.includes("part3_not_competent_authority"), "kept, and flagged");
  });

  it("is covered for sensitive processing by a policy document naming the Schedule 8 condition", async () => {
    const w = await world("policy");
    await setCompetentAuthority({ organisationId: w.org.id, entityId: w.force.id, competentAuthority: true, defaultRegime: "dpa_part3", actor: SYSTEM });
    const activity = await createActivity({ organisationId: w.org.id, entityId: w.force.id, name: "Missing persons", actor: SYSTEM });
    await updateActivity({
      activityId: activity.id, organisationId: w.org.id, actor: SYSTEM,
      changes: { part3Basis: "task", sensitiveProcessing: true, sensitiveRoute: "strictly_necessary", schedule8Condition: "sch8_p4", retentionFollowsPolicy: true },
    });
    const gaps = async () => (await loadActivity(activity.id, w.org.id))!.gaps;
    assert.ok((await gaps()).includes("sensitive_no_policy_document"));
    assert.deepEqual((await policyDocumentRegister(w.org.id, null)).uncovered.map((a) => a.uncovered), [["sch8_p4"]]);
    await createPolicyDocument({ organisationId: w.org.id, entityId: w.force.id, title: "Force APD", conditions: ["sch8_p4", "para6"], actor: SYSTEM });
    assert.ok(!(await gaps()).includes("sensitive_no_policy_document"));
  });

  it("keeps each regime's answers when the record moves between them", async () => {
    const w = await world("move");
    await setCompetentAuthority({ organisationId: w.org.id, entityId: w.force.id, competentAuthority: true, actor: SYSTEM });
    const activity = await createActivity({ organisationId: w.org.id, entityId: w.force.id, name: "Intelligence", lawfulBases: ["public_task"], actor: SYSTEM });
    await updateActivity({
      activityId: activity.id, organisationId: w.org.id, actor: SYSTEM,
      changes: { regime: "dpa_part3", part3Basis: "task", factOpinionMarked: true, logging: [FULL_LOG] },
    });
    let loaded = (await loadActivity(activity.id, w.org.id))!.activity;
    assert.deepEqual(loaded.lawfulBases, ["public_task"], "the UK GDPR answer is kept");
    assert.equal(loaded.logging[0].system, "Records system");
    await updateActivity({ activityId: activity.id, organisationId: w.org.id, changes: { regime: "uk_gdpr" }, actor: SYSTEM });
    loaded = (await loadActivity(activity.id, w.org.id))!.activity;
    assert.equal(loaded.part3Basis, "task", "and so is the Part 3 one");
    assert.equal(loaded.regime, "uk_gdpr");
  });
});
