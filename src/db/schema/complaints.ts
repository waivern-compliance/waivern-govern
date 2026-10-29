import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { complaintEventKind, complaintOutcome, complaintStatus, dataProtectionJurisdiction } from "./enums";
import { dataSubjectRequests, dsrIntakeLinks } from "./requests";
import { entities, organisations, users } from "./tenancy";

/**
 * A complaint from a data subject to the controller, and how it was handled.
 *
 * DPA 2018 s.164A, inserted by the Data (Use and Access) Act 2025 and in force
 * from 19 June 2026: make complaining easy, acknowledge each complaint within
 * thirty days, look into it and keep the complainant informed, and tell them
 * the outcome without undue delay.
 *
 * Shaped like the request register, and restricted the same way, because it
 * holds the complainant's own personal data and often a grievance. It keeps
 * as little as will do: who they are, how to reach them, and what they said.
 */
export const dataProtectionComplaints = pgTable(
  "data_protection_complaint",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),

    /** Copied from the organisation when recorded. Only a UK complaint runs the s.164A clock. */
    jurisdiction: dataProtectionJurisdiction("jurisdiction").notNull(),
    /** s.164A is a duty of the controller. A processor passes the complaint on. */
    controllerRole: text("controller_role").notNull().default("controller"),

    channel: text("channel").notNull(),
    /** When it arrived, which starts the thirty days. */
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    /** What it is about, for reporting: request handling, accuracy, security… */
    subject: text("subject").notNull(),
    description: text("description").notNull(),

    complainantName: text("complainant_name").notNull(),
    complainantContact: text("complainant_contact"),
    /** Somebody acting for the data subject. The right is the data subject's own. */
    representative: text("representative"),
    representativeAuthorityChecked: boolean("representative_authority_checked"),

    /** The request it is about, where it is about one: late, refused or incomplete. */
    requestId: uuid("request_id").references(() => dataSubjectRequests.id, { onDelete: "set null" }),

    /** The published web form it came through, if it did. */
    intakeLinkId: uuid("intake_link_id").references(() => dsrIntakeLinks.id, { onDelete: "set null" }),

    status: complaintStatus("status").notNull().default("received"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),

    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgementChannel: text("acknowledgement_channel"),
    /** Required where the acknowledgement was after the thirty days. */
    acknowledgementLateReason: text("acknowledgement_late_reason"),

    outcome: complaintOutcome("outcome"),
    outcomeAt: timestamp("outcome_at", { withTimezone: true }),
    outcomeChannel: text("outcome_channel"),
    /** What the complainant was told, in a sentence or two. The letter lives wherever it was written. */
    outcomeSummary: text("outcome_summary"),
    /** What the organisation is changing because of it, if anything. */
    remedialAction: text("remedial_action"),
    outcomeLink: text("outcome_link"),
    /** Not required by s.164A, but what the Commission will expect to see. */
    toldOfRegulatorRight: boolean("told_of_regulator_right"),
    /** Required where the outcome came after the organisation's own target. */
    outcomeLateReason: text("outcome_late_reason"),

    closedAt: timestamp("closed_at", { withTimezone: true }),
    closureRationale: text("closure_rationale"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("data_protection_complaint_reference_key").on(t.organisationId, t.reference),
    index("data_protection_complaint_status_idx").on(t.organisationId, t.status),
    index("data_protection_complaint_received_idx").on(t.organisationId, t.receivedAt),
    index("data_protection_complaint_request_idx").on(t.requestId),
  ],
);

/**
 * One dated step in handling a complaint, appended and never edited.
 *
 * The enquiries made and the updates given are what s.164A(5) means by
 * responding, so the record of them has to survive later edits to the
 * complaint itself.
 */
export const dataProtectionComplaintEvents = pgTable(
  "data_protection_complaint_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    complaintId: uuid("complaint_id")
      .notNull()
      .references(() => dataProtectionComplaints.id, { onDelete: "cascade" }),

    kind: complaintEventKind("kind").notNull(),
    /** What was done or said. Never optional. */
    note: text("note").notNull(),
    /** How the complainant was contacted, for the steps that contact them. */
    channel: text("channel"),
    /** When it happened, which may be before it was recorded. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),

    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    recordedByLabel: text("recorded_by_label").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("data_protection_complaint_event_complaint_idx").on(t.complaintId, t.occurredAt)],
);

export const dataProtectionComplaintRelations = relations(dataProtectionComplaints, ({ many, one }) => ({
  events: many(dataProtectionComplaintEvents),
  entity: one(entities, { fields: [dataProtectionComplaints.entityId], references: [entities.id] }),
  owner: one(users, { fields: [dataProtectionComplaints.ownerId], references: [users.id] }),
  request: one(dataSubjectRequests, {
    fields: [dataProtectionComplaints.requestId],
    references: [dataSubjectRequests.id],
  }),
}));

export const dataProtectionComplaintEventRelations = relations(dataProtectionComplaintEvents, ({ one }) => ({
  complaint: one(dataProtectionComplaints, {
    fields: [dataProtectionComplaintEvents.complaintId],
    references: [dataProtectionComplaints.id],
  }),
}));
