"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScanProgress } from "@/services/consent-analyser";

/**
 * A scan in progress, asked after every ten seconds while the page is open.
 *
 * Each ask is what moves the scan on: when the analyser is done, the report is
 * fetched and taken in, and the page reloads to show what it found. If the
 * page is closed, the hourly sweep finishes the job.
 */
export function ScanStatus({
  check,
  startedAt,
}: {
  check: () => Promise<ScanProgress>;
  startedAt: string;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<ScanProgress>({ state: "running", step: null });
  // Minutes since the scan started, updated with each ask rather than on render.
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    let stopped = false;
    const ask = async () => {
      try {
        const p = await check();
        if (stopped) return;
        setProgress(p);
        setMinutes(Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60_000)));
        if (p.state !== "running") {
          stopped = true;
          router.refresh();
        }
      } catch {
        // A failed ask is retried on the next tick; the sweep is the backstop.
      }
    };
    ask();
    const timer = setInterval(() => {
      if (!stopped) ask();
    }, 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [check, router, startedAt]);

  if (progress.state === "failed") {
    return (
      <p role="alert" className="rounded border border-amber-700 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
        The scan did not finish: {progress.reason}
      </p>
    );
  }
  if (progress.state === "done") {
    return (
      <p role="status" className="rounded border border-emerald-700 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
        Scan finished: {progress.proposedNew} new and {progress.proposedNotSeen} no longer seen to review,{" "}
        {progress.findings} failing check{progress.findings === 1 ? "" : "s"} added to Findings.
      </p>
    );
  }
  return (
    <p role="status" aria-live="polite" className="rounded border border-line bg-ground px-4 py-2.5 text-sm text-ink-soft">
      Scanning — started {minutes === 0 ? "just now" : `${minutes} minute${minutes === 1 ? "" : "s"} ago`}. Scans usually take one to
      five minutes{progress.step ? `; now: ${progress.step}` : ""}. You can leave this page: if you do, the report is taken in within the hour.
    </p>
  );
}
