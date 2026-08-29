import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { insideRailway, whyUnusable } from "@/lib/db-url";

const LOCAL = "postgresql://govern:govern@localhost:55432/govern";
const PRIVATE = "postgresql://postgres:s3cret@postgres.railway.internal:5432/railway";
const PUBLIC = "postgresql://postgres:s3cret@shinkansen.proxy.rlwy.net:41234/railway";
const OUTSIDE = {};
const INSIDE = { RAILWAY_SERVICE_NAME: "waivern-govern" };

describe("connection strings that cannot work here", () => {
  it("accepts an ordinary local string", () => {
    assert.equal(whyUnusable(LOCAL, OUTSIDE), null);
  });

  it("accepts the public proxy string from anywhere", () => {
    assert.equal(whyUnusable(PUBLIC, OUTSIDE), null);
    assert.equal(whyUnusable(PUBLIC, INSIDE), null);
  });

  it("refuses a private Railway host from outside Railway", () => {
    const why = whyUnusable(PRIVATE, OUTSIDE);
    assert.ok(why, "expected a refusal");
    assert.match(why, /only resolves inside Railway/);
    // The remedy is the point. A refusal that does not say what to do instead
    // just moves the confusion.
    assert.match(why, /railway ssh/);
  });

  it("allows the same private host once running inside Railway", () => {
    // This is the string the deployed service is meant to use.
    assert.equal(whyUnusable(PRIVATE, INSIDE), null);
  });

  it("recognises Railway by any of the variables it sets", () => {
    for (const key of [
      "RAILWAY_ENVIRONMENT_NAME",
      "RAILWAY_SERVICE_NAME",
      "RAILWAY_PROJECT_ID",
    ]) {
      assert.equal(insideRailway({ [key]: "x" }), true, key);
    }
    assert.equal(insideRailway(OUTSIDE), false);
  });

  it("still catches an abbreviated password copied from documentation", () => {
    const why = whyUnusable("postgresql://postgres:AMdWY…@host:5432/railway", OUTSIDE);
    assert.ok(why);
    assert.match(why, /placeholder/);
  });

  it("does not echo the password back when reporting a placeholder", () => {
    // This message gets pasted into chat and issue trackers.
    const why = whyUnusable("postgresql://postgres:hunter2xxx@host:5432/db", OUTSIDE);
    assert.ok(why);
    assert.ok(!why.includes("hunter2xxx"), "the password must not appear");
    assert.match(why, /:\*\*\*@/);
  });

  it("is not fooled by railway.internal appearing in the database name", () => {
    const odd = "postgresql://u:p@localhost:5432/postgres.railway.internal";
    assert.equal(whyUnusable(odd, OUTSIDE), null);
  });
});
