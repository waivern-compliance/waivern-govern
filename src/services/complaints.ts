import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  dataProtectionComplaintEvents,
  dataProtectionComplaints,
  dataSubjectRequests,
  entities,
  organisations,
  referenceCounters,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  COMPLAINT_SUBJECT_KEYS,
  complaintClock,
  type ComplaintClock,
  type ComplaintOutcome,
} from "@/lib/complaints/statutory";
import type { Jurisdiction } from "@/lib/dsr/statutory";
import { CHANNELS, defaultJurisdiction, type ControllerRole } from "./data-subject-requests";
import type { Actor } from "./templates";
import { assertEntityIn, assertMemberOf } from "./tenancy-guards";

/**
 * The register of complaints from data subjects to the controller (DPA 2018 s.164A).
 *
 * Modelled on the request register. Nothing here decides whether a complaint
 * is justified. It counts the thirty days to acknowledge it, holds the
 * organisation's own targets for the rest, keeps every enquiry and update as a
 * dated step, and refuses what would leave the record unable to show the duty
 * was met: an outcome nobody was told, a late acknowledgement with no reason,
 * a complaint closed without an outcome that was not withdrawn.
 */

export type Complaint = typeof dataProtectionComplaints.$inferSelect;
export type ComplaintEvent = typeof dataProtectionComplaintEvents.$inferSelect;
type LoadedEvent = ComplaintEvent & { recordedByEmail: string | null };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export { CHANNELS };

export class ComplaintRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComplaintRefused";
  }
}

export type ComplaintTargets = { outcomeTargetDays: number; updateIntervalDays: number };

export type LoadedComplaint = {
  complaint: Complaint;
  entityName: string;
  ownerEmail: string | null;
  events: LoadedEvent[];
  clock: ComplaintClock;
};

function lastUpdateOf(events: readonly ComplaintEvent[]): Date | null {
  const updates = events.filter((e) => e.kind === "progress_update").map((e) => e.occurredAt.getTime());
  return updates.length ? new Date(Math.max(...updates)) : null;
}

function clockOf(complaint: Complaint, events: readonly ComplaintEvent[], targets: ComplaintTargets, now = new Date()) {
  return complaintClock({
    jurisdiction: complaint.jurisdiction,
    controllerRole: complaint.controllerRole,
    receivedAt: complaint.receivedAt,
    acknowledgedAt: complaint.acknowledgedAt,
    lastUpdateAt: lastUpdateOf(events),
    outcomeAt: complaint.outcomeAt,
    ended: complaint.status === "withdrawn" || (complaint.closedAt !== null && complaint.outcomeAt === null),
    outcomeTargetDays: targets.outcomeTargetDays,
    updateIntervalDays: targets.updateIntervalDays,
    now,
  });
}

