import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import {
  dataSubjectRequestDecisions,
  dataSubjectRequestScope,
  dataSubjectRequests,
  entities,
  organisations,
  processingActivities,
  referenceCounters,
  suppliers,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import {
  OBJECTION_WINDOW_MONTHS,
  RIGHT_KEYS,
  RIGHTS,
  clarificationStopsClock,
  clockStartsAt,
  extensionNoticeDeadline,
  objectionTest,
  requestClock,
  type Jurisdiction,
  type Pause,
  type ProcessingBasis,
  type Right,
} from "@/lib/dsr/statutory";
import { requestTimeliness, type Timeliness } from "@/lib/dsr/metrics";
import { isRegime, type Regime } from "@/lib/dpa2018/part3";
import {
  PART3_RIGHTS,
  Part3RightsRefused,
  cleanPart3Restriction,
  restrictionProvision,
  type Part3Restriction,
} from "@/lib/dpa2018/part3-rights";
import { defaultRequestJurisdiction, jurisdictionAllowed } from "@/lib/dpa2018/applies";
import {
  ExemptionRefused,
  cleanExemption,
  cleanHealthOpinion,
  type ExemptionDetail,
  type HealthOpinion,
} from "@/lib/dpa2018/exemptions";
import { BadQuery } from "@/lib/integration/query";
import { canonicalise } from "./ingest";
import { monthsEnding } from "./trends";
import type { Actor } from "./templates";
import { assertEntityIn, assertMemberOf, assertRecordIn } from "./tenancy-guards";

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
export type ScopeEntry = typeof dataSubjectRequestScope.$inferSelect;
type LoadedDecision = RequestDecision & { decidedByEmail: string | null };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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

/** The rights after which recipients have to be told (Article 19). */
const NOTIFIABLE = ["rectification", "erasure", "restriction"] as const;

/**
 * Has anything been done that Article 19 requires recipients to hear about?
 *
 * Only a rectification, erasure or restriction actually carried out, in whole
 * or in part: a refusal changes nothing a recipient holds.
 */
export function recipientsMustBeTold(decisions: readonly RequestDecision[]): boolean {
  return decisions.some(
    (d) => (NOTIFIABLE as readonly string[]).includes(d.kind) && (d.outcome === "complied" || d.outcome === "partly"),
  );
}

/**
 * Recipients not yet told, once telling them is owed.
 *
 * One found not to hold this person's data has nothing to be told. Everyone
 * else is told, or the record says why that proved impossible or would take
 * disproportionate effort.
 */
export function recipientsStillToTell(scope: readonly ScopeEntry[], decisions: readonly RequestDecision[]): ScopeEntry[] {
  if (!recipientsMustBeTold(decisions)) return [];
  return scope.filter((e) => e.isRecipient && e.status !== "not_held" && e.recipientNotice === null);
}

/**
 * Activities where an objection was upheld but the processing has not been
 * recorded as stopped for this person.
 */
export function processingStillToStop(scope: readonly ScopeEntry[], decisions: readonly RequestDecision[]): ScopeEntry[] {
  const upheld = new Set(
    decisions.filter((d) => d.kind === "objection" && d.outcome === "complied" && d.processingActivityId).map((d) => d.processingActivityId!),
  );
  return scope.filter((e) => e.processingActivityId && upheld.has(e.processingActivityId) && e.status !== "actioned");
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

/** "Customers" and "customer" are the same people. */
function subjectKey(category: string): string {
  const k = category.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return k.length > 3 && k.endsWith("s") ? k.slice(0, -1) : k;
}

/**
 * Add to a request's scope everything the ROPA says might hold the requester's data.
 *
 * The activities in the request's entity whose data subjects include who the
 * requester is; the systems those activities run on; and the suppliers and
 * other recipients they disclose to. A recipient or system named the same as
 * a supplier on the register becomes that supplier, so it is listed once.
 * Entries already there are left alone, so this can run again whenever the
 * request's subject categories change.
 */
async function seedScope(tx: Tx, request: DataSubjectRequest): Promise<number> {
  const wanted = new Set(request.subjectCategories.map(subjectKey).filter(Boolean));
  if (wanted.size === 0) return 0;

  const activities = (
    await tx
      .select()
      .from(processingActivities)
      .where(
        and(
          eq(processingActivities.organisationId, request.organisationId),
          eq(processingActivities.entityId, request.entityId),
        ),
      )
      .orderBy(asc(processingActivities.reference))
  ).filter((a) => a.subjectCategories.some((c) => wanted.has(subjectKey(c))));
  if (activities.length === 0) return 0;

  const supplierRows = await tx
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(eq(suppliers.organisationId, request.organisationId));
  const supplierByName = new Map(supplierRows.map((r) => [canonicalise(r.name), r]));

  type Entry = typeof dataSubjectRequestScope.$inferInsert;
  const entries = new Map<string, Entry>();
  const add = (e: Omit<Entry, "organisationId" | "requestId">) => {
    if (!entries.has(e.key)) entries.set(e.key, { ...e, organisationId: request.organisationId, requestId: request.id });
  };

  for (const a of activities) {
    const who = a.subjectCategories.filter((c) => wanted.has(subjectKey(c))).join(", ");
    add({
      kind: "activity",
      key: `activity:${a.id}`,
      processingActivityId: a.id,
      label: `${a.reference} ${a.name}`,
      reason: `Processes data about ${who}`,
    });
    for (const [names, role] of [[a.systems, "system"], [a.recipients, "recipient"]] as const) {
      for (const name of names) {
        const key = canonicalise(name);
        if (!key) continue;
        const supplier = supplierByName.get(key);
        if (supplier) {
          add({
            kind: "supplier",
            key: `supplier:${supplier.id}`,
            supplierId: supplier.id,
            label: supplier.name,
            reason: `A ${role} of ${a.reference}`,
            isRecipient: true,
          });
        } else {
          add({
            kind: role,
            key: `${role}:${key}`,
            label: name.trim(),
            reason: `A ${role} of ${a.reference}`,
            isRecipient: role === "recipient",
          });
        }
      }
    }
  }

  const inserted = await tx
    .insert(dataSubjectRequestScope)
    .values([...entries.values()])
    .onConflictDoNothing()
    .returning({ id: dataSubjectRequestScope.id });
  return inserted.length;
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

/**
 * The regime a request is handled under, refused where it is not available:
 * Part 3 only on a UK request to a competent authority's entity, and only
 * for the rights Part 3 gives.
 */
async function checkedRegime(
  executor: Pick<typeof db, "select">,
  input: { entityId: string; regime: string | undefined; jurisdiction: Jurisdiction; rights: readonly Right[] },
): Promise<Regime> {
  const [entity] = await executor
    .select({ competentAuthority: entities.competentAuthority, defaultRegime: entities.defaultRegime })
    .from(entities)
    .where(eq(entities.id, input.entityId));
  // A default never refuses a request: one asking for a right Part 3 does not
  // give (an objection through the public form, say) starts under the UK GDPR.
  const regime =
    input.regime ??
    (entity?.competentAuthority && input.jurisdiction === "uk" && input.rights.every((r) => PART3_RIGHTS.includes(r))
      ? entity.defaultRegime
      : "uk_gdpr");
  if (!isRegime(regime)) throw new RequestRefused("Choose the regime.");
  if (regime === "dpa_part3") {
    if (!entity?.competentAuthority) {
      throw new RequestRefused("Part 3 is for a competent authority. Mark the entity as one on the Organisation page first.");
    }
    if (input.jurisdiction !== "uk") throw new RequestRefused("Part 3 of the Data Protection Act 2018 is UK law. Record the request under UK law.");
    const outside = input.rights.filter((r) => !PART3_RIGHTS.includes(r));
    if (outside.length > 0) {
      throw new RequestRefused(
        `Part 3 gives no right of ${outside.map((r) => RIGHTS[r].label.toLowerCase()).join(" or ")}. Its rights are access, rectification, erasure or restriction, and the automated decision safeguards.`,
      );
    }
  }
  return regime;
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
  /** The published web form it came through, if it did. */
  intakeLinkId?: string | null;
  /** Defaults from the entity: Part 3 where it is a competent authority whose new records start there. */
  regime?: Regime;
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
    const [entity] = await db
      .select({ name: entities.name, law: entities.dataProtectionLaw })
      .from(entities)
      .where(eq(entities.id, input.entityId));
    const jurisdiction = input.jurisdiction ?? defaultRequestJurisdiction(entity.law, await defaultJurisdiction(input.organisationId));
    if (!jurisdictionAllowed(entity.law, jurisdiction)) {
      throw new RequestRefused(
        `${entity.name} is recorded as subject to ${entity.law === "eu" ? "EU" : "UK"} law only, so a request to it cannot be handled under ${jurisdiction === "uk" ? "UK" : "EU"} law. Change the entity's law on the Organisation page if it is wrong.`,
      );
    }
    const regime = await checkedRegime(db, { entityId: input.entityId, regime: input.regime, jurisdiction, rights });
    const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());

    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dataSubjectRequests)
        .values({
          organisationId: input.organisationId,
          entityId: input.entityId,
          reference,
          jurisdiction,
          regime,
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
          intakeLinkId: input.intakeLinkId ?? null,
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

      const seeded = await seedScope(tx, row);
      if (seeded > 0) {
        await appendAuditEvent(tx, {
          ...input.actor,
          organisationId: input.organisationId,
          entityId: input.entityId,
          action: "dsr.scope_seeded",
          subjectType: "data_subject_request",
          subjectId: row.id,
          after: { reference, added: seeded },
        });
      }
      return row;
    });
  });
}

