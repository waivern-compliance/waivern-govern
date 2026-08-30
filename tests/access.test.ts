import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, users } from "@/db/schema";
import {
  LastOwnerRemains,
  inviteMember,
  listMembers,
  revokeRole,
  setMembershipActive,
} from "@/services/access";

const ACTOR = { actorKind: "system" as const, actorUserId: null, actorLabel: "access.test" };

async function scratchOrg() {
  // No BigInt literal: the build type-checks against a lower target than the
  // test runner does, and a suffix does not need nanosecond precision.
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const [org] = await db
    .insert(organisations)
    .values({ name: `Access Test ${suffix}`, slug: `access-test-${suffix}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity };
}

after(async () => {
  await pg.end();
});

describe("granting access", () => {
  it("creates the person, the membership and the role in one act", async () => {
    const { org } = await scratchOrg();
    const result = await inviteMember({
      organisationId: org.id,
      email: "New.Person@example.com",
      role: "contributor",
      actor: ACTOR,
    });
    assert.ok(result.granted);

    const members = await listMembers(org.id);
    assert.equal(members.length, 1);
    // Stored lowercase, so the same person invited twice is one person.
    assert.equal(members[0].email, "new.person@example.com");
    assert.deepEqual(members[0].roles.map((r) => r.role), ["contributor"]);
  });

  it("adds a second role rather than replacing the first", async () => {
    const { org } = await scratchOrg();
    await inviteMember({ organisationId: org.id, email: "a@example.com", role: "contributor", actor: ACTOR });
    await inviteMember({ organisationId: org.id, email: "a@example.com", role: "approver", actor: ACTOR });

    const [member] = await listMembers(org.id);
    assert.deepEqual([...member.roles.map((r) => r.role)].sort(), ["approver", "contributor"]);
  });

  it("is idempotent when the same role is granted twice", async () => {
    const { org } = await scratchOrg();
    await inviteMember({ organisationId: org.id, email: "b@example.com", role: "auditor", actor: ACTOR });
    const second = await inviteMember({
      organisationId: org.id, email: "b@example.com", role: "auditor", actor: ACTOR,
    });
    assert.equal(second.granted, false, "granting an existing role should not duplicate it");

    const [member] = await listMembers(org.id);
    assert.equal(member.roles.length, 1);
  });

  it("keeps an organisation-wide grant separate from an entity-scoped one", async () => {
    // These are different grants, and a partial unique index has to treat them
    // as such — Postgres considers NULLs distinct, which has bitten before.
    const { org, entity } = await scratchOrg();
    await inviteMember({ organisationId: org.id, email: "c@example.com", role: "approver", actor: ACTOR });
    await inviteMember({
      organisationId: org.id, email: "c@example.com", role: "approver",
      entityId: entity.id, actor: ACTOR,
    });

    const [member] = await listMembers(org.id);
    assert.equal(member.roles.length, 2);
    assert.deepEqual(
      [...member.roles.map((r) => r.scope)].sort(),
      ["entity", "organisation"],
    );
  });

  it("does not overwrite a name the person already has", async () => {
    const { org } = await scratchOrg();
    await inviteMember({
      organisationId: org.id, email: "d@example.com", name: "Their Own Name",
      role: "contributor", actor: ACTOR,
    });
    await inviteMember({
      organisationId: org.id, email: "d@example.com", name: "Typed Into A Form",
      role: "auditor", actor: ACTOR,
    });

    const [row] = await db.select().from(users).where(eq(users.email, "d@example.com"));
    assert.equal(row.name, "Their Own Name");
  });
});

describe("not locking the organisation out", () => {
  it("refuses to revoke the only owner's role", async () => {
    const { org } = await scratchOrg();
    await inviteMember({ organisationId: org.id, email: "solo@example.com", role: "owner", actor: ACTOR });
    const [member] = await listMembers(org.id);
    const ownerRole = member.roles.find((r) => r.role === "owner")!;

    await assert.rejects(
      () => revokeRole({ organisationId: org.id, roleAssignmentId: ownerRole.id, actor: ACTOR }),
      LastOwnerRemains,
    );

    const [still] = await listMembers(org.id);
    assert.ok(still.roles.some((r) => r.role === "owner"), "the role should survive the refusal");
  });

  it("refuses to suspend the only owner", async () => {
    const { org } = await scratchOrg();
    await inviteMember({ organisationId: org.id, email: "solo2@example.com", role: "owner", actor: ACTOR });
    const [member] = await listMembers(org.id);

    await assert.rejects(
      () => setMembershipActive({
        organisationId: org.id, membershipId: member.membershipId, isActive: false, actor: ACTOR,
      }),
      LastOwnerRemains,
    );
  });

  it("allows it once a second owner exists", async () => {
    const { org } = await scratchOrg();
    await inviteMember({ organisationId: org.id, email: "one@example.com", role: "owner", actor: ACTOR });
    await inviteMember({ organisationId: org.id, email: "two@example.com", role: "owner", actor: ACTOR });

    const members = await listMembers(org.id);
    const first = members.find((m) => m.email === "one@example.com")!;
    await revokeRole({
      organisationId: org.id,
      roleAssignmentId: first.roles.find((r) => r.role === "owner")!.id,
      actor: ACTOR,
    });

    const after_ = await listMembers(org.id);
    assert.equal(after_.filter((m) => m.roles.some((r) => r.role === "owner")).length, 1);
  });

  it("does not count a suspended owner as cover", async () => {
    // A suspended owner cannot sign in to undo anything, so they are not
    // somebody the organisation can fall back on.
    const { org } = await scratchOrg();
    await inviteMember({ organisationId: org.id, email: "active@example.com", role: "owner", actor: ACTOR });
    await inviteMember({ organisationId: org.id, email: "dormant@example.com", role: "owner", actor: ACTOR });

    const members = await listMembers(org.id);
    const dormant = members.find((m) => m.email === "dormant@example.com")!;
    await setMembershipActive({
      organisationId: org.id, membershipId: dormant.membershipId, isActive: false, actor: ACTOR,
    });

    const activeOwner = members.find((m) => m.email === "active@example.com")!;
    await assert.rejects(
      () => setMembershipActive({
        organisationId: org.id, membershipId: activeOwner.membershipId, isActive: false, actor: ACTOR,
      }),
      LastOwnerRemains,
    );
  });
});
