import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
import type { LawfulBasis, RecognisedCondition } from "@/lib/gdpr/lawful-basis";
import type { AdmSafeguards, AdmSetAside, AdmSpecialCondition } from "@/lib/gdpr/automated-decisions";
import type { Art10Condition, Art9Condition, Schedule1Condition } from "@/lib/dpa2018/schedule-1";
import type { SupplierRole } from "@/lib/dpa2018/sharing";
import type { LoggingStatement, Part3Basis, Regime, Schedule8Condition, SensitiveRoute } from "@/lib/dpa2018/part3";
import type {
  Annex2Condition,
  CompatibilityFactor,
  CompatibilityRoute,
  Confirmations,
  ResearchSafeguard,
} from "@/lib/gdpr/further-processing";
import {
  deliveryStatus,
  evidenceKind,
  findingSeverity,
  integrationKind,
  recordType,
  supplierAiInvolvement,
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
    /**
     * The Article 6(1) bases relied on, as chosen. More than one is possible,
     * since different purposes in one activity can rest on different bases.
     */
    lawfulBases: jsonb("lawful_bases").$type<LawfulBasis[]>().notNull().default([]),
    /** The Annex 1 condition, where recognised legitimate interests is relied on. */
    recognisedCondition: text("recognised_condition").$type<RecognisedCondition>(),
    /**
     * Significant decisions taken solely by automated means (UK GDPR 22A–22C).
     * The same record is kept on AI use cases; where a linked pair disagrees,
     * the page offers to copy one across, and a person decides.
     * Null: not yet known.
     */
    automatedDecisions: boolean("automated_decisions"),
    admSpecialCategory: boolean("adm_special_category"),
    admSpecialCondition: text("adm_special_condition").$type<AdmSpecialCondition>(),
    admSafeguards: jsonb("adm_safeguards").$type<AdmSafeguards>().notNull().default({}),
    /** Part 3 only (s.50C(3)): the reasons the safeguards may be set aside, and how decisions are then reconsidered. */
    admSetAside: jsonb("adm_set_aside").$type<AdmSetAside>(),
    /**
     * Further processing (Article 8A): whether this purpose reuses data first
     * collected for another, and on what ground the new purpose is compatible.
     * The original activity is optional; where it is not linked, whether the
     * data was collected on consent is recorded instead, because Article 8A(4)
     * turns on it.
     */
    furtherProcessing: boolean("further_processing"),
    originalActivityId: uuid("original_activity_id").references((): AnyPgColumn => processingActivities.id, {
      onDelete: "set null",
    }),
    originalConsent: boolean("original_consent"),
    compatibilityRoute: text("compatibility_route").$type<CompatibilityRoute>(),
    annex2Condition: text("annex2_condition").$type<Annex2Condition>(),
    consentUnobtainable: boolean("consent_unobtainable"),
    compatibilityFactors: jsonb("compatibility_factors")
      .$type<Partial<Record<CompatibilityFactor, string>>>()
      .notNull()
      .default({}),
    compatibilityNote: text("compatibility_note"),
    /**
     * Part 3 (DPA 2018 s.36): the law authorising this controller to process
     * the data for this purpose — s.36(3)(a) on a Part 3 record, s.36(4) on a
     * UK GDPR one reusing law enforcement data — and, on a Part 3 record,
     * whether it is necessary and proportionate to it (s.36(3)(b)).
     */
    furtherAuthorisedBy: text("further_authorised_by"),
    furtherNecessaryProportionate: boolean("further_necessary_proportionate"),
    /**
     * Research, archiving in the public interest or statistics (Articles
     * 84A–84C) — a purpose of the processing, so a flag here rather than a
     * register of its own — with the 84C safeguards confirmed, and Article
     * 13(5) where telling people would be impossible or disproportionate.
     */
    research: boolean("research"),
    researchSafeguards: jsonb("research_safeguards")
      .$type<Confirmations<ResearchSafeguard>>()
      .notNull()
      .default({}),
    approvedMedicalResearch: boolean("approved_medical_research"),
    art13Exemption: boolean("art13_exemption"),
    publicInformationUrl: text("public_information_url"),
    /**
     * Whether an online service in this processing is likely to be accessed by
     * children (Article 25(1A)). Where it is, the measures must take the
     * children's higher protection matters into account, and the register
     * looks for a DPIA that says how. Null: not yet known.
     */
    childrenLikely: boolean("children_likely"),
    /**
     * For a public authority: this processing is not in the performance of its
     * tasks, so the Article 6(1) bar on legitimate interests does not reach it.
     * A person says so; nothing infers it.
     */
    outsidePublicTasks: boolean("outside_public_tasks").notNull().default(false),
    /**
     * Special category data (Article 9) and criminal offence data (Article
     * 10), with the conditions relied on: the Article 9(2) point, the Data
     * Protection Act 2018 Schedule 1 condition where that point needs one,
     * and the Article 10 condition. Null: not yet known.
     */
    specialCategory: boolean("special_category"),
    art9Condition: text("art9_condition").$type<Art9Condition>(),
    schedule1Condition: text("schedule1_condition").$type<Schedule1Condition>(),
    criminalOffence: boolean("criminal_offence"),
    art10Condition: text("art10_condition").$type<Art10Condition>(),
    /**
     * Schedule 1 paragraph 41(c): where a condition needs an appropriate
     * policy document, whether retention and erasure followed its policy,
     * and why not where they did not.
     */
    retentionFollowsPolicy: boolean("retention_follows_policy"),
    retentionPolicyNote: text("retention_policy_note"),
    /**
     * The regime: UK GDPR, or law enforcement processing under Part 3 of the
     * Data Protection Act 2018, available only on a competent authority's
     * entity. A police force's staff records are UK GDPR; its investigations
     * are Part 3.
     */
    regime: text("regime").$type<Regime>().notNull().default("uk_gdpr"),
    /** Part 3: how s.35(2) is met. */
    part3Basis: text("part3_basis").$type<Part3Basis>(),
    /** Part 3: sensitive processing (s.35(8)), and the route and Schedule 8 condition relied on. */
    sensitiveProcessing: boolean("sensitive_processing"),
    sensitiveRoute: text("sensitive_route").$type<SensitiveRoute>(),
    schedule8Condition: text("schedule8_condition").$type<Schedule8Condition>(),
    /** Part 3: whether fact is distinguished from personal assessment (s.38(2)). */
    factOpinionMarked: boolean("fact_opinion_marked"),
    /** Part 3: what each system logs and who checks (s.62). Statements only; never the logs. */
    logging: jsonb("logging").$type<LoggingStatement[]>().notNull().default([]),
    /**
     * The basis as somebody wrote it — before the bases above existed, or as the
     * Portal sends it. Kept as a note: where it named a basis unambiguously, that
     * basis was chosen from it; where it did not, nothing was guessed.
     */
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
     * What it is to us. Article 28 reaches processors; another controller is
     * shared with under a data sharing agreement instead.
     */
    role: text("role").$type<SupplierRole>().notNull().default("processor"),
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
    /**
     * Whether it uses or supplies AI. Only the fact of it: what the AI does
     * with our data and what the contract says are judged in the supplier's
     * AI assessment, and read from there.
     */
    aiInvolvement: supplierAiInvolvement("ai_involvement"),
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
    /**
     * When this agreement stopped being part of the live register.
     *
     * Distinct from expiry, which is what the contract says. An agreement can
     * end early — terminated, superseded, or recorded in error — and before
     * this column the only way to express that was to falsify the expiry date.
     * Archiving takes it out of the "in force" calculation and stops the
     * renewal reminders; it never removes the row, because a register has to
     * be able to say which contract governed processing in a past year.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: uuid("archived_by").references(() => users.id, { onDelete: "set null" }),
    /** Required when archiving: an agreement that vanished without a stated reason is worse than one still listed. */
    archivedReason: text("archived_reason"),
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
