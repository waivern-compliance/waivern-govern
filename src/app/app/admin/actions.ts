"use server";

import { revalidatePath } from "next/cache";
import { DpoRefused } from "@/lib/dpa2018/public-authority";
import { SCALES, isScaleId } from "@/lib/risk/scale";
import { setRiskScale } from "@/services/risk-policy";
import { PERSONAS, type Persona } from "@/lib/persona";
import { ROLES, mayManageEntities, type AppRole } from "@/lib/rbac";
import { HandoverRefused, handOver } from "@/services/handover";
import { NotPermitted, requireCapability } from "@/lib/session";
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
import { refusable, type EditResult } from "@/lib/edit-result";
import { DomainRefused, claimDomain, removeDomain, verifyDomain } from "@/services/domains";
import { EntityRefused, addEntity, makeDefaultEntity, renameEntity, setCompetentAuthority, setDataProtectionLaw, setDpo, setPublicAuthority, setPublicCommsProvider } from "@/services/entities";
import { DATA_PROTECTION_LAWS, isDataProtectionLaw } from "@/lib/dpa2018/applies";
import { NotInOrganisation } from "@/services/tenancy-guards";

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

export async function setPersonaAction(
  membershipId: string,
  _previous: EditResult,
  formData: FormData,
): Promise<EditResult> {
  return refusable(async () => {
    const active = await requireCapability("member.manage");
    const chosen = text(formData.get("persona"));
    await setPersona({
      organisationId: active.membership.organisationId,
      membershipId,
      persona: PERSONAS.includes(chosen as Persona) ? (chosen as Persona) : null,
      actor: actorOf(active),
    });
    revalidatePath("/app/admin/people");
  });
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

/**
 * Choose the risk register's scale. Refused, with the reason, once the register
 * holds anything — see `setRiskScale`.
 */
export async function setRiskScaleAction(
  _prev: AdminResult,
  formData: FormData,
): Promise<AdminResult> {
  const scale = text(formData.get("scale"));
  const active = await requireCapability("org.manage");
  if (!isScaleId(scale)) return { ok: false, message: "Choose one of the scales offered." };

  try {
    await setRiskScale({
      organisationId: active.membership.organisationId,
      scale,
      actor: actorOf(active),
    });
    revalidatePath("/app", "layout");
    return { ok: true, message: `The register now rates on the ${SCALES[scale].inSentence} scale.` };
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

/**
 * Email domains. The owner's alone: a verified domain decides who may come in
 * without an invitation, which is the organisation's front door.
 */
async function domainResult(work: () => Promise<string>): Promise<AdminResult> {
  try {
    const message = await work();
    revalidatePath("/app/admin/organisation");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof DomainRefused) return { ok: false, message: error.message };
    throw error;
  }
}

export async function claimDomainAction(_prev: AdminResult, formData: FormData): Promise<AdminResult> {
  const active = await requireCapability("org.manage");
  return domainResult(async () => {
    const claim = await claimDomain({
      organisationId: active.membership.organisationId,
      domain: text(formData.get("domain")),
      actor: actorOf(active),
    });
    return `Claimed ${claim.domain}. Publish the record below, then check it.`;
  });
}

export async function verifyDomainAction(claimId: string, _prev: AdminResult): Promise<AdminResult> {
  const active = await requireCapability("org.manage");
  return domainResult(async () => {
    const claim = await verifyDomain({
      organisationId: active.membership.organisationId,
      claimId,
      actor: actorOf(active),
    });
    return `${claim.domain} is verified.`;
  });
}

export async function removeDomainAction(claimId: string, _prev: AdminResult): Promise<AdminResult> {
  const active = await requireCapability("org.manage");
  return domainResult(async () => {
    const removed = await removeDomain({
      organisationId: active.membership.organisationId,
      claimId,
      actor: actorOf(active),
    });
    return removed ? `${removed.domain} removed. Nobody already in has lost access.` : "Already gone.";
  });
}

/**
 * Legal entities. An owner over the whole organisation only — see
 * `mayManageEntities`. A new organisation is not made here: that is Waivern's
 * to approve, at /platform.
 */
async function entityResult(work: (active: Awaited<ReturnType<typeof requireCapability>>) => Promise<string>): Promise<AdminResult> {
  const active = await requireCapability("org.manage");
  if (!mayManageEntities(active.membership.grants)) throw new NotPermitted("org.manage");
  try {
    const message = await work(active);
    revalidatePath("/app", "layout");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof EntityRefused || error instanceof NotInOrganisation || error instanceof DpoRefused) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

export async function addEntityAction(_prev: AdminResult, formData: FormData): Promise<AdminResult> {
  return entityResult(async (active) => {
    const created = await addEntity({
      organisationId: active.membership.organisationId,
      name: text(formData.get("name")),
      legalEntityRef: text(formData.get("legalEntityRef")),
      actor: actorOf(active),
    });
    return `Added ${created.name}.`;
  });
}

export async function renameEntityAction(entityId: string, _prev: AdminResult, formData: FormData): Promise<AdminResult> {
  return entityResult(async (active) => {
    const updated = await renameEntity({
      organisationId: active.membership.organisationId,
      entityId,
      name: text(formData.get("name")),
      legalEntityRef: text(formData.get("legalEntityRef")),
      actor: actorOf(active),
    });
    return `Saved as ${updated.name}.`;
  });
}

export async function makeDefaultEntityAction(entityId: string, _prev: AdminResult): Promise<AdminResult> {
  return entityResult(async (active) => {
    const chosen = await makeDefaultEntity({
      organisationId: active.membership.organisationId,
      entityId,
      actor: actorOf(active),
    });
    return `${chosen.name} is now the default.`;
  });
}

export async function setProviderAction(entityId: string, provider: boolean, _prev: AdminResult): Promise<AdminResult> {
  return entityResult(async (active) => {
    const updated = await setPublicCommsProvider({
      organisationId: active.membership.organisationId,
      entityId,
      provider,
      actor: actorOf(active),
    });
    return updated.publicCommsProvider
      ? `${updated.name} is marked as a public communications provider. Its breaches now run the PECR reg 5A clock.`
      : `${updated.name} is no longer marked as a public communications provider.`;
  });
}

export async function setPublicAuthorityAction(entityId: string, publicAuthority: boolean, _prev: AdminResult): Promise<AdminResult> {
  return entityResult(async (active) => {
    const updated = await setPublicAuthority({
      organisationId: active.membership.organisationId,
      entityId,
      publicAuthority,
      actor: actorOf(active),
    });
    return updated.publicAuthority
      ? `${updated.name} is marked as a public authority. Legitimate interests is flagged on its activities, and it needs a data protection officer.`
      : `${updated.name} is no longer marked as a public authority.`;
  });
}

/** Which data protection law an entity is subject to: UK, EU or both. */
export async function setDataProtectionLawAction(entityId: string, _prev: AdminResult, formData: FormData): Promise<AdminResult> {
  return entityResult(async (active) => {
    const law = String(formData.get("dataProtectionLaw") ?? "");
    if (!isDataProtectionLaw(law)) throw new Error("Choose UK law, EU law, or both.");
    const updated = await setDataProtectionLaw({
      organisationId: active.membership.organisationId,
      entityId,
      law,
      actor: actorOf(active),
    });
    return law === "eu"
      ? `${updated.name} is subject to EU law only. The Data Protection Act 2018's questions and flags are no longer shown for it.`
      : `${updated.name} is subject to ${DATA_PROTECTION_LAWS[law].charAt(0).toLowerCase()}${DATA_PROTECTION_LAWS[law].slice(1)}.`;
  });
}

/** Whether an entity is a competent authority (s.30), and the regime its new records start under. */
export async function setCompetentAuthorityAction(entityId: string, _prev: AdminResult, formData: FormData): Promise<AdminResult> {
  return entityResult(async (active) => {
    const choice = String(formData.get("competentAuthority") ?? "");
    const updated = await setCompetentAuthority({
      organisationId: active.membership.organisationId,
      entityId,
      competentAuthority: choice !== "no",
      defaultRegime: choice === "part3" ? "dpa_part3" : "uk_gdpr",
      actor: actorOf(active),
    });
    return updated.competentAuthority
      ? `${updated.name} is a competent authority. Part 3 is available on its processing activities${updated.defaultRegime === "dpa_part3" ? " (new ones start under it)" : ""}. It needs a data protection officer.`
      : `${updated.name} is not marked as a competent authority.`;
  });
}

/** The DPO for the organisation, or for one entity (`entityId`) that has its own. */
export async function setDpoAction(entityId: string | null, _prev: AdminResult, formData: FormData): Promise<AdminResult> {
  return entityResult(async (active) => {
    const clear = formData.get("clear") === "on";
    const dpo = await setDpo({
      organisationId: active.membership.organisationId,
      entityId,
      dpo: clear
        ? null
        : {
            name: text(formData.get("name")),
            contact: text(formData.get("contact")),
            userId: text(formData.get("userId")) || null,
            reportsTo: text(formData.get("reportsTo")) || null,
            published: formData.get("published") === "on",
          },
      actor: actorOf(active),
    });
    if (!dpo) return entityId ? "This entity now uses the organisation's data protection officer." : "No data protection officer is recorded.";
    return `${dpo.name} is recorded as the data protection officer${entityId ? " for this entity" : ""}.`;
  });
}
