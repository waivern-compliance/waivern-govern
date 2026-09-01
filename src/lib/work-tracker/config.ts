import { z } from "zod";

/**
 * Where governance work is tracked, when it is tracked somewhere else.
 *
 * One shape for every product. Jira and ServiceNow do the same job in
 * different vocabularies, and the differences that matter are all data:
 * what the destination is called, and which raw status means finished.
 * Putting those in columns would mean a schema change for the second adapter,
 * which is how a seam turns back into two integrations.
 */

export const WORK_TRACKERS = ["jira", "servicenow"] as const;
export type WorkTracker = (typeof WORK_TRACKERS)[number];

/**
 * Where an item goes, in that product's own words.
 *
 * Jira wants `{ project, issueType }`. ServiceNow wants `{ table }` and
 * usually `{ assignmentGroup }`. Deliberately free-form: the adapter knows
 * which keys it needs, and the schema does not have to.
 */
export const target = z.record(z.string().min(1), z.string().min(1));
export type Target = z.infer<typeof target>;

export const workTrackerSettings = z.object({
  provider: z.enum(WORK_TRACKERS),
  /** The instance this organisation controls. */
  baseUrl: z.string().url(),

  /** Where work goes when nothing more specific applies. */
  target,
  /**
   * Per-entity destinations, so a mitigation reaches the board its team
   * actually reads. One shared project is cheaper and much less useful — the
   * whole point is reaching people who do not open this platform.
   */
  targetByEntity: z.record(z.string().uuid(), target).optional(),

  /**
   * Raw status values that mean the work is finished.
   *
   * Strings, because Jira names its statuses and ServiceNow numbers them —
   * a ServiceNow state of 3 is stored here as "3". Stringifying at the
   * boundary lets one comparison serve both, and keeps the mapping editable
   * by whoever owns the workflow rather than by whoever owns the code.
   */
  doneStatuses: z.array(z.string().min(1)).min(1),
});
export type WorkTrackerSettings = z.infer<typeof workTrackerSettings>;

/**
 * The destination for a task, preferring the entity's own.
 *
 * Falls back rather than failing: an entity nobody has mapped should still
 * raise work somewhere, because losing a mitigation is worse than putting it
 * on the wrong board.
 */
export function targetFor(
  settings: WorkTrackerSettings,
  entityId: string | null,
): Target {
  if (!entityId) return settings.target;
  return settings.targetByEntity?.[entityId] ?? settings.target;
}

/**
 * Whether a raw status from the tracker means the work is done.
 *
 * Takes `unknown` because this is the boundary: a ServiceNow state arrives as
 * a number, a Jira status as a string, and neither should have to be
 * normalised by every caller. Compared case-insensitively, since a workflow
 * renamed from "Done" to "done" is not a status change.
 */
export function isDone(settings: WorkTrackerSettings, rawStatus: unknown): boolean {
  if (rawStatus === null || rawStatus === undefined) return false;
  const value = String(rawStatus).trim().toLowerCase();
  if (value === "") return false;
  return settings.doneStatuses.some((s) => s.trim().toLowerCase() === value);
}

/** What an adapter is asked to record, in terms neither product owns. */
export type ExternalItem = {
  /** What the API wants back: a Jira issue id, a ServiceNow sys_id. */
  externalId: string;
  /** What a person recognises: PRIV-142, TASK0012345. */
  externalRef: string;
  /** Where to open it. */
  externalUrl: string;
};

/** Defaults that make a new connection form less of a blank page. */
export const SUGGESTED: Record<WorkTracker, { target: Target; doneStatuses: string[] }> = {
  jira: {
    target: { project: "", issueType: "Task" },
    doneStatuses: ["Done", "Closed", "Resolved"],
  },
  servicenow: {
    // 3 is Closed Complete on a stock task table; instances customise it,
    // which is exactly why this is configuration.
    target: { table: "sc_task", assignmentGroup: "" },
    doneStatuses: ["3", "Closed Complete"],
  },
};
