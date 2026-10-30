import type { TemplateDefinition } from "../schema";

/**
 * A DPIA covering the minimum content Article 35(7) requires: a description of
 * the processing, an assessment of necessity and proportionality, an assessment
 * of the risks, and the measures addressing them.
 *
 * Scoring is likelihood x impact, which is the method most organisations
 * already use in their wider risk register — a DPIA that scores on its own
 * private scale cannot be compared with anything else the board sees.
 *
 * It also covers the ten things the UK government AI Playbook says a DPIA of
 * AI should do: where the data comes from and goes, whether we are controller
 * or processor and who processes for us, the views of the people affected,
 * and — for AI and automated decisions — where they affect people, where a
 * person is involved, and the detriment bias or inaccuracy could cause.
 *
 * Automated decisions follow UK GDPR Articles 22A–22C as the Data (Use and
 * Access) Act 2025 left them: whether significant decisions are solely
 * automated, the 22B restrictions on special category data and on recognised
 * legitimate interests, and the four 22C safeguards.
 *
 * `residual_accepted` and `ico_consultation` are read by the AI register's
 * lifecycle gate: a system whose DPIA leaves high risk cannot go live until
 * the ICO has been consulted, because Article 36 requires consultation before
 * processing starts.
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
          { key: "controller_role", label: "What is our role in this processing?", type: "single_select", required: true, legalRefs: ["ukgdpr.art28"], evidence: "none",
            options: [
              { value: "controller", label: "Controller" },
              { value: "joint_controller", label: "Joint controller, with another organisation" },
              { value: "processor", label: "Processor, acting for another controller" },
            ] },
          { key: "processors", label: "Which processors act for us here, and under what agreement?", type: "long_text", required: false,
            help: "Name them as they appear on the third-party register, so the agreements can be checked.",
            legalRefs: ["ukgdpr.art28"], evidence: "none" },
          { key: "lawful_basis", label: "Lawful basis", type: "single_select", required: true, legalRefs: ["ukgdpr.art6"], evidence: "none",
            options: [
              { value: "consent", label: "Consent" },
              { value: "contract", label: "Contract" },
              { value: "legal_obligation", label: "Legal obligation" },
              { value: "vital_interests", label: "Vital interests" },
              { value: "public_task", label: "Public task" },
              { value: "recognised_legitimate_interests", label: "Recognised legitimate interests (Annex 1)" },
              { value: "legitimate_interests", label: "Legitimate interests" },
            ] },
          { key: "recognised_condition", label: "Which Annex 1 condition?", type: "single_select", required: false,
            showWhen: { op: "equals", question: "lawful_basis", value: "recognised_legitimate_interests" },
            requireWhen: { op: "equals", question: "lawful_basis", value: "recognised_legitimate_interests" },
            legalRefs: ["ukgdpr.art6.1ea", "ukgdpr.annex1"], evidence: "none",
            options: [
              { value: "public_task_disclosure", label: "Disclosure on request for another's public task (para 1)" },
              { value: "national_security", label: "National security, public security or defence (para 2)" },
              { value: "emergency", label: "Responding to an emergency (para 3)" },
              { value: "crime", label: "Detecting, investigating or preventing crime (para 5)" },
              { value: "safeguarding", label: "Safeguarding a vulnerable individual (para 6)" },
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
          { key: "sources_and_flows", label: "Where does the data come from, where does it go, and where is each part processed?", type: "long_text", required: true,
            help: "Map it through each stage — collection, preparation, training, testing, use, monitoring. Processing outside the UK may need a transfer assessment.",
            legalRefs: ["ukgdpr.art35.7", "gds.aiplaybook"], evidence: "optional" },
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
          { key: "views_sought", label: "Whose views did you seek about this processing, and what did they say?", type: "long_text", required: true,
            help: "Including whether the people concerned know it is happening. Where seeking views was not appropriate, say why.",
            legalRefs: ["ukgdpr.art35", "gds.aiplaybook"], evidence: "optional" },
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
            legalRefs: ["ukgdpr.art44a"], evidence: "none" },
          { key: "tra_reference", label: "Reference of the transfer risk assessment", type: "short_text", required: false,
            showWhen: { op: "equals", question: "transfers_abroad", value: true },
            help: "A separate TRA is required unless the transfer is approved by UK regulations under Article 45A.",
            legalRefs: ["ico.tra"], evidence: "none" },
        ],
      },
      {
        key: "automated",
        title: "AI and automated decisions",
        questions: [
          { key: "uses_ai", label: "Does the processing use AI or make automated decisions about people?", type: "boolean", required: true, legalRefs: ["ukgdpr.art22a", "ico.ai"], evidence: "none" },
          { key: "ai_impact_stages", label: "At which stages does AI or automated decision-making affect individuals?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "uses_ai", value: true },
            requireWhen: { op: "equals", question: "uses_ai", value: true },
            legalRefs: ["ukgdpr.art22a", "gds.aiplaybook"], evidence: "none" },
          { key: "human_involvement", label: "At which stages is a person involved in the decision, and can they change the outcome?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "uses_ai", value: true },
            requireWhen: { op: "equals", question: "uses_ai", value: true },
            legalRefs: ["ukgdpr.art22a", "ukgdpr.art22c"], evidence: "none" },
          { key: "solely_automated", label: "Are significant decisions about people taken solely by automated means?", type: "boolean", required: false,
            help: "Significant: a legal or similarly significant effect on them. Solely automated: no meaningful human involvement, considering how far the decision is reached by profiling. A person who only rubber-stamps the outcome is not meaningful involvement.",
            showWhen: { op: "equals", question: "uses_ai", value: true },
            requireWhen: { op: "equals", question: "uses_ai", value: true },
            legalRefs: ["ukgdpr.art22a"], evidence: "none" },
          { key: "adm_special_category", label: "Are those decisions based wholly or partly on special category data?", type: "boolean", required: false,
            showWhen: { op: "equals", question: "solely_automated", value: true },
            requireWhen: { op: "equals", question: "solely_automated", value: true },
            legalRefs: ["ukgdpr.art22b", "ukgdpr.art9"], evidence: "none" },
          { key: "adm_special_condition", label: "Which Article 22B condition is met?", type: "single_select", required: false,
            help: "Without one of these, the decision may not be taken solely by automated means: a person must be meaningfully involved.",
            showWhen: { op: "equals", question: "adm_special_category", value: true },
            requireWhen: { op: "equals", question: "adm_special_category", value: true },
            legalRefs: ["ukgdpr.art22b", "ukgdpr.art9"], evidence: "none",
            options: [
              { value: "explicit_consent", label: "Based entirely on data the person explicitly consented to (22B(2))" },
              { value: "contract_or_law", label: "Necessary for a contract with them, or required or authorised by law, and Article 9(2)(g) applies (22B(3))" },
              { value: "none", label: "None of these" },
            ] },
          { key: "adm_recognised_basis", label: "The processing relies on recognised legitimate interests, which Article 22B(4) does not allow for these decisions. How will a person be meaningfully involved instead, or which other basis applies?", type: "long_text", required: false,
            showWhen: { op: "and", all: [
              { op: "equals", question: "solely_automated", value: true },
              { op: "equals", question: "lawful_basis", value: "recognised_legitimate_interests" },
            ] },
            requireWhen: { op: "and", all: [
              { op: "equals", question: "solely_automated", value: true },
              { op: "equals", question: "lawful_basis", value: "recognised_legitimate_interests" },
            ] },
            legalRefs: ["ukgdpr.art22b", "ukgdpr.art6.1ea"], evidence: "none" },
          { key: "adm_safeguards", label: "Which safeguards are in place for these decisions?", type: "multi_select", required: false,
            help: "Article 22C requires all four.",
            showWhen: { op: "equals", question: "solely_automated", value: true },
            requireWhen: { op: "equals", question: "solely_automated", value: true },
            legalRefs: ["ukgdpr.art22c"], evidence: "optional",
            options: [
              { value: "information", label: "People are told about these decisions (22C(2)(a))" },
              { value: "representations", label: "They can make representations about them (22C(2)(b))" },
              { value: "human_intervention", label: "They can obtain human intervention (22C(2)(c))" },
              { value: "contest", label: "They can contest them (22C(2)(d))" },
            ] },
          { key: "adm_safeguards_how", label: "How does each safeguard work in practice, and who handles a request for review?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "solely_automated", value: true },
            requireWhen: { op: "equals", question: "solely_automated", value: true },
            legalRefs: ["ukgdpr.art22c"], evidence: "optional" },
          { key: "bias_inaccuracy", label: "What detriment could people suffer from bias or inaccuracy, and how has that been tested?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "uses_ai", value: true },
            requireWhen: { op: "equals", question: "uses_ai", value: true },
            legalRefs: ["ico.ai", "uk.equality2010"], evidence: "optional" },
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
          { key: "ico_consultation", label: "Where has prior consultation with the ICO got to?", type: "single_select", required: false,
            help: "Article 36 requires consultation before the processing starts. The ICO has eight weeks to give written advice, which it can extend by six.",
            showWhen: { op: "equals", question: "residual_accepted", value: true },
            requireWhen: { op: "equals", question: "residual_accepted", value: true },
            legalRefs: ["ukgdpr.art36"], evidence: "optional",
            options: [
              { value: "not_started", label: "Not yet consulted" },
              { value: "submitted", label: "Submitted, awaiting the ICO's advice" },
              { value: "advice_received", label: "The ICO's advice has been received" },
            ] },
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
