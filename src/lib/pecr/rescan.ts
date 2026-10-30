import { addMonths } from "@/lib/dates";

/**
 * When a website or app is next due to be scanned for cookies.
 *
 * Pure. Counted from the last scan, or from when the property was added if it
 * has never been scanned; a property with no interval has no due date. Sites
 * change without anyone telling the privacy team — a new tag in the tag
 * manager, a plug-in update — so the inventory is only as current as its last
 * scan.
 */

/** The intervals offered, in months. */
export const RESCAN_INTERVALS = [1, 3, 6, 12] as const;

/** How far ahead of the due date the reminder is raised. */
export const RESCAN_LEAD_DAYS = 14;

export function rescanDueAt(property: {
  rescanIntervalMonths: number | null;
  lastScannedAt: Date | null;
  createdAt: Date;
}): Date | null {
  if (!property.rescanIntervalMonths || property.rescanIntervalMonths < 1) return null;
  return addMonths(property.lastScannedAt ?? property.createdAt, property.rescanIntervalMonths);
}

export type RescanState = "not_due" | "due_soon" | "overdue";

export function rescanState(dueAt: Date | null, now = new Date()): RescanState {
  if (!dueAt) return "not_due";
  if (dueAt.getTime() <= now.getTime()) return "overdue";
  if (dueAt.getTime() - RESCAN_LEAD_DAYS * 24 * 3600 * 1000 <= now.getTime()) return "due_soon";
  return "not_due";
}
