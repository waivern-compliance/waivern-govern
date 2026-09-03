import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { Clock } from "@/components/breach/Clock";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { breachRegister } from "@/services/breaches";
import { RecordBreachForm } from "./RecordBreachForm";

export default async function BreachesPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The breach register"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const org = active.membership.organisationId;
  const [register, orgEntities] = await Promise.all([
    breachRegister(org, visibleEntityIds(active)),
    db.select().from(entities).where(eq(entities.organisationId, org)),
  ]);
  const mayRecord = can(active.membership.grants, "record.write");

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Personal data breaches</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Article 33(5) requires every breach to be documented, not only the
          reported ones. A breach judged not notifiable belongs here with its
          reasoning — an absence of notification with nothing recorded is
          indistinguishable from an oversight.
        </p>
      </header>

      <HelpLink topic="breaches" />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="On the register" value={register.total} note="reported and not" />
        <Stat label="Open" value={register.open} note="not yet concluded" />
        <Stat
          label="Clock running out"
          value={register.urgent}
          note="within eighteen hours, or past"
          tone={register.urgent > 0 ? "stop" : "plain"}
        />
        <Stat
          label="Not yet assessed"
          value={register.unassessed}
          note="no Article 33 judgement recorded"
          tone={register.unassessed > 0 ? "warn" : "plain"}
        />
      </section>

      {mayRecord ? <RecordBreachForm entities={orgEntities} /> : null}

      <ul className="space-y-3">
        {register.rows.map(({ breach, entityName, clock, risk, decisions }) => (
          <li key={breach.id}>
            <Link
              href={`/app/breaches/${breach.id}`}
              className="block space-y-2 rounded border border-line bg-surface p-4 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-ink-soft">{breach.reference}</span>
                  <span className="font-medium">{breach.title}</span>
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {entityName} · {breach.status} · {breach.controllerRole.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                aware {breach.discoveredAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                {breach.subjectsAffected !== null
                  ? ` · about ${breach.subjectsAffected} people`
                  : " · numbers not yet known"}
                {risk === null ? " · risk not assessed" : ` · assessed as ${risk.replace(/_/g, " ")}`}
                {decisions.length > 0 ? ` · ${decisions.length} decision(s)` : ""}
              </p>
              <Clock clock={clock} />
            </Link>
          </li>
        ))}
        {register.rows.length === 0 ? (
          <li className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            Nothing recorded. If something has happened, record it before you
            know whether it is notifiable — the seventy-two hours runs from when
            you became aware, not from when you finished deciding.
          </li>
        ) : null}
      </ul>
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
