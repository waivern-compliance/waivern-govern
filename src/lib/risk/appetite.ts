import { categoryLabel, type AiFrameworkPack } from "@/lib/ai-frameworks";
import { tierRank, type RiskTier } from "./scale";

/**
 * Risk appetite, and whether a risk sits within it.
 *
 * Pure, so the dashboard, the register and the risk page all reach the same
 * answer from the same inputs, and so the rule can be tested without a database.
 */

export type AppetiteLevel = "averse" | "minimal" | "cautious" | "open";

/**
 * Every appetite applies to a category, or to everything without one. Which
 * categories exist is the organisation's framework's to say.
 */
export type AppetiteScope = string;

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

/** The scopes an organisation sets appetite for: the default, then each of its framework's categories. */
export function scopesFor(pack: AiFrameworkPack): AppetiteScope[] {
  return ["default", ...pack.categories.map((c) => c.value)];
}

/** "Fairness", or "the organisation default". */
export function scopeLabel(scope: string): string {
  if (scope === "default") return "the organisation default";
  return categoryLabel(scope) ?? scope;
}

/** A scope a new statement may be written for, under the organisation's framework. */
export function isScope(value: unknown, pack: AiFrameworkPack): value is AppetiteScope {
  return typeof value === "string" && scopesFor(pack).includes(value);
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
  | { source: "category"; scope: string; id: string; level: AppetiteLevel; toleratedTier: RiskTier }
  | { source: "default"; id: string; level: AppetiteLevel; toleratedTier: RiskTier }
  | { source: "platform"; toleratedTier: RiskTier };

/**
 * Which statement a risk is judged against: its category's, else the default,
 * else ours. Any approved statement for the risk's category counts, whichever
 * framework it was written under, so a risk is never judged against nothing
 * while statements under a new framework await sign-off.
 */
export function basisFor(category: string | null, inForce: AppetiteInForce): AppetiteBasis {
  if (category && category !== "default") {
    const own = inForce[category];
    if (own) return { source: "category", scope: category, ...own };
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
