import type { AppetiteLevel } from "@/lib/risk/appetite";
import { AI_RISK_CATEGORIES } from "@/lib/risk/categories";
import type { TreatmentSuggestion } from "@/lib/risk/treatment-library";
import { TRUSTWORTHY_CHARACTERISTICS, type TrustworthyCharacteristic } from "./nist-ai-rmf";
import type { AiFrameworkPack, RiskCategoryDef } from "./types";

/**
 * The NIST set: NIST AI RMF 1.0, with its Playbook, for categories, appetite
 * and treatments.
 *
 * Categories are the seven characteristics of trustworthy AI, plus financial
 * and legal risk kept from the UK set. NIST's characteristics describe a
 * trustworthy system, not every way an AI project can cost an organisation,
 * and a register with nowhere to file a budget overrun or a legal challenge
 * gets them filed somewhere misleading. The two keep the UK set's values, so a
 * risk filed under either stays where it is when an organisation moves between
 * frameworks. Privacy is a characteristic here, so legal risk here means law
 * other than data protection.
 *
 * NIST gives no appetite examples, as DSIT's Appendix 2 does: the guidance for
 * the seven characteristics is Waivern's, written to sit beside the UK
 * examples at the same four levels. The treatments condense the Playbook's
 * suggested actions, each under the subcategory it comes from.
 */

type NistCategory = TrustworthyCharacteristic | "financial" | "legal_regulatory";

const kept = (value: "financial" | "legal_regulatory") => AI_RISK_CATEGORIES.find((c) => c.value === value)!;

const CATEGORIES: readonly RiskCategoryDef[] = [
  ...TRUSTWORTHY_CHARACTERISTICS.map(({ value, label, summary }) => ({ value, label, summary })),
  kept("financial"),
  {
    ...kept("legal_regulatory"),
    summary: "Equality, human rights, intellectual property, contract and AI-specific law. Privacy has its own category.",
  },
];

const APPETITE_GUIDANCE: Record<NistCategory, Record<AppetiteLevel, string>> = {
  valid_reliable: {
    averse: "Only systems shown to perform as intended in the conditions they will meet, with their limits documented.",
    minimal: "Small, measured shortfalls in accuracy, where a person checks every output that matters.",
    cautious: "Known limitations, documented and monitored, where errors are caught before they cause harm.",
    open: "Unproven performance in exchange for learning, with close monitoring and a quick way back.",
  },
  safe: {
    averse: "No AI that could plausibly endanger life, health, property or the environment.",
    minimal: "Only systems demonstrated to fail safely, with people in the loop wherever harm is possible.",
    cautious: "Little chance of serious harm, where testing covers foreseeable misuse and a person can intervene.",
    open: "Some residual safety risk where the benefit is clear and controls keep harm unlikely and recoverable.",
  },
  secure_resilient: {
    averse: "No AI exposed to untrusted input or data without full security testing and red-teaming.",
    minimal: "Only well-tested systems behind existing controls, with AI-specific threats assessed.",
    cautious: "Known AI-specific threats accepted where countermeasures and monitoring are in place.",
    open: "Emerging threats accepted for early adoption, with incident response ready and exposure contained.",
  },
  accountable_transparent: {
    averse: "No AI whose use, ownership and decisions are not fully documented and disclosed.",
    minimal: "Only systems with a named owner, full records, and people told when AI is involved.",
    cautious: "Gaps in documentation accepted for low-impact uses, with a named owner and a route to challenge.",
    open: "Limited transparency accepted where a third party's terms restrict it, with accountability kept here.",
  },
  explainable_interpretable: {
    averse: "No AI informing decisions about people unless each outcome can be explained to them.",
    minimal: "Opaque models only where outputs are advisory and a person can explain the decision taken.",
    cautious: "General explanations accepted where outcomes are reviewable and explanation methods are tested.",
    open: "Opaque models accepted for a clear benefit, where outputs do not decide anything about people.",
  },
  privacy_enhanced: {
    averse: "No AI using personal data beyond what is strictly necessary, and none inferring sensitive attributes.",
    minimal: "Personal data only where minimised and protected, with re-identification risk measured.",
    cautious: "Personal data used where a DPIA supports it and privacy-enhancing techniques are applied.",
    open: "Wider use of personal data for a clear public or business benefit, within the law and monitored.",
  },
  fair_bias_managed: {
    averse: "No AI that could produce unfair outcomes for any group, however unlikely.",
    minimal: "Only systems tested for bias across groups, including in combination, with people reviewing outputs.",
    cautious: "Some residual disparity accepted where it is measured, explained and monitored over time.",
    open: "Untested fairness accepted for low-impact uses, with monitoring of outcomes across groups.",
  },
  financial: {
    averse: "No financial loss from the AI solution is acceptable.",
    minimal: "Minimal financial impact, and only where essential to delivery.",
    cautious: "Little residual loss, and only for a clear benefit to users or the organisation.",
    open: "Investment for productivity gains, with losses managed to an acceptable level.",
  },
  legal_regulatory: {
    averse: "No AI project with any chance of legal challenge, however unlikely to succeed.",
    minimal: "Only projects with no chance of significant legal challenge.",
    cautious: "Only projects with little chance of a successful legal challenge.",
    open: "Projects open to challenge, where mitigation makes success likely and the gain outweighs the risk.",
  },
};

