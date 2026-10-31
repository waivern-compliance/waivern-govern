"use client";

import { useState } from "react";
import {
  ADM_SAFEGUARDS,
  ADM_SAFEGUARD_KEYS,
  ADM_SET_ASIDE_REASONS,
  ADM_SET_ASIDE_REASON_KEYS,
  ADM_SPECIAL_CONDITIONS,
  ADM_SPECIAL_CONDITIONS_FOR,
  admConditionParagraph,
  admSafeguardPoint,
  type AdmRecord,
} from "@/lib/gdpr/automated-decisions";
import type { Regime } from "@/lib/dpa2018/part3";

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
 *
 * Under Part 3 the same questions cite ss.50A–50C, the conditions are
 * Part 3's, and one more is asked: whether the safeguards may be set aside
 * for some decisions (s.50C(3)).
 */
export function AutomatedDecisionFields({ record, regime = "uk_gdpr" }: { record: AdmRecord; regime?: Regime }) {
  const [solely, setSolely] = useState(yesNo(record.automatedDecisions));
  const [special, setSpecial] = useState(yesNo(record.admSpecialCategory));
  const [setAside, setSetAside] = useState(Boolean(record.admSetAside));
  const part3 = regime === "dpa_part3";

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className={label}>
          Significant decisions taken solely by automated means?
          <span className={hint}>
            {part3 ? "Section 50A" : "Article 22A"} — a decision with {part3 ? "an adverse" : "a"} legal or similarly
            significant {part3 ? "adverse " : ""}effect on someone, with no meaningful human involvement. Consider how
            far it is reached by profiling.
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
              {part3 ? "Based wholly or partly on sensitive processing?" : "Based wholly or partly on special category data?"}
              <span className={hint}>
                {part3
                  ? "Section 50B(1) — the categories in s.35(8): racial or ethnic origin, political opinions, beliefs, trade union membership, genetic or biometric data to identify someone, health, sex life or orientation"
                  : "Article 22B(1) — health, ethnicity, beliefs, biometrics and the rest of Article 9(1)"}
              </span>
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
                Which {part3 ? "section 50B" : "Article 22B"} condition is met?
                <span className={hint}>Without one, the decision may not be taken solely by automated means.</span>
              </span>
              <select name="admSpecialCondition" defaultValue={record.admSpecialCondition ?? ""} className={select}>
                <option value="">None yet</option>
                {ADM_SPECIAL_CONDITIONS_FOR[regime].map((c) => (
                  <option key={c} value={c}>
                    {ADM_SPECIAL_CONDITIONS[c].label} — {admConditionParagraph(c, regime)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <fieldset className="space-y-2">
            <legend className={label}>
              Safeguards in place
              <span className={hint}>{part3 ? "Section 50C(2)" : "Article 22C(2)"} — tick each one that is in place, and say how</span>
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
                    <span className="font-mono text-[11px] text-ink-soft">{admSafeguardPoint(k, regime)}</span>
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

          {part3 ? (
            <div className="space-y-2 rounded border border-line px-3 py-3">
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={setAside}
                  onChange={(e) => setSetAside(e.target.checked)}
                  className="mt-1 accent-brand"
                />
                <span>
                  Some decisions may be taken without these safeguards{" "}
                  <span className="font-mono text-[11px] text-ink-soft">Section 50C(3)</span>
                  <span className="block text-xs text-ink-soft">
                    Only where that is required for a reason in s.50C(4), and the decision is then reconsidered as soon as
                    reasonably practicable with meaningful human involvement.
                  </span>
                </span>
              </label>
              {setAside ? (
                <>
                  <fieldset className="space-y-1.5">
                    <legend className={label}>For which reasons</legend>
                    {ADM_SET_ASIDE_REASON_KEYS.map((r) => (
                      <label key={r} className="flex items-start gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          name="setAsideReasons"
                          value={r}
                          defaultChecked={record.admSetAside?.reasons.includes(r) ?? false}
                          className="mt-1 accent-brand"
                        />
                        <span>
                          <span className="font-mono text-[11px] text-ink-soft">({r})</span> {ADM_SET_ASIDE_REASONS[r]}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <label className="block space-y-1">
                    <span className={label}>How each such decision is reconsidered, and by whom</span>
                    <textarea
                      name="setAsideReconsideration"
                      rows={2}
                      defaultValue={record.admSetAside?.reconsideration ?? ""}
                      className={select}
                    />
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
