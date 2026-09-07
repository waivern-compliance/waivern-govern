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

  // Nothing parsed whole. An answer that ran out of output budget stops
  // mid-object, and throwing it away discards every complete entry before the
  // cut — which for a list of forty sub-processors means losing thirty-nine
  // because the fortieth was clipped.
  for (const candidate of candidates) {
    const closed = closeTruncated(candidate);
    if (!closed) continue;
    try {
      return JSON.parse(closed) as T;
    } catch {
      // Nothing recoverable in this one.
    }
  }
  return null;
}

/**
 * The longest prefix of a cut-off document that can be validly closed.
 *
 * Scans for the last point at which a value finished while still inside a
 * container, and shuts the open brackets from there. A half-written object is
 * dropped; the ones before it survive. Text inside strings is skipped, so a
 * brace in a quoted contract clause cannot throw the count off.
 */
export function closeTruncated(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;

  const open: string[] = [];
  let inString = false;
  let escaped = false;
  let best: string | null = null;

  for (let at = start; at < text.length; at += 1) {
    const character = text[at];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (character === "{") open.push("}");
    else if (character === "[") open.push("]");
    else if (character === "}" || character === "]") {
      open.pop();
      // A value just closed. If we are still inside something, everything up
      // to here plus the outstanding closers is a whole document.
      if (open.length > 0) {
        best = text.slice(start, at + 1) + [...open].reverse().join("");
      }
    }
  }
  return best;
}
