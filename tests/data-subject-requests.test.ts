import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, dataSubjectRequests, entities, memberships, organisations, tasks, users } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { can } from "@/lib/rbac";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { createAssessment } from "@/services/assessments";
import { createTemplate, publishVersion } from "@/services/templates";
import { createSupplier } from "@/services/third-party";
import { createActivity } from "@/services/ropa";
import {
  RequestRefused,
  addScopeEntry,
  closeRequest,
  defaultJurisdiction,
  loadRequest,
  objectionCounts,
  passToController,
  recordIdentity,
  recordRecipientNotice,
  recordRequest,
  recordRequestDecision,
  requestRegister,
  requestsNeedingAttention,
  recordScopeResult,
  respondToRequest,
  seedRequestScope,
  setDefaultJurisdiction,
  setObjectionReviewThreshold,
  updateRequest,
} from "@/services/data-subject-requests";
import { sweepOrganisation } from "@/services/sweep";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "dsr test" };
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `DSR ${label}`, slug: `dsr-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const [handler] = await db
    .insert(users)
    .values({ email: `handler-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  await db.insert(memberships).values({ organisationId: org.id, userId: handler.id });
  return { org, entity, handler };
}

async function aRequest(w: Awaited<ReturnType<typeof world>>, over: Partial<Parameters<typeof recordRequest>[0]> = {}) {
  return recordRequest({
    organisationId: w.org.id,
    entityId: w.entity.id,
    rights: ["access"],
    channel: "email",
    receivedAt: daysAgo(2),
    description: "Asked for a copy of everything held about them.",
    requesterName: "Sam Requester",
    requesterContact: "sam@example.com",
    actor: SYSTEM,
    ...over,
  });
}

describe("recording a request", () => {
  it("takes a reference, the organisation's jurisdiction, and keeps the requester out of the audit chain", async () => {
    const w = await world("record");
    const request = await aRequest(w);
    assert.match(request.reference, /^DSR-\d{4}-0001$/);
    assert.equal(request.jurisdiction, "uk");
    assert.equal(request.status, "in_progress");

    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.organisationId, w.org.id), eq(auditEvents.action, "dsr.recorded")));
    const text = JSON.stringify(event);
    assert.ok(!text.includes("Sam Requester") && !text.includes("sam@example.com"), "requester kept out of the chain");
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });

  it("refuses a request with no recognised right, no requester, or from the future", async () => {
    const w = await world("refuse");
    await assert.rejects(aRequest(w, { rights: ["nonsense"] }), RequestRefused);
    await assert.rejects(aRequest(w, { requesterName: " " }), RequestRefused);
    await assert.rejects(aRequest(w, { receivedAt: new Date(Date.now() + DAY) }), RequestRefused);
  });

  it("copies the jurisdiction, so changing the default never moves a deadline already running", async () => {
    const w = await world("jurisdiction");
    const before = await aRequest(w);
    await setDefaultJurisdiction({ organisationId: w.org.id, jurisdiction: "eu", actor: SYSTEM });
    assert.equal(await defaultJurisdiction(w.org.id), "eu");
    const later = await aRequest(w);
    assert.equal(later.jurisdiction, "eu");
    assert.equal((await loadRequest(before.id, w.org.id))!.request.jurisdiction, "uk");
  });
});

