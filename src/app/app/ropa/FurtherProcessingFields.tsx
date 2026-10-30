"use client";

import { useState } from "react";
import {
  ANNEX2_CONDITIONS,
  ANNEX2_CONDITION_KEYS,
  COMPATIBILITY_FACTORS,
  COMPATIBILITY_FACTOR_KEYS,
  COMPATIBILITY_ROUTES,
  COMPATIBILITY_ROUTE_KEYS,
  RESEARCH_SAFEGUARDS,
  RESEARCH_SAFEGUARD_KEYS,
  compatibilityRoutes,
  type FurtherProcessingRecord,
} from "@/lib/gdpr/further-processing";

const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";
const hint = "block font-normal normal-case tracking-normal";
const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";

const yesNo = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");

function YesNo({
  name,
  value,
  onChange,
  title,
  help,
  no = "No",
}: {
  name: string;
  value: string;
  onChange: (v: string) => void;
  title: string;
  help?: string;
  no?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className={label}>
        {title}
        {help ? <span className={hint}>{help}</span> : null}
      </span>
      <select name={name} value={value} onChange={(e) => onChange(e.target.value)} className={input}>
        <option value="">Not yet known</option>
        <option value="yes">Yes</option>
        <option value="no">{no}</option>
      </select>
    </label>
  );
}

/**
 * Further processing (Article 8A) and research (Articles 84A–84C, 13(5)) on a
 * processing activity.
 *
 * Each question appears only when the one before it makes it matter, and the
 * routes Article 8A(4) closes for data collected on consent are shown closed
 * with the reason, so nobody picks one without knowing.
 */
