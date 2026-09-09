import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  approvals,
  assessments,
  entities,
  memberships,
  roleAssignments,
  users,
  workflowDefinitions,
  workflowStages,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { ROLE_LABEL, type AppRole } from "@/lib/rbac";
import { DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import { describeRouting, routingCondition, type RoutingCondition } from "@/lib/workflow/routing";
import type { Actor } from "./templates";

/**
 * Who approves what, and how an administrator changes it.
 *
 * The answer to "who is the approver" is deliberately a role rather than a
 * person. Naming a person means every leaver strands a queue of assessments
 * waiting on somebody who no longer works here, and every reorganisation
 * becomes a data migration. Naming a role means a departure is handled by
 * moving the role — the gates follow.
 *
 * The cost of that design is that it is invisible: nothing on screen showed
 * which role decided a gate, let alone who currently holds it. So this returns
 * both — the rule, and the people it presently resolves to.
 */

export type StageView = {
  id: string;
  position: number;
  name: string;
  requiredRole: AppRole;
  roleLabel: string;
  condition: RoutingCondition;
  appliesWhen: string;
  slaHours: number | null;
  /** Who could decide this gate today, organisation-wide. */
  eligible: Array<{ email: string; entityName: string | null }>;
  /** Gates already waiting on this stage. Changing the role redirects them. */
  pending: number;
};

export type WorkflowView = {
  id: string;
  templateKind: string;
  name: string;
  stages: StageView[];
};

export class RoutingRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingRefused";
  }
}

export async function workflowsFor(organisationId: string): Promise<WorkflowView[]> {
  const definitions = await db
    .select()
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.organisationId, organisationId),
        eq(workflowDefinitions.isActive, true),
      ),
    )
    .orderBy(asc(workflowDefinitions.templateKind));
  if (definitions.length === 0) return [];

  const stages = await db
    .select()
    .from(workflowStages)
    .where(inArray(workflowStages.workflowDefinitionId, definitions.map((d) => d.id)))
    .orderBy(asc(workflowStages.position));

  // Who holds which role, so a rule can be shown as the people it resolves to.
  const holders = await db
    .select({
      role: roleAssignments.role,
      email: users.email,
      entityName: entities.name,
      active: memberships.isActive,
    })
    .from(roleAssignments)
    .innerJoin(memberships, eq(memberships.id, roleAssignments.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(entities, eq(entities.id, roleAssignments.entityId))
    .where(eq(memberships.organisationId, organisationId))
    .orderBy(asc(users.email));

  const waiting = await db
    .select({ stageId: approvals.stageId })
    .from(approvals)
    .innerJoin(assessments, eq(assessments.id, approvals.assessmentId))
    .where(
      and(eq(assessments.organisationId, organisationId), eq(approvals.status, "pending")),
    );
  const pendingByStage = new Map<string, number>();
  for (const row of waiting) {
    if (row.stageId) pendingByStage.set(row.stageId, (pendingByStage.get(row.stageId) ?? 0) + 1);
  }

  return definitions.map((definition) => ({
    id: definition.id,
    templateKind: definition.templateKind,
    name: definition.name,
    stages: stages
      .filter((s) => s.workflowDefinitionId === definition.id)
      .map((s) => ({
        id: s.id,
        position: s.position,
        name: s.name,
        requiredRole: s.requiredRole as AppRole,
        roleLabel: ROLE_LABEL[s.requiredRole as AppRole] ?? s.requiredRole,
        condition: s.condition,
        appliesWhen: describeRouting(s.condition),
        slaHours: s.slaHours,
        // An owner can decide anything, so they are eligible for every gate.
        eligible: holders
          .filter((h) => h.active && (h.role === s.requiredRole || h.role === "owner"))
          .map((h) => ({ email: h.email, entityName: h.entityName })),
        pending: pendingByStage.get(s.id) ?? 0,
      })),
  }));
}

async function stageIn(organisationId: string, stageId: string) {
  const [row] = await db
    .select({ stage: workflowStages, definition: workflowDefinitions })
    .from(workflowStages)
    .innerJoin(
      workflowDefinitions,
      eq(workflowDefinitions.id, workflowStages.workflowDefinitionId),
    )
    .where(
      and(
        eq(workflowStages.id, stageId),
        eq(workflowDefinitions.organisationId, organisationId),
      ),
    );
  if (!row) throw new RoutingRefused("That approval stage no longer exists.");
  return row;
}

/**
 * Change who decides a gate, how long they have, or what it is called.
 *
 * Gates already waiting are redirected rather than reissued: an assessment
 * sitting with the wrong approver is the problem being solved, so leaving the
 * open ones pointing at the old role would fix nothing. The count of those is
 * shown before the change and recorded in the audit entry after it.
 */
export async function updateStage(input: {
  organisationId: string;
  stageId: string;
  name: string;
  requiredRole: AppRole;
  slaHours: number | null;
  condition?: RoutingCondition;
  actor: Actor;
}) {
  const { stage } = await stageIn(input.organisationId, input.stageId);

  const name = input.name.trim();
  if (!name) throw new RoutingRefused("A stage needs a name — it is what the approver sees.");
  if (input.slaHours !== null && (input.slaHours < 1 || input.slaHours > 24 * 90)) {
    throw new RoutingRefused("A service level must be between an hour and ninety days.");
  }

  const condition = input.condition ?? stage.condition;
  const parsed = routingCondition.safeParse(condition);
  if (!parsed.success) throw new RoutingRefused("That condition is not one this platform understands.");

  return db.transaction(async (tx) => {
    await tx
      .update(workflowStages)
      .set({ name, requiredRole: input.requiredRole, slaHours: input.slaHours, condition: parsed.data })
      .where(eq(workflowStages.id, stage.id));

    // Open gates follow the rule. The approval row carries its own copy of the
    // required role so a decided approval stays a record of who was entitled
    // to decide it at the time — only the undecided ones are moved.
    const redirected = await tx
      .update(approvals)
      .set({ requiredRole: input.requiredRole, name })
      .where(and(eq(approvals.stageId, stage.id), eq(approvals.status, "pending")))
      .returning({ id: approvals.id });

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "workflow.stage.updated",
      subjectType: "workflow_stage",
      subjectId: stage.id,
      before: {
        name: stage.name,
        requiredRole: stage.requiredRole,
        slaHours: stage.slaHours,
        condition: stage.condition,
      },
      after: {
        name,
        requiredRole: input.requiredRole,
        slaHours: input.slaHours,
        condition: parsed.data,
        pendingRedirected: redirected.length,
      },
    });

    return { redirected: redirected.length };
  });
}

