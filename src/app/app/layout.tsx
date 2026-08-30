import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";
import { getActiveSession } from "@/lib/session";

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
            {active ? (
              <span className="font-mono text-[11px] text-white/70">
                {active.membership.organisationName}
              </span>
            ) : null}
            {/* Always present, always in the same place. Help that moves, or
                that only appears when something has gone wrong, is help
                nobody learns to reach for. */}
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
