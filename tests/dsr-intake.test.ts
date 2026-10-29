import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, dataSubjectRequests, dsrIntakeAttempts, entities, organisations, tasks } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import {
  PER_ADDRESS_PER_HOUR,
  hashAddress,
  issueIntakeLink,
  openIntakeLink,
  pruneIntakeAttempts,
  revokeIntakeLink,
  startedToken,
  submitIntake,
} from "@/services/dsr-intake";
import { RequestRefused } from "@/services/data-subject-requests";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "intake test" };

after(() => pg.end());

async function form(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Intake ${label}`, slug: `intake-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Studios", isDefault: true }).returning();
  const link = await issueIntakeLink({ organisationId: org.id, entityId: entity.id, label: "Website privacy notice", actor: SYSTEM });
  return { org, entity, link };
}

const tenSecondsAgo = (slug: string) => startedToken(slug, new Date(Date.now() - 10_000));

function submission(slug: string, over: Partial<Parameters<typeof submitIntake>[0]> = {}) {
  return submitIntake({
    slug,
    started: tenSecondsAgo(slug),
    address: "203.0.113.7",
    forSomeoneElse: false,
    requesterName: "Jo Public",
    contact: "jo@example.org",
    relationship: "customer",
    rights: ["access"],
    description: "Please send me everything you hold about me.",
    ...over,
  });
}

describe("the public request form", () => {
  it("needs a label to publish, and opens only while not withdrawn", async () => {
    const w = await form("open");
    await assert.rejects(issueIntakeLink({ organisationId: w.org.id, entityId: w.entity.id, label: " ", actor: SYSTEM }), RequestRefused);
    const opened = await openIntakeLink(w.link.slug);
    assert.equal(opened?.controllerName, "Studios (Intake open)");
    assert.equal(await openIntakeLink("not-a-real-slug"), null);

    await revokeIntakeLink({ linkId: w.link.id, organisationId: w.org.id, actor: SYSTEM });
    assert.equal(await openIntakeLink(w.link.slug), null);
    const refused = await submission(w.link.slug);
    assert.equal(refused.ok, false);
    assert.match((refused as { message: string }).message, /counts/);
  });

  it("records the request, raises a task, and keeps the requester out of the audit chain", async () => {
    const w = await form("submit");
    const result = await submission(w.link.slug);
    assert.ok(result.ok, JSON.stringify(result));
    assert.match(result.reference, /^DSR-\d{4}-0001$/);
    assert.match(result.dueWords, /^Due by /);

    const [request] = await db.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.organisationId, w.org.id));
    assert.equal(request.channel, "web_form");
    assert.equal(request.intakeLinkId, w.link.id);
    assert.deepEqual(request.subjectCategories, ["customer"]);

    const [task] = await db.select().from(tasks).where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, "dsr_intake")));
    assert.equal(task.subjectId, request.id);
    assert.equal(task.assigneeRole, "privacy_admin");

    const events = await db.select().from(auditEvents).where(eq(auditEvents.organisationId, w.org.id));
    const recorded = events.find((e) => e.action === "dsr.recorded")!;
    assert.equal(recorded.actorKind, "public_form");
    assert.equal(recorded.actorLabel, "web form: Website privacy notice");
    const text = JSON.stringify(events);
    assert.ok(!text.includes("Jo Public") && !text.includes("jo@example.org"));
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);

    const attempts = await db.select().from(dsrIntakeAttempts).where(eq(dsrIntakeAttempts.linkId, w.link.id));
    assert.equal(attempts[0].ipHash, hashAddress("203.0.113.7"));
    assert.ok(!JSON.stringify(attempts).includes("203.0.113.7"), "the address itself is never stored");
  });

  it("records who is acting for somebody else", async () => {
    const w = await form("rep");
    assert.equal((await submission(w.link.slug, { forSomeoneElse: true, representativeName: "" })).ok, false);
    const ok = await submission(w.link.slug, { forSomeoneElse: true, representativeName: "Sam Solicitor" });
    assert.ok(ok.ok);
    const [request] = await db.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.organisationId, w.org.id));
    assert.equal(request.requesterName, "Jo Public");
    assert.equal(request.representative, "Sam Solicitor");
  });

  it("turns away software: a filled trap, a forged or stale start, or a form sent too fast", async () => {
    const w = await form("bots");
    const cases = [
      await submission(w.link.slug, { trap: "http://spam.example" }),
      await submission(w.link.slug, { started: "123.forged" }),
      await submission(w.link.slug, { started: startedToken("another-slug", new Date(Date.now() - 10_000)) }),
      await submission(w.link.slug, { started: startedToken(w.link.slug, new Date(Date.now() - 25 * 3_600_000)) }),
      await submission(w.link.slug, { started: startedToken(w.link.slug) }),
    ];
    assert.ok(cases.every((c) => !c.ok));
    assert.equal((await db.select().from(dataSubjectRequests).where(eq(dataSubjectRequests.organisationId, w.org.id))).length, 0);
  });

  it("asks for what is missing in plain words", async () => {
    const w = await form("missing");
    const noRights = await submission(w.link.slug, { rights: [] });
    assert.match((noRights as { message: string }).message, /Choose at least one/);
    const noContact = await submission(w.link.slug, { contact: " " });
    assert.match((noContact as { message: string }).message, /email or postal address/);
  });

  it("limits how often one address can submit, but not other addresses", async () => {
    const w = await form("limit");
    for (let i = 0; i < PER_ADDRESS_PER_HOUR; i++) assert.ok((await submission(w.link.slug)).ok);
    const limited = await submission(w.link.slug);
    assert.equal(limited.ok, false);
    assert.match((limited as { message: string }).message, /Too many/);
    assert.ok((await submission(w.link.slug, { address: "198.51.100.4" })).ok);
  });

  it("forgets attempts after a day", async () => {
    const w = await form("prune");
    await submission(w.link.slug);
    await db.insert(dsrIntakeAttempts).values({
      organisationId: w.org.id, linkId: w.link.id, ipHash: "old", createdAt: new Date(Date.now() - 2 * 86_400_000),
    });
    assert.equal(await pruneIntakeAttempts(w.org.id), 1);
    assert.equal((await db.select().from(dsrIntakeAttempts).where(eq(dsrIntakeAttempts.linkId, w.link.id))).length, 1);
  });
});
