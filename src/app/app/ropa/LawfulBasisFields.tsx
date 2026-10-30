"use client";

import { useState } from "react";
import {
  LAWFUL_BASES,
  LAWFUL_BASIS_KEYS,
  RECOGNISED_CONDITIONS,
  RECOGNISED_CONDITION_KEYS,
  type LawfulBasis,
  type RecognisedCondition,
} from "@/lib/gdpr/lawful-basis";

const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

/**
 * The Article 6(1) bases an activity relies on, chosen rather than described.
 *
 * The Annex 1 condition is asked only once recognised legitimate interests is
 * ticked, because that basis means nothing without one. The free text stays,
 * as a note: it is where the basis used to be written, and where the Portal
 * still sends it.
 */
export function LawfulBasisFields({
  bases,
  condition,
  note,
  publicAuthority = false,
  outsidePublicTasks = false,
}: {
  bases: readonly LawfulBasis[];
  condition: RecognisedCondition | null;
  note: string;
  /** The entity is a public authority: legitimate interests is not for its tasks. */
  publicAuthority?: boolean;
  outsidePublicTasks?: boolean;
}) {
  const [recognised, setRecognised] = useState(bases.includes("recognised_legitimate_interests"));
  const [legitimate, setLegitimate] = useState(bases.includes("legitimate_interests"));

  return (
    <fieldset className="space-y-3">
      <legend className={label}>
        Lawful basis
        <span className="block font-normal normal-case tracking-normal">
          Article 6(1) — each basis this processing relies on
        </span>
      </legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {LAWFUL_BASIS_KEYS.map((b) => (
          <label key={b} className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="lawfulBases"
              value={b}
              defaultChecked={bases.includes(b)}
              onChange={
                b === "recognised_legitimate_interests"
                  ? (e) => setRecognised(e.target.checked)
                  : b === "legitimate_interests"
                    ? (e) => setLegitimate(e.target.checked)
                    : undefined
              }
              className="mt-1 accent-brand"
            />
            <span>
              {LAWFUL_BASES[b].label} <span className="font-mono text-[11px] text-ink-soft">{LAWFUL_BASES[b].point}</span>
            </span>
          </label>
        ))}
      </div>
      {publicAuthority && (recognised || legitimate) ? (
        <div className="space-y-2 rounded border border-red-800 bg-red-50 px-3 py-2 text-xs text-red-900">
          <p>
            This entity is a public authority. Article 6(1) does not let a public authority rely on legitimate
            interests or recognised legitimate interests for processing in the performance of its tasks: those
            rest on public task (Article 6(1)(e)) or another basis.
          </p>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="outsidePublicTasks" defaultChecked={outsidePublicTasks} className="mt-0.5 accent-brand" />
            <span>This processing is not in the performance of the authority&apos;s tasks</span>
          </label>
        </div>
      ) : null}
      {recognised ? (
        <label className="block space-y-1">
          <span className={label}>
            Annex 1 condition
            <span className="block font-normal normal-case tracking-normal">
              No balancing test is needed, but the right to object still applies, and a significant decision may not rest
              solely on automated processing under this basis (Article 22B).
            </span>
          </span>
          <select
            name="recognisedCondition"
            defaultValue={condition ?? ""}
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
          >
            <option value="">Not yet chosen</option>
            {RECOGNISED_CONDITION_KEYS.map((c) => (
              <option key={c} value={c}>
                {RECOGNISED_CONDITIONS[c].label} — {RECOGNISED_CONDITIONS[c].paragraph}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block space-y-1">
        <span className={label}>
          Note on the basis
          <span className="block font-normal normal-case tracking-normal">
            Optional. Which purpose rests on which basis, or the basis as the Portal sent it.
          </span>
        </span>
        <input
          name="lawfulBasis"
          defaultValue={note}
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>
    </fieldset>
  );
}
