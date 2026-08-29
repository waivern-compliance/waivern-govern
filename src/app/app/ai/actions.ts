"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { requireCapability } from "@/lib/session";
import {
  createUseCase,
  updateUseCase,
  type LifecycleStage,
  type Provenance,
  type SystemType,
} from "@/services/ai-register";

export async function registerUseCase(formData: FormData) {
  const entityId = String(formData.get("entityId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const purpose = String(formData.get("purpose") ?? "").trim();
  if (!entityId || !name || !purpose) return;

  const active = await requireCapability("record.write", { entityId });

  const [entity] = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.organisationId, active.membership.organisationId)),
    );
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
    vendor: String(formData.get("vendor") ?? "") || undefined,
    // Owner is optional on purpose: refusing to record a system until somebody
    // volunteers to own it is how shadow AI stays off the register.
    ownerId: owned ? active.userId : null,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/ai");
  redirect(`/app/ai/${useCase.id}`);
}

export async function updateUseCaseAction(useCaseId: string, formData: FormData) {
  const active = await requireCapability("record.write");
  const stage = formData.get("lifecycleStage");
  const claim = formData.get("claimOwnership") === "on";

  await updateUseCase({
    useCaseId,
    organisationId: active.membership.organisationId,
    changes: {
      ...(stage ? { lifecycleStage: stage as LifecycleStage } : {}),
      ...(claim ? { ownerId: active.userId } : {}),
    },
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(`/app/ai/${useCaseId}`);
  revalidatePath("/app/ai");
}
