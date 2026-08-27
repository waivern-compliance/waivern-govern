import { db, sql as pg } from "@/db/client";
import { organisations } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";

/**
 * Recompute every organisation's audit chain from scratch and report breaks.
 * The same routine runs against an exported log, so a client's auditor can
 * check the record without taking our word for it.
 */
async function main() {
  const orgs = await db.select().from(organisations);
  if (orgs.length === 0) console.log("No organisations. Run `pnpm seed` first.");

  let failed = false;
  for (const org of orgs) {
    const result = await verifyAuditChain(org.id);
    if (result.ok) {
      console.log(`✓ ${org.name} — ${result.events} events, head ${result.headHash.slice(0, 16)}…`);
    } else {
      failed = true;
      console.error(`✗ ${org.name} — ${result.reason} at sequence ${result.failedAtSeq} of ${result.events}`);
    }
  }

  await pg.end();
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await pg.end();
  process.exit(1);
});
