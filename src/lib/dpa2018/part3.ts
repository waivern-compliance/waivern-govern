/**
 * Part 3 of the Data Protection Act 2018: processing by a competent authority
 * for the law enforcement purposes, as the record of it must show.
 *
 * Pure. Checked against ss.31, 35, 38, 42, 61, 62 and 64 and Schedule 8 on
 * legislation.gov.uk on 31 October 2026 (up to date to 29–30 October 2026).
 *
 * - Lawfulness (s.35(2)): necessary for a task carried out for a law
 *   enforcement purpose by a competent authority, or on the person's consent.
 * - Sensitive processing (s.35(3)–(5), (8)) only on consent, or where strictly
 *   necessary and a Schedule 8 condition is met — either way with an
 *   appropriate policy document in place (s.42). The record says which, how
 *   s.35 is met, and whether retention followed the document (s.42(4)).
 * - Distinguish fact from personal assessment (s.38(2)), and, so far as
 *   possible, the categories of data subject (s.38(3)).
 * - Log six operations in automated systems (s.62). Since 19 August 2025
 *   (DUAA s.82) the logs need not record the justification for consulting or
 *   disclosing; they still record the date and time and, so far as possible,
 *   who did it and to whom.
 *
 * Nothing here decides whether a body is a competent authority, or whether a
 * purpose is a law enforcement one. A person records both.
 */

import { SUBJECT_CATEGORIES } from "@/lib/templates/catalogues";

export type Regime = "uk_gdpr" | "dpa_part3";

export const REGIMES: Record<Regime, string> = {
  uk_gdpr: "UK GDPR (with Part 2 of the Data Protection Act 2018)",
  dpa_part3: "Law enforcement processing (Part 3 of the Data Protection Act 2018)",
};

export function isRegime(v: unknown): v is Regime {
  return v === "uk_gdpr" || v === "dpa_part3";
}

/** Section 35(2): the two ways Part 3 processing is lawful. */
export const PART3_BASES = {
  task: "Necessary for a task carried out for a law enforcement purpose by a competent authority (s.35(2)(b))",
  consent: "The person has consented to processing for that purpose (s.35(2)(a))",
} as const;
export type Part3Basis = keyof typeof PART3_BASES;

/** Section 35(4) and (5): the two routes to sensitive processing. */
export const SENSITIVE_ROUTES = {
  consent: "On the person's consent (s.35(4))",
  strictly_necessary: "Strictly necessary, with a Schedule 8 condition (s.35(5))",
} as const;
export type SensitiveRoute = keyof typeof SENSITIVE_ROUTES;

export const SCHEDULE_8 = {
  sch8_p1: { paragraph: 1, label: "Statutory purposes, for reasons of substantial public interest" },
  sch8_p2: { paragraph: 2, label: "Administration of justice" },
  sch8_p3: { paragraph: 3, label: "Protecting an individual's vital interests" },
  sch8_p4: { paragraph: 4, label: "Safeguarding of children and of individuals at risk" },
  sch8_p5: { paragraph: 5, label: "Personal data already in the public domain" },
  sch8_p6: { paragraph: 6, label: "Legal claims" },
  sch8_p7: { paragraph: 7, label: "Judicial acts" },
  sch8_p8: { paragraph: 8, label: "Preventing fraud" },
  sch8_p9: { paragraph: 9, label: "Archiving, research and statistics" },
} as const;
export type Schedule8Condition = keyof typeof SCHEDULE_8;
export const SCHEDULE_8_KEYS = Object.keys(SCHEDULE_8) as Schedule8Condition[];

export function isSchedule8Condition(v: unknown): v is Schedule8Condition {
  return typeof v === "string" && v in SCHEDULE_8;
}

/**
 * What a policy document can cover for Part 3: sensitive processing on
 * consent, or on each Schedule 8 condition. Kept in the same register as the
 * Schedule 1 conditions, because s.42 asks the same of it as paragraph 39.
 */
export const PART3_POLICY_KEYS = ["part3_consent", ...SCHEDULE_8_KEYS] as const;
export type Part3PolicyKey = (typeof PART3_POLICY_KEYS)[number];

export function isPart3PolicyKey(v: unknown): v is Part3PolicyKey {
  return v === "part3_consent" || isSchedule8Condition(v);
}

export function describePart3PolicyKey(key: Part3PolicyKey): string {
  return key === "part3_consent"
    ? "Part 3 sensitive processing on consent (s.35(4))"
    : `Schedule 8, paragraph ${SCHEDULE_8[key].paragraph} — ${SCHEDULE_8[key].label}`;
}

