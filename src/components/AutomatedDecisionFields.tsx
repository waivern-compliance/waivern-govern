"use client";

import { useState } from "react";
import {
  ADM_SAFEGUARDS,
  ADM_SAFEGUARD_KEYS,
  ADM_SPECIAL_CONDITIONS,
  ADM_SPECIAL_CONDITION_KEYS,
  type AdmRecord,
} from "@/lib/gdpr/automated-decisions";

const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";
const hint = "block font-normal normal-case tracking-normal";
const select = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";

const yesNo = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

/**
 * The automated-decision record (Articles 22A–22C), the same on a processing
 * activity and an AI use case.
 *
 * The rest is asked only once somebody says significant decisions are taken
 * solely by automated means: a system with a person meaningfully involved owes
 * none of it, and asking anyway would teach people to tick through.
 */
export function AutomatedDecisionFields({ record }: { record: AdmRecord }) {
  const [solely, setSolely] = useState(yesNo(record.automatedDecisions));
  const [special, setSpecial] = useState(yesNo(record.admSpecialCategory));

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className={label}>
          Significant decisions taken solely by automated means?
          <span className={hint}>
            Article 22A — a decision with a legal or similarly significant effect on someone, with no meaningful
            human involvement. Consider how far it is reached by profiling.
          </span>
        </span>
        <select name="automatedDecisions" value={solely} onChange={(e) => setSolely(e.target.value)} className={select}>
          <option value="">Not yet known</option>
          <option value="yes">Yes</option>
          <option value="no">No — a person is meaningfully involved, or the effect is not significant</option>
        </select>
      </label>

      {solely === "yes" ? (
        <>
          <label className="block space-y-1">
            <span className={label}>
              Based wholly or partly on special category data?
              <span className={hint}>Article 22B(1) — health, ethnicity, beliefs, biometrics and the rest of Article 9(1)</span>
            </span>
            <select name="admSpecialCategory" value={special} onChange={(e) => setSpecial(e.target.value)} className={select}>
              <option value="">Not yet known</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>

          {special === "yes" ? (
            <label className="block space-y-1">
              <span className={label}>
                Which Article 22B condition is met?
                <span className={hint}>Without one, the decision may not be taken solely by automated means.</span>
              </span>
              <select name="admSpecialCondition" defaultValue={record.admSpecialCondition ?? ""} className={select}>
                <option value="">None yet</option>
                {ADM_SPECIAL_CONDITION_KEYS.map((c) => (
                  <option key={c} value={c}>
                    {ADM_SPECIAL_CONDITIONS[c].label} — {ADM_SPECIAL_CONDITIONS[c].paragraph}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <fieldset className="space-y-2">
            <legend className={label}>
              Safeguards in place
              <span className={hint}>Article 22C(2) — tick each one that is in place, and say how</span>
            </legend>
            {ADM_SAFEGUARD_KEYS.map((k) => (
              <div key={k} className="grid gap-1.5 sm:grid-cols-[1fr_1fr] sm:items-center">
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name={`safeguard_${k}`}
                    defaultChecked={record.admSafeguards?.[k]?.confirmed ?? false}
                    className="mt-1 accent-brand"
                  />
                  <span>
                    {ADM_SAFEGUARDS[k].label}{" "}
                    <span className="font-mono text-[11px] text-ink-soft">{ADM_SAFEGUARDS[k].point}</span>
                  </span>
                </label>
                <input
                  name={`safeguardNote_${k}`}
                  aria-label={`How: ${ADM_SAFEGUARDS[k].label}`}
                  placeholder="How"
                  defaultValue={record.admSafeguards?.[k]?.note ?? ""}
                  className="w-full rounded border border-line bg-ground px-3 py-1.5 text-sm"
                />
              </div>
            ))}
          </fieldset>
        </>
      ) : null}
    </div>
  );
}
