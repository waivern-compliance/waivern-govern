import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { ComplaintClock } from "@/components/complaints/ComplaintClock";
import {
  COMPLAINT_SUBJECTS,
  COMPLAINT_SUBJECT_KEYS,
  S164A_SUMMARY,
  type ComplaintSubject,
} from "@/lib/complaints/statutory";
import { can, mayConfigureRequests } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { complaintMetrics, complaintRegister, complaintTargets } from "@/services/complaints";
import { defaultJurisdiction, loadRequest } from "@/services/data-subject-requests";
import { intakeLinksFor } from "@/services/dsr-intake";
import { ActionForm } from "../requests/ActionForm";
import { CHANNEL_LABEL, ChannelSelect, Label, inputClass } from "../requests/fields";
import { recordComplaintAction, setComplaintTargetsAction } from "./actions";

export default async function ComplaintsPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "dsr.handle")) {
    return (
      <NotPermitted
        what="The register of data protection complaints"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const org = active.membership.organisationId;
  const { request: requestId } = await searchParams;
  const [register, orgEntities, jurisdiction, targets, about, metrics, links] = await Promise.all([
    complaintRegister(org, visibleEntityIds(active, "dsr.handle")),
    scoped(org, () => db.select().from(entities).where(eq(entities.organisationId, org))),
    defaultJurisdiction(org),
    complaintTargets(org),
    requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? loadRequest(requestId, org) : null,
    complaintMetrics(org, visibleEntityIds(active, "dsr.handle")),
    intakeLinksFor(org, visibleEntityIds(active, "dsr.handle")),
  ]);
  const intakeForms = links.filter(({ link }) => !link.revokedAt && link.takesComplaints).length;
  const mayRecordIn = orgEntities.filter((e) => can(active.membership.grants, "dsr.handle", e.id));
  // A complaint about a request is made to the entity the request was.
  const aboutRequest = about && mayRecordIn.some((e) => e.id === about.request.entityId) ? about : null;
  const entityChoices = aboutRequest ? mayRecordIn.filter((e) => e.id === aboutRequest.request.entityId) : mayRecordIn;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Data protection complaints</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Complaints from people about how their personal data has been handled, made to you rather
          than to the Information Commission. {S164A_SUMMARY} A complaint can arrive by any route and
          need not use the word. Record it the day it arrives.
        </p>
      </header>

      <HelpLink topic="complaints" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open" value={register.open} note="outcome not yet sent" />
        <Stat label="To acknowledge" value={register.toAcknowledge} note="within the 30 days" />
        <Stat
          label="Acknowledgement overdue"
          value={register.acknowledgementOverdue}
          note="past s.164A(3)"
          tone={register.acknowledgementOverdue > 0 ? "stop" : "plain"}
        />
        <Stat
          label="Past your targets"
          value={register.outcomeOverdue + register.updateOverdue}
          note={`${register.outcomeOverdue} outcome, ${register.updateOverdue} update`}
          tone={register.outcomeOverdue + register.updateOverdue > 0 ? "warn" : "plain"}
        />
      </section>

      {entityChoices.length > 0 ? (
        <details className="rounded border border-line bg-surface" open={Boolean(aboutRequest)}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            {aboutRequest ? `Record a complaint about ${aboutRequest.request.reference}` : "Record a complaint"}
          </summary>
          <ActionForm
            action={recordComplaintAction}
            submit="Record it"
            pendingLabel="Recording…"
            className="space-y-3 border-t border-line p-4"
          >
            {aboutRequest ? <input type="hidden" name="requestId" value={aboutRequest.request.id} /> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Who is complaining?" hint="The person whose data it is. Only what you need to answer them." />
                <input
                  name="complainantName"
                  required
                  defaultValue={aboutRequest?.request.requesterName ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <Label text="How to reach them" hint="An email or postal address." />
                <input
                  name="complainantContact"
                  defaultValue={aboutRequest?.request.requesterContact ?? ""}
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block space-y-1">
              <Label text="What is the complaint?" hint="In their terms. Paraphrase, don't paste the whole letter." />
              <textarea name="description" required rows={3} className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <Label text="What is it about?" />
                <select name="subject" defaultValue={aboutRequest ? "request_handling" : "other"} className={inputClass}>
                  {COMPLAINT_SUBJECT_KEYS.map((s) => (
                    <option key={s} value={s}>{COMPLAINT_SUBJECTS[s]}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="When did it arrive?" hint="This starts the 30 days." />
                <input name="receivedAt" type="datetime-local" required className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="How did it arrive?" />
                <ChannelSelect />
              </label>
            </div>
            <label className="block space-y-1">
              <Label text="Acting for them" hint="A solicitor, parent or other representative, if any." />
              <input name="representative" defaultValue={aboutRequest?.request.representative ?? ""} className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <Label text="Entity" />
                <select name="entityId" required className={inputClass}>
                  {entityChoices.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Your role" hint="s.164A is the controller's duty." />
                <select name="controllerRole" defaultValue={aboutRequest?.request.controllerRole ?? "controller"} className={inputClass}>
                  <option value="controller">Controller</option>
                  <option value="joint_controller">Joint controller</option>
                  <option value="processor">Processor</option>
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Law" hint="Only UK law sets a period." />
                <select name="jurisdiction" defaultValue={aboutRequest?.request.jurisdiction ?? jurisdiction} className={inputClass}>
                  <option value="uk">UK GDPR and DPA 2018</option>
                  <option value="eu">EU GDPR</option>
                </select>
              </label>
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="ownMe" className="mt-1 accent-brand" />
              <span>I am handling this</span>
            </label>
          </ActionForm>
        </details>
      ) : null}

      {metrics.totals.received > 0 ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            How they were handled, last twelve months
            <span className="ml-2 font-mono text-[11px] font-normal text-ink-soft">
              {metrics.totals.received} received · {metrics.totals.acknowledgedInTime} acknowledged in time ·{" "}
              {metrics.totals.acknowledgedLate} late
              {metrics.totals.medianDaysToOutcome !== null ? ` · median ${metrics.totals.medianDaysToOutcome} days to outcome` : ""}
            </span>
          </summary>
          <div className="space-y-5 border-t border-line p-4">
            <p className="max-w-prose text-xs text-ink-soft">
              Complaints received since {metrics.from.toISOString().slice(0, 10)}. {metrics.totals.outcomesSent} outcome
              {metrics.totals.outcomesSent === 1 ? "" : "s"} sent — {metrics.outcomes.upheld} upheld,{" "}
              {metrics.outcomes.partlyUpheld} partly upheld, {metrics.outcomes.notUpheld} not upheld
              {metrics.outcomes.passedToController > 0 ? `, ${metrics.outcomes.passedToController} passed to the controller` : ""}.{" "}
              {metrics.totals.outcomeWithinTarget} within your target, {metrics.totals.outcomeAfterTarget} after it.{" "}
              {metrics.totals.withdrawn} withdrawn, {metrics.totals.open} still open. In time and late count only
              complaints s.164A applies to.
            </p>
            <CountTable
              head="About"
              rows={metrics.bySubject.map((s) => ({ ...s, key: s.subject }))}
            />
            <CountTable
              head="Month"
              rows={metrics.byMonth.map((m) => ({ ...m, key: m.period, label: m.period }))}
            />
          </div>
        </details>
      ) : null}

      <ul className="space-y-3">
        {register.rows.map(({ complaint, entityName, clock }) => (
          <li key={complaint.id}>
            <Link
              href={`/app/complaints/${complaint.id}`}
              className="block space-y-2 rounded border border-line bg-surface p-4 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{complaint.reference}</span>
                  <span className="font-medium">
                    {COMPLAINT_SUBJECTS[complaint.subject as ComplaintSubject] ?? complaint.subject}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {entityName} · {complaint.status.replace(/_/g, " ")} · {complaint.jurisdiction.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                received {complaint.receivedAt.toISOString().slice(0, 10)} by{" "}
                {CHANNEL_LABEL[complaint.channel]?.toLowerCase() ?? complaint.channel}
              </p>
              <ComplaintClock clock={clock} compact />
            </Link>
          </li>
        ))}
        {register.rows.length === 0 ? (
          <li className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            Nothing recorded. When somebody complains about how their personal data has been
            handled, record it here the day it arrives — the 30 days to acknowledge it run from then,
            wherever it landed.
          </li>
        ) : null}
      </ul>

      <section className="space-y-2 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Taking complaints online</h2>
        <p className="max-w-prose text-xs text-ink-soft">
          s.164A(2) gives a complaint form that can be completed electronically as the example of making
          complaining easy. The public request forms take complaints too unless switched off; each
          submission lands here as received by web form and raises a task for the privacy team.{" "}
          {intakeForms === 0
            ? "No published form takes complaints at the moment."
            : `${intakeForms} published form${intakeForms === 1 ? " takes" : "s take"} complaints.`}{" "}
          Forms are managed on{" "}
          <Link href="/app/requests" className="text-brand underline">the requests page</Link>.
        </p>
      </section>

      <section className="space-y-2 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Your targets for “without undue delay”</h2>
        <p className="max-w-prose text-xs text-ink-soft">
          The Act requires the outcome without undue delay, and the complainant to be kept informed,
          but sets no figure for either. These are your organisation&apos;s own standards, and the
          register measures against them as such.{" "}
          {targets.outcomeTargetDays > 0
            ? `Outcome within ${targets.outcomeTargetDays} days of acknowledging.`
            : "No outcome target."}{" "}
          {targets.updateIntervalDays > 0
            ? `An update at least every ${targets.updateIntervalDays} days while it is open.`
            : "No update interval."}{" "}
          0 turns either off.
        </p>
        {mayConfigureRequests(active.membership.grants) ? (
          <ActionForm action={setComplaintTargetsAction} submit="Save" className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <Label text="Outcome, days" />
              <input
                name="outcomeTargetDays"
                type="number"
                min={0}
                max={365}
                defaultValue={targets.outcomeTargetDays}
                className="w-28 rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-1">
              <Label text="Update every, days" />
              <input
                name="updateIntervalDays"
                type="number"
                min={0}
                max={365}
                defaultValue={targets.updateIntervalDays}
                className="w-28 rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
          </ActionForm>
        ) : null}
      </section>
    </main>
  );
}

function CountTable({
  head,
  rows,
}: {
  head: string;
  rows: Array<{
    key: string;
    label: string;
    received: number;
    acknowledged: number;
    acknowledgedInTime: number;
    acknowledgedLate: number;
    outcomesSent: number;
  }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-ink-soft">
          <tr>
            <th className="py-1 pr-3 font-medium">{head}</th>
            <th className="py-1 pr-3 text-right font-medium">Received</th>
            <th className="py-1 pr-3 text-right font-medium">Acknowledged</th>
            <th className="py-1 pr-3 text-right font-medium">In time</th>
            <th className="py-1 pr-3 text-right font-medium">Late</th>
            <th className="py-1 text-right font-medium">Outcomes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-1 pr-3">{r.label}</td>
              <td className="py-1 pr-3 text-right">{r.received}</td>
              <td className="py-1 pr-3 text-right">{r.acknowledged}</td>
              <td className="py-1 pr-3 text-right">{r.acknowledgedInTime}</td>
              <td className={`py-1 pr-3 text-right ${r.acknowledgedLate > 0 ? "text-red-800" : ""}`}>{r.acknowledgedLate}</td>
              <td className="py-1 text-right">{r.outcomesSent}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: number;
  note: string;
  tone?: "plain" | "warn" | "stop";
}) {
  return (
    <div className="rounded border border-line bg-surface px-4 py-3.5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">{label}</p>
      <p
        className={`mt-1 text-3xl font-semibold tabular-nums tracking-tight ${
          tone === "stop" ? "text-red-800" : tone === "warn" ? "text-amber-800" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">{note}</p>
    </div>
  );
}
