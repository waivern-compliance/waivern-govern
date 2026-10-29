import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { profileStatus } from "./enums";
import { organisations, users } from "./tenancy";

/**
 * Where an organisation stands against one outcome of a framework, and where
 * it means to get to: for NIST AI RMF, one row per subcategory ("GOVERN 1.1").
 *
 * NIST calls the two sides a current profile and a target profile. They sit on
 * one row because the gap between them is the thing people act on. A
 * subcategory with no row has not been assessed. The framework is a column, not
 * a table of its own, so ISO 42001's Annex A can be profiled the same way.
 */
export const frameworkProfileItems = pgTable(
  "framework_profile_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    /** The framework the code belongs to, e.g. `nist_ai_rmf`. */
    framework: text("framework").notNull(),
    /** The outcome as the framework writes it: "MEASURE 2.11". */
    code: text("code").notNull(),
    /** Where the organisation is now. Null until somebody says. */
    currentStatus: profileStatus("current_status"),
    /** Where it means to be. Null until somebody decides. */
    targetStatus: profileStatus("target_status"),
    notes: text("notes"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByLabel: text("updated_by_label").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("framework_profile_item_key").on(t.organisationId, t.framework, t.code)],
);