async function lockedRequest(
  tx: Tx,
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
    regime: string;
  }>;
  actor: Actor;
}) {
  const { regime: regimeChange, ...rest } = input.changes;
  const changes: typeof rest & { regime?: Regime } = { ...rest };
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
      // The rights and the regime are checked together, whichever changed.
      if (regimeChange !== undefined || (changes.rights !== undefined && before.regime === "dpa_part3")) {
        changes.regime = await checkedRegime(tx, {
          entityId: before.entityId,
          regime: regimeChange ?? before.regime,
          jurisdiction: before.jurisdiction,
          rights: (changes.rights ?? before.rights) as Right[],
        });
      }
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
        after: {
          reference: after.reference,
          ...(changes.rights ? { rights: changes.rights } : {}),
          ...(changes.regime && changes.regime !== before.regime ? { regime: changes.regime } : {}),
        },
      });

      // Who the requester is decides where to look, so a change looks again.
      if (changes.subjectCategories !== undefined && !after.respondedAt && !after.closedAt) {
        const seeded = await seedScope(tx, after);
        if (seeded > 0) {
          await appendAuditEvent(tx, {
            ...input.actor,
            organisationId: input.organisationId,
            entityId: before.entityId,
            action: "dsr.scope_seeded",
            subjectType: "data_subject_request",
            subjectId: input.requestId,
            after: { reference: after.reference, added: seeded },
          });
        }
      }
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
  /** For an objection: the processing activity it is about. */
  processingActivityId?: string | null;
  /** For an exemption: the Schedule 2 or 3 paragraph, from `lib/dpa2018/exemptions.ts`. */
  exemption?: string | null;
  /** What that paragraph asks to be recorded; for a `health_opinion`, the opinion; for a `part3_restriction`, the restriction. */
  detail?: ExemptionDetail | Partial<Record<keyof HealthOpinion, unknown>> | Partial<Record<keyof Part3Restriction, unknown>>;
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

  const processingActivityId = input.processingActivityId || null;
  if (processingActivityId && input.kind !== "objection") {
    throw new RequestRefused("Only an objection is recorded against a processing activity.");
  }
  if (input.exemption && input.kind !== "exemption") {
    throw new RequestRefused("Only an exemption names a Schedule 2 or 3 paragraph.");
  }
  const restriction =
    input.kind === "part3_restriction"
      ? (() => {
          try {
            return cleanPart3Restriction((input.detail ?? {}) as Record<string, unknown>);
          } catch (error) {
            if (error instanceof Part3RightsRefused) throw new RequestRefused(error.message);
            throw error;
          }
        })()
      : null;
  // The paragraphs' own rules, worded for the person deciding.
  const checked = <T,>(work: () => T): T => {
    try {
      return work();
    } catch (error) {
      if (error instanceof ExemptionRefused) throw new RequestRefused(error.message);
      throw error;
    }
  };
  const opinion =
    input.kind === "health_opinion" ? checked(() => cleanHealthOpinion((input.detail ?? {}) as Record<string, unknown>, new Date())) : null;

  return withOrganisation(input.organisationId, async () => {
    if (processingActivityId) await assertRecordIn(input.organisationId, "processing_activity", processingActivityId);
    return db.transaction(async (tx) => {
      const request = await lockedRequest(tx, input.requestId, input.organisationId);
      if (request.closedAt) throw new RequestRefused("This request is closed.");
      if (effectiveAt < request.receivedAt) throw new RequestRefused("That is before the request arrived.");

      const earlier = await tx
        .select()
        .from(dataSubjectRequestDecisions)
        .where(eq(dataSubjectRequestDecisions.requestId, input.requestId));

      // Each regime has its own way of withholding: Schedules 2 and 3 for the
      // UK GDPR, the restrictions in ss.44(4), 45(4), 45A and 48(3) for Part 3.
      if (request.regime === "dpa_part3") {
        if (input.kind === "exemption") {
          throw new RequestRefused("Schedules 2 and 3 are UK GDPR exemptions. Under Part 3, record a restriction under s.44(4), 45(4) or 48(3), or s.45A for privilege.");
        }
        if (input.kind === "objection" || input.kind === "portability") {
          throw new RequestRefused("Part 3 gives no right to object or to portability.");
        }
      } else if (input.kind === "part3_restriction") {
        throw new RequestRefused("A Part 3 restriction is for law enforcement processing. This request is under the UK GDPR: record a Schedule 2 or 3 exemption instead.");
      }
      // Schedules 2 and 3 are the Data Protection Act 2018's, so UK law only.
      if (request.jurisdiction !== "uk" && (input.kind === "exemption" || input.kind === "health_opinion")) {
        throw new RequestRefused(
          "Schedules 2 and 3 of the Data Protection Act 2018 are UK law, and this request is under EU law. Record the decision citing the Member State law relied on (EU GDPR Article 23).",
        );
      }

      const exemption =
        input.kind === "exemption"
          ? checked(() =>
              cleanExemption({
                exemption: input.exemption,
                right: input.right ?? null,
                requestRights: request.rights,
                detail: (input.detail ?? {}) as ExemptionDetail,
                opinions: new Map(
                  earlier.filter((d) => d.kind === "health_opinion").map((d) => [d.id, d.detail as HealthOpinion]),
                ),
                reliedOn: effectiveAt,
              }),
            )
          : null;

      if (input.kind === "extension" && outcome !== "not_applicable" && outcome !== "refused") {
        if (isExtended(earlier)) throw new RequestRefused("The time has already been extended. Article 12(3) allows one extension of up to two months.");
        const startsAt = clockStartsAt(request);
        if (!startsAt) throw new RequestRefused("The month has not started yet: identity is still awaited.");
        const deadline = extensionNoticeDeadline({
          startsAt,
          jurisdiction: request.jurisdiction,
          pauses: clarificationStopsClock(request.jurisdiction, request.receivedAt) ? pausesFrom(earlier) : [],
          now: effectiveAt,
        });
        if (effectiveAt > deadline) {
          throw new RequestRefused("Too late to extend. Article 12(3) requires the person to be told within the first month, with the reasons for the delay.");
        }
      }
      // Article 18(1)(d): asked for restriction while an objection is weighed,
      // the person is entitled to it. Refusing it is open only once the
      // objection has been decided.
      if (
        input.kind === "restriction" &&
        outcome === "refused" &&
        request.rights.includes("objection") &&
        request.rights.includes("restriction") &&
        !earlier.some((d) => d.kind === "objection")
      ) {
        throw new RequestRefused(
          "They objected and asked for restriction meanwhile. Article 18(1)(d) entitles them to it until the objection is decided: restrict now, and decide the objection.",
        );
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
          statutoryBasis:
            exemption?.statutoryBasis ??
            (opinion ? "DPA 2018 Sch. 3 paras 2, 5–6" : restriction ? restrictionProvision(restriction) : input.statutoryBasis ?? null),
          processingBasis: input.processingBasis ?? null,
          processingActivityId,
          exemption: exemption?.exemption ?? null,
          detail: exemption?.detail ?? opinion ?? restriction ?? {},
          rationale,
          effectiveAt,
          decidedBy: input.actor.actorUserId ?? null,
          decidedByLabel: input.actor.actorLabel,
        })
        .returning();

      // The clock decisions move the status with them; the rest leave it alone.
      // Asking an EU requester to clarify is allowed, but stops nothing.
      const stops = clarificationStopsClock(request.jurisdiction, request.receivedAt);
      const status = !stops
        ? null
        : input.kind === "clarification_requested"
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
          basis: row.statutoryBasis,
          processingBasis: input.processingBasis ?? null,
          processingActivity: processingActivityId,
          ...(row.exemption || opinion || restriction ? { exemption: row.exemption, detail: row.detail } : {}),
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
      // A processor's part ends when it has passed the request on and helped.
      const passedOn = request.controllerRole === "processor" && request.passedToControllerAt !== null;
      if (!request.respondedAt && !input.withdrawn && !identityNeverConfirmed && !passedOn) {
        // A request that started its clock is owed a response, and closing it
        // quietly would turn an overdue answer into no answer at all.
        throw new RequestRefused(
          request.controllerRole === "processor"
            ? "Record that the request was passed to the controller first, or close it as withdrawn if the person withdrew it."
            : "This request has not been answered. Record the response first, or close it as withdrawn if the person withdrew it.",
        );
      }
      if (!input.withdrawn) {
        const [decisions, scope] = await Promise.all([
          tx.select().from(dataSubjectRequestDecisions).where(eq(dataSubjectRequestDecisions.requestId, input.requestId)),
          tx.select().from(dataSubjectRequestScope).where(eq(dataSubjectRequestScope.requestId, input.requestId)),
        ]);
        const notStopped = processingStillToStop(scope, decisions);
        if (notStopped.length > 0) {
          throw new RequestRefused(
            `An upheld objection means the processing stops for this person. Record it as acted on in where to look: ${notStopped.map((e) => e.label).sort().join(", ")}.`,
          );
        }
        const untold = recipientsStillToTell(scope, decisions);
        if (untold.length > 0) {
          throw new RequestRefused(
            `Article 19: ${untold.map((e) => e.label).sort().join(", ")} ${untold.length === 1 ? "has" : "have"} not been told of the correction, erasure or restriction. Record that each was told, or why that proved impossible or disproportionate.`,
          );
        }
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

/** Look in the ROPA again, adding anything not already in scope. */
export async function seedRequestScope(input: { requestId: string; organisationId: string; actor: Actor }) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const request = await lockedRequest(tx, input.requestId, input.organisationId);
      if (request.closedAt) throw new RequestRefused("This request is closed.");
      if (request.subjectCategories.length === 0) {
        throw new RequestRefused("Say who the requester is to you — customer, employee, applicant — so the ROPA can say where to look.");
      }
      const added = await seedScope(tx, request);
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: "dsr.scope_seeded",
        subjectType: "data_subject_request",
        subjectId: input.requestId,
        after: { reference: request.reference, added },
      });
      return added;
    });
  });
}