describe("the clock", () => {
  it("waits for identity where it was asked for, and starts when it is confirmed", async () => {
    const w = await world("identity");
    const request = await aRequest(w, { receivedAt: daysAgo(20) });
    await recordIdentity({ requestId: request.id, organisationId: w.org.id, step: "requested", at: daysAgo(19), actor: SYSTEM });
    let loaded = (await loadRequest(request.id, w.org.id))!;
    assert.equal(loaded.clock.state, "waiting");
    assert.equal(loaded.request.status, "verifying");

    await assert.rejects(
      recordIdentity({ requestId: request.id, organisationId: w.org.id, step: "verified", actor: SYSTEM }),
      /how identity was checked/,
    );
    await recordIdentity({
      requestId: request.id, organisationId: w.org.id, step: "verified", at: daysAgo(1),
      method: "Matched to account email and postcode", actor: SYSTEM,
    });
    loaded = (await loadRequest(request.id, w.org.id))!;
    assert.equal(loaded.clock.state, "running", "a month from yesterday, not from twenty days ago");
  });

  it("pauses for clarification in the UK, and refuses a second pause while one is open", async () => {
    const w = await world("pause");
    const request = await aRequest(w);
    await recordRequestDecision({
      organisationId: w.org.id, requestId: request.id, kind: "clarification_requested",
      rationale: "Twelve years of records across five systems; asked which period they mean.", actor: SYSTEM,
    });
    assert.equal((await loadRequest(request.id, w.org.id))!.clock.state, "paused");
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: request.id, kind: "clarification_requested", rationale: "again", actor: SYSTEM }),
      /already been asked/,
    );
    await recordRequestDecision({
      organisationId: w.org.id, requestId: request.id, kind: "clarification_received",
      rationale: "They mean 2024 onwards.", actor: SYSTEM,
    });
    const loaded = (await loadRequest(request.id, w.org.id))!;
    assert.equal(loaded.clock.state, "running");
    assert.equal(loaded.request.status, "in_progress");
  });

  it("allows one extension, within the first month only", async () => {
    const w = await world("extension");
    const early = await aRequest(w, { receivedAt: daysAgo(5) });
    await recordRequestDecision({
      organisationId: w.org.id, requestId: early.id, kind: "extension", statutoryBasis: "Article 12(3)",
      rationale: "Complex: data held by three processors. Told them on the same day.", actor: SYSTEM,
    });
    assert.equal((await loadRequest(early.id, w.org.id))!.extended, true);
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: early.id, kind: "extension", rationale: "more", actor: SYSTEM }),
      /already been extended/,
    );

    const late = await aRequest(w, { receivedAt: daysAgo(45) });
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: late.id, kind: "extension", rationale: "Busy.", actor: SYSTEM }),
      /Too late to extend/,
    );
  });
});

describe("objections", () => {
  it("cannot be overridden for direct marketing", async () => {
    const w = await world("dm");
    const request = await aRequest(w, { rights: ["objection"] });
    await assert.rejects(
      recordRequestDecision({
        organisationId: w.org.id, requestId: request.id, kind: "objection", outcome: "refused",
        processingBasis: "direct_marketing", rationale: "We value the newsletter.", actor: SYSTEM,
      }),
      /Article 21\(3\) is absolute/,
    );
    const upheld = await recordRequestDecision({
      organisationId: w.org.id, requestId: request.id, kind: "objection", outcome: "complied",
      processingBasis: "direct_marketing", statutoryBasis: "Article 21(3)",
      rationale: "Removed from all marketing lists and added to suppression.", actor: SYSTEM,
    });
    assert.equal(upheld.outcome, "complied");
  });

  it("may be overridden for legitimate interests, with reasons, but not where Article 21 does not apply", async () => {
    const w = await world("li");
    const request = await aRequest(w, { rights: ["objection"] });
    const overridden = await recordRequestDecision({
      organisationId: w.org.id, requestId: request.id, kind: "objection", outcome: "refused",
      processingBasis: "legitimate_interests", statutoryBasis: "Article 21(1)",
      rationale: "Fraud screening: compelling grounds, documented in LIA-2026-0003.", actor: SYSTEM,
    });
    assert.equal(overridden.processingBasis, "legitimate_interests");
    await assert.rejects(
      recordRequestDecision({
        organisationId: w.org.id, requestId: request.id, kind: "objection", outcome: "refused",
        processingBasis: "contract", rationale: "Needed for the contract.", actor: SYSTEM,
      }),
      /does not apply/,
    );
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: request.id, kind: "objection", rationale: "x", actor: SYSTEM }),
      /what the processing objected to relies on/,
    );
  });
});

