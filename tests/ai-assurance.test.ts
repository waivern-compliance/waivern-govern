import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { aiAssuranceRecords, aiUseCases, entities, organisations } from "@/db/schema";
import { meetsThreshold, resultProblems, summarise } from "@/lib/ai/assurance";
import { createUseCase, gapsFor, loadUseCase, type AssessedFacts } from "@/services/ai-register";
import { AssuranceRefused, recordAssurance } from "@/services/ai-assurance";
import { recordChange } from "@/services/ai-lifecycle";
import { prefillFor } from "@/services/atrs";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };
const DAY = 86_400_000;

after(async () => {
  await pg.end();
});

describe("judging a result against its own metrics", () => {
  const recall = { name: "Recall", value: 0.86, threshold: 0.9, direction: "at_least" as const };
  const errors = { name: "False positive rate", value: 0.02, threshold: 0.05, direction: "at_most" as const };

  it("knows which way a limit runs", () => {
    assert.equal(meetsThreshold(recall), false);
    assert.equal(meetsThreshold(errors), true);
    assert.equal(meetsThreshold({ ...recall, threshold: null }), null);
  });

  it("will not record a pass over a missed limit", () => {
    // The claim the limit exists to check.
    assert.deepEqual(resultProblems("evaluation", "passed", [recall], null), [
      "It cannot have passed: Recall missed its limit",
    ]);
  });

  it("allows a pass with issues, once the findings say why", () => {
    assert.ok(resultProblems("evaluation", "passed_with_issues", [recall], null).includes("Say what was found"));
    assert.deepEqual(
      resultProblems("evaluation", "passed_with_issues", [recall], "Accepted for pilot; retraining scheduled"),
      [],
    );
  });

  it("does not ask a model card whether it passed", () => {
    assert.deepEqual(resultProblems("model_card", null, [], null), []);
    assert.ok(resultProblems("model_card", "passed", [], null).length > 0);
  });

  it("goes by the latest result of each kind", () => {
    const s = summarise([
      { kind: "bias_test", independent: true, result: "failed", performedAt: new Date(Date.now() - 30 * DAY) },
      { kind: "bias_test", independent: true, result: "passed", performedAt: new Date(Date.now() - DAY) },
      { kind: "evaluation", independent: false, result: "failed", performedAt: new Date() },
    ]);
    assert.deepEqual(s.failing, ["evaluation"]);
    assert.equal(s.independentlyTested, true);
  });
});

describe("what the register says about testing", () => {
  const live = {
    id: crypto.randomUUID(),
    lifecycleStage: "production",
    ownerId: crypto.randomUUID(),
    nextReviewAt: null,
  } as unknown as typeof aiUseCases.$inferSelect;
  const assessed = (tier: string): AssessedFacts => ({
    reference: "AIRA-1",
    approvedAt: new Date(),
    tier,
    band: tier,
    consequence: "influences",
    humanOversight: "in_the_loop",
    monitoring: ["accuracy"],
    biasConsidered: "tested",
    contestability: "documented_route",
  });

  it("flags a live system nobody has tested", () => {
    assert.ok(gapsFor(live, assessed("low"), { assurance: null }).includes("never_tested"));
  });

  it("says nothing about testing when it was not told", () => {
    // An export that does not load testing must not claim nothing was tested.
    assert.ok(!gapsFor(live, assessed("low")).includes("never_tested"));
  });

  it("asks for independent testing only of serious systems", () => {
    const internal = { tested: true, independentlyTested: false, failing: [] };
    assert.ok(gapsFor(live, assessed("high"), { assurance: internal }).includes("not_independently_tested"));
    assert.ok(!gapsFor(live, assessed("medium"), { assurance: internal }).includes("not_independently_tested"));
  });

  it("flags a system whose last test failed", () => {
    const failing = { tested: true, independentlyTested: true, failing: ["evaluation" as const] };
    assert.ok(gapsFor(live, assessed("low"), { assurance: failing }).includes("last_test_failed"));
  });
});

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `AS ${label}`, slug: `as-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const useCase = await createUseCase({
    organisationId: org.id,
    entityId: entity.id,
    name: "Document classifier",
    purpose: "Routes incoming documents to the right team.",
    systemType: "predictive",
    provenance: "built_in_house",
    lifecycleStage: "production",
    actor: SYSTEM,
  });
  return { org, useCase };
}

function evaluation(w: Awaited<ReturnType<typeof world>>, over: Partial<Parameters<typeof recordAssurance>[0]> = {}) {
  return recordAssurance({
    useCaseId: w.useCase.id,
    organisationId: w.org.id,
    kind: "evaluation",
    title: "Pre-release evaluation",
    performedAt: new Date(Date.now() - DAY),
    performedBy: "Data science team",
    independent: false,
    metrics: [{ name: "Accuracy", value: 0.94, threshold: 0.92, direction: "at_least" }],
    result: "passed",
    actor: SYSTEM,
    ...over,
  });
}

describe("recording assurance", () => {
  it("refuses a pass over a missed limit", async () => {
    const w = await world("refuse");
    await assert.rejects(
      () => evaluation(w, { metrics: [{ name: "Accuracy", value: 0.8, threshold: 0.92, direction: "at_least" }] }),
      (e) => e instanceof AssuranceRefused,
    );
  });

  it("ties a test to the change it validated, and only to that system's", async () => {
    const w = await world("change");
    const other = await world("other");
    const change = await recordChange({
      useCaseId: w.useCase.id,
      organisationId: w.org.id,
      kind: "data",
      summary: "Added 2026 documents to training",
      actor: SYSTEM,
    });
    const record = await evaluation(w, { changeId: change.id });
    assert.equal(record.changeId, change.id);
    await assert.rejects(
      () => evaluation(other, { changeId: change.id }),
      (e) => e instanceof AssuranceRefused,
    );
  });

  it("clears the register's testing gap", async () => {
    const w = await world("gap");
    assert.ok((await loadUseCase(w.useCase.id, w.org.id))!.gaps.includes("never_tested"));
    await evaluation(w);
    assert.ok(!(await loadUseCase(w.useCase.id, w.org.id))!.gaps.includes("never_tested"));
  });

  it("is never rewritten", async () => {
    const w = await world("frozen");
    const record = await evaluation(w);
    await assert.rejects(() =>
      db.update(aiAssuranceRecords).set({ result: "failed" }).where(eq(aiAssuranceRecords.id, record.id)),
    );
    await assert.rejects(() => db.execute(sql`delete from ai_assurance_record where id = ${record.id}`));
  });

  it("feeds the ATRS model performance field", async () => {
    const w = await world("atrs");
    await evaluation(w, { independent: true });
    const values = await prefillFor(w.useCase.id, w.org.id);
    assert.match(values["2.4.2.7"], /independently of the team/);
    assert.match(values["2.4.2.7"], /Accuracy: 0\.94 \(required at least 0\.92\)/);
  });
});
