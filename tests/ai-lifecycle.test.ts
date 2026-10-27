import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  aiChanges,
  aiUseCases,
  entities,
  memberships,
  organisations,
  users,
  workflowDefinitions,
  workflowStages,
} from "@/db/schema";
import { unmetConditions, type GateContext } from "@/lib/ai/lifecycle";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import { createUseCase, loadUseCase } from "@/services/ai-register";
import { ChangeRefused, GateNotMet, changeStage, historyFor, recordChange } from "@/services/ai-lifecycle";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { seedSharedLibrary } from "@/services/countries";
import { createTemplate, publishVersion } from "@/services/templates";
import { approvalsFor, decideApproval, submitForApproval } from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };
const DAY = 86_400_000;

after(async () => {
  await pg.end();
});

describe("the gate for going live", () => {
  const ready: GateContext = {
    from: "development",
    hasOwner: true,
    assessedAt: new Date(Date.now() - 10 * DAY),
    assessmentReviewDue: new Date(Date.now() + 100 * DAY),
    lastMaterialChangeAt: new Date(Date.now() - 20 * DAY),
  };

  it("opens for an owned system with a current assessment", () => {
    assert.deepEqual(unmetConditions("pilot", ready), []);
  });

  it("needs an owner and an approved assessment", () => {
    assert.deepEqual(unmetConditions("pilot", { ...ready, hasOwner: false, assessedAt: null }), [
      "named_owner",
      "approved_assessment",
    ]);
  });

  it("needs the assessment to post-date the last change", () => {
    // The judgement was about a system that has since changed.
    const changed = { ...ready, lastMaterialChangeAt: new Date(Date.now() - DAY) };
    assert.deepEqual(unmetConditions("production", changed), ["assessed_since_change"]);
  });

  it("needs the assessment not to be past its review", () => {
    const stale = { ...ready, assessmentReviewDue: new Date(Date.now() - DAY) };
    assert.deepEqual(unmetConditions("pilot", stale), ["assessment_current"]);
  });

  it("treats a wider rollout as going live again", () => {
    assert.deepEqual(unmetConditions("production", { ...ready, from: "pilot", assessedAt: null }), [
      "approved_assessment",
    ]);
  });

  it("asks nothing of a move that reduces exposure", () => {
    const bare = { ...ready, hasOwner: false, assessedAt: null };
    for (const to of ["proposed", "development", "retiring", "retired"] as const) {
      assert.deepEqual(unmetConditions(to, { ...bare, from: "production" }), [], to);
    }
    assert.deepEqual(unmetConditions("pilot", { ...bare, from: "production" }), []);
  });
});

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `LC ${label}`, slug: `lc-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({ email: `owner-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  await db.insert(memberships).values({ organisationId: org.id, userId: owner.id });
  const useCase = await createUseCase({
    organisationId: org.id,
    entityId: entity.id,
    name: "Fraud flagging",
    purpose: "Flags claims for a fraud investigator to look at.",
    systemType: "predictive",
    provenance: "built_in_house",
    lifecycleStage: "development",
    actor: SYSTEM,
  });
  return { org, entity, owner, useCase };
}

/** An approved AI risk assessment of the system, through the real workflow. */
async function assess(w: Awaited<ReturnType<typeof world>>) {
  await seedSharedLibrary();
  const spec = DEFAULT_WORKFLOWS.find((d) => d.templateKind === "ai_risk")!;
  const [def] = await db
    .insert(workflowDefinitions)
    .values({ organisationId: w.org.id, templateKind: "ai_risk", name: spec.name })
    .onConflictDoNothing()
    .returning();
  if (def) {
    for (const s of spec.stages) {
      await db.insert(workflowStages).values({
        workflowDefinitionId: def.id,
        position: s.position,
        name: s.name,
        requiredRole: s.requiredRole,
        condition: s.condition,
        slaHours: s.slaHours,
      });
    }
  }
  const ai = SYSTEM_TEMPLATES.find((t) => t.name === "AI risk assessment")!;
  const { version } = await createTemplate({
    organisationId: w.org.id,
    kind: "ai_risk",
    name: `${ai.name} ${crypto.randomUUID().slice(0, 4)}`,
    definition: ai.definition,
    actor: SYSTEM,
  });
  const published = await publishVersion({ organisationId: w.org.id, versionId: version.id, actor: SYSTEM });
  const a = await createAssessment({
    organisationId: w.org.id,
    entityId: w.entity.id,
    templateVersionId: published.id,
    title: "Fraud flagging",
    subjectType: "ai_use_case",
    subjectId: w.useCase.id,
    actor: SYSTEM,
  });
  await saveAnswers({
    assessmentId: a.id,
    organisationId: w.org.id,
    answers: {
      use_case_name: "Fraud flagging", purpose: "Flags claims", ai_type: "predictive",
      provenance: "built_in_house", lifecycle_stage: "development", affects_people: true,
      consequence: "influences", audience: ["internal_wide"], editorial_output: false,
      personal_data: false, data_provenance: "documented", sensitive_inputs: "no",
      bias_considered: "reviewed", affected_groups: "Claimants", contestability: "documented_route",
      human_oversight: "in_the_loop", kill_switch: "Service owner", review_interval: "annual",
    } as never,
    actor: SYSTEM,
  });
  await submitForApproval({ assessmentId: a.id, organisationId: w.org.id, actor: SYSTEM });
  for (const gate of await approvalsFor(a.id)) {
    if (gate.status !== "pending") continue;
    await decideApproval({
      approvalId: gate.id,
      organisationId: w.org.id,
      decision: "approved",
      rationale: "Reviewed.",
      callerRoles: [gate.requiredRole],
      actor: SYSTEM,
    });
  }
}

