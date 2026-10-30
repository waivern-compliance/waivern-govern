import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  documents,
  entities,
  processingActivities,
  referenceCounters,
  sharingAgreementActivities,
  sharingAgreementParties,
  sharingAgreements,
  suppliers,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { isArt10Condition, isSchedule1Condition } from "@/lib/dpa2018/schedule-1";
import {
  GATEWAY_KINDS,
  SHARING_DIRECTIONS,
  isController,
  sharingAgreementGaps,
  uncoveredControllers,
  type GatewayKind,
  type PartyBasis,
  type SharingDirection,
} from "@/lib/dpa2018/sharing";
import { isLawfulBasis } from "@/lib/gdpr/lawful-basis";
import type { Actor } from "./templates";
import { assertEntityIn, assertMemberOf } from "./tenancy-guards";
import { canonicalise } from "./third-party";

/**
 * The register of data sharing agreements between controllers.
 *
 * An agreement is ours (one of our entities) with one or more other
 * controllers from the third-party register, about the processing activities
 * whose recipients it covers. The processing register reads it to say which
 * recipients that are other controllers have no agreement.
 */

export type SharingAgreement = typeof sharingAgreements.$inferSelect;
export type SharingParty = typeof sharingAgreementParties.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class SharingRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SharingRefused";
  }
}

/** One controller's basis for its side, as it will be stored. */
function cleanBasis(input: { lawfulBases?: readonly string[]; schedule1Condition?: string | null; art10Condition?: string | null }): PartyBasis {
  const bases = [...new Set(input.lawfulBases ?? [])];
  if (bases.some((b) => !isLawfulBasis(b))) throw new SharingRefused("That is not an Article 6(1) basis.");
  if (input.schedule1Condition && !isSchedule1Condition(input.schedule1Condition)) {
    throw new SharingRefused("That is not a Schedule 1 condition.");
  }
  if (input.art10Condition && !isArt10Condition(input.art10Condition)) throw new SharingRefused("That is not an Article 10 condition.");
  return {
    lawfulBases: bases as PartyBasis["lawfulBases"],
    schedule1Condition: (input.schedule1Condition || null) as PartyBasis["schedule1Condition"],
    art10Condition: (input.art10Condition || null) as PartyBasis["art10Condition"],
  };
}

