import { redirect } from "next/navigation";
import { Mark } from "@/components/Wordmark";
import { authConfig, signIn } from "@/auth";
import { getActiveSession } from "@/lib/session";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getActiveSession()) redirect("/app");
  const { error } = await searchParams;
  // Auth.js reports a thrown callback as "Configuration". Here that means the
  // membership lookup failed rather than refused — usually the database being
  // unreachable — and saying "your account lacks access" would be wrong.
  const isFault = error === "Configuration";

  const providers = authConfig.providers.map((p) => {
    const cfg = typeof p === "function" ? p() : p;
    return { id: cfg.id as string, name: cfg.name as string, type: cfg.type as string };
  });
  const sso = providers.filter((p) => p.type !== "credentials");
  const dev = providers.find((p) => p.type === "credentials");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6">
      <header className="space-y-3">
        <Mark className="h-12 w-12 text-navy" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Waivern <span className="font-normal text-ink-soft">Govern</span>
          </h1>
          <p className="text-sm text-ink-soft">Privacy and AI governance workflow</p>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="space-y-1 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {isFault ? (
            <>
              <strong className="block">Sign-in is not working right now.</strong>
              This is a fault on our side, not a problem with your account —
              whether you have access was never established. An administrator
              should check the server log; the cause is recorded there.
            </>
          ) : (
            <>
              <strong className="block">That account cannot sign in.</strong>
              Access is granted per email address, and the one your identity
              provider just presented is not registered here. The usual cause is
              signing in with a different account from the one that was granted
              — check which account you used. If it is the right one, ask an
              administrator to add it.
            </>
          )}
        </p>
      ) : null}

      {sso.length > 0 ? (
        <div className="flex flex-col gap-2">
          {sso.map((p) => (
            <form
              key={p.id}
              action={async () => {
                "use server";
                await signIn(p.id, { redirectTo: "/app" });
              }}
            >
              <button
                type="submit"
                className="w-full rounded border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                Continue with {p.name}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-soft">
          No identity provider is configured yet. Set the Entra ID or Google
          credentials in the environment to enable single sign-on.
        </p>
      )}

      {dev ? (
        <form
          action={async (formData: FormData) => {
            "use server";
            await signIn("credentials", {
              email: String(formData.get("email") ?? ""),
              redirectTo: "/app",
            });
          }}
          className="space-y-2 rounded border border-dashed border-line p-4"
        >
          <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
            Development sign-in
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            defaultValue="dpo@example.bbc.co.uk"
            className="w-full rounded border border-line bg-surface px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-brand"
          />
          <button
            type="submit"
            className="w-full rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Sign in
          </button>
          <p className="text-xs text-ink-soft">
            Local only. Any seeded user, no password.
          </p>
        </form>
      ) : null}
    </main>
  );
}
