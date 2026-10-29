import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  dataSubjectRequestDecisions,
  dataSubjectRequests,
  entities,
  organisations,
  referenceCounters,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  RIGHT_KEYS,
  clockStartsAt,
  extensionNoticeDeadline,
  objectionTest,
  requestClock,
  type Jurisdiction,
  type Pause,
  type ProcessingBasis,
  type Right,
} from "@/lib/dsr/statutory";
import type { Actor } from "./templates";
import { assertEntityIn, assertMemberOf } from "./tenancy-guards";

/**
 * The register of requests from data subjects, and the decisions taken about each.
 *
 * Modelled on the breach register. Nothing in this file decides anything: it
 * works out when a response is due and refuses what the Regulation does not
 * allow — overriding an objection to direct marketing, extending after the
 * month has run out, refusing without saying the person may complain. A named
 * person records each judgement and why.
 */

export type DataSubjectRequest = typeof dataSubjectRequests.$inferSelect;
export type RequestDecision = typeof dataSubjectRequestDecisions.$inferSelect;
type LoadedDecision = RequestDecision & { decidedByEmail: string | null };

export type ControllerRole = "controller" | "joint_controller" | "processor";

/** Every channel counts. A request need not use a form, a magic phrase or the right inbox. */
export const CHANNELS = [
  "email",
  "web_form",
  "post",
  "phone",
  "in_person",
  "social_media",
  "via_representative",
  "via_processor",
] as const;

export class RequestRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestRefused";
  }
}

/**
 * The pauses for clarification, read off the decisions.
 *
 * Each request for clarification opens one; the next clarification received
 * closes it. Read in the order they took effect, not the order they were
 * typed in, so a pause recorded the day after it began still counts from when
 * it began.
 */
export function pausesFrom(decisions: readonly RequestDecision[]): Pause[] {
  const pauses: Pause[] = [];
  const ordered = [...decisions].sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
  for (const d of ordered) {
    const open = pauses.at(-1);
    if (d.kind === "clarification_requested" && (!open || open.to !== null)) {
      pauses.push({ from: d.effectiveAt, to: null });
    } else if (d.kind === "clarification_received" && open && open.to === null) {
      open.to = d.effectiveAt;
    }
  }
  return pauses;
}

function isExtended(decisions: readonly RequestDecision[]) {
  return decisions.some((d) => d.kind === "extension" && d.outcome !== "refused" && d.outcome !== "not_applicable");
}

function clockOf(request: DataSubjectRequest, decisions: readonly RequestDecision[], now = new Date()) {
  return requestClock({
    jurisdiction: request.jurisdiction,
    receivedAt: request.receivedAt,
    identityRequestedAt: request.identityRequestedAt,
    identityVerifiedAt: request.identityVerifiedAt,
    pauses: pausesFrom(decisions),
    extended: isExtended(decisions),
    respondedAt: request.respondedAt,
    closedWithoutResponse: request.closedAt !== null,
    now,
  });
}

export type LoadedRequest = {
  request: DataSubjectRequest;
  entityName: string;
  ownerEmail: string | null;
  decisions: LoadedDecision[];
  extended: boolean;
  clock: ReturnType<typeof requestClock>;
};

function assemble(
  request: DataSubjectRequest,
  entityName: string,
  ownerEmail: string | null,
  decisions: LoadedDecision[],
  now = new Date(),
): LoadedRequest {
  return {
    request,
    entityName,
    ownerEmail,
    decisions,
    extended: isExtended(decisions),
    clock: clockOf(request, decisions, now),
  };
}

