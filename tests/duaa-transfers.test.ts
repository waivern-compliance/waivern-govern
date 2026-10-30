import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADEQUACY_WORDS, UK_APPROVAL_WORDS } from "@/lib/countries/labels";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { LEGAL_REFERENCES } from "@/lib/templates/library/legal-references";
import { evaluate } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { describe as describeCondition } from "@/lib/workflow/routing";

const tra = templateDefinition.parse(SYSTEM_TEMPLATES.find((t) => t.kind === "tra")!.definition).schema;

describe("the UK transfer risk assessment", () => {
  it("asks whether UK approval covers this transfer, and skips the data protection test, for an approved destination", () => {
    const r = evaluate(tra, { mechanism: "adequacy" });
    assert.equal(r.questions.approval_scope.required, true);
    assert.equal(r.sections.destination_law.visible, false);
    assert.equal(r.sections.data_protection_test.visible, false);
  });

  it("applies the data protection test to every Article 46 safeguard", () => {
    for (const mechanism of ["idta", "addendum", "bcr", "other_safeguard"]) {
      const r = evaluate(tra, { mechanism });
      assert.equal(r.sections.data_protection_test.visible, true, mechanism);
      assert.equal(r.questions.dpt_conclusion.required, true, mechanism);
      assert.equal(r.questions.dpt_nature_volume.required, true, mechanism);
      assert.equal(r.questions.mechanism_evidence.required, true, mechanism);
    }
  });

  it("asks what happens next when protection would be materially lower", () => {
    assert.equal(evaluate(tra, { mechanism: "idta", dpt_conclusion: "not_met" }).questions.dpt_not_met_action.required, true);
    assert.equal(evaluate(tra, { mechanism: "idta", dpt_conclusion: "met" }).questions.dpt_not_met_action.visible, false);
  });

  it("does not apply the test to a derogation", () => {
    const r = evaluate(tra, { mechanism: "derogation" });
    assert.equal(r.questions.derogation_basis.required, true);
    assert.equal(r.sections.data_protection_test.visible, false);
  });

  it("cites the transfer provisions as they now stand, not the omitted Article 45", () => {
    const refs = tra.sections.flatMap((s) => s.questions.flatMap((q) => q.legalRefs));
    assert.ok(!refs.includes("ukgdpr.art45"));
    for (const code of ["ukgdpr.art44a", "ukgdpr.art45a", "ukgdpr.art46.1a"]) {
      assert.ok(refs.includes(code), code);
      assert.ok(LEGAL_REFERENCES.some((r) => r.code === code), `${code} is in the library`);
    }
  });
});

describe("the words", () => {
  it("speak of UK approval, keeping the stored values and the EU's own word", () => {
    assert.deepEqual(Object.keys(UK_APPROVAL_WORDS), Object.keys(ADEQUACY_WORDS));
    assert.ok(Object.values(UK_APPROVAL_WORDS).every((w) => !/adequa/i.test(w)));
    assert.match(describeCondition({ op: "transferToNonAdequate" }), /Article 45A/);
  });
});
