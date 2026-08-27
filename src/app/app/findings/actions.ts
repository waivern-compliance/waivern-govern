"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/session";
import { convertFindingToRisk, dismissFinding } from "@/services/ingest";

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function raiseAsRiskAction(
  findingId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const active = await requireCapability("risk.manage");
    await convertFindingToRisk({
      findingId,
      organisationId: active.membership.organisationId,
      title: String(formData.get("title") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      likelihood: Number(formData.get("likelihood")),
      impact: Number(formData.get("impact")),
      ownerId: active.userId,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath("/app/findings");
    revalidatePath("/app/risks");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not raise the risk" };
  }
}

export async function dismissAction(
  findingId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const active = await requireCapability("risk.manage");
    await dismissFinding({
      findingId,
      organisationId: active.membership.organisationId,
      reason: String(formData.get("reason") ?? ""),
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath("/app/findings");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not dismiss" };
  }
}
