import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import {
  assessmentAnswers,
  assessmentRevisions,
  assessments,
  referenceCounters,
  templateVersions,
  templates,
} from "@/db/schema";
import { appendAuditEvent, type AuditInput } from "@/lib/audit";
import {
  checkForSubmission,
  validateAnswer,
  type AnswerProblem,
} from "@/lib/templates/answers";
import { evaluate, questionsOf, type AnswerValue, type Answers } from "@/lib/templates/logic";
import { score } from "@/lib/templates/scoring";
import type { Actor } from "./templates";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Statuses in which answers may still be changed. */
const EDITABLE = ["draft", "in_progress", "returned"] as const;

const REFERENCE_PREFIX: Record<string, string> = {
  dpia: "DPIA",
  tra: "TRA",
  tia: "TIA",
  ai_risk: "AIRA",
  screening: "SCR",
  supplier_record: "TPR",
  breach: "BR",
  custom: "ASMT",
};

export class AssessmentNotEditable extends Error {
  constructor(status: string) {
    super(`An assessment with status "${status}" cannot be edited`);
  }
}

export class AnswersRejected extends Error {
  constructor(readonly problems: AnswerProblem[]) {
    super(problems.map((p) => `${p.questionKey}: ${p.message}`).join("; "));
  }
}

export class SubmissionIncomplete extends Error {
  constructor(
    readonly missing: AnswerProblem[],
    readonly invalid: AnswerProblem[],
  ) {
    super(
      `${missing.length} unanswered, ${invalid.length} invalid: ` +
        [...missing, ...invalid].map((p) => p.questionKey).join(", "),
    );
  }
}

/**
 * Allocate the next reference for a prefix and year.
 *
 * The upsert takes a row lock, so concurrent creation serialises rather than
 * handing two assessments the same number — the same reason the audit chain
 * locks its head.
 */
async function nextReference(tx: Tx, organisationId: string, kind: string, year: number) {
  const prefix = REFERENCE_PREFIX[kind] ?? "ASMT";
  const rows = await tx.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, ${prefix}, ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  const value = Number(rows[0]?.next_value ?? 1);
  return `${prefix}-${year}-${String(value).padStart(4, "0")}`;
}

export async function createAssessment(input: {
  organisationId: string;
  entityId: string;
  templateVersionId: string;
  title: string;
  subjectType?: (typeof assessments.$inferInsert)["subjectType"];
  subjectId?: string;
  ownerId?: string;
  dueAt?: Date;
  supersedesId?: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .select({ version: templateVersions, template: templates })
      .from(templateVersions)
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(eq(templateVersions.id, input.templateVersionId));

    if (!version) throw new Error("No such template version");
    if (version.version.status !== "published") {
      // Starting work against a draft would mean the questions could change
      // underneath the person answering them.
      throw new Error("Assessments can only be started from a published template version");
    }
    if (version.template.organisationId !== input.organisationId) {
      throw new Error("That template belongs to a different organisation");
    }

    const reference = await nextReference(
      tx,
      input.organisationId,
      version.template.kind,
      new Date().getUTCFullYear(),
    );

    const [assessment] = await tx
      .insert(assessments)
      .values({
        organisationId: input.organisationId,
        entityId: input.entityId,
        templateVersionId: input.templateVersionId,
        reference,
        title: input.title,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        ownerId: input.ownerId,
        dueAt: input.dueAt,
        supersedesId: input.supersedesId,
        status: "draft",
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "assessment.created",
      subjectType: "assessment",
      subjectId: assessment.id,
      entityId: input.entityId,
      after: {
        reference,
        title: assessment.title,
        template: version.template.name,
        templateVersion: version.version.version,
      },
    });

    return assessment;
  });
}

export type LoadedAssessment = {
  assessment: typeof assessments.$inferSelect;
  definition: (typeof templateVersions.$inferSelect)["definition"];
  templateName: string;
  templateKind: string;
  answers: Answers;
  answerMeta: Record<string, { by: string; at: Date }>;
};

