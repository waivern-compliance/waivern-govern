"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ART10_MEMBER_STATE_LAW,
  ART10_OFFICIAL_AUTHORITY,
  ART9_CONDITIONS,
  ART9_CONDITION_KEYS,
  SCHEDULE_1,
  SCHEDULE_1_KEYS,
  conditionsNeedingPolicy,
  describeArt10,
  describeSchedule1,
  isArt10Condition,
  isArt9Condition,
  isSchedule1Condition,
  schedule1For,
  type SpecialCategoryRecord,
} from "@/lib/dpa2018/schedule-1";

const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";
const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";
const tri = (v: boolean | null) => (v === null ? "" : v ? "yes" : "no");
const fromTri = (v: string) => (v === "yes" ? true : v === "no" ? false : null);

/**
 * Special category and criminal offence data, and the conditions relied on.
 *
 * Asked as choices, in the order the law asks them: the Article 9(2) point,
 * then the Schedule 1 condition only where that point needs one, and the
 * Article 10 condition separately. Where a condition needs an appropriate
 * policy document, paragraph 41's question about retention follows.
 *
 * For an entity subject to EU law only (`ukLaw` false), only Articles 9 and
 * 10 are asked: Schedule 1 and the policy document are UK law.
 */
export function SpecialCategoryFields({ record, ukLaw = true }: { record: SpecialCategoryRecord; ukLaw?: boolean }) {
  const [special, setSpecial] = useState(tri(record.specialCategory));
  const [art9, setArt9] = useState<string>(record.art9Condition ?? "");
  const [schedule1, setSchedule1] = useState<string>(record.schedule1Condition ?? "");
  const [criminal, setCriminal] = useState(tri(record.criminalOffence));
  const [art10, setArt10] = useState<string>(record.art10Condition ?? "");
  const [follows, setFollows] = useState(tri(record.retentionFollowsPolicy));

  const allowed = ukLaw && isArt9Condition(art9) ? schedule1For(art9) : [];
  const needing = !ukLaw ? [] : conditionsNeedingPolicy({
    specialCategory: fromTri(special),
    schedule1Condition: allowed.length === 1 ? allowed[0] : isSchedule1Condition(schedule1) ? schedule1 : null,
    criminalOffence: fromTri(criminal),
    art10Condition: isArt10Condition(art10) ? art10 : null,
  });

  return (
    <fieldset className="space-y-3">
      <legend className={label}>
        Special category and criminal offence data
        <span className="block font-normal normal-case tracking-normal">
          {ukLaw ? "UK GDPR Articles 9 and 10, with the Data Protection Act 2018 Schedule 1" : "GDPR Articles 9 and 10"}
        </span>
      </legend>

      <input type="hidden" name="ukLaw" value={ukLaw ? "yes" : "no"} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={label}>Special category data?</span>
          <select name="specialCategory" value={special} onChange={(e) => setSpecial(e.target.value)} className={input}>
            <option value="">Not yet known</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className={label}>Criminal offence data?</span>
          <select name="criminalOffence" value={criminal} onChange={(e) => setCriminal(e.target.value)} className={input}>
            <option value="">Not yet known</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      </div>

      {special === "yes" ? (
        <div className="space-y-3 rounded border border-line px-3 py-3">
          <label className="block space-y-1">
            <span className={label}>Article 9(2) condition</span>
            <select name="art9Condition" value={art9} onChange={(e) => setArt9(e.target.value)} className={input}>
              <option value="">Not yet chosen</option>
              {ART9_CONDITION_KEYS.map((k) => (
                <option key={k} value={k}>
                  {ART9_CONDITIONS[k].point} — {ART9_CONDITIONS[k].label}
                </option>
              ))}
            </select>
          </label>
          {allowed.length === 1 ? (
            <p className="text-xs text-ink-soft">
              Section 10 adds the condition in {describeSchedule1(allowed[0])}.
            </p>
          ) : allowed.length > 1 ? (
            <label className="block space-y-1">
              <span className={label}>
                Schedule 1 condition
                <span className="block font-normal normal-case tracking-normal">
                  Part 2: substantial public interest. All but paragraphs 10, 13 and 27 always need an appropriate policy document.
                </span>
              </span>
              <select name="schedule1Condition" value={schedule1} onChange={(e) => setSchedule1(e.target.value)} className={input}>
                <option value="">Not yet chosen</option>
                {allowed.map((k) => (
                  <option key={k} value={k}>
                    Paragraph {SCHEDULE_1[k].paragraph} — {SCHEDULE_1[k].label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {criminal === "yes" ? (
        <label className="block space-y-1 rounded border border-line px-3 py-3">
          <span className={label}>
            Article 10 condition
            <span className="block font-normal normal-case tracking-normal">
              {ukLaw
                ? "Under official authority, or a condition in Part 1, 2 or 3 of Schedule 1 (s.10(5)). A Part 2 condition serves without its substantial public interest words (paragraph 36)."
                : "Under official authority, or authorised by Union or Member State law providing appropriate safeguards."}
            </span>
          </span>
          <select name="art10Condition" value={art10} onChange={(e) => setArt10(e.target.value)} className={input}>
            <option value="">Not yet chosen</option>
            <option value={ART10_OFFICIAL_AUTHORITY}>{describeArt10(ART10_OFFICIAL_AUTHORITY)}</option>
            {!ukLaw ? <option value={ART10_MEMBER_STATE_LAW}>{describeArt10(ART10_MEMBER_STATE_LAW)}</option> : null}
            {(ukLaw ? ([1, 2, 3] as const) : []).map((part) => (
              <optgroup key={part} label={`Schedule 1, Part ${part}`}>
                {SCHEDULE_1_KEYS.filter((k) => SCHEDULE_1[k].part === part).map((k) => (
                  <option key={k} value={k}>
                    Paragraph {SCHEDULE_1[k].paragraph} — {SCHEDULE_1[k].label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      ) : null}

      {needing.length > 0 ? (
        <div className="space-y-2 rounded border border-line bg-ground px-3 py-3 text-xs">
          <p>
            {needing.map((k) => `Paragraph ${SCHEDULE_1[k].paragraph}`).join(" and ")}{" "}
            {needing.length === 1 ? "needs" : "need"} an appropriate policy document, kept until six months after the
            processing stops relying on {needing.length === 1 ? "it" : "them"}.{" "}
            <Link href="/app/policy-documents" className="text-brand hover:underline">
              The policy document register
            </Link>{" "}
            says which are covered.
          </p>
          <label className="block space-y-1">
            <span className={label}>
              Did retention and erasure follow the policy document?
              <span className="block font-normal normal-case tracking-normal">Schedule 1 paragraph 41(c)</span>
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
        </div>
      ) : null}
    </fieldset>
  );
}
