import PLAYBOOK from "./nist-playbook.json";

/**
 * The NIST AI RMF Playbook's suggestions, per subcategory: what an
 * organisation might do ("Suggested Actions"), and the questions it can answer
 * to show it ("Transparency & Documentation").
 *
 * Voluntary, as NIST says: a menu to borrow from, not a checklist. A NIST
 * framework pack draws its treatments and assessment questions from here.
 *
 * Extracted from the Playbook PDF of 2 August 2024. NIST revises the Playbook
 * online more often than the framework, so check the edition before relying on
 * a suggestion's exact wording. The PDF's nested bullets come through flat: an
 * action ending in a colon introduces the ones after it. The Playbook's
 * "About" text and reading lists are left out.
 */
export const NIST_PLAYBOOK_EDITION = "2024-08-02";

export type PlaybookEntry = {
  /** Lead-in before the first suggested action, where the Playbook has one. */
  actionsIntro: string;
  actions: string[];
  documentationIntro: string;
  documentation: string[];
};

const ENTRIES: Readonly<Record<string, PlaybookEntry>> = PLAYBOOK;

/** The Playbook's suggestions for a subcategory, by NIST identifier: "MEASURE 2.11". */
export function playbookFor(subcategoryId: string): PlaybookEntry | null {
  return ENTRIES[subcategoryId] ?? null;
}

export function playbookSubcategories(): string[] {
  return Object.keys(ENTRIES);
}
