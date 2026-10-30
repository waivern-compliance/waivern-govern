import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { auditEvents, entities, evidence, organisations, scanFindings } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import {
  InventoryRefused,
  addItem,
  createProperty,
  decideProposal,
  ingestAnalyserReport,
  loadProperty,
  propertyRegister,
  recordStorageDecision,
  updateItem,
  updateProperty,
} from "@/services/storage-inventory";
import { createSupplier } from "@/services/third-party";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "pecr test" };

after(() => pg.end());

const sample = () => JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/consent-analyser-2.0.json"), "utf8"));

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `PECR ${label}`, slug: `pecr-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [entity] = await db.insert(entities).values({ organisationId: org.id, name: "Main", isDefault: true }).returning();
  const property = await createProperty({
    organisationId: org.id, entityId: entity.id, name: "Main website", url: "https://www.example.co.uk",
    actor: SYSTEM,
  });
  return { org, entity, property };
}

const ingest = (w: Awaited<ReturnType<typeof world>>, report: unknown = sample(), over: Partial<Parameters<typeof ingestAnalyserReport>[0]> = {}) =>
  ingestAnalyserReport({ propertyId: w.property.id, organisationId: w.org.id, report, source: "upload", actor: SYSTEM, ...over });

describe("websites and apps", () => {
  it("gets a reference, and refuses a website address that is not one", async () => {
    const w = await world("property");
    assert.match(w.property.reference, /^WEB-\d{4}-0001$/);
    await assert.rejects(
      createProperty({ organisationId: w.org.id, entityId: w.entity.id, name: "x", url: "example.com", actor: SYSTEM }),
      InventoryRefused,
    );
    const app = await createProperty({ organisationId: w.org.id, entityId: w.entity.id, name: "App", url: "uk.co.example.app", kind: "app", actor: SYSTEM });
    assert.equal(app.kind, "app");
  });
});

describe("uploading a Consent Analyser report", () => {
  it("keeps the report as evidence without screenshots or values, and proposes every item it saw", async () => {
    const w = await world("upload");
    const result = await ingest(w);
    assert.equal(result.proposedNew, 5);
    assert.equal(result.proposedNotSeen, 0);
    assert.equal(result.findings, 2);

    const [ev] = await db.select().from(evidence).where(eq(evidence.id, result.scan.evidenceId!));
    const kept = JSON.stringify(ev.payload);
    assert.ok(!kept.includes("iVBORw0KGgo") && !kept.includes("GA1.2.123456789"));

    const loaded = await loadProperty(w.property.id, w.org.id);
    assert.equal(loaded?.items.length, 0, "nothing goes on the inventory until a person accepts it");
    assert.equal(loaded?.proposals.length, 5);
    assert.equal(loaded?.property.cmp, "OneTrust");

    const findings = await db.select().from(scanFindings).where(eq(scanFindings.organisationId, w.org.id));
    assert.deepEqual(findings.map((f) => f.category), ["consent_check", "consent_check"]);
    const note = (id: string) => /Schedule A1 para 5/.test(findings.find((f) => f.title.includes(`${id}:`))?.detail ?? "");
    assert.ok(note("B.2"), "a cookie set before consent points at the statistics exception");
    assert.ok(!note("F.1"), "one collecting after Reject does not: rejecting is objecting");
    assert.equal((await verifyAuditChain(w.org.id)).ok, true);
  });

  it("refuses the same run twice, a blocked scan, and another site's report unless confirmed", async () => {
    const w = await world("refusals");
    await ingest(w);
    await assert.rejects(ingest(w), /already recorded/);

    const blocked = sample();
    blocked.run_id = "blocked1";
    blocked.metadata.bot_blocked = true;
    await assert.rejects(ingest(w, blocked), /blocked/);

    const other = sample();
    other.run_id = "other1";
    other.metadata.target_url = "https://www.somewhere-else.com/";
    await assert.rejects(ingest(w, other), /not https:\/\/www.example.co.uk/);
    await ingest(w, other, { acceptOtherSite: true });
  });
});

describe("turning proposals into the inventory", () => {
  it("adds accepted items with no basis, needs a reason to reject, and proposes what a later scan no longer sees", async () => {
    const w = await world("proposals");
    await ingest(w);
    const proposals = (await loadProperty(w.property.id, w.org.id))!.proposals;
    const fbp = proposals.find((p) => p.key.endsWith(":_fbp"))!;
    await assert.rejects(decideProposal({ proposalId: fbp.id, organisationId: w.org.id, accept: false, actor: SYSTEM }), /why/);
    await decideProposal({ proposalId: fbp.id, organisationId: w.org.id, accept: false, note: "Pixel removed last week.", actor: SYSTEM });
    for (const p of proposals.filter((p) => p.id !== fbp.id)) {
      await decideProposal({ proposalId: p.id, organisationId: w.org.id, accept: true, actor: SYSTEM });
    }
    await assert.rejects(decideProposal({ proposalId: fbp.id, organisationId: w.org.id, accept: true, actor: SYSTEM }), /already been decided/);

    let loaded = (await loadProperty(w.property.id, w.org.id))!;
    assert.deepEqual(loaded.items.map((i) => i.name).sort(), ["_ga", "_gid", "lang", "session_id"]);
    const ga = loaded.items.find((i) => i.name === "_ga")!;
    assert.deepEqual([ga.party, ga.suggestedCategory, ga.seenBeforeConsent, ga.decision], ["first", "analytics", true, null]);
    assert.deepEqual(ga.gaps, ["No basis recorded."]);

    // A later scan that no longer sees lang, and sees _ga only after consent.
    const later = sample();
    later.run_id = "later01";
    later.checklist = later.checklist.map((c: { item_id: string; evidence: Array<{ name: string }> }) =>
      c.item_id === "G.1" ? { ...c, evidence: c.evidence.filter((e) => e.name !== "lang") } : c.item_id === "B.2" ? { ...c, evidence: [] } : c,
    );
    later.metadata.cookie_ai_classification.classifications = later.metadata.cookie_ai_classification.classifications.filter(
      (c: { cookie_name: string }) => c.cookie_name !== "lang",
    );
    const second = await ingest(w, later);
    assert.equal(second.proposedNotSeen, 1);
    assert.equal(second.proposedNew, 1, "_fbp, rejected before, is proposed again because it is still there");

    loaded = (await loadProperty(w.property.id, w.org.id))!;
    assert.equal(loaded.items.find((i) => i.name === "_ga")!.seenBeforeConsent, false, "observations follow the latest scan");
    const notSeen = loaded.proposals.find((p) => p.change === "not_seen")!;
    await decideProposal({ proposalId: notSeen.id, organisationId: w.org.id, accept: true, actor: SYSTEM });
    assert.equal((await loadProperty(w.property.id, w.org.id))!.items.find((i) => i.name === "lang")!.status, "not_seen");
  });
});

describe("deciding the basis", () => {
  it("keeps every decision, and shows what Schedule A1 still needs", async () => {
    const w = await world("decide");
    const supplier = await createSupplier({ organisationId: w.org.id, name: "Google", actor: SYSTEM });
    const item = await addItem({
      propertyId: w.property.id, organisationId: w.org.id, name: "_ga", domain: ".example.co.uk", party: "first", actor: SYSTEM,
    });
    await assert.rejects(addItem({ propertyId: w.property.id, organisationId: w.org.id, name: "_ga", domain: "www.example.co.uk", actor: SYSTEM }), /already/);
    await assert.rejects(
      recordStorageDecision({ itemId: item.id, organisationId: w.org.id, basis: "statistics", rationale: " ", actor: SYSTEM }),
      /why/,
    );

    await recordStorageDecision({ itemId: item.id, organisationId: w.org.id, basis: "consent", rationale: "Shared with Google for ads.", actor: SYSTEM });
    await recordStorageDecision({
      itemId: item.id, organisationId: w.org.id, basis: "statistics",
      conditions: { provider_collects: true, sole_purpose: true, shared_only_to_improve: true, requested_service: true },
      rationale: "Google signals switched off; first-party analytics only.", actor: SYSTEM,
    });
    let ga = (await loadProperty(w.property.id, w.org.id))!.items[0];
    assert.equal(ga.history.length, 2);
    assert.equal(ga.decision?.basis, "statistics");
    assert.equal(ga.decision?.statutoryBasis, "PECR Sch A1 para 5");
    assert.deepEqual(Object.keys(ga.decision!.conditions).sort(), ["provider_collects", "shared_only_to_improve", "sole_purpose"], "only the basis's own conditions are kept");
    assert.equal(ga.gaps.length, 2, "no information and no objection route recorded yet");

    await updateProperty({
      propertyId: w.property.id, organisationId: w.org.id,
      changes: { informationUrl: "https://www.example.co.uk/cookies", objectionMechanism: "The analytics switch in Cookie settings, linked from every page footer." },
      actor: SYSTEM,
    });
    await updateItem({ itemId: item.id, organisationId: w.org.id, changes: { supplierId: supplier.id, purpose: "Page view counts" }, actor: SYSTEM });
    ga = (await loadProperty(w.property.id, w.org.id))!.items[0];
    assert.deepEqual(ga.gaps, []);
    assert.equal(ga.supplierName, "Google");

    const [reg] = await propertyRegister(w.org.id, null);
    assert.deepEqual([reg.active, reg.noBasis, reg.withGaps], [1, 0, 0]);

    await updateItem({ itemId: item.id, organisationId: w.org.id, changes: { status: "removed" }, actor: SYSTEM });
    assert.equal((await propertyRegister(w.org.id, null))[0].active, 0);

    const actions = (await db.select().from(auditEvents).where(and(eq(auditEvents.organisationId, w.org.id)))).map((e) => e.action);
    assert.ok(actions.includes("pecr.basis_decided") && actions.includes("pecr.item_status_set"));
  });
});
