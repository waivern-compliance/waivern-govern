import { and, eq } from "drizzle-orm";
import { db, type Db, withOrganisation } from "@/db/client";
import { riskAppetites } from "@/db/schema";
import { isKnownCategory } from "@/lib/ai-frameworks";
import { type AppetiteInForce, type AppetiteLevel } from "@/lib/risk/appetite";
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
  return withOrganisation(organisationId, async () => {
    const rows = await tx
      .select()
      .from(riskAppetites)
      .where(
        and(eq(riskAppetites.organisationId, organisationId), eq(riskAppetites.status, "approved")),
      );
    const inForce: AppetiteInForce = {};
    for (const r of rows) {
      // Every framework's categories, not only the one followed now: a
      // statement signed off under one framework still holds until its
      // replacement under the next is approved.
      if (r.category !== "default" && !isKnownCategory(r.category)) continue;
      inForce[r.category] = {
        id: r.id,
        level: r.level as AppetiteLevel,
        toleratedTier: r.toleratedTier as RiskTier,
      };
    }
    return inForce;
  });
}
