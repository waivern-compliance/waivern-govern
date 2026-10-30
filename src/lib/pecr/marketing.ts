/**
 * What UK PECR requires of electronic direct marketing, expressed once.
 *
 * Pure, like the cookie module beside it. It says which bases each channel can
 * rely on, what each basis needs, and what a recorded decision is still
 * missing. It decides nothing: a named person records the basis a campaign or
 * channel relies on, and why.
 *
 * - Email and text (reg 22) to individual subscribers need consent, or the
 *   soft opt-in (reg 22(3)), or since 5 February 2026 the charity soft opt-in
 *   (reg 22(3A), inserted by the Data (Use and Access) Act 2025 s.114).
 *   Corporate subscribers are outside reg 22, though reg 23 still applies.
 * - Live calls (reg 21) may go to numbers screened against the TPS and CTPS,
 *   less anybody who has told the caller not to call, or to people who have
 *   consented. Claims management and pension calls need consent (regs 21A, 21B).
 * - Automated calls (reg 19) need consent.
 * - Every email or text must say who sent it and give a valid address to opt
 *   out (reg 23).
 */

export type MarketingChannel = "email" | "sms" | "live_call" | "automated_call";

export type MarketingRecipients = "individuals" | "businesses" | "both";

export type MarketingBasis =
  | "consent"
  | "soft_opt_in"
  | "charity_soft_opt_in"
  | "corporate_subscriber"
  | "screened_calls"
  | "none";

export type MarketingConditionKey =
  | "consent_specific"
  | "consent_recorded"
  | "consent_withdrawable"
  | "obtained_in_sale"
  | "similar_products"
  | "charitable_purposes"
  | "interest_or_support"
  | "refusal_at_collection"
  | "refusal_every_message"
  | "corporate_only"
  | "identity_and_opt_out"
  | "no_prior_objection"
  | "caller_identified"
  | "not_claims_or_pensions";

export type MarketingCondition = { key: MarketingConditionKey; label: string };

export const CHANNELS: Record<MarketingChannel, { label: string; regulation: string }> = {
  email: { label: "Email", regulation: "PECR reg 22" },
  sms: { label: "Text message", regulation: "PECR reg 22" },
  live_call: { label: "Live phone calls", regulation: "PECR reg 21" },
  automated_call: { label: "Automated calls", regulation: "PECR reg 19" },
};

export const CHANNEL_KEYS = Object.keys(CHANNELS) as MarketingChannel[];

export const RECIPIENTS: Record<MarketingRecipients, string> = {
  individuals: "Individuals, sole traders and ordinary partnerships",
  businesses: "Companies, LLPs and public bodies only",
  both: "Both",
};

const IDENTITY: MarketingCondition = {
  key: "identity_and_opt_out",
  label: "Every message says who it is from and gives a valid address to opt out (reg 23)",
};
const REFUSE_AT_COLLECTION: MarketingCondition = {
  key: "refusal_at_collection",
  label: "People were given a simple, free way to refuse when their details were collected",
};
const REFUSE_EVERY_MESSAGE: MarketingCondition = {
  key: "refusal_every_message",
  label: "Every message since gives the same simple, free way to refuse",
};
const EMAIL_AND_TEXT: readonly MarketingChannel[] = ["email", "sms"];

export const MARKETING_BASES: Record<
  MarketingBasis,
  { label: string; citation: string; summary: string; channels: readonly MarketingChannel[]; conditions: MarketingCondition[] }
