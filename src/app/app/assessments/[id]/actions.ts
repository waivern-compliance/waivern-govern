"use server";

import { revalidatePath } from "next/cache";
import type { AnswerValue } from "@/lib/templates/logic";
import { requireCapability } from "@/lib/session";
import { loadAssessment, returnAssessment, saveAnswers } from "@/services/assessments";
import { decideApproval, submitForApproval } from "@/services/workflow";
import { issueContributorLink } from "@/services/contributor-links";

export type ActionResult = { ok: true } | { ok: false; message: string };

/** Resolve the assessment first: the entity it belongs to is what scopes the check. */
async function authorise(assessmentId: string, capability: "assessment.answer" | "assessment.submit") {
  const session = await requireCapability(capability);
  const loaded = await loadAssessment(assessmentId, session.membership.organisationId);
  if (!loaded) throw new Error("No such assessment");
  const active = await requireCapability(capability, { entityId: loaded.assessment.entityId });
  return { active, loaded };
}

export async function saveAction(
  assessmentId: string,
  answers: Record<string, AnswerValue>,
): Promise<ActionResult> {
  try {
    const { active } = await authorise(assessmentId, "assessment.answer");
    await saveAnswers({
      assessmentId,
      organisationId: active.membership.organisationId,
      answers,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath(`/app/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}

export async function submitAction(assessmentId: string): Promise<ActionResult> {
  try {
    const { active } = await authorise(assessmentId, "assessment.submit");
    await submitForApproval({
      assessmentId,
      organisationId: active.membership.organisationId,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });
    revalidatePath(`/app/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not submit" };
  }
}

export async function returnAction(assessmentId: string, formData: FormData) {
  const reason = String(formData.get("reason") ?? "");
  const { active } = await authorise(assessmentId, "assessment.answer");
  await returnAssessment({
    assessmentId,
    organisationId: active.membership.organisationId,
    reason,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });
  revalidatePath(`/app/assessments/${assessmentId}`);
}

/**
 * Issue a contributor link and hand back the URL.
 *
 * The token is shown once, here. It is stored only as a hash, so if it is lost
 * the only remedy is to issue another — which is the correct trade.
 */
export async function inviteAction(
  assessmentId: string,
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  try {
    const email = String(formData.get("email") ?? "").trim();
    const sectionKey = String(formData.get("sectionKey") ?? "") || null;
    if (!email) return { error: "An email address is needed" };

    const { active } = await authorise(assessmentId, "assessment.answer");
    const issued = await issueContributorLink({
      organisationId: active.membership.organisationId,
      assessmentId,
      email,
      sectionKey,
      actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
    });

    const base = process.env.AUTH_URL ?? "http://localhost:3000";
    revalidatePath(`/app/assessments/${assessmentId}`);
    return { url: `${base}/contribute/${issued.token}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not create the link" };
  }
}

/**
 * Decide an approval gate.
 *
 * The roles the caller holds *in this assessment's entity* are what the service
 * checks against — an approver on one legal entity has no standing on another.
 */
export async function decideAction(
  approvalId: string,
  assessmentId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireCapability("record.read");
    const loaded = await loadAssessment(assessmentId, session.membership.organisationId);
    if (!loaded) throw new Error("No such assessment");

    const rolesHere = session.membership.grants
      .filter((g) => g.scope === "organisation" || g.entityId === loaded.assessment.entityId)
      .map((g) => g.role);

    await decideApproval({
      approvalId,
      organisationId: session.membership.organisationId,
      decision: formData.get("decision") as "approved" | "rejected" | "returned",
      rationale: String(formData.get("rationale") ?? ""),
      callerRoles: rolesHere,
      actor: { actorKind: "user", actorUserId: session.userId, actorLabel: session.email },
    });
    revalidatePath(`/app/assessments/${assessmentId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not record the decision" };
  }
}
