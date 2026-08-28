import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { authenticate, requireKind, type AuthedConnection } from "./auth";
import { BadQuery } from "./query";

/**
 * The shape every ingest endpoint shares.
 *
 * Authenticate, check the connection is allowed this endpoint, validate, then
 * hand over. Doing it in one place means a new endpoint cannot accidentally
 * ship without the signature check.
 */
export function ingestRoute<T>(config: {
  schema: ZodType<T>;
  kinds: AuthedConnection["kind"][];
  handle: (connection: AuthedConnection, input: T) => Promise<unknown>;
}) {
  return async function POST(request: Request) {
    const auth = await authenticate(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure.message },
        { status: auth.failure.status },
      );
    }

    const wrongKind = requireKind(auth.connection, config.kinds);
    if (wrongKind) {
      return NextResponse.json({ error: wrongKind.message }, { status: wrongKind.status });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(auth.body);
    } catch {
      return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
    }

    const parsed = config.schema.safeParse(parsedJson);
    if (!parsed.success) {
      // Validation detail is safe to return: the caller is authenticated by
      // this point, and a contract error they cannot see is a contract error
      // they cannot fix.
      return NextResponse.json(
        {
          error: "The payload does not match the contract",
          issues: parsed.error.issues.slice(0, 25).map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 422 },
      );
    }

    try {
      const result = await config.handle(auth.connection, parsed.data);
      return NextResponse.json(result, { status: 200 });
    } catch (e) {
      console.error("ingest failed", e);
      return NextResponse.json({ error: "Could not process the batch" }, { status: 500 });
    }
  };
}


/**
 * A read endpoint.
 *
 * Same authentication as ingest — the signature covers the method and the full
 * path including the query string, so an export signed for one entity cannot be
 * replayed for another.
 */
export function exportRoute(config: {
  kinds: AuthedConnection["kind"][];
  handle: (connection: AuthedConnection, url: URL) => Promise<unknown>;
}) {
  return async function GET(request: Request) {
    const auth = await authenticate(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.failure.message },
        { status: auth.failure.status },
      );
    }

    const wrongKind = requireKind(auth.connection, config.kinds);
    if (wrongKind) {
      return NextResponse.json({ error: wrongKind.message }, { status: wrongKind.status });
    }

    try {
      const result = await config.handle(auth.connection, new URL(request.url));
      return NextResponse.json(result, {
        status: 200,
        // Governance state changes when people decide things, not on a timer.
        // A cached export could hand the Portal a decision that has since been
        // withdrawn.
        headers: { "cache-control": "no-store" },
      });
    } catch (e) {
      // A malformed query is the caller's fault and they can fix it; anything
      // else is ours and they should not be told the internals.
      if (e instanceof BadQuery) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      console.error("export failed", e);
      return NextResponse.json({ error: "Could not build the export" }, { status: 500 });
    }
  };
}
