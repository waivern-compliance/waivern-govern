"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities, templateVersions, templates } from "@/db/schema";
import { requireCapability } from "@/lib/session";
import { createAssessment } from "@/services/assessments";

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