/** Restore the shipped workflow for one kind, when somebody has edited it into a corner. */
export async function resetWorkflow(input: {
  organisationId: string;
  templateKind: string;
  actor: Actor;
}) {
  const spec = DEFAULT_WORKFLOWS.find((w) => w.templateKind === input.templateKind);
  if (!spec) throw new RoutingRefused("There is no shipped workflow for that kind of assessment.");

  return db.transaction(async (tx) => {
    const [definition] = await tx
      .select()
      .from(workflowDefinitions)
      .where(
        and(
          eq(workflowDefinitions.organisationId, input.organisationId),
          eq(workflowDefinitions.templateKind, spec.templateKind),
          eq(workflowDefinitions.isActive, true),
        ),
      );
    if (!definition) throw new RoutingRefused("There is no active workflow for that kind.");

    const existing = await tx
      .select()
      .from(workflowStages)
      .where(eq(workflowStages.workflowDefinitionId, definition.id));

    // Stages are replaced, not deleted outright: an approval keeps its stage
    // reference, and dropping the row would sever a decided gate from the rule
    // that produced it. The FK is "set null" for exactly that reason, so the
    // history survives with its own copy of the role and name.
    await tx.delete(workflowStages).where(eq(workflowStages.workflowDefinitionId, definition.id));
    for (const s of spec.stages) {
      await tx.insert(workflowStages).values({
        workflowDefinitionId: definition.id,
        position: s.position,
        name: s.name,
        requiredRole: s.requiredRole,
        condition: s.condition,
        slaHours: s.slaHours,
      });
    }

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "workflow.reset",
      subjectType: "workflow_definition",
      subjectId: definition.id,
      before: { stages: existing.map((s) => ({ name: s.name, requiredRole: s.requiredRole })) },
      after: { stages: spec.stages.map((s) => ({ name: s.name, requiredRole: s.requiredRole })) },
    });
  });
}
