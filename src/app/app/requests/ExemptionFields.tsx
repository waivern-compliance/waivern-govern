"use client";

import { useState } from "react";
import {
  APPROPRIATE_PROFESSIONAL,
  EXEMPTIONS,
  EXEMPTION_KEYS,
  EXPECTATION_LIMBS,
  REQUESTER_CAPACITIES,
  exemptionProvision,
  isExemption,
} from "@/lib/dpa2018/exemptions";
import { Label, inputClass } from "./fields";

const PARTS: Array<{ title: string; keys: string[] }> = [
  { title: "Schedule 2: crime, tax, immigration", keys: ["sch2_p2", "sch2_p3", "sch2_p4"] },
  { title: "Schedule 2: protecting the public, regulation, Parliament, the courts", keys: ["sch2_p7", "sch2_p8", "sch2_p9", "sch2_p10", "sch2_p11", "sch2_p13", "sch2_p14", "sch2_p15"] },
  { title: "Schedule 2: other people, privilege, references, exams", keys: ["sch2_p16", "sch2_p19", "sch2_p20", "sch2_p21", "sch2_p22", "sch2_p23", "sch2_p24", "sch2_p25"] },
  { title: "Schedule 2: journalism, research, archiving", keys: ["sch2_p26", "sch2_p27", "sch2_p28"] },
  { title: "Schedule 3: health, social work, education, child abuse", keys: EXEMPTION_KEYS.filter((k) => k.startsWith("sch3_")) },
];

function Tick({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input type="checkbox" name={name} className="mt-1 accent-brand" />
      <span>{children}</span>
    </label>
  );
}

/**
 * Which Schedule 2 or 3 paragraph is relied on, and what that paragraph asks
 * to be recorded beyond the reasons.
 */
export function ExemptionFields({ opinions }: { opinions: Array<{ id: string; label: string; usable: boolean }> }) {
  const [key, setKey] = useState("");
  const [healthProfessional, setHealthProfessional] = useState("");
  const [told, setTold] = useState("");
  const e = isExemption(key) ? EXEMPTIONS[key] : null;
  const extra = e && "extra" in e ? e.extra : undefined;

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <Label text="Exemption" hint="Data Protection Act 2018. Applied to the specific information, and only as far as its test is met." />
        <select name="exemption" value={key} onChange={(ev) => setKey(ev.target.value)} required className={inputClass}>
          <option value="">Choose the paragraph</option>
          {PARTS.map((p) => (
            <optgroup key={p.title} label={p.title}>
              {p.keys.filter(isExemption).map((k) => (
                <option key={k} value={k}>
                  {exemptionProvision(k).replace("DPA 2018 ", "")} — {EXEMPTIONS[k].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      {e ? <p className="max-w-prose text-xs text-ink-soft">{e.test}</p> : null}

      {extra === "immigration" ? (
        <div className="space-y-2 rounded border border-line px-3 py-3">
          <p className="text-xs text-ink-soft">
            Paragraphs 4A and 4B: one decision for each right, made afresh each time it is considered.
          </p>
          <Tick name="secretaryOfState">The controller is the Secretary of State</Tick>
          <label className="block space-y-1">
            <Label text="Vulnerability, rights and duties considered" hint="Para 4A(3): the person's vulnerability, their rights including Convention rights, and the UK's duties, including to children (s.55 of the 2009 Act) and under the Refugee and Trafficking Conventions." />
            <textarea name="vulnerability" rows={2} className={inputClass} />
          </label>
          <Tick name="substantialRisk">Applying the right would give rise to a substantial risk of prejudice to immigration control</Tick>
          <Tick name="outweighs">That risk outweighs the risk of prejudice to the person if the exemption is applied</Tick>
          <Tick name="necessaryAndProportionate">Applying the exemption is necessary and proportionate to those risks</Tick>
          <label className="block space-y-1">
            <Label text="Was the person told of the decision?" hint="Para 4B(2): unless telling them may prejudice immigration control." />
            <select name="personTold" value={told} onChange={(ev) => setTold(ev.target.value)} className={inputClass}>
              <option value="">Choose</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          {told === "no" ? (
            <label className="block space-y-1">
              <Label text="Why telling them would prejudice immigration control" />
              <input name="notToldReason" className={inputClass} />
            </label>
          ) : null}
        </div>
      ) : null}

      {extra === "health_opinion" ? (
        <div className="space-y-2 rounded border border-line px-3 py-3">
          <label className="block space-y-1">
            <Label text="Is the controller itself a health professional?" hint="Para 5(2): if not, only on the appropriate health professional's opinion." />
            <select name="controllerIsHealthProfessional" value={healthProfessional} onChange={(ev) => setHealthProfessional(ev.target.value)} className={inputClass}>
              <option value="">Choose</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          {healthProfessional === "no" ? (
            <>
              <label className="block space-y-1">
                <Label text="The opinion relied on" hint="Recorded on this request as a health professional's opinion. Only one within the last six months counts." />
                <select name="opinionDecisionId" className={inputClass}>
                  <option value="">None recorded</option>
                  {opinions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}{o.usable ? "" : " (cannot be relied on)"}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Why it would not be reasonable to consult them again" hint="Para 5(3)(b)." />
                <input name="reconsultNotReasonable" className={inputClass} />
              </label>
            </>
          ) : null}
        </div>
      ) : null}

      {extra === "parent_request" || extra === "child_abuse" ? (
        <div className="space-y-2 rounded border border-line px-3 py-3">
          <label className="block space-y-1">
            <Label text="Who made the request" hint="These paragraphs apply only to a request by one of these, for someone else." />
            <select name="requesterCapacity" className={inputClass}>
              <option value="">Choose</option>
              {Object.entries(REQUESTER_CAPACITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          {extra === "parent_request" ? (
            <label className="block space-y-1">
              <Label text="Which applies" hint="Paras 4(2) and 10(2)." />
              <select name="expectation" className={inputClass}>
                <option value="">Choose</option>
                {Object.entries(EXPECTATION_LIMBS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          ) : (
            <Tick name="notScotland">The request is not made in Scotland</Tick>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A health professional's opinion on the serious harm test (Sch 3 paras 2, 5 and 6). */
export function HealthOpinionFields() {
  return (
    <div className="space-y-2 rounded border border-line px-3 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <Label text="Who gave it" hint="Their role." />
          <input name="professionalRole" placeholder="Consultant psychiatrist responsible for their care" className={inputClass} />
        </label>
        <label className="block space-y-1">
          <Label text="Given on" />
          <input name="givenOn" type="date" className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1">
        <Label text="Why they are the appropriate health professional" />
        <select name="appropriate" className={inputClass}>
          <option value="">Choose</option>
          {Object.entries(APPROPRIATE_PROFESSIONAL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <Label text="Their opinion" />
        <select name="testMet" className={inputClass}>
          <option value="">Choose</option>
          <option value="yes">The serious harm test is met: access would be likely to cause serious harm</option>
          <option value="no">The serious harm test is not met</option>
        </select>
      </label>
    </div>
  );
}
