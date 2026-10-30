import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations } from "@/db/schema";
import {
  ConditionRefused,
  SCHEDULE_1,
  SCHEDULE_1_KEYS,
  cleanSpecialCategory,
  conditionGaps,
  conditionsNeedingPolicy,
  deletableFrom,
  policyDocumentGaps,
  schedule1For,
} from "@/lib/dpa2018/schedule-1";
import { SUBJECT_CATEGORIES, DATA_CATEGORIES } from "@/lib/templates/catalogues";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { evaluate } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { attachDocument, documentsFor } from "@/services/documents";
import {
  PolicyDocumentRefused,
  createPolicyDocument,
  deletePolicyDocument,
  loadPolicyDocument,
  policyDocumentRegister,
  recordPolicyReview,
  updatePolicyDocument,
  withdrawPolicyDocument,
} from "@/services/policy-documents";
import { HARD_GAPS, createActivity, loadActivity, updateActivity } from "@/services/ropa";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "schedule 1 test" };
const DAY = 86_400_000;
const PDF = Buffer.from("%PDF-1.4\n%test\n");

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Sch1 ${label}`, slug: `sch1-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [council] = await db.insert(entities).values({ organisationId: org.id, name: "The Council", isDefault: true }).returning();
  const [trust] = await db.insert(entities).values({ organisationId: org.id, name: "The Trust" }).returning();
  return { org, council, trust };
}

const NONE = {
  specialCategory: null, art9Condition: null, schedule1Condition: null, criminalOffence: null,
  art10Condition: null, retentionFollowsPolicy: null, retentionPolicyNote: null,
};

