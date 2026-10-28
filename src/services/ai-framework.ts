import { eq } from "drizzle-orm";
import { db, type Db, withOrganisation } from "@/db/client";
import { organisations } from "@/db/schema";
import { DEFAULT_AI_FRAMEWORK, frameworkPack, type AiFrameworkId, type AiFrameworkPack } from "@/lib/ai-frameworks";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The AI governance framework the organisation follows. See `lib/ai-frameworks`. */
export async function aiFrameworkOf(organisationId: string, tx: Tx | Db = db): Promise<AiFrameworkId> {
  return withOrganisation(organisationId, async () => {
    const [org] = await tx
      .select({ aiFramework: organisations.aiFramework })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    return org?.aiFramework ?? DEFAULT_AI_FRAMEWORK;
  });
}

/** What that framework supplies: its categories, appetite guidance and treatments. */
export async function aiFrameworkPackOf(organisationId: string, tx: Tx | Db = db): Promise<AiFrameworkPack> {
  return frameworkPack(await aiFrameworkOf(organisationId, tx));
}
