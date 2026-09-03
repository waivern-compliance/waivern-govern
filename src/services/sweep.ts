import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvals,
  assessments,
  entities,
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
import { addMonths } from "@/lib/dates";
import { queueNotification, raiseTask } from "./workflow";
import { deliverPending } from "./webhooks";
import { countriesDueForReview } from "./countries";
import { forgetExpiredConversations } from "./assistant";
import { notificationDeadline } from "@/lib/breach/statutory";
import { breachesNeedingAttention } from "./breaches";
import { EXPIRING_WITHIN_LABEL, dpasNeedingAttention } from "./third-party";

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
  countryReviewsRaised: number;
  dpaReviewsRaised: number;
  conversationsForgotten: number;
  breachDeadlinesRaised: number;
  lapsedReviewsRaised: number;
  webhooksDelivered: number;
  webhooksFailed: number;
};

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

      /**
       * The people who approved it are asked to reapprove.
       *
       * A schedule holds one name, and the owner redoing the work is not the
       * same person as the approver signing it off again. So the approvers are
       * found here, from the approvals themselves, rather than being guessed
       * at when the schedule was created — membership changes over a year, and
       * the record of who actually decided does not.
       */
      if (s.action === "reassess" && s.subjectType === "assessment") {
        const decided = await tx
          .select({
            userId: approvals.decidedByUserId,
            name: approvals.name,
            role: approvals.requiredRole,
          })
          .from(approvals)
          .where(
            and(
              eq(approvals.assessmentId, s.subjectId),
              eq(approvals.status, "approved"),
            ),
          );

        const seen = new Set<string>();
        for (const gate of decided) {
          if (!gate.userId || seen.has(gate.userId)) continue;
          // Not the owner twice: they already have the reassessment task.
          if (gate.userId === s.assigneeUserId) continue;
          seen.add(gate.userId);

          const notice = await raiseTask(tx, {
            organisationId,
            entityId: s.entityId,
            type: "review_assessment",
            title: `Reapproval due: ${s.title.replace(/^Reassess /, "")}`,
            description:
              `You approved this at the "${gate.name}" stage. It is being reassessed and ` +
              `will need deciding again.`,
            subjectType: s.subjectType,
            subjectId: s.subjectId,
            assigneeUserId: gate.userId,
            dueAt: s.nextDueAt,
            idempotencyKey: `reapproval:${s.id}:${s.nextDueAt.toISOString().slice(0, 10)}:${gate.userId}`,
            actor: SYSTEM,
          });
          if (notice) raised += 1;
        }
      }

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

/**
 * Turn a country library falling out of date into somebody's work.
 *
 * One task for the library, not one per country. Sixty-six identical reminders
 * is not sixty-six times as useful as one — it buries every other task a person
 * has, and the rational response is to stop reading the list. The task names
 * the count and the worst of it; the library page is where the work happens.
 *
 * This is what "kept up to date" means in practice. Transfer assessments cite
 * this library, so an entry nobody has checked weakens every assessment relying
 * on it — quietly, because the assessment still reads as evidenced.
 */
async function raiseCountryReviews(organisationId: string): Promise<number> {
  const due = (await countriesDueForReview()).filter(
    // A shared row is due for everybody; an override is due only for its owner.
    (c) => c.organisationId === null || c.organisationId === organisationId,
  );
  if (due.length === 0) return 0;

  const [entity] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.organisationId, organisationId), eq(entities.isDefault, true)));
  if (!entity) return 0;

  const unverified = due.filter((c) => c.reviewedBy === "seed — not verified").length;
  const oldest = due[0];

  // Keyed on the month, so a neglected library nags once a month rather than
  // once an hour, and a fresh lapse next month raises a fresh task.
  const period = new Date().toISOString().slice(0, 7);

  let raised = 0;
  await db.transaction(async (tx) => {
    const task = await raiseTask(tx, {
      organisationId,
      entityId: entity.id,
      type: "review_assessment",
      title: `${due.length} countries need their transfer information checked`,
      description:
        (unverified > 0
          ? `${unverified} have never been checked by a person. `
          : `Oldest is ${oldest.name}, last checked ${oldest.reviewedAt.toISOString().slice(0, 10)}. `) +
        "Transfer assessments cite this library.",
      subjectType: "country_risk",
      subjectId: oldest.id,
      assigneeRole: "privacy_admin",
      idempotencyKey: `country-library-review:${period}`,
      actor: SYSTEM,
    });
    if (task) raised = due.length;
  });
  return raised;
}

/**
 * Contracts that are lapsing, or were never signed.
 *
 * Article 28(3) requires processing to be governed by a contract. An expiry
 * date is recorded on the agreement and then nothing watches it, so the
 * failure mode is a processor still processing under an agreement that ended
 * months ago and nobody noticing until somebody asks.
 *
 * One task naming the count rather than one per agreement: a supplier list
 * that turns over produces dozens at once, and thirty near-identical tasks are
 * ignored as a block.
 */