describe("Schedule 1, as checked", () => {
  it("says which Article 9(2) points need a Schedule 1 condition (s.10)", () => {
    assert.deepEqual(schedule1For("a"), []);
    assert.deepEqual(schedule1For("f"), []);
    assert.deepEqual(schedule1For("b"), ["para1"]);
    assert.deepEqual(schedule1For("h"), ["para2"]);
    assert.deepEqual(schedule1For("i"), ["para3"]);
    assert.deepEqual(schedule1For("j"), ["para4"]);
    const partTwo = schedule1For("g");
    assert.equal(partTwo.length, 23, "paragraphs 6 to 28");
    assert.ok(partTwo.includes("para6") && partTwo.includes("para18") && partTwo.includes("para28"));
  });

  it("needs a policy document for paragraph 1, Part 2 and paragraph 35, with exceptions in 10, 13 and 27", () => {
    const needs = SCHEDULE_1_KEYS.filter((k) => SCHEDULE_1[k].policyDocument !== "not_required");
    assert.deepEqual(
      needs.filter((k) => SCHEDULE_1[k].part !== 2),
      ["para1", "para35"],
    );
    assert.equal(needs.filter((k) => SCHEDULE_1[k].part === 2).length, 23);
    assert.deepEqual(
      SCHEDULE_1_KEYS.filter((k) => SCHEDULE_1[k].policyDocument === "unless"),
      ["para10", "para13", "para27"],
    );
    assert.match(SCHEDULE_1.para10.label, /investigating/, "DUAA Sch 11 para 28");
  });

  it("clears what the answers make irrelevant, and fills the one Part 1 condition a point allows", () => {
    const health = cleanSpecialCategory({ specialCategory: true, art9Condition: "h", schedule1Condition: "para18" });
    assert.equal(health.schedule1Condition, "para2");
    const none = cleanSpecialCategory({ specialCategory: false, art9Condition: "g", schedule1Condition: "para6", criminalOffence: false, art10Condition: "para29" });
    assert.equal(none.art9Condition, null);
    assert.equal(none.schedule1Condition, null);
    assert.equal(none.art10Condition, null);
    const consent = cleanSpecialCategory({ specialCategory: true, art9Condition: "a", retentionFollowsPolicy: true });
    assert.equal(consent.retentionFollowsPolicy, null, "no policy document needed, so no paragraph 41 answer");
  });

  it("refuses a condition the point does not allow, or one that does not exist", () => {
    assert.throws(() => cleanSpecialCategory({ specialCategory: true, art9Condition: "g", schedule1Condition: "para29" }), ConditionRefused);
    assert.throws(() => cleanSpecialCategory({ specialCategory: true, art9Condition: "z" }), ConditionRefused);
    assert.throws(() => cleanSpecialCategory({ criminalOffence: true, art10Condition: "para5" }), ConditionRefused);
  });

  it("counts criminal offence data on a Part 2 condition as needing a policy document, and official authority as not", () => {
    assert.deepEqual(conditionsNeedingPolicy({ ...NONE, criminalOffence: true, art10Condition: "para10" }), ["para10"]);
    assert.deepEqual(conditionsNeedingPolicy({ ...NONE, criminalOffence: true, art10Condition: "official_authority" }), []);
    assert.deepEqual(conditionsNeedingPolicy({ ...NONE, criminalOffence: true, art10Condition: "para33" }), []);
  });

  it("reports what is missing: red for no condition or no document, amber for an exception or paragraph 41", () => {
    const e = "entity-1";
    assert.deepEqual(conditionGaps({ ...NONE, entityId: e, specialCategory: true }), ["special_no_art9"]);
    assert.deepEqual(conditionGaps({ ...NONE, entityId: e, specialCategory: true, art9Condition: "g" }), ["special_no_schedule1"]);
    assert.deepEqual(conditionGaps({ ...NONE, entityId: e, criminalOffence: true }), ["criminal_no_condition"]);

    const safeguarding = { ...NONE, entityId: e, specialCategory: true, art9Condition: "g" as const, schedule1Condition: "para18" as const };
    assert.deepEqual(conditionGaps(safeguarding), ["retention_policy_unanswered"], "no coverage given, so no claim about documents");
    assert.deepEqual(conditionGaps(safeguarding, []), ["no_policy_document", "retention_policy_unanswered"]);
    assert.deepEqual(conditionGaps({ ...safeguarding, retentionFollowsPolicy: true }, [{ entityId: null, conditions: ["para18"] }]), []);
    assert.deepEqual(conditionGaps({ ...safeguarding, retentionFollowsPolicy: true }, [{ entityId: "other", conditions: ["para18"] }]), ["no_policy_document"]);
    assert.deepEqual(conditionGaps({ ...safeguarding, retentionFollowsPolicy: false }, [{ entityId: e, conditions: ["para18"] }]), ["retention_policy_unanswered"]);
    assert.deepEqual(conditionGaps({ ...safeguarding, retentionFollowsPolicy: false, retentionPolicyNote: "Held for an inquiry" }, [{ entityId: e, conditions: ["para18"] }]), []);

    const crime = { ...NONE, entityId: e, criminalOffence: true, art10Condition: "para10" as const, retentionFollowsPolicy: true };
    assert.deepEqual(conditionGaps(crime, []), ["no_policy_document_exception"]);
    for (const g of ["special_no_art9", "special_no_schedule1", "criminal_no_condition", "no_policy_document"] as const) {
      assert.ok(HARD_GAPS.includes(g), g);
    }
    assert.ok(!HARD_GAPS.includes("no_policy_document_exception"));
    assert.ok(!HARD_GAPS.includes("retention_policy_unanswered"));
  });

  it("flags a document never reviewed, or not reviewed in twelve months, and keeps a withdrawn one six months", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    const base = { conditions: ["para6"], ownerId: "u", withdrawnAt: null };
    assert.deepEqual(policyDocumentGaps({ ...base, lastReviewedAt: null }, 1, now), ["never_reviewed"]);
    assert.deepEqual(policyDocumentGaps({ ...base, lastReviewedAt: new Date("2025-10-29T00:00:00Z") }, 1, now), ["review_overdue"]);
    assert.deepEqual(policyDocumentGaps({ ...base, lastReviewedAt: new Date("2026-01-01T00:00:00Z") }, 0, now), ["nothing_attached"]);
    assert.deepEqual(policyDocumentGaps({ ...base, lastReviewedAt: null, withdrawnAt: now }, 0, now), [], "withdrawn: nothing to chase");
    assert.equal(deletableFrom({ withdrawnAt: null }), null);
    assert.equal(deletableFrom({ withdrawnAt: new Date("2026-03-15T00:00:00Z") })!.toISOString().slice(0, 10), "2026-09-15");
  });
});

