import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertUsable } from "@/lib/db-url";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and start the local database with `docker compose up -d`.",
  );
}

// A placeholder, or a private Railway address used from outside Railway.
assertUsable(connectionString);

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
