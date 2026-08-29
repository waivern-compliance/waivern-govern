import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, isNull, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { countryRisk, entities, organisations } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { COUNTRY_LIBRARY, SEED_REVIEWER } from "@/lib/countries/library";
import { matches } from "@/lib/workflow/routing";
import {
  libraryFor,
  libraryHealth,
  lookup,
  needingSafeguards,
  reviewCountry,
  reviewHistory,
  seedSharedLibrary,
} from "@/services/countries";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  await seedSharedLibrary();
  const [org] = await db
    .insert(organisations)
    .values({ name: `C ${label}`, slug: `ctry-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true });
  return { org };
}

after(async () => {
  await pg.end();
});

describe("the shipped library", () => {
  it("does not pretend to be verified", () => {
    // It is generated from a starting point, not checked against a current
    // source. Shipping it as current would put ratings into transfer
    // assessments that read as evidence and are not.
    assert.equal(SEED_REVIEWER, "seed — not verified");
  });

  it("leaves the two risk judgements open unless there is something to cite", () => {
    const rated = COUNTRY_LIBRARY.filter((c) => c.governmentAccess && c.governmentAccess !== "unknown");
    for (const c of rated) {
      const citable = c.sources?.length || c.summary || c.ukAdequacy === "adequate";
      assert.ok(citable, `${c.name} carries a rating with nothing behind it`);
    }
  });

  it("does not reduce conditional adequacy to a yes", () => {
    // The United States is the case that matters: adequacy depends on the
    // recipient's certification, not on the country. A boolean records it as
    // "yes" and quietly excuses an assessment nobody did.
    const us = COUNTRY_LIBRARY.find((c) => c.code === "US")!;
    assert.equal(us.ukAdequacy, "partial");
    assert.match(us.ukAdequacyNote ?? "", /certified/i);

    const canada = COUNTRY_LIBRARY.find((c) => c.code === "CA")!;
    assert.equal(canada.ukAdequacy, "partial");
  });

  it("has no duplicate country codes", () => {
    const codes = COUNTRY_LIBRARY.map((c) => c.code);
    assert.equal(new Set(codes).size, codes.length);
  });
});

describe("what needs an Article 46 route", () => {
  it("counts conditional adequacy as needing safeguards", async () => {
    const w = await world("safeguards");
    const needs = await needingSafeguards(w.org.id, "uk");

    // The condition is about the recipient, which the platform cannot know —
    // so assuming it holds is how a transfer to an uncertified US processor
    // sails through.
    assert.ok(needs.has("US"), "conditionally adequate still needs a route");
    assert.ok(needs.has("IN"));
    assert.ok(!needs.has("IE"), "an EEA state does not");
    assert.ok(!needs.has("JP"), "a full adequacy decision does not");
  });

  it("routes a transfer on the library rather than a hard-coded list", async () => {
    const w = await world("routing");
    const needs = await needingSafeguards(w.org.id, "uk");
    const condition = { op: "transferToNonAdequate" as const };

    assert.equal(
      matches(condition, {
        answers: { transfer_destinations: ["IE", "FR"] },
        score: null, tier: null, needsSafeguards: needs,
      }),
      false,
    );
    assert.equal(
      matches(condition, {
        answers: { transfer_destinations: ["IE", "US"] },
        score: null, tier: null, needsSafeguards: needs,
      }),
      true,
    );
  });
});

describe("reviewing a country", () => {
  it("refuses a review with no note", async () => {
    const w = await world("nonote");
    await assert.rejects(
      reviewCountry({ organisationId: w.org.id, code: "US", note: "  ", actor: SYSTEM }),
      /needs a note/,
    );
  });

  it("accepts a confirmation that nothing changed", async () => {
    // The common case. Requiring an edit before the clock resets would push
    // people into cosmetic changes, and the record would say something moved.
    const w = await world("confirm");
    const before = await lookup(w.org.id, "JP");
    const after = await reviewCountry({
      organisationId: w.org.id,
      code: "JP",
      note: "Confirmed against the current adequacy regulations; no change.",
      actor: SYSTEM,
    });

    assert.equal(after.ukAdequacy, before!.ukAdequacy);
    assert.equal(after.stale, false);
    assert.equal(after.unverified, false);
    assert.ok(after.nextReviewAt.getTime() > Date.now());
  });

  it("writes the client's own entry and leaves the shared library alone", async () => {
    const w = await world("override");
    const other = await world("bystander");

    await reviewCountry({
      organisationId: w.org.id,
      code: "SG",
      note: "Our own analysis of the destination.",
      changes: { governmentAccess: "moderate", redress: "low" },
      actor: SYSTEM,
    });

    const mine = await lookup(w.org.id, "SG");
    assert.equal(mine!.isOverride, true);
    assert.equal(mine!.governmentAccess, "moderate");

    // Editing the shared library from inside one client would change what
    // every other client sees.
    const theirs = await lookup(other.org.id, "SG");
    assert.equal(theirs!.isOverride, false);
    assert.equal(theirs!.governmentAccess, "unknown");
  });

  it("replaces the shared entry entirely rather than merging with it", async () => {
    const w = await world("replace");
    await reviewCountry({
      organisationId: w.org.id,
      code: "US",
      note: "Reassessed.",
      changes: { ukAdequacy: "not_adequate" },
      actor: SYSTEM,
    });

    const library = await libraryFor(w.org.id);
    const us = library.filter((c) => c.code === "US");
    // Half theirs and half ours would be a view nobody wrote and nobody can
    // defend.
    assert.equal(us.length, 1);
    assert.equal(us[0].ukAdequacy, "not_adequate");
    assert.equal(us[0].isOverride, true);
  });

  it("changes routing once a client reassesses a destination", async () => {
    const w = await world("reroute");
    assert.ok((await needingSafeguards(w.org.id, "uk")).has("US"));

    await reviewCountry({
      organisationId: w.org.id,
      code: "JP",
      note: "Downgraded pending the outcome of a review.",
      changes: { ukAdequacy: "under_review" },
      actor: SYSTEM,
    });

    const needs = await needingSafeguards(w.org.id, "uk");
    assert.ok(needs.has("JP"), "an adequacy under review needs a route again");
  });

  it("keeps who checked what, and when", async () => {
    const w = await world("history");
    const reviewed = await reviewCountry({
      organisationId: w.org.id,
      code: "BR",
      note: "Checked the current position; no adequacy decision.",
      actor: { actorKind: "user", actorUserId: null, actorLabel: "dpo@example.com" },
    });

    const history = await reviewHistory(reviewed.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].reviewedByLabel, "dpo@example.com");
    assert.match(history[0].note, /no adequacy decision/);

    const chain = await verifyAuditChain(w.org.id);
    assert.equal(chain.ok, true);
  });
});

describe("staleness", () => {
  it("reports the seeded library as unchecked", async () => {
    const w = await world("health");
    const health = await libraryHealth(w.org.id);
    assert.equal(health.total, COUNTRY_LIBRARY.length);
    assert.equal(health.unverified, COUNTRY_LIBRARY.length);
    assert.equal(health.stale, COUNTRY_LIBRARY.length, "seeded entries are due immediately");
  });

  it("stops counting an entry once somebody checks it", async () => {
    const w = await world("checked");
    const before = await libraryHealth(w.org.id);
    await reviewCountry({
      organisationId: w.org.id, code: "AU", note: "Checked.", actor: SYSTEM,
    });
    const after = await libraryHealth(w.org.id);
    assert.equal(after.stale, before.stale - 1);
    assert.equal(after.unverified, before.unverified - 1);
  });
});
