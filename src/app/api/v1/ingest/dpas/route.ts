import { ingestRoute } from "@/lib/integration/handler";
import { dpaBatch } from "@/lib/integration/contracts";
import { ingestDpas } from "@/services/ingest";

export const dynamic = "force-dynamic";

/** Article 28 terms extracted by the Portal's DPA parser. */
export const POST = ingestRoute({
  schema: dpaBatch,
  kinds: ["waivern_portal", "other"],
  handle: (connection, input) => ingestDpas(connection, input.records),
});