describe("responding and closing", () => {
  it("requires the complaint right on anything short of full compliance", async () => {
    const w = await world("respond");
    const request = await aRequest(w);
    await assert.rejects(
      respondToRequest({
        requestId: request.id, organisationId: w.org.id, outcome: "partly", channel: "email",
        summary: "Sent most of it; withheld references under Sch. 2.", actor: SYSTEM,
      }),
      /Article 12\(4\)/,
    );
    const done = await respondToRequest({
      requestId: request.id, organisationId: w.org.id, outcome: "partly", channel: "email",
      summary: "Sent most of it; withheld references under Sch. 2.", toldOfComplaintRight: true,
      link: "https://drive.example.com/dsr/0001", actor: SYSTEM,
    });
    assert.equal(done.status, "responded");
    assert.equal((await loadRequest(request.id, w.org.id))!.clock.state, "met");
  });

  it("requires a reason for a late response", async () => {
    const w = await world("late");
    const request = await aRequest(w, { receivedAt: daysAgo(50) });
    await assert.rejects(
      respondToRequest({ requestId: request.id, organisationId: w.org.id, outcome: "complied", channel: "post", summary: "Sent.", actor: SYSTEM }),
      /Record why it was late/,
    );
    await respondToRequest({
      requestId: request.id, organisationId: w.org.id, outcome: "complied", channel: "post", summary: "Sent.",
      lateReason: "Request sat in an unmonitored inbox.", actor: SYSTEM,
    });
    assert.equal((await loadRequest(request.id, w.org.id))!.clock.state, "late");
  });

  it("will not close an unanswered request unless it was withdrawn", async () => {
    const w = await world("close");
    const request = await aRequest(w);
    await assert.rejects(
      closeRequest({ requestId: request.id, organisationId: w.org.id, rationale: "Tidying up.", actor: SYSTEM }),
      /has not been answered/,
    );
    const closed = await closeRequest({
      requestId: request.id, organisationId: w.org.id, rationale: "They withdrew it by email.", withdrawn: true, actor: SYSTEM,
    });
    assert.equal(closed.status, "withdrawn");
    assert.equal((await loadRequest(request.id, w.org.id))!.clock.state, "closed");
  });
});

describe("the register and the sweep", () => {
  it("counts what is due and overdue, and raises one statutory task per request per state", async () => {
    const w = await world("sweep");
    const overdue = await aRequest(w, { receivedAt: daysAgo(40) });
    const dueSoon = await aRequest(w, { receivedAt: daysAgo(27), ownerId: w.handler.id });
    await aRequest(w, { receivedAt: daysAgo(1) });

    const register = await requestRegister(w.org.id, null);
    assert.deepEqual([register.total, register.open, register.overdue, register.dueSoon], [3, 3, 1, 1]);
    assert.equal((await requestsNeedingAttention(w.org.id)).length, 2);

    const first = await sweepOrganisation(w.org.id);
    assert.equal(first.requestDeadlinesRaised, 2);
    const again = await sweepOrganisation(w.org.id);
    assert.equal(again.requestDeadlinesRaised, 0, "idempotent");

    const raised = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, "dsr_deadline")));
    const forOverdue = raised.find((t) => t.subjectId === overdue.id)!;
    assert.match(forOverdue.title, /past the deadline/);
    assert.equal(forOverdue.assigneeRole, "privacy_admin");
    const forDueSoon = raised.find((t) => t.subjectId === dueSoon.id)!;
    assert.equal(forDueSoon.assigneeUserId, w.handler.id, "the handler, where there is one");
    assert.ok(forDueSoon.dueAt && forDueSoon.dueAt > new Date(), "due on the statutory date");
  });
});

describe("who may handle requests", () => {
  it("is the privacy team, not auditors or approvers", () => {
    const org = (role: "privacy_admin" | "privacy_analyst" | "auditor" | "approver" | "owner") =>
      can([{ role, scope: "organisation" }], "dsr.handle");
    assert.deepEqual(
      [org("owner"), org("privacy_admin"), org("privacy_analyst"), org("auditor"), org("approver")],
      [true, true, true, false, false],
    );
  });
});

