import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  approvals,
  auditEvents,
  entities,
  organisations,
  workflowDefinitions,
  workflowStages,
} from "@/db/schema";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import { describeRouting, matches, type RoutingContext } from "@/lib/workflow/routing";
import { addStage, updateStage, workflowsFor } from "@/services/approval-routing";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { seedSharedLibrary } from "@/services/countries";
import { createTemplate, publishVersion } from "@/services/templates";
import { DecisionRefused, approvalsFor, decideApproval, submitForApproval } from "@/services/workflow";
import { WELL_GOVERNED } from "./fixtures/dsit-answers";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

after(async () => {
  await pg.end();
});

describe("routing on a figure", () => {
  const ctx = (answers: Record<string, unknown>): RoutingContext => ({
    answers: answers as RoutingContext["answers"],
    score: null,
    tier: null,
    needsSafeguards: new Set(["XX"]),
  });
  const spend = { op: "answerAtLeast" as const, question: "expected_spend_gbp", value: 100_000 };

  it("applies at and above the figure", () => {
    assert.equal(matches(spend, ctx({ expected_spend_gbp: 100_000 })), true);
    assert.equal(matches(spend, ctx({ expected_spend_gbp: 99_999 })), false);
  });

  it("does not treat an unanswered figure as clearing it", () => {
    assert.equal(matches(spend, ctx({})), false);
    assert.equal(matches(spend, ctx({ expected_spend_gbp: "lots" })), false);
  });

  it("reads as a sentence", () => {
    assert.equal(
      describeRouting(spend),
      "the answer to “expected_spend_gbp” is 100,000 or more",
    );
  });
});

describe("the AI governance board in the shipped AI workflow", () => {
  const board = DEFAULT_WORKFLOWS.find((w) => w.templateKind === "ai_risk")!.stages.find(
    (s) => s.boardName,
  )!;
  const ctx = (answers: Record<string, unknown>, tier: RoutingContext["tier"] = "low"): RoutingContext => ({
    answers: answers as RoutingContext["answers"],
    score: 0,
    tier,
    needsSafeguards: new Set(["XX"]),
  });

  it("sees spend over a million", () => {
    assert.equal(matches(board.condition, ctx({ expected_spend_gbp: 1_200_000 })), true);
  });

  it("sees public-facing spend over a hundred thousand, and not internal", () => {
    assert.equal(matches(board.condition, ctx({ expected_spend_gbp: 150_000, public_facing: true })), true);
    assert.equal(matches(board.condition, ctx({ expected_spend_gbp: 150_000, public_facing: false })), false);
  });

  it("sees anything rated critical", () => {
    assert.equal(matches(board.condition, ctx({}, "critical")), true);
  });
});

