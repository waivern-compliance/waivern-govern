"use server";

import { revalidatePath } from "next/cache";
import { STAGE_ORDER, type Stage } from "@/lib/ai/lifecycle";
import { can } from "@/lib/rbac";
import { requireCapability } from "@/lib/session";
import { loadUseCase } from "@/services/ai-register";
import { ChangeRefused, GateNotMet, changeStage, recordChange } from "@/services/ai-lifecycle";

export type LifecycleResult = { ok: boolean; message: string } | null;

function actorOf(a: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: a.userId, actorLabel: a.email };
}

/** The system's own entity decides who may act on it. */
async function forUseCase(useCaseId: string) {
  const session = await requireCapability("record.write");
  const loaded = await loadUseCase(useCaseId, session.membership.organisationId);
  if (!loaded) throw new Error("No such AI use case");
  const active = await requireCapability("record.write", { entityId: loaded.useCase.entityId });
  return { active, entityId: loaded.useCase.entityId };
}

function explained(error: unknown): LifecycleResult {
  if (error instanceof GateNotMet || error instanceof ChangeRefused) {
    return { ok: false, message: error.message };
  }
  throw error;
}

export async function changeStageAction(
  useCaseId: string,
  _prev: LifecycleResult,
  formData: FormData,
): Promise<LifecycleResult> {
  const { active, entityId } = await forUseCase(useCaseId);
  const to = String(formData.get("to") ?? "") as Stage;
  if (!STAGE_ORDER.includes(to)) return { ok: false, message: "Choose a stage." };

  try {
    await changeStage({
      useCaseId,
      organisationId: active.membership.organisationId,
      to,
      summary: String(formData.get("summary") ?? ""),
      waiverReason: String(formData.get("waiverReason") ?? ""),
      mayWaive: can(active.membership.grants, "approval.decide", entityId),
      actor: actorOf(active),
    });
  } catch (error) {
    return explained(error);
  }
  revalidatePath(`/app/ai/${useCaseId}`);
  revalidatePath("/app/ai");
  return { ok: true, message: "Moved, and recorded in its history." };
}

export async function recordChangeAction(
  useCaseId: string,
  _prev: LifecycleResult,
  formData: FormData,
): Promise<LifecycleResult> {
  const { active } = await forUseCase(useCaseId);
  const kind = String(formData.get("kind") ?? "");
  if (kind !== "model" && kind !== "data" && kind !== "scope") {
    return { ok: false, message: "Say what kind of change it was." };
  }
  try {
    await recordChange({
      useCaseId,
      organisationId: active.membership.organisationId,
      kind,
      summary: String(formData.get("summary") ?? ""),
      validation: String(formData.get("validation") ?? ""),
      rollback: String(formData.get("rollback") ?? ""),
      actor: actorOf(active),
    });
  } catch (error) {
    return explained(error);
  }
  revalidatePath(`/app/ai/${useCaseId}`);
  revalidatePath("/app/ai");
  return {
    ok: true,
    message: "Recorded. Its review is now due, so its risks are looked at again.",
  };
}
