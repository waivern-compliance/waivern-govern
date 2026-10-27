import { and, asc, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  aiUseCases,
  assessmentRevisions,
  assessments,
  dpas,
  suppliers,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  aiStanding,
  aiSupplierGaps,
  isAiSupplierDefinition,
  type AiStanding,
  type AiContractTerm,
  type AiInvolvement,
  type AiSupplierAssessed,
  type AiSupplierGap,
} from "@/lib/thirdparty/ai-procurement";
import type { Actor } from "./templates";
import { assertMemberOf } from "./tenancy-guards";

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
  // Archived first, and here rather than at each call site, so that no caller
  // can forget it and report a retired contract as the one in force.
  const active = supplierDpas.filter((d) => !d.archivedAt);
  const live = active.filter((d) => !d.expiresAt || d.expiresAt > now);
  const pool = live.length > 0 ? live : active;
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

/**
 * Where a supplier stands on data protection, as one word.
 *
 * Read from the Article 28 facts rather than from an approval, because there
 * is no privacy sign-off of a supplier as such: the contract either governs the
 * processing or it does not. Kept apart from the AI standing because the two
 * are judged by different people against different rules, and a supplier can
 * pass one and fail the other.
 */
export type PrivacyStanding = "not_met" | "met_with_gaps" | "met";

export const PRIVACY_STANDING_LABEL: Record<PrivacyStanding, string> = {
  not_met: "Article 28 not met",
  met_with_gaps: "Article 28 met, with gaps",
  met: "Article 28 met",
};

export function privacyStanding(gaps: readonly Article28Gap[]): PrivacyStanding {
  if (gaps.some((g) => HARD_GAPS.includes(g))) return "not_met";
  return gaps.length > 0 ? "met_with_gaps" : "met";
}

export type SupplierRow = {
  supplier: Supplier;
  dpas: Dpa[];
  current: Dpa | null;
  ownerEmail: string | null;
  gaps: Article28Gap[];
  hardGaps: Article28Gap[];
  privacy: PrivacyStanding;
  /** Its AI supply, judged separately from Article 28. */
  ai: {
    standing: AiStanding;
    assessed: AiSupplierAssessed | null;
    systems: number;
    gaps: AiSupplierGap[];
    missingTerms: AiContractTerm[];
  };
};

/**
 * The AI supplier assessment that counts for each supplier.
 *
 * The latest approved one where there is one, so that starting a reassessment
 * does not make a supplier look unassessed while the new one is in draft.
 * Otherwise the latest of any status, reported as unfinished.
 *
 * Only AI supplier assessments are read — recognised by the questions only
 * they ask, so a client's own copy of our template counts and a privacy or
 * security assessment of the same supplier does not. See
 * `isAiSupplierDefinition`.
 */
export async function aiSupplierAssessments(
  organisationId: string,
): Promise<Map<string, AiSupplierAssessed>> {
  const rows = await db
    .select({ assessment: assessments, definition: templateVersions.definition })
    .from(assessments)
    .innerJoin(templateVersions, eq(templateVersions.id, assessments.templateVersionId))
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(assessments.organisationId, organisationId),
        eq(assessments.subjectType, "supplier"),
        eq(templates.kind, "supplier_record"),
        ne(assessments.status, "withdrawn"),
        ne(assessments.status, "superseded"),
      ),
    )
    .orderBy(desc(assessments.updatedAt));

  const chosen = new Map<string, typeof assessments.$inferSelect>();
  for (const { assessment, definition } of rows) {
    if (!isAiSupplierDefinition(definition)) continue;
    const id = assessment.subjectId!;
    const held = chosen.get(id);
    if (!held || (held.status !== "approved" && assessment.status === "approved")) {
      chosen.set(id, assessment);
    }
  }

  const approvedIds = [...chosen.values()].filter((a) => a.status === "approved").map((a) => a.id);
  const answersById = new Map<string, Record<string, unknown>>();
  if (approvedIds.length > 0) {
    const revisions = await db
      .selectDistinctOn([assessmentRevisions.assessmentId], {
        assessmentId: assessmentRevisions.assessmentId,
        answers: assessmentRevisions.answers,
      })
      .from(assessmentRevisions)
      .where(inArray(assessmentRevisions.assessmentId, approvedIds))
      .orderBy(assessmentRevisions.assessmentId, desc(assessmentRevisions.revision));
    for (const r of revisions) answersById.set(r.assessmentId, r.answers as Record<string, unknown>);
  }

  const result = new Map<string, AiSupplierAssessed>();
  for (const [supplierId, a] of chosen) {
    const answers = answersById.get(a.id) ?? {};
    const text = (key: string) => (typeof answers[key] === "string" ? (answers[key] as string) : null);
    result.set(supplierId, {
      reference: a.reference,
      assessmentId: a.id,
      approved: a.status === "approved",
      trainsOnOurData: text("trains_on_our_data"),
      contractTerms: Array.isArray(answers.contract_terms) ? (answers.contract_terms as string[]) : [],
      recommendation: text("recommendation"),
      conditions: text("conditions"),
    });
  }
  return result;
}