/** An assessment with its frozen questions and current answers. */
export async function loadAssessment(
  assessmentId: string,
  organisationId: string,
): Promise<LoadedAssessment | null> {
  const [row] = await db
    .select({ assessment: assessments, version: templateVersions, template: templates })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(eq(assessments.id, assessmentId), eq(assessments.organisationId, organisationId)),
    );
  if (!row) return null;

  const stored = await db
    .select()
    .from(assessmentAnswers)
    .where(eq(assessmentAnswers.assessmentId, assessmentId));

  const answers: Answers = {};
  const answerMeta: Record<string, { by: string; at: Date }> = {};
  for (const a of stored) {
    answers[a.questionKey] = a.value;
    answerMeta[a.questionKey] = { by: a.answeredByLabel, at: a.answeredAt };
  }

  return {
    assessment: row.assessment,
    definition: row.version.definition,
    templateName: row.template.name,
    templateKind: row.template.kind,
    answers,
    answerMeta,
  };
}

/**
 * Write a batch of answers.
 *
 * `allowedSection` confines the write to one section, which is how a contributor
 * link is enforced: the scope is checked here, at the write, rather than only
 * being reflected in what the page chose to render.
 */
export async function saveAnswers(input: {
  assessmentId: string;
  organisationId: string;
  answers: Record<string, AnswerValue>;
  allowedSection?: string | null;
  actor: Actor;
}) {
  const loaded = await loadAssessment(input.assessmentId, input.organisationId);
  if (!loaded) throw new Error("No such assessment");
  if (!EDITABLE.includes(loaded.assessment.status as (typeof EDITABLE)[number])) {
    throw new AssessmentNotEditable(loaded.assessment.status);
  }

  const schema = loaded.definition.schema;
  const index = new Map(
    questionsOf(schema).map(({ question, section }) => [question.key, { question, section }]),
  );

  const problems: AnswerProblem[] = [];
  for (const key of Object.keys(input.answers)) {
    const entry = index.get(key);
    if (!entry) {
      problems.push({ questionKey: key, message: "No such question in this template" });
      continue;
    }
    if (input.allowedSection && entry.section.key !== input.allowedSection) {
      problems.push({ questionKey: key, message: "Outside the section you were asked about" });
    }
  }
  if (problems.length) throw new AnswersRejected(problems);

  // Visibility is judged against the merged state, because a batch can both set
  // a trigger and answer what it reveals.
  const merged: Answers = { ...loaded.answers, ...input.answers };
  const evaluation = evaluate(schema, merged);

  const shapeProblems: AnswerProblem[] = [];
  for (const [key, value] of Object.entries(input.answers)) {
    const entry = index.get(key)!;
    if (!evaluation.questions[key]?.visible) {
      shapeProblems.push({ questionKey: key, message: "This question is not currently being asked" });
      continue;
    }
    const problem = validateAnswer(entry.question, value);
    if (problem) shapeProblems.push(problem);
  }
  if (shapeProblems.length) throw new AnswersRejected(shapeProblems);

  const now = new Date();

  return db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(input.answers)) {
      await tx
        .insert(assessmentAnswers)
        .values({
          assessmentId: input.assessmentId,
          questionKey: key,
          value,
          answeredByUserId: input.actor.actorUserId ?? null,
          answeredByLabel: input.actor.actorLabel,
          answeredAt: now,
        })
        .onConflictDoUpdate({
          target: [assessmentAnswers.assessmentId, assessmentAnswers.questionKey],
          set: {
            value,
            answeredByUserId: input.actor.actorUserId ?? null,
            answeredByLabel: input.actor.actorLabel,
            answeredAt: now,
          },
        });
    }

    const nextStatus =
      loaded.assessment.status === "draft" ? "in_progress" : loaded.assessment.status;
    await tx
      .update(assessments)
      .set({ updatedAt: now, status: nextStatus })
      .where(eq(assessments.id, input.assessmentId));

    // One event per batch rather than per field. A per-keystroke audit trail is
    // unreadable, and an unreadable trail is not evidence of anything.
    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "assessment.answers_saved",
      subjectType: "assessment",
      subjectId: input.assessmentId,
      entityId: loaded.assessment.entityId,
      after: { questions: Object.keys(input.answers).sort(), values: input.answers },
      metadata: input.allowedSection ? { section: input.allowedSection } : {},
    });

    return { saved: Object.keys(input.answers).length, evaluation };
  });
}

/**
 * Submit for review.
 *
 * Everything that decides the outcome is recomputed here from the stored
 * answers rather than trusted from the client: visibility, completeness and the
 * score. A submission is the moment the record starts being relied on.
 */
