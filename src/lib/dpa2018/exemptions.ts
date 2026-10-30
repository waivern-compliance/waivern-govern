/**
 * Exemptions a controller may rely on in answering a request: Data
 * Protection Act 2018 Schedules 2 and 3, with what each one asks to be
 * recorded.
 *
 * Pure. Checked against Schedules 2 and 3 on legislation.gov.uk on 30 October
 * 2026 (up to date to 29 October 2026). An exemption applies only to the
 * extent its test is met, to the specific information, never to a whole
 * request because some of it is caught.
 *
 * Three need more than reasons:
 * - The immigration exemption (Sch 2 paras 4–4B, as rewritten by S.I.
 *   2024/342) is for the Secretary of State only, decided case by case, for
 *   each provision separately and afresh each time, weighing the person's
 *   vulnerability, with a substantial risk of prejudice that outweighs the
 *   risk to them and is necessary and proportionate. The decision and its
 *   reasons are recorded, and the person is told unless that would itself
 *   prejudice immigration control.
 * - The serious harm exemption for health data (Sch 3 para 5): a controller
 *   that is not a health professional may rely on it only on the opinion of
 *   the appropriate health professional that the test is met, given within
 *   the six months ending on the day it is relied on, and only if it would
 *   not be reasonable to consult them again (para 5(3)). The same opinion,
 *   that the test is not met, is needed before such a controller discloses
 *   health data the person has not already seen (para 6).
 * - The expectations-and-wishes exemptions (Sch 3 paras 4 and 10) and child
 *   abuse data (para 21) apply only to a request made by someone with
 *   parental responsibility or appointed by a court to manage the person's
 *   affairs.
 */

import type { Right } from "@/lib/dsr/statutory";

/** Articles 15 to 21: what Schedule 2's "listed GDPR provisions" reach among the rights recorded here. */
const LISTED: readonly Right[] = ["access", "rectification", "erasure", "restriction", "portability", "objection"];
const ACCESS: readonly Right[] = ["access"];

type Extra = "immigration" | "health_opinion" | "parent_request" | "child_abuse";

type Exemption = {
  schedule: 2 | 3;
  paragraph: string;
  label: string;
  /** The rights it can restrict, among those this register records. */
  rights: readonly Right[];
  /** What must be shown, in a line. */
  test: string;
  extra?: Extra;
};

