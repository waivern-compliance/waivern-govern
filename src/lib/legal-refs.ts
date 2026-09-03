import { db } from "@/db/client";
import { legalReferences } from "@/db/schema";

export type ResolvedRef = {
  citation: string;
  title: string;
  regime: string;
  url: string | null;
  jurisdiction: string | null;
};

/**
 * Reference codes to their citation, for rendering beside questions.
 *
 * Carries the title and the link, not only the citation. "UK GDPR Article
 * 35(7)" tells a reviewer where to look; "Minimum content of a DPIA" tells
 * them why it is cited, and the link lets them check rather than take our
 * word for it.
 */
export async function legalRefMap(): Promise<Record<string, ResolvedRef>> {
  const rows = await db.select().from(legalReferences);
  return Object.fromEntries(
    rows.map((r) => [
      r.code,
      {
        citation: r.citation,
        title: r.title,
        regime: r.regime,
        url: r.url,
        jurisdiction: r.jurisdiction,
      },
    ]),
  );
}
