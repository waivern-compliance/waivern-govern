/**
 * What being a public authority changes: the lawful bases it may use for its
 * tasks, and its data protection officer.
 *
 * Pure. A public authority is one within the Data Protection Act 2018 s.7 — an
 * FOIA or FOI(S)A public authority, or a body named in regulations — and only
 * while performing a task carried out in the public interest or in the
 * exercise of its official authority. For processing in the performance of
 * its tasks it may not rely on legitimate interests (UK GDPR Article 6(1)(f))
 * or, since the Data (Use and Access) Act 2025, recognised legitimate
 * interests (6(1)(ea)): the final subparagraph of Article 6(1). It must
 * designate a data protection officer (Article 37(1)(a)), unless it is a court
 * or tribunal acting in its judicial capacity.
 *
 * Nothing here decides whether a body is a public authority or whether a piece
 * of processing is one of its tasks. A person records both; this says what
 * follows.
 */

import type { LawfulBasis } from "@/lib/gdpr/lawful-basis";

/** The data protection officer, as an organisation or entity records it. */
export type Dpo = {
  name: string;
  /** How to reach them: an address, a mailbox or a telephone number. */
  contact: string;
  /** The member who is the DPO, where they use this platform. */
  userId: string | null;
  /** Article 38(3): they report to the highest management level. */
  reportsTo: string | null;
  /** Article 37(7): the contact details are published (in the privacy notice, for example). */
  published: boolean;
};

export class DpoRefused extends Error {}

/** The DPO as it will be stored, or null where none is designated. */
export function cleanDpo(input: {
  name?: string | null;
  contact?: string | null;
  userId?: string | null;
  reportsTo?: string | null;
  published?: boolean;
} | null): Dpo | null {
  const name = input?.name?.trim() ?? "";
  const contact = input?.contact?.trim() ?? "";
  if (!name && !contact && !input?.userId) return null;
  if (!name) throw new DpoRefused("Name the data protection officer.");
  if (!contact) throw new DpoRefused("Give a way to contact the data protection officer.");
  return {
    name,
    contact,
    userId: input?.userId || null,
    reportsTo: input?.reportsTo?.trim() || null,
    published: input?.published ?? false,
  };
}

/** An entity's own DPO where it has one, otherwise the organisation's. */
export function effectiveDpo(organisationDpo: Dpo | null, entityDpo: Dpo | null): Dpo | null {
  return entityDpo ?? organisationDpo;
}

/**
 * Article 37(1)(a): a public authority must have a DPO; so must a competent
 * authority for its Part 3 processing (DPA 2018 s.69), courts acting
 * judicially apart.
 */
export function dpoMissing(
  entity: { publicAuthority: boolean; competentAuthority?: boolean; dpo: Dpo | null },
  organisationDpo: Dpo | null,
): boolean {
  return (entity.publicAuthority || entity.competentAuthority === true) && !effectiveDpo(organisationDpo, entity.dpo);
}

const BARRED: LawfulBasis[] = ["legitimate_interests", "recognised_legitimate_interests"];

/**
 * Article 6(1), final subparagraph: a public authority relying on legitimate
 * interests or recognised legitimate interests for its tasks. Processing the
 * authority records as outside its tasks — some of its own administration,
 * for example — is not caught.
 */
export function barredBasesFor(input: {
  publicAuthority: boolean;
  bases: readonly LawfulBasis[];
  outsidePublicTasks: boolean;
}): LawfulBasis[] {
  if (!input.publicAuthority || input.outsidePublicTasks) return [];
  return input.bases.filter((b) => BARRED.includes(b));
}

/** The workflow stage the DPO takes, in the shipped workflows. */
export const DPO_STAGE_NAME = "Data protection officer";

export function isDpoStage(stageName: string): boolean {
  return stageName.trim().toLowerCase() === DPO_STAGE_NAME.toLowerCase();
}
