import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BANK_HOLIDAYS_KNOWN_THROUGH } from "@/lib/dsr/bank-holidays";
import {
  DUAA_RIGHTS_IN_FORCE,
  RIGHT_KEYS,
  RIGHTS,
  clarificationStopsClock,
  clockStartsAt,
  extensionNoticeDeadline,
  isWorkingDay,
  objectionTest,
  pausedDays,
  requestClock,
  responseDeadline,
} from "@/lib/dsr/statutory";

const at = (iso: string) => new Date(iso);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe("the one-month deadline", () => {
  it("is the corresponding date in the next month, all of that day", () => {
    // The ICO's own example: received 3 September, due 3 October.
    const due = responseDeadline({ startsAt: at("2025-09-03T15:20:00Z"), jurisdiction: "uk" });
    assert.equal(day(due), "2025-10-03");
    assert.equal(due.toISOString(), "2025-10-03T23:59:59.999Z");
  });

  it("uses the last day of a shorter month, then moves off the weekend", () => {
    // 31 January 2026 → 28 February, a Saturday → Monday 2 March.
    assert.equal(day(responseDeadline({ startsAt: at("2026-01-31T10:00:00Z"), jurisdiction: "uk" })), "2026-03-02");
  });

  it("moves off a UK bank holiday, but not off an EU one", () => {
    // 3 March 2026 → 3 April, Good Friday. Next working day in England is Tuesday 7 April.
    const uk = responseDeadline({ startsAt: at("2026-03-03T09:00:00Z"), jurisdiction: "uk" });
    assert.equal(day(uk), "2026-04-07");
    // The EU rule moves only off weekends: Friday 3 April stands.
    const eu = responseDeadline({ startsAt: at("2026-03-03T09:00:00Z"), jurisdiction: "eu" });
    assert.equal(day(eu), "2026-04-03");
  });

  it("gives three months in all when extended", () => {
    assert.equal(
      day(responseDeadline({ startsAt: at("2026-06-10T09:00:00Z"), jurisdiction: "uk", extended: true })),
      "2026-09-10",
    );
  });

  it("must have the extension decided within the first month", () => {
    const startsAt = at("2026-06-10T09:00:00Z");
    assert.equal(day(extensionNoticeDeadline({ startsAt, jurisdiction: "uk" })), "2026-07-10");
  });
});

describe("when the clock starts", () => {
  it("starts on receipt where identity was never in doubt", () => {
    const receivedAt = at("2026-05-01T09:00:00Z");
    assert.equal(clockStartsAt({ receivedAt }), receivedAt);
  });

  it("waits for proof of identity where it was asked for", () => {
    const receivedAt = at("2026-05-01T09:00:00Z");
    const identityRequestedAt = at("2026-05-02T09:00:00Z");
    assert.equal(clockStartsAt({ receivedAt, identityRequestedAt }), null);
    const verified = at("2026-05-12T09:00:00Z");
    assert.equal(clockStartsAt({ receivedAt, identityRequestedAt, identityVerifiedAt: verified }), verified);
    assert.equal(requestClock({ jurisdiction: "uk", receivedAt, identityRequestedAt }).state, "waiting");
  });
});

