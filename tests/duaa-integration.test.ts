import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { aiUseCases, entities, organisations, processingActivities } from "@/db/schema";
import type { AuthedConnection } from "@/lib/integration/auth";
import { aiUseCaseIn, processingActivityIn } from "@/lib/integration/contracts";
import { SERIOUS_GAPS } from "@/services/ai-register";
import { linkUseCaseToActivity } from "@/services/automated-decisions";
import { createConnection } from "@/services/connections";
import { CONTEXT_VERSION, governanceContext } from "@/services/export";
import { ingestAiUseCases, ingestProcessingActivities } from "@/services/ingest";
import { HARD_GAPS, registerHealth } from "@/services/ropa";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "integration test" };

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Wire ${label}`, slug: `wire-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const conn = await createConnection({ organisationId: org.id, kind: "waivern_portal", name: "Portal", defaultEntityId: entity.id, actor: SYSTEM });
  const portal: AuthedConnection = { id: conn.id, organisationId: org.id, kind: "waivern_portal", name: "Portal", defaultEntityId: entity.id };
  return { org, entity, portal };
}

const activity = (r: Record<string, unknown>) => processingActivityIn.parse(r);
const byRef = async (orgId: string, ref: string) =>
  (await db.select().from(processingActivities).where(eq(processingActivities.organisationId, orgId))).find((r) => r.externalRef === ref)!;

const ADM = {
  solelyAutomated: true,
  specialCategory: false,
  safeguards: {
    information: { confirmed: true, note: "Privacy notice, section 6" },
    representations: { confirmed: true },
    humanIntervention: { confirmed: true },
    contest: { confirmed: false },
  },
};

describe("processing activities over the wire", () => {
  it("records each group sent, links the original by the Portal's reference, and reads it back in the same shape", async () => {
    const w = await world("round-trip");
    const outcome = await ingestProcessingActivities(w.portal, [
      activity({ externalRef: "orders", name: "Orders", lawfulBases: ["contract"] }),
      activity({
        externalRef: "insight", name: "Customer insight", lawfulBases: ["legitimate_interests"],
        automatedDecisions: ADM,
        furtherProcessing: { isFurtherProcessing: true, originalExternalRef: "orders", route: "compliance" },
        research: {
          isResearch: true, art13Exemption: true, publicInformationUrl: "https://example.org/research",
          safeguards: { noSubstantialHarm: { confirmed: true }, noIndividualDecisions: { confirmed: true }, dataMinimisation: { confirmed: true, note: "Pseudonymised" } },
        },
        childrenLikely: false,
      }),
    ]);
    assert.deepEqual([outcome.created, outcome.skipped], [2, []]);

    const orders = await byRef(w.org.id, "orders");
    const insight = await byRef(w.org.id, "insight");
    assert.equal(insight.originalActivityId, orders.id);
    assert.equal(insight.admSafeguards.human_intervention?.confirmed, true);
    assert.equal(insight.researchSafeguards.data_minimisation?.note, "Pseudonymised");
    assert.equal(insight.publicInformationUrl, "https://example.org/research");

    const context = await governanceContext({ organisationId: w.org.id });
    assert.equal(context.contextVersion, CONTEXT_VERSION);
    const out = context.processingActivities.find((a) => a.name === "Customer insight")!;
    // An unconfirmed safeguard with no note is stored as absent, which reads the same.
    const { information, representations, humanIntervention } = ADM.safeguards;
    assert.deepEqual(out.automatedDecisions, { ...ADM, specialCondition: null, safeguards: { information, representations, humanIntervention } });
    assert.equal(out.furtherProcessing.originalReference, orders.reference);
    assert.equal(out.furtherProcessing.originalExternalRef, "orders");
    assert.equal(out.furtherProcessing.route, "compliance");
    assert.equal(out.research.safeguards?.dataMinimisation?.note, "Pseudonymised");
    assert.equal(out.childrenLikely, false);
  });

  it("leaves a group alone when a push leaves it out, and replaces it when sent", async () => {
    const w = await world("groups");
    await ingestProcessingActivities(w.portal, [
      activity({ externalRef: "a", name: "A", automatedDecisions: ADM, childrenLikely: true, research: { isResearch: true } }),
    ]);
    await ingestProcessingActivities(w.portal, [activity({ externalRef: "a", name: "A renamed" })]);
    let a = await byRef(w.org.id, "a");
    assert.deepEqual([a.name, a.automatedDecisions, a.childrenLikely, a.research], ["A renamed", true, true, true]);

    await ingestProcessingActivities(w.portal, [activity({ externalRef: "a", name: "A", automatedDecisions: { solelyAutomated: false } })]);
    a = await byRef(w.org.id, "a");
    assert.deepEqual([a.automatedDecisions, a.admSafeguards, a.research], [false, {}, true], "only the group sent changed");
  });

  it("uses the stated consent where the original is not one this connection sent, and skips only the record that refers to itself", async () => {
    const w = await world("refs");
    const outcome = await ingestProcessingActivities(w.portal, [
      activity({ externalRef: "x", name: "X", furtherProcessing: { isFurtherProcessing: true, originalExternalRef: "nowhere", originalConsent: true, route: "research" } }),
      activity({ externalRef: "self", name: "Self", furtherProcessing: { isFurtherProcessing: true, originalExternalRef: "self" } }),
    ]);
    assert.equal(outcome.created, 1);
    assert.deepEqual(outcome.skipped.map((s) => s.externalRef), ["self"]);
    const x = await byRef(w.org.id, "x");
    assert.deepEqual([x.originalActivityId, x.originalConsent], [null, true]);

    // Consent at source and the research route: Article 8A(4) closes it, and that is red.
    const health = await registerHealth(w.org.id, null);
    assert.equal(health.nonCompliant, 1);
    assert.ok(health.rows[0].hardGaps.includes("further_route_closed"));
  });
});

