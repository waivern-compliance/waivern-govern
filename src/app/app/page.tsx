import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import {
  AiHome,
  EngineeringHome,
  PrivacyHome,
  ProductHome,
  QuickLinks,
} from "@/components/home/homes";
import { PersonaSwitcher } from "@/components/home/PersonaSwitcher";
import { PERSONA_LABEL } from "@/lib/persona";
import { getActiveSession } from "@/lib/session";

/**
 * One home, four arrangements.
 *
 * Which one somebody lands on is decided by their persona, which changes what
 * is shown first and in whose words — never what they may reach. Every link
 * here comes from a capability check, and every page behind one checks again.
 */
export default async function Home() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const { persona } = active;
  // No first name here. The name field holds whatever an administrator typed —
  // often a job title — and "Here is what needs you, Engineering" is worse than
  // no greeting at all. Their name is already in the heading above.
  const greeting =
    persona === "product" || persona === "engineering"
      ? "Here is what needs you."
      : PERSONA_LABEL[persona];

  return (
    <main className="mx-auto max-w-4xl space-y-10 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
            {active.membership.organisationName}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {active.name ?? active.email}
          </h1>
          <p className="mt-0.5 text-sm text-ink-soft">{greeting}</p>
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

      {persona === "privacy_governance" ? <PrivacyHome active={active} /> : null}
      {persona === "ai_governance" ? <AiHome active={active} /> : null}
      {persona === "engineering" ? <EngineeringHome active={active} /> : null}
      {persona === "product" ? <ProductHome active={active} /> : null}

      {persona === "engineering" || persona === "product" ? (
        <QuickLinks active={active} />
      ) : null}

      <PersonaSwitcher current={persona} />
    </main>
  );
}
