import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, dpas, entities, organisations, suppliers } from "@/db/schema";
import {
  ArchiveRefused,
  archiveDpa,
  article28Gaps,
  currentDpa,
  dpasNeedingAttention,
  loadSupplier,
  recordDpa,
  restoreDpa,
  updateDpa,
} from "@/services/third-party";

const ACTOR = { actorKind: "system" as const, actorUserId: null, actorLabel: "lifecycle.test" };
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000);

after(async () => {
  await pg.end();
});

async function scratch() {
  const s = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const [org] = await db
    .insert(organisations)
    .values({ name: `Lifecycle ${s}`, slug: `lifecycle-${s}` })
    .returning();
  await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true });
  const [supplier] = await db
    .insert(suppliers)
    .values({ organisationId: org.id, name: `Vendor ${s}`, canonicalKey: `vendor-${s}` })
    .returning();
  const dpa = await recordDpa({
    organisationId: org.id,
    supplierId: supplier.id,
    title: "MSA Schedule 2",
    signedAt: day(-400),
    expiresAt: day(400),
    transferMechanism: "UK Addendum to SCCs",
    subProcessors: ["AWS"],
    actor: ACTOR,
  });
  return { org, supplier, dpa };
}

describe("correcting an agreement", () => {
  it("changes the fields in place rather than making a second agreement", async () => {
    const { org, supplier, dpa } = await scratch();
    await updateDpa({
      organisationId: org.id,
      dpaId: dpa.id,
      title: "MSA Schedule 2 (restated)",
      signedAt: day(-390),
      expiresAt: day(700),
      transferMechanism: "EU SCCs, Module Two",
      subProcessors: ["AWS", "Datadog Inc."],
      actor: ACTOR,
    });

    const loaded = await loadSupplier(supplier.id, org.id);
    assert.equal(loaded!.dpas.length, 1, "still one agreement");
    assert.equal(loaded!.dpas[0].title, "MSA Schedule 2 (restated)");
    assert.deepEqual(loaded!.dpas[0].subProcessors, ["AWS", "Datadog Inc."]);
  });

  it("clears a field that is emptied, rather than keeping the old value", async () => {
    const { org, dpa } = await scratch();
    await updateDpa({
      organisationId: org.id, dpaId: dpa.id, title: "MSA Schedule 2",
      expiresAt: null, transferMechanism: null, actor: ACTOR,
    });
    const [row] = await db.select().from(dpas).where(eq(dpas.id, dpa.id));
    assert.equal(row.expiresAt, null, "an agreement can become perpetual");
    assert.equal(row.transferMechanism, null);
  });

  it("records what each field was before, not only what it is now", async () => {
    const { org, dpa } = await scratch();
    await updateDpa({
      organisationId: org.id, dpaId: dpa.id, title: "Renamed", actor: ACTOR,
    });
    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, dpa.id));
    const updated = events.find((e) => e.action === "dpa.updated");
    assert.ok(updated, "the change is audited");
    assert.equal((updated!.before as { title?: string }).title, "MSA Schedule 2");
    assert.equal((updated!.after as { title?: string }).title, "Renamed");
  });

  it("cannot be edited from another organisation", async () => {
    const { dpa } = await scratch();
    const other = await scratch();
    await assert.rejects(() =>
      updateDpa({ organisationId: other.org.id, dpaId: dpa.id, title: "Hijacked", actor: ACTOR }),
    );
  });
});

