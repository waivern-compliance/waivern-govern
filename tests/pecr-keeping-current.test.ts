import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import { digitalProperties, entities, organisations, tasks } from "@/db/schema";
import { rescanDueAt, rescanState } from "@/lib/pecr/rescan";
import { mergeGapSummaries, summariseGaps, type Gap } from "@/lib/pecr/statutory";
import { sweepOrganisation } from "@/services/sweep";
import {
  InventoryRefused,
  createProperty,
  decideProposal,
  ingestAnalyserReport,
  loadProperty,
  propertyRegister,
  updateProperty,
} from "@/services/storage-inventory";

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

const ingest = (w: Awaited<ReturnType<typeof world>>, report: unknown = sample()) =>
  ingestAnalyserReport({ propertyId: w.property.id, organisationId: w.org.id, report, source: "upload", actor: SYSTEM });

const tasksOf = (w: Awaited<ReturnType<typeof world>>, type: "pecr_rescan" | "pecr_scan_changes") =>
  db.select().from(tasks).where(and(eq(tasks.organisationId, w.org.id), eq(tasks.type, type)));

const DAY = 24 * 3600 * 1000;

describe("when a website is next due a scan", () => {
  it("counts from the last scan, or from when it was added, and not at all without an interval", () => {
    const createdAt = new Date("2026-01-10T00:00:00Z");
    assert.equal(rescanDueAt({ rescanIntervalMonths: 3, lastScannedAt: null, createdAt })?.toISOString().slice(0, 10), "2026-04-10");
    assert.equal(
      rescanDueAt({ rescanIntervalMonths: 6, lastScannedAt: new Date("2026-05-31T00:00:00Z"), createdAt })?.toISOString().slice(0, 10),
      "2026-11-30",
    );
    assert.equal(rescanDueAt({ rescanIntervalMonths: null, lastScannedAt: null, createdAt }), null);
  });

  it("is due a fortnight ahead, and overdue once the day has passed", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    assert.equal(rescanState(new Date(now.getTime() + 20 * DAY), now), "not_due");
    assert.equal(rescanState(new Date(now.getTime() + 10 * DAY), now), "due_soon");
    assert.equal(rescanState(new Date(now.getTime() - DAY), now), "overdue");
    assert.equal(rescanState(null, now), "not_due");
  });
});

describe("gaps counted", () => {
  it("counts each item once per kind, most pressing first", () => {
    const g = (kind: Gap["kind"]): Gap => ({ kind, text: kind });
    const summary = summariseGaps([
      [g("no_basis")],
      [g("no_basis")],
      [g("condition_unconfirmed"), g("condition_unconfirmed"), g("no_objection_route")],
      [g("before_consent")],
      [],
    ]);
    assert.deepEqual(
      summary.map((s) => s.text),
      [
        "1 consent item seen before consent",
        "2 items with no basis",
        "1 statistics or appearance item with no objection route",
        "1 item with a condition not confirmed",
      ],
    );
    assert.deepEqual(
      mergeGapSummaries([summary, summariseGaps([[g("no_basis")]])]).find((s) => s.kind === "no_basis")?.text,
      "3 items with no basis",
    );
  });

  it("are shown for each website on the register", async () => {
    const w = await world("summary");
    await ingest(w);
    for (const p of (await loadProperty(w.property.id, w.org.id))!.proposals) {
      await decideProposal({ proposalId: p.id, organisationId: w.org.id, accept: true, actor: SYSTEM });
    }
    const [row] = await propertyRegister(w.org.id, null);
    assert.deepEqual(row.gapSummary, [{ kind: "no_basis", items: 5, text: "5 items with no basis" }]);
    assert.deepEqual((await loadProperty(w.property.id, w.org.id))!.gapSummary, row.gapSummary);
  });
});

