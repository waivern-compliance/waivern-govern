/**
 * Significant decisions taken solely by automated means: UK GDPR Articles
 * 22A to 22C, as the Data (Use and Access) Act 2025 substituted them for
 * Article 22 from 5 February 2026.
 *
 * Pure. The blanket restriction is gone. A decision is solely automated where
 * no person is meaningfully involved, and significant where it has a legal or
 * similarly significant effect (22A). Such a decision is still restricted in
 * two cases (22B): where it rests on special category data, unless the person
 * explicitly consented or it is needed for a contract or authorised by law with
 * Article 9(2)(g) applying; and where the processing relies on recognised
 * legitimate interests, which it may not do at all. Every such decision needs
 * four safeguards (22C).
 *
 * The same record can be kept on a processing activity or on an AI use case,
 * whichever the person is working in. Nothing here decides anything: it says
 * what the record shows, what it lacks, and whether two records agree.
 */

import type { LawfulBasis } from "./lawful-basis";

/** Article 22C(2): what the safeguards must include. */
export type AdmSafeguard = "information" | "representations" | "human_intervention" | "contest";

export const ADM_SAFEGUARDS: Record<AdmSafeguard, { label: string; point: string }> = {
  information: { label: "People are told about these decisions", point: "Article 22C(2)(a)" },
  representations: { label: "They can make representations about them", point: "Article 22C(2)(b)" },
  human_intervention: { label: "They can obtain human intervention", point: "Article 22C(2)(c)" },
  contest: { label: "They can contest them", point: "Article 22C(2)(d)" },
};

export const ADM_SAFEGUARD_KEYS = Object.keys(ADM_SAFEGUARDS) as AdmSafeguard[];

/** Article 22B(2) and (3): when special category data may be behind the decision. */
export type AdmSpecialCondition = "explicit_consent" | "contract_or_law";

export const ADM_SPECIAL_CONDITIONS: Record<AdmSpecialCondition, { label: string; paragraph: string }> = {
  explicit_consent: {
    label: "Based entirely on data the person explicitly consented to",
    paragraph: "Article 22B(2)",
  },
  contract_or_law: {
    label: "Necessary for a contract with them, or required or authorised by law, and Article 9(2)(g) applies",
    paragraph: "Article 22B(3)",
  },
};

export const ADM_SPECIAL_CONDITION_KEYS = Object.keys(ADM_SPECIAL_CONDITIONS) as AdmSpecialCondition[];

export type AdmSafeguards = Partial<Record<AdmSafeguard, { confirmed: boolean; note?: string }>>;

/** The automated-decision record, as either side holds it. */
export type AdmRecord = {
  /** Whether it takes significant decisions solely by automated means. Null: not yet known. */
  automatedDecisions: boolean | null;
  /** Whether those decisions rest, wholly or partly, on special category data. */
  admSpecialCategory: boolean | null;
  admSpecialCondition: AdmSpecialCondition | null;
  admSafeguards: AdmSafeguards;
};

export class AutomatedDecisionRefused extends Error {}

/**
 * The record as it will be stored. Unknown values are refused. Where no such
 * decisions are taken, the rest is cleared, so the record never claims
 * safeguards for decisions it says do not exist; a condition is kept only
 * where special category data is involved.
 */
export function cleanAdm(input: {
  automatedDecisions: boolean | null;
  admSpecialCategory?: boolean | null;
  admSpecialCondition?: string | null;
  admSafeguards?: Record<string, { confirmed: boolean; note?: string }>;
}): AdmRecord {
  const condition = input.admSpecialCondition || null;
  if (condition && !(condition in ADM_SPECIAL_CONDITIONS)) {
    throw new AutomatedDecisionRefused(`Not an Article 22B condition: ${condition}.`);
  }
  const unknown = Object.keys(input.admSafeguards ?? {}).filter((k) => !(k in ADM_SAFEGUARDS));
  if (unknown.length > 0) throw new AutomatedDecisionRefused(`Not an Article 22C safeguard: ${unknown.join(", ")}.`);

  if (input.automatedDecisions === false) {
    return { automatedDecisions: false, admSpecialCategory: null, admSpecialCondition: null, admSafeguards: {} };
  }
  const safeguards: AdmSafeguards = {};
  for (const key of ADM_SAFEGUARD_KEYS) {
    const s = input.admSafeguards?.[key];
    if (!s) continue;
    const note = s.note?.trim();
    if (s.confirmed || note) safeguards[key] = { confirmed: s.confirmed, ...(note ? { note } : {}) };
  }
  const special = input.admSpecialCategory ?? null;
  return {
    automatedDecisions: input.automatedDecisions,
    admSpecialCategory: special,
    admSpecialCondition: special ? (condition as AdmSpecialCondition | null) : null,
    admSafeguards: safeguards,
  };
}

