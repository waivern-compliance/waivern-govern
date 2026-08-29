import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiUseCases,
  assessments,
  mitigations,
  riskAcceptances,
  risks,
  templateVersions,
  templates,
} from "@/db/schema";
import { LIVE_STAGES, type LifecycleStage } from "./ai-register";

/**
 * The chain from an AI system to what was done about it.
 *
 * Not a picture of the link table. The relationships that matter are already
 * foreign keys — an assessment names its subject, a risk names the assessment
 * that raised it, a mitigation names its risk — and `record_link` only ever
 * carries what an integration declared. A graph drawn from that table alone
 * would be empty on a deployment where nobody has pushed evidence.
 *
 * The useful output is not the drawing. It is where the chain stops: a system
 * running with nothing assessing it, an assessment that never finished, a risk
 * nobody treated, an acceptance that quietly expired.
 */

export type ChainBreak =
  | "no_assessment"
  | "assessment_unfinished"
  | "risk_untreated"
  | "acceptance_lapsed";

export const BREAK_WORDS: Record<ChainBreak, string> = {
  no_assessment: "Nothing assesses this",
  assessment_unfinished: "Assessment never finished",
  risk_untreated: "Risk with no treatment",
  acceptance_lapsed: "Acceptance expired",
};

/** A mitigation that is only planned is not yet treatment. */
const TREATING = ["in_progress", "implemented", "verified"];

export type ChainRisk = {
  risk: typeof risks.$inferSelect;
  mitigations: (typeof mitigations.$inferSelect)[];
  acceptance: typeof riskAcceptances.$inferSelect | null;
  treated: boolean;
};

export type ChainAssessment = {
  assessment: typeof assessments.$inferSelect;
  templateName: string;
  risks: ChainRisk[];
};

export type Chain = {
  useCase: typeof aiUseCases.$inferSelect;
  live: boolean;
  assessments: ChainAssessment[];
  breaks: ChainBreak[];
  /** Breaks that matter now, because the system is running. */
  seriousBreaks: ChainBreak[];
};

export function chainBreaks(
  chain: Omit<Chain, "breaks" | "seriousBreaks">,
  now = new Date(),
): { breaks: ChainBreak[]; seriousBreaks: ChainBreak[] } {
  const breaks: ChainBreak[] = [];
  const serious = new Set<ChainBreak>();

  if (chain.assessments.length === 0) {
    breaks.push("no_assessment");
    // A proposal nobody has assessed yet is a queue. A system in pilot or
    // production with nothing assessing it is a different sentence.
    if (chain.live) serious.add("no_assessment");
  } else if (!chain.assessments.some((a) => a.assessment.status === "approved")) {
    breaks.push("assessment_unfinished");
    if (chain.live) serious.add("assessment_unfinished");
  }

  const allRisks = chain.assessments.flatMap((a) => a.risks);

  const untreated = allRisks.filter((r) => r.risk.status !== "closed" && !r.treated);
  if (untreated.length > 0) {
    breaks.push("risk_untreated");
    // An untreated low risk is a backlog. An untreated severe one is the thing
    // the assessment existed to find.
    if (untreated.some((r) => r.risk.residualTier === "high" || r.risk.residualTier === "critical")) {
      serious.add("risk_untreated");
    }
  }

  const lapsed = allRisks.filter(
    (r) => r.acceptance && r.acceptance.expiresAt <= now && r.risk.status !== "closed",
  );
  if (lapsed.length > 0) {
    breaks.push("acceptance_lapsed");
    // An expired acceptance is an unaccepted risk still running, whatever the
    // status column says.
    serious.add("acceptance_lapsed");
  }

  return { breaks, seriousBreaks: [...serious] };
}

