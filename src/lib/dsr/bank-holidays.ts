/**
 * Bank holidays in England and Wales, as published at gov.uk/bank-holidays.
 *
 * Data rather than a calculation: Easter can be computed, but substitute days,
 * one-off holidays for coronations and jubilees, and moved May holidays
 * cannot. Extend the list each year; a test fails once the current year is
 * no longer covered, so it cannot quietly lapse.
 */
const DATES = [
  // 2025
  "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05", "2025-05-26", "2025-08-25",
  "2025-12-25", "2025-12-26",
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04", "2026-05-25", "2026-08-31",
  "2026-12-25", "2026-12-28",
  // 2027
  "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03", "2027-05-31", "2027-08-30",
  "2027-12-27", "2027-12-28",
  // 2028
  "2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01", "2028-05-29", "2028-08-28",
  "2028-12-25", "2028-12-26",
];

export const BANK_HOLIDAYS_ENGLAND_AND_WALES: ReadonlySet<string> = new Set(DATES);

/** The last year the list covers. */
export const BANK_HOLIDAYS_KNOWN_THROUGH = Math.max(...DATES.map((d) => Number(d.slice(0, 4))));
