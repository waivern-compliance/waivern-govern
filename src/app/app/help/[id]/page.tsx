import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HelpSearch } from "@/components/help/HelpSearch";
import { TOPIC_BY_ID } from "@/lib/help/topics";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const topic = TOPIC_BY_ID.get(id);
  return { title: topic ? topic.title : "Help" };
}

export default async function HelpTopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const topic = TOPIC_BY_ID.get(id);
  if (!topic) notFound();

  const related = (topic.related ?? [])
    .map((r) => TOPIC_BY_ID.get(r))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/help" className="text-xs text-ink-soft hover:text-brand">
          ← Help
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{topic.title}</h1>
        <p className="max-w-prose text-sm text-ink-soft">{topic.summary}</p>
        {topic.path ? (
          <Link
            href={topic.path}
            className="inline-block text-xs text-brand hover:underline"
          >
            Go to the screen this describes →
          </Link>
        ) : null}
      </header>

      <div className="space-y-7">
        {topic.sections.map((section) => (
          <section key={section.heading} className="space-y-2">
            <h2 className="text-sm font-semibold">{section.heading}</h2>
            {section.body.map((paragraph, i) => (
              <p key={i} className="max-w-prose text-sm leading-relaxed">
                {paragraph}
              </p>
            ))}
            {section.points ? (
              <ul className="max-w-prose list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {section.points.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>

      {related.length > 0 ? (
        <section className="space-y-2 border-t border-line pt-6">
          <h2 className="text-sm font-semibold">See also</h2>
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/help/${r.id}`}
                  className="block px-4 py-2.5 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <p className="text-sm font-medium">{r.title}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{r.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-line pt-6">
        <HelpSearch />
      </section>
    </main>
  );
}
