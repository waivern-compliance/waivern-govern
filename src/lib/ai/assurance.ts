/**
 * What testing and documentation say about an AI system.
 *
 * Pure, so a result can be checked against its own metrics before it is stored,
 * and the register's gaps come from the same reasoning everywhere.
 */

export type AssuranceKind =
  | "evaluation"
  | "red_team"
  | "bias_test"
  | "security_test"
  | "user_research"
  | "model_card"
  | "data_card";

export type AssuranceResult = "passed" | "passed_with_issues" | "failed";

export type Metric = {
  name: string;
  value: number;
  threshold: number | null;
  direction: "at_least" | "at_most";
  unit?: string;
};

export const ASSURANCE_KIND_LABEL: Record<AssuranceKind, string> = {
  evaluation: "Evaluation",
  red_team: "Red-team or adversarial test",
  bias_test: "Bias and fairness test",
  security_test: "Security test",
  user_research: "User research",
  model_card: "Model card",
  data_card: "Data card",
};

export const RESULT_LABEL: Record<AssuranceResult, string> = {
  passed: "Passed",
  passed_with_issues: "Passed, with issues",
  failed: "Failed",
};

/** Documentation describes a system; it does not pass or fail. */
export const DOCUMENTATION: readonly AssuranceKind[] = ["model_card", "data_card"];

/** Kinds that test the system rather than describe it or its users. */
export const TESTS: readonly AssuranceKind[] = ["evaluation", "red_team", "bias_test", "security_test"];

/** Whether a metric met its limit. A metric with no limit met nothing and failed nothing. */
export function meetsThreshold(m: Metric): boolean | null {
  if (m.threshold === null) return null;
  return m.direction === "at_least" ? m.value >= m.threshold : m.value <= m.threshold;
}

/**
 * Problems with a result as recorded.
 *
 * A test cannot be recorded as passed while one of its own metrics missed its
 * limit — that is exactly the claim the limits exist to check. It may still be
 * recorded as passed with issues, where somebody judged the miss acceptable,
 * and the findings say why.
 */
export function resultProblems(
  kind: AssuranceKind,
  result: AssuranceResult | null,
  metrics: Metric[],
  findings: string | null,
): string[] {
  const problems: string[] = [];
  if (DOCUMENTATION.includes(kind)) {
    if (result !== null) problems.push("Documentation is recorded without a pass or fail");
    return problems;
  }
  if (result === null) problems.push("Say whether it passed");
  const missed = metrics.filter((m) => meetsThreshold(m) === false);
  if (result === "passed" && missed.length > 0) {
    problems.push(
      `It cannot have passed: ${missed.map((m) => m.name).join(", ")} missed ${missed.length === 1 ? "its limit" : "their limits"}`,
    );
  }
  if ((result === "passed_with_issues" || result === "failed") && !findings?.trim()) {
    problems.push("Say what was found");
  }
  for (const m of metrics) {
    if (!m.name.trim()) problems.push("Every metric needs a name");
    if (!Number.isFinite(m.value)) problems.push(`${m.name || "A metric"} needs a number`);
  }
  return problems;
}

export type AssuranceSummary = {
  /** Any test of the system at all. */
  tested: boolean;
  /** Any test by people independent of the team. */
  independentlyTested: boolean;
  /** Kinds whose most recent result was a failure. */
  failing: AssuranceKind[];
};

export function summarise(
  records: Array<{ kind: AssuranceKind; independent: boolean; result: AssuranceResult | null; performedAt: Date }>,
): AssuranceSummary {
  const tests = records.filter((r) => TESTS.includes(r.kind));
  const latestByKind = new Map<AssuranceKind, (typeof tests)[number]>();
  for (const r of tests) {
    const seen = latestByKind.get(r.kind);
    if (!seen || r.performedAt > seen.performedAt) latestByKind.set(r.kind, r);
  }
  return {
    tested: tests.length > 0,
    independentlyTested: tests.some((r) => r.independent),
    failing: [...latestByKind.values()].filter((r) => r.result === "failed").map((r) => r.kind),
  };
}
