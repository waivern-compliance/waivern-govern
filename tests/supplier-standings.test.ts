import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, templates, templateVersions } from "@/db/schema";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { templateDefinition } from "@/lib/templates/schema";
import { aiStanding, aiSupplierGaps, isAiSupplierDefinition } from "@/lib/thirdparty/ai-procurement";
import { createUseCase, loadUseCase } from "@/services/ai-register";
import { installShippedWorkflows } from "@/services/approval-routing";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { createTemplate, installShippedTemplates, publishVersion } from "@/services/templates";
import { createSupplier, loadSupplier, privacyStanding, updateSupplier } from "@/services/third-party";
import { approvalsFor, decideApproval, submitForApproval } from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

const AI_ANSWERS = {
  supplier_name: "Acme Models",
  ai_involvement: "ai_product",
  ai_description: "Hosted language model.",
  model_provenance: "foundation_third_party",
  bid_ai_use: "no",
  trains_on_our_data: "no",
  personal_data: true,
  testing_evidence: "independent",
  bias_testing: "done",
  explainability: "partly",
  atrs_support: "yes",
  data_ethics: "answered",
  security_assurance: ["iso27001"],
  ai_threats: "yes",
  contract_terms: [
    "ai_use_disclosed", "no_training_on_our_data", "model_change_notice",
    "incident_notification", "data_return_deletion",
  ],
  lock_in: "possible",
  fallback: "degraded",
};

