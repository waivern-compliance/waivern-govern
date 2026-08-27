import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_CLOCK_SKEW_SECONDS,
  newSecret,
  openSecret,
  sealSecret,
  signPayload,
  verifyRequest,
} from "@/lib/integration/crypto";

const SECRET = "a-shared-secret";
const BODY = JSON.stringify({ records: [{ externalRef: "a", name: "Thing" }] });

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
    const result = verifyRequest({
      secret: SECRET,
      timestamp: ts,
      signature: signPayload(SECRET, ts, BODY),
      body: BODY,
    });
    assert.equal(result.ok, true);
  });

  it("refuses a body that was changed after signing", () => {
    const ts = stamp();
    const signature = signPayload(SECRET, ts, BODY);
    const result = verifyRequest({
      secret: SECRET,
      timestamp: ts,
      signature,
      body: BODY.replace("Thing", "Something else"),
    });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("refuses a signature made with a different secret", () => {
    const ts = stamp();
    const result = verifyRequest({
      secret: SECRET,
      timestamp: ts,
      signature: signPayload("someone-elses-secret", ts, BODY),
      body: BODY,
    });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("refuses a replay of a captured signature under a new timestamp", () => {
    // The timestamp is inside the signed material. If it were only alongside
    // it, a captured body could be replayed indefinitely.
    const original = stamp(-60);
    const signature = signPayload(SECRET, original, BODY);
    const result = verifyRequest({
      secret: SECRET,
      timestamp: stamp(),
      signature,
      body: BODY,
    });
    assert.equal(result.ok === false && result.reason, "bad_signature");
  });

  it("refuses a stale timestamp", () => {
    const old = stamp(-(MAX_CLOCK_SKEW_SECONDS + 30));
    const result = verifyRequest({
      secret: SECRET,
      timestamp: old,
      signature: signPayload(SECRET, old, BODY),
      body: BODY,
    });
    assert.equal(result.ok === false && result.reason, "stale_timestamp");
  });

  it("refuses a timestamp from the future", () => {
    // Bounded both ways: accepting a far-future stamp would widen the replay
    // window indefinitely.
    const ahead = stamp(MAX_CLOCK_SKEW_SECONDS + 30);
    const result = verifyRequest({
      secret: SECRET,
      timestamp: ahead,
      signature: signPayload(SECRET, ahead, BODY),
      body: BODY,
    });
    assert.equal(result.ok === false && result.reason, "stale_timestamp");
  });

  it("tolerates modest clock skew", () => {
    const skewed = stamp(-(MAX_CLOCK_SKEW_SECONDS - 30));
    const result = verifyRequest({
      secret: SECRET,
      timestamp: skewed,
      signature: signPayload(SECRET, skewed, BODY),
      body: BODY,
    });
    assert.equal(result.ok, true);
  });

  it("refuses when headers are missing", () => {
    assert.equal(
      verifyRequest({ secret: SECRET, timestamp: null, signature: "x", body: BODY }).ok,
      false,
    );
    assert.equal(
      verifyRequest({ secret: SECRET, timestamp: stamp(), signature: null, body: BODY }).ok,
      false,
    );
  });

  it("refuses a non-numeric timestamp", () => {
    const result = verifyRequest({
      secret: SECRET,
      timestamp: "not-a-time",
      signature: signPayload(SECRET, "not-a-time", BODY),
      body: BODY,
    });
    assert.equal(result.ok === false && result.reason, "stale_timestamp");
  });

  it("signs the exact bytes, so re-serialising is not equivalent", () => {
    // Two byte strings can parse to the same object; only one was signed. This
    // is why the handler verifies the raw body and parses it afterwards.
    const compact = '{"a":1,"b":2}';
    const spaced = '{ "a": 1, "b": 2 }';
    const ts = stamp();
    const signature = signPayload(SECRET, ts, compact);
    assert.equal(
      verifyRequest({ secret: SECRET, timestamp: ts, signature, body: spaced }).ok,
      false,
    );
  });
});
