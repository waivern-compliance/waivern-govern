import type { AiRiskCategory } from "@/lib/risk/categories";
import type { TrustworthyCharacteristic } from "./nist-ai-rmf";
import type { AiFrameworkId } from "./types";

/**
 * How the UK set and NIST AI RMF 1.0 line up.
 *
 * Two uses. When an organisation moves from one framework to the other, its
 * risks are re-filed and its appetite statements re-proposed through the
 * category mapping. And whichever framework it follows, a record can show where
 * it stands under the other, which is what an organisation asked to show
 * alignment with both needs.
 *
 * This is Waivern's reading, not either publisher's. Neither DSIT nor NIST
 * publishes a crosswalk between the two, so every pairing here is a judgement
 * a reviewer may disagree with, and is written to be checked.
 */

/**
 * Each DSIT category, the trustworthiness characteristics it corresponds to,
 * and the subcategories where NIST deals with it.
 *
 * Not one-to-one. Financial and legal risk have no characteristic: NIST's seven
 * describe a trustworthy system, not every way an AI project can cost an
 * organisation. Privacy runs the other way: NIST makes it a characteristic,
 * while DSIT files it under legal and regulatory compliance.
 */
export const DSIT_TO_NIST: Record<
  AiRiskCategory,
  { characteristics: readonly TrustworthyCharacteristic[]; subcategories: readonly string[] }
> = {
  financial: { characteristics: [], subcategories: ["MAP 3.2", "MANAGE 2.1", "MANAGE 2.2"] },
  legal_regulatory: { characteristics: ["privacy_enhanced"], subcategories: ["GOVERN 1.1", "MAP 4.1", "MEASURE 2.10"] },
  transparency_explainability: {
    characteristics: ["accountable_transparent", "explainable_interpretable"],
    subcategories: ["MAP 2.2", "MEASURE 2.8", "MEASURE 2.9"],
  },
  fairness: { characteristics: ["fair_bias_managed"], subcategories: ["MEASURE 2.11", "MAP 5.1"] },
  accountability_governance: {
    characteristics: ["accountable_transparent"],
    subcategories: ["GOVERN 2.1", "GOVERN 2.3", "GOVERN 3.2", "MAP 3.5"],
  },
  contestability_redress: { characteristics: ["accountable_transparent"], subcategories: ["MEASURE 3.3", "MANAGE 4.1"] },
  technical_robustness: { characteristics: ["valid_reliable"], subcategories: ["MEASURE 2.3", "MEASURE 2.4", "MEASURE 2.5"] },
  security: { characteristics: ["secure_resilient"], subcategories: ["MEASURE 2.7"] },
  environment_people: { characteristics: ["safe"], subcategories: ["MEASURE 2.6", "MEASURE 2.12"] },
};

/**
 * Each characteristic, and the DSIT category a risk under it is filed back
 * into. One each, because a move back to the UK set has to land every risk
 * somewhere; where two DSIT categories share a characteristic, the closer one
 * is chosen.
 */
export const NIST_TO_DSIT: Record<TrustworthyCharacteristic, AiRiskCategory> = {
  valid_reliable: "technical_robustness",
  safe: "environment_people",
  secure_resilient: "security",
  accountable_transparent: "accountability_governance",
  explainable_interpretable: "transparency_explainability",
  privacy_enhanced: "legal_regulatory",
  fair_bias_managed: "fairness",
};

/**
 * What Govern already does, and the NIST subcategories it goes towards.
 *
 * "Goes towards", not "satisfies": a feature gives an organisation the means
 * to meet a subcategory, and whether it does is for a NIST profile to record.
 * These were built from the UK set, and this is the evidence that they carry
 * over.
 */
