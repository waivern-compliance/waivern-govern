import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  COMMUNICATION_EXEMPTIONS,
  NOTIFICATION_WINDOW_HOURS,
  clockFor,
  hoursRemaining,
  missingContent,
  notificationDeadline,
  obligationsFor,
} from "@/lib/breach/statutory";

const AWARE = new Date("2026-09-01T09:00:00Z");
const hours = (n: number) => new Date(AWARE.getTime() + n * 3_600_000);

describe("the seventy-two hours", () => {
  it("runs from awareness, not from when the breach happened", () => {
    // Article 33(1) is explicit, and the two are often weeks apart. Starting
    // the clock at occurrence would report deadlines already missed.
    assert.equal(NOTIFICATION_WINDOW_HOURS, 72);
    assert.equal(notificationDeadline(AWARE).toISOString(), hours(72).toISOString());
  });

  it("counts down and then goes negative", () => {
    assert.equal(hoursRemaining(AWARE, hours(0)), 72);
    assert.equal(hoursRemaining(AWARE, hours(70)), 2);
    assert.equal(hoursRemaining(AWARE, hours(80)), -8);
  });

  it("says plainly when little time is left", () => {
    const soon = clockFor({ role: "controller", discoveredAt: AWARE, now: hours(60) });
    assert.equal(soon.state, "due_soon");
    const early = clockFor({ role: "controller", discoveredAt: AWARE, now: hours(4) });
    assert.equal(early.state, "running");
  });

  it("does not let a missed deadline remove the obligation", () => {
    // A late notification is still required, with reasons for the delay.
    const late = clockFor({ role: "controller", discoveredAt: AWARE, now: hours(100) });
    assert.equal(late.state, "overdue");
    assert.match(late.words, /must still be made/);
    assert.match(late.words, /reasons for the delay/);
  });

  it("marks a late notification as late rather than as met and quiet", () => {
    const met = clockFor({
      role: "controller",
      discoveredAt: AWARE,
      notifiedAt: hours(90),
      now: hours(100),
    });
    assert.equal(met.state, "met");
    assert.match(met.words, /late/);
    assert.match(met.words, /reasons for the delay/);
  });

  it("reports an on-time notification without qualification", () => {
    const met = clockFor({
      role: "controller",
      discoveredAt: AWARE,
      notifiedAt: hours(20),
      now: hours(30),
    });
    assert.equal(met.state, "met");
    assert.match(met.words, /within seventy-two hours/);
    assert.ok(!/late/.test(met.words));
  });

  it("does not apply the seventy-two hours to a processor", () => {
    // Article 33(2) is "without undue delay" to the controller, with no fixed
    // period. Showing a processor a seventy-two hour clock would misstate it.
    const c = clockFor({ role: "processor", discoveredAt: AWARE, now: hours(100) });
    assert.equal(c.state, "not_applicable");
    assert.match(c.words, /without undue delay/);
  });

  it("stops the clock once a person records that Article 33 does not bite", () => {
    const c = clockFor({
      role: "controller",
      discoveredAt: AWARE,
      notRequired: true,
      now: hours(100),
    });
    assert.equal(c.state, "not_applicable");
    assert.match(c.words, /unlikely to result in a risk/);
  });
});

