import { relations, sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { adequacyStatus, transferRiskLevel } from "./enums";
import { organisations, users } from "./tenancy";

/**
 * What is known about transferring personal data to a country.
 *
 * Two layers. A row with no organisation is the shared library, maintained
 * centrally and updated for every client at once — an adequacy decision is the
 * same fact for everybody. A row with an organisation overrides it for that
 * client, because a buyer may have done their own analysis of a destination and
 * is entitled to rely on it.
 *
 * The review fields are the substance of the requirement rather than
 * bookkeeping. Country information that nobody has checked since an adequacy
 * decision was challenged is worse than none: a transfer assessment cites it,
 * reads as evidenced, and is out of date. So staleness is recorded, surfaced on
 * every assessment that relies on it, and turned into work by the scheduler.
 */
export const countryRisk = pgTable(
  "country_risk",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null is the shared library. Set overrides it for one client. */
    organisationId: uuid("organisation_id").references(() => organisations.id, {
      onDelete: "cascade",
    }),

    /** ISO 3166-1 alpha-2. */
    code: text("code").notNull(),
    name: text("name").notNull(),

    ukAdequacy: adequacyStatus("uk_adequacy").notNull(),
    /** What the status is conditional on, where it is conditional. */
    ukAdequacyNote: text("uk_adequacy_note"),
    euAdequacy: adequacyStatus("eu_adequacy").notNull(),
    euAdequacyNote: text("eu_adequacy_note"),

    /** Can public authorities compel access to data held there? */
    governmentAccess: transferRiskLevel("government_access").notNull().default("unknown"),
    /** Do UK or EU data subjects have an effective route to redress? */
    redress: transferRiskLevel("redress").notNull().default("unknown"),

    summary: text("summary"),
    /** What this is based on, so a reader can check rather than trust. */
    sources: jsonb("sources")
      .$type<Array<{ title: string; url?: string; published?: string }>>()
      .notNull()
      .default([]),

    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    reviewedBy: text("reviewed_by").notNull(),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One shared row per country, and at most one override per client.
    uniqueIndex("country_risk_shared_key")
      .on(t.code)
      .where(sql`${t.organisationId} is null`),
    uniqueIndex("country_risk_override_key")
      .on(t.organisationId, t.code)
      .where(sql`${t.organisationId} is not null`),
    index("country_risk_review_idx").on(t.nextReviewAt),
  ],
);

export const countryRiskRelations = relations(countryRisk, ({ one }) => ({
  organisation: one(organisations, {
    fields: [countryRisk.organisationId],
    references: [organisations.id],
  }),
}));

/** Kept for the reviewer trail — who said what, when, and on what basis. */
export const countryRiskReviews = pgTable(
  "country_risk_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryRiskId: uuid("country_risk_id")
      .notNull()
      .references(() => countryRisk.id, { onDelete: "cascade" }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedByLabel: text("reviewed_by_label").notNull(),
    /** What changed, or that nothing did — a confirmation is a review too. */
    note: text("note").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("country_risk_review_country_idx").on(t.countryRiskId)],
);
