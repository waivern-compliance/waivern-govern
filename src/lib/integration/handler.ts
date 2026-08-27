import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { authenticate, requireKind, type AuthedConnection } from "./auth";

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