export type AdmGap =
  | "adm_relies_on_ea"
  | "adm_special_unanswered"
  | "adm_special_no_condition"
  | "adm_safeguards";

export const ADM_GAP_WORDS: Record<AdmGap, string> = {
  adm_relies_on_ea: "Solely automated decisions relying on recognised legitimate interests (Article 22B(4))",
  adm_special_unanswered: "Solely automated decisions: special category data not answered",
  adm_special_no_condition: "Solely automated decisions on special category data with no Article 22B condition",
  adm_safeguards: "Solely automated decisions with Article 22C safeguards unconfirmed",
};

/**
 * What the record does not yet show, most pressing first.
 *
 * Only where significant decisions are solely automated: a record that says
 * none are, or has not said, owes nothing here. `bases` is the processing's
 * lawful bases where they are known; an AI use case has none of its own, so
 * the Article 22B(4) check waits for a linked processing activity.
 */
export function admGaps(record: AdmRecord, bases?: readonly LawfulBasis[]): AdmGap[] {
  if (record.automatedDecisions !== true) return [];
  const gaps: AdmGap[] = [];
  if (bases?.includes("recognised_legitimate_interests")) gaps.push("adm_relies_on_ea");
  if (record.admSpecialCategory === null) gaps.push("adm_special_unanswered");
  else if (record.admSpecialCategory && !record.admSpecialCondition) gaps.push("adm_special_no_condition");
  if (ADM_SAFEGUARD_KEYS.some((k) => !record.admSafeguards?.[k]?.confirmed)) gaps.push("adm_safeguards");
  return gaps;
}

/**
 * Whether Article 22B lets these decisions be taken solely by automated means.
 * Null where the record does not say enough to tell.
 */
export function admRestriction(
  record: AdmRecord,
  bases?: readonly LawfulBasis[],
): { allowed: boolean | null; why: string | null } {
  if (record.automatedDecisions !== true) return { allowed: true, why: null };
  if (bases?.includes("recognised_legitimate_interests")) {
    return {
      allowed: false,
      why: "The processing relies on recognised legitimate interests, and Article 22B(4) forbids a significant decision based solely on automated processing that does.",
    };
  }
  if (record.admSpecialCategory === null) return { allowed: null, why: "Whether special category data is involved is not recorded." };
  if (record.admSpecialCategory && !record.admSpecialCondition) {
    return {
      allowed: false,
      why: "It rests on special category data, which Article 22B(1) allows only with explicit consent, or for a contract or by law where Article 9(2)(g) applies.",
    };
  }
  return { allowed: true, why: null };
}

/** The fields that make up the record, for copying from one side to the other. */
export function admOf(record: AdmRecord): AdmRecord {
  return {
    automatedDecisions: record.automatedDecisions,
    admSpecialCategory: record.admSpecialCategory,
    admSpecialCondition: record.admSpecialCondition,
    admSafeguards: record.admSafeguards ?? {},
  };
}

function signature(r: AdmRecord): string {
  return JSON.stringify([
    r.automatedDecisions,
    r.admSpecialCategory,
    r.admSpecialCondition,
    ADM_SAFEGUARD_KEYS.filter((k) => r.admSafeguards?.[k]?.confirmed),
  ]);
}

/**
 * For a linked pair: whether one side has the automated-decision record and
 * the other lacks it, or the two disagree. Notes are not compared — they are
 * written for the record they sit on — only the answers.
 */
export type AdmMismatch = "missing_here" | "missing_there" | "differs";

export function admMismatch(here: AdmRecord, there: AdmRecord): AdmMismatch | null {
  const hasHere = here.automatedDecisions !== null;
  const hasThere = there.automatedDecisions !== null;
  if (!hasHere && !hasThere) return null;
  if (!hasHere) return "missing_here";
  if (!hasThere) return "missing_there";
  return signature(here) === signature(there) ? null : "differs";
}

/** One line, for a list or a read-only page. */
export function describeAdm(record: AdmRecord): string {
  if (record.automatedDecisions === null) return "Not yet known";
  if (!record.automatedDecisions) return "No significant decisions taken solely by automated means";
  const confirmed = ADM_SAFEGUARD_KEYS.filter((k) => record.admSafeguards?.[k]?.confirmed).length;
  return `Takes significant decisions solely by automated means · ${confirmed} of 4 safeguards confirmed`;
}