describe("AI systems over the wire", () => {
  it("records automated decisions on create and update, and exports them with the linked activities", async () => {
    const w = await world("ai");
    const system = (extra: Record<string, unknown>) =>
      aiUseCaseIn.parse({ externalRef: "sys", name: "Scorer", purpose: "Scores applications.", systemType: "predictive", provenance: "built_in_house", ...extra });
    await ingestAiUseCases(w.portal, [system({ automatedDecisions: { solelyAutomated: true, specialCategory: true } })]);
    const [created] = await db.select().from(aiUseCases).where(eq(aiUseCases.organisationId, w.org.id));
    assert.deepEqual([created.automatedDecisions, created.admSpecialCategory], [true, true]);

    await ingestAiUseCases(w.portal, [system({})]);
    const [kept] = await db.select().from(aiUseCases).where(eq(aiUseCases.id, created.id));
    assert.equal(kept.automatedDecisions, true, "a push that leaves it out leaves it alone");

    await ingestProcessingActivities(w.portal, [activity({ externalRef: "apps", name: "Applications" })]);
    const apps = await byRef(w.org.id, "apps");
    await linkUseCaseToActivity({ organisationId: w.org.id, useCaseId: created.id, activityId: apps.id, actor: SYSTEM });

    const context = await governanceContext({ organisationId: w.org.id });
    const out = context.aiSystems.find((s) => s.name === "Scorer")!;
    assert.deepEqual(out.processingActivities, [apps.reference]);
    assert.equal(out.automatedDecisions.specialCategory, true);
    assert.ok(out.gaps.includes("adm_special_no_condition"));
  });
});

describe("the serious lists", () => {
  it("hold what the law does not allow as recorded, not what is merely unconfirmed", () => {
    for (const g of ["adm_relies_on_ea", "adm_special_no_condition", "further_route_closed"] as const) assert.ok(HARD_GAPS.includes(g), g);
    for (const g of ["adm_safeguards", "further_no_route", "research_safeguards", "children_no_dpia"] as const) assert.ok(!HARD_GAPS.includes(g), g);
    assert.ok(SERIOUS_GAPS.includes("adm_special_no_condition"));
    assert.ok(!SERIOUS_GAPS.includes("adm_safeguards"));
  });
});