describe("where to look", () => {
  async function withRopa(label: string) {
    const w = await world(label);
    await createSupplier({ organisationId: w.org.id, name: "Mailchimp", actor: SYSTEM });
    await createActivity({
      organisationId: w.org.id, entityId: w.entity.id, name: "Newsletter",
      subjectCategories: ["Customers", "Prospects"], systems: ["CRM"], recipients: ["Mailchimp Ltd", "Auditors"],
      actor: SYSTEM,
    });
    await createActivity({
      organisationId: w.org.id, entityId: w.entity.id, name: "Payroll",
      subjectCategories: ["Employees"], systems: ["Sage"], actor: SYSTEM,
    });
    return w;
  }

  it("is seeded from the ROPA activities about who the requester is, their systems and recipients", async () => {
    const w = await withRopa("seed");
    const request = await aRequest(w, { subjectCategories: ["customer"], rights: ["erasure"] });
    const loaded = (await loadRequest(request.id, w.org.id))!;
    const byKind = (k: string) => loaded.scope.filter((e) => e.kind === k).map((e) => e.label);

    assert.deepEqual(byKind("activity").map((l) => l.replace(/^\S+ /, "")), ["Newsletter"], "payroll is not about customers");
    assert.deepEqual(byKind("system"), ["CRM"]);
    assert.deepEqual(byKind("supplier"), ["Mailchimp"], "a recipient on the supplier register becomes that supplier");
    assert.deepEqual(byKind("recipient"), ["Auditors"]);
    assert.ok(loaded.scope.filter((e) => e.isRecipient).length === 2);
  });

  it("looks again when who they are changes, without duplicating what is there", async () => {
    const w = await withRopa("reseed");
    const request = await aRequest(w, { subjectCategories: ["customer"] });
    await updateRequest({
      requestId: request.id, organisationId: w.org.id, changes: { subjectCategories: ["customer", "employee"] }, actor: SYSTEM,
    });
    const again = await seedRequestScope({ requestId: request.id, organisationId: w.org.id, actor: SYSTEM });
    assert.equal(again, 0);
    const labels = (await loadRequest(request.id, w.org.id))!.scope.map((e) => e.label);
    assert.ok(labels.some((l) => l.endsWith("Payroll")) && labels.includes("Sage"));
    assert.equal(new Set(labels).size, labels.length);

    const bare = await aRequest(w);
    await assert.rejects(seedRequestScope({ requestId: bare.id, organisationId: w.org.id, actor: SYSTEM }), RequestRefused);
  });

  it("needs a reason for leaving found data alone", async () => {
    const w = await withRopa("result");
    const request = await aRequest(w, { subjectCategories: ["customer"] });
    const entry = await addScopeEntry({ requestId: request.id, organisationId: w.org.id, kind: "other", label: "Shared inbox", actor: SYSTEM });
    await assert.rejects(addScopeEntry({ requestId: request.id, organisationId: w.org.id, kind: "other", label: "shared inbox", actor: SYSTEM }), RequestRefused);
    await assert.rejects(recordScopeResult({ scopeId: entry.id, organisationId: w.org.id, status: "not_actioned", actor: SYSTEM }), RequestRefused);
    const done = await recordScopeResult({ scopeId: entry.id, organisationId: w.org.id, status: "found", note: "Three emails", actor: SYSTEM });
    assert.equal(done.status, "found");
    assert.equal(done.checkedByLabel, "dsr test");
  });

  it("will not close an erasure until every recipient holding the data was told, or why not is recorded", async () => {
    const w = await withRopa("art19");
    const request = await aRequest(w, { subjectCategories: ["customer"], rights: ["erasure"] });
    const { scope } = (await loadRequest(request.id, w.org.id))!;
    const mailchimp = scope.find((e) => e.label === "Mailchimp")!;
    const auditors = scope.find((e) => e.label === "Auditors")!;
    const crm = scope.find((e) => e.label === "CRM")!;

    await assert.rejects(
      recordRecipientNotice({ scopeId: mailchimp.id, organisationId: w.org.id, notice: "notified", actor: SYSTEM }),
      /Record that decision first/,
    );
    await recordRequestDecision({ organisationId: w.org.id, requestId: request.id, kind: "erasure", outcome: "complied", rationale: "No exception applies.", actor: SYSTEM });
    await respondToRequest({ requestId: request.id, organisationId: w.org.id, outcome: "complied", channel: "email", summary: "Erased.", actor: SYSTEM });

    await assert.rejects(recordRecipientNotice({ scopeId: crm.id, organisationId: w.org.id, notice: "notified", actor: SYSTEM }), /not a recipient/);
    await assert.rejects(closeRequest({ requestId: request.id, organisationId: w.org.id, rationale: "Done", actor: SYSTEM }), /Auditors, Mailchimp have not been told/);

    await recordRecipientNotice({ scopeId: mailchimp.id, organisationId: w.org.id, notice: "notified", actor: SYSTEM });
    await assert.rejects(recordRecipientNotice({ scopeId: auditors.id, organisationId: w.org.id, notice: "disproportionate", actor: SYSTEM }), RequestRefused);
    await recordScopeResult({ scopeId: auditors.id, organisationId: w.org.id, status: "not_held", actor: SYSTEM });

    const closed = await closeRequest({ requestId: request.id, organisationId: w.org.id, rationale: "Done", actor: SYSTEM });
    assert.equal(closed.status, "closed");
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });
});