export const EXEMPTIONS = {
  sch2_p2: {
    schedule: 2, paragraph: "2", label: "Crime and taxation", rights: LISTED,
    test: "Applying the right would be likely to prejudice preventing, investigating or detecting crime, prosecuting offenders, or assessing or collecting tax.",
  },
  sch2_p3: {
    schedule: 2, paragraph: "3", label: "Crime and taxation: risk assessment systems", rights: ACCESS,
    test: "Data in a risk assessment system for tax or crime, where access would be likely to prejudice its operation.",
  },
  sch2_p4: {
    schedule: 2, paragraph: "4", label: "Immigration (Secretary of State only)",
    rights: ["access", "erasure", "restriction", "objection"],
    test: "A substantial risk of prejudice to effective immigration control that outweighs the risk to the person, necessary and proportionate, decided case by case for each right.",
    extra: "immigration",
  },
  sch2_p7: {
    schedule: 2, paragraph: "7", label: "Functions designed to protect the public", rights: LISTED,
    test: "A relevant function in the Table, where applying the right would be likely to prejudice its proper discharge.",
  },
  sch2_p8: { schedule: 2, paragraph: "8", label: "Audit functions", rights: LISTED, test: "Would be likely to prejudice the audit function." },
  sch2_p9: { schedule: 2, paragraph: "9", label: "Functions of the Bank of England", rights: LISTED, test: "Would be likely to prejudice the function." },
  sch2_p10: {
    schedule: 2, paragraph: "10", label: "Regulatory functions: legal services, the health service and children's services", rights: LISTED,
    test: "Would be likely to prejudice the regulatory function.",
  },
  sch2_p11: { schedule: 2, paragraph: "11", label: "Regulatory functions of certain other bodies", rights: LISTED, test: "Would be likely to prejudice the function." },
  sch2_p13: { schedule: 2, paragraph: "13", label: "Parliamentary privilege", rights: LISTED, test: "Required to avoid an infringement of the privileges of either House." },
  sch2_p14: {
    schedule: 2, paragraph: "14", label: "Judicial appointments, independence and proceedings", rights: LISTED,
    test: "Data processed for judicial appointments, or by a court acting judicially, or where needed to protect judicial independence.",
  },
  sch2_p15: { schedule: 2, paragraph: "15", label: "Crown honours, dignities and appointments", rights: LISTED, test: "Processed for the conferring of a Crown honour, dignity or appointment." },
  sch2_p16: {
    schedule: 2, paragraph: "16", label: "Protection of the rights of others", rights: ACCESS,
    test: "Would disclose information about another identifiable person, who has not consented, where it is not reasonable to disclose without consent (weighing para 16(3)).",
  },
  sch2_p19: { schedule: 2, paragraph: "19", label: "Legal professional privilege", rights: ACCESS, test: "Covered by legal professional privilege, or confidentiality of communications in Scotland." },
  sch2_p20: { schedule: 2, paragraph: "20", label: "Self incrimination", rights: ACCESS, test: "Would reveal evidence of an offence, exposing the controller to proceedings." },
  sch2_p21: { schedule: 2, paragraph: "21", label: "Corporate finance", rights: ACCESS, test: "Would be likely to affect the price of an instrument, or prejudice the UK economy." },
  sch2_p22: { schedule: 2, paragraph: "22", label: "Management forecasts", rights: ACCESS, test: "Management forecasting or planning, where access would be likely to prejudice the business." },
  sch2_p23: { schedule: 2, paragraph: "23", label: "Negotiations", rights: ACCESS, test: "The controller's intentions in negotiations with the person, where access would be likely to prejudice them." },
  sch2_p24: { schedule: 2, paragraph: "24", label: "Confidential references", rights: ACCESS, test: "A reference given in confidence for education, employment, or an appointment." },
  sch2_p25: { schedule: 2, paragraph: "25", label: "Exam scripts and exam marks", rights: ACCESS, test: "Answers recorded by a candidate; marks are subject to the timing rules in para 25(2)–(4)." },
  sch2_p26: {
    schedule: 2, paragraph: "26", label: "Journalistic, academic, artistic and literary purposes", rights: LISTED,
    test: "Reasonably believed that publication is in the public interest and that the right is incompatible with the special purposes.",
  },
  sch2_p27: {
    schedule: 2, paragraph: "27", label: "Research and statistics", rights: ["access", "rectification", "restriction", "objection"],
    test: "The right would prevent or seriously impair the research, and the Article 84C safeguards are met.",
  },
  sch2_p28: {
    schedule: 2, paragraph: "28", label: "Archiving in the public interest", rights: ["access", "rectification", "restriction", "portability", "objection"],
    test: "The right would prevent or seriously impair the archiving, and the Article 84C safeguards are met.",
  },
  sch3_p3: { schedule: 3, paragraph: "3", label: "Health data processed by a court", rights: LISTED, test: "In a report or evidence in the proceedings the paragraph lists, which the court may withhold." },
  sch3_p4: {
    schedule: 3, paragraph: "4", label: "Health data: the person's expectations and wishes", rights: LISTED,
    test: "Given or obtained in the expectation it would not be disclosed to the person making the request, or the person has said it should not be.",
    extra: "parent_request",
  },
  sch3_p5: {
    schedule: 3, paragraph: "5", label: "Health data: serious harm", rights: ACCESS,
    test: "Access would be likely to cause serious harm to the physical or mental health of the person or anyone else.",
    extra: "health_opinion",
  },
  sch3_p9: { schedule: 3, paragraph: "9", label: "Social work data processed by a court", rights: LISTED, test: "In a report or evidence in the proceedings the paragraph lists, which the court may withhold." },
  sch3_p10: {
    schedule: 3, paragraph: "10", label: "Social work data: the person's expectations and wishes", rights: LISTED,
    test: "Given or obtained in the expectation it would not be disclosed to the person making the request, or the person has said it should not be.",
    extra: "parent_request",
  },
  sch3_p11: {
    schedule: 3, paragraph: "11", label: "Social work data: serious harm", rights: ACCESS,
    test: "Access would be likely to prejudice social work by causing serious harm to the physical or mental health of the person or anyone else.",
  },
  sch3_p18: { schedule: 3, paragraph: "18", label: "Education data processed by a court", rights: LISTED, test: "In a report or evidence in the proceedings the paragraph lists, which the court may withhold." },
  sch3_p19: {
    schedule: 3, paragraph: "19", label: "Education data: serious harm", rights: ACCESS,
    test: "Access would be likely to cause serious harm to the physical or mental health of the person or anyone else.",
  },
  sch3_p21: {
    schedule: 3, paragraph: "21", label: "Child abuse data (not Scotland)", rights: ACCESS,
    test: "Disclosing it to the person making the request would not be in the best interests of the person the data is about.",
    extra: "child_abuse",
  },
} as const satisfies Record<string, Exemption>;

