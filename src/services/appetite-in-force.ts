import { and, eq } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { riskAppetites } from "@/db/schema";
import { isScope, type AppetiteInForce, type AppetiteLevel } from "@/lib/risk/appetite";
import type { RiskTier } from "@/lib/risk/scale";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * The approved statement for each scope, which is what risks are judged against.
 *
 * On its own so the risk service can read appetite without importing the
 * service that sets it, which itself depends on the risk service.
 */
export async function appetiteInForce(
  organisationId: string,
  tx: Tx | Db = db,
): Promise<AppetiteInForce> {
  const rows = await tx
    .select()
    .from(riskAppetites)
    .where(
      and(eq(riskAppetites.organisationId, organisationId), eq(riskAppetites.status, "approved")),
    );
  const inForce: AppetiteInForce = {};
  for (const r of rows) {
    if (!isScope(r.category)) continue;
    inForce[r.category] = {
      id: r.id,
      level: r.level as AppetiteLevel,
      toleratedTier: r.toleratedTier as RiskTier,
    };
  }
  return inForce;
}
