/**
 * Buying AI: what to ask a supplier, and what the contract should hold them to.
 *
 * Drawn from Procurement Policy Note 02/24 (which gives buyers questions to
 * find out where suppliers use AI, in their bids and in delivering services),
 * the Crown Commercial Service's data ethics requirements for suppliers, the
 * Guidelines for AI procurement, and the Playbook's advice on specifying AI —
 * understand the supplier's approach, guard against lock-in, settle who owns
 * what is built. DSIT's toolkit adds the third-party treatments: suppliers
 * report issues in what they supply, and contracts carry warranties.
 *
 * The facts a person judges — does it train on our data, what does the
 * contract say — are answers in the supplier's AI assessment, not columns on
 * the supplier. The register reads them from the approved assessment, as the
 * AI register does, so the gap list reflects what somebody signed rather than
 * a copy that has since drifted.
 */

export type AiInvolvement = "none" | "in_delivery" | "ai_product";

export const AI_INVOLVEMENT_LABEL: Record<AiInvolvement, string> = {
  none: "Does not use AI in what it provides",
  in_delivery: "Uses AI in delivering the service",
  ai_product: "Supplies an AI product, model or service",
};

export function isAiInvolvement(value: unknown): value is AiInvolvement {
  return typeof value === "string" && value in AI_INVOLVEMENT_LABEL;
}

export function involvesAi(value: AiInvolvement | null | undefined): boolean {
  return value === "in_delivery" || value === "ai_product";
}

/**
 * Terms a contract for AI should carry. `expected` marks the ones whose absence
 * is reported: the rest are worth having, and are asked about, but depend on
 * the use enough that their absence is not a gap in itself.
 */
export const AI_CONTRACT_TERMS = [
  { value: "ai_use_disclosed", expected: true,
    label: "The supplier tells us where AI is used in delivering the service, and before it starts using more" },
  { value: "no_training_on_our_data", expected: true,
    label: "Our data, and data about the people we serve, is not used to train or improve their models without our agreement" },
  { value: "model_change_notice", expected: true,
    label: "Notice before a material change to the model, its provider or how it is trained" },
  { value: "incident_notification", expected: true,
    label: "Incidents, failures and vulnerabilities in what they supply are reported to us promptly" },
  { value: "data_return_deletion", expected: true,
    label: "Our data, and anything derived from it, is returned or deleted when the contract ends" },
  { value: "audit_and_testing_access", expected: false,
    label: "Access to documentation, test results and audit, enough for us to test it ourselves" },
  { value: "transparency_support", expected: false,
    label: "The information an Algorithmic Transparency Recording Standard record needs" },
  { value: "warranty_indemnity", expected: false,
    label: "Warranties and indemnities covering the AI's failure and intellectual property" },
] as const;

export type AiContractTerm = (typeof AI_CONTRACT_TERMS)[number]["value"];

export const EXPECTED_TERMS: AiContractTerm[] = AI_CONTRACT_TERMS.filter((t) => t.expected).map(
  (t) => t.value,
);

export type AiSupplierGap =
  | "ai_involvement_unrecorded"
  | "ai_not_assessed"
  | "ai_assessment_not_approved"
  | "ai_trains_on_our_data"
  | "ai_training_unknown"
  | "ai_terms_missing";

export const AI_GAP_WORDS: Record<AiSupplierGap, string> = {
  ai_involvement_unrecorded: "Supplies an AI system; AI use not recorded",
  ai_not_assessed: "AI supply never assessed",
  ai_assessment_not_approved: "AI supplier assessment not finished",
  ai_trains_on_our_data: "Trains on our data without agreement",
  ai_training_unknown: "Not known whether it trains on our data",
  ai_terms_missing: "Contract lacks expected AI terms",
};

export const SERIOUS_AI_GAPS: AiSupplierGap[] = ["ai_trains_on_our_data"];

/** What the latest AI supplier assessment says, in the terms the gaps need. */
export type AiSupplierAssessed = {
  reference: string;
  assessmentId: string;
  approved: boolean;
  trainsOnOurData: string | null;
  contractTerms: string[];
  recommendation: string | null;
};

/**
 * Gaps for one supplier's AI supply.
 *
 * Nothing is asked of a supplier that does not use AI and supplies none of the
 * register's systems — asking every stationer about model training is how a
 * gap list stops being read.
 */
export function aiSupplierGaps(
  involvement: AiInvolvement | null,
  assessed: AiSupplierAssessed | null,
  /** How many AI systems on the register name this supplier. */
  systemsSupplied: number,
): { gaps: AiSupplierGap[]; missingTerms: AiContractTerm[] } {
  const gaps: AiSupplierGap[] = [];
  const missingTerms: AiContractTerm[] = [];

  if (systemsSupplied > 0 && !involvesAi(involvement)) gaps.push("ai_involvement_unrecorded");
  if (!involvesAi(involvement) && systemsSupplied === 0) return { gaps, missingTerms };

  if (!assessed) {
    gaps.push("ai_not_assessed");
    return { gaps, missingTerms };
  }
  // Answers in an unfinished assessment are not yet anybody's judgement; the
  // only gap worth reporting is that it is unfinished.
  if (!assessed.approved) {
    gaps.push("ai_assessment_not_approved");
    return { gaps, missingTerms };
  }

  if (assessed.trainsOnOurData === "yes_without_agreement") gaps.push("ai_trains_on_our_data");
  else if (assessed.trainsOnOurData === "unknown" || !assessed.trainsOnOurData) {
    gaps.push("ai_training_unknown");
  }

  for (const t of EXPECTED_TERMS) if (!assessed.contractTerms.includes(t)) missingTerms.push(t);
  if (missingTerms.length > 0) gaps.push("ai_terms_missing");

  return { gaps, missingTerms };
}
