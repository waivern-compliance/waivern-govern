import type { templateKind } from "@/db/schema/enums";

type TemplateKind = (typeof templateKind.enumValues)[number];

export type AssessableSubject = "ai_use_case" | "supplier";

/**
 * Which kinds of assessment can be about which kind of record. A DPIA about a
 * supplier, or a supplier record about an AI system, would bind an assessment
 * to something it does not describe, and the register reading it back would
 * report nonsense.
 */
export const KINDS_FOR: Record<AssessableSubject, readonly TemplateKind[]> = {
  ai_use_case: ["ai_risk", "screening", "dpia"],
  supplier: ["supplier_record"],
};