/** `theme` is the Playbook subcategory the suggestion is drawn from. */
const TREATMENTS: readonly TreatmentSuggestion<NistCategory>[] = [
  { key: "nist.valid.operating_limits", theme: "MEASURE 2.5", categories: ["valid_reliable"], treatment: "limitation",
    text: "Define and document the conditions the system is validated for and its operational limits, and keep it within them." },
  { key: "nist.valid.deployment_testing", theme: "MANAGE 4.1", categories: ["valid_reliable"], treatment: "limitation",
    text: "Evaluate the system in conditions like its real context of use before deployment, and repeat the evaluation after it." },
  { key: "nist.valid.drift", theme: "MANAGE 2.3", categories: ["valid_reliable"], treatment: "limitation",
    text: "Monitor the system's components for drift and decontextualisation, with thresholds that trigger review." },
  { key: "nist.valid.non_ai_alternative", theme: "MANAGE 2.1", categories: ["valid_reliable", "financial"], treatment: "avoidance",
    text: "Weigh manual, semi-automated or other non-AI alternatives, and use one where the AI cannot be shown to perform." },
  { key: "nist.safe.stress_testing", theme: "MEASURE 2.6", categories: ["safe", "valid_reliable"], treatment: "limitation",
    text: "Stress-test the system in likely scenarios and beyond its known limits, including conditions like past incidents, with domain experts." },
  { key: "nist.safe.fail_safe", theme: "MEASURE 2.6", categories: ["safe"], treatment: "limitation",
    text: "Document the conditions under which the system has been shown to fail safely, and widen them as testing and incidents teach you more." },
  { key: "nist.safe.bypass", theme: "MANAGE 2.4", categories: ["safe", "valid_reliable"], treatment: "avoidance",
    text: "Keep and regularly review a way to bypass or deactivate the system, with a backup that keeps the service running and set thresholds for using it." },
  { key: "nist.safe.decommission", theme: "MANAGE 2.3", categories: ["safe"], treatment: "avoidance",
    text: "Decommission systems, or components, that exceed the organisation's risk tolerance and cannot be brought back within it." },
  { key: "nist.safe.environment", theme: "MEASURE 2.12", categories: ["safe"], treatment: "limitation",
    text: "Set acceptable levels of energy and water use and emissions for the system, measure against them, and decide in advance what happens if they are exceeded." },
  { key: "nist.secure.red_team", theme: "MEASURE 2.7", categories: ["secure_resilient"], treatment: "limitation",
    text: "Red-team the system under adversarial and stress conditions at a set cadence, and record the results and the fixes made." },
  { key: "nist.secure.countermeasures", theme: "MANAGE 2.2", categories: ["secure_resilient"], treatment: "limitation",
    text: "Apply machine-learning and end-point countermeasures such as robust models, authentication, throttling and differential privacy." },
  { key: "nist.secure.share_attacks", theme: "MANAGE 4.1", categories: ["secure_resilient"], treatment: "limitation",
    text: "Share information about errors, near-misses and attack patterns with incident databases and organisations running similar systems." },
  { key: "nist.secure.third_party_audit", theme: "MEASURE 2.7", categories: ["secure_resilient"], treatment: "transference",
    text: "Require third-party AI resources and personnel to undergo security audits and screening, and treat a refusal to provide security information as a warning sign." },
  { key: "nist.accountable.audit_logs", theme: "MEASURE 2.8", categories: ["accountable_transparent"], treatment: "limitation",
    text: "Keep histories and audit logs that let people review possible sources of error, bias or vulnerability." },
  { key: "nist.accountable.oversight_records", theme: "MEASURE 2.8", categories: ["accountable_transparent"], treatment: "limitation",
    text: "Record the oversight people give the system's outputs, including overrides, complaints, response times and go or no-go decisions." },
  { key: "nist.accountable.appeals", theme: "MEASURE 3.3", categories: ["accountable_transparent", "fair_bias_managed"], treatment: "limitation",
    text: "Give users and affected people a way to report problems and appeal outcomes, and use what they report to evaluate the system." },
  { key: "nist.accountable.incident_records", theme: "MANAGE 4.3", categories: ["accountable_transparent", "safe"], treatment: "limitation",
    text: "Keep a record of errors, near-misses and incidents, with their impact and the response, and tell those affected." },
  { key: "nist.explain.interpretable_models", theme: "MEASURE 2.9", categories: ["explainable_interpretable"], treatment: "avoidance",
    text: "Where it will do the job, use an approach that is explainable by design, such as a rules-based model or decision tree." },
  { key: "nist.explain.test_explanations", theme: "MEASURE 2.9", categories: ["explainable_interpretable"], treatment: "limitation",
    text: "Test explanations before deployment with operators, end users and the people decisions are about, for whether they are accurate and understood." },
  { key: "nist.explain.model_documentation", theme: "MEASURE 2.9", categories: ["explainable_interpretable", "accountable_transparent"], treatment: "limitation",
    text: "Document the model: its type, features, training data, intended uses, decision thresholds and known limitations." },
  { key: "nist.privacy.minimisation", theme: "MANAGE 2.2", categories: ["privacy_enhanced"], treatment: "limitation",
    text: "Apply data minimisation, and honour rectification and deletion requests through the data the system was trained and runs on." },
  { key: "nist.privacy.reidentification", theme: "MEASURE 2.10", categories: ["privacy_enhanced"], treatment: "limitation",
    text: "Measure how far individuals or groups can be identified from the data, and monitor for inference of sensitive or protected attributes." },
  { key: "nist.privacy.access_controls", theme: "MEASURE 2.10", categories: ["privacy_enhanced", "secure_resilient"], treatment: "limitation",
    text: "Set access controls and retention for training and production data holding personal information, and monitor queries that isolate individual records." },
  { key: "nist.privacy.pets", theme: "MEASURE 2.10", categories: ["privacy_enhanced"], treatment: "limitation",
    text: "Use privacy-enhancing techniques, such as differential privacy, before sharing information derived from personal data." },
  { key: "nist.fair.assessment", theme: "MEASURE 2.11", categories: ["fair_bias_managed"], treatment: "limitation",
    text: "Assess fairness: identify the harms and the groups, including intersecting groups, that could suffer them, and measure disparities with general and context-specific metrics." },
  { key: "nist.fair.proxies", theme: "MEASURE 2.11", categories: ["fair_bias_managed"], treatment: "limitation",
    text: "Identify input features that could act as proxies for protected characteristics, and remove or control them." },
  { key: "nist.fair.affected_communities", theme: "MEASURE 2.11", categories: ["fair_bias_managed"], treatment: "limitation",
    text: "Use impact assessments informed by the communities who could be affected, including on disability inclusion." },
  { key: "nist.third_party.monitor", theme: "MANAGE 3.1", categories: ["valid_reliable", "secure_resilient"], treatment: "transference",
    text: "Apply the organisation's risk tolerance to third-party AI, monitor it for negative impacts, and ask suppliers to report vulnerabilities, risks and biases." },
  { key: "nist.third_party.pretrained", theme: "MANAGE 3.2", categories: ["valid_reliable"], treatment: "limitation",
    text: "Track the pre-trained models the system depends on, and monitor their performance independently of the supplier." },
  { key: "nist.third_party.contingency", theme: "GOVERN 6.2", categories: ["valid_reliable", "financial"], treatment: "avoidance",
    text: "Plan for a vital third-party AI system failing, with redundancy, and make sure incident response plans cover it." },
  { key: "nist.financial.failure_costs", theme: "MAP 3.2", categories: ["financial"], treatment: "limitation",
    text: "Evaluate the costs of internal and external failures regularly, and plan to prevent, detect or correct them." },
  { key: "nist.financial.sustain_value", theme: "MANAGE 2.2", categories: ["financial"], treatment: "limitation",
    text: "Put mechanisms in place to sustain the system's value once deployed, and review whether it still delivers it." },
  { key: "nist.legal.requirements", theme: "GOVERN 1.1", categories: ["legal_regulatory"], treatment: "limitation",
    text: "Keep track of the legal and regulatory requirements for the sector and use, align risk management with them, and train staff on them." },
  { key: "nist.legal.third_party_rights", theme: "MAP 4.1", categories: ["legal_regulatory"], treatment: "transference",
    text: "Map the legal risks of third-party data, models and software, including infringing someone's intellectual property, and cover them in contract." },
];

/**
 * Contains material from NIST AI 100-1 and the AI RMF Playbook, works of the
 * US Government not subject to copyright.
 */
export const NIST_AI_RMF: AiFrameworkPack = {
  id: "nist_ai_rmf",
  label: "NIST AI Risk Management Framework",
  summary:
    "NIST AI RMF 1.0 and its Playbook: risk filed by the characteristics of trustworthy AI, assessed through Map and Measure, and treated through Manage.",
  categories: CATEGORIES,
  appetiteGuidance: APPETITE_GUIDANCE,
  treatments: TREATMENTS,
};