async function nextReference(organisationId: string, year: number) {
  const rows = await db.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'CMP', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `CMP-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

function validSubject(subject: string): string {
  if (!(COMPLAINT_SUBJECT_KEYS as string[]).includes(subject)) {
    throw new ComplaintRefused("Say what the complaint is about. If nothing fits, choose “something else”.");
  }
  return subject;
}

function validLink(link: string | null | undefined): string | null {
  const trimmed = link?.trim() || null;
  if (trimmed && !/^https?:\/\//.test(trimmed)) throw new ComplaintRefused("A link should start with https://.");
  return trimmed;
}

/**
 * The request a complaint is about, checked to be in the same entity.
 *
 * A complaint and the request it is about are answered by the same
 * controller, so a link across entities would be a mistake, and one across
 * organisations would expose another organisation's request.
 */
async function assertRequestFor(tx: Tx, organisationId: string, entityId: string, requestId: string) {
  const [request] = await tx
    .select({ id: dataSubjectRequests.id, entityId: dataSubjectRequests.entityId })
    .from(dataSubjectRequests)
    .where(and(eq(dataSubjectRequests.id, requestId), eq(dataSubjectRequests.organisationId, organisationId)));
  if (!request) throw new ComplaintRefused("That request is not on this organisation's register.");
  if (request.entityId !== entityId) {
    throw new ComplaintRefused("That request was made to a different entity. A complaint is linked to a request made to the same one.");
  }
}

/** The organisation's own standard for "without undue delay", and how often to update the complainant. */
export async function complaintTargets(organisationId: string): Promise<ComplaintTargets> {
  return withOrganisation(organisationId, async () => {
    const [org] = await db
      .select({
        outcomeTargetDays: organisations.complaintOutcomeTargetDays,
        updateIntervalDays: organisations.complaintUpdateIntervalDays,
      })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    return org ?? { outcomeTargetDays: 30, updateIntervalDays: 30 };
  });
}

/**
 * Change the organisation's targets.
 *
 * Unlike the statutory thirty days, these are the organisation's choice, and
 * a change applies to complaints already open: it is a standard, not a
 * deadline anybody was promised.
 */
export async function setComplaintTargets(input: {
  organisationId: string;
  outcomeTargetDays: number;
  updateIntervalDays: number;
  actor: Actor;
}) {
  for (const n of [input.outcomeTargetDays, input.updateIntervalDays]) {
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      throw new ComplaintRefused("A target is a whole number of days, from 0 (off) to 365.");
    }
  }
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          outcomeTargetDays: organisations.complaintOutcomeTargetDays,
          updateIntervalDays: organisations.complaintUpdateIntervalDays,
        })
        .from(organisations)
        .where(eq(organisations.id, input.organisationId));
      if (!before) throw new Error("No such organisation");
      const after = { outcomeTargetDays: input.outcomeTargetDays, updateIntervalDays: input.updateIntervalDays };
      if (before.outcomeTargetDays === after.outcomeTargetDays && before.updateIntervalDays === after.updateIntervalDays) {
        return;
      }
      await tx
        .update(organisations)
        .set({ complaintOutcomeTargetDays: after.outcomeTargetDays, complaintUpdateIntervalDays: after.updateIntervalDays })
        .where(eq(organisations.id, input.organisationId));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "organisation.complaint_targets_set",
        subjectType: "organisation",
        subjectId: input.organisationId,
        before,
        after,
      });
    });
  });
}

export async function recordComplaint(input: {
  organisationId: string;
  entityId: string;
  channel: string;
  /** When it arrived. Starts the thirty days. */
  receivedAt: Date;
  subject: string;
  description: string;
  complainantName: string;
  complainantContact?: string | null;
  representative?: string | null;
  controllerRole?: ControllerRole;
  /** Defaults to the organisation's. */
  jurisdiction?: Jurisdiction;
  /** The request it is about, if it is about one. */
  requestId?: string | null;
  ownerId?: string | null;
  actor: Actor;
}) {
  const subject = validSubject(input.subject);
  if (!input.complainantName.trim()) {
    throw new ComplaintRefused("Record who is complaining. A complaint with no complainant cannot be answered.");
  }
  if (!input.description.trim()) throw new ComplaintRefused("Record what the complaint is, in their terms.");
  if (input.receivedAt.getTime() > Date.now() + 60_000) {
    throw new ComplaintRefused("A complaint cannot arrive in the future. Record when it actually arrived.");
  }

  return withOrganisation(input.organisationId, async () => {
    await assertEntityIn(input.organisationId, input.entityId);
    if (input.ownerId) await assertMemberOf(input.organisationId, input.ownerId);
    const jurisdiction = input.jurisdiction ?? (await defaultJurisdiction(input.organisationId));
    const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());

    return db.transaction(async (tx) => {
      if (input.requestId) await assertRequestFor(tx, input.organisationId, input.entityId, input.requestId);
      const [row] = await tx
        .insert(dataProtectionComplaints)
        .values({
          organisationId: input.organisationId,
          entityId: input.entityId,
          reference,
          jurisdiction,
          controllerRole: input.controllerRole ?? "controller",
          channel: input.channel,
          receivedAt: input.receivedAt,
          subject,
          description: input.description.trim(),
          complainantName: input.complainantName.trim(),
          complainantContact: input.complainantContact?.trim() || null,
          representative: input.representative?.trim() || null,
          requestId: input.requestId ?? null,
          ownerId: input.ownerId ?? null,
        })
        .returning();

      // As for requests, the complainant's name, contact and words stay out of
      // the audit chain, which outlives the complaint and is exported.
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: input.entityId,
        action: "complaint.recorded",
        subjectType: "data_protection_complaint",
        subjectId: row.id,
        after: {
          reference,
          subject,
          channel: input.channel,
          receivedAt: input.receivedAt.toISOString(),
          jurisdiction,
          role: row.controllerRole,
          requestId: row.requestId,
        },
      });
      return row;
    });
  });
}

async function lockedComplaint(tx: Tx, complaintId: string, organisationId: string) {
  const [complaint] = await tx
    .select()
    .from(dataProtectionComplaints)
    .where(and(eq(dataProtectionComplaints.id, complaintId), eq(dataProtectionComplaints.organisationId, organisationId)))
    .for("update");
  if (!complaint) throw new Error("No such complaint");
  return complaint;
}

export async function updateComplaint(input: {
  complaintId: string;
  organisationId: string;
  changes: Partial<{
    channel: string;
    subject: string;
    description: string;
    complainantName: string;
    complainantContact: string | null;
    representative: string | null;
    representativeAuthorityChecked: boolean | null;
    controllerRole: string;
    requestId: string | null;
    ownerId: string | null;
  }>;
  actor: Actor;
}) {
  const changes = { ...input.changes };
  if (changes.subject !== undefined) changes.subject = validSubject(changes.subject);
  if (changes.complainantName !== undefined && !changes.complainantName.trim()) {
    throw new ComplaintRefused("Record who is complaining. A complaint with no complainant cannot be answered.");
  }
  if (changes.description !== undefined && !changes.description.trim()) {
    throw new ComplaintRefused("Record what the complaint is, in their terms.");
  }

  return withOrganisation(input.organisationId, async () => {
    if (changes.ownerId) await assertMemberOf(input.organisationId, changes.ownerId);
    return db.transaction(async (tx) => {
      const before = await lockedComplaint(tx, input.complaintId, input.organisationId);
      if (changes.requestId && changes.requestId !== before.requestId) {
        await assertRequestFor(tx, input.organisationId, before.entityId, changes.requestId);
      }
      const [after] = await tx
        .update(dataProtectionComplaints)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(dataProtectionComplaints.id, input.complaintId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId,
        action: "complaint.updated",
        subjectType: "data_protection_complaint",
        subjectId: input.complaintId,
        before: { changed: Object.keys(changes) },
        after: {
          reference: after.reference,
          ...(changes.subject ? { subject: changes.subject } : {}),
          ...(changes.requestId !== undefined ? { requestId: changes.requestId } : {}),
        },
      });
      return after;
    });
  });
}

/**
 * Record a step in handling the complaint.
 *
 * Acknowledging stamps the complaint and, if it is after the thirty days, must
 * say why. An enquiry moves it to being investigated. A progress update is the
 * s.164A(5)(b) duty to keep the complainant informed, and restarts the
 * organisation's update interval.
 */
export async function recordComplaintEvent(input: {
  complaintId: string;
  organisationId: string;
  kind: "acknowledged" | "enquiry" | "progress_update" | "regulator_contact";
  note: string;
  channel?: string | null;
  /** When it happened. Defaults to now. */
  at?: Date;
  /** Required for an acknowledgement after the thirty days. */
  lateReason?: string | null;
  actor: Actor;
}) {
  const at = input.at ?? new Date();
  const note = input.note.trim();
  if (at.getTime() > Date.now() + 60_000) throw new ComplaintRefused("That is in the future. Record when it actually happened.");
  if (!note && input.kind !== "acknowledged") {
    throw new ComplaintRefused(
      input.kind === "enquiry"
        ? "Say what was looked into, and with whom."
        : input.kind === "progress_update"
          ? "Say what the complainant was told."
          : "Say what the Commission asked, or what was sent to it.",
    );
  }
  if ((input.kind === "acknowledged" || input.kind === "progress_update") && !input.channel) {
    throw new ComplaintRefused("Say how the complainant was contacted.");
  }

  return withOrganisation(input.organisationId, async () => {
    const targets = await complaintTargets(input.organisationId);
    return db.transaction(async (tx) => {
      const complaint = await lockedComplaint(tx, input.complaintId, input.organisationId);
      if (complaint.closedAt || complaint.status === "withdrawn") throw new ComplaintRefused("This complaint has ended.");
      if (at < complaint.receivedAt) throw new ComplaintRefused("That is before the complaint arrived.");

      const changes: Partial<typeof dataProtectionComplaints.$inferInsert> = {};
      let late = false;
      const lateReason = input.lateReason?.trim() || null;
      if (input.kind === "acknowledged") {
        if (complaint.acknowledgedAt) throw new ComplaintRefused("It has already been acknowledged.");
        if (complaint.outcomeAt) throw new ComplaintRefused("The outcome has already been sent, which acknowledged it.");
        const events = await tx
          .select()
          .from(dataProtectionComplaintEvents)
          .where(eq(dataProtectionComplaintEvents.complaintId, input.complaintId));
        const clock = clockOf({ ...complaint, acknowledgedAt: at }, events, targets, at);
        late = clock.acknowledgement.state === "late";
        if (late && !lateReason) {
          throw new ComplaintRefused("This is after the 30 days in s.164A(3). Record why it was late.");
        }
        Object.assign(changes, {
          acknowledgedAt: at,
          acknowledgementChannel: input.channel,
          acknowledgementLateReason: lateReason,
          ...(complaint.status === "received" ? { status: "acknowledged" as const } : {}),
        });
      } else {
        if (complaint.outcomeAt && input.kind !== "regulator_contact") {
          throw new ComplaintRefused("The outcome has been sent. Close the complaint, or record contact from the Commission.");
        }
        if (input.kind === "enquiry" && (complaint.status === "received" || complaint.status === "acknowledged")) {
          changes.status = "investigating";
        }
      }

      const [event] = await tx
        .insert(dataProtectionComplaintEvents)
        .values({
          organisationId: input.organisationId,
          complaintId: input.complaintId,
          kind: input.kind,
          note: note || "Acknowledged receipt.",
          channel: input.channel ?? null,
          occurredAt: at,
          recordedBy: input.actor.actorUserId,
          recordedByLabel: input.actor.actorLabel,
        })
        .returning();
      if (Object.keys(changes).length > 0) {
        await tx
          .update(dataProtectionComplaints)
          .set({ ...changes, updatedAt: new Date() })
          .where(eq(dataProtectionComplaints.id, input.complaintId));
      }

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: complaint.entityId,
        action: input.kind === "acknowledged" ? "complaint.acknowledged" : "complaint.event_recorded",
        subjectType: "data_protection_complaint",
        subjectId: input.complaintId,
        after: {
          reference: complaint.reference,
          kind: input.kind,
          eventId: event.id,
          occurredAt: at.toISOString(),
          channel: input.channel ?? null,
          ...(input.kind === "acknowledged" ? { late, lateReason } : {}),
        },
      });
      return event;
    });
  });
}

/**
 * Record the outcome the complainant was told (s.164A(4)(b)).
 *
 * The letter is written elsewhere. If nothing acknowledged the complaint
 * before, the outcome does, and counts against the thirty days too. Coming
 * after the organisation's own target needs a reason: that is how the record
 * shows the delay was not undue.
 */
export async function recordComplaintOutcome(input: {
  complaintId: string;
  organisationId: string;
  outcome: ComplaintOutcome;
  at?: Date;
  channel: string;
  summary: string;
  remedialAction?: string | null;
  link?: string | null;
  toldOfRegulatorRight?: boolean;
  lateReason?: string | null;
  actor: Actor;
}) {
  const at = input.at ?? new Date();
  const summary = input.summary.trim();
  if (!summary) throw new ComplaintRefused("Say what the complainant was told, in a sentence or two.");
  if (at.getTime() > Date.now() + 60_000) throw new ComplaintRefused("That is in the future. Record when it was sent.");
  const link = validLink(input.link);

  return withOrganisation(input.organisationId, async () => {
    const targets = await complaintTargets(input.organisationId);
    return db.transaction(async (tx) => {
      const complaint = await lockedComplaint(tx, input.complaintId, input.organisationId);
      if (complaint.outcomeAt) throw new ComplaintRefused("An outcome has already been recorded.");
      if (complaint.closedAt || complaint.status === "withdrawn") throw new ComplaintRefused("This complaint has ended.");
      if (at < complaint.receivedAt) throw new ComplaintRefused("That is before the complaint arrived.");
      if (input.outcome === "passed_to_controller" && complaint.controllerRole === "controller") {
        throw new ComplaintRefused("As the controller, the complaint is yours to answer. Passing it on is for a processor or a joint controller.");
      }

      const events = await tx
        .select()
        .from(dataProtectionComplaintEvents)
        .where(eq(dataProtectionComplaintEvents.complaintId, input.complaintId));
      const clock = clockOf({ ...complaint, outcomeAt: at }, events, targets, at);
      const ackLate = !complaint.acknowledgedAt && clock.acknowledgement.state === "late";
      const late = clock.outcome.state === "late";
      const lateReason = input.lateReason?.trim() || null;
      if ((late || ackLate) && !lateReason) {
        throw new ComplaintRefused(
          ackLate
            ? "Nothing acknowledged this complaint within the 30 days in s.164A(3). Record why."
            : "This is after your own target for the outcome. Record why it took longer, so the record shows the delay was not undue.",
        );
      }

      const [after] = await tx
        .update(dataProtectionComplaints)
        .set({
          outcome: input.outcome,
          outcomeAt: at,
          outcomeChannel: input.channel,
          outcomeSummary: summary,
          remedialAction: input.remedialAction?.trim() || null,
          outcomeLink: link,
          toldOfRegulatorRight: input.toldOfRegulatorRight ?? null,
          outcomeLateReason: late ? lateReason : null,
          ...(complaint.acknowledgedAt
            ? {}
            : { acknowledgedAt: at, acknowledgementChannel: input.channel, acknowledgementLateReason: ackLate ? lateReason : null }),
          status: "outcome_sent",
          updatedAt: new Date(),
        })
        .where(eq(dataProtectionComplaints.id, input.complaintId))
        .returning();
      await tx.insert(dataProtectionComplaintEvents).values({
        organisationId: input.organisationId,
        complaintId: input.complaintId,
        kind: "outcome_sent",
        note: summary,
        channel: input.channel,
        occurredAt: at,
        recordedBy: input.actor.actorUserId,
        recordedByLabel: input.actor.actorLabel,
      });

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: complaint.entityId,
        action: "complaint.outcome_sent",
        subjectType: "data_protection_complaint",
        subjectId: input.complaintId,
        after: {
          reference: complaint.reference,
          outcome: input.outcome,
          outcomeAt: at.toISOString(),
          channel: input.channel,
          late,
          acknowledgedLate: ackLate,
          lateReason,
          toldOfRegulatorRight: input.toldOfRegulatorRight ?? null,
        },
      });
      return after;
    });
  });
}

/**
 * Close a complaint: after the outcome, or without one if the complainant
 * withdrew it. A complaint that is still owed an outcome cannot be closed
 * quietly — that would turn a late answer into no answer.
 */
export async function closeComplaint(input: {
  complaintId: string;
  organisationId: string;
  rationale: string;
  withdrawn?: boolean;
  actor: Actor;
}) {
  const rationale = input.rationale.trim();
  if (!rationale) throw new ComplaintRefused("Say why it is being closed.");

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const complaint = await lockedComplaint(tx, input.complaintId, input.organisationId);
      if (complaint.closedAt || complaint.status === "withdrawn") throw new ComplaintRefused("This complaint has already ended.");
      if (!complaint.outcomeAt && !input.withdrawn) {
        throw new ComplaintRefused(
          "The complainant has not been told the outcome. Record it first, or close it as withdrawn if they withdrew it.",
        );
      }
      if (input.withdrawn && complaint.outcomeAt) {
        throw new ComplaintRefused("The outcome has been sent, so it cannot be withdrawn. Close it instead.");
      }

      const now = new Date();
      const [after] = await tx
        .update(dataProtectionComplaints)
        .set({
          status: input.withdrawn ? "withdrawn" : "closed",
          closedAt: now,
          closureRationale: rationale,
          updatedAt: now,
        })
        .where(eq(dataProtectionComplaints.id, input.complaintId))
        .returning();
      if (input.withdrawn) {
        await tx.insert(dataProtectionComplaintEvents).values({
          organisationId: input.organisationId,
          complaintId: input.complaintId,
          kind: "withdrawn",
          note: rationale,
          occurredAt: now,
          recordedBy: input.actor.actorUserId,
          recordedByLabel: input.actor.actorLabel,
        });
      }

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: complaint.entityId,
        action: input.withdrawn ? "complaint.withdrawn" : "complaint.closed",
        subjectType: "data_protection_complaint",
        subjectId: input.complaintId,
        after: { reference: complaint.reference, rationale, outcome: complaint.outcome },
      });
      return after;
    });
  });
}

async function eventsFor(complaintIds: string[]): Promise<LoadedEvent[]> {
  if (complaintIds.length === 0) return [];
  return db
    .select({ event: dataProtectionComplaintEvents, recordedByEmail: users.email })
    .from(dataProtectionComplaintEvents)
    .leftJoin(users, eq(users.id, dataProtectionComplaintEvents.recordedBy))
    .where(inArray(dataProtectionComplaintEvents.complaintId, complaintIds))
    .orderBy(asc(dataProtectionComplaintEvents.occurredAt), asc(dataProtectionComplaintEvents.recordedAt))
    .then((rows) => rows.map((r) => ({ ...r.event, recordedByEmail: r.recordedByEmail })));
}

function groupEvents(events: LoadedEvent[]) {
  const byComplaint = new Map<string, LoadedEvent[]>();
  for (const e of events) byComplaint.set(e.complaintId, [...(byComplaint.get(e.complaintId) ?? []), e]);
  return byComplaint;
}

export async function loadComplaint(
  complaintId: string,
  organisationId: string,
): Promise<(LoadedComplaint & { request: { id: string; reference: string; status: string } | null }) | null> {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({ complaint: dataProtectionComplaints, entityName: entities.name, ownerEmail: users.email })
      .from(dataProtectionComplaints)
      .innerJoin(entities, eq(entities.id, dataProtectionComplaints.entityId))
      .leftJoin(users, eq(users.id, dataProtectionComplaints.ownerId))
      .where(
        and(eq(dataProtectionComplaints.id, complaintId), eq(dataProtectionComplaints.organisationId, organisationId)),
      );
    if (!row) return null;
    const [events, targets] = await Promise.all([eventsFor([complaintId]), complaintTargets(organisationId)]);
    const [request] = row.complaint.requestId
      ? await db
          .select({ id: dataSubjectRequests.id, reference: dataSubjectRequests.reference, status: dataSubjectRequests.status })
          .from(dataSubjectRequests)
          .where(
            and(eq(dataSubjectRequests.id, row.complaint.requestId), eq(dataSubjectRequests.organisationId, organisationId)),
          )
      : [];
    return {
      complaint: row.complaint,
      entityName: row.entityName,
      ownerEmail: row.ownerEmail,
      events,
      clock: clockOf(row.complaint, events, targets),
      request: request ?? null,
    };
  });
}

export async function complaintRegister(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({ complaint: dataProtectionComplaints, entityName: entities.name, ownerEmail: users.email })
      .from(dataProtectionComplaints)
      .innerJoin(entities, eq(entities.id, dataProtectionComplaints.entityId))
      .leftJoin(users, eq(users.id, dataProtectionComplaints.ownerId))
      .where(
        entityIds === null
          ? eq(dataProtectionComplaints.organisationId, organisationId)
          : and(
              eq(dataProtectionComplaints.organisationId, organisationId),
              inArray(dataProtectionComplaints.entityId, entityIds),
            ),
      )
      .orderBy(desc(dataProtectionComplaints.receivedAt));

    const [events, targets] = await Promise.all([
      eventsFor(rows.map((r) => r.complaint.id)),
      complaintTargets(organisationId),
    ]);
    const byComplaint = groupEvents(events);
    const now = new Date();
    const loaded: LoadedComplaint[] = rows.map((r) => {
      const ev = byComplaint.get(r.complaint.id) ?? [];
      return { ...r, events: ev, clock: clockOf(r.complaint, ev, targets, now) };
    });
    const open = loaded.filter((c) => !c.complaint.closedAt && c.complaint.status !== "withdrawn");

    return {
      total: loaded.length,
      open: open.length,
      toAcknowledge: open.filter((c) => c.clock.acknowledgement.state === "running" || c.clock.acknowledgement.state === "due_soon").length,
      acknowledgementOverdue: open.filter((c) => c.clock.acknowledgement.state === "overdue").length,
      outcomeOverdue: open.filter((c) => c.clock.outcome.state === "overdue").length,
      updateOverdue: open.filter((c) => c.clock.update.state === "overdue").length,
      rows: loaded,
    };
  });
}

/** The complaints about one request, for the request's own page. */
export async function complaintsAboutRequest(requestId: string, organisationId: string) {
  return withOrganisation(organisationId, async () =>
    db
      .select({
        id: dataProtectionComplaints.id,
        reference: dataProtectionComplaints.reference,
        status: dataProtectionComplaints.status,
        receivedAt: dataProtectionComplaints.receivedAt,
      })
      .from(dataProtectionComplaints)
      .where(
        and(
          eq(dataProtectionComplaints.requestId, requestId),
          eq(dataProtectionComplaints.organisationId, organisationId),
        ),
      )
      .orderBy(asc(dataProtectionComplaints.receivedAt)),
  );
}
