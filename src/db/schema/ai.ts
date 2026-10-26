import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  aiChangeKind,
  aiDeploymentPattern,
  aiLifecycleStage,
  aiProvenance,
  aiSystemType,
  atrsScope,
  atrsStatus,
} from "./enums";
import { integrationConnections } from "./integration";
import { entities, organisations, users } from "./tenancy";

/**
 * An AI system the organisation is accountable for.
 *
 * This is an inventory, not an assessment. It answers "what exists, who owns
 * it, and what stage is it at" — and, crucially, it can hold a system that
 * nobody has assessed yet. That is the whole point: a register that only
 * contains assessed systems cannot answer the question an AI governance lead
 * actually has, which is what is running that nobody has looked at.
 *
 * Risk facts — what consequence it has for people, what oversight is in place,
 * whether bias was assessed — deliberately live on the assessment rather than
 * here. Copying them into the register would create a second source of truth
 * that drifts from the judgement somebody signed.
 */
export const aiUseCases = pgTable(
  "ai_use_case",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),

    reference: text("reference").notNull(),
    name: text("name").notNull(),
    /** What it is for, in terms somebody outside the team would follow. */
    purpose: text("purpose").notNull(),
    description: text("description"),

    systemType: aiSystemType("system_type").notNull(),
    provenance: aiProvenance("provenance").notNull(),
    lifecycleStage: aiLifecycleStage("lifecycle_stage").notNull().default("proposed"),
    /**
     * Nullable: a system registered before anybody established how it is
     * deployed is still worth having on the register, and "unknown" is more
     * honest than a default somebody did not choose.
     */
    deploymentPattern: aiDeploymentPattern("deployment_pattern"),

    /** Who supplies it, and which model, where that is known. */
    vendor: text("vendor"),
    modelName: text("model_name"),

    /**
     * The named human accountable for it. Nullable because an unowned system is
     * a real and reportable state — refusing to record one until somebody
     * volunteers is how shadow AI stays invisible.
     */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * The person who runs risk management for it day to day — the DSIT AI Risk
     * Management Toolkit's "AI governance officer". Distinct from the owner,
     * who answers for the system: the officer makes sure risks are found,
     * assessed and kept under review. One person may hold both.
     */
    governanceOfficerId: uuid("governance_officer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** The team that runs it, as the Algorithmic Transparency Recording Standard asks. */
    responsibleTeam: text("responsible_team"),

    /**
     * Whether a public Algorithmic Transparency Recording Standard record is
     * required, published voluntarily, or not in scope. Null until somebody
     * has decided — which the register treats as a question, not an answer.
     */
    transparencyScope: atrsScope("transparency_scope"),

    /** Systems and services it is deployed in. */
    deployedIn: jsonb("deployed_in").$type<string[]>().notNull().default([]),

    /** Categories only, as everywhere else. Never identities. */
    processesPersonalData: boolean("processes_personal_data"),
    dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),

    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    /**
     * When it first reached real people — set the first time it enters a live
     * stage, and kept if it later leaves one. "How long has this been running"
     * is the question an inventory gets asked, and the stage alone cannot answer it.
     */
    liveSince: timestamp("live_since", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),

    sourceConnectionId: uuid("source_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "set null" },
    ),
    externalRef: text("external_ref"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_use_case_reference").on(t.organisationId, t.reference),
    uniqueIndex("ai_use_case_external")
      .on(t.organisationId, t.sourceConnectionId, t.externalRef)
      .where(sql`${t.externalRef} is not null`),
    index("ai_use_case_stage_idx").on(t.organisationId, t.lifecycleStage),
    index("ai_use_case_entity_idx").on(t.organisationId, t.entityId),
    index("ai_use_case_review_idx").on(t.organisationId, t.nextReviewAt),
  ],
);

export const aiUseCaseRelations = relations(aiUseCases, ({ one }) => ({
  organisation: one(organisations, {
    fields: [aiUseCases.organisationId],
    references: [organisations.id],
  }),
  entity: one(entities, { fields: [aiUseCases.entityId], references: [entities.id] }),
  owner: one(users, {
    fields: [aiUseCases.ownerId],
    references: [users.id],
    relationName: "ai_use_case_owner",
  }),
  governanceOfficer: one(users, {
    fields: [aiUseCases.governanceOfficerId],
    references: [users.id],
    relationName: "ai_use_case_governance_officer",
  }),
}));

/**
 * An Algorithmic Transparency Recording Standard record for one AI system.
 *
 * Versioned rather than edited. A draft is worked on; once an approver signs
 * it off its content is frozen, because the version sent to DSIT and published
 * on GOV.UK has to be the version anyone can later see here. A change is a new
 * draft, which on approval supersedes the last. Approval is by someone other
 * than the person who started the draft — a public statement about how a body
 * uses an algorithm is not one person's to make alone.
 *
 * Govern holds the record's content; it does not lay it out as a document. The
 * export is the template's own field-by-field layout, for pasting into DSIT's
 * spreadsheet or for the Portal to render.
 */
export const atrsRecords = pgTable(
  "atrs_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    aiUseCaseId: uuid("ai_use_case_id")
      .notNull()
      .references(() => aiUseCases.id, { onDelete: "restrict" }),

    version: integer("version").notNull(),
    /** The ATRS template version the fields follow. */
    standardVersion: text("standard_version").notNull(),
    status: atrsStatus("status").notNull().default("draft"),
    /** Field values keyed by the template's reference, e.g. "2.1.3". */
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),

    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByLabel: text("created_by_label").notNull(),

    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    approvedByLabel: text("approved_by_label"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Where the public can read it. */
    publicationUrl: text("publication_url"),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("atrs_record_version").on(t.aiUseCaseId, t.version),
    // One draft in progress, and one version in force, per system.
    uniqueIndex("atrs_record_one_draft")
      .on(t.aiUseCaseId)
      .where(sql`${t.status} = 'draft'`),
    uniqueIndex("atrs_record_one_current")
      .on(t.aiUseCaseId)
      .where(sql`${t.status} in ('approved', 'published')`),
    index("atrs_record_org_idx").on(t.organisationId, t.status),
  ],
);

export const atrsRecordRelations = relations(atrsRecords, ({ one }) => ({
  useCase: one(aiUseCases, { fields: [atrsRecords.aiUseCaseId], references: [aiUseCases.id] }),
}));

/**
 * Something that changed about an AI system, and on what basis.
 *
 * Append-only: the register says what a system is now, and this says how it
 * got there — every stage it passed through, and every change to its model,
 * data or use — so "what was running on 3 March, and who let it go live?" has
 * an answer. A stage change that did not meet its gate records who waived the
 * gate and why, rather than the gate quietly not applying.
 */
export const aiChanges = pgTable(
  "ai_change",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    aiUseCaseId: uuid("ai_use_case_id")
      .notNull()
      .references(() => aiUseCases.id, { onDelete: "restrict" }),

    kind: aiChangeKind("kind").notNull(),
    /** For a stage change. Null where the system was first registered. */
    fromStage: aiLifecycleStage("from_stage"),
    toStage: aiLifecycleStage("to_stage"),
    summary: text("summary").notNull(),
    /** How the change was tested and validated before release. */
    validation: text("validation"),
    /** How it would be withdrawn and the previous version restored. */
    rollback: text("rollback"),

    /** The gate conditions not met at the time, where a stage change went ahead anyway. */
    gateWaived: jsonb("gate_waived").$type<string[]>(),
    waiverReason: text("waiver_reason"),

    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recordedByLabel: text("recorded_by_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_change_use_case_idx").on(t.aiUseCaseId, t.createdAt)],
);
