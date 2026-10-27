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
  // Added with UK government AI guidance support.
  "risk_appetite",
  "atrs_record",
  "ai_change",
  "ai_assurance_record",
  "ai_incident",
  "ai_use_case_request",
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
  /**
   * Equality impact assessment: how a policy, service or system affects people
   * with each protected characteristic, as the public sector equality duty
   * requires a public body to consider. A kind of its own because it is owned
   * and signed off apart from a DPIA, and asked of things that touch no
   * personal data at all.
   */
  "eia",
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

/** Which scale a risk was rated on. See `lib/risk/scale.ts`. */
export const riskScale = pgEnum("risk_scale", ["4x4", "5x5"]);

/**
 * How much risk of a kind the organisation is prepared to carry, in the
 * Orange Book's terms as DSIT's AI Risk Management Toolkit uses them.
 */
export const appetiteLevel = pgEnum("appetite_level", ["averse", "minimal", "cautious", "open"]);

export const appetiteStatus = pgEnum("appetite_status", [
  /** Written down, not yet signed off. Changes nothing until it is. */
  "proposed",
  /** Signed off, and what risks in its category are judged against. */
  "approved",
  "rejected",
  /** Replaced by a later approved statement for the same category. */
  "superseded",
]);

/**
 * What a mitigation does to the risk, in the toolkit's terms. Acceptance — the
 * fourth option — is not a mitigation; it is the separate, accountable record
 * in `risk_acceptance`.
 */
export const treatmentType = pgEnum("treatment_type", [
  /** Removes the exposure — by not doing the thing, or doing it differently. */
  "avoidance",
  /** Keeps the exposure within acceptable limits. */
  "limitation",
  /** Moves some of it to a party better placed to carry it, such as a supplier. */
  "transference",
]);

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
  /** A report about an AI system that somebody has to look at and decide on. */
  "triage_incident",
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

/**
 * How the system is deployed, in the terms the UK government AI Playbook uses
 * for its security guidance. Separate from provenance because it answers a
 * different question: not who built it, but where data goes and what an
 * attacker can reach — a third-party model run on our own hardware and the same
 * model called over a public API carry quite different exposure.
 */
export const aiDeploymentPattern = pgEnum("ai_deployment_pattern", [
  /** A public web application or chat service, used as anyone would use it. */
  "public_web_app",
  /** AI features switched on inside software bought for something else. */
  "embedded",
  /** A provider's public API, called from our own code. */
  "public_api",
  /** A model hosted on infrastructure we control, typically open weights. */
  "privately_hosted",
  /** A model running on an individual's own device. */
  "local",
  /** A model trained or fine-tuned here, on data we supply. */
  "trained_here",
]);

/**
 * Whether a supplier uses AI, in PPN 02/24's terms: in delivering the service,
 * or as the thing supplied. Null on a supplier means nobody has asked.
 */
export const supplierAiInvolvement = pgEnum("supplier_ai_involvement", [
  "none",
  "in_delivery",
  "ai_product",
]);

/**
 * Whether the Algorithmic Transparency Recording Standard applies to a system.
 * Null on the register means nobody has worked it out yet.
 */
export const atrsScope = pgEnum("atrs_scope", [
  /** A central department or in-scope arm's length body, using the tool in decisions affecting the public. */
  "required",
  /** Not required, but the organisation publishes a record as good practice. */
  "voluntary",
  "not_in_scope",
]);

export const atrsStatus = pgEnum("atrs_status", [
  "draft",
  /** Signed off by an approver; ready to send to DSIT. */
  "approved",
  /** Published in the public repository, with its address. */
  "published",
  /** Replaced by a later approved version. */
  "superseded",
]);

/**
 * What changed about an AI system. The Playbook asks for every model update to
 * go through change control with testing and validation; DSIT's toolkit asks
 * for risk to be reassessed when the model, its data or its use changes.
 */
export const aiChangeKind = pgEnum("ai_change_kind", [
  /** Moved through its lifecycle: proposed, development, pilot, production, retiring, retired. */
  "stage",
  /** A different or updated model, or a retrain. */
  "model",
  /** Different training, input or retrieval data. */
  "data",
  /** Used for something new, by someone new, or at a different scale. */
  "scope",
]);

/** The kinds of evidence that an AI system does what it should, safely. */
export const aiAssuranceKind = pgEnum("ai_assurance_kind", [
  /** Accuracy and performance against agreed metrics. */
  "evaluation",
  /** Adversarial testing to find failure modes, ideally by people outside the team. */
  "red_team",
  /** Outcomes compared across groups, including in combination. */
  "bias_test",
  /** Vulnerability and AI-specific attack testing. */
  "security_test",
  /** Testing with real users: whether they understand, trust and use it as intended. */
  "user_research",
  /** Documentation of a model: what it is for, how it was built, its limits. */
  "model_card",
  /** Documentation of a dataset: where it came from, what it holds, its gaps. */
  "data_card",
]);

export const aiAssuranceResult = pgEnum("ai_assurance_result", [
  "passed",
  /** Met its limits, with findings that need acting on. */
  "passed_with_issues",
  "failed",
]);

/**
 * What somebody is reporting about an AI system. The Playbook asks for routes
 * for users to report issues and prompt human review, for people affected to
 * challenge an outcome and seek redress, and for staff to raise concerns —
 * including confidentially.
 */
export const aiIncidentKind = pgEnum("ai_incident_kind", [
  /** The system failed, or performed outside its limits. */
  "incident",
  /** Someone was, or may have been, harmed by it. */
  "harm",
  /** Someone affected is challenging an outcome, or seeking redress. */
  "challenge",
  /** A concern raised about the system — including whistleblowing. */
  "concern",
]);

export const aiIncidentSource = pgEnum("ai_incident_source", [
  "staff",
  "public",
  /** Raised by the system's own monitoring. */
  "monitoring",
  "supplier",
  "other",
]);

export const aiHarm = pgEnum("ai_harm", ["none_known", "potential", "actual"]);

/**
 * Where a proposal to use AI has got to. Submitted until somebody decides;
 * deferred can be decided again later, accepted and declined cannot.
 */
export const aiRequestStatus = pgEnum("ai_request_status", [
  "submitted",
  "accepted",
  "declined",
  "deferred",
]);

export const aiIncidentStatus = pgEnum("ai_incident_status", [
  "reported",
  "triaged",
  "investigating",
  "resolved",
  "closed",
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

/**
 * How much hand-holding somebody wants on their home page.
 *
 * A preference, not a permission: it changes what is explained, never what may
 * be reached. Null means "not chosen", which is derived from whether the
 * organisation's registers have anything in them yet — so a new organisation
 * is guided without anybody having to know the feature exists.
 */
export const guidanceMode = pgEnum("guidance_mode", ["off", "setup", "maintain"]);
