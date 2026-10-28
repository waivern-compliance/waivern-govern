import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { Wordmark } from "@/components/Wordmark";
import { isPlatformAdmin } from "@/lib/platform";
import { requestQueue } from "@/services/organisation-requests";
import { Decision } from "./Decision";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * Waivern's operators: requests for new organisations.
 *
 * Outside any organisation, because a request belongs to none. Shown only to
 * the people named in PLATFORM_ADMINS; everyone else gets a 404.
 */
export default async function Platform() {
  const session = await auth();
  if (!session?.user?.email) redirect("/sign-in");
  if (!isPlatformAdmin(session.user.email)) notFound();

  const { pending, decided } = await requestQueue();

  return (
    <>
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-3">
          <Link href="/app" className="rounded focus-visible:outline-2 focus-visible:outline-white">
            <Wordmark />
          </Link>
          <span className="font-mono text-[11px] text-white/70">Waivern platform</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
        <header className="space-y-1 border-b border-line pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Requests for new organisations</h1>
          <p className="max-w-prose text-sm text-ink-soft">
            Approving sets the organisation up straight away: its first legal entity, the person who
            asked as its owner, and the shipped templates, workflows and service levels.
          </p>
          <p className="max-w-prose text-sm text-ink-soft">
            Only new organisations come here. Further legal entities within an existing one are its
            owners&rsquo; to add, from its Organisation settings.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Waiting ({pending.length})
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing waiting.</p>
          ) : (
            <ul className="divide-y divide-line rounded border border-line bg-surface">
              {pending.map((r) => (
                <li key={r.id} className="space-y-2 px-4 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{r.organisationName}</span>
                    <span className="font-mono text-[11px] text-ink-soft">{day(r.createdAt)}</span>
                  </div>
                  <p className="text-xs text-ink-soft">
                    {r.requestedByEmail}
                    {r.entityName !== r.organisationName ? ` · legal entity: ${r.entityName}` : ""}
                  </p>
                  {r.note ? <p className="whitespace-pre-line text-sm">{r.note}</p> : null}
                  <Decision requestId={r.id} organisationName={r.organisationName} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {decided.length > 0 ? (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Decided lately</h2>
            <ul className="divide-y divide-line rounded border border-line bg-surface">
              {decided.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                  <span>
                    {r.organisationName}{" "}
                    <span className="text-ink-soft">· {r.requestedByEmail}</span>
                  </span>
                  <span className="font-mono text-[11px] text-ink-soft">
                    {r.status} by {r.decidedByEmail} {day(r.decidedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}