async function world(label: string) {
  await seedSharedLibrary();
  const [org] = await db
    .insert(organisations)
    .values({ name: `GB ${label}`, slug: `gb-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const spec = DEFAULT_WORKFLOWS.find((d) => d.templateKind === "ai_risk")!;
  const [def] = await db
    .insert(workflowDefinitions)
    .values({ organisationId: org.id, templateKind: "ai_risk", name: spec.name })
    .returning();
  for (const s of spec.stages) {
    await db.insert(workflowStages).values({
      workflowDefinitionId: def.id,
      position: s.position,
      name: s.name,
      requiredRole: s.requiredRole,
      condition: s.condition,
      slaHours: s.slaHours,
      boardName: s.boardName ?? null,
    });
  }
  const dsit = SYSTEM_TEMPLATES.find((t) => t.name === "AI risk identification (DSIT toolkit)")!;
  const { version } = await createTemplate({
    organisationId: org.id,
    kind: "ai_risk",
    name: dsit.name,
    definition: dsit.definition,
    actor: SYSTEM,
  });
  const published = await publishVersion({ organisationId: org.id, versionId: version.id, actor: SYSTEM });
  return { org, entity, definition: def, templateVersionId: published.id };
}

async function submitted(w: Awaited<ReturnType<typeof world>>, over: Record<string, unknown>) {
  const a = await createAssessment({
    organisationId: w.org.id,
    entityId: w.entity.id,
    templateVersionId: w.templateVersionId,
    title: "Summariser",
    actor: SYSTEM,
  });
  await saveAnswers({
    assessmentId: a.id,
    organisationId: w.org.id,
    answers: { ...WELL_GOVERNED, ...over } as never,
    actor: SYSTEM,
  });
  await submitForApproval({ assessmentId: a.id, organisationId: w.org.id, actor: SYSTEM });
  return a;
}

async function decideAllBefore(assessmentId: string, organisationId: string, boardName: string) {
  for (const gate of await approvalsFor(assessmentId)) {
    if (gate.status !== "pending" || gate.boardName === boardName) continue;
    await decideApproval({
      approvalId: gate.id,
      organisationId,
      decision: "approved",
      rationale: "Reviewed.",
      callerRoles: [gate.requiredRole],
      actor: SYSTEM,
    });
  }
  return (await approvalsFor(assessmentId)).find((g) => g.boardName === boardName)!;
}

describe("a board's decision", () => {
  it("goes to the board when the spend crosses the threshold", async () => {
    const w = await world("routed");
    const big = await submitted(w, { expected_spend_gbp: 2_000_000 });
    const small = await submitted(w, { expected_spend_gbp: 40_000 });
    const bigGate = (await approvalsFor(big.id)).find((g) => g.boardName === "AI governance board")!;
    const smallGate = (await approvalsFor(small.id)).find((g) => g.boardName === "AI governance board")!;
    assert.equal(bigGate.status, "pending");
    assert.equal(smallGate.status, "skipped");
  });

  it("must say which meeting decided it", async () => {
    const w = await world("reference");
    const a = await submitted(w, { expected_spend_gbp: 2_000_000 });
    const gate = await decideAllBefore(a.id, w.org.id, "AI governance board");
    await assert.rejects(
      () =>
        decideApproval({
          approvalId: gate.id,
          organisationId: w.org.id,
          decision: "approved",
          rationale: "Benefits outweigh the risks.",
          callerRoles: ["ai_governance"],
          actor: SYSTEM,
        }),
      (e) => e instanceof DecisionRefused && /meeting and minute/.test(e.message),
    );
    await decideApproval({
      approvalId: gate.id,
      organisationId: w.org.id,
      decision: "approved",
      rationale: "Benefits outweigh the risks.",
      boardReference: "AI governance board, 4 November 2026, minute 6",
      callerRoles: ["ai_governance"],
      actor: SYSTEM,
    });
    const [decided] = await db.select().from(approvals).where(eq(approvals.id, gate.id));
    assert.equal(decided.boardReference, "AI governance board, 4 November 2026, minute 6");
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, gate.id), eq(auditEvents.action, "approval.approved")));
    assert.equal((event.after as Record<string, unknown>).decidedBy, "AI governance board");
  });

  it("is refused by the database without a reference", async () => {
    const w = await world("db");
    const a = await submitted(w, { expected_spend_gbp: 2_000_000 });
    const gate = await decideAllBefore(a.id, w.org.id, "AI governance board");
    await assert.rejects(() =>
      db.execute(sql`update approval set status = 'approved', decided_at = now() where id = ${gate.id}`),
    );
  });
});

describe("adding and changing stages", () => {
  it("adds an ethics committee at the end, without disturbing what is there", async () => {
    const w = await world("add");
    const stage = await addStage({
      organisationId: w.org.id,
      workflowDefinitionId: w.definition.id,
      name: "Ethics committee",
      requiredRole: "ai_governance",
      boardName: "Ethics committee",
      condition: { op: "tierAtLeast", value: "high" },
      actor: SYSTEM,
    });
    assert.equal(stage.position, 5);
    const [workflow] = await workflowsFor(w.org.id);
    assert.deepEqual(
      workflow.stages.map((s) => s.name),
      ["Responsible AI review", "Data protection officer", "Accountable approver", "AI governance board", "Ethics committee"],
    );
  });

  it("turns an individual's stage into a board's, and the waiting gates follow", async () => {
    const w = await world("convert");
    const a = await submitted(w, {});
    const [first] = (await approvalsFor(a.id)).filter((g) => g.status === "pending");
    await updateStage({
      organisationId: w.org.id,
      stageId: first.stageId!,
      name: first.name,
      requiredRole: first.requiredRole,
      slaHours: null,
      boardName: "AI review panel",
      actor: SYSTEM,
    });
    const [after] = await db.select().from(approvals).where(eq(approvals.id, first.id));
    assert.equal(after.boardName, "AI review panel");
  });
});
