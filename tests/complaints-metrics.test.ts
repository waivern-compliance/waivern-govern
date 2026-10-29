import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { complaintCounts, type ComplaintInput } from "@/lib/complaints/metrics";
import { complaintClock, pressingDials } from "@/lib/complaints/statutory";
import { monthsEnding } from "@/services/trends";

const at = (iso: string) => new Date(iso);
const row = (over: Partial<ComplaintInput>): ComplaintInput => ({
  subject: "other",
  receivedAt: at("2026-09-01T10:00:00Z"),
  acknowledgedAt: null,
  acknowledgementState: "running",
  outcome: null,
  outcomeAt: null,
  outcomeState: "running",
  status: "received",
  ...over,
});

describe("complaint counts", () => {
  const periods = monthsEnding(at("2026-10-30T00:00:00Z"), 2);
  const counts = complaintCounts(
    [
      row({ subject: "request_handling", acknowledgedAt: at("2026-09-03T10:00:00Z"), acknowledgementState: "met", outcome: "upheld", outcomeAt: at("2026-09-21T10:00:00Z"), outcomeState: "met", status: "closed" }),
      row({ subject: "request_handling", receivedAt: at("2026-09-05T10:00:00Z"), acknowledgedAt: at("2026-10-10T10:00:00Z"), acknowledgementState: "late", outcome: "not_upheld", outcomeAt: at("2026-10-20T10:00:00Z"), outcomeState: "met", status: "outcome_sent" }),
      row({ subject: "marketing", receivedAt: at("2026-10-01T10:00:00Z"), acknowledgementState: "off", status: "withdrawn" }),
      row({ subject: "security", receivedAt: at("2026-09-20T10:00:00Z"), acknowledgementState: "overdue" }),
    ],
    periods,
  );

  it("totals acknowledgements against the Act, and outcomes against the target", () => {
    assert.equal(counts.totals.received, 4);
    assert.equal(counts.totals.acknowledged, 2);
    assert.equal(counts.totals.acknowledgedInTime, 1);
    assert.equal(counts.totals.acknowledgedLate, 1);
    assert.equal(counts.totals.acknowledgementOverdue, 1);
    assert.equal(counts.totals.outcomesSent, 2);
    assert.equal(counts.totals.outcomeWithinTarget, 2);
    assert.equal(counts.totals.withdrawn, 1);
    assert.equal(counts.totals.open, 1);
    assert.equal(counts.totals.medianDaysToAcknowledge, 19);
    assert.equal(counts.totals.medianDaysToOutcome, 33);
    assert.deepEqual(counts.outcomes, { upheld: 1, partlyUpheld: 0, notUpheld: 1, passedToController: 0 });
  });

  it("counts by subject, leaving out subjects nobody raised", () => {
    assert.deepEqual(counts.bySubject.map((s) => [s.subject, s.received, s.upheld]), [
      ["request_handling", 2, 1],
      ["security", 1, 0],
      ["marketing", 1, 0],
    ]);
  });

  it("puts each event in the month it happened", () => {
    const [sep, oct] = counts.byMonth;
    assert.deepEqual([sep.period, sep.received, sep.acknowledged, sep.outcomesSent], ["2026-09", 3, 1, 1]);
    assert.deepEqual([oct.period, oct.received, oct.acknowledged, oct.acknowledgedLate, oct.outcomesSent], ["2026-10", 1, 1, 1, 1]);
  });
});

describe("what is pressing", () => {
  const base = {
    jurisdiction: "uk" as const, controllerRole: "controller", receivedAt: at("2026-07-01T09:00:00Z"),
    acknowledgedAt: null, lastUpdateAt: null, outcomeAt: null, ended: false, outcomeTargetDays: 30, updateIntervalDays: 30,
  };

  it("names the overdue acknowledgement as statutory and the outcome as the organisation's", () => {
    const pressing = pressingDials(complaintClock({ ...base, now: at("2026-08-05T00:00:00Z") }));
    assert.deepEqual(pressing.map((p) => [p.which, p.state, p.statutory]), [
      ["acknowledgement", "overdue", true],
      ["outcome", "overdue", false],
    ]);
  });

  it("is empty while nothing is close", () => {
    assert.deepEqual(pressingDials(complaintClock({ ...base, now: at("2026-07-05T00:00:00Z") })), []);
  });

  it("raises the update once an interval runs short", () => {
    const pressing = pressingDials(complaintClock({
      ...base, acknowledgedAt: at("2026-07-02T09:00:00Z"), outcomeTargetDays: 90, now: at("2026-07-28T00:00:00Z"),
    }));
    assert.deepEqual(pressing.map((p) => p.which), ["update"]);
  });
});
