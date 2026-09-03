import { and, count, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvals,
  assessments,
  entities,
  riskAcceptances,
  risks,
  tasks,
  templateVersions,
  templates,
} from "@/db/schema";
import type { RiskTier } from "@/lib/risk/scale";

/**
 * Everything the dashboard shows, in one round of queries.
 *
 * Counted from the records rather than kept in a summary table: a governance
 * dashboard that can disagree with the register it summarises is worse than no
 * dashboard, and at this volume the cost of counting honestly is nothing.
 */

export type TierCount = { tier: RiskTier; label: string; inherent: number; residual: number };

export type DashboardMetrics = {
  attention: {
    /** Assessments sitting in review — the same population the pipeline shows. */
    awaitingDecision: number;
    /** Approval gates open across those assessments. */
    openGates: number;
    overdueTasks: number;
    /**
     * Risks that cannot be shown to be within appetite: residual high or
     * critical, plus any risk nobody has rated for residual yet.
     */
    notWithinAppetite: number;
    lapsedAcceptances: number;
    /**
     * Approved assessments past their review date.
     *
     * Counted for everybody who can read them, not only for whoever they are
     * assigned to: an assessment nobody has confirmed is still true is an
     * organisational exposure rather than one person's outstanding task.
     */
    reviewsOverdue: number;
  };
  riskPosture: TierCount[];
  /** Risks rated but not yet accepted, closed or mitigated. */
  unratedRisks: number;
  pipeline: Array<{ status: string; label: string; count: number }>;
  byKind: Array<{ kind: string; label: string; count: number; critical: number }>;
  sla: { onTime: number; dueSoon: number; overdue: number };
  byEntity: Array<{
    entityId: string;
    name: string;
    assessments: number;
    openRisks: number;
    openTasks: number;
  }>;
  totals: { assessments: number; risks: number; openTasks: number };
};

const TIERS: Array<{ tier: RiskTier; label: string }> = [
  { tier: "low", label: "Low" },
  { tier: "medium", label: "Medium" },
  { tier: "high", label: "High" },
  { tier: "critical", label: "Critical" },
];

