import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessments,
  mitigations,
  risks,
  templateVersions,
  templates,
} from "@/db/schema";
import type { ActiveSession } from "@/lib/session";
import { visibleEntityIds } from "@/lib/session";
import { openTasks } from "@/services/workflow";

/** Tasks that reach this person, however they reach them. */
export function myTasks(active: ActiveSession) {
  return openTasks(active.membership.organisationId, {
    entityIds: visibleEntityIds(active),
    userId: active.userId,
    grants: active.membership.grants,
  });
}

/** Assessments this person started or owns — what a product manager asked for. */
export async function myAssessments(active: ActiveSession) {
  return db
    .select({ assessment: assessments, kind: templates.kind, templateName: templates.name })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(assessments.organisationId, active.membership.organisationId),
        eq(assessments.ownerId, active.userId),
      ),
    )
    .orderBy(desc(assessments.updatedAt))
    .limit(25);
}

/** Controls this person is on the hook for. */
export async function myMitigations(active: ActiveSession) {
  return db
    .select({ mitigation: mitigations, risk: risks })
    .from(mitigations)
    .innerJoin(risks, eq(risks.id, mitigations.riskId))
    .where(
      and(
        eq(risks.organisationId, active.membership.organisationId),
        eq(mitigations.ownerId, active.userId),
        inArray(mitigations.status, ["planned", "in_progress", "implemented"]),
      ),
    )
    .orderBy(mitigations.dueAt)
    .limit(25);
}

/**
 * AI risk assessments and the risks they raised.
 *
 * A stand-in for the AI use case register, which does not exist yet. It answers
 * "what AI has been assessed" but cannot answer "what AI is running that nobody
 * has assessed" — which is the more important question, and the reason the
 * register is the next thing to build.
 */
export async function aiEstate(active: ActiveSession) {
  const entityIds = visibleEntityIds(active);
  const scope = entityIds === null
    ? eq(assessments.organisationId, active.membership.organisationId)
    : and(
        eq(assessments.organisationId, active.membership.organisationId),
        inArray(assessments.entityId, entityIds.length ? entityIds : [""]),
      );

  const [aiAssessments, aiRisks] = await Promise.all([
    db
      .select({ assessment: assessments })
      .from(assessments)
      .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(and(scope, eq(templates.kind, "ai_risk")))
      .orderBy(desc(assessments.updatedAt)),
    db
      .select({ risk: risks, assessment: assessments })
      .from(risks)
      .innerJoin(assessments, eq(assessments.id, risks.assessmentId))
      .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(
        and(
          eq(risks.organisationId, active.membership.organisationId),
          eq(templates.kind, "ai_risk"),
          ne(risks.status, "closed"),
        ),
      ),
  ]);

  return {
    assessments: aiAssessments.map((a) => a.assessment),
    risks: aiRisks.map((r) => r.risk),
    awaitingDecision: aiAssessments.filter((a) =>
      ["in_review", "returned"].includes(a.assessment.status),
    ).length,
    unrated: aiRisks.filter((r) => r.risk.residualTier === null).length,
  };
}

/** Risks nobody has rated for residual — the ones a register quietly hides. */
export async function unratedRisks(active: ActiveSession) {
  const entityIds = visibleEntityIds(active);
  return db
    .select()
    .from(risks)
    .where(
      and(
        eq(risks.organisationId, active.membership.organisationId),
        entityIds === null
          ? undefined
          : inArray(risks.entityId, entityIds.length ? entityIds : [""]),
        isNull(risks.residualTier),
        ne(risks.status, "closed"),
      ),
    )
    .orderBy(desc(risks.inherentScore))
    .limit(10);
}
