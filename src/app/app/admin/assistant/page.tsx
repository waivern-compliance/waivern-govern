import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { RETAIN_DAYS, providerSummary } from "@/services/assistant";
import { ProviderForm } from "./ProviderForm";
import { removeProviderAction } from "../actions";

export default async function AssistantAdminPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "org.manage")) {
    return (
      <NotPermitted
        what="Configuring the assistant"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const existing = await providerSummary(active.membership.organisationId);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Point the platform at a model you control. There is no default
          endpoint: until this is configured and a surface is switched on,
          nobody sees an assistant anywhere.
        </p>
      </header>

      <HelpLink topic="assistant" />

      <section className="space-y-2 rounded border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">What it may and may not do</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          It drafts, explains and finds. It does not rate a risk, decide whether
          a DPIA is required, approve anything, state that a country is
          adequate, or confirm that a supplier is a processor. Those are
          decisions a named person makes and attests to, and the platform does
          not offer to have them made for you.
        </p>
        <p className="max-w-prose text-sm text-ink-soft">
          Answers are proposals. Nothing reaches a record until somebody writes
          it themselves, and that act is what the audit log attributes to them.
          Obvious identifiers are stripped from a question before it is sent and
          the person is told what was removed — a partial control, and described
          as one. Conversations are kept for {RETAIN_DAYS} days and then deleted.
        </p>
      </section>

      <ProviderForm existing={existing} />

      {existing ? (
        <form action={removeProviderAction} className="border-t border-line pt-6">
          <button
            type="submit"
            className="rounded border border-line px-4 py-2 text-sm hover:border-red-700 hover:text-red-900 focus-visible:outline-2 focus-visible:outline-brand"
          >
            Remove this configuration
          </button>
          <p className="mt-1.5 max-w-prose text-xs text-ink-soft">
            Deletes the endpoint and the stored key. Conversations already held
            are removed on their own schedule.
          </p>
        </form>
      ) : null}
    </main>
  );
}
