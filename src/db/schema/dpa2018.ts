import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Schedule1Condition } from "@/lib/dpa2018/schedule-1";
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
    conditions: jsonb("conditions").$type<Schedule1Condition[]>().notNull().default([]),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("policy_document_org_idx").on(t.organisationId)],
);