describe("archiving an agreement", () => {
  it("takes it out of the in-force calculation but keeps the row", async () => {
    const { org, supplier, dpa } = await scratch();
    await archiveDpa({
      organisationId: org.id, dpaId: dpa.id,
      reason: "Superseded by the 2026 agreement", actor: ACTOR,
    });

    const loaded = await loadSupplier(supplier.id, org.id);
    assert.equal(loaded!.dpas.length, 1, "the agreement is still recorded");
    assert.equal(loaded!.current, null, "but nothing is in force");
  });

  it("reports the third party as uncovered rather than hiding the gap", async () => {
    // Archiving the only agreement must not make a compliance problem
    // disappear — that would make the feature a way of tidying away a finding.
    const { org, supplier, dpa } = await scratch();
    await archiveDpa({ organisationId: org.id, dpaId: dpa.id, reason: "Terminated", actor: ACTOR });

    const loaded = await loadSupplier(supplier.id, org.id);
    assert.ok(loaded!.gaps.includes("no_dpa"));
    assert.ok(loaded!.hardGaps.includes("no_dpa"));
  });

  it("stops the renewal reminders", async () => {
    const { org, supplier } = await scratch();
    const expiring = await recordDpa({
      organisationId: org.id, supplierId: supplier.id, title: "Expiring soon",
      signedAt: day(-300), expiresAt: day(20), actor: ACTOR,
    });

    const before = await dpasNeedingAttention(org.id);
    assert.ok(before.some((r) => r.dpa.id === expiring.id), "it is chased while live");

    await archiveDpa({ organisationId: org.id, dpaId: expiring.id, reason: "Not renewing", actor: ACTOR });
    const afterwards = await dpasNeedingAttention(org.id);
    assert.equal(afterwards.some((r) => r.dpa.id === expiring.id), false);
  });

  it("refuses without a reason", async () => {
    const { org, dpa } = await scratch();
    await assert.rejects(
      () => archiveDpa({ organisationId: org.id, dpaId: dpa.id, reason: "  ", actor: ACTOR }),
      ArchiveRefused,
    );
    const [row] = await db.select().from(dpas).where(eq(dpas.id, dpa.id));
    assert.equal(row.archivedAt, null, "nothing was archived");
  });

  it("keeps the reason and who did it", async () => {
    const { org, dpa } = await scratch();
    await archiveDpa({ organisationId: org.id, dpaId: dpa.id, reason: "Recorded in error", actor: ACTOR });
    const [row] = await db.select().from(dpas).where(eq(dpas.id, dpa.id));
    assert.equal(row.archivedReason, "Recorded in error");
    assert.ok(row.archivedAt);
  });

  it("is reversible", async () => {
    const { org, supplier, dpa } = await scratch();
    await archiveDpa({ organisationId: org.id, dpaId: dpa.id, reason: "Mistake", actor: ACTOR });
    await restoreDpa({ organisationId: org.id, dpaId: dpa.id, actor: ACTOR });

    const loaded = await loadSupplier(supplier.id, org.id);
    assert.equal(loaded!.current?.id, dpa.id, "it is in force again");
    assert.equal(loaded!.dpas[0].archivedReason, null);
  });

  it("archiving twice is not an error and does not change the first record", async () => {
    const { org, dpa } = await scratch();
    await archiveDpa({ organisationId: org.id, dpaId: dpa.id, reason: "First reason", actor: ACTOR });
    await archiveDpa({ organisationId: org.id, dpaId: dpa.id, reason: "Second reason", actor: ACTOR });
    const [row] = await db.select().from(dpas).where(eq(dpas.id, dpa.id));
    assert.equal(row.archivedReason, "First reason");
  });

  it("cannot be archived from another organisation", async () => {
    const { dpa } = await scratch();
    const other = await scratch();
    await assert.rejects(
      () => archiveDpa({ organisationId: other.org.id, dpaId: dpa.id, reason: "Nope", actor: ACTOR }),
      ArchiveRefused,
    );
  });
});

describe("which agreement counts", () => {
  it("falls back to the newest live one when the current is archived", async () => {
    const { org, supplier, dpa } = await scratch();
    const replacement = await recordDpa({
      organisationId: org.id, supplierId: supplier.id, title: "2026 agreement",
      signedAt: day(-10), expiresAt: day(900), transferMechanism: "EU SCCs",
      subProcessors: ["AWS"], actor: ACTOR,
    });

    const loaded = await loadSupplier(supplier.id, org.id);
    assert.equal(loaded!.current?.id, replacement.id, "the newest signed one is in force");

    await archiveDpa({ organisationId: org.id, dpaId: replacement.id, reason: "Signed in error", actor: ACTOR });
    const afterwards = await loadSupplier(supplier.id, org.id);
    assert.equal(afterwards!.current?.id, dpa.id, "the earlier one governs again");
  });

  it("is a pure decision the caller cannot get wrong by forgetting to filter", () => {
    const base = {
      id: "a", organisationId: "o", supplierId: "s", title: "t", documentRef: null,
      terms: {}, transferMechanism: null, subProcessors: [],
      sourceConnectionId: null, externalRef: null, archivedBy: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const live = { ...base, id: "live", signedAt: day(-5), expiresAt: day(100), archivedAt: null, archivedReason: null };
    const archived = { ...base, id: "archived", signedAt: day(-1), expiresAt: day(100), archivedAt: new Date(), archivedReason: "gone" };

    assert.equal(currentDpa([archived, live])?.id, "live");
    assert.equal(currentDpa([archived])?.id, undefined);
    assert.ok(article28Gaps({ sourceConnectionId: null, reviewedAt: null, ownerId: "u" } as never, [archived]).includes("no_dpa"));
  });
});
