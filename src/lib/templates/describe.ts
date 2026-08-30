import type { Condition, Question, TemplateSchema } from "./schema";

/**
 * A condition, in English.
 *
 * Reviewing a template means checking that the logic says what somebody
 * intended, and nobody checks that by reading a nested JSON tree. The question
 * key is replaced with its label where one is known, because "Q3 is true" and
 * "Personal data leaves the UK is true" are not equally reviewable.
 */
export function describeCondition(
  condition: Condition,
  labels: ReadonlyMap<string, string> = new Map(),
): string {
  const name = (key: string) => labels.get(key) ?? key;

  switch (condition.op) {
    case "answered":
      return `“${name(condition.question)}” has been answered`;
    case "equals":
      return `“${name(condition.question)}” is ${JSON.stringify(condition.value)}`;
    case "notEquals":
      return `“${name(condition.question)}” is not ${JSON.stringify(condition.value)}`;
    case "greaterThan":
      return `“${name(condition.question)}” is more than ${condition.value}`;
    case "lessThan":
      return `“${name(condition.question)}” is less than ${condition.value}`;
    case "includes":
      return `“${name(condition.question)}” includes ${JSON.stringify(condition.value)}`;
    case "and":
      return condition.all.map((c) => describeCondition(c, labels)).join(", and ");
    case "or":
      return condition.any.map((c) => describeCondition(c, labels)).join(", or ");
    case "not":
      return `it is not the case that ${describeCondition(condition.condition, labels)}`;
    default: {
      // Adding an operator to the schema without describing it here would
      // otherwise show a reviewer a blank where the logic should be.
      const unhandled: never = condition;
      throw new Error(`No description for condition ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Every question in a schema, by key, for resolving references. */
export function questionLabels(schema: TemplateSchema): Map<string, string> {
  const labels = new Map<string, string>();
  for (const section of schema.sections) {
    for (const question of section.questions) labels.set(question.key, question.label);
  }
  return labels;
}

/** What a question expects, said plainly. */
export function describeType(question: Question): string {
  switch (question.type) {
    case "short_text":
      return "a short answer";
    case "long_text":
      return "a written answer";
    case "boolean":
      return "yes or no";
    case "single_select":
      return `one of ${question.options?.length ?? 0}`;
    case "multi_select":
      return `any of ${question.options?.length ?? 0}`;
    case "number":
      return "a number";
    case "date":
      return "a date";
    case "country":
      return "a country, from the library";
    case "data_category":
      return "categories of personal data";
    case "evidence":
      return "a document";
  }
}
