import { ingestRoute } from "@/lib/integration/handler";
import { processingActivityBatch } from "@/lib/integration/contracts";
import { ingestProcessingActivities } from "@/services/ingest";

export const dynamic = "force-dynamic";

/** Article 30 records from the Waivern Compliance Portal. */
export const POST = ingestRoute({
  schema: processingActivityBatch,
  kinds: ["waivern_portal", "other"],
  handle: (connection, input) => ingestProcessingActivities(connection, input.records),
});
