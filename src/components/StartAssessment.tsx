import { startAssessmentFor } from "@/app/app/assessments/actions";
import { KINDS_FOR, type AssessableSubject } from "@/lib/assessment-subjects";
import { availableTemplates } from "@/services/templates";

/**
 * Start an assessment about this record, from the record.
 *
 * Starting it from the assessments list leaves it unbound — the register that
 * should read its conclusions never sees it. Only templates that fit the
 * record are offered.
 */
export async function StartAssessment({
  organisationId,
  subjectType,
  subjectId,
  prefer,
}: {
  organisationId: string;
  subjectType: AssessableSubject;
  subjectId: string;
  /** A template name to put first, where one is the obvious choice. */
  prefer?: string;
}) {
  const fitting = (await availableTemplates(organisationId)).filter(({ template }) =>
    KINDS_FOR[subjectType].includes(template.kind),
  );
  if (fitting.length === 0) return null;
  const ordered = prefer
    ? [...fitting].sort((a, b) => Number(b.template.name === prefer) - Number(a.template.name === prefer))
    : fitting;

  return (
    <form
      action={startAssessmentFor.bind(null, subjectType, subjectId)}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="block space-y-1">
        <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
          Assess it with
        </span>
        <select
          name="templateVersionId"
          className="rounded border border-line bg-ground px-3 py-2 text-sm"
        >
          {ordered.map(({ template, version }) => (
            <option key={version.id} value={version.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
      >
        Start assessment
      </button>
    </form>
  );
}
