import type { ScoringConfig, ScoreBand } from "./schema";
import type { Answers, EvaluationResult } from "./logic";
import type { TemplateSchema } from "./schema";

export type RiskTier = ScoreBand["tier"];

export type ScoreResult =
  | { scored: false; reason: "not_scored" | "incomplete" }
  | {
      scored: true;
      score: number;
      band: ScoreBand;
      /** The inputs that produced the score, for showing the working. */
      components: Array<{ question: string; value: string; contribution: number }>;
    };

function bandFor(bands: ScoreBand[], score: number): ScoreBand | undefined {
  return bands.find((b) => score >= b.min && score <= b.max);
}

/**
 * Turn answers into a score.
 *
 * Suppressed answers are excluded: a question that is no longer being asked
 * must not keep contributing to the score, or hiding a branch would leave an
 * invisible influence on the outcome.
 *
 * Scoring returns `incomplete` rather than a partial number when an input is
 * missing. A score computed from half its inputs looks authoritative and is
 * not, which in a risk register is worse than no score at all.
 */
export function score(
  config: ScoringConfig,
  schema: TemplateSchema,
  answers: Answers,
  evaluation: EvaluationResult,
): ScoreResult {
  if (config.method === "none") return { scored: false, reason: "not_scored" };

  const visible = (key: string) => evaluation.questions[key]?.visible ?? false;

  if (config.method === "likelihood_impact") {
    if (!visible(config.likelihoodQuestion) || !visible(config.impactQuestion)) {
      return { scored: false, reason: "not_scored" };
    }
    const l = answers[config.likelihoodQuestion];
    const i = answers[config.impactQuestion];
    if (typeof l !== "string" || typeof i !== "string") {
      return { scored: false, reason: "incomplete" };
    }
    const lScore = config.likelihoodScale[l];
    const iScore = config.impactScale[i];
    if (lScore === undefined || iScore === undefined) {
      return { scored: false, reason: "incomplete" };
    }

    const total = lScore * iScore;
    const band = bandFor(config.bands, total);
    if (!band) return { scored: false, reason: "incomplete" };

    return {
      scored: true,
      score: total,
      band,
      components: [
        { question: config.likelihoodQuestion, value: l, contribution: lScore },
        { question: config.impactQuestion, value: i, contribution: iScore },
      ],
    };
  }

  // weighted_sum
  const optionWeights = new Map<string, Map<string, number>>();
  for (const s of schema.sections) {
    for (const q of s.questions) {
      if (!q.options) continue;
      optionWeights.set(
        q.key,
        new Map(q.options.filter((o) => o.weight !== undefined).map((o) => [o.value, o.weight!])),
      );
    }
  }

  const components: Array<{ question: string; value: string; contribution: number }> = [];
  let total = 0;

  for (const key of config.questions) {
    if (!visible(key)) continue;
    const weights = optionWeights.get(key);
    if (!weights) return { scored: false, reason: "incomplete" };

    const value = answers[key];
    const selected = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    if (selected.length === 0) return { scored: false, reason: "incomplete" };

    for (const v of selected) {
      const w = weights.get(v);
      if (w === undefined) return { scored: false, reason: "incomplete" };
      total += w;
      components.push({ question: key, value: v, contribution: w });
    }
  }

  if (components.length === 0) return { scored: false, reason: "not_scored" };

  const band = bandFor(config.bands, total);
  if (!band) return { scored: false, reason: "incomplete" };

  return { scored: true, score: total, band, components };
}
