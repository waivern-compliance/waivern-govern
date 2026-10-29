import type { AiFrameworkId, AiFrameworkPack, RiskCategoryDef } from "./types";
import { NIST_AI_RMF } from "./nist-pack";
import { UK_DSIT } from "./uk-dsit";

export type { AiFrameworkId, AiFrameworkPack, RiskCategoryDef } from "./types";

/**
 * The AI governance frameworks an organisation may follow, and the one it
 * follows unless it chooses otherwise.
 *
 * The organisation's choice decides what it is offered: which categories a new
 * risk may be filed under, which appetite statements may be written, which
 * treatments are suggested. What it already holds is read across every
 * framework, so a risk filed under one framework still reads correctly after
 * the organisation moves to another.
 */
export const AI_FRAMEWORKS: Record<AiFrameworkId, AiFrameworkPack> = {
  uk_dsit: UK_DSIT,
  nist_ai_rmf: NIST_AI_RMF,
};

export const DEFAULT_AI_FRAMEWORK: AiFrameworkId = "uk_dsit";

export function isAiFramework(value: unknown): value is AiFrameworkId {
  return typeof value === "string" && value in AI_FRAMEWORKS;
}

/** The pack for a stored value, or the default for one we do not know. */
export function frameworkPack(id: string | null | undefined): AiFrameworkPack {
  return isAiFramework(id) ? AI_FRAMEWORKS[id] : AI_FRAMEWORKS[DEFAULT_AI_FRAMEWORK];
}

const ALL_CATEGORIES = new Map<string, RiskCategoryDef>(
  Object.values(AI_FRAMEWORKS).flatMap((p) => p.categories.map((c) => [c.value, c] as const)),
);

/** A category some framework defines, whether or not the organisation follows it now. */
export function isKnownCategory(value: unknown): value is string {
  return typeof value === "string" && ALL_CATEGORIES.has(value);
}

/** How a stored category reads on screen — the label where we know it, as written where we do not. */
export function categoryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return ALL_CATEGORIES.get(value)?.label ?? value;
}

/** Every treatment any framework suggests, by key, so a chosen one is found after a switch. */
const ALL_TREATMENTS = new Map(
  Object.values(AI_FRAMEWORKS).flatMap((p) => p.treatments.map((t) => [t.key, t] as const)),
);

export function suggestionByKey(key: unknown) {
  return typeof key === "string" ? (ALL_TREATMENTS.get(key) ?? null) : null;
}
