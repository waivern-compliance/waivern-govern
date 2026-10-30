import Link from "next/link";
import { EditForm } from "@/components/EditForm";
import { AutomatedDecisionFields } from "@/components/AutomatedDecisionFields";
import { savedKey } from "@/lib/saved-key";
import {
  ADM_SAFEGUARDS,
  ADM_SAFEGUARD_KEYS,
  ADM_SPECIAL_CONDITIONS,
  admRestriction,
  describeAdm,
  type AdmRecord,
} from "@/lib/gdpr/automated-decisions";
import type { LawfulBasis } from "@/lib/gdpr/lawful-basis";
import type { AdmSide, LinkedRecord } from "@/services/automated-decisions";
import {
  copyAutomatedDecisionsAction,
  linkActivityAction,
  saveAutomatedDecisionsAction,
  unlinkActivityAction,
} from "@/app/app/automated-decisions-actions";

const OTHER: Record<AdmSide, { nouns: string; path: string }> = {
  processing_activity: { nouns: "AI use cases", path: "/app/ai" },
  ai_use_case: { nouns: "processing activities", path: "/app/ropa" },
};

const small = "rounded border border-line bg-surface px-3 py-1.5 text-xs hover:border-brand";

/**
 * Articles 22A–22C on a processing activity or an AI use case, with the
 * records on the other side of each link and whether they agree.
 *
 * Where they do not, it offers the copy in whichever direction makes sense and
 * leaves the choice to the reader: a use case can automate part of what an
 * activity does, so a difference is a question, not an error.
 */
export function AutomatedDecisions({
  side,
  recordId,
  record,
  bases,
  linked,
  mayEdit,
  linkCandidates,
}: {
  side: AdmSide;
  recordId: string;
  record: AdmRecord;
  /** The lawful bases behind the processing, where known, for Article 22B(4). */
  bases?: readonly LawfulBasis[];
  linked: LinkedRecord[];
  mayEdit: boolean;
  /** Processing activities that could be linked; on an AI use case only. */
  linkCandidates?: Array<{ id: string; label: string }>;
}) {
  const other = OTHER[side];
  const restriction = admRestriction(record, bases);
  const pair = (l: LinkedRecord) =>
    side === "ai_use_case" ? { useCaseId: recordId, activityId: l.id } : { useCaseId: l.id, activityId: recordId };
  const otherSide: AdmSide = side === "ai_use_case" ? "processing_activity" : "ai_use_case";

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">
        Automated decisions <span className="font-normal text-ink-soft">· UK GDPR Articles 22A–22C</span>
      </h2>

      {restriction.allowed === false ? (
        <p role="alert" className="max-w-prose rounded border border-red-800 bg-red-50 px-3 py-2 text-xs text-red-900">
          Not permitted as recorded. {restriction.why}
        </p>
      ) : restriction.allowed === null ? (
        <p className="max-w-prose rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Whether Article 22B allows this cannot be told yet. {restriction.why}
        </p>
      ) : null}

      <div className="space-y-2 rounded border border-line bg-surface p-4 text-sm">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          Linked {other.nouns}
        </h3>
        {linked.length === 0 ? (
          <p className="text-xs text-ink-soft">
            {side === "ai_use_case"
              ? "Not linked to any processing activity. Link the ones this system is used in, so their automated-decision records can be kept in step."
              : "No AI use case is linked to this activity. Links are made from the AI use case."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {linked.map((l) => {
              const { useCaseId, activityId } = pair(l);
              return (
                <li key={l.id} className="space-y-2 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`${other.path}/${l.id}`} className="hover:text-brand">
                      <span className="font-mono text-xs text-ink-soft">{l.reference}</span> {l.name}
                    </Link>
                    {mayEdit && side === "ai_use_case" ? (
                      <EditForm action={unlinkActivityAction.bind(null, useCaseId, activityId)}>
                        <button type="submit" className="text-xs text-ink-soft hover:text-brand">Unlink</button>
                      </EditForm>
                    ) : null}
                  </div>
                  <p className="text-xs text-ink-soft">{describeAdm(l.record)}</p>
                  {l.mismatch ? (
                    <div className="space-y-2 rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <p>
                        {l.mismatch === "missing_here"
                          ? `${l.reference} has an automated-decision record and this page does not.`
                          : l.mismatch === "missing_there"
                            ? `This page has an automated-decision record and ${l.reference} does not.`
                            : `This record and ${l.reference}'s disagree.`}{" "}
                        They can legitimately differ. Copy one across if they should match.
                      </p>
                      {mayEdit ? (
                        <div className="flex flex-wrap gap-2">
                          {l.mismatch !== "missing_here" ? (
                            <EditForm action={copyAutomatedDecisionsAction.bind(null, useCaseId, activityId, otherSide)}>
                              <button type="submit" className={small}>Copy this record to {l.reference}</button>
                            </EditForm>
                          ) : null}
                          {l.mismatch !== "missing_there" ? (
                            <EditForm action={copyAutomatedDecisionsAction.bind(null, useCaseId, activityId, side)}>
                              <button type="submit" className={small}>Copy {l.reference}&apos;s record here</button>
                            </EditForm>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {mayEdit && linkCandidates && linkCandidates.length > 0 ? (
          <EditForm
            action={linkActivityAction.bind(null, recordId)}
            className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
          >
            <label className="block flex-1 space-y-1">
              <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Link a processing activity</span>
              <select name="activityId" defaultValue="" className="w-full rounded border border-line bg-ground px-3 py-2 text-sm">
                <option value="">Choose…</option>
                {linkCandidates.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded border border-line bg-surface px-3 py-2 text-sm hover:border-brand">
              Link
            </button>
          </EditForm>
        ) : null}
      </div>

      {mayEdit ? (
        <EditForm
          key={savedKey(record)}
          action={saveAutomatedDecisionsAction.bind(null, side, recordId)}
          className="space-y-4 rounded border border-line bg-surface p-4"
        >
          <AutomatedDecisionFields record={record} />
          <button
            type="submit"
            className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            Save automated decisions
          </button>
        </EditForm>
      ) : (
        <div className="space-y-1 rounded border border-line bg-surface p-4 text-sm">
          <p>{describeAdm(record)}</p>
          {record.automatedDecisions ? (
            <ul className="space-y-0.5 text-xs text-ink-soft">
              {record.admSpecialCategory ? (
                <li>
                  Special category data ·{" "}
                  {record.admSpecialCondition ? ADM_SPECIAL_CONDITIONS[record.admSpecialCondition].paragraph : "no Article 22B condition"}
                </li>
              ) : null}
              {ADM_SAFEGUARD_KEYS.map((k) => (
                <li key={k}>
                  {record.admSafeguards?.[k]?.confirmed ? "✓" : "✗"} {ADM_SAFEGUARDS[k].label}
                  {record.admSafeguards?.[k]?.note ? ` — ${record.admSafeguards[k]!.note}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
