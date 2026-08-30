import type { HelpTopic } from "./types";

/**
 * Find help.
 *
 * Ranked rather than filtered: somebody typing "dpia" should get the
 * assessment topic first and the audit topic further down, not an
 * alphabetical list of everything containing the word. A title match beats a
 * keyword match beats a mention halfway down the body, because that is the
 * order in which those things predict what was meant.
 */

const WEIGHT = { title: 10, keyword: 6, summary: 4, heading: 2, body: 1 };

function terms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

function scoreTopic(topic: HelpTopic, term: string): number {
  let score = 0;
  const has = (text: string) => text.toLowerCase().includes(term);

  if (has(topic.title)) score += WEIGHT.title;
  if (topic.keywords?.some(has)) score += WEIGHT.keyword;
  if (has(topic.summary)) score += WEIGHT.summary;
  for (const section of topic.sections) {
    if (has(section.heading)) score += WEIGHT.heading;
    if (section.body.some(has) || section.points?.some(has)) score += WEIGHT.body;
  }
  return score;
}

export type HelpHit = {
  topic: HelpTopic;
  score: number;
  /** How many of the search words this topic actually matched. */
  matched: number;
  /** How many were typed. Fewer matched than typed means a partial answer. */
  typed: number;
};

/**
 * Narrow first, widen only if that leaves nothing.
 *
 * Requiring every word is right when it works: "risk acceptance" should not
 * return everything mentioning risk. But it fails on ordinary phrasing —
 * somebody typing "mention someone" gets nothing because the page says
 * "somebody", which reads as the help having no answer rather than as the
 * search being fussy. So a strict pass runs first, and only when it comes back
 * empty does a looser one run, ranked by how much of the query each topic met.
 */
export function searchHelp(topics: readonly HelpTopic[], query: string): HelpHit[] {
  const words = terms(query);
  if (words.length === 0) return [];

  const scored = topics.map((topic) => {
    const perWord = words.map((w) => scoreTopic(topic, w));
    return {
      topic,
      perWord,
      matched: perWord.filter((s) => s > 0).length,
      score: perWord.reduce((a, b) => a + b, 0),
    };
  });

  const rank = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.matched - a.matched ||
    b.score - a.score ||
    a.topic.title.localeCompare(b.topic.title);

  const strict = scored.filter((s) => s.matched === words.length);
  const pool = strict.length > 0 ? strict : scored.filter((s) => s.matched > 0);

  return pool
    .sort(rank)
    .map(({ topic, score, matched }) => ({ topic, score, matched, typed: words.length }));
}

/** The topic covering a screen, for contextual help. */
export function topicForPath(
  topics: readonly HelpTopic[],
  path: string,
): HelpTopic | null {
  // Longest match wins, so /app/ai/graph does not answer with /app/ai.
  const matches = topics
    .filter((t) => t.path && (path === t.path || path.startsWith(`${t.path}/`)))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0));
  return matches[0] ?? null;
}
