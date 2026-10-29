import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { EditForm } from "@/components/EditForm";
import { NotPermitted } from "@/components/NotPermitted";
import { ComplaintClock } from "@/components/complaints/ComplaintClock";
import {
  COMPLAINT_SUBJECTS,
  COMPLAINT_SUBJECT_KEYS,
  OUTCOME_LABEL,
  type ComplaintOutcome,
  type ComplaintSubject,
} from "@/lib/complaints/statutory";
import { JURISDICTION_LABEL } from "@/lib/dsr/statutory";
import { can } from "@/lib/rbac";
import { savedKey } from "@/lib/saved-key";
import { getActiveSession } from "@/lib/session";
import { loadComplaint } from "@/services/complaints";
import { ActionForm } from "../../requests/ActionForm";
import { CHANNEL_LABEL, ChannelSelect, Label, inputClass, stamp } from "../../requests/fields";
import {
  closeComplaintAction,
  complaintEventAction,
  complaintOutcomeAction,
  updateComplaintAction,
} from "../actions";

const EVENT_LABEL: Record<string, string> = {
  acknowledged: "Acknowledged",
  enquiry: "Enquiry",
  progress_update: "Progress update",
  outcome_sent: "Outcome sent",
  withdrawn: "Withdrawn",
  regulator_contact: "Contact with the Information Commission",
};