async function raiseDpaReviews(organisationId: string): Promise<number> {
  const due = await dpasNeedingAttention(organisationId);
  if (due.length === 0) return 0;

  const [entity] = await db
    .select()
    .from(entities)
    .where(and(eq(entities.organisationId, organisationId), eq(entities.isDefault, true)));
  if (!entity) return 0;

  const now = new Date();
  const expired = due.filter((d) => d.dpa.expiresAt && d.dpa.expiresAt <= now);
  const unsigned = due.filter((d) => !d.dpa.signedAt);
  const first = expired[0] ?? due[0];

  const parts: string[] = [];
  if (expired.length > 0) parts.push(`${expired.length} already expired`);
  if (unsigned.length > 0) parts.push(`${unsigned.length} never signed`);
  const soon = due.length - expired.length - unsigned.length;
  if (soon > 0) parts.push(`${soon} expiring within ${EXPIRING_WITHIN_LABEL}`);

  // Keyed on the month so a neglected contract file nags monthly rather than
  // hourly, and a fresh lapse next month raises a fresh task.
  const period = new Date().toISOString().slice(0, 7);

  let raised = 0;
  await db.transaction(async (tx) => {
    const task = await raiseTask(tx, {
      organisationId,
      entityId: entity.id,
      type: "review_assessment",
      title: `${due.length} processor agreement(s) need attention`,
      description:
        `${parts.join(", ")}. Earliest is ${first.supplier}` +
        (first.dpa.expiresAt
          ? `, ending ${first.dpa.expiresAt.toISOString().slice(0, 10)}.`
          : ", which has no signature recorded.") +
        " Processing under a lapsed agreement is processing without a contract.",
      subjectType: "dpa",
      subjectId: first.dpa.id,
      assigneeRole: "privacy_admin",
      idempotencyKey: `dpa-review:${period}`,
      actor: SYSTEM,
    });
    if (task) raised = due.length;
  });
  return raised;
}

/**
 * Breaches whose seventy-two hours is running out, or has run out.
 *
 * One task per breach rather than one naming a count, which is the opposite of
 * how country reviews and processor agreements are handled — and deliberately.
 * Those are housekeeping that accumulates; this is a statutory deadline
 * attaching to a specific incident, and rolling three of them into one line
 * would be the wrong instinct entirely.
 *
 * Keyed on the breach and the state, so a breach that moves from due-soon to
 * overdue raises a second task rather than silently reusing the first.
 */
async function raiseBreachDeadlines(organisationId: string): Promise<number> {
  const pressing = await breachesNeedingAttention(organisationId);
  if (pressing.length === 0) return 0;

  let raised = 0;
  for (const { breach, clock } of pressing) {
    const overdue = clock.state === "overdue";
    await db.transaction(async (tx) => {
      const task = await raiseTask(tx, {
        organisationId,
        entityId: breach.entityId,
        type: "breach_deadline",
        title: overdue
          ? `${breach.reference}: past seventy-two hours`
          : `${breach.reference}: seventy-two hours running out`,
        description:
          `${clock.words}. ` +
          (overdue
            ? "Article 33(1) still requires notification, accompanied by the reasons for the delay."
            : "Notify the supervisory authority, or record why Article 33 does not require it."),
        subjectType: "breach",
        subjectId: breach.id,
        assigneeRole: "privacy_admin",
        // The statutory deadline, not a service level counted from now.
        // Without this the task inherits 72 hours from its own creation and
        // shows "in 4d" for something due this afternoon.
        dueAt: notificationDeadline(breach.discoveredAt),
        idempotencyKey: `breach-deadline:${breach.id}:${clock.state}`,
        actor: SYSTEM,
      });
      if (task) raised += 1;
    });
  }
  return raised;
}

/**
 * Approved assessments whose review date has passed.
 *
 * Separate from the schedule that raised the reassessment, because the two say
 * different things. A schedule coming due means work is now expected; a review
 * date in the past means the organisation is currently relying on a stale
 * assessment, and that is worth saying out loud rather than leaving a task to
 * sit quietly in somebody's queue.
 *
 * Keyed on the month, so a neglected review nags monthly rather than hourly.
 */
async function raiseLapsedReviews(organisationId: string): Promise<number> {
  const lapsed = await db
    .select({ assessment: assessments, entityId: assessments.entityId })
    .from(assessments)
    .where(
      and(
        eq(assessments.organisationId, organisationId),
        eq(assessments.status, "approved"),
        isNull(assessments.supersedesId),
        lte(assessments.reviewDueAt, new Date()),
      ),
    )
    .orderBy(asc(assessments.reviewDueAt));
  if (lapsed.length === 0) return 0;

  const period = new Date().toISOString().slice(0, 7);
  let raised = 0;

  await db.transaction(async (tx) => {
    const oldest = lapsed[0].assessment;
    const task = await raiseTask(tx, {
      organisationId,
      entityId: oldest.entityId,
      type: "reassess",
      title:
        lapsed.length === 1
          ? `${oldest.reference} is past its review date`
          : `${lapsed.length} approved assessments are past their review date`,
      description:
        `Oldest is ${oldest.reference}, due ${oldest.reviewDueAt!.toISOString().slice(0, 10)}. ` +
        `An approved assessment past its review date is one the organisation is still relying on.`,
      subjectType: "assessment",
      subjectId: oldest.id,
      assigneeRole: "privacy_admin",
      idempotencyKey: `lapsed-reviews:${period}`,
      actor: SYSTEM,
    });
    if (task) raised = lapsed.length;
  });
  return raised;
}

export async function sweepOrganisation(organisationId: string): Promise<SweepResult> {
  const [org] = await db.select().from(organisations).where(eq(organisations.id, organisationId));
  const result: SweepResult = {
    organisation: org?.name ?? organisationId,
    schedulesMaterialised: await materialiseSchedules(organisationId),
    acceptanceReviewsRaised: await reviewLapsedAcceptances(organisationId),
    mitigationRemindersRaised: await remindOverdueMitigations(organisationId),
    breachesRecorded: await recordBreaches(organisationId),
    countryReviewsRaised: await raiseCountryReviews(organisationId),
    dpaReviewsRaised: await raiseDpaReviews(organisationId),
    // Retention is a promise, and a promise nothing enforces is a claim.
    conversationsForgotten: await forgetExpiredConversations(organisationId),
    breachDeadlinesRaised: await raiseBreachDeadlines(organisationId),
    lapsedReviewsRaised: await raiseLapsedReviews(organisationId),
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
