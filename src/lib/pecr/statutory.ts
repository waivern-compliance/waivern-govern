/**
 * What UK PECR regulation 6 and Schedule A1 require of cookies and similar
 * technologies, expressed once.
 *
 * Pure, like the request and complaint modules. It says which bases exist,
 * what each needs, and what a recorded decision is still missing. It decides
 * nothing: a person records the basis each item relies on, and why.
 *
 * Schedule A1 was inserted by the Data (Use and Access) Act 2025 (s.112 and
 * Sch 12) and has been in force since 5 February 2026. Its two new exceptions,
 * statistics (para 5) and appearance and function (para 6), let storage go
 * ahead without consent only if the person is told and can object, simply and
 * for free. That is what this module checks a decision against.
 */

/** When Schedule A1 came into force. */
export const SCHEDULE_A1_IN_FORCE = new Date("2026-02-05T00:00:00Z");

export type StorageBasis =
  | "consent"
  | "transmission"
  | "strictly_necessary"
  | "statistics"
  | "appearance_function"
  | "emergency"
  | "none";

export type ConditionKey =
  | "sole_purpose"
  | "provider_collects"
  | "shared_only_to_improve"
  | "requested_service";

export type Condition = { key: ConditionKey; label: string };

export const BASES: Record<
  StorageBasis,
  { label: string; citation: string; summary: string; conditions: Condition[]; needsInformation: boolean; needsObjection: boolean }
> = {
  consent: {
    label: "Consent",
    citation: "PECR Sch A1 para 2",
    summary: "Clear and comprehensive information about the purpose, and the person's consent before it is set.",
    conditions: [],
    needsInformation: true,
    needsObjection: false,
  },
  transmission: {
    label: "Transmission",
    citation: "PECR Sch A1 para 3",
    summary: "Solely to carry a communication over an electronic communications network.",
    conditions: [{ key: "sole_purpose", label: "Its only purpose is carrying the communication" }],
    needsInformation: false,
    needsObjection: false,
  },
  strictly_necessary: {
    label: "Strictly necessary",
    citation: "PECR Sch A1 para 4",
    summary:
      "Strictly necessary to provide a service the person asked for — for example security, fraud prevention, fault detection, authentication, or remembering what they entered.",
    conditions: [{ key: "requested_service", label: "The service would not work as the person asked without it" }],
    needsInformation: false,
    needsObjection: false,
  },
  statistics: {
    label: "Statistics",
    citation: "PECR Sch A1 para 5",
    summary:
      "Collected by the provider, solely to improve the service or website, shared only with someone helping to do that; the person is told clearly and can object simply and for free.",
    conditions: [
      { key: "provider_collects", label: "Collected by the organisation providing the service" },
      { key: "sole_purpose", label: "Its only purpose is statistics to improve the service or website" },
      { key: "shared_only_to_improve", label: "Shared with nobody except someone helping to make those improvements" },
    ],
    needsInformation: true,
    needsObjection: true,
  },
  appearance_function: {
    label: "Appearance and function",
    citation: "PECR Sch A1 para 6",
    summary:
      "Solely to adapt how a website or app looks or works to the person's preferences, or otherwise improve it; the person is told clearly and can object simply and for free.",
    conditions: [{ key: "sole_purpose", label: "Its only purpose is adapting or improving how the site looks or works" }],
    needsInformation: true,
    needsObjection: true,
  },
  emergency: {
    label: "Emergency assistance",
    citation: "PECR Sch A1 para 7",
    summary: "Solely to find where the person is after a communication asking for emergency help.",
    conditions: [{ key: "sole_purpose", label: "Its only purpose is locating somebody who asked for emergency help" }],
    needsInformation: false,
    needsObjection: false,
  },
  none: {
    label: "No basis",
    citation: "PECR reg 6(1)",
    summary: "Nothing in Schedule A1 covers it. Remove it, or put it behind consent.",
    conditions: [],
    needsInformation: false,
    needsObjection: false,
  },
};

export const BASIS_KEYS = Object.keys(BASES) as StorageBasis[];

/** The categories a scanner may suggest. Kept only as a suggestion. */
export type SuggestedCategory = "strictly_necessary" | "functional" | "analytics" | "advertising" | "unknown";

/**
 * The basis a scanner's category points towards, if any. Shown to the person
 * deciding, never applied: a cookie called analytics may be shared with an
 * advertiser, and then statistics does not cover it.
 */
export function suggestedBasis(category: string | null | undefined): StorageBasis | null {
  switch (category) {
    case "strictly_necessary":
      return "strictly_necessary";
    case "analytics":
      return "statistics";
    case "functional":
      return "appearance_function";
    case "advertising":
      return "consent";
    default:
      return null;
  }
}

