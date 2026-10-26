import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { atrsRecords, auditEvents, entities, organisations, users, workflowDefinitions, workflowStages } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import {
  ATRS_FIELDS,
  invalidFields,
  missingFields,
  toAllDataRows,
  type AtrsValues,
} from "@/lib/atrs/standard";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import { createUseCase, loadUseCase, updateUseCase } from "@/services/ai-register";
import { createAssessment, saveAnswers } from "@/services/assessments";
import {
  AtrsRefused,
  approveRecord,
  discardDraft,
  exportRecord,
  markPublished,
  prefillFor,
  saveDraft,
  startRecord,
} from "@/services/atrs";
import { seedSharedLibrary } from "@/services/countries";
import { SegregationOfDuties, addMitigation, createRisk } from "@/services/risks";
import { createTemplate, publishVersion } from "@/services/templates";
import { approvalsFor, decideApproval, submitForApproval } from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

/** Every field the template needs, filled in. */
function complete(over: AtrsValues = {}): AtrsValues {
  const values: AtrsValues = {};
  for (const f of ATRS_FIELDS) {
    values[f.ref] =
      f.type === "select" ? f.options![0]
      : f.type === "yesno" ? "No"
      : f.type === "url" ? "https://example.gov.uk/tool"
      : f.type === "email" ? "ai-team@example.gov.uk"
      : `Answer for ${f.ref}`;
  }
  return { ...values, ...over };
}

async function person(label: string) {
  const [u] = await db
    .insert(users)
    .values({ email: `${label}-${crypto.randomUUID().slice(0, 8)}@example.com` })
    .returning();
  return { actorKind: "user" as const, actorUserId: u.id, actorLabel: u.email };
}

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Department ${label}`, slug: `atrs-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Department for Example", isDefault: true })
    .returning();
  const useCase = await createUseCase({
    organisationId: org.id,
    entityId: entity.id,
    name: "Benefit claim triage",
    purpose: "Prioritises claims for caseworker review. It does not decide any claim.",
    systemType: "predictive",
    provenance: "third_party_api",
    vendor: "Example Analytics Ltd",
    modelName: "triage-v3",
    lifecycleStage: "production",
    responsibleTeam: "Claims Digital",
    actor: SYSTEM,
  });
  return { org, entity, useCase, author: await person("author"), approver: await person("approver") };
}

after(async () => {
  await pg.end();
});

describe("the ATRS v4.0 fields", () => {
  it("are numbered once each", () => {
    const refs = ATRS_FIELDS.map((f) => f.ref);
    assert.equal(new Set(refs).size, refs.length);
  });

  it("need every Tier 1 and metadata field before approval", () => {
    const missing = missingFields({}).map((f) => f.ref);
    for (const ref of ["0.1", "0.2", "0.3", "0.4", "0.5", "1.1", "1.2", "1.4"]) {
      assert.ok(missing.includes(ref), ref);
    }
    // The website is "if there is one".
    assert.ok(!missing.includes("1.3"));
  });

  it("only ask about third parties when there were some", () => {
    assert.deepEqual(missingFields(complete({ "2.1.4": "No" })), []);
    const withThirdParty = missingFields(
      complete({ "2.1.4": "Yes", "2.1.4.1": "", "2.1.4.3": "" }),
    ).map((f) => f.ref);
    assert.deepEqual(withThirdParty.sort(), ["2.1.4.1", "2.1.4.3"]);
  });

  it("let the model and development data sections stay blank", () => {
    // The template allows it for off-the-shelf models the body did not train.
    const values = complete();
    for (const f of ATRS_FIELDS) {
      if (f.ref.startsWith("2.4.2") || f.ref.startsWith("2.4.3")) delete values[f.ref];
    }
    assert.deepEqual(missingFields(values), []);
  });

  it("refuse options the template does not offer", () => {
    const problems = invalidFields(complete({ "0.3": "Live", "1.4": "not an email" }));
    assert.deepEqual(problems.map((p) => p.ref).sort(), ["0.3", "1.4"]);
  });

  it("export in the template's own row layout", () => {
    const rows = toAllDataRows(complete());
    assert.equal(rows.length, ATRS_FIELDS.length);
    assert.deepEqual(rows[0].slice(0, 3), ["0.1", "Metadata and title", "Title"]);
  });
});

