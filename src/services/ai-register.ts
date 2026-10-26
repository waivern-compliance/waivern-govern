import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  aiChanges,
  aiUseCases,
  assessmentRevisions,
  assessments,
  referenceCounters,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { lastMaterialChanges } from "./ai-lifecycle";
import { systemsWithCurrentRecord } from "./atrs";
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
export type TransparencyScope = "required" | "voluntary" | "not_in_scope";
export type DeploymentPattern =
  | "public_web_app" | "embedded" | "public_api" | "privately_hosted" | "local" | "trained_here";

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

/**
 * The UK government AI Playbook's deployment patterns, worded as somebody
 * filling in the register would recognise their own system.
 */
export const DEPLOYMENT_PATTERN_LABEL: Record<DeploymentPattern, string> = {
  public_web_app: "Public AI app or website, used as-is",
  embedded: "AI features inside software we bought",
  public_api: "A provider's public API, called from our code",
  privately_hosted: "A model hosted on infrastructure we control",
  local: "A model running on people's own devices",
  trained_here: "A model trained or fine-tuned here",
};

/** Whether the Algorithmic Transparency Recording Standard applies. */
export const TRANSPARENCY_SCOPE_LABEL: Record<TransparencyScope, string> = {
  required: "Required — we must publish an ATRS record",
  voluntary: "Not required, but we publish one",
  not_in_scope: "Not in scope",
};

/** Stages where the system is actually touching people. */
export const LIVE_STAGES: LifecycleStage[] = ["pilot", "production"];

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
  | "review_overdue"
  | "transparency_record_missing"
  | "changed_since_assessment";

export const GAP_WORDS: Record<Gap, string> = {
  never_assessed: "Never assessed",
  assessment_not_approved: "Assessment not finished",
  no_owner: "No named owner",
  live_without_monitoring: "Live, nothing monitored",
  decides_without_oversight: "Decides with no human oversight",
  bias_not_assessed: "Bias never assessed",
  review_overdue: "Review overdue",
  transparency_record_missing: "No transparency record",
  changed_since_assessment: "Changed since assessed",
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
  deploymentPattern?: DeploymentPattern | null;
  vendor?: string;
  modelName?: string;
  ownerId?: string | null;
  governanceOfficerId?: string | null;
  responsibleTeam?: string;
  deployedIn?: string[];
  processesPersonalData?: boolean;
  nextReviewAt?: Date;
  actor: Actor;
}) {
  const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());
  const stage = input.lifecycleStage ?? "proposed";

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
        lifecycleStage: stage,
        deploymentPattern: input.deploymentPattern ?? null,
        vendor: input.vendor,
        modelName: input.modelName,
        ownerId: input.ownerId ?? null,
        governanceOfficerId: input.governanceOfficerId ?? null,
        responsibleTeam: input.responsibleTeam,
        deployedIn: input.deployedIn ?? [],
        processesPersonalData: input.processesPersonalData,
        nextReviewAt: input.nextReviewAt,
        // Registered already live is the common case for an inventory being
        // built after the fact. The date is when it was recorded as live, not
        // a guess at when it started — the register says what it knows.
        liveSince: LIVE_STAGES.includes(stage) ? new Date() : null,
      })
      .returning();

    // The history starts with the stage it was registered at.
    await tx.insert(aiChanges).values({
      organisationId: input.organisationId,
      entityId: input.entityId,
      aiUseCaseId: row.id,
      kind: "stage",
      fromStage: null,
      toStage: stage,
      summary: "Added to the register.",
      recordedByUserId: input.actor.actorUserId ?? null,
      recordedByLabel: input.actor.actorLabel,
    });

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
        deploymentPattern: row.deploymentPattern,
      },
    });

    return row;
  });
}

