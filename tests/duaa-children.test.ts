import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { db, sql as pg } from "@/db/client";
import { entities, organisations } from "@/db/schema";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { evaluate } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { createAssessment, saveAnswers } from "@/services/assessments";
import { createActivity, loadActivity, updateActivity } from "@/services/ropa";
import { createTemplate, publishVersion } from "@/services/templates";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "children test" };

after(() => pg.end());

const dpia = SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!;

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `Children ${label}`, slug: `children-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const { version } = await createTemplate({ organisationId: org.id, kind: "dpia", name: dpia.name, definition: dpia.definition, actor: SYSTEM });
  const published = await publishVersion({ organisationId: org.id, versionId: version.id, actor: SYSTEM });
  const activity = await createActivity({ organisationId: org.id, entityId: entity.id, name: "Kids' games site", actor: SYSTEM });
  return { org, entity, published, activity };
}

describe("the DPIA", () => {
  const schema = templateDefinition.parse(dpia.definition).schema;

  it("asks how the children's higher protection matters shaped the measures, where children are likely to use it", () => {
    assert.equal(evaluate(schema, {}).questions.children_likely.required, true);
    assert.equal(evaluate(schema, { children_likely: false }).questions.children_protection.visible, false);
    assert.equal(evaluate(schema, { children_likely: true }).questions.children_protection.required, true);
  });
});

describe("the register", () => {
  it("asks for a DPIA, then for its answer on children, and is satisfied once there is one", async () => {
    const w = await world("gaps");
    const gaps = async () => (await loadActivity(w.activity.id, w.org.id))!.gaps;
    assert.ok(!(await gaps()).some((g) => g.startsWith("children_")), "nothing until somebody says children are likely");

    await updateActivity({ activityId: w.activity.id, organisationId: w.org.id, changes: { childrenLikely: true }, actor: SYSTEM });
    assert.ok((await gaps()).includes("children_no_dpia"));

    const assessment = await createAssessment({
      organisationId: w.org.id, entityId: w.entity.id, templateVersionId: w.published.id, title: "DPIA: games site",
      subjectType: "processing_activity", subjectId: w.activity.id, actor: SYSTEM,
    });
    assert.ok((await gaps()).includes("children_dpia_unanswered"));

    await saveAnswers({
      assessmentId: assessment.id, organisationId: w.org.id,
      answers: { children_likely: true, children_protection: "High-privacy defaults; no profiling; age-appropriate explanations for under-13s." },
      actor: SYSTEM,
    });
    assert.ok(!(await gaps()).some((g) => g.startsWith("children_")));

    await updateActivity({ activityId: w.activity.id, organisationId: w.org.id, changes: { childrenLikely: false }, actor: SYSTEM });
    assert.ok(!(await gaps()).some((g) => g.startsWith("children_")));
  });
});
