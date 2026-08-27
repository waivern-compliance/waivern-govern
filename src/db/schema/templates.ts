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
import type { TemplateDefinition } from "@/lib/templates/schema";
import { templateKind, templateStatus } from "./enums";
import { organisations, users } from "./tenancy";

/**
 * Statutory and guidance references shown beside the questions they bear on.
 *
 * Shared across organisations rather than copied per tenant: an article number
 * is the same fact for everyone, and a correction should reach every client at
 * once rather than one at a time.
 */
export const legalReferences = pgTable(
  "legal_reference",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Stable handle used from template definitions, e.g. `ukgdpr.art35`. */
    code: text("code").notNull().unique(),
    regime: text("regime").notNull(),
    citation: text("citation").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    jurisdiction: text("jurisdiction"),
    /** Guidance moves. This is when the text was last confirmed against source. */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [index("legal_reference_regime_idx").on(t.regime)],
);

/** The named thing a client configures — "DPIA", "AI Risk Assessment". */
export const templates = pgTable(
  "template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    kind: templateKind("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Jurisdiction this template is written for, where that is meaningful. */
    jurisdiction: text("jurisdiction"),
    /**
     * Shipped by Waivern and kept current on the client's behalf. A client may
     * copy one to a template of their own, but editing ours in place would put
     * their changes at risk on the next update.
     */
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("template_org_name_key").on(t.organisationId, t.name)],
);

/**
 * An immutable snapshot of a template's questions, logic and scoring.
 *
 * Publishing freezes the definition. An assessment records which version it ran
 * against, so a decision taken in March remains readable and defensible after
 * the questions change in July — which is what version history has to mean when
 * the record may be read back by a regulator.
 */
export const templateVersions = pgTable(
  "template_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: templateStatus("status").notNull().default("draft"),
    definition: jsonb("definition").$type<TemplateDefinition>().notNull(),
    /** What changed, for whoever reads the version list in two years. */
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("template_version_key").on(t.templateId, t.version),
    index("template_version_status_idx").on(t.templateId, t.status),
  ],
);

export const templateRelations = relations(templates, ({ many, one }) => ({
  versions: many(templateVersions),
  organisation: one(organisations, {
    fields: [templates.organisationId],
    references: [organisations.id],
  }),
}));

export const templateVersionRelations = relations(templateVersions, ({ one }) => ({
  template: one(templates, {
    fields: [templateVersions.templateId],
    references: [templates.id],
  }),
}));
