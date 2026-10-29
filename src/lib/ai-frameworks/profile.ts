import type { profileStatus } from "@/db/schema";

/**
 * A framework profile: for each outcome, where the organisation is and where it
 * means to be. Pure, so the page, the export and the tests share one reading
 * of what a gap is.
 */

export type ProfileStatus = (typeof profileStatus.enumValues)[number];

export const PROFILE_STATUSES: readonly ProfileStatus[] = ["not_started", "partial", "achieved", "not_applicable"];

export const PROFILE_STATUS_LABEL: Record<ProfileStatus, string> = {
  not_started: "Not started",
  partial: "Partly",
  achieved: "Achieved",
  not_applicable: "Not applicable",
};

export function isProfileStatus(value: unknown): value is ProfileStatus {
  return typeof value === "string" && (PROFILE_STATUSES as readonly string[]).includes(value);
}

const RANK: Record<ProfileStatus, number> = { not_started: 0, partial: 1, achieved: 2, not_applicable: 0 };

/**
 * Whether the organisation is short of its target on one outcome.
 *
 * Only a target of partly or achieved can be missed. Not assessed counts as not
 * started, since nobody can show it is met; and not applicable counts as not
 * started too when the target says it does apply, because the two cannot both
 * be right and the target is the decision.
 */
export function isGap(current: ProfileStatus | null, target: ProfileStatus | null): boolean {
  if (target !== "partial" && target !== "achieved") return false;
  return RANK[current ?? "not_started"] < RANK[target];
}

export type ProfileTally = Record<ProfileStatus | "unassessed", number> & { gaps: number; targetsSet: number };

export function tally(items: ReadonlyArray<{ current: ProfileStatus | null; target: ProfileStatus | null }>): ProfileTally {
  const t: ProfileTally = { not_started: 0, partial: 0, achieved: 0, not_applicable: 0, unassessed: 0, gaps: 0, targetsSet: 0 };
  for (const i of items) {
    t[i.current ?? "unassessed"] += 1;
    if (i.target) t.targetsSet += 1;
    if (isGap(i.current, i.target)) t.gaps += 1;
  }
  return t;
}
