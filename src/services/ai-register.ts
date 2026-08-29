import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiUseCases,
  assessmentRevisions,
  assessments,
  referenceCounters,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import type { Actor } from "./templates";

/**
 * The AI register.
 *
 * Two things kept apart on purpose. The register records what exists. The
 * assessment records what somebody judged about it. Where the two would
 * disagree — because a system changed after it was assessed — the register says
 * so rather than quietly showing the newer fact under the older judgement.
 */

export type SystemType = "predictive" | "generative" | "agentic" | "hybrid";
export type Provenance = "built_in_house" | "fine_tuned" | "third_party_api" | "embedded_vendor";
export type LifecycleStage =
  | "proposed" | "development" | "pilot" | "production" | "retiring" | "retired";

export const SYSTEM_TYPE_LABEL: Record<SystemType, string> = {
  predictive: "Predictive / classic ML",
  generative: "Generative",
  agentic: "Agentic",
  hybrid: "Hybrid",
};

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  built_in_house: "Built here",
  fine_tuned: "Third-party model, adapted here",
  third_party_api: "Third-party service",
  embedded_vendor: "Embedded in a bought product",
};

export const STAGE_LABEL: Record<LifecycleStage, string> = {
  proposed: "Proposed",
  development: "In development",
  pilot: "Piloting",
  production: "In production",
  retiring: "Being retired",
  retired: "Retired",
};

/** Stages where the system is actually touching people. */
const LIVE_STAGES: LifecycleStage[] = ["pilot", "production"];

/**
 * The question keys this reads out of an approved AI risk assessment.
 *
 * Coupling to the shipped AI template, and deliberately explicit about it: if a
 * client rewrites their template these stop resolving, and the register says
 * "not recorded" rather than guessing. The alternative — copying the answers
 * into the register at submission — creates a second source of truth that
 * drifts from the judgement somebody actually signed.
 */
const ASSESSMENT_KEYS = {
  consequence: "consequence",
  humanOversight: "human_oversight",
  monitoring: "monitoring",
  biasConsidered: "bias_considered",
  contestability: "contestability",
} as const;

export type AssessedFacts = {
  reference: string;
  approvedAt: Date | null;
  tier: string | null;
  band: string | null;
  consequence: string | null;
  humanOversight: string | null;
  monitoring: string[] | null;
  biasConsidered: string | null;
  contestability: string | null;
};

/** Every reason a use case might need somebody's attention. */
export type Gap =
  | "never_assessed"
  | "assessment_not_approved"
  | "no_owner"
  | "live_without_monitoring"
  | "decides_without_oversight"
  | "bias_not_assessed"
  | "review_overdue";

export const GAP_WORDS: Record<Gap, string> = {
  never_assessed: "Never assessed",
  assessment_not_approved: "Assessment not finished",
  no_owner: "No named owner",
  live_without_monitoring: "Live, nothing monitored",
  decides_without_oversight: "Decides with no human oversight",
  bias_not_assessed: "Bias never assessed",
  review_overdue: "Review overdue",
};

/** Gaps that mean the system is running unexamined, rather than merely untidy. */
export const SERIOUS_GAPS: Gap[] = [
  "never_assessed",
  "live_without_monitoring",
  "decides_without_oversight",
];

export type RegisterEntry = {
  useCase: typeof aiUseCases.$inferSelect;
  ownerEmail: string | null;
  assessed: AssessedFacts | null;
  gaps: Gap[];
};

