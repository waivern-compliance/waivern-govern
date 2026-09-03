import type { TemplateDefinition } from "../schema";

/**
 * A DPIA following the CNIL's PIA method.
 *
 * The CNIL structures a PIA in four parts — context, fundamental principles,
 * risks, and validation — and assesses risk over three feared events rather
 * than one: illegitimate access to data, unwanted modification of data, and
 * disappearance of data. Each is rated for severity and likelihood on the
 * CNIL's four levels: negligible, limited, significant, maximum.
 *
 * That is the substantive difference from the Article 35(7) DPIA already in
 * this library, which is written to the UK regime and rates the processing
 * once. Both satisfy Article 35; this one produces the artefact a French
 * controller is expected to be able to show, and its risk section is far more
 * specific about what could go wrong.
 *
 * On scoring: the method rates three events, and the engine carries one score
 * per assessment. The three ratings are captured in full because they are the
 * substance, and the overall rating is a judgement the assessor makes having
 * seen them — which is what the CNIL's validation stage asks of the controller
 * anyway. A number the platform derived by taking a maximum would look like an
 * assessment somebody had made and would not be one.
 */

const SEVERITY = [
  { value: "negligible", label: "Negligible — those affected will not be affected, or may encounter minor inconvenience" },
  { value: "limited", label: "Limited — significant inconvenience, which they will overcome despite difficulties" },
  { value: "significant", label: "Significant — significant consequences they should be able to overcome, but with serious difficulty" },
  { value: "maximum", label: "Maximum — significant, or even irreversible, consequences they may not overcome" },
];

const LIKELIHOOD = [
  { value: "negligible", label: "Negligible — does not seem possible for the identified risk sources" },
  { value: "limited", label: "Limited — appears difficult for the identified risk sources" },
  { value: "significant", label: "Significant — appears possible for the identified risk sources" },
  { value: "maximum", label: "Maximum — appears extremely easy for the identified risk sources" },
];

/** One feared event, rated the way the method rates it. */
function fearedEvent(key: string, label: string, help: string) {
  return [
    {
      key: `${key}_impacts`,
      label: `${label} — what would the impacts on data subjects be?`,
      type: "long_text" as const,
      required: true,
      help,
      legalRefs: ["cnil.pia.knowledge"],
      evidence: "none" as const,
    },
    {
      key: `${key}_sources`,
      label: `${label} — which risk sources could bring it about?`,
      type: "long_text" as const,
      required: true,
      help: "Internal or external, human or non-human. The method asks for sources, not adjectives.",
      legalRefs: ["cnil.pia.knowledge"],
      evidence: "none" as const,
    },
    {
      key: `${key}_measures`,
      label: `${label} — which existing or planned controls address it?`,
      type: "long_text" as const,
      required: true,
      legalRefs: ["eugdpr.art32"],
      evidence: "optional" as const,
    },
    {
      key: `${key}_severity`,
      label: `${label} — severity`,
      type: "single_select" as const,
      required: true,
      options: SEVERITY,
      legalRefs: ["cnil.pia.method"],
      evidence: "none" as const,
    },
    {
      key: `${key}_likelihood`,
      label: `${label} — likelihood`,
      type: "single_select" as const,
      required: true,
      options: LIKELIHOOD,
      legalRefs: ["cnil.pia.method"],
      evidence: "none" as const,
    },
  ];
}

