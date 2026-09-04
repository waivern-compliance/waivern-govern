import {
  type AnyPgColumn,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { documents } from "./documents";
import {
  extractionFindingKind,
  extractionLinkStatus,
  extractionSourceKind,
  recordType,
  suggestionStatus,
} from "./enums";
import { entities, organisations, users } from "./tenancy";

/**
 * A reading of somebody's agreement by a model, and what it claimed to find.
 *
 * Kept as its own record rather than written straight into the register,
 * because the register is a statement the organisation makes about itself and
 * a model cannot make one. Every finding here is a proposal with a quote and a
 * source attached; accepting it is a person's act, recorded as theirs.
 *
 * The run is retained whether or not anything was accepted. A rejected
 * proposal is evidence that somebody looked, and keeping only what was agreed
 * with would leave a trail showing diligence that never happened.
 */
export const extractions = pgTable(
  "extraction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "restrict" }),

    /** The agreement or the supplier this was run against. */
    subjectType: recordType("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),

    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),

    /**
     * Every source the model was shown, by the label it was told to cite.
     *
     * This is what makes a citation checkable: a finding says "S2", and this
     * says S2 was that file with that hash, or that URL fetched at that time.
     */
    sources: jsonb("sources")
      .$type<
        Array<{
          label: string;
          kind: "document" | "web_page";
          name: string;
          documentId?: string;
          url?: string;
          sha256?: string;
          fetchedAt?: string;
          characters: number;
        }>
      >()
      .notNull()
      .default([]),

    /** Files that could not be read, and why. Said plainly rather than dropped. */
    unreadable: jsonb("unreadable")
      .$type<Array<{ name: string; reason: string }>>()
      .notNull()
      .default([]),

    /** What minimisation removed before the text left the platform. */
    redactions: jsonb("redactions")
      .$type<Array<{ kind: string; count: number }>>()
      .notNull()
      .default([]),

    notes: text("notes"),
    /** Set when the model could not be reached or its answer made no sense. */
    failure: text("failure"),

    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    requestedByLabel: text("requested_by_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("extraction_subject_idx").on(t.subjectType, t.subjectId, t.createdAt),
    index("extraction_org_idx").on(t.organisationId, t.createdAt),
  ],
);

/**
 * One transfer mechanism or one sub-processor, with the provenance to check it.
 *
 * The provenance columns are the point of the table. A name on its own is a
 * rumour; a name with the file it came from, the hash of that file, the page
 * it was fetched from and the sentence it was taken from is something a
 * reviewer can verify and a regulator can be shown.
 */
export const extractionFindings = pgTable(
  "extraction_finding",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => extractions.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    kind: extractionFindingKind("kind").notNull(),
    /** The mechanism, or the sub-processor's name as written. */
    value: text("value").notNull(),
    detail: text("detail"),
    country: text("country"),

    /** Copied from the source, so a reviewer reads the clause, not a summary. */
    quote: text("quote").notNull(),

    sourceLabel: text("source_label").notNull(),
    sourceKind: extractionSourceKind("source_kind").notNull(),
    /**
     * The file it came from. Restricted rather than cascaded: deleting a
     * document that a register entry rests on should require dealing with the
     * entry first.
     */
    sourceDocumentId: uuid("source_document_id").references(() => documents.id, {
      onDelete: "restrict",
    }),
    sourceUrl: text("source_url"),
    /** Of the file, or of the page as fetched — so a later change is visible. */
    sourceSha256: text("source_sha256"),
    sourceFetchedAt: timestamp("source_fetched_at", { withTimezone: true }),

    status: suggestionStatus("status").notNull().default("proposed"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("extraction_finding_run_idx").on(t.extractionId, t.kind),
    index("extraction_finding_open_idx").on(t.organisationId, t.status),
  ],
);

/**
 * An address the agreement gives for its sub-processor list.
 *
 * Held rather than followed. The URL was written by the supplier, not by the
 * customer, so fetching it is a request the platform makes on somebody else's
 * say-so — a person approves each one, and the result becomes a source of its
 * own with its own hash and retrieval time.
 */
export const extractionLinks = pgTable(
  "extraction_link",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extractionId: uuid("extraction_id")
      .notNull()
      .references(() => extractions.id, { onDelete: "cascade" }),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    url: text("url").notNull(),
    why: text("why"),
    sourceLabel: text("source_label"),

    status: extractionLinkStatus("status").notNull().default("proposed"),
    /** The run that read the fetched page, when one happened. */
    followedBy: uuid("followed_by").references((): AnyPgColumn => extractions.id, {
      onDelete: "set null",
    }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    fetchedSha256: text("fetched_sha256"),
    fetchedCharacters: integer("fetched_characters"),
    failure: text("failure"),

    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("extraction_link_run_idx").on(t.extractionId, t.status)],
);

export const extractionRelations = relations(extractions, ({ many }) => ({
  findings: many(extractionFindings),
  links: many(extractionLinks),
}));

export const extractionFindingRelations = relations(extractionFindings, ({ one }) => ({
  extraction: one(extractions, {
    fields: [extractionFindings.extractionId],
    references: [extractions.id],
  }),
}));
