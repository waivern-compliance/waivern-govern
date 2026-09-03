import type { TemplateDefinition } from "../schema";

/**
 * AI risk assessment covering predictive/classic machine learning, generative
 * and agentic systems — the buyer was explicit that the scope is not restricted
 * to systems that operate as agents.
 *
 * Bias and fairness is a structured assessment with evidence, not automated
 * statistical testing: that was the stated requirement, and a questionnaire
 * that pretends to measure disparate impact would be worse than one that asks
 * who measured it and where the result is filed.
 *
 * Scored as a weighted sum rather than likelihood x impact. AI risk does not
 * reduce cleanly to two axes — autonomy, contestability and data provenance
 * contribute independently, and collapsing them early loses the reason a system
 * scored where it did.
 */
export const AI_RISK: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "use_case",
        title: "The AI use case",
        questions: [
          { key: "use_case_name", label: "What is the system called?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "purpose", label: "What is it for, and what decision or output does it produce?", type: "long_text", required: true, legalRefs: [], evidence: "none" },
          { key: "ai_type", label: "What kind of system is it?", type: "single_select", required: true, legalRefs: ["euaiact.art6"], evidence: "none",
            options: [
              { value: "predictive", label: "Predictive or classification model" },
              { value: "generative", label: "Generative — text, image, audio or video" },
              { value: "agentic", label: "Agentic — plans and takes actions across tools or systems" },
              { value: "hybrid", label: "A combination of these" },
            ] },
          { key: "provenance", label: "Where does the system come from?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "built_in_house", label: "Built here" },
              { value: "fine_tuned", label: "A third-party model fine-tuned or adapted here" },
              { value: "third_party_api", label: "A third-party service consumed as an API" },
              { value: "embedded_vendor", label: "Embedded in a product we buy" },
            ] },
          { key: "lifecycle_stage", label: "Where is it in its lifecycle?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "proposed", label: "Proposed" },
              { value: "development", label: "In development" },
              { value: "pilot", label: "Piloting with real users" },
              { value: "production", label: "In production" },
              { value: "retiring", label: "Being retired" },
            ] },
        ],
      },
      {
        key: "exposure",
        title: "Reach and consequence",
        questions: [
          { key: "affects_people", label: "Does the system affect people, directly or indirectly?", type: "boolean", required: true, legalRefs: ["ukgdpr.art22"], evidence: "none" },
          { key: "consequence", label: "What is the strongest consequence for someone affected?", type: "single_select", required: false,
            showWhen: { op: "equals", question: "affects_people", value: true },
            requireWhen: { op: "equals", question: "affects_people", value: true },
            legalRefs: ["ukgdpr.art22", "euaiact.art6"], evidence: "none",
            options: [
              { value: "informational", label: "Informational only — no decision follows", weight: 0 },
              { value: "influences", label: "Influences a decision a person then takes", weight: 2 },
              { value: "recommends", label: "Recommends a decision that is usually followed", weight: 4 },
              { value: "decides", label: "Decides, with no meaningful human review", weight: 7 },
            ] },
          { key: "audience", label: "Who is exposed to it?", type: "multi_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "internal_few", label: "A small internal team", weight: 0 },
              { value: "internal_wide", label: "Staff across the organisation", weight: 1 },
              { value: "contributors", label: "Contributors, contractors or suppliers", weight: 2 },
              { value: "public", label: "The public", weight: 3 },
              { value: "children", label: "Children, or an audience likely to include them", weight: 4 },
              { value: "vulnerable", label: "People in a vulnerable position", weight: 4 },
            ] },
          { key: "editorial_output", label: "Does any output reach an audience as published content?", type: "boolean", required: true, help: "Including drafts, summaries, subtitles, translations, recommendations and metadata.", legalRefs: ["euaiact.art50"], evidence: "none" },
          { key: "disclosure", label: "How is AI involvement disclosed to the audience?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "editorial_output", value: true },
            requireWhen: { op: "equals", question: "editorial_output", value: true },
            legalRefs: ["euaiact.art50"], evidence: "none" },
        ],
      },
      {
        key: "data",
        title: "Data and provenance",
        questions: [
          { key: "personal_data", label: "Does the system process personal data at any stage?", type: "boolean", required: true, help: "Including training, fine-tuning, prompts, retrieval and outputs.", legalRefs: ["ukgdpr.art5"], evidence: "none" },
          { key: "dpia_reference", label: "Reference of the related DPIA", type: "short_text", required: false,
            showWhen: { op: "equals", question: "personal_data", value: true },
            legalRefs: ["ukgdpr.art35"], evidence: "none" },
          { key: "data_provenance", label: "How well understood is the training and input data?", type: "single_select", required: true, legalRefs: ["euaiact.art10"], evidence: "optional",
            options: [
              { value: "documented", label: "Fully documented, with rights and licensing confirmed", weight: 0 },
              { value: "partial", label: "Partly documented — the main sources are known", weight: 2 },
              { value: "vendor_asserted", label: "Known only through vendor assertion", weight: 3 },
              { value: "opaque", label: "Not established", weight: 5 },
            ] },
          { key: "sensitive_inputs", label: "Does it use special category data, or data that could act as a proxy for it?", type: "single_select", required: true, help: "Postcode, name and language can all proxy for protected characteristics.", legalRefs: ["ukgdpr.art9"], evidence: "none",
            options: [
              { value: "no", label: "No", weight: 0 },
              { value: "proxies_possible", label: "No direct use, but proxies are plausible", weight: 2 },
              { value: "yes", label: "Yes, directly", weight: 4 },
            ] },
        ],
      },
      {
        key: "fairness",
        title: "Bias and fairness",
        description: "A structured assessment with evidence. Where statistical testing has been done, record where the results are held.",
        questions: [
          { key: "bias_considered", label: "Has bias and fairness been assessed for this system?", type: "single_select", required: true, legalRefs: ["euaiact.art10", "iso42001"], evidence: "optional",
            options: [
              { value: "tested", label: "Yes — tested, with documented results", weight: 0 },
              { value: "reviewed", label: "Yes — reviewed qualitatively, not measured", weight: 2 },
              { value: "planned", label: "Planned but not yet done", weight: 4 },
              { value: "not_done", label: "Not assessed", weight: 6 },
            ] },
          { key: "bias_evidence", label: "Where are the results held?", type: "short_text", required: false,
            showWhen: { op: "equals", question: "bias_considered", value: "tested" },
            requireWhen: { op: "equals", question: "bias_considered", value: "tested" },
            legalRefs: [], evidence: "required" },
          { key: "affected_groups", label: "Which groups could be disadvantaged, and how would you know?", type: "long_text", required: true, help: "Answer this even where testing found nothing — naming the groups is what makes later monitoring possible.", legalRefs: [], evidence: "none" },
          { key: "contestability", label: "Can someone affected challenge or appeal an outcome?", type: "single_select", required: true, legalRefs: ["ukgdpr.art22"], evidence: "none",
            options: [
              { value: "documented_route", label: "Yes — a documented route, with a human decision-maker", weight: 0 },
              { value: "informal", label: "Informally, through existing complaints channels", weight: 2 },
              { value: "none", label: "No route exists", weight: 4 },
              { value: "not_applicable", label: "Not applicable — no decision affects anyone", weight: 0 },
            ] },
        ],
      },
      {
        key: "oversight",
        title: "Oversight and monitoring",
        questions: [
          { key: "human_oversight", label: "What human oversight is in place?", type: "single_select", required: true, legalRefs: ["euaiact.art14"], evidence: "none",
            options: [
              { value: "in_the_loop", label: "A person reviews every output before it has effect", weight: 0 },
              { value: "on_the_loop", label: "A person monitors and can intervene", weight: 2 },
              { value: "post_hoc", label: "Sampling or review after the fact", weight: 3 },
              { value: "none", label: "None", weight: 5 },
            ] },
          { key: "monitoring", label: "What is monitored in production?", type: "multi_select", required: false,
            showWhen: { op: "or", any: [
              { op: "equals", question: "lifecycle_stage", value: "production" },
              { op: "equals", question: "lifecycle_stage", value: "pilot" },
            ] },
            legalRefs: ["euaiact.art9"], evidence: "optional",
            options: [
              { value: "accuracy", label: "Accuracy or quality", weight: 0 },
              { value: "drift", label: "Input or output drift", weight: 0 },
              { value: "harmful_output", label: "Harmful or toxic output", weight: 0 },
              { value: "complaints", label: "Complaints and escalations", weight: 0 },
              { value: "usage", label: "Usage volume and pattern", weight: 0 },
              { value: "none", label: "Nothing is monitored", weight: 4 },
            ] },
          { key: "kill_switch", label: "Can the system be turned off quickly, and who can do it?", type: "long_text", required: true, legalRefs: ["euaiact.art14"], evidence: "none" },
          { key: "review_interval", label: "How often should this assessment be revisited?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "quarterly", label: "Quarterly" },
              { value: "biannual", label: "Every six months" },
              { value: "annual", label: "Annually" },
            ] },
        ],
      },
    ],
  },
  scoring: {
    method: "weighted_sum",
    questions: [
      "consequence",
      "audience",
      "data_provenance",
      "sensitive_inputs",
      "bias_considered",
      "contestability",
      "human_oversight",
      "monitoring",
    ],
    bands: [
      { min: 0, max: 5, label: "Minimal", tier: "low" },
      { min: 6, max: 13, label: "Limited", tier: "medium" },
      { min: 14, max: 22, label: "High", tier: "high" },
      { min: 23, max: 100, label: "Unacceptable without change", tier: "critical" },
    ],
  },
  reviewIntervalMonths: 12,
};
