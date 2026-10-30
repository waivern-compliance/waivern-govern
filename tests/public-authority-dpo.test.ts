import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations } from "@/db/schema";
import { DpoRefused, barredBasesFor, cleanDpo, dpoMissing, effectiveDpo } from "@/lib/dpa2018/public-authority";
import { SYSTEM_TEMPLATES } from "@/lib/templates/library";
import { evaluate } from "@/lib/templates/logic";
import { templateDefinition } from "@/lib/templates/schema";
import { dpoPosition, setDpo, setPublicAuthority } from "@/services/entities";
import { HARD_GAPS, createActivity, loadActivity, updateActivity } from "@/services/ropa";
import { NotInOrganisation } from "@/services/tenancy-guards";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "public authority test" };

after(() => pg.end());

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `PA ${label}`, slug: `pa-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [council] = await db.insert(entities).values({ organisationId: org.id, name: "The Council", isDefault: true }).returning();
  const [trading] = await db.insert(entities).values({ organisationId: org.id, name: "Council Trading Ltd" }).returning();
  return { org, council, trading };
}

const DPO = { name: "Dana Officer", contact: "dpo@example.gov.uk", reportsTo: "Chief Executive", published: true };

describe("the rules", () => {
  it("bars legitimate interests and recognised legitimate interests from a public authority's tasks, not from what is outside them", () => {
    const bases = ["public_task", "legitimate_interests", "recognised_legitimate_interests"] as const;
    assert.deepEqual(barredBasesFor({ publicAuthority: true, bases, outsidePublicTasks: false }), ["legitimate_interests", "recognised_legitimate_interests"]);
    assert.deepEqual(barredBasesFor({ publicAuthority: true, bases, outsidePublicTasks: true }), []);
    assert.deepEqual(barredBasesFor({ publicAuthority: false, bases, outsidePublicTasks: false }), []);
  });

  it("records a DPO with a way to reach them, or none, and lets an entity's own stand in for the organisation's", () => {
    assert.equal(cleanDpo({ name: " ", contact: "" }), null);
    assert.throws(() => cleanDpo({ name: "Dana" }), DpoRefused);
    assert.throws(() => cleanDpo({ contact: "dpo@example.com" }), DpoRefused);
    const org = cleanDpo(DPO)!;
    const own = cleanDpo({ name: "Sam", contact: "sam@example.com" })!;
    assert.equal(effectiveDpo(org, null), org);
    assert.equal(effectiveDpo(org, own), own);
    assert.equal(dpoMissing({ publicAuthority: true, dpo: null }, null), true);
    assert.equal(dpoMissing({ publicAuthority: true, dpo: null }, org), false);
    assert.equal(dpoMissing({ publicAuthority: false, dpo: null }, null), false);
  });
});

describe("the register", () => {
  it("is red where a public authority rests its tasks on legitimate interests, until that is said to be outside its tasks", async () => {
    const w = await world("ropa");
    const activity = await createActivity({ organisationId: w.org.id, entityId: w.council.id, name: "Resident newsletter", lawfulBases: ["legitimate_interests"], actor: SYSTEM });
    const gaps = async () => (await loadActivity(activity.id, w.org.id))!;
    assert.ok(!(await gaps()).gaps.includes("public_authority_legitimate_interests"), "not a public authority yet");

    await setPublicAuthority({ organisationId: w.org.id, entityId: w.council.id, publicAuthority: true, actor: SYSTEM });
    const flagged = await gaps();
    assert.ok(flagged.hardGaps.includes("public_authority_legitimate_interests"));
    assert.ok(HARD_GAPS.includes("public_authority_legitimate_interests"));

    await updateActivity({ activityId: activity.id, organisationId: w.org.id, changes: { outsidePublicTasks: true }, actor: SYSTEM });
    assert.ok(!(await gaps()).gaps.includes("public_authority_legitimate_interests"));

    const [event] = (await db.select().from(auditEvents).where(eq(auditEvents.subjectId, w.council.id)))
      .filter((e) => e.action === "entity.public_authority_changed");
    assert.deepEqual(event.after, { publicAuthority: true });
  });
});

describe("the data protection officer", () => {
  it("says which public authorities have none, and is satisfied by the organisation's or an entity's own", async () => {
    const w = await world("dpo");
    await setPublicAuthority({ organisationId: w.org.id, entityId: w.council.id, publicAuthority: true, actor: SYSTEM });
    let position = await dpoPosition(w.org.id);
    assert.deepEqual(position.entities.filter((e) => e.missing).map((e) => e.name), ["The Council"]);

    await setDpo({ organisationId: w.org.id, dpo: DPO, actor: SYSTEM });
    position = await dpoPosition(w.org.id);
    assert.ok(position.entities.every((e) => !e.missing));
    assert.equal(position.entities.find((e) => e.name === "Council Trading Ltd")!.effectiveDpo?.name, "Dana Officer");

    await setDpo({ organisationId: w.org.id, entityId: w.trading.id, dpo: { name: "Sam", contact: "sam@example.com" }, actor: SYSTEM });
    position = await dpoPosition(w.org.id);
    assert.equal(position.entities.find((e) => e.name === "Council Trading Ltd")!.effectiveDpo?.name, "Sam");

    const events = (await db.select().from(auditEvents).where(eq(auditEvents.organisationId, w.org.id))).map((e) => e.action);
    assert.ok(events.includes("organisation.dpo_changed") && events.includes("entity.dpo_changed"));
  });

  it("refuses a member of another organisation as the DPO", async () => {
    const w = await world("member");
    await assert.rejects(
      setDpo({ organisationId: w.org.id, dpo: { ...DPO, userId: crypto.randomUUID() }, actor: SYSTEM }),
      NotInOrganisation,
    );
  });
});

describe("the DPIA", () => {
  const schema = templateDefinition.parse(SYSTEM_TEMPLATES.find((t) => t.kind === "dpia")!.definition).schema;

  it("asks whether the DPO's advice was sought, and what it was (Article 35(2))", () => {
    assert.equal(evaluate(schema, {}).questions.dpo_consulted.required, true);
    assert.equal(evaluate(schema, { dpo_consulted: "advice" }).questions.dpo_advice.required, true);
    assert.equal(evaluate(schema, { dpo_consulted: "no_dpo" }).questions.dpo_advice.visible, false);
  });
});
