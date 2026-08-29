import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { dpas, suppliers, users } from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import type { Actor } from "./templates";

/**
 * Third parties, and whether Article 28 is actually satisfied for each.
 *
 * Suppliers arrive two ways: a person records one, or a scanner reports a
 * third party it saw on a page. The second kind is the reason this register
 * exists — a tracker nobody procured is still a processor, and the register
 * has to be able to say which names have been looked at and which have not.
 */

export type Supplier = typeof suppliers.$inferSelect;
export type Dpa = typeof dpas.$inferSelect;

export type Article28Gap =
  | "no_dpa"
  | "dpa_unsigned"
  | "dpa_expired"
  | "dpa_expiring"
  | "no_transfer_mechanism"
  | "subprocessors_undisclosed"
  | "never_reviewed"
  | "no_owner";

export const GAP_WORDS: Record<Article28Gap, string> = {
  no_dpa: "No data processing agreement",
  dpa_unsigned: "Agreement never signed",
  dpa_expired: "Agreement expired",
  dpa_expiring: "Agreement expiring soon",
  no_transfer_mechanism: "No transfer mechanism recorded",
  subprocessors_undisclosed: "Sub-processors not recorded",
  never_reviewed: "Nobody has confirmed this is a processor",
  no_owner: "No named owner",
};

/**
 * Gaps that mean Article 28 is not satisfied, as against a thin record.
 *
 * Article 28(3) requires processing to be governed by a contract. No contract,
 * an unsigned one, or an expired one are all the same failure in substance.
 * The rest are things worth knowing that a regulator would not call a breach
 * on their own.
 */
export const HARD_GAPS: Article28Gap[] = ["no_dpa", "dpa_unsigned", "dpa_expired"];

/**
 * How much notice is worth having before a contract lapses.
 *
 * Six months, because this is renewal lead time rather than a reminder. In an
 * organisation where a processor contract takes months to renegotiate, a
 * warning at ninety days arrives after the window to act has closed — it
 * reports the problem instead of preventing it.
 */
export const EXPIRING_WITHIN_DAYS: number = 180;

/**
 * The same horizon in prose, derived so the wording cannot drift from the
 * number when somebody changes one and forgets the other.
 */
export const EXPIRING_WITHIN_LABEL =
  EXPIRING_WITHIN_DAYS % 30 === 0
    ? `${EXPIRING_WITHIN_DAYS / 30} month${EXPIRING_WITHIN_DAYS === 30 ? "" : "s"}`
    : `${EXPIRING_WITHIN_DAYS} days`;

/**
 * The agreement in force, or null.
 *
 * A supplier accumulates agreements over time. The one that matters is the
 * one still running: unexpired, and among those the most recently signed. An
 * agreement with no end date is perpetual, which is a real arrangement rather
 * than missing data.
 */
export function currentDpa(supplierDpas: readonly Dpa[], now = new Date()): Dpa | null {
  const live = supplierDpas.filter((d) => !d.expiresAt || d.expiresAt > now);
  const pool = live.length > 0 ? live : supplierDpas;
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => {
    const at = a.signedAt?.getTime() ?? 0;
    const bt = b.signedAt?.getTime() ?? 0;
    return bt - at;
  })[0];
}

export function article28Gaps(
  supplier: Supplier,
  supplierDpas: readonly Dpa[],
  now = new Date(),
): Article28Gap[] {
  const gaps: Article28Gap[] = [];
  const dpa = currentDpa(supplierDpas, now);

  if (!dpa) {
    gaps.push("no_dpa");
  } else {
    if (!dpa.signedAt) gaps.push("dpa_unsigned");
    if (dpa.expiresAt && dpa.expiresAt <= now) {
      gaps.push("dpa_expired");
    } else if (dpa.expiresAt) {
      const days = (dpa.expiresAt.getTime() - now.getTime()) / 86_400_000;
      if (days <= EXPIRING_WITHIN_DAYS) gaps.push("dpa_expiring");
    }
    if (!dpa.transferMechanism?.trim()) gaps.push("no_transfer_mechanism");
    // Article 28(2): a processor engages no sub-processor without
    // authorisation. An empty list is genuinely ambiguous — it may mean none —
    // so this is reported as unrecorded rather than as a breach.
    if ((dpa.subProcessors ?? []).length === 0) gaps.push("subprocessors_undisclosed");
  }

  // Only meaningful for a supplier a tool invented. One a person typed in is
  // reviewed by the act of typing it.
  if (supplier.sourceConnectionId && !supplier.reviewedAt) gaps.push("never_reviewed");
  if (!supplier.ownerId) gaps.push("no_owner");

  return gaps;
}

export type SupplierRow = {
  supplier: Supplier;
  dpas: Dpa[];
  current: Dpa | null;
  ownerEmail: string | null;
  gaps: Article28Gap[];
  hardGaps: Article28Gap[];
};

