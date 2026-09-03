import { relations } from "drizzle-orm";
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
  breachCategory,
  breachDecisionKind,
  breachDecisionOutcome,
  breachStatus,
} from "./enums";
import { entities, organisations, users } from "./tenancy";

/**
 * A personal data breach, and what was decided about it.
 *
 * Article 33(5) requires every breach to be documented — not only the ones
 * that were reported. So this register holds all of them, and a decision that
 * a breach was not notifiable is recorded here with its reasoning rather than
 * being represented by the absence of a notification.
 *
 * The two statutory judgements are deliberately separate. Article 33 asks
 * whether the breach is likely to result in a risk to rights and freedoms, and
 * if so the supervisory authority must be told within seventy-two hours.
 * Article 34 asks whether the risk is *high*, and if so the people affected
 * must be told without undue delay. A breach can be notifiable and not
 * communicable; the same field cannot answer both.
 */
export const breaches = pgTable(
  "breach",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),

    title: text("title").notNull(),
    description: text("description").notNull(),

    /**
     * Which obligations apply at all. A processor's duty under Article 33(2)
     * is to tell the controller without undue delay; it does not notify the
     * authority in its own right, and a register that conflated the two would
     * have processors reporting breaches they should be escalating.
     */
    controllerRole: text("controller_role").notNull().default("controller"),

    /**
     * When the organisation became aware. This starts the seventy-two hours,
     * not when the breach happened — Article 33(1) is explicit, and the two
     * are often weeks apart.
     */
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
    /** When it happened, where that is known. Often it is not. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    containedAt: timestamp("contained_at", { withTimezone: true }),

    categories: jsonb("categories").$type<string[]>().notNull().default([]),

    /**
     * Article 33(3)(a) asks for categories and *approximate* numbers. Nullable
     * because "not yet known" is a legitimate state at hour one, and Article
     * 33(4) expressly allows information to be given in phases.
     */
    subjectCategories: jsonb("subject_categories").$type<string[]>().notNull().default([]),
    dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),
    subjectsAffected: integer("subjects_affected"),
    recordsAffected: integer("records_affected"),
    specialCategory: boolean("special_category"),

    /** Article 33(3)(c). */
    likelyConsequences: text("likely_consequences"),
    /** Article 33(3)(d), including measures to mitigate possible adverse effects. */
    measuresTaken: text("measures_taken"),

    /**
     * Whether the data was rendered unintelligible — encryption, effective
     * pseudonymisation. Recorded here because it is the Article 34(3)(a)
     * exemption from telling the people affected, and it is a question of fact
     * that should be settled before it is relied on.
     */
    dataUnintelligible: boolean("data_unintelligible"),

    status: breachStatus("status").notNull().default("discovered"),

    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** The assessment, where one was run to reach the severity judgement. */
    assessmentId: uuid("assessment_id"),

    closedAt: timestamp("closed_at", { withTimezone: true }),
    closureRationale: text("closure_rationale"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("breach_reference_key").on(t.organisationId, t.reference),
    index("breach_status_idx").on(t.organisationId, t.status),
    // The seventy-two hours is queried by the sweep on every run.
    index("breach_discovered_idx").on(t.organisationId, t.discoveredAt),
  ],
);

/**
 * One decision about one breach, kept rather than overwritten.
 *
 * Statutory and voluntary decisions share a shape on purpose. What separates
 * them is `statutoryBasis`: an Article reference where the law compelled it,
 * empty where the organisation chose to act anyway. Contacting an insurer and
 * notifying a supervisory authority are both worth an audit trail, and only
 * one of them is required.
 */
export const breachDecisions = pgTable(
  "breach_decision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    breachId: uuid("breach_id")
      .notNull()
      .references(() => breaches.id, { onDelete: "cascade" }),

    kind: breachDecisionKind("kind").notNull(),
    outcome: breachDecisionOutcome("outcome").notNull().default("pending"),

    /**
     * The provision relied on, either to act or not to. "Article 33(1)" where
     * the authority was told; "Article 34(3)(a)" where the people affected were
     * not, because the data was unintelligible. Absent means the organisation
     * acted without being obliged to.
     */
    statutoryBasis: text("statutory_basis"),
    /** Never optional. A decision without reasoning cannot be defended later. */
    rationale: text("rationale").notNull(),

    /** Who was told, or would have been. */
    recipient: text("recipient"),
    /** A case number, ticket or acknowledgement from the recipient. */
    externalRef: text("external_ref"),

    /** When it had to be done by, where a deadline applies. */
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /**
     * Article 33(1) requires reasons where the authority is told late. Recorded
     * against the decision rather than the breach, since only one decision
     * carries that deadline.
     */
    lateReason: text("late_reason"),

    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedByLabel: text("decided_by_label").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("breach_decision_breach_idx").on(t.breachId, t.decidedAt),
    index("breach_decision_kind_idx").on(t.organisationId, t.kind, t.outcome),
  ],
);

export const breachRelations = relations(breaches, ({ many, one }) => ({
  decisions: many(breachDecisions),
  entity: one(entities, { fields: [breaches.entityId], references: [entities.id] }),
  owner: one(users, { fields: [breaches.ownerId], references: [users.id] }),
}));

export const breachDecisionRelations = relations(breachDecisions, ({ one }) => ({
  breach: one(breaches, { fields: [breachDecisions.breachId], references: [breaches.id] }),
}));
