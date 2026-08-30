import Link from "next/link";
import { TOPIC_BY_ID } from "@/lib/help/topics";

/**
 * Help where the question arises.
 *
 * A summary and a way through, folded away by default. Somebody who knows what
 * they are doing should not have to scroll past an explanation every visit,
 * and somebody who does not should not have to leave the page to find one.
 *
 * A `<details>` rather than a popover deliberately: it works before the
 * JavaScript arrives, it is reachable from the keyboard without any handling
 * of my own, and it prints.
 */
export function HelpLink({ topic: id }: { topic: string }) {
  const topic = TOPIC_BY_ID.get(id);
  if (!topic) return null;

  return (
    <details className="group rounded border border-line bg-surface">
      <summary className="cursor-pointer list-none px-3 py-1.5 text-xs text-ink-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-brand">
        <span aria-hidden className="mr-1.5 font-mono">?</span>
        How this page works
      </summary>
      <div className="space-y-2 border-t border-line px-3 py-2.5">
        <p className="max-w-prose text-xs text-ink-soft">{topic.summary}</p>
        <Link
          href={`/app/help/${topic.id}`}
          className="inline-block text-xs text-brand hover:underline"
        >
          {topic.title} →
        </Link>
      </div>
    </details>
  );
}