async function rowsFor(organisationId: string): Promise<SupplierRow[]> {
  const supplierRows = await db
    .select({ supplier: suppliers, ownerEmail: users.email })
    .from(suppliers)
    .leftJoin(users, eq(users.id, suppliers.ownerId))
    .where(eq(suppliers.organisationId, organisationId))
    .orderBy(asc(suppliers.name));

  const agreements = supplierRows.length
    ? await db
        .select()
        .from(dpas)
        .where(inArray(dpas.supplierId, supplierRows.map((r) => r.supplier.id)))
        .orderBy(desc(dpas.signedAt))
    : [];

  const bySupplier = new Map<string, Dpa[]>();
  for (const d of agreements) {
    const list = bySupplier.get(d.supplierId) ?? [];
    list.push(d);
    bySupplier.set(d.supplierId, list);
  }

  const now = new Date();
  return supplierRows.map(({ supplier, ownerEmail }) => {
    const own = bySupplier.get(supplier.id) ?? [];
    const gaps = article28Gaps(supplier, own, now);
    return {
      supplier,
      dpas: own,
      current: currentDpa(own, now),
      ownerEmail,
      gaps,
      hardGaps: gaps.filter((g) => HARD_GAPS.includes(g)),
    };
  });
}

export async function listSuppliers(organisationId: string) {
  return rowsFor(organisationId);
}

export async function loadSupplier(supplierId: string, organisationId: string) {
  const rows = await rowsFor(organisationId);
  return rows.find((r) => r.supplier.id === supplierId) ?? null;
}

export async function registerHealth(organisationId: string) {
  const rows = await rowsFor(organisationId);
  return {
    total: rows.length,
    covered: rows.filter((r) => r.hardGaps.length === 0).length,
    uncovered: rows.filter((r) => r.hardGaps.length > 0).length,
    expiring: rows.filter((r) => r.gaps.includes("dpa_expiring")).length,
    untriaged: rows.filter((r) => r.gaps.includes("never_reviewed")).length,
    fromScan: rows.filter((r) => r.supplier.sourceConnectionId !== null).length,
    rows,
  };
}

/** Slug used to keep a supplier unique per organisation. */
export function canonicalise(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function createSupplier(input: {
  organisationId: string;
  name: string;
  description?: string;
  categories?: string[];
  ownerId?: string | null;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(suppliers)
      .values({
        organisationId: input.organisationId,
        name: input.name,
        canonicalKey: canonicalise(input.name),
        description: input.description,
        categories: input.categories ?? [],
        ownerId: input.ownerId ?? null,
        // Typed in by a person, so it needs no separate confirmation.
        reviewedAt: new Date(),
        reviewedBy: input.actor.actorUserId ?? null,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "supplier.created",
      subjectType: "supplier",
      subjectId: row.id,
      after: { name: row.name },
    });
    return row;
  });
}

export async function updateSupplier(input: {
  supplierId: string;
  organisationId: string;
  changes: Partial<{
    name: string;
    description: string;
    categories: string[];
    ownerId: string | null;
  }>;
  /** Record that a person has confirmed this is a real processor. */
  confirmBy?: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(suppliers)
      .where(
        and(eq(suppliers.id, input.supplierId), eq(suppliers.organisationId, input.organisationId)),
      );
    if (!before) throw new Error("No such supplier");

    const [after] = await tx
      .update(suppliers)
      .set({
        ...input.changes,
        ...(input.changes.name ? { canonicalKey: canonicalise(input.changes.name) } : {}),
        ...(input.confirmBy ? { reviewedAt: new Date(), reviewedBy: input.confirmBy } : {}),
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, input.supplierId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: input.confirmBy ? "supplier.confirmed" : "supplier.updated",
      subjectType: "supplier",
      subjectId: input.supplierId,
      before: { name: before.name, reviewedAt: before.reviewedAt },
      after: { name: after.name, reviewedAt: after.reviewedAt },
    });
    return after;
  });
}

export async function recordDpa(input: {
  organisationId: string;
  supplierId: string;
  title: string;
  documentRef?: string;
  signedAt?: Date | null;
  expiresAt?: Date | null;
  transferMechanism?: string;
  subProcessors?: string[];
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(
        and(eq(suppliers.id, input.supplierId), eq(suppliers.organisationId, input.organisationId)),
      );
    if (!supplier) throw new Error("No such supplier");

    const [row] = await tx
      .insert(dpas)
      .values({
        organisationId: input.organisationId,
        supplierId: input.supplierId,
        title: input.title,
        documentRef: input.documentRef,
        signedAt: input.signedAt ?? null,
        expiresAt: input.expiresAt ?? null,
        transferMechanism: input.transferMechanism,
        subProcessors: input.subProcessors ?? [],
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "dpa.recorded",
      subjectType: "dpa",
      subjectId: row.id,
      after: { supplier: supplier.name, title: row.title, expiresAt: row.expiresAt },
    });
    return row;
  });
}

/** Agreements past their end date, or close to it. Used by the sweep. */
export async function dpasNeedingAttention(organisationId: string, within = EXPIRING_WITHIN_DAYS) {
  const horizon = new Date(Date.now() + within * 86_400_000);
  return db
    .select({ dpa: dpas, supplier: suppliers.name })
    .from(dpas)
    .innerJoin(suppliers, eq(suppliers.id, dpas.supplierId))
    .where(
      and(
        eq(dpas.organisationId, organisationId),
        or(lte(dpas.expiresAt, horizon), isNull(dpas.signedAt)),
      ),
    )
    .orderBy(asc(dpas.expiresAt));
}
