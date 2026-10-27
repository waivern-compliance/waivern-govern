/**
 * Prioritising proposals to use AI.
 *
 * The Playbook asks for a way of capturing opportunities and prioritising them
 * on feasibility and business value. Both are scored 1 to 5 by whoever runs
 * the register, and the pair places a proposal in one of four groups. The
 * product orders the list; the group is what people talk about.
 *
 * Pure, so the list, the detail page and the tests read the same rules.
 */

export type Quadrant = "pursue" | "invest" | "modest" | "not_now";

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  pursue: "Pursue now",
  invest: "Worth investing in",
  modest: "Easy, modest value",
  not_now: "Not now",
};

export const QUADRANT_HELP: Record<Quadrant, string> = {
  pursue: "High value and feasible with what we have",
  invest: "High value, but needs skills, data or infrastructure we lack",
  modest: "Feasible, but the value is limited",
  not_now: "Neither the value nor the feasibility is there yet",
};

/** At or above this a score counts as high. */
const HIGH = 4;

export function quadrant(value: number | null, feasibility: number | null): Quadrant | null {
  if (value === null || feasibility === null) return null;
  if (value >= HIGH) return feasibility >= HIGH ? "pursue" : "invest";
  return feasibility >= HIGH ? "modest" : "not_now";
}

export function priority(value: number | null, feasibility: number | null): number | null {
  return value === null || feasibility === null ? null : value * feasibility;
}

export function isScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
}

export type Caution = "significant_decisions" | "spend_public" | "spend_other";

export const CAUTION_WORDS: Record<Caution, string> = {
  significant_decisions:
    "It would make decisions about people's health, safety, rights or entitlements. The Playbook advises against AI deciding these on its own; plan for meaningful human control.",
  spend_public:
    "Public-facing spend of £100,000 or more must be assured by the spend control board.",
  spend_other: "Spend of £1 million or more must be assured by the spend control board.",
};

/** Spend control thresholds the Playbook gives for digital and technology spend. */
export const SPEND_THRESHOLD = { publicFacing: 100_000, other: 1_000_000 } as const;

/** What the person deciding should have in front of them before they decide. */
export function cautionsFor(request: {
  significantDecisions: boolean;
  publicFacing: boolean;
  expectedSpendGbp: number | null;
}): Caution[] {
  const out: Caution[] = [];
  if (request.significantDecisions) out.push("significant_decisions");
  const spend = request.expectedSpendGbp ?? 0;
  if (spend >= SPEND_THRESHOLD.other) out.push("spend_other");
  else if (request.publicFacing && spend >= SPEND_THRESHOLD.publicFacing) out.push("spend_public");
  return out;
}
