import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeCondition, describeType, questionLabels } from "@/lib/templates/describe";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import type { Condition, Question } from "@/lib/templates/schema";

const LABELS = new Map([
  ["leaves_uk", "Personal data leaves the UK"],
  ["volume", "How many people are affected"],
]);

describe("conditions in English", () => {
  it("names the question rather than its key", () => {
    const c = { op: "equals", question: "leaves_uk", value: true } as Condition;
    assert.match(describeCondition(c, LABELS), /Personal data leaves the UK/);
    // Without labels it still reads, just less well.
    assert.match(describeCondition(c), /leaves_uk/);
  });

  it("describes every operator the schema allows", () => {
    const cases: [Condition, RegExp][] = [
      [{ op: "answered", question: "leaves_uk" }, /has been answered/],
      [{ op: "equals", question: "leaves_uk", value: true }, /is true/],
      [{ op: "notEquals", question: "leaves_uk", value: true }, /is not true/],
      [{ op: "includes", question: "leaves_uk", value: "US" }, /includes "US"/],
      [{ op: "greaterThan", question: "volume", value: 100 }, /more than 100/],
      [{ op: "lessThan", question: "volume", value: 10 }, /less than 10/],
    ];
    for (const [condition, expected] of cases) {
      assert.match(describeCondition(condition, LABELS), expected, condition.op);
    }
  });

  it("joins compound conditions readably", () => {
    const and = {
      op: "and",
      all: [
        { op: "equals", question: "leaves_uk", value: true },
        { op: "greaterThan", question: "volume", value: 100 },
      ],
    } as Condition;
    assert.equal(
      describeCondition(and, LABELS),
      '“Personal data leaves the UK” is true, and “How many people are affected” is more than 100',
    );

    const or = { op: "or", any: [{ op: "answered", question: "volume" }] } as Condition;
    assert.match(describeCondition(or, LABELS), /has been answered/);
  });

  it("handles negation and nesting", () => {
    const nested = {
      op: "not",
      condition: {
        op: "or",
        any: [
          { op: "equals", question: "leaves_uk", value: false },
          { op: "lessThan", question: "volume", value: 5 },
        ],
      },
    } as Condition;
    const text = describeCondition(nested, LABELS);
    assert.match(text, /it is not the case that/);
    assert.match(text, /, or /);
  });
});

describe("against the shipped library", () => {
  it("describes every condition in every template without throwing", () => {
    // The real test of the describer: the templates that actually ship, whose
    // logic is the most complex the product has.
    let described = 0;
    for (const entry of SYSTEM_TEMPLATES) {
      const labels = questionLabels(entry.definition.schema);
      for (const section of entry.definition.schema.sections) {
        if (section.showWhen) {
          assert.ok(describeCondition(section.showWhen, labels).length > 0);
          described += 1;
        }
        for (const q of section.questions) {
          for (const c of [q.showWhen, q.requireWhen]) {
            if (!c) continue;
            const text = describeCondition(c, labels);
            assert.ok(text.length > 0);
            // A description containing a bare key means a reference the schema
            // validator should already have rejected.
            described += 1;
          }
        }
      }
    }
    assert.ok(described > 0, "the shipped library should contain some conditions");
  });

  it("describes every question type used in the library", () => {
    for (const entry of SYSTEM_TEMPLATES) {
      for (const section of entry.definition.schema.sections) {
        for (const q of section.questions) {
          assert.ok(describeType(q as Question).length > 0, `${q.key} (${q.type})`);
        }
      }
    }
  });
});
