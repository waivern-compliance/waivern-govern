import { db } from "@/db/client";
import { legalReferences } from "@/db/schema";

/** Reference codes to their citation, for rendering beside questions. */
export async function legalRefMap() {
  const rows = await db.select().from(legalReferences);
  return Object.fromEntries(
    rows.map((r) => [r.code, { citation: r.citation, title: r.title, regime: r.regime }]),
  );
}
