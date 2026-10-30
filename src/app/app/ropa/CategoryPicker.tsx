const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

/**
 * Categories as ticks from a catalogue, plus any others in the record's own
 * words. Stored as the words either way, so a record written before the
 * catalogue existed shows its entries under "Others" until somebody ticks the
 * matching box.
 */
export function CategoryPicker({
  name,
  title,
  hint,
  catalogue,
  values,
}: {
  name: string;
  title: string;
  hint: string;
  catalogue: ReadonlyArray<{ value: string; label: string }>;
  values: readonly string[];
}) {
  const known = new Set(catalogue.map((c) => c.label));
  const others = values.filter((v) => !known.has(v));
  return (
    <fieldset className="space-y-2">
      <legend className={label}>
        {title}
        <span className="block font-normal normal-case tracking-normal">{hint}</span>
      </legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {catalogue.map((c) => (
          <label key={c.value} className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name={`${name}Pick`} value={c.label} defaultChecked={values.includes(c.label)} className="mt-1 accent-brand" />
            <span>{c.label}</span>
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="text-xs text-ink-soft">Others, one per line</span>
        <textarea
          name={name}
          rows={2}
          defaultValue={others.join("\n")}
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>
    </fieldset>
  );
}
