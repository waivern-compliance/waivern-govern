/**
 * Special category and criminal offence data: the Article 9(2) point, the
 * Data Protection Act 2018 Schedule 1 condition where that point needs one,
 * the Article 10 condition, and the appropriate policy document most of those
 * conditions require.
 *
 * Pure. Checked against Schedule 1 on legislation.gov.uk on 30 October 2026
 * (up to date to 25 October 2026). Section 10 says which Article 9(2) points
 * need a Schedule 1 condition: (b), (h), (i) and (j) need the Part 1 one, and
 * (g) a Part 2 one. Criminal offence data processed other than under official
 * authority needs a condition in Part 1, 2 or 3 (s.10(5)); paragraph 36 lets
 * a Part 2 condition serve without its substantial public interest words.
 *
 * Paragraph 1, paragraph 35 and every Part 2 condition need an appropriate
 * policy document (paragraphs 1(1)(b), 5 and 35(1)(c)), except where
 * paragraphs 10(2), 13(3) and 27(3) say otherwise. Where one is needed, the
 * Article 30 record must also say which condition is relied on, how Article 6
 * is met, and whether retention and erasure followed the document's policy,
 * with reasons if not (paragraph 41).
 */

export const ART9_CONDITIONS = {
  a: { point: "Article 9(2)(a)", label: "Explicit consent" },
  b: { point: "Article 9(2)(b)", label: "Employment, social security and social protection" },
  c: { point: "Article 9(2)(c)", label: "Vital interests, where consent cannot be given" },
  d: { point: "Article 9(2)(d)", label: "A not-for-profit body's members or regular contacts" },
  e: { point: "Article 9(2)(e)", label: "Made manifestly public by the person" },
  f: { point: "Article 9(2)(f)", label: "Legal claims, or courts acting judicially" },
  g: { point: "Article 9(2)(g)", label: "Substantial public interest" },
  h: { point: "Article 9(2)(h)", label: "Health or social care, under a duty of confidentiality (Article 9(3))" },
  i: { point: "Article 9(2)(i)", label: "Public health" },
  j: { point: "Article 9(2)(j)", label: "Archiving in the public interest, research or statistics" },
} as const;

export type Art9Condition = keyof typeof ART9_CONDITIONS;
export const ART9_CONDITION_KEYS = Object.keys(ART9_CONDITIONS) as Art9Condition[];

type PolicyDocumentRule =
  | { policyDocument: "required" }
  | { policyDocument: "not_required" }
  /** Required, except in the case the paragraph names. */
  | { policyDocument: "unless"; exception: string };

type Paragraph = { paragraph: number; part: 1 | 2 | 3; label: string } & PolicyDocumentRule;

const REQUIRED = { policyDocument: "required" } as const;
const NOT_REQUIRED = { policyDocument: "not_required" } as const;

