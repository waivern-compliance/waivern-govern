import { and, desc, eq, sql } from "drizzle-orm";
import { db, withOrganisation } from "@/db/client";
import { entities, legalReferences, templates, templateVersions } from "@/db/schema";
import type { templateKind } from "@/db/schema";
import { appendAuditEvent, type AuditInput } from "@/lib/audit";
import { canonicalise } from "@/lib/canonical";
import { LEGAL_REFERENCES, SYSTEM_TEMPLATES } from "@/lib/templates/library";
import type { AiFrameworkId } from "@/lib/ai-frameworks";
import { aiFrameworkOf } from "./ai-framework";
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

/** Raised when somebody configures a kind of template their role does not reach. */
export class OutsideYourKinds extends Error {}

/**
 * The kinds the caller may configure: `null` or absent for every kind. Passed
 * by the screens from `kindsFor`, so a role limited to some kinds — the AI
 * governance lead — is held to them here and not only by hidden buttons.
 */
type KindLimit = readonly string[] | null | undefined;

function reach(kind: string, kinds: KindLimit) {
  if (kinds && !kinds.includes(kind)) {
    throw new OutsideYourKinds(
      `Your role does not configure ${kind.replace(/_/g, " ")} templates or workflows.`,
    );
  }
}

/** A template's kind, found within the organisation, or an error if it is not there. */
async function kindOfTemplate(executor: Pick<typeof db, "select">, organisationId: string, templateId: string) {
  const [row] = await executor
    .select({ kind: templates.kind })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.organisationId, organisationId)));
  if (!row) throw new Error("No such template");
  return row.kind;
}

/** The same, from one of the template's versions. */
async function kindOfVersion(executor: Pick<typeof db, "select">, organisationId: string, versionId: string) {
  const [row] = await executor
    .select({ kind: templates.kind })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(and(eq(templateVersions.id, versionId), eq(templates.organisationId, organisationId)));
  if (!row) throw new Error("No such template version");
  return row.kind;
}

export async function createTemplate(input: {
  organisationId: string;
  kind: TemplateKind;
  name: string;
  description?: string;
  jurisdiction?: string;
  isSystem?: boolean;
  definition: TemplateDefinition;
  kinds?: KindLimit;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    reach(input.kind, input.kinds);
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
  kinds?: KindLimit;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      reach(await kindOfTemplate(tx, input.organisationId, input.templateId), input.kinds);
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
  });
}

export async function updateDraft(input: {
  organisationId: string;
  versionId: string;
  definition: TemplateDefinition;
  notes?: string;
  kinds?: KindLimit;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    const definition = templateDefinition.parse(input.definition);

    return db.transaction(async (tx) => {
      reach(await kindOfVersion(tx, input.organisationId, input.versionId), input.kinds);
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
  kinds?: KindLimit;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    return db.transaction(async (tx) => {
      reach(await kindOfVersion(tx, input.organisationId, input.versionId), input.kinds);
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
  });
}

/**
 * Shipped templates this organisation does not have yet.
 *
 * Matched by name among its system templates. A client who copied one of ours
 * and renamed the copy still has the original under its own name, so this
 * never offers to install something they already hold. A template tied to an
 * AI governance framework is offered only to organisations following it.
 */
export async function shippedTemplatesMissing(organisationId: string) {
  const framework = await aiFrameworkOf(organisationId);
  return withOrganisation(organisationId, async () => {
    const [held, [competent]] = await Promise.all([
      db
        .select({ name: templates.name })
        .from(templates)
        .where(and(eq(templates.organisationId, organisationId), eq(templates.isSystem, true))),
      db
        .select({ id: entities.id })
        .from(entities)
        .where(and(eq(entities.organisationId, organisationId), eq(entities.competentAuthority, true)))
        .limit(1),
    ]);
    const names = new Set(held.map((h) => h.name));
    return SYSTEM_TEMPLATES.filter(
      (t) =>
        !names.has(t.name) &&
        (t.aiFramework === undefined || t.aiFramework === framework) &&
        // The Part 3 DPIA is offered once an entity is a competent authority.
        (!t.competentAuthority || competent !== undefined),
    );
  });
}

/** Add any reference the shipped templates cite that the shared library lacks. */
async function ensureLegalReferences() {
  const now = new Date();
  for (const ref of LEGAL_REFERENCES) {
    await db
      .insert(legalReferences)
      .values({ ...ref, reviewedAt: now })
      .onConflictDoNothing({ target: legalReferences.code });
  }
}

/**
 * Bring an existing organisation up to date with what Waivern ships.
 *
 * System templates used to arrive only when an organisation was first seeded,
 * so a template released afterwards — the DSIT AI risk identification, for one
 * — never reached the clients already using the platform. This installs the
 * missing ones, through the same create-and-publish path as everything else,
 * so they pass the same validation.
 *
 * The legal references they cite go in first: the library is shared across
 * organisations, and a template citing a code that is not there yet would show
 * a blank where its legal basis should be. Existing references are left as
 * they are — their review dates are claims somebody made, and re-stamping them
 * here would make every citation look freshly checked.
 */
export async function installShippedTemplates(input: {
  organisationId: string;
  /** Install only these kinds: what a role limited to some kinds may add. */
  kinds?: KindLimit;
  /** Install only the templates tied to this AI governance framework. */
  aiFramework?: AiFrameworkId;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    await ensureLegalReferences();

    const installed: string[] = [];
    for (const t of await shippedTemplatesMissing(input.organisationId)) {
      if (input.kinds && !input.kinds.includes(t.kind)) continue;
      if (input.aiFramework && t.aiFramework !== input.aiFramework) continue;
      const { version } = await createTemplate({
        organisationId: input.organisationId,
        kind: t.kind,
        name: t.name,
        description: t.description,
        jurisdiction: t.jurisdiction,
        isSystem: true,
        definition: t.definition,
        actor: input.actor,
      });
      await publishVersion({
        organisationId: input.organisationId,
        versionId: version.id,
        actor: input.actor,
      });
      installed.push(t.name);
    }
    return installed;
  });
}

/**
 * Shipped templates whose published version is behind what Waivern now ships.
 *
 * Compared on the whole definition, canonically, so a change to one question's
 * help text counts — the point is that the client is running what we ship. A
 * template with an open draft is reported but cannot be updated until the
 * draft is published or abandoned, because two drafts of one template would
 * leave nobody sure which was meant.
 */
export async function shippedTemplatesOutdated(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({ template: templates, version: templateVersions })
      .from(templates)
      .innerJoin(
        templateVersions,
        and(eq(templateVersions.templateId, templates.id), eq(templateVersions.status, "published")),
      )
      .where(and(eq(templates.organisationId, organisationId), eq(templates.isSystem, true)));
    const drafts = new Set(
      (
        await db
          .select({ templateId: templateVersions.templateId })
          .from(templateVersions)
          .innerJoin(templates, eq(templates.id, templateVersions.templateId))
          .where(and(eq(templates.organisationId, organisationId), eq(templateVersions.status, "draft")))
      ).map((d) => d.templateId),
    );

    const outdated: Array<{
      templateId: string;
      kind: TemplateKind;
      name: string;
      version: number;
      blockedByDraft: boolean;
    }> = [];
    for (const { template, version } of rows) {
      const shipped = SYSTEM_TEMPLATES.find((t) => t.name === template.name);
      if (!shipped) continue;
      const current = canonicalise(templateDefinition.parse(shipped.definition));
      if (canonicalise(version.definition) === current) continue;
      outdated.push({
        templateId: template.id,
        kind: template.kind,
        name: template.name,
        version: version.version,
        blockedByDraft: drafts.has(template.id),
      });
    }
    return outdated;
  });
}

