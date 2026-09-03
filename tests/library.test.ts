import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluate, questionsOf } from "@/lib/templates/logic";
import { LEGAL_REFERENCES, SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { templateDefinition } from "@/lib/templates/schema";
import type { Answers } from "@/lib/templates/logic";
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
    // Distinct kinds, not a list: more than one template may serve a kind —
    // the UK Article 35(7) DPIA and the CNIL PIA are both DPIAs, and offering
    // both is the point. What this guards is the set of kinds shipping at all.
    const kinds = [...new Set(SYSTEM_TEMPLATES.map((t) => t.kind))].sort();
    assert.deepEqual(kinds, ["ai_risk", "dpia", "lia", "screening", "tia", "tra"]);
  });

  it("gives templates sharing a kind distinct names", () => {
    // Two DPIAs called "Data protection impact assessment" would be
    // indistinguishable in the list somebody picks from when starting one.
    const names = SYSTEM_TEMPLATES.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
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

describe("legitimate interests scoring", () => {
  const lia = templateDefinition.parse(
    SYSTEM_TEMPLATES.find((t) => t.kind === "lia")!.definition,
  );

  const base: Answers = {
    activity_name: "Fraud detection on card payments",
    interest: "Detecting fraudulent transactions before they complete",
    whose_interest: ["controller"],
    benefit: "Prevents loss to customers and to us",
    lawful_and_specific: "yes",
    unlawful_consequence: "We would have to stop screening transactions",
    necessity: "The pattern is only visible across transactions",
    less_intrusive: "no",
    data_minimised: "Transaction metadata only",
    relationship: "existing_customer",
    reasonable_expectations: "clearly",
    vulnerable: "no",
    special_category: "no",
    intrusiveness: "low",
    impact: "A declined transaction requiring a call",
    safeguards: "Human review before any account is blocked",
    objection: "Reviewed on request",
    transparency: "Privacy notice, section 4",
    conclusion: "yes",
    conclusion_reasoning: "Expected, necessary and low impact",
    assessed_by: "DPO",
    review_date: "2027-01-01",
  };

  const rate = (answers: Answers) =>
    score(lia.scoring, lia.schema, answers, evaluate(lia.schema, answers));

  it("reads a well-founded interest as straightforward", () => {
    const r = rate(base);
    assert.ok(r.scored);
    assert.equal(r.band?.tier, "low");
  });

  it("reads an unexpected, intrusive case against strangers as hard to sustain", () => {
    const weak = {
      ...base,
      relationship: "none",
      reasonable_expectations: "unlikely",
      intrusiveness: "high",
      less_intrusive: "not_considered",
      lawful_and_specific: "partly",
      conclusion: "no",
    };
    const r = rate(weak);
    assert.ok(r.scored);
    assert.ok(
      r.band?.tier === "high" || r.band?.tier === "critical",
      `expected high or critical, got ${r.band?.tier} at ${r.score}`,
    );
  });

  it("weighs children heavily enough to change the answer on their own", () => {
    // The balancing test turns on whether the people affected can be expected
    // to look after their own interests. A template that treated children as
    // one factor among many would be wrong about the thing that matters most.
    const withChildren = rate({ ...base, vulnerable: "yes" });
    const without = rate(base);
    assert.ok(withChildren.scored, "children case should score");
    assert.ok(without.scored, "base case should score");
    if (!withChildren.scored || !without.scored) return;
    assert.ok(
      withChildren.score > without.score,
      "involving children must raise the score",
    );
  });

  it("asks why a less intrusive option was rejected, only when one was", () => {
    const rejected = evaluate(lia.schema, { ...base, less_intrusive: "yes_rejected" });
    assert.equal(rejected.questions.less_intrusive_detail?.visible, true);
    assert.equal(rejected.questions.less_intrusive_detail?.required, true);

    const none = evaluate(lia.schema, base);
    assert.equal(none.questions.less_intrusive_detail?.visible, false);
  });
});

describe("the CNIL PIA", () => {
  const pia = templateDefinition.parse(
    SYSTEM_TEMPLATES.find((t) => t.name.includes("CNIL"))!.definition,
  );

  it("rates all three feared events the method requires", () => {
    const keys = new Set(questionsOf(pia.schema).map(({ question }) => question.key));
    for (const event of ["access", "modification", "disappearance"]) {
      for (const part of ["impacts", "sources", "measures", "severity", "likelihood"]) {
        assert.ok(keys.has(`${event}_${part}`), `missing ${event}_${part}`);
      }
    }
  });

  it("scores on the overall judgement, not on one of the three", () => {
    // Deliberate: a maximum the platform took across three events would look
    // like an assessment somebody made, and would not be one.
    assert.equal(pia.scoring.method, "likelihood_impact");
    if (pia.scoring.method !== "likelihood_impact") return;
    assert.equal(pia.scoring.likelihoodQuestion, "overall_likelihood");
    assert.equal(pia.scoring.impactQuestion, "overall_severity");
  });

  it("lands on the same four tiers as the register", () => {
    // A PIA and a UK DPIA have to be comparable once they reach the board.
    if (pia.scoring.method !== "likelihood_impact") return;
    assert.deepEqual(
      pia.scoring.bands.map((b) => b.tier),
      ["low", "medium", "high", "critical"],
    );
    assert.deepEqual(
      pia.scoring.bands.map((b) => [b.min, b.max]),
      [[1, 3], [4, 7], [8, 11], [12, 16]],
    );
  });

  it("asks for a transfer impact assessment only where data leaves the EEA", () => {
    const inside = evaluate(pia.schema, { transfers_outside_eea: false });
    assert.equal(inside.questions.transfer_tool?.visible, false);

    const outside = evaluate(pia.schema, { transfers_outside_eea: true });
    assert.equal(outside.questions.transfer_tool?.visible, true);
    assert.equal(outside.questions.transfer_tool?.required, true);
  });
});

describe("legal references a lawyer can check", () => {
  it("gives every reference a link to its source", () => {
    // A citation nobody can follow asks a reviewer to take our word for it.
    for (const ref of LEGAL_REFERENCES) {
      assert.ok(ref.url, `${ref.code} has no url`);
      assert.match(ref.url!, /^https:\/\//, `${ref.code} url is not https`);
    }
  });

  it("gives every reference a regime, a citation and a title", () => {
    // The citation says where to look; the title says why it is cited. Both
    // are rendered, so both have to be there.
    for (const ref of LEGAL_REFERENCES) {
      assert.ok(ref.regime.length > 1, `${ref.code} regime`);
      assert.ok(ref.citation.length > 1, `${ref.code} citation`);
      assert.ok(ref.title.length > 5, `${ref.code} title`);
    }
  });

  it("keeps UK and EU articles distinguishable", () => {
    // Article 35 exists in both regimes. The regime prefix is what stops a
    // reviewer citing the wrong one, so the pair must never collide.
    const seen = new Map<string, string>();
    for (const ref of LEGAL_REFERENCES) {
      const key = `${ref.regime} ${ref.citation}`;
      assert.ok(!seen.has(key), `${key} is claimed by both ${seen.get(key)} and ${ref.code}`);
      seen.set(key, ref.code);
    }
  });

  it("points UK articles at the article, not the whole regulation", () => {
    // legislation.gov.uk supports article-level links and EUR-Lex does not, so
    // the UK half of the library is expected to be more precise.
    for (const ref of LEGAL_REFERENCES.filter((r) => r.code.startsWith("ukgdpr."))) {
      assert.match(ref.url!, /\/article\/\d+$/, `${ref.code} is not an article-level link`);
    }
  });
});
