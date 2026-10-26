import { and, eq, inArray, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiIncidents,
  aiUseCases,
  assessments,
  mitigations,
  riskAcceptances,
  risks,
  users,
} from "@/db/schema";
import { judge, scopeLabel, type AppetiteJudgement } from "@/lib/risk/appetite";
import { AI_RISK_CATEGORIES, categoryLabel } from "@/lib/risk/categories";
import { tierRank, type RiskTier } from "@/lib/risk/scale";
import { TREATMENT_LABEL, type TreatmentType } from "@/lib/risk/treatment";
import { appetiteInForce } from "./appetite-in-force";

/**
 * The risk picture for AI systems: one system at a time, and the whole
 * organisation's AI risk log.
 *
 * A risk belongs to a system when it was raised from one of the system's
 * assessments, or when an incident about the system was tied to it. Both are
 * links somebody made; nothing here infers that a risk is about a system from
 * its wording.
 */

type RiskRow = typeof risks.$inferSelect;

/** Which AI system each risk belongs to, for every risk that belongs to one. */
async function riskOwnership(organisationId: string, useCaseIds?: string[]) {
  const [fromAssessments, fromIncidents] = await Promise.all([
    db
      .select({ riskId: risks.id, useCaseId: assessments.subjectId })
      .from(risks)
      .innerJoin(assessments, eq(assessments.id, risks.assessmentId))
      .where(
        and(
          eq(risks.organisationId, organisationId),
          eq(assessments.subjectType, "ai_use_case"),
          useCaseIds ? inArray(assessments.subjectId, useCaseIds) : undefined,
        ),
      ),
    db
      .select({ riskId: aiIncidents.linkedRiskId, useCaseId: aiIncidents.aiUseCaseId })
      .from(aiIncidents)
      .where(
        and(
          eq(aiIncidents.organisationId, organisationId),
          isNotNull(aiIncidents.linkedRiskId),
          isNotNull(aiIncidents.aiUseCaseId),
          useCaseIds ? inArray(aiIncidents.aiUseCaseId, useCaseIds) : undefined,
        ),
      ),
  ]);
  const owner = new Map<string, Set<string>>();
  for (const { riskId, useCaseId } of [...fromAssessments, ...fromIncidents]) {
    if (!riskId || !useCaseId) continue;
    owner.set(riskId, (owner.get(riskId) ?? new Set()).add(useCaseId));
  }
  return owner;
}

export type ProfiledRisk = {
  risk: RiskRow;
  ownerEmail: string | null;
  treatments: Array<typeof mitigations.$inferSelect>;
  acceptance: typeof riskAcceptances.$inferSelect | null;
  /** The acceptance in force has passed its expiry. */
  lapsed: boolean;
  appetite: AppetiteJudgement;
};

async function profile(riskRows: RiskRow[], organisationId: string): Promise<ProfiledRisk[]> {
  if (riskRows.length === 0) return [];
  const ids = riskRows.map((r) => r.id);
  const ownerIds = [...new Set(riskRows.map((r) => r.ownerId).filter((x): x is string => x !== null))];
  const [treatments, acceptances, owners, inForce] = await Promise.all([
    db.select().from(mitigations).where(inArray(mitigations.riskId, ids)).orderBy(mitigations.createdAt),
    db
      .select()
      .from(riskAcceptances)
      .where(
        and(
          inArray(riskAcceptances.riskId, ids),
          isNull(riskAcceptances.supersededAt),
          isNull(riskAcceptances.revokedAt),
        ),
      ),
    ownerIds.length
      ? db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, ownerIds))
      : Promise.resolve([] as Array<{ id: string; email: string }>),
    appetiteInForce(organisationId),
  ]);
  const email = new Map(owners.map((o) => [o.id, o.email]));
  const now = Date.now();
  return riskRows.map((risk) => {
    const acceptance = acceptances.find((a) => a.riskId === risk.id) ?? null;
    return {
      risk,
      ownerEmail: risk.ownerId ? (email.get(risk.ownerId) ?? null) : null,
      treatments: treatments.filter((t) => t.riskId === risk.id),
      acceptance,
      lapsed: acceptance !== null && acceptance.expiresAt.getTime() <= now,
      appetite: judge(
        { category: risk.category, residualTier: risk.residualTier as RiskTier | null, status: risk.status },
        inForce,
      ),
    };
  });
}

export type CategoryLine = {
  category: string;
  label: string;
  open: number;
  worstInherent: RiskTier | null;
  worstResidual: RiskTier | null;
  outside: number;
  unrated: number;
  /** What the category is judged against, in words. */
  appetite: string;
};