export const CNIL_PIA: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "context",
        title: "Context",
        description: "What the processing is, what it covers, and what it runs on.",
        questions: [
          { key: "activity_name", label: "Name of the processing", type: "short_text", required: true, legalRefs: ["eugdpr.art30"], evidence: "none" },
          { key: "overview", label: "What does the processing consist of?", type: "long_text", required: true, help: "Its purposes, who is responsible, and the standards it must meet.", legalRefs: ["cnil.pia.method"], evidence: "none" },
          { key: "purposes", label: "Purposes", type: "long_text", required: true, legalRefs: ["eugdpr.art5"], evidence: "none" },
          { key: "controller", label: "Who is the controller, and are there joint controllers or processors?", type: "long_text", required: true, legalRefs: ["eugdpr.art30"], evidence: "none" },
          { key: "data_categories", label: "Categories of personal data", type: "data_category", required: true, legalRefs: ["eugdpr.art30"], evidence: "none" },
          { key: "special_category", label: "Does it involve special category or criminal offence data?", type: "boolean", required: true, legalRefs: ["eugdpr.art9"], evidence: "none" },
          { key: "special_category_detail", label: "Which categories, and on what condition?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "special_category", value: true },
            requireWhen: { op: "equals", question: "special_category", value: true },
            legalRefs: ["eugdpr.art9"], evidence: "none" },
          { key: "data_subjects", label: "Categories of data subject", type: "long_text", required: true, help: "Note where they include children or others in a position of dependence.", legalRefs: ["cnil.pia.method"], evidence: "none" },
          { key: "lifecycle", label: "Describe the data lifecycle", type: "long_text", required: true, help: "Collection, use, storage, transmission and erasure — the method asks for the processes, not just the fields.", legalRefs: ["cnil.pia.method"], evidence: "none" },
          { key: "supporting_assets", label: "Supporting assets", type: "long_text", required: true, help: "Hardware, software, networks, people, paper and premises the data depends on.", legalRefs: ["cnil.pia.knowledge"], evidence: "none" },
          { key: "retention", label: "Retention period, and how it is decided", type: "short_text", required: true, legalRefs: ["eugdpr.art5"], evidence: "none" },
        ],
      },
      {
        key: "principles",
        title: "Fundamental principles",
        description: "Proportionality and necessity, and the controls protecting data subjects' rights.",
        questions: [
          { key: "lawful_basis", label: "Lawful basis", type: "single_select", required: true, legalRefs: ["eugdpr.art6"], evidence: "none",
            options: [
              { value: "consent", label: "Consent" },
              { value: "contract", label: "Contract" },
              { value: "legal_obligation", label: "Legal obligation" },
              { value: "vital_interests", label: "Vital interests" },
              { value: "public_task", label: "Public interest or official authority" },
              { value: "legitimate_interests", label: "Legitimate interests" },
            ] },
          { key: "lia_reference", label: "Where is the legitimate interests assessment recorded?", type: "short_text", required: false,
            showWhen: { op: "equals", question: "lawful_basis", value: "legitimate_interests" },
            requireWhen: { op: "equals", question: "lawful_basis", value: "legitimate_interests" },
            legalRefs: ["eugdpr.art6.1f", "edpb.gl01-2024"], evidence: "required" },
          { key: "proportionality", label: "Why is the processing proportionate to its purpose?", type: "long_text", required: true, help: "Including why the data collected is adequate, relevant and limited to what is necessary.", legalRefs: ["eugdpr.art5"], evidence: "none" },
          { key: "alternatives", label: "What less intrusive alternatives were considered, and why were they rejected?", type: "long_text", required: true, legalRefs: ["cnil.pia.method"], evidence: "none" },
          { key: "information", label: "How are data subjects informed?", type: "long_text", required: true, legalRefs: ["eugdpr.art13"], evidence: "optional" },
          { key: "rights", label: "How can they exercise access, rectification, erasure, restriction, portability and objection?", type: "long_text", required: true, legalRefs: ["eugdpr.art21"], evidence: "none" },
          { key: "automated_decisions", label: "Does it involve automated decisions producing legal or similarly significant effects?", type: "boolean", required: true, legalRefs: ["eugdpr.art22"], evidence: "none" },
          { key: "human_intervention", label: "How is human intervention provided for?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "automated_decisions", value: true },
            requireWhen: { op: "equals", question: "automated_decisions", value: true },
            legalRefs: ["eugdpr.art22"], evidence: "none" },
          { key: "processor_obligations", label: "How are processor obligations governed?", type: "long_text", required: true, legalRefs: ["eugdpr.art30"], evidence: "optional" },
          { key: "transfers_outside_eea", label: "Is personal data transferred outside the EEA?", type: "boolean", required: true, legalRefs: ["eugdpr.art44"], evidence: "none" },
          { key: "transfer_countries", label: "Which countries?", type: "country", required: false,
            showWhen: { op: "equals", question: "transfers_outside_eea", value: true },
            requireWhen: { op: "equals", question: "transfers_outside_eea", value: true },
            legalRefs: ["eugdpr.art44"], evidence: "none" },
          { key: "transfer_tool", label: "Which Chapter V transfer tool applies, and where is the transfer impact assessment?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "transfers_outside_eea", value: true },
            requireWhen: { op: "equals", question: "transfers_outside_eea", value: true },
            legalRefs: ["eugdpr.art46", "edpb.rec01-2020"], evidence: "required" },
        ],
      },
      {
        key: "access",
        title: "Risk: illegitimate access to data",
        description: "Data reaching somebody who should not have it.",
        questions: fearedEvent(
          "access",
          "Illegitimate access",
          "What could happen to people if the data were disclosed or accessed by somebody without authorisation.",
        ),
      },
      {
        key: "modification",
        title: "Risk: unwanted modification of data",
        description: "Data altered when it should not have been.",
        questions: fearedEvent(
          "modification",
          "Unwanted modification",
          "What could happen to people if the data were changed, corrupted or made inaccurate.",
        ),
      },
      {
        key: "disappearance",
        title: "Risk: disappearance of data",
        description: "Data lost or made unavailable.",
        questions: fearedEvent(
          "disappearance",
          "Disappearance",
          "What could happen to people if the data were lost, destroyed or became unavailable.",
        ),
      },
      {
        key: "validation",
        title: "Validation",
        description: "The overall judgement, and who made it.",
        questions: [
          { key: "overall_severity", label: "Overall severity, having considered all three feared events", type: "single_select", required: true, options: SEVERITY, help: "Your judgement across the three. It is not computed for you: a maximum taken by the platform would look like an assessment somebody made.", legalRefs: ["cnil.pia.method"], evidence: "none" },
          { key: "overall_likelihood", label: "Overall likelihood, having considered all three feared events", type: "single_select", required: true, options: LIKELIHOOD, legalRefs: ["cnil.pia.method"], evidence: "none" },
          { key: "residual_acceptable", label: "Are the residual risks acceptable?", type: "boolean", required: true, legalRefs: ["eugdpr.art35"], evidence: "none" },
          { key: "prior_consultation", label: "Is prior consultation with the supervisory authority required?", type: "boolean", required: true, help: "Required where a high residual risk remains after mitigation.", legalRefs: ["eugdpr.art36"], evidence: "none" },
          { key: "dpo_opinion", label: "The data protection officer's opinion", type: "long_text", required: true, legalRefs: ["eugdpr.art35"], evidence: "none" },
          { key: "subjects_consulted", label: "Were the views of data subjects or their representatives sought?", type: "boolean", required: true, legalRefs: ["eugdpr.art35"], evidence: "none" },
          { key: "subjects_consulted_detail", label: "What did they say, or why was it not sought?", type: "long_text", required: true, legalRefs: ["eugdpr.art35"], evidence: "none" },
          { key: "review_date", label: "When will this be reviewed?", type: "date", required: true, legalRefs: ["cnil.pia.method"], evidence: "none" },
        ],
      },
    ],
  },
  scoring: {
    method: "likelihood_impact",
    likelihoodQuestion: "overall_likelihood",
    impactQuestion: "overall_severity",
    // The CNIL's four levels, mapped onto the register's 1-4 scale so a PIA
    // and a UK DPIA land on the same axis and the board sees one number.
    likelihoodScale: { negligible: 1, limited: 2, significant: 3, maximum: 4 },
    impactScale: { negligible: 1, limited: 2, significant: 3, maximum: 4 },
    bands: [
      { min: 1, max: 3, label: "Low", tier: "low" },
      { min: 4, max: 7, label: "Medium", tier: "medium" },
      { min: 8, max: 11, label: "High", tier: "high" },
      { min: 12, max: 16, label: "Critical", tier: "critical" },
    ],
  },
  reviewIntervalMonths: 12,
};