/**
 * Add somewhere to look that the ROPA does not mention.
 *
 * A shared mailbox, a spreadsheet, a recipient missing from the register.
 * Worth fixing in the ROPA too, but the search cannot wait for that.
 */
export async function addScopeEntry(input: {
  requestId: string;
  organisationId: string;
  kind: "system" | "recipient" | "other";
  label: string;
  actor: Actor;
}) {
  const label = input.label.trim();
  if (!label) throw new RequestRefused("Name the place to look, or the recipient.");

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const request = await lockedRequest(tx, input.requestId, input.organisationId);
      if (request.closedAt) throw new RequestRefused("This request is closed.");
      const [row] = await tx
        .insert(dataSubjectRequestScope)
        .values({
          organisationId: input.organisationId,
          requestId: input.requestId,
          kind: input.kind,
          key: `${input.kind}:${canonicalise(label) || label.toLowerCase()}`,
          label,
          reason: "Added by hand",
          isRecipient: input.kind === "recipient",
        })
        .onConflictDoNothing()
        .returning();
      if (!row) throw new RequestRefused(`${label} is already in scope.`);

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: "dsr.scope_added",
        subjectType: "data_subject_request",
        subjectId: input.requestId,
        after: { reference: request.reference, entry: row.id, kind: input.kind, label },
      });
      return row;
    });
  });
}

