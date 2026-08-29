import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  entities,
  organisations,
  riskAcceptances,
  schedules,
  slaPolicies,
  tasks,
  users,
  workflowDefinitions,
  workflowStages,
} from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { DEFAULT_SLA, DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import { matches, type RoutingContext } from "@/lib/workflow/routing";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { seedSharedLibrary } from "@/services/countries";
import { createRisk, setResidual } from "@/services/risks";
import { sweepOrganisation } from "@/services/sweep";
import { createTemplate, publishVersion } from "@/services/templates";
import {
  DecisionRefused,
  NotYourDecision,
  approvalsFor,
  completeTask,
  decideApproval,
  openTasks,
  submitForApproval,
} from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };
const DAY = 24 * 60 * 60 * 1000;

async function world(label: string) {
  // Shared across organisations, so seeding once is enough — but routing now
  // depends on it, and an absent library escalates everything.
  await seedSharedLibrary();

  const [org] = await db
    .insert(organisations)
    .values({ name: `W ${label}`, slug: `wf-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();

  for (const spec of DEFAULT_WORKFLOWS) {
    const [def] = await db
      .insert(workflowDefinitions)
      .values({ organisationId: org.id, templateKind: spec.templateKind, name: spec.name })
      .returning();
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
  for (const s of DEFAULT_SLA) {
    await db.insert(slaPolicies).values({
      organisationId: org.id,
      taskType: s.taskType as "approve_stage",
      targetHours: s.targetHours,
      escalateToRole: s.escalateToRole,
    });
  }

  const dpia = SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!;
  const { version } = await createTemplate({
    organisationId: org.id,
    kind: "dpia",
    name: dpia.name,
    definition: dpia.definition,
    actor: SYSTEM,
  });
  const published = await publishVersion({
    organisationId: org.id,
    versionId: version.id,
    actor: SYSTEM,
  });

  return { org, entity, templateVersionId: published.id };
}

function actor(label: string, id: string | null = null) {
  return { actorKind: "user" as const, actorUserId: id, actorLabel: label };
}

const BASE_DPIA = {
  activity_name: "Audience personalisation",
  nature: "Collect viewing history and rank recommendations.",
  purpose: "Improve relevance.",
  lawful_basis: "public_task",
  data_categories: ["viewing_history"],
  special_category: false,
  subject_groups: "Signed-in audience.",
  volume: 100000,
  retention: "Thirteen months.",
  necessity: "Required for ranking.",
  alternatives: "Editorial-only ranking rejected.",
  transparency: "Privacy notice.",
  rights_support: "Self-service controls.",
  transfers_abroad: false,
  risk_description: "Inference of interests.",
  measures: "Exclude sensitive topics.",
  residual_accepted: false,
};

async function submitted(w: Awaited<ReturnType<typeof world>>, answers: Record<string, unknown>) {
  const a = await createAssessment({
    organisationId: w.org.id,
    entityId: w.entity.id,
    templateVersionId: w.templateVersionId,
    title: "Personalisation",
    actor: SYSTEM,
  });
  await saveAnswers({
    assessmentId: a.id,
    organisationId: w.org.id,
    answers: answers as never,
    actor: SYSTEM,
  });
  return submitForApproval({ assessmentId: a.id, organisationId: w.org.id, actor: SYSTEM });
}

after(async () => {
  await pg.end();
});

describe("routing conditions", () => {
  // A stand-in library. The real one is loaded per submission; these checks are
  // about the predicate, not about where the set came from.
  const NEEDS_SAFEGUARDS = new Set(["US", "IN", "SG", "AU", "BR", "CN"]);

  const ctx = (over: Partial<RoutingContext>): RoutingContext => ({
    answers: {},
    score: null,
    tier: null,
    needsSafeguards: NEEDS_SAFEGUARDS,
    ...over,
  });

  it("does not let an unscored assessment clear a score threshold", () => {
    // Treating a missing score as zero would route a weighted-sum AI assessment
    // straight past the gate meant to catch it.
    assert.equal(matches({ op: "scoreAtLeast", value: 8 }, ctx({ score: null })), false);
    assert.equal(matches({ op: "scoreAtLeast", value: 8 }, ctx({ score: 9 })), true);
  });

  it("orders tiers rather than comparing them as strings", () => {
    assert.equal(matches({ op: "tierAtLeast", value: "high" }, ctx({ tier: "critical" })), true);
    assert.equal(matches({ op: "tierAtLeast", value: "high" }, ctx({ tier: "medium" })), false);
  });

  it("detects special category data anywhere in the answers", () => {
    const c = { op: "specialCategoryData" as const };
    assert.equal(matches(c, ctx({ answers: { data_categories: ["viewing_history"] } })), false);
    assert.equal(matches(c, ctx({ answers: { data_categories: ["health"] } })), true);
    // Found without naming the question, so it survives a template rewording.
    assert.equal(matches(c, ctx({ answers: { some_other_key: ["criminal_offence"] } })), true);
  });

  it("detects a transfer to a country without adequacy", () => {
    const c = { op: "transferToNonAdequate" as const };
    assert.equal(matches(c, ctx({ answers: { transfer_destinations: ["IE", "FR"] } })), false);
    assert.equal(matches(c, ctx({ answers: { transfer_destinations: ["IE", "US"] } })), true);
  });

  it("escalates rather than waving through when the library is missing", () => {
    // The dangerous shape: an empty set answers "no" for every country, so a
    // transfer anywhere would pass the gate meant to catch it.
    const c = { op: "transferToNonAdequate" as const };
    const destinations = { transfer_destinations: ["IE", "FR"] };
    assert.equal(matches(c, { answers: destinations, score: null, tier: null }), true);
    assert.equal(
      matches(c, { answers: destinations, score: null, tier: null, needsSafeguards: new Set() }),
      true,
    );
  });
});

describe("opening approvals", () => {
  it("records every stage, including those that did not apply", async () => {
    const w = await world("skipped");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "remote", impact: "minimal" });

    const gates = await approvalsFor(result.assessment.id);
    assert.equal(gates.length, 3, "all three stages are on the record");
    assert.equal(gates[0].status, "pending");
    // A gate that simply never appears cannot be told apart from one somebody
    // removed, so the ones that did not apply are recorded with the reason.
    assert.equal(gates[1].status, "skipped");
    assert.match(gates[1].reason, /did not hold/);
    assert.equal(gates[2].status, "skipped");
  });

  it("adds the DPO gate when special category data is involved", async () => {
    const w = await world("special");
    const result = await submitted(w, {
      ...BASE_DPIA,
      data_categories: ["viewing_history", "health"],
      special_category: true,
      special_condition: "Article 9(2)(a) explicit consent.",
      likelihood: "remote",
      impact: "minimal",
    });
    const gates = await approvalsFor(result.assessment.id);
    assert.equal(gates[1].status, "pending");
    assert.match(gates[1].reason, /special category/);
  });

  it("adds the DPO gate for a transfer to a country without adequacy", async () => {
    const w = await world("transfer");
    const result = await submitted(w, {
      ...BASE_DPIA,
      transfers_abroad: true,
      transfer_destinations: ["US"],
      likelihood: "remote",
      impact: "minimal",
    });
    const gates = await approvalsFor(result.assessment.id);
    assert.equal(gates[1].status, "pending");
    assert.match(gates[1].reason, /adequacy/);
  });

  it("adds the accountable approver only when the risk is critical", async () => {
    const w = await world("critical");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "likely", impact: "severe" });
    assert.equal(result.assessment.scoreTier, "critical");
    const gates = await approvalsFor(result.assessment.id);
    assert.equal(gates[2].status, "pending");
  });

  it("raises a task for the first gate and nobody else", async () => {
    const w = await world("firsttask");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "likely", impact: "severe" });
    const open = await openTasks(w.org.id, { entityIds: null });
    const approvalTasks = open.filter((t) => t.type === "approve_stage");
    assert.equal(approvalTasks.length, 1);
    assert.equal(approvalTasks[0].assigneeRole, "privacy_analyst");
    assert.equal(result.firstPending?.name, "Privacy review");
  });
});

describe("deciding", () => {
  it("refuses a decision from someone without the role", async () => {
    const w = await world("wrongrole");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "remote", impact: "minimal" });
    const [gate] = await approvalsFor(result.assessment.id);

    await assert.rejects(
      decideApproval({
        approvalId: gate.id,
        organisationId: w.org.id,
        decision: "approved",
        rationale: "Looks fine to me.",
        callerRoles: ["contributor"],
        actor: actor("nobody@example.com"),
      }),
      (e) => e instanceof NotYourDecision,
    );
  });

  it("requires a rationale even to approve", async () => {
    const w = await world("norationale");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "remote", impact: "minimal" });
    const [gate] = await approvalsFor(result.assessment.id);
    await assert.rejects(
      decideApproval({
        approvalId: gate.id,
        organisationId: w.org.id,
        decision: "approved",
        rationale: "  ",
        callerRoles: ["privacy_analyst"],
        actor: actor("analyst@example.com"),
      }),
      (e) => e instanceof DecisionRefused,
    );
  });

  it("refuses a later gate before an earlier one", async () => {
    const w = await world("outoforder");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "likely", impact: "severe" });
    const gates = await approvalsFor(result.assessment.id);
    const third = gates.find((g) => g.position === 3)!;

    // Stages are an order of consideration. A later approver signing before an
    // earlier one has looked is not the process anybody agreed to.
    await assert.rejects(
      decideApproval({
        approvalId: third.id,
        organisationId: w.org.id,
        decision: "approved",
        rationale: "Signing early.",
        callerRoles: ["approver"],
        actor: actor("approver@example.com"),
      }),
      (e) => e instanceof DecisionRefused && /has not been decided yet/.test(e.message),
    );
  });

  it("walks the gates in order and approves at the end", async () => {
    const w = await world("walk");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "likely", impact: "severe" });
    const gates = await approvalsFor(result.assessment.id);

    const first = await decideApproval({
      approvalId: gates[0].id,
      organisationId: w.org.id,
      decision: "approved",
      rationale: "Description and necessity are sound.",
      callerRoles: ["privacy_analyst"],
      actor: actor("analyst@example.com"),
    });
    assert.equal(first.status, "in_review");
    assert.equal(first.nextPending?.name, "Data protection officer");

    await decideApproval({
      approvalId: gates[1].id,
      organisationId: w.org.id,
      decision: "approved",
      rationale: "Article 9 condition is documented.",
      callerRoles: ["privacy_admin"],
      actor: actor("dpo@example.com"),
    });
    const last = await decideApproval({
      approvalId: gates[2].id,
      organisationId: w.org.id,
      decision: "approved",
      rationale: "Accepting on behalf of the division.",
      callerRoles: ["approver"],
      actor: actor("approver@example.com"),
    });
    assert.equal(last.status, "approved");
  });

  it("closes the task the decision was asked for", async () => {
    const w = await world("closetask");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "remote", impact: "minimal" });
    const [gate] = await approvalsFor(result.assessment.id);

    assert.equal((await openTasks(w.org.id, { entityIds: null })).length, 1);
    await decideApproval({
      approvalId: gate.id,
      organisationId: w.org.id,
      decision: "approved",
      rationale: "Fine.",
      callerRoles: ["privacy_analyst"],
      actor: actor("analyst@example.com"),
    });
    assert.equal((await openTasks(w.org.id, { entityIds: null })).length, 0);
  });

  it("stands down the remaining gates when returned", async () => {
    const w = await world("returned");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "likely", impact: "severe" });
    const gates = await approvalsFor(result.assessment.id);

    const outcome = await decideApproval({
      approvalId: gates[0].id,
      organisationId: w.org.id,
      decision: "returned",
      rationale: "Retention period needs a source.",
      callerRoles: ["privacy_analyst"],
      actor: actor("analyst@example.com"),
    });
    assert.equal(outcome.status, "returned");

    const after = await approvalsFor(result.assessment.id);
    assert.equal(after.filter((g) => g.status === "pending").length, 0);
  });

  it("refuses to decide the same gate twice", async () => {
    const w = await world("twice");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "remote", impact: "minimal" });
    const [gate] = await approvalsFor(result.assessment.id);
    const decide = () =>
      decideApproval({
        approvalId: gate.id,
        organisationId: w.org.id,
        decision: "approved",
        rationale: "Fine.",
        callerRoles: ["privacy_analyst"],
        actor: actor("analyst@example.com"),
      });
    await decide();
    await assert.rejects(decide(), (e) => e instanceof DecisionRefused);
  });
});

describe("the sweep", () => {
  it("raises a review when an acceptance lapses, without changing the risk", async () => {
    const w = await world("lapse");
    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Residual exposure",
      description: "x",
      likelihood: 3,
      impact: 3,
      actor: SYSTEM,
    });
    await setResidual({
      riskId: risk.id,
      organisationId: w.org.id,
      likelihood: 2,
      impact: 2,
      actor: SYSTEM,
    });
    await db.execute(sql`
      insert into risk_acceptance
        (risk_id, accepted_by_label, rationale, residual_score_at_acceptance,
         residual_tier_at_acceptance, expires_at, created_at)
      values (${risk.id}, 'approver@example.com', 'Tolerable at the time.',
              4, 'medium', now() - interval '2 days', now() - interval '200 days')
    `);
    await db.execute(sql`update risk set status = 'accepted' where id = ${risk.id}`);

    const result = await sweepOrganisation(w.org.id);
    assert.equal(result.acceptanceReviewsRaised, 1);

    const open = await openTasks(w.org.id, { entityIds: null });
    const review = open.find((t) => t.type === "review_acceptance");
    assert.ok(review, "a review task was raised");
    assert.match(review!.title, /Acceptance lapsed/);

    // The decision itself is untouched: the system prompts, it does not overrule.
    const [after] = await db.execute<{ status: string }>(
      sql`select status from risk where id = ${risk.id}`,
    );
    assert.equal(after.status, "accepted");
  });

  it("is safe to run twice", async () => {
    const w = await world("idempotent");
    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Repeatable",
      description: "x",
      likelihood: 2,
      impact: 2,
      actor: SYSTEM,
    });
    await setResidual({
      riskId: risk.id,
      organisationId: w.org.id,
      likelihood: 1,
      impact: 2,
      actor: SYSTEM,
    });
    await db.execute(sql`
      insert into risk_acceptance
        (risk_id, accepted_by_label, rationale, residual_score_at_acceptance,
         residual_tier_at_acceptance, expires_at, created_at)
      values (${risk.id}, 'approver@example.com', 'Fine then.',
              2, 'low', now() - interval '1 day', now() - interval '100 days')
    `);

    const first = await sweepOrganisation(w.org.id);
    const second = await sweepOrganisation(w.org.id);

    assert.equal(first.acceptanceReviewsRaised, 1);
    // A cron that fires twice, or a retry after a partial failure, must not
    // leave a second copy for somebody to tidy up.
    assert.equal(second.acceptanceReviewsRaised, 0);
    assert.equal(
      (await openTasks(w.org.id, { entityIds: null })).filter((t) => t.type === "review_acceptance").length,
      1,
    );
  });

  it("records a breach once and escalates it", async () => {
    const w = await world("breach");
    const result = await submitted(w, { ...BASE_DPIA, likelihood: "remote", impact: "minimal" });
    await db.execute(
      sql`update task set due_at = now() - interval '1 day' where organisation_id = ${w.org.id}`,
    );

    const first = await sweepOrganisation(w.org.id);
    assert.equal(first.breachesRecorded, 1);
    const second = await sweepOrganisation(w.org.id);
    assert.equal(second.breachesRecorded, 0, "a breach is recorded once, not every hour");

    const [row] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, "approve_stage")));
    assert.notEqual(row.breachedAt, null);
    assert.notEqual(row.escalatedAt, null);
    assert.ok(result.assessment.id);
  });

  it("keeps a breach on the record after the task is completed", async () => {
    const w = await world("breachkept");
    await submitted(w, { ...BASE_DPIA, likelihood: "remote", impact: "minimal" });
    await db.execute(
      sql`update task set due_at = now() - interval '1 day' where organisation_id = ${w.org.id}`,
    );
    await sweepOrganisation(w.org.id);

    const [task] = await db.select().from(tasks).where(eq(tasks.organisationId, w.org.id));
    await completeTask({ taskId: task.id, organisationId: w.org.id, actor: SYSTEM });

    const [after] = await db.select().from(tasks).where(eq(tasks.id, task.id));
    assert.equal(after.status, "done");
    // "Was this late" has to stay answerable after the fact — it is the only
    // version of the question a management report can use.
    assert.notEqual(after.breachedAt, null);
  });

  it("materialises a schedule once per occurrence and rolls it forward", async () => {
    const w = await world("schedule");
    const [risk] = [
      await createRisk({
        organisationId: w.org.id,
        entityId: w.entity.id,
        title: "Reviewed annually",
        description: "x",
        likelihood: 2,
        impact: 2,
        actor: SYSTEM,
      }),
    ];

    const due = new Date(Date.now() + 3 * DAY);
    await db.insert(schedules).values({
      organisationId: w.org.id,
      entityId: w.entity.id,
      subjectType: "risk",
      subjectId: risk.id,
      action: "review",
      title: "Annual review of RISK-0001",
      intervalMonths: 12,
      leadDays: 14,
      nextDueAt: due,
    });

    const first = await sweepOrganisation(w.org.id);
    assert.equal(first.schedulesMaterialised, 1);
    const second = await sweepOrganisation(w.org.id);
    assert.equal(second.schedulesMaterialised, 0);

    const [s] = await db.select().from(schedules).where(eq(schedules.organisationId, w.org.id));
    // Rolled forward a year, so the next occurrence is a separate task.
    assert.ok(s.nextDueAt.getTime() > due.getTime() + 300 * DAY);
  });

  it("leaves an intact audit chain", async () => {
    const w = await world("sweepaudit");
    await submitted(w, { ...BASE_DPIA, likelihood: "remote", impact: "minimal" });
    await db.execute(
      sql`update task set due_at = now() - interval '1 day' where organisation_id = ${w.org.id}`,
    );
    await sweepOrganisation(w.org.id);
    await sweepOrganisation(w.org.id);

    const result = await verifyAuditChain(w.org.id);
    assert.equal(result.ok, true);
  });
});

describe("default workflows", () => {
  it("configures one workflow per assessment kind", () => {
    const kinds = DEFAULT_WORKFLOWS.map((w) => w.templateKind).sort();
    assert.deepEqual(kinds, ["ai_risk", "dpia", "screening", "tia", "tra"]);
  });

  it("starts every workflow with an unconditional stage", () => {
    // A workflow whose first gate is conditional can produce an assessment that
    // is submitted and then approved by nobody at all.
    for (const w of DEFAULT_WORKFLOWS) {
      const first = w.stages.find((s) => s.position === 1);
      assert.ok(first, `${w.templateKind} has a first stage`);
      assert.equal(first!.condition.op, "always", `${w.templateKind} stage 1 is unconditional`);
    }
  });

  it("numbers stages contiguously from one", () => {
    for (const w of DEFAULT_WORKFLOWS) {
      const positions = w.stages.map((s) => s.position).sort((a, b) => a - b);
      assert.deepEqual(positions, positions.map((_, i) => i + 1));
    }
  });
});
