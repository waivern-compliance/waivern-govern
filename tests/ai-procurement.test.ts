import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  auditEvents,
  entities,
  organisations,
  suppliers,
  templateVersions,
  templates,
  workflowDefinitions,
} from "@/db/schema";
import { aiSupplierGaps, EXPECTED_TERMS } from "@/lib/thirdparty/ai-procurement";
import { createUseCase, loadUseCase, updateUseCase } from "@/services/ai-register";
import { installShippedWorkflows, shippedWorkflowsMissing } from "@/services/approval-routing";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { installShippedTemplates } from "@/services/templates";
import { createSupplier, loadSupplier, updateSupplier } from "@/services/third-party";
import { approvalsFor, decideApproval, submitForApproval } from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `AP ${label}`, slug: `ap-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity };
}

const ANSWERS = {
  supplier_name: "Acme Models",
  ai_involvement: "ai_product",
  ai_description: "Hosted language model behind our casework assistant.",
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
  // Three of the five expected terms: the register should name the other two.
  contract_terms: ["ai_use_disclosed", "no_training_on_our_data", "incident_notification"],
  lock_in: "possible",
  fallback: "degraded",
  recommendation: "proceed",
};

describe("AI supplier gaps", () => {
  it("asks nothing of a supplier with no AI and no systems", () => {
    assert.deepEqual(aiSupplierGaps("none", null, 0).gaps, []);
    assert.deepEqual(aiSupplierGaps(null, null, 0).gaps, []);
  });

  it("notices a supplier of AI systems whose AI use was never recorded", () => {
    const { gaps } = aiSupplierGaps(null, null, 2);
    assert.ok(gaps.includes("ai_involvement_unrecorded"));
    assert.ok(gaps.includes("ai_not_assessed"));
  });

  it("reports only that an unfinished assessment is unfinished", () => {
    const { gaps } = aiSupplierGaps("in_delivery", {
      reference: "TPR-1", assessmentId: "a", approved: false,
      trainsOnOurData: "yes_without_agreement", contractTerms: [], recommendation: null, conditions: null,
    }, 0);
    assert.deepEqual(gaps, ["ai_assessment_not_approved"]);
  });

  it("reads training and contract terms from an approved assessment", () => {
    const { gaps, missingTerms } = aiSupplierGaps("ai_product", {
      reference: "TPR-1", assessmentId: "a", approved: true,
      trainsOnOurData: "yes_without_agreement", contractTerms: ["ai_use_disclosed"], recommendation: "proceed", conditions: null,
    }, 1);
    assert.ok(gaps.includes("ai_trains_on_our_data"));
    assert.ok(gaps.includes("ai_terms_missing"));
    assert.equal(missingTerms.length, EXPECTED_TERMS.length - 1);
  });
});

describe("buying AI, end to end", () => {
  after(() => pg.end());

  it("installs the supplier workflow an older organisation lacks, once", async () => {
    const w = await world("wf");
    assert.ok((await shippedWorkflowsMissing(w.org.id)).some((s) => s.templateKind === "supplier_record"));
    const first = await installShippedWorkflows({ organisationId: w.org.id, actor: SYSTEM });
    assert.ok(first.includes("Supplier assessment approval"));
    assert.deepEqual(await installShippedWorkflows({ organisationId: w.org.id, actor: SYSTEM }), []);
    const defs = await db
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.organisationId, w.org.id),
          eq(workflowDefinitions.templateKind, "supplier_record"),
        ),
      );
    assert.equal(defs.length, 1);
  });

  it("refuses to link a system to another organisation's supplier", async () => {
    const mine = await world("mine");
    const theirs = await world("theirs");
    const supplier = await createSupplier({ organisationId: theirs.org.id, name: "Elsewhere AI", actor: SYSTEM });
    const useCase = await createUseCase({
      organisationId: mine.org.id,
      entityId: mine.entity.id,
      name: "Drafting assistant",
      purpose: "Drafts replies",
      systemType: "generative",
      provenance: "third_party_api",
      actor: SYSTEM,
    });
    await assert.rejects(
      updateUseCase({
        useCaseId: useCase.id,
        organisationId: mine.org.id,
        changes: { supplierId: supplier.id },
        actor: SYSTEM,
      }),
      /No such supplier/,
    );
  });

  it("carries a supplier's approved AI assessment through to the register", async () => {
    const w = await world("e2e");
    await installShippedTemplates({ organisationId: w.org.id, actor: SYSTEM });
    await installShippedWorkflows({ organisationId: w.org.id, actor: SYSTEM });

    const supplier = await createSupplier({ organisationId: w.org.id, name: "Acme Models", actor: SYSTEM });
    const useCase = await createUseCase({
      organisationId: w.org.id,
      entityId: w.entity.id,
      name: "Casework assistant",
      purpose: "Suggests replies to caseworkers",
      systemType: "generative",
      provenance: "third_party_api",
      lifecycleStage: "pilot",
      actor: SYSTEM,
    });

    // Bought in, supplier not named.
    let loaded = (await loadUseCase(useCase.id, w.org.id))!;
    assert.ok(loaded.gaps.includes("supplier_unrecorded"));

    await updateUseCase({
      useCaseId: useCase.id,
      organisationId: w.org.id,
      changes: { supplierId: supplier.id },
      actor: SYSTEM,
    });
    loaded = (await loadUseCase(useCase.id, w.org.id))!;
    assert.ok(loaded.gaps.includes("supplier_not_assessed"));
    assert.equal(loaded.supplier?.name, "Acme Models");

    // The supplier supplies a system but nobody said it uses AI.
    let row = (await loadSupplier(supplier.id, w.org.id))!;
    assert.equal(row.ai.systems, 1);
    assert.ok(row.ai.gaps.includes("ai_involvement_unrecorded"));

    await updateSupplier({
      supplierId: supplier.id,
      organisationId: w.org.id,
      changes: { aiInvolvement: "ai_product" },
      actor: SYSTEM,
    });

    const [version] = await db
      .select({ id: templateVersions.id })
      .from(templateVersions)
      .innerJoin(templates, eq(templates.id, templateVersions.templateId))
      .where(and(eq(templates.organisationId, w.org.id), eq(templates.name, "AI supplier assessment")));
    const assessment = await createAssessment({
      organisationId: w.org.id,
      entityId: w.entity.id,
      templateVersionId: version.id,
      title: "AI supplier assessment: Acme Models",
      subjectType: "supplier",
      subjectId: supplier.id,
      actor: SYSTEM,
    });
    await saveAnswers({ assessmentId: assessment.id, organisationId: w.org.id, answers: ANSWERS as never, actor: SYSTEM });
    await submitForApproval({ assessmentId: assessment.id, organisationId: w.org.id, actor: SYSTEM });

    // Submitted, not approved: the only gap is that it is unfinished.
    row = (await loadSupplier(supplier.id, w.org.id))!;
    assert.deepEqual(row.ai.gaps, ["ai_assessment_not_approved"]);

    const gates = await approvalsFor(assessment.id);
    // The AI review stage is routed because the supplier supplies AI.
    assert.ok(gates.some((g) => g.requiredRole === "ai_governance"));
    for (const gate of gates) {
      if (gate.status !== "pending") continue;
      await decideApproval({
        approvalId: gate.id,
        organisationId: w.org.id,
        decision: "approved",
        rationale: "Checked.",
        callerRoles: [gate.requiredRole],
        actor: SYSTEM,
      });
    }

    row = (await loadSupplier(supplier.id, w.org.id))!;
    assert.equal(row.ai.assessed?.approved, true);
    assert.deepEqual(row.ai.gaps, ["ai_terms_missing"]);
    assert.deepEqual(row.ai.missingTerms.sort(), ["data_return_deletion", "model_change_notice"]);

    loaded = (await loadUseCase(useCase.id, w.org.id))!;
    assert.ok(!loaded.gaps.includes("supplier_not_assessed"));
    assert.ok(!loaded.gaps.includes("supplier_unrecorded"));

    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, supplier.id), eq(auditEvents.action, "supplier.updated")));
    assert.equal((audit.after as Record<string, unknown>).aiInvolvement, "ai_product");
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, supplier.id));
    assert.equal(s.aiInvolvement, "ai_product");
  });
});
