import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  dpas,
  entities,
  evidence,
  organisations,
  processingActivities,
  recordLinks,
  scanFindings,
  suppliers,
} from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import type { AuthedConnection } from "@/lib/integration/auth";
import { createConnection } from "@/services/connections";
import {
  canonicalise,
  ingestDpas,
  ingestEvidence,
  ingestProcessingActivities,
  ingestScan,
  ingestVendors,
} from "@/services/ingest";

const SYSTEM = { actorKind: "system" as const, actorUserId: null, actorLabel: "test" };

async function world(label: string) {
  const [org] = await db
    .insert(organisations)
    .values({ name: `I ${label}`, slug: `ingest-${label}-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [main] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Public Service", isDefault: true })
    .returning();
  const [other] = await db
    .insert(entities)
    .values({ organisationId: org.id, name: "Studios", legalEntityRef: "STU" })
    .returning();

  const portal = await createConnection({
    organisationId: org.id,
    kind: "waivern_portal",
    name: "Portal",
    defaultEntityId: main.id,
    actor: SYSTEM,
  });
  const scanner = await createConnection({
    organisationId: org.id,
    kind: "har_analyser",
    name: "Scanner",
    defaultEntityId: main.id,
    actor: SYSTEM,
  });

  const conn = (id: string, kind: AuthedConnection["kind"], name: string): AuthedConnection => ({
    id,
    organisationId: org.id,
    kind,
    name,
    defaultEntityId: main.id,
  });

  return {
    org,
    main,
    other,
    portal: conn(portal.id, "waivern_portal", "Portal"),
    scanner: conn(scanner.id, "har_analyser", "Scanner"),
  };
}

after(async () => {
  await pg.end();
});

describe("processing activities from the portal", () => {
  it("creates a record with a reference", async () => {
    const w = await world("ropa");
    const out = await ingestProcessingActivities(w.portal, [
      {
        externalRef: "portal-activity-1",
        name: "Newsletter subscriptions",
        purposes: ["Send the weekly newsletter"],
        dataCategories: ["contact_details"],
        subjectCategories: ["Audience members"],
        recipients: [],
        systems: ["Mailing platform"],
        transfers: [],
      },
    ]);
    assert.equal(out.created, 1);

    const [row] = await db
      .select()
      .from(processingActivities)
      .where(eq(processingActivities.organisationId, w.org.id));
    assert.match(row.reference, /^ROPA-\d{4}-0001$/);
    assert.equal(row.entityId, w.main.id);
  });

  it("updates rather than duplicating when the same record is pushed again", async () => {
    const w = await world("reropa");
    const record = {
      externalRef: "portal-activity-1",
      name: "Newsletter subscriptions",
      purposes: [],
      dataCategories: [],
      subjectCategories: [],
      recipients: [],
      systems: [],
      transfers: [],
    };
    await ingestProcessingActivities(w.portal, [record]);
    const second = await ingestProcessingActivities(w.portal, [
      { ...record, name: "Newsletter subscriptions (renamed)" },
    ]);

    assert.equal(second.created, 0);
    assert.equal(second.updated, 1);
    const rows = await db
      .select()
      .from(processingActivities)
      .where(eq(processingActivities.organisationId, w.org.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Newsletter subscriptions (renamed)");
  });

  it("files a record against a named entity", async () => {
    const w = await world("entity");
    await ingestProcessingActivities(w.portal, [
      {
        externalRef: "a", name: "Casting", entity: "Studios",
        purposes: [], dataCategories: [], subjectCategories: [], recipients: [], systems: [], transfers: [],
      },
    ]);
    const [row] = await db
      .select()
      .from(processingActivities)
      .where(eq(processingActivities.organisationId, w.org.id));
    assert.equal(row.entityId, w.other.id);
  });

  it("refuses an unknown entity rather than filing it under the default", async () => {
    // Quietly filing one legal entity's records under another is worse than
    // rejecting the batch — it is wrong in a way nobody will notice.
    const w = await world("badentity");
    const out = await ingestProcessingActivities(w.portal, [
      {
        externalRef: "a", name: "Something", entity: "BBC Nonexistent",
        purposes: [], dataCategories: [], subjectCategories: [], recipients: [], systems: [], transfers: [],
      },
    ]);
    assert.equal(out.created, 0);
    assert.equal(out.skipped.length, 1);
    assert.match(out.skipped[0].reason, /Unknown entity/);
  });
});

describe("vendors", () => {
  it("treats two spellings of one supplier as one supplier", () => {
    assert.equal(canonicalise("Acme Analytics Ltd"), canonicalise("acme analytics limited"));
    assert.equal(canonicalise("Foo, Inc."), canonicalise("Foo Inc"));
  });

  it("merges categories instead of overwriting them", async () => {
    const w = await world("vendors");
    await ingestVendors(w.portal, [{ name: "Acme Analytics Ltd", categories: ["analytics"] }]);
    await ingestVendors(w.scanner, [{ name: "Acme Analytics", categories: ["tracking"] }]);

    const rows = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.organisationId, w.org.id));
    assert.equal(rows.length, 1, "one supplier, not two spellings");
    // Two systems each know a different half; the later push must not erase
    // what the earlier one knew.
    assert.deepEqual([...rows[0].categories].sort(), ["analytics", "tracking"]);
  });
});

describe("DPAs", () => {
  it("links to a supplier, creating it if unknown", async () => {
    const w = await world("dpa");
    await ingestDpas(w.portal, [
      {
        vendorName: "Cloud Hosting GmbH",
        title: "DPA 2026",
        transferMechanism: "SCCs",
        subProcessors: ["Sub A"],
        terms: { article28: true },
      },
    ]);
    const [supplier] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.organisationId, w.org.id));
    const [dpa] = await db.select().from(dpas).where(eq(dpas.organisationId, w.org.id));
    assert.equal(dpa.supplierId, supplier.id);
    assert.equal(dpa.transferMechanism, "SCCs");
  });
});

describe("scans from the HAR Analyser", () => {
  const batch = (over: Record<string, unknown> = {}) => ({
    scanRef: "scan-2026-08-28",
    scannedUrl: "https://example.bbc.co.uk/",
    summary: { cmp: "OneTrust" },
    findings: [
      {
        externalRef: "f1", category: "cookie", severity: "high" as const,
        title: "Analytics cookie set before consent",
        cookieName: "_ga", vendor: "Google Analytics",
        setBeforeConsent: true, advisory: { suggestion: "Block until consent" },
      },
      {
        externalRef: "f2", category: "tracker", severity: "medium" as const,
        title: "Third-party pixel loaded on the landing page",
        vendor: "Meta", setBeforeConsent: false, advisory: {},
      },
      {
        externalRef: "f3", category: "transfer", severity: "info" as const,
        title: "Request to a US endpoint", thirdCountry: "US", advisory: {},
      },
      {
        // Low severity but set before consent. Under ePrivacy that is the
        // finding that matters regardless of how the scanner rated it, so it
        // must be flagged for review on the pre-consent condition alone.
        externalRef: "f4", category: "cookie", severity: "low" as const,
        title: "Preference cookie set before consent",
        cookieName: "lang", setBeforeConsent: true, advisory: {},
      },
    ],
    ...over,
  });

  it("lands the run as one piece of evidence with its findings attached", async () => {
    const w = await world("scan");
    const out = await ingestScan(w.scanner, batch());

    assert.equal(out.created, 4);
    assert.notEqual(out.evidenceId, null);

    const [ev] = await db.select().from(evidence).where(eq(evidence.id, out.evidenceId!));
    assert.equal(ev.kind, "scan");
    // An assessment cites the scan, not four hundred loose observations.
    assert.match(ev.title, /scan-2026-08-28/);

    const findings = await db
      .select()
      .from(scanFindings)
      .where(eq(scanFindings.evidenceId, out.evidenceId!));
    assert.equal(findings.length, 4);
  });

  it("never converts a finding into a risk on its own", async () => {
    const w = await world("advisory");
    const out = await ingestScan(w.scanner, batch());

    // Two findings are worth a look: one rated high, and one rated low that is
    // set before consent — the pre-consent condition has to stand on its own,
    // because under ePrivacy it matters whatever severity the scanner gave it.
    assert.equal(out.proposed, 2);
    const findings = await db
      .select()
      .from(scanFindings)
      .where(eq(scanFindings.organisationId, w.org.id));
    assert.equal(findings.length, 4);
    // The scanner flags; it never decides. Every finding arrives unconverted.
    assert.equal(findings.every((f) => f.convertedRiskId === null), true);
  });

  it("is safe to re-run: a nightly scan updates rather than piling up", async () => {
    const w = await world("rescan");
    await ingestScan(w.scanner, batch());
    await ingestScan(w.scanner, {
      ...batch(),
      findings: [
        { ...batch().findings[0], severity: "medium" as const, title: "Analytics cookie set before consent" },
        batch().findings[1],
        batch().findings[2],
        batch().findings[3],
      ],
    });

    const findings = await db
      .select()
      .from(scanFindings)
      .where(eq(scanFindings.organisationId, w.org.id));
    assert.equal(findings.length, 4, "a re-scan updates the same findings");
    assert.equal(findings.find((f) => f.externalRef === "f1")!.severity, "medium");

    const evidenceRows = await db
      .select()
      .from(evidence)
      .where(eq(evidence.organisationId, w.org.id));
    assert.equal(evidenceRows.length, 1, "one run, one piece of evidence");
  });

  it("attaches the run to an existing record when asked", async () => {
    const w = await world("attach");
    await ingestProcessingActivities(w.portal, [
      {
        externalRef: "pa1", name: "Homepage",
        purposes: [], dataCategories: [], subjectCategories: [], recipients: [], systems: [], transfers: [],
      },
    ]);
    const [activity] = await db
      .select()
      .from(processingActivities)
      .where(eq(processingActivities.organisationId, w.org.id));

    const out = await ingestScan(w.scanner, batch({ attachTo: activity.reference }));

    const [edge] = await db
      .select()
      .from(recordLinks)
      .where(
        and(
          eq(recordLinks.organisationId, w.org.id),
          eq(recordLinks.fromId, out.evidenceId!),
        ),
      );
    assert.equal(edge.toType, "processing_activity");
    assert.equal(edge.toId, activity.id);
    assert.equal(edge.relation, "supports");
  });

  it("refuses to attach to a reference that does not exist", async () => {
    const w = await world("badattach");
    const out = await ingestScan(w.scanner, batch({ attachTo: "DPIA-1999-9999" }));
    assert.equal(out.created, 0);
    assert.equal(out.evidenceId, null);
    assert.match(out.skipped[0].reason, /DPIA-1999-9999/);
  });

  it("leaves an intact audit chain, attributed to the integration", async () => {
    const w = await world("scanaudit");
    await ingestScan(w.scanner, batch());
    const result = await verifyAuditChain(w.org.id);
    assert.equal(result.ok, true);
  });
});
