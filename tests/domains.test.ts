import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, memberships, organisations, roleAssignments, users } from "@/db/schema";
import {
  claimRefusal,
  domainOf,
  mayJoinByDomain,
  normaliseDomain,
  recordsProve,
  unverifiedEmail,
  verificationRecordValue,
} from "@/lib/auth/domains";
import {
  DomainRefused,
  claimDomain,
  joinByVerifiedDomain,
  removeDomain,
  verifyDomain,
} from "@/services/domains";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "domains test" };

async function organisation(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Dom ${label}`, slug: `dom-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true });
  return org;
}

/** A domain nobody else in the test database will claim. */
const freshDomain = () => `d${crypto.randomUUID().slice(0, 8)}.example.gov.uk`;

/** DNS that answers with whatever records the test publishes. */
const dns = (published: Record<string, string[][]>) => async (name: string) => {
  if (!(name in published)) throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  return published[name];
};

async function verified(orgId: string, domain: string) {
  const claim = await claimDomain({ organisationId: orgId, domain, actor: SYSTEM });
  await verifyDomain({
    organisationId: orgId, claimId: claim.id, actor: SYSTEM,
    lookup: dns({ [`_govern-verification.${domain}`]: [[verificationRecordValue(claim.token)]] }),
  });
  return claim;
}

describe("domains as typed", () => {
  it("reduces what people type to the bare domain", () => {
    assert.equal(normaliseDomain("  @Example.GOV.uk. "), "example.gov.uk");
    assert.equal(normaliseDomain("https://www.example.gov.uk/path"), "example.gov.uk");
    assert.equal(normaliseDomain("not a domain"), null);
    assert.equal(normaliseDomain("localhost"), null);
    assert.equal(domainOf("Jo.Bloggs@Example.gov.uk"), "example.gov.uk");
  });

  it("refuses domains anybody can have an address at", () => {
    assert.equal(claimRefusal("gmail.com"), "public_email");
    assert.equal(claimRefusal("Outlook.com"), "public_email");
    assert.equal(claimRefusal("nonsense"), "not_a_domain");
    assert.equal(claimRefusal("example.gov.uk"), null);
  });

  it("accepts a record however DNS splits it", () => {
    assert.ok(recordsProve([["v=spf1"], ["govern-verifi", "cation=abc"]], "abc"));
    assert.ok(!recordsProve([["govern-verification=abd"]], "abc"));
  });

  it("trusts only Google's verified addresses", () => {
    assert.equal(unverifiedEmail("google", { email_verified: false }), true);
    assert.equal(unverifiedEmail("google", {}), true);
    assert.equal(unverifiedEmail("google", { email_verified: true }), false);
    assert.equal(unverifiedEmail("microsoft-entra-id", {}), false, "Microsoft sign-in works as before");
    assert.equal(mayJoinByDomain("google", { email_verified: true }), true);
    assert.equal(mayJoinByDomain("microsoft-entra-id", { email_verified: true }), false);
  });
});

after(() => pg.end());

describe("claiming and verifying", () => {
  it("verifies a claim only once the record is published", async () => {
    const org = await organisation("verify");
    const domain = freshDomain();
    const claim = await claimDomain({ organisationId: org.id, domain: `@${domain.toUpperCase()}`, actor: SYSTEM });
    assert.equal(claim.domain, domain);
    await assert.rejects(
      verifyDomain({ organisationId: org.id, claimId: claim.id, actor: SYSTEM, lookup: dns({}) }),
      /record is not there yet/,
    );
    const done = await verifyDomain({
      organisationId: org.id, claimId: claim.id, actor: SYSTEM,
      lookup: dns({ [`_govern-verification.${domain}`]: [[verificationRecordValue(claim.token)]] }),
    });
    assert.ok(done.verifiedAt);
  });

  it("refuses a public email domain", async () => {
    const org = await organisation("public");
    await assert.rejects(claimDomain({ organisationId: org.id, domain: "gmail.com", actor: SYSTEM }), DomainRefused);
  });

  it("lets only one organisation verify a domain", async () => {
    const first = await organisation("first");
    const second = await organisation("second");
    const domain = freshDomain();
    await verified(first.id, domain);
    await assert.rejects(verified(second.id, domain), /Another organisation has already verified/);
  });
});

describe("joining by domain at sign-in", () => {
  it("joins somebody new as a contributor, once, and records it", async () => {
    const org = await organisation("join");
    const domain = freshDomain();
    await verified(org.id, domain);
    const email = `new.person@${domain}`;

    assert.equal(await joinByVerifiedDomain(email.toUpperCase(), "New Person"), org.id);
    const [person] = await db.select().from(users).where(eq(users.email, email));
    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.organisationId, org.id), eq(memberships.userId, person.id)));
    const roles = await db.select().from(roleAssignments).where(eq(roleAssignments.membershipId, membership.id));
    assert.deepEqual(roles.map((r) => r.role), ["contributor"]);
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.organisationId, org.id), eq(auditEvents.action, "membership.joined_by_domain")));
    assert.equal((event.after as Record<string, unknown>).email, email);

    assert.equal(await joinByVerifiedDomain(email, null), null, "already a member: nothing to join");
  });

  it("never lets back in somebody who was removed", async () => {
    const org = await organisation("removed");
    const domain = freshDomain();
    await verified(org.id, domain);
    const email = `leaver@${domain}`;
    await joinByVerifiedDomain(email, null);
    const [person] = await db.select().from(users).where(eq(users.email, email));
    await db
      .update(memberships)
      .set({ isActive: false })
      .where(and(eq(memberships.organisationId, org.id), eq(memberships.userId, person.id)));

    assert.equal(await joinByVerifiedDomain(email, null), null);
    const [still] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.organisationId, org.id), eq(memberships.userId, person.id)));
    assert.equal(still.isActive, false);
  });

  it("joins nobody through an unverified or removed claim", async () => {
    const org = await organisation("unverified");
    const pending = freshDomain();
    await claimDomain({ organisationId: org.id, domain: pending, actor: SYSTEM });
    assert.equal(await joinByVerifiedDomain(`someone@${pending}`, null), null);

    const gone = freshDomain();
    const claim = await verified(org.id, gone);
    await removeDomain({ organisationId: org.id, claimId: claim.id, actor: SYSTEM });
    assert.equal(await joinByVerifiedDomain(`someone@${gone}`, null), null);
  });
});
