import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { aiDeploymentPattern, aiLifecycleStage, aiProvenance, aiSystemType } from "./enums";
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
