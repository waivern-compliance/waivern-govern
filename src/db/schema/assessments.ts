import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnswerValue, EvaluationResult } from "@/lib/templates/logic";
import type { ScoreResult } from "@/lib/templates/scoring";
import { assessmentStatus, recordType, revisionReason, riskTier } from "./enums";
import { templateVersions } from "./templates";
import { entities, organisations, users } from "./tenancy";

/**
 * One filled-in assessment.
 *
 * It points at a frozen `templateVersion`, never at the template — so the
 * questions a completed assessment answered stay exactly as they were, however
 * many times the template is revised afterwards.
 */
export const assessments = pgTable(
  "assessment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    templateVersionId: uuid("template_version_id")
      .notNull()
      .references(() => templateVersions.id, { onDelete: "restrict" }),

    /** Human-readable handle people quote in email: DPIA-2026-0014. */
    reference: text("reference").notNull(),
    title: text("title").notNull(),

    /** What this assessment is about, once those registers exist. */
    subjectType: recordType("subject_type"),
    subjectId: uuid("subject_id"),

    status: assessmentStatus("status").notNull().default("draft"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),

    /** The assessment this one replaces, forming a reassessment chain. */
    supersedesId: uuid("supersedes_id"),

    /**
     * Score at the moment of submission, denormalised so dashboards and the
     * risk register do not have to replay the scoring rules of a template
     * version that may since have been retired.
     */
    scoreValue: integer("score_value"),
    scoreBand: text("score_band"),
    scoreTier: riskTier("score_tier"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("assessment_reference_key").on(t.organisationId, t.reference),
    index("assessment_status_idx").on(t.organisationId, t.status),
    index("assessment_entity_idx").on(t.organisationId, t.entityId),
    index("assessment_subject_idx").on(t.subjectType, t.subjectId),
    index("assessment_due_idx").on(t.organisationId, t.dueAt),
  ],
);

/**
 * The current answer to one question.
 *
 * Stored per question rather than as one document, so two people can hold
 * different parts of the same assessment and every answer carries who gave it
 * and when. A single JSON blob would attribute the whole assessment to whoever
 * saved last.
 */
export const assessmentAnswers = pgTable(
  "assessment_answer",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    value: jsonb("value").$type<AnswerValue>(),

    /** Set for a signed-in user. */
    answeredByUserId: uuid("answered_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Email or system name — the only identifier a link contributor has. */
    answeredByLabel: text("answered_by_label").notNull(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assessment_answer_key").on(t.assessmentId, t.questionKey),
    index("assessment_answer_assessment_idx").on(t.assessmentId),
  ],
);

/**
 * An immutable snapshot at a moment that matters.
 *
 * Taken on submission and on every decision, not on every keystroke — a history
 * nobody can read is not a history. The snapshot records the evaluation as well
 * as the answers, so a reader two years later can see which questions were being
 * asked at the time and which had fallen away, without re-running logic from a
 * template version that may since have been retired.
 */
export const assessmentRevisions = pgTable(
  "assessment_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    reason: revisionReason("reason").notNull(),

    answers: jsonb("answers").$type<Record<string, AnswerValue>>().notNull(),
    evaluation: jsonb("evaluation").$type<EvaluationResult>().notNull(),
    score: jsonb("score").$type<ScoreResult | null>(),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByLabel: text("created_by_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("assessment_revision_key").on(t.assessmentId, t.revision)],
);

/**
 * Access for someone who has no account and should not need one.
 *
 * This is the mechanism behind "completion without account creation". The
 * occasional contributor who knows the answer to four questions is the single
 * biggest source of friction in these platforms, and making them hold a licensed
 * seat is both a cost and a reason the assessment never gets finished.
 *
 * The token itself is never stored — only its SHA-256 — so a database disclosure
 * does not hand over working links.
 */
export const contributorLinks = pgTable(
  "contributor_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    /** Null grants the whole assessment; otherwise exactly one section. */
    sectionKey: text("section_key"),
    email: text("email").notNull(),

    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    /** Set when the contributor marks their part finished. */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Set when someone withdraws access before it expires. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),

    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    lastUsedIpHash: text("last_used_ip_hash"),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("contributor_link_assessment_idx").on(t.assessmentId),
    index("contributor_link_expiry_idx").on(t.expiresAt),
  ],
);

/**
 * Per-organisation counters behind human-readable references.
 *
 * A separate row rather than `count(*) + 1`, which races under concurrent
 * creation and reuses numbers after a deletion — and a reference that has ever
 * pointed at two different assessments is worse than no reference at all.
 */
export const referenceCounters = pgTable(
  "reference_counter",
  {
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    prefix: text("prefix").notNull(),
    year: integer("year").notNull(),
    nextValue: integer("next_value").notNull().default(1),
  },
  (t) => [
    uniqueIndex("reference_counter_key").on(t.organisationId, t.prefix, t.year),
  ],
);

export const assessmentRelations = relations(assessments, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [assessments.organisationId],
    references: [organisations.id],
  }),
  entity: one(entities, { fields: [assessments.entityId], references: [entities.id] }),
  templateVersion: one(templateVersions, {
    fields: [assessments.templateVersionId],
    references: [templateVersions.id],
  }),
  owner: one(users, { fields: [assessments.ownerId], references: [users.id] }),
  answers: many(assessmentAnswers),
  revisions: many(assessmentRevisions),
  links: many(contributorLinks),
}));

export const assessmentAnswerRelations = relations(assessmentAnswers, ({ one }) => ({
  assessment: one(assessments, {
    fields: [assessmentAnswers.assessmentId],
    references: [assessments.id],
  }),
}));

export const contributorLinkRelations = relations(contributorLinks, ({ one }) => ({
  assessment: one(assessments, {
    fields: [contributorLinks.assessmentId],
    references: [assessments.id],
  }),
}));
