/**
 * Where a record lives.
 *
 * One map, because more than one surface needs to link to an arbitrary record
 * — tasks, the mention inbox, and anything that follows a subject reference.
 * Kept as data rather than stored on each row: a URL written into the database
 * is a routing decision that cannot be changed without a migration.
 */
export type SubjectType = string;

const PATHS: Record<string, (id: string) => string> = {
  assessment: (id) => `/app/assessments/${id}`,
  risk: (id) => `/app/risks/${id}`,
  mitigation: () => "/app/risks",
  processing_activity: (id) => `/app/ropa/${id}`,
  ai_use_case: (id) => `/app/ai/${id}`,
  supplier: (id) => `/app/third-parties/${id}`,
  dpa: () => "/app/third-parties",
  country_risk: () => "/app/countries",
  scan_finding: () => "/app/findings",
  breach: (id) => `/app/breaches/${id}`,
  breach_decision: () => "/app/breaches",
};

/**
 * A record with no screen of its own returns null rather than a broken link.
 * Sending somebody to a 404 is worse than telling them there is nowhere to go.
 */
export function pathFor(subjectType: SubjectType, subjectId: string): string | null {
  return PATHS[subjectType]?.(subjectId) ?? null;
}
