/**
 * Help content, as data.
 *
 * Kept as a plain module with no server imports so the same topics can be
 * searched in the browser and rendered on the server. Prose in a database
 * would need a migration to fix a typo; prose in a component cannot be
 * searched.
 */

export type HelpSection = {
  heading: string;
  /** Paragraphs. Kept as an array so nothing has to parse markdown. */
  body: string[];
  /** Optional list rendered after the paragraphs. */
  points?: string[];
};

export type HelpTopic = {
  id: string;
  title: string;
  /** One sentence. Shown in search results and in contextual help. */
  summary: string;
  /** The screen this is about, when there is one. */
  path?: string;
  /**
   * Extra words somebody might search for that do not appear in the prose —
   * the legal citation, the old name, the thing they would call it.
   */
  keywords?: string[];
  sections: HelpSection[];
  related?: string[];
};
