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
 * One driver for both local Postgres and Neon's pooled endpoint, rather than
 * swapping drivers per environment — the cost is a TCP connection instead of
 * HTTP, the saving is that local development exercises the same code path as
 * production.
 *
 * `prepare: false` is required against a transaction-pooled connection, which is
 * what Neon hands out to serverless functions.
 */
const client = postgres(connectionString, {
  prepare: false,
  max: process.env.NODE_ENV === "production" ? 1 : 5,
});

export const db = drizzle(client, { schema });
export { client as sql, schema };
export type Db = typeof db;
