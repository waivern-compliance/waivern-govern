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
 * Law enforcement processing under Part 3 of the Data Protection Act 2018 has
 * its own version, ss.50A–50D, substituted for ss.49–50 on the same day and
 * checked on legislation.gov.uk on 31 October 2026. The test (s.50A) and the
 * four safeguards (s.50C(2)) are the same. Sensitive processing may be behind
 * the decision only with explicit consent or where the decision is required or
 * authorised by law (s.50B); there is no recognised legitimate interests bar,
 * Part 3 having no lawful bases of that kind. And the safeguards may be set
 * aside for a decision where that is required for one of five reasons (s.50C(4)
 * — national security among them, unlike the s.45(4) restriction grounds), but
 * only if the decision is reconsidered as soon as reasonably practicable with
 * meaningful human involvement (s.50C(3)).
 *
 * The same record can be kept on a processing activity or on an AI use case,
 * whichever the person is working in. Nothing here decides anything: it says
 * what the record shows, what it lacks, and whether two records agree.
 */

import type { Regime } from "@/lib/dpa2018/part3";
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

/** Section 50C(2): the same four, under Part 3. */
export const PART3_ADM_SAFEGUARD_POINTS: Record<AdmSafeguard, string> = {
  information: "Section 50C(2)(a)",
  representations: "Section 50C(2)(b)",
  human_intervention: "Section 50C(2)(c)",
  contest: "Section 50C(2)(d)",
};

/** Where the safeguard is cited, by regime. */
export function admSafeguardPoint(k: AdmSafeguard, regime: Regime = "uk_gdpr"): string {
  return regime === "dpa_part3" ? PART3_ADM_SAFEGUARD_POINTS[k] : ADM_SAFEGUARDS[k].point;
}

/**
 * Article 22B(2) and (3), or section 50B(2) and (3): when special category
 * data (sensitive processing, under Part 3) may be behind the decision.
 */
export type AdmSpecialCondition = "explicit_consent" | "contract_or_law" | "required_by_law";

export const ADM_SPECIAL_CONDITIONS: Record<AdmSpecialCondition, { label: string; paragraph: string }> = {
  explicit_consent: {
    label: "Based entirely on data the person explicitly consented to",
    paragraph: "Article 22B(2)",
  },
  contract_or_law: {
    label: "Necessary for a contract with them, or required or authorised by law, and Article 9(2)(g) applies",
    paragraph: "Article 22B(3)",
  },
  required_by_law: {
    label: "The decision is required or authorised by law",
    paragraph: "Section 50B(3)",
  },
};

/** The conditions each regime allows, in the order the law gives them. */
export const ADM_SPECIAL_CONDITIONS_FOR: Record<Regime, readonly AdmSpecialCondition[]> = {
  uk_gdpr: ["explicit_consent", "contract_or_law"],
  dpa_part3: ["explicit_consent", "required_by_law"],
};

/** The UK GDPR's, for the forms and the integration API that know no other. */
export const ADM_SPECIAL_CONDITION_KEYS = ADM_SPECIAL_CONDITIONS_FOR.uk_gdpr;

/** Where the condition is cited, by regime. */
export function admConditionParagraph(c: AdmSpecialCondition, regime: Regime = "uk_gdpr"): string {
  return regime === "dpa_part3" && c === "explicit_consent" ? "Section 50B(2)" : ADM_SPECIAL_CONDITIONS[c].paragraph;
}

export type AdmSafeguards = Partial<Record<AdmSafeguard, { confirmed: boolean; note?: string }>>;

/** Section 50C(4): why the safeguards may be set aside for a decision, under Part 3 only. */
export const ADM_SET_ASIDE_REASONS = {
  a: "To avoid obstructing an official or legal inquiry, investigation or procedure",
  b: "To avoid prejudicing the prevention, detection, investigation or prosecution of criminal offences, or the execution of criminal penalties",
  c: "To protect public security",
  d: "To safeguard national security",
  e: "To protect the rights and freedoms of others",
} as const;
export type AdmSetAsideReason = keyof typeof ADM_SET_ASIDE_REASONS;
export const ADM_SET_ASIDE_REASON_KEYS = Object.keys(ADM_SET_ASIDE_REASONS) as AdmSetAsideReason[];

