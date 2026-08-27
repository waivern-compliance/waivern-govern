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
import { appRole, recordType, roleScope } from "./enums";

/** A client of the platform. One organisation, one governance programme. */
export const organisations = pgTable("organisation", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A legal entity within the organisation — for the BBC, BBC Public Service and
 * BBC Studios. Explicitly not a service, product or department: the buyer was
 * specific that iPlayer, TV Licensing, News and the World Service are not
 * entities. Records are classified and reported by entity, and access and
 * retention can be scoped to one.
 */
export const entities = pgTable(
  "entity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** The client's own identifier for the entity: company number, ledger code. */
    legalEntityRef: text("legal_entity_ref"),
    /** Where a record arrives with no entity stated, it lands here. */
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entity_org_name_key").on(t.organisationId, t.name)],
);

/**
 * Retention varies by record type and follows the client's own corporate
 * retention schedule, so it is data rather than a constant. A profile with a
 * null entity applies organisation-wide; one naming an entity overrides it.
 */
export const retentionProfiles = pgTable(
  "retention_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "restrict" }),
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "cascade" }),
    subjectType: recordType("subject_type").notNull(),
    retentionMonths: integer("retention_months").notNull(),
    /** Why this period — the schedule reference or statutory basis. */
    basis: text("basis"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("retention_scope_key").on(t.organisationId, t.entityId, t.subjectType),
  ],
);

/**
 * A person, global across organisations — a Waivern consultant may hold
 * memberships of several client organisations under one identity. Note this is
 * separate from a contributor who completes work through a single-use link and
 * never gets a row here.
 */
export const users = pgTable("app_user", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  /** Stable subject claim from the identity provider, once they have signed in. */
  ssoSubject: text("sso_subject").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

/** Ties a person to an organisation. Revoking this revokes all their roles. */
export const memberships = pgTable(
  "membership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("membership_org_user_key").on(t.organisationId, t.userId),
    index("membership_user_idx").on(t.userId),
  ],
);

/**
 * One role, at one scope. A person holds several rows: an analyst across the
 * organisation plus approver on a single entity is a normal shape. Scoping the
 * grant to an entity is what turns "entity-specific access control" into
 * enforcement rather than a filter on a list.
 */
export const roleAssignments = pgTable(
  "role_assignment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => memberships.id, { onDelete: "cascade" }),
    role: appRole("role").notNull(),
    scope: roleScope("scope").notNull(),
    /** Required when scope is 'entity', forbidden when scope is 'organisation'. */
    entityId: uuid("entity_id").references(() => entities.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("role_assignment_key").on(t.membershipId, t.role, t.scope, t.entityId),
    index("role_assignment_membership_idx").on(t.membershipId),
  ],
);

export const organisationRelations = relations(organisations, ({ many }) => ({
  entities: many(entities),
  memberships: many(memberships),
  retentionProfiles: many(retentionProfiles),
}));

export const entityRelations = relations(entities, ({ one }) => ({
  organisation: one(organisations, {
    fields: [entities.organisationId],
    references: [organisations.id],
  }),
}));

export const membershipRelations = relations(memberships, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [memberships.organisationId],
    references: [organisations.id],
  }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  roles: many(roleAssignments),
}));

export const roleAssignmentRelations = relations(roleAssignments, ({ one }) => ({
  membership: one(memberships, {
    fields: [roleAssignments.membershipId],
    references: [memberships.id],
  }),
  entity: one(entities, {
    fields: [roleAssignments.entityId],
    references: [entities.id],
  }),
}));