describe("as processor", () => {
  it("passes the request to the controller, and closes once it has", async () => {
    const w = await world("processor");
    const request = await aRequest(w, { controllerRole: "processor" });
    await assert.rejects(closeRequest({ requestId: request.id, organisationId: w.org.id, rationale: "Ours to pass on", actor: SYSTEM }), /passed to the controller/);
    await assert.rejects(passToController({ requestId: request.id, organisationId: w.org.id, controllerName: " ", actor: SYSTEM }), RequestRefused);

    const passed = await passToController({
      requestId: request.id, organisationId: w.org.id, controllerName: "Acme Retail Ltd", assistance: "Exported their records from our platform.", actor: SYSTEM,
    });
    assert.ok(passed.passedToControllerAt);
    const closed = await closeRequest({ requestId: request.id, organisationId: w.org.id, rationale: "Passed on; controller answers.", actor: SYSTEM });
    assert.equal(closed.status, "closed");

    const own = await aRequest(w);
    await assert.rejects(passToController({ requestId: own.id, organisationId: w.org.id, controllerName: "Someone", actor: SYSTEM }), /As controller, you answer it/);
  });
});

describe("objections against the ROPA", () => {
  async function marketing(label: string) {
    const w = await world(label);
    const activity = await createActivity({
      organisationId: w.org.id, entityId: w.entity.id, name: "Audience profiling",
      subjectCategories: ["Customers"], purposes: ["Personalised offers"], lawfulBasis: "Legitimate interests",
      actor: SYSTEM,
    });
    return { ...w, activity };
  }
  const object = (w: Awaited<ReturnType<typeof marketing>>, requestId: string, outcome: "complied" | "refused") =>
    recordRequestDecision({
      organisationId: w.org.id, requestId, kind: "objection", outcome, processingBasis: "legitimate_interests",
      processingActivityId: w.activity.id, rationale: outcome === "refused" ? "Fraud prevention outweighs it." : "No compelling grounds.", actor: SYSTEM,
    });

  it("is recorded against the activity, and only an objection is", async () => {
    const w = await marketing("obj-link");
    const request = await aRequest(w, { rights: ["objection"], subjectCategories: ["customer"] });
    const d = await object(w, request.id, "complied");
    assert.equal(d.processingActivityId, w.activity.id);
    await assert.rejects(
      recordRequestDecision({ organisationId: w.org.id, requestId: request.id, kind: "erasure", outcome: "complied", processingActivityId: w.activity.id, rationale: "x", actor: SYSTEM }),
      RequestRefused,
    );
  });

  it("restricts on request while the objection is weighed (Article 18(1)(d))", async () => {
    const w = await marketing("obj-restrict");
    const request = await aRequest(w, { rights: ["objection", "restriction"], subjectCategories: ["customer"] });
    const restrict = (outcome: "complied" | "refused") =>
      recordRequestDecision({ organisationId: w.org.id, requestId: request.id, kind: "restriction", outcome, rationale: "Weighing the objection.", actor: SYSTEM });
    await assert.rejects(restrict("refused"), /Article 18\(1\)\(d\)/);
    await restrict("complied");
    await object(w, request.id, "refused");
    await restrict("refused");
  });

  it("will not close an upheld objection until the processing is recorded as stopped", async () => {
    const w = await marketing("obj-stop");
    const request = await aRequest(w, { rights: ["objection"], subjectCategories: ["customer"] });
    await object(w, request.id, "complied");
    await respondToRequest({ requestId: request.id, organisationId: w.org.id, outcome: "complied", channel: "email", summary: "Stopped.", actor: SYSTEM });
    await assert.rejects(closeRequest({ requestId: request.id, organisationId: w.org.id, rationale: "Done", actor: SYSTEM }), /processing stops/);
    const entry = (await loadRequest(request.id, w.org.id))!.scope.find((e) => e.processingActivityId === w.activity.id)!;
    await recordScopeResult({ scopeId: entry.id, organisationId: w.org.id, status: "actioned", note: "Suppressed from profiling.", actor: SYSTEM });
    assert.equal((await closeRequest({ requestId: request.id, organisationId: w.org.id, rationale: "Done", actor: SYSTEM })).status, "closed");
  });

  it("counts against the activity and sends its LIA back past the threshold", async () => {
    const w = await marketing("obj-lia");
    await setObjectionReviewThreshold({ organisationId: w.org.id, threshold: 2, actor: SYSTEM });
    await assert.rejects(setObjectionReviewThreshold({ organisationId: w.org.id, threshold: -1, actor: SYSTEM }), RequestRefused);

    const liaTemplate = SYSTEM_TEMPLATES.find((t) => t.kind === "lia")!;
    const { version } = await createTemplate({ organisationId: w.org.id, kind: "lia", name: liaTemplate.name, definition: liaTemplate.definition, actor: SYSTEM });
    const published = await publishVersion({ organisationId: w.org.id, versionId: version.id, actor: SYSTEM });
    const lia = await createAssessment({
      organisationId: w.org.id, entityId: w.entity.id, templateVersionId: published.id, title: "LIA: profiling",
      subjectType: "processing_activity", subjectId: w.activity.id, actor: SYSTEM,
    });

    const first = await aRequest(w, { rights: ["objection"] });
    await object(w, first.id, "complied");
    await object(w, first.id, "complied"); // the same request twice counts once
    assert.equal((await sweepOrganisation(w.org.id)).objectionReviewsRaised, 0);

    const second = await aRequest(w, { rights: ["objection"] });
    await object(w, second.id, "refused");
    const counts = (await objectionCounts(w.org.id)).get(w.activity.id)!;
    assert.deepEqual(counts, { upheld: 1, overridden: 1, total: 2 });

    assert.equal((await sweepOrganisation(w.org.id)).objectionReviewsRaised, 1);
    assert.equal((await sweepOrganisation(w.org.id)).objectionReviewsRaised, 0, "raised once per threshold crossed");
    const [task] = await db.select().from(tasks).where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, "reassess")));
    assert.equal(task.subjectId, lia.id);
    assert.match(task.title, /people keep objecting/);
  });
});

