import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { sql as pg, db } from "@/db/client";
import { organisations } from "@/db/schema";
import {
  AI_FRAMEWORKS,
  DEFAULT_AI_FRAMEWORK,
  categoryLabel,
  frameworkPack,
  isKnownCategory,
  suggestionByKey,
} from "@/lib/ai-frameworks";
import { UK_DSIT } from "@/lib/ai-frameworks/uk-dsit";
import { APPETITE_LEVELS, isScope, scopesFor } from "@/lib/risk/appetite";
import { AI_RISK_CATEGORIES } from "@/lib/risk/categories";
import { TREATMENT_SUGGESTIONS } from "@/lib/risk/treatment-library";
import { aiFrameworkOf, aiFrameworkPackOf } from "@/services/ai-framework";

after(() => pg.end());

describe("the UK framework pack", () => {
  it("is exactly what every organisation has followed until now", () => {
    assert.equal(DEFAULT_AI_FRAMEWORK, "uk_dsit");
    assert.equal(UK_DSIT.categories, AI_RISK_CATEGORIES);
    assert.equal(UK_DSIT.treatments, TREATMENT_SUGGESTIONS);
  });

  it("has appetite guidance for every category at every level", () => {
    for (const c of UK_DSIT.categories) {
      for (const level of APPETITE_LEVELS) {
        assert.ok(UK_DSIT.appetiteGuidance[c.value]?.[level], `${c.value} / ${level}`);
      }
    }
  });

  it("offers appetite for the default and each of its categories, and nothing else", () => {
    assert.deepEqual(scopesFor(UK_DSIT), ["default", ...AI_RISK_CATEGORIES.map((c) => c.value)]);
    assert.ok(isScope("fairness", UK_DSIT));
    assert.ok(isScope("default", UK_DSIT));
    assert.ok(!isScope("Supplier insolvency", UK_DSIT));
  });
});

describe("reading across frameworks", () => {
  it("labels any framework's category, and leaves the organisation's own as written", () => {
    assert.equal(categoryLabel("legal_regulatory"), "Legal and regulatory compliance");
    assert.equal(categoryLabel("Supplier insolvency"), "Supplier insolvency");
    assert.equal(categoryLabel(null), null);
    assert.ok(isKnownCategory("fairness"));
    assert.ok(!isKnownCategory("Supplier insolvency"));
  });

  it("finds a chosen treatment by key, and keys are unique across frameworks", () => {
    assert.equal(suggestionByKey(TREATMENT_SUGGESTIONS[0].key), TREATMENT_SUGGESTIONS[0]);
    assert.equal(suggestionByKey("no.such.key"), null);
    const keys = Object.values(AI_FRAMEWORKS).flatMap((p) => p.treatments.map((t) => t.key));
    assert.equal(new Set(keys).size, keys.length);
  });

  it("falls back to the default for a value it does not know", () => {
    assert.equal(frameworkPack("something_else"), UK_DSIT);
    assert.equal(frameworkPack(null), UK_DSIT);
  });
});

describe("the organisation's framework", () => {
  it("is the UK set for a new organisation", async () => {
    const [org] = await db
      .insert(organisations)
      .values({ name: "Framework Org", slug: `framework-${crypto.randomUUID().slice(0, 8)}` })
      .returning();
    assert.equal(org.aiFramework, "uk_dsit");
    assert.equal(await aiFrameworkOf(org.id), "uk_dsit");
    assert.equal(await aiFrameworkPackOf(org.id), UK_DSIT);
  });
});
