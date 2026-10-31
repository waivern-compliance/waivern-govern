import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
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
  aiHarm,
  aiIncidentKind,
  aiIncidentSource,
  aiIncidentStatus,
  aiAssuranceKind,
  aiAssuranceResult,
  aiChangeKind,
  aiDeploymentPattern,
  aiLifecycleStage,
  aiProvenance,
  aiRequestStatus,
  aiSystemType,
  atrsScope,
  atrsStatus,
  riskTier,
} from "./enums";
import type { AdmSafeguards, AdmSetAside, AdmSpecialCondition } from "@/lib/gdpr/automated-decisions";
import { integrationConnections, suppliers } from "./integration";
import { risks } from "./risks";
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
    /**
     * The supplier on the third-party register, where it is one. `vendor` is
     * what somebody typed; this is the record whose AI supply was assessed and
     * whose contract can be checked.
     */
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
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

    /**
     * Significant decisions taken solely by automated means (UK GDPR 22A–22C).
     * The same record is kept on processing activities; where a linked pair disagrees,
     * the page offers to copy one across, and a person decides.
     * Null: not yet known.
     */
    automatedDecisions: boolean("automated_decisions"),
    admSpecialCategory: boolean("adm_special_category"),
    admSpecialCondition: text("adm_special_condition").$type<AdmSpecialCondition>(),
    admSafeguards: jsonb("adm_safeguards").$type<AdmSafeguards>().notNull().default({}),
    /** Part 3 only (s.50C(3)): the reasons the safeguards may be set aside, and how decisions are then reconsidered. */
    admSetAside: jsonb("adm_set_aside").$type<AdmSetAside>(),

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

/** One measured result, and the limit it was held to. */
export type AssuranceMetric = {
  name: string;
  value: number;
  /** The acceptable limit, where one was set. */
  threshold: number | null;
  /** Whether the value must be at least or at most the threshold. */
  direction: "at_least" | "at_most";
  unit?: string;
};

/**
 * Evidence that an AI system does what it should: a test, an evaluation, or
 * the documentation a model or dataset should carry.
 *
 * The toolkit asks for performance to be measured against defined acceptable
 * limits, and for bias testing and red-teaming to be done by people independent
 * of the project team. A result is recorded with the limits it was held to and
 * whether the people who ran it were independent, so "it passed" can be
 * checked rather than taken on trust.
 *
 * Append-only. A test that was run is a fact; a correction is another record.
 */
export const aiAssuranceRecords = pgTable(
  "ai_assurance_record",
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

    kind: aiAssuranceKind("kind").notNull(),
    title: text("title").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    /** Who carried it out — a team, a supplier, an external assessor. */
    performedBy: text("performed_by").notNull(),
    /** Whether they are independent of the team that built and runs the system. */
    independent: boolean("independent").notNull(),
    method: text("method"),
    metrics: jsonb("metrics").$type<AssuranceMetric[]>().notNull().default([]),
    /** Null for documentation, which describes rather than passes or fails. */
    result: aiAssuranceResult("result"),
    findings: text("findings"),
    /** Where the full report or card is held. */
    evidenceRef: text("evidence_ref"),
    /** The change this validated, where it was run as part of change control. */
    changeId: uuid("change_id").references(() => aiChanges.id, { onDelete: "restrict" }),

    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recordedByLabel: text("recorded_by_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_assurance_use_case_idx").on(t.aiUseCaseId, t.performedAt)],
);

/**
 * A report about an AI system: something went wrong, someone was harmed,
 * someone is challenging an outcome, or someone is worried.
 *
 * Each has a named person deciding what happens to it, and every step is in
 * `ai_incident_event`. A challenge to an outcome is decided by a person, as
 * UK GDPR Article 22C and the Playbook require; the outcome is recorded here.
 * Confidential reports keep who raised them from anyone but the person
 * handling them and those entitled to see confidential concerns.
 */
export const aiIncidents = pgTable(
  "ai_incident",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    /** Null where nobody yet knows which system it is about. */
    aiUseCaseId: uuid("ai_use_case_id").references(() => aiUseCases.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),

    kind: aiIncidentKind("kind").notNull(),
    source: aiIncidentSource("source").notNull(),
    summary: text("summary").notNull(),
    details: text("details"),
    harm: aiHarm("harm").notNull().default("none_known"),
    status: aiIncidentStatus("status").notNull().default("reported"),
    /** Set by the person triaging it, on the organisation's risk scale's tiers. */
    severity: riskTier("severity"),

    /** Who raised it. Withheld from most viewers when confidential. */
    reportedByLabel: text("reported_by_label").notNull(),
    confidential: boolean("confidential").notNull().default(false),

    /** The named person deciding what happens. */
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    outcome: text("outcome"),
    linkedRiskId: uuid("linked_risk_id").references(() => risks.id, { onDelete: "set null" }),

    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_incident_reference").on(t.organisationId, t.reference),
    index("ai_incident_use_case_idx").on(t.aiUseCaseId, t.status),
    index("ai_incident_org_status_idx").on(t.organisationId, t.status),
  ],
);