describe("what a scan leaves to do", () => {
  it("raises one task for what it found, and none for taking in a scan that found nothing new", async () => {
    const w = await world("changes");
    await ingest(w);
    let raised = await tasksOf(w, "pecr_scan_changes");
    assert.equal(raised.length, 1);
    assert.match(raised[0].title, /^WEB-\d{4}-0001: cookie scan found changes \(5 new\)$/);
    assert.equal(raised[0].assigneeRole, "privacy_admin", "nobody owns the site, so it goes to privacy admins");

    for (const p of (await loadProperty(w.property.id, w.org.id))!.proposals) {
      await decideProposal({ proposalId: p.id, organisationId: w.org.id, accept: true, actor: SYSTEM });
    }
    const same = sample();
    same.run_id = "same0001";
    await ingest(w, same);
    raised = await tasksOf(w, "pecr_scan_changes");
    assert.equal(raised.length, 1, "nothing changed, so no second task");
  });

  it("calls out an item on the inventory that is newly set before consent", async () => {
    const w = await world("before");
    // First seen only after consent…
    const clean = sample();
    clean.checklist = clean.checklist.map((c: { item_id: string }) => (c.item_id === "B.2" ? { ...c, evidence: [] } : c));
    await ingest(w, clean);
    for (const p of (await loadProperty(w.property.id, w.org.id))!.proposals) {
      await decideProposal({ proposalId: p.id, organisationId: w.org.id, accept: true, actor: SYSTEM });
    }
    // …then before it.
    const later = sample();
    later.run_id = "before01";
    const result = await ingest(w, later);
    assert.ok(result.newlyBeforeConsent >= 1);
    const raised = (await tasksOf(w, "pecr_scan_changes")).find((t) => t.title.includes("before consent"));
    assert.ok(raised, "the second scan's task names what is now set before consent");
    assert.match(raised.description ?? "", /wait for consent/);
  });
});

describe("rescan reminders", () => {
  it("are raised once per due date by the sweep, and closed by the next scan", async () => {
    const w = await world("rescan");
    assert.equal((await sweepOrganisation(w.org.id)).rescansRaised, 0, "added today, so not due for three months");

    await db
      .update(digitalProperties)
      .set({ createdAt: new Date(Date.now() - 100 * DAY) })
      .where(eq(digitalProperties.id, w.property.id));
    assert.equal((await sweepOrganisation(w.org.id)).rescansRaised, 1);
    assert.equal((await sweepOrganisation(w.org.id)).rescansRaised, 0, "idempotent");
    const [reminder] = await tasksOf(w, "pecr_rescan");
    assert.match(reminder.title, /overdue a cookie scan/);
    assert.equal(reminder.status, "open");

    await ingest(w);
    const [closed] = await tasksOf(w, "pecr_rescan");
    assert.equal(closed.status, "done");
    assert.equal(closed.completedByLabel, "pecr test");
    const due = (await loadProperty(w.property.id, w.org.id))!.rescanDueAt!;
    assert.ok(due.getTime() > Date.now() + 60 * DAY, "the next one is counted from the scan");
    assert.equal((await sweepOrganisation(w.org.id)).rescansRaised, 0);
  });

  it("can be switched off, and only to an interval offered", async () => {
    const w = await world("interval");
    await db
      .update(digitalProperties)
      .set({ createdAt: new Date(Date.now() - 400 * DAY) })
      .where(eq(digitalProperties.id, w.property.id));
    await assert.rejects(
      updateProperty({ propertyId: w.property.id, organisationId: w.org.id, changes: { rescanIntervalMonths: 5 }, actor: SYSTEM }),
      InventoryRefused,
    );
    await updateProperty({ propertyId: w.property.id, organisationId: w.org.id, changes: { rescanIntervalMonths: null }, actor: SYSTEM });
    assert.equal((await sweepOrganisation(w.org.id)).rescansRaised, 0);
    assert.equal((await loadProperty(w.property.id, w.org.id))!.rescanDueAt, null);
  });
});
