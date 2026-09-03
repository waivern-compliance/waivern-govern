import type { TemplateDefinition } from "../schema";

/**
 * A DPIA covering the minimum content Article 35(7) requires: a description of
 * the processing, an assessment of necessity and proportionality, an assessment
 * of the risks, and the measures addressing them.
 *
 * Scoring is likelihood x impact, which is the method most organisations
 * already use in their wider risk register — a DPIA that scores on its own
 * private scale cannot be compared with anything else the board sees.
 */
export const DPIA: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "description",
        title: "The processing",
        description: "What is being done, by whom, and why.",
        questions: [
          { key: "activity_name", label: "Name of the processing activity", type: "short_text", required: true, legalRefs: ["ukgdpr.art30"], evidence: "none" },
          { key: "nature", label: "What will you do with the personal data?", type: "long_text", required: true, help: "How it is collected, used, stored, shared and deleted.", legalRefs: ["ukgdpr.art35.7"], evidence: "none" },
          { key: "purpose", label: "What are you trying to achieve?", type: "long_text", required: true, legalRefs: ["ukgdpr.art5"], evidence: "none" },
          { key: "lawful_basis", label: "Lawful basis", type: "single_select", required: true, legalRefs: ["ukgdpr.art6"], evidence: "none",
            options: [
              { value: "consent", label: "Consent" },
              { value: "contract", label: "Contract" },
              { value: "legal_obligation", label: "Legal obligation" },
              { value: "vital_interests", label: "Vital interests" },
              { value: "public_task", label: "Public task" },
              { value: "legitimate_interests", label: "Legitimate interests" },
            ] },
          { key: "lia_reference", label: "Where is the legitimate interests assessment recorded?", type: "short_text", required: false,
            showWhen: { op: "equals", question: "lawful_basis", value: "legitimate_interests" },
            requireWhen: { op: "equals", question: "lawful_basis", value: "legitimate_interests" },
            legalRefs: ["ukgdpr.art6"], evidence: "required" },
        ],
      },
      {
        key: "data",
        title: "Data and people",
        questions: [
          { key: "data_categories", label: "Categories of personal data", type: "data_category", required: true, help: "Categories only. This platform does not hold or correlate individuals' data.", legalRefs: ["ukgdpr.art30"], evidence: "none" },
          { key: "special_category", label: "Does this include special category or criminal offence data?", type: "boolean", required: true, legalRefs: ["ukgdpr.art9"], evidence: "none" },
          { key: "special_condition", label: "Which Article 9 condition applies?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "special_category", value: true },
            requireWhen: { op: "equals", question: "special_category", value: true },
            legalRefs: ["ukgdpr.art9"], evidence: "none" },
          { key: "subject_groups", label: "Whose data is it?", type: "long_text", required: true, help: "Audiences, staff, contributors, contractors, children, and so on.", legalRefs: [], evidence: "none" },
          { key: "volume", label: "Roughly how many people are affected?", type: "number", required: true, legalRefs: [], evidence: "none" },
          { key: "retention", label: "How long will the data be kept, and why?", type: "long_text", required: true, legalRefs: ["ukgdpr.art5"], evidence: "none" },
        ],
      },
      {
        key: "necessity",
        title: "Necessity and proportionality",
        questions: [
          { key: "necessity", label: "Why is this processing necessary to achieve the purpose?", type: "long_text", required: true, legalRefs: ["ukgdpr.art35.7"], evidence: "none" },
          { key: "alternatives", label: "What less intrusive options did you consider, and why were they rejected?", type: "long_text", required: true, legalRefs: ["ukgdpr.art25"], evidence: "none" },
          { key: "transparency", label: "How will people be told about this?", type: "long_text", required: true, legalRefs: ["ukgdpr.art5"], evidence: "none" },
          { key: "rights_support", label: "How will you support access, erasure, objection and the other rights?", type: "long_text", required: true, legalRefs: [], evidence: "none" },
        ],
      },
      {
        key: "transfers",
        title: "International transfers",
        questions: [
          { key: "transfers_abroad", label: "Will personal data be transferred outside the UK?", type: "boolean", required: true, legalRefs: ["ukgdpr.art44"], evidence: "none" },
          { key: "transfer_destinations", label: "Which countries?", type: "country", required: false,
            showWhen: { op: "equals", question: "transfers_abroad", value: true },
            requireWhen: { op: "equals", question: "transfers_abroad", value: true },
            legalRefs: ["ukgdpr.art45"], evidence: "none" },
          { key: "tra_reference", label: "Reference of the transfer risk assessment", type: "short_text", required: false,
            showWhen: { op: "equals", question: "transfers_abroad", value: true },
            help: "A separate TRA is required unless the destination is covered by adequacy regulations.",
            legalRefs: ["ico.tra"], evidence: "none" },
        ],
      },
      {
        key: "risk",
        title: "Risk assessment",
        description: "Assess the risk to the rights and freedoms of the people whose data this is — not the risk to the organisation.",
        questions: [
          { key: "risk_description", label: "What could go wrong for the people involved?", type: "long_text", required: true, legalRefs: ["ukgdpr.art35.7"], evidence: "none" },
          { key: "likelihood", label: "How likely is that harm?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "remote", label: "Remote — hard to foresee a realistic path" },
              { value: "unlikely", label: "Unlikely — possible but not expected" },
              { value: "possible", label: "Possible — could reasonably happen" },
              { value: "likely", label: "Likely — expected without intervention" },
            ] },
          { key: "impact", label: "How severe would it be?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "minimal", label: "Minimal — inconvenience, quickly resolved" },
              { value: "limited", label: "Limited — some distress or minor detriment" },
              { value: "significant", label: "Significant — material harm, distress or discrimination" },
              { value: "severe", label: "Severe — serious or irreversible harm" },
            ] },
          { key: "measures", label: "What measures will reduce this risk?", type: "long_text", required: true, legalRefs: ["ukgdpr.art32", "ukgdpr.art25"], evidence: "optional" },
          { key: "residual_accepted", label: "Is residual risk still high after those measures?", type: "boolean", required: true, help: "If yes, prior consultation with the ICO may be required before proceeding.", legalRefs: ["ukgdpr.art36"], evidence: "none" },
          { key: "consultation_plan", label: "What is the plan for prior consultation?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "residual_accepted", value: true },
            requireWhen: { op: "equals", question: "residual_accepted", value: true },
            legalRefs: ["ukgdpr.art36"], evidence: "none" },
        ],
      },
    ],
  },
  scoring: {
    method: "likelihood_impact",
    likelihoodQuestion: "likelihood",
    impactQuestion: "impact",
    likelihoodScale: { remote: 1, unlikely: 2, possible: 3, likely: 4 },
    impactScale: { minimal: 1, limited: 2, significant: 3, severe: 4 },
    bands: [
      { min: 1, max: 3, label: "Low", tier: "low" },
      { min: 4, max: 7, label: "Medium", tier: "medium" },
      { min: 8, max: 11, label: "High", tier: "high" },
      { min: 12, max: 16, label: "Critical", tier: "critical" },
    ],
  },
  reviewIntervalMonths: 12,
};
