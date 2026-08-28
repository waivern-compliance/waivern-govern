import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Shared secrets for signed ingest.
 *
 * HMAC verification needs the secret in the clear at request time, so unlike a
 * contributor-link token it cannot simply be hashed. It is encrypted at rest
 * instead, with a key held outside the database — a dump of the tables alone
 * does not yield working credentials.
 */

const ALGORITHM = "aes-256-gcm";

function key(): Buffer {
  const raw = process.env.INTEGRATION_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_KEY is not set. Generate one with: openssl rand -base64 32",
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("INTEGRATION_KEY must be 32 bytes, base64 encoded");
  }
  return buf;
}

export type SealedSecret = { ciphertext: string; iv: string; tag: string };

export function sealSecret(plaintext: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function openSecret(sealed: SealedSecret): string {
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function newSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * The exact string a signature covers.
 *
 * Four parts, newline separated: timestamp, method, path with query, body.
 *
 * The timestamp is inside the signed material rather than merely alongside it,
 * so a captured body cannot be replayed under a fresh one. The method and path
 * are in there too, so a signature is bound to the endpoint it was made for — a
 * captured request cannot be redirected at a different endpoint whose schema
 * the same body happens to satisfy. And it gives a GET, which has no body,
 * something specific to sign.
 */
export function canonicalRequest(
  method: string,
  pathWithQuery: string,
  body: string,
): string {
  return [method.toUpperCase(), pathWithQuery, body].join("\n");
}

export function signPayload(
  secret: string,
  timestamp: string,
  canonical: string,
): string {
  return createHmac("sha256", secret).update(`${timestamp}.${canonical}`).digest("hex");
}

/** Convenience for callers: sign a whole request in one step. */
export function signRequest(input: {
  secret: string;
  timestamp: string;
  method: string;
  pathWithQuery: string;
  body?: string;
}): string {
  return signPayload(
    input.secret,
    input.timestamp,
    canonicalRequest(input.method, input.pathWithQuery, input.body ?? ""),
  );
}

/** Constant-time comparison, so a wrong signature leaks nothing through timing. */
export function signatureMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** How far out of date a signature may be before it is refused. */
export const MAX_CLOCK_SKEW_SECONDS = 300;

export type SignatureCheck =
  | { ok: true }
  | { ok: false; reason: "missing_headers" | "stale_timestamp" | "bad_signature" };

export function verifyRequest(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  method: string;
  pathWithQuery: string;
  body: string;
  now?: number;
}): SignatureCheck {
  if (!input.timestamp || !input.signature) return { ok: false, reason: "missing_headers" };

  const sent = Number(input.timestamp);
  if (!Number.isFinite(sent)) return { ok: false, reason: "stale_timestamp" };

  const now = Math.floor((input.now ?? Date.now()) / 1000);
  // Bounded in both directions: a far-future timestamp is as suspicious as an
  // old one, and accepting it would widen the replay window indefinitely.
  if (Math.abs(now - sent) > MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = signPayload(
    input.secret,
    input.timestamp,
    canonicalRequest(input.method, input.pathWithQuery, input.body),
  );
  if (!signatureMatches(expected, input.signature)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
