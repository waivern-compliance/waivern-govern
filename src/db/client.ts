import { AsyncLocalStorage } from "node:async_hooks";
import { sql as drizzleSql } from "drizzle-orm";
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

const base = drizzle(client, { schema });
export type Db = typeof base;

/**
 * The organisation a piece of work is for, and the transaction it runs in.
 *
 * Inside `withOrganisation`, every query made through `db` — by the service
 * that opened it and by anything that service calls — goes to that one
 * transaction, which runs as `govern_tenant` with the organisation set. The
 * database's row-level security then refuses anything of another
 * organisation's, whatever filter a query forgot. Outside it, `db` is the
 * owner's connection, as it always was: sign-in, the platform jobs, migrations
 * and the test fixtures, none of which act for one organisation.
 */
const scope = new AsyncLocalStorage<{ organisationId: string; tx: Db }>();

export const db: Db = new Proxy(base, {
  get(target, property) {
    const real = scope.getStore()?.tx ?? target;
    const value = Reflect.get(real, property, real) as unknown;
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * Run `work` for one organisation, under row-level security.
 *
 * Nested calls for the same organisation share the transaction, so a service
 * calling another stays on one connection — production holds only one. A
 * nested call for a different organisation is a bug, and is refused rather
 * than quietly given the outer organisation's rows.
 *
 * Not for work that waits on something outside, such as a model or a webhook:
 * the transaction would hold the instance's only connection while it waits.
 */
export async function withOrganisation<T>(organisationId: string, work: () => Promise<T>): Promise<T> {
  const current = scope.getStore();
  if (current) {
    if (current.organisationId !== organisationId) {
      throw new Error("Work for one organisation tried to act for another inside the same transaction.");
    }
    return work();
  }
  return base.transaction(async (tx) => {
    await tx.execute(
      drizzleSql`select set_config('app.organisation_id', ${organisationId}, true), set_config('role', 'govern_tenant', true)`,
    );
    return scope.run({ organisationId, tx: tx as unknown as Db }, work);
  });
}

/**
 * One query for one organisation, under row-level security. For the few reads
 * a page or form action makes itself, without a service: a whole action cannot
 * be wrapped, because `redirect()` throws and would roll the transaction back.
 */
export function scoped<T>(organisationId: string, query: () => PromiseLike<T>): Promise<T> {
  return withOrganisation(organisationId, async () => query());
}

/** The organisation the current work is for, if any. */
export function currentOrganisation(): string | null {
  return scope.getStore()?.organisationId ?? null;
}

export { client as sql, schema };
