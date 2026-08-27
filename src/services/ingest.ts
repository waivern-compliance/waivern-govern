import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import {
  assessments,
  dpas,
  entities,
  evidence,
  integrationConnections,
  processingActivities,
  recordLinks,
  referenceCounters,
  risks,
  scanFindings,
  suppliers,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import type { AuthedConnection } from "@/lib/integration/auth";
import type {
  DpaIn,
  EvidenceIn,
  IngestOutcome,
  ProcessingActivityIn,
  ScanBatchIn,
  VendorIn,
} from "@/lib/integration/contracts";
import { sql } from "drizzle-orm";
import type { Actor } from "./templates";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Integrations act as themselves in the audit trail, never as a person. */
function actorFor(connection: AuthedConnection) {
  return {
    actorKind: "integration" as const,
    actorUserId: null,
    actorLabel: `${connection.kind}:${connection.name}`,
  };
}

/**
 * Resolve the entity a record belongs to.
 *
 * A named entity that does not exist is refused rather than quietly redirected
 * to the default: silently filing another legal entity's records under the
 * wrong one is worse than rejecting the batch.
 */
async function resolveEntity(
  organisationId: string,
  connection: AuthedConnection,
  named: string | undefined,
): Promise<{ ok: true; entityId: string } | { ok: false; reason: string }> {
  if (!named) {
    if (connection.defaultEntityId) return { ok: true, entityId: connection.defaultEntityId };
    const [fallback] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.organisationId, organisationId), eq(entities.isDefault, true)));
    return fallback
      ? { ok: true, entityId: fallback.id }
      : { ok: false, reason: "No entity named and no default configured" };
  }

  const [match] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.organisationId, organisationId),
        or(eq(entities.name, named), eq(entities.legalEntityRef, named)),
      ),
    );
  return match
    ? { ok: true, entityId: match.id }
    : { ok: false, reason: `Unknown entity "${named}"` };
}