> = {
  consent: {
    label: "Consent",
    citation: "PECR regs 19, 21 and 22; UK GDPR art 4(11)",
    summary: "Each person agreed, specifically and on the record, to this kind of marketing from this organisation.",
    channels: ["email", "sms", "live_call", "automated_call"],
    conditions: [
      { key: "consent_specific", label: "Given to this organisation by name, for this kind of message" },
      { key: "consent_recorded", label: "When and how each person consented is recorded" },
      { key: "consent_withdrawable", label: "It is as easy to withdraw as it was to give" },
    ],
  },
  soft_opt_in: {
    label: "Soft opt-in",
    citation: "PECR reg 22(3)",
    summary:
      "Details got from a customer in a sale or negotiations for one, used for this organisation's own similar products, with a simple free way to refuse at the start and in every message.",
    channels: EMAIL_AND_TEXT,
    conditions: [
      { key: "obtained_in_sale", label: "The details were got in the course of a sale, or negotiations for one" },
      { key: "similar_products", label: "It markets only this organisation's own similar products and services" },
      REFUSE_AT_COLLECTION,
      REFUSE_EVERY_MESSAGE,
    ],
  },
  charity_soft_opt_in: {
    label: "Charity soft opt-in",
    citation: "PECR reg 22(3A)",
    summary:
      "A registered charity, marketing solely to further its charitable purposes to people who expressed interest in or offered or gave support, with a simple free way to refuse at the start and in every message.",
    channels: EMAIL_AND_TEXT,
    conditions: [
      { key: "charitable_purposes", label: "Its sole purpose is furthering the charity's charitable purposes" },
      { key: "interest_or_support", label: "The details were got when the person expressed interest in, or offered or gave, support" },
      REFUSE_AT_COLLECTION,
      REFUSE_EVERY_MESSAGE,
    ],
  },
  corporate_subscriber: {
    label: "Corporate subscribers only",
    citation: "PECR regs 22(2) and 23",
    summary:
      "Sent only to companies, LLPs and public bodies, which regulation 22 does not cover. Regulation 23 still applies, and UK GDPR still applies to a named employee's address.",
    channels: EMAIL_AND_TEXT,
    conditions: [
      { key: "corporate_only", label: "Never sent to individuals, sole traders or ordinary partnerships" },
    ],
  },
  screened_calls: {
    label: "Screened against the TPS and CTPS",
    citation: "PECR reg 21",
    summary:
      "Numbers screened against the Telephone and Corporate Telephone Preference Services within the last 28 days, less anyone who has told this organisation not to call.",
    channels: ["live_call"],
    conditions: [
      { key: "no_prior_objection", label: "Nobody who has told this organisation not to call is called" },
      { key: "caller_identified", label: "Each call says who is calling and gives an address or freephone number on request (reg 24)" },
      { key: "not_claims_or_pensions", label: "Not about claims management or pensions, which need consent (regs 21A, 21B)" },
    ],
  },
  none: {
    label: "No basis",
    citation: "PECR regs 19–22",
    summary: "Nothing in PECR covers it. Stop it, or put it on a basis that does.",
    channels: ["email", "sms", "live_call", "automated_call"],
    conditions: [],
  },
};

export const MARKETING_BASIS_KEYS = Object.keys(MARKETING_BASES) as MarketingBasis[];

/**
 * What a basis needs on a channel. Regulation 23 applies to every marketing
 * email and text, whatever it relies on, so it is added for those channels.
 */
export function conditionsOf(basis: MarketingBasis, channel: MarketingChannel): MarketingCondition[] {
  const own = MARKETING_BASES[basis].conditions;
  return basis !== "none" && EMAIL_AND_TEXT.includes(channel) ? [...own, IDENTITY] : own;
}

/** The bases a channel can rely on, given who it reaches. */
export function basesFor(channel: MarketingChannel, recipients: MarketingRecipients): MarketingBasis[] {
  return MARKETING_BASIS_KEYS.filter(
    (b) => MARKETING_BASES[b].channels.includes(channel) && (b !== "corporate_subscriber" || recipients === "businesses"),
  );
}

/** How long a TPS screening holds. The TPS asks callers to screen at least every 28 days. */
export const TPS_SCREENING_DAYS = 28;

const DAY = 86_400_000;

export function tpsDueAt(screenedAt: Date | null): Date | null {
  return screenedAt ? new Date(screenedAt.getTime() + TPS_SCREENING_DAYS * DAY) : null;
}

export type MarketingGapKind =
  | "no_basis"
  | "basis_none"
  | "basis_not_available"
  | "condition_unconfirmed"
  | "no_charity_number"
  | "tps_never"
  | "tps_stale"
  | "objection_overridden"
  | "no_processing_activity";

export type MarketingGap = { kind: MarketingGapKind; text: string };

export type MarketingGapInput = {
  activity: {
    channel: MarketingChannel;
    recipients: MarketingRecipients;
    status: string;
    processingActivityId: string | null;
    charityNumber: string | null;
    tpsScreenedAt: Date | null;
  };
  decision: { basis: MarketingBasis; conditions: Partial<Record<MarketingConditionKey, boolean>> } | null;
  /** Objections to direct marketing overridden in the last twelve months. Article 21(3) makes each one unlawful. */
  objectionsOverridden: number;
};