export type GapInput = {
  item: {
    party: string;
    supplierId: string | null;
    seenBeforeConsent: boolean | null;
    seenAfterReject: boolean | null;
    status: string;
  };
  decision: { basis: StorageBasis; conditions: Partial<Record<ConditionKey, boolean>> } | null;
  property: { informationUrl: string | null; objectionMechanism: string | null };
};

/** What kind of gap a sentence is, so they can be counted across a site or an organisation. */
export type GapKind =
  | "no_basis"
  | "basis_none"
  | "condition_unconfirmed"
  | "no_information"
  | "no_objection_route"
  | "supplier_unknown"
  | "before_consent"
  | "after_reject";

export type Gap = { kind: GapKind; text: string };

/**
 * What the record does not yet show, for one item on one property.
 *
 * Each gap is a sentence a handler can act on. An item no longer in use has
 * none: there is nothing left to justify.
 */
export function gapsOf({ item, decision, property }: GapInput): Gap[] {
  if (item.status === "removed") return [];
  if (!decision) return [{ kind: "no_basis", text: "No basis recorded." }];
  const basis = BASES[decision.basis];
  const out: Gap[] = [];

  if (decision.basis === "none") {
    out.push({ kind: "basis_none", text: "Recorded as having no basis: remove it, or put it behind consent." });
    return out;
  }
  for (const c of basis.conditions) {
    if (!decision.conditions[c.key]) {
      out.push({ kind: "condition_unconfirmed", text: `Not confirmed: ${c.label.toLowerCase()} (${basis.citation}).` });
    }
  }
  if (basis.needsInformation && !property.informationUrl?.trim()) {
    out.push({
      kind: "no_information",
      text: "No clear and comprehensive information recorded for this website or app — where people are told about it.",
    });
  }
  if (basis.needsObjection && !property.objectionMechanism?.trim()) {
    out.push({ kind: "no_objection_route", text: `No simple, free way to object recorded for this website or app (${basis.citation}).` });
  }
  if (decision.basis === "statistics" && item.party === "third" && !item.supplierId) {
    out.push({
      kind: "supplier_unknown",
      text: "A third party collects it: record which supplier, so the record shows they only help improve the service.",
    });
  }
  if (decision.basis === "consent" && item.seenBeforeConsent) {
    out.push({ kind: "before_consent", text: "Relies on consent, but the last scan saw it before any consent was given." });
  }
  if ((decision.basis === "consent" || decision.basis === "statistics" || decision.basis === "appearance_function") && item.seenAfterReject) {
    out.push({ kind: "after_reject", text: "The last scan still saw it after the person refused or rejected." });
  }
  return out;
}

/** The gaps as sentences, for one item. */
export function gaps(input: GapInput): string[] {
  return gapsOf(input).map((g) => g.text);
}

/** How each kind of gap reads when counted: one item, or several. */
const GAP_PHRASE: Record<GapKind, [string, string]> = {
  no_basis: ["item with no basis", "items with no basis"],
  basis_none: ["item recorded as having no basis", "items recorded as having no basis"],
  before_consent: ["consent item seen before consent", "consent items seen before consent"],
  after_reject: ["item still seen after Reject", "items still seen after Reject"],
  no_objection_route: [
    "statistics or appearance item with no objection route",
    "statistics or appearance items with no objection route",
  ],
  no_information: ["item with nowhere people are told", "items with nowhere people are told"],
  supplier_unknown: ["third-party statistics item with no supplier", "third-party statistics items with no supplier"],
  condition_unconfirmed: ["item with a condition not confirmed", "items with a condition not confirmed"],
};

/** Most pressing first: what may be unlawful now, then what is unrecorded. */
const GAP_ORDER: GapKind[] = [
  "before_consent",
  "after_reject",
  "basis_none",
  "no_basis",
  "no_objection_route",
  "no_information",
  "supplier_unknown",
  "condition_unconfirmed",
];

export type GapSummary = Array<{ kind: GapKind; items: number; text: string }>;

function fromCounts(counts: Map<GapKind, number>): GapSummary {
  return GAP_ORDER.filter((k) => counts.has(k)).map((kind) => {
    const n = counts.get(kind)!;
    return { kind, items: n, text: `${n} ${GAP_PHRASE[kind][n === 1 ? 0 : 1]}` };
  });
}

/**
 * Gaps counted by kind across many items, each item counted once per kind.
 * For example "3 items with no basis, 1 statistics or appearance item with no
 * objection route".
 */
export function summariseGaps(perItem: Gap[][]): GapSummary {
  const counts = new Map<GapKind, number>();
  for (const list of perItem) {
    for (const kind of new Set(list.map((g) => g.kind))) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return fromCounts(counts);
}

/** Merge summaries from several properties into one. */
export function mergeGapSummaries(summaries: GapSummary[]): GapSummary {
  const counts = new Map<GapKind, number>();
  for (const s of summaries) for (const g of s) counts.set(g.kind, (counts.get(g.kind) ?? 0) + g.items);
  return fromCounts(counts);
}
