import { RIGHT_KEYS, RIGHTS } from "@/lib/dsr/statutory";

/** Shared by the register's server pages and its client forms, so not a client module. */
export function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
      {text}
      {hint ? <span className="block font-normal normal-case tracking-normal">{hint}</span> : null}
    </span>
  );
}

export const inputClass =
  "w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand";

export const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  web_form: "Web form",
  post: "Post",
  phone: "Phone",
  in_person: "In person",
  social_media: "Social media",
  via_representative: "Through a representative",
  via_processor: "Passed on by a processor",
};

/** The rights, as checkboxes. A letter often invokes several. */
export function RightsField({ selected = [] }: { selected?: readonly string[] }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium uppercase tracking-wider text-ink-soft">
        Which rights
        <span className="block font-normal normal-case tracking-normal">
          The person need not name them, or the Article. Choose what they are asking for.
        </span>
      </legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {RIGHT_KEYS.map((r) => (
          <label key={r} className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="rights" value={r} defaultChecked={selected.includes(r)} className="mt-1 accent-brand" />
            <span>
              {RIGHTS[r].label} <span className="font-mono text-[11px] text-ink-soft">{RIGHTS[r].article}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ChannelSelect({ defaultValue = "email" }: { defaultValue?: string }) {
  return (
    <select name="channel" defaultValue={defaultValue} className={inputClass}>
      {Object.entries(CHANNEL_LABEL).map(([value, label]) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
  );
}

export const stamp = (d: Date | null) =>
  d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : null;
