import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import journal from "../../drizzle/meta/_journal.json";

/**
 * Whether the database is running the schema this build expects.
 *
 * The journal is imported rather than read from disk, so it is bundled with the
 * build and describes exactly the migrations this code was compiled against.
 *
 * This exists because a deployment can be comprehensively broken while looking
 * healthy: the process starts, the port binds, the platform reports online, and
 * every request that touches a table fails. Schema drift is the likeliest cause
 * — migrations are deliberately run by hand, so it is entirely possible to ship
 * code that expects a column nobody has added yet.
 */
export type SchemaState =
  | { ok: true; applied: number; expected: number }
  | {
      ok: false;
      reason: "unreachable" | "behind" | "no_migrations_table";
      applied?: number;
      expected: number;
      detail: string;
    };

export const EXPECTED_MIGRATIONS = journal.entries.length;
export const LATEST_MIGRATION = journal.entries.at(-1)?.tag ?? "none";

export async function schemaState(): Promise<SchemaState> {
  let rows: Array<{ n: number | string }>;
  try {
    rows = await db.execute<{ n: number | string }>(
      sql`select count(*)::int as n from drizzle.__drizzle_migrations`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // No migrations table at all is a different problem from an unreachable
    // database, and the remedy differs: run them, versus fix the connection.
    if (/drizzle|does not exist|relation/i.test(message)) {
      return {
        ok: false,
        reason: "no_migrations_table",
        expected: EXPECTED_MIGRATIONS,
        detail: "No migrations have ever been applied to this database.",
      };
    }
    return {
      ok: false,
      reason: "unreachable",
      expected: EXPECTED_MIGRATIONS,
      detail: message.slice(0, 300),
    };
  }

  const applied = Number(rows[0]?.n ?? 0);
  if (applied < EXPECTED_MIGRATIONS) {
    return {
      ok: false,
      reason: "behind",
      applied,
      expected: EXPECTED_MIGRATIONS,
      detail:
        `The database has ${applied} of ${EXPECTED_MIGRATIONS} migrations. ` +
        `This build expects up to ${LATEST_MIGRATION}. Run pnpm db:migrate.`,
    };
  }

  // More applied than this build knows about means an older deployment is
  // running against a newer database — usually a rollback. Not this build's
  // fault and not necessarily broken, so it is reported rather than failed.
  return { ok: true, applied, expected: EXPECTED_MIGRATIONS };
}
