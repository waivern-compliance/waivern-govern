import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HARD_GAPS, article30Gaps, type Activity } from "@/services/ropa";

/** A record that satisfies Article 30 outright, to vary one field at a time. */
function complete(over: Partial<Activity> = {}): Activity {
  return {
    id: "a", organisationId: "o", entityId: "e", reference: "ROPA-2026-0001",
    name: "Payroll", description: null,
    purposes: ["Paying staff"],
    lawfulBasis: "Contract",
    dataCategories: ["Bank details"],
    subjectCategories: ["Staff"],
    recipients: ["Payroll bureau"],
    systems: [], transfers: [],
    retention: "7 years", securityMeasures: "Encrypted at rest, access controlled",
    controllerRole: "controller", controllerName: null,
    ownerId: "u", reviewDueAt: null,
    sourceConnectionId: null, externalRef: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...over,
  };
}

const NONE = new Set<string>();
const LIBRARY = new Set(["US", "IN"]);

describe("Article 30 completeness", () => {
  it("finds nothing wrong with a complete record", () => {
    assert.deepEqual(article30Gaps(complete(), LIBRARY), []);
  });

  it("names each unqualified element that is absent", () => {
    const bare = complete({
      purposes: [], subjectCategories: [], dataCategories: [], recipients: [],
    });
    const gaps = article30Gaps(bare, LIBRARY);
    for (const g of ["purposes", "subject_categories", "data_categories", "recipients"]) {
      assert.ok(gaps.includes(g as never), `expected ${g}`);
      assert.ok(HARD_GAPS.includes(g as never), `${g} should be a hard gap`);
    }
  });

  it("reports retention and security measures without calling them a breach", () => {
    // Article 30(1)(f) and (g) are qualified by "where possible". Reporting
    // them as non-compliance would cry wolf on every record.
    const thin = complete({ retention: null, securityMeasures: null });
    const gaps = article30Gaps(thin, LIBRARY);
    assert.ok(gaps.includes("retention"));
    assert.ok(gaps.includes("security_measures"));
    assert.equal(gaps.filter((g) => HARD_GAPS.includes(g)).length, 0);
  });

  it("ignores a transfer to a country that needs no safeguard", () => {
    const eu = complete({ transfers: [{ country: "IE" }] });
    assert.ok(!article30Gaps(eu, LIBRARY).includes("transfer_safeguards"));
  });

  it("flags a transfer to a country that needs one and has none", () => {
    const us = complete({ transfers: [{ country: "US" }] });
    assert.ok(article30Gaps(us, LIBRARY).includes("transfer_safeguards"));
  });

  it("accepts a transfer once a mechanism is recorded", () => {
    const us = complete({ transfers: [{ country: "US", mechanism: "UK Addendum to SCCs" }] });
    assert.ok(!article30Gaps(us, LIBRARY).includes("transfer_safeguards"));
  });

  it("escalates rather than clears when the country library is empty", () => {
    // The same fail-closed rule as routing. An unseeded library must never
    // answer "no safeguard needed" for every destination on earth.
    const us = complete({ transfers: [{ country: "US", mechanism: "SCCs" }] });
    assert.ok(article30Gaps(us, NONE).includes("transfer_safeguards"));
  });

  it("escalates a transfer with no destination named", () => {
    const nowhere = complete({ transfers: [{ country: "" }] });
    assert.ok(article30Gaps(nowhere, LIBRARY).includes("transfer_safeguards"));
  });

  it("requires the controller be named only when acting as processor", () => {
    const asProcessor = complete({ controllerRole: "processor" });
    assert.ok(article30Gaps(asProcessor, LIBRARY).includes("controller_named"));

    const named = complete({ controllerRole: "processor", controllerName: "BBC" });
    assert.ok(!article30Gaps(named, LIBRARY).includes("controller_named"));

    const asController = complete({ controllerRole: "controller" });
    assert.ok(!article30Gaps(asController, LIBRARY).includes("controller_named"));
  });

  it("treats whitespace as absence", () => {
    const blank = complete({ retention: "   ", controllerRole: "processor", controllerName: " " });
    const gaps = article30Gaps(blank, LIBRARY);
    assert.ok(gaps.includes("retention"));
    assert.ok(gaps.includes("controller_named"));
  });

  it("notices an unowned record and an overdue review", () => {
    const stale = complete({ ownerId: null, reviewDueAt: new Date(Date.now() - 86_400_000) });
    const gaps = article30Gaps(stale, LIBRARY);
    assert.ok(gaps.includes("no_owner"));
    assert.ok(gaps.includes("review_overdue"));
    // Neither is an Article 30 requirement — they are how a register goes
    // stale, which is worth saying without overstating it.
    assert.ok(!HARD_GAPS.includes("no_owner" as never));
    assert.ok(!HARD_GAPS.includes("review_overdue" as never));
  });

  it("does not call a review due tomorrow overdue", () => {
    const soon = complete({ reviewDueAt: new Date(Date.now() + 86_400_000) });
    assert.ok(!article30Gaps(soon, LIBRARY).includes("review_overdue"));
  });
});
