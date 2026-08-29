import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { aiUseCases, entities, organisations, users } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import {
  SERIOUS_GAPS,
  createUseCase,
  gapsFor,
  listRegister,
  registerSummary,
  updateUseCase,
  type AssessedFacts,
} from "@/services/ai-register";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `AI ${label}`, slug: `ai-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({ email: `o-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  return { org, entity, owner };
}

function useCase(over: Partial<typeof aiUseCases.$inferSelect> = {}) {
  return {
    id: crypto.randomUUID(),
    lifecycleStage: "production",
    ownerId: crypto.randomUUID(),
    nextReviewAt: null,
    ...over,
  } as typeof aiUseCases.$inferSelect;
}

function assessed(over: Partial<AssessedFacts> = {}): AssessedFacts {
  return {
    reference: "AIRA-2026-0001",
    approvedAt: new Date(),
    tier: "medium",
    band: "Limited",
    consequence: "influences",
    humanOversight: "on_the_loop",
    monitoring: ["accuracy"],
    biasConsidered: "tested",
    contestability: "documented_route",
    ...over,
  };
}

after(async () => {
  await pg.end();
});

describe("what the register notices", () => {
  it("flags a system nobody has ever assessed", () => {
    // The reason the register exists. An inventory that only holds assessed
    // systems cannot answer the question an AI lead actually has.
    assert.deepEqual(gapsFor(useCase(), null), ["never_assessed"]);
  });

  it("flags an assessment that was started and never finished", () => {
    const gaps = gapsFor(useCase(), assessed({ approvedAt: null }));
    assert.ok(gaps.includes("assessment_not_approved"));
    assert.ok(!gaps.includes("never_assessed"));
  });

  it("flags a live system with nothing monitored", () => {
    const gaps = gapsFor(useCase({ lifecycleStage: "production" }), assessed({ monitoring: ["none"] }));
    assert.ok(gaps.includes("live_without_monitoring"));
  });

  it("does not ask a proposed system to be monitored", () => {
    // Nothing is running, so there is nothing to monitor. Reporting it would
    // train people to ignore the list.
    const gaps = gapsFor(useCase({ lifecycleStage: "proposed" }), assessed({ monitoring: ["none"] }));
    assert.ok(!gaps.includes("live_without_monitoring"));
  });

  it("flags a system that decides about people with nobody watching", () => {
    const gaps = gapsFor(
      useCase(),
      assessed({ consequence: "decides", humanOversight: "none" }),
    );
    assert.ok(gaps.includes("decides_without_oversight"));
    assert.ok(SERIOUS_GAPS.includes("decides_without_oversight"));
  });

  it("does not flag a deciding system that has oversight", () => {
    const gaps = gapsFor(
      useCase(),
      assessed({ consequence: "decides", humanOversight: "in_the_loop" }),
    );
    assert.ok(!gaps.includes("decides_without_oversight"));
  });

  it("flags bias that was never assessed, or only ever planned", () => {
    assert.ok(gapsFor(useCase(), assessed({ biasConsidered: "not_done" })).includes("bias_not_assessed"));
    assert.ok(gapsFor(useCase(), assessed({ biasConsidered: "planned" })).includes("bias_not_assessed"));
    assert.ok(!gapsFor(useCase(), assessed({ biasConsidered: "reviewed" })).includes("bias_not_assessed"));
  });

  it("flags an unowned system", () => {
    assert.ok(gapsFor(useCase({ ownerId: null }), assessed()).includes("no_owner"));
  });

  it("flags an overdue review", () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000);
    assert.ok(gapsFor(useCase({ nextReviewAt: past }), assessed()).includes("review_overdue"));
  });

  it("asks nothing of a retired system", () => {
    // Unowned, unassessed, unmonitored and overdue — and none of it matters,
    // because it is switched off.
    const gaps = gapsFor(
      useCase({
        lifecycleStage: "retired",
        ownerId: null,
        nextReviewAt: new Date(Date.now() - 24 * 3600 * 1000),
      }),
      null,
    );
    assert.deepEqual(gaps, []);
  });

  it("says nothing about a well-kept system", () => {
    assert.deepEqual(gapsFor(useCase(), assessed()), []);
  });
});

