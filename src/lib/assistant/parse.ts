/**
 * Read a model's answer without trusting its shape.
 *
 * The Waivern Portal learned this the hard way: its model rejects assistant
 * prefill, so JSON has to be coerced through the prompt and then recovered
 * from whatever came back — fenced, prose-wrapped, or preceded by an apology.
 *
 * The rule that matters is what happens when recovery fails. A governance
 * record must always be savable, so an unparseable response yields nothing
 * rather than an error the user has to get past.
 */

export function extractJson<T>(raw: string): T | null {
  const candidates: string[] = [];

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.push(fenced[1]);

  // The first balanced object or array in the text, for prose-wrapped output.
  for (const [open, close] of [["{", "}"], ["[", "]"]] as const) {
    const start = raw.indexOf(open);
    const end = raw.lastIndexOf(close);
    if (start !== -1 && end > start) candidates.push(raw.slice(start, end + 1));
  }

  candidates.push(raw);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim()) as T;
    } catch {
      // Try the next shape. Failing all of them is an expected outcome, not
      // an error worth surfacing.
    }
  }
  return null;
}
