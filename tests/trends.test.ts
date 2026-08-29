import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTrend, historyFrom, monthsEnding, type TrendInput } from "@/services/trends";

const NOW = new Date("2026-08-15T12:00:00Z");
const at = (iso: string) => new Date(iso);

const EMPTY: TrendInput = { risks: [], assessments: [], tasks: [], acceptances: [] };

describe("periods", () => {
  it("runs oldest first and ends with the month in progress", () => {
    const p = monthsEnding(NOW, 3);
    assert.deepEqual(p.map((x) => x.key), ["2026-06", "2026-07", "2026-08"]);
  });

  it("spans each month exactly, with no gap or overlap", () => {
    const [june, july] = monthsEnding(NOW, 3);
    assert.equal(june.start.toISOString(), "2026-06-01T00:00:00.000Z");
    assert.equal(june.end.toISOString(), "2026-07-01T00:00:00.000Z");
    // One period's end is the next one's start, so no instant falls in both.
    assert.equal(june.end.getTime(), july.start.getTime());
  });

  it("crosses a year boundary", () => {
    const p = monthsEnding(new Date("2026-01-10T00:00:00Z"), 3);
    assert.deepEqual(p.map((x) => x.key), ["2025-11", "2025-12", "2026-01"]);
  });
});

describe("bucketing", () => {
  const periods = monthsEnding(NOW, 3);

  it("counts nothing from nothing", () => {
    const points = buildTrend(EMPTY, periods);
    assert.equal(points.length, 3);
    assert.deepEqual(points.map((p) => p.risksOpened), [0, 0, 0]);
    assert.deepEqual(points.map((p) => p.daysToDecide), [null, null, null]);
  });

  it("puts a record at the first instant of a month in that month", () => {
    const points = buildTrend(
      { ...EMPTY, risks: [{ openedAt: at("2026-07-01T00:00:00Z"), closedAt: null }] },
      periods,
    );
    assert.deepEqual(points.map((p) => p.risksOpened), [0, 1, 0]);
  });

  it("puts a record at the last instant of a month in that month, not the next", () => {
    const points = buildTrend(
      { ...EMPTY, risks: [{ openedAt: at("2026-07-31T23:59:59Z"), closedAt: null }] },
      periods,
    );
    assert.deepEqual(points.map((p) => p.risksOpened), [0, 1, 0]);
  });

  it("carries an open risk forward as a stock", () => {
    // Raised in June, never closed: open at the end of all three months.
    const points = buildTrend(
      { ...EMPTY, risks: [{ openedAt: at("2026-06-10T00:00:00Z"), closedAt: null }] },
      periods,
    );
    assert.deepEqual(points.map((p) => p.risksOpen), [1, 1, 1]);
  });

  it("stops counting a risk from the period it closed in", () => {
    const points = buildTrend(
      {
        ...EMPTY,
        risks: [{ openedAt: at("2026-06-10T00:00:00Z"), closedAt: at("2026-07-20T00:00:00Z") }],
      },
      periods,
    );
    // Open at end of June; closed before the end of July, so not open then.
    assert.deepEqual(points.map((p) => p.risksOpen), [1, 0, 0]);
    assert.deepEqual(points.map((p) => p.risksClosed), [0, 1, 0]);
  });

  it("does not count a risk closed exactly at the period boundary as still open", () => {
    const points = buildTrend(
      {
        ...EMPTY,
        risks: [{ openedAt: at("2026-06-10T00:00:00Z"), closedAt: at("2026-07-01T00:00:00Z") }],
      },
      periods,
    );
    assert.deepEqual(points.map((p) => p.risksOpen), [1, 0, 0]);
  });

  it("separates an expired acceptance from a revoked one", () => {
    // Revoking is a decision somebody took; expiry is one nobody took. Counting
    // them together would hide whichever mattered.
    const points = buildTrend(
      {
        ...EMPTY,
        acceptances: [
          { createdAt: at("2026-06-02T00:00:00Z"), expiresAt: at("2026-07-02T00:00:00Z"), revokedAt: null },
          {
            createdAt: at("2026-06-03T00:00:00Z"),
            expiresAt: at("2026-07-03T00:00:00Z"),
            revokedAt: at("2026-06-20T00:00:00Z"),
          },
        ],
      },
      periods,
    );
    assert.deepEqual(points.map((p) => p.acceptancesGranted), [2, 0, 0]);
    assert.deepEqual(points.map((p) => p.acceptancesExpired), [0, 1, 0]);
  });

  it("takes the median time to decide, in the month of the decision", () => {
    const points = buildTrend(
      {
        ...EMPTY,
        assessments: [
          // 2, 4 and 10 days — median 4, not the mean of 5.3.
          { createdAt: at("2026-06-01T00:00:00Z"), submittedAt: at("2026-07-01T00:00:00Z"), completedAt: at("2026-07-03T00:00:00Z") },
          { createdAt: at("2026-06-01T00:00:00Z"), submittedAt: at("2026-07-05T00:00:00Z"), completedAt: at("2026-07-09T00:00:00Z") },
          { createdAt: at("2026-06-01T00:00:00Z"), submittedAt: at("2026-07-10T00:00:00Z"), completedAt: at("2026-07-20T00:00:00Z") },
        ],
      },
      periods,
    );
    assert.deepEqual(points.map((p) => p.daysToDecide), [null, 4, null]);
    assert.deepEqual(points.map((p) => p.assessmentsStarted), [3, 0, 0]);
    assert.deepEqual(points.map((p) => p.assessmentsApproved), [0, 3, 0]);
  });

  it("averages the middle two when the count is even", () => {
    const points = buildTrend(
      {
        ...EMPTY,
        assessments: [
          { createdAt: at("2026-07-01T00:00:00Z"), submittedAt: at("2026-07-01T00:00:00Z"), completedAt: at("2026-07-03T00:00:00Z") },
          { createdAt: at("2026-07-01T00:00:00Z"), submittedAt: at("2026-07-01T00:00:00Z"), completedAt: at("2026-07-09T00:00:00Z") },
        ],
      },
      periods,
    );
    assert.deepEqual(points[1].daysToDecide, 5);
  });

  it("counts an approval with no submission, but leaves it out of the timing", () => {
    // Seeded or migrated records can be decided without a recorded submission.
    // Counting them as nought days would flatter the cycle time.
    const points = buildTrend(
      {
        ...EMPTY,
        assessments: [
          { createdAt: at("2026-07-01T00:00:00Z"), submittedAt: null, completedAt: at("2026-07-05T00:00:00Z") },
        ],
      },
      periods,
    );
    assert.equal(points[1].assessmentsApproved, 1);
    assert.equal(points[1].daysToDecide, null);
  });

  it("counts breached tasks apart from completed ones", () => {
    const points = buildTrend(
      {
        ...EMPTY,
        tasks: [
          { completedAt: at("2026-07-04T00:00:00Z"), breachedAt: null },
          { completedAt: at("2026-07-06T00:00:00Z"), breachedAt: at("2026-07-05T00:00:00Z") },
        ],
      },
      periods,
    );
    assert.deepEqual(points.map((p) => p.tasksCompleted), [0, 2, 0]);
    assert.deepEqual(points.map((p) => p.tasksBreached), [0, 1, 0]);
  });
});

describe("how much history there is", () => {
  it("names the first month anything happened", () => {
    const points = buildTrend(
      { ...EMPTY, risks: [{ openedAt: at("2026-07-10T00:00:00Z"), closedAt: null }] },
      monthsEnding(NOW, 3),
    );
    assert.equal(historyFrom(points), "2026-07");
  });

  it("says nothing when there is nothing", () => {
    assert.equal(historyFrom(buildTrend(EMPTY, monthsEnding(NOW, 3))), null);
  });
});
