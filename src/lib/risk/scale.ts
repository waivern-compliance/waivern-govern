/**
 * The organisation-wide risk scale.
 *
 * Templates carry their own scoring configuration, because a DPIA and an AI risk
 * assessment weigh different things. The register needs one scale that everything
 * lands on, or a board-level view is comparing numbers that do not mean the same
 * thing. Four by four, likelihood times impact — the method the buyer already
 * uses, so their existing register and this one can be read side by side.
 */

export const LIKELIHOOD = [
  { value: 1, label: "Remote", help: "Hard to foresee a realistic path" },
  { value: 2, label: "Unlikely", help: "Possible but not expected" },
  { value: 3, label: "Possible", help: "Could reasonably happen" },
  { value: 4, label: "Likely", help: "Expected without intervention" },
] as const;

export const IMPACT = [
  { value: 1, label: "Minimal", help: "Inconvenience, quickly resolved" },
  { value: 2, label: "Limited", help: "Some distress or minor detriment" },
  { value: 3, label: "Significant", help: "Material harm, distress or discrimination" },
  { value: 4, label: "Severe", help: "Serious or irreversible harm" },
] as const;

export type RiskTier = "low" | "medium" | "high" | "critical";

const BANDS: Array<{ max: number; tier: RiskTier; label: string }> = [
  { max: 3, tier: "low", label: "Low" },
  { max: 7, tier: "medium", label: "Medium" },
  { max: 11, tier: "high", label: "High" },
  { max: 16, tier: "critical", label: "Critical" },
];

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;

export function isOnScale(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_SCALE && value <= MAX_SCALE;
}

/**
 * Score and tier from likelihood and impact.
 *
 * Derived, never stored as an independent judgement and never set by a model.
 * A tier that can disagree with its own inputs is the single most damaging
 * defect a risk register can have: it looks authoritative and cannot be
 * reconciled with the numbers beside it.
 */
export function rate(likelihood: number, impact: number) {
  if (!isOnScale(likelihood) || !isOnScale(impact)) {
    throw new Error(
      `Likelihood and impact must be integers from ${MIN_SCALE} to ${MAX_SCALE}`,
    );
  }
  const score = likelihood * impact;
  const band = BANDS.find((b) => score <= b.max)!;
  return { score, tier: band.tier, label: band.label };
}

export function labelFor(kind: "likelihood" | "impact", value: number): string {
  const scale = kind === "likelihood" ? LIKELIHOOD : IMPACT;
  return scale.find((s) => s.value === value)?.label ?? String(value);
}

/**
 * Map a template's own scoring result onto the register scale.
 *
 * Templates that already score likelihood-by-impact on a four-point scale map
 * straight across. Anything else — a weighted sum, a different scale length —
 * cannot be converted without inventing information, so this returns null and a
 * human sets the inherent rating themselves. Guessing here would put a number
 * in the register that nobody chose.
 */
export function fromTemplateScore(
  score: { scored: boolean; components?: Array<{ question: string; contribution: number }> },
  scoring: { method: string; likelihoodQuestion?: string; impactQuestion?: string },
): { likelihood: number; impact: number } | null {
  if (!score.scored || scoring.method !== "likelihood_impact") return null;
  const components = score.components ?? [];
  const l = components.find((c) => c.question === scoring.likelihoodQuestion)?.contribution;
  const i = components.find((c) => c.question === scoring.impactQuestion)?.contribution;
  if (l === undefined || i === undefined) return null;
  if (!isOnScale(l) || !isOnScale(i)) return null;
  return { likelihood: l, impact: i };
}