export const SCHEDULE_1 = {
  para1: { paragraph: 1, part: 1, label: "Employment, social security and social protection", ...REQUIRED },
  para2: { paragraph: 2, part: 1, label: "Health or social care purposes", ...NOT_REQUIRED },
  para3: { paragraph: 3, part: 1, label: "Public health", ...NOT_REQUIRED },
  para4: { paragraph: 4, part: 1, label: "Archiving, research and statistics", ...NOT_REQUIRED },
  para6: { paragraph: 6, part: 2, label: "Statutory and government purposes", ...REQUIRED },
  para7: { paragraph: 7, part: 2, label: "Administration of justice and parliamentary purposes", ...REQUIRED },
  para8: { paragraph: 8, part: 2, label: "Equality of opportunity or treatment", ...REQUIRED },
  para9: { paragraph: 9, part: 2, label: "Racial and ethnic diversity at senior levels", ...REQUIRED },
  para10: {
    paragraph: 10, part: 2, label: "Preventing, investigating or detecting unlawful acts",
    policyDocument: "unless", exception: "disclosure to a competent authority, or preparing one (paragraph 10(2))",
  },
  para11: { paragraph: 11, part: 2, label: "Protecting the public", ...REQUIRED },
  para12: { paragraph: 12, part: 2, label: "Regulatory requirements", ...REQUIRED },
  para13: {
    paragraph: 13, part: 2, label: "Journalism in connection with unlawful acts and dishonesty",
    policyDocument: "unless", exception: "the disclosure for journalism that paragraph 13(3) describes",
  },
  para14: { paragraph: 14, part: 2, label: "Preventing fraud", ...REQUIRED },
  para15: { paragraph: 15, part: 2, label: "Suspicion of terrorist financing or money laundering", ...REQUIRED },
  para16: { paragraph: 16, part: 2, label: "Support for individuals with a particular disability or medical condition", ...REQUIRED },
  para17: { paragraph: 17, part: 2, label: "Counselling", ...REQUIRED },
  para18: { paragraph: 18, part: 2, label: "Safeguarding of children and of individuals at risk", ...REQUIRED },
  para19: { paragraph: 19, part: 2, label: "Safeguarding of economic well-being of certain individuals", ...REQUIRED },
  para20: { paragraph: 20, part: 2, label: "Insurance", ...REQUIRED },
  para21: { paragraph: 21, part: 2, label: "Occupational pensions", ...REQUIRED },
  para22: { paragraph: 22, part: 2, label: "Political parties", ...REQUIRED },
  para23: { paragraph: 23, part: 2, label: "Elected representatives responding to requests", ...REQUIRED },
  para24: { paragraph: 24, part: 2, label: "Disclosure to elected representatives", ...REQUIRED },
  para25: { paragraph: 25, part: 2, label: "Informing elected representatives about prisoners", ...REQUIRED },
  para26: { paragraph: 26, part: 2, label: "Publication of legal judgments", ...REQUIRED },
  para27: {
    paragraph: 27, part: 2, label: "Anti-doping in sport",
    policyDocument: "unless", exception: "the disclosure that paragraph 27(3) describes",
  },
  para28: { paragraph: 28, part: 2, label: "Standards of behaviour in sport", ...REQUIRED },
  para29: { paragraph: 29, part: 3, label: "Consent", ...NOT_REQUIRED },
  para30: { paragraph: 30, part: 3, label: "Protecting an individual's vital interests", ...NOT_REQUIRED },
  para31: { paragraph: 31, part: 3, label: "Processing by not-for-profit bodies", ...NOT_REQUIRED },
  para32: { paragraph: 32, part: 3, label: "Personal data in the public domain", ...NOT_REQUIRED },
  para33: { paragraph: 33, part: 3, label: "Legal claims", ...NOT_REQUIRED },
  para34: { paragraph: 34, part: 3, label: "Judicial acts", ...NOT_REQUIRED },
  para35: { paragraph: 35, part: 3, label: "Accounts used in indecency offences involving children", ...REQUIRED },
} as const satisfies Record<string, Paragraph>;

export type Schedule1Condition = keyof typeof SCHEDULE_1;
export const SCHEDULE_1_KEYS = Object.keys(SCHEDULE_1) as Schedule1Condition[];

export function isSchedule1Condition(v: unknown): v is Schedule1Condition {
  return typeof v === "string" && v in SCHEDULE_1;
}

export function isArt9Condition(v: unknown): v is Art9Condition {
  return typeof v === "string" && v in ART9_CONDITIONS;
}

/** "Schedule 1, paragraph 18 — Safeguarding of children and of individuals at risk". */
export function describeSchedule1(key: Schedule1Condition): string {
  return `Schedule 1, paragraph ${SCHEDULE_1[key].paragraph} — ${SCHEDULE_1[key].label}`;
}

/** The Schedule 1 conditions an Article 9(2) point may rest on: none where it needs none (s.10). */
export function schedule1For(point: Art9Condition): Schedule1Condition[] {
  switch (point) {
    case "b": return ["para1"];
    case "h": return ["para2"];
    case "i": return ["para3"];
    case "j": return ["para4"];
    case "g": return SCHEDULE_1_KEYS.filter((k) => SCHEDULE_1[k].part === 2);
    default: return [];
  }
}

/**
 * Article 10: criminal offence data, other than under official authority,
 * needs a condition in Part 1, 2 or 3 of Schedule 1 (s.10(5)). A Part 2
 * condition serves without its substantial public interest words (para 36).
 */
export const ART10_OFFICIAL_AUTHORITY = "official_authority";
export type Art10Condition = Schedule1Condition | typeof ART10_OFFICIAL_AUTHORITY;

export function isArt10Condition(v: unknown): v is Art10Condition {
  return v === ART10_OFFICIAL_AUTHORITY || isSchedule1Condition(v);
}

export function describeArt10(key: Art10Condition): string {
  if (key === ART10_OFFICIAL_AUTHORITY) return "Under the control of official authority (Article 10)";
  const p = SCHEDULE_1[key];
  return `${describeSchedule1(key)}${p.part === 2 ? " (with paragraph 36)" : ""}`;
}

