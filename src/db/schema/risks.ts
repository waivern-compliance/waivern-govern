import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { assessments } from "./assessments";
import {
  appetiteLevel,
  appetiteStatus,
  mitigationStatus,
  riskScale,
  riskSource,
  riskStatus,
  riskTier,
  treatmentType,
} from "./enums";
import { entities, organisations, users } from "./tenancy";

/**
 * A risk on the register.
 *
 * Inherent and residual are both stored as their likelihood and impact inputs
 * *and* their derived score and tier. Storing the derivation is what lets a
 * dashboard filter by tier without recomputing; storing the inputs is what lets
 * anyone check the derivation. Neither is enough on its own.
 */
export const risks = pgTable(
  "risk",
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
    description: text("description").notNull(),
    category: text("category"),

    source: riskSource("source").notNull().default("manual"),
    /** The assessment this risk came out of, where it came from one. */
    assessmentId: uuid("assessment_id").references(() => assessments.id, {
      onDelete: "set null",
    }),

    /** Named human accountable for the risk. Not the person who accepts it. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),

    /**
     * The scale the ratings below are on. Fixed when the risk is raised, from
     * the organisation's choice at the time, so the database can check every
     * score and tier against the scale it was actually given on.
     */
    scale: riskScale("scale").notNull().default("4x4"),
    inherentLikelihood: integer("inherent_likelihood").notNull(),
    inherentImpact: integer("inherent_impact").notNull(),
    inherentScore: integer("inherent_score").notNull(),
    inherentTier: riskTier("inherent_tier").notNull(),

    /** Null until someone has judged the risk after its mitigations. */
    residualLikelihood: integer("residual_likelihood"),
    residualImpact: integer("residual_impact"),
    residualScore: integer("residual_score"),
    residualTier: riskTier("residual_tier"),

    status: riskStatus("status").notNull().default("identified"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Driven by the acceptance expiry, or set directly. */
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("risk_reference_key").on(t.organisationId, t.reference),
    index("risk_status_idx").on(t.organisationId, t.status),
    index("risk_entity_idx").on(t.organisationId, t.entityId),
    index("risk_residual_idx").on(t.organisationId, t.residualTier),
    index("risk_review_idx").on(t.organisationId, t.nextReviewAt),
    index("risk_assessment_idx").on(t.assessmentId),
  ],
);

/** Something being done about a risk, with a named owner and a date. */
export const mitigations = pgTable(
  "mitigation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    riskId: uuid("risk_id")
      .notNull()
      .references(() => risks.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    /** Reference into the client's own control framework, where they have one. */
    controlRef: text("control_ref"),
    /** Null for mitigations recorded before treatment types were asked for. */
    treatmentType: treatmentType("treatment_type"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: mitigationStatus("status").notNull().default("planned"),

    implementedAt: timestamp("implemented_at", { withTimezone: true }),
    /** Verification is a second pair of eyes, not the owner marking their own work. */
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    evidenceRef: text("evidence_ref"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mitigation_risk_idx").on(t.riskId),
    index("mitigation_due_idx").on(t.dueAt),
  ],
);

/**
 * A named human taking responsibility for living with a risk.
 *
 * Append-only. Accepting again after expiry supersedes the previous record
 * rather than editing it, so the register shows who accepted what, on what
 * grounds, and for how long — which is the only reason a risk acceptance is
 * worth recording at all.
 *
 * Every acceptance expires. An acceptance without an end date is how a register
 * fills up with decisions nobody remembers taking, made against facts that
 * stopped being true years ago.
 */
export const riskAcceptances = pgTable(
  "risk_acceptance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    riskId: uuid("risk_id")
      .notNull()
      .references(() => risks.id, { onDelete: "cascade" }),

    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Kept even if the user row is later removed. */
    acceptedByLabel: text("accepted_by_label").notNull(),
    rationale: text("rationale").notNull(),

    /** The residual rating at the moment of acceptance, so later drift is visible. */
    residualScoreAtAcceptance: integer("residual_score_at_acceptance").notNull(),
    residualTierAtAcceptance: riskTier("residual_tier_at_acceptance").notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("risk_acceptance_risk_idx").on(t.riskId),
    index("risk_acceptance_expiry_idx").on(t.expiresAt),
  ],
);

/**
 * How much risk of one category the organisation will carry, signed off.
 *
 * DSIT's toolkit asks for appetite to be set per risk category, at
 * organisational level, and signed off by the board — and calls it the hardest
 * part of the whole exercise. Without it "within appetite" means whatever the
 * platform assumed; with it, a fairness risk and a financial risk can be held
 * to different standards, as they should be.
 *
 * Append-only in substance. A change of appetite is a new statement that,
 * once approved, supersedes the old one: the register shows what the appetite
 * was when a risk was accepted, not only what it is now. Proposing and
 * approving are separate people, as for any other decision here.
 */
export const riskAppetites = pgTable(
  "risk_appetite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),

    /**
     * A category from `lib/risk/categories.ts`, or "default" for the statement
     * that applies to any risk without a category-level one.
     */
    category: text("category").notNull(),
    level: appetiteLevel("level").notNull(),
    /**
     * The highest residual tier still within appetite. The level says it in
     * words; this says it in a form a register can check, which is the
     * toolkit's "clearly defined and measurable".
     */
    toleratedTier: riskTier("tolerated_tier").notNull(),
    statement: text("statement").notNull(),
    status: appetiteStatus("status").notNull().default("proposed"),

    proposedByUserId: uuid("proposed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    proposedByLabel: text("proposed_by_label").notNull(),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull().defaultNow(),

    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedByLabel: text("decided_by_label"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Where it was signed off — the board, the date, the minute. */
    approvalReference: text("approval_reference"),
    rejectionReason: text("rejection_reason"),

    reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One statement in force per category, and one waiting for a decision.
    uniqueIndex("risk_appetite_current")
      .on(t.organisationId, t.category)
      .where(sql`${t.status} = 'approved'`),
    uniqueIndex("risk_appetite_pending")
      .on(t.organisationId, t.category)
      .where(sql`${t.status} = 'proposed'`),
    index("risk_appetite_org_idx").on(t.organisationId, t.category),
  ],
);

export const riskRelations = relations(risks, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [risks.organisationId],
    references: [organisations.id],
  }),
  entity: one(entities, { fields: [risks.entityId], references: [entities.id] }),
  owner: one(users, { fields: [risks.ownerId], references: [users.id] }),
  assessment: one(assessments, {
    fields: [risks.assessmentId],
    references: [assessments.id],
  }),
  mitigations: many(mitigations),
  acceptances: many(riskAcceptances),
}));

export const mitigationRelations = relations(mitigations, ({ one }) => ({
  risk: one(risks, { fields: [mitigations.riskId], references: [risks.id] }),
  owner: one(users, { fields: [mitigations.ownerId], references: [users.id] }),
}));

export const riskAcceptanceRelations = relations(riskAcceptances, ({ one }) => ({
  risk: one(risks, { fields: [riskAcceptances.riskId], references: [risks.id] }),
}));
