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
  deliveryStatus,
  evidenceKind,
  findingSeverity,
  integrationKind,
  recordType,
} from "./enums";
import { risks } from "./risks";
import { entities, organisations, users } from "./tenancy";

/**
 * A system permitted to push records in, and to be told when things change.
 *
 * One row per producing system per client, each with its own secret, so a
 * compromised scanner cannot impersonate the portal and revoking one does not
 * disturb the other.
 */
export const integrationConnections = pgTable(
  "integration_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    kind: integrationKind("kind").notNull(),
    name: text("name").notNull(),

    /** AES-256-GCM, keyed outside the database. See lib/integration/crypto. */
    secretCiphertext: text("secret_ciphertext").notNull(),
    secretIv: text("secret_iv").notNull(),
    secretTag: text("secret_tag").notNull(),

    /** Where this system's records land when they name no entity. */
    defaultEntityId: uuid("default_entity_id").references(() => entities.id, {
      onDelete: "set null",
    }),
    /** Outbound events go here, if the system wants them. */
    webhookUrl: text("webhook_url"),

    isActive: boolean("is_active").notNull().default(true),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integration_connection_key").on(t.organisationId, t.kind, t.name)],
);

/**
 * An Article 30 record.
 *
 * Assessments already bind to a subject, so a processing activity pushed in
 * from the portal becomes something a DPIA can be *about* rather than a
 * standalone list nobody reads.
 */
export const processingActivities = pgTable(
  "processing_activity",
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
    description: text("description"),

    purposes: jsonb("purposes").$type<string[]>().notNull().default([]),
    lawfulBasis: text("lawful_basis"),
    /** Categories only. Never identities — that is out of scope by design. */
    dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),
    subjectCategories: jsonb("subject_categories").$type<string[]>().notNull().default([]),
    recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
    systems: jsonb("systems").$type<string[]>().notNull().default([]),
    transfers: jsonb("transfers")
      .$type<Array<{ country: string; mechanism?: string }>>()
      .notNull()
      .default([]),
    retention: text("retention"),
    controllerRole: text("controller_role"),
    /**
     * Article 30(1)(g) — a general description of the technical and
     * organisational measures. Qualified by "where possible" in the Regulation,
     * so its absence is reported as incomplete rather than as a breach.
     */
    securityMeasures: text("security_measures"),
    /**
     * Named when this organisation acts as processor, since Article 30(2)(a)
     * requires each controller on whose behalf the processing is carried out.
     */
    controllerName: text("controller_name"),
    /**
     * The person accountable for keeping this record true. Nullable, because a
     * record nobody owns is a real and reportable state, and refusing to store
     * one until somebody volunteers is how a RoPA goes stale unnoticed.
     */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),

    /** Which system this came from, and its identifier over there. */
    sourceConnectionId: uuid("source_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "set null" },
    ),
    externalRef: text("external_ref"),

    reviewDueAt: timestamp("review_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("processing_activity_reference").on(t.organisationId, t.reference),
    // The producing system's own identifier is what makes a re-push an update
    // rather than a duplicate.
    uniqueIndex("processing_activity_external")
      .on(t.organisationId, t.sourceConnectionId, t.externalRef)
      .where(sql`${t.externalRef} is not null`),
    index("processing_activity_entity_idx").on(t.organisationId, t.entityId),
  ],
);

/** A supplier, and the data-processing terms agreed with them. */
export const suppliers = pgTable(
  "supplier",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Lower-cased, punctuation-stripped name, so two spellings do not become two rows. */
    canonicalKey: text("canonical_key").notNull(),
    description: text("description"),
    categories: jsonb("categories").$type<string[]>().notNull().default([]),
    /**
     * Who is accountable for this relationship. Nullable, because a supplier
     * nobody owns is a real and reportable state.
     */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /**
     * When a person last confirmed this is a real processor relationship.
     *
     * A scanner creates suppliers from trackers it sees on a page, so the
     * register fills with names nobody has triaged. Without this, "a tool
     * noticed a third party" and "we know this is our processor" are the same
     * row, and the ones needing attention cannot be told apart.
     */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    sourceConnectionId: uuid("source_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "set null" },
    ),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("supplier_canonical_key").on(t.organisationId, t.canonicalKey)],
);

