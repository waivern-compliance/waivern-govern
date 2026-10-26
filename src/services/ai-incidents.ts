import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import {
  aiIncidentEvents,
  aiIncidents,
  aiUseCases,
  entities,
  referenceCounters,
  risks,
  tasks,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import type { RiskTier } from "@/lib/risk/scale";
import type { Actor } from "./templates";
import { raiseTask } from "./workflow";

/**
 * Reports about AI systems, and what was done about each.
 *
 * Nothing here decides the outcome. A report is routed to a named person, they
 * triage it and record what happened, and every step is kept. Where the report
 * is a challenge to an outcome, that person's decision is the human review the
 * law and the Playbook ask for.
 */

export type IncidentKind = "incident" | "harm" | "challenge" | "concern";
export type IncidentSource = "staff" | "public" | "monitoring" | "supplier" | "other";
export type Harm = "none_known" | "potential" | "actual";
export type IncidentStatus = "reported" | "triaged" | "investigating" | "resolved" | "closed";

export const KIND_LABEL: Record<IncidentKind, string> = {
  incident: "Incident — it failed or misbehaved",
  harm: "Harm — someone was or may have been harmed",
  challenge: "Challenge — someone is contesting an outcome",
  concern: "Concern — raised about the system",
};

export const SOURCE_LABEL: Record<IncidentSource, string> = {
  staff: "Staff",
  public: "A member of the public",
  monitoring: "The system's monitoring",
  supplier: "A supplier",
  other: "Somewhere else",
};

export const HARM_LABEL: Record<Harm, string> = {
  none_known: "None known",
  potential: "Possible",
  actual: "Actual",
};

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  reported: "Reported",
  triaged: "Triaged",
  investigating: "Investigating",
  resolved: "Resolved",
  closed: "Closed",
};

/** Where a report can go next. Closed is final; a resolution can be reopened. */
const NEXT: Record<IncidentStatus, IncidentStatus[]> = {
  reported: ["triaged"],
  triaged: ["investigating", "resolved"],
  investigating: ["resolved"],
  resolved: ["closed", "investigating"],
  closed: [],
};

export const OPEN: IncidentStatus[] = ["reported", "triaged", "investigating"];

export class IncidentRefused extends Error {}

async function nextReference(organisationId: string, year: number) {
  const rows = await db.execute<{ next_value: number | string }>(sql`
    insert into ${referenceCounters} (organisation_id, prefix, year, next_value)
    values (${organisationId}, 'AIINC', ${year}, 1)
    on conflict (organisation_id, prefix, year)
      do update set next_value = ${referenceCounters}.next_value + 1
    returning next_value
  `);
  return `AIINC-${year}-${String(Number(rows[0]?.next_value ?? 1)).padStart(4, "0")}`;
}

/**
 * Record a report.
 *
 * Routed to the system's AI governance officer, else its owner, else to the AI
 * governance role — a report that reaches nobody in particular is one nobody
 * answers. The person handling it gets a task with a short service level.
 */
export async function reportIncident(input: {
  organisationId: string;
  useCaseId?: string | null;
  /** Needed only where no system is named. */
  entityId?: string;
  kind: IncidentKind;
  source: IncidentSource;
  summary: string;
  details?: string;
  harm: Harm;
  confidential: boolean;
  reportedByLabel: string;
  occurredAt?: Date;
  actor: Actor;
}) {
  const summary = input.summary.trim();
  if (!summary) throw new IncidentRefused("Say what happened");
  const reportedBy = input.reportedByLabel.trim() || "Not given";

  let entityId = input.entityId ?? null;
  let assignee: string | null = null;
  let useCase: typeof aiUseCases.$inferSelect | null = null;
  if (input.useCaseId) {
    const [row] = await db
      .select()
      .from(aiUseCases)
      .where(
        and(eq(aiUseCases.id, input.useCaseId), eq(aiUseCases.organisationId, input.organisationId)),
      );
    if (!row) throw new Error("No such AI use case");
    useCase = row;
    entityId = row.entityId;
    assignee = row.governanceOfficerId ?? row.ownerId;
  }
  if (!entityId) {
    const [fallback] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.organisationId, input.organisationId), eq(entities.isDefault, true)));
    if (!fallback) throw new Error("No default entity");
    entityId = fallback.id;
  }

  const reference = await nextReference(input.organisationId, new Date().getUTCFullYear());

  return db.transaction(async (tx) => {
    const [incident] = await tx
      .insert(aiIncidents)
      .values({
        organisationId: input.organisationId,
        entityId: entityId!,
        aiUseCaseId: useCase?.id ?? null,
        reference,
        kind: input.kind,
        source: input.source,
        summary,
        details: input.details?.trim() || null,
        harm: input.harm,
        reportedByLabel: reportedBy,
        confidential: input.confidential,
        assignedToUserId: assignee,
        occurredAt: input.occurredAt ?? null,
        recordedByUserId: input.actor.actorUserId ?? null,
      })
      .returning();

    await tx.insert(aiIncidentEvents).values({
      incidentId: incident.id,
      fromStatus: null,
      toStatus: "reported",
      note: "Reported.",
      byUserId: input.actor.actorUserId ?? null,
      // Who recorded it, which for a confidential concern may be the person
      // who raised it — so the timeline follows the same rule as the report.
      byLabel: input.confidential ? "Recorded confidentially" : input.actor.actorLabel,
    });

    await raiseTask(tx, {
      organisationId: input.organisationId,
      entityId: entityId!,
      type: "triage_incident",
      title: `${reference}: ${summary.slice(0, 80)}`,
      description:
        `${KIND_LABEL[input.kind].split(" — ")[0]}${useCase ? ` about ${useCase.reference} ${useCase.name}` : ""}. ` +
        (input.harm === "actual" ? "Harm is reported as actual. " : "") +
        "Decide what it needs, and who handles it.",
      subjectType: "ai_incident",
      subjectId: incident.id,
      assigneeUserId: assignee,
      assigneeRole: assignee ? undefined : "ai_governance",
      idempotencyKey: `incident-triage:${incident.id}`,
      actor: input.actor,
    });

    await appendAuditEvent(tx, {
      ...input.actor,
      // A confidential concern's audit entry does not name who recorded it
      // either: the audit log is readable by more people than the concern is.
      ...(input.confidential ? { actorLabel: "confidential report" } : {}),
      organisationId: input.organisationId,
      action: "ai_incident.reported",
      subjectType: "ai_incident",
      subjectId: incident.id,
      entityId: entityId!,
      after: {
        reference,
        kind: input.kind,
        source: input.source,
        harm: input.harm,
        useCase: useCase?.reference ?? null,
        confidential: input.confidential,
      },
    });
    return incident;
  });
}

