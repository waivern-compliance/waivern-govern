import type {
  Condition,
  Question,
  Section,
  TemplateSchema,
} from "./schema";

export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue | undefined>;

/** Why a question is not being asked, which the audit record needs to show. */
export type QuestionState = {
  key: string;
  sectionKey: string;
  visible: boolean;
  required: boolean;
  /** Visible once, now hidden by a later change of answer. */
  suppressed: boolean;
};

export type EvaluationResult = {
  sections: Record<string, { visible: boolean }>;
  questions: Record<string, QuestionState>;
  /** Visible question keys, in template order. */
  visibleOrder: string[];
};

export function questionsOf(schema: TemplateSchema): Array<{
  section: Section;
  question: Question;
}> {
  return schema.sections.flatMap((section) =>
    section.questions.map((question) => ({ section, question })),
  );
}

/** Every question key a condition reads. */
export function conditionDependencies(c: Condition | undefined): string[] {
  if (!c) return [];
  switch (c.op) {
    case "and":
      return c.all.flatMap(conditionDependencies);
    case "or":
      return c.any.flatMap(conditionDependencies);
    case "not":
      return conditionDependencies(c.condition);
    default:
      return [c.question];
  }
}

function isAnswered(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Evaluate a condition against answers.
 *
 * A hidden question's answer is masked out before this runs, so a condition
 * reading it sees "unanswered" rather than a stale value from before the
 * question disappeared. Without that, hiding a branch would leave its answers
 * silently steering the rest of the assessment.
 */
export function evaluateCondition(c: Condition, answers: Answers): boolean {
  switch (c.op) {
    case "answered":
      return isAnswered(answers[c.question]);
    case "equals":
      return answers[c.question] === c.value;
    case "notEquals":
      return answers[c.question] !== c.value;
    case "includes": {
      const v = answers[c.question];
      return Array.isArray(v) && v.includes(c.value);
    }
    case "greaterThan": {
      const v = answers[c.question];
      return typeof v === "number" && v > c.value;
    }
    case "lessThan": {
      const v = answers[c.question];
      return typeof v === "number" && v < c.value;
    }
    case "and":
      return c.all.every((x) => evaluateCondition(x, answers));
    case "or":
      return c.any.some((x) => evaluateCondition(x, answers));
    case "not":
      return !evaluateCondition(c.condition, answers);
  }
}

/**
 * Resolve which questions are being asked, and which of those must be answered.
 *
 * Questions are evaluated in dependency order, which `validateTemplate`
 * guarantees is acyclic at publish time — so a single pass is enough and there
 * is no iteration-limit behaviour to reason about at runtime.
 */
export function evaluate(schema: TemplateSchema, answers: Answers): EvaluationResult {
  const all = questionsOf(schema);
  const bySectionKey = new Map(schema.sections.map((s) => [s.key, s]));
  const byQuestionKey = new Map(all.map(({ question, section }) => [question.key, { question, section }]));

  const order = topologicalOrder(schema);
  const visibleAnswers: Answers = {};
  const questions: Record<string, QuestionState> = {};
  const sections: Record<string, { visible: boolean }> = {};

  for (const key of order) {
    const entry = byQuestionKey.get(key);
    if (!entry) continue;
    const { question, section } = entry;

    if (!(section.key in sections)) {
      sections[section.key] = {
        visible: section.showWhen
          ? evaluateCondition(section.showWhen, visibleAnswers)
          : true,
      };
    }

    const sectionVisible = sections[section.key].visible;
    const ownVisible = question.showWhen
      ? evaluateCondition(question.showWhen, visibleAnswers)
      : true;
    const visible = sectionVisible && ownVisible;

    const required = visible
      ? question.requireWhen
        ? evaluateCondition(question.requireWhen, visibleAnswers)
        : question.required
      : false;

    questions[key] = {
      key,
      sectionKey: section.key,
      visible,
      required,
      // An answer that exists for a question no longer being asked. Kept in the
      // record, excluded from evaluation and scoring, and surfaced to the
      // auditor as "asked, then no longer applicable".
      suppressed: !visible && isAnswered(answers[key]),
    };

    if (visible) visibleAnswers[key] = answers[key];
  }

  for (const s of schema.sections) {
    if (!(s.key in sections)) {
      sections[s.key] = {
        visible: s.showWhen ? evaluateCondition(s.showWhen, visibleAnswers) : true,
      };
    }
  }

  const visibleOrder = all
    .map(({ question }) => question.key)
    .filter((k) => questions[k]?.visible);

  return { sections, questions, visibleOrder };
}

/**
 * Question keys ordered so that every question comes after the ones its
 * conditions read. Cycles are rejected at publish time, so an unresolvable
 * graph here is a bug rather than bad configuration.
 */
export function topologicalOrder(schema: TemplateSchema): string[] {
  const all = questionsOf(schema);
  const deps = new Map<string, Set<string>>();
  const known = new Set(all.map(({ question }) => question.key));

  for (const { question, section } of all) {
    const d = new Set(
      [
        ...conditionDependencies(question.showWhen),
        ...conditionDependencies(question.requireWhen),
        ...conditionDependencies(section.showWhen),
      ].filter((k) => known.has(k) && k !== question.key),
    );
    deps.set(question.key, d);
  }

  const ordered: string[] = [];
  const placed = new Set<string>();
  let progress = true;

  while (progress && ordered.length < all.length) {
    progress = false;
    for (const { question } of all) {
      if (placed.has(question.key)) continue;
      const d = deps.get(question.key)!;
      if ([...d].every((k) => placed.has(k))) {
        ordered.push(question.key);
        placed.add(question.key);
        progress = true;
      }
    }
  }

  // Anything left is in a cycle. Append it so evaluation still terminates; the
  // publish-time validator is what stops this reaching production.
  for (const { question } of all) {
    if (!placed.has(question.key)) ordered.push(question.key);
  }

  return ordered;
}