/** The fields an update may touch, and which of them the audit record shows. */
const TRACKED_FIELDS = [
  "deploymentPattern",
  "ownerId",
  "governanceOfficerId",
  "responsibleTeam",
  "vendor",
  "modelName",
  "processesPersonalData",
  "nextReviewAt",
  "transparencyScope",
] as const;

export async function updateUseCase(input: {
  useCaseId: string;
  organisationId: string;
  /** Not the stage: that goes through `changeStage`, which checks the gate. */
  changes: Partial<{
    deploymentPattern: DeploymentPattern | null;
    ownerId: string | null;
    governanceOfficerId: string | null;
    responsibleTeam: string | null;
    transparencyScope: TransparencyScope | null;
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
      .set({ ...input.changes, updatedAt: new Date() })
      .where(eq(aiUseCases.id, input.useCaseId))
      .returning();

    // Only what actually moved, so the log reads as a list of changes rather
    // than a dump of the record with the change somewhere inside it.
    const changed = TRACKED_FIELDS.filter(
      (f) => f in input.changes && String(before[f] ?? "") !== String(after[f] ?? ""),
    );
    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "ai_use_case.updated",
      subjectType: "ai_use_case",
      subjectId: input.useCaseId,
      entityId: before.entityId,
      before: Object.fromEntries(changed.map((f) => [f, before[f]])),
      after: Object.fromEntries(changed.map((f) => [f, after[f]])),
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
  transparency: { hasCurrentRecord: boolean } | null = null,
  lastMaterialChangeAt: Date | null = null,
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

  // The model, its data or its use changed after the judgement was made, so the
  // judgement is about a system that no longer exists in that form.
  if (
    lastMaterialChangeAt &&
    assessed?.approvedAt &&
    lastMaterialChangeAt.getTime() > assessed.approvedAt.getTime()
  ) {
    gaps.push("changed_since_assessment");
  }

  // Only where a record is required and the system is reaching people. A
  // voluntary record not yet written is a choice, not a gap; one required for
  // a system still in development is not due until it goes live.
  if (
    transparency &&
    useCase.transparencyScope === "required" &&
    live &&
    !transparency.hasCurrentRecord
  ) {
    gaps.push("transparency_record_missing");
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
            inArray(aiUseCases.entityId, entityIds),
          ),
    )
    .orderBy(aiUseCases.reference);
  const [recorded, changed] = await Promise.all([
    systemsWithCurrentRecord(organisationId),
    lastMaterialChanges(organisationId),
  ]);

  return Promise.all(
    rows.map(async ({ useCase, ownerEmail }) => {
      const assessed = await latestAssessment(useCase.id);
      return {
        useCase,
        ownerEmail,
        assessed,
        gaps: gapsFor(
          useCase,
          assessed,
          { hasCurrentRecord: recorded.has(useCase.id) },
          changed.get(useCase.id) ?? null,
        ),
      };
    }),
  );
}

export async function loadUseCase(useCaseId: string, organisationId: string) {
  const officers = alias(users, "governance_officer");
  const [row] = await db
    .select({ useCase: aiUseCases, ownerEmail: users.email, officerEmail: officers.email })
    .from(aiUseCases)
    .leftJoin(users, eq(users.id, aiUseCases.ownerId))
    .leftJoin(officers, eq(officers.id, aiUseCases.governanceOfficerId))
    .where(
      and(eq(aiUseCases.id, useCaseId), eq(aiUseCases.organisationId, organisationId)),
    );
  if (!row) return null;

  const [assessed, related, recorded, changed] = await Promise.all([
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
    systemsWithCurrentRecord(organisationId),
    lastMaterialChanges(organisationId),
  ]);

  return {
    useCase: row.useCase,
    ownerEmail: row.ownerEmail,
    officerEmail: row.officerEmail,
    assessed,
    assessments: related,
    gaps: gapsFor(
      row.useCase,
      assessed,
      { hasCurrentRecord: recorded.has(useCaseId) },
      changed.get(useCaseId) ?? null,
    ),
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
