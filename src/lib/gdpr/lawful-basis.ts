/**
 * The lawful bases of UK GDPR Article 6(1), as the Data (Use and Access) Act
 * 2025 left them, expressed once.
 *
 * Pure. The DUAA added a seventh basis from 5 February 2026: recognised
 * legitimate interests (point (ea)), for the conditions in Annex 1. Unlike
 * ordinary legitimate interests (point (f)) it needs no balancing test, but the
 * right to object in Article 21(1) reaches it all the same, and Article 22B
 * forbids resting a significant solely automated decision on it.
 *
 * Nothing here decides a basis. It names them, reads free text that names one
 * unambiguously, and says what a record still lacks.
 */

export type LawfulBasis =
  | "consent"
  | "contract"
  | "legal_obligation"
  | "vital_interests"
  | "public_task"
  | "recognised_legitimate_interests"
  | "legitimate_interests";

export const LAWFUL_BASES: Record<LawfulBasis, { label: string; point: string }> = {
  consent: { label: "Consent", point: "Article 6(1)(a)" },
  contract: { label: "Contract", point: "Article 6(1)(b)" },
  legal_obligation: { label: "Legal obligation", point: "Article 6(1)(c)" },
  vital_interests: { label: "Vital interests", point: "Article 6(1)(d)" },
  public_task: { label: "Public task", point: "Article 6(1)(e)" },
  recognised_legitimate_interests: { label: "Recognised legitimate interests", point: "Article 6(1)(ea)" },
  legitimate_interests: { label: "Legitimate interests", point: "Article 6(1)(f)" },
};

export const LAWFUL_BASIS_KEYS = Object.keys(LAWFUL_BASES) as LawfulBasis[];

export function isLawfulBasis(value: string): value is LawfulBasis {
  return value in LAWFUL_BASES;
}

/** Annex 1: the conditions under which a legitimate interest is recognised. */
export type RecognisedCondition =
  | "public_task_disclosure"
  | "national_security"
  | "emergency"
  | "crime"
  | "safeguarding";

export const RECOGNISED_CONDITIONS: Record<RecognisedCondition, { paragraph: string; label: string; summary: string }> = {
  public_task_disclosure: {
    paragraph: "Annex 1, paragraph 1",
    label: "Disclosure for another's public task",
    summary: "Disclosing data on request to someone who needs it for a task in the public interest or in the exercise of official authority, with a legal basis.",
  },
  national_security: {
    paragraph: "Annex 1, paragraph 2",
    label: "National security, public security or defence",
    summary: "Processing necessary for the purposes of safeguarding national security, protecting public security, or defence.",
  },
  emergency: {
    paragraph: "Annex 1, paragraph 3",
    label: "Responding to an emergency",
    summary: "Processing necessary to respond to an emergency, as paragraph 4 defines it.",
  },
  crime: {
    paragraph: "Annex 1, paragraph 5",
    label: "Detecting, investigating or preventing crime",
    summary: "Processing necessary to detect, investigate or prevent crime, or to apprehend or prosecute offenders.",
  },
  safeguarding: {
    paragraph: "Annex 1, paragraph 6",
    label: "Safeguarding a vulnerable individual",
    summary: "Processing necessary to safeguard a vulnerable individual, as paragraphs 7 and 8 define it.",
  },
};

export const RECOGNISED_CONDITION_KEYS = Object.keys(RECOGNISED_CONDITIONS) as RecognisedCondition[];

export function isRecognisedCondition(value: string): value is RecognisedCondition {
  return value in RECOGNISED_CONDITIONS;
}

/**
 * What each basis looks like when somebody has typed it. Recognised legitimate
 * interests is tried before ordinary legitimate interests, since its words
 * contain the other's.
 */
const PATTERNS: Array<[LawfulBasis, RegExp]> = [
  ["recognised_legitimate_interests", /\brecogni[sz]ed legitimate interests?\b|6\s*\(1\)\s*\(ea\)|^\(?ea\)?$/],
  ["legitimate_interests", /\blegitimate interests?\b|6\s*\(1\)\s*\(f\)|^\(?f\)?$/],
  ["consent", /\bconsent\b|6\s*\(1\)\s*\(a\)/],
  ["contract", /\bcontract(ual)?\b|6\s*\(1\)\s*\(b\)/],
  ["legal_obligation", /\blegal obligation\b|6\s*\(1\)\s*\(c\)/],
  ["vital_interests", /\bvital interests?\b|6\s*\(1\)\s*\(d\)/],
  ["public_task", /\bpublic (task|interest)\b|\bofficial authority\b|6\s*\(1\)\s*\(e\)/],
];

function basisOfPart(part: string): LawfulBasis | null {
  const text = part.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const matches = PATTERNS.filter(([, re]) => re.test(text)).map(([b]) => b);
  // "Recognised legitimate interests" also matches the plain pattern; the more
  // specific reading is the meaning.
  const distinct = matches.includes("recognised_legitimate_interests")
    ? matches.filter((m) => m !== "legitimate_interests")
    : matches;
  return distinct.length === 1 ? distinct[0] : null;
}

/**
 * The bases a piece of free text names, or null where it is not unambiguous.
 *
 * Split on the usual separators, and every part must name exactly one basis.
 * "Contract; legitimate interests" is two bases; "Legitimate interests or
 * consent, TBC" is not read at all, because a guess here would put a basis on
 * the record that nobody chose.
 */
export function basesFromText(text: string | null | undefined): LawfulBasis[] | null {
  if (!text?.trim()) return null;
  const parts = text.split(/[;,/+&\n]|\band\b/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const bases: LawfulBasis[] = [];
  for (const part of parts) {
    const basis = basisOfPart(part);
    if (!basis) return null;
    if (!bases.includes(basis)) bases.push(basis);
  }
  return bases;
}

export type LawfulBasisGap = "no_basis" | "no_recognised_condition";

export const LAWFUL_BASIS_GAP_WORDS: Record<LawfulBasisGap, string> = {
  no_basis: "No lawful basis chosen",
  no_recognised_condition: "Recognised legitimate interests with no Annex 1 condition",
};

export function lawfulBasisGaps(input: {
  bases: readonly LawfulBasis[];
  recognisedCondition: string | null;
}): LawfulBasisGap[] {
  if (input.bases.length === 0) return ["no_basis"];
  if (input.bases.includes("recognised_legitimate_interests") && !input.recognisedCondition) {
    return ["no_recognised_condition"];
  }
  return [];
}

/** Bases in the order Article 6(1) lists them, for display. */
export function describeBases(bases: readonly LawfulBasis[]): string {
  return LAWFUL_BASIS_KEYS.filter((b) => bases.includes(b)).map((b) => LAWFUL_BASES[b].label).join(", ");
}
