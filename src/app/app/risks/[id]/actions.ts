"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/session";
import {
  acceptRisk,
  addMitigation,
  closeRisk,
  loadRisk,
  revokeAcceptance,
  setResidual,
  updateMitigation,
} from "@/services/risks";

export type ActionResult = { ok: true } | { ok: false; message: string };

/** The risk's entity scopes the check, not whatever the browser was showing. */
async function forRisk(riskId: string, capability: "risk.manage" | "risk.accept") {
  const session = await requireCapability(capability);
  const loaded = await loadRisk(riskId, session.membership.organisationId);
  if (!loaded) throw new Error("No such risk");
  const active = await requireCapability(capability, { entityId: loaded.risk.entityId });
  return { active, loaded };
}

function actorOf(a: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: a.userId, actorLabel: a.email };
}

export async function rateResidualAction(riskId: string, formData: FormData) {
  const { active } = await forRisk(riskId, "risk.manage");
  await setResidual({
    riskId,
    organisationId: active.membership.organisationId,
    likelihood: Number(formData.get("likelihood")),
    impact: Number(formData.get("impact")),
    actor: actorOf(active),
  });
  revalidatePath(`/app/risks/${riskId}`);
}

export async function addMitigationAction(riskId: string, formData: FormData) {
  const { active } = await forRisk(riskId, "risk.manage");
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  const due = String(formData.get("dueAt") ?? "");
  await addMitigation({
    riskId,
    organisationId: active.membership.organisationId,
    description,
    controlRef: String(formData.get("controlRef") ?? "") || undefined,
    ownerId: active.userId,
    dueAt: due ? new Date(due) : undefined,
    actor: actorOf(active),
  });
  revalidatePath(`/app/risks/${riskId}`);
}

export async function mitigationStatusAction(
  riskId: string,
  mitigationId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { active } = await forRisk(riskId, "risk.manage");
    await updateMitigation({
      mitigationId,
      organisationId: active.membership.organisationId,
      status: formData.get("status") as "planned" | "in_progress" | "implemented" | "verified" | "abandoned",
      evidenceRef: String(formData.get("evidenceRef") ?? "") || undefined,
      actor: actorOf(active),
    });
    revalidatePath(`/app/risks/${riskId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not update" };
  }
}

export async function acceptAction(riskId: string, formData: FormData): Promise<ActionResult> {
  try {
    const { active } = await forRisk(riskId, "risk.accept");
    const expires = String(formData.get("expiresAt") ?? "");
    if (!expires) return { ok: false, message: "An expiry date is required" };
    await acceptRisk({
      riskId,
      organisationId: active.membership.organisationId,
      rationale: String(formData.get("rationale") ?? ""),
      expiresAt: new Date(expires),
      actor: actorOf(active),
    });
    revalidatePath(`/app/risks/${riskId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not accept" };
  }
}

export async function revokeAction(
  riskId: string,
  acceptanceId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { active } = await forRisk(riskId, "risk.accept");
    await revokeAcceptance({
      acceptanceId,
      organisationId: active.membership.organisationId,
      reason: String(formData.get("reason") ?? ""),
      actor: actorOf(active),
    });
    revalidatePath(`/app/risks/${riskId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not revoke" };
  }
}

export async function closeAction(riskId: string, formData: FormData) {
  const { active } = await forRisk(riskId, "risk.manage");
  await closeRisk({
    riskId,
    organisationId: active.membership.organisationId,
    reason: String(formData.get("reason") ?? ""),
    actor: actorOf(active),
  });
  revalidatePath(`/app/risks/${riskId}`);
}
