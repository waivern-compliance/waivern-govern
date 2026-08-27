import { z } from "zod";
import { COUNTRIES, SPECIAL_CATEGORY_VALUES } from "@/lib/templates/catalogues";
import type { Answers } from "@/lib/templates/logic";
import type { RiskTier } from "@/lib/risk/scale";

/**
 * When an approval stage applies.
 *
 * Routing reads the submitted assessment, so a stage can be made conditional on
 * what was actually answered rather than on who happened to start the work. The
 * two domain predicates — special-category data, transfer to a country without
 * adequacy — scan every answer against the shared catalogues rather than naming
 * a question, so they keep working across templates and survive a template being
 * reworded.
 */
export type RoutingCondition =
  | { op: "always" }
  | { op: "scoreAtLeast"; value: number }
  | { op: "tierAtLeast"; value: RiskTier }
  | { op: "answerEquals"; question: string; value: string | number | boolean }
  | { op: "answerIncludes"; question: string; value: string }
  | { op: "specialCategoryData" }
  | { op: "transferToNonAdequate" }
  | { op: "and"; all: RoutingCondition[] }
  | { op: "or"; any: RoutingCondition[] }
  | { op: "not"; condition: RoutingCondition };

export const routingCondition: z.ZodType<RoutingCondition> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("always") }),
    z.object({ op: z.literal("scoreAtLeast"), value: z.number() }),
    z.object({
      op: z.literal("tierAtLeast"),
      value: z.enum(["low", "medium", "high", "critical"]),
    }),
    z.object({
      op: z.literal("answerEquals"),
      question: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({ op: z.literal("answerIncludes"), question: z.string(), value: z.string() }),
    z.object({ op: z.literal("specialCategoryData") }),
    z.object({ op: z.literal("transferToNonAdequate") }),
    z.object({ op: z.literal("and"), all: z.array(routingCondition).min(1) }),
    z.object({ op: z.literal("or"), any: z.array(routingCondition).min(1) }),
    z.object({ op: z.literal("not"), condition: routingCondition }),
  ]),
);

const TIER_ORDER: Record<RiskTier, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const NON_ADEQUATE = new Set<string>(COUNTRIES.filter((c) => !c.adequate).map((c) => c.value));

export type RoutingContext = {
  answers: Answers;
  score: number | null;
  tier: RiskTier | null;
};

function valuesOf(answers: Answers): string[] {
  return Object.values(answers).flatMap((v) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string")
    : typeof v === "string" ? [v]
    : [],
  );
}

export function matches(condition: RoutingCondition, ctx: RoutingContext): boolean {
  switch (condition.op) {
    case "always":
      return true;

    case "scoreAtLeast":
      // An unscored assessment does not clear a score threshold. Treating a
      // missing score as zero would route a high-risk weighted-sum assessment
      // straight past the stage meant to catch it.
      return ctx.score !== null && ctx.score >= condition.value;

    case "tierAtLeast":
      return ctx.tier !== null && TIER_ORDER[ctx.tier] >= TIER_ORDER[condition.value];

    case "answerEquals":
      return ctx.answers[condition.question] === condition.value;

    case "answerIncludes": {
      const v = ctx.answers[condition.question];
      return Array.isArray(v) && v.includes(condition.value);
    }

    case "specialCategoryData":
      return valuesOf(ctx.answers).some((v) => SPECIAL_CATEGORY_VALUES.has(v));

    case "transferToNonAdequate":
      return valuesOf(ctx.answers).some((v) => NON_ADEQUATE.has(v));

    case "and":
      return condition.all.every((c) => matches(c, ctx));

    case "or":
      return condition.any.some((c) => matches(c, ctx));

    case "not":
      return !matches(condition.condition, ctx);
  }
}

/** A short description of why a stage applied, recorded on the approval. */
export function describe(condition: RoutingCondition): string {
  switch (condition.op) {
    case "always":
      return "always required";
    case "scoreAtLeast":
      return `score is ${condition.value} or above`;
    case "tierAtLeast":
      return `risk is ${condition.value} or above`;
    case "answerEquals":
      return `${condition.question} is ${String(condition.value)}`;
    case "answerIncludes":
      return `${condition.question} includes ${condition.value}`;
    case "specialCategoryData":
      return "special category data is involved";
    case "transferToNonAdequate":
      return "data goes to a country without adequacy";
    case "and":
      return condition.all.map(describe).join(" and ");
    case "or":
      return condition.any.map(describe).join(" or ");
    case "not":
      return `not (${describe(condition.condition)})`;
  }
}
