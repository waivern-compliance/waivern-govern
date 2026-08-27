import { z } from "zod";

/**
 * A template is data, not code: sections and questions, the conditions that
 * govern them, and how answers turn into a risk score. Storing it this way is
 * what lets a client configure a DPIA without a deployment, and what lets an
 * assessment completed in March stay readable after the template changes in
 * July — the version it ran against is frozen alongside it.
 */

export const questionType = z.enum([
  "short_text",
  "long_text",
  "boolean",
  "single_select",
  "multi_select",
  "number",
  "date",
  /** Resolves against the maintained country risk library. */
  "country",
  /** Categories of personal data. Never identities — that is out of scope. */
  "data_category",
  /** Prompts for a file rather than a value. */
  "evidence",
]);
export type QuestionType = z.infer<typeof questionType>;

/**
 * Conditions read other answers by key. Keeping them declarative rather than
 * expressions means they can be validated at publish time, evaluated
 * identically on the server and in the browser, and shown to an auditor as the
 * reason a section did not apply.
 */
export type Condition =
  | { op: "answered"; question: string }
  | { op: "equals"; question: string; value: string | number | boolean }
  | { op: "notEquals"; question: string; value: string | number | boolean }
  | { op: "includes"; question: string; value: string }
  | { op: "greaterThan"; question: string; value: number }
  | { op: "lessThan"; question: string; value: number }
  | { op: "and"; all: Condition[] }
  | { op: "or"; any: Condition[] }
  | { op: "not"; condition: Condition };

export const condition: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("answered"), question: z.string() }),
    z.object({
      op: z.literal("equals"),
      question: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({
      op: z.literal("notEquals"),
      question: z.string(),
      value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({ op: z.literal("includes"), question: z.string(), value: z.string() }),
    z.object({ op: z.literal("greaterThan"), question: z.string(), value: z.number() }),
    z.object({ op: z.literal("lessThan"), question: z.string(), value: z.number() }),
    z.object({ op: z.literal("and"), all: z.array(condition).min(1) }),
    z.object({ op: z.literal("or"), any: z.array(condition).min(1) }),
    z.object({ op: z.literal("not"), condition }),
  ]),
);

export const option = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  /** Contribution to a weighted score, where the template scores that way. */
  weight: z.number().optional(),
});

export const question = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "keys are lower_snake_case"),
  label: z.string().min(1),
  type: questionType,
  help: z.string().optional(),
  /** Required whenever the question is visible, unless `requireWhen` narrows it. */
  required: z.boolean().default(false),
  options: z.array(option).optional(),
  /**
   * Absent means always visible. Present means visible only while the condition
   * holds — there is deliberately no `hideWhen`, because a question governed by
   * both would have two sources of truth.
   */
  showWhen: condition.optional(),
  /** Makes a visible question mandatory only in certain circumstances. */
  requireWhen: condition.optional(),
  /** Codes into the legal reference library, rendered beside the question. */
  legalRefs: z.array(z.string()).default([]),
  evidence: z.enum(["none", "optional", "required"]).default("none"),
  placeholder: z.string().optional(),
});
export type Question = z.infer<typeof question>;

export const section = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  title: z.string().min(1),
  description: z.string().optional(),
  showWhen: condition.optional(),
  questions: z.array(question).min(1),
});
export type Section = z.infer<typeof section>;

export const templateSchema = z.object({
  sections: z.array(section).min(1),
});
export type TemplateSchema = z.infer<typeof templateSchema>;

/**
 * How answers become a risk score.
 *
 * `likelihood_impact` is the default because that is the method the buyer uses
 * today; `weighted_sum` exists because they invited suppliers to propose
 * alternatives, and because AI risk assessment rarely reduces cleanly to two
 * axes. Adding a third method is a new variant here, not a change anywhere else.
 */
export const scoreBand = z.object({
  min: z.number(),
  max: z.number(),
  label: z.string(),
  tier: z.enum(["low", "medium", "high", "critical"]),
});
export type ScoreBand = z.infer<typeof scoreBand>;

export const scoringConfig = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("likelihood_impact"),
    likelihoodQuestion: z.string(),
    impactQuestion: z.string(),
    /** Maps an option value to its position on the axis, from 1 upward. */
    likelihoodScale: z.record(z.string(), z.number()),
    impactScale: z.record(z.string(), z.number()),
    bands: z.array(scoreBand).min(1),
  }),
  z.object({
    method: z.literal("weighted_sum"),
    /** Questions whose selected options carry weights. */
    questions: z.array(z.string()).min(1),
    bands: z.array(scoreBand).min(1),
  }),
  z.object({
    method: z.literal("none"),
  }),
]);
export type ScoringConfig = z.infer<typeof scoringConfig>;

/** Everything frozen when a version is published. */
export const templateDefinition = z.object({
  schema: templateSchema,
  scoring: scoringConfig,
});
export type TemplateDefinition = z.infer<typeof templateDefinition>;
