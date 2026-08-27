import { ingestRoute } from "@/lib/integration/handler";
import { vendorBatch } from "@/lib/integration/contracts";
import { ingestVendors } from "@/services/ingest";

export const dynamic = "force-dynamic";

/**
 * Suppliers. Accepted from the scanner as well as the portal: a tracker seen on
 * a page is a third party processing personal data, whether or not procurement
 * knew about it.
 */
export const POST = ingestRoute({
  schema: vendorBatch,
  kinds: ["waivern_portal", "har_analyser", "other"],
  handle: (connection, input) => ingestVendors(connection, input.records),
});