/** What the record does not yet show. An activity that has ended has nothing left to show. */
export function marketingGapsOf(input: MarketingGapInput, now = new Date()): MarketingGap[] {
  const { activity, decision } = input;
  if (activity.status === "ended") return [];
  const out: MarketingGap[] = [];
  if (input.objectionsOverridden > 0) {
    out.push({
      kind: "objection_overridden",
      text: `${input.objectionsOverridden} objection${input.objectionsOverridden === 1 ? "" : "s"} to direct marketing overridden in the last year. Article 21(3) makes the objection absolute.`,
    });
  }
  if (!activity.processingActivityId) {
    out.push({ kind: "no_processing_activity", text: "Not linked to its processing activity in the ROPA, so objections cannot be counted against it." });
  }
  if (!decision) {
    out.push({ kind: "no_basis", text: "No basis recorded." });
    return mostPressingFirst(out);
  }
  if (decision.basis === "none") {
    out.push({ kind: "basis_none", text: "Recorded as having no basis: it should stop." });
    return mostPressingFirst(out);
  }
  if (!basesFor(activity.channel, activity.recipients).includes(decision.basis)) {
    out.push({
      kind: "basis_not_available",
      text: `${MARKETING_BASES[decision.basis].label} is not available for ${CHANNELS[activity.channel].label.toLowerCase()}${decision.basis === "corporate_subscriber" ? " that reaches individuals" : ""}.`,
    });
  }
  for (const c of conditionsOf(decision.basis, activity.channel)) {
    if (!decision.conditions[c.key]) out.push({ kind: "condition_unconfirmed", text: `Not confirmed: ${c.label.toLowerCase()}.` });
  }
  if (decision.basis === "charity_soft_opt_in" && !activity.charityNumber?.trim()) {
    out.push({ kind: "no_charity_number", text: "No charity registration number recorded. Only registered charities can use the charity soft opt-in." });
  }
  if (decision.basis === "screened_calls") {
    const due = tpsDueAt(activity.tpsScreenedAt);
    if (!due) out.push({ kind: "tps_never", text: "No TPS and CTPS screening recorded." });
    else if (due.getTime() < now.getTime()) {
      out.push({ kind: "tps_stale", text: `Last screened against the TPS and CTPS more than ${TPS_SCREENING_DAYS} days ago.` });
    }
  }
  return mostPressingFirst(out);
}

const GAP_PHRASE: Record<MarketingGapKind, [string, string]> = {
  objection_overridden: ["activity overriding objections to direct marketing", "activities overriding objections to direct marketing"],
  basis_none: ["activity recorded as having no basis", "activities recorded as having no basis"],
  basis_not_available: ["activity on a basis its channel cannot use", "activities on a basis their channel cannot use"],
  tps_stale: ["call activity overdue for TPS screening", "call activities overdue for TPS screening"],
  tps_never: ["call activity never screened against the TPS", "call activities never screened against the TPS"],
  no_basis: ["activity with no basis", "activities with no basis"],
  no_charity_number: ["activity with no charity number", "activities with no charity number"],
  condition_unconfirmed: ["activity with a condition not confirmed", "activities with a condition not confirmed"],
  no_processing_activity: ["activity not linked to the ROPA", "activities not linked to the ROPA"],
};

/** Most pressing first. */
const GAP_ORDER: MarketingGapKind[] = [
  "objection_overridden",
  "basis_none",
  "basis_not_available",
  "tps_stale",
  "tps_never",
  "no_basis",
  "no_charity_number",
  "condition_unconfirmed",
  "no_processing_activity",
];

function mostPressingFirst(gaps: MarketingGap[]): MarketingGap[] {
  return [...gaps].sort((a, b) => GAP_ORDER.indexOf(a.kind) - GAP_ORDER.indexOf(b.kind));
}

export type MarketingGapSummary = Array<{ kind: MarketingGapKind; activities: number; text: string }>;

/** Each activity counted once per kind of gap. */
export function summariseMarketingGaps(perActivity: MarketingGap[][]): MarketingGapSummary {
  const counts = new Map<MarketingGapKind, number>();
  for (const gaps of perActivity) {
    for (const kind of new Set(gaps.map((g) => g.kind))) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return GAP_ORDER.filter((k) => counts.has(k)).map((kind) => {
    const n = counts.get(kind)!;
    return { kind, activities: n, text: `${n} ${GAP_PHRASE[kind][n === 1 ? 0 : 1]}` };
  });
}

/** The conditions confirmed, keeping only those the basis needs on the channel. */
export function conditionsFor(
  basis: MarketingBasis,
  channel: MarketingChannel,
  confirmed: Iterable<string>,
): Partial<Record<MarketingConditionKey, boolean>> {
  const wanted = new Set(conditionsOf(basis, channel).map((c) => c.key));
  const out: Partial<Record<MarketingConditionKey, boolean>> = {};
  for (const k of confirmed) if (wanted.has(k as MarketingConditionKey)) out[k as MarketingConditionKey] = true;
  return out;
}