async function lockedEntry(tx: Tx, scopeId: string, organisationId: string) {
  const [row] = await tx
    .select({ entry: dataSubjectRequestScope, request: dataSubjectRequests })
    .from(dataSubjectRequestScope)
    .innerJoin(dataSubjectRequests, eq(dataSubjectRequests.id, dataSubjectRequestScope.requestId))
    .where(and(eq(dataSubjectRequestScope.id, scopeId), eq(dataSubjectRequestScope.organisationId, organisationId)))
    .for("update");
  if (!row) throw new Error("No such scope entry");
  if (row.request.closedAt) throw new RequestRefused("This request is closed.");
  return row;
}

/**
 * Record what was found in one place, and what was done there.
 *
 * Deciding not to act on data that was found needs a reason, because that is
 * the judgement somebody will ask about.
 */
export async function recordScopeResult(input: {
  scopeId: string;
  organisationId: string;
  status: ScopeEntry["status"];
  note?: string | null;
  actor: Actor;
}) {
  const note = input.note?.trim() || null;
  if (input.status === "not_actioned" && !note) {
    throw new RequestRefused("Say why nothing was done with what was found — an exemption, an Article 17(3) exception, a refusal.");
  }

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const { entry, request } = await lockedEntry(tx, input.scopeId, input.organisationId);
      const [after] = await tx
        .update(dataSubjectRequestScope)
        .set({
          status: input.status,
          note,
          checkedBy: input.actor.actorUserId ?? null,
          checkedByLabel: input.actor.actorLabel,
          checkedAt: new Date(),
        })
        .where(eq(dataSubjectRequestScope.id, input.scopeId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: "dsr.scope_checked",
        subjectType: "data_subject_request",
        subjectId: request.id,
        before: { status: entry.status },
        after: { reference: request.reference, entry: entry.id, label: entry.label, status: input.status, note },
      });
      return after;
    });
  });
}

