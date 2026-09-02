import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluate } from "@/lib/templates/logic";
import { score } from "@/lib/templates/scoring";
import { templateDefinition, type TemplateDefinition } from "@/lib/templates/schema";
import { validateTemplate } from "@/lib/templates/validate";
import { LEGAL_REFERENCES, SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { questionsOf } from "@/lib/templates/logic";

/** Parsing through zod applies the same defaults the real loader applies. */
function define(input: unknown): TemplateDefinition {
  return templateDefinition.parse(input);
}

const TRANSFER = define({
  schema: {
    sections: [
      {
        key: "transfer",
        title: "International transfer",
        questions: [
          {
            key: "transfers_abroad",
            label: "Does this processing transfer personal data outside the UK?",
            type: "boolean",
            required: true,
          },
          {
            key: "destination",
            label: "Destination country",
            type: "country",
            showWhen: { op: "equals", question: "transfers_abroad", value: true },
            required: true,
          },
          {
            key: "safeguard",
            label: "Which safeguard applies?",
            type: "single_select",
            options: [
              { value: "adequacy", label: "Adequacy regulations" },
              { value: "idta", label: "IDTA or Addendum" },
              { value: "none", label: "None identified" },
            ],
            showWhen: { op: "answered", question: "destination" },
            requireWhen: { op: "answered", question: "destination" },
          },
          {
            key: "likelihood",
            label: "Likelihood of harm",
            type: "single_select",
            options: [
              { value: "rare", label: "Rare" },
              { value: "possible", label: "Possible" },
              { value: "likely", label: "Likely" },
            ],
            required: true,
          },
          {
            key: "impact",
            label: "Impact on data subjects",
            type: "single_select",
            options: [
              { value: "minor", label: "Minor" },
              { value: "moderate", label: "Moderate" },
              { value: "severe", label: "Severe" },
            ],
            required: true,
          },
        ],
      },
    ],
  },
  scoring: {
    method: "likelihood_impact",
    likelihoodQuestion: "likelihood",
    impactQuestion: "impact",
    likelihoodScale: { rare: 1, possible: 2, likely: 3 },
    impactScale: { minor: 1, moderate: 2, severe: 3 },
    bands: [
      { min: 1, max: 2, label: "Low", tier: "low" },
      { min: 3, max: 4, label: "Medium", tier: "medium" },
      { min: 5, max: 6, label: "High", tier: "high" },
      { min: 7, max: 9, label: "Critical", tier: "critical" },
    ],
  },
});

describe("conditional visibility", () => {
  it("hides a dependent question until its trigger is answered", () => {
    const r = evaluate(TRANSFER.schema, { transfers_abroad: false });
    assert.equal(r.questions.destination.visible, false);
    assert.equal(r.questions.safeguard.visible, false);
  });

  it("reveals the chain once the trigger is set", () => {
    const r = evaluate(TRANSFER.schema, {
      transfers_abroad: true,
      destination: "US",
    });
    assert.equal(r.questions.destination.visible, true);
    assert.equal(r.questions.safeguard.visible, true);
    assert.equal(r.questions.safeguard.required, true);
  });

  it("cascades a hidden answer so it stops steering downstream questions", () => {
    // The destination is still on record from before the answer changed. If it
    // were not masked, safeguard would stay visible on the strength of an
    // answer to a question that is no longer being asked.
    const r = evaluate(TRANSFER.schema, {
      transfers_abroad: false,
      destination: "US",
    });
    assert.equal(r.questions.destination.visible, false);
    assert.equal(r.questions.safeguard.visible, false);
  });

  it("marks a stale answer suppressed rather than forgetting it", () => {
    const r = evaluate(TRANSFER.schema, {
      transfers_abroad: false,
      destination: "US",
    });
    // The auditor needs to see the section was asked and became inapplicable,
    // not that it never existed.
    assert.equal(r.questions.destination.suppressed, true);
    assert.equal(r.questions.safeguard.suppressed, false);
  });

  it("never requires a question it is not asking", () => {
    const r = evaluate(TRANSFER.schema, { transfers_abroad: false });
    assert.equal(r.questions.destination.required, false);
  });

  it("lists visible questions in template order", () => {
    const r = evaluate(TRANSFER.schema, { transfers_abroad: true, destination: "US" });
    assert.deepEqual(r.visibleOrder, [
      "transfers_abroad",
      "destination",
      "safeguard",
      "likelihood",
      "impact",
    ]);
  });
});

describe("scoring", () => {
  it("multiplies likelihood by impact and bands the result", () => {
    const answers = { likelihood: "likely", impact: "severe", transfers_abroad: false };
    const r = score(TRANSFER.scoring, TRANSFER.schema, answers, evaluate(TRANSFER.schema, answers));
    assert.equal(r.scored, true);
    assert.equal(r.scored && r.score, 9);
    assert.equal(r.scored && r.band.tier, "critical");
  });

  it("shows its working", () => {
    const answers = { likelihood: "possible", impact: "moderate", transfers_abroad: false };
    const r = score(TRANSFER.scoring, TRANSFER.schema, answers, evaluate(TRANSFER.schema, answers));
    assert.equal(r.scored && r.score, 4);
    assert.deepEqual(
      r.scored && r.components.map((c) => [c.question, c.contribution]),
      [["likelihood", 2], ["impact", 2]],
    );
  });

  it("refuses to score from partial inputs", () => {
    // A number derived from half its inputs looks authoritative and is not.
    const answers = { likelihood: "likely", transfers_abroad: false };
    const r = score(TRANSFER.scoring, TRANSFER.schema, answers, evaluate(TRANSFER.schema, answers));
    assert.equal(r.scored, false);
    assert.equal(r.scored === false && r.reason, "incomplete");
  });

  it("sums weights across a multi-select", () => {
    const def = define({
      schema: {
        sections: [
          {
            key: "ai",
            title: "AI characteristics",
            questions: [
              {
                key: "traits",
                label: "Which apply?",
                type: "multi_select",
                options: [
                  { value: "automated_decision", label: "Automated decisions", weight: 4 },
                  { value: "special_category", label: "Special category data", weight: 3 },
                  { value: "public_facing", label: "Public facing", weight: 2 },
                ],
              },
            ],
          },
        ],
      },
      scoring: {
        method: "weighted_sum",
        questions: ["traits"],
        bands: [
          { min: 0, max: 3, label: "Low", tier: "low" },
          { min: 4, max: 6, label: "Medium", tier: "medium" },
          { min: 7, max: 20, label: "High", tier: "high" },
        ],
      },
    });
    const answers = { traits: ["automated_decision", "special_category"] };
    const r = score(def.scoring, def.schema, answers, evaluate(def.schema, answers));
    assert.equal(r.scored && r.score, 7);
    assert.equal(r.scored && r.band.tier, "high");
  });
});

describe("publish-time validation", () => {
  it("passes a well-formed template", () => {
    assert.deepEqual(validateTemplate(TRANSFER), []);
  });

  it("rejects a condition on a question that does not exist", () => {
    const def = define({
      schema: {
        sections: [
          {
            key: "s",
            title: "S",
            questions: [
              {
                key: "a",
                label: "A",
                type: "boolean",
                showWhen: { op: "equals", question: "ghost", value: true },
              },
            ],
          },
        ],
      },
      scoring: { method: "none" },
    });
    const problems = validateTemplate(def);
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /unknown question "ghost"/);
  });

  it("rejects a circular dependency", () => {
    const def = define({
      schema: {
        sections: [
          {
            key: "s",
            title: "S",
            questions: [
              {
                key: "a",
                label: "A",
                type: "boolean",
                showWhen: { op: "answered", question: "b" },
              },
              {
                key: "b",
                label: "B",
                type: "boolean",
                showWhen: { op: "answered", question: "a" },
              },
            ],
          },
        ],
      },
      scoring: { method: "none" },
    });
    const problems = validateTemplate(def);
    assert.equal(problems.length > 0, true);
    assert.match(problems[0].message, /Circular dependency/);
  });

  it("rejects duplicate question keys", () => {
    const def = define({
      schema: {
        sections: [
          {
            key: "s",
            title: "S",
            questions: [
              { key: "a", label: "First", type: "boolean" },
              { key: "a", label: "Second", type: "boolean" },
            ],
          },
        ],
      },
      scoring: { method: "none" },
    });
    assert.match(validateTemplate(def)[0].message, /Duplicate question key/);
  });

  it("rejects overlapping score bands", () => {
    const def = define({
      schema: {
        sections: [
          {
            key: "s",
            title: "S",
            questions: [
              {
                key: "l",
                label: "L",
                type: "single_select",
                options: [{ value: "x", label: "X" }],
              },
              {
                key: "i",
                label: "I",
                type: "single_select",
                options: [{ value: "y", label: "Y" }],
              },
            ],
          },
        ],
      },
      scoring: {
        method: "likelihood_impact",
        likelihoodQuestion: "l",
        impactQuestion: "i",
        likelihoodScale: { x: 1 },
        impactScale: { y: 1 },
        bands: [
          { min: 1, max: 5, label: "Low", tier: "low" },
          { min: 4, max: 9, label: "High", tier: "high" },
        ],
      },
    });
    assert.match(
      validateTemplate(def).map((p) => p.message).join(" "),
      /overlap/,
    );
  });

  it("rejects a scale that misses one of the question's options", () => {
    const def = define({
      schema: {
        sections: [
          {
            key: "s",
            title: "S",
            questions: [
              {
                key: "l",
                label: "L",
                type: "single_select",
                options: [
                  { value: "low", label: "Low" },
                  { value: "high", label: "High" },
                ],
              },
              { key: "i", label: "I", type: "single_select", options: [{ value: "y", label: "Y" }] },
            ],
          },
        ],
      },
      scoring: {
        method: "likelihood_impact",
        likelihoodQuestion: "l",
        impactQuestion: "i",
        likelihoodScale: { low: 1 },
        impactScale: { y: 1 },
        bands: [{ min: 1, max: 9, label: "All", tier: "low" }],
      },
    });
    assert.match(
      validateTemplate(def).map((p) => p.message).join(" "),
      /Option "high" of "l" has no score/,
    );
  });

  it("rejects a select question with no options", () => {
    const def = define({
      schema: {
        sections: [
          { key: "s", title: "S", questions: [{ key: "a", label: "A", type: "single_select" }] },
        ],
      },
      scoring: { method: "none" },
    });
    assert.match(validateTemplate(def)[0].message, /needs options/);
  });
});

