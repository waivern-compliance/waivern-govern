import { AssessmentForm } from "@/components/AssessmentForm";
import { legalRefMap } from "@/lib/legal-refs";
import { loadAssessment } from "@/services/assessments";
import { redeemContributorLink } from "@/services/contributor-links";
import { contributorFinishAction, contributorSaveAction } from "./actions";

/**
 * The no-account route.
 *
 * Nothing here reads a session. Access comes entirely from the token in the
 * URL, resolved server-side on every request, and the page renders only the
 * section that token covers.
 */
export default async function ContributePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const redeemed = await redeemContributorLink(token);

  if (!redeemed.ok) {
    // Deliberately one message for every failure. Telling an anonymous visitor
    // that a token exists but expired confirms the token was real.
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
        <p className="text-sm text-ink-soft">
          It may have expired, been withdrawn, or the assessment may already have
          been submitted. Ask whoever sent it to you for a new one.
        </p>
      </Shell>
    );
  }

  const loaded = await loadAssessment(
    redeemed.link.assessmentId,
    redeemed.link.organisationId,
  );
  if (!loaded) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
      </Shell>
    );
  }

  const refs = await legalRefMap();
  const section = redeemed.link.sectionKey
    ? loaded.definition.schema.sections.find((s) => s.key === redeemed.link.sectionKey)
    : null;

  return (
    <Shell>
      <header className="space-y-2 border-b border-line pb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          {loaded.templateName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{loaded.assessment.title}</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          You have been asked to complete{" "}
          {section ? <strong>{section.title}</strong> : "this assessment"}. Your
          answers are recorded against <span className="font-mono">{redeemed.link.email}</span>.
          You do not need an account, and you can come back to this link until it
          expires.
        </p>
      </header>

      <AssessmentForm
        definition={loaded.definition}
        initialAnswers={loaded.answers}
        onlySection={redeemed.link.sectionKey}
        legalRefs={refs}
        onSave={contributorSaveAction.bind(null, token)}
        onFinish={contributorFinishAction.bind(null, token)}
        finishLabel="I've finished my part"
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">{children}</main>;
}
