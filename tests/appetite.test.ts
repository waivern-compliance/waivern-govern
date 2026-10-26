import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basisFor, judge, notWithinAppetite, type AppetiteInForce } from "@/lib/risk/appetite";
import { fromTemplateScore, rate, scaleMax, SCALES } from "@/lib/risk/scale";

describe("the five by five scale", () => {
  it("accepts five on both axes", () => {
    assert.deepEqual(rate(5, 5, "5x5"), { score: 25, tier: "critical", label: "Critical" });
  });

  it("bands as the Orange Book heat map does", () => {
    assert.equal(rate(2, 2, "5x5").tier, "low"); // 4
    assert.equal(rate(1, 5, "5x5").tier, "medium"); // 5
    assert.equal(rate(3, 3, "5x5").tier, "medium"); // 9
    assert.equal(rate(2, 5, "5x5").tier, "high"); // 10
    assert.equal(rate(3, 5, "5x5").tier, "high"); // 15
    assert.equal(rate(4, 4, "5x5").tier, "critical"); // 16
  });

  it("does not let a twelve mean the same on both scales", () => {
    // The reason one organisation uses one scale.
    assert.equal(rate(3, 4, "4x4").tier, "critical");
    assert.equal(rate(3, 4, "5x5").tier, "high");
  });

  it("refuses a five on the four by four scale", () => {
    assert.throws(() => rate(5, 1, "4x4"), /from 1 to 4/);
  });

  it("covers every score with a band, on both scales", () => {
    for (const scale of ["4x4", "5x5"] as const) {
      const max = scaleMax(scale);
      for (let l = 1; l <= max; l++) {
        for (let i = 1; i <= max; i++) assert.ok(rate(l, i, scale).tier);
      }
      assert.equal(SCALES[scale].likelihood.length, SCALES[scale].impact.length);
    }
  });
});

describe("mapping a template's rating onto the register", () => {
  const fourPoint = {
    method: "likelihood_impact",
    likelihoodQuestion: "l",
    impactQuestion: "i",
    likelihoodScale: { low: 1, mid: 2, high: 3, top: 4 },
    impactScale: { low: 1, mid: 2, high: 3, top: 4 },
  };
  const scored = {
    scored: true,
    components: [
      { question: "l", contribution: 3 },
      { question: "i", contribution: 2 },
    ],
  };

  it("maps straight across when the axes match", () => {
    assert.deepEqual(fromTemplateScore(scored, fourPoint, "4x4"), { likelihood: 3, impact: 2 });
  });

  it("refuses to pass a four-point answer off as a five-point rating", () => {
    // A 3 of 4 is not a 3 of 5. A person rates it instead.
    assert.equal(fromTemplateScore(scored, fourPoint, "5x5"), null);
  });
});

describe("judging a risk against appetite", () => {
  const inForce: AppetiteInForce = {
    default: { id: "d", level: "cautious", toleratedTier: "medium" },
    fairness: { id: "f", level: "averse", toleratedTier: "low" },
    financial: { id: "m", level: "open", toleratedTier: "high" },
  };

  it("uses the category's own appetite where there is one", () => {
    const b = basisFor("fairness", inForce);
    assert.equal(b.source, "category");
    assert.equal(b.toleratedTier, "low");
  });

  it("falls back to the organisation default", () => {
    const b = basisFor("security", inForce);
    assert.equal(b.source, "default");
  });

  it("falls back to the platform's assumption when nothing is signed off", () => {
    const b = basisFor("security", {});
    assert.equal(b.source, "platform");
    assert.equal(b.toleratedTier, "medium");
  });

  it("treats a category it does not recognise as having none of its own", () => {
    // Risks that predate the toolkit's categories keep their own words.
    assert.equal(basisFor("cookie", inForce).source, "default");
  });

  it("holds categories to different standards", () => {
    const high = { residualTier: "high" as const, status: "treating" };
    assert.equal(judge({ ...high, category: "financial" }, inForce).state, "within");
    assert.equal(judge({ ...high, category: "fairness" }, inForce).state, "outside");
  });

  it("counts an unrated risk as not within appetite", () => {
    const j = judge({ category: "financial", residualTier: null, status: "identified" }, inForce);
    assert.equal(j.state, "unrated");
    assert.equal(notWithinAppetite(j), true);
  });

  it("does not judge a closed risk", () => {
    const j = judge({ category: "fairness", residualTier: "critical", status: "closed" }, inForce);
    assert.equal(j.state, "closed");
    assert.equal(notWithinAppetite(j), false);
  });

  it("matches what the dashboard always did when nothing is signed off", () => {
    for (const [tier, outside] of [["low", false], ["medium", false], ["high", true], ["critical", true]] as const) {
      const j = judge({ category: null, residualTier: tier, status: "treating" }, {});
      assert.equal(notWithinAppetite(j), outside, tier);
    }
  });
});
