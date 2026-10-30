import Link from "next/link";
import type { consentScans } from "@/db/schema";
import type { ScanSummary } from "@/lib/pecr/analyser-report";
import { stamp } from "../requests/fields";

type Scan = typeof consentScans.$inferSelect;

/** Where a scan ran from, as a person would say it. */
export function whereFrom(region: string | null): string | null {
  if (!region) return null;
  const known: Record<string, string> = { uk: "the UK", eu: "the EU", us: "the US" };
  return known[region.toLowerCase()] ?? region;
}

/** The summary saved with a scan. Scans taken in before checks were counted have only part of it. */
function summaryOf(scan: Scan): Partial<ScanSummary> {
  return scan.summary as Partial<ScanSummary>;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** One sentence on how the checks came out, worst first. */
export function verdict(summary: Partial<ScanSummary>): { text: string; tone: "bad" | "warn" | "good" } {
  const c = summary.checks;
  const failed = c?.failed ?? summary.failCount ?? 0;
  if (failed > 0) return { text: `${plural(failed, "check")} failed`, tone: "bad" };
  if (c && c.manual > 0) return { text: `Nothing failed; ${plural(c.manual, "check")} to do by hand`, tone: "warn" };
  if (c || summary.overall === "PASS") return { text: "Every check passed", tone: "good" };
  // Saved before checks were counted: the analyser's own word is all there is.
  if (summary.overall === "PARTIAL") return { text: "Nothing failed; some checks to do by hand", tone: "warn" };
  if (summary.overall === "FAIL") return { text: "Some checks failed", tone: "bad" };
  return { text: "No result recorded", tone: "warn" };
}

const TONE = {
  bad: "border-red-800 bg-red-50 text-red-900",
  warn: "border-amber-700 bg-amber-50 text-amber-900",
  good: "border-emerald-700 bg-emerald-50 text-emerald-900",
};

function Stat({ n, label, hint, alert }: { n: number; label: string; hint: string; alert?: boolean }) {
  return (
    <div className="rounded border border-line bg-ground px-3 py-2.5">
      <div className={`text-xl font-semibold ${alert ? "text-red-800" : ""}`}>{n}</div>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[11px] text-ink-soft">{hint}</div>
    </div>
  );
}

/**
 * The latest finished scan, in plain words: when and where it ran, what it
 * saw, and which of its checks need somebody.
 */
export function LatestScan({ scan, children }: { scan: Scan | null; children?: React.ReactNode }) {
  if (!scan) {
    return (
      <section className="space-y-3 rounded border border-line bg-surface p-5" aria-label="Latest scan">
        <h2 className="text-sm font-semibold">Latest scan</h2>
        <p className="text-sm text-ink-soft">Not scanned yet. Scan it now, or upload a Consent Analyser report further down.</p>
        {children}
      </section>
    );
  }
  const summary = summaryOf(scan);
  const v = verdict(summary);
  const c = summary.checks;
  const failed = c?.toLookAt.filter((t) => t.result !== "MANUAL") ?? [];
  const manual = c?.toLookAt.filter((t) => t.result === "MANUAL") ?? [];
  const from = whereFrom(scan.region);
  const fullReport = scan.analyserUrl && scan.analyserRunId ? `${scan.analyserUrl}/runs/${encodeURIComponent(scan.analyserRunId)}` : null;

  return (
    <section className="space-y-4 rounded border border-line bg-surface p-5" aria-label="Latest scan">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Latest scan</h2>
        <p className="text-xs text-ink-soft">
          {stamp(scan.completedAt ?? scan.startedAt)}
          {from ? `, scanned from ${from}` : ""} · {scan.source === "upload" ? "report uploaded" : "run from here"} by {scan.startedByLabel}
          {summary.cmp ? ` · consent banner: ${summary.cmp}` : " · no consent banner recognised"}
        </p>
      </div>

      <p className={`rounded border px-4 py-2.5 text-sm font-medium ${TONE[v.tone]}`}>{v.text}</p>

      {summary.seen ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <Stat n={summary.seen.total} label="Items seen" hint="Cookies and stored items, in every phase" />
          <Stat n={summary.seen.beforeConsent} label="Before any choice" hint="Set before Accept or Reject; only strictly necessary should be" alert={summary.seen.beforeConsent > 0} />
          <Stat n={summary.seen.afterReject} label="Still there after Reject" hint="Fine if strictly necessary; anything else should be gone" />
          <Stat n={summary.seen.thirdParty} label="Third party" hint="Set by a domain other than the site's" />
        </div>
      ) : (
        <p className="text-sm">{plural(scan.observed, "item")} seen.</p>
      )}

      {c ? (
        <p className="text-xs text-ink-soft">
          Of the analyser&apos;s checks: {c.passed} passed, {c.failed} failed, {c.manual} to check by hand, {c.info} for information only.
          {summary.overall ? ` The analyser's own overall result is ${summary.overall}${summary.overall === "PARTIAL" ? ": nothing failed outright, but not everything could be confirmed automatically" : ""}.` : ""}
        </p>
      ) : null}

      {failed.length > 0 ? (
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-red-900">Failed</h3>
          <ul className="space-y-2">
            {failed.map((t) => (
              <li key={t.itemId} className="text-sm">
                <span className="font-mono text-xs text-ink-soft">{t.itemId}</span> {t.description}
                {t.notes ? <span className="block text-xs text-ink-soft">{t.notes}</span> : null}
                {t.recommendation ? <span className="block text-xs">What to do: {t.recommendation}</span> : null}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-soft">
            Each is also in <Link href="/app/findings" className="underline hover:text-brand">Findings</Link>, where it can be tracked to a fix.
          </p>
        </div>
      ) : null}

      {manual.length > 0 ? (
        <details className="space-y-1.5">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-amber-900">
            To check by hand ({manual.length})
          </summary>
          <p className="pt-1 text-xs text-ink-soft">The analyser could not decide these from the browser alone. Look at them on the live site.</p>
          <ul className="space-y-2 pt-1">
            {manual.map((t) => (
              <li key={t.itemId} className="text-sm">
                <span className="font-mono text-xs text-ink-soft">{t.itemId}</span> {t.description}
                {t.notes ? <span className="block text-xs text-ink-soft">{t.notes}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
        <p className="text-xs text-ink-soft">
          Run <span className="font-mono">{scan.analyserRunId ?? "with no id"}</span>
          {fullReport ? (
            <>
              {" · "}
              <a href={fullReport} target="_blank" rel="noreferrer" className="underline hover:text-brand">
                Full report on the analyser
              </a>{" "}
              (signed in as the token&apos;s owner, while the analyser still keeps the run)
            </>
          ) : null}
        </p>
        {children}
      </div>
    </section>
  );
}

/** Every scan, newest first, one readable line each. */
export function ScanHistory({ scans }: { scans: Scan[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">All scans ({scans.length})</h2>
      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface text-xs">
        {scans.map((s) => {
          const summary = summaryOf(s);
          const from = whereFrom(s.region);
          const line =
            s.status === "running"
              ? "Running."
              : s.status === "failed"
                ? `Did not finish: ${s.failure ?? "the scan failed."}`
                : `${plural(summary.seen?.total ?? s.observed, "item")} seen · ${verdict(summary).text.toLowerCase()}`;
          return (
            <li key={s.id} className="space-y-0.5 px-4 py-2">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{stamp(s.completedAt ?? s.startedAt)}</span>
                <span className="font-mono text-ink-soft">{s.analyserRunId ?? "no run id"}</span>
              </div>
              <div className={s.status === "failed" ? "text-red-900" : "text-ink-soft"}>
                {s.source === "upload" ? "Report uploaded" : "Run from here"} by {s.startedByLabel}
                {from ? `, from ${from}` : ""}. {line}
              </div>
            </li>
          );
        })}
        {scans.length === 0 ? <li className="px-4 py-3 text-ink-soft">None yet.</li> : null}
      </ul>
    </section>
  );
}
