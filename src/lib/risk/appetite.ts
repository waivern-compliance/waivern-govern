import { AI_RISK_CATEGORIES, AI_RISK_CATEGORY_LABEL, type AiRiskCategory } from "./categories";
import { tierRank, type RiskTier } from "./scale";

/**
 * Risk appetite, and whether a risk sits within it.
 *
 * Pure, so the dashboard, the register and the risk page all reach the same
 * answer from the same inputs, and so the rule can be tested without a database.
 */

export type AppetiteLevel = "averse" | "minimal" | "cautious" | "open";

/** Every appetite applies to a category, or to everything without one. */
export type AppetiteScope = AiRiskCategory | "default";

export const APPETITE_LEVELS: readonly AppetiteLevel[] = ["averse", "minimal", "cautious", "open"];

export const APPETITE_LEVEL_LABEL: Record<AppetiteLevel, string> = {
  averse: "Averse",
  minimal: "Minimal",
  cautious: "Cautious",
  open: "Open",
};

/**
 * The highest residual tier each level would normally tolerate.
 *
 * Offered as the starting point when a statement is written, never applied on
 * the organisation's behalf: the tolerated tier is part of what gets signed
 * off. Averse and minimal both stop at low — the difference between them is
 * whether such a project should be undertaken at all, which is the statement's
 * words to say, not a tier.
 */
export const SUGGESTED_TOLERANCE: Record<AppetiteLevel, RiskTier> = {
  averse: "low",
  minimal: "low",
  cautious: "medium",
  open: "high",
};

/**
 * What each level means for each category, in short.
 *
 * Paraphrased from Appendix 2 of DSIT's AI Risk Management Toolkit, which
 * offers these as examples to adapt rather than a standard to adopt. Shown
 * beside the form as a prompt, so the statement somebody writes is theirs.
 */
export const APPETITE_GUIDANCE: Record<AiRiskCategory, Record<AppetiteLevel, string>> = {
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
  transparency_explainability: {
    averse: "Avoid AI projects carrying transparency or explainability risk.",
    minimal: "Low risk only, with significant effort on open communication about the AI.",
    cautious: "Where benefits outweigh the risk, with processes to explain decisions to the people affected.",
    open: "Some risk accepted for benefit, with controls scaled to the trade-off between accuracy and explainability.",
  },
  fairness: {
    averse: "No AI project that may affect people's rights or discriminate unfairly.",
    minimal: "Low chance of unfair outcomes, only if essential, with steps such as human-in-the-loop to eliminate it.",
    cautious: "Little chance of significant unfairness, where benefits outweigh risk and it is mitigated.",
    open: "Potential impact on rights accepted where benefits outweigh it and controls minimise it.",
  },
  accountability_governance: {
    averse: "Avoid projects with accountability risk; no decision taken outside AI processes and oversight.",
    minimal: "Low risk only; controls maximise accountability through robust controls and sanctions.",
    cautious: "Where benefits outweigh the risk, with appropriate controls and sanctions.",
    open: "Some risk accepted for benefit, with controls scaled to the risk.",
  },
  contestability_redress: {
    averse: "No AI project where anyone affected could contest a decision or outcome.",
    minimal: "Only where there is a very small likelihood of an outcome being contested.",
    cautious: "Only where there is little chance of contest, and steps are taken to minimise it.",
    open: "Contest is possible, and appropriate steps are taken to minimise its likelihood.",
  },
  technical_robustness: {
    averse: "No AI system that cannot reliably function as intended across its lifecycle.",
    minimal: "Only essential AI systems, to protect current operations.",
    cautious: "Robustness risk accepted where mitigated through stress testing, performance targets and improvement.",
    open: "Robustness is weighed as an enabler of better delivery; agile iteration accepted.",
  },
  security: {
    averse: "No tolerance for AI security risks such as data poisoning, leakage or prompt injection.",
    minimal: "Minimal appetite, with stringent security measures in place.",
    cautious: "Limited risk accepted for business need, with appropriate measures scaled to the risk.",
    open: "Cautious acceptance for business need, with appropriate measures scaled to the risk.",
  },
  environment_people: {
    averse: "No AI project with a high chance of harm to wellbeing, infrastructure or the environment.",
    minimal: "Low chance of harm only, if essential, with steps such as human-in-the-loop to eliminate it.",
    cautious: "Little chance of significant harm, where benefits outweigh risk and it is mitigated.",
    open: "Potential harm accepted where benefits outweigh it and controls minimise it.",
  },
};

export const SCOPES: readonly AppetiteScope[] = [
  "default",
  ...AI_RISK_CATEGORIES.map((c) => c.value),
];

/** "Fairness", or "the organisation default". */
export function scopeLabel(scope: string): string {
  if (scope === "default") return "the organisation default";
  return AI_RISK_CATEGORY_LABEL[scope as AiRiskCategory] ?? scope;
}

export function isScope(value: unknown): value is AppetiteScope {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

/** The statements in force, by the scope they apply to. */
export type AppetiteInForce = Partial<
  Record<AppetiteScope, { id: string; level: AppetiteLevel; toleratedTier: RiskTier }>
>;

/**
 * What a risk is judged against when the organisation has said nothing.
 *
 * The rule the dashboard has always used: residual high or critical is outside
 * appetite. Kept as the fallback so an organisation that has not yet written an
 * appetite statement sees exactly what it saw before — and the risk page says
 * that this is the platform's assumption, not theirs.
 */
export const PLATFORM_TOLERANCE: RiskTier = "medium";

export type AppetiteJudgement =
  | { state: "closed" }
  /** No residual rating yet. Not within appetite — nobody has measured it. */
  | { state: "unrated"; basis: AppetiteBasis }
  | { state: "within" | "outside"; basis: AppetiteBasis; residualTier: RiskTier };

export type AppetiteBasis =
  | { source: "category"; scope: AiRiskCategory; id: string; level: AppetiteLevel; toleratedTier: RiskTier }
  | { source: "default"; id: string; level: AppetiteLevel; toleratedTier: RiskTier }
  | { source: "platform"; toleratedTier: RiskTier };

/** Which statement a risk is judged against: its category's, else the default, else ours. */
export function basisFor(category: string | null, inForce: AppetiteInForce): AppetiteBasis {
  if (category && category !== "default" && isScope(category)) {
    const own = inForce[category];
    if (own) return { source: "category", scope: category as AiRiskCategory, ...own };
  }
  const fallback = inForce.default;
  if (fallback) return { source: "default", ...fallback };
  return { source: "platform", toleratedTier: PLATFORM_TOLERANCE };
}

export function judge(
  risk: { category: string | null; residualTier: RiskTier | null; status: string },
  inForce: AppetiteInForce,
): AppetiteJudgement {
  if (risk.status === "closed") return { state: "closed" };
  const basis = basisFor(risk.category, inForce);
  if (risk.residualTier === null) return { state: "unrated", basis };
  return {
    state: tierRank(risk.residualTier) <= tierRank(basis.toleratedTier) ? "within" : "outside",
    basis,
    residualTier: risk.residualTier,
  };
}

/** Counts towards "not within appetite": outside it, or never measured against it. */
export function notWithinAppetite(j: AppetiteJudgement): boolean {
  return j.state === "outside" || j.state === "unrated";
}
