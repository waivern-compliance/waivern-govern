import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  mitigations,
  notifications,
  organisations,
  riskAcceptances,
  risks,
  schedules,
  slaPolicies,
  tasks,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { queueNotification, raiseTask } from "./workflow";
import { deliverPending } from "./webhooks";

/**
 * Everything that happens because time passed.
 *
 * The design called for durable step functions on Inngest. This is the same
 * work behind a cron-triggered entry point instead: every step is idempotent —
 * tasks and notifications carry keys and conflict away — so running it twice,
 * or re-running it after a partial failure, converges on the same state. That
 * is most of what durability buys, and it needs no third-party account to work.
 * Wrapping these functions in Inngest steps later changes the trigger, not the
 * logic.
 *
 * Nothing here changes a governance decision. The sweep raises tasks and
 * records notifications; a human still decides.
 */

const SYSTEM = {
  actorKind: "system" as const,
  actorUserId: null,
  actorLabel: "scheduler",
};

export type SweepResult = {
  organisation: string;
  schedulesMaterialised: number;
  acceptanceReviewsRaised: number;
  mitigationRemindersRaised: number;
  breachesRecorded: number;
  webhooksDelivered: number;
  webhooksFailed: number;
};

function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Turn schedules that are within their lead time into tasks. */
async function materialiseSchedules(organisationId: string): Promise<number> {
  const due = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.organisationId, organisationId), eq(schedules.isActive, true)));

  let raised = 0;
  for (const s of due) {
    const raiseFrom = new Date(s.nextDueAt.getTime() - s.leadDays * 24 * 3600 * 1000);
    if (raiseFrom.getTime() > Date.now()) continue;

    await db.transaction(async (tx) => {
      const task = await raiseTask(tx, {
        organisationId,
        entityId: s.entityId,
        type: s.action === "reassess" ? "reassess" : s.action === "verify" ? "verify_mitigation" : "review_assessment",
        title: s.title,
        description: `Recurring ${s.action}, due ${s.nextDueAt.toISOString().slice(0, 10)}.`,
        subjectType: s.subjectType,
        subjectId: s.subjectId,
        assigneeUserId: s.assigneeUserId,
        dueAt: s.nextDueAt,
        // Keyed on the occurrence, not the schedule, so each cycle raises
        // exactly one task however often the sweep runs.
        idempotencyKey: `schedule:${s.id}:${s.nextDueAt.toISOString().slice(0, 10)}`,
        actor: SYSTEM,
      });
      if (task) raised += 1;

      // Roll forward whether or not the task was new: if it already existed,
      // this occurrence is handled and the next one is what matters.
      await tx
        .update(schedules)
        .set({ lastRunAt: new Date(), nextDueAt: addMonths(s.nextDueAt, s.intervalMonths) })
        .where(eq(schedules.id, s.id));
    });
  }
  return raised;
}

/**
 * Raise a review for every acceptance that has run out.
 *
 * The risk deliberately stays recorded as accepted. Flipping it back would mean
 * the system overturning a named person's decision without them, which is
 * exactly the thing this platform must not do — so the lapse becomes a prompt.
 */
async function reviewLapsedAcceptances(organisationId: string): Promise<number> {
  const lapsed = await db
    .select({ acceptance: riskAcceptances, risk: risks })
    .from(riskAcceptances)
    .innerJoin(risks, eq(risks.id, riskAcceptances.riskId))
    .where(
      and(
        eq(risks.organisationId, organisationId),
        isNull(riskAcceptances.supersededAt),
        isNull(riskAcceptances.revokedAt),
        lte(riskAcceptances.expiresAt, new Date()),
      ),
    );

  let raised = 0;
  for (const { acceptance, risk } of lapsed) {
    await db.transaction(async (tx) => {
      const task = await raiseTask(tx, {
        organisationId,
        entityId: risk.entityId,
        type: "review_acceptance",
        title: `Acceptance lapsed: ${risk.reference} ${risk.title}`,
        description:
          `Accepted by ${acceptance.acceptedByLabel} until ` +
          `${acceptance.expiresAt.toISOString().slice(0, 10)}. The risk remains recorded ` +
          `as accepted until somebody decides otherwise.`,
        subjectType: "risk",
        subjectId: risk.id,
        idempotencyKey: `acceptance-review:${acceptance.id}`,
        actor: SYSTEM,
      });
      if (task) raised += 1;
    });
  }
  return raised;
}

