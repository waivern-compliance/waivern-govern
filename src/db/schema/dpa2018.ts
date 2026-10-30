import { index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { PolicyKey } from "@/lib/dpa2018/policy-keys";
import type { Art10Condition, Schedule1Condition } from "@/lib/dpa2018/schedule-1";
import type { GatewayKind, SharingDirection } from "@/lib/dpa2018/sharing";
import type { LawfulBasis } from "@/lib/gdpr/lawful-basis";
import { processingActivities, suppliers } from "./integration";
import { entities, organisations, users } from "./tenancy";

/**
 * The appropriate policy documents (Data Protection Act 2018 Schedule 1,
 * Part 4): what each covers, who owns it and when it was last reviewed.
 *
 * Govern does not write the document; it needs to know one exists and which
 * conditions it covers, because whether a Schedule 1 condition is met turns
 * on it. The document itself is attached through the `document` table.
 * Withdrawn rather than deleted, because it must be kept for six months after
 * the controller stops relying on it (paragraph 40).
 */
export const policyDocuments = pgTable(
  "policy_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    /** The controller it is for. Null: every entity in the organisation. */
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    version: text("version"),
    /** Schedule 1 conditions, and Part 3 sensitive processing on consent or a Schedule 8 condition. */
    conditions: jsonb("conditions").$type<PolicyKey[]>().notNull().default([]),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("policy_document_org_idx").on(t.organisationId)],
);

/**
 * Data sharing agreements between controllers: ours with another controller
 * on the third-party register, about the processing activities that share.
 *
 * Separate from the Article 28 agreements on `dpa`, which govern processors.
 * Each controller's basis is recorded for its own side, because each needs
 * one: ours here, the others' on `sharing_agreement_party`.
 */
export const sharingAgreements = pgTable(
  "sharing_agreement",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    /** The controller on our side. */
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    purpose: text("purpose"),
    direction: text("direction").$type<SharingDirection>().notNull().default("both"),
    /** Where the power to share comes from, and the enactment or power named. */
    gatewayKind: text("gateway_kind").$type<GatewayKind>(),
    gateway: text("gateway"),
    /** Categories only, as on the ROPA. */
    dataShared: text("data_shared"),
    lawfulBases: jsonb("lawful_bases").$type<LawfulBasis[]>().notNull().default([]),
    schedule1Condition: text("schedule1_condition").$type<Schedule1Condition>(),
    art10Condition: text("art10_condition").$type<Art10Condition>(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    /** No longer in force: it stops covering anything, and is kept. */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sharing_agreement_reference").on(t.organisationId, t.reference),
    index("sharing_agreement_entity_idx").on(t.organisationId, t.entityId),
  ],
);

/** Another controller party to an agreement, with its own basis for its side. */
export const sharingAgreementParties = pgTable(
  "sharing_agreement_party",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => sharingAgreements.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    lawfulBases: jsonb("lawful_bases").$type<LawfulBasis[]>().notNull().default([]),
    schedule1Condition: text("schedule1_condition").$type<Schedule1Condition>(),
    art10Condition: text("art10_condition").$type<Art10Condition>(),
    note: text("note"),
  },
  (t) => [uniqueIndex("sharing_agreement_party_key").on(t.agreementId, t.supplierId)],
);

/** The processing activities whose recipients an agreement covers. */
export const sharingAgreementActivities = pgTable(
  "sharing_agreement_activity",
  {
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => sharingAgreements.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => processingActivities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.agreementId, t.activityId] }), index("sharing_agreement_activity_idx").on(t.activityId)],
);
