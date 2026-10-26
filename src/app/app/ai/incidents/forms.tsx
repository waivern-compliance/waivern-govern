"use client";

import { useActionState, useState } from "react";
import { advanceAction, reportAction, triageAction, type IncidentResult } from "./actions";

const field = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";
const label = "text-xs font-medium uppercase tracking-wider text-ink-soft";

type Option = { value: string; label: string };

function Outcome({ result }: { result: IncidentResult }) {
  if (!result) return null;
  return (
    <p
      role="status"
      className={`rounded border px-3 py-2 text-sm ${
        result.ok
          ? "border-emerald-700 bg-emerald-50 text-emerald-900"
          : "border-amber-700 bg-amber-50 text-amber-900"
      }`}
    >
      {result.message}
    </p>
  );
}

function Choice({ name, title, options, value }: { name: string; title: string; options: Option[]; value?: string }) {
  return (
    <label className="block space-y-1">
      <span className={label}>{title}</span>
      <select name={name} defaultValue={value ?? options[0]?.value} className={field}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/**
 * Report something about an AI system.
 *
 * A confidential report keeps the reporter's name from anyone but the person
 * handling it; the checkbox says so plainly, because somebody deciding whether
 * to raise a concern needs to know who will see their name.
 */
export function ReportForm({
  systems,
  kinds,
  sources,
  harms,
  defaultSystem,
  viewerEmail,
}: {
  systems: Option[];
  kinds: Option[];
  sources: Option[];
  harms: Option[];
  defaultSystem?: string;
  viewerEmail: string;
}) {
  const [result, action, pending] = useActionState<IncidentResult, FormData>(reportAction, null);
  const [source, setSource] = useState("staff");

  return (
    <form action={action} className="space-y-3 border-t border-line p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          name="useCaseId"
          title="Which system"
          options={[{ value: "", label: "Not sure" }, ...systems]}
          value={defaultSystem ?? ""}
        />
        <Choice name="kind" title="What it is" options={kinds} />
        <label className="block space-y-1">
          <span className={label}>Where it came from</span>
          <select name="source" value={source} onChange={(e) => setSource(e.target.value)} className={field}>
            {sources.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <Choice name="harm" title="Harm" options={harms} />
      </div>
      <label className="block space-y-1">
        <span className={label}>What happened</span>
        <input name="summary" required className={field} placeholder="One line" />
      </label>
      <label className="block space-y-1">
        <span className={label}>Details</span>
        <textarea name="details" rows={3} className={field} placeholder="What, when, to whom, and how it came to light" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={label}>{source === "staff" ? "Raised by" : "Raised by — name and how to reply"}</span>
          <input
            name="reportedBy"
            className={field}
            defaultValue={source === "staff" ? viewerEmail : ""}
            key={source}
          />
        </label>
        <label className="block space-y-1">
          <span className={label}>When it happened</span>
          <input name="occurredAt" type="date" className={field} />
        </label>
      </div>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="confidential" className="mt-1 accent-brand" />
        <span>
          Confidential
          <span className="block text-xs text-ink-soft">
            Who raised it is shown only to the person handling it, the privacy
            administrators and the organisation&rsquo;s owners. Everyone else sees
            the report without the name.
          </span>
        </span>
      </label>
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Report it"}
      </button>
    </form>
  );
}

export function TriageForm({
  incidentId,
  people,
  risks,
  harms,
  currentHarm,
  currentAssignee,
}: {
  incidentId: string;
  people: Option[];
  risks: Option[];
  harms: Option[];
  currentHarm: string;
  currentAssignee: string;
}) {
  const [result, action, pending] = useActionState<IncidentResult, FormData>(
    triageAction.bind(null, incidentId),
    null,
  );
  return (
    <form action={action} className="space-y-3 rounded border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Choice
          name="severity"
          title="How serious"
          options={[
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "critical", label: "Critical" },
          ]}
          value="medium"
        />
        <Choice name="harm" title="Harm" options={harms} value={currentHarm} />
        <Choice
          name="assignedToUserId"
          title="Handled by"
          options={[{ value: "", label: "Nobody yet" }, ...people]}
          value={currentAssignee}
        />
        <Choice
          name="linkedRiskId"
          title="Belongs to risk"
          options={[{ value: "", label: "None, or not yet raised" }, ...risks]}
        />
      </div>
      <label className="block space-y-1">
        <span className={label}>What you decided, and why</span>
        <textarea name="note" required rows={2} className={field} />
      </label>
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record triage"}
      </button>
    </form>
  );
}

export function AdvanceForm({
  incidentId,
  next,
  isChallenge,
}: {
  incidentId: string;
  next: Option[];
  isChallenge: boolean;
}) {
  const [result, action, pending] = useActionState<IncidentResult, FormData>(
    advanceAction.bind(null, incidentId),
    null,
  );
  const [to, setTo] = useState(next[0]?.value ?? "");
  return (
    <form action={action} className="space-y-3 rounded border border-line bg-surface p-4">
      <label className="block space-y-1">
        <span className={label}>Move to</span>
        <select name="to" value={to} onChange={(e) => setTo(e.target.value)} className={field}>
          {next.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {to === "resolved" ? (
        <label className="block space-y-1">
          <span className={label}>
            {isChallenge ? "The decision, and what was put right" : "How it was resolved"}
          </span>
          <textarea name="outcome" required rows={3} className={field} />
        </label>
      ) : null}
      <label className="block space-y-1">
        <span className={label}>Note for the timeline</span>
        <textarea name="note" required rows={2} className={field} />
      </label>
      <Outcome result={result} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record"}
      </button>
    </form>
  );
}
