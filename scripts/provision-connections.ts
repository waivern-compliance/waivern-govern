import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { createConnection, listConnections } from "@/services/connections";

/**
 * Provision the two producing systems for the demo tenant.
 *
 * Secrets are printed once. They are encrypted at rest and cannot be read back,
 * which is the point — losing one means rotating it.
 */
async function main() {
  const [org] = await db.select().from(organisations).where(eq(organisations.slug, "bbc-group"));
  if (!org) throw new Error("Run `pnpm seed` first.");
  const [ps] = await db
    .select()
    .from(entities)
    .where(eq(entities.name, "BBC Public Service"));

  const existing = await listConnections(org.id);
  if (existing.length > 0) {
    console.log("Connections already provisioned:");
    for (const c of existing) console.log(`  ${c.kind}  ${c.id}  ${c.name}`);
    console.log("Rotate a secret to get a new one; they cannot be read back.");
    await pg.end();
    return;
  }

  const actor = { actorKind: "system" as const, actorUserId: null, actorLabel: "provision" };

  const portal = await createConnection({
    organisationId: org.id,
    kind: "waivern_portal",
    name: "Waivern Compliance Portal",
    defaultEntityId: ps.id,
    webhookUrl: process.env.PORTAL_WEBHOOK_URL,
    actor,
  });
  const scanner = await createConnection({
    organisationId: org.id,
    kind: "har_analyser",
    name: "HAR Analyser",
    defaultEntityId: ps.id,
    actor,
  });

  console.log("WAIVERN_PORTAL_CONNECTION=" + portal.id);
  console.log("WAIVERN_PORTAL_SECRET=" + portal.secret);
  console.log("HAR_ANALYSER_CONNECTION=" + scanner.id);
  console.log("HAR_ANALYSER_SECRET=" + scanner.secret);
  await pg.end();
}

main().catch(async (err) => {
  console.error(err);
  await pg.end();
  process.exit(1);
});
