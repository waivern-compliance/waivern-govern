/**
 * The rights of a data subject under Part 3 of the Data Protection Act 2018,
 * and how a competent authority may restrict them.
 *
 * Pure. Checked against Part 3 Chapter 3 (ss.43–54) and ss.67–68 on
 * legislation.gov.uk on 31 October 2026 (up to date to 27–31 October 2026).
 *
 * - The rights: access (s.45), rectification (s.46), erasure or restriction
 *   (s.47), and the automated decision safeguards (s.50C). There is no right
 *   to object or to portability under Part 3.
 * - Restrictions: the information a controller gives (s.44(4)), access
 *   (s.45(4)) and the reasons for refusing rectification or erasure (s.48(3))
 *   may be restricted, wholly or partly, as far as and for as long as is
 *   necessary and proportionate, on four grounds. National security was taken
 *   out of these lists on 5 September 2025 (DUAA s.88); it is now the
 *   s.78A exemption.
 * - The person is told of a restriction and why, and of their rights to ask
 *   the Information Commission to check (s.51), to complain to the controller
 *   (s.164A) and to the Commission (s.165), and to go to court (s.167) —
 *   except that the restriction and reasons need not be told where telling
 *   them would undermine its purpose. The reasons are recorded either way and
 *   available to the Commission (ss.44(7), 45(7), 48(6)).
 * - Legal professional privilege (s.45A, from 5 September 2025): an exemption
 *   from ss.44(2) and 45(1), with the same notice, record and exception.
 * - The clock (s.54) runs as the UK GDPR's does since 5 February 2026: a month,
 *   extendable by two for complexity or number with notice and reasons before
 *   the month ends, and paused while a reasonably needed clarification of an
 *   access request is awaited.
 * - A breach (ss.67–68) is notified and communicated as under Articles 33–34;
 *   telling the people affected may be restricted on the same four grounds
 *   (s.68(7)), and then the Commission cannot require it (s.68(8)).
 */

import type { Right } from "@/lib/dsr/statutory";

/** The rights recorded here that Part 3 gives. */
export const PART3_RIGHTS: readonly Right[] = ["access", "rectification", "erasure", "restriction", "automated_decision"];

export const PART3_RIGHT_ARTICLES: Partial<Record<Right, string>> = {
  access: "Section 45",
  rectification: "Section 46",
  erasure: "Section 47",
  restriction: "Section 47",
  automated_decision: "Section 50C",
};

/** What is restricted. */
export const RESTRICTION_PROVISIONS = {
  s44_4: "The information the controller gives (s.44(4))",
  s45_4: "Access to the personal data (s.45(4))",
  s48_3: "The reasons for refusing rectification, erasure or restriction (s.48(3))",
  s45a: "Information covered by legal professional privilege (s.45A)",
} as const;
export type RestrictionProvision = keyof typeof RESTRICTION_PROVISIONS;

/** The four grounds in ss.44(4), 45(4), 48(3) and 68(7), lettered as the Act letters them. */
export const RESTRICTION_GROUNDS = {
  a: "To avoid obstructing an official or legal inquiry, investigation or procedure",
  b: "To avoid prejudicing the prevention, detection, investigation or prosecution of criminal offences, or the execution of criminal penalties",
  c: "To protect public security",
  e: "To protect the rights and freedoms of others",
} as const;
export type RestrictionGround = keyof typeof RESTRICTION_GROUNDS;

export type Part3Restriction = {
  provision: RestrictionProvision;
  /** Empty for s.45A, which has no grounds of its own. */
  grounds: RestrictionGround[];
  /** Confirmed: necessary and proportionate, having regard to the person's fundamental rights and legitimate interests. */
  necessaryAndProportionate: boolean;
  /** Whether the person was told of the restriction and why. */
  personTold: boolean;
  /** Why telling them would undermine the purpose, where they were not. */
  notToldReason: string | null;
};

export class Part3RightsRefused extends Error {}

const PROVISION_SECTION: Record<RestrictionProvision, string> = {
  s44_4: "DPA 2018 s.44(4)",
  s45_4: "DPA 2018 s.45(4)",
  s48_3: "DPA 2018 s.48(3)",
  s45a: "DPA 2018 s.45A",
};

