import { AI_STANDING_LABEL, type AiStanding } from "@/lib/thirdparty/ai-procurement";
import { PRIVACY_STANDING_LABEL, type PrivacyStanding } from "@/services/third-party";

type Tone = "ok" | "warn" | "stop" | "quiet";

const TONE: Record<Tone, string> = {
  ok: "border-emerald-700 bg-emerald-50 text-emerald-900",
  warn: "border-amber-700 bg-amber-50 text-amber-900",
  stop: "border-red-700 bg-red-50 text-red-900",
  quiet: "border-line bg-surface text-ink-soft",
};

const PRIVACY_TONE: Record<PrivacyStanding, Tone> = {
  met: "ok",
  met_with_gaps: "warn",
  not_met: "stop",
  controller: "quiet",
};

const AI_TONE: Record<AiStanding, Tone> = {
  not_applicable: "quiet",
  not_assessed: "warn",
  in_review: "warn",
  proceed: "ok",
  proceed_with_conditions: "warn",
  do_not_proceed: "stop",
  approved_no_recommendation: "warn",
};

/**
 * A supplier's privacy and AI standings, side by side and never merged.
 *
 * They are judged by different people against different rules — Article 28 on
 * one side, the AI supplier assessment's recommendation on the other — and a
 * supplier can pass one and fail the other. A single combined status would
 * have to pick which verdict wins, and whichever it picked would hide the
 * other team's answer.
 */
export function SupplierStandings({ privacy, ai }: { privacy: PrivacyStanding; ai: AiStanding }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <Standing label="Privacy" words={PRIVACY_STANDING_LABEL[privacy]} tone={PRIVACY_TONE[privacy]} />
      <Standing label="AI" words={AI_STANDING_LABEL[ai]} tone={AI_TONE[ai]} />
    </span>
  );
}

function Standing({ label, words, tone }: { label: string; words: string; tone: Tone }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] ${TONE[tone]}`}>
      <span className="font-semibold">{label}:</span> {words}
    </span>
  );
}
