import { COUNTRIES, DATA_CATEGORIES } from "./catalogues";
import type { AnswerValue, Answers, EvaluationResult } from "./logic";
import { evaluate, questionsOf } from "./logic";
import type { Question, TemplateSchema } from "./schema";

export type AnswerProblem = { questionKey: string; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTRY_CODES = new Set<string>(COUNTRIES.map((c) => c.value));
const DATA_CATEGORY_VALUES = new Set<string>(DATA_CATEGORIES.map((c) => c.value));

function isBlank(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Check one answer against the shape its question expects.
 *
 * Answers arrive from a browser form and, for contributor links, from someone
 * outside the organisation, so nothing about their shape can be assumed. A
 * select answer that is not one of its options is the interesting case: it
 * would otherwise sail through and then silently score as nothing.
 */
export function validateAnswer(
  question: Question,
  value: AnswerValue | undefined,
): AnswerProblem | null {
  const fail = (message: string) => ({ questionKey: question.key, message });
  if (isBlank(value)) return null; // Requiredness is a separate question.

  switch (question.type) {
    case "short_text":
    case "long_text":
      return typeof value === "string" ? null : fail("Expected text");

    case "boolean":
      return typeof value === "boolean" ? null : fail("Expected yes or no");

    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? null
        : fail("Expected a number");

    case "date":
      return typeof value === "string" && ISO_DATE.test(value)
        ? null
        : fail("Expected a date as YYYY-MM-DD");

    case "single_select": {
      if (typeof value !== "string") return fail("Expected one option");
      const allowed = new Set((question.options ?? []).map((o) => o.value));
      return allowed.has(value) ? null : fail(`"${value}" is not one of the options`);
    }

    case "multi_select": {
      if (!Array.isArray(value)) return fail("Expected a list of options");
      const allowed = new Set((question.options ?? []).map((o) => o.value));
      const bad = value.filter((v) => !allowed.has(v));
      if (bad.length) return fail(`Not among the options: ${bad.join(", ")}`);
      if (new Set(value).size !== value.length) return fail("The same option is selected twice");
      return null;
    }

    case "country": {
      // Validated against the catalogue rather than a two-letter pattern: an
      // unrecognised code would pass a shape check and then fail silently when
      // the transfer library tries to look up its adequacy position.
      const codes = Array.isArray(value) ? value : [value];
      const bad = codes.filter((c) => typeof c !== "string" || !COUNTRY_CODES.has(c));
      return bad.length ? fail(`Unknown country: ${bad.join(", ")}`) : null;
    }

    case "data_category": {
      const values = Array.isArray(value) ? value : [value];
      const bad = values.filter(
        (c) => typeof c !== "string" || !DATA_CATEGORY_VALUES.has(c),
      );
      return bad.length ? fail(`Unknown data category: ${bad.join(", ")}`) : null;
    }

    case "evidence":
      return typeof value === "string" ? null : fail("Expected an evidence reference");
  }
}

export type SubmissionCheck = {
  ready: boolean;
  /** Visible, required, and not answered. */
  missing: AnswerProblem[];
  /** Answered, but not in a shape the question accepts. */
  invalid: AnswerProblem[];
  evaluation: EvaluationResult;
};

/**
 * Decide whether an assessment can be submitted.
 *
 * Only questions that are actually being asked count. Requiring an answer to a
 * question the logic has hidden is the most common way these tools become
 * impossible to finish.
 */
export function checkForSubmission(
  schema: TemplateSchema,
  answers: Answers,
): SubmissionCheck {
  const evaluation = evaluate(schema, answers);
  const missing: AnswerProblem[] = [];
  const invalid: AnswerProblem[] = [];

  for (const { question } of questionsOf(schema)) {
    const state = evaluation.questions[question.key];
    if (!state?.visible) continue;

    const value = answers[question.key];
    if (state.required && isBlank(value)) {
      missing.push({ questionKey: question.key, message: `${question.label} needs an answer` });
      continue;
    }
    const problem = validateAnswer(question, value);
    if (problem) invalid.push(problem);
  }

  return { ready: missing.length === 0 && invalid.length === 0, missing, invalid, evaluation };
}

/** Answers that survive into the record, with suppressed ones kept but flagged. */
export function partitionAnswers(answers: Answers, evaluation: EvaluationResult) {
  const active: Record<string, AnswerValue> = {};
  const suppressed: Record<string, AnswerValue> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (value === undefined) continue;
    if (evaluation.questions[key]?.visible) active[key] = value;
    else suppressed[key] = value;
  }
  return { active, suppressed };
}
