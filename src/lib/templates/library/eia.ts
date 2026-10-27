import type { Question, TemplateDefinition } from "../schema";

/**
 * Equality impact assessment, for the public sector equality duty.
 *
 * Section 149 of the Equality Act 2010 requires a public body to have due
 * regard to three aims: eliminating discrimination, advancing equality of
 * opportunity, and fostering good relations. The duty does not require a
 * document, but an assessment is how a body shows it had that regard — and
 * the AI Playbook names it as one way to guard against bias.
 *
 * Impact is asked for each protected characteristic in turn, because "no
 * impact on anyone" written once is the answer that fails when challenged.
 * An impact nobody has looked into is scored close to an adverse one: not
 * knowing is the failure the duty is about.
 *
 * Marriage and civil partnership is asked only against the first aim, as
 * section 149(7) leaves it out of the other two.
 *
 * Contains public sector information licensed under the Open Government Licence v3.0.
 */

const CHARACTERISTICS: Array<{ key: string; label: string; help?: string }> = [
  { key: "age", label: "Age" },
  { key: "disability", label: "Disability", help: "Including whether people using assistive technology can use it, and whether the system performs as well for them." },
  { key: "gender_reassignment", label: "Gender reassignment" },
  { key: "marriage_civil_partnership", label: "Marriage and civil partnership", help: "Relevant to eliminating discrimination only — section 149(7) leaves it out of the other two aims." },
  { key: "pregnancy_maternity", label: "Pregnancy and maternity" },
  { key: "race", label: "Race", help: "Including ethnic or national origins, nationality and colour — and language, where the system works less well in some." },
  { key: "religion_belief", label: "Religion or belief" },
  { key: "sex", label: "Sex" },
  { key: "sexual_orientation", label: "Sexual orientation" },
];

function impactQuestions({ key, label, help }: (typeof CHARACTERISTICS)[number]): Question[] {
  return [
    {
      key: `impact_${key}`,
      label,
      type: "single_select",
      required: true,
      help,
      legalRefs: ["uk.equality2010", "uk.equality2010.s149"],
      evidence: "none",
      options: [
        { value: "positive", label: "Positive", weight: 0 },
        { value: "neutral", label: "No different from anyone else", weight: 0 },
        { value: "adverse", label: "Adverse", weight: 3 },
        { value: "unknown", label: "Not known — not yet looked into", weight: 2 },
      ],
    },
    {
      key: `impact_${key}_detail`,
      label: `What is the ${label.toLowerCase()} impact, and on what evidence?`,
      type: "long_text",
      required: false,
      showWhen: {
        op: "or",
        any: [
          { op: "equals", question: `impact_${key}`, value: "adverse" },
          { op: "equals", question: `impact_${key}`, value: "positive" },
        ],
      },
      requireWhen: { op: "equals", question: `impact_${key}`, value: "adverse" },
      legalRefs: ["uk.equality2010.s149"],
      evidence: "optional",
    },
  ];
}

