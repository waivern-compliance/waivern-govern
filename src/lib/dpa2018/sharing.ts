/**
 * Data sharing between controllers: who a third party is to us, and what a
 * data sharing agreement records.
 *
 * Pure. A data sharing agreement is not required by the UK GDPR the way an
 * Article 28 contract is; the Information Commission's data sharing code of
 * practice (DPA 2018 s.121) expects one for routine sharing, and a public
 * body needs a legal gateway — an enactment that allows or requires the
 * sharing, or its own powers — as well as an Article 6 basis. So nothing here
 * is called a breach: the gaps are what an agreement, or the register, does
 * not yet show.
 */

import type { LawfulBasis } from "@/lib/gdpr/lawful-basis";
import type { Art10Condition, Schedule1Condition } from "./schedule-1";

/** What a third party is to us. Article 28 reaches processors only. */
export const SUPPLIER_ROLES = {
  processor: "Processor: processes data for us, on our instructions",
  controller: "Another controller: we share data with them, or they with us",
  both: "Both: a processor for some data, a controller for other data",
} as const;
export type SupplierRole = keyof typeof SUPPLIER_ROLES;
export const SUPPLIER_ROLE_KEYS = Object.keys(SUPPLIER_ROLES) as SupplierRole[];

export function isSupplierRole(v: unknown): v is SupplierRole {
  return typeof v === "string" && v in SUPPLIER_ROLES;
}

/** Whether Article 28 applies to the relationship. */
export const isProcessor = (role: SupplierRole) => role !== "controller";
/** Whether data may be shared with them as a controller. */
export const isController = (role: SupplierRole) => role !== "processor";

export const SHARING_DIRECTIONS = {
  outgoing: "We share data with them",
  incoming: "They share data with us",
  both: "Both ways",
} as const;
export type SharingDirection = keyof typeof SHARING_DIRECTIONS;

/** Where the power to share comes from. */
export const GATEWAY_KINDS = {
  enactment: "An enactment allows or requires it",
  own_powers: "The parties' own powers or functions",
  not_public: "Not a public body: no gateway is needed",
} as const;
export type GatewayKind = keyof typeof GATEWAY_KINDS;

/** Common gateways, offered as suggestions; the field takes any. */
export const GATEWAY_SUGGESTIONS = [
  "Digital Economy Act 2017, s.35 (public service delivery)",
  "Crime and Disorder Act 1998, s.115",
  "Health and Social Care Act 2012, s.251B (duty to share for individual care)",
  "National Health Service Act 2006, s.251 (control of patient information)",
  "Care Act 2014, s.45 (Safeguarding Adults Boards)",
] as const;

/** One controller's side of the sharing: its Article 6 basis and, where needed, its condition. */
export type PartyBasis = {
  lawfulBases: LawfulBasis[];
  schedule1Condition: Schedule1Condition | null;
  art10Condition: Art10Condition | null;
};

export type SharingAgreementFacts = PartyBasis & {
  purpose: string | null;
  gatewayKind: GatewayKind | null;
  gateway: string | null;
  dataShared: string | null;
  ownerId: string | null;
  signedAt: Date | null;
  reviewDueAt: Date | null;
  endedAt: Date | null;
};

export type SharingAgreementGap =
  | "no_parties"
  | "party_no_basis"
  | "our_no_basis"
  | "no_purpose"
  | "no_gateway"
  | "nothing_shared"
  | "not_signed"
  | "no_review_date"
  | "review_overdue"
  | "nothing_attached"
  | "no_activities"
  | "no_owner";

export const SHARING_GAP_WORDS: Record<SharingAgreementGap, string> = {
  no_parties: "No other party named",
  party_no_basis: "A party with no lawful basis recorded",
  our_no_basis: "Our lawful basis not recorded",
  no_purpose: "No purpose",
  no_gateway: "No legal gateway named",
  nothing_shared: "Does not say what is shared",
  not_signed: "Not signed",
  no_review_date: "No review date",
  review_overdue: "Review overdue",
  nothing_attached: "The agreement itself is not attached",
  no_activities: "Not linked to any processing activity",
  no_owner: "No named owner",
};

/** The two the plan names: shown first, and in amber on the register. */
export const SERIOUS_SHARING_GAPS: SharingAgreementGap[] = ["no_parties", "review_overdue"];

export function sharingAgreementGaps(
  agreement: SharingAgreementFacts,
  parties: ReadonlyArray<Pick<PartyBasis, "lawfulBases">>,
  counts: { attachments: number; activities: number },
  now: Date = new Date(),
): SharingAgreementGap[] {
  if (agreement.endedAt) return [];
  const gaps: SharingAgreementGap[] = [];
  if (parties.length === 0) gaps.push("no_parties");
  else if (parties.some((p) => p.lawfulBases.length === 0)) gaps.push("party_no_basis");
  if (agreement.lawfulBases.length === 0) gaps.push("our_no_basis");
  if (!agreement.purpose?.trim()) gaps.push("no_purpose");
  if (!agreement.gatewayKind || (agreement.gatewayKind !== "not_public" && !agreement.gateway?.trim())) gaps.push("no_gateway");
  if (!agreement.dataShared?.trim()) gaps.push("nothing_shared");
  if (!agreement.signedAt) gaps.push("not_signed");
  if (!agreement.reviewDueAt) gaps.push("no_review_date");
  else if (agreement.reviewDueAt.getTime() <= now.getTime()) gaps.push("review_overdue");
  if (counts.attachments === 0) gaps.push("nothing_attached");
  if (counts.activities === 0) gaps.push("no_activities");
  if (!agreement.ownerId) gaps.push("no_owner");
  return gaps;
}

/**
 * The recipients on a processing activity that are other controllers on the
 * third-party register, with no current agreement covering this activity and
 * that party. Matched by the register's canonical name, as the request
 * register matches them.
 */
export function uncoveredControllers(
  activity: { id: string; recipients: readonly string[] },
  controllers: ReadonlyMap<string, { id: string; name: string }>,
  covered: ReadonlySet<string>,
  canonical: (name: string) => string,
): Array<{ id: string; name: string }> {
  const out = new Map<string, { id: string; name: string }>();
  for (const r of activity.recipients) {
    const c = controllers.get(canonical(r));
    if (c && !covered.has(`${activity.id}:${c.id}`)) out.set(c.id, c);
  }
  return [...out.values()];
}
