import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EditForm } from "@/components/EditForm";
import { NotPermitted } from "@/components/NotPermitted";
import { RESCAN_INTERVALS, rescanState } from "@/lib/pecr/rescan";
import { BASES, suggestedBasis } from "@/lib/pecr/statutory";
import { can } from "@/lib/rbac";
import { savedKey } from "@/lib/saved-key";
import { getActiveSession } from "@/lib/session";
import { analyserSettings } from "@/services/consent-analyser";
import { loadProperty, ITEM_KINDS } from "@/services/storage-inventory";
import { ActionForm } from "../../requests/ActionForm";
import { Label, inputClass, stamp } from "../../requests/fields";
import {
  addItemAction,
  checkScanAction,
  decideBasisAction,
  decideProposalAction,
  updateItemAction,
  startScanAction,
  updatePropertyAction,
  uploadReportAction,
} from "../actions";
import { ScanStatus } from "../ScanStatus";
import { BasisForm } from "../BasisForm";
import { UploadReport } from "../UploadReport";

const KIND_LABEL: Record<string, string> = {
  cookie: "Cookie",
  local_storage: "Local storage",
  session_storage: "Session storage",
  pixel: "Pixel",
  sdk: "App SDK",
  other: "Other",
};

const save =
  "rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  const loaded = await loadProperty(id, active.membership.organisationId);
  if (!loaded) notFound();
  const { property, entityName, ownerEmail, items, gapSummary, rescanDueAt, scans, proposals, suppliers } = loaded;
  if (!can(active.membership.grants, "record.read", property.entityId)) {
    return <NotPermitted what={`${property.reference} is a website's cookie inventory, and`} organisationName={active.membership.organisationName} />;
  }
  const mayWrite = can(active.membership.grants, "record.write", property.entityId);
  const analyser = await analyserSettings(active.membership.organisationId);
  const running = scans.find((s) => s.status === "running");
  const inUse = items.filter((i) => i.status === "active");
  const retired = items.filter((i) => i.status !== "active");
  const rescan = rescanState(rescanDueAt);

  return (
    <main className="mx-auto max-w-4xl space-y-9 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/cookies" className="text-xs text-ink-soft hover:text-brand">← Cookies and similar technologies</Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-sm text-ink-soft">{property.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{property.name}</h1>
        </div>
        <p className="break-all text-xs text-ink-soft">
          {property.url} · {entityName} · {property.kind}
          {property.cmp ? ` · consent platform: ${property.cmp}` : ""}
          {ownerEmail ? ` · owned by ${ownerEmail}` : ""}
        </p>
        <p className="text-xs text-ink-soft">
          {inUse.length} in use · {inUse.filter((i) => !i.decision).length} with no basis ·{" "}
          {inUse.filter((i) => i.gaps.length > 0).length} with gaps ·{" "}
          {property.lastScannedAt ? `last scanned ${stamp(property.lastScannedAt)}` : "never scanned"}
          {rescanDueAt ? (
            <span className={rescan === "overdue" ? "text-red-800" : rescan === "due_soon" ? "text-amber-900" : ""}>
              {" "}· next scan {rescan === "overdue" ? "overdue since" : "due"} {rescanDueAt.toISOString().slice(0, 10)}
            </span>
          ) : (
            " · no rescan reminders"
          )}
        </p>
      </header>

      {gapSummary.length > 0 ? (
        <section className="space-y-1.5 rounded border border-amber-700 bg-amber-50 p-4" aria-label="What the record does not yet show">
          <h2 className="text-sm font-semibold text-amber-900">What the record does not yet show</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-900">
            {gapSummary.map((g) => <li key={g.kind}>{g.text}</li>)}
          </ul>
        </section>
      ) : inUse.length > 0 ? (
        <p className="text-sm text-emerald-900">Every item in use has a basis, and nothing is missing from the record.</p>
      ) : null}

      <EditForm
        key={savedKey(property)}
        action={updatePropertyAction.bind(null, property.id)}
        className="space-y-3 rounded border border-line bg-surface p-5"
      >
        <h2 className="text-sm font-semibold">What people are told, and how they object</h2>
        <p className="max-w-prose text-xs text-ink-soft">
          Schedule A1 paragraphs 5 and 6 let statistics and appearance cookies be set without consent only
          if people get clear and comprehensive information and a simple, free way to object. Record both
          once here; every such cookie on this site is checked against them.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label text="Name" />
            <input name="name" defaultValue={property.name} disabled={!mayWrite} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="Address" />
            <input name="url" defaultValue={property.url} disabled={!mayWrite} className={inputClass} />
          </label>
        </div>
        <label className="block space-y-1">
          <Label text="Where people are told" hint="The cookie notice's address." />
          <input name="informationUrl" type="url" defaultValue={property.informationUrl ?? ""} disabled={!mayWrite} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <Label text="How people object" hint="For example: the analytics switch in Cookie settings, linked from every page footer." />
          <textarea name="objectionMechanism" rows={2} defaultValue={property.objectionMechanism ?? ""} disabled={!mayWrite} className={inputClass} />
        </label>
        <label className="block space-y-1">
          <Label text="Scan it again" hint="A reminder is raised a fortnight before each scan is due. Sites change without anyone telling you." />
          <select
            name="rescanIntervalMonths"
            defaultValue={property.rescanIntervalMonths ? String(property.rescanIntervalMonths) : ""}
            disabled={!mayWrite}
            className={inputClass}
          >
            {RESCAN_INTERVALS.map((m) => (
              <option key={m} value={m}>{m === 1 ? "Every month" : m === 12 ? "Every year" : `Every ${m} months`}</option>
            ))}
            <option value="">No reminders</option>
          </select>
        </label>
        {mayWrite ? <button type="submit" className={save}>Save</button> : null}
      </EditForm>

      {property.kind === "website" && (running || (mayWrite && analyser.configured)) ? (
        <section className="space-y-3 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Scan it now</h2>
          {running ? (
            <ScanStatus
              key={running.id}
              check={checkScanAction.bind(null, running.id, property.id)}
              startedAt={running.startedAt.toISOString()}
            />
          ) : (
            <>
              <p className="max-w-prose text-xs text-ink-soft">
                Runs the Waivern Consent Analyser against {property.url}, from the UK where the analyser can, in
                GDPR mode with AI classification. It costs the token owner one scan credit and usually takes one to
                five minutes. The report is taken in as an upload would be.
              </p>
              <ActionForm action={startScanAction.bind(null, property.id)} submit="Scan now" pendingLabel="Starting…">
                <span className="sr-only">Scan {property.name}</span>
              </ActionForm>
            </>
          )}
        </section>
      ) : null}

      {mayWrite ? (
        <section className="space-y-3 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Upload a Consent Analyser report</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            Download the report as JSON from the Waivern Consent Analyser and choose it here. Screenshots
            and cookie values are not kept. New items, and items no longer seen, wait below for you to
            review; failing checks are added to Findings.
          </p>
          <UploadReport action={uploadReportAction.bind(null, property.id)} />
        </section>
      ) : null}

      {proposals.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Waiting for review ({proposals.length})</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            What the scans found that the inventory does not yet reflect. Nothing is added, or retired, until
            somebody agrees. Rejecting needs a reason.
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {proposals.map((p) => {
              const o = p.observed as Record<string, string | boolean | null>;
              return (
                <li key={p.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {p.change === "new" ? "New: " : "No longer seen: "}
                      <span className="font-mono">{String(o.name)}</span>
                    </span>
                    <span className="font-mono text-[11px] text-ink-soft">
                      {o.domain ? String(o.domain) : "domain unknown"}
                      {o.party ? ` · ${o.party} party` : ""}
                      {o.category ? ` · scanner says ${String(o.category).replace(/_/g, " ")}` : ""}
                      {o.seenBeforeConsent ? " · seen before consent" : ""}
                      {o.seenAfterReject ? " · seen after Reject" : ""}
                    </span>
                  </div>
                  {mayWrite ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <ActionForm action={decideProposalAction.bind(null, p.id, property.id, true)} submit="Accept" className="space-y-2">
                        <span className="sr-only">Accept {String(o.name)}</span>
                      </ActionForm>
                      <ActionForm action={decideProposalAction.bind(null, p.id, property.id, false)} submit="Reject" className="flex flex-wrap items-end gap-2">
                        <input name="note" placeholder="Why it is wrong" className="rounded border border-line bg-ground px-3 py-2 text-sm" />
                      </ActionForm>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">In use ({inUse.length})</h2>
        {inUse.length === 0 ? (
          <p className="rounded border border-line bg-surface px-4 py-5 text-sm text-ink-soft">
            Nothing on the inventory yet. Upload a report, or add an item by hand.
          </p>
        ) : null}
        {inUse.map((item) => {
          const suggested = suggestedBasis(item.suggestedCategory);
          return (
            <details key={item.id} className="rounded border border-line bg-surface" open={!item.decision || item.gaps.length > 0}>
              <summary className="cursor-pointer space-y-1 px-4 py-3">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">
                    <span className="font-mono">{item.name}</span>{" "}
                    <span className="text-xs font-normal text-ink-soft">{KIND_LABEL[item.kind] ?? item.kind}</span>
                  </span>
                  <span className={`text-xs ${item.gaps.length ? "text-amber-900" : "text-emerald-900"}`}>
                    {item.decision ? BASES[item.decision.basis].label : "No basis"}
                    {item.gaps.length ? ` · ${item.gaps.length} gap${item.gaps.length === 1 ? "" : "s"}` : item.decision ? " · complete" : ""}
                  </span>
                </span>
                <span className="block font-mono text-[11px] text-ink-soft">
                  {item.domain ?? "domain unknown"} · {item.party} party
                  {item.expiry ? ` · ${item.expiry}` : ""}
                  {item.suggestedCategory ? ` · scanner says ${item.suggestedCategory.replace(/_/g, " ")}` : ""}
                  {item.seenBeforeConsent ? " · seen before consent" : ""}
                  {item.seenAfterReject ? " · seen after Reject" : ""}
                  {item.source === "manual" ? " · added by hand" : ""}
                </span>
              </summary>
              <div className="space-y-3 border-t border-line px-4 py-3">
                {item.gaps.length > 0 ? (
                  <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-900">
                    {item.gaps.map((g) => <li key={g}>{g}</li>)}
                  </ul>
                ) : null}
                {item.history.length > 0 ? (
                  <ul className="space-y-1.5">
                    {item.history.map((d) => (
                      <li key={d.id} className="text-xs">
                        <span className="font-medium">{BASES[d.basis].label}</span>{" "}
                        <span className="font-mono text-ink-soft">{d.statutoryBasis}</span> — {d.rationale}{" "}
                        <span className="font-mono text-[11px] text-ink-soft">
                          {d.decidedByEmail ?? d.decidedByLabel} · {stamp(d.decidedAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <EditForm
                  key={savedKey(item)}
                  action={updateItemAction.bind(null, item.id, property.id)}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <label className="block space-y-1 sm:col-span-2">
                    <Label text="What it is for" />
                    <input name="purpose" defaultValue={item.purpose ?? ""} disabled={!mayWrite} className={inputClass} />
                  </label>
                  <label className="block space-y-1">
                    <Label text="Who receives it" hint="Where a supplier collects what it holds." />
                    <select name="supplierId" defaultValue={item.supplierId ?? ""} disabled={!mayWrite} className={inputClass}>
                      <option value="">Nobody outside the organisation</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <Label text="Party" />
                    <select name="party" defaultValue={item.party} disabled={!mayWrite} className={inputClass}>
                      <option value="first">First party</option>
                      <option value="third">Third party</option>
                      <option value="unknown">Not known</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <Label text="Lasts" />
                    <input name="expiry" defaultValue={item.expiry ?? ""} disabled={!mayWrite} className={inputClass} />
                  </label>
                  <label className="block space-y-1">
                    <Label text="Still used?" />
                    <select name="status" defaultValue="active" disabled={!mayWrite} className={inputClass}>
                      <option value="active">In use</option>
                      <option value="removed">Removed from the site</option>
                    </select>
                  </label>
                  {mayWrite ? <div className="sm:col-span-2"><button type="submit" className={save}>Save</button></div> : null}
                </EditForm>
                {mayWrite ? (
                  <BasisForm
                    action={decideBasisAction.bind(null, item.id, property.id)}
                    current={item.decision?.basis ?? null}
                    suggested={suggested}
                  />
                ) : null}
              </div>
            </details>
          );
        })}
      </section>

      {mayWrite ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Add an item by hand</summary>
          <ActionForm action={addItemAction.bind(null, property.id)} submit="Add it" className="space-y-3 border-t border-line p-4">
            <p className="max-w-prose text-xs text-ink-soft">
              For what a scan cannot see: an app SDK, a cookie set only after signing in, a pixel in an email.
              Items added by hand are never proposed as no longer seen.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <Label text="Name" />
                <input name="name" required className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="Kind" />
                <select name="kind" defaultValue="cookie" className={inputClass}>
                  {ITEM_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Domain" />
                <input name="domain" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="Party" />
                <select name="party" defaultValue="unknown" className={inputClass}>
                  <option value="first">First party</option>
                  <option value="third">Third party</option>
                  <option value="unknown">Not known</option>
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Lasts" />
                <input name="expiry" placeholder="session, 13 months" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="What it is for" />
                <input name="purpose" className={inputClass} />
              </label>
            </div>
          </ActionForm>
        </details>
      ) : null}

      {retired.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">No longer in use ({retired.length})</h2>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface text-xs">
            {retired.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-mono">{i.name}</span>
                <span className="text-ink-soft">{i.status === "removed" ? "removed" : "not seen by the last scan"} · {i.domain ?? "domain unknown"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Scans ({scans.length})</h2>
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface text-xs">
          {scans.map((s) => {
            const summary = s.summary as Record<string, string | number | null>;
            return (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  <span className="font-mono">{s.analyserRunId ?? "no run id"}</span> · {s.source === "upload" ? "uploaded" : "run from here"} by {s.startedByLabel}
                </span>
                <span className="text-ink-soft">
                  {s.status}
                  {s.status === "failed" && s.failure ? ` (${s.failure})` : ""}
                  {s.status === "done" ? ` · ${s.observed} seen · overall ${summary.overall ?? "?"}` : ""}
                  {s.region ? ` · from ${s.region.toUpperCase()}` : ""} · {stamp(s.completedAt ?? s.startedAt)}
                </span>
              </li>
            );
          })}
          {scans.length === 0 ? <li className="px-4 py-3 text-ink-soft">None yet.</li> : null}
        </ul>
      </section>
    </main>
  );
}
