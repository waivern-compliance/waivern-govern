import { exportRoute } from "@/lib/integration/handler";
import { parseExportQuery } from "@/lib/integration/query";
import { governanceContext } from "@/services/export";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Everything the Portal needs to generate from, in one document.
 *
 * Approved assessments with who signed and why, the risk register with its
 * acceptances, Article 30 records, suppliers and their DPAs, and an evidence
 * index. Pass `since` to sync incrementally and `entity` to narrow to one legal
 * entity.
 */
export const GET = exportRoute({
  kinds: ["waivern_portal", "other"],
  handle: async (connection, url) =>
    governanceContext({
      organisationId: connection.organisationId,
      ...parseExportQuery(url),
    }),
});