/**
 * Section 50C(3): the reasons some decisions may be taken without the
 * safeguards, and how each such decision is then reconsidered.
 */
export type AdmSetAside = { reasons: AdmSetAsideReason[]; reconsideration: string };

/** The automated-decision record, as either side holds it. */
export type AdmRecord = {
  /** Whether it takes significant decisions solely by automated means. Null: not yet known. */
  automatedDecisions: boolean | null;
  /** Whether those decisions rest, wholly or partly, on special category data. */
  admSpecialCategory: boolean | null;
  admSpecialCondition: AdmSpecialCondition | null;
  admSafeguards: AdmSafeguards;
  /** Part 3 only: present where some decisions may be taken without the safeguards. */
  admSetAside?: AdmSetAside | null;
};

export class AutomatedDecisionRefused extends Error {}

/**
 * The record as it will be stored. Unknown values are refused, and so is a
 * condition or a set-aside the regime does not have. Where no such decisions
 * are taken, the rest is cleared, so the record never claims safeguards for
 * decisions it says do not exist; a condition is kept only where special
 * category data is involved.
 *
 * Under the UK GDPR the result has no set-aside at all, so saving it leaves
 * one recorded while the activity was under Part 3 as it was, hidden.
 */
export function cleanAdm(
  input: {
    automatedDecisions: boolean | null;
    admSpecialCategory?: boolean | null;
    admSpecialCondition?: string | null;
    admSafeguards?: Record<string, { confirmed: boolean; note?: string }>;
    admSetAside?: { reasons?: readonly unknown[]; reconsideration?: unknown } | null;
  },
  regime: Regime = "uk_gdpr",
): AdmRecord {
  const part3 = regime === "dpa_part3";
  const condition = input.admSpecialCondition || null;
  if (condition && !ADM_SPECIAL_CONDITIONS_FOR[regime].includes(condition as AdmSpecialCondition)) {
    throw new AutomatedDecisionRefused(
      condition in ADM_SPECIAL_CONDITIONS
        ? part3
          ? "Under Part 3 the conditions are explicit consent or a decision required or authorised by law (s.50B); a contract is not one."
          : "That is Part 3's condition (s.50B(3)); under the UK GDPR it is a contract, or law with Article 9(2)(g) (Article 22B(3))."
        : `Not ${part3 ? "a section 50B" : "an Article 22B"} condition: ${condition}.`,
    );
  }
  const unknown = Object.keys(input.admSafeguards ?? {}).filter((k) => !(k in ADM_SAFEGUARDS));
  if (unknown.length > 0) throw new AutomatedDecisionRefused(`Not ${part3 ? "a section 50C" : "an Article 22C"} safeguard: ${unknown.join(", ")}.`);
  const setAside = cleanSetAside(input.admSetAside ?? null, part3);

  if (input.automatedDecisions === false) {
    return {
      automatedDecisions: false, admSpecialCategory: null, admSpecialCondition: null, admSafeguards: {},
      ...(part3 ? { admSetAside: null } : {}),
    };
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
    ...(part3 ? { admSetAside: setAside } : {}),
  };
}

function cleanSetAside(
  input: { reasons?: readonly unknown[]; reconsideration?: unknown } | null,
  part3: boolean,
): AdmSetAside | null {
  const reasons = [...new Set(input?.reasons ?? [])];
  const reconsideration = typeof input?.reconsideration === "string" ? input.reconsideration.trim() : "";
  if (reasons.length === 0 && !reconsideration) return null;
  if (!part3) {
    throw new AutomatedDecisionRefused("Setting the safeguards aside is Part 3's (s.50C(3)); the UK GDPR has no such provision.");
  }
  if (reasons.some((r) => typeof r !== "string" || !(r in ADM_SET_ASIDE_REASONS))) {
    throw new AutomatedDecisionRefused("That is not a reason section 50C(4) allows.");
  }
  if (reasons.length === 0) throw new AutomatedDecisionRefused("Choose the section 50C(4) reason the safeguards may be set aside for.");
  if (!reconsideration) {
    throw new AutomatedDecisionRefused(
      "The safeguards may be set aside only if the decision is reconsidered as soon as reasonably practicable, with meaningful human involvement (s.50C(3)). Say how that happens.",
    );
  }
  return { reasons: ADM_SET_ASIDE_REASON_KEYS.filter((r) => reasons.includes(r)), reconsideration };
}

