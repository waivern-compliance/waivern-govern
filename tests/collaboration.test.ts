import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathFor } from "@/lib/records";
import { findMentions, type Member } from "@/services/collaboration";

const MEMBERS: Member[] = [
  { id: "u1", email: "vincent.nunan@waivern.com" },
  { id: "u2", email: "oliver@bookedsolid.example" },
  { id: "u3", email: "sam@waivern.com" },
  { id: "u4", email: "sam@bbc.example" },
];

describe("who a comment mentions", () => {
  it("finds nobody in ordinary prose", () => {
    const { userIds } = findMentions("This looks fine to me.", MEMBERS);
    assert.deepEqual(userIds, []);
  });

  it("resolves a full address exactly", () => {
    const { userIds } = findMentions("@vincent.nunan@waivern.com can you check?", MEMBERS);
    assert.deepEqual(userIds, ["u1"]);
  });

  it("resolves a local part when only one person matches", () => {
    const { userIds } = findMentions("@oliver what do you think?", MEMBERS);
    assert.deepEqual(userIds, ["u2"]);
  });

  it("refuses to guess when a local part is ambiguous", () => {
    // Two people called sam. Guessing would show the record to whichever one
    // the code happened to sort first, which is exactly the wrong failure.
    const { userIds, unresolved } = findMentions("@sam please review", MEMBERS);
    assert.deepEqual(userIds, []);
    assert.deepEqual(unresolved, ["sam"]);
  });

  it("disambiguates the same name by full address", () => {
    const { userIds } = findMentions("@sam@waivern.com please review", MEMBERS);
    assert.deepEqual(userIds, ["u3"]);
  });

  it("ignores case", () => {
    const { userIds } = findMentions("@Vincent.Nunan@Waivern.com", MEMBERS);
    assert.deepEqual(userIds, ["u1"]);
  });

  it("does not notify anyone because an address appears in the text", () => {
    // A bare address has no leading @, so nothing should resolve from it —
    // writing "email sam@waivern.com" must not summon Sam.
    const { userIds } = findMentions("You can email sam@waivern.com about it.", MEMBERS);
    assert.deepEqual(userIds, []);
  });

  it("mentions each person once however often they are named", () => {
    const { userIds } = findMentions("@oliver and again @oliver", MEMBERS);
    assert.deepEqual(userIds, ["u2"]);
  });

  it("handles several people in one comment", () => {
    const { userIds } = findMentions("@oliver @vincent.nunan@waivern.com both", MEMBERS);
    assert.deepEqual([...userIds].sort(), ["u1", "u2"]);
  });

  it("keeps an unmatched mention rather than silently dropping it", () => {
    const { userIds, unresolved } = findMentions("@nobody are you there", MEMBERS);
    assert.deepEqual(userIds, []);
    assert.deepEqual(unresolved, ["nobody"]);
  });

  it("stops the mention at sentence punctuation", () => {
    const { userIds } = findMentions("Thanks @oliver, that helps.", MEMBERS);
    assert.deepEqual(userIds, ["u2"]);
  });

  it("finds nobody when the organisation has no members yet", () => {
    const { userIds } = findMentions("@oliver", []);
    assert.deepEqual(userIds, []);
  });
});

describe("where a record lives", () => {
  it("routes each record type that has a screen", () => {
    assert.equal(pathFor("assessment", "a1"), "/app/assessments/a1");
    assert.equal(pathFor("risk", "r1"), "/app/risks/r1");
    assert.equal(pathFor("processing_activity", "p1"), "/app/ropa/p1");
    assert.equal(pathFor("ai_use_case", "u1"), "/app/ai/u1");
    assert.equal(pathFor("supplier", "s1"), "/app/third-parties/s1");
  });

  it("returns nothing for a record with no screen of its own", () => {
    // A null becomes plain text in the inbox. Sending somebody to a 404 is
    // worse than telling them there is nowhere to go.
    assert.equal(pathFor("audit_event", "x"), null);
  });
});
