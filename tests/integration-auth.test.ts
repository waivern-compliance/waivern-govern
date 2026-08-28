import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_CLOCK_SKEW_SECONDS,
  canonicalRequest,
  newSecret,
  openSecret,
  sealSecret,
  signPayload,
  signRequest,
  verifyRequest,
} from "@/lib/integration/crypto";

const SECRET = "a-shared-secret";
const BODY = JSON.stringify({ records: [{ externalRef: "a", name: "Thing" }] });
const PATH = "/api/v1/ingest/vendors";

/** Every check below signs and verifies the same endpoint unless it says otherwise. */
function sign(secret: string, timestamp: string, body = BODY, path = PATH, method = "POST") {
  return signRequest({ secret, timestamp, method, pathWithQuery: path, body });
}
function check(over: Partial<Parameters<typeof verifyRequest>[0]> = {}) {
  return verifyRequest({
    secret: SECRET,
    timestamp: stamp(),
    signature: "",
    method: "POST",
    pathWithQuery: PATH,
    body: BODY,
    ...over,
  });
}

function stamp(offsetSeconds = 0): string {
  return String(Math.floor(Date.now() / 1000) + offsetSeconds);
}

describe("secrets at rest", () => {
  it("round-trips a sealed secret", () => {
    const secret = newSecret();
    assert.equal(openSecret(sealSecret(secret)), secret);
  });

  it("produces different ciphertext each time", () => {
    // A deterministic ciphertext would let anyone with the table tell which
    // connections share a secret.
    const a = sealSecret(SECRET);
    const b = sealSecret(SECRET);
    assert.notEqual(a.ciphertext, b.ciphertext);
    assert.notEqual(a.iv, b.iv);
  });

  it("refuses a tampered ciphertext rather than returning rubbish", () => {
    const sealed = sealSecret(SECRET);
    const flipped = Buffer.from(sealed.ciphertext, "base64");
    flipped[0] ^= 0xff;
    assert.throws(() =>
      openSecret({ ...sealed, ciphertext: flipped.toString("base64") }),
    );
  });
});

describe("request signatures", () => {
  it("accepts a correctly signed request", () => {
    const ts = stamp();
    assert.equal(check({ timestamp: ts, signature: sign(SECRET, ts) }).ok, true);
  });

  it("refuses a body that was changed after signing", () => {
    const ts = stamp();
    const result = check({
      timestamp: ts,
      signature: sign(SECRET, ts),
      body: BODY.replace("Thing", "Something else"),
    });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("refuses a signature made with a different secret", () => {
    const ts = stamp();
    const result = check({ timestamp: ts, signature: sign("someone-elses-secret", ts) });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("refuses a replay of a captured signature under a new timestamp", () => {
    // The timestamp is inside the signed material. If it were only alongside
    // it, a captured body could be replayed indefinitely.
    const original = stamp(-60);
    const result = check({ timestamp: stamp(), signature: sign(SECRET, original) });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("refuses a stale timestamp", () => {
    const old = stamp(-(MAX_CLOCK_SKEW_SECONDS + 30));
    const result = check({ timestamp: old, signature: sign(SECRET, old) });
    assert.equal(result.ok === false && result.reason, "stale_timestamp");
  });

  it("refuses a timestamp from the future", () => {
    // Bounded both ways: accepting a far-future stamp would widen the replay
    // window indefinitely.
    const ahead = stamp(MAX_CLOCK_SKEW_SECONDS + 30);
    const result = check({ timestamp: ahead, signature: sign(SECRET, ahead) });
    assert.equal(result.ok === false && result.reason, "stale_timestamp");
  });

  it("tolerates modest clock skew", () => {
    const skewed = stamp(-(MAX_CLOCK_SKEW_SECONDS - 30));
    assert.equal(check({ timestamp: skewed, signature: sign(SECRET, skewed) }).ok, true);
  });

  it("refuses when headers are missing", () => {
    assert.equal(check({ timestamp: null, signature: "x" }).ok, false);
    assert.equal(check({ signature: null }).ok, false);
  });

  it("refuses a non-numeric timestamp", () => {
    const result = check({
      timestamp: "not-a-time",
      signature: sign(SECRET, "not-a-time"),
    });
    assert.equal(result.ok === false && result.reason, "stale_timestamp");
  });

  it("signs the exact bytes, so re-serialising is not equivalent", () => {
    // Two byte strings can parse to the same object; only one was signed. This
    // is why the handler verifies the raw body and parses it afterwards.
    const compact = '{"a":1,"b":2}';
    const spaced = '{ "a": 1, "b": 2 }';
    const ts = stamp();
    const result = check({
      timestamp: ts,
      signature: sign(SECRET, ts, compact),
      body: spaced,
    });
    assert.equal(result.ok, false);
  });
});

describe("binding to the endpoint", () => {
  it("refuses a signature made for a different path", () => {
    // Without the path in the signed material, a captured request could be
    // aimed at any endpoint whose schema the same body happens to satisfy.
    const ts = stamp();
    const result = check({
      timestamp: ts,
      signature: sign(SECRET, ts, BODY, "/api/v1/ingest/evidence"),
    });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("refuses a signature made for a different method", () => {
    const ts = stamp();
    const result = check({
      timestamp: ts,
      signature: sign(SECRET, ts, BODY, PATH, "GET"),
    });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("refuses a signature made for a different query string", () => {
    // An export signed for one entity must not be replayable for another.
    const ts = stamp();
    const result = verifyRequest({
      secret: SECRET,
      timestamp: ts,
      signature: sign(SECRET, ts, "", "/api/v1/export/risks?entity=Studios", "GET"),
      method: "GET",
      pathWithQuery: "/api/v1/export/risks?entity=PublicService",
      body: "",
    });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("signs a bodyless GET on its method and path alone", () => {
    const ts = stamp();
    const path = "/api/v1/export/context?since=2026-08-01";
    const result = verifyRequest({
      secret: SECRET,
      timestamp: ts,
      signature: sign(SECRET, ts, "", path, "GET"),
      method: "GET",
      pathWithQuery: path,
      body: "",
    });
    assert.equal(result.ok, true);
  });

  it("normalises the method so casing is not a way in", () => {
    assert.equal(
      canonicalRequest("post", PATH, BODY),
      canonicalRequest("POST", PATH, BODY),
    );
  });
});