async function loadForUpdate(incidentId: string, organisationId: string) {
  const [incident] = await db
    .select()
    .from(aiIncidents)
    .where(and(eq(aiIncidents.id, incidentId), eq(aiIncidents.organisationId, organisationId)));
  if (!incident) throw new Error("No such incident");
  return incident;
}

/**
 * Decide what a report needs: how serious it is, whether harm is actual, who
 * handles it, and the risk it belongs to if any. Closes the triage task.
 */
export async function triageIncident(input: {
  incidentId: string;
  organisationId: string;
  severity: RiskTier;
  harm: Harm;
  assignedToUserId: string | null;
  linkedRiskId?: string | null;
  note: string;
  actor: Actor;
}) {
  const note = input.note.trim();
  if (!note) throw new IncidentRefused("Say what you decided and why");
  const incident = await loadForUpdate(input.incidentId, input.organisationId);
  if (incident.status !== "reported") throw new IncidentRefused("This has already been triaged");

  if (input.linkedRiskId) {
    const [risk] = await db
      .select({ id: risks.id })
      .from(risks)
      .where(and(eq(risks.id, input.linkedRiskId), eq(risks.organisationId, input.organisationId)));
    if (!risk) throw new IncidentRefused("No such risk");
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const [after] = await tx
      .update(aiIncidents)
      .set({
        status: "triaged",
        severity: input.severity,
        harm: input.harm,
        assignedToUserId: input.assignedToUserId,
        linkedRiskId: input.linkedRiskId ?? incident.linkedRiskId,
        updatedAt: now,
      })
      .where(eq(aiIncidents.id, incident.id))
      .returning();

    await tx.insert(aiIncidentEvents).values({
      incidentId: incident.id,
      fromStatus: "reported",
      toStatus: "triaged",
      note,
      byUserId: input.actor.actorUserId ?? null,
      byLabel: input.actor.actorLabel,
    });

    await tx
      .update(tasks)
      .set({ status: "done", completedAt: now, completedByLabel: input.actor.actorLabel })
      .where(
        and(
          eq(tasks.organisationId, input.organisationId),
          eq(tasks.idempotencyKey, `incident-triage:${incident.id}`),
        ),
      );

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "ai_incident.triaged",
      subjectType: "ai_incident",
      subjectId: incident.id,
      entityId: incident.entityId,
      before: { status: incident.status, harm: incident.harm },
      after: {
        status: "triaged",
        severity: input.severity,
        harm: input.harm,
        linkedRisk: after.linkedRiskId,
      },
    });
    return after;
  });
}

/**
 * Move a report on. Resolving needs an outcome — for a challenge, the decision
 * the person reached — and every move needs a note for the timeline.
 */
