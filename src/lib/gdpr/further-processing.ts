/**
 * Further processing and research: UK GDPR Article 8A with Annex 2, Article
 * 13(5)–(7) and Articles 84A–84C, as the Data (Use and Access) Act 2025 left
 * them from 5 February 2026.
 *
 * Pure. Processing for a purpose other than the one data was collected for
 * must be compatible with it. Article 8A(2) lists what to weigh; 8A(3) deems
 * five cases compatible without weighing; and 8A(4) narrows them where the
 * data was collected on consent — then only fresh consent or demonstrating
 * compliance, or an Annex 2 or Article 23 case where consent cannot reasonably
 * be sought. Research is not among them.
 *
 * Research, archiving in the public interest and statistics ("RAS") need the
 * Article 84B(2) safeguards, which 84C says are not met where the processing
 * is likely to cause substantial damage or distress, or is for measures or
 * decisions about a particular person (unless it is approved medical
 * research), and which must include data minimisation. Where further RAS
 * processing makes telling people impossible or disproportionate, Article
 * 13(5) lifts the duty, and 13(7) asks for other measures such as publishing
 * the information.
 *
 * Nothing here decides anything. It names the routes, says which are open,
 * and says what a record does not yet show.
 */

/** Article 8A(3): the cases deemed compatible, and an assessment under 8A(2). */
export type CompatibilityRoute = "consent" | "research" | "compliance" | "annex2" | "article23" | "assessed";

export const COMPATIBILITY_ROUTES: Record<CompatibilityRoute, { label: string; point: string }> = {
  consent: { label: "They consented to the new purpose", point: "Article 8A(3)(a)" },
  research: { label: "Research, archiving or statistics under Article 84B", point: "Article 8A(3)(b)" },
  compliance: { label: "Ensuring or demonstrating compliance with Article 5(1)", point: "Article 8A(3)(c)" },
  annex2: { label: "A condition in Annex 2", point: "Article 8A(3)(d)" },
  article23: { label: "Safeguarding an Article 23(1)(c)–(j) objective, authorised by law", point: "Article 8A(3)(e)" },
  assessed: { label: "Assessed as compatible against the Article 8A(2) factors", point: "Article 8A(2)" },
};

export const COMPATIBILITY_ROUTE_KEYS = Object.keys(COMPATIBILITY_ROUTES) as CompatibilityRoute[];

/** Annex 2: the conditions under which further processing is treated as compatible. */
export type Annex2Condition =
  | "public_task_disclosure"
  | "archiving_disclosure"
  | "public_security"
  | "emergency"
  | "crime"
  | "vital_interests"
  | "safeguarding"
  | "tax"
  | "legal_obligation";

export const ANNEX2_CONDITIONS: Record<Annex2Condition, { label: string; paragraph: string }> = {
  public_task_disclosure: { label: "Disclosure to someone who needs it for a public task", paragraph: "Annex 2, paragraph 1" },
  archiving_disclosure: { label: "Disclosure on request for archiving in the public interest", paragraph: "Annex 2, paragraph 2" },
  public_security: { label: "Protecting public security", paragraph: "Annex 2, paragraph 3" },
  emergency: { label: "Responding to an emergency", paragraph: "Annex 2, paragraph 4" },
  crime: { label: "Detecting, investigating or preventing crime", paragraph: "Annex 2, paragraph 6" },
  vital_interests: { label: "Protecting someone's vital interests", paragraph: "Annex 2, paragraph 7" },
  safeguarding: { label: "Safeguarding a vulnerable individual", paragraph: "Annex 2, paragraph 8" },
  tax: { label: "Assessing or collecting tax or a similar duty", paragraph: "Annex 2, paragraph 11" },
  legal_obligation: { label: "Complying with a legal obligation in an enactment, rule of law or order", paragraph: "Annex 2, paragraph 12" },
};

export const ANNEX2_CONDITION_KEYS = Object.keys(ANNEX2_CONDITIONS) as Annex2Condition[];

/** Article 8A(2): what to weigh when no deemed case applies. */
export type CompatibilityFactor = "link" | "context" | "nature" | "consequences" | "safeguards";

export const COMPATIBILITY_FACTORS: Record<CompatibilityFactor, { label: string; point: string }> = {
  link: { label: "The link between the original purpose and the new one", point: "Article 8A(2)(a)" },
  context: { label: "The context of collection, and the relationship with the people concerned", point: "Article 8A(2)(b)" },
  nature: { label: "The nature of the data, including special category or criminal offence data", point: "Article 8A(2)(c)" },
  consequences: { label: "The possible consequences for them", point: "Article 8A(2)(d)" },
  safeguards: { label: "Safeguards, such as encryption or pseudonymisation", point: "Article 8A(2)(e)" },
};

export const COMPATIBILITY_FACTOR_KEYS = Object.keys(COMPATIBILITY_FACTORS) as CompatibilityFactor[];

