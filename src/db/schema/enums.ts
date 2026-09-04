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
  "breach",
  "breach_decision",
  "document",
  "extraction",
  "extraction_finding",
  "comment",
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
  // Added with the integration surface.
  "scan_finding",
  "record_link",
  "notification",
  "sla_policy",
  "workflow_stage",
  "webhook_delivery",
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
  /**
   * A model proposed this. Never the actor on a decision — an assistant can
   * author a suggestion, and only a person can accept one.
   */
  "assistant",
  "integration",
]);

export const assistantRole = pgEnum("assistant_role", ["user", "assistant"]);

export const suggestionStatus = pgEnum("suggestion_status", [
  "proposed",
  "accepted",
  /** Seen and declined. Kept, because that is evidence of review. */
  "rejected",
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
  /**
   * Legitimate interests assessment: the three-part test under Article 6(1)(f).
   * A distinct kind rather than a DPIA section, because the test is required
   * wherever that basis is relied on, including where no DPIA is.
   */
  "lia",
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

/**
 * What a task is asking someone to do.
 *
 * Typed rather than free text, because the service level, the reminder wording
 * and the escalation route all differ by kind, and a string would make each of
 * those a lookup nobody maintains.
 */
export const taskType = pgEnum("task_type", [
  "answer_section",
  "review_assessment",
  "approve_stage",
  "mitigation_due",
  "verify_mitigation",
  "reassess",
  "review_acceptance",
  /**
   * The seventy-two hours under Article 33(1). Its own type because it is the
   * only deadline here set by statute rather than by a service level somebody
   * chose, and it must not be quietly rescheduled.
   */
  "breach_deadline",
]);

export const taskStatus = pgEnum("task_status", [
  "open",
  "in_progress",
  "done",
  "cancelled",
]);

export const approvalStatus = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "returned",
  /** Its condition did not hold for this assessment. */
  "skipped",
]);

/** What a recurring schedule produces when it comes round. */
export const scheduleAction = pgEnum("schedule_action", [
  "reassess",
  "review",
  "attest",
  "verify",
]);

/** Systems that push records into the platform. */
export const integrationKind = pgEnum("integration_kind", [
  /** The Waivern Compliance Portal: discovery, DPA extraction, generated documents. */
  "waivern_portal",
  /** The HAR Analyser: cookie, tracker and consent-behaviour scanning. */
  "har_analyser",
  /** A language model endpoint the organisation chooses and controls. */
  "model_provider",
  /**
   * Where work is tracked — Jira, ServiceNow. One kind rather than one per
   * product: they differ by adapter and configuration, not by design, and a
   * kind each would put that difference in the schema where it does not belong.
   */
  "work_tracker",
  "other",
]);

export const evidenceKind = pgEnum("evidence_kind", [
  "document",
  "scan",
  "attestation",
  "link",
]);

/** Severity as the producing system rated it. Never a governance decision. */
export const findingSeverity = pgEnum("finding_severity", [
  "info",
  "low",
  "medium",
  "high",
]);

export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "delivered",
  "failed",
  "abandoned",
]);

/**
 * How somebody works, which is not the same question as what they may decide.
 *
 * Roles answer "what may this person decide?" and gate access. Personas answer
 * "how does this person work?" and change nothing but presentation — what the
 * home screen leads with, and in whose words. They are orthogonal: a privacy
 * analyst and an AI governance lead hold identical capabilities yet need
 * completely different homes, and an engineering lead and a product manager may
 * both hold nothing but `contributor`.
 *
 * Nothing in an authorisation decision may ever read this.
 */
export const persona = pgEnum("persona", [
  "privacy_governance",
  "ai_governance",
  "engineering",
  "product",
]);

/**
 * What kind of AI system this is.
 *
 * The full spectrum, because the buyer was explicit that scope is not limited
 * to systems that operate as agents: a decision tree scoring applicants is as
 * much a governance concern as a language model, and often a bigger one.
 */