export type AdmGap =
  | "adm_relies_on_ea"
  | "adm_special_unanswered"
  | "adm_special_no_condition"
  | "adm_safeguards";

export const ADM_GAP_WORDS: Record<AdmGap, string> = {
  adm_relies_on_ea: "Solely automated decisions relying on recognised legitimate interests (Article 22B(4))",
  adm_special_unanswered: "Solely automated decisions: special category or sensitive data not answered",
  adm_special_no_condition: "Solely automated decisions on special category or sensitive data with no condition met (Article 22B, or s.50B under Part 3)",
  adm_safeguards: "Solely automated decisions with safeguards unconfirmed (Article 22C, or s.50C under Part 3)",
};

/**
 * What the record does not yet show, most pressing first.
 *
 * Only where significant decisions are solely automated: a record that says
 * none are, or has not said, owes nothing here. `bases` is the processing's
 * lawful bases where they are known; an AI use case has none of its own, so
 * the Article 22B(4) check waits for a linked processing activity.
 */
export function admGaps(record: AdmRecord, bases?: readonly LawfulBasis[], regime?: Regime): AdmGap[] {
  if (record.automatedDecisions !== true) return [];
  const gaps: AdmGap[] = [];
  if (regime !== "dpa_part3" && bases?.includes("recognised_legitimate_interests")) gaps.push("adm_relies_on_ea");
  if (record.admSpecialCategory === null) gaps.push("adm_special_unanswered");
  else if (record.admSpecialCategory && !conditionMet(record, regime)) gaps.push("adm_special_no_condition");
  if (ADM_SAFEGUARD_KEYS.some((k) => !record.admSafeguards?.[k]?.confirmed)) gaps.push("adm_safeguards");
  return gaps;
}

/**
 * A condition the regime allows. Where the regime is not known — an AI use
 * case linked to nothing yet — any recorded condition counts.
 */
function conditionMet(record: AdmRecord, regime?: Regime): boolean {
  if (!record.admSpecialCondition) return false;
  return regime ? ADM_SPECIAL_CONDITIONS_FOR[regime].includes(record.admSpecialCondition) : true;
}

/**
 * Whether Article 22B (section 50B under Part 3) lets these decisions be taken
 * solely by automated means. Null where the record does not say enough to tell.
 */
export function admRestriction(
  record: AdmRecord,
  bases?: readonly LawfulBasis[],
  regime?: Regime,
): { allowed: boolean | null; why: string | null } {
  if (record.automatedDecisions !== true) return { allowed: true, why: null };
  if (regime === "dpa_part3") {
    if (record.admSpecialCategory === null) return { allowed: null, why: "Whether sensitive processing is involved is not recorded." };
    if (record.admSpecialCategory && !conditionMet(record, regime)) {
      return {
        allowed: false,
        why: "It rests on sensitive processing, which section 50B(1) allows only where the decision rests entirely on data given with explicit consent, or is required or authorised by law.",
      };
    }
    return { allowed: true, why: null };
  }
  if (bases?.includes("recognised_legitimate_interests")) {
    return {
      allowed: false,
      why: "The processing relies on recognised legitimate interests, and Article 22B(4) forbids a significant decision based solely on automated processing that does.",
    };
  }
  if (record.admSpecialCategory === null) return { allowed: null, why: "Whether special category data is involved is not recorded." };
  if (record.admSpecialCategory && !conditionMet(record, regime)) {
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
    admSetAside: record.admSetAside ?? null,
  };
}

function signature(r: AdmRecord): string {
  return JSON.stringify([
    r.automatedDecisions,
    r.admSpecialCategory,
    r.admSpecialCondition,
    ADM_SAFEGUARD_KEYS.filter((k) => r.admSafeguards?.[k]?.confirmed),
    r.admSetAside?.reasons ?? [],
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
  const setAside = record.admSetAside ? " · may be set aside under s.50C(3)" : "";
  return `Takes significant decisions solely by automated means · ${confirmed} of 4 safeguards confirmed${setAside}`;
}
