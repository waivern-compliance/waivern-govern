import { eq } from "drizzle-orm";
import { db, sql as pg } from "@/db/client";
import {
  entities,
  memberships,
  organisations,
  retentionProfiles,
  roleAssignments,
  users,
} from "@/db/schema";
import { appendAuditEvent } from "@/lib/audit";
import { LEGAL_REFERENCES, SYSTEM_TEMPLATES } from "@/lib/templates/library";
import type { AppRole } from "@/lib/rbac";
import { legalReferences } from "@/db/schema";
import { createTemplate, publishVersion } from "@/services/templates";
import { seedSharedLibrary } from "@/services/countries";
import { DEFAULT_SLA, DEFAULT_WORKFLOWS } from "@/lib/workflow/defaults";
import { slaPolicies, workflowDefinitions, workflowStages } from "@/db/schema";

/**
 * A demonstration tenant shaped like the buyer described in the RFI: a single
 * unified instance holding two legal entities, with records classified and
 * reported by entity. Deliberately generic underneath — nothing about the
 * platform knows this organisation is special.
 */
const ORG = { name: "BBC Group", slug: "bbc-group" };

const ENTITIES = [
  { name: "BBC Public Service", legalEntityRef: "BBC-PS", isDefault: true },
  { name: "BBC Studios", legalEntityRef: "BBC-STU", isDefault: false },
];

const PEOPLE: Array<{
  email: string;
  name: string;
  roles: Array<{ role: AppRole; entity?: string }>;
}> = [
  { email: "programme.lead@example.bbc.co.uk", name: "Programme Lead", roles: [{ role: "owner" }] },
  { email: "dpo@example.bbc.co.uk", name: "Data Protection Officer", roles: [{ role: "privacy_admin" }] },
  { email: "privacy.analyst@example.bbc.co.uk", name: "Privacy Analyst", roles: [{ role: "privacy_analyst" }] },
  { email: "ai.governance@example.bbc.co.uk", name: "Responsible AI Lead", roles: [{ role: "ai_governance" }] },
  {
    email: "ps.approver@example.bbc.co.uk",
    name: "Public Service Approver",
    // Deliberately not the same person as any risk owner: accepting a risk you
    // own is refused, so a demo tenant needs a separate approver to be usable.
    roles: [{ role: "approver", entity: "BBC Public Service" }],
  },
  {
    email: "studios.approver@example.bbc.co.uk",
    name: "Studios Approver",
    // Scoped to one entity: this person may decide approvals for BBC Studios
    // and holds no rights at all over Public Service records.
    roles: [{ role: "approver", entity: "BBC Studios" }],
  },
  { email: "internal.audit@example.bbc.co.uk", name: "Internal Audit", roles: [{ role: "auditor" }] },
];

/** Retention varies by record type and follows the client's own schedule. */
const RETENTION: Array<{ subjectType: "assessment" | "audit_event" | "processing_activity" | "risk"; months: number; basis: string }> = [
  { subjectType: "assessment", months: 84, basis: "Corporate retention schedule — governance records" },
  { subjectType: "processing_activity", months: 84, basis: "Retained while processing continues, plus 7 years" },
  { subjectType: "risk", months: 84, basis: "Corporate retention schedule — risk records" },
  { subjectType: "audit_event", months: 120, basis: "Audit evidence, retained beyond the records it describes" },
];