describe("the clarification pause's commencement", () => {
  it("pauses an open UK request received after 5 February 2026 that was left running under the old date", async () => {
    const w = await world("commencement");
    const request = await aRequest(w, { receivedAt: new Date("2026-03-02T09:00:00Z") });
    await recordRequestDecision({
      organisationId: w.org.id, requestId: request.id, kind: "clarification_requested",
      rationale: "Asked which period they mean.", actor: SYSTEM,
    });
    assert.equal((await loadRequest(request.id, w.org.id))!.clock.state, "paused", "the corrected date pauses it");

    // What the old date left behind: the decision recorded, the status still running.
    await db.update(dataSubjectRequests).set({ status: "in_progress" }).where(eq(dataSubjectRequests.id, request.id));
    const answered = await aRequest(w, { receivedAt: new Date("2026-03-03T09:00:00Z") });
    await recordRequestDecision({ organisationId: w.org.id, requestId: answered.id, kind: "clarification_requested", rationale: "Which period?", actor: SYSTEM });
    await recordRequestDecision({ organisationId: w.org.id, requestId: answered.id, kind: "clarification_received", rationale: "2025.", actor: SYSTEM });

    const migration = readFileSync("drizzle/0077_dsr_clarification_commencement.sql", "utf8");
    await pg.unsafe(migration.slice(migration.indexOf("UPDATE")));

    const [fixed] = await db.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.id, request.id));
    const [untouched] = await db.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.id, answered.id));
    assert.equal(fixed.status, "paused");
    assert.equal(untouched.status, "in_progress", "clarification already received: left running");
  });
});
