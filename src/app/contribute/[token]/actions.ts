"use server";

import { revalidatePath } from "next/cache";
import type { AnswerValue } from "@/lib/templates/logic";
import { saveAnswers } from "@/services/assessments";
import {
  completeContributorLink,
  contributorActor,
  redeemContributorLink,
} from "@/services/contributor-links";

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Every contributor action re-redeems the token.
 *
 * The scope is never carried in a cookie or a hidden form field, so revoking a
 * link or closing the assessment takes effect on the very next request rather
 * than whenever the contributor happens to reload.
 */
export async function contributorSaveAction(
  token: string,
  answers: Record<string, AnswerValue>,
): Promise<ActionResult> {
  const redeemed = await redeemContributorLink(token);
  if (!redeemed.ok) return { ok: false, message: "This link is no longer valid." };

  try {
    await saveAnswers({
      assessmentId: redeemed.link.assessmentId,
      organisationId: redeemed.link.organisationId,
      answers,
      allowedSection: redeemed.link.sectionKey,
      actor: contributorActor(redeemed.link.email),
    });
    revalidatePath(`/contribute/${token}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save" };
  }
}

export async function contributorFinishAction(token: string): Promise<ActionResult> {
  const redeemed = await redeemContributorLink(token);
  if (!redeemed.ok) return { ok: false, message: "This link is no longer valid." };

  await completeContributorLink({
    linkId: redeemed.link.linkId,
    organisationId: redeemed.link.organisationId,
    actor: contributorActor(redeemed.link.email),
  });
  revalidatePath(`/contribute/${token}`);
  return { ok: true };
}
