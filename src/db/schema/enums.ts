import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Every record type the platform can reference polymorphically — from audit
 * events, typed links, evidence attachments and retention profiles. Declared
 * once, up front, including types whose tables land in later phases: adding a
 * value to a Postgres enum is cheap, but discovering mid-build that the audit
 * table cannot describe a new record is not.
 */
export const recordType = pgEnum("record_type", [
  "organisation",
  "entity",
  "user",
  "membership",
  "role_assignment",
  "retention_profile",
  "template",
  "template_version",
  "assessment",
  "assessment_answer",
  "assessment_revision",
  "processing_activity",
  "ai_use_case",
  "supplier",
  "dpa",
  "supplier_assessment_record",
  "country_risk",
  "risk",
  "mitigation",
  "risk_acceptance",
  "task",
  "approval",
  "workflow_definition",
  "schedule",
  "evidence",
  "consent_record",
  "integration_connection",
  "ai_suggestion",
  // Audit records carry their own retention period, distinct from and usually
  // longer than the records they describe.
  "audit_event",
]);

/**
 * Roles are deliberately few. Each one answers "what may this person decide?"
 * rather than "which screens may they open" — screen access follows from the
 * decision rights, not the other way round.
 */
export const appRole = pgEnum("app_role", [
  // Manages the organisation itself: entities, members, retention profiles.
  "owner",
  // Configures templates and workflow, and administers governance records.
  "privacy_admin",
  // Runs assessments day to day.
  "privacy_analyst",
  // Specialist reviewer for AI use cases and AI risk assessments.
  "ai_governance",
  // May take an approval decision or accept a risk, within scope.
  "approver",
  // Answers assigned questions only. The account-holding equivalent of a
  // single-use task link.
  "contributor",
  // Read-only across scope, including the audit chain. Never writes.
  "auditor",
]);

/** A role grant applies either to a whole organisation or to one legal entity. */
export const roleScope = pgEnum("role_scope", ["organisation", "entity"]);

/**
 * Who caused an audited change. `contributor_link` is a person who completed
 * work through a single-use link and holds no account — they are identified by
 * the email the task was sent to, which is recorded in `actorLabel`.
 */
export const actorKind = pgEnum("actor_kind", [
  "user",
  "contributor_link",
  "system",
  "integration",
]);

/**
 * What an assessment is for. Every kind runs through the same engine and
 * produces the same downstream records — which is what makes consolidated
 * reporting a query rather than an integration.
 */
export const templateKind = pgEnum("template_kind", [
  "dpia",
  /** UK transfer risk assessment, including IDTA and Addendum routes. */
  "tra",
  /** EU transfer impact assessment. */
  "tia",
  "ai_risk",
  /** Short triage that decides whether a full assessment is needed. */
  "screening",
  /** A completed third-party assessment recorded with its evidence. */
  "supplier_record",
  "breach",
  "custom",
]);

export const templateStatus = pgEnum("template_status", [
  "draft",
  "published",
  "retired",
]);

/**
 * Where an assessment has got to.
 *
 * `returned` is separate from `draft` deliberately: an assessment sent back by a
 * reviewer is not the same thing as one nobody has looked at, and conflating
 * them loses the reviewer's request in the noise of everyone's unfinished work.
 */
export const assessmentStatus = pgEnum("assessment_status", [
  "draft",
  "in_progress",
  "in_review",
  "returned",
  "approved",
  "rejected",
  /** Replaced by a later reassessment. Kept readable, never edited again. */
  "superseded",
  "withdrawn",
]);

/** Why a snapshot was taken. */
export const revisionReason = pgEnum("revision_reason", [
  "submitted",
  "returned",
  "reopened",
  "approved",
  "rejected",
  "superseded",
]);

/** Risk banding, shared by assessments and the risk register. */
export const riskTier = pgEnum("risk_tier", ["low", "medium", "high", "critical"]);

/**
 * Where a risk is in its life.
 *
 * `accepted` is a status a human puts it in and that expires; it is never
 * reached by the system deciding a risk is tolerable.
 */
export const riskStatus = pgEnum("risk_status", [
  "identified",
  "treating",
  "mitigated",
  "accepted",
  "closed",
]);

export const riskSource = pgEnum("risk_source", ["assessment", "manual", "integration"]);

export const mitigationStatus = pgEnum("mitigation_status", [
  "planned",
  "in_progress",
  "implemented",
  /** Someone other than the owner has confirmed it is actually in place. */
  "verified",
  "abandoned",
]);
