import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditForm } from "@/components/EditForm";
import { NotPermitted } from "@/components/NotPermitted";
import { CHANNELS, CHANNEL_KEYS, MARKETING_BASES, RECIPIENTS, TPS_SCREENING_DAYS } from "@/lib/pecr/marketing";
import { can } from "@/lib/rbac";
import { savedKey } from "@/lib/saved-key";
import { getActiveSession } from "@/lib/session";
import { loadMarketingActivity, marketingProcessingActivities } from "@/services/marketing";
import { ActionForm } from "../../requests/ActionForm";
import { Label, inputClass, stamp } from "../../requests/fields";
import { decideMarketingBasisAction, recordTpsAction, updateActivityAction } from "../actions";
import { MarketingBasisForm } from "../MarketingBasisForm";

const save =
  "rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function MarketingActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  const loaded = await loadMarketingActivity(id, active.membership.organisationId);
  if (!loaded) notFound();
  const { activity, entityName, ownerEmail, processingActivity, decision, history, gaps, objections, tpsDueAt, tpsOverdue } = loaded;
  if (!can(active.membership.grants, "record.read", activity.entityId)) {
    return <NotPermitted what={`${activity.reference} is a marketing activity, and`} organisationName={active.membership.organisationName} />;
  }
  const mayWrite = can(active.membership.grants, "record.write", activity.entityId);
  const paOptions = mayWrite ? await marketingProcessingActivities(active.membership.organisationId) : [];

  return (
    <main className="mx-auto max-w-4xl space-y-9 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/marketing" className="text-xs text-ink-soft hover:text-brand">← Electronic marketing</Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-sm text-ink-soft">{activity.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{activity.name}</h1>
        </div>
        <p className="text-xs text-ink-soft">
          {CHANNELS[activity.channel].label} ({CHANNELS[activity.channel].regulation}) · reaches {RECIPIENTS[activity.recipients].toLowerCase()} ·{" "}
          {entityName}
          {activity.tool ? ` · sent from ${activity.tool}` : ""}
          {ownerEmail ? ` · owned by ${ownerEmail}` : ""}
          {activity.status !== "active" ? ` · ${activity.status}` : ""}
        </p>
      </header>

      {gaps.length > 0 ? (
        <section className="space-y-1.5 rounded border border-amber-700 bg-amber-50 p-4" aria-label="What the record does not yet show">
          <h2 className="text-sm font-semibold text-amber-900">What the record does not yet show</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-900">
            {gaps.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </section>
      ) : activity.status === "ended" ? (
        <p className="text-sm text-ink-soft">This activity has ended. Its record is kept.</p>
      ) : (
        <p className="text-sm text-emerald-900">The basis is recorded, and nothing is missing from the record.</p>
      )}

      <section className="space-y-3 rounded border border-line bg-surface p-5" aria-label="The basis">
        <h2 className="text-sm font-semibold">What it relies on</h2>
        {decision ? (
          <div className="space-y-1">
            <p className="text-sm">
              <span className="font-medium">{MARKETING_BASES[decision.basis].label}</span>{" "}
              <span className="text-xs text-ink-soft">{decision.statutoryBasis}</span>
            </p>
            <p className="max-w-prose text-sm">{decision.rationale}</p>
            <p className="text-xs text-ink-soft">Recorded by {decision.decidedByEmail ?? decision.decidedByLabel}, {stamp(decision.decidedAt)}</p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">No basis recorded yet.</p>
        )}
        {history.length > 1 ? (
          <details>
            <summary className="cursor-pointer text-xs text-ink-soft">Earlier decisions ({history.length - 1})</summary>
            <ul className="space-y-1.5 pt-2">
              {history.slice(1).map((d) => (
                <li key={d.id} className="text-xs">
                  <span className="font-medium">{MARKETING_BASES[d.basis].label}</span> — {d.rationale}{" "}
                  <span className="text-ink-soft">{d.decidedByEmail ?? d.decidedByLabel} · {stamp(d.decidedAt)}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {mayWrite ? (
          decision ? (
            <details className="border-t border-line pt-3">
              <summary className="cursor-pointer text-xs font-medium text-brand">Record a different basis</summary>
              <div className="pt-3">
                <MarketingBasisForm
                  action={decideMarketingBasisAction.bind(null, activity.id)}
                  channel={activity.channel}
                  recipients={activity.recipients}
                  current={decision.basis}
                />
              </div>
            </details>
          ) : (
            <div className="border-t border-line pt-3">
              <MarketingBasisForm
                action={decideMarketingBasisAction.bind(null, activity.id)}
                channel={activity.channel}
                recipients={activity.recipients}
                current={null}
              />
            </div>
          )
        ) : null}
      </section>

      {activity.channel === "live_call" ? (
        <section className="space-y-3 rounded border border-line bg-surface p-5" aria-label="TPS screening">
          <h2 className="text-sm font-semibold">Screening against the TPS and CTPS</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            Regulation 21 bars marketing calls to numbers on the Telephone or Corporate Telephone Preference Service,
            unless the person has told you they do not mind. A screening holds for {TPS_SCREENING_DAYS} days; a
            reminder is raised a few days before it runs out.
          </p>
          <p className={`text-sm ${tpsOverdue || !activity.tpsScreenedAt ? "text-red-800" : ""}`}>
            {activity.tpsScreenedAt
              ? `Last screened ${day(activity.tpsScreenedAt)}; ${tpsOverdue ? "ran out" : "holds until"} ${day(tpsDueAt!)}.`
              : "Never screened."}
          </p>
          {mayWrite ? (
            <ActionForm action={recordTpsAction.bind(null, activity.id)} submit="Record the screening" className="flex flex-wrap items-end gap-3">
              <label className="block space-y-1">
                <Label text="Screened on" />
                <input name="screenedOn" type="date" required defaultValue={day(new Date())} className={inputClass} />
              </label>
            </ActionForm>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2 rounded border border-line bg-surface p-5" aria-label="Objections">
        <h2 className="text-sm font-semibold">Objections to direct marketing</h2>
        {processingActivity ? (
          <p className="text-sm">
            Counted through{" "}
            <Link href={`/app/ropa/${processingActivity.id}`} className="underline hover:text-brand">
              {processingActivity.reference} {processingActivity.name}
            </Link>
            : {objections.upheld} upheld in the last twelve months
            {objections.overridden > 0 ? (
              <span className="text-red-800">
                , and {objections.overridden} overridden. An objection to direct marketing is absolute (UK GDPR art 21(3)): stop
                marketing to each of them.
              </span>
            ) : "."}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">
            Link this activity to its processing activity in the ROPA below, and objections upheld in the request register
            will be counted here.
          </p>
        )}
        <p className="text-xs text-ink-soft">The suppression list itself stays in your marketing tool.</p>
      </section>

      <EditForm
        key={savedKey(activity)}
        action={updateActivityAction.bind(null, activity.id)}
        className="space-y-3 rounded border border-line bg-surface p-5"
      >
        <h2 className="text-sm font-semibold">About this activity</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label text="Name" />
            <input name="name" defaultValue={activity.name} disabled={!mayWrite} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="Running?" />
            <select name="status" defaultValue={activity.status} disabled={!mayWrite} className={inputClass}>
              <option value="active">Running</option>
              <option value="paused">Paused</option>
              <option value="ended">Ended</option>
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="Channel" />
            <select name="channel" defaultValue={activity.channel} disabled={!mayWrite} className={inputClass}>
              {CHANNEL_KEYS.map((c) => <option key={c} value={c}>{CHANNELS[c].label}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="Who it reaches" />
            <select name="recipients" defaultValue={activity.recipients} disabled={!mayWrite} className={inputClass}>
              {Object.entries(RECIPIENTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="Sent from" hint="The email platform or dialler." />
            <input name="tool" defaultValue={activity.tool ?? ""} disabled={!mayWrite} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="Processing activity" hint="Its ROPA entry." />
            <select name="processingActivityId" defaultValue={activity.processingActivityId ?? ""} disabled={!mayWrite} className={inputClass}>
              <option value="">Not linked</option>
              {(mayWrite ? paOptions : processingActivity ? [{ ...processingActivity, marketing: true }] : []).map((p) => (
                <option key={p.id} value={p.id}>{p.reference} {p.name}{p.marketing ? "" : " (no marketing purpose)"}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="Charity registration number" hint="Only for the charity soft opt-in." />
            <input name="charityNumber" defaultValue={activity.charityNumber ?? ""} disabled={!mayWrite} className={inputClass} />
          </label>
        </div>
        <label className="block space-y-1">
          <Label text="What it sends" />
          <textarea name="description" rows={2} defaultValue={activity.description ?? ""} disabled={!mayWrite} className={inputClass} />
        </label>
        {mayWrite ? <button type="submit" className={save}>Save</button> : null}
      </EditForm>
    </main>
  );
}