export const aiSystemType = pgEnum("ai_system_type", [
  "predictive",
  "generative",
  "agentic",
  "hybrid",
]);

/** Where it came from, which decides how much of it anybody here can inspect. */
export const aiProvenance = pgEnum("ai_provenance", [
  "built_in_house",
  "fine_tuned",
  "third_party_api",
  /** Inside a product bought for something else — the hardest kind to find. */
  "embedded_vendor",
]);

export const aiLifecycleStage = pgEnum("ai_lifecycle_stage", [
  "proposed",
  "development",
  "pilot",
  "production",
  "retiring",
  "retired",
]);

/**
 * Whether a destination is covered by adequacy, and how completely.
 *
 * Not a boolean, because the most consequential cases are not. The United
 * States is adequate only for organisations certified under the Data Privacy
 * Framework or the UK Extension — a transfer to an uncertified recipient there
 * needs a full Article 46 route. A yes/no field records that as "yes" and
 * quietly excuses an assessment nobody did.
 */
export const adequacyStatus = pgEnum("adequacy_status", [
  "adequate",
  /** Covered only where a condition holds — certification, a sector, a scheme. */
  "partial",
  "not_adequate",
  /** Adequacy exists but is under legal challenge or formal review. */
  "under_review",
]);

/** How a destination scores on one dimension of transfer risk. */
export const transferRiskLevel = pgEnum("transfer_risk_level", [
  "low",
  "moderate",
  "high",
  /** Nobody has established this. Distinct from low, and treated as worse. */
  "unknown",
]);

/**
 * What kind of breach it is. The three are not exclusive — losing the only
 * copy of a database to ransomware is a breach of availability and, if it was
 * exfiltrated first, of confidentiality too.
 */
export const breachCategory = pgEnum("breach_category", [
  "confidentiality",
  "integrity",
  "availability",
]);

/**
 * Where a breach is in its handling.
 *
 * `assessing` exists because the two statutory judgements — whether to notify
 * the authority and whether to tell the people affected — are separate acts
 * that take time, and the seventy-two hours runs while they are being made.
 */
export const breachStatus = pgEnum("breach_status", [
  "discovered",
  "assessing",
  "contained",
  "notified",
  "closed",
]);

/**
 * Who a decision was about.
 *
 * The first two are statutory: Article 33 to the supervisory authority,
 * Article 34 to the data subjects. `processor_to_controller` is the obligation
 * that falls the other way under Article 33(2) when we are the processor. The
 * rest are decisions an organisation takes that the Regulation does not
 * require, and which are worth recording precisely because nobody made them
 * do it.
 */
export const breachDecisionKind = pgEnum("breach_decision_kind", [
  "supervisory_authority",
  "data_subjects",
  "processor_to_controller",
  "insurer",
  "law_enforcement",
  "other_regulator",
  "affected_organisation",
  "voluntary_action",
]);

/**
 * What was decided.
 *
 * `not_required` carries a rationale like any other outcome. Deciding that
 * Article 33 does not bite is a judgement the controller has to be able to
 * defend, and an absence of notification with no recorded reasoning is
 * indistinguishable from an oversight.
 */
export const breachDecisionOutcome = pgEnum("breach_decision_outcome", [
  "pending",
  "done",
  "not_required",
  "deferred",
  "declined",
]);

/** Where a piece of an extraction came from. */
export const extractionSourceKind = pgEnum("extraction_source_kind", [
  "document",
  "web_page",
]);

/** What an extraction found. Both are read from a source, never inferred. */
export const extractionFindingKind = pgEnum("extraction_finding_kind", [
  "transfer_mechanism",
  "sub_processor",
]);

/**
 * A sub-processor list the documents point at but do not contain.
 *
 * "proposed" is the resting state: the platform does not fetch an address it
 * found inside somebody else's file until a person says to.
 */
export const extractionLinkStatus = pgEnum("extraction_link_status", [
  "proposed",
  "fetched",
  "declined",
  "failed",
]);
