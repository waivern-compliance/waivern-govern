import type { AiRiskCategory } from "./categories";
import type { TreatmentType } from "./treatment";

/**
 * Treatments DSIT's AI Risk Management Toolkit suggests, from its Appendix 4.
 *
 * Offered, never applied. Somebody choosing a risk's treatment sees the ones
 * that fit its category and may take one as the starting wording; nothing here
 * adds a mitigation by itself, because a treatment nobody chose is a line in a
 * register that nobody is going to do.
 *
 * The appendix files its suggestions under its own headings — "Poor accuracy or
 * performance", "Hallucinations and misinformation" — which are not the nine
 * categories the toolkit scores and sets appetite against. Each suggestion keeps
 * the appendix's heading, so the source can be found, and is mapped onto the
 * categories it treats so it appears beside the right risks.
 *
 * `treatment` is null where the toolkit calls a suggestion acceptance. Those two
 * are about who owns AI risk, not about living with one; here acceptance is a
 * separate decision with its own approver and expiry, so they are offered
 * without a treatment type rather than mislabelled as one.
 *
 * Contains public sector information licensed under the Open Government Licence v3.0.
 */
export type TreatmentSuggestion = {
  key: string;
  /** The appendix's own heading. */
  theme: string;
  categories: readonly AiRiskCategory[];
  text: string;
  treatment: TreatmentType | null;
  /** As the toolkit classes it, where that differs from what `treatment` can say. */
  toolkitType?: string;
};

const ACCURACY = "Poor accuracy or performance";
const ACCOUNTABILITY = "Accountability";
const BIAS = "Bias and fairness";
const TRANSPARENCY = "Transparency";
const EXPLAINABILITY = "Explainability and interpretability";
const PRIVACY = "Privacy";
const SECURITY = "Security";
const HALLUCINATION = "Hallucinations and misinformation";
const LEGAL = "Legal compliance";
const BENEFITS = "Does not deliver expected benefits";
const THIRD_PARTY = "Failure of third-party elements";

