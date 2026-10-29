"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/session";
import { mayChooseDsrJurisdiction } from "@/lib/rbac";
import type { Jurisdiction, ProcessingBasis } from "@/lib/dsr/statutory";
import { refusable, type EditResult } from "@/lib/edit-result";
import {
  RequestRefused,
  addScopeEntry,
  closeRequest,
  passToController,
  recordIdentity,
  recordRecipientNotice,
  recordRequest,
  recordRequestDecision,
  recordScopeResult,
  respondToRequest,
  seedRequestScope,
  setDefaultJurisdiction,
  updateRequest,
  type ControllerRole,
  type RequestDecision,
  type ScopeEntry,
} from "@/services/data-subject-requests";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
const when = (v: FormDataEntryValue | null) => {
  const raw = text(v);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};
const tri = (v: FormDataEntryValue | null) => {
  const raw = text(v);
  return raw === "" ? null : raw === "yes";
};

export type RequestResult = { ok: boolean; message: string } | null;

function actorOf(active: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: active.userId, actorLabel: active.email };
}

/** A refusal from the service, worded for the person, shown beside the form. */
async function refused(work: () => Promise<void>, ok: string): Promise<RequestResult> {
  try {
    await work();
    return { ok: true, message: ok };
  } catch (error) {
    if (error instanceof RequestRefused) return { ok: false, message: error.message };
    throw error;
  }
}

export async function recordRequestAction(_prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const entityId = text(formData.get("entityId"));
  const receivedAt = when(formData.get("receivedAt"));
  if (!entityId) return { ok: false, message: "Choose the entity the request was made to." };
  if (!receivedAt) {
    return { ok: false, message: "When did it arrive? That is what starts the month." };
  }
  const active = await requireCapability("dsr.handle", { entityId });

  let id: string | null = null;
  const result = await refused(async () => {
    const request = await recordRequest({
      organisationId: active.membership.organisationId,
      entityId,
      rights: formData.getAll("rights").map(String),
      channel: text(formData.get("channel")) || "email",
      receivedAt,
      description: text(formData.get("description")),
      requesterName: text(formData.get("requesterName")),
      requesterContact: text(formData.get("requesterContact")) || null,
      representative: text(formData.get("representative")) || null,
      controllerRole: (text(formData.get("controllerRole")) || "controller") as ControllerRole,
      jurisdiction: (text(formData.get("jurisdiction")) || undefined) as Jurisdiction | undefined,
      subjectCategories: lines(formData.get("subjectCategories")),
      ownerId: formData.get("ownMe") === "on" ? active.userId : null,
      actor: actorOf(active),
    });
    id = request.id;
  }, "Recorded.");
  if (!id) return result;

  revalidatePath("/app/requests");
  redirect(`/app/requests/${id}`);
}

export async function setJurisdictionAction(_prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  // Organisation-wide, so a grant confined to one entity is not enough.
  if (!mayChooseDsrJurisdiction(active.membership.grants)) {
    return { ok: false, message: "Only somebody who configures the whole organisation can change this." };
  }
  const jurisdiction = text(formData.get("jurisdiction")) as Jurisdiction;
  if (jurisdiction !== "uk" && jurisdiction !== "eu") return { ok: false, message: "Choose UK or EU." };
  await setDefaultJurisdiction({
    organisationId: active.membership.organisationId,
    jurisdiction,
    actor: actorOf(active),
  });
  revalidatePath("/app/requests");
  return { ok: true, message: "Saved. Requests already received keep the law they were recorded under." };
}

export async function updateRequestAction(
  requestId: string,
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireCapability("dsr.handle");
    const owner = formData.get("ownerId");
    await updateRequest({
      requestId,
      organisationId: active.membership.organisationId,
      changes: {
        rights: formData.getAll("rights").map(String),
        channel: text(formData.get("channel")),
        description: text(formData.get("description")),
        requesterName: text(formData.get("requesterName")),
        requesterContact: text(formData.get("requesterContact")) || null,
        representative: text(formData.get("representative")) || null,
        representativeAuthorityChecked: tri(formData.get("representativeAuthorityChecked")),
        controllerRole: text(formData.get("controllerRole")),
        subjectCategories: lines(formData.get("subjectCategories")),
        ...(owner !== null ? { ownerId: text(owner) || null } : {}),
      },
      actor: actorOf(active),
    });
    revalidatePath(`/app/requests/${requestId}`);
    revalidatePath("/app/requests");
  });
}

