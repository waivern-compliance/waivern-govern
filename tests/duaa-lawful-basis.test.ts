import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations, processingActivities } from "@/db/schema";
import { basesFromText, lawfulBasisGaps } from "@/lib/gdpr/lawful-basis";
import { basisSuggestedBy, objectionTest } from "@/lib/dsr/statutory";
import type { AuthedConnection } from "@/lib/integration/auth";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { evaluate } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { createConnection } from "@/services/connections";
import { governanceContext } from "@/services/export";
import { ingestProcessingActivities } from "@/services/ingest";
import { LawfulBasisRefused, createActivity, updateActivity } from "@/services/ropa";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "lawful basis test" };

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Basis ${label}`, slug: `basis-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const conn = await createConnection({ organisationId: org.id, kind: "waivern_portal", name: "Portal", defaultEntityId: entity.id, actor: SYSTEM });
  const portal: AuthedConnection = { id: conn.id, organisationId: org.id, kind: "waivern_portal", name: "Portal", defaultEntityId: entity.id };
  return { org, entity, portal };
}

const thin = { purposes: [], dataCategories: [], subjectCategories: [], recipients: [], systems: [], transfers: [] };

describe("reading a basis from text", () => {
  it("reads one basis, or a list where every part names exactly one", () => {
    assert.deepEqual(basesFromText("Contract"), ["contract"]);
    assert.deepEqual(basesFromText("Art 6(1)(f) legitimate interests"), ["legitimate_interests"]);
    assert.deepEqual(basesFromText("Recognised legitimate interests"), ["recognised_legitimate_interests"]);
    assert.deepEqual(basesFromText("Task carried out in the public interest"), ["public_task"]);
    assert.deepEqual(basesFromText("Contract; legal obligation"), ["contract", "legal_obligation"]);
  });

  it("guesses nothing from text that is not unambiguous", () => {
    assert.equal(basesFromText("Legitimate interests or consent, TBC"), null);
    assert.equal(basesFromText("See the privacy notice"), null);
    assert.equal(basesFromText(""), null);
    assert.equal(basesFromText(null), null);
  });

  it("asks for a basis, and for the Annex 1 condition with recognised legitimate interests", () => {
    assert.deepEqual(lawfulBasisGaps({ bases: [], recognisedCondition: null }), ["no_basis"]);
    assert.deepEqual(lawfulBasisGaps({ bases: ["recognised_legitimate_interests"], recognisedCondition: null }), ["no_recognised_condition"]);
    assert.deepEqual(lawfulBasisGaps({ bases: ["recognised_legitimate_interests"], recognisedCondition: "crime" }), []);
  });
});

describe("objections", () => {
  it("reach recognised legitimate interests under Article 21(1), and can be overridden on compelling grounds", () => {
    const test = objectionTest("recognised_legitimate_interests");
    assert.equal(test.applies, true);
    assert.equal(test.overridable, true);
    assert.equal(test.provision, "Article 21(1)");
  });

  it("suggest the basis an objection reaches from the bases chosen, before the text", () => {
    assert.equal(basisSuggestedBy({ lawfulBases: ["contract", "recognised_legitimate_interests"], lawfulBasis: "Contract", purposes: [] }), "recognised_legitimate_interests");
    assert.equal(basisSuggestedBy({ lawfulBases: [], lawfulBasis: "Recognised legitimate interests", purposes: [] }), "recognised_legitimate_interests");
    assert.equal(basisSuggestedBy({ lawfulBases: ["legitimate_interests"], lawfulBasis: null, purposes: ["Email marketing"] }), "direct_marketing");
  });
});

describe("the register", () => {
  it("records the bases chosen and the Annex 1 condition, audits the change, and refuses an unknown basis", async () => {
    const w = await world("ropa");
    const activity = await createActivity({
      organisationId: w.org.id, entityId: w.entity.id, name: "Fraud referrals",
      lawfulBases: ["recognised_legitimate_interests"], recognisedCondition: "crime", actor: SYSTEM,
    });
    assert.deepEqual([activity.lawfulBases, activity.recognisedCondition], [["recognised_legitimate_interests"], "crime"]);

    const changed = await updateActivity({
      activityId: activity.id, organisationId: w.org.id, changes: { lawfulBases: ["legal_obligation"] }, actor: SYSTEM,
    });
    assert.deepEqual([changed.lawfulBases, changed.recognisedCondition], [["legal_obligation"], null], "the condition goes with the basis");

    const [event] = (await db.select().from(auditEvents).where(eq(auditEvents.subjectId, activity.id)))
      .filter((e) => e.action === "processing_activity.updated");
    assert.deepEqual((event.before as { lawfulBases: string[] }).lawfulBases, ["recognised_legitimate_interests"]);

    await assert.rejects(
      updateActivity({ activityId: activity.id, organisationId: w.org.id, changes: { lawfulBases: ["vibes"] }, actor: SYSTEM }),
      LawfulBasisRefused,
    );
  });
});

