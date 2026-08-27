import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { templates, templateVersions } from "@/db/schema";
import type { templateKind } from "@/db/schema";
import { appendAuditEvent, type AuditInput } from "@/lib/audit";
import { templateDefinition, type TemplateDefinition } from "@/lib/templates/schema";
import { validateTemplate, type TemplateProblem } from "@/lib/templates/validate";

export type TemplateKind = (typeof templateKind.enumValues)[number];

/** Who is acting, so the change and its audit record land together. */
export type Actor = Pick<AuditInput, "actorKind" | "actorUserId" | "actorLabel">;

export class TemplateNotPublishable extends Error {
  constructor(readonly problems: TemplateProblem[]) {
    super(
      `Template has ${problems.length} problem${problems.length === 1 ? "" : "s"}: ` +
        problems.map((p) => `${p.path} — ${p.message}`).join("; "),
    );
  }
}

export async function createTemplate(input: {
  organisationId: string;
  kind: TemplateKind;
  name: string;
  description?: string;
  jurisdiction?: string;
  isSystem?: boolean;
  definition: TemplateDefinition;
  actor: Actor;
}) {
  const definition = templateDefinition.parse(input.definition);

  return db.transaction(async (tx) => {
    const [template] = await tx
      .insert(templates)
      .values({
        organisationId: input.organisationId,
        kind: input.kind,
        name: input.name,
        description: input.description,
        jurisdiction: input.jurisdiction,
        isSystem: input.isSystem ?? false,
      })
      .returning();

    const [version] = await tx
      .insert(templateVersions)
      .values({
        templateId: template.id,
        version: 1,
        status: "draft",
        definition,
        createdBy: input.actor.actorUserId ?? null,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "template.created",
      subjectType: "template",
      subjectId: template.id,
      after: { name: template.name, kind: template.kind, version: 1 },
    });

    return { template, version };
  });
}

/**
 * Start a new draft from the latest version.
 *
 * Editing is always "copy the current definition into a new draft", never
 * "change what is published" — so a template can be revised while assessments
 * are mid-flight against the version they started on.
 */
export async function createDraftFrom(input: {
  organisationId: string;
  templateId: string;
  definition?: TemplateDefinition;
  notes?: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const latest = await tx
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, input.templateId))
      .orderBy(desc(templateVersions.version))
      .limit(1);

    const previous = latest[0];
    if (!previous) throw new Error("Template has no versions");

    if (previous.status === "draft") {
      throw new Error(
        "This template already has an open draft. Edit or publish that one first.",
      );
    }

    const definition = templateDefinition.parse(
      input.definition ?? previous.definition,
    );

    const [version] = await tx
      .insert(templateVersions)
      .values({
        templateId: input.templateId,
        version: previous.version + 1,
        status: "draft",
        definition,
        notes: input.notes,
        createdBy: input.actor.actorUserId ?? null,
      })
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "template_version.drafted",
      subjectType: "template_version",
      subjectId: version.id,
      after: { version: version.version, from: previous.version },
    });

    return version;
  });
}

export async function updateDraft(input: {
  organisationId: string;
  versionId: string;
  definition: TemplateDefinition;
  notes?: string;
  actor: Actor;
}) {
  const definition = templateDefinition.parse(input.definition);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.id, input.versionId));
    if (!existing) throw new Error("No such template version");
    if (existing.status !== "draft") {
      throw new Error("Only a draft version can be edited");
    }

    const [version] = await tx
      .update(templateVersions)
      .set({ definition, notes: input.notes ?? existing.notes })
      .where(eq(templateVersions.id, input.versionId))
      .returning();

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "template_version.edited",
      subjectType: "template_version",
      subjectId: version.id,
      before: { definition: existing.definition as unknown as Record<string, unknown> },
      after: { definition: definition as unknown as Record<string, unknown> },
    });

    return version;
  });
}

/**
 * Publish a draft, retiring whatever it supersedes.
 *
 * Validation runs here rather than on save, because a draft is allowed to be
 * half-finished — the point of no return is publication, when assessments start
 * running against it.
 */
export async function publishVersion(input: {
  organisationId: string;
  versionId: string;
  actor: Actor;
}) {
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.id, input.versionId));
    if (!draft) throw new Error("No such template version");
    if (draft.status !== "draft") throw new Error("Only a draft version can be published");

    const problems = validateTemplate(draft.definition);
    if (problems.length > 0) throw new TemplateNotPublishable(problems);

    const now = new Date();

    // Retire the outgoing version first: two published versions of one template
    // would make "which questions apply to a new assessment" ambiguous.
    const superseded = await tx
      .update(templateVersions)
      .set({ status: "retired", retiredAt: now })
      .where(
        and(
          eq(templateVersions.templateId, draft.templateId),
          eq(templateVersions.status, "published"),
        ),
      )
      .returning({ id: templateVersions.id, version: templateVersions.version });

    const [published] = await tx
      .update(templateVersions)
      .set({
        status: "published",
        publishedAt: now,
        publishedBy: input.actor.actorUserId ?? null,
      })
      .where(eq(templateVersions.id, input.versionId))
      .returning();

    await tx
      .update(templates)
      .set({ updatedAt: now })
      .where(eq(templates.id, draft.templateId));

    await appendAuditEvent(tx, {
      ...input.actor,
      organisationId: input.organisationId,
      action: "template_version.published",
      subjectType: "template_version",
      subjectId: published.id,
      after: {
        version: published.version,
        supersededVersions: superseded.map((s) => s.version),
      },
    });

    return published;
  });
}

/** The version a new assessment of this kind should run against. */
export async function activeVersion(templateId: string) {
  const [row] = await db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.status, "published"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Published templates an organisation can start an assessment from. */
export async function availableTemplates(
  organisationId: string,
  kind?: TemplateKind,
) {
  return db
    .select({
      template: templates,
      version: templateVersions,
    })
    .from(templates)
    .innerJoin(
      templateVersions,
      and(
        eq(templateVersions.templateId, templates.id),
        eq(templateVersions.status, "published"),
      ),
    )
    .where(
      kind
        ? and(eq(templates.organisationId, organisationId), eq(templates.kind, kind))
        : eq(templates.organisationId, organisationId),
    )
    .orderBy(templates.kind, templates.name);
}

/** Guards against two published versions slipping through concurrently. */
export async function assertSinglePublishedVersion(templateId: string) {
  const rows = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from template_version
    where template_id = ${templateId} and status = 'published'
  `);
  return Number(rows[0]?.count ?? 0);
}
