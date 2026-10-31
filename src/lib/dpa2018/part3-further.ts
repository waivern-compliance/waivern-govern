/**
 * Further processing and research under Part 3 of the Data Protection Act 2018:
 * the second data protection principle (s.36) and the archiving, research and
 * statistics safeguards (s.41).
 *
 * Pure. Checked on legislation.gov.uk on 31 October 2026 (up to date to 30
 * October 2026), as the Data (Use and Access) Act 2025 amended both from
 * 5 February 2026 (ss.71(8), 86(7)).
 *
 * - Data collected for one law enforcement purpose may be processed for
 *   another, by the same controller or another, only if that controller is
 *   authorised by law to process it for that purpose and the processing is
 *   necessary and proportionate to it (s.36(3)). There is no compatibility
 *   test of the Article 8A kind and no list of deemed-compatible cases.
 * - Data collected for a law enforcement purpose may not be processed for any
 *   other purpose unless that is authorised by law (s.36(4)). That processing
 *   is not itself under Part 3, so the question is asked on the UK GDPR record
 *   that reuses Part 3 data.
 * - Processing for archiving in the public interest, scientific or historical
 *   research, or statistics, for a law enforcement purpose, is not permitted
 *   if it is for measures or decisions about a particular person, or likely to
 *   cause substantial damage or distress (s.41(2)). Unlike UK GDPR Article
 *   84C, there is no approved medical research exception and no express data
 *   minimisation requirement.
 */

import type { ResearchSafeguard } from "@/lib/gdpr/further-processing";

/** The two s.41(2) limits, keyed as the UK GDPR research safeguards are so one record holds both. */
export const PART3_RESEARCH_SAFEGUARDS: Partial<Record<ResearchSafeguard, { label: string; point: string }>> = {
  no_individual_decisions: { label: "Not for measures or decisions about a particular person", point: "Section 41(2)(a)" },
  no_substantial_harm: { label: "Not likely to cause anyone substantial damage or substantial distress", point: "Section 41(2)(b)" },
};

export const PART3_RESEARCH_SAFEGUARD_KEYS = Object.keys(PART3_RESEARCH_SAFEGUARDS) as ResearchSafeguard[];

/** What a Part 3 record holds about further processing and research. */
export type Part3FurtherRecord = {
  furtherProcessing: boolean | null;
  originalActivityId: string | null;
  /** The law authorising this controller to process the data for this purpose (s.36(3)(a), or s.36(4)). */
  furtherAuthorisedBy: string | null;
  /** Section 36(3)(b). */
  furtherNecessaryProportionate: boolean | null;
  research: boolean | null;
  researchSafeguards: Partial<Record<ResearchSafeguard, { confirmed: boolean; note?: string }>>;
};

export type Part3FurtherGap =
  | "part3_further_unauthorised"
  | "part3_further_not_proportionate"
  | "part3_further_unconfirmed"
  | "part3_research_safeguards"
  | "part3_reuse_unauthorised";

export const PART3_FURTHER_GAP_WORDS: Record<Part3FurtherGap, string> = {
  part3_further_unauthorised: "Further law enforcement processing with no law authorising it (s.36(3)(a))",
  part3_further_not_proportionate: "Further law enforcement processing recorded as not necessary and proportionate (s.36(3)(b))",
  part3_further_unconfirmed: "Further law enforcement processing: necessity and proportionality not confirmed (s.36(3)(b))",
  part3_research_safeguards: "Law enforcement research, archiving or statistics with the s.41(2) limits unconfirmed",
  part3_reuse_unauthorised: "Reuses data collected for law enforcement with no law authorising it (s.36(4))",
};

/** The ones the Act puts as "only if": processing the record itself shows is not allowed, or not shown to be. */
export const HARD_PART3_FURTHER_GAPS: Part3FurtherGap[] = [
  "part3_further_unauthorised",
  "part3_further_not_proportionate",
  "part3_reuse_unauthorised",
];