/** Article 84C: what the Article 84B(2) safeguards require. */
export type ResearchSafeguard = "no_substantial_harm" | "no_individual_decisions" | "data_minimisation";

export const RESEARCH_SAFEGUARDS: Record<ResearchSafeguard, { label: string; point: string }> = {
  no_substantial_harm: { label: "Not likely to cause anyone substantial damage or substantial distress", point: "Article 84C(2)" },
  no_individual_decisions: { label: "Not for measures or decisions about a particular person", point: "Article 84C(3)" },
  data_minimisation: { label: "Data minimisation measures in place, such as pseudonymisation", point: "Article 84C(4)" },
};

export const RESEARCH_SAFEGUARD_KEYS = Object.keys(RESEARCH_SAFEGUARDS) as ResearchSafeguard[];

export type Confirmations<K extends string> = Partial<Record<K, { confirmed: boolean; note?: string }>>;

/** The further-processing and research record on a processing activity. */
export type FurtherProcessingRecord = {
  furtherProcessing: boolean | null;
  originalActivityId: string | null;
  /** Whether the data was first collected on consent, where no original activity is linked. */
  originalConsent: boolean | null;
  compatibilityRoute: CompatibilityRoute | null;
  annex2Condition: Annex2Condition | null;
  /** Article 8A(4)(b): consent cannot reasonably be expected to be obtained. */
  consentUnobtainable: boolean | null;
  compatibilityFactors: Partial<Record<CompatibilityFactor, string>>;
  compatibilityNote: string | null;
  research: boolean | null;
  researchSafeguards: Confirmations<ResearchSafeguard>;
  approvedMedicalResearch: boolean | null;
  art13Exemption: boolean | null;
  publicInformationUrl: string | null;
};

export class FurtherProcessingRefused extends Error {}

/**
 * Which Article 8A(3) routes are open. Where the data was first collected on
 * consent, 8A(4) closes research outright, and leaves Annex 2 and Article 23
 * open only where consent cannot reasonably be sought. An assessment against
 * the 8A(2) factors stays open either way.
 */
export function compatibilityRoutes(input: {
  originalConsent: boolean | null;
  consentUnobtainable: boolean | null;
}): Record<CompatibilityRoute, { open: boolean; why: string | null }> {
  const consent = input.originalConsent === true;
  const closed = (why: string) => ({ open: false, why });
  const open = { open: true, why: null };
  return {
    consent: open,
    research: consent ? closed("Collected on consent: Article 8A(4) does not let research make the new purpose compatible.") : open,
    compliance: open,
    annex2:
      consent && !input.consentUnobtainable
        ? closed("Collected on consent: Article 8A(4)(b) allows Annex 2 only where consent cannot reasonably be obtained.")
        : open,
    article23:
      consent && !input.consentUnobtainable
        ? closed("Collected on consent: Article 8A(4)(b) allows Article 23 only where consent cannot reasonably be obtained.")
        : open,
    assessed: open,
  };
}

const text = (v: string | null | undefined) => v?.trim() || null;

function confirmations<K extends string>(
  keys: readonly K[],
  given: Record<string, { confirmed: boolean; note?: string }> | undefined,
  what: string,
): Confirmations<K> {
  const unknown = Object.keys(given ?? {}).filter((k) => !(keys as readonly string[]).includes(k));
  if (unknown.length > 0) throw new FurtherProcessingRefused(`Not ${what}: ${unknown.join(", ")}.`);
  const out: Confirmations<K> = {};
  for (const k of keys) {
    const s = given?.[k];
    const note = s?.note?.trim();
    if (s && (s.confirmed || note)) out[k] = { confirmed: s.confirmed, ...(note ? { note } : {}) };
  }
  return out;
}

/**
 * The record as it will be stored. Unknown values are refused, and an answer
 * that depends on another is kept only while that one holds — a route on
 * processing that is not further processing, or an Article 13(5) exemption
 * for something that is not further RAS processing, would read as claims
 * nobody made.
 */