/**
 * Record that a recipient was told of a correction, erasure or restriction,
 * or why it was not (Article 19).
 *
 * Telling is owed only once one of those has been done, and not telling is
 * allowed only where it proves impossible or involves disproportionate effort
 * — which the record has to explain.
 */
export async function recordRecipientNotice(input: {
  scopeId: string;
  organisationId: string;
  notice: NonNullable<ScopeEntry["recipientNotice"]>;
  at?: Date;
  note?: string | null;
  actor: Actor;
}) {
  const note = input.note?.trim() || null;
  if (input.notice !== "notified" && !note) {
    throw new RequestRefused("Say why telling this recipient is impossible or would take disproportionate effort.");
  }
  const at = input.at ?? new Date();

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const { entry, request } = await lockedEntry(tx, input.scopeId, input.organisationId);
      if (!entry.isRecipient) throw new RequestRefused(`${entry.label} is somewhere to search, not a recipient of the data.`);
      const decisions = await tx
        .select()
        .from(dataSubjectRequestDecisions)
        .where(eq(dataSubjectRequestDecisions.requestId, request.id));
      if (!recipientsMustBeTold(decisions)) {
        throw new RequestRefused(
          "Article 19 applies once data has been rectified, erased or restricted. Record that decision first.",
        );
      }
      if (at < request.receivedAt) throw new RequestRefused("That is before the request arrived.");

      const [after] = await tx
        .update(dataSubjectRequestScope)
        .set({ recipientNotice: input.notice, recipientNoticeAt: at, recipientNoticeNote: note })
        .where(eq(dataSubjectRequestScope.id, input.scopeId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: "dsr.recipient_notified",
        subjectType: "data_subject_request",
        subjectId: request.id,
        after: { reference: request.reference, entry: entry.id, label: entry.label, notice: input.notice, at: at.toISOString(), note },
      });
      return after;
    });
  });
}