describe("from the Portal", () => {
  it("reads the bases from text, prefers structured bases, and keeps a person's choice when the text says nothing clear", async () => {
    const w = await world("ingest");
    await ingestProcessingActivities(w.portal, [
      { externalRef: "a", name: "Payroll", lawfulBasis: "Contract; legal obligation", ...thin },
      { externalRef: "b", name: "CCTV", lawfulBasis: "Legitimate interests", lawfulBases: ["recognised_legitimate_interests"], recognisedCondition: "crime", ...thin },
      { externalRef: "c", name: "Surveys", lawfulBasis: "TBC", ...thin },
    ]);
    const rows = await db.select().from(processingActivities).where(eq(processingActivities.organisationId, w.org.id));
    const byName = (n: string) => rows.find((r) => r.name === n)!;
    assert.deepEqual(byName("Payroll").lawfulBases, ["contract", "legal_obligation"]);
    assert.deepEqual([byName("CCTV").lawfulBases, byName("CCTV").recognisedCondition], [["recognised_legitimate_interests"], "crime"]);
    assert.deepEqual(byName("Surveys").lawfulBases, []);

    await updateActivity({ activityId: byName("Surveys").id, organisationId: w.org.id, changes: { lawfulBases: ["consent"] }, actor: SYSTEM });
    await ingestProcessingActivities(w.portal, [{ externalRef: "c", name: "Surveys", lawfulBasis: "TBC", ...thin }]);
    const [surveys] = await db.select().from(processingActivities).where(eq(processingActivities.id, byName("Surveys").id));
    assert.deepEqual(surveys.lawfulBases, ["consent"], "a push with no clear basis leaves the chosen one");
    assert.equal(surveys.lawfulBasis, "TBC", "the text is kept as the note");

    const context = await governanceContext({ organisationId: w.org.id });
    const cctv = context.processingActivities.find((a) => a.name === "CCTV")!;
    assert.deepEqual([cctv.lawfulBases, cctv.recognisedCondition, cctv.lawfulBasis], [["recognised_legitimate_interests"], "crime", "Legitimate interests"]);
  });
});

describe("the migration", () => {
  it("chooses a basis from existing text only where it names exactly one", async () => {
    const w = await world("migration");
    const insert = (name: string, lawfulBasis: string) =>
      db.insert(processingActivities).values({ organisationId: w.org.id, entityId: w.entity.id, reference: `ROPA-M-${name}`, name, lawfulBasis }).returning();
    await insert("one", "Performance of a contract");
    await insert("two", "Contract, legitimate interests");
    await insert("vague", "Legitimate interests or consent");
    await insert("article", "6(1)(e)");

    // The backfill statement exactly as shipped, run again over these rows.
    const migration = readFileSync("drizzle/0072_duaa_lawful_bases.sql", "utf8");
    const backfill = migration.slice(migration.indexOf("WITH t AS"));
    await pg.unsafe(backfill);

    const rows = await db.select().from(processingActivities).where(eq(processingActivities.organisationId, w.org.id));
    const bases = Object.fromEntries(rows.map((r) => [r.name, r.lawfulBases]));
    assert.deepEqual(bases, { one: ["contract"], two: [], vague: [], article: ["public_task"] });
    assert.ok(rows.every((r) => r.lawfulBasis), "the text stays, as the note");
  });
});

describe("the LIA", () => {
  const schema = templateDefinition.parse(SYSTEM_TEMPLATES.find((t) => t.kind === "lia")!.definition).schema;

  it("skips the three-part test where an Annex 1 condition applies, and asks about objection and Article 22B instead", () => {
    const recognised = evaluate(schema, { recognised_condition: "crime" });
    assert.equal(recognised.sections.balancing.visible, false);
    assert.equal(recognised.sections.purpose.visible, false);
    assert.equal(recognised.questions.recognised_objection.required, true);
    assert.equal(recognised.questions.recognised_automated.required, true);
    assert.equal(recognised.questions.recognised_request.visible, false, "only for a disclosure to a public body");

    const ordinary = evaluate(schema, { recognised_condition: "no" });
    assert.equal(ordinary.sections.balancing.visible, true);
    assert.equal(ordinary.questions.recognised_objection.visible, false);

    const unanswered = evaluate(schema, {});
    assert.equal(unanswered.questions.recognised_necessity.visible, false, "nothing follows until the first question is answered");
  });
});
