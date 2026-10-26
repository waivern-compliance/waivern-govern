"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { requireCapability } from "@/lib/session";
import { createRisk, riskScaleOf } from "@/services/risks";
import { loadAssessment } from "@/services/assessments";
import { fromTemplateScore } from "@/lib/risk/scale";

export async function raiseRisk(formData: FormData) {
  const entityId = String(formData.get("entityId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const likelihood = Number(formData.get("likelihood"));
  const impact = Number(formData.get("impact"));
  const assessmentId = String(formData.get("assessmentId") ?? "") || undefined;
  // Free text in the column, because risks that are not about AI have their
  // own categories; the form offers the toolkit's list. Capped so a pasted
  // paragraph does not become a category.
  const category = String(formData.get("category") ?? "").trim().slice(0, 80) || undefined;
  if (!entityId || !title || !description) return;

  const active = await requireCapability("risk.manage", { entityId });

  // A risk names the assessment it came from, so the assessment has to be in
  // this organisation and entity. Otherwise the assurance chain would draw a
  // line from a system to a risk that has nothing to do with it.
  if (assessmentId) {
    const loaded = await loadAssessment(assessmentId, active.membership.organisationId);
    if (!loaded || loaded.assessment.entityId !== entityId) {
      throw new Error("That assessment is not in this entity");
    }
  }

  const [entity] = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.organisationId, active.membership.organisationId)),
    );
  if (!entity) throw new Error("No such entity");

  const risk = await createRisk({
    organisationId: active.membership.organisationId,
    entityId,
    title,
    description,
    category,
    likelihood,
    impact,
    ownerId: active.userId,
    assessmentId,
    actor: { actorKind: "user", actorUserId: active.userId, actorLabel: active.email },
  });

  revalidatePath("/app/risks");
  redirect(`/app/risks/${risk.id}`);
}

/**
 * A starting rating suggested from an assessment's own score.
 *
 * Offered as a default in the form, never written on the person's behalf. The
 * inherent rating is a judgement someone is accountable for, and a number that
 * appeared by itself is one nobody chose.
 */
export async function suggestedRatingFor(assessmentId: string, organisationId: string) {
  const loaded = await loadAssessment(assessmentId, organisationId);
  if (!loaded) return null;
  const { scoring } = loaded.definition;
  if (loaded.assessment.scoreValue === null) return null;

  // Rebuild the components from the stored answers rather than trusting the
  // denormalised score, which says what the total was but not how it split.
  if (scoring.method !== "likelihood_impact") return null;
  const l = scoring.likelihoodScale[String(loaded.answers[scoring.likelihoodQuestion])];
  const i = scoring.impactScale[String(loaded.answers[scoring.impactQuestion])];
  if (l === undefined || i === undefined) return null;

  return fromTemplateScore(
    { scored: true, components: [
      { question: scoring.likelihoodQuestion, contribution: l },
      { question: scoring.impactQuestion, contribution: i },
    ] },
    scoring,
    await riskScaleOf(organisationId),
  );
}
