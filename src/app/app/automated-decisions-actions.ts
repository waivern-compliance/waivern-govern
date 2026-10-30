"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/session";
import { refusable, type EditResult } from "@/lib/edit-result";
import { ADM_SAFEGUARD_KEYS } from "@/lib/gdpr/automated-decisions";
import {
  copyAutomatedDecisions,
  linkUseCaseToActivity,
  setAutomatedDecisions,
  unlinkUseCaseFromActivity,
  type AdmSide,
} from "@/services/automated-decisions";

const yesNo = (raw: FormDataEntryValue | null) => {
  const v = String(raw ?? "");
  return v === "yes" ? true : v === "no" ? false : null;
};

const PATH: Record<AdmSide, string> = { processing_activity: "/app/ropa", ai_use_case: "/app/ai" };

function revalidate(useCaseId: string, activityId: string) {
  revalidatePath(`/app/ai/${useCaseId}`);
  revalidatePath(`/app/ropa/${activityId}`);
  revalidatePath("/app/ropa");
  revalidatePath("/app/ai");
}

export async function saveAutomatedDecisionsAction(
  side: AdmSide,
  id: string,
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireCapability("record.write");
    await setAutomatedDecisions({
      organisationId: active.membership.organisationId,
      side,
      id,
      record: {
        automatedDecisions: yesNo(formData.get("automatedDecisions")),
        admSpecialCategory: yesNo(formData.get("admSpecialCategory")),
        admSpecialCondition: String(formData.get("admSpecialCondition") ?? "") || null,
        admSafeguards: Object.fromEntries(
          ADM_SAFEGUARD_KEYS.map((k) => [
            k,
            {
              confirmed: formData.get(`safeguard_${k}`) === "on",
              note: String(formData.get(`safeguardNote_${k}`) ?? ""),
            },
          ]),
        ),
      },
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath(`${PATH[side]}/${id}`);
    revalidatePath(PATH[side]);
  });
}

export async function copyAutomatedDecisionsAction(
  useCaseId: string,
  activityId: string,
  to: AdmSide,
): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireCapability("record.write");
    await copyAutomatedDecisions({
      organisationId: active.membership.organisationId,
      useCaseId,
      activityId,
      to,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidate(useCaseId, activityId);
  });
}

export async function linkActivityAction(
  useCaseId: string,
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  return refusable(async () => {
    const activityId = String(formData.get("activityId") ?? "");
    if (!activityId) throw new Error("Choose a processing activity to link.");
    const active = await requireCapability("record.write");
    await linkUseCaseToActivity({
      organisationId: active.membership.organisationId,
      useCaseId,
      activityId,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidate(useCaseId, activityId);
  });
}

export async function unlinkActivityAction(
  useCaseId: string,
  activityId: string,
): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireCapability("record.write");
    await unlinkUseCaseFromActivity({
      organisationId: active.membership.organisationId,
      useCaseId,
      activityId,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidate(useCaseId, activityId);
  });
}
