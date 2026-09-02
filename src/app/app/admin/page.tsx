import Link from "next/link";
import { redirect } from "next/navigation";
import { NotPermitted } from "@/components/NotPermitted";
import { can, type Capability } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";

const SETTINGS: Array<{
  href: string;
  title: string;
  detail: string;
  capability: Capability;
}> = [
  {
    href: "/app/admin/organisation",
    title: "Organisation",
    detail:
      "What this organisation is called wherever the platform refers to it — the masthead, exports, and the audit manifest.",
    capability: "org.manage",
  },
  {
    href: "/app/admin/people",
    title: "People and access",
    detail:
      "Who may sign in, and as what. Grant a role, confine it to one entity, suspend or reinstate. Every change is audited.",
    capability: "member.manage",
  },
  {
    href: "/app/admin/assistant",
    title: "Assistant",
    detail:
      "Point the platform at a model you control, and choose where it may appear. Off until you configure it.",
    capability: "org.manage",
  },
];

export default async function AdminPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const available = SETTINGS.filter((s) => can(active.membership.grants, s.capability));
  if (available.length === 0) {
    return (
      <NotPermitted
        what="Settings"
        organisationName={active.membership.organisationName}
      />
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          How this organisation is set up. Only what your access lets you change
          is listed.
        </p>
      </header>

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {available.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block px-4 py-3.5 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
            >
              <p className="text-sm font-medium">{s.title}</p>
              <p className="mt-0.5 max-w-prose text-xs text-ink-soft">{s.detail}</p>
            </Link>
          </li>
        ))}
      </ul>

      <p className="max-w-prose text-xs text-ink-soft">
        Assessment templates are configured under their own screen, since
        authoring a question set is closer to governance work than to
        administration.
      </p>
    </main>
  );
}
