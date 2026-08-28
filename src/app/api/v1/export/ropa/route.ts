import { exportRoute } from "@/lib/integration/handler";
import { parseExportQuery } from "@/lib/integration/query";
import { governanceContext } from "@/services/export";

export const dynamic = "force-dynamic";

/**
 * Article 30 records on their own, with the assessments that cover them.
 *
 * A narrower feed than the full context for the common case: generating or
 * refreshing a record of processing activities without pulling the whole
 * governance state.
 */
export const GET = exportRoute({
  kinds: ["waivern_portal", "other"],
  handle: async (connection, url) => {
    const query = parseExportQuery(url);
    const context = await governanceContext({
      organisationId: connection.organisationId,
      ...query,
    });
    return {
      contextVersion: context.contextVersion,
      generatedAt: context.generatedAt,
      organisation: context.organisation,
      scope: context.scope,
      processingActivities: context.processingActivities,
      // The assessments that bear on those activities, so a RoPA can cite the
      // DPIA that covers each entry rather than asserting compliance flatly.
      assessments: context.assessments.map((a) => ({
        reference: a.reference,
        entity: a.entity,
        title: a.title,
        kind: a.kind,
        score: a.score,
        approvedAt: a.approvedAt,
        approvals: a.approvals.filter((g) => g.decision === "approved"),
      })),
      counts: {
        processingActivities: context.counts.processingActivities,
        assessments: context.counts.assessments,
      },
    };
  },
});