function move(w: Awaited<ReturnType<typeof world>>, to: "pilot" | "production" | "retired", over = {}) {
  return changeStage({
    useCaseId: w.useCase.id,
    organisationId: w.org.id,
    to,
    summary: "Ready for real users.",
    mayWaive: false,
    actor: SYSTEM,
    ...over,
  });
}

describe("moving a system through its lifecycle", () => {
  it("starts the history when it is registered", async () => {
    const w = await world("born");
    const [first] = await historyFor(w.useCase.id, w.org.id);
    assert.equal(first.kind, "stage");
    assert.equal(first.toStage, "development");
  });

  it("refuses to go live without an owner or an assessment", async () => {
    const w = await world("refused");
    await assert.rejects(
      () => move(w, "pilot"),
      (e) => e instanceof GateNotMet && e.unmet.includes("approved_assessment"),
    );
  });

  it("goes live once the gate is met", async () => {
    const w = await world("ready");
    await db.update(aiUseCases).set({ ownerId: w.owner.id }).where(eq(aiUseCases.id, w.useCase.id));
    await assess(w);
    const live = await move(w, "pilot");
    assert.equal(live.lifecycleStage, "pilot");
    assert.ok(live.liveSince);
  });

  it("lets only an approver waive the gate, and records that they did", async () => {
    const w = await world("waived");
    await assert.rejects(
      () => move(w, "pilot", { waiverReason: "Emergency deployment", mayWaive: false }),
      (e) => e instanceof ChangeRefused,
    );
    await move(w, "pilot", { waiverReason: "Emergency deployment", mayWaive: true });
    const [latest] = await historyFor(w.useCase.id, w.org.id);
    assert.deepEqual(latest.gateWaived, ["named_owner", "approved_assessment"]);
    assert.equal(latest.waiverReason, "Emergency deployment");
  });

  it("retires a system without asking anything of it", async () => {
    const w = await world("retire");
    const retired = await move(w, "retired", { summary: "Replaced by the new service." });
    assert.ok(retired.retiredAt);
  });
});

describe("changes to the model, data and use", () => {
  it("asks how a model change was validated and how it would be undone", async () => {
    const w = await world("model");
    await assert.rejects(
      () =>
        recordChange({
          useCaseId: w.useCase.id,
          organisationId: w.org.id,
          kind: "model",
          summary: "New model version",
          actor: SYSTEM,
        }),
      (e) => e instanceof ChangeRefused,
    );
  });

  it("brings the review forward and closes the gate until it is assessed again", async () => {
    const w = await world("changed");
    await db.update(aiUseCases).set({ ownerId: w.owner.id }).where(eq(aiUseCases.id, w.useCase.id));
    await assess(w);
    await recordChange({
      useCaseId: w.useCase.id,
      organisationId: w.org.id,
      kind: "model",
      summary: "Retrained on 2026 claims",
      validation: "Precision 0.91 against the holdout (threshold 0.88)",
      rollback: "Previous weights kept; revert by configuration",
      actor: SYSTEM,
    });

    const loaded = await loadUseCase(w.useCase.id, w.org.id);
    assert.ok(loaded!.useCase.nextReviewAt!.getTime() <= Date.now());
    assert.ok(loaded!.gaps.includes("changed_since_assessment"));
    await assert.rejects(
      () => move(w, "pilot"),
      (e) => e instanceof GateNotMet && e.unmet.includes("assessed_since_change"),
    );
  });

  it("is never rewritten", async () => {
    const w = await world("frozen");
    const [first] = await historyFor(w.useCase.id, w.org.id);
    await assert.rejects(() =>
      db.update(aiChanges).set({ summary: "rewritten" }).where(eq(aiChanges.id, first.id)),
    );
    await assert.rejects(() => db.execute(sql`delete from ai_change where id = ${first.id}`));
    const still = await db
      .select()
      .from(aiChanges)
      .where(and(eq(aiChanges.id, first.id), eq(aiChanges.summary, "Added to the register.")));
    assert.equal(still.length, 1);
  });
});