export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadComplaint(id, active.membership.organisationId);
  if (!loaded) notFound();
  const { complaint, entityName, events, clock, ownerEmail, request } = loaded;

  if (!can(active.membership.grants, "dsr.handle", complaint.entityId)) {
    return (
      <NotPermitted
        what={`${complaint.reference} is a complaint from a data subject, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }

  const ended = complaint.closedAt !== null || complaint.status === "withdrawn";
  const open = !ended && !complaint.outcomeAt;
  const colleagues = await scoped(active.membership.organisationId, () => db
    .select({ id: users.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, active.membership.organisationId))
    .orderBy(asc(users.email)));

  return (
    <main className="mx-auto max-w-3xl space-y-9 px-6 py-12">
      <header className="space-y-3 border-b border-line pb-6">
        <Link href="/app/complaints" className="text-xs text-ink-soft hover:text-brand">
          ← Data protection complaints
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-sm text-ink-soft">{complaint.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {COMPLAINT_SUBJECTS[complaint.subject as ComplaintSubject] ?? complaint.subject}
          </h1>
        </div>
        <p className="text-xs text-ink-soft">
          {entityName} · {complaint.controllerRole.replace(/_/g, " ")} · {complaint.status.replace(/_/g, " ")} ·{" "}
          {JURISDICTION_LABEL[complaint.jurisdiction]}
          {ownerEmail ? ` · handled by ${ownerEmail}` : " · nobody handling it yet"}
        </p>
        <p className="text-xs text-ink-soft">
          From {complaint.complainantName}
          {complaint.representative ? `, through ${complaint.representative}` : ""} · received{" "}
          {stamp(complaint.receivedAt)} by {CHANNEL_LABEL[complaint.channel]?.toLowerCase() ?? complaint.channel}
        </p>
        {request ? (
          <p className="text-xs">
            About{" "}
            <Link href={`/app/requests/${request.id}`} className="text-brand underline">
              {request.reference}
            </Link>{" "}
            <span className="text-ink-soft">({request.status.replace(/_/g, " ")})</span>
          </p>
        ) : null}
        <ComplaintClock clock={clock} />
        {complaint.controllerRole === "processor" && !complaint.outcomeAt ? (
          <p className="max-w-prose rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            You are the processor. The duty to handle complaints is the controller&apos;s: pass it to
            them without delay, as your data processing agreement requires, and record that as the
            outcome.
          </p>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">The complaint</h2>
        <p className="max-w-prose whitespace-pre-line text-sm">{complaint.description}</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">What has been done ({events.length})</h2>
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {events.map((e) => (
            <li key={e.id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-medium">{EVENT_LABEL[e.kind] ?? e.kind}</span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {stamp(e.occurredAt)}
                  {e.channel ? ` · by ${CHANNEL_LABEL[e.channel]?.toLowerCase() ?? e.channel}` : ""}
                </span>
              </div>
              <p className="max-w-prose text-sm">{e.note}</p>
              <p className="font-mono text-[11px] text-ink-soft">recorded by {e.recordedByEmail ?? e.recordedByLabel}</p>
            </li>
          ))}
          {events.length === 0 ? (
            <li className="px-4 py-5 text-sm text-ink-soft">
              Nothing yet. Acknowledge it, then record each enquiry you make and each time you tell the
              complainant how it stands — s.164A(5) says that is what responding includes.
            </li>
          ) : null}
        </ul>
        {complaint.acknowledgementLateReason ? (
          <p className="max-w-prose text-xs text-amber-900">Acknowledged late because: {complaint.acknowledgementLateReason}</p>
        ) : null}
      </section>

      {!ended ? (
        <ActionForm action={complaintEventAction.bind(null, complaint.id)} submit="Record">
          <h2 className="text-sm font-semibold">Record a step</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <Label text="What happened" />
              <select name="kind" defaultValue={complaint.acknowledgedAt ? "enquiry" : "acknowledged"} className={inputClass}>
                {!complaint.acknowledgedAt && !complaint.outcomeAt ? (
                  <option value="acknowledged">We acknowledged it</option>
                ) : null}
                {!complaint.outcomeAt ? (
                  <>
                    <option value="enquiry">We looked into something</option>
                    <option value="progress_update">We told them how it stands</option>
                  </>
                ) : null}
                <option value="regulator_contact">Contact with the Information Commission</option>
              </select>
            </label>
            <label className="block space-y-1">
              <Label text="How they were contacted" hint="For an acknowledgement or update." />
              <ChannelSelect defaultValue={complaint.channel === "via_processor" ? "email" : complaint.channel} />
            </label>
            <label className="block space-y-1">
              <Label text="When" hint="Leave blank for now." />
              <input name="at" type="datetime-local" className={inputClass} />
            </label>
          </div>
          <label className="block space-y-1">
            <Label text="What was done or said" hint="Who you asked and what they found; what the complainant was told." />
            <textarea name="note" rows={2} className={inputClass} />
          </label>
          {!complaint.acknowledgedAt && clock.acknowledgement.state === "overdue" ? (
            <label className="block space-y-1">
              <Label text="Why the acknowledgement is late" hint="Required: the 30 days have passed." />
              <textarea name="lateReason" rows={2} className={inputClass} />
            </label>
          ) : null}
        </ActionForm>
      ) : null}

      {complaint.outcomeAt ? (
        <section className="space-y-1 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">
            {OUTCOME_LABEL[complaint.outcome as ComplaintOutcome]} — told {stamp(complaint.outcomeAt)} by{" "}
            {CHANNEL_LABEL[complaint.outcomeChannel ?? ""]?.toLowerCase() ?? complaint.outcomeChannel}
          </h2>
          <p className="max-w-prose text-sm">{complaint.outcomeSummary}</p>
          {complaint.remedialAction ? (
            <p className="max-w-prose text-sm text-ink-soft">Changing because of it: {complaint.remedialAction}</p>
          ) : null}
          {complaint.outcomeLink ? (
            <a href={complaint.outcomeLink} className="text-xs text-brand underline" rel="noreferrer" target="_blank">
              The letter, where it is kept
            </a>
          ) : null}
          {complaint.toldOfRegulatorRight ? (
            <p className="text-xs text-ink-soft">Told they may complain to the Information Commission.</p>
          ) : null}
          {complaint.outcomeLateReason ? (
            <p className="max-w-prose text-xs text-amber-900">After the target because: {complaint.outcomeLateReason}</p>
          ) : null}
        </section>
      ) : open ? (
        <ActionForm action={complaintOutcomeAction.bind(null, complaint.id)} submit="Record the outcome">
          <h2 className="text-sm font-semibold">Tell them the outcome</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            s.164A(4)(b). Write the letter in whatever you normally use; record here what it said.
            If nothing acknowledged the complaint before, this does.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <Label text="Outcome" />
              <select name="outcome" defaultValue="upheld" className={inputClass}>
                {(Object.keys(OUTCOME_LABEL) as ComplaintOutcome[])
                  .filter((o) => o !== "passed_to_controller" || complaint.controllerRole !== "controller")
                  .map((o) => (
                    <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>
                  ))}
              </select>
            </label>
            <label className="block space-y-1">
              <Label text="Sent by" />
              <ChannelSelect defaultValue={complaint.channel === "via_processor" ? "email" : complaint.channel} />
            </label>
            <label className="block space-y-1">
              <Label text="When" hint="Leave blank for now." />
              <input name="at" type="datetime-local" className={inputClass} />
            </label>
          </div>
          <label className="block space-y-1">
            <Label text="What they were told" hint="A sentence or two." />
            <textarea name="summary" required rows={2} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="What you are changing because of it" hint="Optional." />
            <textarea name="remedialAction" rows={2} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="Where the letter is kept" hint="Optional link." />
            <input name="link" type="url" placeholder="https://" className={inputClass} />
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="toldOfRegulatorRight" className="mt-1 accent-brand" />
            <span>It told them they may complain to the Information Commission if they are not satisfied</span>
          </label>
          {clock.outcome.state === "overdue" || (!complaint.acknowledgedAt && clock.acknowledgement.state === "overdue") ? (
            <label className="block space-y-1">
              <Label text="Why it took longer" hint="Required: past the 30 days or your own target." />
              <textarea name="lateReason" rows={2} className={inputClass} />
            </label>
          ) : null}
        </ActionForm>
      ) : null}

      {!ended ? (
        <ActionForm action={closeComplaintAction.bind(null, complaint.id)} submit="Close the complaint">
          <h2 className="text-sm font-semibold">Close</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            {complaint.outcomeAt
              ? "Once anything you promised in the outcome is done."
              : "A complaint without an outcome can only be closed if the complainant withdrew it."}
          </p>
          <label className="block space-y-1">
            <Label text="Why" />
            <textarea name="rationale" required rows={2} className={inputClass} />
          </label>
          {!complaint.outcomeAt ? (
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="withdrawn" className="mt-1 accent-brand" />
              <span>They withdrew it</span>
            </label>
          ) : null}
        </ActionForm>
      ) : (
        <section className="space-y-1 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">
            {complaint.status === "withdrawn" ? "Withdrawn" : "Closed"} {stamp(complaint.closedAt)}
          </h2>
          <p className="max-w-prose text-sm text-ink-soft">{complaint.closureRationale}</p>
        </section>
      )}

      <EditForm
        key={savedKey(complaint)}
        action={updateComplaintAction.bind(null, complaint.id)}
        className="space-y-4 rounded border border-line bg-surface p-5"
      >
        <h2 className="text-sm font-semibold">The record</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label text="Who is complaining" />
            <input name="complainantName" defaultValue={complaint.complainantName} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="How to reach them" />
            <input name="complainantContact" defaultValue={complaint.complainantContact ?? ""} className={inputClass} />
          </label>
        </div>
        <label className="block space-y-1">
          <Label text="The complaint" />
          <textarea name="description" rows={3} defaultValue={complaint.description} className={inputClass} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label text="Acting for them" />
            <input name="representative" defaultValue={complaint.representative ?? ""} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="Their authority to act checked?" />
            <select
              name="representativeAuthorityChecked"
              defaultValue={complaint.representativeAuthorityChecked === null ? "" : complaint.representativeAuthorityChecked ? "yes" : "no"}
              className={inputClass}
            >
              <option value="">Not applicable or not yet</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label text="About" />
            <select name="subject" defaultValue={complaint.subject} className={inputClass}>
              {COMPLAINT_SUBJECT_KEYS.map((s) => (
                <option key={s} value={s}>{COMPLAINT_SUBJECTS[s]}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="Arrived by" />
            <ChannelSelect defaultValue={complaint.channel} />
          </label>
          <label className="block space-y-1">
            <Label text="Your role" />
            <select name="controllerRole" defaultValue={complaint.controllerRole} className={inputClass}>
              <option value="controller">Controller</option>
              <option value="joint_controller">Joint controller</option>
              <option value="processor">Processor</option>
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="Handled by" />
            <select name="ownerId" defaultValue={complaint.ownerId ?? ""} className={inputClass}>
              <option value="">Nobody yet</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>{c.email}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="max-w-prose text-xs text-ink-soft">
          When it arrived and the law it is handled under are not editable: they set the 30 days,
          and changing them afterwards would rewrite the deadline.
        </p>
        <button
          type="submit"
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Save the record
        </button>
      </EditForm>
    </main>
  );
}
