import { ingestRoute } from "@/lib/integration/handler";
import { aiUseCaseBatch } from "@/lib/integration/contracts";
import { ingestAiUseCases } from "@/services/ingest";

export const dynamic = "force-dynamic";

/**
 * AI systems from the Waivern Compliance Portal. Describes them; never moves
 * one through its lifecycle or changes who answers for it.
 */
export const POST = ingestRoute({
  schema: aiUseCaseBatch,
  kinds: ["waivern_portal", "other"],
  handle: (connection, input) => ingestAiUseCases(connection, input.records),
});
