import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  approvals,
  assessments,
  entities,
  organisations,
  schedules,
  tasks,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { sweepOrganisation } from "@/services/sweep";

const suffix = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

after(async () => {
  await pg.end();
});

/** An approved assessment whose review is due, owned and approved by different people. */
async function scenario() {
  const s = suffix();
  const [org] = await db
    .insert(organisations)
    .values({ name: `Reviews ${s}`, slug: `reviews-${s}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const [owner] = await db
    .insert(users)
    .values({ email: `owner-${s}@example.com` })
    .returning();
  const [approver] = await db
    .insert(users)
    .values({ email: `approver-${s}@example.com` })
    .returning();

  const [template] = await db
    .insert(templates)
    .values({ organisationId: org.id, kind: "dpia", name: `T ${s}` })
    .returning();
  const [version] = await db
    .insert(templateVersions)
    .values({
      templateId: template.id,
      version: 1,
      status: "published",
      publishedAt: new Date(),
      definition: {
        schema: { sections: [{ key: "s", title: "S", questions: [
          { key: "q", label: "Q", type: "short_text", required: false, legalRefs: [], evidence: "none" },
        ] }] },
        scoring: { method: "none" },
      },
    })
    .returning();

  const [assessment] = await db
    .insert(assessments)
    .values({
      organisationId: org.id,
      entityId: entity.id,
      templateVersionId: version.id,
      reference: `DPIA-${s}`,
      title: "Something approved a year ago",
      status: "approved",
      ownerId: owner.id,
      reviewDueAt: new Date(Date.now() - 5 * 86_400_000),
      reviewIntervalMonths: 12,
    })
    .returning();

  // The gate that was decided, by somebody other than the owner.
  await db.insert(approvals).values({
    assessmentId: assessment.id,
    position: 1,
    name: "DPO review",
    requiredRole: "privacy_admin",
    status: "approved",
    reason: "always required",
    decidedByUserId: approver.id,
    decidedByLabel: approver.email,
    decidedAt: new Date(Date.now() - 365 * 86_400_000),
  });

  await db.insert(schedules).values({
    organisationId: org.id,
    entityId: entity.id,
    subjectType: "assessment",
    subjectId: assessment.id,
    action: "reassess",
    title: `Reassess ${assessment.reference} ${assessment.title}`,
    intervalMonths: 12,
    nextDueAt: new Date(Date.now() - 86_400_000),
    assigneeUserId: owner.id,
  });

  return { org, entity, owner, approver, assessment };
}

describe("a review coming round", () => {
  it("asks the owner to reassess and the approver to decide again", async () => {
    // Two different jobs. A schedule holds one name, so the approvers are
    // found from the approvals themselves — which is the whole point of doing
    // it at materialisation rather than when the schedule was created.
    const { org, owner, approver, assessment } = await scenario();
    await sweepOrganisation(org.id);

    const raised = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, org.id), eq(tasks.subjectId, assessment.id)));

    const forOwner = raised.filter((t) => t.assigneeUserId === owner.id);
    const forApprover = raised.filter((t) => t.assigneeUserId === approver.id);

    assert.ok(forOwner.some((t) => t.type === "reassess"), "the owner should be asked to reassess");
    assert.ok(
      forApprover.some((t) => t.type === "review_assessment"),
      `the approver should be asked to decide again (got ${raised.map((t) => `${t.type}/${t.assigneeUserId === approver.id ? "approver" : "other"}`).join(", ")})`,
    );
    assert.match(forApprover[0].description ?? "", /you approved this/i);
  });

  it("does not ask the same person twice when they own and approved it", async () => {
    const s = suffix();
    const [org] = await db
      .insert(organisations)
      .values({ name: `Same ${s}`, slug: `same-${s}` })
      .returning();
    const [entity] = await db
      .insert(entities)
      .values({ organisationId: org.id, name: "Main", isDefault: true })
      .returning();
    const [person] = await db
      .insert(users)
      .values({ email: `both-${s}@example.com` })
      .returning();
    const [template] = await db
      .insert(templates)
      .values({ organisationId: org.id, kind: "dpia", name: `T ${s}` })
      .returning();
    const [version] = await db
      .insert(templateVersions)
      .values({
        templateId: template.id, version: 1, status: "published",
        publishedAt: new Date(),
        definition: {
          schema: { sections: [{ key: "s", title: "S", questions: [
            { key: "q", label: "Q", type: "short_text", required: false, legalRefs: [], evidence: "none" },
          ] }] },
          scoring: { method: "none" },
        },
      })
      .returning();
    const [assessment] = await db
      .insert(assessments)
      .values({
        organisationId: org.id, entityId: entity.id, templateVersionId: version.id,
        reference: `DPIA-${s}`, title: "Owned and approved by one person",
        status: "approved", ownerId: person.id,
      })
      .returning();
    await db.insert(approvals).values({
      assessmentId: assessment.id, position: 1, name: "Self", requiredRole: "privacy_admin",
      status: "approved", reason: "always", decidedByUserId: person.id,
      decidedByLabel: person.email, decidedAt: new Date(),
    });
    await db.insert(schedules).values({
      organisationId: org.id, entityId: entity.id, subjectType: "assessment",
      subjectId: assessment.id, action: "reassess", title: "Reassess it",
      intervalMonths: 12, nextDueAt: new Date(Date.now() - 86_400_000),
      assigneeUserId: person.id,
    });

    await sweepOrganisation(org.id);
    const raised = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, org.id), eq(tasks.subjectId, assessment.id)));

    // One reassessment, and no separate reapproval notice for the same person.
    assert.equal(raised.filter((t) => t.assigneeUserId === person.id).length, 1);
  });

  it("raises one task per occurrence however often the sweep runs", async () => {
    const { org, assessment } = await scenario();
    await sweepOrganisation(org.id);
    const first = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, org.id), eq(tasks.subjectId, assessment.id)));

    await sweepOrganisation(org.id);
    const second = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, org.id), eq(tasks.subjectId, assessment.id)));

    assert.equal(second.length, first.length, "a second sweep must not duplicate the tasks");
  });
});
