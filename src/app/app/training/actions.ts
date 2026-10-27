"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { TrainingRefused, recordTraining } from "@/services/training";

export type TrainingResult = { ok: boolean; message: string } | null;

/**
 * Record a completion. For yourself, anyone may; for somebody else, only
 * someone who manages people — otherwise anybody could vouch for anybody.
 */
export async function recordAction(_prev: TrainingResult, formData: FormData): Promise<TrainingResult> {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const forUser = String(formData.get("userId") ?? "") || active.userId;
  if (forUser !== active.userId && !can(active.membership.grants, "member.manage")) {
    return { ok: false, message: "Only somebody who manages people can record learning for someone else." };
  }
  const course = String(formData.get("courseKey") ?? "");
  const completed = String(formData.get("completedAt") ?? "");
  try {
    await recordTraining({
      organisationId: active.membership.organisationId,
      userId: forUser,
      courseKey: course === "other" || course === "" ? null : course,
      title: String(formData.get("title") ?? ""),
      completedAt: new Date(completed ? `${completed}T00:00:00Z` : "invalid"),
      evidenceRef: String(formData.get("evidenceRef") ?? ""),
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
  } catch (error) {
    if (error instanceof TrainingRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/app/training");
  revalidatePath("/app/ai");
  return { ok: true, message: "Recorded." };
}