export async function advanceIncident(input: {
  incidentId: string;
  organisationId: string;
  to: IncidentStatus;
  note: string;
  outcome?: string;
  actor: Actor;
}) {
  const note = input.note.trim();
  if (!note) throw new IncidentRefused("Say what was done");
  const incident = await loadForUpdate(input.incidentId, input.organisationId);
  const current = incident.status as IncidentStatus;
  if (!NEXT[current].includes(input.to)) {
    throw new IncidentRefused(
      current === "reported"
        ? "Triage it first"
        : `It cannot go from ${STATUS_LABEL[current].toLowerCase()} to ${STATUS_LABEL[input.to].toLowerCase()}`,
    );
  }
  const outcome = input.outcome?.trim() || incident.outcome;
  if (input.to === "resolved" && !outcome?.trim()) {
    throw new IncidentRefused("Say how it was resolved");
  }

  return db.transaction(async (tx) => {
    const now = new Date();
    const [after] = await tx
      .update(aiIncidents)
      .set({
        status: input.to,
        outcome,
        resolvedAt: input.to === "resolved" ? now : input.to === "investigating" ? null : incident.resolvedAt,
        closedAt: input.to === "closed" ? now : null,
        updatedAt: now,
      })
      .where(eq(aiIncidents.id, incident.id))
      .returning();

    await tx.insert(aiIncidentEvents).values({
      incidentId: incident.id,
      fromStatus: current,
      toStatus: input.to,
      note,
      byUserId: input.actor.actorUserId ?? null,
      byLabel: input.actor.actorLabel,
    });

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: `ai_incident.${input.to}`,
      subjectType: "ai_incident",
      subjectId: incident.id,
      entityId: incident.entityId,
      before: { status: current },
      after: { status: input.to, ...(input.to === "resolved" ? { outcome } : {}) },
    });
    return after;
  });
}

export async function listIncidents(
  organisationId: string,
  entityIds: string[] | null,
  opts: { useCaseId?: string; openOnly?: boolean } = {},
) {
  const assignees = alias(users, "assignee");
  return db
    .select({
      incident: aiIncidents,
      useCase: { id: aiUseCases.id, reference: aiUseCases.reference, name: aiUseCases.name },
      assigneeEmail: assignees.email,
    })
    .from(aiIncidents)
    .leftJoin(aiUseCases, eq(aiUseCases.id, aiIncidents.aiUseCaseId))
    .leftJoin(assignees, eq(assignees.id, aiIncidents.assignedToUserId))
    .where(
      and(
        eq(aiIncidents.organisationId, organisationId),
        entityIds === null ? undefined : inArray(aiIncidents.entityId, entityIds),
        opts.useCaseId ? eq(aiIncidents.aiUseCaseId, opts.useCaseId) : undefined,
        opts.openOnly ? inArray(aiIncidents.status, OPEN) : undefined,
      ),
    )
    .orderBy(desc(aiIncidents.reportedAt));
}

export async function loadIncident(incidentId: string, organisationId: string) {
  const [row] = await listIncidentsById(incidentId, organisationId);
  if (!row) return null;
  const [events, linkedRisk] = await Promise.all([
    db
      .select()
      .from(aiIncidentEvents)
      .where(eq(aiIncidentEvents.incidentId, incidentId))
      .orderBy(aiIncidentEvents.at),
    row.incident.linkedRiskId
      ? db
          .select({ id: risks.id, reference: risks.reference, title: risks.title })
          .from(risks)
          .where(eq(risks.id, row.incident.linkedRiskId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return { ...row, events, linkedRisk };
}

async function listIncidentsById(incidentId: string, organisationId: string) {
  const assignees = alias(users, "assignee");
  return db
    .select({
      incident: aiIncidents,
      useCase: { id: aiUseCases.id, reference: aiUseCases.reference, name: aiUseCases.name },
      assigneeEmail: assignees.email,
    })
    .from(aiIncidents)
    .leftJoin(aiUseCases, eq(aiUseCases.id, aiIncidents.aiUseCaseId))
    .leftJoin(assignees, eq(assignees.id, aiIncidents.assignedToUserId))
    .where(and(eq(aiIncidents.id, incidentId), eq(aiIncidents.organisationId, organisationId)));
}

/** Systems with a report of actual harm still open, for the register. One query. */
export async function systemsWithUnresolvedHarm(organisationId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: aiIncidents.aiUseCaseId })
    .from(aiIncidents)
    .where(
      and(
        eq(aiIncidents.organisationId, organisationId),
        eq(aiIncidents.harm, "actual"),
        notInArray(aiIncidents.status, ["resolved", "closed"]),
      ),
    );
  return new Set(rows.map((r) => r.id).filter((id): id is string => id !== null));
}

/**
 * Whether this viewer may see who raised a report.
 *
 * Everyone may for an ordinary report. For a confidential one, only the person
 * handling it and those holding the confidential-concern capability — so a
 * whistleblower is known to as few people as the work needs.
 */
export function reporterVisible(
  incident: { confidential: boolean; assignedToUserId: string | null },
  viewer: { userId: string; mayReadConfidential: boolean },
): boolean {
  if (!incident.confidential) return true;
  return viewer.mayReadConfidential || incident.assignedToUserId === viewer.userId;
}