/** One step in handling a report. Append-only: the timeline is the record. */
export const aiIncidentEvents = pgTable(
  "ai_incident_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => aiIncidents.id, { onDelete: "restrict" }),
    fromStatus: aiIncidentStatus("from_status"),
    toStatus: aiIncidentStatus("to_status").notNull(),
    note: text("note").notNull(),
    byUserId: uuid("by_user_id").references(() => users.id, { onDelete: "set null" }),
    byLabel: text("by_label").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_incident_event_incident_idx").on(t.incidentId, t.at)],
);

/**
 * A proposal to use AI for something, before anything is built or bought.
 *
 * The Playbook asks for a register of use cases, prioritised by feasibility
 * and business value, and for the questions that decide whether AI is the
 * right tool to be asked first: what the need is, why AI rather than
 * something simpler, what it will cost the environment, who has been asked.
 * Anybody can propose; somebody who manages the register scores and decides.
 * Accepting one puts the system on the AI register at "proposed", so the
 * register starts with the reasons it was wanted.
 *
 * What was proposed is never rewritten — a decision is judged against what it
 * was asked to decide — and nothing is deleted.
 */
export const aiUseCaseRequests = pgTable(
  "ai_use_case_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),
    title: text("title").notNull(),

    /** The user need or pain point, not the technology. */
    problem: text("problem").notNull(),
    /** Why AI, rather than a simpler tool, and what else was considered. */
    whyAi: text("why_ai").notNull(),
    /** What it should improve, and how anyone will know it did. */
    benefits: text("benefits").notNull(),
    userResearch: text("user_research"),
    /** The data it needs, and whether we hold it. */
    dataNeeded: text("data_needed"),
    /** Skills and infrastructure: build, buy or partner. */
    capability: text("capability"),
    stakeholderPlan: text("stakeholder_plan"),
    environmentalImpact: text("environmental_impact").notNull(),
    /** Whole pounds; ties the request to spend control thresholds. */
    expectedSpendGbp: integer("expected_spend_gbp"),
    publicFacing: boolean("public_facing").notNull().default(false),
    /** Decisions about health, safety, rights or entitlements — the Playbook's use cases to approach with most care. */
    significantDecisions: boolean("significant_decisions").notNull().default(false),

    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    requestedByLabel: text("requested_by_label").notNull(),

    status: aiRequestStatus("status").notNull().default("submitted"),
    /** 1–5. Scored by whoever manages the register, not by the proposer. */
    valueScore: integer("value_score"),
    feasibilityScore: integer("feasibility_score"),
    scoringNote: text("scoring_note"),
    scoredByUserId: uuid("scored_by_user_id").references(() => users.id, { onDelete: "set null" }),
    scoredAt: timestamp("scored_at", { withTimezone: true }),

    decisionReason: text("decision_reason"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** The register entry an accepted request became. */
    aiUseCaseId: uuid("ai_use_case_id").references(() => aiUseCases.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_use_case_request_reference").on(t.organisationId, t.reference),
    index("ai_use_case_request_status_idx").on(t.organisationId, t.status),
    check(
      "ai_use_case_request_scores",
      sql`(${t.valueScore} is null or ${t.valueScore} between 1 and 5) and (${t.feasibilityScore} is null or ${t.feasibilityScore} between 1 and 5)`,
    ),
  ],
);

/**
 * That somebody completed some AI learning.
 *
 * An attestation, not a certificate store: the person says they did it, or
 * somebody who manages people records it for them, with where the evidence is.
 * Append-only — a mistaken entry is corrected by a later one, and the record of
 * what was claimed when stays — and never deleted.
 */
export const trainingRecords = pgTable(
  "training_record",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** A key from the shipped course list, or null for learning outside it. */
    courseKey: text("course_key"),
    /** What it was called where it was taken, which may not be our name for it. */
    title: text("title").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    evidenceRef: text("evidence_ref"),
    /** True when the person recorded their own completion. */
    selfAttested: boolean("self_attested").notNull(),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    recordedByLabel: text("recorded_by_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("training_record_user_idx").on(t.organisationId, t.userId, t.courseKey)],
);