/** How many AI systems still in use name each supplier. */
async function aiSystemsBySupplier(organisationId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ supplierId: aiUseCases.supplierId, n: sql<number>`count(*)::int` })
    .from(aiUseCases)
    .where(
      and(
        eq(aiUseCases.organisationId, organisationId),
        ne(aiUseCases.lifecycleStage, "retired"),
        sql`${aiUseCases.supplierId} is not null`,
      ),
    )
    .groupBy(aiUseCases.supplierId);
  return new Map(rows.map((r) => [r.supplierId!, r.n]));
}

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

  const [aiAssessed, aiSystems] = await Promise.all([
    aiSupplierAssessments(organisationId),
    aiSystemsBySupplier(organisationId),
  ]);

  const now = new Date();
  return supplierRows.map(({ supplier, ownerEmail }) => {
    const own = bySupplier.get(supplier.id) ?? [];
    const gaps = article28Gaps(supplier, own, now);
    const assessed = aiAssessed.get(supplier.id) ?? null;
    const systems = aiSystems.get(supplier.id) ?? 0;
    return {
      supplier,
      dpas: own,
      current: currentDpa(own, now),
      ownerEmail,
      gaps,
      hardGaps: gaps.filter((g) => HARD_GAPS.includes(g)),
      privacy: privacyStanding(gaps),
      ai: {
        standing: aiStanding(supplier.aiInvolvement as AiInvolvement | null, assessed, systems),
        assessed,
        systems,
        ...aiSupplierGaps(supplier.aiInvolvement as AiInvolvement | null, assessed, systems),
      },
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
  if (input.ownerId) await assertMemberOf(input.organisationId, input.ownerId);
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
    aiInvolvement: AiInvolvement | null;
  }>;
  /** Record that a person has confirmed this is a real processor. */
  confirmBy?: string;
  actor: Actor;
}) {
  // A cleared name field arrives as an empty string, and was saved as one.
  if (input.changes.name !== undefined && !input.changes.name.trim()) {
    throw new Error("A third party needs a name.");
  }
  if (input.changes.ownerId) await assertMemberOf(input.organisationId, input.changes.ownerId);
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
      before: { name: before.name, reviewedAt: before.reviewedAt, aiInvolvement: before.aiInvolvement },
      after: { name: after.name, reviewedAt: after.reviewedAt, aiInvolvement: after.aiInvolvement },
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
        // An archived agreement is not renewed, so nagging about its expiry
        // is noise that trains people to ignore the reminders that matter.
        isNull(dpas.archivedAt),
        or(lte(dpas.expiresAt, horizon), isNull(dpas.signedAt)),
      ),
    )
    .orderBy(asc(dpas.expiresAt));
}