async function nextReference(tx: Tx, organisationId: string, year: number) {
  const rows = await tx.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'DSA', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `DSA-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

async function loadForWrite(tx: Tx, id: string, organisationId: string) {
  const [row] = await tx
    .select()
    .from(sharingAgreements)
    .where(and(eq(sharingAgreements.id, id), eq(sharingAgreements.organisationId, organisationId)));
  if (!row) throw new SharingRefused("No such data sharing agreement.");
  return row;
}

/**
 * The other controllers on the third-party register, by canonical name, and
 * which activity–party pairs a current agreement covers. Read inside the
 * organisation's scope.
 */
export async function sharingCoverage(organisationId: string) {
  const [controllerRows, coveredRows] = await Promise.all([
    db
      .select({ id: suppliers.id, name: suppliers.name, canonicalKey: suppliers.canonicalKey, role: suppliers.role })
      .from(suppliers)
      .where(eq(suppliers.organisationId, organisationId)),
    db
      .select({ activityId: sharingAgreementActivities.activityId, supplierId: sharingAgreementParties.supplierId })
      .from(sharingAgreementActivities)
      .innerJoin(sharingAgreements, eq(sharingAgreements.id, sharingAgreementActivities.agreementId))
      .innerJoin(sharingAgreementParties, eq(sharingAgreementParties.agreementId, sharingAgreements.id))
      .where(and(eq(sharingAgreements.organisationId, organisationId), isNull(sharingAgreements.endedAt))),
  ]);
  return {
    controllers: new Map(controllerRows.filter((c) => isController(c.role)).map((c) => [c.canonicalKey, { id: c.id, name: c.name }])),
    covered: new Set(coveredRows.map((r) => `${r.activityId}:${r.supplierId}`)),
  };
}

/** Recipients of an activity that are other controllers with no current agreement. */
export function controllersWithoutAgreement(
  activity: { id: string; recipients: readonly string[] },
  coverage: Awaited<ReturnType<typeof sharingCoverage>>,
) {
  return uncoveredControllers(activity, coverage.controllers, coverage.covered, canonicalise);
}

async function rowsFor(organisationId: string, where: ReturnType<typeof and>, now: Date) {
  const rows = await db
    .select({ agreement: sharingAgreements, entityName: entities.name, ownerEmail: users.email })
    .from(sharingAgreements)
    .innerJoin(entities, eq(entities.id, sharingAgreements.entityId))
    .leftJoin(users, eq(users.id, sharingAgreements.ownerId))
    .where(where)
    .orderBy(asc(sharingAgreements.reference));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.agreement.id);
  const [parties, linked, attached] = await Promise.all([
    db
      .select({ party: sharingAgreementParties, supplierName: suppliers.name, supplierRole: suppliers.role })
      .from(sharingAgreementParties)
      .innerJoin(suppliers, eq(suppliers.id, sharingAgreementParties.supplierId))
      .where(inArray(sharingAgreementParties.agreementId, ids))
      .orderBy(asc(suppliers.name)),
    db
      .select({
        agreementId: sharingAgreementActivities.agreementId,
        id: processingActivities.id,
        reference: processingActivities.reference,
        name: processingActivities.name,
      })
      .from(sharingAgreementActivities)
      .innerJoin(processingActivities, eq(processingActivities.id, sharingAgreementActivities.activityId))
      .where(inArray(sharingAgreementActivities.agreementId, ids))
      .orderBy(asc(processingActivities.reference)),
    db
      .select({ subjectId: documents.subjectId, n: count() })
      .from(documents)
      .where(and(eq(documents.organisationId, organisationId), eq(documents.subjectType, "sharing_agreement")))
      .groupBy(documents.subjectId),
  ]);
  const files = new Map(attached.map((a) => [a.subjectId, Number(a.n)]));
  return rows.map((r) => {
    const own = parties.filter((p) => p.party.agreementId === r.agreement.id);
    const activities = linked.filter((l) => l.agreementId === r.agreement.id).map(({ id, reference, name }) => ({ id, reference, name }));
    const attachments = files.get(r.agreement.id) ?? 0;
    return {
      ...r,
      parties: own,
      activities,
      attachments,
      gaps: sharingAgreementGaps(r.agreement, own.map((p) => p.party), { attachments, activities: activities.length }, now),
    };
  });
}

export async function sharingRegister(organisationId: string, entityIds: string[] | null, now = new Date()) {
  return withOrganisation(organisationId, async () => {
    if (entityIds !== null && entityIds.length === 0) return { rows: [], uncovered: [] };
    const scope = (table: typeof sharingAgreements | typeof processingActivities) =>
      entityIds === null
        ? eq(table.organisationId, organisationId)
        : and(eq(table.organisationId, organisationId), inArray(table.entityId, entityIds));
    const [rows, coverage, activities] = await Promise.all([
      rowsFor(organisationId, scope(sharingAgreements), now),
      sharingCoverage(organisationId),
      db
        .select({ id: processingActivities.id, reference: processingActivities.reference, name: processingActivities.name, recipients: processingActivities.recipients })
        .from(processingActivities)
        .where(scope(processingActivities))
        .orderBy(asc(processingActivities.reference)),
    ]);
    return {
      rows,
      uncovered: activities
        .map((a) => ({ id: a.id, reference: a.reference, name: a.name, controllers: controllersWithoutAgreement(a, coverage) }))
        .filter((a) => a.controllers.length > 0),
    };
  });
}

export async function loadSharingAgreement(id: string, organisationId: string, now = new Date()) {
  return withOrganisation(organisationId, async () => {
    const [row] = await rowsFor(
      organisationId,
      and(eq(sharingAgreements.id, id), eq(sharingAgreements.organisationId, organisationId)),
      now,
    );
    return row ?? null;
  });
}

/** The current and ended agreements an activity is linked to, or a third party is party to. */
export async function agreementsFor(organisationId: string, about: { activityId: string } | { supplierId: string }) {
  return withOrganisation(organisationId, async () => {
    const ids =
      "activityId" in about
        ? db
            .select({ id: sharingAgreementActivities.agreementId })
            .from(sharingAgreementActivities)
            .where(and(eq(sharingAgreementActivities.organisationId, organisationId), eq(sharingAgreementActivities.activityId, about.activityId)))
        : db
            .select({ id: sharingAgreementParties.agreementId })
            .from(sharingAgreementParties)
            .where(and(eq(sharingAgreementParties.organisationId, organisationId), eq(sharingAgreementParties.supplierId, about.supplierId)));
    return db
      .select({ id: sharingAgreements.id, reference: sharingAgreements.reference, title: sharingAgreements.title, endedAt: sharingAgreements.endedAt })
      .from(sharingAgreements)
      .where(and(eq(sharingAgreements.organisationId, organisationId), inArray(sharingAgreements.id, ids)))
      .orderBy(asc(sharingAgreements.reference));
  });
}

export async function createSharingAgreement(input: { organisationId: string; entityId: string; title: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    const title = input.title.trim();
    if (!title) throw new SharingRefused("Give the agreement a title.");
    await assertEntityIn(input.organisationId, input.entityId);
    return db.transaction(async (tx) => {
      const reference = await nextReference(tx, input.organisationId, new Date().getUTCFullYear());
      const [row] = await tx
        .insert(sharingAgreements)
        .values({ organisationId: input.organisationId, entityId: input.entityId, reference, title })
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: input.entityId,
        action: "sharing_agreement.created",
        subjectType: "sharing_agreement",
        subjectId: row.id,
        after: { reference, title },
      });
      return row;
    });
  });
}

export async function updateSharingAgreement(input: {
  id: string;
  organisationId: string;
  changes: {
    title: string;
    purpose: string | null;
    direction: string;
    gatewayKind: string | null;
    gateway: string | null;
    dataShared: string | null;
    lawfulBases: readonly string[];
    schedule1Condition: string | null;
    art10Condition: string | null;
    ownerId: string | null;
    signedAt: Date | null;
    reviewDueAt: Date | null;
    activityIds: readonly string[];
  };
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const c = input.changes;
    const title = c.title.trim();
    if (!title) throw new SharingRefused("Give the agreement a title.");
    if (!(c.direction in SHARING_DIRECTIONS)) throw new SharingRefused("Say which way the data goes.");
    if (c.gatewayKind && !(c.gatewayKind in GATEWAY_KINDS)) throw new SharingRefused("Choose where the power to share comes from.");
    if (c.ownerId) await assertMemberOf(input.organisationId, c.ownerId);
    if (c.signedAt && c.signedAt.getTime() > Date.now()) throw new SharingRefused("It cannot have been signed in the future.");
    const basis = cleanBasis(c);
    const activityIds = [...new Set(c.activityIds)];

    return db.transaction(async (tx) => {
      const before = await loadForWrite(tx, input.id, input.organisationId);
      if (before.endedAt) throw new SharingRefused("This agreement has ended.");
      if (activityIds.length > 0) {
        const found = await tx
          .select({ id: processingActivities.id })
          .from(processingActivities)
          .where(
            and(
              eq(processingActivities.organisationId, input.organisationId),
              eq(processingActivities.entityId, before.entityId),
              inArray(processingActivities.id, activityIds),
            ),
          );
        if (found.length !== activityIds.length) {
          throw new SharingRefused("Link only processing activities of the entity that is party to the agreement.");
        }
      }
      const [after] = await tx
        .update(sharingAgreements)
        .set({
          title,
          purpose: c.purpose?.trim() || null,
          direction: c.direction as SharingDirection,
          gatewayKind: (c.gatewayKind || null) as GatewayKind | null,
          gateway: c.gatewayKind === "not_public" ? null : c.gateway?.trim() || null,
          dataShared: c.dataShared?.trim() || null,
          ...basis,
          ownerId: c.ownerId,
          signedAt: c.signedAt,
          reviewDueAt: c.reviewDueAt,
          updatedAt: new Date(),
        })
        .where(eq(sharingAgreements.id, input.id))
        .returning();
      const linked = await tx
        .select({ activityId: sharingAgreementActivities.activityId })
        .from(sharingAgreementActivities)
        .where(eq(sharingAgreementActivities.agreementId, input.id));
      await tx.delete(sharingAgreementActivities).where(eq(sharingAgreementActivities.agreementId, input.id));
      if (activityIds.length > 0) {
        await tx
          .insert(sharingAgreementActivities)
          .values(activityIds.map((activityId) => ({ organisationId: input.organisationId, agreementId: input.id, activityId })));
      }
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId,
        action: "sharing_agreement.updated",
        subjectType: "sharing_agreement",
        subjectId: input.id,
        before: { title: before.title, gateway: before.gateway, lawfulBases: before.lawfulBases, reviewDueAt: before.reviewDueAt, activities: linked.map((l) => l.activityId) },
        after: { title: after.title, gateway: after.gateway, lawfulBases: after.lawfulBases, reviewDueAt: after.reviewDueAt, activities: activityIds },
      });
      return after;
    });
  });
}

/** Another controller joins the agreement. Only a third party recorded as a controller can. */
export async function addSharingParty(input: { agreementId: string; organisationId: string; supplierId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () =>
    db.transaction(async (tx) => {
      const agreement = await loadForWrite(tx, input.agreementId, input.organisationId);
      if (agreement.endedAt) throw new SharingRefused("This agreement has ended.");
      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, input.supplierId), eq(suppliers.organisationId, input.organisationId)));
      if (!supplier) throw new SharingRefused("No such third party in this organisation.");
      if (!isController(supplier.role)) {
        throw new SharingRefused(
          `${supplier.name} is recorded as a processor. A processor is governed by an Article 28 agreement; if it is also a controller, say so on the third-party register first.`,
        );
      }
      const [row] = await tx
        .insert(sharingAgreementParties)
        .values({ organisationId: input.organisationId, agreementId: input.agreementId, supplierId: input.supplierId })
        .onConflictDoNothing()
        .returning();
      if (!row) throw new SharingRefused(`${supplier.name} is already a party.`);
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: agreement.entityId,
        action: "sharing_agreement.party_added",
        subjectType: "sharing_agreement",
        subjectId: input.agreementId,
        after: { supplier: supplier.id, name: supplier.name },
      });
      return row;
    }),
  );
}

async function loadPartyForWrite(tx: Tx, partyId: string, organisationId: string) {
  const [row] = await tx
    .select({ party: sharingAgreementParties, agreement: sharingAgreements })
    .from(sharingAgreementParties)
    .innerJoin(sharingAgreements, eq(sharingAgreements.id, sharingAgreementParties.agreementId))
    .where(and(eq(sharingAgreementParties.id, partyId), eq(sharingAgreementParties.organisationId, organisationId)));
  if (!row) throw new SharingRefused("No such party.");
  if (row.agreement.endedAt) throw new SharingRefused("This agreement has ended.");
  return row;
}

/** The other controller's basis for its side of the sharing. */
export async function updateSharingParty(input: {
  partyId: string;
  organisationId: string;
  basis: { lawfulBases: readonly string[]; schedule1Condition: string | null; art10Condition: string | null };
  note: string | null;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const basis = cleanBasis(input.basis);
    return db.transaction(async (tx) => {
      const { party, agreement } = await loadPartyForWrite(tx, input.partyId, input.organisationId);
      const [after] = await tx
        .update(sharingAgreementParties)
        .set({ ...basis, note: input.note?.trim() || null })
        .where(eq(sharingAgreementParties.id, input.partyId))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: agreement.entityId,
        action: "sharing_agreement.party_updated",
        subjectType: "sharing_agreement",
        subjectId: agreement.id,
        before: { supplier: party.supplierId, ...cleanBasis(party) },
        after: { supplier: party.supplierId, ...basis },
      });
      return after;
    });
  });
}

export async function removeSharingParty(input: { partyId: string; organisationId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () =>
    db.transaction(async (tx) => {
      const { party, agreement } = await loadPartyForWrite(tx, input.partyId, input.organisationId);
      await tx.delete(sharingAgreementParties).where(eq(sharingAgreementParties.id, input.partyId));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: agreement.entityId,
        action: "sharing_agreement.party_removed",
        subjectType: "sharing_agreement",
        subjectId: agreement.id,
        before: { supplier: party.supplierId, lawfulBases: party.lawfulBases },
      });
    }),
  );
}

/** Reviewed today, with when it is next due. */
export async function recordSharingReview(input: { id: string; organisationId: string; nextReviewDueAt: Date; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    if (input.nextReviewDueAt.getTime() <= Date.now()) throw new SharingRefused("The next review must be in the future.");
    return db.transaction(async (tx) => {
      const before = await loadForWrite(tx, input.id, input.organisationId);
      if (before.endedAt) throw new SharingRefused("This agreement has ended.");
      const reviewedAt = new Date();
      const [after] = await tx
        .update(sharingAgreements)
        .set({ lastReviewedAt: reviewedAt, reviewDueAt: input.nextReviewDueAt, updatedAt: reviewedAt })
        .where(eq(sharingAgreements.id, input.id))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId,
        action: "sharing_agreement.reviewed",
        subjectType: "sharing_agreement",
        subjectId: input.id,
        before: { lastReviewedAt: before.lastReviewedAt, reviewDueAt: before.reviewDueAt },
        after: { lastReviewedAt: reviewedAt, reviewDueAt: input.nextReviewDueAt },
      });
      return after;
    });
  });
}

/** No longer in force. Kept, and no longer covers anything. */
export async function endSharingAgreement(input: { id: string; organisationId: string; reason: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    const reason = input.reason.trim();
    if (!reason) throw new SharingRefused("Say why it ended.");
    return db.transaction(async (tx) => {
      const before = await loadForWrite(tx, input.id, input.organisationId);
      if (before.endedAt) throw new SharingRefused("It has already ended.");
      const endedAt = new Date();
      const [after] = await tx
        .update(sharingAgreements)
        .set({ endedAt, updatedAt: endedAt })
        .where(eq(sharingAgreements.id, input.id))
        .returning();
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId,
        action: "sharing_agreement.ended",
        subjectType: "sharing_agreement",
        subjectId: input.id,
        after: { endedAt, reason },
      });
      return after;
    });
  });
}
