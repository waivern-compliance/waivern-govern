/**
 * Remove what should not leave the platform.
 *
 * A chat box is an open ingress: people type things into one that they would
 * never enter into a form. This strips the identifiers a governance record
 * has no business sending to a model, and reports what it removed so the
 * minimisation can be inspected rather than merely claimed.
 *
 * It is a partial control and is described as one. It catches shapes, not
 * meaning: "the claimant's mother is unwell" survives it. The remaining
 * protection is that the user is told, at the point of entry, not to type
 * such things.
 */

export type Redaction = { kind: string; count: number };

const RULES: Array<{ kind: string; pattern: RegExp; replace: string }> = [
  {
    kind: "email address",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replace: "[email removed]",
  },
  {
    // UK NINO. Checked before the general number rules, which would otherwise
    // shred it into pieces that no longer look like anything.
    kind: "national insurance number",
    pattern: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,
    replace: "[national insurance number removed]",
  },
  {
    kind: "payment card number",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    replace: "[card number removed]",
  },
  {
    kind: "UK telephone number",
    pattern: /\b(?:\+44\s?|0)(?:\d\s?){9,10}\d\b/g,
    replace: "[telephone number removed]",
  },
  {
    kind: "UK postcode",
    pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi,
    replace: "[postcode removed]",
  },
  {
    kind: "IP address",
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    replace: "[IP address removed]",
  },
];

export function redact(text: string): { text: string; redactions: Redaction[] } {
  let out = text;
  const redactions: Redaction[] = [];

  for (const rule of RULES) {
    const matches = out.match(rule.pattern);
    if (!matches || matches.length === 0) continue;
    out = out.replace(rule.pattern, rule.replace);
    redactions.push({ kind: rule.kind, count: matches.length });
  }

  return { text: out, redactions };
}

/** "address" pluralises to "addresses", not "addresss". */
function plural(noun: string, count: number): string {
  if (count === 1) return noun;
  return /(?:s|x|z|ch|sh)$/i.test(noun) ? `${noun}es` : `${noun}s`;
}

/** Whether anything was removed, for telling the user plainly. */
export function summariseRedactions(redactions: readonly Redaction[]): string | null {
  if (redactions.length === 0) return null;
  const parts = redactions.map((r) => `${r.count} ${plural(r.kind, r.count)}`);
  return `Removed before sending: ${parts.join(", ")}.`;
}
