import type { Metadata } from "next";
import { FIELD_LIMITS, openIntakeLink, startedToken } from "@/services/dsr-intake";
import { RequestForm } from "./RequestForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Make a request about your personal data",
  robots: { index: false, follow: false },
};

/**
 * The public request form.
 *
 * No session is read and nothing about any request is shown: the address
 * opens the form for one entity, and that is all it does.
 */
export default async function RequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await openIntakeLink(slug);

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      {form ? (
        <>
          <header className="space-y-3 border-b border-line pb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Make a request about your personal data</h1>
            <p className="max-w-prose text-sm text-ink-soft">
              To {form.controllerName}. Data protection law lets you ask for a copy of the personal data an
              organisation holds about you, have it corrected or deleted, or object to how it is used.
              They must normally respond within one month.
            </p>
            <p className="max-w-prose text-xs text-ink-soft">
              You do not have to use this form. A request by email, by post or in person counts just the same.
            </p>
          </header>
          <RequestForm slug={slug} started={startedToken(slug)} controllerName={form.controllerName} limits={FIELD_LIMITS} />
        </>
      ) : (
        <section className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">This form is not taking requests</h1>
          <p className="max-w-prose text-sm text-ink-soft">
            The address may be out of date. You can still make a request to the organisation by email, by
            post or in person, and it counts just the same.
          </p>
        </section>
      )}
    </main>
  );
}
