import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations, riskAppetites, risks, templates } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { refileCategory } from "@/lib/ai-frameworks/crosswalk";
import { NIST_AI_RMF } from "@/lib/ai-frameworks/nist-pack";
import { UK_DSIT } from "@/lib/ai-frameworks/uk-dsit";
import { mayChooseAiFramework, type AppRole } from "@/lib/rbac";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { aiFrameworkOf } from "@/services/ai-framework";
import {
  FrameworkSwitchRefused,
  previewAiFrameworkSwitch,
  switchAiFramework,
} from "@/services/ai-framework-switch";
import { createRisk } from "@/services/risks";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "framework test" };

after(() => pg.end());

async function world() {
  const [org] = await db
    .insert(organisations)
    .values({ name: "Switch Org", slug: `switch-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  const risk = async (title: string, category: string) =>
    createRisk({ organisationId: org.id, entityId: entity.id, title, description: title, category, likelihood: 2, impact: 2, actor: SYSTEM });
  const appetite = async (category: string, level: "averse" | "minimal" | "cautious" | "open", toleratedTier: "low" | "medium" | "high") =>
    db.insert(riskAppetites).values({
      organisationId: org.id,
      category,
      level,
      toleratedTier,
      statement: `${level} on ${category}`,
      status: "approved",
      proposedByLabel: "someone",
      decidedByLabel: "board",
      decidedAt: new Date(),
      approvalReference: "Board, minute 1",
    });

  const fairness = await risk("Unequal outcomes", "fairness");
  const opaque = await risk("Cannot explain refusals", "transparency_explainability");
  const appeal = await risk("No route to appeal", "contestability_redress");
  const money = await risk("Licence costs rise", "financial");
  const own = await risk("Supplier insolvency", "Supplier insolvency");
  await appetite("fairness", "cautious", "medium");
  await appetite("accountability_governance", "minimal", "low");
  await appetite("contestability_redress", "open", "high");
  await appetite("financial", "cautious", "medium");
  return { org, fairness, opaque, appeal, money, own };
}

const categoryOf = async (id: string) => (await db.select().from(risks).where(eq(risks.id, id)))[0].category;

describe("re-filing", () => {
  it("moves each UK category to one in NIST and back, and leaves shared and the organisation's own alone", () => {
    assert.equal(refileCategory("fairness", "nist_ai_rmf"), "fair_bias_managed");
    assert.equal(refileCategory("fair_bias_managed", "uk_dsit"), "fairness");
    assert.equal(refileCategory("financial", "nist_ai_rmf"), null);
    assert.equal(refileCategory("legal_regulatory", "uk_dsit"), null);
    assert.equal(refileCategory("Supplier insolvency", "nist_ai_rmf"), null);
    assert.equal(refileCategory(null, "nist_ai_rmf"), null);
  });

  it("lands every category of one framework somewhere in the other", () => {
    for (const c of UK_DSIT.categories) {
      const to = refileCategory(c.value, "nist_ai_rmf") ?? c.value;
      assert.ok(NIST_AI_RMF.categories.some((n) => n.value === to), `${c.value} → ${to}`);
    }
    for (const c of NIST_AI_RMF.categories) {
      const to = refileCategory(c.value, "uk_dsit") ?? c.value;
      assert.ok(UK_DSIT.categories.some((u) => u.value === to), `${c.value} → ${to}`);
    }
  });
});

describe("previewing a switch", () => {
  it("says what would move and what would be proposed, and changes nothing", async () => {
    const w = await world();
    const preview = await previewAiFrameworkSwitch(w.org.id, "nist_ai_rmf");

    assert.deepEqual(
      Object.fromEntries(preview.refiled.map((r) => [r.title, r.to])),
      {
        "Unequal outcomes": "fair_bias_managed",
        "Cannot explain refusals": "explainable_interpretable",
        "No route to appeal": "accountable_transparent",
      },
    );

    const proposed = Object.fromEntries(preview.appetite.map((a) => [a.category, a]));
    assert.equal(proposed.fair_bias_managed.level, "cautious");
    // Two UK statements map into accountable and transparent; the cautious one wins.
    assert.equal(proposed.accountable_transparent.level, "minimal");
    assert.equal(proposed.accountable_transparent.toleratedTier, "low");
    assert.equal(proposed.accountable_transparent.carriedFrom.length, 2);
    assert.ok(!proposed.financial, "financial keeps its own approved statement");
    assert.ok(!preview.withoutAppetite.includes("financial"));
    assert.ok(preview.withoutAppetite.includes("fair_bias_managed"), "proposed is not yet approved");

    assert.deepEqual(preview.templatesToInstall, ["AI risk identification (NIST AI RMF)"]);
    assert.equal(await aiFrameworkOf(w.org.id), "uk_dsit");
    assert.equal(await categoryOf(w.fairness.id), "fairness");
  });

  it("refuses a framework that does not exist", async () => {
    const w = await world();
    await assert.rejects(previewAiFrameworkSwitch(w.org.id, "iso_42001"), FrameworkSwitchRefused);
  });
});

describe("switching", () => {
  it("re-files risks, proposes appetite, installs the template and records it all", async () => {
    const w = await world();
    const done = await switchAiFramework({ organisationId: w.org.id, to: "nist_ai_rmf", actor: SYSTEM });

    assert.equal(await aiFrameworkOf(w.org.id), "nist_ai_rmf");
    assert.equal(done.refiled, 3);
    assert.equal(await categoryOf(w.fairness.id), "fair_bias_managed");
    assert.equal(await categoryOf(w.money.id), "financial");
    assert.equal(await categoryOf(w.own.id), "Supplier insolvency");

    const proposals = await db
      .select()
      .from(riskAppetites)
      .where(and(eq(riskAppetites.organisationId, w.org.id), eq(riskAppetites.status, "proposed")));
    assert.deepEqual(proposals.map((p) => p.category).sort(), ["accountable_transparent", "fair_bias_managed"]);
    assert.match(proposals.find((p) => p.category === "fair_bias_managed")!.statement, /^Carried over on moving to NIST/);

    const names = (await db.select({ name: templates.name }).from(templates).where(eq(templates.organisationId, w.org.id))).map((t) => t.name);
    assert.ok(names.includes("AI risk identification (NIST AI RMF)"));
    assert.deepEqual(done.installed, ["AI risk identification (NIST AI RMF)"]);

    const actions = (await db.select().from(auditEvents).where(eq(auditEvents.organisationId, w.org.id))).map((e) => e.action);
    assert.equal(actions.filter((a) => a === "risk.recategorised").length, 3);
    assert.ok(actions.includes("organisation.ai_framework_set"));
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });

  it("refuses to switch to the framework already followed", async () => {
    const w = await world();
    await assert.rejects(
      switchAiFramework({ organisationId: w.org.id, to: "uk_dsit", actor: SYSTEM }),
      /already follows/,
    );
  });

  it("can be undone by switching back, without proposing appetite that still stands", async () => {
    const w = await world();
    await switchAiFramework({ organisationId: w.org.id, to: "nist_ai_rmf", actor: SYSTEM });
    const back = await switchAiFramework({ organisationId: w.org.id, to: "uk_dsit", actor: SYSTEM });

    assert.equal(await aiFrameworkOf(w.org.id), "uk_dsit");
    assert.equal(await categoryOf(w.fairness.id), "fairness");
    assert.equal(await categoryOf(w.opaque.id), "transparency_explainability");
    // Two UK categories share one NIST characteristic, so one of them comes back as the other.
    assert.equal(await categoryOf(w.appeal.id), "accountability_governance");
    assert.deepEqual(back.appetiteProposed, [], "the UK statements were never withdrawn");
    assert.ok(back.installed.every((n) => n === UK_DSIT.identificationTemplate), "only the UK framework's own template");
  });

  it("only ever installs the framework's own templates", () => {
    for (const t of SYSTEM_TEMPLATES.filter((x) => x.aiFramework)) {
      assert.ok(t.aiFramework === "uk_dsit" || t.aiFramework === "nist_ai_rmf", t.name);
    }
    assert.ok(SYSTEM_TEMPLATES.some((t) => t.name === NIST_AI_RMF.identificationTemplate && t.aiFramework === "nist_ai_rmf"));
    assert.ok(SYSTEM_TEMPLATES.some((t) => t.name === UK_DSIT.identificationTemplate && t.aiFramework === "uk_dsit"));
  });
});

describe("who may choose the framework", () => {
  const wide = (role: AppRole) => [{ role, scope: "organisation" as const }];

  it("is an owner, a privacy administrator or an AI governance lead, across the organisation", () => {
    assert.equal(mayChooseAiFramework(wide("owner")), true);
    assert.equal(mayChooseAiFramework(wide("privacy_admin")), true);
    assert.equal(mayChooseAiFramework(wide("ai_governance_lead")), true);
    for (const role of ["ai_governance", "privacy_analyst", "approver", "contributor", "auditor"] as const) {
      assert.equal(mayChooseAiFramework(wide(role)), false, role);
    }
    assert.equal(
      mayChooseAiFramework([{ role: "owner", scope: "entity", entityId: crypto.randomUUID() }]),
      false,
      "an owner confined to one entity",
    );
  });
});
