import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { isGap, tally } from "@/lib/ai-frameworks/profile";
import { mayEditAiProfile, type AppRole } from "@/lib/rbac";
import { ProfileRefused, exportNistProfile, nistProfile, setProfileItem } from "@/services/ai-profile";
import { createRisk } from "@/services/risks";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "profile test" };

after(() => pg.end());

async function organisation() {
  const [org] = await db
    .insert(organisations)
    .values({ name: "Profile Org", slug: `profile-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  return { org, entity };
}

describe("what counts as short of target", () => {
  it("is a target of partly or achieved that the organisation has not reached", () => {
    assert.equal(isGap("partial", "achieved"), true);
    assert.equal(isGap(null, "partial"), true, "not assessed cannot show it is met");
    assert.equal(isGap("not_applicable", "achieved"), true, "the target says it applies");
    assert.equal(isGap("achieved", "partial"), false);
    assert.equal(isGap("partial", "partial"), false);
    assert.equal(isGap("not_started", "not_applicable"), false);
    assert.equal(isGap("not_started", null), false, "no target, nothing to miss");
  });

  it("is tallied with everything else", () => {
    const t = tally([
      { current: "achieved", target: "achieved" },
      { current: "partial", target: "achieved" },
      { current: null, target: null },
    ]);
    assert.deepEqual(
      { achieved: t.achieved, partial: t.partial, unassessed: t.unassessed, gaps: t.gaps, targetsSet: t.targetsSet },
      { achieved: 1, partial: 1, unassessed: 1, gaps: 1, targetsSet: 2 },
    );
  });
});

describe("the profile", () => {
  it("lists all 72 subcategories, unassessed until somebody says", async () => {
    const { org } = await organisation();
    const profile = await nistProfile(org.id);
    assert.equal(profile.rows.length, 72);
    assert.equal(profile.tally.unassessed, 72);
    assert.deepEqual(profile.functions.map((f) => f.categories.length), [6, 5, 4, 4]);
  });

  it("records where a subcategory stands, once per change, and who said so", async () => {
    const { org } = await organisation();
    await setProfileItem({ organisationId: org.id, code: "MEASURE 2.11", current: "partial", target: "achieved", notes: " Bias tested on two models ", actor: SYSTEM });
    const again = await setProfileItem({ organisationId: org.id, code: "MEASURE 2.11", current: "partial", target: "achieved", notes: "Bias tested on two models", actor: SYSTEM });
    assert.equal(again.changed, false);
    await setProfileItem({ organisationId: org.id, code: "MEASURE 2.11", current: "achieved", target: "achieved", notes: "Bias tested on two models", actor: SYSTEM });

    const row = (await nistProfile(org.id)).rows.find((r) => r.id === "MEASURE 2.11")!;
    assert.equal(row.current, "achieved");
    assert.equal(row.notes, "Bias tested on two models");
    assert.equal(row.updatedBy, "profile test");

    const events = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.organisationId, org.id), eq(auditEvents.action, "ai_profile.item_set")));
    assert.equal(events.length, 2, "the unchanged save is not recorded");
    assert.equal((await verifyAuditChain(org.id)).ok, true);
  });

  it("refuses a subcategory or status that does not exist", async () => {
    const { org } = await organisation();
    await assert.rejects(setProfileItem({ organisationId: org.id, code: "MEASURE 9.9", current: "partial", target: null, actor: SYSTEM }), ProfileRefused);
    await assert.rejects(setProfileItem({ organisationId: org.id, code: "GOVERN 1.1", current: "mostly", target: null, actor: SYSTEM }), ProfileRefused);
  });

  it("counts what Govern holds towards each subcategory", async () => {
    const { org, entity } = await organisation();
    await createRisk({ organisationId: org.id, entityId: entity.id, title: "Drift", description: "Drift", category: "technical_robustness", likelihood: 2, impact: 2, actor: SYSTEM });
    const row = (await nistProfile(org.id)).rows.find((r) => r.id === "MANAGE 1.2")!;
    assert.deepEqual(row.evidence.find((e) => e.feature === "risk_register")?.count, 1);
    const inventory = (await nistProfile(org.id)).rows.find((r) => r.id === "GOVERN 1.6")!;
    assert.equal(inventory.evidence.find((e) => e.feature === "ai_register")?.count, 0);
  });

  it("downloads as a spreadsheet of 72 rows, and the download is recorded", async () => {
    const { org } = await organisation();
    await setProfileItem({ organisationId: org.id, code: "GOVERN 2.2", current: "not_started", target: "achieved", actor: SYSTEM });
    const { body, filename } = await exportNistProfile({ organisationId: org.id, organisationName: "Profile Org", actor: SYSTEM });
    const lines = body.trim().split("\r\n");
    assert.equal(lines.length, 73);
    assert.match(lines.find((l) => l.includes("GOVERN 2.2"))!, /Not started,Achieved,Yes/);
    assert.match(filename, /^profile-org-nist-ai-rmf-profile-\d{4}-\d{2}-\d{2}\.csv$/);
    const exported = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.organisationId, org.id), eq(auditEvents.action, "data.exported")));
    assert.equal(exported.length, 1);
  });
});

describe("who may set the profile", () => {
  const wide = (role: AppRole) => [{ role, scope: "organisation" as const }];
  it("is AI governance, its lead, a privacy administrator or an owner, across the organisation", () => {
    for (const role of ["owner", "privacy_admin", "ai_governance_lead", "ai_governance"] as const) {
      assert.equal(mayEditAiProfile(wide(role)), true, role);
    }
    for (const role of ["privacy_analyst", "approver", "contributor", "auditor"] as const) {
      assert.equal(mayEditAiProfile(wide(role)), false, role);
    }
    assert.equal(mayEditAiProfile([{ role: "ai_governance", scope: "entity", entityId: crypto.randomUUID() }]), false);
  });
});
