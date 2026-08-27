import { ingestRoute } from "@/lib/integration/handler";
import { scanBatchIn } from "@/lib/integration/contracts";
import { ingestScan } from "@/services/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * A scan run from the HAR Analyser.
 *
 * The run lands as one piece of evidence with its findings attached, so an
 * assessment can cite the scan rather than four hundred loose observations.
 * Findings keep the scanner's own severity and never become risks on their own
 * — a human converts one explicitly, and that conversion is what the audit
 * trail records.
 */
export const POST = ingestRoute({
  schema: scanBatchIn,
  kinds: ["har_analyser", "other"],
  handle: (connection, input) => ingestScan(connection, input),
});
