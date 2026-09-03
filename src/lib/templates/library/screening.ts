import type { TemplateDefinition } from "../schema";

/**
 * Triage. Answers here decide whether a full DPIA is required, so it is
 * deliberately short — a screening questionnaire people abandon halfway is
 * worse than no screening at all.
 *
 * The weights follow the ICO's screening criteria: any single high-weight
 * trigger is enough to require a DPIA on its own, which the band boundaries
 * reflect.
 */
export const SCREENING: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "about",
        title: "About this processing",
        questions: [
          { key: "activity_name", label: "What is the activity called?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "summary", label: "Describe what you are planning to do, in a sentence or two", type: "long_text", required: true, legalRefs: [], evidence: "none", placeholder: "Who is involved, what data, and what happens to it." },
          { key: "owner_area", label: "Which part of the organisation owns it?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
        ],
      },
      {
        key: "triggers",
        title: "Screening criteria",
        description: "Tick everything that applies. If you are unsure, tick it — an unnecessary DPIA costs an hour, a missing one costs rather more.",
        questions: [
          {
            key: "criteria",
            label: "Which of these apply to the processing?",
            type: "multi_select",
            required: true,
            legalRefs: ["ukgdpr.art35", "ico.dpia"],
            evidence: "none",
            options: [
              { value: "systematic_evaluation", label: "Systematic and extensive evaluation, profiling or automated decisions with legal or similarly significant effects", weight: 5 },
              { value: "large_scale_special", label: "Large-scale processing of special category or criminal offence data", weight: 5 },
              { value: "public_monitoring", label: "Systematic monitoring of a publicly accessible area on a large scale", weight: 5 },
              { value: "children", label: "Data about children, or services offered directly to them", weight: 4 },
              { value: "vulnerable", label: "Data about people in a vulnerable position, or where there is a power imbalance", weight: 4 },
              { value: "new_technology", label: "Novel technology, or an existing technology used in a new way", weight: 3 },
              { value: "data_matching", label: "Matching or combining datasets from different sources", weight: 3 },
              { value: "invisible_processing", label: "Processing data people would not expect, or that was not collected from them", weight: 3 },
              { value: "tracking", label: "Tracking location or behaviour", weight: 3 },
              { value: "denies_service", label: "Processing that could deny someone a service, benefit or contract", weight: 4 },
              { value: "none_apply", label: "None of these apply", weight: 0 },
            ],
          },
          {
            key: "ai_involved",
            label: "Does this involve an AI or machine-learning system of any kind?",
            type: "boolean",
            required: true,
            help: "Includes predictive models, generative tools and agentic systems, whether built here or bought in.",
            legalRefs: ["euaiact.art6"],
            evidence: "none",
          },
          {
            key: "ai_use_case_ref",
            label: "Which AI use case is this? Give the register reference if you know it.",
            type: "short_text",
            showWhen: { op: "equals", question: "ai_involved", value: true },
            legalRefs: [],
            evidence: "none",
            required: false,
          },
        ],
      },
    ],
  },
  scoring: {
    method: "weighted_sum",
    questions: ["criteria"],
    bands: [
      { min: 0, max: 2, label: "DPIA not indicated", tier: "low" },
      { min: 3, max: 4, label: "DPIA recommended", tier: "medium" },
      { min: 5, max: 100, label: "DPIA required", tier: "high" },
    ],
  },
  reviewIntervalMonths: 24,
};
