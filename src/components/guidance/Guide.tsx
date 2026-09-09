"use client";

import Link from "next/link";
import { useTransition } from "react";
import { setGuidanceAction } from "@/app/app/actions";
import { STAGE_BLURB, STAGE_LABEL, type Stage } from "@/lib/guidance/steps";
import type { Guidance } from "@/services/guidance";

/**
 * A guide for somebody who has not done this before.
 *
 * Two things make it worth having rather than a page of documentation. It is
 * ordered — each step assumes the one above it, which is the part a newcomer
 * cannot work out for themselves. And it is measured against the registers, so
 * "done" means something exists, not that somebody ticked a box.
 *
 * It explains and never decides. Every step ends at a screen where a named
 * person makes the judgement; nothing here says whether a basis is lawful or
 * whether a DPIA is required for you.
 */
export function Guide({ guidance }: { guidance: Guidance }) {
  const [pending, startTransition] = useTransition();
  const set = (mode: "off" | Stage) => () => startTransition(async () => { await setGuidanceAction(mode); });

  if (guidance.mode === "off") {
    return (
      <form action={set(guidance.stage)}>
        <button
          type="submit"
          disabled={pending}
          className="text-xs text-ink-soft underline hover:text-brand disabled:opacity-60"
        >
          Show the step-by-step guide
        </button>
      </form>
    );
  }

  const done = guidance.steps.length - guidance.remaining;
  const next = guidance.steps.find((s) => !s.done);

  return (
    <section className="space-y-4 rounded border border-brand/40 bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{STAGE_LABEL[guidance.stage]}</h2>
          <p className="mt-0.5 max-w-prose text-xs text-ink-soft">{STAGE_BLURB[guidance.stage]}</p>
        </div>
        <p className="font-mono text-[11px] text-ink-soft">
          {done} of {guidance.steps.length} done
        </p>
      </div>

      <ol className="divide-y divide-line overflow-hidden rounded border border-line bg-ground">
        {guidance.steps.map((step, index) => (
          <li key={step.id}>
            <details open={step.id === next?.id} className="group">
              <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
                <span
                  aria-hidden
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                    step.done
                      ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                      : "border-line text-ink-soft"
                  }`}
                >
                  {step.done ? "✓" : index + 1}
                </span>
                <span className="flex-1 text-sm font-medium">
                  {step.title}
                  <span className="sr-only">{step.done ? " — done" : " — not done yet"}</span>
                </span>
                <span className="font-mono text-[11px] text-ink-soft">{step.measure}</span>
              </summary>

              <div className="space-y-2.5 border-t border-line px-4 py-3 pl-12">
                <p className="max-w-prose text-sm">{step.what}</p>
                <p className="max-w-prose text-xs text-ink-soft">
                  <span className="font-medium text-ink">Why it matters. </span>
                  {step.why}
                </p>
                <p className="max-w-prose text-xs text-ink-soft">
                  <span className="font-medium text-ink">You are finished when. </span>
                  {step.finishedWhen}
                </p>
                {step.watchOut ? (
                  <p className="max-w-prose rounded border border-amber-700/50 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <span className="font-medium">Watch out. </span>
                    {step.watchOut}
                  </p>
                ) : null}
                <Link
                  href={step.href}
                  className="inline-block rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                >
                  Go there
                </Link>
              </div>
            </details>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-soft">
        <span>
          {guidance.chosen
            ? "You chose this stage."
            : "Chosen for you from what your registers hold — change it if it is wrong."}
        </span>
        {(["setup", "maintain"] as Stage[])
          .filter((s) => s !== guidance.stage)
          .map((s) => (
            <form key={s} action={set(s)}>
              <button type="submit" disabled={pending} className="underline hover:text-brand disabled:opacity-60">
                Switch to “{STAGE_LABEL[s]}”
              </button>
            </form>
          ))}
        <form action={set("off")}>
          <button type="submit" disabled={pending} className="underline hover:text-brand disabled:opacity-60">
            Hide this guide
          </button>
        </form>
      </div>
    </section>
  );
}