function worst(tiers: Array<RiskTier | null>): RiskTier | null {
  return tiers.reduce<RiskTier | null>(
    (w, t) => (t === null ? w : w === null || tierRank(t) > tierRank(w) ? t : w),
    null,
  );
}

/**
 * One system's risk profile: every risk that belongs to it, judged against
 * appetite, and the same grouped by the toolkit's categories — which is the
 * view DSIT's AI risk monitoring dashboard gives.
 */
export async function riskProfileFor(useCaseId: string, organisationId: string) {
  const owner = await riskOwnership(organisationId, [useCaseId]);
  const riskIds = [...owner.keys()];
  const rows = riskIds.length
    ? await db
        .select()
        .from(risks)
        .where(and(eq(risks.organisationId, organisationId), inArray(risks.id, riskIds)))
    : [];
  const profiled = (await profile(rows, organisationId)).sort(
    (a, b) => b.risk.inherentScore - a.risk.inherentScore,
  );
  const open = profiled.filter((p) => p.risk.status !== "closed");

  const categories = [
    ...AI_RISK_CATEGORIES.map((c) => c.value as string),
    // Anything filed outside the toolkit's list still has to appear somewhere.
    ...new Set(open.map((p) => p.risk.category ?? "").filter((c) => !AI_RISK_CATEGORIES.some((k) => k.value === c))),
  ];
  const byCategory: CategoryLine[] = categories.map((category) => {
    const here = open.filter((p) => (p.risk.category ?? "") === category);
    const basis = here[0]?.appetite;
    return {
      category,
      label: category === "" ? "No category" : (categoryLabel(category) ?? category),
      open: here.length,
      worstInherent: worst(here.map((p) => p.risk.inherentTier as RiskTier)),
      worstResidual: worst(here.map((p) => p.risk.residualTier as RiskTier | null)),
      outside: here.filter((p) => p.appetite.state === "outside").length,
      unrated: here.filter((p) => p.appetite.state === "unrated").length,
      appetite:
        basis && basis.state !== "closed"
          ? basis.basis.source === "platform"
            ? `no appetite signed off — residual up to ${basis.basis.toleratedTier}`
            : `${basis.basis.source === "category" ? scopeLabel(basis.basis.scope) : "organisation default"}: up to ${basis.basis.toleratedTier}`
          : "",
    };
  });

  return {
    risks: profiled,
    byCategory,
    totals: {
      open: open.length,
      outside: open.filter((p) => p.appetite.state === "outside").length,
      unrated: open.filter((p) => p.appetite.state === "unrated").length,
      accepted: open.filter((p) => p.acceptance !== null).length,
      lapsed: open.filter((p) => p.lapsed).length,
      untreated: open.filter((p) => p.treatments.filter((t) => t.status !== "abandoned").length === 0 && !p.acceptance).length,
    },
  };
}

/**
 * Every AI risk, across every system, as one flat log.
 *
 * DSIT's toolkit asks departments to keep a central log of AI risks and share
 * it with GDS and DSIT's central AI risk team, so common risks can be mapped
 * across government. This is that log: one row per risk per system, with the
 * scale it was rated on, appetite, treatment and acceptance alongside.
 */
export async function aiRiskLog(organisationId: string, entityIds: string[] | null) {
  const owner = await riskOwnership(organisationId);
  const riskIds = [...owner.keys()];
  if (riskIds.length === 0) return [];

  const [rows, systems] = await Promise.all([
    db
      .select()
      .from(risks)
      .where(
        and(
          eq(risks.organisationId, organisationId),
          inArray(risks.id, riskIds),
          entityIds === null ? undefined : inArray(risks.entityId, entityIds),
        ),
      ),
    db.select().from(aiUseCases).where(eq(aiUseCases.organisationId, organisationId)),
  ]);
  const systemById = new Map(systems.map((s) => [s.id, s]));
  const profiled = await profile(rows, organisationId);

  return profiled.flatMap((p) =>
    [...(owner.get(p.risk.id) ?? [])]
      .map((id) => systemById.get(id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .map((system) => ({ system, ...p })),
  ).sort(
    (a, b) =>
      a.system.reference.localeCompare(b.system.reference) || b.risk.inherentScore - a.risk.inherentScore,
  );
}

/** A treatment, in words, for a flat file. */
export function treatmentWords(t: typeof mitigations.$inferSelect): string {
  const kind = t.treatmentType ? `${TREATMENT_LABEL[t.treatmentType as TreatmentType]}: ` : "";
  return `${kind}${t.description} [${t.status.replace(/_/g, " ")}]`;
}