describe("which obligations are engaged", () => {
  it("engages nothing where a person has judged there to be no risk", () => {
    const o = obligationsFor({ role: "controller", risk: "none", discoveredAt: AWARE });
    assert.deepEqual(o, []);
  });

  it("treats an unassessed breach as engaging the authority obligation", () => {
    // The clock does not pause while somebody decides whether it applies, so
    // assuming no risk until told otherwise would be the wrong way round.
    const o = obligationsFor({ role: "controller", risk: null, discoveredAt: AWARE });
    assert.equal(o.length, 1);
    assert.equal(o[0].kind, "supervisory_authority");
    assert.match(o[0].what, /Assess the risk/);
    assert.equal(o[0].dueAt?.toISOString(), hours(72).toISOString());
  });

  it("adds the data subjects only at high risk", () => {
    const risk = obligationsFor({ role: "controller", risk: "risk", discoveredAt: AWARE });
    assert.deepEqual(risk.map((o) => o.kind), ["supervisory_authority"]);

    const high = obligationsFor({ role: "controller", risk: "high_risk", discoveredAt: AWARE });
    assert.deepEqual(high.map((o) => o.kind), ["supervisory_authority", "data_subjects"]);
  });

  it("gives the data subjects no fixed deadline", () => {
    // Article 34 says "without undue delay". Inventing a number would misstate
    // the law in the place it matters most.
    const [, subjects] = obligationsFor({
      role: "controller", risk: "high_risk", discoveredAt: AWARE,
    });
    assert.equal(subjects.dueAt, null);
    assert.match(subjects.deadlineWords, /without undue delay/);
  });

  it("gives a processor one obligation, and it is not to the authority", () => {
    const o = obligationsFor({ role: "processor", risk: "high_risk", discoveredAt: AWARE });
    assert.deepEqual(o.map((x) => x.kind), ["processor_to_controller"]);
    assert.equal(o[0].basis, "Article 33(2)");
    assert.equal(o[0].dueAt, null);
  });

  it("treats a joint controller as a controller", () => {
    const o = obligationsFor({ role: "joint_controller", risk: "risk", discoveredAt: AWARE });
    assert.deepEqual(o.map((x) => x.kind), ["supervisory_authority"]);
  });

  it("cites the provision for every obligation it raises", () => {
    for (const risk of ["risk", "high_risk", null] as const) {
      for (const o of obligationsFor({ role: "controller", risk, discoveredAt: AWARE })) {
        assert.match(o.basis, /^Article 3[34]/, `${o.kind} has basis "${o.basis}"`);
      }
    }
  });
});

describe("what a notification has to contain", () => {
  const complete = {
    description: "Laptop lost in transit",
    subjectCategories: ["Employees"],
    dataCategories: ["Contact details", "Payroll"],
    subjectsAffected: 240,
    recordsAffected: 240,
    likelyConsequences: "Possible identity fraud",
    measuresTaken: "Device remotely wiped; affected staff advised",
  };

  it("finds nothing missing from a complete record", () => {
    assert.deepEqual(missingContent(complete), []);
  });

  it("treats an unknown number as missing, not as zero", () => {
    // Article 33(3)(a) asks for approximate numbers. Absent is a real state at
    // hour one, and Article 33(4) allows phased information — but it should be
    // visible before the deadline rather than after it.
    assert.deepEqual(missingContent({ ...complete, subjectsAffected: null }), ["nature"]);
    assert.deepEqual(missingContent({ ...complete, recordsAffected: null }), ["nature"]);
  });

  it("names each missing element separately", () => {
    const bare = missingContent({
      ...complete,
      likelyConsequences: null,
      measuresTaken: "   ",
    });
    assert.deepEqual(bare, ["consequences", "measures"]);
  });
});

describe("the Article 34(3) exemptions", () => {
  it("names all three, and only three", () => {
    assert.deepEqual(Object.keys(COMMUNICATION_EXEMPTIONS), [
      "34(3)(a)", "34(3)(b)", "34(3)(c)",
    ]);
  });

  it("describes the disproportionate-effort exemption as requiring public communication", () => {
    // It is not an exemption from telling anybody — it substitutes a public
    // communication, and a register that read it as "no action" would be wrong.
    assert.match(COMMUNICATION_EXEMPTIONS["34(3)(c)"], /public communication/);
  });
});

describe("the deadline the sweep puts on a task", () => {
  it("is the statutory one, not counted from when the task was raised", () => {
    // The sweep raised a task inheriting 72 hours from its own creation, so a
    // breach discovered 60 hours ago showed as due in four days. The task must
    // carry notificationDeadline(discoveredAt) or the task list misleads
    // exactly the person who has least time to spare.
    const source = readFileSync("src/services/sweep.ts", "utf8");
    assert.match(
      source,
      /dueAt: notificationDeadline\(breach\.discoveredAt\)/,
      "the breach deadline task must carry the statutory deadline",
    );
  });

  it("computes the same instant the database would", () => {
    const aware = new Date("2026-08-31T22:37:15.849Z");
    assert.equal(
      notificationDeadline(aware).toISOString(),
      "2026-09-03T22:37:15.849Z",
    );
  });
});