export const dpas = pgTable(
  "dpa",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    documentRef: text("document_ref"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Article 28 terms the producing system found, as it found them. */
    terms: jsonb("terms").$type<Record<string, unknown>>().notNull().default({}),
    transferMechanism: text("transfer_mechanism"),
    subProcessors: jsonb("sub_processors").$type<string[]>().notNull().default([]),
    sourceConnectionId: uuid("source_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "set null" },
    ),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("dpa_supplier_idx").on(t.supplierId),
    index("dpa_expiry_idx").on(t.organisationId, t.expiresAt),
  ],
);

/** Something that supports a governance record: a document, a scan, an attestation. */
export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    kind: evidenceKind("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    uri: text("uri"),
    sha256: text("sha256"),
    /** When the evidence was gathered, which is not when it was pushed here. */
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    sourceConnectionId: uuid("source_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "set null" },
    ),
    externalRef: text("external_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("evidence_external")
      .on(t.organisationId, t.sourceConnectionId, t.externalRef)
      .where(sql`${t.externalRef} is not null`),
    index("evidence_entity_idx").on(t.organisationId, t.entityId),
  ],
);

/**
 * One observation from a scan.
 *
 * Findings arrive with the scanner's own severity and stay that way. Nothing
 * here becomes a risk on its own: `advisory` carries what the scanner suggests,
 * and a named human converts it, which is recorded in `convertedRiskId`. A
 * scanner deciding what is a governance risk would be automation making the
 * classification, which is exactly what this platform must not do.
 */
export const scanFindings = pgTable(
  "scan_finding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "restrict" }),
    evidenceId: uuid("evidence_id").references(() => evidence.id, { onDelete: "cascade" }),

    /** Identifies the scan run this came from, so a re-scan is comparable. */
    scanRef: text("scan_ref").notNull(),
    url: text("url"),
    category: text("category").notNull(),
    severity: findingSeverity("severity").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),

    vendor: text("vendor"),
    cookieName: text("cookie_name"),
    /** The finding that matters most under ePrivacy: set before any consent. */
    setBeforeConsent: boolean("set_before_consent"),
    thirdCountry: text("third_country"),

    /** The scanner's suggestion. Advisory, never acted on automatically. */
    advisory: jsonb("advisory").$type<Record<string, unknown>>().notNull().default({}),
    convertedRiskId: uuid("converted_risk_id").references(() => risks.id, {
      onDelete: "set null",
    }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedReason: text("dismissed_reason"),

    sourceConnectionId: uuid("source_connection_id").references(
      () => integrationConnections.id,
      { onDelete: "set null" },
    ),
    externalRef: text("external_ref").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("scan_finding_external").on(t.organisationId, t.externalRef),
    index("scan_finding_scan_idx").on(t.organisationId, t.scanRef),
    index("scan_finding_open_idx").on(t.organisationId, t.dismissedAt),
  ],
);

/**
 * A typed edge between any two records.
 *
 * Doing more work than it looks: it satisfies "links between processing
 * activities and assessments" directly, and it is the substrate for the AI
 * workflow graph. Store the edges properly and the visualisation is a rendering
 * problem rather than a migration.
 */
export const recordLinks = pgTable(
  "record_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    fromType: recordType("from_type").notNull(),
    fromId: uuid("from_id").notNull(),
    toType: recordType("to_type").notNull(),
    toId: uuid("to_id").notNull(),
    relation: text("relation").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("record_link_key").on(t.fromType, t.fromId, t.toType, t.toId, t.relation),
    index("record_link_from_idx").on(t.fromType, t.fromId),
    index("record_link_to_idx").on(t.toType, t.toId),
  ],
);

/** An outbound event, and how its delivery went. */
export const webhookDeliveries = pgTable(
  "webhook_delivery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => integrationConnections.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    targetUrl: text("target_url").notNull(),
    status: deliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    /** Stops one state change producing two deliveries. */
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("webhook_delivery_key").on(t.connectionId, t.idempotencyKey),
    index("webhook_delivery_pending_idx").on(t.status, t.nextAttemptAt),
  ],
);

export const integrationConnectionRelations = relations(
  integrationConnections,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [integrationConnections.organisationId],
      references: [organisations.id],
    }),
  }),
);

export const scanFindingRelations = relations(scanFindings, ({ one }) => ({
  evidence: one(evidence, {
    fields: [scanFindings.evidenceId],
    references: [evidence.id],
  }),
  risk: one(risks, { fields: [scanFindings.convertedRiskId], references: [risks.id] }),
}));
