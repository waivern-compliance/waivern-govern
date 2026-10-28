import type { aiFramework } from "@/db/schema";
import type { AppetiteLevel } from "@/lib/risk/appetite";
import type { TreatmentSuggestion } from "@/lib/risk/treatment-library";

export type AiFrameworkId = (typeof aiFramework.enumValues)[number];

export type RiskCategoryDef = { value: string; label: string; summary: string };

/**
 * What an AI governance framework supplies to the organisation following it.
 *
 * Only what differs between frameworks. How a system goes live, how proposals
 * are prioritised and who approves what are Govern's own rules, or UK law and
 * spend controls that apply whichever framework is followed.
 */
export type AiFrameworkPack = {
  id: AiFrameworkId;
  label: string;
  summary: string;
  /** The categories AI risk is filed under and appetite is set against. */
  categories: readonly RiskCategoryDef[];
  /** What each appetite level means per category, offered beside the form. */
  appetiteGuidance: Readonly<Record<string, Record<AppetiteLevel, string>>>;
  /** Treatments offered beside a risk, by the categories they treat. */
  treatments: readonly TreatmentSuggestion[];
};
