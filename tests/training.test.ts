import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, memberships, organisations, roleAssignments, trainingRecords, users } from "@/db/schema";
import { requirementsFor, statusOf } from "@/lib/ai/training";
import { createUseCase, loadUseCase } from "@/services/ai-register";
import { TrainingRefused, coverage, recordTraining } from "@/services/training";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };
const DAY = 86_400_000;

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `TR ${label}`, slug: `tr-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity };
}

async function member(orgId: string, label: string, roles: Array<"approver" | "ai_governance" | "contributor"> = []) {
  const [u] = await db
    .insert(users)
    .values({ email: `${label}-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  const [m] = await db.insert(memberships).values({ organisationId: orgId, userId: u.id }).returning();
  for (const role of roles) {
    await db.insert(roleAssignments).values({ membershipId: m.id, role, scope: "organisation" });
  }
  return { user: u, actor: { actorKind: "user" as const, actorUserId: u.id, actorLabel: u.email } };
}

describe("who needs what", () => {
  it("asks the fundamentals of everyone and more of those who decide", () => {
    assert.deepEqual(requirementsFor([], false).map((r) => r.course), ["ai_fundamentals"]);
    const approver = requirementsFor(["approver"], false).map((r) => r.course);
    assert.ok(approver.includes("ai_leadership") && approver.includes("ai_risk"));
  });

  it("asks more of somebody who owns an AI system, and says why", () => {
    const req = requirementsFor(["contributor"], true);
    const risk = req.find((r) => r.course === "ai_risk");
    assert.deepEqual(risk?.because, ["owns an AI system"]);
  });

  it("lets learning go stale, generative AI soonest", () => {
    const now = new Date("2026-10-27T00:00:00Z");
    const fourteenMonthsAgo = new Date(now.getTime() - 425 * DAY);
    assert.equal(statusOf("genai_use", fourteenMonthsAgo, now), "expired");
    assert.equal(statusOf("ai_fundamentals", fourteenMonthsAgo, now), "current");
    assert.equal(statusOf("ai_fundamentals", null, now), "missing");
  });
});

describe("training records", () => {
  after(() => pg.end());

  it("records a self-attestation, and keeps it as written", async () => {
    const { org } = await world("self");
    const me = await member(org.id, "me");
    const row = await recordTraining({
      organisationId: org.id,
      userId: me.user.id,
      courseKey: "ai_fundamentals",
      completedAt: new Date(Date.now() - 10 * DAY),
      actor: me.actor,
    });
    assert.equal(row.selfAttested, true);
    assert.equal(row.title, "Fundamentals of AI and generative AI");
    await assert.rejects(db.update(trainingRecords).set({ title: "x" }).where(eq(trainingRecords.id, row.id)));
    await assert.rejects(db.delete(trainingRecords).where(eq(trainingRecords.id, row.id)));
  });

  it("refuses a completion in the future or for a non-member", async () => {
    const { org } = await world("refuse");
    const me = await member(org.id, "me");
    await assert.rejects(
      recordTraining({ organisationId: org.id, userId: me.user.id, courseKey: "ai_ethics", completedAt: new Date(Date.now() + 5 * DAY), actor: me.actor }),
      TrainingRefused,
    );
    const { org: other } = await world("other");
    await assert.rejects(
      recordTraining({ organisationId: other.id, userId: me.user.id, courseKey: "ai_ethics", completedAt: new Date(), actor: SYSTEM }),
      /not a member/,
    );
  });

  it("shows coverage per person, and an untrained owner on the register", async () => {
    const { org, entity } = await world("cover");
    const owner = await member(org.id, "owner", ["contributor"]);
    const system = await createUseCase({
      organisationId: org.id,
      entityId: entity.id,
      name: "Triage",
      purpose: "Ranks letters",
      systemType: "predictive",
      provenance: "built_in_house",
      ownerId: owner.user.id,
      actor: SYSTEM,
    });

    let [mine] = await coverage(org.id, owner.user.id);
    assert.equal(mine.ownsAiSystem, true);
    assert.equal(mine.outstanding, 3);
    assert.ok((await loadUseCase(system.id, org.id))!.gaps.includes("owner_not_trained"));

    for (const course of ["ai_fundamentals", "ai_leadership", "ai_risk"]) {
      await recordTraining({
        organisationId: org.id,
        userId: owner.user.id,
        courseKey: course,
        completedAt: new Date(Date.now() - DAY),
        actor: owner.actor,
      });
    }
    [mine] = await coverage(org.id, owner.user.id);
    assert.equal(mine.outstanding, 0);
    assert.ok(!(await loadUseCase(system.id, org.id))!.gaps.includes("owner_not_trained"));
  });
});