export type SpecialCategoryRecord = {
  specialCategory: boolean | null;
  art9Condition: Art9Condition | null;
  schedule1Condition: Schedule1Condition | null;
  criminalOffence: boolean | null;
  art10Condition: Art10Condition | null;
  /** Paragraph 41(c): whether retention and erasure followed the policy document. */
  retentionFollowsPolicy: boolean | null;
  retentionPolicyNote: string | null;
};

export class ConditionRefused extends Error {}

/**
 * The record as it will be stored. What the answers make irrelevant is
 * cleared rather than kept: a Schedule 1 condition left behind after the
 * Article 9 point changed would still count as relied on.
 */
export function cleanSpecialCategory(input: {
  specialCategory?: boolean | null;
  art9Condition?: string | null;
  schedule1Condition?: string | null;
  criminalOffence?: boolean | null;
  art10Condition?: string | null;
  retentionFollowsPolicy?: boolean | null;
  retentionPolicyNote?: string | null;
}): SpecialCategoryRecord {
  const specialCategory = input.specialCategory ?? null;
  const criminalOffence = input.criminalOffence ?? null;

  let art9Condition: Art9Condition | null = null;
  let schedule1Condition: Schedule1Condition | null = null;
  if (specialCategory === true && input.art9Condition) {
    if (!isArt9Condition(input.art9Condition)) throw new ConditionRefused("That is not an Article 9(2) condition.");
    art9Condition = input.art9Condition;
    const allowed = schedule1For(art9Condition);
    if (allowed.length === 1) schedule1Condition = allowed[0];
    else if (allowed.length > 1 && input.schedule1Condition) {
      if (!isSchedule1Condition(input.schedule1Condition) || !allowed.includes(input.schedule1Condition)) {
        throw new ConditionRefused(
          `${ART9_CONDITIONS[art9Condition].point} rests on a condition in Part 2 of Schedule 1; choose one of those.`,
        );
      }
      schedule1Condition = input.schedule1Condition;
    }
  }

  let art10Condition: Art10Condition | null = null;
  if (criminalOffence === true && input.art10Condition) {
    if (!isArt10Condition(input.art10Condition)) throw new ConditionRefused("That is not an Article 10 condition.");
    art10Condition = input.art10Condition;
  }

  const record = { specialCategory, art9Condition, schedule1Condition, criminalOffence, art10Condition };
  const needsPolicy = conditionsNeedingPolicy(record).length > 0;
  const follows = needsPolicy ? (input.retentionFollowsPolicy ?? null) : null;
  return {
    ...record,
    retentionFollowsPolicy: follows,
    retentionPolicyNote: follows === false ? input.retentionPolicyNote?.trim() || null : null,
  };
}

/** The Schedule 1 conditions the record relies on. */
export function conditionsReliedOn(
  r: Pick<SpecialCategoryRecord, "specialCategory" | "schedule1Condition" | "criminalOffence" | "art10Condition">,
): Schedule1Condition[] {
  const out = new Set<Schedule1Condition>();
  if (r.specialCategory === true && r.schedule1Condition) out.add(r.schedule1Condition);
  if (r.criminalOffence === true && r.art10Condition && r.art10Condition !== ART10_OFFICIAL_AUTHORITY) {
    out.add(r.art10Condition);
  }
  return [...out];
}

/** Those of them that need an appropriate policy document, including the ones with an exception. */
export function conditionsNeedingPolicy(
  r: Pick<SpecialCategoryRecord, "specialCategory" | "schedule1Condition" | "criminalOffence" | "art10Condition">,
): Schedule1Condition[] {
  return conditionsReliedOn(r).filter((k) => SCHEDULE_1[k].policyDocument !== "not_required");
}

/** What a current policy document covers: the conditions, for one entity or (null) the whole organisation. */
export type PolicyCoverage = { entityId: string | null; conditions: readonly string[] };

export function coveredBy(entityId: string, condition: Schedule1Condition, coverage: readonly PolicyCoverage[]): boolean {
  return coverage.some((c) => (c.entityId === null || c.entityId === entityId) && c.conditions.includes(condition));
}

export type ConditionGap =
  | "special_no_art9"
  | "special_no_schedule1"
  | "criminal_no_condition"
  | "no_policy_document"
  | "no_policy_document_exception"
  | "retention_policy_unanswered";

