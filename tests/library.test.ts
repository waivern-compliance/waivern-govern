import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluate, questionsOf } from "@/lib/templates/logic";
import { LEGAL_REFERENCES, SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { templateDefinition } from "@/lib/templates/schema";
import { score } from "@/lib/templates/scoring";
import { validateTemplate } from "@/lib/templates/validate";

const KNOWN_REFS = new Set<string>(LEGAL_REFERENCES.map((r) => r.code));

describe("shipped template library", () => {
  for (const t of SYSTEM_TEMPLATES) {
    describe(t.name, () => {
      const definition = templateDefinition.parse(t.definition);

      it("parses and passes publish-time validation", () => {
        assert.deepEqual(validateTemplate(definition), []);
      });

      it("cites only references that exist in the library", () => {
        // A dangling code renders as a missing citation beside a question about
        // someone's legal obligations, which is worse than showing nothing.
        const dangling = questionsOf(definition.schema)
          .flatMap(({ question }) =>
            question.legalRefs.filter((r) => !KNOWN_REFS.has(r)).map((r) => `${question.key}: ${r}`),
          );
        assert.deepEqual(dangling, []);
      });

      it("asks something before any answer is given", () => {
        // A template whose first screen is empty because everything is
        // conditional is unusable, and the fault is silent.
        const r = evaluate(definition.schema, {});
        assert.equal(r.visibleOrder.length > 0, true);
      });

      it("requires nothing that it is not asking", () => {
        const r = evaluate(definition.schema, {});
        const required = Object.values(r.questions).filter((q) => q.required && !q.visible);
        assert.deepEqual(required.map((q) => q.key), []);
      });

      it("does not score an empty assessment", () => {
        const r = evaluate(definition.schema, {});
        const s = score(definition.scoring, definition.schema, {}, r);
        assert.equal(s.scored, false);
      });
    });
  }

  it("has no duplicate reference codes", () => {
    const codes = LEGAL_REFERENCES.map((r) => r.code);
    assert.equal(new Set(codes).size, codes.length);
  });

  it("covers every template kind the platform advertises today", () => {
    const kinds = SYSTEM_TEMPLATES.map((t) => t.kind).sort();
    assert.deepEqual(kinds, ["ai_risk", "dpia", "screening", "tia", "tra"]);
  });
});

describe("AI risk scoring", () => {
  const ai = templateDefinition.parse(
    SYSTEM_TEMPLATES.find((t) => t.kind === "ai_risk")!.definition,
  );

  const base = {
    use_case_name: "Automated subtitle generation",
    purpose: "Generate subtitles for archive content",
    ai_type: "generative",
    provenance: "third_party_api",
    lifecycle_stage: "production",
    affects_people: true,
    audience: ["public"],
    editorial_output: true,
    disclosure: "Labelled as machine-generated in the player",
    personal_data: false,
    data_provenance: "vendor_asserted",
    sensitive_inputs: "no",
    bias_considered: "reviewed",
    affected_groups: "Speakers of regional accents and minority languages",
    contestability: "informal",
    human_oversight: "post_hoc",
    monitoring: ["accuracy", "complaints"],
    kill_switch: "Editorial systems lead can disable the pipeline",
    review_interval: "biannual",
  };

  it("scores a realistic use case into a defensible band", () => {
    const answers = { ...base, consequence: "influences" };
    const r = score(ai.scoring, ai.schema, answers, evaluate(ai.schema, answers));
    assert.equal(r.scored, true);
    // consequence 2 + public 3 + vendor_asserted 3 + no 0 + reviewed 2
    //   + informal 2 + post_hoc 3 + monitoring 0 = 15
    assert.equal(r.scored && r.score, 15);
    assert.equal(r.scored && r.band.tier, "high");
  });

  it("rates an unsupervised deciding system higher than a monitored advisory one", () => {
    const advisory = { ...base, consequence: "influences" };
    const deciding = {
      ...base,
      consequence: "decides",
      human_oversight: "none",
      contestability: "none",
      monitoring: ["none"],
    };
    const a = score(ai.scoring, ai.schema, advisory, evaluate(ai.schema, advisory));
    const d = score(ai.scoring, ai.schema, deciding, evaluate(ai.schema, deciding));
    assert.equal(a.scored && d.scored && d.score > a.score, true);
    assert.equal(d.scored && d.band.tier, "critical");
  });

  it("stops asking about monitoring for a system not yet running", () => {
    const proposed = { ...base, lifecycle_stage: "proposed", consequence: "influences" };
    const r = evaluate(ai.schema, proposed);
    assert.equal(r.questions.monitoring.visible, false);
    // The monitoring answer is on record but must not contribute to the score.
    assert.equal(r.questions.monitoring.suppressed, true);
  });
});
