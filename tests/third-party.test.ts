import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPIRING_WITHIN_DAYS,
  EXPIRING_WITHIN_LABEL,
  HARD_GAPS,
  article28Gaps,
  canonicalise,
  currentDpa,
  type Dpa,
  type Supplier,
} from "@/services/third-party";

const NOW = new Date("2026-08-29T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function supplier(over: Partial<Supplier> = {}): Supplier {
  return {
    id: "s", organisationId: "o", name: "Acme Analytics",
    canonicalKey: "acme-analytics", description: null, categories: ["analytics"],
    ownerId: "u", reviewedAt: NOW, reviewedBy: "u",
    sourceConnectionId: null, externalRef: null,
    createdAt: NOW, updatedAt: NOW,
    ...over,
  };
}

function dpa(over: Partial<Dpa> = {}): Dpa {
  return {
    id: "d", organisationId: "o", supplierId: "s", title: "MSA Schedule 2",
    documentRef: "DPA-2026-01", signedAt: days(-400), expiresAt: days(400),
    terms: {}, transferMechanism: "UK Addendum to SCCs", subProcessors: ["AWS"],
    sourceConnectionId: null, externalRef: null,
    createdAt: NOW, updatedAt: NOW,
    ...over,
  };
}

describe("the agreement in force", () => {
  it("is nothing when there are none", () => {
    assert.equal(currentDpa([], NOW), null);
  });

  it("prefers an unexpired agreement over an expired one", () => {
    const old = dpa({ id: "old", signedAt: days(-800), expiresAt: days(-10) });
    const live = dpa({ id: "live", signedAt: days(-100), expiresAt: days(200) });
    assert.equal(currentDpa([old, live], NOW)?.id, "live");
  });

  it("takes the most recently signed of several live ones", () => {
    const a = dpa({ id: "a", signedAt: days(-300) });
    const b = dpa({ id: "b", signedAt: days(-30) });
    assert.equal(currentDpa([a, b], NOW)?.id, "b");
  });

  it("treats no end date as perpetual rather than missing", () => {
    const perpetual = dpa({ id: "p", expiresAt: null });
    assert.equal(currentDpa([perpetual], NOW)?.id, "p");
    assert.ok(!article28Gaps(supplier(), [perpetual], NOW).includes("dpa_expired"));
  });

  it("still reports the last agreement when every one has expired", () => {
    // Reporting "no agreement" would be wrong: one existed and lapsed, which
    // is a different conversation from never having had one.
    const expired = dpa({ id: "x", expiresAt: days(-5) });
    assert.equal(currentDpa([expired], NOW)?.id, "x");
    const gaps = article28Gaps(supplier(), [expired], NOW);
    assert.ok(gaps.includes("dpa_expired"));
    assert.ok(!gaps.includes("no_dpa"));
  });
});

describe("Article 28 cover", () => {
  it("finds nothing wrong with a signed agreement in force", () => {
    assert.deepEqual(article28Gaps(supplier(), [dpa()], NOW), []);
  });

  it("treats no agreement as a failure of substance", () => {
    const gaps = article28Gaps(supplier(), [], NOW);
    assert.ok(gaps.includes("no_dpa"));
    assert.ok(HARD_GAPS.includes("no_dpa"));
  });

  it("treats an unsigned agreement as no agreement", () => {
    const gaps = article28Gaps(supplier(), [dpa({ signedAt: null })], NOW);
    assert.ok(gaps.includes("dpa_unsigned"));
    assert.ok(HARD_GAPS.includes("dpa_unsigned"));
  });

  it("warns before an agreement lapses, without calling it a breach", () => {
    const soon = dpa({ expiresAt: days(EXPIRING_WITHIN_DAYS - 1) });
    const gaps = article28Gaps(supplier(), [soon], NOW);
    assert.ok(gaps.includes("dpa_expiring"));
    assert.equal(gaps.filter((g) => HARD_GAPS.includes(g)).length, 0);
  });

  it("does not warn about an expiry beyond the horizon", () => {
    const later = dpa({ expiresAt: days(EXPIRING_WITHIN_DAYS + 5) });
    assert.ok(!article28Gaps(supplier(), [later], NOW).includes("dpa_expiring"));
  });

  it("never reports both expiring and expired for one agreement", () => {
    const gaps = article28Gaps(supplier(), [dpa({ expiresAt: days(-1) })], NOW);
    assert.ok(gaps.includes("dpa_expired"));
    assert.ok(!gaps.includes("dpa_expiring"));
  });

  it("reports unrecorded sub-processors without asserting a breach", () => {
    // An empty list may honestly mean none, so this is not a hard gap.
    const gaps = article28Gaps(supplier(), [dpa({ subProcessors: [] })], NOW);
    assert.ok(gaps.includes("subprocessors_undisclosed"));
    assert.ok(!HARD_GAPS.includes("subprocessors_undisclosed"));
  });

  it("asks for confirmation only where a tool invented the supplier", () => {
    const found = supplier({ sourceConnectionId: "conn", reviewedAt: null });
    assert.ok(article28Gaps(found, [dpa()], NOW).includes("never_reviewed"));

    const confirmed = supplier({ sourceConnectionId: "conn", reviewedAt: NOW });
    assert.ok(!article28Gaps(confirmed, [dpa()], NOW).includes("never_reviewed"));

    // Typed in by a person: reviewed by the act of typing it.
    const typed = supplier({ sourceConnectionId: null, reviewedAt: null });
    assert.ok(!article28Gaps(typed, [dpa()], NOW).includes("never_reviewed"));
  });

  it("notices an unowned relationship", () => {
    assert.ok(article28Gaps(supplier({ ownerId: null }), [dpa()], NOW).includes("no_owner"));
  });

  it("treats a blank transfer mechanism as unrecorded", () => {
    assert.ok(
      article28Gaps(supplier(), [dpa({ transferMechanism: "  " })], NOW)
        .includes("no_transfer_mechanism"),
    );
  });
});

describe("the expiry horizon", () => {
  it("is renewal lead time, not a reminder", () => {
    // Six months, because a processor contract can take that long to
    // renegotiate. A shorter horizon reports the lapse instead of preventing it.
    assert.equal(EXPIRING_WITHIN_DAYS, 180);
  });

  it("renders prose that cannot drift from the number", () => {
    assert.equal(EXPIRING_WITHIN_LABEL, "6 months");
  });
});

describe("canonical keys", () => {
  it("collapses punctuation and case so one supplier is one row", () => {
    assert.equal(canonicalise("  Acme  Analytics, Ltd. "), "acme-analytics-ltd");
    assert.equal(canonicalise("Acme Analytics Ltd"), "acme-analytics-ltd");
  });
});
