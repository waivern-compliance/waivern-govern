"use server";

import { revalidatePath } from "next/cache";
import { aiFrameworkPackOf } from "@/services/ai-framework";
import { APPETITE_LEVELS, SUGGESTED_TOLERANCE, isScope, type AppetiteLevel } from "@/lib/risk/appetite";
import { TIER_ORDER, type RiskTier } from "@/lib/risk/scale";
import { scopedEntityIds, type Capability } from "@/lib/rbac";
import { requireCapability } from "@/lib/session";
import { AppetiteRefused, decideAppetite, proposeAppetite } from "@/services/risk-policy";
import { SegregationOfDuties } from "@/services/risks";

export type AppetiteResult = { ok: boolean; message: string } | null;

function actorOf(a: { userId: string; email: string }) {
  return { actorKind: "user" as const, actorUserId: a.userId, actorLabel: a.email };
}

/**
 * Appetite is set for the whole organisation, so it takes an organisation-wide
 * grant. Somebody who approves for one legal entity has not been given a say
 * over how much risk the others carry.
 */
async function organisationWide(capability: Capability) {
  const active = await requireCapability(capability);
  const wide = scopedEntityIds(active.membership.grants, capability) === null;
  return { active, wide };
}

const NOT_WIDE: AppetiteResult = {
  ok: false,
  message: "Risk appetite applies to the whole organisation, so this needs an organisation-wide role.",
};

/** Refusals are explained to the person; anything else is a fault and is thrown. */
function explained(error: unknown): AppetiteResult {
  if (error instanceof AppetiteRefused || error instanceof SegregationOfDuties) {
    return { ok: false, message: error.message };
  }
  throw error;
}

export async function proposeAppetiteAction(
  _prev: AppetiteResult,
  formData: FormData,
): Promise<AppetiteResult> {
  const { active, wide } = await organisationWide("risk.manage");
  if (!wide) return NOT_WIDE;
  const scope = String(formData.get("scope") ?? "");
  const level = String(formData.get("level") ?? "") as AppetiteLevel;
  const tier = String(formData.get("toleratedTier") ?? "");
  if (!isScope(scope, await aiFrameworkPackOf(active.membership.organisationId))) return { ok: false, message: "Choose a category." };
  if (!APPETITE_LEVELS.includes(level)) return { ok: false, message: "Choose an appetite level." };

  try {
    await proposeAppetite({
      organisationId: active.membership.organisationId,
      scope,
      level,
      // Left blank, the level's usual tolerance — shown on the form, so the
      // person proposing it sees what they are putting forward.
      toleratedTier: TIER_ORDER.includes(tier as RiskTier)
        ? (tier as RiskTier)
        : SUGGESTED_TOLERANCE[level],
      statement: String(formData.get("statement") ?? ""),
      actor: actorOf(active),
    });
  } catch (error) {
    return explained(error);
  }
  revalidatePath("/app/risks/appetite");
  return { ok: true, message: "Proposed. It changes nothing until an approver signs it off." };
}

export async function decideAppetiteAction(
  _prev: AppetiteResult,
  formData: FormData,
): Promise<AppetiteResult> {
  const { active, wide } = await organisationWide("risk.accept");
  if (!wide) return NOT_WIDE;
  const decision = formData.get("decision") === "rejected" ? "rejected" : "approved";
  const months = Number(formData.get("reviewMonths"));

  try {
    await decideAppetite({
      appetiteId: String(formData.get("appetiteId") ?? ""),
      organisationId: active.membership.organisationId,
      decision,
      approvalReference: String(formData.get("approvalReference") ?? ""),
      rejectionReason: String(formData.get("rejectionReason") ?? ""),
      reviewMonths: [6, 12, 24].includes(months) ? months : 12,
      actor: actorOf(active),
    });
  } catch (error) {
    return explained(error);
  }
  revalidatePath("/app/risks/appetite");
  revalidatePath("/app/risks");
  revalidatePath("/app/dashboard");
  return {
    ok: true,
    message:
      decision === "approved"
        ? "Signed off. Risks in this category are now judged against it."
        : "Not approved. The reason is on the record.",
  };
}
