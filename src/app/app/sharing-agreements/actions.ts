"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { refusable, type EditResult } from "@/lib/edit-result";
import { can } from "@/lib/rbac";
import { requireSession } from "@/lib/session";
import {
  addSharingParty,
  createSharingAgreement,
  endSharingAgreement,
  loadSharingAgreement,
  recordSharingReview,
  removeSharingParty,
  updateSharingAgreement,
  updateSharingParty,
} from "@/services/sharing-agreements";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const day = (v: FormDataEntryValue | null) => (text(v) ? new Date(`${text(v)}T00:00:00Z`) : null);
const actorOf = (active: { userId: string; email: string }) => ({
  actorKind: "user" as const,
  actorUserId: active.userId,
  actorLabel: active.email,
});

/** The signed-in person, allowed to write in the entity the agreement belongs to. */
async function writerOf(id: string) {
  const active = await requireSession();
  const loaded = await loadSharingAgreement(id, active.membership.organisationId);
  if (!loaded || !can(active.membership.grants, "record.write", loaded.agreement.entityId)) {
    throw new Error("You may not change this agreement.");
  }
  return active;
}

const refresh = (id?: string) => {
  if (id) revalidatePath(`/app/sharing-agreements/${id}`);
  revalidatePath("/app/sharing-agreements");
  revalidatePath("/app/ropa");
  revalidatePath("/app/third-parties");
};

const basisOf = (formData: FormData) => ({
  lawfulBases: formData.getAll("lawfulBases").map(String),
  schedule1Condition: text(formData.get("schedule1Condition")) || null,
  art10Condition: text(formData.get("art10Condition")) || null,
});

export async function createSharingAgreementAction(_prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireSession();
    const entityId = text(formData.get("entityId"));
    if (!can(active.membership.grants, "record.write", entityId)) throw new Error("You may not add an agreement there.");
    const row = await createSharingAgreement({
      organisationId: active.membership.organisationId,
      entityId,
      title: text(formData.get("title")),
      actor: actorOf(active),
    });
    refresh();
    redirect(`/app/sharing-agreements/${row.id}`);
  });
}

export async function updateSharingAgreementAction(id: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerOf(id);
    await updateSharingAgreement({
      id,
      organisationId: active.membership.organisationId,
      changes: {
        title: text(formData.get("title")),
        purpose: text(formData.get("purpose")) || null,
        direction: text(formData.get("direction")),
        gatewayKind: text(formData.get("gatewayKind")) || null,
        gateway: text(formData.get("gateway")) || null,
        dataShared: text(formData.get("dataShared")) || null,
        ...basisOf(formData),
        ownerId: text(formData.get("ownerId")) || null,
        signedAt: day(formData.get("signedAt")),
        reviewDueAt: day(formData.get("reviewDueAt")),
        activityIds: formData.getAll("activityIds").map(String),
      },
      actor: actorOf(active),
    });
    refresh(id);
  });
}

export async function addSharingPartyAction(id: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerOf(id);
    const supplierId = text(formData.get("supplierId"));
    if (!supplierId) throw new Error("Choose the other controller.");
    await addSharingParty({ agreementId: id, organisationId: active.membership.organisationId, supplierId, actor: actorOf(active) });
    refresh(id);
  });
}

export async function updateSharingPartyAction(id: string, partyId: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerOf(id);
    await updateSharingParty({
      partyId,
      organisationId: active.membership.organisationId,
      basis: basisOf(formData),
      note: text(formData.get("note")) || null,
      actor: actorOf(active),
    });
    refresh(id);
  });
}

export async function removeSharingPartyAction(id: string, partyId: string): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerOf(id);
    await removeSharingParty({ partyId, organisationId: active.membership.organisationId, actor: actorOf(active) });
    refresh(id);
  });
}

export async function reviewSharingAgreementAction(id: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerOf(id);
    const next = day(formData.get("nextReviewDueAt"));
    if (!next) throw new Error("Say when it is next due for review.");
    await recordSharingReview({ id, organisationId: active.membership.organisationId, nextReviewDueAt: next, actor: actorOf(active) });
    refresh(id);
  });
}

export async function endSharingAgreementAction(id: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerOf(id);
    await endSharingAgreement({ id, organisationId: active.membership.organisationId, reason: text(formData.get("reason")), actor: actorOf(active) });
    refresh(id);
  });
}
