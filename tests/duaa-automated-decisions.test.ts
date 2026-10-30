import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { aiUseCases, auditEvents, entities, organisations, processingActivities } from "@/db/schema";
import {
  AutomatedDecisionRefused,
  admGaps,
  admMismatch,
  admRestriction,
  cleanAdm,
  type AdmRecord,
} from "@/lib/gdpr/automated-decisions";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { evaluate } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { createUseCase, gapsFor } from "@/services/ai-register";
import {
  linkedActivitiesOf,
  copyAutomatedDecisions,
  linkUseCaseToActivity,
  setAutomatedDecisions,
  unlinkUseCaseFromActivity,
  linkedUseCasesOf,
} from "@/services/automated-decisions";
import { article30Gaps, createActivity } from "@/services/ropa";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "automated decisions test" };

after(() => pg.end());

const NONE: AdmRecord = { automatedDecisions: null, admSpecialCategory: null, admSpecialCondition: null, admSafeguards: {} };
const ALL_SAFEGUARDS = {
  information: { confirmed: true },
  representations: { confirmed: true },
  human_intervention: { confirmed: true },
  contest: { confirmed: true },
};
const SOUND: AdmRecord = { automatedDecisions: true, admSpecialCategory: false, admSpecialCondition: null, admSafeguards: ALL_SAFEGUARDS };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `ADM ${label}`, slug: `adm-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const activity = await createActivity({ organisationId: org.id, entityId: entity.id, name: "Credit checks", lawfulBases: ["contract"], actor: SYSTEM });
  const useCase = await createUseCase({
    organisationId: org.id, entityId: entity.id, name: "Scoring model", purpose: "Score applications.",
    systemType: "predictive", provenance: "built_in_house", actor: SYSTEM,
  });
  return { org, entity, activity, useCase };
}

describe("the record", () => {
  it("clears everything else where no such decisions are taken, and refuses what Article 22 does not name", () => {
    assert.deepEqual(cleanAdm({ automatedDecisions: false, admSpecialCategory: true, admSafeguards: ALL_SAFEGUARDS }), {
      automatedDecisions: false, admSpecialCategory: null, admSpecialCondition: null, admSafeguards: {},
    });
    assert.equal(cleanAdm({ automatedDecisions: true, admSpecialCategory: false, admSpecialCondition: "explicit_consent" }).admSpecialCondition, null);
    assert.throws(() => cleanAdm({ automatedDecisions: true, admSpecialCondition: "vibes" }), AutomatedDecisionRefused);
    assert.throws(() => cleanAdm({ automatedDecisions: true, admSafeguards: { apology: { confirmed: true } } }), AutomatedDecisionRefused);
  });

  it("asks nothing until somebody says decisions are solely automated", () => {
    assert.deepEqual(admGaps(NONE), []);
    assert.deepEqual(admGaps({ ...NONE, automatedDecisions: false }), []);
    assert.deepEqual(admGaps(SOUND, ["contract"]), []);
    assert.deepEqual(admGaps({ ...SOUND, admSpecialCategory: null, admSafeguards: {} }), ["adm_special_unanswered", "adm_safeguards"]);
    assert.deepEqual(admGaps({ ...SOUND, admSpecialCategory: true }), ["adm_special_no_condition"]);
    assert.deepEqual(admGaps(SOUND, ["recognised_legitimate_interests"]), ["adm_relies_on_ea"]);
  });

  it("says when Article 22B forbids it, and why", () => {
    assert.equal(admRestriction(SOUND, ["contract"]).allowed, true);
    assert.equal(admRestriction(SOUND, ["contract", "recognised_legitimate_interests"]).allowed, false, "partly is enough (22B(4))");
    assert.equal(admRestriction({ ...SOUND, admSpecialCategory: true }).allowed, false);
    assert.equal(admRestriction({ ...SOUND, admSpecialCategory: true, admSpecialCondition: "explicit_consent" }).allowed, true);
    assert.equal(admRestriction({ ...SOUND, admSpecialCategory: null }).allowed, null);
  });

  it("compares the answers on two linked records, not the notes", () => {
    assert.equal(admMismatch(NONE, NONE), null);
    assert.equal(admMismatch(NONE, SOUND), "missing_here");
    assert.equal(admMismatch(SOUND, NONE), "missing_there");
    assert.equal(admMismatch(SOUND, { ...SOUND, admSafeguards: { ...ALL_SAFEGUARDS, contest: { confirmed: false } } }), "differs");
    assert.equal(admMismatch(SOUND, { ...SOUND, admSafeguards: { ...ALL_SAFEGUARDS, contest: { confirmed: true, note: "By email" } } }), null);
  });
});

describe("the gaps", () => {
  it("show on the ROPA, including reliance on recognised legitimate interests", async () => {
    const w = await world("gaps");
    await setAutomatedDecisions({ organisationId: w.org.id, side: "processing_activity", id: w.activity.id, record: { automatedDecisions: true, admSpecialCategory: false }, actor: SYSTEM });
    const [row] = await db.select().from(processingActivities).where(eq(processingActivities.id, w.activity.id));
    assert.ok(article30Gaps(row, new Set()).includes("adm_safeguards"));
    assert.ok(article30Gaps({ ...row, lawfulBases: ["recognised_legitimate_interests"], recognisedCondition: "crime" }, new Set()).includes("adm_relies_on_ea"));
  });

  it("show on the AI register", async () => {
    const w = await world("ai-gaps");
    await setAutomatedDecisions({ organisationId: w.org.id, side: "ai_use_case", id: w.useCase.id, record: { automatedDecisions: true }, actor: SYSTEM });
    const [useCase] = await db.select().from(aiUseCases).where(eq(aiUseCases.id, w.useCase.id));
    const gaps = gapsFor(useCase, null);
    assert.ok(gaps.includes("adm_special_unanswered") && gaps.includes("adm_safeguards"));
  });
});

describe("linked records", () => {
  it("show where one side lacks the record, and copy it across only on request, audited", async () => {
    const w = await world("copy");
    await linkUseCaseToActivity({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.activity.id, actor: SYSTEM });
    await linkUseCaseToActivity({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.activity.id, actor: SYSTEM });

    await setAutomatedDecisions({
      organisationId: w.org.id, side: "ai_use_case", id: w.useCase.id,
      record: { ...SOUND, admSafeguards: { ...ALL_SAFEGUARDS, contest: { confirmed: true, note: "Appeals form" } } }, actor: SYSTEM,
    });

    const [useCase] = await db.select().from(aiUseCases).where(eq(aiUseCases.id, w.useCase.id));
    const [activity] = await db.select().from(processingActivities).where(eq(processingActivities.id, w.activity.id));
    const fromActivity = await linkedUseCasesOf(w.org.id, activity);
    assert.deepEqual(fromActivity.map((l) => [l.reference, l.mismatch]), [[useCase.reference, "missing_here"]]);
    const fromUseCase = await linkedActivitiesOf(w.org.id, useCase);
    assert.deepEqual(fromUseCase.map((l) => [l.reference, l.mismatch, l.lawfulBases]), [[activity.reference, "missing_there", ["contract"]]]);
    assert.equal(activity.automatedDecisions, null, "nothing copied until somebody asks");

    await copyAutomatedDecisions({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.activity.id, to: "processing_activity", actor: SYSTEM });
    const [copied] = await db.select().from(processingActivities).where(eq(processingActivities.id, w.activity.id));
    assert.equal(copied.automatedDecisions, true);
    assert.equal(copied.admSafeguards.contest?.note, "Appeals form");
    assert.equal(admMismatch(copied, useCase), null);

    const events = await db.select().from(auditEvents).where(eq(auditEvents.subjectId, w.activity.id));
    const copy = events.find((e) => e.action === "processing_activity.automated_decisions_copied")!;
    assert.equal((copy.after as { copiedFrom: string }).copiedFrom, useCase.reference);
    assert.equal((copy.before as AdmRecord).automatedDecisions, null);

    const linkEvents = (await db.select().from(auditEvents).where(eq(auditEvents.subjectId, w.useCase.id)))
      .filter((e) => e.action === "ai_use_case.activity_linked");
    assert.equal(linkEvents.length, 1, "linking twice is one link");
  });

  it("refuse to copy between records that are not linked", async () => {
    const w = await world("unlinked");
    await setAutomatedDecisions({ organisationId: w.org.id, side: "ai_use_case", id: w.useCase.id, record: SOUND, actor: SYSTEM });
    await linkUseCaseToActivity({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.activity.id, actor: SYSTEM });
    await unlinkUseCaseFromActivity({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.activity.id, actor: SYSTEM });
    await assert.rejects(
      copyAutomatedDecisions({ organisationId: w.org.id, useCaseId: w.useCase.id, activityId: w.activity.id, to: "processing_activity", actor: SYSTEM }),
      /not linked/,
    );
  });
});

describe("the DPIA", () => {
  const schema = templateDefinition.parse(SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!.definition).schema;

  it("asks about 22B and the 22C safeguards once a decision is solely automated", () => {
    const manual = evaluate(schema, { uses_ai: true, solely_automated: false });
    assert.equal(manual.questions.adm_safeguards.visible, false);

    const solely = evaluate(schema, { uses_ai: true, solely_automated: true, lawful_basis: "contract" });
    assert.equal(solely.questions.adm_safeguards.required, true);
    assert.equal(solely.questions.adm_special_category.required, true);
    assert.equal(solely.questions.adm_recognised_basis.visible, false);

    const recognised = evaluate(schema, { uses_ai: true, solely_automated: true, lawful_basis: "recognised_legitimate_interests", adm_special_category: true });
    assert.equal(recognised.questions.adm_recognised_basis.required, true);
    assert.equal(recognised.questions.adm_special_condition.required, true);
  });
});
