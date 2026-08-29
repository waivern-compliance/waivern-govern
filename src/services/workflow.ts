import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import {
  approvals,
  assessments,
  notifications,
  slaPolicies,
  tasks,
  templateVersions,
  taskType,
  templates,
  workflowDefinitions,
  workflowStages,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import type { RiskTier } from "@/lib/risk/scale";
import { describe, matches, type RoutingContext } from "@/lib/workflow/routing";
import { loadAssessment, submitAssessment } from "./assessments";
import { needingSafeguards } from "./countries";
import { queueEvent } from "./webhooks";
import type { Actor } from "./templates";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class NotYourDecision extends Error {}
export class DecisionRefused extends Error {}

export type TaskType = (typeof taskType.enumValues)[number];

/** Default service levels, applied where the organisation has set none. */
const DEFAULT_SLA_HOURS: Record<TaskType, number> = {
  answer_section: 24 * 7,
  review_assessment: 24 * 5,
  approve_stage: 24 * 5,
  mitigation_due: 24 * 14,
  verify_mitigation: 24 * 7,
  reassess: 24 * 14,
  review_acceptance: 24 * 14,
};

async function slaHoursFor(tx: Tx, organisationId: string, type: TaskType) {
  const [policy] = await tx
    .select()
    .from(slaPolicies)
    .where(and(eq(slaPolicies.organisationId, organisationId), eq(slaPolicies.taskType, type)));
  return policy?.targetHours ?? DEFAULT_SLA_HOURS[type];
}

/**
 * Raise a task, at most once.
 *
 * The idempotency key is what makes the sweeps safe to re-run: a cron that
 * fires twice, or a retry after a partial failure, produces the same single
 * task rather than a duplicate somebody has to tidy up.
 */
export async function raiseTask(
  tx: Tx,
  input: {
    organisationId: string;
    entityId: string;
    type: TaskType;
    title: string;
    description?: string;
    subjectType: (typeof tasks.$inferInsert)["subjectType"];
    subjectId: string;
    assigneeUserId?: string | null;
    assigneeEmail?: string | null;
    assigneeRole?: (typeof tasks.$inferInsert)["assigneeRole"];
    dueAt?: Date;
    idempotencyKey: string;
    actor: Actor;
  },
) {
  const slaHours = await slaHoursFor(tx, input.organisationId, input.type);
  const dueAt = input.dueAt ?? new Date(Date.now() + slaHours * 3600 * 1000);

  const [task] = await tx
    .insert(tasks)
    .values({
      organisationId: input.organisationId,
      entityId: input.entityId,
      type: input.type,
      title: input.title,
      description: input.description,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      assigneeUserId: input.assigneeUserId ?? null,
      assigneeEmail: input.assigneeEmail ?? null,
      assigneeRole: input.assigneeRole,
      dueAt,
      slaHours,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({ target: [tasks.organisationId, tasks.idempotencyKey] })
    .returning();

  if (!task) return null; // Already raised.

  await appendAuditEvent(tx, {
    ...input.actor,
    organisationId: input.organisationId,
    action: "task.raised",
    subjectType: "task",
    subjectId: task.id,
    entityId: input.entityId,
    after: { type: input.type, title: input.title, dueAt: dueAt.toISOString() },
  });

  await queueNotification(tx, {
    organisationId: input.organisationId,
    recipient: input.assigneeEmail ?? input.assigneeUserId ?? input.assigneeRole ?? "unassigned",
    kind: "task.raised",
    subject: input.title,
    body: `${input.description ?? input.title}\nDue ${dueAt.toISOString().slice(0, 10)}.`,
    taskId: task.id,
    idempotencyKey: `notify:raised:${task.id}`,
  });

  return task;
}

/** Record an intended notification. Sending is a later concern; the record is not. */
export async function queueNotification(
  tx: Tx,
  input: {
    organisationId: string;
    recipient: string;
    kind: string;
    subject: string;
    body: string;
    taskId?: string;
    idempotencyKey: string;
  },
) {
  await tx
    .insert(notifications)
    .values(input)
    .onConflictDoNothing({
      target: [notifications.organisationId, notifications.idempotencyKey],
    });
}

/**
 * Open the approval gates for a submitted assessment.
 *
 * Every stage of the workflow gets a row, including those whose condition did
 * not hold — recorded as skipped, with the reason. A gate that simply never
 * appears cannot be told apart from one somebody removed, and "which approvals
 * did this need" is the first question asked when a decision is challenged.
 */
export async function openApprovals(input: {
  assessmentId: string;
  organisationId: string;
  actor: Actor;
}) {
  const loaded = await loadAssessment(input.assessmentId, input.organisationId);
  if (!loaded) throw new Error("No such assessment");

  const [tmpl] = await db
    .select({ kind: templates.kind })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(eq(templateVersions.id, loaded.assessment.templateVersionId));
  if (!tmpl) throw new Error("No such template");

  const [definition] = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.organisationId, input.organisationId),
        eq(workflowDefinitions.templateKind, tmpl.kind),
        eq(workflowDefinitions.isActive, true),
      ),
    );
  if (!definition) return { approvals: [], firstPending: null };

  const stages = await db
    .select()
    .from(workflowStages)
    .where(eq(workflowStages.workflowDefinitionId, definition.id))
    .orderBy(asc(workflowStages.position));

  const ctx: RoutingContext = {
    answers: loaded.answers,
    score: loaded.assessment.scoreValue,
    tier: loaded.assessment.scoreTier as RiskTier | null,
    // Loaded per submission rather than baked in, so an adequacy decision
    // changing takes effect on the next assessment rather than the next deploy.
    needsSafeguards: await needingSafeguards(input.organisationId, "uk"),
  };

  return db.transaction(async (tx) => {
    const created: Array<typeof approvals.$inferSelect> = [];

    for (const stage of stages) {
      const applies = matches(stage.condition, ctx);
      const [row] = await tx
        .insert(approvals)
        .values({
          assessmentId: input.assessmentId,
          stageId: stage.id,
          position: stage.position,
          name: stage.name,
          requiredRole: stage.requiredRole,
          status: applies ? "pending" : "skipped",
          reason: applies
            ? `Applies: ${describe(stage.condition)}`
            : `Not required: ${describe(stage.condition)} did not hold`,
        })
        .onConflictDoNothing({ target: [approvals.assessmentId, approvals.position] })
        .returning();
      if (row) created.push(row);
    }

    const firstPending = created.find((a) => a.status === "pending") ?? null;

    if (firstPending) {
      await raiseTask(tx, {
        organisationId: input.organisationId,
        entityId: loaded.assessment.entityId,
        type: "approve_stage",
        title: `${firstPending.name}: ${loaded.assessment.reference} ${loaded.assessment.title}`,
        description: firstPending.reason,
        subjectType: "assessment",
        subjectId: input.assessmentId,
        assigneeRole: firstPending.requiredRole,
        idempotencyKey: `approve:${firstPending.id}`,
        actor: input.actor,
      });
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "assessment.approvals_opened",
      subjectType: "assessment",
      subjectId: input.assessmentId,
      entityId: loaded.assessment.entityId,
      after: {
        stages: created.map((a) => ({ name: a.name, status: a.status, reason: a.reason })),
      },
    });

    return { approvals: created, firstPending };
  });
}