/**
 * Where this organisation is the processor: record passing the request to the
 * controller, and the help given (Article 28(3)(e)).
 *
 * The processor does not answer the person, so this is where its part ends.
 */
export async function passToController(input: {
  requestId: string;
  organisationId: string;
  controllerName: string;
  at?: Date;
  assistance?: string | null;
  actor: Actor;
}) {
  const controllerName = input.controllerName.trim();
  if (!controllerName) throw new RequestRefused("Name the controller the request went to.");
  const at = input.at ?? new Date();

  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const request = await lockedRequest(tx, input.requestId, input.organisationId);
      if (request.closedAt) throw new RequestRefused("This request is closed.");
      if (request.controllerRole !== "processor") {
        throw new RequestRefused("Only a processor passes a request on. As controller, you answer it.");
      }
      if (at < request.receivedAt) throw new RequestRefused("That is before the request arrived.");

      const [after] = await tx
        .update(dataSubjectRequests)
        .set({
          controllerName,
          passedToControllerAt: at,
          assistanceSummary: input.assistance?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(dataSubjectRequests.id, input.requestId))
        .returning();

      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        entityId: request.entityId,
        action: "dsr.passed_to_controller",
        subjectType: "data_subject_request",
        subjectId: input.requestId,
        after: { reference: request.reference, controllerName, at: at.toISOString(), assistance: after.assistanceSummary },
      });
      return after;
    });
  });
}