/** Nudge mitigations that are due and not yet done. */
async function remindOverdueMitigations(organisationId: string): Promise<number> {
  const overdue = await db
    .select({ mitigation: mitigations, risk: risks })
    .from(mitigations)
    .innerJoin(risks, eq(risks.id, mitigations.riskId))
    .where(
      and(
        eq(risks.organisationId, organisationId),
        inArray(mitigations.status, ["planned", "in_progress"]),
        lte(mitigations.dueAt, new Date()),
      ),
    );

  let raised = 0;
  for (const { mitigation, risk } of overdue) {
    await db.transaction(async (tx) => {
      const task = await raiseTask(tx, {
        organisationId,
        entityId: risk.entityId,
        type: "mitigation_due",
        title: `Overdue: ${mitigation.description}`,
        description: `On ${risk.reference} ${risk.title}.`,
        subjectType: "mitigation",
        subjectId: mitigation.id,
        assigneeUserId: mitigation.ownerId,
        idempotencyKey: `mitigation-overdue:${mitigation.id}:${mitigation.dueAt?.toISOString().slice(0, 10)}`,
        actor: SYSTEM,
      });
      if (task) raised += 1;
    });
  }
  return raised;
}

/**
 * Mark tasks that have missed their service level and escalate them.
 *
 * Recording the breach on the task is what makes it a fact rather than a
 * calculation: "was this late" stays answerable after the task is finally
 * completed, which is the only version of the question that matters in a
 * management report.
 */
async function recordBreaches(organisationId: string): Promise<number> {
  const breached = await db
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

  const policies = await db
    .select()
    .from(slaPolicies)
    .where(eq(slaPolicies.organisationId, organisationId));
  const escalateTo = new Map(policies.map((p) => [p.taskType, p.escalateToRole]));

  let count = 0;
  for (const task of breached) {
    await db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .update(tasks)
        .set({ breachedAt: now, escalatedAt: now })
        .where(eq(tasks.id, task.id));

      await appendAuditEvent(tx, {
        ...SYSTEM,
        organisationId,
        action: "task.sla_breached",
        subjectType: "task",
        subjectId: task.id,
        entityId: task.entityId,
        after: {
          title: task.title,
          dueAt: task.dueAt?.toISOString() ?? null,
          escalatedTo: escalateTo.get(task.type) ?? null,
        },
      });

      await queueNotification(tx, {
        organisationId,
        recipient: escalateTo.get(task.type) ?? task.assigneeEmail ?? task.assigneeRole ?? "unassigned",
        kind: "task.sla_breached",
        subject: `Overdue: ${task.title}`,
        body: `Due ${task.dueAt?.toISOString().slice(0, 10)}, still ${task.status}.`,
        taskId: task.id,
        idempotencyKey: `notify:breach:${task.id}`,
      });
      count += 1;
    });
  }
  return count;
}

export async function sweepOrganisation(organisationId: string): Promise<SweepResult> {
  const [org] = await db.select().from(organisations).where(eq(organisations.id, organisationId));
  const result: SweepResult = {
    organisation: org?.name ?? organisationId,
    schedulesMaterialised: await materialiseSchedules(organisationId),
    acceptanceReviewsRaised: await reviewLapsedAcceptances(organisationId),
    mitigationRemindersRaised: await remindOverdueMitigations(organisationId),
    breachesRecorded: await recordBreaches(organisationId),
    webhooksDelivered: 0,
    webhooksFailed: 0,
  };

  // Delivery is attempted last: a subscriber that is slow or down must not
  // delay the governance work the sweep exists to do.
  const delivery = await deliverPending(organisationId);
  result.webhooksDelivered = delivery.delivered;
  result.webhooksFailed = delivery.failed;
  return result;
}

export async function sweepAll(): Promise<SweepResult[]> {
  const orgs = await db.select({ id: organisations.id }).from(organisations);
  const results: SweepResult[] = [];
  for (const o of orgs) results.push(await sweepOrganisation(o.id));
  return results;
}

/** Notifications recorded but not yet handed to a delivery mechanism. */
export async function pendingNotifications(organisationId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.organisationId, organisationId), isNull(notifications.sentAt)))
    .orderBy(notifications.createdAt);
}