/**
 * Publish what Waivern now ships as the next version of each outdated template.
 *
 * A new version, never an edit: assessments already run keep the questions
 * they answered, and new ones get the current set.
 */
export async function updateShippedTemplates(input: {
  organisationId: string;
  kinds?: KindLimit;
  actor: Actor;
}) {
  return withOrganisation(input.organisationId, async () => {
    await ensureLegalReferences();
    const updated: string[] = [];
    for (const t of await shippedTemplatesOutdated(input.organisationId)) {
      if (t.blockedByDraft) continue;
      if (input.kinds && !input.kinds.includes(t.kind)) continue;
      const shipped = SYSTEM_TEMPLATES.find((s) => s.name === t.name)!;
      const draft = await createDraftFrom({
        organisationId: input.organisationId,
        templateId: t.templateId,
        definition: shipped.definition,
        notes: "Updated to the version Waivern ships.",
        actor: input.actor,
      });
      await publishVersion({ organisationId: input.organisationId, versionId: draft.id, actor: input.actor });
      updated.push(t.name);
    }
    return updated;
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
  return withOrganisation(organisationId, async () => {
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
  });
}

/** Guards against two published versions slipping through concurrently. */
export async function assertSinglePublishedVersion(templateId: string) {
  const rows = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from template_version
    where template_id = ${templateId} and status = 'published'
  `);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Every template, with every version — drafts included.
 *
 * `availableTemplates` deliberately returns only what an assessment can be
 * started from. Authoring needs the opposite view: a template whose only
 * version is an unpublished draft is invisible there, and is exactly what
 * somebody editing came to find.
 */
export async function templateLibrary(organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const rows = await db
      .select({ template: templates, version: templateVersions })
      .from(templates)
      .leftJoin(templateVersions, eq(templateVersions.templateId, templates.id))
      .where(eq(templates.organisationId, organisationId))
      .orderBy(templates.kind, templates.name, desc(templateVersions.version));

    const byTemplate = new Map<
      string,
      { template: typeof templates.$inferSelect; versions: (typeof templateVersions.$inferSelect)[] }
    >();
    for (const { template, version } of rows) {
      const entry = byTemplate.get(template.id) ?? { template, versions: [] };
      if (version) entry.versions.push(version);
      byTemplate.set(template.id, entry);
    }
    return [...byTemplate.values()];
  });
}

export async function loadTemplate(templateId: string, organisationId: string) {
  return withOrganisation(organisationId, async () => {
    const [row] = await db
      .select()
      .from(templates)
      .where(and(eq(templates.id, templateId), eq(templates.organisationId, organisationId)));
    if (!row) return null;

    const versions = await db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.templateId, templateId))
      .orderBy(desc(templateVersions.version));

    return {
      template: row,
      versions,
      published: versions.find((v) => v.status === "published") ?? null,
      draft: versions.find((v) => v.status === "draft") ?? null,
    };
  });
}
