"use server";

import { revalidatePath } from "next/cache";
import { PERSONAS, type Persona } from "@/lib/persona";
import { ROLES, type AppRole } from "@/lib/rbac";
import { HandoverRefused, handOver } from "@/services/handover";
import { requireCapability } from "@/lib/session";
import {
  LastOwnerRemains,
  inviteMember,
  renameOrganisation,
  revokeRole,
  setMembershipActive,
  setPersona,
} from "@/services/access";
import {
  mismatchedWireFormat,
  removeProvider,
  saveProvider,
  testProvider,
  type Surface,
} from "@/services/assistant";
import { unresolvedPlaceholder } from "@/lib/assistant/models";
import type { ProviderKind } from "@/lib/assistant/providers";

const text = (v: FormDataEntryValue | null) => String(v ?? "").trim();

export type AdminResult = { ok: boolean; message: string } | null;

function actorOf(active: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: active.userId, actorLabel: active.email };
}

export async function inviteAction(_prev: AdminResult, formData: FormData): Promise<AdminResult> {
  const email = text(formData.get("email")).toLowerCase();
  const role = text(formData.get("role")) as AppRole;
  if (!email.includes("@")) return { ok: false, message: "That is not an email address." };
  if (!ROLES.includes(role)) return { ok: false, message: "Choose a role." };

  const active = await requireCapability("member.manage");
  const persona = text(formData.get("persona"));
  const entityId = text(formData.get("entityId"));

  const result = await inviteMember({
    organisationId: active.membership.organisationId,
    email,
    name: text(formData.get("name")) || undefined,
    persona: PERSONAS.includes(persona as Persona) ? (persona as Persona) : undefined,
    role,
    entityId: entityId || null,
    actor: actorOf(active),
  });

  revalidatePath("/app/admin/people");
  return {
    ok: true,
    message: result.granted
      ? `${email} can now sign in as ${role.replace(/_/g, " ")}.`
      : `${email} already held that role. Their access is unchanged.`,
  };
}

export async function revokeRoleAction(roleAssignmentId: string) {
  const active = await requireCapability("member.manage");
  try {
    await revokeRole({
      organisationId: active.membership.organisationId,
      roleAssignmentId,
      actor: actorOf(active),
    });
  } catch (error) {
    // Swallowing this would leave the button looking broken. The screen reads
    // the state back, so the owner count explains itself.
    if (!(error instanceof LastOwnerRemains)) throw error;
  }
  revalidatePath("/app/admin/people");
}

export async function setActiveAction(membershipId: string, isActive: boolean) {
  const active = await requireCapability("member.manage");
  try {
    await setMembershipActive({
      organisationId: active.membership.organisationId,
      membershipId,
      isActive,
      actor: actorOf(active),
    });
  } catch (error) {
    if (!(error instanceof LastOwnerRemains)) throw error;
  }
  revalidatePath("/app/admin/people");
}

export async function setPersonaAction(membershipId: string, formData: FormData) {
  const active = await requireCapability("member.manage");
  const chosen = text(formData.get("persona"));
  await setPersona({
    organisationId: active.membership.organisationId,
    membershipId,
    persona: PERSONAS.includes(chosen as Persona) ? (chosen as Persona) : null,
    actor: actorOf(active),
  });
  revalidatePath("/app/admin/people");
}

export async function saveProviderAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  const active = await requireCapability("org.manage");

  const baseUrl = text(formData.get("baseUrl"));
  const model = text(formData.get("model"));
  if (!baseUrl.startsWith("https://")) {
    return { ok: false, message: "The endpoint must be an https address." };
  }
  if (!model) return { ok: false, message: "Name the model to call." };

  const unfilled = unresolvedPlaceholder(baseUrl);
  if (unfilled) return { ok: false, message: unfilled };

  const kind: ProviderKind =
    text(formData.get("kind")) === "anthropic" ? "anthropic" : "openai_compatible";
  const mismatch = mismatchedWireFormat(kind, baseUrl);
  if (mismatch) return { ok: false, message: mismatch };

  const surfaces = formData.getAll("surfaces").map(String) as Surface[];

  try {
    await saveProvider({
      organisationId: active.membership.organisationId,
      kind,
      baseUrl,
      model,
      apiVersion: text(formData.get("apiVersion")) || undefined,
      surfaces,
      // Blank means keep the stored key, so changing a surface switch does not
      // require re-entering a credential.
      apiKey: text(formData.get("apiKey")) || undefined,
      isActive: formData.get("isActive") === "on",
      actor: actorOf(active),
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "That could not be saved.",
    };
  }

  revalidatePath("/app/admin/assistant");
  return {
    ok: true,
    message:
      surfaces.length === 0
        ? "Saved. No surfaces are switched on, so nobody will see an assistant yet."
        : `Saved. Enabled on: ${surfaces.join(", ")}.`,
  };
}

export async function testProviderAction(_prev: AdminResult): Promise<AdminResult> {
  const active = await requireCapability("org.manage");
  const result = await testProvider(active.membership.organisationId);
  return { ok: result.ok, message: result.detail };
}

export async function removeProviderAction() {
  const active = await requireCapability("org.manage");
  await removeProvider({
    organisationId: active.membership.organisationId,
    actor: actorOf(active),
  });
  revalidatePath("/app/admin/assistant");
}

export async function renameOrganisationAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  const name = text(formData.get("name"));
  const active = await requireCapability("org.manage");

  try {
    const updated = await renameOrganisation({
      organisationId: active.membership.organisationId,
      name,
      actor: actorOf(active),
    });
    revalidatePath("/app", "layout");
    return { ok: true, message: `Now shown as “${updated.name}” throughout.` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "That could not be saved.",
    };
  }
}

export type HandoverResult = { ok: boolean; message: string } | null;

/**
 * Give one person's open work to another.
 *
 * Its own act rather than something suspension does automatically: who picks
 * up a departing colleague's assessments is a judgement, and guessing it would
 * quietly make somebody responsible for work they have not seen.
 */
export async function handOverAction(
  fromUserId: string,
  _prev: HandoverResult,
  formData: FormData,
): Promise<HandoverResult> {
  const active = await requireCapability("member.manage");
  const toUserId = String(formData.get("toUserId") ?? "");
  if (!toUserId) return { ok: false, message: "Choose who is taking it on." };

  try {
    const { moved } = await handOver({
      organisationId: active.membership.organisationId,
      fromUserId,
      toUserId,
      actor: actorOf(active),
    });
    revalidatePath("/app/admin/people");
    return moved.total === 0
      ? { ok: true, message: "There was nothing open to hand over." }
      : {
          ok: true,
          message:
            `Moved ${moved.total} item${moved.total === 1 ? "" : "s"}: ` +
            [
              moved.openTasks && `${moved.openTasks} open task${moved.openTasks === 1 ? "" : "s"}`,
              moved.assessments && `${moved.assessments} assessment${moved.assessments === 1 ? "" : "s"}`,
              moved.activities && `${moved.activities} processing activit${moved.activities === 1 ? "y" : "ies"}`,
              moved.suppliers && `${moved.suppliers} third part${moved.suppliers === 1 ? "y" : "ies"}`,
              moved.aiSystems && `${moved.aiSystems} AI system${moved.aiSystems === 1 ? "" : "s"}`,
              moved.breaches && `${moved.breaches} breach${moved.breaches === 1 ? "" : "es"}`,
            ]
              .filter(Boolean)
              .join(", ") + ".",
        };
  } catch (error) {
    if (error instanceof HandoverRefused) return { ok: false, message: error.message };
    throw error;
  }
}
