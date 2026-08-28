import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, users } from "@/db/schema";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import { workflowDefinitions, workflowStages } from "@/db/schema";
import { BadQuery, parseExportQuery } from "@/lib/integration/query";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { governanceContext } from "@/services/export";
import { createConnection } from "@/services/connections";
import { ingestProcessingActivities } from "@/services/ingest";
import { acceptRisk, createRisk, setResidual } from "@/services/risks";
import { createTemplate, publishVersion } from "@/services/templates";
import { decideApproval, submitForApproval } from "@/services/workflow";
import type { AuthedConnection } from "@/lib/integration/auth";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };
const DAY = 24 * 60 * 60 * 1000;

const ANSWERS = {
  activity_name: "Homepage personalisation",
  nature: "Rank homepage modules from signed-in behaviour.",
  purpose: "Improve relevance.",
  lawful_basis: "public_task",
  data_categories: ["viewing_history"],
  special_category: false,
  subject_groups: "Signed-in audience.",
  volume: 100000,
  retention: "Thirteen months.",
  necessity: "Required for ranking.",
  alternatives: "Editorial-only ranking rejected.",
  transparency: "Privacy notice.",
  rights_support: "Self-service controls.",
  transfers_abroad: false,
  risk_description: "Inference of interests.",
  likelihood: "unlikely",
  impact: "limited",
  measures: "Exclude sensitive topics.",
  residual_accepted: false,
};

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `X ${label}`, slug: `export-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [main] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Public Service", isDefault: true })
    .returning();
  const [studios] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Studios" })
    .returning();

  for (const spec of DEFAULT_WORKFLOWS.filter((w) => w.templateKind === "dpia")) {
    const [def] = await db
      .insert(workflowDefinitions)
      .values({ organisationId: org.id, templateKind: spec.templateKind, name: spec.name })
      .returning();
    for (const s of spec.stages) {
      await db.insert(workflowStages).values({
        workflowDefinitionId: def.id,
        position: s.position,
        name: s.name,
        requiredRole: s.requiredRole,
        condition: s.condition,
      });
    }
  }

  const dpia = SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!;
  const { version } = await createTemplate({
    organisationId: org.id,
    kind: "dpia",
    name: dpia.name,
    definition: dpia.definition,
    actor: SYSTEM,
  });
  const published = await publishVersion({
    organisationId: org.id,
    versionId: version.id,
    actor: SYSTEM,
  });

  const conn = await createConnection({
    organisationId: org.id,
    kind: "waivern_portal",
    name: "Portal",
    defaultEntityId: main.id,
    actor: SYSTEM,
  });
  const portal: AuthedConnection = {
    id: conn.id,
    organisationId: org.id,
    kind: "waivern_portal",
    name: "Portal",
    defaultEntityId: main.id,
  };

  const [approver] = await db
    .insert(users)
    .values({ email: `ap-${crypto.randomUUID().slice(0, 8)}@example.com`, name: "Approver" })
    .returning();

  return { org, main, studios, templateVersionId: published.id, portal, approver };
}

async function approvedAssessment(w: Awaited<ReturnType<typeof world>>, entityId: string) {
  const a = await createAssessment({
    organisationId: w.org.id,
    entityId,
    templateVersionId: w.templateVersionId,
    title: "Homepage personalisation",
    actor: SYSTEM,
  });
  await saveAnswers({
    assessmentId: a.id,
    organisationId: w.org.id,
    answers: ANSWERS as never,
    actor: SYSTEM,
  });
  const submitted = await submitForApproval({
    assessmentId: a.id,
    organisationId: w.org.id,
    actor: SYSTEM,
  });
  for (const gate of submitted.approvals.filter((g) => g.status === "pending")) {
    await decideApproval({
      approvalId: gate.id,
      organisationId: w.org.id,
      decision: "approved",
      rationale: "Reviewed against the template and the evidence.",
      callerRoles: [gate.requiredRole],
      actor: { actorKind: "user", actorUserId: null, actorLabel: "reviewer@example.com" },
    });
  }
  return a;
}

after(async () => {
  await pg.end();
});

describe("query parsing", () => {
  it("rejects a nonsense date rather than silently ignoring it", () => {
    // Silently dropping it would hand the caller a full export when they asked
    // for a delta, and they would have no way to tell.
    assert.throws(
      () => parseExportQuery(new URL("https://x/api?since=last-tuesday")),
      BadQuery,
    );
  });

  it("rejects a limit outside the allowed range", () => {
    assert.throws(() => parseExportQuery(new URL("https://x/api?limit=0")), BadQuery);
    assert.throws(() => parseExportQuery(new URL("https://x/api?limit=99999")), BadQuery);
  });

  it("accepts repeated entity parameters", () => {
    const q = parseExportQuery(new URL("https://x/api?entity=A&entity=B"));
    assert.deepEqual(q.entities, ["A", "B"]);
  });
});

describe("the governance context", () => {
  it("exports an approved assessment with who signed and why", async () => {
    const w = await world("approved");
    await approvedAssessment(w, w.main.id);

    const context = await governanceContext({ organisationId: w.org.id });
    assert.equal(context.assessments.length, 1);
    const a = context.assessments[0];
    assert.equal(a.kind, "dpia");
    assert.equal(a.entity, "Public Service");
    // The Portal generates from confirmed facts, so the signer and the
    // reasoning travel with the record.
    const signed = a.approvals.filter((g) => g.decision === "approved");
    assert.ok(signed.length >= 1);
    assert.equal(signed[0].by, "reviewer@example.com");
    assert.match(signed[0].rationale ?? "", /Reviewed against the template/);
  });

  it("leaves unapproved work out entirely", async () => {
    const w = await world("draft");
    const a = await createAssessment({
      organisationId: w.org.id,
      entityId: w.main.id,
      templateVersionId: w.templateVersionId,
      title: "Still being written",
      actor: SYSTEM,
    });
    await saveAnswers({
      assessmentId: a.id,
      organisationId: w.org.id,
      answers: { activity_name: "Half done" } as never,
      actor: SYSTEM,
    });

    const context = await governanceContext({ organisationId: w.org.id });
    // A document generated from somebody's unfinished work would read as
    // settled when it is not.
    assert.equal(context.assessments.length, 0);
  });

  it("carries the answers as they were approved, not as they are now", async () => {
    const w = await world("snapshot");
    await approvedAssessment(w, w.main.id);
    const context = await governanceContext({ organisationId: w.org.id });
    const a = context.assessments[0];
    assert.equal(a.answers.activity_name, "Homepage personalisation");
    // Questions the logic was not asking are named, so a reader can tell an
    // absent answer from an unasked question.
    assert.ok(a.notApplicable.includes("transfer_destinations"));
  });

  it("says plainly when an acceptance has lapsed", async () => {
    const w = await world("lapsed");
    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.main.id,
      title: "Residual exposure",
      description: "x",
      likelihood: 3,
      impact: 3,
      actor: SYSTEM,
    });
    await setResidual({
      riskId: risk.id,
      organisationId: w.org.id,
      likelihood: 2,
      impact: 2,
      actor: SYSTEM,
    });
    await db.execute(sql`
      insert into risk_acceptance
        (risk_id, accepted_by_label, rationale, residual_score_at_acceptance,
         residual_tier_at_acceptance, expires_at, created_at)
      values (${risk.id}, 'approver@example.com', 'Fine at the time.',
              4, 'medium', now() - interval '2 days', now() - interval '200 days')
    `);

    const context = await governanceContext({ organisationId: w.org.id });
    const r = context.risks.find((x) => x.reference === risk.reference)!;
    // Stated, not left for the reader to work out — otherwise a generated
    // document could present a lapsed acceptance as current.
    assert.equal(r.acceptance?.expired, true);
  });

  it("carries a live acceptance with its attester and expiry", async () => {
    const w = await world("accepted");
    const risk = await createRisk({
      organisationId: w.org.id,
      entityId: w.main.id,
      title: "Treated exposure",
      description: "x",
      likelihood: 3,
      impact: 3,
      actor: SYSTEM,
    });
    await setResidual({
      riskId: risk.id,
      organisationId: w.org.id,
      likelihood: 2,
      impact: 1,
      actor: SYSTEM,
    });
    await acceptRisk({
      riskId: risk.id,
      organisationId: w.org.id,
      rationale: "Within appetite after treatment.",
      expiresAt: new Date(Date.now() + 90 * DAY),
      actor: { actorKind: "user", actorUserId: w.approver.id, actorLabel: w.approver.email },
    });

    const context = await governanceContext({ organisationId: w.org.id });
    const r = context.risks.find((x) => x.reference === risk.reference)!;
    assert.equal(r.acceptance?.acceptedBy, w.approver.email);
    assert.equal(r.acceptance?.expired, false);
    assert.equal(r.residual?.tier, "low");
  });

  it("narrows to a named entity", async () => {
    const w = await world("scoped");
    await approvedAssessment(w, w.main.id);
    await approvedAssessment(w, w.studios.id);

    const all = await governanceContext({ organisationId: w.org.id });
    assert.equal(all.assessments.length, 2);

    const scoped = await governanceContext({
      organisationId: w.org.id,
      entities: ["Studios"],
    });
    assert.equal(scoped.assessments.length, 1);
    assert.equal(scoped.assessments[0].entity, "Studios");
    assert.deepEqual(scoped.scope.entities, ["Studios"]);
  });

  it("supports an incremental pull", async () => {
    const w = await world("since");
    await ingestProcessingActivities(w.portal, [
      {
        externalRef: "old", name: "Long-standing activity",
        purposes: [], dataCategories: [], subjectCategories: [],
        recipients: [], systems: [], transfers: [],
      },
    ]);
    const cutoff = new Date();
    await new Promise((r) => setTimeout(r, 20));
    await ingestProcessingActivities(w.portal, [
      {
        externalRef: "new", name: "Added afterwards",
        purposes: [], dataCategories: [], subjectCategories: [],
        recipients: [], systems: [], transfers: [],
      },
    ]);

    const delta = await governanceContext({ organisationId: w.org.id, since: cutoff });
    assert.equal(delta.processingActivities.length, 1);
    assert.equal(delta.processingActivities[0].name, "Added afterwards");
    assert.equal(delta.scope.since, cutoff.toISOString());
  });

  it("resolves evidence links to references the Portal can recognise", async () => {
    const w = await world("links");
    await ingestProcessingActivities(w.portal, [
      {
        externalRef: "pa", name: "Homepage",
        purposes: [], dataCategories: [], subjectCategories: [],
        recipients: [], systems: [], transfers: [],
      },
    ]);
    const first = await governanceContext({ organisationId: w.org.id });
    const activityRef = first.processingActivities[0].reference;

    const scanner = await createConnection({
      organisationId: w.org.id,
      kind: "har_analyser",
      name: "Scanner",
      defaultEntityId: w.main.id,
      actor: SYSTEM,
    });
    const { ingestScan } = await import("@/services/ingest");
    await ingestScan(
      {
        id: scanner.id,
        organisationId: w.org.id,
        kind: "har_analyser",
        name: "Scanner",
        defaultEntityId: w.main.id,
      },
      {
        scanRef: "s1",
        attachTo: activityRef,
        summary: {},
        findings: [
          { externalRef: "f1", category: "cookie", severity: "high", title: "A cookie", advisory: {} },
        ],
      },
    );

    const context = await governanceContext({ organisationId: w.org.id });
    const ev = context.evidence.find((e) => e.kind === "scan")!;
    // Internal ids would be meaningless over there; a reference is not.
    assert.deepEqual(ev.supports, [activityRef]);
  });

  it("is versioned, so the Portal can tell what shape it received", async () => {
    const w = await world("version");
    const context = await governanceContext({ organisationId: w.org.id });
    assert.equal(context.contextVersion, "1.0");
    assert.ok(context.generatedAt);
    assert.equal(context.organisation.name, w.org.name);
  });
});