const assessed = (over: Partial<Parameters<typeof aiStanding>[1] & object> = {}) => ({
  reference: "TPR-1", assessmentId: "a", approved: true, trainsOnOurData: "no",
  contractTerms: [], recommendation: "proceed", conditions: null, ...over,
});

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `SS ${label}`, slug: `ss-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  await installShippedWorkflows({ organisationId: org.id, actor: SYSTEM });
  return { org, entity };
}

/** Run an assessment of a supplier through every approval stage. */
async function approved(
  w: Awaited<ReturnType<typeof world>>,
  templateVersionId: string,
  supplierId: string,
  answers: Record<string, unknown>,
) {
  const a = await createAssessment({
    organisationId: w.org.id, entityId: w.entity.id, templateVersionId,
    title: "Supplier assessment", subjectType: "supplier", subjectId: supplierId, actor: SYSTEM,
  });
  await saveAnswers({ assessmentId: a.id, organisationId: w.org.id, answers: answers as never, actor: SYSTEM });
  await submitForApproval({ assessmentId: a.id, organisationId: w.org.id, actor: SYSTEM });
  for (const gate of await approvalsFor(a.id)) {
    if (gate.status !== "pending") continue;
    await decideApproval({
      approvalId: gate.id, organisationId: w.org.id, decision: "approved",
      rationale: "Checked.", callerRoles: [gate.requiredRole], actor: SYSTEM,
    });
  }
  return a;
}

async function aiSupplierVersion(orgId: string) {
  await installShippedTemplates({ organisationId: orgId, actor: SYSTEM });
  const [v] = await db
    .select({ id: templateVersions.id })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(and(eq(templates.organisationId, orgId), eq(templates.name, "AI supplier assessment")));
  return v.id;
}

describe("telling the standings apart", () => {
  it("recognises an AI supplier assessment by its questions", () => {
    const ai = SYSTEM_TEMPLATES.find((t) => t.name === "AI supplier assessment")!;
    const dpia = SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!;
    assert.ok(isAiSupplierDefinition(templateDefinition.parse(ai.definition)));
    assert.ok(!isAiSupplierDefinition(templateDefinition.parse(dpia.definition)));
  });

  it("gives the AI standing from the recommendation once approved", () => {
    assert.equal(aiStanding("none", null, 0), "not_applicable");
    assert.equal(aiStanding("ai_product", null, 0), "not_assessed");
    assert.equal(aiStanding("ai_product", assessed({ approved: false }), 0), "in_review");
    assert.equal(aiStanding("ai_product", assessed({ recommendation: "proceed_with_conditions" }), 0), "proceed_with_conditions");
    assert.equal(aiStanding("ai_product", assessed({ recommendation: null }), 0), "approved_no_recommendation");
    assert.ok(
      aiSupplierGaps("ai_product", assessed({ recommendation: "do_not_proceed" }), 0).gaps.includes("ai_do_not_proceed"),
    );
  });

  it("gives the privacy standing from Article 28 alone", () => {
    assert.equal(privacyStanding([]), "met");
    assert.equal(privacyStanding(["dpa_expiring"]), "met_with_gaps");
    assert.equal(privacyStanding(["no_dpa", "no_owner"]), "not_met");
  });
});

describe("supplier standings, end to end", () => {
  after(() => pg.end());

  it("does not let a privacy assessment of the supplier count as its AI assessment", async () => {
    const w = await world("privacy");
    const supplier = await createSupplier({ organisationId: w.org.id, name: "Acme Cloud", actor: SYSTEM });
    await updateSupplier({
      supplierId: supplier.id, organisationId: w.org.id, changes: { aiInvolvement: "in_delivery" }, actor: SYSTEM,
    });

    const { version } = await createTemplate({
      organisationId: w.org.id,
      kind: "supplier_record",
      name: "Supplier privacy assessment",
      definition: templateDefinition.parse({
        schema: { sections: [{ key: "dp", title: "Data protection", questions: [
          { key: "security_ok", label: "Are its security measures adequate?", type: "long_text",
            required: true, legalRefs: [], evidence: "none" },
        ] }] },
        scoring: { method: "none" },
      }),
      actor: SYSTEM,
    });
    await publishVersion({ organisationId: w.org.id, versionId: version.id, actor: SYSTEM });
    await approved(w, version.id, supplier.id, { security_ok: "Yes, ISO 27001 certified." });

    const row = (await loadSupplier(supplier.id, w.org.id))!;
    assert.equal(row.ai.assessed, null);
    assert.equal(row.ai.standing, "not_assessed");
    assert.ok(row.ai.gaps.includes("ai_not_assessed"));
  });

  it("carries a do-not-proceed through to the supplier and the systems it supplies", async () => {
    const w = await world("dnp");
    const versionId = await aiSupplierVersion(w.org.id);
    const supplier = await createSupplier({ organisationId: w.org.id, name: "Acme Models", actor: SYSTEM });
    await updateSupplier({
      supplierId: supplier.id, organisationId: w.org.id, changes: { aiInvolvement: "ai_product" }, actor: SYSTEM,
    });
    const system = await createUseCase({
      organisationId: w.org.id, entityId: w.entity.id, name: "Drafting assistant", purpose: "Drafts replies",
      systemType: "generative", provenance: "third_party_api", supplierId: supplier.id, actor: SYSTEM,
    });

    await approved(w, versionId, supplier.id, { ...AI_ANSWERS, recommendation: "do_not_proceed" });

    const row = (await loadSupplier(supplier.id, w.org.id))!;
    assert.equal(row.ai.standing, "do_not_proceed");
    assert.ok(row.ai.gaps.includes("ai_do_not_proceed"));
    // The privacy standing is its own: no agreement, so not met, whatever AI said.
    assert.equal(row.privacy, "not_met");

    const loaded = (await loadUseCase(system.id, w.org.id))!;
    assert.ok(loaded.gaps.includes("supplier_advised_against"));
    assert.ok(!loaded.gaps.includes("supplier_not_assessed"));
  });

  it("shows the conditions a recommendation was given on", async () => {
    const w = await world("cond");
    const versionId = await aiSupplierVersion(w.org.id);
    const supplier = await createSupplier({ organisationId: w.org.id, name: "Acme Speech", actor: SYSTEM });
    await updateSupplier({
      supplierId: supplier.id, organisationId: w.org.id, changes: { aiInvolvement: "ai_product" }, actor: SYSTEM,
    });
    await approved(w, versionId, supplier.id, {
      ...AI_ANSWERS, recommendation: "proceed_with_conditions", conditions: "Pilot only; no citizen data.",
    });

    const row = (await loadSupplier(supplier.id, w.org.id))!;
    assert.equal(row.ai.standing, "proceed_with_conditions");
    assert.equal(row.ai.assessed?.conditions, "Pilot only; no citizen data.");
  });
});