/** How many objections to one activity send its LIA back for review. */
export async function objectionReviewThreshold(organisationId: string): Promise<number> {
  return withOrganisation(organisationId, async () => {
    const [org] = await db
      .select({ threshold: organisations.objectionReviewThreshold })
      .from(organisations)
      .where(eq(organisations.id, organisationId));
    return org?.threshold ?? 3;
  });
}

export async function setObjectionReviewThreshold(input: { organisationId: string; threshold: number; actor: Actor }) {
  if (!Number.isInteger(input.threshold) || input.threshold < 0 || input.threshold > 100) {
    throw new RequestRefused("A whole number from 0, which turns it off, to 100.");
  }
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      const [before] = await tx
        .select({ threshold: organisations.objectionReviewThreshold })
        .from(organisations)
        .where(eq(organisations.id, input.organisationId));
      if (!before) throw new Error("No such organisation");
      if (before.threshold === input.threshold) return;
      await tx
        .update(organisations)
        .set({ objectionReviewThreshold: input.threshold })
        .where(eq(organisations.id, input.organisationId));
      await appendAuditEvent(tx, {
        ...input.actor,
        organisationId: input.organisationId,
        action: "organisation.objection_review_threshold_set",
        subjectType: "organisation",
        subjectId: input.organisationId,
        before: { threshold: before.threshold },
        after: { threshold: input.threshold },
      });
    });
  });
}

/**
 * Objections decided against each activity in the last twelve months, upheld
 * or overridden, one per request.
 *
 * Counts only: no requester, no request. An objection found not to apply is
 * left out, because it says nothing about the balance struck.
 */
export async function objectionCounts(
  organisationId: string,
  activityIds?: string[],
  now = new Date(),
): Promise<Map<string, { upheld: number; overridden: number; total: number }>> {
  if (activityIds && activityIds.length === 0) return new Map();
  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - OBJECTION_WINDOW_MONTHS);
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({
        activityId: dataSubjectRequestDecisions.processingActivityId,
        upheld: sql<number>`count(distinct ${dataSubjectRequestDecisions.requestId}) filter (where ${dataSubjectRequestDecisions.outcome} = 'complied')`,
        overridden: sql<number>`count(distinct ${dataSubjectRequestDecisions.requestId}) filter (where ${dataSubjectRequestDecisions.outcome} = 'refused')`,
        total: sql<number>`count(distinct ${dataSubjectRequestDecisions.requestId})`,
      })
      .from(dataSubjectRequestDecisions)
      .where(
        and(
          eq(dataSubjectRequestDecisions.organisationId, organisationId),
          eq(dataSubjectRequestDecisions.kind, "objection"),
          inArray(dataSubjectRequestDecisions.outcome, ["complied", "refused"]),
          gte(dataSubjectRequestDecisions.effectiveAt, since),
          activityIds
            ? inArray(dataSubjectRequestDecisions.processingActivityId, activityIds)
            : sql`${dataSubjectRequestDecisions.processingActivityId} is not null`,
        ),
      )
      .groupBy(dataSubjectRequestDecisions.processingActivityId);
    return new Map(
      rows.map((r) => [r.activityId!, { upheld: Number(r.upheld), overridden: Number(r.overridden), total: Number(r.total) }]),
    );
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

