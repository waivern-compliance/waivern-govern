/**
 * The organisation-wide risk scale.
 *
 * Templates carry their own scoring configuration, because a DPIA and an AI risk
 * assessment weigh different things. The register needs one scale that everything
 * lands on, or a board-level view is comparing numbers that do not mean the same
 * thing.
 *
 * One scale per organisation, chosen from two. Four by four is the default —
 * the method the original buyer already uses, so their existing register and
 * this one can be read side by side. Five by five is the Orange Book method that
 * DSIT's AI Risk Management Toolkit scores against, which a UK public body will
 * be expected to use. An organisation picks one, and can only change it while
 * the register is empty: switching with risks on it would leave some rated on
 * one scale and some on the other, which is the comparison this exists to stop.
 */

export type RiskTier = "low" | "medium" | "high" | "critical";

export type RiskScaleId = "4x4" | "5x5";

export type ScalePoint = { value: number; label: string; help: string };

type Band = { max: number; tier: RiskTier; label: string };

export type RiskScale = {
  id: RiskScaleId;
  name: string;
  /** For the middle of a sentence: "rated on the five by five scale". */
  inSentence: string;
  description: string;
  likelihood: readonly ScalePoint[];
  impact: readonly ScalePoint[];
  bands: readonly Band[];
};

const BAND_LABEL: Record<RiskTier, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const band = (max: number, tier: RiskTier): Band => ({ max, tier, label: BAND_LABEL[tier] });

export const SCALES: Record<RiskScaleId, RiskScale> = {
  "4x4": {
    id: "4x4",
    name: "Four by four",
    inSentence: "four by four",
    description: "Likelihood and impact from 1 to 4. The default.",
    likelihood: [
      { value: 1, label: "Remote", help: "Hard to foresee a realistic path" },
      { value: 2, label: "Unlikely", help: "Possible but not expected" },
      { value: 3, label: "Possible", help: "Could reasonably happen" },
      { value: 4, label: "Likely", help: "Expected without intervention" },
    ],
    impact: [
      { value: 1, label: "Minimal", help: "Inconvenience, quickly resolved" },
      { value: 2, label: "Limited", help: "Some distress or minor detriment" },
      { value: 3, label: "Significant", help: "Material harm, distress or discrimination" },
      { value: 4, label: "Severe", help: "Serious or irreversible harm" },
    ],
    bands: [band(3, "low"), band(7, "medium"), band(11, "high"), band(16, "critical")],
  },
  "5x5": {
    id: "5x5",
    name: "Five by five (Orange Book)",
    inSentence: "five by five",
    description:
      "Likelihood and impact from 1 to 5, with the probability ranges and impact levels of DSIT's AI Risk Management Toolkit.",
    // The toolkit's own likelihood scale, probability ranges included, so a
    // rating can be checked against what the number was meant to say.
    likelihood: [
      { value: 1, label: "Rare", help: "Highly unlikely to occur — under 5%" },
      { value: 2, label: "Unlikely", help: "Unlikely but possible — 5% to 20%" },
      { value: 3, label: "Possible", help: "Could occur at some time — 20% to 50%" },
      { value: 4, label: "Likely", help: "Likely in many circumstances — 50% to 80%" },
      { value: 5, label: "Almost certain", help: "Almost certain to occur — over 80%" },
    ],
    // The toolkit's impact levels, with one quantified marker from each so the
    // levels mean the same thing to everyone rating against them.
    impact: [
      { value: 1, label: "Negligible", help: "Loss under £10,000; downtime under an hour; no change in public trust" },
      { value: 2, label: "Minor", help: "Loss £10,000 to £50,000; downtime of 1 to 4 hours; slight dent in trust" },
      { value: 3, label: "Moderate", help: "Loss £50,000 to £200,000; downtime of 4 to 8 hours; noticeable harm to people or trust" },
      { value: 4, label: "Major", help: "Loss £200,000 to £1 million; downtime of 8 to 24 hours; significant harm or media coverage" },
      { value: 5, label: "Catastrophic", help: "Loss over £1 million; downtime over a day; severe harm, or severe loss of public confidence" },
    ],
    // DSIT does not publish bands. These follow the usual Orange Book heat map:
    // nothing above "possible and moderate" is low, and only the top corner —
    // likely or certain and major or catastrophic — is critical.
    bands: [band(4, "low"), band(9, "medium"), band(15, "high"), band(25, "critical")],
  },
};

