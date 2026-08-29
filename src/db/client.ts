import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and start the local database with `docker compose up -d`.",
  );
}

/**
 * Catch a connection string that was never filled in.
 *
 * Documentation abbreviates credentials — `postgres:AMdWY…@host` — and that
 * gets copied verbatim into a terminal. The failure is a password rejection
 * buried under a forty-line query dump, which points at the password being
 * wrong rather than at the string being a placeholder. Cheap to detect, and it
 * turns a confusing error into an obvious one.
 */
const PLACEHOLDER = /[…]|<[^>]*>|xxx+|your[-_]?(password|db|database)/i;
if (PLACEHOLDER.test(connectionString)) {
  const shown = connectionString.replace(/:\/\/([^:]+):[^@]*@/, "://$1:***@");
  throw new Error(
    `DATABASE_URL still contains a placeholder, so it was probably copied from ` +
      `documentation rather than from the database itself.\n\n  ${shown}\n\n` +
      `An ellipsis (…) usually means a password was abbreviated for display. ` +
      `Take the full string from your database provider.`,
  );
}

/**
 * One driver everywhere — local Docker Postgres and the hosted database alike —
 * rather than swapping per environment, so local development exercises the same
 * code path as production.
 *
 * `prepare: false` because a transaction-pooled connection cannot carry prepared
 * statements between them. Harmless on a direct connection, and required the
 * moment anything pooled sits in front.
 *
 * `max: 1` in production because each warm serverless instance holds its own
 * connection, and an unpooled Postgres will run out of them long before the
 * platform runs out of instances.
 */
const client = postgres(connectionString, {
  prepare: false,
  max: process.env.NODE_ENV === "production" ? 1 : 5,
});

export const db = drizzle(client, { schema });
export { client as sql, schema };
export type Db = typeof db;
