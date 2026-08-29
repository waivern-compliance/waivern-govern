import Link from "next/link";

/**
 * Shown when somebody reaches a page their grants do not cover.
 *
 * Names what is missing and where to go instead. "Access denied" with no route
 * onward turns a permissions boundary into a dead end, and the person's next
 * move is to ring whoever administers the platform.
 */
export function NotPermitted({
  what,
  organisationName,
}: {
  what: string;
  organisationName: string;
}) {
  return (
    <main className="mx-auto max-w-xl space-y-5 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Not part of your access</h1>
      <p className="text-ink-soft">
        {what} is not something your account can see in {organisationName}. That
        is a matter of what you have been granted, not a fault — ask whoever
        administers the platform if you need it.
      </p>
      <p>
        <Link
          href="/app"
          className="text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand"
        >
          ← Back to what you can do
        </Link>
      </p>
    </main>
  );
}