export const DEFAULT_SCALE: RiskScaleId = "4x4";

export function isScaleId(value: unknown): value is RiskScaleId {
  return value === "4x4" || value === "5x5";
}

/** The highest point on the scale's axes. */
export function scaleMax(scale: RiskScaleId = DEFAULT_SCALE): number {
  return SCALES[scale].likelihood.length;
}

/** The four-by-four axes, for callers that predate the choice of scale. */
export const LIKELIHOOD = SCALES["4x4"].likelihood;
export const IMPACT = SCALES["4x4"].impact;

export const MIN_SCALE = 1;
export const MAX_SCALE = scaleMax("4x4");

export function isOnScale(value: number, scale: RiskScaleId = DEFAULT_SCALE): boolean {
  return Number.isInteger(value) && value >= MIN_SCALE && value <= scaleMax(scale);
}

/**
 * Score and tier from likelihood and impact.
 *
 * Derived, never stored as an independent judgement and never set by a model.
 * A tier that can disagree with its own inputs is the single most damaging
 * defect a risk register can have: it looks authoritative and cannot be
 * reconciled with the numbers beside it.
 */
export function rate(likelihood: number, impact: number, scale: RiskScaleId = DEFAULT_SCALE) {
  if (!isOnScale(likelihood, scale) || !isOnScale(impact, scale)) {
    throw new Error(
      `Likelihood and impact must be integers from ${MIN_SCALE} to ${scaleMax(scale)}`,
    );
  }
  const score = likelihood * impact;
  const found = SCALES[scale].bands.find((b) => score <= b.max)!;
  return { score, tier: found.tier, label: found.label };
}

export function labelFor(
  kind: "likelihood" | "impact",
  value: number,
  scale: RiskScaleId = DEFAULT_SCALE,
): string {
  const axis = kind === "likelihood" ? SCALES[scale].likelihood : SCALES[scale].impact;
  return axis.find((s) => s.value === value)?.label ?? String(value);
}

/** Tiers in ascending order of seriousness. */
export const TIER_ORDER: readonly RiskTier[] = ["low", "medium", "high", "critical"];

export function tierRank(tier: RiskTier): number {
  return TIER_ORDER.indexOf(tier);
}

/**
 * Map a template's own scoring result onto the register scale.
 *
 * Templates that score likelihood-by-impact on an axis the same length as the
 * organisation's map straight across. Anything else — a weighted sum, or a
 * four-point template feeding a five-point register — cannot be converted
 * without inventing information, so this returns null and a human sets the
 * inherent rating themselves. A 3 of 4 is not a 3 of 5, and treating it as one
 * would put a number in the register that nobody chose.
 */
export function fromTemplateScore(
  score: { scored: boolean; components?: Array<{ question: string; contribution: number }> },
  scoring: {
    method: string;
    likelihoodQuestion?: string;
    impactQuestion?: string;
    likelihoodScale?: Record<string, number>;
    impactScale?: Record<string, number>;
  },
  scale: RiskScaleId = DEFAULT_SCALE,
): { likelihood: number; impact: number } | null {
  if (!score.scored || scoring.method !== "likelihood_impact") return null;
  const axisLength = (axis?: Record<string, number>) =>
    axis ? Math.max(...Object.values(axis)) : scaleMax(scale);
  if (
    axisLength(scoring.likelihoodScale) !== scaleMax(scale) ||
    axisLength(scoring.impactScale) !== scaleMax(scale)
  ) {
    return null;
  }
  const components = score.components ?? [];
  const l = components.find((c) => c.question === scoring.likelihoodQuestion)?.contribution;
  const i = components.find((c) => c.question === scoring.impactQuestion)?.contribution;
  if (l === undefined || i === undefined) return null;
  if (!isOnScale(l, scale) || !isOnScale(i, scale)) return null;
  return { likelihood: l, impact: i };
}