describe("starting a record from what is known", () => {
  it("fills in what the register says, and nothing it does not know", async () => {
    const w = await world("prefill");
    const values = await prefillFor(w.useCase.id, w.org.id);
    assert.equal(values["0.1"], "Benefit claim triage");
    assert.equal(values["0.2"], w.org.name);
    assert.equal(values["0.3"], "Production");
    assert.equal(values["0.5"], "Prioritises claims for caseworker review.");
    assert.equal(values["2.1.2"], "Claims Digital");
    assert.equal(values["2.1.4"], "Yes");
    assert.equal(values["2.1.4.1"], "Example Analytics Ltd");
    // Nobody has said how it is appealed, so it is left blank rather than
    // given a sentence that sounds like an answer.
    assert.equal(values["2.3.5"], undefined);
  });

  it("draws on approved assessments and the risks raised from them", async () => {
    await seedSharedLibrary();
    const w = await world("assessed");
    const spec = DEFAULT_WORKFLOWS.find((d) => d.templateKind === "ai_risk")!;
    const [def] = await db
      .insert(workflowDefinitions)
      .values({ organisationId: w.org.id, templateKind: "ai_risk", name: spec.name })
      .returning();
    for (const s of spec.stages) {
      await db.insert(workflowStages).values({
        workflowDefinitionId: def.id,
        position: s.position,
        name: s.name,
        requiredRole: s.requiredRole,
        condition: s.condition,
        slaHours: s.slaHours,
      });
    }
    const ai = SYSTEM_TEMPLATES.find((t) => t.name === "AI risk assessment")!;
    const { version } = await createTemplate({
      organisationId: w.org.id,
      kind: "ai_risk",
      name: ai.name,
      definition: ai.definition,
      actor: SYSTEM,
    });
    const published = await publishVersion({ organisationId: w.org.id, versionId: version.id, actor: SYSTEM });
    const assessment = await createAssessment({
      organisationId: w.org.id,
      entityId: w.entity.id,
      templateVersionId: published.id,
      title: "Claim triage",
      subjectType: "ai_use_case",
      subjectId: w.useCase.id,
      actor: SYSTEM,
    });
    await saveAnswers({
      assessmentId: assessment.id,
      organisationId: w.org.id,
      answers: {
        use_case_name: "Benefit claim triage",
        purpose: "Prioritises claims",
        ai_type: "predictive",
        provenance: "third_party_api",
        lifecycle_stage: "production",
        affects_people: true,
        consequence: "recommends",
        audience: ["public"],
        editorial_output: false,
        personal_data: true,
        dpia_reference: "DPIA-2026-0002",
        data_provenance: "partial",
        sensitive_inputs: "proxies_possible",
        bias_considered: "tested",
        bias_evidence: "Fairness report",
        affected_groups: "Claimants with limited digital access",
        contestability: "documented_route",
        human_oversight: "in_the_loop",
        monitoring: ["accuracy", "drift"],
        kill_switch: "Service owner",
        review_interval: "quarterly",
      } as never,
      actor: SYSTEM,
    });
    await submitForApproval({ assessmentId: assessment.id, organisationId: w.org.id, actor: SYSTEM });
    for (const gate of await approvalsFor(assessment.id)) {
      if (gate.status !== "pending") continue;
      await decideApproval({
        approvalId: gate.id,
        organisationId: w.org.id,
        decision: "approved",
        rationale: "Reviewed.",
        callerRoles: [gate.requiredRole],
        actor: SYSTEM,
      });
    }
    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.entity.id,
      title: "Unequal accuracy",
      description: "Lower accuracy for claims written in Welsh.",
      category: "fairness",
      likelihood: 2,
      impact: 3,
      assessmentId: assessment.id,
      actor: SYSTEM,
    });
    await addMitigation({
      riskId: risk.id,
      organisationId: w.org.id,
      description: "Welsh-language claims always routed to a person",
      treatmentType: "avoidance",
      actor: SYSTEM,
    });

    const values = await prefillFor(w.useCase.id, w.org.id);
    assert.match(values["2.3.2"], /reviews every output/);
    assert.match(values["2.3.5"], /documented route/);
    assert.match(values["2.4.1.4"], /every quarter/);
    assert.match(values["2.5.1"], new RegExp(assessment.reference));
    assert.match(values["2.5.2"], /Unequal accuracy \[Fairness\].*routed to a person \(avoid\)/);
  });
});