async function nextReference(organisationId: string, year: number) {
  const rows = await db.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'AI', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `AI-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

export async function createUseCase(input: {
  organisationId: string;
  entityId: string;
  name: string;
  purpose: string;
  description?: string;
  systemType: SystemType;
  provenance: Provenance;
  lifecycleStage?: LifecycleStage;
  vendor?: string;
  modelName?: string;
  ownerId?: string | null;
  deployedIn?: string[];
  processesPersonalData?: boolean;
  nextReviewAt?: Date;
  actor: Actor;
}) {
  const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(aiUseCases)
      .values({
        organisationId: input.organisationId,
        entityId: input.entityId,
        reference,
        name: input.name,
        purpose: input.purpose,
        description: input.description,
        systemType: input.systemType,
        provenance: input.provenance,
        lifecycleStage: input.lifecycleStage ?? "proposed",
        vendor: input.vendor,
        modelName: input.modelName,
        ownerId: input.ownerId ?? null,
        deployedIn: input.deployedIn ?? [],
        processesPersonalData: input.processesPersonalData,
        nextReviewAt: input.nextReviewAt,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "ai_use_case.registered",
      subjectType: "ai_use_case",
      subjectId: row.id,
      entityId: input.entityId,
      after: {
        reference,
        name: row.name,
        systemType: row.systemType,
        lifecycleStage: row.lifecycleStage,
      },
    });

    return row;
  });
}

export async function updateUseCase(input: {
  useCaseId: string;
  organisationId: string;
  changes: Partial<{
    lifecycleStage: LifecycleStage;
    ownerId: string | null;
    vendor: string;
    modelName: string;
    deployedIn: string[];
    processesPersonalData: boolean;
    nextReviewAt: Date | null;
  }>;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(aiUseCases)
      .where(
        and(
          eq(aiUseCases.id, input.useCaseId),
          eq(aiUseCases.organisationId, input.organisationId),
        ),
      );
    if (!before) throw new Error("No such AI use case");

    const [after] = await tx
      .update(aiUseCases)
      .set({
        ...input.changes,
        updatedAt: new Date(),
        retiredAt:
          input.changes.lifecycleStage === "retired" ? new Date() : before.retiredAt,
      })
      .where(eq(aiUseCases.id, input.useCaseId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "ai_use_case.updated",
      subjectType: "ai_use_case",
      subjectId: input.useCaseId,
      entityId: before.entityId,
      before: { lifecycleStage: before.lifecycleStage, ownerId: before.ownerId },
      after: { lifecycleStage: after.lifecycleStage, ownerId: after.ownerId },
    });

    return after;
  });
}

/** The most recent assessment bound to this use case, and what it concluded. */
async function latestAssessment(useCaseId: string): Promise<AssessedFacts | null> {
  const [row] = await db
    .select({ assessment: assessments })
    .from(assessments)
    .where(
      and(eq(assessments.subjectType, "ai_use_case"), eq(assessments.subjectId, useCaseId)),
    )
    .orderBy(desc(assessments.updatedAt))
    .limit(1);
  if (!row) return null;

  const [snapshot] = await db
    .select()
    .from(assessmentRevisions)
    .where(eq(assessmentRevisions.assessmentId, row.assessment.id))
    .orderBy(desc(assessmentRevisions.revision))
    .limit(1);

  const answers = (snapshot?.answers ?? {}) as Record<string, unknown>;
  const read = (key: string) => {
    const v = answers[key];
    return typeof v === "string" ? v : null;
  };

  return {
    reference: row.assessment.reference,
    approvedAt: row.assessment.completedAt,
    tier: row.assessment.status === "approved" ? row.assessment.scoreTier : null,
    band: row.assessment.status === "approved" ? row.assessment.scoreBand : null,
    consequence: read(ASSESSMENT_KEYS.consequence),
    humanOversight: read(ASSESSMENT_KEYS.humanOversight),
    monitoring: Array.isArray(answers[ASSESSMENT_KEYS.monitoring])
      ? (answers[ASSESSMENT_KEYS.monitoring] as string[])
      : null,
    biasConsidered: read(ASSESSMENT_KEYS.biasConsidered),
    contestability: read(ASSESSMENT_KEYS.contestability),
  };
}

/**
 * What is wrong with this entry, if anything.
 *
 * Deliberately computed rather than stored. A gap is a fact about the present —
 * a system moved into production yesterday is unmonitored today whether or not
 * anybody re-saved the record.
 */
export function gapsFor(
  useCase: typeof aiUseCases.$inferSelect,
  assessed: AssessedFacts | null,
): Gap[] {
  const gaps: Gap[] = [];
  const live = LIVE_STAGES.includes(useCase.lifecycleStage as LifecycleStage);
  const retired = useCase.lifecycleStage === "retired";

  // A retired system needs nothing. Reporting gaps against it is noise that
  // trains people to ignore the list.
  if (retired) return gaps;

  if (!assessed) gaps.push("never_assessed");
  else if (!assessed.approvedAt) gaps.push("assessment_not_approved");

  if (!useCase.ownerId) gaps.push("no_owner");

  if (live && assessed) {
    const monitored = assessed.monitoring?.filter((m) => m !== "none") ?? [];
    if (monitored.length === 0) gaps.push("live_without_monitoring");
  }

  if (assessed?.consequence === "decides" && assessed.humanOversight === "none") {
    gaps.push("decides_without_oversight");
  }

  if (assessed && ["not_done", "planned"].includes(assessed.biasConsidered ?? "")) {
    gaps.push("bias_not_assessed");
  }

  if (useCase.nextReviewAt && useCase.nextReviewAt.getTime() <= Date.now()) {
    gaps.push("review_overdue");
  }

  return gaps;
}

export async function listRegister(
  organisationId: string,
  entityIds: string[] | null,
): Promise<RegisterEntry[]> {
  const rows = await db
    .select({ useCase: aiUseCases, ownerEmail: users.email })
    .from(aiUseCases)
    .leftJoin(users, eq(users.id, aiUseCases.ownerId))
    .where(
      entityIds === null
        ? eq(aiUseCases.organisationId, organisationId)
        : and(
            eq(aiUseCases.organisationId, organisationId),
            inArray(aiUseCases.entityId, entityIds.length ? entityIds : [""]),
          ),
    )
    .orderBy(aiUseCases.reference);

  return Promise.all(
    rows.map(async ({ useCase, ownerEmail }) => {
      const assessed = await latestAssessment(useCase.id);
      return { useCase, ownerEmail, assessed, gaps: gapsFor(useCase, assessed) };
    }),
  );
}

export async function loadUseCase(useCaseId: string, organisationId: string) {
  const [row] = await db
    .select({ useCase: aiUseCases, ownerEmail: users.email })
    .from(aiUseCases)
    .leftJoin(users, eq(users.id, aiUseCases.ownerId))
    .where(
      and(eq(aiUseCases.id, useCaseId), eq(aiUseCases.organisationId, organisationId)),
    );
  if (!row) return null;

  const [assessed, related] = await Promise.all([
    latestAssessment(useCaseId),
    db
      .select({ assessment: assessments, kind: templates.kind })
      .from(assessments)
      .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(
        and(
          eq(assessments.subjectType, "ai_use_case"),
          eq(assessments.subjectId, useCaseId),
        ),
      )
      .orderBy(desc(assessments.createdAt)),
  ]);

  return {
    useCase: row.useCase,
    ownerEmail: row.ownerEmail,
    assessed,
    assessments: related,
    gaps: gapsFor(row.useCase, assessed),
  };
}

/** The headline an AI governance lead wants: what is running, and what is unexamined. */
export async function registerSummary(
  organisationId: string,
  entityIds: string[] | null,
) {
  const entries = await listRegister(organisationId, entityIds);
  const active = entries.filter((e) => e.useCase.lifecycleStage !== "retired");

  return {
    // Active only. A retired system is history: counting it under a heading
    // that says "excluding retired" is the kind of small dishonesty that makes
    // a reader stop trusting every other number on the page.
    total: active.length,
    retired: entries.length - active.length,
    live: active.filter((e) =>
      LIVE_STAGES.includes(e.useCase.lifecycleStage as LifecycleStage),
    ).length,
    neverAssessed: active.filter((e) => e.gaps.includes("never_assessed")).length,
    serious: active.filter((e) => e.gaps.some((g) => SERIOUS_GAPS.includes(g))).length,
    withGaps: active.filter((e) => e.gaps.length > 0).length,
    entries: active,
  };
}
