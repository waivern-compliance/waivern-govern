"use server";

import { revalidatePath } from "next/cache";
import { mayEditAiProfile } from "@/lib/rbac";
import { NotPermitted, requireCapability } from "@/lib/session";
import { ProfileRefused, setProfileItem } from "@/services/ai-profile";

export type ProfileResult = { ok: boolean; message: string } | null;

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export async function setProfileItemAction(code: string, _prev: ProfileResult, formData: FormData): Promise<ProfileResult> {
  const active = await requireCapability("record.read");
  if (!mayEditAiProfile(active.membership.grants)) throw new NotPermitted("risk.manage");
  try {
    const { changed } = await setProfileItem({
      organisationId: active.membership.organisationId,
      code,
      current: text(formData.get("current")) || null,
      target: text(formData.get("target")) || null,
      notes: text(formData.get("notes")) || null,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath("/app/ai/profile");
    return { ok: true, message: changed ? "Saved." : "Nothing had changed." };
  } catch (error) {
    if (error instanceof ProfileRefused) return { ok: false, message: error.message };
    throw error;
  }
}
