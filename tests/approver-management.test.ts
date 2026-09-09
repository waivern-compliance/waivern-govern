import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  approvals,
  assessments,
  entities,
  memberships,
  organisations,
  processingActivities,
  roleAssignments,
  suppliers,
  tasks,
  templates,
  templateVersions,
  users,
  workflowDefinitions,
  workflowStages,
} from "@/db/schema";
import { describeRouting } from "@/lib/workflow/routing";
import {
  RoutingRefused,
  updateStage,
  workflowsFor,
} from "@/services/approval-routing";
import { HandoverRefused, candidatesFor, handOver, holdingsOf } from "@/services/handover";

const ACTOR = { actorKind: "system" as const, actorUserId: null, actorLabel: "approver.test" };

after(async () => {
  await pg.end();
});

async function scratch() {
  const s = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const [org] = await db
    .insert(organisations)
    .values({ name: `Approve ${s}`, slug: `approve-${s}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const [definition] = await db
    .insert(workflowDefinitions)
    .values({ organisationId: org.id, templateKind: "dpia", name: "DPIA approval" })
    .returning();
  const [stage] = await db
    .insert(workflowStages)
    .values({
      workflowDefinitionId: definition.id,
      position: 1,
      name: "Privacy review",
      requiredRole: "privacy_analyst",
      condition: { op: "always" },
      slaHours: 72,
    })
    .returning();
  return { org, entity, definition, stage, s };
}

async function templateVersion(orgId: string, s: string) {
  const [template] = await db
    .insert(templates)
    .values({ organisationId: orgId, kind: "dpia", name: `DPIA ${s}` })
    .returning();
  const [version] = await db
    .insert(templateVersions)
    .values({
      templateId: template.id,
      version: 1,
      status: "draft",
      definition: { schema: { sections: [] } } as never,
    })
    .returning();
  return version;
}

async function person(orgId: string, email: string, role: string | null) {
  const [user] = await db.insert(users).values({ email }).returning();
  const [membership] = await db
    .insert(memberships)
    .values({ organisationId: orgId, userId: user.id })
    .returning();
  if (role) {
    await db.insert(roleAssignments).values({
      membershipId: membership.id,
      role: role as "privacy_analyst",
      scope: "organisation",
    });
  }
  return { user, membership };
}

describe("who approves, and where that is defined", () => {
  it("names a role, and shows who currently holds it", async () => {
    const { org, s } = await scratch();
    await person(org.id, `analyst-${s}@example.test`, "privacy_analyst");

    const [workflow] = await workflowsFor(org.id);
    const stage = workflow.stages[0];
    assert.equal(stage.requiredRole, "privacy_analyst");
    assert.equal(stage.roleLabel, "Privacy analyst");
    assert.deepEqual(stage.eligible.map((e) => e.email), [`analyst-${s}@example.test`]);
  });

  it("counts an owner as eligible for every gate", async () => {
    const { org, s } = await scratch();
    await person(org.id, `owner-${s}@example.test`, "owner");

    const [workflow] = await workflowsFor(org.id);
    assert.equal(workflow.stages[0].eligible.length, 1, "the owner can decide it");
  });

  it("says plainly when nobody holds the role", async () => {
    // A gate with no eligible approver does not fail. It waits, silently,
    // which is the failure this screen exists to make visible.
    const { org } = await scratch();
    const [workflow] = await workflowsFor(org.id);
    assert.deepEqual(workflow.stages[0].eligible, []);
  });

  it("does not count a suspended member as an approver", async () => {
    const { org, s } = await scratch();
    const { membership } = await person(org.id, `gone-${s}@example.test`, "privacy_analyst");
    await db.update(memberships).set({ isActive: false }).where(eq(memberships.id, membership.id));

    const [workflow] = await workflowsFor(org.id);
    assert.deepEqual(workflow.stages[0].eligible, []);
  });

  it("explains when a stage applies, in words", () => {
    assert.equal(describeRouting({ op: "always" }), "always");
    assert.equal(
      describeRouting({ op: "specialCategoryData" }),
      "special-category data is involved",
    );
    assert.match(
      describeRouting({
        op: "and",
        all: [{ op: "tierAtLeast", value: "high" }, { op: "transferToNonAdequate" }],
      }),
      /high or worse, and .*adequacy/,
    );
  });
});

describe("changing the approver", () => {
  it("moves the role, and redirects the approvals already waiting", async () => {
    const { org, entity, stage, s } = await scratch();
    const version = await templateVersion(org.id, s);
    const [assessment] = await db
      .insert(assessments)
      .values({
        organisationId: org.id,
        entityId: entity.id,
        templateVersionId: version.id,
        reference: `DPIA-${s}-1`,
        title: "Contributor contract records",
        status: "in_review",
      })
      .returning();
    await db.insert(approvals).values({
      assessmentId: assessment.id,
      stageId: stage.id,
      position: 1,
      name: "Privacy review",
      requiredRole: "privacy_analyst",
      status: "pending",
      reason: "always",
    });

    const { redirected } = await updateStage({
      organisationId: org.id,
      stageId: stage.id,
      name: "Privacy review",
      requiredRole: "approver",
      slaHours: 48,
      actor: ACTOR,
    });

    assert.equal(redirected, 1, "the waiting gate followed the rule");
    const [gate] = await db.select().from(approvals).where(eq(approvals.stageId, stage.id));
    assert.equal(gate.requiredRole, "approver");
  });

  it("leaves a decided approval alone, because it records who was entitled then", async () => {
    const { org, entity, stage, s } = await scratch();
    const version = await templateVersion(org.id, s);
    const [assessment] = await db
      .insert(assessments)
      .values({
        organisationId: org.id,
        entityId: entity.id,
        templateVersionId: version.id,
        reference: `DPIA-${s}-2`,
        title: "Contributor contract records",
        status: "approved",
      })
      .returning();
    await db.insert(approvals).values({
      assessmentId: assessment.id,
      stageId: stage.id,
      position: 1,
      name: "Privacy review",
      requiredRole: "privacy_analyst",
      status: "approved",
      reason: "always",
      decidedByLabel: "someone@example.test",
      decidedAt: new Date(),
    });

    await updateStage({
      organisationId: org.id,
      stageId: stage.id,
      name: "Privacy review",
      requiredRole: "approver",
      slaHours: null,
      actor: ACTOR,
    });

    const [gate] = await db.select().from(approvals).where(eq(approvals.stageId, stage.id));
    assert.equal(gate.requiredRole, "privacy_analyst", "history is not rewritten");
  });

  it("refuses a service level outside anything sensible", async () => {
    const { org, stage } = await scratch();
    await assert.rejects(
      () =>
        updateStage({
          organisationId: org.id,
          stageId: stage.id,
          name: "Privacy review",
          requiredRole: "privacy_analyst",
          slaHours: 0,
          actor: ACTOR,
        }),
      RoutingRefused,
    );
  });

  it("refuses an unnamed stage", async () => {
    const { org, stage } = await scratch();
    await assert.rejects(
      () =>
        updateStage({
          organisationId: org.id,
          stageId: stage.id,
          name: "   ",
          requiredRole: "privacy_analyst",
          slaHours: null,
          actor: ACTOR,
        }),
      RoutingRefused,
    );
  });

  it("cannot be changed from another organisation", async () => {
    const { stage } = await scratch();
    const other = await scratch();
    await assert.rejects(
      () =>
        updateStage({
          organisationId: other.org.id,
          stageId: stage.id,
          name: "Hijacked",
          requiredRole: "owner",
          slaHours: null,
          actor: ACTOR,
        }),
      RoutingRefused,
    );
  });
});

describe("when somebody leaves", () => {
  async function withWork() {
    const { org, entity, s } = await scratch();
    const leaver = await person(org.id, `leaver-${s}@example.test`, "privacy_analyst");
    const successor = await person(org.id, `successor-${s}@example.test`, "privacy_analyst");

    await db.insert(tasks).values({
      organisationId: org.id,
      entityId: entity.id,
      type: "review_assessment",
      subjectType: "assessment",
      subjectId: entity.id,
      title: "Something to do",
      assigneeUserId: leaver.user.id,
      status: "open",
    });
    await db.insert(processingActivities).values({
      organisationId: org.id,
      entityId: entity.id,
      reference: `ROPA-${s}`,
      name: `Activity ${s}`,
      ownerId: leaver.user.id,
    });
    await db.insert(suppliers).values({
      organisationId: org.id,
      name: `Vendor ${s}`,
      canonicalKey: `vendor-${s}`,
      ownerId: leaver.user.id,
    });

    return { org, leaver, successor };
  }

  it("shows what they are holding", async () => {
    const { org, leaver } = await withWork();
    const holding = await holdingsOf(org.id, leaver.user.id);
    assert.equal(holding.openTasks, 1);
    assert.equal(holding.activities, 1);
    assert.equal(holding.suppliers, 1);
    assert.equal(holding.total, 3);
  });

  it("moves all of it to the successor in one act", async () => {
    const { org, leaver, successor } = await withWork();
    const { moved } = await handOver({
      organisationId: org.id,
      fromUserId: leaver.user.id,
      toUserId: successor.user.id,
      actor: ACTOR,
    });

    assert.equal(moved.total, 3);
    assert.equal((await holdingsOf(org.id, leaver.user.id)).total, 0);
    assert.equal((await holdingsOf(org.id, successor.user.id)).total, 3);
  });

  it("leaves finished work where it was", async () => {
    // A completed task is a record of what somebody did. Moving it would
    // rewrite that.
    const { org, leaver, successor } = await withWork();
    await db
      .update(tasks)
      .set({ status: "done" })
      .where(eq(tasks.assigneeUserId, leaver.user.id));

    await handOver({
      organisationId: org.id,
      fromUserId: leaver.user.id,
      toUserId: successor.user.id,
      actor: ACTOR,
    });

    const [done] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, org.id), eq(tasks.status, "done")));
    assert.equal(done.assigneeUserId, leaver.user.id, "the finished task stayed put");
  });

  it("refuses to hand work to somebody suspended", async () => {
    const { org, leaver, successor } = await withWork();
    await db
      .update(memberships)
      .set({ isActive: false })
      .where(eq(memberships.id, successor.membership.id));

    await assert.rejects(
      () =>
        handOver({
          organisationId: org.id,
          fromUserId: leaver.user.id,
          toUserId: successor.user.id,
          actor: ACTOR,
        }),
      HandoverRefused,
    );
  });

  it("refuses to hand work to the same person", async () => {
    const { org, leaver } = await withWork();
    await assert.rejects(
      () =>
        handOver({
          organisationId: org.id,
          fromUserId: leaver.user.id,
          toUserId: leaver.user.id,
          actor: ACTOR,
        }),
      HandoverRefused,
    );
  });

  it("offers only active members of the same organisation as successors", async () => {
    const { org, leaver, successor } = await withWork();
    const other = await scratch();
    await person(other.org.id, `elsewhere-${other.s}@example.test`, "owner");

    const options = await candidatesFor(org.id, leaver.user.id);
    assert.deepEqual(options.map((o) => o.id).sort(), [successor.user.id].sort());
  });

  it("does not move another organisation's work", async () => {
    const { org, leaver, successor } = await withWork();
    const other = await withWork();

    await handOver({
      organisationId: org.id,
      fromUserId: leaver.user.id,
      toUserId: successor.user.id,
      actor: ACTOR,
    });
    assert.equal(
      (await holdingsOf(other.org.id, other.leaver.user.id)).total,
      3,
      "the other organisation is untouched",
    );
  });
});
