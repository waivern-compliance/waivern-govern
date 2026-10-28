import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, organisations } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { mayManageEntities } from "@/lib/rbac";
import { EntityRefused, addEntity, entitiesOf, makeDefaultEntity, renameEntity } from "@/services/entities";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "entities test" };

async function organisation() {
  const [org] = await db
    .insert(organisations)
    .values({ name: "Entity Group", slug: `entity-group-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [main] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Group Public Service", legalEntityRef: "GPS", isDefault: true })
    .returning();
  return { org, main };
}

async function actions(organisationId: string) {
  return (await db.select().from(auditEvents).where(eq(auditEvents.organisationId, organisationId))).map((e) => e.action);
}

after(() => pg.end());

describe("who may change the entities", () => {
  it("is an owner over the whole organisation, and nobody else", () => {
    const whole = { role: "owner", scope: "organisation", entityId: null } as const;
    const confined = { role: "owner", scope: "entity", entityId: crypto.randomUUID() } as const;
    const admin = { role: "privacy_admin", scope: "organisation", entityId: null } as const;
    assert.equal(mayManageEntities([whole]), true);
    assert.equal(mayManageEntities([confined]), false, "an owner confined to one entity");
    assert.equal(mayManageEntities([admin]), false, "a privacy admin, though it holds entity.manage");
  });
});

describe("adding a legal entity", () => {
  it("adds one, not as the default, and records it", async () => {
    const { org } = await organisation();
    const studios = await addEntity({ organisationId: org.id, name: "  Group   Studios ", legalEntityRef: "GST", actor: SYSTEM });
    assert.equal(studios.name, "Group Studios");
    assert.equal(studios.isDefault, false);
    assert.deepEqual((await entitiesOf(org.id)).map((e) => e.name), ["Group Public Service", "Group Studios"]);
    assert.ok((await actions(org.id)).includes("entity.created"));
    assert.equal((await verifyAuditChain(org.id)).ok, true);
  });

  it("refuses a name or reference another entity already answers to", async () => {
    const { org } = await organisation();
    await assert.rejects(addEntity({ organisationId: org.id, name: "group public service", actor: SYSTEM }), EntityRefused);
    await assert.rejects(addEntity({ organisationId: org.id, name: "Other", legalEntityRef: "gps", actor: SYSTEM }), EntityRefused);
    await assert.rejects(addEntity({ organisationId: org.id, name: "GPS", actor: SYSTEM }), /already called or referenced/);
    await assert.rejects(addEntity({ organisationId: org.id, name: " ", actor: SYSTEM }), /Give the legal entity's name/);
  });
});

describe("renaming", () => {
  it("changes the name and reference, records both, and lets an entity keep its own", async () => {
    const { org, main } = await organisation();
    const unchanged = await renameEntity({ organisationId: org.id, entityId: main.id, name: "Group Public Service", legalEntityRef: "GPS", actor: SYSTEM });
    assert.equal(unchanged.name, "Group Public Service");
    assert.ok(!(await actions(org.id)).includes("entity.renamed"), "nothing changed, nothing recorded");

    const renamed = await renameEntity({ organisationId: org.id, entityId: main.id, name: "Group PSB", legalEntityRef: "", actor: SYSTEM });
    assert.equal(renamed.name, "Group PSB");
    assert.equal(renamed.legalEntityRef, null);
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.organisationId, org.id), eq(auditEvents.action, "entity.renamed")));
    assert.deepEqual(event.before, { name: "Group Public Service", legalEntityRef: "GPS" });
  });

  it("refuses a name another entity has", async () => {
    const { org, main } = await organisation();
    await addEntity({ organisationId: org.id, name: "Group Studios", actor: SYSTEM });
    await assert.rejects(renameEntity({ organisationId: org.id, entityId: main.id, name: "Group Studios", actor: SYSTEM }), EntityRefused);
  });
});

describe("the default", () => {
  it("is always exactly one", async () => {
    const { org, main } = await organisation();
    const studios = await addEntity({ organisationId: org.id, name: "Group Studios", actor: SYSTEM });
    await makeDefaultEntity({ organisationId: org.id, entityId: studios.id, actor: SYSTEM });
    const all = await entitiesOf(org.id);
    assert.deepEqual(all.filter((e) => e.isDefault).map((e) => e.id), [studios.id]);
    assert.equal(all.find((e) => e.id === main.id)?.isDefault, false);
    assert.ok((await actions(org.id)).includes("entity.made_default"));
  });
});