export async function loadRequest(
  requestId: string,
  organisationId: string,
): Promise<(LoadedRequest & { scope: ScopeEntry[]; competentAuthority: boolean }) | null> {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select({
        request: dataSubjectRequests,
        entityName: entities.name,
        ownerEmail: users.email,
        competentAuthority: entities.competentAuthority,
      })
      .from(dataSubjectRequests)
      .innerJoin(entities, eq(entities.id, dataSubjectRequests.entityId))
      .leftJoin(users, eq(users.id, dataSubjectRequests.ownerId))
      .where(and(eq(dataSubjectRequests.id, requestId), eq(dataSubjectRequests.organisationId, organisationId)));
    if (!row) return null;
    const decisions = groupDecisions(await decisionsFor([requestId])).get(requestId) ?? [];
    const scope = await db
      .select()
      .from(dataSubjectRequestScope)
      .where(eq(dataSubjectRequestScope.requestId, requestId))
      .orderBy(asc(dataSubjectRequestScope.kind), asc(dataSubjectRequestScope.label));
    return { ...assemble(row.request, row.entityName, row.ownerEmail, decisions), scope, competentAuthority: row.competentAuthority };
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

/**
 * Timeliness over the requests received in the last `months` months, by
 * right and by month, plus how the objections among them were decided.
 *
 * Counts only, so it can go on a dashboard, into a spreadsheet, or over the
 * Integration API to the Portal's data subject rights procedure, without any
 * requester going with it.
 */
export async function requestMetrics(
  organisationId: string,
  entityIds: string[] | null,
  months = 12,
  now = new Date(),
): Promise<Timeliness & { months: number; from: Date; to: Date; objections: { decided: number; upheld: number; overridden: number; notApplicable: number } }> {
  const periods = monthsEnding(now, months);
  const from = periods[0].start;
  const register = await requestRegister(organisationId, entityIds);
  const inWindow = register.rows.filter((r) => r.request.receivedAt >= from && r.request.receivedAt <= now);
  const objections = inWindow.flatMap((r) => r.decisions.filter((d) => d.kind === "objection"));
  return {
    months,
    from,
    to: now,
    ...requestTimeliness(
      inWindow.map((r) => ({
        rights: r.request.rights,
        receivedAt: r.request.receivedAt,
        respondedAt: r.request.respondedAt,
        clockState: r.clock.state,
        extended: r.extended,
        status: r.request.status,
        closedAt: r.request.closedAt,
      })),
      periods,
    ),
    objections: {
      decided: objections.length,
      upheld: objections.filter((d) => d.outcome === "complied").length,
      overridden: objections.filter((d) => d.outcome === "refused").length,
      notApplicable: objections.filter((d) => d.outcome === "not_applicable").length,
    },
  };
}

/**
 * The Integration API's summary of requests: counts only.
 *
 * Entities are named as the context export names them — by name or legal
 * entity reference. One that matches nothing is refused rather than counted
 * as zero, because a summary of nothing reads exactly like a clean record.
 */
export async function requestsSummary(input: { organisationId: string; entities?: string[]; months?: number }) {
  const months = input.months ?? 12;
  return withOrganisation(input.organisationId, async () => {
    const [org] = await db
      .select({ name: organisations.name, slug: organisations.slug, jurisdiction: organisations.dataProtectionJurisdiction })
      .from(organisations)
      .where(eq(organisations.id, input.organisationId));
    if (!org) throw new Error("No such organisation");

    let entityIds: string[] | null = null;
    if (input.entities?.length) {
      const all = await db.select().from(entities).where(eq(entities.organisationId, input.organisationId));
      const unknown = input.entities.filter((n) => !all.some((e) => e.name === n || e.legalEntityRef === n));
      if (unknown.length) throw new BadQuery(`No entity named ${unknown.map((n) => `\`${n}\``).join(", ")}`);
      entityIds = all.filter((e) => input.entities!.includes(e.name) || (e.legalEntityRef !== null && input.entities!.includes(e.legalEntityRef))).map((e) => e.id);
    }

    const m = await requestMetrics(input.organisationId, entityIds, months);
    return {
      summaryVersion: "1.0",
      generatedAt: new Date().toISOString(),
      organisation: { name: org.name, slug: org.slug, defaultJurisdiction: org.jurisdiction },
      scope: {
        entities: input.entities?.length ? input.entities : null,
        months,
        from: m.from.toISOString(),
        to: m.to.toISOString(),
      },
      totals: m.totals,
      byRight: m.byRight,
      byMonth: m.byMonth,
      objections: m.objections,
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
