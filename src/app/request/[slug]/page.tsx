import type { Metadata } from "next";
import { COMPLAINT_ASKS, FIELD_LIMITS, openIntakeLink, startedToken } from "@/services/dsr-intake";
import { RequestForm } from "./RequestForm";

export const dynamic = "force-dynamic";

/** The title follows the form: a form switched to requests only does not offer complaints. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const form = await openIntakeLink((await params).slug);
  return {
    title: form?.takesComplaints
      ? "Make a request or complaint about your personal data"
      : "Make a request about your personal data",
    robots: { index: false, follow: false },
  };
}

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
            <h1 className="text-2xl font-semibold tracking-tight">
              {form.takesComplaints ? "Make a request or a complaint about your personal data" : "Make a request about your personal data"}
            </h1>
            <p className="max-w-prose text-sm text-ink-soft">
              To {form.controllerName}. Data protection law lets you ask for a copy of the personal data an
              organisation holds about you, have it corrected or deleted, or object to how it is used.
              They must normally respond within one month.
              {form.takesComplaints
                ? " You can also complain to them if you think they have not handled your personal data properly. They must acknowledge a complaint within 30 days, and tell you the outcome."
                : ""}
            </p>
            <p className="max-w-prose text-xs text-ink-soft">
              You do not have to use this form. A request or complaint by email, by post or in person counts just the same.
            </p>
          </header>
          <RequestForm
            slug={slug}
            started={startedToken(slug)}
            controllerName={form.controllerName}
            limits={FIELD_LIMITS}
            complaintSubjects={form.takesComplaints ? COMPLAINT_ASKS : null}
          />
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
