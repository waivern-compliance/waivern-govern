"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/session";
import { reviewCountry, type AdequacyStatus, type RiskLevel } from "@/services/countries";

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function reviewAction(code: string, formData: FormData): Promise<ActionResult> {
  try {
    // Reviewing country information is maintaining a reference the whole
    // organisation relies on, so it needs the same standing as changing a
    // template — not merely the ability to answer a question.
    const active = await requireCapability("template.author");
    await reviewCountry({
      organisationId: active.membership.organisationId,
      code,
      note: String(formData.get("note") ?? ""),
      changes: {
        ukAdequacy: formData.get("ukAdequacy") as AdequacyStatus,
        euAdequacy: formData.get("euAdequacy") as AdequacyStatus,
        governmentAccess: formData.get("governmentAccess") as RiskLevel,
        redress: formData.get("redress") as RiskLevel,
      },
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath("/app/countries");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not record the review" };
  }
}