/**
 * Take a decision on the current gate.
 *
 * Approving out of order is refused: stages are an order of consideration, and
 * a later approver signing before an earlier one has looked is not the process
 * anybody signed up to. A rationale is required for every decision, including
 * approval — "why was this thought acceptable" is the question a review asks,
 * and it cannot be answered retrospectively.
 */
export async function decideApproval(input: {
  approvalId: string;
  organisationId: string;
  decision: "approved" | "rejected" | "returned";
  rationale: string;
  /** Roles the caller holds in the assessment's entity. */
  callerRoles: string[];
  actor: Actor;
}) {
  const rationale = input.rationale.trim();
  if (!rationale) throw new DecisionRefused("A rationale is required for every decision");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ approval: approvals, assessment: assessments })
      .from(approvals)
      .innerJoin(assessments, eq(assessments.id, approvals.assessmentId))
      .where(
        and(
          eq(approvals.id, input.approvalId),
          eq(assessments.organisationId, input.organisationId),
        ),
      );
    if (!row) throw new Error("No such approval");
    if (row.approval.status !== "pending") {
      throw new DecisionRefused(`This stage is already ${row.approval.status}`);
    }
    if (!input.callerRoles.includes(row.approval.requiredRole)) {
      throw new NotYourDecision(
        `This stage is decided by ${row.approval.requiredRole.replace(/_/g, " ")}`,
      );
    }

    const earlier = await tx
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.assessmentId, row.approval.assessmentId),
          eq(approvals.status, "pending"),
          sql`${approvals.position} < ${row.approval.position}`,
        ),
      );
    if (earlier.length > 0) {
      throw new DecisionRefused(
        `${earlier[0].name} has not been decided yet`,
      );
    }

    const now = new Date();
    await tx
      .update(approvals)
      .set({
        status: input.decision,
        decidedByUserId: input.actor.actorUserId ?? null,
        decidedByLabel: input.actor.actorLabel,
        decidedAt: now,
        rationale,
      })
      .where(eq(approvals.id, input.approvalId));

    // Close the task that asked for this decision.
    await tx
      .update(tasks)
      .set({ status: "done", completedAt: now, completedByLabel: input.actor.actorLabel })
      .where(
        and(
          eq(tasks.organisationId, input.organisationId),
          eq(tasks.idempotencyKey, `approve:${input.approvalId}`),
        ),
      );

    let assessmentStatus: "in_review" | "approved" | "returned" | "rejected" = "in_review";
    let nextPending: typeof approvals.$inferSelect | null = null;

    if (input.decision === "rejected") {
      assessmentStatus = "rejected";
    } else if (input.decision === "returned") {
      assessmentStatus = "returned";
      // The remaining gates are moot until it comes back.
      await tx
        .update(approvals)
        .set({ status: "skipped", reason: "Assessment returned before this stage" })
        .where(
          and(
            eq(approvals.assessmentId, row.approval.assessmentId),
            eq(approvals.status, "pending"),
          ),
        );
    } else {
      const remaining = await tx
        .select()
        .from(approvals)
        .where(
          and(
            eq(approvals.assessmentId, row.approval.assessmentId),
            eq(approvals.status, "pending"),
          ),
        )
        .orderBy(asc(approvals.position));
      nextPending = remaining[0] ?? null;
      assessmentStatus = nextPending ? "in_review" : "approved";
    }

    await tx
      .update(assessments)
      .set({
        status: assessmentStatus,
        updatedAt: now,
        completedAt: assessmentStatus === "approved" ? now : null,
      })
      .where(eq(assessments.id, row.approval.assessmentId));

    if (nextPending) {
      await raiseTask(tx, {
        organisationId: input.organisationId,
        entityId: row.assessment.entityId,
        type: "approve_stage",
        title: `${nextPending.name}: ${row.assessment.reference} ${row.assessment.title}`,
        description: nextPending.reason,
        subjectType: "assessment",
        subjectId: row.approval.assessmentId,
        assigneeRole: nextPending.requiredRole,
        idempotencyKey: `approve:${nextPending.id}`,
        actor: input.actor,
      });
    }

    // Queued inside the same transaction as the decision, so an approval never
    // lands without its notification and a rolled-back decision never announces
    // itself. Delivery happens later, on the sweep.
    if (assessmentStatus === "approved" || assessmentStatus === "rejected") {
      await queueEvent(tx, {
        organisationId: input.organisationId,
        event: assessmentStatus === "approved" ? "assessment.approved" : "assessment.rejected",
        payload: {
          reference: row.assessment.reference,
          title: row.assessment.title,
          entityId: row.assessment.entityId,
          score: row.assessment.scoreValue,
          tier: row.assessment.scoreTier,
          decidedBy: input.actor.actorLabel,
          rationale,
        },
        idempotencyKey: `assessment:${row.approval.assessmentId}:${assessmentStatus}`,
      });
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: `approval.${input.decision}`,
      subjectType: "approval",
      subjectId: input.approvalId,
      entityId: row.assessment.entityId,
      before: { status: "pending" },
      after: {
        status: input.decision,
        stage: row.approval.name,
        rationale,
        assessmentStatus,
      },
    });

    return { status: assessmentStatus, nextPending };
  });
}

