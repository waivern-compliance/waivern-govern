import {
  conditionDependencies,
  questionsOf,
} from "./logic";
import type { TemplateDefinition } from "./schema";

export type TemplateProblem = { path: string; message: string };

/**
 * Checks a template must pass before it can be published.
 *
 * Publishing freezes a version and assessments start running against it
 * immediately, so these are the last moment a mistake is cheap. Everything here
 * is a fault that would otherwise surface as a broken assessment part-way
 * through someone's afternoon.
 */
export function validateTemplate(definition: TemplateDefinition): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const all = questionsOf(definition.schema);
  const keys = all.map(({ question }) => question.key);
  const known = new Set(keys);

  // Duplicate keys would make answers ambiguous — two questions writing the
  // same slot, with the later one silently winning.
  const seen = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) problems.push({ path: `question.${k}`, message: "Duplicate question key" });
    seen.add(k);
  }

  const sectionKeys = new Set<string>();
  for (const s of definition.schema.sections) {
    if (sectionKeys.has(s.key)) {
      problems.push({ path: `section.${s.key}`, message: "Duplicate section key" });
    }
    sectionKeys.add(s.key);
  }

  // A condition on a key that does not exist never matches, so the question it
  // governs would silently never appear.
  for (const { question, section } of all) {
    const refs = [
      ...conditionDependencies(question.showWhen).map((r) => [r, "showWhen"] as const),
      ...conditionDependencies(question.requireWhen).map((r) => [r, "requireWhen"] as const),
    ];
    for (const [ref, where] of refs) {
      if (!known.has(ref)) {
        problems.push({
          path: `question.${question.key}.${where}`,
          message: `References unknown question "${ref}"`,
        });
      }
      if (ref === question.key) {
        problems.push({
          path: `question.${question.key}.${where}`,
          message: "A question cannot depend on its own answer",
        });
      }
    }
    for (const ref of conditionDependencies(section.showWhen)) {
      if (!known.has(ref)) {
        problems.push({
          path: `section.${section.key}.showWhen`,
          message: `References unknown question "${ref}"`,
        });
      }
    }
  }

  // Select questions need options; free-text questions must not carry them.
  for (const { question } of all) {
    const needsOptions = ["single_select", "multi_select"].includes(question.type);
    if (needsOptions && (!question.options || question.options.length === 0)) {
      problems.push({
        path: `question.${question.key}`,
        message: `A ${question.type} question needs options`,
      });
    }
    if (!needsOptions && question.options?.length) {
      problems.push({
        path: `question.${question.key}`,
        message: `A ${question.type} question cannot have options`,
      });
    }
    const values = new Set<string>();
    for (const o of question.options ?? []) {
      if (values.has(o.value)) {
        problems.push({
          path: `question.${question.key}.options`,
          message: `Duplicate option value "${o.value}"`,
        });
      }
      values.add(o.value);
    }
  }

  problems.push(...findCycles(definition));
  problems.push(...checkScoring(definition, known));

  return problems;
}

/**
 * A cycle would make visibility unresolvable — A visible only when B is
 * answered, B visible only when A is. Rejecting cycles here is what lets the
 * runtime evaluate in a single topological pass.
 */
function findCycles(definition: TemplateDefinition): TemplateProblem[] {
  const all = questionsOf(definition.schema);
  const known = new Set(all.map(({ question }) => question.key));
  const deps = new Map<string, string[]>(
    all.map(({ question, section }) => [
      question.key,
      [
        ...conditionDependencies(question.showWhen),
        ...conditionDependencies(question.requireWhen),
        ...conditionDependencies(section.showWhen),
      ].filter((k) => known.has(k) && k !== question.key),
    ]),
  );

  const problems: TemplateProblem[] = [];
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];

  const visit = (key: string) => {
    const s = state.get(key);
    if (s === "done") return;
    if (s === "visiting") {
      const cycle = [...stack.slice(stack.indexOf(key)), key].join(" → ");
      problems.push({ path: `question.${key}`, message: `Circular dependency: ${cycle}` });
      return;
    }
    state.set(key, "visiting");
    stack.push(key);
    for (const d of deps.get(key) ?? []) visit(d);
    stack.pop();
    state.set(key, "done");
  };

  for (const key of deps.keys()) visit(key);
  return problems;
}

function checkScoring(
  definition: TemplateDefinition,
  known: Set<string>,
): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const { scoring } = definition;
  if (scoring.method === "none") return problems;

  const bands = scoring.bands;
  for (const b of bands) {
    if (b.min > b.max) {
      problems.push({ path: `scoring.bands.${b.label}`, message: "Band minimum exceeds its maximum" });
    }
  }
  // Overlapping bands would make the tier depend on band ordering rather than
  // on the score, which is exactly the kind of thing nobody notices until an
  // assessment is rated low that should have been high.
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].min <= sorted[i - 1].max) {
      problems.push({
        path: "scoring.bands",
        message: `Bands "${sorted[i - 1].label}" and "${sorted[i].label}" overlap`,
      });
    }
  }

  if (scoring.method === "likelihood_impact") {
    for (const [label, key] of [
      ["likelihoodQuestion", scoring.likelihoodQuestion],
      ["impactQuestion", scoring.impactQuestion],
    ] as const) {
      if (!known.has(key)) {
        problems.push({ path: `scoring.${label}`, message: `Unknown question "${key}"` });
      }
    }
    const all = questionsOf(definition.schema);
    for (const [key, scale, label] of [
      [scoring.likelihoodQuestion, scoring.likelihoodScale, "likelihoodScale"],
      [scoring.impactQuestion, scoring.impactScale, "impactScale"],
    ] as const) {
      const q = all.find(({ question }) => question.key === key)?.question;
      if (!q) continue;
      for (const option of q.options ?? []) {
        if (scale[option.value] === undefined) {
          problems.push({
            path: `scoring.${label}`,
            message: `Option "${option.value}" of "${key}" has no score`,
          });
        }
      }
    }
  }

  if (scoring.method === "weighted_sum") {
    for (const key of scoring.questions) {
      if (!known.has(key)) {
        problems.push({ path: "scoring.questions", message: `Unknown question "${key}"` });
      }
    }
  }

  return problems;
}