async function nextReference(tx: Tx, organisationId: string, prefix: string, year: number) {
  const rows = await tx.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, ${prefix}, ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `${prefix}-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

/** Two spellings of one vendor should not become two suppliers. */
export function canonicalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|llc|plc|gmbh|sa|bv|corp|corporation|co)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function ingestProcessingActivities(
  connection: AuthedConnection,
  records: ProcessingActivityIn[],
): Promise<IngestOutcome> {
  const outcome: IngestOutcome = { received: records.length, created: 0, updated: 0, skipped: [] };
  const actor = actorFor(connection);
  const year = new Date().getUTCFullYear();

  for (const r of records) {
    const entity = await resolveEntity(connection.organisationId, connection, r.entity);
    if (!entity.ok) {
      outcome.skipped.push({ externalRef: r.externalRef, reason: entity.reason });
      continue;
    }

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(processingActivities)
        .where(
          and(
            eq(processingActivities.organisationId, connection.organisationId),
            eq(processingActivities.sourceConnectionId, connection.id),
            eq(processingActivities.externalRef, r.externalRef),
          ),
        );

      const values = {
        name: r.name,
        description: r.description,
        purposes: r.purposes,
        lawfulBasis: r.lawfulBasis,
        dataCategories: r.dataCategories,
        subjectCategories: r.subjectCategories,
        recipients: r.recipients,
        systems: r.systems,
        transfers: r.transfers,
        retention: r.retention,
        controllerRole: r.controllerRole,
        reviewDueAt: r.reviewDueAt ? new Date(r.reviewDueAt) : undefined,
        updatedAt: new Date(),
      };

      if (existing) {
        await tx
          .update(processingActivities)
          .set(values)
          .where(eq(processingActivities.id, existing.id));
        outcome.updated += 1;
        await appendAuditEvent(tx, {
          ...actor,
          organisationId: connection.organisationId,
          action: "processing_activity.updated",
          subjectType: "processing_activity",
          subjectId: existing.id,
          entityId: existing.entityId,
          before: { name: existing.name },
          after: { name: r.name, externalRef: r.externalRef },
        });
        return;
      }

      const reference = await nextReference(tx, connection.organisationId, "ROPA", year);
      const [row] = await tx
        .insert(processingActivities)
        .values({
          organisationId: connection.organisationId,
          entityId: entity.entityId,
          reference,
          sourceConnectionId: connection.id,
          externalRef: r.externalRef,
          ...values,
        })
        .returning();
      outcome.created += 1;
      await appendAuditEvent(tx, {
        ...actor,
        organisationId: connection.organisationId,
        action: "processing_activity.created",
        subjectType: "processing_activity",
        subjectId: row.id,
        entityId: entity.entityId,
        after: { reference, name: r.name, externalRef: r.externalRef },
      });
    });
  }
  return outcome;
}

export async function ingestVendors(
  connection: AuthedConnection,
  records: VendorIn[],
): Promise<IngestOutcome> {
  const outcome: IngestOutcome = { received: records.length, created: 0, updated: 0, skipped: [] };
  const actor = actorFor(connection);

  for (const r of records) {
    const key = canonicalise(r.name);
    if (!key) {
      outcome.skipped.push({ externalRef: r.externalRef ?? r.name, reason: "Name is not usable" });
      continue;
    }

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(suppliers)
        .values({
          organisationId: connection.organisationId,
          name: r.name,
          canonicalKey: key,
          description: r.description,
          categories: r.categories,
          sourceConnectionId: connection.id,
          externalRef: r.externalRef,
        })
        .onConflictDoUpdate({
          target: [suppliers.organisationId, suppliers.canonicalKey],
          set: {
            // Set-union rather than overwrite: two systems may each know a
            // different half of what a supplier does, and the later push should
            // not erase what the earlier one knew.
            categories: sql`(
              select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
              from jsonb_array_elements(${suppliers.categories} || ${JSON.stringify(r.categories)}::jsonb)
            )`,
            description: sql`coalesce(${suppliers.description}, ${r.description ?? null})`,
            updatedAt: new Date(),
          },
        })
        .returning();

      outcome.created += 1;
      await appendAuditEvent(tx, {
        ...actor,
        organisationId: connection.organisationId,
        action: "supplier.upserted",
        subjectType: "supplier",
        subjectId: row.id,
        after: { name: r.name, canonicalKey: key },
      });
    });
  }
  return outcome;
}

export async function ingestDpas(
  connection: AuthedConnection,
  records: DpaIn[],
): Promise<IngestOutcome> {
  const outcome: IngestOutcome = { received: records.length, created: 0, updated: 0, skipped: [] };
  const actor = actorFor(connection);

  for (const r of records) {
    const key = canonicalise(r.vendorName);
    await db.transaction(async (tx) => {
      const [supplier] = await tx
        .insert(suppliers)
        .values({
          organisationId: connection.organisationId,
          name: r.vendorName,
          canonicalKey: key,
          sourceConnectionId: connection.id,
        })
        .onConflictDoUpdate({
          target: [suppliers.organisationId, suppliers.canonicalKey],
          set: { updatedAt: new Date() },
        })
        .returning();

      const [row] = await tx
        .insert(dpas)
        .values({
          organisationId: connection.organisationId,
          supplierId: supplier.id,
          title: r.title,
          documentRef: r.documentRef,
          signedAt: r.signedAt ? new Date(r.signedAt) : undefined,
          expiresAt: r.expiresAt ? new Date(r.expiresAt) : undefined,
          transferMechanism: r.transferMechanism,
          subProcessors: r.subProcessors,
          terms: r.terms,
          sourceConnectionId: connection.id,
          externalRef: r.externalRef,
        })
        .returning();

      outcome.created += 1;
      await appendAuditEvent(tx, {
        ...actor,
        organisationId: connection.organisationId,
        action: "dpa.recorded",
        subjectType: "dpa",
        subjectId: row.id,
        after: { supplier: r.vendorName, title: r.title, expiresAt: r.expiresAt ?? null },
      });
    });
  }
  return outcome;
}

/** Resolve "DPIA-2026-0001" or "ROPA-2026-0004" to a record to link against. */
async function resolveAttachment(organisationId: string, reference: string) {
  const [assessment] = await db
    .select({ id: assessments.id })
    .from(assessments)
    .where(
      and(eq(assessments.organisationId, organisationId), eq(assessments.reference, reference)),
    );
  if (assessment) return { type: "assessment" as const, id: assessment.id };

  const [activity] = await db
    .select({ id: processingActivities.id })
    .from(processingActivities)
    .where(
      and(
        eq(processingActivities.organisationId, organisationId),
        eq(processingActivities.reference, reference),
      ),
    );
  if (activity) return { type: "processing_activity" as const, id: activity.id };

  const [risk] = await db
    .select({ id: risks.id })
    .from(risks)
    .where(and(eq(risks.organisationId, organisationId), eq(risks.reference, reference)));
  if (risk) return { type: "risk" as const, id: risk.id };

  return null;
}

async function link(
  tx: Tx,
  organisationId: string,
  from: { type: "evidence" | "processing_activity" | "assessment" | "risk"; id: string },
  to: { type: "evidence" | "processing_activity" | "assessment" | "risk"; id: string },
  relation: string,
) {
  await tx
    .insert(recordLinks)
    .values({
      organisationId,
      fromType: from.type,
      fromId: from.id,
      toType: to.type,
      toId: to.id,
      relation,
    })
    .onConflictDoNothing();
}

export async function ingestEvidence(
  connection: AuthedConnection,
  records: EvidenceIn[],
): Promise<IngestOutcome> {
  const outcome: IngestOutcome = { received: records.length, created: 0, updated: 0, skipped: [] };
  const actor = actorFor(connection);

  for (const r of records) {
    const entity = await resolveEntity(connection.organisationId, connection, r.entity);
    if (!entity.ok) {
      outcome.skipped.push({ externalRef: r.externalRef, reason: entity.reason });
      continue;
    }

    const attachment = r.attachTo
      ? await resolveAttachment(connection.organisationId, r.attachTo)
      : null;
    if (r.attachTo && !attachment) {
      outcome.skipped.push({
        externalRef: r.externalRef,
        reason: `Nothing here is referenced "${r.attachTo}"`,
      });
      continue;
    }

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(evidence)
        .values({
          organisationId: connection.organisationId,
          entityId: entity.entityId,
          kind: r.kind,
          title: r.title,
          description: r.description,
          uri: r.uri,
          sha256: r.sha256,
          collectedAt: r.collectedAt ? new Date(r.collectedAt) : undefined,
          payload: r.payload,
          sourceConnectionId: connection.id,
          externalRef: r.externalRef,
        })
        .onConflictDoUpdate({
          target: [evidence.organisationId, evidence.sourceConnectionId, evidence.externalRef],
          // The unique index is partial, so the predicate has to be repeated
          // here or Postgres will not match it to a constraint.
          targetWhere: sql`${evidence.externalRef} is not null`,
          set: { title: r.title, description: r.description, payload: r.payload },
        })
        .returning();

      if (attachment) {
        await link(tx, connection.organisationId, { type: "evidence", id: row.id }, attachment, "supports");
      }

      outcome.created += 1;
      await appendAuditEvent(tx, {
        ...actor,
        organisationId: connection.organisationId,
        action: "evidence.received",
        subjectType: "evidence",
        subjectId: row.id,
        entityId: entity.entityId,
        after: { title: r.title, kind: r.kind, attachedTo: r.attachTo ?? null },
      });
    });
  }
  return outcome;
}

export type ScanIngestOutcome = IngestOutcome & {
  evidenceId: string | null;
  /** Findings the scanner flagged as worth a human look. Never auto-converted. */
  proposed: number;
};

/**
 * Take one scan run.
 *
 * The run becomes a single piece of evidence with the findings hanging off it,
 * so a DPIA can cite "the scan of 27 August" rather than four hundred loose
 * observations. Nothing becomes a risk here: the scanner's severity and its
 * advisory are inputs to a judgement, and a human converts a finding into a
 * risk explicitly. Automation must not make the classification.
 */
export async function ingestScan(
  connection: AuthedConnection,
  batch: ScanBatchIn,
): Promise<ScanIngestOutcome> {
  const entity = await resolveEntity(connection.organisationId, connection, batch.entity);
  if (!entity.ok) {
    return {
      received: batch.findings.length,
      created: 0,
      updated: 0,
      skipped: [{ externalRef: batch.scanRef, reason: entity.reason }],
      evidenceId: null,
      proposed: 0,
    };
  }

  const attachment = batch.attachTo
    ? await resolveAttachment(connection.organisationId, batch.attachTo)
    : null;
  if (batch.attachTo && !attachment) {
    return {
      received: batch.findings.length,
      created: 0,
      updated: 0,
      skipped: [{ externalRef: batch.scanRef, reason: `Nothing here is referenced "${batch.attachTo}"` }],
      evidenceId: null,
      proposed: 0,
    };
  }

  const actor = actorFor(connection);
  const outcome: ScanIngestOutcome = {
    received: batch.findings.length,
    created: 0,
    updated: 0,
    skipped: [],
    evidenceId: null,
    proposed: 0,
  };

  await db.transaction(async (tx) => {
    const [ev] = await tx
      .insert(evidence)
      .values({
        organisationId: connection.organisationId,
        entityId: entity.entityId,
        kind: "scan",
        title: `Scan ${batch.scanRef}${batch.scannedUrl ? ` — ${batch.scannedUrl}` : ""}`,
        description: `${batch.findings.length} findings from ${connection.name}.`,
        uri: batch.scannedUrl,
        collectedAt: batch.scannedAt ? new Date(batch.scannedAt) : new Date(),
        payload: batch.summary,
        sourceConnectionId: connection.id,
        externalRef: `scan:${batch.scanRef}`,
      })
      .onConflictDoUpdate({
        target: [evidence.organisationId, evidence.sourceConnectionId, evidence.externalRef],
        targetWhere: sql`${evidence.externalRef} is not null`,
        set: { payload: batch.summary, description: `${batch.findings.length} findings.` },
      })
      .returning();
    outcome.evidenceId = ev.id;

    if (attachment) {
      await link(tx, connection.organisationId, { type: "evidence", id: ev.id }, attachment, "supports");
    }

    for (const f of batch.findings) {
      const [row] = await tx
        .insert(scanFindings)
        .values({
          organisationId: connection.organisationId,
          entityId: entity.entityId,
          evidenceId: ev.id,
          scanRef: batch.scanRef,
          url: f.url ?? batch.scannedUrl,
          category: f.category,
          severity: f.severity,
          title: f.title,
          detail: f.detail,
          vendor: f.vendor,
          cookieName: f.cookieName,
          setBeforeConsent: f.setBeforeConsent,
          thirdCountry: f.thirdCountry,
          advisory: f.advisory,
          sourceConnectionId: connection.id,
          externalRef: f.externalRef,
        })
        .onConflictDoUpdate({
          target: [scanFindings.organisationId, scanFindings.externalRef],
          set: {
            severity: f.severity,
            title: f.title,
            detail: f.detail,
            advisory: f.advisory,
            setBeforeConsent: f.setBeforeConsent,
          },
        })
        .returning();
      if (row) outcome.created += 1;
      if (f.severity === "high" || f.setBeforeConsent) outcome.proposed += 1;
    }

    await appendAuditEvent(tx, {
      ...actor,
      organisationId: connection.organisationId,
      action: "scan.received",
      subjectType: "evidence",
      subjectId: ev.id,
      entityId: entity.entityId,
      after: {
        scanRef: batch.scanRef,
        url: batch.scannedUrl ?? null,
        findings: batch.findings.length,
        // Named as a suggestion in the record itself, so nobody reading the
        // audit trail later mistakes it for a decision the platform took.
        advisoryForReview: outcome.proposed,
        attachedTo: batch.attachTo ?? null,
      },
    });
  });

  return outcome;
}


/**
 * Turn a scan finding into a risk on the register.
 *
 * A person does this, and rates it themselves. The scanner's severity and its
 * advisory are shown while they decide and are recorded on the risk for
 * provenance, but neither sets the rating. A scanner deciding what constitutes
 * a governance risk would be automation making the classification — which is
 * the one thing this platform must never do.
 */
export async function convertFindingToRisk(input: {
  findingId: string;
  organisationId: string;
  title: string;
  description: string;
  likelihood: number;
  impact: number;
  ownerId?: string;
  actor: Actor;
}) {
  const [finding] = await db
    .select()
    .from(scanFindings)
    .where(
      and(
        eq(scanFindings.id, input.findingId),
        eq(scanFindings.organisationId, input.organisationId),
      ),
    );
  if (!finding) throw new Error("No such finding");
  if (finding.convertedRiskId) throw new Error("This finding is already on the register");

  const { createRisk } = await import("./risks");
  const risk = await createRisk({
    organisationId: input.organisationId,
    entityId: finding.entityId,
    title: input.title,
    description: input.description,
    category: finding.category,
    likelihood: input.likelihood,
    impact: input.impact,
    ownerId: input.ownerId,
    source: "integration",
    actor: input.actor,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(scanFindings)
      .set({ convertedRiskId: risk.id })
      .where(eq(scanFindings.id, finding.id));

    if (finding.evidenceId) {
      await link(
        tx,
        input.organisationId,
        { type: "evidence", id: finding.evidenceId },
        { type: "risk", id: risk.id },
        "supports",
      );
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "scan_finding.raised_as_risk",
      subjectType: "scan_finding",
      subjectId: finding.id,
      entityId: finding.entityId,
      after: {
        risk: risk.reference,
        // Kept side by side so a later reader can see what the scanner said and
        // what the person decided, and that they were not the same act.
        scannerSeverity: finding.severity,
        ratedBy: input.actor.actorLabel,
        rating: { likelihood: input.likelihood, impact: input.impact },
      },
    });
  });

  return risk;
}

export async function dismissFinding(input: {
  findingId: string;
  organisationId: string;
  reason: string;
  actor: Actor;
}) {
  if (!input.reason.trim()) throw new Error("A reason is required to dismiss a finding");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(scanFindings)
      .set({ dismissedAt: new Date(), dismissedReason: input.reason })
      .where(
        and(
          eq(scanFindings.id, input.findingId),
          eq(scanFindings.organisationId, input.organisationId),
        ),
      )
      .returning();
    if (!row) throw new Error("No such finding");

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "scan_finding.dismissed",
      subjectType: "scan_finding",
      subjectId: row.id,
      entityId: row.entityId,
      after: { title: row.title, reason: input.reason },
    });
    return row;
  });
}

export async function openFindings(organisationId: string, entityIds: string[] | null) {
  return db
    .select({ finding: scanFindings, evidence: evidence })
    .from(scanFindings)
    .leftJoin(evidence, eq(evidence.id, scanFindings.evidenceId))
    .where(
      and(
        eq(scanFindings.organisationId, organisationId),
        isNull(scanFindings.dismissedAt),
        isNull(scanFindings.convertedRiskId),
        entityIds === null
          ? undefined
          : inArray(scanFindings.entityId, entityIds.length ? entityIds : [""]),
      ),
    )
    .orderBy(scanFindings.createdAt);
}
