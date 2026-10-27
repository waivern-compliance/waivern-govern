import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, asc, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  auditEvents,
  entities,
  memberships,
  organisations,
  retentionProfiles,
  roleAssignments,
  slaPolicies,
  templates,
  users,
  workflowDefinitions,
} from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { RETENTION_DEFAULTS, slugFor } from "@/lib/organisation/defaults";
import { isPlatformAdmin, requestsOpen } from "@/lib/platform";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { DEFAULT_SLA, DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import {
  RequestRefused,
  approveRequest,
  declineRequest,
  requestOrganisation,
  requestsBy,
} from "@/services/organisation-requests";

async function person(label: string) {
  const [u] = await db
    .insert(users)
    .values({ email: `${label}-${crypto.randomUUID().slice(0, 8)}@example.test` })
    .returning();
  return u;
}

const ask = (u: { id: string; email: string }, organisationName: string, entityName = "") =>
  requestOrganisation({ userId: u.id, email: u.email, organisationName, entityName });

after(() => pg.end());

describe("who runs the platform", () => {
  it("is whoever PLATFORM_ADMINS names, and nobody otherwise", () => {
    const before = process.env.PLATFORM_ADMINS;
    try {
      delete process.env.PLATFORM_ADMINS;
      assert.equal(requestsOpen(), false);
      assert.equal(isPlatformAdmin("ops@waivern.com"), false);
      process.env.PLATFORM_ADMINS = " Ops@Waivern.com , second@waivern.com";
      assert.equal(requestsOpen(), true);
      assert.equal(isPlatformAdmin("ops@waivern.com"), true);
      assert.equal(isPlatformAdmin("someone@example.test"), false);
    } finally {
      if (before === undefined) delete process.env.PLATFORM_ADMINS;
      else process.env.PLATFORM_ADMINS = before;
    }
  });

  it("makes a short reference from a name", () => {
    assert.equal(slugFor("Department for Example & Co."), "department-for-example-co");
  });
});

describe("asking for an organisation", () => {
  it("needs a name, and allows one request in the queue at a time", async () => {
    const u = await person("asker");
    await assert.rejects(ask(u, "   "), RequestRefused);
    await ask(u, "Example Department");
    await assert.rejects(ask(u, "Another One"), /already have a request waiting/);
  });

  it("can ask again once declined, and a decline says why", async () => {
    const u = await person("declined");
    const first = await ask(u, "Not Yet Ltd");
    await assert.rejects(declineRequest({ requestId: first.id, decidedByEmail: "ops@waivern.com", note: " " }), /Say why/);
    await declineRequest({ requestId: first.id, decidedByEmail: "ops@waivern.com", note: "Talk to sales first." });
    const [latest] = await requestsBy(u.id);
    assert.equal(latest.status, "declined");
    assert.equal(latest.decisionNote, "Talk to sales first.");
    await ask(u, "Not Yet Ltd");
  });
});

describe("approving", () => {
  it("sets up everything an organisation starts with, with its requester as owner", async () => {
    const u = await person("owner");
    const request = await ask(u, "Approved Agency", "Approved Agency Limited");
    const { organisation, request: decided } = await approveRequest({ requestId: request.id, decidedByEmail: "ops@waivern.com" });
    assert.equal(decided.status, "approved");
    assert.equal(decided.createdOrganisationId, organisation.id);

    const org = organisation.id;
    const [entity] = await db.select().from(entities).where(eq(entities.organisationId, org));
    assert.equal(entity.name, "Approved Agency Limited");
    assert.equal(entity.isDefault, true);

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.organisationId, org), eq(memberships.userId, u.id)));
    const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.membershipId, membership.id));
    assert.deepEqual(grants.map((g) => g.role), ["owner"]);

    assert.equal((await db.select().from(templates).where(eq(templates.organisationId, org))).length, SYSTEM_TEMPLATES.length);
    assert.equal((await db.select().from(workflowDefinitions).where(eq(workflowDefinitions.organisationId, org))).length, DEFAULT_WORKFLOWS.length);
    assert.equal((await db.select().from(slaPolicies).where(eq(slaPolicies.organisationId, org))).length, DEFAULT_SLA.length);
    assert.equal((await db.select().from(retentionProfiles).where(eq(retentionProfiles.organisationId, org))).length, RETENTION_DEFAULTS.length);

    const [first] = await db.select().from(auditEvents).where(eq(auditEvents.organisationId, org)).orderBy(asc(auditEvents.seq)).limit(1);
    assert.equal(first.action, "organisation.created");
    assert.equal((await verifyAuditChain(org)).ok, true);

    await assert.rejects(approveRequest({ requestId: request.id, decidedByEmail: "ops@waivern.com" }), /already been approved/);
  });

  it("gives two organisations of the same name different references", async () => {
    const a = await approveRequest({ requestId: (await ask(await person("s1"), "Same Name Council")).id, decidedByEmail: "ops@waivern.com" });
    const b = await approveRequest({ requestId: (await ask(await person("s2"), "Same Name Council")).id, decidedByEmail: "ops@waivern.com" });
    assert.notEqual(a.organisation.slug, b.organisation.slug);
    const both = await db.select().from(organisations).where(eq(organisations.name, "Same Name Council"));
    assert.ok(both.length >= 2);
  });
});