describe("the life of a record", () => {
  it("is started once, approved by somebody else, then published", async () => {
    const w = await world("lifecycle");
    const draft = await startRecord({ useCaseId: w.useCase.id, organisationId: w.org.id, actor: w.author });
    assert.equal(draft.version, 1);
    await assert.rejects(
      () => startRecord({ useCaseId: w.useCase.id, organisationId: w.org.id, actor: w.author }),
      (e) => e instanceof AtrsRefused,
    );

    // Incomplete: refused, naming what is missing.
    await assert.rejects(
      () => approveRecord({ recordId: draft.id, organisationId: w.org.id, actor: w.approver }),
      (e) => e instanceof AtrsRefused && e.fields.includes("0.4"),
    );

    await saveDraft({
      recordId: draft.id,
      organisationId: w.org.id,
      fields: { ...complete(), "9.9": "not a field" },
      actor: w.author,
    });
    const [saved] = await db.select().from(atrsRecords).where(eq(atrsRecords.id, draft.id));
    assert.equal(saved.fields["9.9"], undefined);

    await assert.rejects(
      () => approveRecord({ recordId: draft.id, organisationId: w.org.id, actor: w.author }),
      (e) => e instanceof SegregationOfDuties,
    );
    const approved = await approveRecord({ recordId: draft.id, organisationId: w.org.id, actor: w.approver });
    assert.equal(approved.status, "approved");

    // Approved content is what will be published, so it is no longer editable.
    await assert.rejects(
      () => saveDraft({ recordId: draft.id, organisationId: w.org.id, fields: complete(), actor: w.author }),
      (e) => e instanceof AtrsRefused,
    );
    await assert.rejects(() =>
      db.update(atrsRecords).set({ fields: {} }).where(eq(atrsRecords.id, draft.id)),
    );

    const published = await markPublished({
      recordId: draft.id,
      organisationId: w.org.id,
      publicationUrl: "https://www.gov.uk/algorithmic-transparency-records/example",
      actor: w.author,
    });
    assert.equal(published.status, "published");
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });

  it("starts a new version from the one in force, and supersedes it on approval", async () => {
    const w = await world("revision");
    const first = await startRecord({ useCaseId: w.useCase.id, organisationId: w.org.id, actor: w.author });
    await saveDraft({ recordId: first.id, organisationId: w.org.id, fields: complete(), actor: w.author });
    await approveRecord({ recordId: first.id, organisationId: w.org.id, actor: w.approver });

    const second = await startRecord({ useCaseId: w.useCase.id, organisationId: w.org.id, actor: w.author });
    assert.equal(second.version, 2);
    assert.equal(second.fields["2.2.1"], "Answer for 2.2.1");

    await approveRecord({ recordId: second.id, organisationId: w.org.id, actor: w.approver });
    const [old] = await db.select().from(atrsRecords).where(eq(atrsRecords.id, first.id));
    assert.equal(old.status, "superseded");
  });

  it("lets a draft be discarded, but not an approved version", async () => {
    const w = await world("discard");
    const draft = await startRecord({ useCaseId: w.useCase.id, organisationId: w.org.id, actor: w.author });
    await discardDraft({ recordId: draft.id, organisationId: w.org.id, actor: w.author });
    assert.equal((await db.select().from(atrsRecords).where(eq(atrsRecords.id, draft.id))).length, 0);

    const kept = await startRecord({ useCaseId: w.useCase.id, organisationId: w.org.id, actor: w.author });
    await saveDraft({ recordId: kept.id, organisationId: w.org.id, fields: complete(), actor: w.author });
    await approveRecord({ recordId: kept.id, organisationId: w.org.id, actor: w.approver });
    await assert.rejects(() => db.execute(sql`delete from atrs_record where id = ${kept.id}`));
  });

  it("exports the record and says so in the audit log", async () => {
    const w = await world("export");
    const draft = await startRecord({ useCaseId: w.useCase.id, organisationId: w.org.id, actor: w.author });
    const csv = await exportRecord({ recordId: draft.id, organisationId: w.org.id, format: "csv", actor: w.author });
    assert.match(csv!.body, /Reference number,Section,Field,Answer/);
    assert.match(csv!.body, /0\.1,Metadata and title,Title,Benefit claim triage/);
    const json = await exportRecord({ recordId: draft.id, organisationId: w.org.id, format: "json", actor: w.author });
    assert.equal(JSON.parse(json!.body).standardVersion, "4.0");

    const exported = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.subjectId, draft.id), eq(auditEvents.action, "data.exported")));
    assert.equal(exported.length, 2);
  });
});

describe("the register and transparency", () => {
  it("flags a live system that needs a record and has none", async () => {
    const w = await world("gap");
    await updateUseCase({
      useCaseId: w.useCase.id,
      organisationId: w.org.id,
      changes: { transparencyScope: "required" },
      actor: SYSTEM,
    });
    const before = await loadUseCase(w.useCase.id, w.org.id);
    assert.ok(before!.gaps.includes("transparency_record_missing"));

    const draft = await startRecord({ useCaseId: w.useCase.id, organisationId: w.org.id, actor: w.author });
    await saveDraft({ recordId: draft.id, organisationId: w.org.id, fields: complete(), actor: w.author });
    // A draft does not count: it is not a public record yet.
    assert.ok((await loadUseCase(w.useCase.id, w.org.id))!.gaps.includes("transparency_record_missing"));

    await approveRecord({ recordId: draft.id, organisationId: w.org.id, actor: w.approver });
    assert.ok(!(await loadUseCase(w.useCase.id, w.org.id))!.gaps.includes("transparency_record_missing"));
  });

  it("does not flag a voluntary record nobody has written", async () => {
    const w = await world("voluntary");
    await updateUseCase({
      useCaseId: w.useCase.id,
      organisationId: w.org.id,
      changes: { transparencyScope: "voluntary" },
      actor: SYSTEM,
    });
    assert.ok(!(await loadUseCase(w.useCase.id, w.org.id))!.gaps.includes("transparency_record_missing"));
  });
});