describe("the catalogues", () => {
  it("hold the categories public services record, and the Part 3 categories of data subject", () => {
    const data = DATA_CATEGORIES.map((c) => c.value as string);
    for (const v of ["social_care", "education", "safeguarding"]) assert.ok(data.includes(v), v);
    const subjects = SUBJECT_CATEGORIES.map((c) => c.value as string);
    for (const v of ["patients", "social_care_users", "pupils", "staff", "suspects", "convicted", "victims", "witnesses"]) {
      assert.ok(subjects.includes(v), v);
    }
  });
});

describe("the DPIA", () => {
  const schema = templateDefinition.parse(SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!.definition).schema;

  it("asks the Article 9 point, then the Part 2 condition only for substantial public interest, and Article 10 separately", () => {
    const keys = schema.sections.flatMap((s) => s.questions).map((q) => q.key);
    assert.ok(!keys.includes("special_condition"), "the free-text question is gone");
    const g = evaluate(schema, { special_category: true, art9_condition: "g", criminal_offence: false });
    assert.equal(g.questions.schedule1_condition.required, true);
    assert.equal(g.questions.policy_document.visible, true);
    const h = evaluate(schema, { special_category: true, art9_condition: "h", criminal_offence: false });
    assert.equal(h.questions.schedule1_condition.visible, false);
    assert.equal(h.questions.policy_document.visible, false);
    const crime = evaluate(schema, { special_category: false, criminal_offence: true });
    assert.equal(crime.questions.art10_condition.required, true);
    assert.equal(crime.questions.art9_condition.visible, false);
  });
});

describe("the register", () => {
  it("is red until a current policy document covers the condition, for that entity or the whole organisation", async () => {
    const w = await world("cover");
    const activity = await createActivity({ organisationId: w.org.id, entityId: w.council.id, name: "Children's safeguarding referrals", actor: SYSTEM });
    await updateActivity({
      activityId: activity.id, organisationId: w.org.id, actor: SYSTEM,
      changes: { specialCategory: true, art9Condition: "g", schedule1Condition: "para18", retentionFollowsPolicy: true },
    });
    const gaps = async () => (await loadActivity(activity.id, w.org.id))!.gaps;
    assert.ok((await gaps()).includes("no_policy_document"));

    const other = await createPolicyDocument({ organisationId: w.org.id, entityId: w.trust.id, title: "Trust APD", conditions: ["para18"], actor: SYSTEM });
    assert.ok((await gaps()).includes("no_policy_document"), "another entity's document does not cover it");

    const doc = await createPolicyDocument({ organisationId: w.org.id, entityId: null, title: "Council APD", conditions: ["para6", "para18"], actor: SYSTEM });
    assert.ok(!(await gaps()).includes("no_policy_document"));

    const register = await policyDocumentRegister(w.org.id, null);
    assert.deepEqual(register.uncovered, []);
    assert.deepEqual(register.rows.find((r) => r.doc.id === doc.id)!.relying.map((a) => a.id), [activity.id]);
    assert.deepEqual(register.rows.find((r) => r.doc.id === other.id)!.relying, []);

    await withdrawPolicyDocument({ id: doc.id, organisationId: w.org.id, actor: SYSTEM });
    assert.ok((await gaps()).includes("no_policy_document"), "withdrawn, it covers nothing");
    assert.deepEqual((await policyDocumentRegister(w.org.id, null)).uncovered.map((a) => a.id), [activity.id]);
  });

  it("keeps the conditions in the audit chain when they change", async () => {
    const w = await world("audit");
    const activity = await createActivity({ organisationId: w.org.id, entityId: w.council.id, name: "Youth offending", actor: SYSTEM });
    await updateActivity({
      activityId: activity.id, organisationId: w.org.id, actor: SYSTEM,
      changes: { criminalOffence: true, art10Condition: "para6" },
    });
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, activity.id), eq(auditEvents.action, "processing_activity.updated")));
    assert.equal((event.after as Record<string, unknown>).art10Condition, "para6");
    assert.equal((event.before as Record<string, unknown>).art10Condition, null);
  });

  it("leaves the conditions alone when an edit does not mention them", async () => {
    const w = await world("partial");
    const activity = await createActivity({ organisationId: w.org.id, entityId: w.council.id, name: "Adult social care", actor: SYSTEM });
    await updateActivity({ activityId: activity.id, organisationId: w.org.id, actor: SYSTEM, changes: { specialCategory: true, art9Condition: "h" } });
    await updateActivity({ activityId: activity.id, organisationId: w.org.id, actor: SYSTEM, changes: { name: "Adult social care assessments" } });
    const loaded = (await loadActivity(activity.id, w.org.id))!.activity;
    assert.equal(loaded.art9Condition, "h");
    assert.equal(loaded.schedule1Condition, "para2");
  });
});

