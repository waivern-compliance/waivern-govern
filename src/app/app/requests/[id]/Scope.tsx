import { proportionateSearchApplies } from "@/lib/dsr/statutory";
import {
  recipientsMustBeTold,
  recipientsStillToTell,
  type DataSubjectRequest,
  type RequestDecision,
  type ScopeEntry,
} from "@/services/data-subject-requests";
import { ActionForm } from "../ActionForm";
import { addScopeAction, recipientNoticeAction, scopeResultAction, seedScopeAction } from "../actions";
import { Label, inputClass, stamp } from "../fields";

const STATUS_LABEL: Record<ScopeEntry["status"], string> = {
  to_search: "Still to search",
  not_held: "Nothing held",
  found: "Found",
  actioned: "Found and acted on",
  not_actioned: "Found, not acted on",
};

const KIND_LABEL: Record<ScopeEntry["kind"], string> = {
  activity: "Processing activity",
  system: "System",
  supplier: "Supplier",
  recipient: "Recipient",
  other: "Elsewhere",
};

const NOTICE_LABEL: Record<NonNullable<ScopeEntry["recipientNotice"]>, string> = {
  notified: "Told",
  impossible: "Not told: impossible",
  disproportionate: "Not told: disproportionate effort",
};

/**
 * Where the requester's data might be, and what happened in each place.
 *
 * Seeded from the ROPA, so the search starts from what the organisation has
 * already said it does, and finishes as a record of where somebody looked. The
 * recipients on it are the Article 19 list.
 */
export function Scope({
  request,
  scope,
  decisions,
}: {
  request: DataSubjectRequest;
  scope: ScopeEntry[];
  decisions: RequestDecision[];
}) {
  const open = !request.closedAt;
  const mustTell = recipientsMustBeTold(decisions);
  const untold = recipientsStillToTell(scope, decisions);
  const toSearch = scope.filter((e) => e.status === "to_search").length;
  const proportionate = proportionateSearchApplies(request.jurisdiction, request.receivedAt);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Where to look ({scope.length})</h2>
        {scope.length > 0 ? (
          <span className="font-mono text-[11px] text-ink-soft">
            {toSearch === 0 ? "every place checked" : `${toSearch} still to search`}
          </span>
        ) : null}
      </div>
      <p className="max-w-prose text-xs text-ink-soft">
        From the ROPA: the activities about {request.subjectCategories.length > 0 ? request.subjectCategories.join(", ") : "who they are"},
        the systems they run on and whoever the data goes to. Record what each search found.
        {proportionate
          ? " Under UK law the search need only be reasonable and proportionate (Article 15(1A)); this list is how you show it was."
          : ""}
      </p>

      {mustTell && untold.length > 0 ? (
        <p className="max-w-prose rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Article 19: data was rectified, erased or restricted, so each recipient
          holding it must be told, unless that proves impossible or takes
          disproportionate effort. Still to record: {untold.map((e) => e.label).join(", ")}. If the
          person asks, tell them who the recipients are.
        </p>
      ) : null}

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {scope.map((e) => (
          <li key={e.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-medium">{e.label}</span>
              <span
                className={`font-mono text-[11px] ${
                  e.status === "to_search" ? "text-amber-800" : e.status === "not_actioned" ? "text-red-800" : "text-ink-soft"
                }`}
              >
                {STATUS_LABEL[e.status]}
              </span>
            </div>
            <p className="text-xs text-ink-soft">
              {KIND_LABEL[e.kind]} · {e.reason}
              {e.checkedAt ? ` · checked by ${e.checkedByLabel} ${stamp(e.checkedAt)}` : ""}
            </p>
            {e.note ? <p className="max-w-prose text-sm">{e.note}</p> : null}
            {e.recipientNotice ? (
              <p className="text-xs text-ink-soft">
                Article 19: {NOTICE_LABEL[e.recipientNotice]}
                {e.recipientNoticeAt ? ` ${stamp(e.recipientNoticeAt)}` : ""}
                {e.recipientNoticeNote ? ` — ${e.recipientNoticeNote}` : ""}
              </p>
            ) : null}

            {open ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-brand">Record what was found</summary>
                <ActionForm
                  action={scopeResultAction.bind(null, request.id, e.id)}
                  submit="Save"
                  className="mt-2 space-y-2"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <Label text="Result" />
                      <select name="status" defaultValue={e.status} className={inputClass}>
                        {Object.entries(STATUS_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <Label text="Note" hint="What was found or done. Required if found and not acted on." />
                      <input name="note" defaultValue={e.note ?? ""} className={inputClass} />
                    </label>
                  </div>
                </ActionForm>
              </details>
            ) : null}

            {open && e.isRecipient && mustTell && e.status !== "not_held" ? (
              <details className="text-sm" open={e.recipientNotice === null}>
                <summary className="cursor-pointer text-xs text-brand">Article 19: telling this recipient</summary>
                <ActionForm
                  action={recipientNoticeAction.bind(null, request.id, e.id)}
                  submit="Record"
                  className="mt-2 space-y-2"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <Label text="Outcome" />
                      <select name="notice" defaultValue={e.recipientNotice ?? "notified"} className={inputClass}>
                        {Object.entries(NOTICE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <Label text="When" hint="Leave blank for now." />
                      <input name="at" type="datetime-local" className={inputClass} />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <Label text="Note" hint="Required if not told: why it is impossible or disproportionate." />
                    <input name="note" defaultValue={e.recipientNoticeNote ?? ""} className={inputClass} />
                  </label>
                </ActionForm>
              </details>
            ) : null}
          </li>
        ))}
        {scope.length === 0 ? (
          <li className="px-4 py-5 text-sm text-ink-soft">
            {request.subjectCategories.length === 0
              ? "Nothing yet. Say who they are to you — customer, employee, applicant — in the record below, and the ROPA will list where to look."
              : "The ROPA has no activity about who they are. Add the places to look by hand, and consider whether the ROPA is missing something."}
          </li>
        ) : null}
      </ul>

      {open ? (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <ActionForm action={addScopeAction.bind(null, request.id)} submit="Add" className="flex flex-wrap items-end gap-3">
            <label className="block flex-1 space-y-1">
              <Label text="Somewhere the ROPA doesn't mention" />
              <input name="label" placeholder="Shared inbox, a spreadsheet, a recipient" className={inputClass} />
            </label>
            <select name="kind" defaultValue="other" className="rounded border border-line bg-ground px-3 py-2 text-sm">
              <option value="other">Somewhere to search</option>
              <option value="system">A system</option>
              <option value="recipient">A recipient</option>
            </select>
          </ActionForm>
          {request.subjectCategories.length > 0 ? (
            <ActionForm action={seedScopeAction.bind(null, request.id)} submit="Look in the ROPA again" className="flex items-end">
              <span className="sr-only">Add anything new in the ROPA</span>
            </ActionForm>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
