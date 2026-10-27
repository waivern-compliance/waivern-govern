import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { entities, organisations, suppliers } from "@/db/schema";
import { refusable } from "@/lib/edit-result";
import { recordBreach, updateBreach } from "@/services/breaches";
import { createActivity, updateActivity } from "@/services/ropa";
import { createSupplier, updateSupplier } from "@/services/third-party";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world() {
  const [org] = await db
    .insert(organisations)
    .values({ name: "ER", slug: `er-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Main", isDefault: true })
    .returning();
  return { org, entity };
}

describe("refusable", () => {
  it("reports a service's refusal in its own words", async () => {
    const r = await refusable(async () => {
      throw new Error("A third party needs a name.");
    });
    assert.deepEqual(r, { ok: false, message: "A third party needs a name." });
  });

  it("does not show a database error's wording", async () => {
    const dbError = Object.assign(new Error('null value in column "name" violates not-null constraint'), {
      code: "23502",
    });
    const original = console.error;
    console.error = () => {};
    try {
      const r = await refusable(async () => {
        throw dbError;
      });
      assert.equal(r?.ok, false);
      assert.doesNotMatch(r!.message, /column|constraint/);
    } finally {
      console.error = original;
    }
  });

  it("reports success", async () => {
    assert.equal((await refusable(async () => {}))?.ok, true);
  });
});

describe("blank names are refused, not saved", () => {
  after(() => pg.end());

  it("keeps a third party's name", async () => {
    const { org } = await world();
    const s = await createSupplier({ organisationId: org.id, name: "Acme", actor: SYSTEM });
    await assert.rejects(
      updateSupplier({ supplierId: s.id, organisationId: org.id, changes: { name: "  " }, actor: SYSTEM }),
      /needs a name/,
    );
    const [row] = await db.select().from(suppliers).where(eq(suppliers.id, s.id));
    assert.equal(row.name, "Acme");
  });

  it("keeps a processing activity's name and a breach's title", async () => {
    const { org, entity } = await world();
    const a = await createActivity({ organisationId: org.id, entityId: entity.id, name: "Payroll", actor: SYSTEM });
    await assert.rejects(
      updateActivity({ activityId: a.id, organisationId: org.id, changes: { name: "" }, actor: SYSTEM }),
      /needs a name/,
    );
    const b = await recordBreach({
      organisationId: org.id, entityId: entity.id, title: "Laptop lost", description: "On a train.",
      discoveredAt: new Date(), actor: SYSTEM,
    });
    await assert.rejects(
      updateBreach({ breachId: b.id, organisationId: org.id, changes: { title: "" }, actor: SYSTEM }),
      /needs a title/,
    );
  });
});
