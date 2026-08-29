import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvals,
  assessmentRevisions,
  assessments,
  dpas,
  entities,
  evidence,
  mitigations,
  organisations,
  processingActivities,
  recordLinks,
  riskAcceptances,
  risks,
  suppliers,
  templateVersions,
  templates,
} from "@/db/schema";

/**
 * What Waivern Govern hands back.
 *
 * The Portal generates documents from confirmed facts, so this exports the
 * facts rather than the tables: an assessment appears once it has been
 * approved, with who approved it and why; a risk appears with its residual
 * rating and, where one exists, the named person carrying it and until when.
 *
 * Nothing in flight is exported. A draft assessment is somebody's unfinished
 * work, and generating a compliance document from it would put an unreviewed
 * claim into a document that reads as settled.
 */

export const CONTEXT_VERSION = "1.0";

export type ExportScope = {
  organisationId: string;
  /** Entity names or references. Omitted means every entity. */
  entities?: string[];
  /** Only records changed after this instant, for incremental sync. */
  since?: Date;
  limit?: number;
};

export type GovernanceContext = {
  contextVersion: string;
  generatedAt: string;
  organisation: { name: string; slug: string };
  entities: Array<{ name: string; legalEntityRef: string | null }>;
  /** Present when the caller asked for a slice, so the Portal knows it has one. */
  scope: { entities: string[] | null; since: string | null };
  processingActivities: ContextActivity[];
  assessments: ContextAssessment[];
  risks: ContextRisk[];
  suppliers: ContextSupplier[];
  evidence: ContextEvidence[];
  counts: Record<string, number>;
};

export type ContextActivity = {
  reference: string;
  entity: string;
  name: string;
  description: string | null;
  purposes: string[];
  lawfulBasis: string | null;
  dataCategories: string[];
  subjectCategories: string[];
  recipients: string[];
  systems: string[];
  transfers: Array<{ country: string; mechanism?: string }>;
  retention: string | null;
  /** Article 30(1)(g) — a general description of the measures. */
  securityMeasures: string | null;
  controllerRole: string | null;
  /** Article 30(2)(a) — named when this organisation acts as processor. */
  controllerName: string | null;
  updatedAt: string;
};

export type ContextAssessment = {
  reference: string;
  entity: string;
  title: string;
  kind: string;
  templateName: string;
  templateVersion: number;
  status: string;
  score: { value: number; band: string; tier: string } | null;
  approvedAt: string | null;
  /** Who signed, at which stage, and on what reasoning. */
  approvals: Array<{
    stage: string;
    decision: string;
    by: string | null;
    at: string | null;
    rationale: string | null;
    /** Why the stage applied, or why it did not. */
    reason: string;
  }>;
  /** The answers as they stood when it was approved, from the frozen snapshot. */
  answers: Record<string, unknown>;
  /** Questions that were not being asked, so a reader knows what is absent and why. */
  notApplicable: string[];
};

export type ContextRisk = {
  reference: string;
  entity: string;
  title: string;
  description: string;
  status: string;
  inherent: { likelihood: number; impact: number; score: number; tier: string };
  residual: { likelihood: number; impact: number; score: number; tier: string } | null;
  mitigations: Array<{
    description: string;
    controlRef: string | null;
    status: string;
    dueAt: string | null;
    verifiedAt: string | null;
  }>;
  acceptance: {
    acceptedBy: string;
    rationale: string;
    residualAtAcceptance: { score: number; tier: string };
    expiresAt: string;
    expired: boolean;
  } | null;
  raisedFrom: string | null;
};

export type ContextSupplier = {
  name: string;
  categories: string[];
  dpas: Array<{
    title: string;
    documentRef: string | null;
    signedAt: string | null;
    expiresAt: string | null;
    transferMechanism: string | null;
    subProcessors: string[];
  }>;
};

export type ContextEvidence = {
  title: string;
  kind: string;
  entity: string;
  uri: string | null;
  sha256: string | null;
  collectedAt: string | null;
  /** References of the records this evidence supports. */
  supports: string[];
};

const DEFAULT_LIMIT = 500;

async function resolveEntities(organisationId: string, named?: string[]) {
  const all = await db
    .select()
    .from(entities)
    .where(eq(entities.organisationId, organisationId));
  if (!named || named.length === 0) return { all, selected: all };
  const selected = all.filter(
    (e) => named.includes(e.name) || (e.legalEntityRef && named.includes(e.legalEntityRef)),
  );
  return { all, selected };
}

