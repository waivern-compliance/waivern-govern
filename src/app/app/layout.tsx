import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { isPlatformAdmin } from "@/lib/platform";
import { switchOrganisationAction } from "./actions";

/**
 * The masthead every signed-in page carries.
 *
 * Here rather than in each page, so the brand cannot be present on fourteen
 * screens and missing on the fifteenth. It states three things and stops:
 * whose product this is, which organisation you are looking at, and a way
 * back. Navigation stays on the home page, where it is chosen by capability.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const active = await getActiveSession();
  // Shown to whoever can actually change something. Administration belongs
  // where it is always reachable, not below a task list.
  const mayAdminister =
    active !== null &&
    (can(active.membership.grants, "member.manage") ||
      can(active.membership.grants, "org.manage"));

  return (
    <>
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-3">
          <Link
            href="/app"
            className="rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <Wordmark />
          </Link>
          <div className="flex items-center gap-5">
            {active && active.organisations.length > 1 ? (
              // Waivern staff and anyone else in several organisations choose
              // which one they are working in. A plain form, so it works before
              // the page has finished loading.
              <form action={switchOrganisationAction} className="flex items-center gap-1.5">
                <label htmlFor="organisation-switcher" className="sr-only">
                  Organisation
                </label>
                <select
                  id="organisation-switcher"
                  name="organisationId"
                  defaultValue={active.membership.organisationId}
                  className="rounded border border-white/25 bg-navy px-2 py-1 font-mono text-[11px] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  {active.organisations.map((o) => (
                    <option key={o.organisationId} value={o.organisationId}>
                      {o.organisationName}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded border border-white/25 px-2 py-1 text-[11px] text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Switch
                </button>
              </form>
            ) : active ? (
              <span className="font-mono text-[11px] text-white/70">
                {active.membership.organisationName}
              </span>
            ) : null}
            {/* Always present, always in the same place. Help that moves, or
                that only appears when something has gone wrong, is help
                nobody learns to reach for. */}
            {mayAdminister ? (
              <Link
                href="/app/admin"
                className="rounded border border-white/25 px-2.5 py-1 text-xs text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Settings
              </Link>
            ) : null}
            {active && isPlatformAdmin(active.email) ? (
              <Link
                href="/platform"
                className="rounded border border-white/25 px-2.5 py-1 text-xs text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Platform
              </Link>
            ) : null}
            <Link
              href="/app/help"
              className="rounded border border-white/25 px-2.5 py-1 text-xs text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Help
            </Link>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
