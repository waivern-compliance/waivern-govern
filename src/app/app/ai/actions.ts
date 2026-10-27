"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { requireCapability } from "@/lib/session";
import {
  DEPLOYMENT_PATTERN_LABEL,
  TRANSPARENCY_SCOPE_LABEL,
  createUseCase,
  updateUseCase,
  type DeploymentPattern,
  type LifecycleStage,
  type TransparencyScope,
  type Provenance,
  type SystemType,
} from "@/services/ai-register";
import { candidatesFor } from "@/services/handover";
import { refusable, type EditResult } from "@/lib/edit-result";

/** A submitted ATRS scope, or null for "not yet decided". */
function scopeFrom(value: FormDataEntryValue | null): TransparencyScope | null {
  const v = String(value ?? "");
  if (v === "") return null;
  if (!(v in TRANSPARENCY_SCOPE_LABEL)) throw new Error("Unknown transparency scope");
  return v as TransparencyScope;
}

/** A submitted pattern, or null for "not yet known". Anything else is refused. */
function patternFrom(value: FormDataEntryValue | null): DeploymentPattern | null {
  const v = String(value ?? "");
  if (v === "") return null;
  if (!(v in DEPLOYMENT_PATTERN_LABEL)) throw new Error("Unknown deployment pattern");
  return v as DeploymentPattern;
}

export async function registerUseCase(formData: FormData) {
  const entityId = String(formData.get("entityId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  if (!entityId || !name || !purpose) return;

  const active = await requireCapability("record.write", { entityId });

  const [entity] = await scoped(active.membership.organisationId, () => db
    .select()
    .from(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.organisationId, active.membership.organisationId)),
    ));
  if (!entity) throw new Error("No such entity");

  const owned = formData.get("ownMe") === "on";

  const useCase = await createUseCase({
    organisationId: active.membership.organisationId,
    entityId,
    name,
    purpose,
    systemType: formData.get("systemType") as SystemType,
    provenance: formData.get("provenance") as Provenance,
    lifecycleStage: formData.get("lifecycleStage") as LifecycleStage,
    deploymentPattern: patternFrom(formData.get("deploymentPattern")),
    vendor: String(formData.get("vendor") ?? "") || undefined,
    // Owner is optional on purpose: refusing to record a system until somebody
    // volunteers to own it is how shadow AI stays off the register.
    ownerId: owned ? active.userId : null,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/ai");
  redirect(`/app/ai/${useCase.id}`);
}

export async function updateUseCaseAction(
  useCaseId: string,
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireCapability("record.write");
    const organisationId = active.membership.organisationId;
    const claim = formData.get("claimOwnership") === "on";

    // A person can only be named if they are an active member. Taking a user id
    // from the form on trust would let anyone be recorded as accountable for a
    // system, including somebody who has left or was never here.
    const members = new Set((await candidatesFor(organisationId)).map((m) => m.id));
    const person = (field: string): string | null | undefined => {
      if (!formData.has(field)) return undefined;
      const id = String(formData.get(field) ?? "");
      if (id === "") return null;
      if (!members.has(id)) throw new Error("That person is not an active member");
      return id;
    };
    const ownerId = claim ? active.userId : person("ownerId");
    const governanceOfficerId = person("governanceOfficerId");
    const review = String(formData.get("nextReviewAt") ?? "");

    await updateUseCase({
      useCaseId,
      organisationId,
      changes: {
        ...(formData.has("deploymentPattern")
          ? { deploymentPattern: patternFrom(formData.get("deploymentPattern")) }
          : {}),
        ...(ownerId !== undefined ? { ownerId } : {}),
        ...(governanceOfficerId !== undefined ? { governanceOfficerId } : {}),
        ...(formData.has("responsibleTeam")
          ? { responsibleTeam: String(formData.get("responsibleTeam")).trim() || null }
          : {}),
        ...(formData.has("transparencyScope")
          ? { transparencyScope: scopeFrom(formData.get("transparencyScope")) }
          : {}),
        ...(formData.has("nextReviewAt")
          ? { nextReviewAt: review ? new Date(`${review}T00:00:00Z`) : null }
          : {}),
        // The service checks it belongs to this organisation.
        ...(formData.has("supplierId")
          ? { supplierId: String(formData.get("supplierId")) || null }
          : {}),
      },
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath(`/app/ai/${useCaseId}`);
    revalidatePath("/app/ai");
  });
}
