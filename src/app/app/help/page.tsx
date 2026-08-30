import Link from "next/link";
import type { Metadata } from "next";
import { Chat } from "@/components/assistant/Chat";
import { HelpSearch } from "@/components/help/HelpSearch";
import { HELP_TOPICS } from "@/lib/help/topics";
import { getActiveSession } from "@/lib/session";
import { providerFor } from "@/services/assistant";

export const metadata: Metadata = { title: "Help" };

/**
 * Everything, searchable, in one place.
 *
 * Deliberately not gated on a capability. Help explains what the platform
 * does; withholding it from somebody who cannot yet see a register is how
 * people conclude a tool is impenetrable rather than that their access is
 * narrow.
 */
export default async function HelpPage() {
  const active = await getActiveSession();
  // Absent unless this organisation has configured its own model.
  const configured = active
    ? await providerFor(active.membership.organisationId)
    : null;
  const assistant = configured?.surfaces.includes("help") ?? false;

  const grouped = [
    { heading: "Getting your bearings", ids: ["getting-started", "personas", "roles-and-access", "tasks"] },
    { heading: "Doing the work", ids: ["assessments", "approvals", "contributor-links", "risks", "discussion"] },
    { heading: "The registers", ids: ["ropa", "third-parties", "ai-register", "ai-chain", "transfers", "findings"] },
    { heading: "Seeing where you stand", ids: ["dashboard", "trends", "service-levels", "exports", "audit"] },
    { heading: "Setting it up", ids: ["templates", "integrations", "managing-people", "assistant"] },
  ];

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          How the platform works, and why it behaves as it does. Every screen
          also carries its own short version, folded away at the top.
        </p>
      </header>

      <HelpSearch autoFocus />

      {assistant ? (
        <section className="space-y-2 rounded border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">Ask in your own words</h2>
          <Chat
            surface="help"
            entityId={null}
            contextText=""
            invitation="Answered from the help topics below, and it will name the one it used. It cannot see your records."
            placeholder="Why can't I see the risk register?"
          />
        </section>
      ) : null}

      {grouped.map((group) => (
        <section key={group.heading} className="space-y-2">
          <h2 className="text-sm font-semibold">{group.heading}</h2>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {group.ids.map((id) => {
              const topic = HELP_TOPICS.find((t) => t.id === id);
              if (!topic) return null;
              return (
                <li key={id}>
                  <Link
                    href={`/app/help/${id}`}
                    className="block px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <p className="text-sm font-medium">{topic.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{topic.summary}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