export function FurtherProcessingFields({
  record,
  activities,
}: {
  record: FurtherProcessingRecord;
  /** Other activities this one could reuse data from, and whether each relies on consent. */
  activities: Array<{ id: string; label: string; consent: boolean }>;
}) {
  const [further, setFurther] = useState(yesNo(record.furtherProcessing));
  const [original, setOriginal] = useState(record.originalActivityId ?? "");
  const [originalConsent, setOriginalConsent] = useState(yesNo(record.originalConsent));
  const [route, setRoute] = useState<string>(record.compatibilityRoute ?? "");
  const [unobtainable, setUnobtainable] = useState(yesNo(record.consentUnobtainable));
  const [research, setResearch] = useState(yesNo(record.research));
  const [art13, setArt13] = useState(yesNo(record.art13Exemption));

  const consentAtSource = original
    ? (activities.find((a) => a.id === original)?.consent ?? null)
    : originalConsent === "" ? null : originalConsent === "yes";
  const routes = compatibilityRoutes({ originalConsent: consentAtSource, consentUnobtainable: unobtainable === "yes" });

  return (
    <div className="space-y-4">
      <YesNo
        name="furtherProcessing"
        value={further}
        onChange={setFurther}
        title="Is this further processing?"
        help="Article 8A — using data first collected for a different purpose. The new purpose must be compatible with the original one."
      />

      {further === "yes" ? (
        <div className="space-y-4 border-l-2 border-line pl-4">
          <label className="block space-y-1">
            <span className={label}>
              Collected for
              <span className={hint}>The processing activity the data was first collected for, where it is on the register</span>
            </span>
            <select name="originalActivityId" value={original} onChange={(e) => setOriginal(e.target.value)} className={input}>
              <option value="">Not on the register</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          </label>

          {original ? (
            <p className="text-xs text-ink-soft">
              {consentAtSource
                ? "That activity relies on consent, so Article 8A(4) applies."
                : "That activity does not rely on consent."}
            </p>
          ) : (
            <YesNo
              name="originalConsent"
              value={originalConsent}
              onChange={setOriginalConsent}
              title="Was it collected on consent?"
              help="Article 8A(4) narrows the routes where it was"
            />
          )}

          <fieldset className="space-y-1.5">
            <legend className={label}>
              Why the new purpose is compatible
              <span className={hint}>Article 8A(3) cases are deemed compatible; otherwise weigh the 8A(2) factors</span>
            </legend>
            {COMPATIBILITY_ROUTE_KEYS.map((r) => (
              <label key={r} className="flex items-start gap-2.5 text-sm">
                <input
                  type="radio"
                  name="compatibilityRoute"
                  value={r}
                  checked={route === r}
                  onChange={() => setRoute(r)}
                  className="mt-1 accent-brand"
                />
                <span>
                  {COMPATIBILITY_ROUTES[r].label}{" "}
                  <span className="font-mono text-[11px] text-ink-soft">{COMPATIBILITY_ROUTES[r].point}</span>
                  {!routes[r].open ? <span className="block text-xs text-amber-900">{routes[r].why}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>

          {route === "annex2" ? (
            <label className="block space-y-1">
              <span className={label}>Which Annex 2 condition?</span>
              <select name="annex2Condition" defaultValue={record.annex2Condition ?? ""} className={input}>
                <option value="">Not yet chosen</option>
                {ANNEX2_CONDITION_KEYS.map((c) => (
                  <option key={c} value={c}>
                    {ANNEX2_CONDITIONS[c].label} — {ANNEX2_CONDITIONS[c].paragraph}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {(route === "annex2" || route === "article23") && consentAtSource ? (
            <YesNo
              name="consentUnobtainable"
              value={unobtainable}
              onChange={setUnobtainable}
              title="Can consent not reasonably be obtained?"
              help="Article 8A(4)(b) — the condition for this route where the data was collected on consent"
              no="No — consent could be sought"
            />
          ) : null}

          {route === "assessed" ? (
            <fieldset className="space-y-2">
              <legend className={label}>
                The Article 8A(2) factors
                <span className={hint}>Say how each was weighed</span>
              </legend>
              {COMPATIBILITY_FACTOR_KEYS.map((f) => (
                <label key={f} className="block space-y-1">
                  <span className="block text-xs text-ink-soft">
                    {COMPATIBILITY_FACTORS[f].label}{" "}
                    <span className="font-mono text-[11px]">{COMPATIBILITY_FACTORS[f].point}</span>
                  </span>
                  <textarea
                    name={`factor_${f}`}
                    rows={2}
                    defaultValue={record.compatibilityFactors?.[f] ?? ""}
                    className={input}
                  />
                </label>
              ))}
            </fieldset>
          ) : null}

          {route ? (
            <label className="block space-y-1">
              <span className={label}>
                {route === "article23" ? "Which objective, and the law that authorises it" : "Note"}
                {route === "article23" ? <span className={hint}>Article 23(1)(c)–(j), and the enactment or rule of law</span> : null}
              </span>
              <textarea name="compatibilityNote" rows={2} defaultValue={record.compatibilityNote ?? ""} className={input} />
            </label>
          ) : null}
        </div>
      ) : null}

      <YesNo
        name="research"
        value={research}
        onChange={setResearch}
        title="Is it for research, archiving or statistics?"
        help="Articles 84A–84B — scientific or historical research (commercial or not), archiving in the public interest, or statistics producing aggregate results"
      />

      {research === "yes" ? (
        <div className="space-y-4 border-l-2 border-line pl-4">
          <fieldset className="space-y-2">
            <legend className={label}>
              Safeguards
              <span className={hint}>Article 84C — tick each that holds, and say how</span>
            </legend>
            {RESEARCH_SAFEGUARD_KEYS.map((k) => (
              <div key={k} className="grid gap-1.5 sm:grid-cols-[1fr_1fr] sm:items-center">
                <label className="flex items-start gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    name={`researchSafeguard_${k}`}
                    defaultChecked={record.researchSafeguards?.[k]?.confirmed ?? false}
                    className="mt-1 accent-brand"
                  />
                  <span>
                    {RESEARCH_SAFEGUARDS[k].label}{" "}
                    <span className="font-mono text-[11px] text-ink-soft">{RESEARCH_SAFEGUARDS[k].point}</span>
                  </span>
                </label>
                <input
                  name={`researchSafeguardNote_${k}`}
                  aria-label={`How: ${RESEARCH_SAFEGUARDS[k].label}`}
                  placeholder="How"
                  defaultValue={record.researchSafeguards?.[k]?.note ?? ""}
                  className="w-full rounded border border-line bg-ground px-3 py-1.5 text-sm"
                />
              </div>
            ))}
          </fieldset>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="approvedMedicalResearch"
              defaultChecked={record.approvedMedicalResearch ?? false}
              className="mt-1 accent-brand"
            />
            <span>
              Approved medical research{" "}
              <span className="block text-xs text-ink-soft">
                Approved by a recognised research ethics committee or equivalent body (Article 84C(5)). It may then be
                for decisions about a particular person.
              </span>
            </span>
          </label>

          {further === "yes" ? (
            <>
              <YesNo
                name="art13Exemption"
                value={art13}
                onChange={setArt13}
                title="Is telling people about the new purpose impossible or disproportionate?"
                help="Article 13(5)–(6) — judged by the number of people, the age of the data and the safeguards"
                no="No — they will be told"
              />
              {art13 === "yes" ? (
                <label className="block space-y-1">
                  <span className={label}>
                    Where the information is published
                    <span className={hint}>Article 13(7) — the measures taken instead, such as making it publicly available</span>
                  </span>
                  <input
                    name="publicInformationUrl"
                    type="url"
                    defaultValue={record.publicInformationUrl ?? ""}
                    placeholder="https://"
                    className={input}
                  />
                </label>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
