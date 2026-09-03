/**
 * Date arithmetic that governance cycles need.
 *
 * Extracted because it existed twice already — in the sweep and in the country
 * library — and a third copy is how two of them quietly stop agreeing about
 * what "in twelve months" means at the end of February.
 */

/**
 * Add whole months, clamping to the end of the target month.
 *
 * JavaScript rolls 31 January plus one month into 3 March. A review set for
 * the last day of a month should land on the last day of the next, not skip
 * into the one after.
 */
export function addMonths(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const target = new Date(from);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastOfTarget));
  target.setUTCHours(
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds(),
  );
  return target;
}