async function nextReference(organisationId: string, year: number) {
  const rows = await db.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'DSR', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `DSR-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

function validRights(rights: readonly string[]): Right[] {
  const known = rights.filter((r): r is Right => (RIGHT_KEYS as string[]).includes(r));
  if (known.length === 0) {
    throw new RequestRefused("Say which right is being exercised. If it is unclear, choose the closest and record the doubt in the description.");
  }
  return [...new Set(known)];
}

/** The law new requests are handled under, unless a request says otherwise. */
export async function defaultJurisdiction(organisationId: string): Promise<Jurisdiction> {
  return withOrganisation(organisationId, async () => {
    const [org] = await db
      .select({ jurisdiction: organisations.dataProtectionJurisdiction })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    return org?.jurisdiction ?? "uk";
  });
}

/**
 * Change the law new requests are handled under.
 *
 * Requests already received keep their own: each copies the jurisdiction when
 * it is recorded, so this can never move a deadline somebody is working to.
 */
export async function setDefaultJurisdiction(input: {
  organisationId: string;
  jurisdiction: Jurisdiction;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select({ jurisdiction: organisations.dataProtectionJurisdiction })
        .from(organisations)
        .where(eq(organisations.id, input.organisationId));
      if (!before) throw new Error("No such organisation");
      if (before.jurisdiction === input.jurisdiction) return;

      await tx
        .update(organisations)
        .set({ dataProtectionJurisdiction: input.jurisdiction })
        .where(eq(organisations.id, input.organisationId));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "organisation.dsr_jurisdiction_set",
        subjectType: "organisation",
        subjectId: input.organisationId,
        before: { jurisdiction: before.jurisdiction },
        after: { jurisdiction: input.jurisdiction },
      });
    });
  });
}

export async function recordRequest(input: {
  organisationId: string;
  entityId: string;
  rights: string[];
  channel: string;
  /** When it arrived. Starts the month unless identity is genuinely in doubt. */
  receivedAt: Date;
  description: string;
  requesterName: string;
  requesterContact?: string | null;
  representative?: string | null;
  controllerRole?: ControllerRole;
  /** Defaults to the organisation's. */
  jurisdiction?: Jurisdiction;
  subjectCategories?: string[];
  ownerId?: string | null;
  actor: Actor;
}) {
  const rights = validRights(input.rights);
  if (!input.requesterName.trim()) throw new RequestRefused("Record who is asking. A request with no requester cannot be answered.");
  if (!input.description.trim()) throw new RequestRefused("Record what was asked, in their terms.");
  if (input.receivedAt.getTime() > Date.now() + 60_000) {
    throw new RequestRefused("A request cannot arrive in the future. Record when it actually arrived.");
  }

  return withOrganisation(input.organisationId, async () => {
    await assertEntityIn(input.organisationId, input.entityId);
    if (input.ownerId) await assertMemberOf(input.organisationId, input.ownerId);
    const jurisdiction = input.jurisdiction ?? (await defaultJurisdiction(input.organisationId));
    const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dataSubjectRequests)
        .values({
          organisationId: input.organisationId,
          entityId: input.entityId,
          reference,
          jurisdiction,
          controllerRole: input.controllerRole ?? "controller",
          rights,
          channel: input.channel,
          receivedAt: input.receivedAt,
          description: input.description.trim(),
          requesterName: input.requesterName.trim(),
          requesterContact: input.requesterContact?.trim() || null,
          representative: input.representative?.trim() || null,
          subjectCategories: input.subjectCategories ?? [],
          ownerId: input.ownerId ?? null,
          status: "in_progress",
        })
        .returning();

      // The requester's name and contact stay out of the audit chain. The chain
      // is kept longer than the request, and is exported; the reference is
      // enough to find the record while it exists.
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: input.entityId,
        action: "dsr.recorded",
        subjectType: "data_subject_request",
        subjectId: row.id,
        after: {
          reference,
          rights,
          channel: input.channel,
          receivedAt: input.receivedAt.toISOString(),
          jurisdiction,
          role: row.controllerRole,
        },
      });
      return row;
    });
  });
}

async function lockedRequest(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  requestId: string,
  organisationId: string,
) {
  const [request] = await tx
    .select()
    .from(dataSubjectRequests)
    .where(and(eq(dataSubjectRequests.id, requestId), eq(dataSubjectRequests.organisationId, organisationId)))
    .for("update");
  if (!request) throw new Error("No such request");
  return request;
}

export async function updateRequest(input: {
  requestId: string;
  organisationId: string;
  changes: Partial<{
    rights: string[];
    channel: string;
    description: string;
    requesterName: string;
    requesterContact: string | null;
    representative: string | null;
    representativeAuthorityChecked: boolean | null;
    controllerRole: string;
    subjectCategories: string[];
    ownerId: string | null;
  }>;
  actor: Actor;
}) {
  const changes = { ...input.changes };
  if (changes.rights !== undefined) changes.rights = validRights(changes.rights);
  if (changes.requesterName !== undefined && !changes.requesterName.trim()) {
    throw new RequestRefused("Record who is asking. A request with no requester cannot be answered.");
  }
  if (changes.description !== undefined && !changes.description.trim()) {
    throw new RequestRefused("Record what was asked, in their terms.");
  }

  return withOrganisation(input.organisationId, async () => {
    if (changes.ownerId) await assertMemberOf(input.organisationId, changes.ownerId);
    return db.transaction(async (tx) => {
      const before = await lockedRequest(tx, input.requestId, input.organisationId);
      const [after] = await tx
        .update(dataSubjectRequests)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(dataSubjectRequests.id, input.requestId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: before.entityId,
        action: "dsr.updated",
        subjectType: "data_subject_request",
        subjectId: input.requestId,
        before: { changed: Object.keys(changes) },
        after: { reference: after.reference, ...(changes.rights ? { rights: changes.rights } : {}) },
      });
      return after;
    });
  });
}

/**
 * Ask for proof of identity, or record that it arrived.
 *
 * Article 12(6) allows asking only where there is reasonable doubt, and the
 * month waits for the answer. So asking is recorded with when it was asked,
 * and the clock starts again from when the proof came — never from a copy of
 * the proof, which is not kept.
 */
export async function recordIdentity(input: {
  requestId: string;
  organisationId: string;
  step: "requested" | "verified";
  /** When it happened. Defaults to now. */
  at?: Date;
  /** How identity was checked. Required once verified. */
  method?: string | null;
  actor: Actor;
}) {
  const at = input.at ?? new Date();
  const method = input.method?.trim() || null;
  if (input.step === "verified" && !method) {
    throw new RequestRefused("Say how identity was checked — not the document itself, which should not be kept.");
  }

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const request = await lockedRequest(tx, input.requestId, input.organisationId);
      if (request.respondedAt || request.closedAt) throw new RequestRefused("This request has already been answered or closed.");
      if (input.step === "verified" && !request.identityRequestedAt) {
        // Nothing was asked for, so the clock has been running from receipt.
        // Recording a verification now would restart it, which is not what happened.
        await tx
          .update(dataSubjectRequests)
          .set({ identityMethod: method, updatedAt: new Date() })
          .where(eq(dataSubjectRequests.id, input.requestId));
      } else {
        if (at < request.receivedAt) throw new RequestRefused("That is before the request arrived.");
        await tx
          .update(dataSubjectRequests)
          .set(
            input.step === "requested"
              ? { identityRequestedAt: at, identityVerifiedAt: null, status: "verifying", updatedAt: new Date() }
              : { identityVerifiedAt: at, identityMethod: method, status: "in_progress", updatedAt: new Date() },
          )
          .where(eq(dataSubjectRequests.id, input.requestId));
      }

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: input.step === "requested" ? "dsr.identity_requested" : "dsr.identity_verified",
        subjectType: "data_subject_request",
        subjectId: input.requestId,
        after: { reference: request.reference, at: at.toISOString(), method },
      });
    });
  });
}

/**
 * Record a decision about a request, with its reasoning.
 *
 * Appended, never updated. Refuses what the Regulation does not allow, rather
 * than recording it and hoping somebody notices:
 *
 *  - an objection to direct marketing overridden (Article 21(3) is absolute);
 *  - an objection overridden where Article 21 does not apply at all;
 *  - an extension after the first month has run out (Article 12(3)).
 */
export async function recordRequestDecision(input: {
  organisationId: string;
  requestId: string;
  kind: RequestDecision["kind"];
  outcome?: RequestDecision["outcome"];
  right?: string | null;
  statutoryBasis?: string | null;
  processingBasis?: ProcessingBasis | null;
  rationale: string;
  /** When it took effect. Defaults to now; a pause counts from here. */
  effectiveAt?: Date;
  actor: Actor;
}) {
  const rationale = input.rationale.trim();
  if (!rationale) throw new RequestRefused("Record why. A decision without its reasoning cannot be defended later.");
  const outcome = input.outcome ?? "done";
  const effectiveAt = input.effectiveAt ?? new Date();

  if (input.kind === "objection") {
    if (!input.processingBasis) {
      throw new RequestRefused("Say what the processing objected to relies on. Article 21 turns on it.");
    }
    const test = objectionTest(input.processingBasis);
    if (outcome === "refused" && !test.overridable) {
      throw new RequestRefused(
        test.applies
          ? "An objection to direct marketing cannot be overridden. Article 21(3) is absolute: stop the processing."
          : "Article 21 does not apply to processing on this basis, so there is nothing to override. Record it as not applicable and handle the right that does apply.",
      );
    }
  }

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const request = await lockedRequest(tx, input.requestId, input.organisationId);
      if (request.closedAt) throw new RequestRefused("This request is closed.");
      if (effectiveAt < request.receivedAt) throw new RequestRefused("That is before the request arrived.");

      const earlier = await tx
        .select()
        .from(dataSubjectRequestDecisions)
        .where(eq(dataSubjectRequestDecisions.requestId, input.requestId));

      if (input.kind === "extension" && outcome !== "not_applicable" && outcome !== "refused") {
        if (isExtended(earlier)) throw new RequestRefused("The time has already been extended. Article 12(3) allows one extension of up to two months.");
        const startsAt = clockStartsAt(request);
        if (!startsAt) throw new RequestRefused("The month has not started yet: identity is still awaited.");
        const deadline = extensionNoticeDeadline({
          startsAt,
          jurisdiction: request.jurisdiction,
          pauses: pausesFrom(earlier),
          now: effectiveAt,
        });
        if (effectiveAt > deadline) {
          throw new RequestRefused("Too late to extend. Article 12(3) requires the person to be told within the first month, with the reasons for the delay.");
        }
      }
      const open = pausesFrom(earlier).some((p) => p.to === null);
      if (input.kind === "clarification_requested" && open) {
        throw new RequestRefused("Clarification has already been asked for and not yet received.");
      }
      if (input.kind === "clarification_received" && !open) {
        throw new RequestRefused("No clarification is outstanding.");
      }

      const [row] = await tx
        .insert(dataSubjectRequestDecisions)
        .values({
          organisationId: input.organisationId,
          requestId: input.requestId,
          kind: input.kind,
          outcome,
          right: input.right ?? null,
          statutoryBasis: input.statutoryBasis ?? null,
          processingBasis: input.processingBasis ?? null,
          rationale,
          effectiveAt,
          decidedBy: input.actor.actorUserId ?? null,
          decidedByLabel: input.actor.actorLabel,
        })
        .returning();

      // The clock decisions move the status with them; the rest leave it alone.
      const status =
        input.kind === "clarification_requested"
          ? ("paused" as const)
          : input.kind === "clarification_received"
            ? ("in_progress" as const)
            : null;
      if (status) {
        await tx
          .update(dataSubjectRequests)
          .set({ status, updatedAt: new Date() })
          .where(eq(dataSubjectRequests.id, input.requestId));
      }

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: "dsr.decision_recorded",
        subjectType: "data_subject_request",
        subjectId: input.requestId,
        after: {
          decision: row.id,
          kind: input.kind,
          outcome,
          right: input.right ?? null,
          basis: input.statutoryBasis ?? null,
          processingBasis: input.processingBasis ?? null,
          effectiveAt: effectiveAt.toISOString(),
          rationale,
        },
      });
      return row;
    });
  });
}

/**
 * Record the response.
 *
 * What was sent, when and how — the letter itself is written in whatever tool
 * the organisation uses, and may be linked. A response that does not do all
 * that was asked must have told the person they can complain (Article 12(4)),
 * and a late one must say why it was late.
 */
export async function respondToRequest(input: {
  requestId: string;
  organisationId: string;
  outcome: "complied" | "partly" | "refused";
  respondedAt?: Date;
  channel: string;
  summary: string;
  link?: string | null;
  toldOfComplaintRight?: boolean;
  lateReason?: string | null;
  actor: Actor;
}) {
  const respondedAt = input.respondedAt ?? new Date();
  const summary = input.summary.trim();
  if (!summary) throw new RequestRefused("Say what was sent, in a sentence or two.");
  if (input.outcome !== "complied" && !input.toldOfComplaintRight) {
    throw new RequestRefused(
      "A response that does not do everything asked must tell the person why, and that they may complain to the supervisory authority and seek a judicial remedy (Article 12(4)).",
    );
  }
  const link = input.link?.trim() || null;
  if (link && !/^https?:\/\//.test(link)) throw new RequestRefused("A link to the response should start with https://.");

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const request = await lockedRequest(tx, input.requestId, input.organisationId);
      if (request.respondedAt) throw new RequestRefused("A response has already been recorded.");
      if (request.closedAt) throw new RequestRefused("This request is closed.");
      if (respondedAt < request.receivedAt) throw new RequestRefused("That is before the request arrived.");

      const decisions = await tx
        .select()
        .from(dataSubjectRequestDecisions)
        .where(eq(dataSubjectRequestDecisions.requestId, input.requestId));
      const clock = clockOf({ ...request, respondedAt }, decisions, respondedAt);
      const late = clock.state === "late";
      const lateReason = input.lateReason?.trim() || null;
      if (late && !lateReason) {
        throw new RequestRefused("This response is after the deadline. Record why it was late.");
      }

      const [after] = await tx
        .update(dataSubjectRequests)
        .set({
          respondedAt,
          responseChannel: input.channel,
          responseSummary: summary,
          responseLink: link,
          toldOfComplaintRight: input.toldOfComplaintRight ?? null,
          lateReason,
          status: input.outcome === "refused" ? "refused" : "responded",
          updatedAt: new Date(),
        })
        .where(eq(dataSubjectRequests.id, input.requestId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: "dsr.responded",
        subjectType: "data_subject_request",
        subjectId: input.requestId,
        after: {
          reference: request.reference,
          outcome: input.outcome,
          respondedAt: respondedAt.toISOString(),
          channel: input.channel,
          late,
          lateReason,
          toldOfComplaintRight: input.toldOfComplaintRight ?? null,
        },
      });
      return after;
    });
  });
}

/**
 * Close a request: after the response, or without one where none is owed —
 * withdrawn, or identity never confirmed after it was reasonably asked for.
 */
export async function closeRequest(input: {
  requestId: string;
  organisationId: string;
  rationale: string;
  withdrawn?: boolean;
  actor: Actor;
}) {
  const rationale = input.rationale.trim();
  if (!rationale) throw new RequestRefused("Say why it is being closed.");

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const request = await lockedRequest(tx, input.requestId, input.organisationId);
      if (request.closedAt) throw new RequestRefused("This request is already closed.");
      const identityNeverConfirmed = request.identityRequestedAt !== null && request.identityVerifiedAt === null;
      if (!request.respondedAt && !input.withdrawn && !identityNeverConfirmed) {
        // A request that started its clock is owed a response, and closing it
        // quietly would turn an overdue answer into no answer at all.
        throw new RequestRefused(
          "This request has not been answered. Record the response first, or close it as withdrawn if the person withdrew it.",
        );
      }

      const status = input.withdrawn ? ("withdrawn" as const) : ("closed" as const);
      const [after] = await tx
        .update(dataSubjectRequests)
        .set({ status, closedAt: new Date(), closureRationale: rationale, updatedAt: new Date() })
        .where(eq(dataSubjectRequests.id, input.requestId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: input.withdrawn ? "dsr.withdrawn" : "dsr.closed",
        subjectType: "data_subject_request",
        subjectId: input.requestId,
        after: { reference: request.reference, rationale, answered: request.respondedAt !== null },
      });
      return after;
    });
  });
}

async function decisionsFor(requestIds: string[]) {
  if (requestIds.length === 0) return [];
  return db
    .select({ decision: dataSubjectRequestDecisions, decidedByEmail: users.email })
    .from(dataSubjectRequestDecisions)
    .leftJoin(users, eq(users.id, dataSubjectRequestDecisions.decidedBy))
    .where(inArray(dataSubjectRequestDecisions.requestId, requestIds))
    .orderBy(asc(dataSubjectRequestDecisions.effectiveAt), asc(dataSubjectRequestDecisions.decidedAt));
}

function groupDecisions(rows: Awaited<ReturnType<typeof decisionsFor>>) {
  const byRequest = new Map<string, LoadedDecision[]>();
  for (const { decision, decidedByEmail } of rows) {
    const list = byRequest.get(decision.requestId) ?? [];
    list.push({ ...decision, decidedByEmail });
    byRequest.set(decision.requestId, list);
  }
  return byRequest;
}

export async function loadRequest(requestId: string, organisationId: string): Promise<LoadedRequest | null> {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({ request: dataSubjectRequests, entityName: entities.name, ownerEmail: users.email })
      .from(dataSubjectRequests)
      .innerJoin(entities, eq(entities.id, dataSubjectRequests.entityId))
      .leftJoin(users, eq(users.id, dataSubjectRequests.ownerId))
      .where(and(eq(dataSubjectRequests.id, requestId), eq(dataSubjectRequests.organisationId, organisationId)));
    if (!row) return null;
    const decisions = groupDecisions(await decisionsFor([requestId])).get(requestId) ?? [];
    return assemble(row.request, row.entityName, row.ownerEmail, decisions);
  });
}

export async function requestRegister(organisationId: string, entityIds: string[] | null) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({ request: dataSubjectRequests, entityName: entities.name, ownerEmail: users.email })
      .from(dataSubjectRequests)
      .innerJoin(entities, eq(entities.id, dataSubjectRequests.entityId))
      .leftJoin(users, eq(users.id, dataSubjectRequests.ownerId))
      .where(
        entityIds === null
          ? eq(dataSubjectRequests.organisationId, organisationId)
          : and(eq(dataSubjectRequests.organisationId, organisationId), inArray(dataSubjectRequests.entityId, entityIds)),
      )
      .orderBy(desc(dataSubjectRequests.receivedAt));

    const byRequest = groupDecisions(await decisionsFor(rows.map((r) => r.request.id)));
    const now = new Date();
    const loaded = rows.map((r) =>
      assemble(r.request, r.entityName, r.ownerEmail, byRequest.get(r.request.id) ?? [], now),
    );
    const open = loaded.filter((r) => !r.request.respondedAt && !r.request.closedAt);
    const answered = loaded.filter((r) => r.clock.state === "met" || r.clock.state === "late");

    return {
      total: loaded.length,
      open: open.length,
      // The numbers that matter at a glance: a month running out, or gone.
      dueSoon: open.filter((r) => r.clock.state === "due_soon").length,
      overdue: open.filter((r) => r.clock.state === "overdue").length,
      answeredOnTime: answered.filter((r) => r.clock.state === "met").length,
      answeredLate: answered.filter((r) => r.clock.state === "late").length,
      rows: loaded,
    };
  });
}

/** Open requests whose month is running out or already past. Used by the sweep. */
export async function requestsNeedingAttention(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const open = await db
      .select()
      .from(dataSubjectRequests)
      .where(
        and(
          eq(dataSubjectRequests.organisationId, organisationId),
          isNull(dataSubjectRequests.respondedAt),
          isNull(dataSubjectRequests.closedAt),
        ),
      );
    if (open.length === 0) return [];

    const byRequest = groupDecisions(await decisionsFor(open.map((r) => r.id)));
    const now = new Date();
    return open
      .map((request) => {
        const decisions = byRequest.get(request.id) ?? [];
        return { request, extended: isExtended(decisions), clock: clockOf(request, decisions, now) };
      })
      .filter((r) => r.clock.state === "due_soon" || r.clock.state === "overdue");
  });
}
