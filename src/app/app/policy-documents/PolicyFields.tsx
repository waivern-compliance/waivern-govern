import { SCHEDULE_1, SCHEDULE_1_KEYS, type Schedule1Condition } from "@/lib/dpa2018/schedule-1";
import { Label, inputClass } from "../requests/fields";

const PART_TITLES = {
  1: "Part 1: employment, health and research",
  2: "Part 2: substantial public interest",
  3: "Part 3: criminal convictions",
} as const;

/**
 * The fields of a policy document, for adding one and for changing it. Only
 * the conditions that need a document are offered: Part 1 paragraphs 2–4 and
 * most of Part 3 need none.
 */
export function PolicyFields({
  values,
  entities,
  members,
  organisationWide,
}: {
  values?: { title: string; version: string | null; conditions: readonly Schedule1Condition[]; ownerId: string | null; entityId: string | null };
  entities: Array<{ id: string; name: string }>;
  members: Array<{ id: string; email: string }>;
  /** Whether the person may file one for the whole organisation. */
  organisationWide: boolean;
}) {
  const offered = SCHEDULE_1_KEYS.filter((k) => SCHEDULE_1[k].policyDocument !== "not_required");
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <Label text="Title" />
          <input name="title" required defaultValue={values?.title ?? ""} placeholder="Appropriate policy document: special category data" className={inputClass} />
        </label>
        <label className="block space-y-1">
          <Label text="Version" hint="Optional." />
          <input name="version" defaultValue={values?.version ?? ""} className={inputClass} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <Label text="For" hint="The controller whose processing it covers." />
          <select name="entityId" defaultValue={values?.entityId ?? (organisationWide ? "" : entities[0]?.id)} className={inputClass}>
            {organisationWide ? <option value="">Every entity in the organisation</option> : null}
            {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <Label text="Owner" />
          <select name="ownerId" defaultValue={values?.ownerId ?? ""} className={inputClass}>
            <option value="">Nobody yet</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}
          </select>
        </label>
      </div>
      <fieldset className="space-y-3">
        <legend>
          <Label text="Conditions it covers" hint="Schedule 1 conditions that need an appropriate policy document." />
        </legend>
        {([1, 2, 3] as const).map((part) => {
          const keys = offered.filter((k) => SCHEDULE_1[k].part === part);
          return (
            <div key={part} className="space-y-1.5">
              <p className="text-xs text-ink-soft">{PART_TITLES[part]}</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {keys.map((k) => (
                  <label key={k} className="flex items-start gap-2.5 text-sm">
                    <input type="checkbox" name="conditions" value={k} defaultChecked={values?.conditions.includes(k)} className="mt-1 accent-brand" />
                    <span>
                      <span className="font-mono text-[11px] text-ink-soft">para {SCHEDULE_1[k].paragraph}</span> {SCHEDULE_1[k].label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </fieldset>
    </>
  );
}