async function main() {
  let organisationId: string | undefined;
  const existing = await db.query.organisations.findFirst({
    where: eq(organisations.slug, ORG.slug),
  });
  if (existing) {
    console.log(`Organisation "${ORG.slug}" already seeded. Run \`pnpm db:reset\` first to start clean.`);
    await pg.end();
    return;
  }

  await db.transaction(async (tx) => {
    const [org] = await tx.insert(organisations).values(ORG).returning();

    // The seed writes through the same audit path as the application, which is
    // both a demonstration and a test: a chain that starts at the first record
    // has no unexplained gap at its head.
    const systemActor = {
      organisationId: org.id,
      actorKind: "system" as const,
      actorLabel: "seed",
    };

    await appendAuditEvent(tx, {
      ...systemActor,
      action: "organisation.created",
      subjectType: "organisation",
      subjectId: org.id,
      after: { name: org.name, slug: org.slug },
    });

    const entityByName = new Map<string, string>();
    for (const e of ENTITIES) {
      const [row] = await tx
        .insert(entities)
        .values({ ...e, organisationId: org.id })
        .returning();
      entityByName.set(row.name, row.id);
      await appendAuditEvent(tx, {
        ...systemActor,
        action: "entity.created",
        subjectType: "entity",
        subjectId: row.id,
        entityId: row.id,
        after: { name: row.name, legalEntityRef: row.legalEntityRef },
      });
    }

    for (const r of RETENTION) {
      const [row] = await tx
        .insert(retentionProfiles)
        .values({
          organisationId: org.id,
          subjectType: r.subjectType,
          retentionMonths: r.months,
          basis: r.basis,
        })
        .returning();
      await appendAuditEvent(tx, {
        ...systemActor,
        action: "retention_profile.created",
        subjectType: "retention_profile",
        subjectId: row.id,
        after: { subjectType: r.subjectType, retentionMonths: r.months },
      });
    }

    for (const p of PEOPLE) {
      const [user] = await tx
        .insert(users)
        .values({ email: p.email, name: p.name })
        .onConflictDoUpdate({ target: users.email, set: { name: p.name } })
        .returning();

      const [membership] = await tx
        .insert(memberships)
        .values({ organisationId: org.id, userId: user.id })
        .returning();

      for (const grant of p.roles) {
        const entityId = grant.entity ? entityByName.get(grant.entity) : null;
        const [row] = await tx
          .insert(roleAssignments)
          .values({
            membershipId: membership.id,
            role: grant.role,
            scope: entityId ? "entity" : "organisation",
            entityId,
          })
          .returning();
        await appendAuditEvent(tx, {
          ...systemActor,
          action: "role_assignment.granted",
          subjectType: "role_assignment",
          subjectId: row.id,
          entityId,
          after: { email: p.email, role: grant.role, scope: row.scope },
        });
      }
    }

    console.log(`Seeded "${org.name}" — ${ENTITIES.length} entities, ${PEOPLE.length} people.`);
    organisationId = org.id;
  });

  // Legal references are shared across organisations: an article number is the
  // same fact for every client, and a correction should reach all of them at
  // once rather than one tenant at a time.
  const now = new Date();
  for (const ref of LEGAL_REFERENCES) {
    await db
      .insert(legalReferences)
      .values({ ...ref, reviewedAt: now })
      .onConflictDoUpdate({
        target: legalReferences.code,
        set: { citation: ref.citation, title: ref.title, reviewedAt: now },
      });
  }
  console.log(`Seeded ${LEGAL_REFERENCES.length} legal references.`);

  // Shared across every organisation, and needed before transfer routing can
  // answer anything — an empty library escalates every transfer.
  const countries = await seedSharedLibrary();
  console.log(
    `Country library: ${countries.created} of ${countries.total} entries added ` +
      `(all unverified and due for review, deliberately).`,
  );

  // Templates are created and published through the same service the UI uses,
  // so the seed exercises publish-time validation rather than writing rows that
  // the application would have rejected.
  const actor = {
    actorKind: "system" as const,
    actorUserId: null,
    actorLabel: "seed",
  };
  for (const t of SYSTEM_TEMPLATES) {
    const { version } = await createTemplate({
      organisationId: organisationId!,
      kind: t.kind,
      name: t.name,
      description: t.description,
      jurisdiction: t.jurisdiction,
      isSystem: true,
      definition: t.definition,
      actor,
    });
    await publishVersion({
      organisationId: organisationId!,
      versionId: version.id,
      actor,
    });
    console.log(`  published ${t.name}`);
  }

  // Approval workflows and service levels. Seeded per organisation because a
  // client configures these; the defaults are a sensible starting point, not a
  // constant.
  for (const spec of DEFAULT_WORKFLOWS) {
    const [def] = await db
      .insert(workflowDefinitions)
      .values({
        organisationId: organisationId!,
        templateKind: spec.templateKind,
        name: spec.name,
      })
      .returning();
    for (const s of spec.stages) {
      await db.insert(workflowStages).values({
        workflowDefinitionId: def.id,
        position: s.position,
        name: s.name,
        requiredRole: s.requiredRole,
        condition: s.condition,
        slaHours: s.slaHours,
      });
    }
  }
  for (const s of DEFAULT_SLA) {
    await db.insert(slaPolicies).values({
      organisationId: organisationId!,
      taskType: s.taskType as "approve_stage",
      targetHours: s.targetHours,
      escalateToRole: s.escalateToRole,
    });
  }
  console.log(`Seeded ${DEFAULT_WORKFLOWS.length} workflows and ${DEFAULT_SLA.length} service levels.`);

  await pg.end();
}

main().catch(async (err) => {
  console.error(err);
  await pg.end();
  process.exit(1);
});
