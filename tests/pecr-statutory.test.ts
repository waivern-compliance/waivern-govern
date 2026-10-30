import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  failingChecks,
  itemKey,
  observedStorage,
  partyOf,
  registrable,
  reportSummary,
  stripReport,
  validateReport,
  type AnalyserReport,
} from "@/lib/pecr/analyser-report";
import { gaps, suggestedBasis } from "@/lib/pecr/statutory";

const sample = () => JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/consent-analyser-2.0.json"), "utf8"));

const property = { informationUrl: "https://www.example.co.uk/cookies", objectionMechanism: "Analytics toggle in the cookie settings link in the footer" };
const item = { party: "first", supplierId: null, seenBeforeConsent: false, seenAfterReject: false, status: "active" };

describe("Schedule A1 gaps", () => {
  it("asks for a basis first", () => {
    assert.deepEqual(gaps({ item, decision: null, property }), ["No basis recorded."]);
  });

  it("needs every condition, the information and the objection route for statistics", () => {
    const g = gaps({
      item: { ...item, party: "third" },
      decision: { basis: "statistics", conditions: { provider_collects: true, sole_purpose: true } },
      property: { informationUrl: null, objectionMechanism: " " },
    });
    assert.equal(g.length, 4);
    assert.ok(g.some((x) => /shared with nobody except/.test(x)));
    assert.ok(g.some((x) => /clear and comprehensive information/.test(x)));
    assert.ok(g.some((x) => /simple, free way to object/.test(x)));
    assert.ok(g.some((x) => /which supplier/.test(x)));
  });

  it("is satisfied by a complete statistics record", () => {
    const g = gaps({
      item,
      decision: { basis: "statistics", conditions: { provider_collects: true, sole_purpose: true, shared_only_to_improve: true } },
      property,
    });
    assert.deepEqual(g, []);
  });

  it("flags consent that the scan contradicts", () => {
    const g = gaps({ item: { ...item, seenBeforeConsent: true, seenAfterReject: true }, decision: { basis: "consent", conditions: {} }, property });
    assert.equal(g.length, 2);
  });

  it("needs nothing more for strictly necessary once confirmed, and nothing for a removed item", () => {
    assert.deepEqual(gaps({ item, decision: { basis: "strictly_necessary", conditions: { requested_service: true } }, property: { informationUrl: null, objectionMechanism: null } }), []);
    assert.deepEqual(gaps({ item: { ...item, status: "removed" }, decision: null, property }), []);
  });

  it("says plainly when there is no basis", () => {
    assert.match(gaps({ item, decision: { basis: "none", conditions: {} }, property })[0], /remove it/);
  });

  it("suggests, from a scanner's category, without deciding", () => {
    assert.equal(suggestedBasis("analytics"), "statistics");
    assert.equal(suggestedBasis("functional"), "appearance_function");
    assert.equal(suggestedBasis("advertising"), "consent");
    assert.equal(suggestedBasis("advertising_or_analytics"), null);
  });
});

describe("reading a Consent Analyser report", () => {
  it("accepts 2.0, and refuses the wrong version, a partial report and a blocked scan", () => {
    assert.ok(validateReport(sample()).ok);
    assert.equal(validateReport({ ...sample(), schema_version: "1.0" }).ok, false);
    assert.equal(validateReport({ ...sample(), checklist: null }).ok, false);
    assert.equal(validateReport([]).ok, false);
    const blocked = sample();
    blocked.metadata.bot_blocked = true;
    blocked.metadata.bot_blocker_name = "Cloudflare";
    const v = validateReport(blocked);
    assert.equal(v.ok, false);
    assert.match((v as { reason: string }).reason, /Cloudflare/);
  });

  it("keeps no screenshots and no cookie values", () => {
    const stripped = JSON.stringify(stripReport(sample() as AnalyserReport));
    assert.ok(!stripped.includes("iVBORw0KGgo"));
    assert.ok(!stripped.includes("GA1.2.123456789"));
    assert.ok(stripped.includes('"_ga"'));
  });

  it("reads the cookies from 2.0 evidence, preferring the AI's category", () => {
    const items = observedStorage(sample() as AnalyserReport);
    const by = new Map(items.map((i) => [i.name, i]));
    assert.deepEqual([...by.keys()].sort(), ["_fbp", "_ga", "_gid", "lang", "session_id"]);
    assert.deepEqual(
      [by.get("_ga")!.party, by.get("_ga")!.category, by.get("_ga")!.seenBeforeConsent, by.get("_ga")!.expiry],
      ["first", "analytics", true, "400 days"],
    );
    assert.deepEqual([by.get("_fbp")!.party, by.get("_fbp")!.seenAfterReject, by.get("_fbp")!.category], ["third", true, "advertising"]);
    assert.equal(by.get("_gid")!.seenAfterReject, false, "a dormant cookie is not collecting after Reject");
    assert.equal(by.get("_gid")!.category, "advertising_or_analytics");
    assert.equal(by.get("session_id")!.category, "strictly_necessary");
    assert.equal(by.get("lang")!.category, "functional");
  });

  it("reads 2.1's storage list when there is one", () => {
    const r = { ...sample(), schema_version: "2.1", storage: [
      { name: "_ga", domain: ".example.co.uk", party: "first", kind: "cookie", expiry: "13 months", category: "analytics", phases: ["before_consent", "after_accept"] },
      { name: "theme", domain: "www.example.co.uk", kind: "local_storage", category: "functional", phases: ["after_accept"] },
    ] };
    const items = observedStorage(r as AnalyserReport);
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((i) => [i.name, i.kind, i.seenBeforeConsent]), [["_ga", "cookie", true], ["theme", "local_storage", false]]);
  });

  it("works out first and third party on the registrable domain", () => {
    assert.equal(registrable("www.shop.example.co.uk"), "example.co.uk");
    assert.equal(registrable(".google.com"), "google.com");
    assert.equal(partyOf(".example.co.uk", "https://www.example.co.uk/"), "first");
    assert.equal(partyOf("stats.example.co.uk", "www.example.co.uk"), "first");
    assert.equal(partyOf(".doubleclick.net", "https://www.example.co.uk/"), "third");
    assert.equal(partyOf(null, "https://www.example.co.uk/"), "unknown");
    assert.equal(itemKey("cookie", ".example.co.uk", "_ga"), itemKey("cookie", "www.example.co.uk", "_ga"));
  });

  it("lists failing checks and the headline facts", () => {
    const r = sample() as AnalyserReport;
    assert.deepEqual(failingChecks(r).map((c) => c.itemId), ["B.2", "F.1"]);
    const s = reportSummary(r);
    assert.deepEqual([s.runId, s.targetUrl, s.cmp, s.overall, s.aiClassified], ["a1b2c3d4", "https://www.example.co.uk/", "OneTrust", "FAIL", true]);
  });
});
