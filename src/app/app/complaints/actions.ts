"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/session";
import { mayConfigureRequests } from "@/lib/rbac";
import type { ComplaintOutcome } from "@/lib/complaints/statutory";
import type { Jurisdiction } from "@/lib/dsr/statutory";
import { refusable, type EditResult } from "@/lib/edit-result";
import type { RequestResult } from "../requests/actions";
import {
  ComplaintRefused,
  closeComplaint,
  recordComplaint,
  recordComplaintEvent,
  recordComplaintOutcome,
  setComplaintTargets,
  updateComplaint,
} from "@/services/complaints";
import type { ControllerRole } from "@/services/data-subject-requests";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();
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

function actorOf(active: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: active.userId, actorLabel: active.email };
}

/** A refusal from the service, worded for the person, shown beside the form. */
async function refused(work: () => Promise<void>, ok: string): Promise<RequestResult> {
  try {
    await work();
    return { ok: true, message: ok };
  } catch (error) {
    if (error instanceof ComplaintRefused) return { ok: false, message: error.message };
    throw error;
  }
}

function refresh(complaintId?: string) {
  if (complaintId) revalidatePath(`/app/complaints/${complaintId}`);
  revalidatePath("/app/complaints");
}

export async function recordComplaintAction(_prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const entityId = text(formData.get("entityId"));
  const receivedAt = when(formData.get("receivedAt"));
  if (!entityId) return { ok: false, message: "Choose the entity the complaint was made to." };
  if (!receivedAt) return { ok: false, message: "When did it arrive? That is what starts the 30 days." };
  const active = await requireCapability("dsr.handle", { entityId });

  let id: string | null = null;
  const result = await refused(async () => {
    const complaint = await recordComplaint({
      organisationId: active.membership.organisationId,
      entityId,
      channel: text(formData.get("channel")) || "email",
      receivedAt,
      subject: text(formData.get("subject")),
      description: text(formData.get("description")),
      complainantName: text(formData.get("complainantName")),
      complainantContact: text(formData.get("complainantContact")) || null,
      representative: text(formData.get("representative")) || null,
      controllerRole: (text(formData.get("controllerRole")) || "controller") as ControllerRole,
      jurisdiction: (text(formData.get("jurisdiction")) || undefined) as Jurisdiction | undefined,
      requestId: text(formData.get("requestId")) || null,
      ownerId: formData.get("ownMe") === "on" ? active.userId : null,
      actor: actorOf(active),
    });
    id = complaint.id;
  }, "Recorded.");
  if (!id) return result;

  refresh();
  redirect(`/app/complaints/${id}`);
}

export async function setComplaintTargetsAction(_prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  // Organisation-wide, so a grant confined to one entity is not enough.
  if (!mayConfigureRequests(active.membership.grants)) {
    return { ok: false, message: "Only somebody who configures the whole organisation can change this." };
  }
  const result = await refused(
    () =>
      setComplaintTargets({
        organisationId: active.membership.organisationId,
        outcomeTargetDays: Number(text(formData.get("outcomeTargetDays"))),
        updateIntervalDays: Number(text(formData.get("updateIntervalDays"))),
        actor: actorOf(active),
      }),
    "Saved. Open complaints are measured against the new targets.",
  );
  refresh();
  return result;
}

export async function updateComplaintAction(
  complaintId: string,
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireCapability("dsr.handle");
    const owner = formData.get("ownerId");
    await updateComplaint({
      complaintId,
      organisationId: active.membership.organisationId,
      changes: {
        channel: text(formData.get("channel")),
        subject: text(formData.get("subject")),
        description: text(formData.get("description")),
        complainantName: text(formData.get("complainantName")),
        complainantContact: text(formData.get("complainantContact")) || null,
        representative: text(formData.get("representative")) || null,
        representativeAuthorityChecked: tri(formData.get("representativeAuthorityChecked")),
        controllerRole: text(formData.get("controllerRole")),
        ...(owner !== null ? { ownerId: text(owner) || null } : {}),
      },
      actor: actorOf(active),
    });
    refresh(complaintId);
  });
}

export async function complaintEventAction(
  complaintId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const kind = text(formData.get("kind")) as "acknowledged" | "enquiry" | "progress_update" | "regulator_contact";
  const result = await refused(
    async () => {
      await recordComplaintEvent({
        complaintId,
        organisationId: active.membership.organisationId,
        kind,
        note: text(formData.get("note")),
        channel: text(formData.get("channel")) || null,
        at: when(formData.get("at")) ?? undefined,
        lateReason: text(formData.get("lateReason")) || null,
        actor: actorOf(active),
      });
    },
    kind === "acknowledged" ? "Acknowledgement recorded." : "Recorded.",
  );
  refresh(complaintId);
  return result;
}

export async function complaintOutcomeAction(
  complaintId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const result = await refused(async () => {
    await recordComplaintOutcome({
      complaintId,
      organisationId: active.membership.organisationId,
      outcome: text(formData.get("outcome")) as ComplaintOutcome,
      at: when(formData.get("at")) ?? undefined,
      channel: text(formData.get("channel")) || "email",
      summary: text(formData.get("summary")),
      remedialAction: text(formData.get("remedialAction")) || null,
      link: text(formData.get("link")) || null,
      toldOfRegulatorRight: formData.get("toldOfRegulatorRight") === "on",
      lateReason: text(formData.get("lateReason")) || null,
      actor: actorOf(active),
    });
  }, "Outcome recorded.");
  refresh(complaintId);
  return result;
}

export async function closeComplaintAction(
  complaintId: string,
  _prev: RequestResult,
  formData: FormData,
): Promise<RequestResult> {
  const active = await requireCapability("dsr.handle");
  const result = await refused(async () => {
    await closeComplaint({
      complaintId,
      organisationId: active.membership.organisationId,
      rationale: text(formData.get("rationale")),
      withdrawn: formData.get("withdrawn") === "on",
      actor: actorOf(active),
    });
  }, "Closed.");
  refresh(complaintId);
  return result;
}
