import { z } from "zod";
import { SPECIAL_CATEGORY_VALUES } from "@/lib/templates/catalogues";
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

export type RoutingContext = {
  answers: Answers;
  score: number | null;
  tier: RiskTier | null;
  /**
   * Destination codes that need an Article 46 route, from the country library.
   *
   * Passed in rather than looked up, so this stays a pure function that can be
   * reasoned about and tested without a database. It used to be a hard-coded
   * set, which meant an adequacy decision changing had no effect on routing
   * until somebody edited the source — precisely the staleness the country
   * library exists to prevent.
   */
  needsSafeguards?: ReadonlySet<string>;
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

    case "transferToNonAdequate": {
      // An absent or empty library means the question cannot be answered, and
      // an empty set is the dangerous case: `has()` returns false for every
      // country, so a transfer to anywhere would sail past the gate meant to
      // catch it. Since no real library has zero countries needing safeguards,
      // empty means "not loaded" — and an unanswerable check escalates.
      if (!ctx.needsSafeguards || ctx.needsSafeguards.size === 0) return true;
      return valuesOf(ctx.answers).some((v) => ctx.needsSafeguards!.has(v));
    }

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

/**
 * When a stage applies, in a sentence.
 *
 * An administrator deciding who approves a DPIA should not have to read JSON to
 * find out whether a gate fires. Nested conditions are rendered too, because a
 * stage whose rule cannot be shown is a stage nobody can safely change.
 */
export function describeRouting(condition: RoutingCondition): string {
  switch (condition.op) {
    case "always":
      return "always";
    case "scoreAtLeast":
      return `the risk score is ${condition.value} or more`;
    case "tierAtLeast":
      return `the risk is ${condition.value} or worse`;
    case "answerEquals":
      return `the answer to “${condition.question}” is ${String(condition.value)}`;
    case "answerIncludes":
      return `the answer to “${condition.question}” includes ${condition.value}`;
    case "specialCategoryData":
      return "special-category data is involved";
    case "transferToNonAdequate":
      return "data goes to a country without an adequacy decision";
    case "and":
      return condition.all.map(describeRouting).join(", and ");
    case "or":
      return condition.any.map(describeRouting).join(", or ");
    case "not":
      return `not: ${describeRouting(condition.condition)}`;
  }
}

/**
 * The conditions an administrator may choose from a menu.
 *
 * Deliberately the flat ones. A nested and/or is legitimate and is kept and
 * shown in English, but offering to rebuild one in a form invites somebody to
 * replace a rule they did not fully read.
 */
export const SIMPLE_CONDITIONS = [
  "always",
  "scoreAtLeast",
  "tierAtLeast",
  "specialCategoryData",
  "transferToNonAdequate",
] as const;

export type SimpleConditionOp = (typeof SIMPLE_CONDITIONS)[number];

export function isSimple(condition: RoutingCondition): condition is Extract<
  RoutingCondition,
  { op: SimpleConditionOp }
> {
  return (SIMPLE_CONDITIONS as readonly string[]).includes(condition.op);
}
