import { z } from "zod";
import {
  ADM_SPECIAL_CONDITION_KEYS,
  type AdmRecord,
  type AdmSafeguard,
} from "@/lib/gdpr/automated-decisions";
import {
  ANNEX2_CONDITION_KEYS,
  COMPATIBILITY_FACTOR_KEYS,
  COMPATIBILITY_ROUTE_KEYS,
  type FurtherProcessingRecord,
  type ResearchSafeguard,
} from "@/lib/gdpr/further-processing";

/**
 * The Integration API's shape for the Data (Use and Access) Act records:
 * automated decisions, further processing, research and children.
 *
 * The same shape goes both ways, so what the Portal reads back it could send.
 * Keys are camelCase on the wire, as elsewhere in the contract; values are the
 * stored ones. Each group is optional on ingest, and a group left out leaves
 * what was recorded here alone — a push that says nothing about research has
 * no view on it.
 */

const confirmation = z.object({ confirmed: z.boolean(), note: z.string().max(2000).optional() });
const note = z.string().max(4000);

const ADM_WIRE = {
  information: "information",
  representations: "representations",
  humanIntervention: "human_intervention",
  contest: "contest",
} as const satisfies Record<string, AdmSafeguard>;

const RESEARCH_WIRE = {
  noSubstantialHarm: "no_substantial_harm",
  noIndividualDecisions: "no_individual_decisions",
  dataMinimisation: "data_minimisation",
} as const satisfies Record<string, ResearchSafeguard>;

const enumOf = <T extends string>(keys: readonly T[]) => z.enum(keys as [T, ...T[]]);

export const automatedDecisionsWire = z.object({
  solelyAutomated: z.boolean().nullable(),
  specialCategory: z.boolean().nullable().optional(),
  specialCondition: enumOf(ADM_SPECIAL_CONDITION_KEYS).nullable().optional(),
  safeguards: z.object(Object.fromEntries(Object.keys(ADM_WIRE).map((k) => [k, confirmation.optional()]))).strict().optional(),
});

export const furtherProcessingWire = z.object({
  isFurtherProcessing: z.boolean().nullable(),
  originalExternalRef: z.string().min(1).max(200).nullable().optional(),
  originalConsent: z.boolean().nullable().optional(),
  route: enumOf(COMPATIBILITY_ROUTE_KEYS).nullable().optional(),
  annex2Condition: enumOf(ANNEX2_CONDITION_KEYS).nullable().optional(),
  consentUnobtainable: z.boolean().nullable().optional(),
  factors: z.object(Object.fromEntries(COMPATIBILITY_FACTOR_KEYS.map((k) => [k, note.optional()]))).strict().optional(),
  note: note.nullable().optional(),
});

export const researchWire = z.object({
  isResearch: z.boolean().nullable(),
  safeguards: z.object(Object.fromEntries(Object.keys(RESEARCH_WIRE).map((k) => [k, confirmation.optional()]))).strict().optional(),
  approvedMedicalResearch: z.boolean().nullable().optional(),
  art13Exemption: z.boolean().nullable().optional(),
  publicInformationUrl: z.url().max(2000).nullable().optional(),
});

export type AutomatedDecisionsWire = z.infer<typeof automatedDecisionsWire>;
export type FurtherProcessingWire = z.infer<typeof furtherProcessingWire>;
export type ResearchWire = z.infer<typeof researchWire>;

type Confirmation = { confirmed: boolean; note?: string };

function rename<W extends string, I extends string>(
  map: Record<W, I>,
  given: Partial<Record<string, Confirmation | undefined>> | undefined,
): Record<string, Confirmation> {
  const out: Record<string, Confirmation> = {};
  for (const [wire, internal] of Object.entries(map) as Array<[W, I]>) {
    const v = given?.[wire];
    if (v) out[internal] = v;
  }
  return out;
}

function unrename<W extends string, I extends string>(
  map: Record<W, I>,
  stored: Partial<Record<I, Confirmation>> | undefined,
): Partial<Record<W, Confirmation>> {
  const out: Partial<Record<W, Confirmation>> = {};
  for (const [wire, internal] of Object.entries(map) as Array<[W, I]>) {
    const v = stored?.[internal];
    if (v) out[wire] = v;
  }
  return out;
}

/** An incoming automated-decisions group, as `cleanAdm` takes it. */
export function admFromWire(w: AutomatedDecisionsWire) {
  return {
    automatedDecisions: w.solelyAutomated,
    admSpecialCategory: w.specialCategory ?? null,
    admSpecialCondition: w.specialCondition ?? null,
    admSafeguards: rename(ADM_WIRE, w.safeguards),
  };
}

export function admToWire(r: AdmRecord): AutomatedDecisionsWire {
  return {
    solelyAutomated: r.automatedDecisions,
    specialCategory: r.admSpecialCategory,
    specialCondition: r.admSpecialCondition,
    safeguards: unrename(ADM_WIRE, r.admSafeguards),
  };
}

/** The further-processing fields of an incoming group, without the original activity, which is resolved by reference. */
export function furtherFromWire(w: FurtherProcessingWire) {
  return {
    furtherProcessing: w.isFurtherProcessing,
    originalConsent: w.originalConsent ?? null,
    compatibilityRoute: w.route ?? null,
    annex2Condition: w.annex2Condition ?? null,
    consentUnobtainable: w.consentUnobtainable ?? null,
    compatibilityFactors: Object.fromEntries(
      Object.entries(w.factors ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"),
    ),
    compatibilityNote: w.note ?? null,
  };
}

export function furtherToWire(
  r: FurtherProcessingRecord,
  original: { reference: string; externalRef: string | null } | null,
): FurtherProcessingWire & { originalReference: string | null } {
  return {
    isFurtherProcessing: r.furtherProcessing,
    originalReference: original?.reference ?? null,
    originalExternalRef: original?.externalRef ?? null,
    originalConsent: r.originalConsent,
    route: r.compatibilityRoute,
    annex2Condition: r.annex2Condition,
    consentUnobtainable: r.consentUnobtainable,
    factors: r.compatibilityFactors ?? {},
    note: r.compatibilityNote,
  };
}

export function researchFromWire(w: ResearchWire) {
  return {
    research: w.isResearch,
    researchSafeguards: rename(RESEARCH_WIRE, w.safeguards),
    approvedMedicalResearch: w.approvedMedicalResearch ?? null,
    art13Exemption: w.art13Exemption ?? null,
    publicInformationUrl: w.publicInformationUrl ?? null,
  };
}

export function researchToWire(r: FurtherProcessingRecord): ResearchWire {
  return {
    isResearch: r.research,
    safeguards: unrename(RESEARCH_WIRE, r.researchSafeguards),
    approvedMedicalResearch: r.approvedMedicalResearch,
    art13Exemption: r.art13Exemption,
    publicInformationUrl: r.publicInformationUrl,
  };
}