export type ExemptionKey = keyof typeof EXEMPTIONS;
export const EXEMPTION_KEYS = Object.keys(EXEMPTIONS) as ExemptionKey[];

export function isExemption(v: unknown): v is ExemptionKey {
  return typeof v === "string" && v in EXEMPTIONS;
}

/** "DPA 2018 Sch. 3 para 5". */
export function exemptionProvision(key: ExemptionKey): string {
  const e = EXEMPTIONS[key];
  return `DPA 2018 Sch. ${e.schedule} para ${e.paragraph}`;
}

/** The person making the request, for the paragraphs that turn on it. */
export const REQUESTER_CAPACITIES = {
  parental_responsibility: "Has parental responsibility for a child (in Scotland, parental responsibilities for a child under 16)",
  court_appointee: "Appointed by a court to manage the affairs of someone who cannot manage them",
} as const;
export type RequesterCapacity = keyof typeof REQUESTER_CAPACITIES;

/** Schedule 3 paras 4(2) and 10(2): what the information was given or obtained on. */
export const EXPECTATION_LIMBS = {
  given_in_expectation: "Provided by the person in the expectation it would not be disclosed to the one asking",
  examination_in_expectation: "Obtained from an examination or investigation they consented to on that expectation",
  expressly_said: "The person has expressly said it should not be disclosed",
} as const;
export type ExpectationLimb = keyof typeof EXPECTATION_LIMBS;

/** Schedule 3 para 2(1): who counts as the appropriate health professional. */
export const APPROPRIATE_PROFESSIONAL = {
  responsible: "Currently or most recently responsible for the person's diagnosis, care or treatment (para 2(1)(a))",
  best_placed: "The best placed of several so responsible (para 2(1)(b))",
  qualified: "Has the experience and qualifications, where none of those is available (para 2(1)(c))",
} as const;
export type AppropriateProfessional = keyof typeof APPROPRIATE_PROFESSIONAL;

/** A health professional's opinion on the serious harm test, recorded on a request. */
export type HealthOpinion = {
  professionalRole: string;
  appropriate: AppropriateProfessional;
  /** The day it was given: an ISO date. */
  givenOn: string;
  /** Whether, in their opinion, the serious harm test is met. */
  testMet: boolean;
};

export type ExemptionDetail = {
  /** Immigration (Sch 2 paras 4A–4B). */
  secretaryOfState?: boolean;
  vulnerability?: string;
  substantialRisk?: boolean;
  outweighs?: boolean;
  necessaryAndProportionate?: boolean;
  personTold?: boolean;
  notToldReason?: string | null;
  /** Health serious harm (Sch 3 para 5). */
  controllerIsHealthProfessional?: boolean;
  opinionDecisionId?: string | null;
  reconsultNotReasonable?: string | null;
  /** Expectations and wishes, and child abuse data (Sch 3 paras 4, 10, 21). */
  requesterCapacity?: RequesterCapacity | null;
  expectation?: ExpectationLimb | null;
  notScotland?: boolean;
};

export class ExemptionRefused extends Error {}