export const TREATMENT_SUGGESTIONS: readonly TreatmentSuggestion[] = [
  { key: "accuracy.human_involvement", theme: ACCURACY, categories: ["technical_robustness", "accountability_governance"], treatment: "limitation",
    text: "Set out in policy the level of human involvement required in decisions the system informs." },
  { key: "accuracy.monitoring", theme: ACCURACY, categories: ["technical_robustness"], treatment: "limitation",
    text: "Monitor and test the system regularly throughout its lifecycle, against metrics that show whether it is fit for purpose and with defined acceptable limits for performance." },
  { key: "accuracy.incident_response", theme: ACCURACY, categories: ["technical_robustness"], treatment: "avoidance",
    text: "Put incident response in place for when the system performs outside acceptable limits, with alerts when production behaviour departs from pre-deployment testing or anomalies appear, and human review of outputs where the context needs it." },
  { key: "accuracy.bypass", theme: ACCURACY, categories: ["technical_robustness"], treatment: "avoidance",
    text: "Keep, and regularly review, a way to bypass or switch off the system — including a backup that keeps the service running — and the thresholds that trigger it." },
  { key: "accuracy.red_team", theme: ACCURACY, categories: ["technical_robustness", "security"], treatment: "limitation",
    text: "Have experts independent of the project team red-team the system under stress conditions to find failure modes and vulnerabilities." },
  { key: "accuracy.user_awareness", theme: ACCURACY, categories: ["technical_robustness", "transparency_explainability"], treatment: "transference",
    text: "Make users clearly aware of the system's limitations, and that they are responsible for checking its outputs before relying on them." },
  { key: "accuracy.proficiency", theme: ACCURACY, categories: ["technical_robustness", "environment_people"], treatment: "limitation",
    text: "Set proficiency standards for users, keep training material current, and make sure users can interpret outputs and spot errors and incidents." },

  { key: "accountability.leadership", theme: ACCOUNTABILITY, categories: ["accountability_governance"], treatment: null, toolkitType: "Acceptance",
    text: "Make senior leaders own the organisation's appetite for AI risk and the overall management of it." },
  { key: "accountability.named_owner", theme: ACCOUNTABILITY, categories: ["accountability_governance"], treatment: null, toolkitType: "Acceptance",
    text: "Name a team or person responsible for AI risk management across the organisation." },
  { key: "accountability.metrics", theme: ACCOUNTABILITY, categories: ["accountability_governance"], treatment: "limitation",
    text: "Measure whether the project team and accountable owners keep clear lines of responsibility and stay open to enquiries." },
  { key: "accountability.whistleblowing", theme: ACCOUNTABILITY, categories: ["accountability_governance", "contestability_redress"], treatment: "limitation",
    text: "Provide confidential feedback routes and a whistleblowing policy so people inside and outside the organisation can raise problems with the system." },

  { key: "bias.law", theme: BIAS, categories: ["fairness", "legal_regulatory"], treatment: "limitation",
    text: "Comply with data protection law, equality law and the Public Sector Equality Duty, following ICO and EHRC guidance, and complete a DPIA." },
  { key: "bias.diverse_team", theme: BIAS, categories: ["fairness"], treatment: "limitation",
    text: "Build the project team from a range of backgrounds, perspectives and experience, and use participatory design." },
  { key: "bias.data_testing", theme: BIAS, categories: ["fairness", "technical_robustness"], treatment: "limitation",
    text: "Test and verify the data sets and models the system uses — including those from third parties — against defined procedures and metrics." },
  { key: "bias.independent_testing", theme: BIAS, categories: ["fairness"], treatment: "limitation",
    text: "Have people independent of the project team carry out testing and evaluation, to counter implicit bias, groupthink and sunk-cost thinking." },

  { key: "transparency.documentation", theme: TRANSPARENCY, categories: ["transparency_explainability", "accountability_governance"], treatment: "limitation",
    text: "Keep standard documentation for the system, including its responsible owners and how to contact them, and review it regularly." },
  { key: "transparency.inventory", theme: TRANSPARENCY, categories: ["transparency_explainability", "accountability_governance"], treatment: "limitation",
    text: "Keep an inventory of AI models and review it regularly for completeness and usefulness." },
  { key: "transparency.tools", theme: TRANSPARENCY, categories: ["transparency_explainability"], treatment: "limitation",
    text: "Record and review which transparency tools are used and how well they work, following current good practice." },
  { key: "transparency.disclosure", theme: TRANSPARENCY, categories: ["transparency_explainability"], treatment: "limitation",
    text: "Decide what is published about the system — its use of AI, impact assessments, audits, model documentation, test results — and measure whether people can get the information they need." },
  { key: "transparency.stakeholders", theme: TRANSPARENCY, categories: ["transparency_explainability", "contestability_redress"], treatment: "limitation",
    text: "Plan engagement with the people affected, and act on what they say." },
  { key: "transparency.retirement", theme: TRANSPARENCY, categories: ["transparency_explainability"], treatment: "limitation",
    text: "Be open about how and when the system will be decommissioned." },

  { key: "explainability.design", theme: EXPLAINABILITY, categories: ["transparency_explainability"], treatment: "limitation",
    text: "Prefer approaches that are explainable by design; explain the system by several methods; and test the explanations with the people affected before deployment." },
  { key: "explainability.tools", theme: EXPLAINABILITY, categories: ["transparency_explainability"], treatment: "limitation",
    text: "Record and review which explainability tools are used and how well they work, following current good practice." },
  { key: "explainability.audit_trail", theme: EXPLAINABILITY, categories: ["transparency_explainability", "contestability_redress"], treatment: "limitation",
    text: "Make the system auditable: trace its development, record training data sources, and log its processes, outcomes and impacts." },

  { key: "privacy.dpia", theme: PRIVACY, categories: ["legal_regulatory"], treatment: "limitation",
    text: "Comply with data protection law, follow ICO guidance, and complete a DPIA." },
  { key: "privacy.pets", theme: PRIVACY, categories: ["legal_regulatory", "security"], treatment: "avoidance",
    text: "Use privacy-enhancing technologies and data minimisation — de-identification, aggregation — wherever possible." },

  { key: "security.countermeasures", theme: SECURITY, categories: ["security"], treatment: "limitation",
    text: "Adopt machine-learning and end-point countermeasures: robust models, differential privacy, authentication and throttling." },

  { key: "hallucination.checking", theme: HALLUCINATION, categories: ["technical_robustness", "transparency_explainability"], treatment: "transference",
    text: "Require users to check AI-generated content for accuracy before it is used." },

  { key: "legal.from_outset", theme: LEGAL, categories: ["legal_regulatory"], treatment: "limitation",
    text: "Work with legal teams from the outset to identify the requirements specific to this use, and build them into how the system is designed, trained and deployed, following EHRC, ICO and sector regulators' guidance." },
  { key: "legal.monitoring", theme: LEGAL, categories: ["legal_regulatory"], treatment: "limitation",
    text: "Monitor and review compliance with applicable law on an ongoing basis, preserving material for forensic, regulatory and legal review." },
  { key: "legal.training", theme: LEGAL, categories: ["legal_regulatory", "environment_people"], treatment: "limitation",
    text: "Train and retrain staff on the legal and regulatory considerations affecting AI design, development and deployment." },

  { key: "benefits.right_tool", theme: BENEFITS, categories: ["financial"], treatment: "limitation",
    text: "Decide whether AI is the right tool by weighing its risks against its benefits." },
  { key: "benefits.kpis", theme: BENEFITS, categories: ["financial"], treatment: "limitation",
    text: "Define KPIs and success measures, and test against them throughout the lifecycle." },
  { key: "benefits.participation", theme: BENEFITS, categories: ["financial", "contestability_redress"], treatment: "limitation",
    text: "Involve stakeholders throughout the lifecycle to shape the system and to decide whether it should be pursued at all; record and act on what they say." },
  { key: "benefits.narrow_scope", theme: BENEFITS, categories: ["financial"], treatment: "limitation",
    text: "Keep the application narrow, so its benefits and risks are easier to map and trade-offs easier to decide." },

  { key: "third_party.validation", theme: THIRD_PARTY, categories: ["technical_robustness", "legal_regulatory"], treatment: "limitation",
    text: "Test, evaluate and validate third-party data, software and hardware for legal, regulatory and policy compliance." },
  { key: "third_party.reporting", theme: THIRD_PARTY, categories: ["technical_robustness", "security"], treatment: "limitation",
    text: "Require suppliers to report known or potential issues and vulnerabilities in what they supply." },
  { key: "third_party.redundancy", theme: THIRD_PARTY, categories: ["technical_robustness"], treatment: "limitation",
    text: "Plan redundancy for functions third parties provide." },
  { key: "third_party.bypass_warranty", theme: THIRD_PARTY, categories: ["technical_robustness", "financial"], treatment: "avoidance", toolkitType: "Avoidance and transference",
    text: "Keep a way to bypass the system with a backup that keeps the service running, and make sure contracts and licences carry robust warranties and indemnities." },
];

const BY_KEY = new Map(TREATMENT_SUGGESTIONS.map((s) => [s.key, s]));

export function suggestionByKey(key: unknown): TreatmentSuggestion | null {
  return typeof key === "string" ? (BY_KEY.get(key) ?? null) : null;
}

/**
 * The suggestions for one risk, those for its category first.
 *
 * Everything is returned, split, rather than only the matches: a risk filed
 * under a category of the organisation's own has no match, and a person
 * looking for a treatment should still be able to find the toolkit's.
 */
export function suggestionsFor(category: string | null | undefined): {
  matching: TreatmentSuggestion[];
  others: TreatmentSuggestion[];
} {
  const matching: TreatmentSuggestion[] = [];
  const others: TreatmentSuggestion[] = [];
  for (const s of TREATMENT_SUGGESTIONS) {
    (category && s.categories.includes(category as AiRiskCategory) ? matching : others).push(s);
  }
  return { matching, others };
}
