"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { TIER_ORDER, type RiskTier } from "@/lib/risk/scale";
import { getActiveSession, requireCapability } from "@/lib/session";
import { loadUseCase } from "@/services/ai-register";
import {
  HARM_LABEL,
  IncidentRefused,
  KIND_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  advanceIncident,
  loadIncident,
  reportIncident,
  triageIncident,
  type Harm,
  type IncidentKind,
  type IncidentSource,
  type IncidentStatus,
} from "@/services/ai-incidents";
import { candidatesFor } from "@/services/handover";

export type IncidentResult = { ok: boolean; message: string } | null;

function actorOf(a: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: a.userId, actorLabel: a.email };
}

/**
 * Report something about an AI system.
 *
 * Open to every member, whatever their role. The Playbook asks for clear
 * routes to raise concerns and report harm; a route that needs write access
 * to the register is not one most staff have.
 */
export async function reportAction(_prev: IncidentResult, formData: FormData): Promise<IncidentResult> {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const kind = String(formData.get("kind") ?? "") as IncidentKind;
  const source = String(formData.get("source") ?? "") as IncidentSource;
  const harm = String(formData.get("harm") ?? "none_known") as Harm;
  if (!(kind in KIND_LABEL) || !(source in SOURCE_LABEL) || !(harm in HARM_LABEL)) {
    return { ok: false, message: "Choose what kind of report it is, where it came from, and any harm." };
  }
  const useCaseId = String(formData.get("useCaseId") ?? "") || null;
  if (useCaseId) {
    // Only a system the reporter can see; otherwise the report goes in without
    // one and whoever triages it works out which system it is.
    const loaded = await loadUseCase(useCaseId, active.membership.organisationId);
    if (!loaded || !can(active.membership.grants, "record.read", loaded.useCase.entityId)) {
      return { ok: false, message: "That system is not one you can see." };
    }
  }
  const occurred = String(formData.get("occurredAt") ?? "");
  const confidential = formData.get("confidential") === "on";

  let id: string;
  try {
    const incident = await reportIncident({
      organisationId: active.membership.organisationId,
      useCaseId,
      kind,
      source,
      harm,
      summary: String(formData.get("summary") ?? ""),
      details: String(formData.get("details") ?? ""),
      confidential,
      // A member of staff reporting for themselves is the person signed in. A
      // report passed on from the public or a supplier is not theirs, and the
      // record must not say it was.
      reportedByLabel:
        String(formData.get("reportedBy") ?? "").trim() || (source === "staff" ? active.email : "Not given"),
      occurredAt: occurred ? new Date(`${occurred}T00:00:00Z`) : undefined,
      actor: actorOf(active),
    });
    id = incident.id;
  } catch (error) {
    if (error instanceof IncidentRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath("/app/ai/incidents");
  revalidatePath("/app/ai");
  // Somebody without read access cannot open the report they just made; they
  // are told it was received rather than sent to a page that refuses them.
  if (!can(active.membership.grants, "record.read")) {
    return { ok: true, message: "Received. The person handling it will be in touch if they need more." };
  }
  redirect(`/app/ai/incidents/${id}`);
}

async function forIncident(incidentId: string) {
  const session = await requireCapability("record.write");
  const loaded = await loadIncident(incidentId, session.membership.organisationId);
  if (!loaded) throw new Error("No such incident");
  const active = await requireCapability("record.write", { entityId: loaded.incident.entityId });
  return { active, loaded };
}

export async function triageAction(
  incidentId: string,
  _prev: IncidentResult,
  formData: FormData,
): Promise<IncidentResult> {
  const { active } = await forIncident(incidentId);
  const severity = String(formData.get("severity") ?? "") as RiskTier;
  const harm = String(formData.get("harm") ?? "") as Harm;
  if (!TIER_ORDER.includes(severity) || !(harm in HARM_LABEL)) {
    return { ok: false, message: "Say how serious it is, and whether harm is actual." };
  }
  const assignee = String(formData.get("assignedToUserId") ?? "") || null;
  if (assignee) {
    const members = new Set((await candidatesFor(active.membership.organisationId)).map((m) => m.id));
    if (!members.has(assignee)) return { ok: false, message: "That person is not an active member." };
  }
  try {
    await triageIncident({
      incidentId,
      organisationId: active.membership.organisationId,
      severity,
      harm,
      assignedToUserId: assignee,
      linkedRiskId: String(formData.get("linkedRiskId") ?? "") || null,
      note: String(formData.get("note") ?? ""),
      actor: actorOf(active),
    });
  } catch (error) {
    if (error instanceof IncidentRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/app/ai/incidents/${incidentId}`);
  revalidatePath("/app/ai/incidents");
  return { ok: true, message: "Triaged." };
}

export async function advanceAction(
  incidentId: string,
  _prev: IncidentResult,
  formData: FormData,
): Promise<IncidentResult> {
  const { active } = await forIncident(incidentId);
  const to = String(formData.get("to") ?? "") as IncidentStatus;
  if (!(to in STATUS_LABEL)) return { ok: false, message: "Choose where it goes next." };
  try {
    await advanceIncident({
      incidentId,
      organisationId: active.membership.organisationId,
      to,
      note: String(formData.get("note") ?? ""),
      outcome: String(formData.get("outcome") ?? ""),
      actor: actorOf(active),
    });
  } catch (error) {
    if (error instanceof IncidentRefused) return { ok: false, message: error.message };
    throw error;
  }
  revalidatePath(`/app/ai/incidents/${incidentId}`);
  revalidatePath("/app/ai/incidents");
  revalidatePath("/app/ai");
  return { ok: true, message: `Now ${STATUS_LABEL[to].toLowerCase()}.` };
}