/**
 * Correct a recorded agreement.
 *
 * Dates get typed wrong, titles get pasted from the wrong contract, and a
 * transfer mechanism gets recorded before somebody reads the schedule that
 * changes it. Before this the only way to fix any of that was to record a
 * second agreement, which left the register claiming two contracts where there
 * was one.
 *
 * Every field's previous value goes into the audit trail, because "the expiry
 * date was changed" is a different fact from "the expiry date is this", and an
 * Article 28 register has to be able to answer both.
 */
export async function updateDpa(input: {
  organisationId: string;
  dpaId: string;
  title: string;
  documentRef?: string | null;
  signedAt?: Date | null;
  expiresAt?: Date | null;
  transferMechanism?: string | null;
  subProcessors?: string[];
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(dpas)
      .where(and(eq(dpas.id, input.dpaId), eq(dpas.organisationId, input.organisationId)));
    if (!existing) throw new Error("No such agreement");

    const next = {
      title: input.title.trim(),
      documentRef: input.documentRef?.trim() || null,
      signedAt: input.signedAt ?? null,
      expiresAt: input.expiresAt ?? null,
      transferMechanism: input.transferMechanism?.trim() || null,
      subProcessors: input.subProcessors ?? existing.subProcessors ?? [],
    };

    const [row] = await tx
      .update(dpas)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(dpas.id, existing.id))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "dpa.updated",
      subjectType: "dpa",
      subjectId: row.id,
      before: {
        title: existing.title,
        documentRef: existing.documentRef,
        signedAt: existing.signedAt,
        expiresAt: existing.expiresAt,
        transferMechanism: existing.transferMechanism,
        subProcessors: existing.subProcessors,
      },
      after: next,
    });
    return row;
  });
}

export class ArchiveRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveRefused";
  }
}

/**
 * Take an agreement out of the live register without destroying it.
 *
 * An agreement ends for reasons the contract does not describe: terminated,
 * superseded, the supplier dropped, or it was recorded in error. Expiry cannot
 * express any of those, and the alternative people reach for — editing the
 * expiry date to yesterday — puts a false fact in a compliance record.
 *
 * Archiving stops the renewal reminders and removes it from the in-force
 * calculation. It deliberately does not hide the resulting gap: archive the
 * only agreement a processor has and the register immediately reports that
 * processor as uncovered, which is the truth.
 */
export async function archiveDpa(input: {
  organisationId: string;
  dpaId: string;
  reason: string;
  actor: Actor;
}) {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw new ArchiveRefused(
      "Say why this agreement is being archived. An agreement that disappears " +
        "without a reason is worse than one still listed.",
    );
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(dpas)
      .where(and(eq(dpas.id, input.dpaId), eq(dpas.organisationId, input.organisationId)));
    if (!existing) throw new ArchiveRefused("That agreement no longer exists.");
    if (existing.archivedAt) return existing;

    const archivedAt = new Date();
    const [row] = await tx
      .update(dpas)
      .set({
        archivedAt,
        archivedBy: input.actor.actorUserId ?? null,
        archivedReason: reason,
        updatedAt: archivedAt,
      })
      .where(eq(dpas.id, existing.id))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "dpa.archived",
      subjectType: "dpa",
      subjectId: row.id,
      before: { archivedAt: null },
      after: { archivedAt, reason, title: existing.title },
    });
    return row;
  });
}

/** Undo an archiving. Reversible, because it is a judgement and judgements are revised. */
export async function restoreDpa(input: {
  organisationId: string;
  dpaId: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(dpas)
      .where(and(eq(dpas.id, input.dpaId), eq(dpas.organisationId, input.organisationId)));
    if (!existing) throw new ArchiveRefused("That agreement no longer exists.");
    if (!existing.archivedAt) return existing;

    const [row] = await tx
      .update(dpas)
      .set({ archivedAt: null, archivedBy: null, archivedReason: null, updatedAt: new Date() })
      .where(eq(dpas.id, existing.id))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "dpa.restored",
      subjectType: "dpa",
      subjectId: row.id,
      before: { archivedAt: existing.archivedAt, reason: existing.archivedReason },
      after: { archivedAt: null },
    });
    return row;
  });
}