describe("pausing for clarification", () => {
  // After the DUAA's changes came into force on 19 June 2026.
  const startsAt = at("2026-07-01T09:00:00Z");
  const pauses = [{ from: at("2026-07-05T09:00:00Z"), to: at("2026-07-15T16:00:00Z") }];

  it("adds back the days paused, in the UK", () => {
    assert.equal(pausedDays(pauses, "uk"), 10);
    // 1 August + 10 days = 11 August 2026, a Tuesday.
    assert.equal(day(responseDeadline({ startsAt, jurisdiction: "uk", pauses })), "2026-08-11");
  });

  it("is ignored under the EU GDPR, which has no such pause", () => {
    assert.equal(pausedDays(pauses, "eu"), 0);
    // 1 August 2026 is a Saturday.
    assert.equal(day(responseDeadline({ startsAt, jurisdiction: "eu", pauses })), "2026-08-03");
  });

  it("does not count a pause that began and ended the same day", () => {
    assert.equal(pausedDays([{ from: at("2026-07-05T09:00:00Z"), to: at("2026-07-05T17:00:00Z") }], "uk"), 0);
  });

  it("keeps moving the deadline while the pause lasts", () => {
    const open = [{ from: at("2026-07-05T09:00:00Z"), to: null }];
    const clock = requestClock({ jurisdiction: "uk", receivedAt: startsAt, pauses: open, now: at("2026-07-20T09:00:00Z") });
    assert.equal(clock.state, "paused");
    assert.ok("dueAt" in clock);
    // 1 August + 15 days paused so far = Sunday 16 August, so Monday 17th.
    assert.equal(day(clock.dueAt), "2026-08-17");
  });

  it("does not stop an EU clock", () => {
    const open = [{ from: at("2026-07-05T09:00:00Z"), to: null }];
    const clock = requestClock({ jurisdiction: "eu", receivedAt: startsAt, pauses: open, now: at("2026-07-20T09:00:00Z") });
    assert.equal(clock.state, "running");
  });

  it("does not stop a UK clock for a request received before the DUAA's changes came into force", () => {
    assert.equal(clarificationStopsClock("uk", at("2026-06-18T23:59:00Z")), false);
    assert.equal(clarificationStopsClock("uk", DUAA_RIGHTS_IN_FORCE), true);
    const receivedAt = at("2026-06-01T09:00:00Z");
    const open = [{ from: at("2026-06-05T09:00:00Z"), to: null }];
    const clock = requestClock({ jurisdiction: "uk", receivedAt, pauses: open, now: at("2026-06-20T09:00:00Z") });
    assert.equal(clock.state, "running");
    assert.ok("dueAt" in clock);
    assert.equal(day(clock.dueAt), "2026-07-01");
  });
});

describe("the clock in words", () => {
  const receivedAt = at("2026-09-01T09:00:00Z"); // due Thursday 1 October

  it("runs, comes due, then goes overdue without the obligation going away", () => {
    assert.equal(requestClock({ jurisdiction: "uk", receivedAt, now: at("2026-09-10T09:00:00Z") }).state, "running");
    const soon = requestClock({ jurisdiction: "uk", receivedAt, now: at("2026-09-28T09:00:00Z") });
    assert.equal(soon.state, "due_soon");
    assert.match(soon.words, /extend by up to two months/);
    // Still due on the deadline day itself.
    assert.equal(requestClock({ jurisdiction: "uk", receivedAt, now: at("2026-10-01T22:00:00Z") }).state, "due_soon");
    const late = requestClock({ jurisdiction: "uk", receivedAt, now: at("2026-10-05T09:00:00Z") });
    assert.equal(late.state, "overdue");
    assert.match(late.words, /still owed/);
  });

  it("records a late response as late, not as met", () => {
    const met = requestClock({ jurisdiction: "uk", receivedAt, respondedAt: at("2026-09-30T09:00:00Z") });
    assert.equal(met.state, "met");
    const late = requestClock({ jurisdiction: "uk", receivedAt, respondedAt: at("2026-10-09T09:00:00Z") });
    assert.equal(late.state, "late");
  });

  it("owes nothing once withdrawn", () => {
    assert.equal(requestClock({ jurisdiction: "uk", receivedAt, closedWithoutResponse: true }).state, "closed");
  });
});

describe("objections", () => {
  it("are absolute against direct marketing", () => {
    const t = objectionTest("direct_marketing");
    assert.deepEqual([t.applies, t.overridable, t.provision], [true, false, "Article 21(3)"]);
  });

  it("may be overridden for public task and legitimate interests, on compelling grounds", () => {
    for (const basis of ["public_task", "legitimate_interests"] as const) {
      const t = objectionTest(basis);
      assert.deepEqual([t.applies, t.overridable], [true, true], basis);
      assert.match(t.words, /compelling legitimate grounds/);
    }
  });

  it("do not apply to other bases, and point to the right that does", () => {
    assert.match(objectionTest("consent").words, /withdrawal of consent/);
    for (const basis of ["contract", "legal_obligation", "vital_interests"] as const) {
      assert.equal(objectionTest(basis).applies, false, basis);
    }
  });
});

describe("reference data", () => {
  it("cites an Article for every right", () => {
    for (const r of RIGHT_KEYS) assert.match(RIGHTS[r].article, /^Article \d+/, r);
  });

  it("knows the bank holidays for this year and next", () => {
    // Fails when the list lapses, so a deadline never silently lands on a holiday.
    assert.ok(BANK_HOLIDAYS_KNOWN_THROUGH >= new Date().getUTCFullYear() + 1);
    assert.equal(isWorkingDay(at("2026-12-28T12:00:00Z"), "uk"), false, "substitute Boxing Day");
    assert.equal(isWorkingDay(at("2026-12-29T12:00:00Z"), "uk"), true);
  });
});