const PIPELINE: Array<{ status: string; label: string }> = [
  { status: "draft", label: "Draft" },
  { status: "in_progress", label: "In progress" },
  { status: "in_review", label: "Awaiting decision" },
  { status: "returned", label: "Returned" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

const KIND_LABEL: Record<string, string> = {
  dpia: "DPIA",
  tra: "Transfer risk",
  tia: "Transfer impact",
  ai_risk: "AI risk",
  screening: "Screening",
  supplier_record: "Supplier",
  breach: "Breach",
  custom: "Custom",
};

/** Above appetite: residual still high or critical after treatment. */
const ABOVE_APPETITE: RiskTier[] = ["high", "critical"];

export async function dashboardMetrics(
  organisationId: string,
  entityIds: string[] | null,
): Promise<DashboardMetrics> {
  const scoped = <T extends { entityId: unknown }>(table: T) =>
    entityIds === null
      ? undefined
      : inArray(table.entityId as never, entityIds.length ? entityIds : [""]);

  const assessmentScope = and(
    eq(assessments.organisationId, organisationId),
    scoped(assessments),
  );
  const riskScope = and(eq(risks.organisationId, organisationId), scoped(risks));
  const taskScope = and(eq(tasks.organisationId, organisationId), scoped(tasks));

  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

  const [
    assessmentRows,
    riskRows,
    taskRows,
    lapsed,
    entityRows,
    kindRows,
    pendingApprovals,
  ] = await Promise.all([
    db
      .select({
        status: assessments.status,
        entityId: assessments.entityId,
        reviewDueAt: assessments.reviewDueAt,
      })
      .from(assessments)
      .where(assessmentScope),
    db
      .select({
        inherentTier: risks.inherentTier,
        residualTier: risks.residualTier,
        status: risks.status,
        entityId: risks.entityId,
      })
      .from(risks)
      .where(riskScope),
    db
      .select({
        status: tasks.status,
        dueAt: tasks.dueAt,
        breachedAt: tasks.breachedAt,
        entityId: tasks.entityId,
      })
      .from(tasks)
      .where(and(taskScope, inArray(tasks.status, ["open", "in_progress"]))),
    db
      .select({ n: count() })
      .from(riskAcceptances)
      .innerJoin(risks, eq(risks.id, riskAcceptances.riskId))
      .where(
        and(
          riskScope,
          isNull(riskAcceptances.supersededAt),
          isNull(riskAcceptances.revokedAt),
          lte(riskAcceptances.expiresAt, now),
        ),
      ),
    db.select().from(entities).where(eq(entities.organisationId, organisationId)),
    db
      .select({
        kind: templates.kind,
        tier: assessments.scoreTier,
      })
      .from(assessments)
      .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(assessmentScope),
    db
      .select({ n: count() })
      .from(approvals)
      .innerJoin(assessments, eq(assessments.id, approvals.assessmentId))
      .where(and(assessmentScope, eq(approvals.status, "pending"))),
  ]);

  const riskPosture: TierCount[] = TIERS.map(({ tier, label }) => ({
    tier,
    label,
    inherent: riskRows.filter((r) => r.inherentTier === tier).length,
    residual: riskRows.filter((r) => r.residualTier === tier).length,
  }));

  const pipeline = PIPELINE.map(({ status, label }) => ({
    status,
    label,
    count: assessmentRows.filter((a) => a.status === status).length,
  }));

  const kinds = [...new Set(kindRows.map((k) => k.kind))];
  const byKind = kinds
    .map((kind) => ({
      kind,
      label: KIND_LABEL[kind] ?? kind,
      count: kindRows.filter((k) => k.kind === kind).length,
      critical: kindRows.filter((k) => k.kind === kind && k.tier === "critical").length,
    }))
    .sort((a, b) => b.count - a.count);

  const overdue = taskRows.filter((t) => t.dueAt && t.dueAt <= now).length;
  const dueSoon = taskRows.filter((t) => t.dueAt && t.dueAt > now && t.dueAt <= soon).length;

  return {
    attention: {
      awaitingDecision: assessmentRows.filter((a) => a.status === "in_review").length,
      openGates: Number(pendingApprovals[0]?.n ?? 0),
      overdueTasks: overdue,
      reviewsOverdue: assessmentRows.filter(
        (a) =>
          a.status === "approved" &&
          a.reviewDueAt !== null &&
          a.reviewDueAt.getTime() <= Date.now(),
      ).length,
      // An unrated risk is not a risk within appetite — it is one nobody has
      // measured. Counting it as "fine" is how a dashboard reassures an
      // executive about exposure that has simply never been looked at.
      notWithinAppetite: riskRows.filter(
        (r) =>
          r.status !== "closed" &&
          (r.residualTier === null ||
            ABOVE_APPETITE.includes(r.residualTier as RiskTier)),
      ).length,
      lapsedAcceptances: Number(lapsed[0]?.n ?? 0),
    },
    riskPosture,
    unratedRisks: riskRows.filter((r) => r.residualTier === null && r.status !== "closed").length,
    pipeline,
    byKind,
    sla: {
      onTime: taskRows.length - overdue - dueSoon,
      dueSoon,
      overdue,
    },
    byEntity: entityRows
      .filter((e) => entityIds === null || entityIds.includes(e.id))
      .map((e) => ({
        entityId: e.id,
        name: e.name,
        assessments: assessmentRows.filter((a) => a.entityId === e.id).length,
        openRisks: riskRows.filter((r) => r.entityId === e.id && r.status !== "closed").length,
        openTasks: taskRows.filter((t) => t.entityId === e.id).length,
      })),
    totals: {
      assessments: assessmentRows.length,
      risks: riskRows.length,
      openTasks: taskRows.length,
    },
  };
}
