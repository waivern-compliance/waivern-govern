import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseMembership } from "@/lib/session";

const m = (organisationId: string, organisationName: string) => ({ organisationId, organisationName });
const MEMBERSHIPS = [m("o-z", "Zebra Council"), m("o-a", "Acme Department"), m("o-m", "Middle Agency")];

describe("which organisation a request acts in", () => {
  it("is the one the person chose, while they still belong to it", () => {
    assert.equal(chooseMembership(MEMBERSHIPS, "o-m")?.organisationId, "o-m");
  });

  it("falls back to the first by name, the same every time, when nothing was chosen", () => {
    assert.equal(chooseMembership(MEMBERSHIPS, null)?.organisationId, "o-a");
    assert.equal(chooseMembership([...MEMBERSHIPS].reverse(), undefined)?.organisationId, "o-a");
  });

  it("ignores a choice of an organisation they do not belong to", () => {
    // A stale cookie after leaving, or one edited by hand, grants nothing.
    assert.equal(chooseMembership(MEMBERSHIPS, "somebody-elses")?.organisationId, "o-a");
  });

  it("gives nothing to somebody with no memberships", () => {
    assert.equal(chooseMembership([], "o-a"), null);
  });
});
