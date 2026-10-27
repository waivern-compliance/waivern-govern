"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiUseCases, entities, suppliers, templateVersions, templates } from "@/db/schema";
import { requireCapability } from "@/lib/session";
import { createAssessment } from "@/services/assessments";
import { KINDS_FOR, type AssessableSubject } from "@/lib/assessment-subjects";

export async function startAssessment(formData: FormData) {
  const templateVersionId = String(formData.get("templateVersionId") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!templateVersionId || !entityId || !title) return;

  const active = await requireCapability("assessment.create", { entityId });

  // The entity must belong to the caller's organisation. Without this, a valid
  // capability check still lets a crafted form point at another tenant's entity.
  const [entity] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.id, entityId),
        eq(entities.organisationId, active.membership.organisationId),
      ),
    );
  if (!entity) throw new Error("No such entity");

  const [version] = await db
    .select({ v: templateVersions })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(
        eq(templateVersions.id, templateVersionId),
        eq(templates.organisationId, active.membership.organisationId),
      ),
    );
  if (!version) throw new Error("No such template");

  const assessment = await createAssessment({
    organisationId: active.membership.organisationId,
    entityId,
    templateVersionId,
    title,
    ownerId: active.userId,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/assessments");
  redirect(`/app/assessments/${assessment.id}`);
}

/**
 * Start an assessment about one record — an AI system, a supplier — so the
 * record's register can read back what it concludes.
 *
 * The subject decides the entity: an AI system's own, or for a supplier, which
 * belongs to the whole organisation, the default entity.
 */
export async function startAssessmentFor(
  subjectType: AssessableSubject,
  subjectId: string,
  formData: FormData,
) {
  const session = await requireCapability("assessment.create");
  const org = session.membership.organisationId;
  const templateVersionId = String(formData.get("templateVersionId") ?? "");

  let entityId: string;
  let name: string;
  if (subjectType === "ai_use_case") {
    const [row] = await db
      .select()
      .from(aiUseCases)
      .where(and(eq(aiUseCases.id, subjectId), eq(aiUseCases.organisationId, org)));
    if (!row) throw new Error("No such AI system");
    entityId = row.entityId;
    name = row.name;
  } else {
    const [row] = await db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.id, subjectId), eq(suppliers.organisationId, org)));
    if (!row) throw new Error("No such supplier");
    const [home] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.organisationId, org), eq(entities.isDefault, true)));
    if (!home) throw new Error("The organisation has no default entity");
    entityId = home.id;
    name = row.name;
  }

  const active = await requireCapability("assessment.create", { entityId });

  const [version] = await db
    .select({ kind: templates.kind, templateName: templates.name })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(and(eq(templateVersions.id, templateVersionId), eq(templates.organisationId, org)));
  if (!version || !KINDS_FOR[subjectType].includes(version.kind)) {
    throw new Error("That template does not fit this record");
  }

  const assessment = await createAssessment({
    organisationId: org,
    entityId,
    templateVersionId,
    title: `${version.templateName}: ${name}`,
    ownerId: active.userId,
    subjectType,
    subjectId,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/assessments");
  redirect(`/app/assessments/${assessment.id}`);
}
