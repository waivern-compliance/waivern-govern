import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { RequestClock } from "@/components/dsr/RequestClock";
import { JURISDICTION_LABEL, RIGHTS, type Right } from "@/lib/dsr/statutory";
import { can, mayConfigureRequests } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import {
  defaultJurisdiction,
  objectionReviewThreshold,
  requestMetrics,
  requestRegister,
} from "@/services/data-subject-requests";
import { intakeLinksFor } from "@/services/dsr-intake";
import { ActionForm } from "./ActionForm";
import {
  issueIntakeLinkAction,
  recordRequestAction,
  revokeIntakeLinkAction,
  setJurisdictionAction,
  setObjectionThresholdAction,
} from "./actions";
import { CHANNEL_LABEL, ChannelSelect, Label, RightsField, inputClass } from "./fields";

export default async function RequestsPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "dsr.handle")) {
    return (
      <NotPermitted
        what="The register of data subject requests"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const org = active.membership.organisationId;
  const [register, orgEntities, jurisdiction, threshold, metrics, intakeLinks] = await Promise.all([
    requestRegister(org, visibleEntityIds(active, "dsr.handle")),
    scoped(org, () => db.select().from(entities).where(eq(entities.organisationId, org))),
    defaultJurisdiction(org),
    objectionReviewThreshold(org),
    requestMetrics(org, visibleEntityIds(active, "dsr.handle")),
    intakeLinksFor(org, visibleEntityIds(active, "dsr.handle")),
  ]);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const mayConfigure = mayConfigureRequests(active.membership.grants);
  const mayRecordIn = orgEntities.filter((e) => can(active.membership.grants, "dsr.handle", e.id));

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Data subject requests</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Every request from a person exercising their rights — access, erasure,
          objection and the rest — with the month to answer it, and the
          reasoning behind every decision along the way. A request can arrive
          by any route and need not name the law. Record it the day it arrives.
        </p>
      </header>

      <HelpLink topic="data-subject-requests" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Open" value={register.open} note="not yet answered or closed" />
        <Stat
          label="Due within a week"
          value={register.dueSoon}
          note="respond, or extend and say why"
          tone={register.dueSoon > 0 ? "warn" : "plain"}
        />
        <Stat
          label="Past the deadline"
          value={register.overdue}
          note="still owed"
          tone={register.overdue > 0 ? "stop" : "plain"}
        />
        <Stat
          label="Answered on time"
          value={register.answeredOnTime}
          note={`${register.answeredLate} answered late`}
        />
      </section>

      {mayRecordIn.length > 0 ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Record a request</summary>
          <ActionForm
            action={recordRequestAction}
            submit="Record it"
            pendingLabel="Recording…"
            className="space-y-3 border-t border-line p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Who is asking?" hint="Their name. Only what you need to answer them." />
                <input name="requesterName" required className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="How to reach them" hint="An email or postal address." />
                <input name="requesterContact" className={inputClass} />
              </label>
            </div>
            <label className="block space-y-1">
              <Label text="What did they ask for?" hint="In their terms. Paraphrase, don't paste the whole letter." />
              <textarea name="description" required rows={3} className={inputClass} />
            </label>
            <RightsField />
            <label className="block space-y-1">
              <Label
                text="Who are they to you?"
                hint="Customer, employee, applicant — one per line. Matched against the ROPA to list where to look."
              />
              <textarea name="subjectCategories" rows={2} className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="When did it arrive?" hint="This starts the month — not when it was noticed." />
                <input name="receivedAt" type="datetime-local" required className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="How did it arrive?" />
                <ChannelSelect />
              </label>
            </div>
            <label className="block space-y-1">
              <Label text="Acting for them" hint="A solicitor, parent or other representative, if any." />
              <input name="representative" className={inputClass} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1">
                <Label text="Entity" />
                <select name="entityId" required className={inputClass}>
                  {mayRecordIn.map((e) => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Your role" hint="A processor passes it to the controller." />
                <select name="controllerRole" defaultValue="controller" className={inputClass}>
                  <option value="controller">Controller</option>
                  <option value="joint_controller">Joint controller</option>
                  <option value="processor">Processor</option>
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="Law" hint="Sets how the month is counted." />
                <select name="jurisdiction" defaultValue={jurisdiction} className={inputClass}>
                  <option value="uk">UK GDPR</option>
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
            Timeliness, last twelve months
            <span className="ml-2 font-mono text-[11px] font-normal text-ink-soft">
              {metrics.totals.received} received · {metrics.totals.onTime} on time · {metrics.totals.late} late
              {metrics.totals.medianDaysToRespond !== null ? ` · median ${metrics.totals.medianDaysToRespond} days` : ""}
            </span>
          </summary>
          <div className="space-y-5 border-t border-line p-4">
            <p className="max-w-prose text-xs text-ink-soft">
              Requests received since {metrics.from.toISOString().slice(0, 10)}. {metrics.totals.extended} extended,{" "}
              {metrics.totals.refused} refused, {metrics.totals.withdrawn} withdrawn, {metrics.totals.open} still open
              {metrics.totals.overdue > 0 ? `, ${metrics.totals.overdue} of them overdue` : ""}. A request invoking
              several rights counts under each.{" "}
              The register and these counts are on{" "}
              <Link href="/app/exports" className="text-brand underline">Exports</Link>.
            </p>
            <TallyTable
              head="Right"
              rows={metrics.byRight.map((r) => ({ ...r, key: r.right, label: `${r.label} (${r.article})` }))}
            />
            <TallyTable
              head="Month"
              rows={metrics.byMonth.map((m) => ({ ...m, key: m.period, label: m.period }))}
            />
          </div>
        </details>
      ) : null}

      <ul className="space-y-3">
        {register.rows.map(({ request, entityName, clock, decisions }) => (
          <li key={request.id}>
            <Link
              href={`/app/requests/${request.id}`}
              className="block space-y-2 rounded border border-line bg-surface p-4 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{request.reference}</span>
                  <span className="font-medium">
                    {request.rights.map((r) => RIGHTS[r as Right]?.label ?? r).join(", ")}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {entityName} · {request.status.replace(/_/g, " ")} · {request.jurisdiction.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                received {request.receivedAt.toISOString().slice(0, 10)} by{" "}
                {CHANNEL_LABEL[request.channel]?.toLowerCase() ?? request.channel}
                {decisions.length > 0 ? ` · ${decisions.length} decision(s)` : ""}
              </p>
              <RequestClock clock={clock} />
            </Link>
          </li>
        ))}
        {register.rows.length === 0 ? (
          <li className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            Nothing recorded. When somebody asks for their data, asks you to
            delete it or objects to how you use it, record it here the day it
            arrives — the month runs from then, wherever it landed.
          </li>
        ) : null}
      </ul>

      <section className="space-y-2 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Which law new requests are handled under</h2>
        <p className="max-w-prose text-xs text-ink-soft">
          Currently {JURISDICTION_LABEL[jurisdiction]}. The UK lets the month
          stop while you wait for clarification you reasonably need; the EU
          GDPR does not. Each request keeps the law it was recorded under, so
          changing this never moves a deadline already running.
        </p>
        {mayConfigureRequests(active.membership.grants) ? (
          <ActionForm action={setJurisdictionAction} submit="Save" className="flex flex-wrap items-end gap-3">
            <select name="jurisdiction" defaultValue={jurisdiction} className="rounded border border-line bg-ground px-3 py-2 text-sm">
              <option value="uk">{JURISDICTION_LABEL.uk}</option>
              <option value="eu">{JURISDICTION_LABEL.eu}</option>
            </select>
          </ActionForm>
        ) : null}
      </section>

      <section className="space-y-3 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Public request form</h2>
        <p className="max-w-prose text-xs text-ink-soft">
          A web form people can use to make a request without an account, one per entity. Publish its
          address in your privacy notice. Each submission lands in this register as received by web
          form, and raises a task for the privacy team. The form shows nothing back except a reference
          and the deadline, takes no identity documents, and limits how often one address can submit.
          It is one route among many: requests by email, post or in person still count.
        </p>
        {intakeLinks.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded border border-line">
            {intakeLinks.map(({ link, entityName }) => (
              <li key={link.id} className="space-y-1 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {link.label} <span className="text-xs font-normal text-ink-soft">· {entityName}</span>
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {link.revokedAt
                      ? `withdrawn ${link.revokedAt.toISOString().slice(0, 10)}`
                      : `${link.submissions} submission${link.submissions === 1 ? "" : "s"}`}
                  </span>
                </div>
                {!link.revokedAt ? (
                  <>
                    <p className="break-all font-mono text-xs">{`${origin}/request/${link.slug}`}</p>
                    {mayConfigure ? (
                      <ActionForm
                        action={revokeIntakeLinkAction.bind(null, link.id)}
                        submit="Withdraw this form"
                        className="pt-1"
                      >
                        <span className="sr-only">Withdraw {link.label}</span>
                      </ActionForm>
                    ) : null}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {mayConfigure && mayRecordIn.length > 0 ? (
          <ActionForm action={issueIntakeLinkAction} submit="Create a form" className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <Label text="Entity" />
              <select name="entityId" className="rounded border border-line bg-ground px-3 py-2 text-sm">
                {mayRecordIn.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
            </label>
            <label className="block flex-1 space-y-1">
              <Label text="Where it will be published" />
              <input name="label" placeholder="Website privacy notice" className={inputClass} />
            </label>
          </ActionForm>
        ) : null}
      </section>

      <section className="space-y-2 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">When objections reopen a legitimate interests assessment</h2>
        <p className="max-w-prose text-xs text-ink-soft">
          {threshold === 0
            ? "Off. Objections are decided one by one and never counted against the processing."
            : `After ${threshold} objection${threshold === 1 ? "" : "s"} to one processing activity in twelve months, upheld or overridden, its LIA goes back to its owner for review — or, where there is none, a task asks for one.`}{" "}
          A run of objections is evidence that people do not expect the processing,
          which is what the balancing test is meant to weigh.
        </p>
        {mayConfigureRequests(active.membership.grants) ? (
          <ActionForm action={setObjectionThresholdAction} submit="Save" className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <Label text="Objections in twelve months" hint="0 turns it off." />
              <input
                name="threshold"
                type="number"
                min={0}
                max={100}
                defaultValue={threshold}
                className="w-28 rounded border border-line bg-ground px-3 py-2 text-sm"
              />
            </label>
          </ActionForm>
        ) : null}
      </section>
    </main>
  );
}

function TallyTable({
  head,
  rows,
}: {
  head: string;
  rows: Array<{ key: string; label: string; received: number; answered: number; onTime: number; late: number }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-ink-soft">
          <tr>
            <th className="py-1 pr-3 font-medium">{head}</th>
            <th className="py-1 pr-3 text-right font-medium">Received</th>
            <th className="py-1 pr-3 text-right font-medium">Answered</th>
            <th className="py-1 pr-3 text-right font-medium">On time</th>
            <th className="py-1 text-right font-medium">Late</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="py-1 pr-3">{r.label}</td>
              <td className="py-1 pr-3 text-right">{r.received}</td>
              <td className="py-1 pr-3 text-right">{r.answered}</td>
              <td className="py-1 pr-3 text-right">{r.onTime}</td>
              <td className={`py-1 text-right ${r.late > 0 ? "text-red-800" : ""}`}>{r.late}</td>
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
