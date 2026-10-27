import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { aiUseCases, entities, organisations, users } from "@/db/schema";
import type { AuthedConnection } from "@/lib/integration/auth";
import { aiUseCaseBatch } from "@/lib/integration/contracts";
import { updateUseCase } from "@/services/ai-register";
import { createConnection } from "@/services/connections";
import { governanceContext } from "@/services/export";
import { ingestAiUseCases } from "@/services/ingest";
import { createSupplier } from "@/services/third-party";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `AIX ${label}`, slug: `aix-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [main] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Public Service", isDefault: true })
    .returning();
  const created = await createConnection({
    organisationId: org.id,
    kind: "waivern_portal",
    name: "Portal",
    defaultEntityId: main.id,
    actor: SYSTEM,
  });
  const portal: AuthedConnection = {
    id: created.id,
    organisationId: org.id,
    kind: "waivern_portal",
    name: "Portal",
    defaultEntityId: main.id,
  };
  return { org, main, portal };
}

const record = (over: Record<string, unknown> = {}) =>
  aiUseCaseBatch.parse({
    records: [
      {
        externalRef: "portal-sys-41",
        name: "Complaint themes",
        purpose: "Finds themes in complaint letters.",
        systemType: "generative",
        provenance: "third_party_api",
        deploymentPattern: "public_api",
        lifecycleStage: "pilot",
        supplierName: "OpenModel Ltd",
        modelName: "om-large-2",
        ...over,
      },
    ],
  }).records;

describe("AI systems from the Portal", () => {
  after(() => pg.end());

  it("registers a new system, linked to a supplier recorded by hand", async () => {
    const w = await world("new");
    // Recorded through the UI, so keyed the UI's way.
    const supplier = await createSupplier({ organisationId: w.org.id, name: "OpenModel Ltd", actor: SYSTEM });
    const outcome = await ingestAiUseCases(w.portal, record());
    assert.deepEqual([outcome.created, outcome.updated], [1, 0]);
    const [row] = await db.select().from(aiUseCases).where(and(eq(aiUseCases.organisationId, w.org.id), eq(aiUseCases.externalRef, "portal-sys-41")));
    assert.equal(row.lifecycleStage, "pilot");
    assert.equal(row.supplierId, supplier.id);
    assert.ok(row.liveSince);
  });

  it("refreshes what a system is, never who governs it or where it has got to", async () => {
    const w = await world("update");
    await ingestAiUseCases(w.portal, record());
    const [row] = await db.select().from(aiUseCases).where(and(eq(aiUseCases.organisationId, w.org.id), eq(aiUseCases.externalRef, "portal-sys-41")));
    const [owner] = await db.insert(users).values({ email: `o-${crypto.randomUUID().slice(0, 8)}@example.com` }).returning();
    await updateUseCase({
      useCaseId: row.id,
      organisationId: w.org.id,
      changes: { ownerId: owner.id, transparencyScope: "required" },
      actor: SYSTEM,
    });

    const outcome = await ingestAiUseCases(
      w.portal,
      record({ name: "Complaint themes v2", lifecycleStage: "production", modelName: "om-large-3" }),
    );
    assert.deepEqual([outcome.created, outcome.updated], [0, 1]);
    const [after] = await db.select().from(aiUseCases).where(eq(aiUseCases.id, row.id));
    assert.equal(after.name, "Complaint themes v2");
    assert.equal(after.modelName, "om-large-3");
    assert.equal(after.lifecycleStage, "pilot");
    assert.equal(after.ownerId, owner.id);
    assert.equal(after.transparencyScope, "required");
  });

  it("keeps an unknown supplier as the vendor rather than inventing a supplier", async () => {
    const w = await world("vendor");
    await ingestAiUseCases(w.portal, record({ supplierName: "Nobody We Know" }));
    const [row] = await db.select().from(aiUseCases).where(and(eq(aiUseCases.organisationId, w.org.id), eq(aiUseCases.externalRef, "portal-sys-41")));
    assert.equal(row.supplierId, null);
    assert.equal(row.vendor, "Nobody We Know");
  });

  it("skips a record for an entity that does not exist", async () => {
    const w = await world("entity");
    const outcome = await ingestAiUseCases(w.portal, record({ entity: "Nowhere Ltd" }));
    assert.equal(outcome.created, 0);
    assert.equal(outcome.skipped.length, 1);
  });

  it("exports the register, with gaps and no unapproved judgement", async () => {
    const w = await world("export");
    await ingestAiUseCases(w.portal, record());
    const context = await governanceContext({ organisationId: w.org.id });
    assert.equal(context.aiSystems.length, 1);
    const sys = context.aiSystems[0];
    assert.equal(sys.externalRef, "portal-sys-41");
    assert.equal(sys.entity, "Public Service");
    assert.equal(sys.assessment, null);
    assert.ok(sys.gaps.includes("never_assessed"));
    assert.equal(context.counts.aiSystems, 1);

    // Incremental sync: nothing changed since now.
    const later = await governanceContext({ organisationId: w.org.id, since: new Date() });
    assert.equal(later.aiSystems.length, 0);
  });
});
