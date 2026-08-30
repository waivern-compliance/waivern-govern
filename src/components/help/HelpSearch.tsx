"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { searchHelp } from "@/lib/help/search";
import { HELP_TOPICS } from "@/lib/help/topics";

/**
 * Search that runs as you type.
 *
 * The whole corpus is a few pages of prose, so it ships to the browser and is
 * searched there. A round trip per keystroke would be slower and would fail
 * exactly when somebody is stuck, which is the moment help has to work.
 */
export function HelpSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchHelp(HELP_TOPICS, query), [query]);
  const asked = query.trim().length > 1;
  const partial = hits.length > 0 && hits[0].matched < hits[0].typed;

  return (
    <div className="space-y-4">
      <label className="block space-y-1">
        <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
          Search the help
        </span>
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try: accept a risk, article 30, why can't I see this"
          className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
        />
      </label>

      {asked ? (
        hits.length > 0 ? (
          <div className="space-y-2">
            {partial ? (
              <p className="text-xs text-ink-soft">
                Nothing matched all of that. These match part of it.
              </p>
            ) : null}
            <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
              {hits.map(({ topic }) => (
                <li key={topic.id}>
                  <Link
                    href={`/app/help/${topic.id}`}
                    className="block px-4 py-3 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    <p className="text-sm font-medium">{topic.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{topic.summary}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="rounded border border-dashed border-line px-4 py-5 text-sm text-ink-soft">
            Nothing on that. Try a word from the screen you are looking at, or
            browse the list below — the help is short enough to skim.
          </p>
        )
      ) : null}
    </div>
  );
}