export async function identityAction(
  requestId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const step = text(formData.get("step")) === "verified" ? "verified" : "requested";
  const result = await refused(
    () =>
      recordIdentity({
        requestId,
        organisationId: active.membership.organisationId,
        step,
        at: when(formData.get("at")) ?? undefined,
        method: text(formData.get("method")) || null,
        actor: actorOf(active),
      }),
    step === "requested" ? "Recorded. The month waits for the answer." : "Recorded.",
  );
  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath("/app/requests");
  return result;
}

export async function recordRequestDecisionAction(
  requestId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const result = await refused(async () => {
    await recordRequestDecision({
      organisationId: active.membership.organisationId,
      requestId,
      kind: text(formData.get("kind")) as RequestDecision["kind"],
      outcome: (text(formData.get("outcome")) || "done") as RequestDecision["outcome"],
      right: text(formData.get("right")) || null,
      statutoryBasis: text(formData.get("statutoryBasis")) || null,
      processingBasis: (text(formData.get("processingBasis")) || null) as ProcessingBasis | null,
      rationale: text(formData.get("rationale")),
      effectiveAt: when(formData.get("effectiveAt")) ?? undefined,
      actor: actorOf(active),
    });
  }, "Recorded.");
  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath("/app/requests");
  return result;
}

export async function respondAction(
  requestId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const result = await refused(async () => {
    await respondToRequest({
      requestId,
      organisationId: active.membership.organisationId,
      outcome: (text(formData.get("outcome")) || "complied") as "complied" | "partly" | "refused",
      respondedAt: when(formData.get("respondedAt")) ?? undefined,
      channel: text(formData.get("channel")) || "email",
      summary: text(formData.get("summary")),
      link: text(formData.get("link")) || null,
      toldOfComplaintRight: formData.get("toldOfComplaintRight") === "on",
      lateReason: text(formData.get("lateReason")) || null,
      actor: actorOf(active),
    });
  }, "Response recorded.");
  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath("/app/requests");
  return result;
}

export async function closeRequestAction(
  requestId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const result = await refused(async () => {
    await closeRequest({
      requestId,
      organisationId: active.membership.organisationId,
      rationale: text(formData.get("rationale")),
      withdrawn: formData.get("withdrawn") === "on",
      actor: actorOf(active),
    });
  }, "Closed.");
  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath("/app/requests");
  return result;
}

export async function seedScopeAction(requestId: string, _prev: RequestResult): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  let added = 0;
  const result = await refused(async () => {
    added = await seedRequestScope({ requestId, organisationId: active.membership.organisationId, actor: actorOf(active) });
  }, "");
  revalidatePath(`/app/requests/${requestId}`);
  if (!result?.ok) return result;
  return { ok: true, message: added === 0 ? "Nothing new in the ROPA for who they are." : `Added ${added} from the ROPA.` };
}

export async function addScopeAction(
  requestId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const kind = text(formData.get("kind"));
  const result = await refused(async () => {
    await addScopeEntry({
      requestId,
      organisationId: active.membership.organisationId,
      kind: kind === "recipient" || kind === "system" ? kind : "other",
      label: text(formData.get("label")),
      actor: actorOf(active),
    });
  }, "Added.");
  revalidatePath(`/app/requests/${requestId}`);
  return result;
}

export async function scopeResultAction(
  requestId: string,
  scopeId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const result = await refused(async () => {
    await recordScopeResult({
      scopeId,
      organisationId: active.membership.organisationId,
      status: text(formData.get("status")) as ScopeEntry["status"],
      note: text(formData.get("note")) || null,
      actor: actorOf(active),
    });
  }, "Saved.");
  revalidatePath(`/app/requests/${requestId}`);
  return result;
}

export async function recipientNoticeAction(
  requestId: string,
  scopeId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const result = await refused(async () => {
    await recordRecipientNotice({
      scopeId,
      organisationId: active.membership.organisationId,
      notice: text(formData.get("notice")) as NonNullable<ScopeEntry["recipientNotice"]>,
      at: when(formData.get("at")) ?? undefined,
      note: text(formData.get("note")) || null,
      actor: actorOf(active),
    });
  }, "Recorded.");
  revalidatePath(`/app/requests/${requestId}`);
  return result;
}

export async function passToControllerAction(
  requestId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const result = await refused(async () => {
    await passToController({
      requestId,
      organisationId: active.membership.organisationId,
      controllerName: text(formData.get("controllerName")),
      at: when(formData.get("at")) ?? undefined,
      assistance: text(formData.get("assistance")) || null,
      actor: actorOf(active),
    });
  }, "Recorded.");
  revalidatePath(`/app/requests/${requestId}`);
  revalidatePath("/app/requests");
  return result;
}
