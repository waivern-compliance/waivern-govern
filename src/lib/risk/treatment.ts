/**
 * What a mitigation does to a risk, in DSIT's AI Risk Management Toolkit's
 * terms. Acceptance, the toolkit's fourth option, is not here: accepting a
 * risk is a separate decision by an approver, recorded with its own rationale
 * and expiry, not a line in a list of things being done.
 */
export type TreatmentType = "avoidance" | "limitation" | "transference";

export const TREATMENT_LABEL: Record<TreatmentType, string> = {
  avoidance: "Avoid",
  limitation: "Limit",
  transference: "Transfer",
};

export const TREATMENT_HELP: Record<TreatmentType, string> = {
  avoidance: "Remove the exposure — stop, or do it another way",
  limitation: "Keep the exposure within acceptable limits",
  transference: "Move some of it to a party better placed to carry it",
};

export function isTreatmentType(value: unknown): value is TreatmentType {
  return typeof value === "string" && value in TREATMENT_LABEL;
}
