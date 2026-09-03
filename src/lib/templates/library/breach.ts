import type { TemplateDefinition } from "../schema";

/**
 * A breach severity assessment, following the ICO's guidance.
 *
 * The ICO asks the same question the Regulation does — is the breach likely to
 * result in a risk to people's rights and freedoms, and is that risk high —
 * and sets out the factors to weigh in answering it: the type of breach, the
 * nature, sensitivity and volume of the data, how easily individuals can be
 * identified, the severity of the consequences, any special characteristics of
 * the individuals or of the controller, and how many people are affected.
 *
 * Those factors are the ICO's restatement of the WP29 list in WP250, which is
 * cited alongside so a reviewer can see where they come from rather than
 * taking the arrangement on trust.
 *
 * Scored as a weighted sum, because this is a multi-factor triage rather than
 * a likelihood-and-impact judgement. The bands are written to answer the two
 * statutory questions directly, and the register still requires a person to
 * record the decision and why: this proposes, it does not decide.
 */
export const BREACH_SEVERITY: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "breach",
        title: "The breach",
        description: "What happened, and what kind of failure it was.",
        questions: [
          { key: "summary", label: "What happened?", type: "long_text", required: true, legalRefs: ["ukgdpr.art33"], evidence: "none" },
          { key: "breach_type", label: "What kind of breach is it?", type: "multi_select", required: true,
            help: "More than one can apply. Ransomware that exfiltrated before encrypting is both a confidentiality and an availability breach.",
            legalRefs: ["ico.breach", "wp29.wp250"], evidence: "none",
            options: [
              { value: "confidentiality", label: "Confidentiality — disclosed to or accessed by somebody unauthorised", weight: 3 },
              { value: "integrity", label: "Integrity — altered without authorisation", weight: 2 },
              { value: "availability", label: "Availability — lost, destroyed or inaccessible", weight: 2 },
            ] },
          { key: "recoverable", label: "Has the data been recovered or the access closed off?", type: "single_select", required: true,
            legalRefs: ["ico.breach"], evidence: "none",
            options: [
              { value: "contained", label: "Yes — contained, and recipients identified and cooperative", weight: -2 },
              { value: "partly", label: "Partly — contained but the extent is uncertain", weight: 2 },
              { value: "no", label: "No — still exposed, or the data is irretrievable", weight: 4 },
            ] },
          { key: "unintelligible", label: "Was the data unintelligible to anyone unauthorised?", type: "single_select", required: true,
            help: "Encryption or effective pseudonymisation, with keys held separately. This is the Article 34(3)(a) exemption and a question of fact.",
            legalRefs: ["ukgdpr.art34"], evidence: "optional",
            options: [
              { value: "yes", label: "Yes — strong encryption, keys not compromised", weight: -4 },
              { value: "partly", label: "Partly — some fields protected, or the strength is uncertain", weight: 0 },
              { value: "no", label: "No — readable as it stands", weight: 2 },
            ] },
        ],
      },
      {
        key: "data",
        title: "The data",
        description: "Its nature, sensitivity and volume — the ICO's first three factors.",
        questions: [
          { key: "data_categories", label: "What categories of personal data are involved?", type: "data_category", required: true, legalRefs: ["ico.breach"], evidence: "none" },
          { key: "sensitivity", label: "How sensitive is it?", type: "single_select", required: true,
            legalRefs: ["ico.breach", "wp29.wp250"], evidence: "none",
            options: [
              { value: "basic", label: "Basic — name and business contact details alone", weight: 0 },
              { value: "behavioural", label: "Behavioural or financial — transactions, location, browsing", weight: 3 },
              { value: "special", label: "Special category or criminal offence data", weight: 5 },
              { value: "combination", label: "A combination that builds a profile of the person", weight: 4 },
            ] },
          { key: "special_category", label: "Does it include special category or criminal offence data?", type: "boolean", required: true, legalRefs: ["ukgdpr.art9"], evidence: "none" },
          { key: "special_category_detail", label: "Which, and about how many people?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "special_category", value: true },
            requireWhen: { op: "equals", question: "special_category", value: true },
            legalRefs: ["ukgdpr.art9"], evidence: "none" },
          { key: "identifiability", label: "How easily can individuals be identified from it?", type: "single_select", required: true,
            help: "The ICO treats ease of identification as a factor in its own right: the same data is more serious when it names people.",
            legalRefs: ["ico.breach", "wp29.wp250"], evidence: "none",
            options: [
              { value: "direct", label: "Directly — names, addresses or account identifiers", weight: 3 },
              { value: "indirect", label: "Indirectly — with effort, or by combining with other data", weight: 2 },
              { value: "unlikely", label: "Unlikely — aggregated or effectively pseudonymised", weight: 0 },
            ] },
          { key: "volume", label: "How much data per person?", type: "single_select", required: true,
            legalRefs: ["ico.breach"], evidence: "none",
            options: [
              { value: "single_field", label: "A single field each", weight: 0 },
              { value: "record", label: "A full record each", weight: 2 },
              { value: "history", label: "A history — several records, or a long period", weight: 3 },
            ] },
        ],
      },
      {
        key: "people",
        title: "The people affected",
        description: "How many, and whether any of them warrant particular care.",
        questions: [
          { key: "subjects_affected", label: "Approximately how many people?", type: "number", required: true,
            help: "An estimate recorded beats a blank field. Article 33(3)(a) asks for approximate numbers.",
            legalRefs: ["ukgdpr.art33"], evidence: "none" },
          { key: "scale", label: "How would you characterise that number?", type: "single_select", required: true,
            legalRefs: ["ico.breach"], evidence: "none",
            options: [
              { value: "individual", label: "One person, or a handful", weight: -1 },
              { value: "group", label: "Tens to hundreds", weight: 2 },
              { value: "large", label: "Thousands or more", weight: 3 },
            ] },
          { key: "vulnerable", label: "Are any of them children or otherwise vulnerable?", type: "single_select", required: true,
            help: "The ICO treats special characteristics of the individual as raising severity in its own right.",
            legalRefs: ["ico.breach", "wp29.wp250"], evidence: "none",
            options: [
              { value: "no", label: "No", weight: 0 },
              { value: "some", label: "Some may be", weight: 2 },
              { value: "yes", label: "Yes — children, patients, or people in a position of dependence", weight: 4 },
            ] },
          { key: "controller_character", label: "Does the nature of your organisation make the data more revealing?", type: "single_select", required: true,
            help: "The ICO's factor on special characteristics of the controller: being a patient of a clinic, or a client of a debt service, is itself sensitive information.",
            legalRefs: ["ico.breach", "wp29.wp250"], evidence: "none",
            options: [
              { value: "no", label: "No — the association reveals nothing in itself", weight: 0 },
              { value: "yes", label: "Yes — being on our records is itself revealing", weight: 3 },
            ] },
        ],
      },
      {
        key: "consequences",
        title: "Consequences",
        description: "What could happen to the people affected — the ICO's severity factor.",
        questions: [
          { key: "consequences", label: "What are the likely consequences for them?", type: "long_text", required: true,
            help: "Article 33(3)(c). Written from their position rather than the organisation's.",
            legalRefs: ["ukgdpr.art33"], evidence: "none" },
          { key: "harm_type", label: "Which kinds of harm are realistic?", type: "multi_select", required: true,
            legalRefs: ["ico.breach", "wp29.wp250"], evidence: "none",
            options: [
              { value: "distress", label: "Distress, embarrassment or anxiety", weight: 1 },
              { value: "financial", label: "Financial loss or fraud", weight: 3 },
              { value: "identity", label: "Identity theft", weight: 4 },
              { value: "discrimination", label: "Discrimination or reputational damage", weight: 4 },
              { value: "physical", label: "Physical harm, or risk to safety", weight: 5 },
              { value: "rights", label: "Loss of control over their data, or inability to exercise rights", weight: 2 },
            ] },
          { key: "mitigated", label: "Have measures reduced the risk since it happened?", type: "single_select", required: true,
            help: "This is the Article 34(3)(b) question: whether the high risk is no longer likely to materialise.",
            legalRefs: ["ukgdpr.art34"], evidence: "optional",
            options: [
              { value: "substantially", label: "Substantially — the exposure has been undone", weight: -3 },
              { value: "partly", label: "Partly", weight: -1 },
              { value: "no", label: "No", weight: 0 },
            ] },
          { key: "measures", label: "What measures have been taken or are proposed?", type: "long_text", required: true,
            help: "Article 33(3)(d), including anything to mitigate possible adverse effects.",
            legalRefs: ["ukgdpr.art33"], evidence: "optional" },
        ],
      },
      {
        key: "conclusion",
        title: "Conclusion",
        description:
          "The two statutory questions. The score above informs them; it does not answer them.",
        questions: [
          { key: "reportable_view", label: "Is the breach likely to result in a risk to rights and freedoms?", type: "single_select", required: true,
            help: "If yes, Article 33 requires the supervisory authority to be told within seventy-two hours of becoming aware.",
            legalRefs: ["ukgdpr.art33"], evidence: "none",
            options: [
              { value: "yes", label: "Yes — notify the supervisory authority" },
              { value: "no", label: "No — unlikely to result in a risk, so Article 33 does not require notification" },
              { value: "undecided", label: "Not yet decided" },
            ] },
          { key: "communicable_view", label: "Is that risk high?", type: "single_select", required: true,
            help: "If yes, Article 34 requires the people affected to be told without undue delay, unless an Article 34(3) exemption applies.",
            legalRefs: ["ukgdpr.art34"], evidence: "none",
            options: [
              { value: "yes", label: "Yes — tell the people affected" },
              { value: "exempt", label: "Yes, but an Article 34(3) exemption applies" },
              { value: "no", label: "No — not a high risk" },
              { value: "undecided", label: "Not yet decided" },
            ] },
          { key: "exemption", label: "Which exemption, and why does it apply?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "communicable_view", value: "exempt" },
            requireWhen: { op: "equals", question: "communicable_view", value: "exempt" },
            help: "34(3)(a) unintelligible data; 34(3)(b) subsequent measures; 34(3)(c) disproportionate effort, which substitutes a public communication rather than removing the obligation.",
            legalRefs: ["ukgdpr.art34"], evidence: "none" },
          { key: "reasoning", label: "Why?", type: "long_text", required: true,
            help: "The reasoning is the assessment. This is the sentence a regulator would ask about, and it is recorded against the breach as well.",
            legalRefs: ["ukgdpr.art33"], evidence: "none" },
          { key: "assessed_by", label: "Who reached this view?", type: "short_text", required: true, legalRefs: ["ico.breach"], evidence: "none" },
        ],
      },
    ],
  },
  scoring: {
    method: "weighted_sum",
    questions: [
      "breach_type", "recoverable", "unintelligible",
      "sensitivity", "identifiability", "volume",
      "scale", "vulnerable", "controller_character",
      "harm_type", "mitigated",
    ],
    /**
     * Bands written to answer the statutory questions rather than to describe
     * badness. The wording tells somebody what the Regulation then requires,
     * and the register still asks a person to decide and say why.
     */
    bands: [
      { min: -15, max: 6, label: "Unlikely to result in a risk — Article 33 notification not indicated", tier: "low" },
      { min: 7, max: 13, label: "A risk to rights and freedoms — notify the supervisory authority", tier: "medium" },
      { min: 14, max: 22, label: "High risk — notify, and tell the people affected", tier: "high" },
      { min: 23, max: 100, label: "High risk, severe — notify and communicate urgently", tier: "critical" },
    ],
  },
};
