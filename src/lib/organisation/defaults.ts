/**
 * What every new organisation starts with, wherever it is created: the seed
 * script for a demonstration, or a Waivern operator approving a request.
 * Shared, so the two cannot drift apart.
 */

/** How long each kind of record is kept before it may be disposed of. */
export const RETENTION_DEFAULTS: ReadonlyArray<{
  subjectType: "assessment" | "audit_event" | "processing_activity" | "risk";
  months: number;
  basis: string;
}> = [
  { subjectType: "assessment", months: 84, basis: "Corporate retention schedule — governance records" },
  { subjectType: "processing_activity", months: 84, basis: "Retained while processing continues, plus 7 years" },
  { subjectType: "risk", months: 84, basis: "Corporate retention schedule — risk records" },
  { subjectType: "audit_event", months: 120, basis: "Audit evidence, retained beyond the records it describes" },
];

/** A short reference from a name: lower case, words joined by hyphens. */
export function slugFor(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "organisation"
  );
}