describe("the policy document register", () => {
  it("records reviews, refuses one in the future, and refuses a condition that is not one", async () => {
    const w = await world("review");
    await assert.rejects(
      createPolicyDocument({ organisationId: w.org.id, entityId: null, title: "APD", conditions: ["para99"], actor: SYSTEM }),
      PolicyDocumentRefused,
    );
    const doc = await createPolicyDocument({ organisationId: w.org.id, entityId: null, title: "APD", conditions: ["para18", "para6"], actor: SYSTEM });
    assert.deepEqual(doc.conditions, ["para6", "para18"], "kept in the Schedule's order");
    assert.ok((await loadPolicyDocument(doc.id, w.org.id))!.gaps.includes("never_reviewed"));
    await assert.rejects(recordPolicyReview({ id: doc.id, organisationId: w.org.id, reviewedAt: new Date(Date.now() + DAY), actor: SYSTEM }), PolicyDocumentRefused);
    await recordPolicyReview({ id: doc.id, organisationId: w.org.id, actor: SYSTEM });
    assert.ok(!(await loadPolicyDocument(doc.id, w.org.id))!.gaps.includes("never_reviewed"));
    const updated = await updatePolicyDocument({
      id: doc.id, organisationId: w.org.id, actor: SYSTEM,
      changes: { title: "APD v2", version: "2.0", conditions: ["para6"], ownerId: null, entityId: w.council.id },
    });
    assert.equal(updated.entityId, w.council.id);
  });

  it("is kept six months after it is withdrawn, then deleted with its files", async () => {
    const w = await world("delete");
    const doc = await createPolicyDocument({ organisationId: w.org.id, entityId: null, title: "APD", conditions: ["para6"], actor: SYSTEM });
    await attachDocument({
      organisationId: w.org.id, entityId: null, subjectType: "policy_document", subjectId: doc.id,
      filename: "apd.pdf", contentType: "application/pdf", content: PDF, actor: SYSTEM,
    });
    await assert.rejects(deletePolicyDocument({ id: doc.id, organisationId: w.org.id, actor: SYSTEM }), /Withdraw it first/);
    await withdrawPolicyDocument({ id: doc.id, organisationId: w.org.id, actor: SYSTEM });
    await assert.rejects(deletePolicyDocument({ id: doc.id, organisationId: w.org.id, actor: SYSTEM }), /paragraph 40\(2\)/);
    await deletePolicyDocument({ id: doc.id, organisationId: w.org.id, actor: SYSTEM, now: new Date(Date.now() + 200 * DAY) });
    assert.equal(await loadPolicyDocument(doc.id, w.org.id), null);
    assert.deepEqual(await documentsFor(w.org.id, "policy_document", doc.id), []);
  });
});
