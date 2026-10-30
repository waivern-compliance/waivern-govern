"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCapability, requireSession } from "@/lib/session";
import { can } from "@/lib/rbac";
import { refusable, type EditResult } from "@/lib/edit-result";
import type { MarketingBasis, MarketingChannel, MarketingRecipients } from "@/lib/pecr/marketing";
import type { RequestResult } from "../requests/actions";
import {
  MarketingRefused,
  createMarketingActivity,
  marketingEntity,
  recordMarketingDecision,
  recordTpsScreening,
  updateMarketingActivity,
} from "@/services/marketing";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

function actorOf(active: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: active.userId, actorLabel: active.email };
}

/** A refusal from the service, worded for the person, shown beside the form. */
async function refused(work: () => Promise<void>, ok: string): Promise<RequestResult> {
  try {
    await work();
    return { ok: true, message: ok };
  } catch (error) {
    if (error instanceof MarketingRefused) return { ok: false, message: error.message };
    throw error;
  }
}

/** The signed-in person, allowed to write in the entity the activity belongs to. */
async function writerFor(activityId: string) {
  const active = await requireSession();
  const entityId = await marketingEntity(activityId, active.membership.organisationId);
  if (!entityId || !can(active.membership.grants, "record.write", entityId)) return null;
  return active;
}

const NOT_YOURS = { ok: false, message: "You cannot change this marketing activity." };

function refresh(activityId?: string) {
  if (activityId) revalidatePath(`/app/marketing/${activityId}`);
  revalidatePath("/app/marketing");
}

export async function createActivityAction(_prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const entityId = text(formData.get("entityId"));
  if (!entityId) return { ok: false, message: "Choose the entity that sends it." };
  const active = await requireCapability("record.write", { entityId });
  let id: string | null = null;
  const result = await refused(async () => {
    const activity = await createMarketingActivity({
      organisationId: active.membership.organisationId,
      entityId,
      name: text(formData.get("name")),
      channel: text(formData.get("channel")) as MarketingChannel,
      recipients: text(formData.get("recipients")) as MarketingRecipients,
      description: text(formData.get("description")) || null,
      tool: text(formData.get("tool")) || null,
      processingActivityId: text(formData.get("processingActivityId")) || null,
      ownerId: formData.get("ownMe") === "on" ? active.userId : null,
      actor: actorOf(active),
    });
    id = activity.id;
  }, "Added.");
  if (!id) return result;
  refresh();
  redirect(`/app/marketing/${id}`);
}

export async function updateActivityAction(activityId: string, _prev: EditResult, formData: FormData): Promise<EditResult> {
  return refusable(async () => {
    const active = await writerFor(activityId);
    if (!active) throw new MarketingRefused(NOT_YOURS.message);
    const status = text(formData.get("status"));
    await updateMarketingActivity({
      activityId,
      organisationId: active.membership.organisationId,
      changes: {
        name: text(formData.get("name")),
        description: text(formData.get("description")) || null,
        channel: text(formData.get("channel")) as MarketingChannel,
        recipients: text(formData.get("recipients")) as MarketingRecipients,
        tool: text(formData.get("tool")) || null,
        processingActivityId: text(formData.get("processingActivityId")) || null,
        charityNumber: text(formData.get("charityNumber")) || null,
        ...(status === "active" || status === "paused" || status === "ended" ? { status } : {}),
      },
      actor: actorOf(active),
    });
    refresh(activityId);
  });
}

export async function recordTpsAction(activityId: string, _prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const active = await writerFor(activityId);
  if (!active) return NOT_YOURS;
  const day = text(formData.get("screenedOn"));
  const result = await refused(async () => {
    await recordTpsScreening({
      activityId,
      organisationId: active.membership.organisationId,
      screenedAt: day ? new Date(`${day}T12:00:00Z`) : new Date(Number.NaN),
      actor: actorOf(active),
    });
  }, "Recorded. The next screening is due in 28 days.");
  refresh(activityId);
  return result;
}

export async function decideMarketingBasisAction(activityId: string, _prev: RequestResult, formData: FormData): Promise<RequestResult> {
  const active = await writerFor(activityId);
  if (!active) return NOT_YOURS;
  const result = await refused(async () => {
    await recordMarketingDecision({
      activityId,
      organisationId: active.membership.organisationId,
      basis: text(formData.get("basis")) as MarketingBasis,
      conditions: formData.getAll("conditions").map(String),
      rationale: text(formData.get("rationale")),
      actor: actorOf(active),
    });
  }, "Recorded.");
  refresh(activityId);
  return result;
}