/** Section 62(1): what an automated processing system logs. */
export const LOGGED_OPERATIONS = {
  collection: "Collection",
  alteration: "Alteration",
  consultation: "Consultation",
  disclosure: "Disclosure, including transfers",
  combination: "Combination",
  erasure: "Erasure",
} as const;
export type LoggedOperation = keyof typeof LOGGED_OPERATIONS;
export const LOGGED_OPERATION_KEYS = Object.keys(LOGGED_OPERATIONS) as LoggedOperation[];

/**
 * What one system logs, and who checks. A statement, not the logs: Govern
 * neither holds nor reads them.
 */
export type LoggingStatement = {
  system: string;
  operations: LoggedOperation[];
  /** Consultation and disclosure logs show who did it (and to whom), so far as possible (s.62(2)–(3)). */
  identifiesPeople: boolean;
  reviewer: string | null;
  /** When somebody last checked the logs: an ISO date. */
  lastChecked: string | null;
};

/** Section 38(3): the categories a competent authority distinguishes, so far as possible, as the catalogue words them. */
export const PART3_SUBJECT_LABELS: readonly string[] = SUBJECT_CATEGORIES.filter((c) =>
  ["suspects", "convicted", "victims", "witnesses"].includes(c.value),
).map((c) => c.label);

export type Part3Record = {
  part3Basis: Part3Basis | null;
  sensitiveProcessing: boolean | null;
  sensitiveRoute: SensitiveRoute | null;
  schedule8Condition: Schedule8Condition | null;
  factOpinionMarked: boolean | null;
  logging: LoggingStatement[];
  retentionFollowsPolicy: boolean | null;
  retentionPolicyNote: string | null;
};

export class Part3Refused extends Error {}

/**
 * The Part 3 answers as they will be stored. What the answers make
 * irrelevant is cleared: a Schedule 8 condition left behind after the route
 * changed to consent would read as relied on.
 */
export function cleanPart3(input: {
  part3Basis?: string | null;
  sensitiveProcessing?: boolean | null;
  sensitiveRoute?: string | null;
  schedule8Condition?: string | null;
  factOpinionMarked?: boolean | null;
  logging?: ReadonlyArray<Partial<LoggingStatement>>;
  retentionFollowsPolicy?: boolean | null;
  retentionPolicyNote?: string | null;
}): Part3Record {
  if (input.part3Basis && !(input.part3Basis in PART3_BASES)) throw new Part3Refused("Choose how section 35(2) is met.");
  const sensitiveProcessing = input.sensitiveProcessing ?? null;
  let sensitiveRoute: SensitiveRoute | null = null;
  let schedule8Condition: Schedule8Condition | null = null;
  if (sensitiveProcessing === true && input.sensitiveRoute) {
    if (!(input.sensitiveRoute in SENSITIVE_ROUTES)) throw new Part3Refused("Choose the section 35 route for sensitive processing.");
    sensitiveRoute = input.sensitiveRoute as SensitiveRoute;
    if (sensitiveRoute === "strictly_necessary" && input.schedule8Condition) {
      if (!isSchedule8Condition(input.schedule8Condition)) throw new Part3Refused("That is not a Schedule 8 condition.");
      schedule8Condition = input.schedule8Condition;
    }
  }

  const logging: LoggingStatement[] = [];
  for (const l of input.logging ?? []) {
    const system = l.system?.trim();
    if (!system) continue;
    const operations = (l.operations ?? []).filter((o): o is LoggedOperation => o in LOGGED_OPERATIONS);
    const lastChecked = l.lastChecked?.trim() || null;
    if (lastChecked && (!/^\d{4}-\d{2}-\d{2}$/.test(lastChecked) || new Date(`${lastChecked}T00:00:00Z`).getTime() > Date.now())) {
      throw new Part3Refused(`Give a date in the past for when ${system}'s logs were last checked.`);
    }
    logging.push({
      system,
      operations: LOGGED_OPERATION_KEYS.filter((o) => operations.includes(o)),
      identifiesPeople: l.identifiesPeople === true,
      reviewer: l.reviewer?.trim() || null,
      lastChecked,
    });
  }

  const needsPolicy = sensitiveProcessing === true;
  const follows = needsPolicy ? (input.retentionFollowsPolicy ?? null) : null;
  return {
    part3Basis: (input.part3Basis || null) as Part3Basis | null,
    sensitiveProcessing,
    sensitiveRoute,
    schedule8Condition,
    factOpinionMarked: input.factOpinionMarked ?? null,
    logging,
    retentionFollowsPolicy: follows,
    retentionPolicyNote: follows === false ? input.retentionPolicyNote?.trim() || null : null,
  };
}

