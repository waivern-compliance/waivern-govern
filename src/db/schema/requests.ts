import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  dataProtectionJurisdiction,
  dsrDecisionKind,
  dsrDecisionOutcome,
  dsrRecipientNotice,
  dsrScopeKind,
  dsrScopeStatus,
  dsrStatus,
} from "./enums";
import { processingActivities, suppliers } from "./integration";
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
/**
 * A published web form for making a request, one per entity.
 *
 * The slug is random and stored as it is, unlike a contributor link's token:
 * this address is meant to be published in a privacy notice, so it is not a
 * secret, only unguessable. Withdrawing it stops the form; a new one gets a
 * new address.
 */
export const dsrIntakeLinks = pgTable(
  "dsr_intake_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    slug: text("slug").notNull().unique(),
    /** Where it is published, for the handler: "Studios privacy notice". */
    label: text("label").notNull(),
    submissions: integer("submissions").notNull().default(0),
    lastSubmittedAt: timestamp("last_submitted_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [index("dsr_intake_link_org_idx").on(t.organisationId, t.entityId)],
);

/**
 * One submission attempt through a web form, kept for a day to limit how
 * often one address can submit. The address is hashed with a secret, so the
 * row cannot be turned back into somebody's IP, and nothing ties it to the
 * request that may have resulted.
 */
export const dsrIntakeAttempts = pgTable(
  "dsr_intake_attempt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    linkId: uuid("link_id")
      .notNull()
      .references(() => dsrIntakeLinks.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("dsr_intake_attempt_link_idx").on(t.linkId, t.createdAt)],
);

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

    /** The published web form it came through, if it did. */
    intakeLinkId: uuid("intake_link_id").references(() => dsrIntakeLinks.id, { onDelete: "set null" }),

    /**
     * Where this organisation is the processor: the controller the request was
     * passed to, when, and what help was given (Article 28(3)(e)).
     */
    controllerName: text("controller_name"),
    passedToControllerAt: timestamp("passed_to_controller_at", { withTimezone: true }),
    assistanceSummary: text("assistance_summary"),

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
    /**
     * The processing activity an objection is about. One decision per
     * activity, so each can be counted against it and the balancing test
     * behind it revisited when people keep objecting.
     */
    processingActivityId: uuid("processing_activity_id").references(() => processingActivities.id, {
      onDelete: "set null",
    }),
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
    index("data_subject_request_decision_activity_idx").on(t.processingActivityId, t.effectiveAt),
  ],
);

/**
 * One place a request's data might be, and what happened there.
 *
 * Seeded from the ROPA when the request is recorded: the activities whose
 * data subjects match who the requester is, the systems those activities use,
 * and the suppliers and other recipients they disclose to. It is what makes a
 * reasonable and proportionate search something the handler can show, and it
 * is the Article 19 list of whom to tell after a correction, erasure or
 * restriction.
 *
 * The label is copied in, so the record still reads after the activity or
 * supplier it came from is renamed or removed.
 */
export const dataSubjectRequestScope = pgTable(
  "data_subject_request_scope",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => dataSubjectRequests.id, { onDelete: "cascade" }),

    kind: dsrScopeKind("kind").notNull(),
    /** What makes the entry unique within the request, so seeding twice adds nothing. */
    key: text("key").notNull(),
    processingActivityId: uuid("processing_activity_id").references(() => processingActivities.id, {
      onDelete: "set null",
    }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    /** Why it is in scope: "customer in PA-0003", "recipient in PA-0003", "added by hand". */
    reason: text("reason").notNull(),
    /** Given the data, so told under Article 19 after a correction, erasure or restriction. */
    isRecipient: boolean("is_recipient").notNull().default(false),

    status: dsrScopeStatus("status").notNull().default("to_search"),
    note: text("note"),
    checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
    checkedByLabel: text("checked_by_label"),
    checkedAt: timestamp("checked_at", { withTimezone: true }),

    recipientNotice: dsrRecipientNotice("recipient_notice"),
    recipientNoticeAt: timestamp("recipient_notice_at", { withTimezone: true }),
    recipientNoticeNote: text("recipient_notice_note"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("data_subject_request_scope_key").on(t.requestId, t.key)],
);

export const dataSubjectRequestRelations = relations(dataSubjectRequests, ({ many, one }) => ({
  decisions: many(dataSubjectRequestDecisions),
  scope: many(dataSubjectRequestScope),
  entity: one(entities, { fields: [dataSubjectRequests.entityId], references: [entities.id] }),
  owner: one(users, { fields: [dataSubjectRequests.ownerId], references: [users.id] }),
}));

export const dataSubjectRequestDecisionRelations = relations(dataSubjectRequestDecisions, ({ one }) => ({
  request: one(dataSubjectRequests, {
    fields: [dataSubjectRequestDecisions.requestId],
    references: [dataSubjectRequests.id],
  }),
}));

export const dataSubjectRequestScopeRelations = relations(dataSubjectRequestScope, ({ one }) => ({
  request: one(dataSubjectRequests, {
    fields: [dataSubjectRequestScope.requestId],
    references: [dataSubjectRequests.id],
  }),
}));
