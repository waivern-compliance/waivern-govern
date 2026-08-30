import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { entities } from "@/db/schema";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { PERSONA_LABEL, PERSONAS } from "@/lib/persona";
import { ROLES, can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { listMembers } from "@/services/access";
import { InviteForm } from "./InviteForm";
import { revokeRoleAction, setActiveAction, setPersonaAction } from "../actions";

const ROLE_NOTE: Record<string, string> = {
  owner: "Everything, including managing people",
  privacy_admin: "Registers, templates and workflow configuration",
  privacy_analyst: "Day-to-day assessment and risk work",
  ai_governance: "The AI register and assessments over it",
  approver: "Decides approvals and accepts risk",
  contributor: "Answers what is asked of them",
  auditor: "Reads everything, changes nothing, exports the log",
};

export default async function PeoplePage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "member.manage")) {
    return (
      <NotPermitted
        what="Managing who may use this"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const org = active.membership.organisationId;
  const [members, orgEntities] = await Promise.all([
    listMembers(org),
    db.select().from(entities).where(eq(entities.organisationId, org)),
  ]);

  const owners = members.filter(
    (m) => m.isActive && m.roles.some((r) => r.role === "owner"),
  ).length;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">People and access</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Who may sign in, and as what. Every change here is written to the
          audit log — granting the power to approve is as much a governance
          event as an approval.
        </p>
      </header>

      <HelpLink topic="managing-people" />

      <InviteForm roles={ROLES} roleNotes={ROLE_NOTE} entities={orgEntities} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">{members.length} people</h2>
          <span className="font-mono text-[11px] text-ink-soft">
            {owners} active owner{owners === 1 ? "" : "s"}
          </span>
        </div>

        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {members.map((m) => (
            <li key={m.membershipId} className="space-y-2.5 px-4 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{m.name ?? m.email}</span>
                  {m.name ? (
                    <span className="font-mono text-[11px] text-ink-soft">{m.email}</span>
                  ) : null}
                  {m.userId === active.userId ? (
                    <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                      you
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {m.isActive ? "active" : "suspended"}
                  {m.lastSeenAt ? ` · last seen ${m.lastSeenAt.toISOString().slice(0, 10)}` : " · never signed in"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {m.roles.map((r) => (
                  <form key={r.id} action={revokeRoleAction.bind(null, r.id)}>
                    <button
                      type="submit"
                      title={`Remove ${r.role.replace(/_/g, " ")}`}
                      className="rounded border border-line bg-ground px-2 py-0.5 font-mono text-[11px] hover:border-red-700 hover:text-red-900 focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      {r.role.replace(/_/g, " ")}
                      {r.entityName ? ` · ${r.entityName}` : ""}
                      <span aria-hidden className="ml-1.5 text-ink-soft">×</span>
                    </button>
                  </form>
                ))}
                {m.roles.length === 0 ? (
                  <span className="font-mono text-[11px] text-amber-900">
                    no roles — they can sign in and see nothing
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <form
                  action={setPersonaAction.bind(null, m.membershipId)}
                  className="flex items-center gap-2"
                >
                  <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                    Shows as
                    <select
                      name="persona"
                      defaultValue={m.persona ?? ""}
                      className="rounded border border-line bg-ground px-2 py-1 text-xs"
                    >
                      <option value="">Not set</option>
                      {PERSONAS.map((p) => (
                        <option key={p} value={p}>{PERSONA_LABEL[p]}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded border border-line px-2 py-1 text-xs hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    Set
                  </button>
                </form>

                <form action={setActiveAction.bind(null, m.membershipId, !m.isActive)}>
                  <button
                    type="submit"
                    className="rounded border border-line px-2 py-1 text-xs hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {m.isActive ? "Suspend" : "Reinstate"}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>

        <p className="max-w-prose text-xs text-ink-soft">
          The last active owner cannot be suspended or have that role removed —
          an organisation that locks itself out needs a database console to get
          back in. Persona changes what somebody is shown first, never what
          they may reach.
        </p>
      </section>
    </main>
  );
}
