import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationConnections } from "@/db/schema";
import { openSecret, verifyRequest } from "./crypto";

/** The connection kinds that may authenticate an inbound request. */
export const INGEST_KINDS = ["waivern_portal", "har_analyser", "other"] as const;

export type IngestKind = (typeof INGEST_KINDS)[number];

export type AuthedConnection = {
  id: string;
  organisationId: string;
  /**
   * Deliberately narrower than the connection kinds the platform stores. A
   * model provider is outbound configuration, not an inbound credential, and
   * widening this would let a key held for calling a model be used to push
   * records into the registers.
   */
  kind: IngestKind;
  name: string;
  defaultEntityId: string | null;
};

export type AuthFailure = {
  status: 401 | 403 | 413;
  /**
   * Deliberately coarse. An unauthenticated caller learns that the request was
   * rejected, not whether the connection exists, whether it is active, or which
   * part of the signature was wrong — each of those is a probe.
   */
  message: string;
};

/** Bodies larger than this are refused before any parsing or signing work. */
export const MAX_BODY_BYTES = 2 * 1024 * 1024;

const REFUSED: AuthFailure = { status: 401, message: "Rejected" };

/**
 * Authenticate an inbound integration request.
 *
 * The raw body is what gets signed and what gets parsed. Re-serialising JSON
 * before verifying would let a caller sign one document and have another
 * accepted, because two different byte strings can parse to the same object but
 * only one of them was signed.
 */
export async function authenticate(
  request: Request,
): Promise<{ ok: true; connection: AuthedConnection; body: string } | { ok: false; failure: AuthFailure }> {
  const connectionId = request.headers.get("x-waivern-connection");
  const timestamp = request.headers.get("x-waivern-timestamp");
  const signature = request.headers.get("x-waivern-signature");
  if (!connectionId || !timestamp || !signature) return { ok: false, failure: REFUSED };

  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, failure: { status: 413, message: "Payload too large" } };
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return { ok: false, failure: { status: 413, message: "Payload too large" } };
  }

  // A malformed id must not reach the query as a cast error.
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return { ok: false, failure: REFUSED };

  const [connection] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.isActive, true),
      ),
    );
  if (!connection) return { ok: false, failure: REFUSED };

  // A model-provider credential is outbound configuration. Refused here rather
  // than narrowed by a type, so a key held for calling a model cannot be used
  // to push records into the registers even if one were signed correctly.
  if (!INGEST_KINDS.includes(connection.kind as IngestKind)) {
    return { ok: false, failure: REFUSED };
  }

  let secret: string;
  try {
    secret = openSecret({
      ciphertext: connection.secretCiphertext,
      iv: connection.secretIv,
      tag: connection.secretTag,
    });
  } catch {
    // A secret that will not decrypt is a configuration fault, not a caller
    // fault, but saying so would tell an unauthenticated caller the connection
    // is real.
    return { ok: false, failure: REFUSED };
  }

  const url = new URL(request.url);
  const check = verifyRequest({
    secret,
    timestamp,
    signature,
    method: request.method,
    pathWithQuery: url.pathname + url.search,
    body,
  });
  if (!check.ok) return { ok: false, failure: REFUSED };

  await db
    .update(integrationConnections)
    .set({ lastSeenAt: new Date() })
    .where(eq(integrationConnections.id, connection.id));

  return {
    ok: true,
    body,
    connection: {
      id: connection.id,
      organisationId: connection.organisationId,
      kind: connection.kind as IngestKind,
      name: connection.name,
      defaultEntityId: connection.defaultEntityId,
    },
  };
}

/** Restrict an endpoint to the systems it is meant for. */
export function requireKind(
  connection: AuthedConnection,
  kinds: AuthedConnection["kind"][],
): AuthFailure | null {
  if (kinds.includes(connection.kind)) return null;
  return { status: 403, message: "This connection may not use that endpoint" };
}
