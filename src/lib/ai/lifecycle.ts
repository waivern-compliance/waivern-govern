/**
 * What has to be true before an AI system moves to a stage.
 *
 * DSIT's toolkit expects risk to be reassessed at alpha, at beta and whenever
 * the model is updated; the Playbook expects a system to be tested before it
 * reaches people, and a named person to be answerable for it. Those become the
 * conditions for going live. Nothing stops a system being recorded at whatever
 * stage it is really at — an inventory built after the fact has to be able to
 * say "this is in production" — but moving it there through the register is a
 * decision, and the conditions are checked when it is made.
 *
 * Pure, so the page can say in advance what is missing and the service can
 * refuse on the same reasoning.
 */

export type Stage = "proposed" | "development" | "pilot" | "production" | "retiring" | "retired";

export const STAGE_ORDER: readonly Stage[] = [
  "proposed",
  "development",
  "pilot",
  "production",
  "retiring",
  "retired",
];

/** Stages in which the system reaches real people. */
export const LIVE: readonly Stage[] = ["pilot", "production"];

export type GateContext = {
  from: Stage;
  hasOwner: boolean;
  /** When the most recent approved AI assessment of the system was approved. */
  assessedAt: Date | null;
  /** When that assessment falls due for review. */
  assessmentReviewDue: Date | null;
  /** The most recent change to the model, its data or its use. */
  lastMaterialChangeAt: Date | null;
  /**
   * The system's approved DPIA leaves high risk and does not record the ICO's
   * advice. Optional so a caller that never looked does not claim it is clear.
   */
  icoConsultationOutstanding?: boolean;
  now?: Date;
};

export type GateCondition =
  | "named_owner"
  | "approved_assessment"
  | "assessment_current"
  | "assessed_since_change"
  | "ico_consulted";

export const GATE_WORDS: Record<GateCondition, string> = {
  named_owner: "A named senior responsible owner",
  approved_assessment: "An approved AI assessment",
  assessment_current: "An assessment that is not past its review date",
  assessed_since_change: "An assessment approved since the last change to the model, data or use",
  ico_consulted: "The ICO's advice on the high risk its DPIA leaves (Article 36)",
};

/**
 * The conditions not met for moving to `to`.
 *
 * Going live — into pilot or production from any other stage, including pilot
 * to production, since a wider rollout is a new exposure — needs an owner and a
 * current assessment that post-dates the last material change. Moving back, retiring, or moving
 * between pre-live stages needs nothing: those reduce exposure, and blocking
 * them would only encourage leaving a stale stage in place.
 */
export function unmetConditions(to: Stage, ctx: GateContext): GateCondition[] {
  const enteringLive =
    LIVE.includes(to) &&
    // Pilot to production is a new exposure; production back to pilot is not.
    !(to === "pilot" && ctx.from === "production") &&
    to !== ctx.from;
  if (!enteringLive) return [];

  const now = ctx.now ?? new Date();
  const unmet: GateCondition[] = [];
  if (!ctx.hasOwner) unmet.push("named_owner");
  // Checked before the assessment, because it is a legal precondition on the
  // processing whatever the AI assessment says.
  if (ctx.icoConsultationOutstanding) unmet.push("ico_consulted");
  if (!ctx.assessedAt) {
    unmet.push("approved_assessment");
    return unmet;
  }
  if (ctx.assessmentReviewDue && ctx.assessmentReviewDue.getTime() <= now.getTime()) {
    unmet.push("assessment_current");
  }
  if (ctx.lastMaterialChangeAt && ctx.lastMaterialChangeAt.getTime() > ctx.assessedAt.getTime()) {
    unmet.push("assessed_since_change");
  }
  return unmet;
}
