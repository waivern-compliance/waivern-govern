"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ATRS_FIELDS } from "@/lib/atrs/standard";
import { requireCapability } from "@/lib/session";
import { loadUseCase } from "@/services/ai-register";
import {
  AtrsRefused,
  approveRecord,
  discardDraft,
  loadRecord,
  markPublished,
  saveDraft,
  startRecord,
} from "@/services/atrs";
import { SegregationOfDuties } from "@/services/risks";

export type AtrsResult = { ok: boolean; message: string; fields?: string[] } | null;

function actorOf(a: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: a.userId, actorLabel: a.email };
}

function explained(error: unknown): AtrsResult {
  if (error instanceof AtrsRefused) return { ok: false, message: error.message, fields: error.fields };
  if (error instanceof SegregationOfDuties) return { ok: false, message: error.message };
  throw error;
}

/**
 * The record's entity decides who may act, not what the browser was showing —
 * the same check every other record makes.
 */
async function forRecord(
  recordId: string,
  capability: "record.write" | "approval.decide",
) {
  const session = await requireCapability(capability);
  const loaded = await loadRecord(recordId, session.membership.organisationId);
  if (!loaded) throw new Error("No such record");
  const active = await requireCapability(capability, { entityId: loaded.record.entityId });
  return { active, loaded };
}

export async function startRecordAction(useCaseId: string) {
  const session = await requireCapability("record.write");
  const loaded = await loadUseCase(useCaseId, session.membership.organisationId);
  if (!loaded) throw new Error("No such AI use case");
  const active = await requireCapability("record.write", { entityId: loaded.useCase.entityId });

  let recordId: string;
  try {
    const record = await startRecord({
      useCaseId,
      organisationId: active.membership.organisationId,
      actor: actorOf(active),
    });
    recordId = record.id;
  } catch (error) {
    if (!(error instanceof AtrsRefused)) throw error;
    // A draft already exists: go to it rather than failing.
    redirect(`/app/ai/${useCaseId}`);
  }
  revalidatePath(`/app/ai/${useCaseId}`);
  redirect(`/app/ai/${useCaseId}/atrs/${recordId}`);
}

export async function saveDraftAction(
  recordId: string,
  _prev: AtrsResult,
  formData: FormData,
): Promise<AtrsResult> {
  const { active, loaded } = await forRecord(recordId, "record.write");
  const fields: Record<string, string> = {};
  for (const f of ATRS_FIELDS) {
    const value = formData.get(`f:${f.ref}`);
    if (typeof value === "string") fields[f.ref] = value;
  }
  try {
    await saveDraft({
      recordId,
      organisationId: active.membership.organisationId,
      fields,
      actor: actorOf(active),
    });
  } catch (error) {
    return explained(error);
  }
  revalidatePath(`/app/ai/${loaded.useCase.id}/atrs/${recordId}`);
  return { ok: true, message: "Saved." };
}

export async function approveAction(recordId: string): Promise<AtrsResult> {
  const { active, loaded } = await forRecord(recordId, "approval.decide");
  try {
    await approveRecord({
      recordId,
      organisationId: active.membership.organisationId,
      actor: actorOf(active),
    });
  } catch (error) {
    return explained(error);
  }
  revalidatePath(`/app/ai/${loaded.useCase.id}`);
  revalidatePath(`/app/ai/${loaded.useCase.id}/atrs/${recordId}`);
  revalidatePath("/app/ai");
  return { ok: true, message: "Approved. Export it for DSIT, then record where it is published." };
}

export async function publishAction(
  recordId: string,
  _prev: AtrsResult,
  formData: FormData,
): Promise<AtrsResult> {
  const { active, loaded } = await forRecord(recordId, "record.write");
  try {
    await markPublished({
      recordId,
      organisationId: active.membership.organisationId,
      publicationUrl: String(formData.get("publicationUrl") ?? ""),
      actor: actorOf(active),
    });
  } catch (error) {
    return explained(error);
  }
  revalidatePath(`/app/ai/${loaded.useCase.id}`);
  revalidatePath(`/app/ai/${loaded.useCase.id}/atrs/${recordId}`);
  return { ok: true, message: "Recorded as published." };
}

export async function discardAction(recordId: string) {
  const { active, loaded } = await forRecord(recordId, "record.write");
  await discardDraft({
    recordId,
    organisationId: active.membership.organisationId,
    actor: actorOf(active),
  });
  revalidatePath(`/app/ai/${loaded.useCase.id}`);
  redirect(`/app/ai/${loaded.useCase.id}`);
}