/** On a record under Part 3: s.36(3) where it is further processing, s.41(2) where it is research. */
export function part3FurtherGaps(record: Part3FurtherRecord): Part3FurtherGap[] {
  const gaps: Part3FurtherGap[] = [];
  if (record.furtherProcessing) {
    if (!record.furtherAuthorisedBy?.trim()) gaps.push("part3_further_unauthorised");
    if (record.furtherNecessaryProportionate === false) gaps.push("part3_further_not_proportionate");
    else if (record.furtherNecessaryProportionate !== true) gaps.push("part3_further_unconfirmed");
  }
  if (record.research && PART3_RESEARCH_SAFEGUARD_KEYS.some((k) => !record.researchSafeguards?.[k]?.confirmed)) {
    gaps.push("part3_research_safeguards");
  }
  return gaps;
}

/**
 * On a UK GDPR record reusing data first collected under Part 3: s.36(4).
 * Only where the original activity is linked and known to be under Part 3.
 */
export function part3ReuseGaps(
  record: Pick<Part3FurtherRecord, "furtherProcessing" | "furtherAuthorisedBy">,
  originalIsPart3: boolean,
): Part3FurtherGap[] {
  return record.furtherProcessing && originalIsPart3 && !record.furtherAuthorisedBy?.trim() ? ["part3_reuse_unauthorised"] : [];
}

/** One line, for a list or a read-only page. */
export function describePart3Further(record: Part3FurtherRecord): string {
  const parts: string[] = [];
  if (record.furtherProcessing === true) {
    parts.push(record.furtherAuthorisedBy ? `Further processing, authorised by ${record.furtherAuthorisedBy}` : "Further processing, no authorising law recorded");
  } else if (record.furtherProcessing === false) parts.push("Not further processing");
  if (record.research === true) parts.push("research, archiving or statistics");
  return parts.join(" · ") || "Not yet known";
}

export class Part3FurtherRefused extends Error {}

/**
 * The Part 3 answers as they will be stored. An answer that depends on
 * another is kept only while that one holds. The UK GDPR's own answers are not
 * touched, so moving the record back finds them as they were; the data
 * minimisation confirmation, which s.41 does not ask for, is carried over.
 */
export function cleanPart3Further(
  input: {
    furtherProcessing?: boolean | null;
    originalActivityId?: string | null;
    furtherAuthorisedBy?: string | null;
    furtherNecessaryProportionate?: boolean | null;
    research?: boolean | null;
    researchSafeguards?: Record<string, { confirmed: boolean; note?: string }>;
  },
  existingSafeguards: Part3FurtherRecord["researchSafeguards"] = {},
): Part3FurtherRecord {
  // The form posts every research safeguard key; only s.41(2)'s are read, and
  // anything that is no safeguard at all is refused.
  const unknown = Object.keys(input.researchSafeguards ?? {}).filter((k) => !(k in PART3_RESEARCH_SAFEGUARDS) && k !== "data_minimisation");
  if (unknown.length > 0) throw new Part3FurtherRefused(`Not a section 41(2) limit: ${unknown.join(", ")}.`);
  const further = input.furtherProcessing ?? null;
  const research = input.research ?? null;
  const safeguards: Part3FurtherRecord["researchSafeguards"] = {};
  if (research) {
    for (const k of PART3_RESEARCH_SAFEGUARD_KEYS) {
      const s = input.researchSafeguards?.[k];
      const note = s?.note?.trim();
      if (s && (s.confirmed || note)) safeguards[k] = { confirmed: s.confirmed, ...(note ? { note } : {}) };
    }
    if (existingSafeguards.data_minimisation) safeguards.data_minimisation = existingSafeguards.data_minimisation;
  }
  return {
    furtherProcessing: further,
    originalActivityId: further ? input.originalActivityId || null : null,
    furtherAuthorisedBy: further ? input.furtherAuthorisedBy?.trim() || null : null,
    furtherNecessaryProportionate: further ? (input.furtherNecessaryProportionate ?? null) : null,
    research,
    researchSafeguards: research ? safeguards : {},
  };
}
