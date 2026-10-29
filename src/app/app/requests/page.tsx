import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { RequestClock } from "@/components/dsr/RequestClock";
import { JURISDICTION_LABEL, RIGHTS, type Right } from "@/lib/dsr/statutory";
import { can, mayChooseDsrJurisdiction } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { defaultJurisdiction, requestRegister } from "@/services/data-subject-requests";
import { ActionForm } from "./ActionForm";
import { recordRequestAction, setJurisdictionAction } from "./actions";
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
  const [register, orgEntities, jurisdiction] = await Promise.all([
    requestRegister(org, visibleEntityIds(active, "dsr.handle")),
    scoped(org, () => db.select().from(entities).where(eq(entities.organisationId, org))),
    defaultJurisdiction(org),
  ]);
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
        {mayChooseDsrJurisdiction(active.membership.grants) ? (
          <ActionForm action={setJurisdictionAction} submit="Save" className="flex flex-wrap items-end gap-3">
            <select name="jurisdiction" defaultValue={jurisdiction} className="rounded border border-line bg-ground px-3 py-2 text-sm">
              <option value="uk">{JURISDICTION_LABEL.uk}</option>
              <option value="eu">{JURISDICTION_LABEL.eu}</option>
            </select>
          </ActionForm>
        ) : null}
      </section>
    </main>
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
