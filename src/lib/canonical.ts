/**
 * Deterministic serialisation for hashing.
 *
 * `JSON.stringify` is not stable: two objects with the same content but
 * different insertion order produce different strings, which would make an
 * audit hash unreproducible and the whole chain worthless. This sorts object
 * keys, drops `undefined` properties, and renders dates as ISO-8601 so a hash
 * recomputed from a database row matches the one written at the time.
 */
export function canonicalise(value: unknown): string {
  if (value === null) return "null";

  if (value instanceof Date) return JSON.stringify(value.toISOString());

  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalise(v === undefined ? null : v)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`)
      .join(",")}}`;
  }

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Cannot canonicalise a non-finite number");
  }

  return JSON.stringify(value ?? null);
}

/** SHA-256 of a canonical string, hex encoded. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