export async function governanceContext(scope: ExportScope): Promise<GovernanceContext> {
  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, scope.organisationId));
  if (!org) throw new Error("No such organisation");

  const { all, selected } = await resolveEntities(scope.organisationId, scope.entities);
  const entityIds = selected.map((e) => e.id);
  const nameOf = new Map(all.map((e) => [e.id, e.name]));
  const limit = Math.min(scope.limit ?? DEFAULT_LIMIT, 1000);
  const inScope = entityIds.length > 0 ? entityIds : [""];

  const activityRows = await db
    .select()
    .from(processingActivities)
    .where(
      and(
        eq(processingActivities.organisationId, scope.organisationId),
        inArray(processingActivities.entityId, inScope),
        scope.since ? gt(processingActivities.updatedAt, scope.since) : undefined,
      ),
    )
    .orderBy(asc(processingActivities.reference))
    .limit(limit);

  // Only approved assessments. A draft is unfinished work, and a document
  // generated from one would read as settled when it is not.
  const assessmentRows = await db
    .select({ assessment: assessments, template: templates, version: templateVersions })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(assessments.organisationId, scope.organisationId),
        inArray(assessments.entityId, inScope),
        eq(assessments.status, "approved"),
        scope.since ? gt(assessments.updatedAt, scope.since) : undefined,
      ),
    )
    .orderBy(desc(assessments.completedAt))
    .limit(limit);

  const contextAssessments: ContextAssessment[] = [];
  for (const row of assessmentRows) {
    const [gates, revisions] = await Promise.all([
      db
        .select()
        .from(approvals)
        .where(eq(approvals.assessmentId, row.assessment.id))
        .orderBy(asc(approvals.position)),
      db
        .select()
        .from(assessmentRevisions)
        .where(eq(assessmentRevisions.assessmentId, row.assessment.id))
        .orderBy(desc(assessmentRevisions.revision))
        .limit(1),
    ]);

    // The frozen snapshot, not the live answers: it is what was approved, and
    // it carries the evaluation so absent questions can be explained.
    const snapshot = revisions[0];
    const evaluation = snapshot?.evaluation;
    const notApplicable = evaluation
      ? Object.values(evaluation.questions)
          .filter((q) => !q.visible)
          .map((q) => q.key)
      : [];

    contextAssessments.push({
      reference: row.assessment.reference,
      entity: nameOf.get(row.assessment.entityId) ?? "",
      title: row.assessment.title,
      kind: row.template.kind,
      templateName: row.template.name,
      templateVersion: row.version.version,
      status: row.assessment.status,
      score:
        row.assessment.scoreValue !== null && row.assessment.scoreBand && row.assessment.scoreTier
          ? {
              value: row.assessment.scoreValue,
              band: row.assessment.scoreBand,
              tier: row.assessment.scoreTier,
            }
          : null,
      approvedAt: row.assessment.completedAt?.toISOString() ?? null,
      approvals: gates.map((g) => ({
        stage: g.name,
        decision: g.status,
        by: g.decidedByLabel,
        at: g.decidedAt?.toISOString() ?? null,
        rationale: g.rationale,
        reason: g.reason,
      })),
      answers: (snapshot?.answers ?? {}) as Record<string, unknown>,
      notApplicable,
    });
  }

  const riskRows = await db
    .select()
    .from(risks)
    .where(
      and(
        eq(risks.organisationId, scope.organisationId),
        inArray(risks.entityId, inScope),
        scope.since ? gt(risks.updatedAt, scope.since) : undefined,
      ),
    )
    .orderBy(asc(risks.reference))
    .limit(limit);

  const contextRisks: ContextRisk[] = [];
  for (const r of riskRows) {
    const [treatments, live, from] = await Promise.all([
      db.select().from(mitigations).where(eq(mitigations.riskId, r.id)),
      db
        .select()
        .from(riskAcceptances)
        .where(
          and(
            eq(riskAcceptances.riskId, r.id),
            isNull(riskAcceptances.supersededAt),
            isNull(riskAcceptances.revokedAt),
          ),
        ),
      r.assessmentId
        ? db
            .select({ reference: assessments.reference })
            .from(assessments)
            .where(eq(assessments.id, r.assessmentId))
        : Promise.resolve([]),
    ]);

    const acceptance = live[0];
    contextRisks.push({
      reference: r.reference,
      entity: nameOf.get(r.entityId) ?? "",
      title: r.title,
      description: r.description,
      status: r.status,
      inherent: {
        likelihood: r.inherentLikelihood,
        impact: r.inherentImpact,
        score: r.inherentScore,
        tier: r.inherentTier,
      },
      residual:
        r.residualLikelihood !== null && r.residualTier
          ? {
              likelihood: r.residualLikelihood,
              impact: r.residualImpact!,
              score: r.residualScore!,
              tier: r.residualTier,
            }
          : null,
      mitigations: treatments.map((m) => ({
        description: m.description,
        controlRef: m.controlRef,
        status: m.status,
        dueAt: m.dueAt?.toISOString() ?? null,
        verifiedAt: m.verifiedAt?.toISOString() ?? null,
      })),
      acceptance: acceptance
        ? {
            acceptedBy: acceptance.acceptedByLabel,
            rationale: acceptance.rationale,
            residualAtAcceptance: {
              score: acceptance.residualScoreAtAcceptance,
              tier: acceptance.residualTierAtAcceptance,
            },
            expiresAt: acceptance.expiresAt.toISOString(),
            // Stated rather than left for the reader to work out, so a document
            // generated from this cannot present a lapsed acceptance as current.
            expired: acceptance.expiresAt.getTime() <= Date.now(),
          }
        : null,
      raisedFrom: from[0]?.reference ?? null,
    });
  }

  const supplierRows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.organisationId, scope.organisationId))
    .orderBy(asc(suppliers.name))
    .limit(limit);
  const dpaRows = supplierRows.length
    ? await db
        .select()
        .from(dpas)
        .where(
          inArray(
            dpas.supplierId,
            supplierRows.map((s) => s.id),
          ),
        )
    : [];

  const evidenceRows = await db
    .select()
    .from(evidence)
    .where(
      and(
        eq(evidence.organisationId, scope.organisationId),
        inArray(evidence.entityId, inScope),
        scope.since ? gt(evidence.createdAt, scope.since) : undefined,
      ),
    )
    .orderBy(desc(evidence.createdAt))
    .limit(limit);

  // Resolve each edge to the reference a reader would recognise, rather than
  // exporting internal ids the Portal has no way to interpret.
  const links = evidenceRows.length
    ? await db
        .select()
        .from(recordLinks)
        .where(
          and(
            eq(recordLinks.organisationId, scope.organisationId),
            inArray(
              recordLinks.fromId,
              evidenceRows.map((e) => e.id),
            ),
          ),
        )
    : [];
  const referenceOf = new Map<string, string>([
    ...activityRows.map((a) => [a.id, a.reference] as const),
    ...assessmentRows.map((a) => [a.assessment.id, a.assessment.reference] as const),
    ...riskRows.map((r) => [r.id, r.reference] as const),
  ]);

  return {
    contextVersion: CONTEXT_VERSION,
    generatedAt: new Date().toISOString(),
    organisation: { name: org.name, slug: org.slug },
    entities: selected.map((e) => ({ name: e.name, legalEntityRef: e.legalEntityRef })),
    scope: {
      entities: scope.entities?.length ? scope.entities : null,
      since: scope.since?.toISOString() ?? null,
    },
    processingActivities: activityRows.map((a) => ({
      reference: a.reference,
      entity: nameOf.get(a.entityId) ?? "",
      name: a.name,
      description: a.description,
      purposes: a.purposes,
      lawfulBasis: a.lawfulBasis,
      dataCategories: a.dataCategories,
      subjectCategories: a.subjectCategories,
      recipients: a.recipients,
      systems: a.systems,
      transfers: a.transfers,
      retention: a.retention,
      securityMeasures: a.securityMeasures,
      controllerRole: a.controllerRole,
      controllerName: a.controllerName,
      updatedAt: a.updatedAt.toISOString(),
    })),
    assessments: contextAssessments,
    risks: contextRisks,
    suppliers: supplierRows.map((s) => ({
      name: s.name,
      categories: s.categories,
      dpas: dpaRows
        .filter((d) => d.supplierId === s.id)
        .map((d) => ({
          title: d.title,
          documentRef: d.documentRef,
          signedAt: d.signedAt?.toISOString() ?? null,
          expiresAt: d.expiresAt?.toISOString() ?? null,
          transferMechanism: d.transferMechanism,
          subProcessors: d.subProcessors,
        })),
    })),
    evidence: evidenceRows.map((e) => ({
      title: e.title,
      kind: e.kind,
      entity: nameOf.get(e.entityId) ?? "",
      uri: e.uri,
      sha256: e.sha256,
      collectedAt: e.collectedAt?.toISOString() ?? null,
      supports: links
        .filter((l) => l.fromId === e.id)
        .map((l) => referenceOf.get(l.toId))
        .filter((x): x is string => Boolean(x)),
    })),
    counts: {
      processingActivities: activityRows.length,
      assessments: contextAssessments.length,
      risks: contextRisks.length,
      suppliers: supplierRows.length,
      evidence: evidenceRows.length,
    },
  };
}
