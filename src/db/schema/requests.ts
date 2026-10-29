import { relations } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  dataProtectionJurisdiction,
  dsrDecisionKind,
  dsrDecisionOutcome,
  dsrStatus,
} from "./enums";
import { entities, organisations, users } from "./tenancy";

/**
 * A request from a data subject exercising their rights, and how it was handled.
 *
 * Shaped like the breach register on purpose. Both are statutory clocks with
 * judgements along the way, and both have to be defensible afterwards: the
 * record holds the facts, and every judgement is a separate decision with its
 * reasoning, kept rather than overwritten.
 *
 * This table holds the requester's own personal data, so it holds as little
 * as will do: who they are and how to reach them, and how their identity was
 * checked — never a copy of the document they proved it with.
 */
export const dataSubjectRequests = pgTable(
  "data_subject_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),

    /** Copied from the organisation when recorded, so a later change never moves this deadline. */
    jurisdiction: dataProtectionJurisdiction("jurisdiction").notNull(),
    /**
     * A processor does not answer the request. Under Article 28(3)(e) it passes
     * it to the controller and helps, and a register that treated the two alike
     * would have processors replying to people they have no relationship with.
     */
    controllerRole: text("controller_role").notNull().default("controller"),

    /** Which rights are invoked. One letter often invokes several. */
    rights: jsonb("rights").$type<string[]>().notNull().default([]),
    /** How it arrived. Any channel counts: a request need not use a form or name the Article. */
    channel: text("channel").notNull(),
    /** When it arrived — not when somebody noticed it. */
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    description: text("description").notNull(),

    requesterName: text("requester_name").notNull(),
    requesterContact: text("requester_contact"),
    /** A solicitor, parent or anyone else acting for the person. */
    representative: text("representative"),
    /** Whether the representative's authority to act was checked. Null where there is none. */
    representativeAuthorityChecked: boolean("representative_authority_checked"),
    /** Customer, employee, applicant: decides where to look. */
    subjectCategories: jsonb("subject_categories").$type<string[]>().notNull().default([]),

    /**
     * Article 12(6). Asking for proof is only for reasonable doubt, and while it
     * is awaited the month does not start. The method is recorded; the proof is not.
     */
    identityRequestedAt: timestamp("identity_requested_at", { withTimezone: true }),
    identityVerifiedAt: timestamp("identity_verified_at", { withTimezone: true }),
    identityMethod: text("identity_method"),

    status: dsrStatus("status").notNull().default("received"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),

    respondedAt: timestamp("responded_at", { withTimezone: true }),
    responseChannel: text("response_channel"),
    /** What was sent, in a sentence or two. The letter itself lives wherever it was written. */
    responseSummary: text("response_summary"),
    /** Where the letter or pack is kept, if somewhere linkable. */
    responseLink: text("response_link"),
    /** Article 12(4): required in any response that does not do what was asked. */
    toldOfComplaintRight: boolean("told_of_complaint_right"),
    lateReason: text("late_reason"),

    closedAt: timestamp("closed_at", { withTimezone: true }),
    closureRationale: text("closure_rationale"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("data_subject_request_reference_key").on(t.organisationId, t.reference),
    index("data_subject_request_status_idx").on(t.organisationId, t.status),
    // The month is worked out from here by the sweep on every run.
    index("data_subject_request_received_idx").on(t.organisationId, t.receivedAt),
  ],
);

/**
 * One decision about one request, kept rather than overwritten.
 *
 * Pausing for clarification and extending the time are decisions here too,
 * because they move the deadline: the date a request was due has to be
 * reproducible from the record, not only from whatever the field says today.
 */
export const dataSubjectRequestDecisions = pgTable(
  "data_subject_request_decision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => dataSubjectRequests.id, { onDelete: "cascade" }),

    kind: dsrDecisionKind("kind").notNull(),
    outcome: dsrDecisionOutcome("outcome").notNull().default("done"),
    /** Which of the request's rights this decides, where it is about one. */
    right: text("right"),
    /** The provision relied on: "Article 12(3)", "Article 17(3)(b)", "DPA 2018 Sch. 2 para 19". */
    statutoryBasis: text("statutory_basis"),
    /**
     * The lawful basis of the processing objected to. Article 21 turns on it:
     * absolute for direct marketing, open to compelling grounds for public task
     * and legitimate interests, and not engaged at all otherwise.
     */
    processingBasis: text("processing_basis"),
    /** Never optional. */
    rationale: text("rationale").notNull(),
    /** When it took effect, which for a pause is when the clock stopped. */
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),

    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedByLabel: text("decided_by_label").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("data_subject_request_decision_request_idx").on(t.requestId, t.decidedAt),
    index("data_subject_request_decision_kind_idx").on(t.organisationId, t.kind, t.outcome),
  ],
);

export const dataSubjectRequestRelations = relations(dataSubjectRequests, ({ many, one }) => ({
  decisions: many(dataSubjectRequestDecisions),
  entity: one(entities, { fields: [dataSubjectRequests.entityId], references: [entities.id] }),
  owner: one(users, { fields: [dataSubjectRequests.ownerId], references: [users.id] }),
}));

export const dataSubjectRequestDecisionRelations = relations(dataSubjectRequestDecisions, ({ one }) => ({
  request: one(dataSubjectRequests, {
    fields: [dataSubjectRequestDecisions.requestId],
    references: [dataSubjectRequests.id],
  }),
}));