export async function submitAssessment(input: {
  assessmentId: string;
  organisationId: string;
  actor: Actor;
}) {
  const loaded = await loadAssessment(input.assessmentId, input.organisationId);
  if (!loaded) throw new Error("No such assessment");
  if (!EDITABLE.includes(loaded.assessment.status as (typeof EDITABLE)[number])) {
    throw new AssessmentNotEditable(loaded.assessment.status);
  }

  const { schema, scoring } = loaded.definition;
  const check = checkForSubmission(schema, loaded.answers);
  if (!check.ready) throw new SubmissionIncomplete(check.missing, check.invalid);

  const scored = score(scoring, schema, loaded.answers, check.evaluation);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [{ revision }] = await tx
      .select({ revision: sql<number>`coalesce(max(${assessmentRevisions.revision}), 0) + 1` })
      .from(assessmentRevisions)
      .where(eq(assessmentRevisions.assessmentId, input.assessmentId));

    await tx.insert(assessmentRevisions).values({
      assessmentId: input.assessmentId,
      revision: Number(revision),
      reason: "submitted",
      answers: loaded.answers as Record<string, AnswerValue>,
      evaluation: check.evaluation,
      score: scored,
      createdByUserId: input.actor.actorUserId ?? null,
      createdByLabel: input.actor.actorLabel,
      createdAt: now,
    });

    const [updated] = await tx
      .update(assessments)
      .set({
        status: "in_review",
        submittedAt: now,
        updatedAt: now,
        scoreValue: scored.scored ? scored.score : null,
        scoreBand: scored.scored ? scored.band.label : null,
        scoreTier: scored.scored ? scored.band.tier : null,
      })
      .where(eq(assessments.id, input.assessmentId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "assessment.submitted",
      subjectType: "assessment",
      subjectId: input.assessmentId,
      entityId: loaded.assessment.entityId,
      before: { status: loaded.assessment.status },
      after: {
        status: "in_review",
        revision: Number(revision),
        score: scored.scored ? { value: scored.score, band: scored.band.label, tier: scored.band.tier } : null,
      },
    });

    return { assessment: updated, revision: Number(revision), score: scored };
  });
}


/** Send a submitted assessment back for more work, with a reason. */
export async function returnAssessment(input: {
  assessmentId: string;
  organisationId: string;
  reason: string;
  actor: Actor;
}) {
  if (!input.reason.trim()) {
    // Returning work without saying why wastes the next person's time and is
    // the most common reason these loops go round more than once.
    throw new Error("A reason is required when returning an assessment");
  }

  const loaded = await loadAssessment(input.assessmentId, input.organisationId);
  if (!loaded) throw new Error("No such assessment");
  if (loaded.assessment.status !== "in_review") {
    throw new Error("Only an assessment in review can be returned");
  }

  const now = new Date();
  return db.transaction(async (tx) => {
    const [{ revision }] = await tx
      .select({ revision: sql<number>`coalesce(max(${assessmentRevisions.revision}), 0) + 1` })
      .from(assessmentRevisions)
      .where(eq(assessmentRevisions.assessmentId, input.assessmentId));

    await tx.insert(assessmentRevisions).values({
      assessmentId: input.assessmentId,
      revision: Number(revision),
      reason: "returned",
      answers: loaded.answers as Record<string, AnswerValue>,
      evaluation: evaluate(loaded.definition.schema, loaded.answers),
      score: null,
      createdByUserId: input.actor.actorUserId ?? null,
      createdByLabel: input.actor.actorLabel,
      createdAt: now,
    });

    const [updated] = await tx
      .update(assessments)
      .set({ status: "returned", updatedAt: now })
      .where(eq(assessments.id, input.assessmentId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "assessment.returned",
      subjectType: "assessment",
      subjectId: input.assessmentId,
      entityId: loaded.assessment.entityId,
      before: { status: "in_review" },
      after: { status: "returned", reason: input.reason },
    });

    return updated;
  });
}

export async function listAssessments(organisationId: string, entityIds: string[] | null) {
  return db
    .select({ assessment: assessments, templateName: templates.name })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      entityIds === null
        ? eq(assessments.organisationId, organisationId)
        : and(
            eq(assessments.organisationId, organisationId),
            inArray(assessments.entityId, entityIds.length ? entityIds : [""]),
          ),
    )
    .orderBy(desc(assessments.updatedAt));
}

export async function assessmentHistory(assessmentId: string) {
  return db
    .select()
    .from(assessmentRevisions)
    .where(eq(assessmentRevisions.assessmentId, assessmentId))
    .orderBy(asc(assessmentRevisions.revision));
}
