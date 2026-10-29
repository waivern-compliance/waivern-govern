import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requestTimeliness, type Period, type TimelinessInput } from "@/lib/dsr/metrics";

const at = (iso: string) => new Date(iso);
const month = (key: string): Period => {
  const start = at(`${key}-01T00:00:00Z`);
  return { key, start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
};
const periods = [month("2026-08"), month("2026-09"), month("2026-10")];

const base: TimelinessInput = {
  rights: ["access"],
  receivedAt: at("2026-08-10T09:00:00Z"),
  respondedAt: null,
  clockState: "running",
  extended: false,
  status: "in_progress",
  closedAt: null,
};

describe("request timeliness", () => {
  const rows: TimelinessInput[] = [
    // Received in August, answered on time the same month.
    { ...base, respondedAt: at("2026-08-31T23:59:00Z"), clockState: "met", status: "responded" },
    // Received at the very end of August, answered late in October, extended.
    { ...base, rights: ["access", "erasure"], receivedAt: at("2026-08-31T23:59:59Z"), respondedAt: at("2026-10-05T09:00:00Z"), clockState: "late", extended: true, status: "refused" },
    // Received in October, still open and overdue.
    { ...base, rights: ["objection"], receivedAt: at("2026-10-01T00:00:00Z"), clockState: "overdue" },
    { ...base, rights: ["erasure"], receivedAt: at("2026-09-15T00:00:00Z"), status: "withdrawn", closedAt: at("2026-09-20T00:00:00Z"), clockState: "closed" },
  ];
  const t = requestTimeliness(rows, periods);

  it("totals what happened, with the median days to respond", () => {
    assert.deepEqual(t.totals, {
      received: 4, answered: 2, onTime: 1, late: 1, extended: 1, refused: 1, withdrawn: 1, open: 1, overdue: 1,
      // 22 and 34 days, rounded.
      medianDaysToRespond: 28,
    });
  });

  it("counts a request under each right it invokes, and leaves out rights nobody invoked", () => {
    const by = Object.fromEntries(t.byRight.map((r) => [r.right, r]));
    assert.equal(by.access.received, 2);
    assert.equal(by.erasure.received, 2);
    assert.equal(by.erasure.late, 1);
    assert.equal(by.objection.received, 1);
    assert.equal(by.portability, undefined);
  });

  it("puts each event in the month it happened, including the last second of a month", () => {
    assert.deepEqual(
      t.byMonth.map((m) => [m.period, m.received, m.answered, m.onTime, m.late, m.extended]),
      [
        ["2026-08", 2, 1, 1, 0, 0],
        ["2026-09", 1, 0, 0, 0, 0],
        ["2026-10", 1, 1, 0, 1, 1],
      ],
    );
  });

  it("says nothing about response time when nothing was answered", () => {
    assert.equal(requestTimeliness([base], periods).totals.medianDaysToRespond, null);
  });
});
