import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { openFindings } from "@/services/ingest";
import { FindingCard } from "./finding-card";

export default async function FindingsPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const rows = await openFindings(active.membership.organisationId, visibleEntityIds(active));
  const canAct = can(active.membership.grants, "risk.manage");

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Scan findings</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Observations pushed in by scanning tools. Nothing here is a risk until
          somebody says it is: the scanner reports what it saw and what it would
          suggest, and a named person decides whether it belongs on the register
          and how serious it is.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Nothing waiting. Findings appear here when a scanner pushes a run.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {rows.map(({ finding }) => (
            <FindingCard
              key={finding.id}
              canAct={canAct}
              finding={{
                id: finding.id,
                title: finding.title,
                detail: finding.detail,
                category: finding.category,
                severity: finding.severity,
                vendor: finding.vendor,
                cookieName: finding.cookieName,
                setBeforeConsent: finding.setBeforeConsent,
                thirdCountry: finding.thirdCountry,
                url: finding.url,
                advisory: finding.advisory,
                scanRef: finding.scanRef,
              }}
            />
          ))}
        </ul>
      )}
    </main>
  );
}
