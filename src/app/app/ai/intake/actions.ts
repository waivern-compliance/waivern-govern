"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { getActiveSession, requireCapability } from "@/lib/session";
import {
  PROVENANCE_LABEL,
  SYSTEM_TYPE_LABEL,
  type Provenance,
  type SystemType,
} from "@/services/ai-register";
import {
  RequestRefused,
  decideRequest,
  loadRequest,
  scoreRequest,
  submitRequest,
} from "@/services/ai-intake";

export type IntakeResult = { ok: boolean; message: string } | null;

function actorOf(a: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: a.userId, actorLabel: a.email };
}

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");

/**
 * Propose a use of AI.
 *
 * Open to every member, as the Playbook's use-case register is meant to
 * capture ideas from wherever they come; the decision is what is restricted.
 */
export async function submitAction(_prev: IntakeResult, formData: FormData): Promise<IntakeResult> {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const spendText = text(formData, "expectedSpendGbp").replace(/[£,\s]/g, "");
  const spend = spendText === "" ? null : Number(spendText);
  if (spend !== null && !Number.isInteger(spend)) {
    return { ok: false, message: "Expected spend is a whole number of pounds." };
  }

  let id: string;
  try {
    const request = await submitRequest({
      organisationId: active.membership.organisationId,
      title: text(formData, "title"),
      problem: text(formData, "problem"),
      whyAi: text(formData, "whyAi"),
      benefits: text(formData, "benefits"),
      environmentalImpact: text(formData, "environmentalImpact"),
      userResearch: text(formData, "userResearch"),
      dataNeeded: text(formData, "dataNeeded"),
      capability: text(formData, "capability"),
      stakeholderPlan: text(formData, "stakeholderPlan"),
      expectedSpendGbp: spend,
      publicFacing: formData.get("publicFacing") === "on",
      significantDecisions: formData.get("significantDecisions") === "on",
      requestedByLabel: active.email,
      actor: actorOf(active),
    });
    id = request.id;
  } catch (error) {
    if (error instanceof RequestRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/app/ai/intake");
  if (!can(active.membership.grants, "record.read")) {
    return { ok: true, message: "Received. Whoever manages the AI register will be in touch." };
  }
  redirect(`/app/ai/intake/${id}`);
}

async function forRequest(requestId: string) {
  const session = await requireCapability("record.write");
  const loaded = await loadRequest(requestId, session.membership.organisationId);
  if (!loaded) throw new Error("No such request");
  const active = await requireCapability("record.write", { entityId: loaded.request.entityId });
  return active;
}

export async function scoreAction(
  requestId: string,
  _prev: IntakeResult,
  formData: FormData,
): Promise<IntakeResult> {
  const active = await forRequest(requestId);
  try {
    await scoreRequest({
      requestId,
      organisationId: active.membership.organisationId,
      value: Number(formData.get("value")),
      feasibility: Number(formData.get("feasibility")),
      note: text(formData, "note"),
      actor: actorOf(active),
    });
  } catch (error) {
    if (error instanceof RequestRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/app/ai/intake/${requestId}`);
  revalidatePath("/app/ai/intake");
  return { ok: true, message: "Scored." };
}

export async function decideAction(
  requestId: string,
  _prev: IntakeResult,
  formData: FormData,
): Promise<IntakeResult> {
  const active = await forRequest(requestId);
  const decision = text(formData, "decision");
  if (decision !== "accepted" && decision !== "declined" && decision !== "deferred") {
    return { ok: false, message: "Choose a decision." };
  }
  const systemType = text(formData, "systemType") as SystemType;
  const provenance = text(formData, "provenance") as Provenance;
  const system =
    systemType in SYSTEM_TYPE_LABEL && provenance in PROVENANCE_LABEL
      ? { systemType, provenance }
      : undefined;

  let useCaseId: string | null = null;
  try {
    const after = await decideRequest({
      requestId,
      organisationId: active.membership.organisationId,
      decision,
      reason: text(formData, "reason"),
      system,
      actor: actorOf(active),
    });
    useCaseId = after.aiUseCaseId;
  } catch (error) {
    if (error instanceof RequestRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/app/ai/intake/${requestId}`);
  revalidatePath("/app/ai/intake");
  revalidatePath("/app/ai");
  if (useCaseId) redirect(`/app/ai/${useCaseId}`);
  return { ok: true, message: decision === "declined" ? "Declined." : "Deferred." };
}
