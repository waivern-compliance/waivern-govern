import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AI_RISK_CATEGORIES } from "@/lib/risk/categories";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { evaluate, questionsOf } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { score } from "@/lib/templates/scoring";
import { WELL_GOVERNED } from "./fixtures/dsit-answers";

const dsit = templateDefinition.parse(
  SYSTEM_TEMPLATES.find((t) => t.name === "AI risk identification (DSIT toolkit)")!.definition,
);
const original = templateDefinition.parse(
  SYSTEM_TEMPLATES.find((t) => t.name === "AI risk assessment")!.definition,
);

function question(definition: typeof dsit, key: string) {
  return questionsOf(definition.schema).find(({ question: q }) => q.key === key)?.question;
}


describe("DSIT AI risk identification template", () => {
  it("gives every toolkit risk category a section of its own", () => {
    // The toolkit's categories are the structure an auditor will look for.
    // Folding one into another hides whether it was considered at all.
    const titles = dsit.schema.sections.map((s) => s.title);
    for (const c of AI_RISK_CATEGORIES) {
      assert.ok(titles.includes(c.label), `no section for ${c.label}`);
    }
  });

  it("lets a finding be filed under any category, or none", () => {
    const options = question(dsit, "risk_categories")!.options!.map((o) => o.value);
    assert.deepEqual(
      options.sort(),
      [...AI_RISK_CATEGORIES.map((c) => c.value), "none"].sort(),
    );
  });

  it("asks the register's questions in the register's words", () => {
    // The AI register and the approval workflow read these keys out of any AI
    // assessment. If this template drifted from the original, a system assessed
    // with it would show as unmonitored or unsupervised when it is neither.
    for (const key of ["consequence", "human_oversight", "monitoring", "bias_considered", "contestability", "personal_data", "review_interval"]) {
      const ours = question(dsit, key);
      const theirs = question(original, key);
      assert.ok(ours, `missing ${key}`);
      assert.equal(ours.type, theirs!.type, key);
      assert.deepEqual(
        (ours.options ?? []).map((o) => o.value).filter((v) => v !== "fairness"),
        (theirs!.options ?? []).map((o) => o.value),
        key,
      );
    }
  });

  it("rates a well-governed internal tool as minimal", () => {
    const r = score(dsit.scoring, dsit.schema, WELL_GOVERNED, evaluate(dsit.schema, WELL_GOVERNED));
    assert.equal(r.scored, true);
    assert.equal(r.scored && r.band.tier, "low");
  });

  it("cannot rate an unsupervised public decision-maker as anything but critical", () => {
    const worst = {
      ...WELL_GOVERNED,
      public_facing: true,
      ai_disclosure: "It is not disclosed",
      consequence: "decides",
      solely_automated: "yes",
      human_oversight: "none",
      contestability: "none",
      monitoring: ["none"],
      bias_considered: "not_done",
      intersectional: "not_compared",
      stress_testing: "none",
      people_aware: "not_told",
      explainability: "cannot",
      atrs_status: "required_not_started",
      audience: ["public", "vulnerable"],
      vulnerable_protection: "None specific",
      accountable_owner: "no",
      fallback: "none",
      incident_plan: "none",
    };
    const r = score(dsit.scoring, dsit.schema, worst, evaluate(dsit.schema, worst));
    assert.equal(r.scored && r.band.tier, "critical");
  });

  it("asks how people are told about AI only where the public meets it", () => {
    const internal = evaluate(dsit.schema, WELL_GOVERNED);
    assert.equal(internal.questions.ai_disclosure.visible, false);
    const publicFacing = evaluate(dsit.schema, { ...WELL_GOVERNED, public_facing: true });
    assert.equal(publicFacing.questions.ai_disclosure.visible, true);
    assert.equal(publicFacing.questions.ai_disclosure.required, true);
  });
});
