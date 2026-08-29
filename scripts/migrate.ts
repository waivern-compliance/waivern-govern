import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { whyUnusable } from "@/lib/db-url";

/**
 * Apply migrations from inside Railway, as a pre-deploy step.
 *
 * Deliberately not `drizzle-kit migrate`: drizzle-kit is a development
 * dependency and need not exist in a production image. This uses only what the
 * application itself depends on at runtime, so the step cannot break because
 * the image was pruned.
 *
 * Run before the new version takes traffic. A failure here should stop the
 * deploy — code that expects a column the database lacks is worse than the old
 * version continuing to serve, which is why this exits non-zero rather than
 * warning and carrying on.
 */
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. On Railway, set it to a reference — " +
      "DATABASE_URL=${{Postgres.DATABASE_URL}} — so it follows the database " +
      "rather than a string somebody pasted.",
  );
  process.exit(1);
}

// Refuse a placeholder, or a private address used from outside Railway,
// naming which it is rather than letting it surface as a DNS error.
const unusable = whyUnusable(connectionString);
if (unusable) {
  console.error(unusable);
  process.exit(1);
}

// One connection, used once and closed. `max: 1` because migrations are
// serial by nature, and a pool would outlive the work.
const client = postgres(connectionString, { max: 1, prepare: false });

async function main() {
  const started = Date.now();
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log(`Migrations applied in ${Date.now() - started}ms.`);
  await client.end();
}

/**
 * Drizzle wraps a driver error in one that says only which query failed, so
 * "Failed query: CREATE SCHEMA" is what surfaces when the real answer is
 * "password authentication failed". Walk the chain and report the cause.
 */
function explain(error: unknown): string {
  const lines: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: string }).code;
    lines.push(code ? `${current.message} (${code})` : current.message);
    current = (current as { cause?: unknown }).cause;
  }
  return lines.join("\n  caused by: ") || String(error);
}

main().catch(async (error) => {
  console.error("Migration failed, so the deploy should not proceed.");
  console.error(explain(error));
  await client.end().catch(() => {});
  process.exit(1);
});
