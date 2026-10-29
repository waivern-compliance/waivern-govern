import { connectionActor } from "@/lib/integration/auth";
import { exportRoute } from "@/lib/integration/handler";
import { BadQuery } from "@/lib/integration/query";
import { aiProfileExport } from "@/services/ai-profile";

export const dynamic = "force-dynamic";

/**
 * The organisation's NIST AI RMF profile: current against target for each of
 * the 72 subcategories, with what Govern holds towards each.
 *
 * Organisation-wide and always whole, so it takes no query. `entity`, `since`
 * and `limit` are refused rather than ignored: a caller that asked for a slice
 * and silently got everything, or got a slice that reads as everything, could
 * not tell.
 */
export const GET = exportRoute({
  kinds: ["waivern_portal", "other"],
  handle: async (connection, url) => {
    const given = [...new Set(url.searchParams.keys())];
    if (given.length) {
      throw new BadQuery(`The AI RMF profile takes no query parameters (got ${given.map((k) => `\`${k}\``).join(", ")})`);
    }
    return aiProfileExport({ organisationId: connection.organisationId, actor: connectionActor(connection) });
  },
});
