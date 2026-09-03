import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addMonths } from "@/lib/dates";

describe("adding months", () => {
  it("does the ordinary thing", () => {
    assert.equal(
      addMonths(new Date("2026-03-15T09:30:00Z"), 12).toISOString(),
      "2027-03-15T09:30:00.000Z",
    );
    assert.equal(
      addMonths(new Date("2026-01-10T00:00:00Z"), 1).toISOString(),
      "2026-02-10T00:00:00.000Z",
    );
  });

  it("clamps to the end of the target month rather than overflowing", () => {
    // The naive version this replaced rolled 31 January plus one month into
    // 3 March. A review set for the last day of a month should land on the
    // last day of the next, not skip the month entirely.
    assert.equal(
      addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString(),
      "2026-02-28T00:00:00.000Z",
    );
    assert.equal(
      addMonths(new Date("2026-05-31T00:00:00Z"), 1).toISOString(),
      "2026-06-30T00:00:00.000Z",
    );
  });

  it("handles a leap year", () => {
    assert.equal(
      addMonths(new Date("2028-01-31T00:00:00Z"), 1).toISOString(),
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("keeps the time of day", () => {
    // A review due at 14:00 should not silently become midnight.
    assert.equal(
      addMonths(new Date("2026-01-31T14:22:33.444Z"), 1).toISOString(),
      "2026-02-28T14:22:33.444Z",
    );
  });

  it("crosses a year boundary", () => {
    assert.equal(
      addMonths(new Date("2026-11-30T00:00:00Z"), 3).toISOString(),
      "2027-02-28T00:00:00.000Z",
    );
  });

  it("does not mutate its argument", () => {
    const original = new Date("2026-01-31T00:00:00Z");
    addMonths(original, 6);
    assert.equal(original.toISOString(), "2026-01-31T00:00:00.000Z");
  });
});

describe("template review cycles", () => {
  it("gives every shipped assessment template a cycle, except the breach one", async () => {
    // A breach severity assessment is about one incident and does not recur;
    // everything else should come round.
    const { SYSTEM_TEMPLATES } = await import("@/lib/templates/library");
    for (const t of SYSTEM_TEMPLATES) {
      const months = t.definition.reviewIntervalMonths;
      if (t.kind === "breach") {
        assert.equal(months, undefined, `${t.name} should not recur`);
      } else {
        assert.ok(months && months >= 1, `${t.name} has no review cycle`);
      }
    }
  });
});
