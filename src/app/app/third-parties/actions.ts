"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/session";
import { createSupplier, recordDpa, updateSupplier } from "@/services/third-party";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** An empty date field means "not known", which is different from an error. */
const date = (v: FormDataEntryValue | null) => {
  const raw = text(v);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

export async function addSupplier(formData: FormData) {
  const name = text(formData.get("name"));
  if (!name) return;

  const active = await requireCapability("record.write");
  const supplier = await createSupplier({
    organisationId: active.membership.organisationId,
    name,
    description: text(formData.get("description")) || undefined,
    categories: lines(formData.get("categories")),
    ownerId: formData.get("ownMe") === "on" ? active.userId : null,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/third-parties");
  redirect(`/app/third-parties/${supplier.id}`);
}

export async function updateSupplierAction(supplierId: string, formData: FormData) {
  const active = await requireCapability("record.write");
  const owner = formData.get("ownerId");

  await updateSupplier({
    supplierId,
    organisationId: active.membership.organisationId,
    changes: {
      name: text(formData.get("name")),
      description: text(formData.get("description")),
      categories: lines(formData.get("categories")),
      ...(owner !== null ? { ownerId: text(owner) || null } : {}),
    },
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath(`/app/third-parties/${supplierId}`);
  revalidatePath("/app/third-parties");
}

/**
 * Confirm that a third party a tool reported is really a processor.
 *
 * Separate from editing on purpose: this is the judgement the register is
 * asking for, and burying it in a form somebody may never submit would leave
 * scanner findings permanently untriaged.
 */
export async function confirmSupplierAction(supplierId: string) {
  const active = await requireCapability("record.write");
  await updateSupplier({
    supplierId,
    organisationId: active.membership.organisationId,
    changes: {},
    confirmBy: active.userId,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(`/app/third-parties/${supplierId}`);
  revalidatePath("/app/third-parties");
}

export async function recordDpaAction(supplierId: string, formData: FormData) {
  const title = text(formData.get("title"));
  if (!title) return;

  const active = await requireCapability("record.write");
  await recordDpa({
    organisationId: active.membership.organisationId,
    supplierId,
    title,
    documentRef: text(formData.get("documentRef")) || undefined,
    signedAt: date(formData.get("signedAt")),
    expiresAt: date(formData.get("expiresAt")),
    transferMechanism: text(formData.get("transferMechanism")) || undefined,
    subProcessors: lines(formData.get("subProcessors")),
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath(`/app/third-parties/${supplierId}`);
  revalidatePath("/app/third-parties");
}
