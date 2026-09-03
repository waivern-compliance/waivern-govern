"use client";

import { useActionState, useState } from "react";
import { COMMUNICATION_EXEMPTIONS } from "@/lib/breach/statutory";
import { recordDecisionAction, type BreachResult } from "./actions";

const KINDS: Array<{ value: string; label: string; basis?: string; note: string }> = [
  {
    value: "supervisory_authority",
    label: "The supervisory authority",
    basis: "Article 33(1)",
    note: "Required within seventy-two hours unless the breach is unlikely to result in a risk to rights and freedoms.",
  },
  {
    value: "data_subjects",
    label: "The people affected",
    basis: "Article 34(1)",
    note: "Required without undue delay where there is a high risk, unless an Article 34(3) exemption applies.",
  },
  {
    value: "processor_to_controller",
    label: "The controller we process for",
    basis: "Article 33(2)",
    note: "Our obligation where we are the processor. Without undue delay, no fixed period.",
  },
  {
    value: "insurer",
    label: "Our insurer",
    note: "Not required by the Regulation. Recorded because a policy usually requires prompt notice and the decision matters later.",
  },
  {
    value: "law_enforcement",
    label: "Law enforcement",
    note: "Not required by the Regulation. May bear on whether communication to data subjects is delayed.",
  },
  {
    value: "other_regulator",
    label: "Another regulator",
    note: "A sector or security regulator with its own notification duty.",
  },
  {
    value: "affected_organisation",
    label: "Another organisation affected",
    note: "A controller, processor or partner whose data or people are caught up in it.",
  },
  {
    value: "voluntary_action",
    label: "Something we chose to do",
    note: "Credit monitoring, a password reset, a public statement. Worth recording precisely because nobody made us.",
  },
];

/**
 * Record one decision, with its reasoning.
 *
 * The rationale is required for every outcome including "not required".
 * Deciding that Article 33 does not bite is a judgement a controller has to be
 * able to defend, and an absence of notification with nothing written down is
 * indistinguishable from having forgotten.
 */
export function DecisionForm({ breachId }: { breachId: string }) {
  const [result, action, pending] = useActionState<BreachResult, FormData>(
    recordDecisionAction.bind(null, breachId),
    null,
  );
  const [kind, setKind] = useState(KINDS[0].value);
  const chosen = KINDS.find((k) => k.value === kind)!;
  const statutory = Boolean(chosen.basis);

  return (
    <form action={action} className="space-y-3 rounded border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold">Record a decision</h2>

      <label className="block space-y-1">
        <Label text="Who, or what" />
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
              {k.basis ? ` — ${k.basis}` : ""}
            </option>
          ))}
        </select>
        <span className="block text-xs text-ink-soft">{chosen.note}</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <Label text="Outcome" />
          <select
            name="outcome"
            defaultValue="done"
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
          >
            <option value="done">Done — it has been notified or carried out</option>
            <option value="not_required">Not required</option>
            <option value="deferred">Deferred for now</option>
            <option value="declined">Decided against</option>
            <option value="pending">Still deciding</option>
          </select>
        </label>
        <label className="block space-y-1">
          <Label
            text="Provision relied on"
            hint={statutory ? "Either to act, or not to." : "Leave blank — this is not a statutory duty."}
          />
          <input
            name="statutoryBasis"
            defaultValue={chosen.basis ?? ""}
            list="statutory-bases"
            placeholder={statutory ? chosen.basis : "none"}
            className="w-full rounded border border-line bg-ground px-3 py-2 font-mono text-xs"
          />
          <datalist id="statutory-bases">
            <option value="Article 33(1)" />
            <option value="Article 33(2)" />
            <option value="Article 34(1)" />
            {Object.entries(COMMUNICATION_EXEMPTIONS).map(([code, words]) => (
              <option key={code} value={`Article ${code}`}>{words}</option>
            ))}
          </datalist>
        </label>
      </div>

      {kind === "data_subjects" ? (
        <p className="rounded border border-line bg-ground px-3 py-2 text-xs text-ink-soft">
          If you are not telling them, the exemption is one of:{" "}
          {Object.entries(COMMUNICATION_EXEMPTIONS).map(([code, words], i) => (
            <span key={code}>
              {i > 0 ? "; " : ""}
              <span className="font-mono">{code}</span> {words.toLowerCase()}
            </span>
          ))}
          . The third substitutes a public communication — it is not an
          exemption from telling anybody.
        </p>
      ) : null}

      <label className="block space-y-1">
        <Label text="Why" hint="Required. This is the sentence a regulator would ask about." />
        <textarea
          name="rationale"
          required
          rows={3}
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block space-y-1">
          <Label text="Who was told" />
          <input name="recipient" className="w-full rounded border border-line bg-ground px-3 py-2 text-sm" />
        </label>
        <label className="block space-y-1">
          <Label text="Their reference" hint="A case number or acknowledgement." />
          <input name="externalRef" className="w-full rounded border border-line bg-ground px-3 py-2 font-mono text-xs" />
        </label>
        <label className="block space-y-1">
          <Label text="When" />
          <input name="completedAt" type="datetime-local" className="w-full rounded border border-line bg-ground px-3 py-2 text-sm" />
        </label>
      </div>

      {kind === "supervisory_authority" ? (
        <label className="block space-y-1">
          <Label
            text="Reasons for any delay"
            hint="Article 33(1) requires these to accompany a notification made after seventy-two hours."
          />
          <textarea name="lateReason" rows={2} className="w-full rounded border border-line bg-ground px-3 py-2 text-sm" />
        </label>
      ) : null}

      {result ? (
        <p
          role="alert"
          className={`rounded border px-4 py-2.5 text-sm ${
            result.ok
              ? "border-emerald-700 bg-emerald-50 text-emerald-900"
              : "border-amber-700 bg-amber-50 text-amber-900"
          }`}
        >
          {result.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Recording…" : "Record the decision"}
      </button>
      <p className="text-xs text-ink-soft">
        Decisions are appended, never edited. Changing your mind is a second
        decision, and the sequence is the evidence of how the judgement
        developed.
      </p>
    </form>
  );
}

function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
      {text}
      {hint ? (
        <span className="block font-normal normal-case tracking-normal">{hint}</span>
      ) : null}
    </span>
  );
}