export function cleanFurtherProcessing(input: Partial<Omit<FurtherProcessingRecord, "compatibilityRoute" | "annex2Condition" | "compatibilityFactors" | "researchSafeguards">> & {
  compatibilityRoute?: string | null;
  annex2Condition?: string | null;
  compatibilityFactors?: Record<string, string>;
  researchSafeguards?: Record<string, { confirmed: boolean; note?: string }>;
}): FurtherProcessingRecord {
  const route = input.compatibilityRoute || null;
  if (route && !(route in COMPATIBILITY_ROUTES)) throw new FurtherProcessingRefused(`Not an Article 8A route: ${route}.`);
  const condition = input.annex2Condition || null;
  if (condition && !(condition in ANNEX2_CONDITIONS)) throw new FurtherProcessingRefused(`Not an Annex 2 condition: ${condition}.`);
  const unknownFactors = Object.keys(input.compatibilityFactors ?? {}).filter((k) => !(k in COMPATIBILITY_FACTORS));
  if (unknownFactors.length > 0) throw new FurtherProcessingRefused(`Not an Article 8A(2) factor: ${unknownFactors.join(", ")}.`);
  const url = text(input.publicInformationUrl);
  if (url && !/^https?:\/\/\S+$/i.test(url)) throw new FurtherProcessingRefused("The public information link must be a web address.");

  const further = input.furtherProcessing ?? null;
  const research = input.research ?? null;
  const safeguards = confirmations(RESEARCH_SAFEGUARD_KEYS, input.researchSafeguards, "an Article 84C safeguard");
  const factors: Partial<Record<CompatibilityFactor, string>> = {};
  for (const k of COMPATIBILITY_FACTOR_KEYS) {
    const v = text(input.compatibilityFactors?.[k]);
    if (v) factors[k] = v;
  }

  const furtherFields = further
    ? {
        originalActivityId: input.originalActivityId || null,
        originalConsent: input.originalActivityId ? null : (input.originalConsent ?? null),
        compatibilityRoute: route as CompatibilityRoute | null,
        annex2Condition: route === "annex2" ? (condition as Annex2Condition | null) : null,
        consentUnobtainable: route === "annex2" || route === "article23" ? (input.consentUnobtainable ?? null) : null,
        compatibilityFactors: route === "assessed" ? factors : {},
        compatibilityNote: route ? text(input.compatibilityNote) : null,
      }
    : {
        originalActivityId: null,
        originalConsent: null,
        compatibilityRoute: null,
        annex2Condition: null,
        consentUnobtainable: null,
        compatibilityFactors: {},
        compatibilityNote: null,
      };
  const art13 = further && research ? (input.art13Exemption ?? null) : null;

  return {
    furtherProcessing: further,
    ...furtherFields,
    research,
    researchSafeguards: research ? safeguards : {},
    approvedMedicalResearch: research ? (input.approvedMedicalResearch ?? null) : null,
    art13Exemption: art13,
    publicInformationUrl: art13 ? url : null,
  };
}

export type FurtherProcessingGap =
  | "further_no_route"
  | "further_route_closed"
  | "further_route_incomplete"
  | "research_safeguards"
  | "art13_no_public_information";

export const FURTHER_PROCESSING_GAP_WORDS: Record<FurtherProcessingGap, string> = {
  further_no_route: "Further processing with no compatibility route",
  further_route_closed: "Further processing on a route Article 8A(4) closes for data collected on consent",
  further_route_incomplete: "Further processing route not fully recorded",
  research_safeguards: "Research, archiving or statistics with Article 84C safeguards unconfirmed",
  art13_no_public_information: "Article 13(5) relied on with no public information link",
};

/**
 * What the record does not yet show, most pressing first. `originalConsent`
 * is whether the data was first collected on consent — from the linked
 * original activity's bases where there is one, otherwise as recorded.
 */
export function furtherProcessingGaps(record: FurtherProcessingRecord, originalConsent: boolean | null): FurtherProcessingGap[] {
  const gaps: FurtherProcessingGap[] = [];
  if (record.furtherProcessing) {
    const route = record.compatibilityRoute;
    if (!route) gaps.push("further_no_route");
    else if (!compatibilityRoutes({ originalConsent, consentUnobtainable: record.consentUnobtainable })[route].open) {
      gaps.push("further_route_closed");
    } else if (
      (route === "annex2" && !record.annex2Condition) ||
      (route === "assessed" && COMPATIBILITY_FACTOR_KEYS.some((k) => !record.compatibilityFactors?.[k])) ||
      (route === "article23" && !record.compatibilityNote)
    ) {
      gaps.push("further_route_incomplete");
    }
  }
  if (record.research) {
    const needed = RESEARCH_SAFEGUARD_KEYS.filter(
      // Approved medical research may be for decisions about a particular person (84C(3)).
      (k) => !(k === "no_individual_decisions" && record.approvedMedicalResearch),
    );
    if (needed.some((k) => !record.researchSafeguards?.[k]?.confirmed)) gaps.push("research_safeguards");
  }
  if (record.art13Exemption && !record.publicInformationUrl) gaps.push("art13_no_public_information");
  return gaps;
}

/** One line, for a list or a read-only page. */
export function describeFurtherProcessing(record: FurtherProcessingRecord): string {
  const parts: string[] = [];
  if (record.furtherProcessing === true) {
    parts.push(
      record.compatibilityRoute
        ? `Further processing — ${COMPATIBILITY_ROUTES[record.compatibilityRoute].label} (${COMPATIBILITY_ROUTES[record.compatibilityRoute].point})`
        : "Further processing, route not recorded",
    );
  } else if (record.furtherProcessing === false) parts.push("Not further processing");
  if (record.research === true) parts.push("research, archiving or statistics");
  if (record.art13Exemption) parts.push("Article 13(5) relied on");
  return parts.join(" · ") || "Not yet known";
}