describe("keeping the register", () => {
  it("gives each entry a reference and audits it", async () => {
    const w = await world("create");
    const row = await createUseCase({
      organisationId: w.org.id,
      entityId: w.entity.id,
      name: "Archive subtitling",
      purpose: "Generate subtitles for archive content.",
      systemType: "generative",
      provenance: "third_party_api",
      lifecycleStage: "production",
      ownerId: w.owner.id,
      actor: SYSTEM,
    });
    assert.match(row.reference, /^AI-\d{4}-0001$/);

    const chain = await verifyAuditChain(w.org.id);
    assert.equal(chain.ok, true);
  });

  it("records a system nobody has assessed, which is the point", async () => {
    const w = await world("unassessed");
    await createUseCase({
      organisationId: w.org.id,
      entityId: w.entity.id,
      name: "Script assistant",
      purpose: "Draft coverage for readers.",
      systemType: "generative",
      provenance: "fine_tuned",
      lifecycleStage: "pilot",
      actor: SYSTEM,
    });

    const summary = await registerSummary(w.org.id, null);
    assert.equal(summary.total, 1);
    assert.equal(summary.neverAssessed, 1);
    assert.equal(summary.serious, 1);
    // No owner either, so two gaps — but only the unassessed one is serious.
    assert.ok(summary.entries[0].gaps.includes("no_owner"));
  });

  it("stamps a retirement and stops counting it", async () => {
    const w = await world("retire");
    const row = await createUseCase({
      organisationId: w.org.id,
      entityId: w.entity.id,
      name: "Old recommender",
      purpose: "Superseded.",
      systemType: "predictive",
      provenance: "built_in_house",
      lifecycleStage: "production",
      actor: SYSTEM,
    });

    const before = await registerSummary(w.org.id, null);
    assert.equal(before.live, 1);

    const after = await updateUseCase({
      useCaseId: row.id,
      organisationId: w.org.id,
      changes: { lifecycleStage: "retired" },
      actor: SYSTEM,
    });
    assert.notEqual(after.retiredAt, null);

    const summary = await registerSummary(w.org.id, null);
    assert.equal(summary.live, 0);
    // Off the active register, but still counted somewhere — a retired system
    // that vanishes entirely is indistinguishable from one that was deleted.
    assert.equal(summary.total, 0);
    assert.equal(summary.retired, 1);
    assert.equal(summary.withGaps, 0, "nothing is asked of a retired system");
  });

  it("keeps entries inside the entities a viewer can reach", async () => {
    const w = await world("scope");
    const [other] = await db
      .insert(entities)
      .values({ organisationId: w.org.id, name: "Other" })
      .returning();

    await createUseCase({
      organisationId: w.org.id, entityId: w.entity.id, name: "Mine",
      purpose: "x", systemType: "predictive", provenance: "built_in_house", actor: SYSTEM,
    });
    await createUseCase({
      organisationId: w.org.id, entityId: other.id, name: "Theirs",
      purpose: "x", systemType: "predictive", provenance: "built_in_house", actor: SYSTEM,
    });

    const all = await listRegister(w.org.id, null);
    assert.equal(all.length, 2);
    const scoped = await listRegister(w.org.id, [w.entity.id]);
    assert.equal(scoped.length, 1);
    assert.equal(scoped[0].useCase.name, "Mine");
  });
});

describe("what the headline numbers mean", () => {
  it("counts only active systems under a heading that says so", async () => {
    const w = await world("counts");
    for (const stage of ["production", "pilot", "proposed", "retired"] as const) {
      await createUseCase({
        organisationId: w.org.id, entityId: w.entity.id, name: `A ${stage}`,
        purpose: "x", systemType: "predictive", provenance: "built_in_house",
        lifecycleStage: stage, actor: SYSTEM,
      });
    }
    const summary = await registerSummary(w.org.id, null);
    assert.equal(summary.total, 3, "the retired one is not on the active register");
    assert.equal(summary.retired, 1);
    assert.equal(summary.live, 2, "production and pilot only");
  });
});
