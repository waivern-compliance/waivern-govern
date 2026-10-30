import { ART10_OFFICIAL_AUTHORITY, SCHEDULE_1, SCHEDULE_1_KEYS, describeArt10 } from "@/lib/dpa2018/schedule-1";
import { LAWFUL_BASES, LAWFUL_BASIS_KEYS } from "@/lib/gdpr/lawful-basis";
import type { PartyBasis } from "@/lib/dpa2018/sharing";
import { Label, inputClass } from "../requests/fields";

/**
 * One controller's basis for its side of the sharing: Article 6, and where
 * special category or criminal offence data is shared, the condition.
 */
export function BasisFields({ basis, who }: { basis: PartyBasis; who: string }) {
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend>
          <Label text={`${who}: lawful basis`} hint="Article 6(1). Each controller needs its own." />
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {LAWFUL_BASIS_KEYS.map((b) => (
            <label key={b} className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="lawfulBases" value={b} defaultChecked={basis.lawfulBases.includes(b)} className="mt-1 accent-brand" />
              <span>
                {LAWFUL_BASES[b].label} <span className="font-mono text-[11px] text-ink-soft">{LAWFUL_BASES[b].point}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <Label text="Schedule 1 condition" hint="Where special category data is shared." />
          <select name="schedule1Condition" defaultValue={basis.schedule1Condition ?? ""} className={inputClass}>
            <option value="">None, or not shared</option>
            {SCHEDULE_1_KEYS.filter((k) => SCHEDULE_1[k].part !== 3).map((k) => (
              <option key={k} value={k}>Paragraph {SCHEDULE_1[k].paragraph} — {SCHEDULE_1[k].label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <Label text="Article 10 condition" hint="Where criminal offence data is shared." />
          <select name="art10Condition" defaultValue={basis.art10Condition ?? ""} className={inputClass}>
            <option value="">None, or not shared</option>
            <option value={ART10_OFFICIAL_AUTHORITY}>{describeArt10(ART10_OFFICIAL_AUTHORITY)}</option>
            {SCHEDULE_1_KEYS.map((k) => (
              <option key={k} value={k}>Paragraph {SCHEDULE_1[k].paragraph} — {SCHEDULE_1[k].label}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
