import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, dataProtectionComplaints, entities, organisations, tasks } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import {
  PER_ADDRESS_PER_HOUR,
  issueIntakeLink,
  openIntakeLink,
  setIntakeLinkComplaints,
  startedToken,
  submitComplaintIntake,
  submitIntake,
} from "@/services/dsr-intake";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "complaint intake test" };

after(() => pg.end());

async function form(label: string, organisationOver: Partial<typeof organisations.$inferInsert> = {}) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Complaint intake ${label}`, slug: `cintake-${label}-${crypto.randomUUID().slice(0, 8)}`, ...organisationOver })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Studios", isDefault: true }).returning();
  const link = await issueIntakeLink({ organisationId: org.id, entityId: entity.id, label: "Website privacy notice", actor: SYSTEM });
  return { org, entity, link };
}

const tenSecondsAgo = (slug: string) => startedToken(slug, new Date(Date.now() - 10_000));

function complaint(slug: string, over: Partial<Parameters<typeof submitComplaintIntake>[0]> = {}) {
  return submitComplaintIntake({
    slug,
    started: tenSecondsAgo(slug),
    address: "203.0.113.9",
    forSomeoneElse: false,
    complainantName: "Jo Public",
    contact: "jo@example.org",
    subject: "marketing",
    description: "I unsubscribed in August and still get emails.",
    ...over,
  });
}

const complaintsOf = (organisationId: string) =>
  db.select().from(dataProtectionComplaints).where(eq(dataProtectionComplaints.organisationId, organisationId));

describe("complaints through the public form", () => {
  it("are taken by default, recorded as by web form, raise a task, and keep the complainant out of the audit chain", async () => {
    const w = await form("submit");
    assert.equal((await openIntakeLink(w.link.slug))?.takesComplaints, true);
    const result = await complaint(w.link.slug, { earlierReference: "DSR-2026-0042" });
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(result.reference, /^CMP-\d{4}-0001$/);
    assert.match(result.dueWords, /acknowledge it by /);

    const [row] = await complaintsOf(w.org.id);
    assert.equal(row.channel, "web_form");
    assert.equal(row.intakeLinkId, w.link.id);
    assert.equal(row.subject, "marketing");
    assert.equal(row.requestId, null, "an earlier reference is never linked on the complainant's say-so");
    assert.match(row.description, /Earlier reference given: DSR-2026-0042/);

    const [task] = await db.select().from(tasks).where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, "complaint_intake")));
    assert.equal(task.subjectId, row.id);
    assert.equal(task.assigneeRole, "privacy_admin");

    const events = await db.select().from(auditEvents).where(eq(auditEvents.organisationId, w.org.id));
    const recorded = events.find((e) => e.action === "complaint.recorded")!;
    assert.equal(recorded.actorKind, "public_form");
    const text = JSON.stringify(events);
    assert.ok(!text.includes("Jo Public") && !text.includes("jo@example.org") && !text.includes("unsubscribed"));
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });

  it("promises no date where s.164A does not apply", async () => {
    const w = await form("eu", { dataProtectionJurisdiction: "eu" });
    const result = await complaint(w.link.slug);
    assert.ok(result.ok);
    assert.doesNotMatch(result.dueWords, /by \d/);
  });

  it("files an unknown subject as something else, and asks for what is missing", async () => {
    const w = await form("missing");
    assert.ok((await complaint(w.link.slug, { subject: "nonsense" })).ok);
    assert.equal((await complaintsOf(w.org.id))[0].subject, "other");
    const noWords = await complaint(w.link.slug, { description: " " });
    assert.match((noWords as { message: string }).message, /your complaint is/);
    const noRep = await complaint(w.link.slug, { forSomeoneElse: true, representativeName: "" });
    assert.match((noRep as { message: string }).message, /your own name/);
  });

  it("are refused, with another route, once a form is switched to requests only", async () => {
    const w = await form("off");
    await setIntakeLinkComplaints({ linkId: w.link.id, organisationId: w.org.id, takesComplaints: false, actor: SYSTEM });
    assert.equal((await openIntakeLink(w.link.slug))?.takesComplaints, false);
    const refused = await complaint(w.link.slug);
    assert.equal(refused.ok, false);
    assert.match((refused as { message: string }).message, /email or post/);
    assert.equal((await complaintsOf(w.org.id)).length, 0);
  });

  it("turn away software just as requests do", async () => {
    const w = await form("bots");
    const cases = [
      await complaint(w.link.slug, { trap: "http://spam.example" }),
      await complaint(w.link.slug, { started: "123.forged" }),
      await complaint(w.link.slug, { started: startedToken(w.link.slug) }),
    ];
    assert.ok(cases.every((c) => !c.ok));
    assert.equal((await complaintsOf(w.org.id)).length, 0);
  });

  it("share the hourly limit with requests from the same address", async () => {
    const w = await form("limit");
    for (let i = 0; i < PER_ADDRESS_PER_HOUR - 1; i++) assert.ok((await complaint(w.link.slug)).ok);
    const request = await submitIntake({
      slug: w.link.slug, started: tenSecondsAgo(w.link.slug), address: "203.0.113.9", forSomeoneElse: false,
      requesterName: "Jo Public", contact: "jo@example.org", rights: ["access"], description: "Everything.",
    });
    assert.ok(request.ok);
    const limited = await complaint(w.link.slug);
    assert.equal(limited.ok, false);
    assert.match((limited as { message: string }).message, /Too many/);
  });
});
