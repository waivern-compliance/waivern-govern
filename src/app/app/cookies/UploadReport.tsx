"use client";

import { useActionState, useState } from "react";
import type { RequestResult } from "../requests/actions";

/**
 * Upload a Consent Analyser report.
 *
 * The file is read here and its screenshots dropped before it is sent: they
 * are most of a report's size and Govern does not keep them, so sending them
 * would only push large reports past the upload limit.
 */
export function UploadReport({
  action,
}: {
  action: (prev: RequestResult, formData: FormData) => Promise<RequestResult>;
}) {
  const [result, run, pending] = useActionState<RequestResult, FormData>(action, null);
  const [report, setReport] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  async function read(file: File | undefined) {
    setReport("");
    setProblem(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed && typeof parsed === "object") delete parsed.screenshots;
      const body = JSON.stringify(parsed);
      if (body.length > 10_000_000) {
        setProblem("That report is too large, even without its screenshots.");
        return;
      }
      setReport(body);
    } catch {
      setProblem("That file is not valid JSON. Download the report as JSON from the analyser and try again.");
    }
  }

  return (
    <form action={run} className="space-y-3">
      <input
        type="file"
        accept="application/json,.json"
        onChange={(e) => read(e.target.files?.[0])}
        className="block text-sm"
        aria-label="Consent Analyser report (JSON)"
      />
      <input type="hidden" name="report" value={report} />
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="acceptOtherSite" className="mt-1 accent-brand" />
        <span>The report is for a different address, but it belongs to this website (a redirect, or a staging copy)</span>
      </label>
      {problem ? (
        <p role="alert" className="rounded border border-amber-700 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">{problem}</p>
      ) : null}
      {result ? (
        <p
          role="alert"
          className={`rounded border px-4 py-2.5 text-sm ${
            result.ok ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-amber-700 bg-amber-50 text-amber-900"
          }`}
        >
          {result.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || !report}
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Reading the report…" : "Upload the report"}
      </button>
    </form>
  );
}