export async function approvalsFor(assessmentId: string) {
  return db
    .select()
    .from(approvals)
    .where(eq(approvals.assessmentId, assessmentId))
    .orderBy(asc(approvals.position));
}

export async function completeTask(input: {
  taskId: string;
  organisationId: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const now = new Date();
    const [task] = await tx
      .update(tasks)
      .set({ status: "done", completedAt: now, completedByLabel: input.actor.actorLabel })
      .where(
        and(
          eq(tasks.id, input.taskId),
          eq(tasks.organisationId, input.organisationId),
          inArray(tasks.status, ["open", "in_progress"]),
        ),
      )
      .returning();
    if (!task) return null;

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "task.completed",
      subjectType: "task",
      subjectId: task.id,
      entityId: task.entityId,
      after: { title: task.title },
    });
    return task;
  });
}

export type TaskViewer = {
  /** Entities they may read records in. `null` means every entity. */
  entityIds: string[] | null;
  userId?: string | null;
  /** Roles held, and where. A role grant is what makes an unassigned task theirs. */
  grants?: ReadonlyArray<{ role: string; scope: "organisation" | "entity"; entityId?: string }>;
};

/**
 * Open tasks this person should see.
 *
 * Three ways a task reaches someone, and the first two do not depend on being
 * able to read the register at all:
 *
 *  - it names them. Being asked to do something is its own authorisation, and
 *    without this a contributor — whose entire job is answering assigned
 *    questions — sees an empty page and concludes the platform is broken;
 *  - it names a role they hold in that task's entity. An approver on one legal
 *    entity has no standing over another's queue, so the role match is scoped
 *    the same way the grant is;
 *  - it sits in an entity whose records they may read.
 */
