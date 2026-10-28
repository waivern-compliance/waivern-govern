import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DSIT_TO_NIST, GOVERN_FEATURES_TO_NIST, NIST_TO_DSIT } from "@/lib/ai-frameworks/crosswalk";
import {
  NIST_CATEGORIES,
  NIST_FUNCTIONS,
  NIST_LEGAL_REFERENCES,
  NIST_SUBCATEGORIES,
  TRUSTWORTHY_CHARACTERISTICS,
  nistCode,
  nistSubcategory,
  subcategoryId,
} from "@/lib/ai-frameworks/nist-ai-rmf";
import { playbookFor, playbookSubcategories } from "@/lib/ai-frameworks/nist-playbook";
import { AI_RISK_CATEGORIES } from "@/lib/risk/categories";
import { LEGAL_REFERENCES } from "@/lib/templates/library";

const count = <T,>(xs: readonly T[], key: (x: T) => string) =>
  Object.fromEntries(NIST_FUNCTIONS.map((f) => [f.fn, xs.filter((x) => key(x) === f.fn).length]));

describe("NIST AI RMF 1.0, as published", () => {
  it("has its four functions, nineteen categories and seventy-two subcategories", () => {
    assert.deepEqual(count(NIST_CATEGORIES, (c) => c.fn), { GOVERN: 6, MAP: 5, MEASURE: 4, MANAGE: 4 });
    assert.deepEqual(count(NIST_SUBCATEGORIES, (s) => s.fn), { GOVERN: 19, MAP: 18, MEASURE: 22, MANAGE: 13 });
  });

  it("numbers every category's subcategories from one, without gaps", () => {
    for (const c of NIST_CATEGORIES) {
      const ns = NIST_SUBCATEGORIES.filter((s) => s.fn === c.fn && s.category === c.category).map((s) => s.n);
      assert.deepEqual(ns, ns.map((_, i) => i + 1), `${c.fn} ${c.category}`);
    }
  });

  it("carries NIST's wording, whole", () => {
    assert.equal(
      nistSubcategory("GOVERN 2.3")?.text,
      "Executive leadership of the organization takes responsibility for decisions about risks associated with AI system development and deployment.",
    );
    for (const s of NIST_SUBCATEGORIES) {
      assert.match(s.text, /\.$/, `${subcategoryId(s)} is cut short`);
      assert.doesNotMatch(s.text, /Continued on next page|Page \d+|NIST AI 100-1/, `${subcategoryId(s)} carries page furniture`);
    }
  });

  it("names seven trustworthiness characteristics, each measured under MEASURE 2", () => {
    assert.equal(TRUSTWORTHY_CHARACTERISTICS.length, 7);
    for (const c of TRUSTWORTHY_CHARACTERISTICS) assert.ok(nistSubcategory(c.measuredBy), c.measuredBy);
  });
});

describe("the reference library", () => {
  it("holds every function, category and subcategory under a unique code", () => {
    assert.equal(NIST_LEGAL_REFERENCES.length, 4 + 19 + 72);
    const codes = LEGAL_REFERENCES.map((r) => r.code);
    assert.equal(new Set(codes).size, codes.length);
    assert.ok(codes.includes("nist.airmf.measure.2.11"));
    assert.equal(nistCode("GOVERN", 6), "nist.airmf.govern.6");
  });
});

describe("the Playbook", () => {
  it("has suggestions and documentation questions for exactly the seventy-two subcategories", () => {
    assert.deepEqual(playbookSubcategories().sort(), NIST_SUBCATEGORIES.map(subcategoryId).sort());
    for (const id of playbookSubcategories()) {
      const entry = playbookFor(id)!;
      assert.ok(entry.actions.length > 0, `${id} has no actions`);
      assert.ok(entry.documentation.length > 0, `${id} has no documentation questions`);
      for (const line of [...entry.actions, ...entry.documentation]) {
        assert.doesNotMatch(line, /of 142|=====PAGE/, `${id} carries page furniture`);
      }
    }
  });
});

describe("the crosswalk", () => {
  const known = (id: string) => assert.ok(nistSubcategory(id), `${id} is not a NIST subcategory`);

  it("maps every DSIT category, citing only real subcategories", () => {
    assert.deepEqual(Object.keys(DSIT_TO_NIST).sort(), AI_RISK_CATEGORIES.map((c) => c.value).sort());
    for (const m of Object.values(DSIT_TO_NIST)) m.subcategories.forEach(known);
    for (const f of GOVERN_FEATURES_TO_NIST) f.subcategories.forEach(known);
  });

  it("files every characteristic back into a DSIT category that maps forward to it", () => {
    for (const c of TRUSTWORTHY_CHARACTERISTICS) {
      const back = NIST_TO_DSIT[c.value];
      assert.ok(
        DSIT_TO_NIST[back].characteristics.includes(c.value),
        `${c.value} files back into ${back}, which does not map to it`,
      );
    }
  });
});
