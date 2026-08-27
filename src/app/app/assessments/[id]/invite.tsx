"use client";

import { useState, useTransition } from "react";
import { inviteAction } from "./actions";

type Link = {
  id: string;
  email: string;
  sectionKey: string | null;
  useCount: number;
  completedAt: string | null;
  revokedAt: string | null;
  expiresAt: string;
};

/**
 * Invite someone who has no account to answer part of this assessment.
 *
 * The link is shown once. It is stored only as a hash, so it cannot be
 * retrieved later — losing it means issuing another, which is the right trade
 * for a credential that reaches a governance record.
 */
export function InviteContributor({
  assessmentId,
  sections,
  existing,
}: {
  assessmentId: string;
  sections: Array<{ key: string; title: string }>;
  existing: Link[];
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
        Contributors
      </h2>
      <p className="max-w-prose text-sm text-ink-soft">
        Send one section to someone who does not have an account. They answer
        their part in the browser; no account is created, and their answers are
        attributed to their email address.
      </p>

      <form
        action={(formData) => {
          startTransition(async () => {
            setUrl(null);
            setError(null);
            const result = await inviteAction(assessmentId, formData);
            if ("url" in result) setUrl(result.url);
            else setError(result.error);
          });
        }}
        className="grid gap-3 rounded border border-line bg-surface p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="someone@example.com"
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">Section</span>
          <select
            name="sectionKey"
            className="rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
          >
            <option value="">Whole assessment</option>
            {sections.map((s) => (
              <option key={s.key} value={s.key}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-line bg-surface px-4 py-2 text-sm disabled:opacity-40 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
        >
          {pending ? "Creating…" : "Create link"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {url ? (
        <div className="space-y-1.5 rounded border border-brand bg-surface p-4">
          <p className="text-sm font-medium">Copy this now — it is not shown again.</p>
          <code className="block break-all rounded bg-ground px-3 py-2 font-mono text-xs">
            {url}
          </code>
        </div>
      ) : null}

      {existing.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {existing.map((l) => (
            <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
              <span>
                {l.email}
                <span className="ml-2 text-ink-soft">
                  {l.sectionKey ? sections.find((s) => s.key === l.sectionKey)?.title : "Whole assessment"}
                </span>
              </span>
              <span className="font-mono text-xs text-ink-soft">
                {l.revokedAt
                  ? `revoked ${l.revokedAt}`
                  : l.completedAt
                    ? `completed ${l.completedAt}`
                    : `expires ${l.expiresAt}`}{" "}
                · opened {l.useCount}×
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
