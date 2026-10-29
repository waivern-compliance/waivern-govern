import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPLAINTS_DUTY_IN_FORCE,
  acknowledgementDeadline,
  complaintClock,
  s164aApplies,
} from "@/lib/complaints/statutory";

const at = (iso: string) => new Date(iso);

const base = {
  jurisdiction: "uk" as const,
  controllerRole: "controller",
  receivedAt: at("2026-07-01T09:00:00Z"),
  acknowledgedAt: null,
  lastUpdateAt: null,
  outcomeAt: null,
  ended: false,
  outcomeTargetDays: 30,
  updateIntervalDays: 30,
};

describe("the thirty days to acknowledge (s.164A(3))", () => {
  it("counts the day of receipt as the first, to the end of the thirtieth", () => {
    assert.equal(acknowledgementDeadline(at("2026-07-01T09:00:00Z")).toISOString(), "2026-07-30T23:59:59.999Z");
  });

  it("is a count of days, not a month: received at month end, it runs into the next", () => {
    assert.equal(acknowledgementDeadline(at("2026-01-31T23:30:00Z")).toISOString(), "2026-03-01T23:59:59.999Z");
  });

  it("does not move off a weekend or a bank holiday", () => {
    // 30 days from 26 November 2026 ends on Friday 25 December, Christmas Day.
    assert.equal(acknowledgementDeadline(at("2026-11-26T10:00:00Z")).toISOString(), "2026-12-25T23:59:59.999Z");
  });
});

describe("when s.164A applies", () => {
  it("applies to a UK controller's complaint received from 19 June 2026", () => {
    assert.equal(s164aApplies({ jurisdiction: "uk", receivedAt: COMPLAINTS_DUTY_IN_FORCE, controllerRole: "controller" }), true);
    assert.equal(s164aApplies({ jurisdiction: "uk", receivedAt: COMPLAINTS_DUTY_IN_FORCE, controllerRole: "joint_controller" }), true);
  });

  it("not to one received the day before", () => {
    const before = new Date(COMPLAINTS_DUTY_IN_FORCE.getTime() - 1);
    assert.equal(s164aApplies({ jurisdiction: "uk", receivedAt: before, controllerRole: "controller" }), false);
  });

  it("not under EU law, and not to a processor", () => {
    assert.equal(s164aApplies({ jurisdiction: "eu", receivedAt: base.receivedAt, controllerRole: "controller" }), false);
    assert.equal(s164aApplies({ jurisdiction: "uk", receivedAt: base.receivedAt, controllerRole: "processor" }), false);
  });
});

describe("the complaint clock", () => {
  it("runs the acknowledgement, and goes amber within a week", () => {
    const early = complaintClock({ ...base, now: at("2026-07-10T12:00:00Z") });
    assert.equal(early.statutory, true);
    assert.equal(early.acknowledgement.state, "running");
    const late = complaintClock({ ...base, now: at("2026-07-25T12:00:00Z") });
    assert.equal(late.acknowledgement.state, "due_soon");
  });

  it("is overdue the day after the thirtieth", () => {
    const c = complaintClock({ ...base, now: at("2026-07-31T00:00:01Z") });
    assert.equal(c.acknowledgement.state, "overdue");
    assert.match(c.acknowledgement.words, /30 July 2026/);
  });

  it("is met on the last day, and late after it", () => {
    const met = complaintClock({ ...base, acknowledgedAt: at("2026-07-30T22:00:00Z"), now: at("2026-08-01T00:00:00Z") });
    assert.equal(met.acknowledgement.state, "met");
    const late = complaintClock({ ...base, acknowledgedAt: at("2026-08-02T10:00:00Z"), now: at("2026-08-03T00:00:00Z") });
    assert.equal(late.acknowledgement.state, "late");
    assert.match(late.acknowledgement.words, /3 days after/);
  });

  it("counts the outcome sent as the acknowledgement when none was recorded", () => {
    const c = complaintClock({ ...base, outcomeAt: at("2026-07-20T10:00:00Z"), now: at("2026-08-10T00:00:00Z") });
    assert.equal(c.acknowledgement.state, "met");
    assert.equal(c.outcome.state, "met");
    assert.equal(c.update.state, "off");
  });

  it("runs the outcome target from the acknowledgement, and calls it the organisation's", () => {
    const c = complaintClock({ ...base, acknowledgedAt: at("2026-07-03T10:00:00Z"), now: at("2026-07-10T00:00:00Z") });
    assert.equal(c.outcome.state, "running");
    assert.equal(c.outcome.state === "running" && c.outcome.dueAt.toISOString(), "2026-08-02T23:59:59.999Z");
    assert.match(c.outcome.words, /your 30-day target/);
  });

  it("runs the update interval from the latest contact", () => {
    const c = complaintClock({
      ...base,
      acknowledgedAt: at("2026-07-03T10:00:00Z"),
      lastUpdateAt: at("2026-07-20T10:00:00Z"),
      outcomeTargetDays: 90,
      now: at("2026-08-15T00:00:00Z"),
    });
    assert.equal(c.update.state, "due_soon");
    assert.equal(c.update.state === "due_soon" && c.update.dueAt.toISOString(), "2026-08-19T23:59:59.999Z");
  });

  it("turns a target off at zero", () => {
    const c = complaintClock({ ...base, outcomeTargetDays: 0, updateIntervalDays: 0, acknowledgedAt: base.receivedAt, now: at("2027-01-01T00:00:00Z") });
    assert.equal(c.outcome.state, "off");
    assert.equal(c.update.state, "off");
  });

  it("shows no statutory clock for an EU complaint, but keeps the organisation's targets", () => {
    const c = complaintClock({ ...base, jurisdiction: "eu", now: at("2026-09-01T00:00:00Z") });
    assert.equal(c.statutory, false);
    assert.equal(c.acknowledgement.state, "off");
    assert.match(c.acknowledgement.words, /EU GDPR/);
    assert.equal(c.outcome.state, "overdue");
  });

  it("stops everything once withdrawn", () => {
    const c = complaintClock({ ...base, ended: true, now: at("2026-09-01T00:00:00Z") });
    assert.equal(c.acknowledgement.state, "off");
    assert.equal(c.outcome.state, "off");
    assert.equal(c.update.state, "off");
  });
});
