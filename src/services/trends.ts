import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { assessments, riskAcceptances, risks, tasks } from "@/db/schema";

/**
 * Governance posture over time.
 *
 * Reconstructed from the timestamps already on each record rather than from a
 * snapshot table, so a deployment has history from the day it started rather
 * than from the day somebody remembered to start sampling. `opened_at` and
 * `closed_at` on a risk answer "was this open in March" exactly.
 *
 * What is deliberately not reported is any stock broken down by an attribute
 * that changes — open risks by tier, say. A residual rating is re-judged over
 * time and only the current value survives, so charting it by month would
 * apply today's severity to last spring and call it history. Flows are exact;
 * that would be a guess wearing the same clothes.
 */

export type Period = {
  /** `2026-08`, which sorts and reads correctly. */
  key: string;
  start: Date;
  end: Date;
};

export type TrendPoint = {
  period: string;
  assessmentsStarted: number;
  assessmentsApproved: number;
  risksOpened: number;
  risksClosed: number;
  /** Still open at the end of the period. A stock, exactly reconstructable. */
  risksOpen: number;
  tasksCompleted: number;
  tasksBreached: number;
  acceptancesGranted: number;
  acceptancesExpired: number;
  /** Median days from submission to decision, or null if none were decided. */
  daysToDecide: number | null;
};

/** The last `count` whole months, oldest first, ending with the one in progress. */
export function monthsEnding(now: Date, count: number): Period[] {
  const periods: Period[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    periods.push({ key: start.toISOString().slice(0, 7), start, end });
  }
  return periods;
}

const within = (d: Date | null | undefined, p: Period) =>
  Boolean(d && d >= p.start && d < p.end);

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export type TrendInput = {
  risks: { openedAt: Date; closedAt: Date | null }[];
  assessments: { createdAt: Date; submittedAt: Date | null; completedAt: Date | null }[];
  tasks: { completedAt: Date | null; breachedAt: Date | null }[];
  acceptances: { createdAt: Date; expiresAt: Date; revokedAt: Date | null }[];
};

/**
 * Bucket records into periods.
 *
 * Pure, and separate from the queries, because the arithmetic is the part that
 * can be wrong in ways nobody notices — an off-by-one at a month boundary
 * looks like a quiet week rather than a bug.
 */
export function buildTrend(data: TrendInput, periods: readonly Period[]): TrendPoint[] {
  return periods.map((p) => {
    const decided = data.assessments
      .filter((a) => a.submittedAt && within(a.completedAt, p))
      .map((a) => (a.completedAt!.getTime() - a.submittedAt!.getTime()) / 86_400_000);

    return {
      period: p.key,
      assessmentsStarted: data.assessments.filter((a) => within(a.createdAt, p)).length,
      assessmentsApproved: data.assessments.filter((a) => within(a.completedAt, p)).length,
      risksOpened: data.risks.filter((r) => within(r.openedAt, p)).length,
      risksClosed: data.risks.filter((r) => within(r.closedAt, p)).length,
      // Open at the close of the period: raised by then, not yet closed by then.
      risksOpen: data.risks.filter(
        (r) => r.openedAt < p.end && (!r.closedAt || r.closedAt >= p.end),
      ).length,
      tasksCompleted: data.tasks.filter((t) => within(t.completedAt, p)).length,
      tasksBreached: data.tasks.filter((t) => within(t.breachedAt, p)).length,
      acceptancesGranted: data.acceptances.filter((a) => within(a.createdAt, p)).length,
      // An acceptance that was revoked did not expire; it was withdrawn, which
      // is a different event and belongs in a different count.
      acceptancesExpired: data.acceptances.filter(
        (a) => !a.revokedAt && within(a.expiresAt, p),
      ).length,
      daysToDecide: median(decided.map((d) => Math.max(0, Math.round(d)))),
    };
  });
}

export async function trendFor(
  organisationId: string,
  entityIds: string[] | null,
  months = 12,
  now = new Date(),
): Promise<{ periods: Period[]; points: TrendPoint[] }> {
  const periods = monthsEnding(now, months);
  const inScope = entityIds === null ? null : entityIds.length ? entityIds : [""];

  const riskScope = inScope
    ? and(eq(risks.organisationId, organisationId), inArray(risks.entityId, inScope))
    : eq(risks.organisationId, organisationId);
  const assessmentScope = inScope
    ? and(eq(assessments.organisationId, organisationId), inArray(assessments.entityId, inScope))
    : eq(assessments.organisationId, organisationId);
  const taskScope = inScope
    ? and(eq(tasks.organisationId, organisationId), inArray(tasks.entityId, inScope))
    : eq(tasks.organisationId, organisationId);

  const [riskRows, assessmentRows, taskRows, acceptanceRows] = await Promise.all([
    db
      .select({ openedAt: risks.openedAt, closedAt: risks.closedAt })
      .from(risks)
      .where(riskScope),
    db
      .select({
        createdAt: assessments.createdAt,
        submittedAt: assessments.submittedAt,
        completedAt: assessments.completedAt,
      })
      .from(assessments)
      .where(assessmentScope),
    db
      .select({ completedAt: tasks.completedAt, breachedAt: tasks.breachedAt })
      .from(tasks)
      .where(taskScope),
    db
      .select({
        createdAt: riskAcceptances.createdAt,
        expiresAt: riskAcceptances.expiresAt,
        revokedAt: riskAcceptances.revokedAt,
      })
      .from(riskAcceptances)
      .innerJoin(risks, eq(risks.id, riskAcceptances.riskId))
      .where(and(riskScope, isNotNull(riskAcceptances.createdAt))),
  ]);

  return {
    periods,
    points: buildTrend(
      {
        risks: riskRows,
        assessments: assessmentRows,
        tasks: taskRows,
        acceptances: acceptanceRows,
      },
      periods,
    ),
  };
}

/** The earliest thing on record, so a chart can say how much history it has. */
export function historyFrom(points: readonly TrendPoint[]): string | null {
  const first = points.find(
    (p) =>
      p.assessmentsStarted + p.risksOpened + p.tasksCompleted + p.acceptancesGranted > 0,
  );
  return first?.period ?? null;
}
