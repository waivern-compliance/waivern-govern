import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Mark } from "@/components/Wordmark";
import { requestsOpen } from "@/lib/platform";
import { PRODUCT_SUFFIX, PRODUCT_VENDOR } from "@/lib/product";
import { getActiveSession } from "@/lib/session";
import { requestsBy } from "@/services/organisation-requests";
import { RequestForm } from "./RequestForm";
import { signOutAction } from "./actions";

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Where somebody signed in, but a member of no organisation, lands.
 *
 * They can ask Waivern for an organisation and see where that request has
 * got to — and nothing else. The moment one is approved they are its owner,
 * and the next page they open is its home.
 */
export default async function Welcome() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  if (await getActiveSession()) redirect("/app");

  const [latest] = requestsOpen() ? await requestsBy(session.user.id) : [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6 py-12">
      <header className="space-y-3">
        <Mark className="h-12 w-12 text-navy" />
        <h1 className="text-2xl font-semibold tracking-tight">
          {PRODUCT_VENDOR} <span className="font-normal text-ink-soft">{PRODUCT_SUFFIX}</span>
        </h1>
        <p className="text-sm text-ink-soft">
          Signed in as <span className="font-mono text-ink">{session.user.email}</span>, which is not a
          member of any organisation here yet.
        </p>
      </header>

      {!requestsOpen() ? (
        <p className="text-sm">
          Ask your organisation&rsquo;s administrator to invite this address. If you signed in with the
          wrong account, sign out and use the one you were invited with.
        </p>
      ) : latest?.status === "pending" ? (
        <section className="space-y-1 rounded border border-amber-700 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Waiting for approval</p>
          <p>
            You asked for <strong>{latest.organisationName}</strong> on {day(latest.createdAt)}. Waivern
            sets each organisation up by hand; once it is approved you will be its owner, and signing in
            will take you straight there.
          </p>
        </section>
      ) : (
        <>
          {latest?.status === "declined" ? (
            <section className="space-y-1 rounded border border-line bg-surface p-5 text-sm">
              <p className="font-semibold">Your request for {latest.organisationName} was not approved</p>
              {latest.decisionNote ? <p className="text-ink-soft">{latest.decisionNote}</p> : null}
              <p className="text-ink-soft">You can ask again below.</p>
            </section>
          ) : latest?.status === "approved" ? (
            <section className="space-y-1 rounded border border-line bg-surface p-5 text-sm">
              <p>
                {latest.organisationName} was set up, but you are no longer a member of it. Ask its
                owner to restore your access, or ask for a new organisation below.
              </p>
            </section>
          ) : (
            <p className="text-sm">
              If your organisation already uses {PRODUCT_VENDOR} {PRODUCT_SUFFIX}, ask its administrator to
              invite you. To start a new one, tell us who it is for.
            </p>
          )}
          <RequestForm />
        </>
      )}

      <div className="flex items-center gap-4 text-sm">
        <form action={signOutAction}>
          <button type="submit" className="rounded border border-line px-3 py-1.5 hover:border-brand">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
