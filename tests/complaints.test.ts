import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, memberships, organisations, tasks, users } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { acknowledgementDeadline } from "@/lib/complaints/statutory";
import {
  ComplaintRefused,
  closeComplaint,
  complaintRegister,
  complaintMetrics,
  complaintTargets,
  complaintsAboutRequest,
  complaintsNeedingAttention,
  loadComplaint,
  recordComplaint,
  recordComplaintEvent,
  recordComplaintOutcome,
  setComplaintTargets,
  updateComplaint,
} from "@/services/complaints";
import { recordRequest } from "@/services/data-subject-requests";
import { sweepOrganisation } from "@/services/sweep";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "complaints test" };
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Complaints ${label}`, slug: `cmp-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const [other] = await db.insert(entities).values({ organisationId: org.id, name: "Other" }).returning();
  const [handler] = await db
    .insert(users)
    .values({ email: `handler-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  await db.insert(memberships).values({ organisationId: org.id, userId: handler.id });
  return { org, entity, other, handler };
}

async function aComplaint(w: Awaited<ReturnType<typeof world>>, over: Partial<Parameters<typeof recordComplaint>[0]> = {}) {
  return recordComplaint({
    organisationId: w.org.id,
    entityId: w.entity.id,
    channel: "email",
    receivedAt: daysAgo(2),
    subject: "request_handling",
    description: "My access request was answered late and incompletely.",
    complainantName: "Pat Example",
    complainantContact: "pat@example.com",
    actor: SYSTEM,
    ...over,
  });
}

describe("recording a complaint", () => {
  it("gives it a reference, copies the law, and keeps the complainant out of the audit chain", async () => {
    const w = await world("record");
    const c = await aComplaint(w);
    assert.match(c.reference, /^CMP-\d{4}-0001$/);
    assert.equal(c.jurisdiction, "uk");
    assert.equal(c.status, "received");

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.organisationId, w.org.id), eq(auditEvents.action, "complaint.recorded")));
    const logged = JSON.stringify(event);
    assert.doesNotMatch(logged, /Pat Example|pat@example\.com|answered late/);
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });

  it("refuses an unknown subject, a missing complainant and a future arrival", async () => {
    const w = await world("refuse");
    await assert.rejects(aComplaint(w, { subject: "vibes" }), ComplaintRefused);
    await assert.rejects(aComplaint(w, { complainantName: "  " }), ComplaintRefused);
    await assert.rejects(aComplaint(w, { receivedAt: new Date(Date.now() + DAY) }), ComplaintRefused);
  });

  it("links to a request in the same entity, and lists it on the request", async () => {
    const w = await world("link");
    const request = await recordRequest({
      organisationId: w.org.id, entityId: w.entity.id, rights: ["access"], channel: "email",
      receivedAt: daysAgo(40), description: "Everything you hold.", requesterName: "Pat Example", actor: SYSTEM,
    });
    const c = await aComplaint(w, { requestId: request.id });
    const loaded = await loadComplaint(c.id, w.org.id);
    assert.equal(loaded?.request?.reference, request.reference);
    assert.deepEqual((await complaintsAboutRequest(request.id, w.org.id)).map((x) => x.id), [c.id]);
  });

  it("refuses a link to a request made to another entity", async () => {
    const w = await world("link-entity");
    const request = await recordRequest({
      organisationId: w.org.id, entityId: w.other.id, rights: ["access"], channel: "email",
      receivedAt: daysAgo(10), description: "x", requesterName: "x", actor: SYSTEM,
    });
    await assert.rejects(aComplaint(w, { requestId: request.id }), /different entity/);
    const c = await aComplaint(w);
    await assert.rejects(
      updateComplaint({ complaintId: c.id, organisationId: w.org.id, changes: { requestId: request.id }, actor: SYSTEM }),
      /different entity/,
    );
  });
});

describe("acknowledging", () => {
  it("stamps the complaint and meets the thirty days", async () => {
    const w = await world("ack");
    const c = await aComplaint(w);
    await recordComplaintEvent({ complaintId: c.id, organisationId: w.org.id, kind: "acknowledged", note: "", channel: "email", actor: SYSTEM });
    const loaded = await loadComplaint(c.id, w.org.id);
    assert.equal(loaded?.complaint.status, "acknowledged");
    assert.equal(loaded?.clock.acknowledgement.state, "met");
    await assert.rejects(
      recordComplaintEvent({ complaintId: c.id, organisationId: w.org.id, kind: "acknowledged", note: "", channel: "email", actor: SYSTEM }),
      /already been acknowledged/,
    );
  });

  it("refuses a late acknowledgement without a reason", async () => {
    const w = await world("ack-late");
    const c = await aComplaint(w, { receivedAt: daysAgo(40) });
    assert.equal((await loadComplaint(c.id, w.org.id))?.clock.acknowledgement.state, "overdue");
    await assert.rejects(
      recordComplaintEvent({ complaintId: c.id, organisationId: w.org.id, kind: "acknowledged", note: "", channel: "email", actor: SYSTEM }),
      /s\.164A\(3\)/,
    );
    await recordComplaintEvent({
      complaintId: c.id, organisationId: w.org.id, kind: "acknowledged", note: "", channel: "email",
      lateReason: "It went to an unmonitored inbox.", actor: SYSTEM,
    });
    const loaded = await loadComplaint(c.id, w.org.id);
    assert.equal(loaded?.clock.acknowledgement.state, "late");
    assert.equal(loaded?.complaint.acknowledgementLateReason, "It went to an unmonitored inbox.");
  });

  it("shows no statutory clock for an EU complaint", async () => {
    const w = await world("eu");
    const c = await aComplaint(w, { jurisdiction: "eu", receivedAt: daysAgo(40) });
    const loaded = await loadComplaint(c.id, w.org.id);
    assert.equal(loaded?.clock.statutory, false);
    await recordComplaintEvent({ complaintId: c.id, organisationId: w.org.id, kind: "acknowledged", note: "", channel: "email", actor: SYSTEM });
  });
});

describe("looking into it and keeping them informed", () => {
  it("moves to investigating on an enquiry, and needs a note for each step", async () => {
    const w = await world("enquiry");
    const c = await aComplaint(w);
    await assert.rejects(
      recordComplaintEvent({ complaintId: c.id, organisationId: w.org.id, kind: "enquiry", note: " ", actor: SYSTEM }),
      ComplaintRefused,
    );
    await recordComplaintEvent({
      complaintId: c.id, organisationId: w.org.id, kind: "enquiry", note: "Asked the CRM team why the export missed call notes.", actor: SYSTEM,
    });
    await assert.rejects(
      recordComplaintEvent({ complaintId: c.id, organisationId: w.org.id, kind: "progress_update", note: "Told them.", actor: SYSTEM }),
      /how the complainant was contacted/,
    );
    await recordComplaintEvent({
      complaintId: c.id, organisationId: w.org.id, kind: "progress_update", note: "Told them we are checking the CRM.", channel: "email", actor: SYSTEM,
    });
    const loaded = await loadComplaint(c.id, w.org.id);
    assert.equal(loaded?.complaint.status, "investigating");
    assert.deepEqual(loaded?.events.map((e) => e.kind), ["enquiry", "progress_update"]);
  });
});

describe("the outcome", () => {
  it("records it, counts as the acknowledgement if none was recorded, and allows closing", async () => {
    const w = await world("outcome");
    const c = await aComplaint(w);
    await assert.rejects(
      closeComplaint({ complaintId: c.id, organisationId: w.org.id, rationale: "Done.", actor: SYSTEM }),
      /not been told the outcome/,
    );
    await recordComplaintOutcome({
      complaintId: c.id, organisationId: w.org.id, outcome: "partly_upheld", channel: "email",
      summary: "Apologised for the delay; sent the missing call notes.", remedialAction: "CRM export fixed.",
      toldOfRegulatorRight: true, actor: SYSTEM,
    });
    const loaded = await loadComplaint(c.id, w.org.id);
    assert.equal(loaded?.complaint.status, "outcome_sent");
    assert.ok(loaded?.complaint.acknowledgedAt);
    assert.equal(loaded?.clock.acknowledgement.state, "met");
    assert.equal(loaded?.clock.outcome.state, "met");
    await assert.rejects(
      recordComplaintEvent({ complaintId: c.id, organisationId: w.org.id, kind: "progress_update", note: "x", channel: "email", actor: SYSTEM }),
      /outcome has been sent/,
    );
    await closeComplaint({ complaintId: c.id, organisationId: w.org.id, rationale: "Outcome sent; fix deployed.", actor: SYSTEM });
    assert.equal((await loadComplaint(c.id, w.org.id))?.complaint.status, "closed");
  });

  it("needs a reason when it comes after the organisation's own target", async () => {
    const w = await world("outcome-late");
    const c = await aComplaint(w, { receivedAt: daysAgo(50) });
    await recordComplaintEvent({
      complaintId: c.id, organisationId: w.org.id, kind: "acknowledged", note: "", channel: "email",
      at: daysAgo(45), actor: SYSTEM,
    });
    await assert.rejects(
      recordComplaintOutcome({ complaintId: c.id, organisationId: w.org.id, outcome: "not_upheld", channel: "email", summary: "Not upheld.", actor: SYSTEM }),
      /your own target/,
    );
    await recordComplaintOutcome({
      complaintId: c.id, organisationId: w.org.id, outcome: "not_upheld", channel: "email", summary: "Not upheld.",
      lateReason: "Needed the processor's logs, which took three weeks.", actor: SYSTEM,
    });
    assert.equal((await loadComplaint(c.id, w.org.id))?.clock.outcome.state, "late");
  });

  it("lets only a processor or joint controller pass it on", async () => {
    const w = await world("passed");
    const c = await aComplaint(w);
    await assert.rejects(
      recordComplaintOutcome({ complaintId: c.id, organisationId: w.org.id, outcome: "passed_to_controller", channel: "email", summary: "x", actor: SYSTEM }),
      /yours to answer/,
    );
    const p = await aComplaint(w, { controllerRole: "processor" });
    assert.equal((await loadComplaint(p.id, w.org.id))?.clock.statutory, false);
    await recordComplaintOutcome({
      complaintId: p.id, organisationId: w.org.id, outcome: "passed_to_controller", channel: "email",
      summary: "Sent to the client, as our DPA requires.", actor: SYSTEM,
    });
  });

  it("closes a withdrawn complaint without an outcome", async () => {
    const w = await world("withdrawn");
    const c = await aComplaint(w);
    await closeComplaint({ complaintId: c.id, organisationId: w.org.id, rationale: "They phoned to withdraw it.", withdrawn: true, actor: SYSTEM });
    const loaded = await loadComplaint(c.id, w.org.id);
    assert.equal(loaded?.complaint.status, "withdrawn");
    assert.equal(loaded?.clock.acknowledgement.state, "off");
    assert.deepEqual(loaded?.events.map((e) => e.kind), ["withdrawn"]);
  });
});

describe("the register and the organisation's targets", () => {
  it("counts what needs acknowledging and what is overdue", async () => {
    const w = await world("register");
    await aComplaint(w);
    await aComplaint(w, { receivedAt: daysAgo(35) });
    const reg = await complaintRegister(w.org.id, null);
    assert.equal(reg.total, 2);
    assert.equal(reg.open, 2);
    assert.equal(reg.toAcknowledge, 1);
    assert.equal(reg.acknowledgementOverdue, 1);
    assert.equal((await complaintRegister(w.org.id, [w.other.id])).total, 0);

    const answered = await aComplaint(w);
    await recordComplaintOutcome({
      complaintId: answered.id, organisationId: w.org.id, outcome: "upheld", channel: "email", summary: "Sorted.", actor: SYSTEM,
    });
    assert.equal((await complaintRegister(w.org.id, null)).open, 2, "an outcome sent is no longer open");
  });

  it("sets the targets, refuses nonsense, and turns them off at zero", async () => {
    const w = await world("targets");
    assert.deepEqual(await complaintTargets(w.org.id), { outcomeTargetDays: 30, updateIntervalDays: 30 });
    await assert.rejects(
      setComplaintTargets({ organisationId: w.org.id, outcomeTargetDays: -1, updateIntervalDays: 30, actor: SYSTEM }),
      ComplaintRefused,
    );
    await setComplaintTargets({ organisationId: w.org.id, outcomeTargetDays: 0, updateIntervalDays: 14, actor: SYSTEM });
    const c = await aComplaint(w, { receivedAt: daysAgo(60) });
    const loaded = await loadComplaint(c.id, w.org.id);
    assert.equal(loaded?.clock.outcome.state, "off");
    assert.deepEqual(await complaintTargets(w.org.id), { outcomeTargetDays: 0, updateIntervalDays: 14 });
  });
});

describe("deadlines in the sweep", () => {
  it("raises one task per pressing dial, due on the deadline, and only once", async () => {
    const w = await world("sweep");
    const late = await aComplaint(w, { receivedAt: daysAgo(40), ownerId: w.handler.id });
    const fresh = await aComplaint(w);
    const pressing = await complaintsNeedingAttention(w.org.id);
    assert.deepEqual(pressing.map((p) => p.complaint.id), [late.id]);
    assert.deepEqual(pressing[0].pressing.map((d) => d.which), ["acknowledgement", "outcome"]);

    const first = await sweepOrganisation(w.org.id);
    assert.equal(first.complaintDeadlinesRaised, 2);
    assert.equal((await sweepOrganisation(w.org.id)).complaintDeadlinesRaised, 0, "idempotent");

    const raised = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, "complaint_deadline")));
    assert.equal(raised.length, 2);
    assert.ok(raised.every((t) => t.subjectId === late.id && t.assigneeUserId === w.handler.id));
    const ack = raised.find((t) => /30 days/.test(t.title))!;
    assert.equal(ack.dueAt?.toISOString(), acknowledgementDeadline(late.receivedAt).toISOString());
    assert.ok(!raised.some((t) => t.subjectId === fresh.id));
  });

  it("stops raising once the outcome is sent", async () => {
    const w = await world("sweep-done");
    const c = await aComplaint(w, { receivedAt: daysAgo(40) });
    await recordComplaintOutcome({
      complaintId: c.id, organisationId: w.org.id, outcome: "upheld", channel: "email", summary: "Sorted.",
      lateReason: "Lost in a shared inbox.", actor: SYSTEM,
    });
    assert.equal((await complaintsNeedingAttention(w.org.id)).length, 0);
    assert.equal((await sweepOrganisation(w.org.id)).complaintDeadlinesRaised, 0);
  });
});

describe("metrics", () => {
  it("counts the window's complaints, with no complainant in them", async () => {
    const w = await world("metrics");
    const c = await aComplaint(w);
    await recordComplaintEvent({ complaintId: c.id, organisationId: w.org.id, kind: "acknowledged", note: "", channel: "email", actor: SYSTEM });
    await aComplaint(w, { subject: "security" });
    const m = await complaintMetrics(w.org.id, null);
    assert.equal(m.totals.received, 2);
    assert.equal(m.totals.acknowledgedInTime, 1);
    assert.equal(m.byMonth.length, 12);
    assert.doesNotMatch(JSON.stringify(m), /Pat Example|pat@example\.com/);
  });
});
