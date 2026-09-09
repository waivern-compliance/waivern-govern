"use server";

import { revalidatePath } from "next/cache";
import type { AppRole } from "@/lib/rbac";
import { requireCapability } from "@/lib/session";
import { RoutingRefused, resetWorkflow, updateStage } from "@/services/approval-routing";
import type { RoutingCondition } from "@/lib/workflow/routing";

export type RoutingResult = { ok: boolean; message: string } | null;

/**
 * Build the condition from a small menu, or keep the one already there.
 *
 * A stage whose rule is nested and/or is left alone: the form shows it in
 * English and offers no way to rebuild it, because offering one invites
 * somebody to replace a rule they did not fully read.
 */
function conditionFrom(formData: FormData): RoutingCondition | undefined {
  const op = String(formData.get("conditionOp") ?? "");
  if (!op || op === "keep") return undefined;

  switch (op) {
    case "always":
      return { op: "always" };
    case "specialCategoryData":
      return { op: "specialCategoryData" };
    case "transferToNonAdequate":
      return { op: "transferToNonAdequate" };
    case "scoreAtLeast":
      return { op: "scoreAtLeast", value: Number(formData.get("conditionScore") ?? 0) };
    case "tierAtLeast":
      return {
        op: "tierAtLeast",
        value: String(formData.get("conditionTier") ?? "high") as "low" | "medium" | "high" | "critical",
      };
    default:
      return undefined;
  }
}

export async function updateStageAction(
  stageId: string,
  _prev: RoutingResult,
  formData: FormData,
): Promise<RoutingResult> {
  const active = await requireCapability("workflow.configure");

  const sla = String(formData.get("slaHours") ?? "").trim();
  try {
    const { redirected } = await updateStage({
      organisationId: active.membership.organisationId,
      stageId,
      name: String(formData.get("name") ?? ""),
      requiredRole: String(formData.get("requiredRole") ?? "") as AppRole,
      slaHours: sla === "" ? null : Number(sla),
      condition: conditionFrom(formData),
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath("/app/admin/workflows");
    return {
      ok: true,
      message:
        redirected === 0
          ? "Saved."
          : `Saved. ${redirected} approval${redirected === 1 ? "" : "s"} already waiting ${
              redirected === 1 ? "was" : "were"
            } redirected to the new role.`,
    };
  } catch (error) {
    if (error instanceof RoutingRefused) return { ok: false, message: error.message };
    throw error;
  }
}

export async function resetWorkflowAction(templateKind: string) {
  const active = await requireCapability("workflow.configure");
  await resetWorkflow({
    organisationId: active.membership.organisationId,
    templateKind,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath("/app/admin/workflows");
}
