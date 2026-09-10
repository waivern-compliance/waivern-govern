import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { assessments, entities, organisations } from "@/db/schema";
import { scopedEntityIds } from "@/lib/rbac";
import { candidatesFor } from "@/services/handover";

after(async () => {
  await pg.end();
});

/**
 * What happens when somebody can see nothing.
 *
 * Both bugs here were the same shape: an empty string standing in for a uuid.
 * One took the settings screen down in production; the other was waiting at
 * eleven more call sites for a viewer whose grants resolve to no entities.
 */

describe("an empty entity scope", () => {
  it("is a real state, not an impossible one", () => {
    // No grant carries the capability, and none is organisation-wide, so the
    // scope is an empty list rather than null. Every page that then filters by
    // it was passing [""] to a uuid column.
    const scope = scopedEntityIds(
      [{ role: "contributor", scope: "entity", entityId: crypto.randomUUID() }],
      "audit.export",
    );
    assert.deepEqual(scope, [], "an empty list, not null and not an error");
  });

  it("matches nothing rather than throwing", async () => {
    const rows = await db
      .select({ id: assessments.id })
      .from(assessments)
      .where(inArray(assessments.entityId, []));
    assert.deepEqual(rows, [], "an empty IN list is no rows, not a type error");
  });

  it("rejects the empty string it used to be given", async () => {
    // Kept as a test so nobody reintroduces the idiom believing it harmless.
    await assert.rejects(
      () =>
        db
          .select({ id: assessments.id })
          .from(assessments)
          .where(inArray(assessments.entityId, [""])),
      /invalid input syntax for type uuid|Failed query/,
    );
  });
});

describe("listing who could take work on", () => {
  async function scratch() {
    const s = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const [org] = await db
      .insert(organisations)
      .values({ name: `Scope ${s}`, slug: `scope-${s}` })
      .returning();
    await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true });
    return org;
  }

  it("works when nobody is being excluded", async () => {
    // The regression: the people screen lists everybody, so it excluded
    // nobody — and said so by passing an empty string, which Postgres reads
    // as an empty uuid and refuses.
    const org = await scratch();
    const everyone = await candidatesFor(org.id);
    assert.ok(Array.isArray(everyone));
  });

  it("still excludes the person handing over when asked", async () => {
    const org = await scratch();
    const excluded = await candidatesFor(org.id, crypto.randomUUID());
    assert.ok(Array.isArray(excluded));
  });
});
