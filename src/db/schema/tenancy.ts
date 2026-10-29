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
import { aiFramework, appRole, dataProtectionJurisdiction, guidanceMode, organisationRequestStatus, persona, recordType, riskScale, roleScope } from "./enums";

/** A client of the platform. One organisation, one governance programme. */
export const organisations = pgTable("organisation", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  /**
   * The scale its risk register rates on. A column rather than a setting,
   * because it governs how every risk is checked and has to be impossible to
   * change by accident. See `lib/risk/scale.ts`.
   */
  riskScale: riskScale("risk_scale").notNull().default("4x4"),
  /**
   * The AI governance framework its AI defaults follow. A column for the same
   * reason as the scale: it decides how AI risk is categorised and judged
   * across the whole register. See `lib/ai-frameworks`.
   */
  aiFramework: aiFramework("ai_framework").notNull().default("uk_dsit"),
  /**
   * The law requests from data subjects are handled under by default. A column,
   * like the risk scale, because it sets how every deadline is counted; each
   * request carries its own copy so changing this never moves one already
   * received.
   */
  dataProtectionJurisdiction: dataProtectionJurisdiction("data_protection_jurisdiction").notNull().default("uk"),
  /**
   * How many objections to one processing activity in twelve months — upheld
   * or overridden — before its legitimate interests assessment is put back in
   * front of somebody. Zero turns it off.
   */
  objectionReviewThreshold: integer("objection_review_threshold").notNull().default(3),
  /**
   * The organisation's own standard for "without undue delay" (DPA 2018
   * s.164A(4)): days from acknowledging a complaint to telling the complainant
   * the outcome. The Act sets no figure, so this is never shown as the law.
   * Zero turns it off.
   */
  complaintOutcomeTargetDays: integer("complaint_outcome_target_days").notNull().default(30),
  /** How often a complainant is told how things stand while it is open (s.164A(5)(b)). Zero turns it off. */
  complaintUpdateIntervalDays: integer("complaint_update_interval_days").notNull().default(30),
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
    /**
     * How the platform presents itself to this person. Nullable on purpose:
     * an unset persona is derived from what they can do rather than guessed at
     * during a migration, and a grant that does not state one should not invent
     * an answer. Presentation only — never consulted by an access check.
     */
    persona: persona("persona"),

    /**
     * Whether to show the step-by-step guide, and which stage of it.
     *
     * Per membership rather than per user, because the same person can be
     * finding their feet in one organisation and running another by heart.
     * Null is not "off" — it means nobody has chosen, and the stage is derived
     * from what the registers actually contain.
     */
    guidance: guidanceMode("guidance"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("membership_org_user_key").on(t.organisationId, t.userId),
    index("membership_user_idx").on(t.userId),
  ],
);

/**
 * Somebody's request for a new organisation, awaiting a Waivern operator.
 *
 * The platform's, not any organisation's: until it is approved there is no
 * organisation for it to belong to. Row-level security is on with no policy,
 * so no organisation's work can read it; only the platform can.
 */
export const organisationRequests = pgTable(
  "organisation_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedByEmail: text("requested_by_email").notNull(),
    organisationName: text("organisation_name").notNull(),
    entityName: text("entity_name").notNull(),
    note: text("note"),
    status: organisationRequestStatus("status").notNull().default("pending"),
    decidedByEmail: text("decided_by_email"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    /** The organisation an approval created. */
    createdOrganisationId: uuid("created_organisation_id").references(() => organisations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One request in the queue per person at a time.
    uniqueIndex("organisation_request_one_pending_key")
      .on(t.requestedBy)
      .where(sql`${t.status} = 'pending'`),
    index("organisation_request_status_idx").on(t.status, t.createdAt),
  ],
);

/**
 * An email domain an organisation has claimed.
 *
 * Once verified — by a DNS record only the domain's owner can publish — anyone
 * who signs in with an address at it, verified by their identity provider,
 * joins this organisation as a contributor without an invitation. A verified
 * domain belongs to one organisation only; an unverified claim is just a
 * request, and several can exist for the same domain until one is proved.
 */
export const organisationDomains = pgTable(
  "organisation_domain",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organisationId: uuid("organisation_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    /** Published as govern-verification=<token> at _govern-verification.<domain>. */
    token: text("token").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("organisation_domain_org_domain_key").on(t.organisationId, t.domain),
    uniqueIndex("organisation_domain_verified_key")
      .on(t.domain)
      .where(sql`${t.verifiedAt} is not null`),
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
    // Two partial indexes rather than one over all four columns. Postgres
    // treats NULLs as distinct in a unique index, so an index including the
    // nullable entity_id never fires for organisation-scoped grants and the
    // same role could be granted to one person repeatedly.
    uniqueIndex("role_assignment_org_key")
      .on(t.membershipId, t.role)
      .where(sql`${t.entityId} is null`),
    uniqueIndex("role_assignment_entity_key")
      .on(t.membershipId, t.role, t.entityId)
      .where(sql`${t.entityId} is not null`),
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
