import { exportRoute } from "@/lib/integration/handler";
import { BadQuery } from "@/lib/integration/query";
import { requestsSummary } from "@/services/data-subject-requests";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["entity", "months"]);

/**
 * How data subject requests were answered, in counts.
 *
 * What the Portal's data subject rights procedure states its response times
 * from. No request leaves through here, only totals. `since` and `limit` are
 * refused rather than ignored: a summary of a delta, or of the first few,
 * would read as a summary of everything.
 */
export const GET = exportRoute({
  kinds: ["waivern_portal", "other"],
  handle: async (connection, url) => {
    const unknown = [...new Set(url.searchParams.keys())].filter((k) => !ALLOWED.has(k));
    if (unknown.length) {
      throw new BadQuery(
        `The requests summary takes only \`entity\` and \`months\` (got ${unknown.map((k) => `\`${k}\``).join(", ")})`,
      );
    }
    const raw = url.searchParams.get("months");
    const months = raw === null ? 12 : Number(raw);
    if (!Number.isInteger(months) || months < 1 || months > 24) {
      throw new BadQuery("`months` must be a whole number between 1 and 24");
    }
    return requestsSummary({
      organisationId: connection.organisationId,
      entities: url.searchParams.getAll("entity"),
      months,
    });
  },
});
