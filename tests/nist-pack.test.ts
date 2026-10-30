import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { organisations } from "@/db/schema";
import { categoryLabel } from "@/lib/ai-frameworks";
import { nistSubcategory, TRUSTWORTHY_CHARACTERISTICS } from "@/lib/ai-frameworks/nist-ai-rmf";
import { NIST_AI_RMF } from "@/lib/ai-frameworks/nist-pack";
import { UK_DSIT } from "@/lib/ai-frameworks/uk-dsit";
import { APPETITE_LEVELS } from "@/lib/risk/appetite";
import { suggestionsFor } from "@/lib/risk/treatment-library";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { DSIT_AI_RISK } from "@/lib/templates/library/dsit-ai-risk";
import { NIST_AI_RISK } from "@/lib/templates/library/nist-ai-risk";
import { templateDefinition, type TemplateDefinition } from "@/lib/templates/schema";
import { aiFrameworkPackOf } from "@/services/ai-framework";
import { shippedTemplatesMissing } from "@/services/templates";

after(() => pg.end());

const question = (t: TemplateDefinition, key: string) =>
  t.schema.sections.flatMap((s) => s.questions).find((q) => q.key === key);

describe("the NIST pack's categories", () => {
  it("are the seven characteristics, plus financial and legal risk kept from the UK set", () => {
    const values = NIST_AI_RMF.categories.map((c) => c.value);
    assert.deepEqual(values, [...TRUSTWORTHY_CHARACTERISTICS.map((c) => c.value), "financial", "legal_regulatory"]);
    for (const kept of ["financial", "legal_regulatory"]) {
      assert.ok(UK_DSIT.categories.some((c) => c.value === kept), `${kept} must keep the UK set's value`);
    }
  });

  it("read the same in either framework", () => {
    assert.equal(categoryLabel("fair_bias_managed"), "Fair, with harmful bias managed");
    assert.equal(categoryLabel("legal_regulatory"), "Legal and regulatory compliance");
  });

  it("have appetite guidance at every level", () => {
    for (const c of NIST_AI_RMF.categories) {
      for (const level of APPETITE_LEVELS) assert.ok(NIST_AI_RMF.appetiteGuidance[c.value]?.[level], `${c.value} / ${level}`);
    }
  });
});

describe("the NIST pack's treatments", () => {
  it("offer something for every category, each from a real Playbook subcategory", () => {
    for (const c of NIST_AI_RMF.categories) {
      assert.ok(suggestionsFor(c.value, NIST_AI_RMF.treatments).matching.length > 0, `nothing for ${c.value}`);
    }
    for (const t of NIST_AI_RMF.treatments) {
      assert.ok(nistSubcategory(t.theme), `${t.key} cites ${t.theme}`);
      assert.match(t.key, /^nist\./);
    }
  });
});

describe("the NIST identification template", () => {
  it("is a valid template", () => {
    assert.doesNotThrow(() => templateDefinition.parse(NIST_AI_RISK));
  });

  it("asks what the register, workflows and transparency records read, exactly as the DSIT template does", () => {
    // Read by ai-register.ts, atrs.ts, workflow conditions and the review sweep.
    for (const key of [
      "consequence", "human_oversight", "monitoring", "bias_considered", "contestability", "review_interval",
      "model_choice", "personal_data", "public_facing", "expected_spend_gbp", "affects_people", "lifecycle_stage",
    ]) {
      const ours = question(NIST_AI_RISK, key);
      const theirs = question(DSIT_AI_RISK, key);
      assert.ok(ours, `${key} is missing`);
      assert.equal(ours.type, theirs!.type, `${key} type`);
      assert.deepEqual(ours.options, theirs!.options, `${key} options`);
    }
  });

  it("files findings under the NIST pack's categories", () => {
    const options = question(NIST_AI_RISK, "risk_categories")!.options!.map((o) => o.value);
    assert.deepEqual(options, [...NIST_AI_RMF.categories.map((c) => c.value), "none"]);
  });

  it("cites NIST on every question except the evidence pointer", () => {
    for (const q of NIST_AI_RISK.schema.sections.flatMap((s) => s.questions)) {
      if (q.key === "bias_evidence") continue;
      assert.ok(q.legalRefs.length > 0, `${q.key} cites nothing`);
    }
  });
});

describe("installing shipped templates", () => {
  async function organisation(framework: "uk_dsit" | "nist_ai_rmf") {
    const [org] = await db
      .insert(organisations)
      .values({ name: "Pack Org", slug: `pack-${crypto.randomUUID().slice(0, 8)}` })
      .returning();
    await db.update(organisations).set({ aiFramework: framework }).where(eq(organisations.id, org.id));
    return org.id;
  }

  it("offers each organisation its own framework's identification template and not the other's", async () => {
    const uk = (await shippedTemplatesMissing(await organisation("uk_dsit"))).map((t) => t.name);
    const nist = (await shippedTemplatesMissing(await organisation("nist_ai_rmf"))).map((t) => t.name);
    assert.ok(uk.includes("AI risk identification (DSIT toolkit)"));
    assert.ok(!uk.includes("AI risk identification (NIST AI RMF)"));
    assert.ok(nist.includes("AI risk identification (NIST AI RMF)"));
    assert.ok(!nist.includes("AI risk identification (DSIT toolkit)"));
    // Everything not tied to a framework goes to both (the Part 3 DPIA waits for a competent authority).
    const shared = SYSTEM_TEMPLATES.filter((t) => !t.aiFramework && !t.competentAuthority).map((t) => t.name);
    for (const name of shared) assert.ok(uk.includes(name) && nist.includes(name), name);
  });

  it("gives an organisation following NIST the NIST pack", async () => {
    assert.equal(await aiFrameworkPackOf(await organisation("nist_ai_rmf")), NIST_AI_RMF);
  });
});
