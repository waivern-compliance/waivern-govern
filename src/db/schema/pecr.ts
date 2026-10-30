import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import {
  consentScanStatus,
  storageBasis,
  storageItemStatus,
  storageProposalChange,
  storageProposalStatus,
} from "./enums";
import { evidence, suppliers } from "./integration";
import { entities, organisations, users } from "./tenancy";

/**
 * A website or app whose cookies and similar technologies are inventoried.
 *
 * The unit Schedule A1 works at: the information people are given and the way
 * they object to statistics or preference storage belong to a service, and
 * differ from one site to the next. So both are recorded here, once, and every
 * decision on the property is checked against them.
 */
export const digitalProperties = pgTable(
  "digital_property",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    reference: text("reference").notNull(),
    name: text("name").notNull(),
    /** The site's address, or an app's store link or bundle identifier. */
    url: text("url").notNull(),
    /** website | app. Schedule A1 treats an app as a website. */
    kind: text("kind").notNull().default("website"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Where people get clear and comprehensive information: the cookie notice. */
    informationUrl: text("information_url"),
    /** How people object to statistics or preference storage, in a sentence. Schedule A1 paras 5 and 6. */
    objectionMechanism: text("objection_mechanism"),
    /** The consent platform, as last detected or entered. */
    cmp: text("cmp"),
    lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
    /**
     * How often it should be scanned again, in months. Null means no reminders:
     * a site that never changes, or one scanned by some other routine.
     */
    rescanIntervalMonths: integer("rescan_interval_months").default(3),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("digital_property_reference_key").on(t.organisationId, t.reference),
    index("digital_property_entity_idx").on(t.organisationId, t.entityId),
  ],
);

/**
 * One cookie or similar technology on one property: the inventory.
 *
 * What a scan saw — when, whether before consent or after a refusal — is
 * observation, and updated by each scan. What it is for and the basis it
 * relies on are a person's, in `storage_decision`. The scanner's own category
 * is kept beside them as a suggestion, never as a decision.
 */
export const storageItems = pgTable(
  "storage_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => digitalProperties.id, { onDelete: "cascade" }),
    /** kind, registrable domain and name: one row each, so a rescan finds it again. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    /** cookie | local_storage | session_storage | pixel | sdk | other */
    kind: text("kind").notNull().default("cookie"),
    domain: text("domain"),
    /** first | third | unknown */
    party: text("party").notNull().default("unknown"),
    /** As people would read it: "session", "13 months". */
    expiry: text("expiry"),
    /** Who receives what it collects, where that is a supplier on the register. */
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    /** What it is for, in a sentence. */
    purpose: text("purpose"),
    /** The scanner's category. A suggestion only. */
    suggestedCategory: text("suggested_category"),
    seenBeforeConsent: boolean("seen_before_consent"),
    seenAfterReject: boolean("seen_after_reject"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    status: storageItemStatus("status").notNull().default("active"),
    /** scan | manual. A manual item is never proposed as not seen: a scan may not be able to see it. */
    source: text("source").notNull().default("scan"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("storage_item_key").on(t.propertyId, t.key)],
);

/**
 * The basis one item relies on, decided by a named person with reasons, and
 * kept rather than overwritten. Changing one's mind is a second decision.
 */
export const storageDecisions = pgTable(
  "storage_decision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => storageItems.id, { onDelete: "cascade" }),
    basis: storageBasis("basis").notNull(),
    /** Which of the basis's conditions the person confirmed. */
    conditions: jsonb("conditions").$type<Record<string, boolean>>().notNull().default({}),
    /** "PECR Sch A1 para 5". */
    statutoryBasis: text("statutory_basis").notNull(),
    /** Never optional. */
    rationale: text("rationale").notNull(),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedByLabel: text("decided_by_label").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("storage_decision_item_idx").on(t.itemId, t.decidedAt)],
);

/**
 * One run of the Waivern Consent Analyser against a property.
 *
 * The report, stripped of screenshots and cookie values, is kept as evidence.
 * Its run id ties it back to the analyser, which keeps the full report.
 */
export const consentScans = pgTable(
  "consent_scan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => digitalProperties.id, { onDelete: "cascade" }),
    /** upload | api */
    source: text("source").notNull(),
    analyserRunId: text("analyser_run_id"),
    analyserUrl: text("analyser_url"),
    targetUrl: text("target_url"),
    mode: text("mode"),
    region: text("region"),
    status: consentScanStatus("status").notNull().default("done"),
    failure: text("failure"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    evidenceId: uuid("evidence_id").references(() => evidence.id, { onDelete: "set null" }),
    observed: integer("observed").notNull().default(0),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    startedByLabel: text("started_by_label").notNull(),
  },
  (t) => [
    index("consent_scan_property_idx").on(t.propertyId, t.startedAt),
    // The same analyser run is recorded once per property, however often it is uploaded.
    uniqueIndex("consent_scan_run_key").on(t.propertyId, t.analyserRunId),
  ],
);

/**
 * A change a scan suggests to the inventory, waiting for a person.
 *
 * New items are not added, and items no longer seen are not retired, until
 * somebody agrees. A scanner deciding what is on the inventory would be
 * automation making the classification.
 */
export const storageProposals = pgTable(
  "storage_proposal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => digitalProperties.id, { onDelete: "cascade" }),
    scanId: uuid("scan_id")
      .notNull()
      .references(() => consentScans.id, { onDelete: "cascade" }),
    change: storageProposalChange("change").notNull(),
    /** The item it is about, for a `not_seen` proposal; set once a `new` one is accepted. */
    itemId: uuid("item_id").references(() => storageItems.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    /** What the scan saw, for a `new` proposal: name, kind, domain, party, expiry, category, phases. */
    observed: jsonb("observed").$type<Record<string, unknown>>().notNull().default({}),
    status: storageProposalStatus("status").notNull().default("pending"),
    note: text("note"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedByLabel: text("decided_by_label"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("storage_proposal_property_idx").on(t.propertyId, t.status)],
);

export const digitalPropertyRelations = relations(digitalProperties, ({ many, one }) => ({
  items: many(storageItems),
  scans: many(consentScans),
  entity: one(entities, { fields: [digitalProperties.entityId], references: [entities.id] }),
}));

export const storageItemRelations = relations(storageItems, ({ many, one }) => ({
  decisions: many(storageDecisions),
  property: one(digitalProperties, { fields: [storageItems.propertyId], references: [digitalProperties.id] }),
}));

export const storageDecisionRelations = relations(storageDecisions, ({ one }) => ({
  item: one(storageItems, { fields: [storageDecisions.itemId], references: [storageItems.id] }),
}));

export const consentScanRelations = relations(consentScans, ({ one }) => ({
  property: one(digitalProperties, { fields: [consentScans.propertyId], references: [digitalProperties.id] }),
}));
