"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAiFramework } from "@/lib/ai-frameworks";
import { mayChooseAiFramework } from "@/lib/rbac";
import { NotPermitted, requireCapability } from "@/lib/session";
import { FrameworkSwitchRefused, switchAiFramework } from "@/services/ai-framework-switch";
import type { AdminResult } from "../actions";

export async function switchAiFrameworkAction(to: string, _prev: AdminResult): Promise<AdminResult> {
  const active = await requireCapability("workflow.configure");
  if (!mayChooseAiFramework(active.membership.grants)) throw new NotPermitted("workflow.configure");
  if (!isAiFramework(to)) return { ok: false, message: "Choose a framework." };

  let done;
  try {
    done = await switchAiFramework({
      organisationId: active.membership.organisationId,
      to,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
  } catch (error) {
    if (error instanceof FrameworkSwitchRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/app", "layout");
  // Back to the page without a preview, which now has nothing to compare;
  // the outcome travels in the address so the page can say what happened.
  const outcome = new URLSearchParams({
    switched: to,
    refiled: String(done.refiled),
    proposed: String(done.appetiteProposed.length),
    installed: String(done.installed.length),
  });
  redirect(`/app/admin/ai-framework?${outcome}`);
}
