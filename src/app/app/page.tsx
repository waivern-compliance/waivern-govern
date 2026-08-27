import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { signOut } from "@/auth";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { verifyAuditChain } from "@/lib/audit";
import { capabilitiesFor } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";

export default async function AppHome() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const { membership } = active;
  const orgEntities = await db
    .select()
    .from(entities)
    .where(eq(entities.organisationId, membership.organisationId));
  const chain = await verifyAuditChain(membership.organisationId);

  const entityName = (id: string) =>
    orgEntities.find((e) => e.id === id)?.name ?? id;

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <header className="flex items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
            {membership.organisationName}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {active.name ?? active.email}
          </h1>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/sign-in" });
          }}
        >
          <button
            type="submit"
            className="rounded border border-line px-3 py-1.5 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Legal entities
        </h2>
        <ul className="divide-y divide-line rounded border border-line bg-surface">
          {orgEntities.map((e) => (
            <li key={e.id} className="flex items-baseline justify-between px-4 py-3">
              <span className="font-medium">{e.name}</span>
              <span className="font-mono text-xs text-ink-soft">
                {e.legalEntityRef}
                {e.isDefault ? " · default" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          What you may do
        </h2>
        <ul className="space-y-3">
          {membership.grants.map((g, i) => (
            <li key={i} className="rounded border border-line bg-surface px-4 py-3">
              <p className="text-sm font-medium">
                {g.role.replace(/_/g, " ")}
                <span className="ml-2 font-normal text-ink-soft">
                  {g.scope === "entity"
                    ? `on ${entityName(g.entityId)}`
                    : "across the organisation"}
                </span>
              </p>
              <p className="mt-1.5 font-mono text-xs leading-relaxed text-ink-soft">
                {capabilitiesFor(g.role).join("  ")}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Work
        </h2>
        <Link
          href="/app/dashboard"
          className="block rounded border border-line bg-surface px-4 py-3 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          Governance overview
          <span className="ml-2 text-ink-soft">posture, pipeline and service levels</span>
        </Link>
        <Link
          href="/app/tasks"
          className="block rounded border border-line bg-surface px-4 py-3 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          Tasks
          <span className="ml-2 text-ink-soft">what is waiting on you</span>
        </Link>
        <Link
          href="/app/assessments"
          className="block rounded border border-line bg-surface px-4 py-3 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          Assessments
          <span className="ml-2 text-ink-soft">start, answer and submit</span>
        </Link>
        <Link
          href="/app/risks"
          className="block rounded border border-line bg-surface px-4 py-3 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          Risk register
          <span className="ml-2 text-ink-soft">mitigations, residual rating, acceptance</span>
        </Link>
        <Link
          href="/app/templates"
          className="block rounded border border-line bg-surface px-4 py-3 text-sm hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          Assessment templates
          <span className="ml-2 text-ink-soft">
            DPIA, transfer risk and impact, AI risk, screening
          </span>
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Audit chain
        </h2>
        <div className="rounded border border-line bg-surface px-4 py-3 text-sm">
          {chain.ok ? (
            <p>
              <span className="font-medium text-emerald-700">Intact</span>
              <span className="text-ink-soft">
                {" "}
                — {chain.events} events verified, head{" "}
                <span className="font-mono text-xs">{chain.headHash.slice(0, 16)}…</span>
              </span>
            </p>
          ) : (
            <p className="text-red-800">
              <span className="font-medium">Broken</span> — {chain.reason} at
              sequence {chain.failedAtSeq}. Every event after this point is
              unverifiable.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