export async function aiChains(
  organisationId: string,
  entityIds: string[] | null,
): Promise<Chain[]> {
  const scope =
    entityIds === null
      ? eq(aiUseCases.organisationId, organisationId)
      : and(
          eq(aiUseCases.organisationId, organisationId),
          inArray(aiUseCases.entityId, entityIds.length ? entityIds : [""]),
        );

  // Retired systems are history, not a gap somebody should chase.
  const cases = await db
    .select()
    .from(aiUseCases)
    .where(and(scope, isNull(aiUseCases.retiredAt)))
    .orderBy(asc(aiUseCases.reference));
  if (cases.length === 0) return [];

  const caseIds = cases.map((c) => c.id);
  const covering = await db
    .select({ assessment: assessments, templateName: templates.name })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(assessments.subjectType, "ai_use_case"),
        inArray(assessments.subjectId, caseIds),
      ),
    )
    .orderBy(desc(assessments.createdAt));

  const assessmentIds = covering.map((c) => c.assessment.id);
  const raised = assessmentIds.length
    ? await db.select().from(risks).where(inArray(risks.assessmentId, assessmentIds))
    : [];

  const riskIds = raised.map((r) => r.id);
  const [treatments, acceptances] = await Promise.all([
    riskIds.length
      ? db.select().from(mitigations).where(inArray(mitigations.riskId, riskIds))
      : Promise.resolve([]),
    riskIds.length
      ? db
          .select()
          .from(riskAcceptances)
          .where(inArray(riskAcceptances.riskId, riskIds))
          .orderBy(desc(riskAcceptances.expiresAt))
      : Promise.resolve([]),
  ]);

  const byRisk = new Map<string, (typeof mitigations.$inferSelect)[]>();
  for (const m of treatments) {
    const list = byRisk.get(m.riskId) ?? [];
    list.push(m);
    byRisk.set(m.riskId, list);
  }
  // Latest expiry wins: that is the acceptance actually in force.
  const acceptanceByRisk = new Map<string, typeof riskAcceptances.$inferSelect>();
  for (const a of acceptances) if (!acceptanceByRisk.has(a.riskId)) acceptanceByRisk.set(a.riskId, a);

  const risksByAssessment = new Map<string, ChainRisk[]>();
  const now = new Date();
  for (const risk of raised) {
    if (!risk.assessmentId) continue;
    const own = byRisk.get(risk.id) ?? [];
    const acceptance = acceptanceByRisk.get(risk.id) ?? null;
    const list = risksByAssessment.get(risk.assessmentId) ?? [];
    list.push({
      risk,
      mitigations: own,
      acceptance,
      treated:
        own.some((m) => TREATING.includes(m.status)) ||
        Boolean(acceptance && acceptance.expiresAt > now),
    });
    risksByAssessment.set(risk.assessmentId, list);
  }

  const byCase = new Map<string, ChainAssessment[]>();
  for (const { assessment, templateName } of covering) {
    if (!assessment.subjectId) continue;
    const list = byCase.get(assessment.subjectId) ?? [];
    list.push({ assessment, templateName, risks: risksByAssessment.get(assessment.id) ?? [] });
    byCase.set(assessment.subjectId, list);
  }

  return cases.map((useCase) => {
    const partial = {
      useCase,
      live: LIVE_STAGES.includes(useCase.lifecycleStage as LifecycleStage),
      assessments: byCase.get(useCase.id) ?? [],
    };
    return { ...partial, ...chainBreaks(partial, now) };
  });
}

export function coverage(chains: readonly Chain[]) {
  return {
    total: chains.length,
    live: chains.filter((c) => c.live).length,
    unbroken: chains.filter((c) => c.breaks.length === 0).length,
    serious: chains.filter((c) => c.seriousBreaks.length > 0).length,
    unassessed: chains.filter((c) => c.breaks.includes("no_assessment")).length,
    risks: chains.reduce(
      (n, c) => n + c.assessments.reduce((m, a) => m + a.risks.length, 0),
      0,
    ),
    untreated: chains.reduce(
      (n, c) =>
        n +
        c.assessments.reduce(
          (m, a) => m + a.risks.filter((r) => !r.treated && r.risk.status !== "closed").length,
          0,
        ),
      0,
    ),
  };
}