/** The provision a restriction decision cites. */
export function restrictionProvision(r: Pick<Part3Restriction, "provision" | "grounds">): string {
  const base = PROVISION_SECTION[r.provision];
  return r.grounds.length > 0 ? `${base}(${r.grounds.join(", ")})` : base;
}

/**
 * A restriction as it will be recorded, refused where the Act does not allow
 * it as described. The reasons themselves are the decision's rationale.
 */
export function cleanPart3Restriction(input: {
  provision?: unknown;
  grounds?: readonly unknown[];
  necessaryAndProportionate?: unknown;
  personTold?: unknown;
  notToldReason?: unknown;
}): Part3Restriction {
  if (typeof input.provision !== "string" || !(input.provision in RESTRICTION_PROVISIONS)) {
    throw new Part3RightsRefused("Say what is restricted: the information given, access, or the reasons for a refusal; or that it is privileged.");
  }
  const provision = input.provision as RestrictionProvision;
  const grounds = [...new Set(input.grounds ?? [])].filter((g): g is RestrictionGround => typeof g === "string" && g in RESTRICTION_GROUNDS);
  if ((input.grounds ?? []).some((g) => typeof g !== "string" || !(g in RESTRICTION_GROUNDS))) {
    throw new Part3RightsRefused("That is not a ground Part 3 allows. National security is not among them since 5 September 2025: it is the s.78A exemption.");
  }
  if (provision !== "s45a") {
    if (grounds.length === 0) throw new Part3RightsRefused("Choose the ground the restriction rests on.");
    if (input.necessaryAndProportionate !== true) {
      throw new Part3RightsRefused(
        "A restriction is allowed only as far as, and for as long as, it is necessary and proportionate, having regard to the person's fundamental rights and legitimate interests. Confirm it is, or do not restrict.",
      );
    }
  }
  if (input.personTold !== true && input.personTold !== false) {
    throw new Part3RightsRefused("Say whether the person was told of the restriction and why.");
  }
  const notToldReason = typeof input.notToldReason === "string" ? input.notToldReason.trim() : "";
  if (input.personTold === false && !notToldReason) {
    throw new Part3RightsRefused("Say why telling them would undermine the purpose of the restriction; otherwise they must be told, with the reasons.");
  }
  return {
    provision,
    grounds: provision === "s45a" ? [] : (Object.keys(RESTRICTION_GROUNDS) as RestrictionGround[]).filter((g) => grounds.includes(g)),
    necessaryAndProportionate: provision === "s45a" ? false : true,
    personTold: input.personTold,
    notToldReason: input.personTold ? null : notToldReason,
  };
}

/** What a Part 3 refusal or restriction has to tell the person. */
export const PART3_REFUSAL_MUST_SAY =
  "Sections 45(5) and 48(2): the reasons (unless restricted), and that the person may ask the Information Commission to check (s.51), complain to the controller (s.164A) and to the Commission (s.165), and apply to a court (s.167).";

/** Section 68(3) and (7): when the people affected by a Part 3 breach are not told individually. */
export const PART3_COMMUNICATION_EXEMPTIONS = {
  "s.68(3)(a)": "The data was protected — encryption, for example — so unintelligible to anyone unauthorised",
  "s.68(3)(b)": "Subsequent measures mean the high risk is no longer likely to materialise",
  "s.68(3)(c)": "Individual communication would involve disproportionate effort, so the information was made available in another equally effective way",
  "s.68(7)(a)": `Restricted: ${RESTRICTION_GROUNDS.a.charAt(0).toLowerCase()}${RESTRICTION_GROUNDS.a.slice(1)}`,
  "s.68(7)(b)": `Restricted: ${RESTRICTION_GROUNDS.b.charAt(0).toLowerCase()}${RESTRICTION_GROUNDS.b.slice(1)}`,
  "s.68(7)(c)": `Restricted: ${RESTRICTION_GROUNDS.c.charAt(0).toLowerCase()}${RESTRICTION_GROUNDS.c.slice(1)}`,
  "s.68(7)(e)": `Restricted: ${RESTRICTION_GROUNDS.e.charAt(0).toLowerCase()}${RESTRICTION_GROUNDS.e.slice(1)}`,
} as const;