describe("the shipped library", () => {
  it("passes its own validator, every template", () => {
    for (const t of SYSTEM_TEMPLATES) {
      const shape = templateDefinition.safeParse(t.definition);
      assert.ok(shape.success, `${t.name} does not match the schema`);
      assert.deepEqual(
        validateTemplate(shape.data),
        [],
        `${t.name} has structural problems`,
      );
    }
  });

  it("never cites a legal reference that does not exist", () => {
    // A citation that does not resolve renders as a broken reference beside a
    // question. Adding eugdpr.art30 to five questions without adding it to the
    // library is exactly the mistake this catches.
    const codes = new Set<string>(LEGAL_REFERENCES.map((r) => r.code));
    for (const t of SYSTEM_TEMPLATES) {
      for (const { question } of questionsOf(t.definition.schema)) {
        for (const ref of question.legalRefs ?? []) {
          assert.ok(codes.has(ref), `${t.name} · ${question.key} cites unknown "${ref}"`);
        }
      }
    }
  });

  it("scores on a scale whose options actually exist", () => {
    // A likelihood scale keyed on an option the question does not offer scores
    // nothing, and reports itself as incomplete rather than as misconfigured.
    for (const t of SYSTEM_TEMPLATES) {
      const scoring = t.definition.scoring;
      if (scoring.method !== "likelihood_impact") continue;
      const byKey = new Map(
        questionsOf(t.definition.schema).map(({ question }) => [question.key, question]),
      );
      for (const [qKey, scale] of [
        [scoring.likelihoodQuestion, scoring.likelihoodScale],
        [scoring.impactQuestion, scoring.impactScale],
      ] as const) {
        const question = byKey.get(qKey);
        assert.ok(question, `${t.name} scores on missing question ${qKey}`);
        const offered = new Set((question.options ?? []).map((o) => o.value));
        for (const value of Object.keys(scale)) {
          assert.ok(offered.has(value), `${t.name} · ${qKey} scales "${value}", which it does not offer`);
        }
      }
    }
  });

  it("gives every weighted question at least one weighted option", () => {
    for (const t of SYSTEM_TEMPLATES) {
      const scoring = t.definition.scoring;
      if (scoring.method !== "weighted_sum") continue;
      const byKey = new Map(
        questionsOf(t.definition.schema).map(({ question }) => [question.key, question]),
      );
      for (const qKey of scoring.questions) {
        const question = byKey.get(qKey);
        assert.ok(question, `${t.name} sums missing question ${qKey}`);
        assert.ok(
          (question.options ?? []).some((o) => o.weight !== undefined),
          `${t.name} · ${qKey} is summed but no option carries a weight`,
        );
      }
    }
  });
});