/** The policy document key the sensitive processing relies on, if it can be told yet. */
export function part3PolicyKey(r: Pick<Part3Record, "sensitiveProcessing" | "sensitiveRoute" | "schedule8Condition">): Part3PolicyKey | null {
  if (r.sensitiveProcessing !== true) return null;
  if (r.sensitiveRoute === "consent") return "part3_consent";
  if (r.sensitiveRoute === "strictly_necessary") return r.schedule8Condition;
  return null;
}

export type Part3Gap =
  | "part3_not_competent_authority"
  | "part3_no_basis"
  | "sensitive_no_route"
  | "sensitive_no_schedule8"
  | "sensitive_no_policy_document"
  | "part3_retention_policy_unanswered"
  | "fact_opinion_unanswered"
  | "part3_categories_not_distinguished"
  | "logging_missing"
  | "logging_incomplete";

export const PART3_GAP_WORDS: Record<Part3Gap, string> = {
  part3_not_competent_authority: "Recorded under Part 3, but the entity is not recorded as a competent authority",
  part3_no_basis: "Does not say how section 35(2) is met",
  sensitive_no_route: "Sensitive processing with no section 35 route chosen",
  sensitive_no_schedule8: "Sensitive processing as strictly necessary, with no Schedule 8 condition",
  sensitive_no_policy_document: "Sensitive processing that no current appropriate policy document covers (s.42)",
  part3_retention_policy_unanswered: "Does not say whether retention followed the policy document, or why not (s.42(4)(c))",
  fact_opinion_unanswered: "Does not say whether fact is distinguished from personal assessment (s.38(2))",
  part3_categories_not_distinguished: "Categories of data subject do not distinguish suspects, the convicted, victims or witnesses (s.38(3))",
  logging_missing: "A system with no logging statement (s.62)",
  logging_incomplete: "A logging statement missing an operation or a reviewer (s.62)",
};

/** Processing the record describes as something Part 3 does not allow. */
export const HARD_PART3_GAPS: Part3Gap[] = [
  "part3_not_competent_authority",
  "part3_no_basis",
  "sensitive_no_route",
  "sensitive_no_schedule8",
  "sensitive_no_policy_document",
];

/**
 * What a Part 3 record is missing. The policy document gap needs `coverage`
 * (the policy document register's current conditions) and is not reported
 * without it.
 */
export function part3Gaps(
  r: Part3Record & { entityId: string; systems: readonly string[]; subjectCategories: readonly string[] },
  /** Each is reported on only when supplied, rather than assumed. */
  context: { competentAuthority?: boolean; coverage?: ReadonlyArray<{ entityId: string | null; conditions: readonly string[] }> },
): Part3Gap[] {
  const gaps: Part3Gap[] = [];
  if (context.competentAuthority === false) gaps.push("part3_not_competent_authority");
  if (!r.part3Basis) gaps.push("part3_no_basis");
  if (r.sensitiveProcessing === true) {
    if (!r.sensitiveRoute) gaps.push("sensitive_no_route");
    else if (r.sensitiveRoute === "strictly_necessary" && !r.schedule8Condition) gaps.push("sensitive_no_schedule8");
    const key = part3PolicyKey(r);
    if (key && context.coverage && !context.coverage.some((c) => (c.entityId === null || c.entityId === r.entityId) && c.conditions.includes(key))) {
      gaps.push("sensitive_no_policy_document");
    }
    if (r.retentionFollowsPolicy === null || (r.retentionFollowsPolicy === false && !r.retentionPolicyNote?.trim())) {
      gaps.push("part3_retention_policy_unanswered");
    }
  }
  if (r.factOpinionMarked === null) gaps.push("fact_opinion_unanswered");
  if (!r.subjectCategories.some((c) => PART3_SUBJECT_LABELS.includes(c))) {
    gaps.push("part3_categories_not_distinguished");
  }
  const stated = new Set(r.logging.map((l) => l.system.toLowerCase()));
  if (r.systems.some((s) => !stated.has(s.trim().toLowerCase()))) gaps.push("logging_missing");
  if (r.logging.some((l) => l.operations.length < LOGGED_OPERATION_KEYS.length || !l.reviewer)) gaps.push("logging_incomplete");
  return gaps;
}