export const CONDITION_GAP_WORDS: Record<ConditionGap, string> = {
  special_no_art9: "Special category data with no Article 9(2) condition",
  special_no_schedule1: "Article 9(2) point with no Schedule 1 condition (Data Protection Act 2018 s.10)",
  criminal_no_condition: "Criminal offence data with no Article 10 condition",
  no_policy_document: "Relies on a Schedule 1 condition no current appropriate policy document covers",
  no_policy_document_exception:
    "Relies on a Schedule 1 condition no current appropriate policy document covers, unless its exception applies",
  retention_policy_unanswered:
    "Does not say whether retention followed the appropriate policy document, or why not (Schedule 1 paragraph 41)",
};

/** Processing the law does not allow as recorded. */
export const HARD_CONDITION_GAPS: ConditionGap[] = [
  "special_no_art9",
  "special_no_schedule1",
  "criminal_no_condition",
  "no_policy_document",
];

/**
 * What the record is missing. The policy document gaps need `coverage` and are
 * not reported without it, rather than claiming no document exists.
 */
export function conditionGaps(
  r: SpecialCategoryRecord & { entityId: string },
  coverage?: readonly PolicyCoverage[],
): ConditionGap[] {
  const gaps: ConditionGap[] = [];
  if (r.specialCategory === true) {
    if (!r.art9Condition) gaps.push("special_no_art9");
    else if (schedule1For(r.art9Condition).length > 0 && !r.schedule1Condition) gaps.push("special_no_schedule1");
  }
  if (r.criminalOffence === true && !r.art10Condition) gaps.push("criminal_no_condition");

  const needing = conditionsNeedingPolicy(r);
  if (coverage) {
    const uncovered = needing.filter((k) => !coveredBy(r.entityId, k, coverage));
    if (uncovered.some((k) => SCHEDULE_1[k].policyDocument === "required")) gaps.push("no_policy_document");
    else if (uncovered.length > 0) gaps.push("no_policy_document_exception");
  }
  if (needing.length > 0) {
    if (r.retentionFollowsPolicy === null || (r.retentionFollowsPolicy === false && !r.retentionPolicyNote?.trim())) {
      gaps.push("retention_policy_unanswered");
    }
  }
  return gaps;
}

/** Paragraph 40(1)(b): the document is reviewed and updated from time to time. Govern asks for once a year. */
export const POLICY_REVIEW_MONTHS = 12;
/** Paragraph 40(2): kept until six months after the controller stops relying on the condition. */
export const POLICY_RETENTION_MONTHS = 6;

const addMonths = (d: Date, months: number) => {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
};

export type PolicyDocumentGap = "no_conditions" | "never_reviewed" | "review_overdue" | "nothing_attached" | "no_owner";

export const POLICY_DOCUMENT_GAP_WORDS: Record<PolicyDocumentGap, string> = {
  no_conditions: "Covers no Schedule 1 condition",
  never_reviewed: "Never reviewed",
  review_overdue: `Not reviewed in ${POLICY_REVIEW_MONTHS} months`,
  nothing_attached: "The document itself is not attached",
  no_owner: "No named owner",
};

export function policyDocumentGaps(
  doc: { conditions: readonly string[]; lastReviewedAt: Date | null; ownerId: string | null; withdrawnAt: Date | null },
  attachments: number,
  now: Date = new Date(),
): PolicyDocumentGap[] {
  if (doc.withdrawnAt) return [];
  const gaps: PolicyDocumentGap[] = [];
  if (doc.conditions.length === 0) gaps.push("no_conditions");
  if (!doc.lastReviewedAt) gaps.push("never_reviewed");
  else if (addMonths(doc.lastReviewedAt, POLICY_REVIEW_MONTHS) <= now) gaps.push("review_overdue");
  if (attachments === 0) gaps.push("nothing_attached");
  if (!doc.ownerId) gaps.push("no_owner");
  return gaps;
}

/**
 * When a policy document may be deleted: once withdrawn, and six months
 * after. Govern does not know when each activity stopped relying on a
 * condition, so it counts from the withdrawal; an activity still relying on
 * one after that shows as uncovered on the register.
 */
export function deletableFrom(doc: { withdrawnAt: Date | null }): Date | null {
  return doc.withdrawnAt ? addMonths(doc.withdrawnAt, POLICY_RETENTION_MONTHS) : null;
}
