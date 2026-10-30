"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { refusable, type EditResult } from "@/lib/edit-result";
import { can, scopedEntityIds, type Grant } from "@/lib/rbac";
import { requireSession } from "@/lib/session";
import {
  createPolicyDocument,
  deletePolicyDocument,
  loadPolicyDocument,
  recordPolicyReview,
  updatePolicyDocument,
  withdrawPolicyDocument,
} from "@/services/policy-documents";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const actorOf = (active: { userId: string; email: string }) => ({
  actorKind: "user" as const,
  actorUserId: active.userId,
  actorLabel: active.email,
});

/**
 * A document for one entity is that entity's writers' to change; one for the
 * whole organisation needs write access across it, not only to one entity.
 */
function mayWritePolicy(grants: readonly Grant[], entityId: string | null): boolean {
  return entityId ? can(grants, "record.write", entityId) : scopedEntityIds(grants, "record.write") === null;
}

async function writerOf(id: string) {
  const active = await requireSession();
  const loaded = await loadPolicyDocument(id, active.membership.organisationId);
  if (!loaded || !(mayWritePolicy(active.membership.grants, loaded.doc.entityId))) {
    throw new Error("You may not change this policy document.");
  }
  return { active, loaded };
}

const fields = (formData: FormData) => ({
  title: text(formData.get("title")),
  version: text(formData.get("version")) || null,
  conditions: formData.getAll("conditions").map(String),
  ownerId: text(formData.get("ownerId")) || null,
  entityId: text(formData.get("entityId")) || null,
});

export async function createPolicyDocumentAction(_prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireSession();
    const f = fields(formData);
    if (!(mayWritePolicy(active.membership.grants, f.entityId))) {
      throw new Error("You may not add a policy document there.");
    }
    const reviewed = text(formData.get("lastReviewedAt"));
    const row = await createPolicyDocument({
      organisationId: active.membership.organisationId,
      ...f,
      lastReviewedAt: reviewed ? new Date(reviewed) : null,
      actor: actorOf(active),
    });
    revalidatePath("/app/policy-documents");
    revalidatePath("/app/ropa");
    redirect(`/app/policy-documents/${row.id}`);
  });
}

export async function updatePolicyDocumentAction(id: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const { active } = await writerOf(id);
    const f = fields(formData);
    if (!(mayWritePolicy(active.membership.grants, f.entityId))) {
      throw new Error("You may not move it there.");
    }
    await updatePolicyDocument({ id, organisationId: active.membership.organisationId, changes: f, actor: actorOf(active) });
    revalidatePath(`/app/policy-documents/${id}`);
    revalidatePath("/app/policy-documents");
    revalidatePath("/app/ropa");
  });
}

export async function reviewPolicyDocumentAction(id: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const { active } = await writerOf(id);
    const on = text(formData.get("reviewedAt"));
    await recordPolicyReview({
      id,
      organisationId: active.membership.organisationId,
      reviewedAt: on ? new Date(on) : undefined,
      actor: actorOf(active),
    });
    revalidatePath(`/app/policy-documents/${id}`);
    revalidatePath("/app/policy-documents");
  });
}

export async function withdrawPolicyDocumentAction(id: string): Promise<EditResult> {
  return refusable(async () => {
    const { active } = await writerOf(id);
    await withdrawPolicyDocument({ id, organisationId: active.membership.organisationId, actor: actorOf(active) });
    revalidatePath(`/app/policy-documents/${id}`);
    revalidatePath("/app/policy-documents");
    revalidatePath("/app/ropa");
  });
}

export async function deletePolicyDocumentAction(id: string): Promise<EditResult> {
  return refusable(async () => {
    const { active } = await writerOf(id);
    await deletePolicyDocument({ id, organisationId: active.membership.organisationId, actor: actorOf(active) });
    revalidatePath("/app/policy-documents");
    redirect("/app/policy-documents");
  });
}