export const EIA: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "proposal",
        title: "What is being assessed",
        questions: [
          { key: "proposal_name", label: "What is the policy, service or system?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "proposal_summary", label: "What does it do, who does it affect, and what decisions follow from it?", type: "long_text", required: true, legalRefs: [], evidence: "none" },
          { key: "public_function", label: "Is this the exercise of a public function?", type: "boolean", required: true,
            help: "The equality duty applies to public bodies, and to others when they carry out public functions. Where it does not apply, this assessment is still good practice.",
            legalRefs: ["uk.equality2010.s149"], evidence: "none" },
          { key: "uses_ai", label: "Does it use AI or automated decision-making?", type: "boolean", required: true, legalRefs: ["gds.aiplaybook"], evidence: "none" },
        ],
      },
      {
        key: "evidence",
        title: "Evidence and engagement",
        questions: [
          { key: "evidence_used", label: "What evidence did you use about the people affected?", type: "long_text", required: true,
            help: "Data on who uses the service, research, complaints, previous assessments.",
            legalRefs: ["ehrc.psed"], evidence: "optional" },
          { key: "evidence_gaps", label: "What do you not know, and how will you find out?", type: "long_text", required: true, legalRefs: ["ehrc.psed"], evidence: "none" },
          { key: "engagement", label: "Who did you engage with — people affected, or groups representing them — and what did they tell you?", type: "long_text", required: true,
            legalRefs: ["ehrc.psed", "gds.aiplaybook"], evidence: "optional" },
          { key: "performance_by_group", label: "Has the system's accuracy or performance been measured across protected characteristics?", type: "single_select", required: false,
            help: "The AI Playbook suggests evaluating the accuracy and quality of outputs against the characteristics in the Equality Act.",
            showWhen: { op: "equals", question: "uses_ai", value: true },
            requireWhen: { op: "equals", question: "uses_ai", value: true },
            legalRefs: ["gds.aiplaybook", "ico.ai"], evidence: "optional",
            options: [
              { value: "no_material_difference", label: "Yes — no material difference found", weight: 0 },
              { value: "differences_found", label: "Yes — differences found", weight: 3 },
              { value: "not_measured", label: "No", weight: 3 },
            ] },
        ],
      },
      {
        key: "impacts",
        title: "Impact on each protected characteristic",
        description: "Positive, none, adverse, or not yet known — for each one in turn.",
        questions: [
          ...CHARACTERISTICS.flatMap(impactQuestions),
          { key: "other_groups", label: "Any other groups affected — for example by socio-economic disadvantage, caring responsibilities or digital exclusion?", type: "long_text", required: false,
            help: "Not protected characteristics under the Act, but often where a service fails people, and many public bodies consider them as a matter of course.",
            legalRefs: [], evidence: "none" },
        ],
      },
      {
        key: "aims",
        title: "The three aims of the duty",
        questions: [
          { key: "aim_discrimination", label: "How will it avoid unlawful discrimination, harassment and victimisation?", type: "long_text", required: true, legalRefs: ["uk.equality2010.s149"], evidence: "none" },
          { key: "aim_opportunity", label: "How does it affect equality of opportunity between people who share a characteristic and those who do not?", type: "long_text", required: true, legalRefs: ["uk.equality2010.s149"], evidence: "none" },
          { key: "aim_relations", label: "How does it affect good relations between groups?", type: "long_text", required: true, legalRefs: ["uk.equality2010.s149"], evidence: "none" },
        ],
      },
      {
        key: "decision",
        title: "Decision",
        questions: [
          { key: "outcome", label: "What is the outcome?", type: "single_select", required: true, legalRefs: ["ehrc.psed"], evidence: "none",
            options: [
              { value: "no_change", label: "No major change needed", weight: 0 },
              { value: "adjust", label: "Adjust it to remove barriers or better advance equality", weight: 1 },
              { value: "continue_justified", label: "Continue despite adverse impact, which is justified", weight: 4 },
              { value: "stop", label: "Stop and rethink", weight: 0 },
            ] },
          { key: "justification", label: "Why is the adverse impact justified, and why is there no less discriminatory way?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "outcome", value: "continue_justified" },
            requireWhen: { op: "equals", question: "outcome", value: "continue_justified" },
            legalRefs: ["uk.equality2010"], evidence: "none" },
          { key: "actions", label: "What will be done to reduce adverse impact or advance equality?", type: "long_text", required: false,
            requireWhen: { op: "notEquals", question: "outcome", value: "no_change" },
            legalRefs: ["ehrc.psed"], evidence: "none" },
          { key: "monitoring", label: "How will the actual impact be monitored once it is in use?", type: "long_text", required: true, legalRefs: ["ehrc.psed"], evidence: "none" },
        ],
      },
    ],
  },
  scoring: {
    method: "weighted_sum",
    questions: [
      ...CHARACTERISTICS.map((c) => `impact_${c.key}`),
      "performance_by_group",
      "outcome",
    ],
    // One adverse impact, adjusted for, stays medium; several, or impacts
    // nobody has looked into across the board, go higher.
    bands: [
      { min: 0, max: 2, label: "Low", tier: "low" },
      { min: 3, max: 8, label: "Medium", tier: "medium" },
      { min: 9, max: 17, label: "High", tier: "high" },
      { min: 18, max: 100, label: "Significant adverse impact", tier: "critical" },
    ],
  },
  reviewIntervalMonths: 12,
};
