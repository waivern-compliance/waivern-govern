/**
 * A React key that changes whenever the saved values a form was built from change.
 *
 * React resets a form to its first defaults after an action runs. A form
 * prefilled from a saved record therefore shows the values the page first
 * loaded with — not the ones just saved — until something rebuilds it. On the
 * risk page that showed the inherent likelihood as though it were the residual
 * rating somebody had just recorded. Keying the form on the saved values
 * rebuilds it from them whenever they change, and leaves it alone otherwise.
 *
 * Give it the record, or the values the form's fields default to. Dates and
 * arrays serialise as they should.
 */
export function savedKey(...values: unknown[]): string {
  return JSON.stringify(values);
}
