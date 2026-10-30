"use client";

import { useState, type ReactNode } from "react";
import {
  LOGGED_OPERATIONS,
  LOGGED_OPERATION_KEYS,
  PART3_BASES,
  REGIMES,
  SCHEDULE_8,
  SCHEDULE_8_KEYS,
  SENSITIVE_ROUTES,
  type LoggingStatement,
  type Part3Record,
  type Regime,
} from "@/lib/dpa2018/part3";

const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";
const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";
const tri = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

/**
 * The regime the record is kept under, and the questions that go with it.
 *
 * Part 3 is offered only where the entity is a competent authority, or the
 * record is already under it. The UK GDPR questions are passed in, and kept
 * as they were while the record is under Part 3.
 */
export function RegimeFields({
  regime,
  available,
  record,
  systems,
  ukGdpr,
}: {
  regime: Regime;
  available: boolean;
  record: Part3Record;
  systems: readonly string[];
  ukGdpr: ReactNode;
}) {
  const [chosen, setChosen] = useState<Regime>(regime);
  return (
    <div className="space-y-5">
      {available ? (
        <label className="block space-y-1">
          <span className={label}>
            Regime
            <span className="block font-normal normal-case tracking-normal">
              Law enforcement processing by a competent authority falls under Part 3 of the Data Protection Act 2018, not
              the UK GDPR. Staff, finance and other processing stays under the UK GDPR.
            </span>
          </span>
          <select name="regime" value={chosen} onChange={(e) => setChosen(e.target.value as Regime)} className={input}>
            {(Object.keys(REGIMES) as Regime[]).map((r) => <option key={r} value={r}>{REGIMES[r]}</option>)}
          </select>
        </label>
      ) : (
        <input type="hidden" name="regime" value={chosen} />
      )}
      {chosen === "dpa_part3" ? <Part3Fields record={record} systems={systems} /> : ukGdpr}
    </div>
  );
}

function Part3Fields({ record, systems }: { record: Part3Record; systems: readonly string[] }) {
  const [sensitive, setSensitive] = useState(tri(record.sensitiveProcessing));
  const [route, setRoute] = useState(record.sensitiveRoute ?? "");
  const [follows, setFollows] = useState(tri(record.retentionFollowsPolicy));
  // One row for each system named on the record, then any statement for a
  // system no longer named, and one blank row to add another.
  const named = systems.map((s) => record.logging.find((l) => l.system.toLowerCase() === s.toLowerCase()) ?? blank(s));
  const others = record.logging.filter((l) => !systems.some((s) => s.toLowerCase() === l.system.toLowerCase()));
  const rows = [...named, ...others, blank("")];

  return (
    <fieldset className="space-y-4">
      <legend className={label}>
        Law enforcement processing
        <span className="block font-normal normal-case tracking-normal">Data Protection Act 2018, Part 3</span>
      </legend>

      <label className="block space-y-1">
        <span className={label}>How section 35(2) is met</span>
        <select name="part3Basis" defaultValue={record.part3Basis ?? ""} className={input}>
          <option value="">Not yet chosen</option>
          {Object.entries(PART3_BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>

      <div className="space-y-3 rounded border border-line px-3 py-3">
        <label className="block space-y-1">
          <span className={label}>
            Sensitive processing?
            <span className="block font-normal normal-case tracking-normal">
              Section 35(8): racial or ethnic origin, political opinions, religious or philosophical beliefs, trade union
              membership, genetic or biometric data to identify someone, health, sex life or sexual orientation.
            </span>
          </span>
          <select name="sensitiveProcessing" value={sensitive} onChange={(e) => setSensitive(e.target.value)} className={input}>
            <option value="">Not yet known</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        {sensitive === "yes" ? (
          <>
            <label className="block space-y-1">
              <span className={label}>On what</span>
              <select name="sensitiveRoute" value={route} onChange={(e) => setRoute(e.target.value)} className={input}>
                <option value="">Not yet chosen</option>
                {Object.entries(SENSITIVE_ROUTES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            {route === "strictly_necessary" ? (
              <label className="block space-y-1">
                <span className={label}>Schedule 8 condition</span>
                <select name="schedule8Condition" defaultValue={record.schedule8Condition ?? ""} className={input}>
                  <option value="">Not yet chosen</option>
                  {SCHEDULE_8_KEYS.map((k) => (
                    <option key={k} value={k}>Paragraph {SCHEDULE_8[k].paragraph} — {SCHEDULE_8[k].label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className="text-xs text-ink-soft">
              Either way an appropriate policy document must be in place (s.42), kept until six months after the
              processing stops. The policy document register says which grounds are covered.
            </p>
            <label className="block space-y-1">
              <span className={label}>
                Did retention and erasure follow the policy document?
                <span className="block font-normal normal-case tracking-normal">Section 42(4)(c)</span>
              </span>
              <select name="retentionFollowsPolicy" value={follows} onChange={(e) => setFollows(e.target.value)} className={input}>
                <option value="">Not yet known</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            {follows === "no" ? (
              <label className="block space-y-1">
                <span className={label}>Why not</span>
                <input name="retentionPolicyNote" defaultValue={record.retentionPolicyNote ?? ""} className={input} />
              </label>
            ) : null}
          </>
        ) : null}
      </div>

      <label className="block space-y-1">
        <span className={label}>
          Is fact distinguished from personal assessment?
          <span className="block font-normal normal-case tracking-normal">Section 38(2), so far as possible.</span>
        </span>
        <select name="factOpinionMarked" defaultValue={tri(record.factOpinionMarked)} className={input}>
          <option value="">Not yet known</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className={label}>
          Logging
          <span className="block font-normal normal-case tracking-normal">
            Section 62: each automated system logs these six operations. Consultation and disclosure logs show the date
            and time and, so far as possible, who did it and to whom. A statement of what is logged; the logs stay in
            the system.
          </span>
        </legend>
        <input type="hidden" name="loggingRows" value={rows.length} />
        {rows.map((l, i) => (
          <div key={i} className="space-y-2 rounded border border-line px-3 py-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <input name={`logging_system_${i}`} defaultValue={l.system} placeholder="Another system" className={input} aria-label="System" />
              <input name={`logging_reviewer_${i}`} defaultValue={l.reviewer ?? ""} placeholder="Who reviews the logs" className={input} aria-label="Reviewer" />
              <input type="date" name={`logging_checked_${i}`} defaultValue={l.lastChecked ?? ""} className={input} aria-label="Last checked" />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {LOGGED_OPERATION_KEYS.map((o) => (
                <label key={o} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name={`logging_ops_${i}`} value={o} defaultChecked={l.operations.includes(o)} className="accent-brand" />
                  {LOGGED_OPERATIONS[o]}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" name={`logging_identifies_${i}`} defaultChecked={l.identifiesPeople} className="accent-brand" />
                Shows who consulted or disclosed, and to whom
              </label>
            </div>
          </div>
        ))}
      </fieldset>
    </fieldset>
  );
}

function blank(system: string): LoggingStatement {
  return { system, operations: [], identifiesPeople: false, reviewer: null, lastChecked: null };
}
