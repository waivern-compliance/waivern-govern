import { raiseRisk } from "@/app/app/risks/actions";
import { AI_RISK_CATEGORIES } from "@/lib/risk/categories";

type Point = { value: number; label: string };

/**
 * Raise a risk, from the register or from the assessment that found it.
 *
 * One form in two places, so a risk raised from an assessment asks for exactly
 * what the register asks for. When it is raised from an assessment the entity
 * is the assessment's and is not offered — a risk filed under a different
 * entity from the assessment that found it would vanish from the view of the
 * people responsible for both.
 */
export function RaiseRiskForm({
  entities,
  assessmentId,
  suggestedCategories = [],
  likelihood,
  impact,
}: {
  /** One entry when the entity is fixed, several when the person chooses. */
  entities: Array<{ id: string; name: string }>;
  assessmentId?: string;
  /** Categories the assessment named as carrying risk, offered first. */
  suggestedCategories?: string[];
  likelihood: readonly Point[];
  impact: readonly Point[];
}) {
  // The middle of the scale, as the register form has always defaulted to.
  const middle = (scale: readonly Point[]) => String(scale[Math.floor(scale.length / 2)].value);
  const suggested = AI_RISK_CATEGORIES.filter((c) => suggestedCategories.includes(c.value));
  const others = AI_RISK_CATEGORIES.filter((c) => !suggestedCategories.includes(c.value));

  return (
    <form action={raiseRisk} className="space-y-3 border-t border-line p-4">
      {assessmentId ? <input type="hidden" name="assessmentId" value={assessmentId} /> : null}
      {entities.length === 1 ? (
        <input type="hidden" name="entityId" value={entities[0].id} />
      ) : null}
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Title</span>
        <input
          name="title"
          required
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          What could go wrong, and for whom?
        </span>
        <textarea
          name="description"
          required
          rows={3}
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Category</span>
        <select
          name="category"
          defaultValue={suggested[0]?.value ?? ""}
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
        >
          <option value="">No category</option>
          {suggested.length > 0 ? (
            <optgroup label="Named in this assessment">
              {suggested.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label={suggested.length > 0 ? "Other AI risk categories" : "AI risk categories"}>
            {others.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className={`grid gap-3 ${entities.length === 1 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {entities.length > 1 ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Entity</span>
            <select
              name="entityId"
              required
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            >
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
            Inherent likelihood
          </span>
          <select
            name="likelihood"
            required
            defaultValue={middle(likelihood)}
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
          >
            {likelihood.map((l) => (
              <option key={l.value} value={l.value}>{l.value} · {l.label}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
            Inherent impact
          </span>
          <select
            name="impact"
            required
            defaultValue={middle(impact)}
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
          >
            {impact.map((i) => (
              <option key={i.value} value={i.value}>{i.value} · {i.label}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="submit"
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Raise
      </button>
    </form>
  );
}
