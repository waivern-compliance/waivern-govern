import Link from "next/link";
import { redirect } from "next/navigation";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import {
  ADEQUACY_WORDS,
  RISK_WORDS,
  type AdequacyStatus,
  type RiskLevel,
} from "@/lib/countries/labels";
import { libraryFor, libraryHealth } from "@/services/countries";
import { ReviewForm } from "./review-form";

const ADEQUACY_TONE: Record<AdequacyStatus, string> = {
  adequate: "border-emerald-700 bg-emerald-50 text-emerald-900",
  partial: "border-amber-700 bg-amber-50 text-amber-900",
  not_adequate: "border-line bg-surface-2 text-ink-soft",
  under_review: "border-amber-700 bg-amber-50 text-amber-900",
};

export default async function CountriesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The country library"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const { filter } = await searchParams;
  const org = active.membership.organisationId;
  const [library, health] = await Promise.all([libraryFor(org), libraryHealth(org)]);
  const mayReview = can(active.membership.grants, "template.author");

  const shown =
    filter === "stale" ? library.filter((c) => c.stale)
    : filter === "safeguards" ? library.filter((c) => c.ukAdequacy !== "adequate")
    : library;

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Country library</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          What is known about transferring personal data to each destination, and
          when somebody last checked. Transfer assessments read from this, so an
          entry nobody has looked at in a year makes every assessment citing it
          weaker than it appears.
        </p>
      </header>

      {health.unverified > 0 ? (
        <div className="rounded border-l-2 border-red-700 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-950">
            <strong>
              {health.unverified} of {health.total} entries have never been checked by a person.
            </strong>{" "}
            They were loaded as a starting point, not verified against a current
            source. Adequacy status is a matter of public record and should be
            confirmed; the two risk judgements are deliberately left open,
            because a rating nobody can source would read as evidence in a
            transfer assessment and would not be.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 text-sm">
        <Filter href="/app/countries" label={`All ${health.total}`} active={!filter} />
        <Filter
          href="/app/countries?filter=stale"
          label={`Due for review ${health.stale}`}
          active={filter === "stale"}
        />
        <Filter
          href="/app/countries?filter=safeguards"
          label="Need an Article 46 route"
          active={filter === "safeguards"}
        />
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {shown.map((c) => (
          <li key={c.code} className="space-y-2.5 px-4 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="flex items-baseline gap-3">
                <span className="font-mono text-xs text-ink-soft">{c.code}</span>
                <span className="font-medium">{c.name}</span>
                {c.isOverride ? (
                  <span className="rounded border border-brand px-2 py-0.5 font-mono text-[11px] text-brand">
                    your analysis
                  </span>
                ) : null}
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                <Badge tone={ADEQUACY_TONE[c.ukAdequacy as AdequacyStatus]}>
                  UK: {ADEQUACY_WORDS[c.ukAdequacy as AdequacyStatus]}
                </Badge>
                <Badge tone={ADEQUACY_TONE[c.euAdequacy as AdequacyStatus]}>
                  EU: {ADEQUACY_WORDS[c.euAdequacy as AdequacyStatus]}
                </Badge>
              </span>
            </div>

            {c.ukAdequacyNote ? (
              <p className="text-xs text-ink-soft">{c.ukAdequacyNote}</p>
            ) : null}
            {c.summary ? <p className="text-sm text-ink-soft">{c.summary}</p> : null}

            <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-soft">
              <span>access: {RISK_WORDS[c.governmentAccess as RiskLevel]}</span>
              <span>redress: {RISK_WORDS[c.redress as RiskLevel]}</span>
              <span className={c.stale ? "text-red-800" : ""}>
                {c.unverified
                  ? "never checked by a person"
                  : `checked ${c.reviewedAt.toISOString().slice(0, 10)} by ${c.reviewedBy}`}
              </span>
              {c.stale && !c.unverified ? (
                <span className="text-red-800">review overdue</span>
              ) : null}
            </p>

            {mayReview ? (
              <ReviewForm
                code={c.code}
                current={{
                  ukAdequacy: c.ukAdequacy,
                  euAdequacy: c.euAdequacy,
                  governmentAccess: c.governmentAccess,
                  redress: c.redress,
                }}
              />
            ) : null}
          </li>
        ))}
        {shown.length === 0 ? (
          <li className="px-4 py-6 text-sm text-ink-soft">Nothing matches that filter.</li>
        ) : null}
      </ul>
    </main>
  );
}

function Filter({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded border px-3 py-1.5 focus-visible:outline-2 focus-visible:outline-brand ${
        active ? "border-brand bg-brand text-white" : "border-line bg-surface hover:border-brand"
      }`}
    >
      {label}
    </Link>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`rounded border px-2 py-0.5 font-mono text-[11px] ${tone}`}>{children}</span>
  );
}