export const GOVERN_FEATURES_TO_NIST: ReadonlyArray<{ feature: string; label: string; subcategories: readonly string[] }> = [
  { feature: "ai_register", label: "AI register", subcategories: ["GOVERN 1.6", "MAP 2.1"] },
  { feature: "ai_intake", label: "Proposals to use AI, prioritised on value and feasibility", subcategories: ["MAP 1.3", "MAP 1.4", "MAP 3.1", "MAP 3.2"] },
  { feature: "ai_risk_assessment", label: "AI risk identification and assessment", subcategories: ["MAP 1.1", "MAP 5.1", "MEASURE 1.1"] },
  { feature: "risk_register", label: "Risk register, treatments and acceptance", subcategories: ["MANAGE 1.2", "MANAGE 1.3", "MANAGE 1.4", "MEASURE 3.1"] },
  { feature: "risk_appetite", label: "Risk appetite per category", subcategories: ["GOVERN 1.3", "MAP 1.5"] },
  { feature: "approval_chains", label: "Approval chains, with responsible AI review", subcategories: ["GOVERN 1.4", "GOVERN 2.1", "MEASURE 1.3"] },
  { feature: "ai_board", label: "AI governance board stage", subcategories: ["GOVERN 2.3", "MANAGE 1.1"] },
  {
    feature: "ai_assurance",
    label: "Assurance records: tests, evaluations and model cards",
    subcategories: ["MEASURE 1.3", "MEASURE 2.1", "MEASURE 2.3", "MEASURE 2.5", "MEASURE 2.7", "MEASURE 2.11"],
  },
  { feature: "lifecycle_gates", label: "Lifecycle gates before going live", subcategories: ["MANAGE 1.1", "MEASURE 2.5", "GOVERN 1.5"] },
  { feature: "retirement", label: "Retiring an AI system", subcategories: ["GOVERN 1.7", "MANAGE 2.4"] },
  { feature: "training", label: "AI training requirements by role", subcategories: ["GOVERN 2.2", "MAP 3.4"] },
  { feature: "ai_suppliers", label: "AI supplier assessment", subcategories: ["GOVERN 6.1", "GOVERN 6.2", "MAP 4.1", "MANAGE 3.1", "MANAGE 3.2"] },
  {
    feature: "ai_incidents",
    label: "AI incidents and concerns, raised confidentially if need be",
    subcategories: ["GOVERN 4.3", "GOVERN 5.1", "MANAGE 2.3", "MANAGE 4.3", "MEASURE 3.3"],
  },
  { feature: "atrs", label: "Algorithmic transparency records", subcategories: ["GOVERN 4.2", "MAP 2.2", "MEASURE 2.8"] },
  { feature: "eia", label: "Equality impact assessment", subcategories: ["MEASURE 2.11", "MAP 5.1"] },
  { feature: "dpia", label: "Data protection impact assessment", subcategories: ["MEASURE 2.10", "GOVERN 1.1"] },
];

/**
 * The category a risk is re-filed under when the organisation moves to
 * another framework, or `null` to leave it where it is.
 *
 * One category each way, because a risk sits in one. Financial and legal risk
 * keep their values in both frameworks and stay put; so does anything filed
 * under a category of the organisation's own. Where a UK category spans two
 * characteristics, the risk goes to the closer: transparency and explainability
 * to explainable and interpretable, since accountability and governance already
 * brings the transparency of who answers for a system. Each move is recorded
 * against the risk, so a wrong guess is visible and can be put right.
 */
const UK_TO_NIST_REFILE: Partial<Record<AiRiskCategory, TrustworthyCharacteristic>> = {
  transparency_explainability: "explainable_interpretable",
  fairness: "fair_bias_managed",
  accountability_governance: "accountable_transparent",
  contestability_redress: "accountable_transparent",
  technical_robustness: "valid_reliable",
  security: "secure_resilient",
  environment_people: "safe",
};

export function refileCategory(category: string | null, to: AiFrameworkId): string | null {
  if (!category) return null;
  if (to === "nist_ai_rmf") return UK_TO_NIST_REFILE[category as AiRiskCategory] ?? null;
  return NIST_TO_DSIT[category as TrustworthyCharacteristic] ?? null;
}