const SIX_MONTHS_BEFORE = (d: Date) => {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  out.setUTCMonth(out.getUTCMonth() - 6);
  return out;
};

/**
 * Whether an opinion may be relied on today (Sch 3 paras 5(3)–(4), 6(3)–(4)):
 * given within the six months ending with the day it is relied on. Whether it
 * would be reasonable to consult again is a judgement, asked separately.
 */
export function opinionInPeriod(opinion: Pick<HealthOpinion, "givenOn">, reliedOn: Date): boolean {
  const given = new Date(`${opinion.givenOn}T00:00:00Z`);
  if (Number.isNaN(given.getTime())) return false;
  const day = new Date(Date.UTC(reliedOn.getUTCFullYear(), reliedOn.getUTCMonth(), reliedOn.getUTCDate()));
  return given.getTime() > SIX_MONTHS_BEFORE(reliedOn).getTime() && given.getTime() <= day.getTime();
}

export function cleanHealthOpinion(input: Partial<Record<keyof HealthOpinion, unknown>>, receivedBy: Date): HealthOpinion {
  const professionalRole = typeof input.professionalRole === "string" ? input.professionalRole.trim() : "";
  if (!professionalRole) throw new ExemptionRefused("Say who gave the opinion: their role, such as the patient's consultant psychiatrist.");
  if (typeof input.appropriate !== "string" || !(input.appropriate in APPROPRIATE_PROFESSIONAL)) {
    throw new ExemptionRefused("Say why they are the appropriate health professional (Schedule 3 paragraph 2(1)).");
  }
  const givenOn = typeof input.givenOn === "string" ? input.givenOn : "";
  const given = new Date(`${givenOn}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(givenOn) || Number.isNaN(given.getTime())) throw new ExemptionRefused("Give the date the opinion was given.");
  if (given.getTime() > receivedBy.getTime()) throw new ExemptionRefused("An opinion cannot be dated in the future.");
  if (typeof input.testMet !== "boolean") throw new ExemptionRefused("Say whether, in their opinion, the serious harm test is met.");
  return { professionalRole, appropriate: input.appropriate as AppropriateProfessional, givenOn, testMet: input.testMet };
}

const yes = (v: unknown) => v === true;
const said = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/**
 * Check an exemption decision against what its paragraph requires, and keep
 * only the detail that paragraph asks for. Refuses, in words for the person
 * deciding, what the law does not allow as recorded.
 */
export function cleanExemption(input: {
  exemption: unknown;
  /** The right this decides, or null for the request as a whole. */
  right: string | null;
  requestRights: readonly string[];
  detail: ExemptionDetail;
  /** The opinions recorded on this request, by decision id. */
  opinions: ReadonlyMap<string, HealthOpinion>;
  reliedOn: Date;
}): { exemption: ExemptionKey; statutoryBasis: string; detail: ExemptionDetail } {
  if (!isExemption(input.exemption)) throw new ExemptionRefused("Choose the exemption relied on.");
  const key = input.exemption;
  const e: Exemption = EXEMPTIONS[key];
  const d = input.detail;

  const allowed = (r: string) => (e.rights as readonly string[]).includes(r);
  if (input.right ? !allowed(input.right) : !input.requestRights.some(allowed)) {
    throw new ExemptionRefused(
      `${exemptionProvision(key)} does not restrict ${input.right ? "that right" : "any right this request invokes"}. It reaches ${e.rights.length === 1 ? "only the right of access" : "Articles 15 to 21 only as far as its paragraph says"}.`,
    );
  }

  let detail: ExemptionDetail = {};
  if (e.extra === "immigration") {
    if (!yes(d.secretaryOfState)) throw new ExemptionRefused("Only the Secretary of State may rely on the immigration exemption (Schedule 2 paragraph 4).");
    if (!input.right) {
      throw new ExemptionRefused("Decide the immigration exemption for each right separately (paragraph 4A(2)): choose the right this decision is about.");
    }
    if (!said(d.vulnerability)) throw new ExemptionRefused("Say how the person's vulnerability, rights and the duties in paragraph 4A(3) were considered.");
    if (!yes(d.substantialRisk) || !yes(d.outweighs) || !yes(d.necessaryAndProportionate)) {
      throw new ExemptionRefused(
        "Paragraph 4A(4) allows it only where there is a substantial risk of prejudice, that risk outweighs the risk to the person, and applying the exemption is necessary and proportionate. Confirm all three, or do not apply it.",
      );
    }
    if (d.personTold !== true && d.personTold !== false) throw new ExemptionRefused("Say whether the person was told of the decision (paragraph 4B(2)).");
    if (d.personTold === false && !said(d.notToldReason)) {
      throw new ExemptionRefused("Say why telling them would prejudice immigration control; otherwise paragraph 4B(2) requires they be told.");
    }
    detail = {
      secretaryOfState: true,
      vulnerability: d.vulnerability!.trim(),
      substantialRisk: true,
      outweighs: true,
      necessaryAndProportionate: true,
      personTold: d.personTold,
      notToldReason: d.personTold ? null : d.notToldReason!.trim(),
    };
  } else if (e.extra === "health_opinion") {
    if (d.controllerIsHealthProfessional !== true && d.controllerIsHealthProfessional !== false) {
      throw new ExemptionRefused("Say whether the controller deciding is itself a health professional (Schedule 3 paragraph 5(2)).");
    }
    if (d.controllerIsHealthProfessional) {
      detail = { controllerIsHealthProfessional: true };
    } else {
      const opinion = d.opinionDecisionId ? input.opinions.get(d.opinionDecisionId) : undefined;
      if (!opinion) {
        throw new ExemptionRefused(
          "A controller that is not a health professional may withhold health data for serious harm only on the opinion of the appropriate health professional (paragraph 5(2)). Record the opinion first, then rely on it here.",
        );
      }
      if (!opinion.testMet) throw new ExemptionRefused("That opinion is that the serious harm test is not met, so the exemption is not available.");
      if (!opinionInPeriod(opinion, input.reliedOn)) {
        throw new ExemptionRefused(
          `That opinion, given on ${opinion.givenOn}, is older than the six months ending today, so it does not count (paragraph 5(3)–(4)). Consult them again.`,
        );
      }
      if (!said(d.reconsultNotReasonable)) {
        throw new ExemptionRefused(
          "An opinion within the six months still does not count if it would be reasonable to consult them again (paragraph 5(3)(b)). Say why it would not be.",
        );
      }
      detail = { controllerIsHealthProfessional: false, opinionDecisionId: d.opinionDecisionId, reconsultNotReasonable: d.reconsultNotReasonable!.trim() };
    }
  } else if (e.extra === "parent_request" || e.extra === "child_abuse") {
    if (!d.requesterCapacity || !(d.requesterCapacity in REQUESTER_CAPACITIES)) {
      throw new ExemptionRefused(
        `${exemptionProvision(key)} applies only to a request made by someone with parental responsibility, or appointed by a court to manage the person's affairs. Say which.`,
      );
    }
    detail = { requesterCapacity: d.requesterCapacity };
    if (e.extra === "parent_request") {
      if (!d.expectation || !(d.expectation in EXPECTATION_LIMBS)) {
        throw new ExemptionRefused("Say which limb applies: what it was given or obtained in the expectation of, or that the person said it should not be disclosed.");
      }
      detail.expectation = d.expectation;
    } else {
      if (!yes(d.notScotland)) throw new ExemptionRefused("Paragraph 21 does not apply in Scotland. Confirm the request is not in Scotland.");
      detail.notScotland = true;
    }
  }

  return { exemption: key, statutoryBasis: exemptionProvision(key), detail };
}

/**
 * Sch 3 para 6: a controller that is not a health professional may not
 * disclose health data in answer to an access request unless it has an
 * opinion, within the six months, that the serious harm test is not met —
 * except what the person has already seen or knows. Which opinions on a
 * request would allow it, today.
 */
export function disclosureOpinions(opinions: ReadonlyMap<string, HealthOpinion>, on: Date): string[] {
  return [...opinions].filter(([, o]) => !o.testMet && opinionInPeriod(o, on)).map(([id]) => id);
}