export async function openTasks(organisationId: string, viewer: TaskViewer) {
  const reach = [];

  if (viewer.entityIds === null) {
    reach.push(sql`true`);
  } else if (viewer.entityIds.length > 0) {
    reach.push(inArray(tasks.entityId, viewer.entityIds));
  }

  if (viewer.userId) {
    reach.push(eq(tasks.assigneeUserId, viewer.userId));
  }

  for (const g of viewer.grants ?? []) {
    reach.push(
      g.scope === "organisation"
        ? eq(tasks.assigneeRole, g.role as never)
        : and(
            eq(tasks.assigneeRole, g.role as never),
            eq(tasks.entityId, g.entityId!),
          ),
    );
  }

  // Nothing reaches them at all — return nothing rather than everything.
  if (reach.length === 0) return [];

  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.organisationId, organisationId),
        inArray(tasks.status, ["open", "in_progress"]),
        or(...reach),
      ),
    )
    .orderBy(asc(tasks.dueAt));
}

/** Open tasks past their due date and not yet marked as breached. */
export async function tasksInBreach(organisationId: string) {
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.organisationId, organisationId),
        inArray(tasks.status, ["open", "in_progress"]),
        isNull(tasks.breachedAt),
        lte(tasks.dueAt, new Date()),
      ),
    );
}

/** Open tasks falling due inside the window, for a nudge before the deadline. */
export async function tasksDueSoon(organisationId: string, withinHours: number) {
  const horizon = new Date(Date.now() + withinHours * 3600 * 1000);
  return db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.organisationId, organisationId),
        inArray(tasks.status, ["open", "in_progress"]),
        isNull(tasks.breachedAt),
        lte(tasks.dueAt, horizon),
        or(isNull(tasks.escalatedAt), sql`true`),
      ),
    );
}

/**
 * Submit an assessment, then open the approval gates the workflow calls for.
 *
 * Two steps rather than one transaction: the submission is the person's act and
 * stands on its own, while routing is bookkeeping that follows from it. Where no
 * workflow is configured the assessment simply sits in review for someone to
 * pick up — a better failure than refusing a submission because an
 * administrator has not finished configuring approvals.
 *
 * This lives here rather than beside `submitAssessment` because routing needs
 * the assessment service, and the reverse dependency would be a cycle.
 */
export async function submitForApproval(input: {
  assessmentId: string;
  organisationId: string;
  actor: Actor;
}) {
  const submitted = await submitAssessment(input);
  const routed = await openApprovals(input);
  return { ...submitted, ...routed };
}
