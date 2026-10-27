import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, tasks, templates, templateVersions, workflowDefinitions } from "@/db/schema";
import { requirementsFor } from "@/lib/ai/training";
import { AI_LEAD_KINDS, canForKind, kindsFor, mayDecideStage, type Grant } from "@/lib/rbac";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { templateDefinition } from "@/lib/templates/schema";
import {
  RoutingRefused,
  installShippedWorkflows,
  resetWorkflow,
  updateStage,
  workflowsFor,
} from "@/services/approval-routing";
import {
  OutsideYourKinds,
  createDraftFrom,
  createTemplate,
  installShippedTemplates,
  publishVersion,
} from "@/services/templates";
import { openTasks } from "@/services/workflow";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };
const LEAD: Grant[] = [{ role: "ai_governance_lead", scope: "organisation" }];
const LEAD_KINDS = kindsFor(LEAD, "template.author");

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `GL ${label}`, slug: `gl-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity };
}

const DPIA = SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!;
const AI_RISK = SYSTEM_TEMPLATES.find((t) => t.kind === "ai_risk")!;

describe("what an AI governance lead reaches", () => {
  it("configures the AI kinds and nothing else", () => {
    assert.deepEqual([...LEAD_KINDS!].sort(), [...AI_LEAD_KINDS].sort());
    assert.ok(canForKind(LEAD, "workflow.configure", "ai_risk"));
    assert.ok(!canForKind(LEAD, "workflow.configure", "dpia"));
    assert.ok(!canForKind(LEAD, "template.publish", "screening"));
  });

  it("lifts the limit when another role grants the capability outright", () => {
    const both: Grant[] = [...LEAD, { role: "privacy_admin", scope: "organisation" }];
    assert.equal(kindsFor(both, "template.author"), null);
    assert.deepEqual(kindsFor([{ role: "privacy_analyst", scope: "organisation" }], "template.author"), []);
  });

  it("decides what AI governance decides, but not other roles' stages", () => {
    assert.ok(mayDecideStage(["ai_governance_lead"], "ai_governance"));
    assert.ok(!mayDecideStage(["ai_governance_lead"], "approver"));
  });

  it("is asked for the decision makers' course as well as AI governance's", () => {
    const courses = requirementsFor(["ai_governance_lead"], false).map((r) => r.course);
    for (const c of ["ai_leadership", "ai_ethics", "ai_risk", "data_protection_ai"]) {
      assert.ok(courses.includes(c as never), c);
    }
  });
});

describe("templates and workflows held to the lead's kinds", () => {
  after(() => pg.end());

  it("creates and publishes an AI risk template, and refuses a DPIA", async () => {
    const { org } = await world("tpl");
    const definition = templateDefinition.parse(AI_RISK.definition);
    const { version } = await createTemplate({
      organisationId: org.id, kind: "ai_risk", name: "Our AI risk", definition, kinds: LEAD_KINDS, actor: SYSTEM,
    });
    await publishVersion({ organisationId: org.id, versionId: version.id, kinds: LEAD_KINDS, actor: SYSTEM });

    await assert.rejects(
      createTemplate({
        organisationId: org.id, kind: "dpia", name: "Our DPIA",
        definition: templateDefinition.parse(DPIA.definition), kinds: LEAD_KINDS, actor: SYSTEM,
      }),
      OutsideYourKinds,
    );
  });

  it("will not publish or redraft somebody else's kind", async () => {
    const { org } = await world("other");
    const { template, version } = await createTemplate({
      organisationId: org.id, kind: "dpia", name: "Admin's DPIA",
      definition: templateDefinition.parse(DPIA.definition), actor: SYSTEM,
    });
    await assert.rejects(
      publishVersion({ organisationId: org.id, versionId: version.id, kinds: LEAD_KINDS, actor: SYSTEM }),
      OutsideYourKinds,
    );
    await publishVersion({ organisationId: org.id, versionId: version.id, actor: SYSTEM });
    await assert.rejects(
      createDraftFrom({ organisationId: org.id, templateId: template.id, kinds: LEAD_KINDS, actor: SYSTEM }),
      OutsideYourKinds,
    );
  });

  it("refuses a template from another organisation", async () => {
    const mine = await world("mine");
    const theirs = await world("theirs");
    const { version } = await createTemplate({
      organisationId: theirs.org.id, kind: "ai_risk", name: "Theirs",
      definition: templateDefinition.parse(AI_RISK.definition), actor: SYSTEM,
    });
    await assert.rejects(
      publishVersion({ organisationId: mine.org.id, versionId: version.id, actor: SYSTEM }),
      /No such template version/,
    );
  });

  it("installs only the shipped templates and workflows of the lead's kinds", async () => {
    const { org } = await world("install");
    await installShippedTemplates({ organisationId: org.id, kinds: LEAD_KINDS, actor: SYSTEM });
    const held = await db
      .select({ kind: templates.kind })
      .from(templates)
      .innerJoin(templateVersions, eq(templateVersions.templateId, templates.id))
      .where(eq(templates.organisationId, org.id));
    assert.ok(held.length > 0);
    assert.ok(held.every((h) => LEAD_KINDS!.includes(h.kind)));

    await installShippedWorkflows({ organisationId: org.id, kinds: LEAD_KINDS, actor: SYSTEM });
    const defs = await db
      .select({ kind: workflowDefinitions.templateKind })
      .from(workflowDefinitions)
      .where(eq(workflowDefinitions.organisationId, org.id));
    assert.deepEqual(defs.map((d) => d.kind).sort(), [...AI_LEAD_KINDS].sort());
  });

  it("changes the AI risk workflow and refuses the DPIA one", async () => {
    const { org } = await world("route");
    await installShippedWorkflows({ organisationId: org.id, actor: SYSTEM });
    const all = await workflowsFor(org.id);
    const ai = all.find((w) => w.templateKind === "ai_risk")!.stages[0];
    const dpia = all.find((w) => w.templateKind === "dpia")!.stages[0];

    await updateStage({
      organisationId: org.id, stageId: ai.id, name: ai.name, requiredRole: ai.requiredRole,
      slaHours: 72, kinds: LEAD_KINDS, actor: SYSTEM,
    });
    await assert.rejects(
      updateStage({
        organisationId: org.id, stageId: dpia.id, name: dpia.name, requiredRole: dpia.requiredRole,
        slaHours: 72, kinds: LEAD_KINDS, actor: SYSTEM,
      }),
      RoutingRefused,
    );
    await assert.rejects(
      resetWorkflow({ organisationId: org.id, templateKind: "dpia", kinds: LEAD_KINDS, actor: SYSTEM }),
      RoutingRefused,
    );
  });

  it("sees the tasks waiting on AI governance", async () => {
    const { org, entity } = await world("tasks");
    await db.insert(tasks).values({
      organisationId: org.id,
      entityId: entity.id,
      type: "approve_stage",
      title: "AI review",
      subjectType: "assessment",
      subjectId: crypto.randomUUID(),
      assigneeRole: "ai_governance",
      idempotencyKey: `t-${crypto.randomUUID()}`,
    });
    const seen = await openTasks(org.id, { entityIds: [], userId: null, grants: LEAD });
    assert.equal(seen.length, 1);
    const [row] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.organisationId, org.id), eq(tasks.assigneeRole, "ai_governance")));
    assert.equal(seen[0].id, row.id);
  });
});
