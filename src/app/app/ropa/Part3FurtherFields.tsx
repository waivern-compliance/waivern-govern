"use client";

import { useState } from "react";
import { PART3_RESEARCH_SAFEGUARDS, PART3_RESEARCH_SAFEGUARD_KEYS, type Part3FurtherRecord } from "@/lib/dpa2018/part3-further";

const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";
const hint = "block font-normal normal-case tracking-normal";
const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";

const yesNo = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

/**
 * Further processing (s.36) and research (s.41) on a record under Part 3 of
 * the Data Protection Act 2018. No compatibility test and no deemed cases, as
 * the UK GDPR has: the reuse must be authorised by law and necessary and
 * proportionate to the new law enforcement purpose.
 */
export function Part3FurtherFields({
  record,
  activities,
}: {
  record: Part3FurtherRecord;
  /** Other activities this one could reuse data from. */
  activities: Array<{ id: string; label: string }>;
}) {
  const [further, setFurther] = useState(yesNo(record.furtherProcessing));
  const [research, setResearch] = useState(yesNo(record.research));

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className={label}>
          Is data collected for another law enforcement purpose processed here?
          <span className={hint}>Section 36(3) — by this controller or another, for a different law enforcement purpose</span>
        </span>
        <select name="furtherProcessing" value={further} onChange={(e) => setFurther(e.target.value)} className={input}>
          <option value="">Not yet known</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>

      {further === "yes" ? (
        <div className="space-y-4 border-l-2 border-line pl-4">
          <label className="block space-y-1">
            <span className={label}>
              Collected for
              <span className={hint}>The processing activity the data was first collected for, where it is on the register</span>
            </span>
            <select name="originalActivityId" defaultValue={record.originalActivityId ?? ""} className={input}>
              <option value="">Not on the register, or another controller&apos;s</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={label}>
              Which law authorises us to process it for this purpose?
              <span className={hint}>Section 36(3)(a) — the statute, common law power or other authority relied on</span>
            </span>
            <input name="furtherAuthorisedBy" defaultValue={record.furtherAuthorisedBy ?? ""} className={input} />
          </label>
          <label className="block space-y-1">
            <span className={label}>
              Is the processing necessary and proportionate to that purpose?
              <span className={hint}>Section 36(3)(b)</span>
            </span>
            <select name="furtherNecessaryProportionate" defaultValue={yesNo(record.furtherNecessaryProportionate)} className={input}>
              <option value="">Not yet confirmed</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
      ) : null}

      <label className="block space-y-1">
        <span className={label}>
          Is it for archiving in the public interest, scientific or historical research, or statistics?
          <span className={hint}>Section 41</span>
        </span>
        <select name="research" value={research} onChange={(e) => setResearch(e.target.value)} className={input}>
          <option value="">Not yet known</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>

      {research === "yes" ? (
        <fieldset className="space-y-2 border-l-2 border-line pl-4">
          <legend className={label}>
            It is not permitted unless both hold
            <span className={hint}>Section 41(2) — tick each that does, and say how</span>
          </legend>
          {PART3_RESEARCH_SAFEGUARD_KEYS.map((k) => (
            <div key={k} className="grid gap-1.5 sm:grid-cols-[1fr_1fr] sm:items-center">
              <label className="flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  name={`researchSafeguard_${k}`}
                  defaultChecked={record.researchSafeguards?.[k]?.confirmed ?? false}
                  className="mt-1 accent-brand"
                />
                <span>
                  {PART3_RESEARCH_SAFEGUARDS[k]!.label}{" "}
                  <span className="font-mono text-[11px] text-ink-soft">{PART3_RESEARCH_SAFEGUARDS[k]!.point}</span>
                </span>
              </label>
              <input
                name={`researchSafeguardNote_${k}`}
                aria-label={`How: ${PART3_RESEARCH_SAFEGUARDS[k]!.label}`}
                placeholder="How"
                defaultValue={record.researchSafeguards?.[k]?.note ?? ""}
                className="w-full rounded border border-line bg-ground px-3 py-1.5 text-sm"
              />
            </div>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
