import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { aiUseCaseRequests, aiUseCases, auditEvents, entities, organisations } from "@/db/schema";
import { cautionsFor, quadrant } from "@/lib/ai/intake";
import {
  RequestRefused,
  decideRequest,
  listRequests,
  scoreRequest,
  submitRequest,
} from "@/services/ai-intake";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `IN ${label}`, slug: `in-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true });
  return org;
}

function propose(organisationId: string, over: Partial<Parameters<typeof submitRequest>[0]> = {}) {
  return submitRequest({
    organisationId,
    title: "Summarise caseworker notes",
    problem: "Caseworkers spend an hour a day rereading notes.",
    whyAi: "Free text at volume; templates were tried and ignored.",
    benefits: "Half the rereading time, measured by sampling.",
    environmentalImpact: "A hosted model; no training of our own.",
    publicFacing: false,
    significantDecisions: false,
    requestedByLabel: "caseworker@example.com",
    actor: SYSTEM,
    ...over,
  });
}

describe("prioritising proposals", () => {
  it("places value and feasibility in four groups", () => {
    assert.equal(quadrant(5, 4), "pursue");
    assert.equal(quadrant(4, 2), "invest");
    assert.equal(quadrant(2, 5), "modest");
    assert.equal(quadrant(3, 3), "not_now");
    assert.equal(quadrant(null, 4), null);
  });

  it("cautions on significant decisions and on spend over the control thresholds", () => {
    assert.deepEqual(cautionsFor({ significantDecisions: true, publicFacing: false, expectedSpendGbp: null }), ["significant_decisions"]);
    assert.deepEqual(cautionsFor({ significantDecisions: false, publicFacing: true, expectedSpendGbp: 100_000 }), ["spend_public"]);
    assert.deepEqual(cautionsFor({ significantDecisions: false, publicFacing: false, expectedSpendGbp: 100_000 }), []);
    assert.deepEqual(cautionsFor({ significantDecisions: false, publicFacing: true, expectedSpendGbp: 2_000_000 }), ["spend_other"]);
  });
});

describe("proposals to use AI", () => {
  after(() => pg.end());

  it("refuses a proposal that does not say why AI", async () => {
    const org = await world("why");
    await assert.rejects(propose(org.id, { whyAi: "  " }), RequestRefused);
  });

  it("will not accept a proposal nobody has scored", async () => {
    const org = await world("unscored");
    const r = await propose(org.id);
    await assert.rejects(
      decideRequest({
        requestId: r.id,
        organisationId: org.id,
        decision: "accepted",
        reason: "Good idea.",
        system: { systemType: "generative", provenance: "third_party_api" },
        actor: SYSTEM,
      }),
      /Score its value and feasibility/,
    );
  });

  it("accepts onto the register at proposed, carrying the reasons with it", async () => {
    const org = await world("accept");
    const r = await propose(org.id);
    await scoreRequest({ requestId: r.id, organisationId: org.id, value: 5, feasibility: 4, actor: SYSTEM });
    const decided = await decideRequest({
      requestId: r.id,
      organisationId: org.id,
      decision: "accepted",
      reason: "High value, and the data is ours.",
      system: { systemType: "generative", provenance: "third_party_api" },
      actor: SYSTEM,
    });
    assert.ok(decided.aiUseCaseId);
    const [system] = await db.select().from(aiUseCases).where(eq(aiUseCases.id, decided.aiUseCaseId!));
    assert.equal(system.lifecycleStage, "proposed");
    assert.equal(system.purpose, r.problem);

    // Final: it cannot be decided again, nor its proposal rewritten.
    await assert.rejects(
      decideRequest({ requestId: r.id, organisationId: org.id, decision: "declined", reason: "Changed mind.", actor: SYSTEM }),
      /already been decided/,
    );
    await assert.rejects(
      db.update(aiUseCaseRequests).set({ title: "Something else" }).where(eq(aiUseCaseRequests.id, r.id)),
    );
    await assert.rejects(db.delete(aiUseCaseRequests).where(eq(aiUseCaseRequests.id, r.id)));

    const events = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(and(eq(auditEvents.organisationId, org.id), eq(auditEvents.subjectId, r.id)));
    assert.deepEqual(
      events.map((e) => e.action).sort(),
      ["ai_request.accepted", "ai_request.scored", "ai_request.submitted"],
    );
  });

  it("lets a deferred proposal be decided later", async () => {
    const org = await world("defer");
    const r = await propose(org.id);
    await decideRequest({ requestId: r.id, organisationId: org.id, decision: "deferred", reason: "After the spending review.", actor: SYSTEM });
    const later = await decideRequest({ requestId: r.id, organisationId: org.id, decision: "declined", reason: "No budget.", actor: SYSTEM });
    assert.equal(later.status, "declined");
  });

  it("puts unscored proposals first, then the rest by priority", async () => {
    const org = await world("order");
    const low = await propose(org.id, { title: "Low" });
    const high = await propose(org.id, { title: "High" });
    const waiting = await propose(org.id, { title: "Waiting" });
    await scoreRequest({ requestId: low.id, organisationId: org.id, value: 2, feasibility: 2, actor: SYSTEM });
    await scoreRequest({ requestId: high.id, organisationId: org.id, value: 5, feasibility: 5, actor: SYSTEM });
    const rows = await listRequests(org.id, null);
    assert.deepEqual(rows.map((r) => r.request.id), [waiting.id, high.id, low.id]);
  });

  it("refuses scores outside one to five", async () => {
    const org = await world("range");
    const r = await propose(org.id);
    await assert.rejects(
      scoreRequest({ requestId: r.id, organisationId: org.id, value: 6, feasibility: 1, actor: SYSTEM }),
      RequestRefused,
    );
  });
});
