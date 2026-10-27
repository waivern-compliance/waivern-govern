import { AI_CONTRACT_TERMS } from "@/lib/thirdparty/ai-procurement";
import type { TemplateDefinition } from "../schema";

/**
 * Assessing a supplier that uses or supplies AI.
 *
 * Built from PPN 02/24's disclosure questions, the Crown Commercial Service's
 * data ethics requirements for suppliers, and the AI Playbook's advice on
 * specifying AI: understand the supplier's approach, the quality and limits of
 * its data, how to avoid lock-in, and who owns what is built.
 *
 * Several keys are read back by the third-party register — `ai_involvement`,
 * `trains_on_our_data`, `contract_terms`, `recommendation` — so the gaps it
 * shows come from what was signed off here. Renaming them would silently stop
 * the register seeing them.
 *
 * PPN 02/24 is explicit that a supplier's use of AI is not in itself a reason
 * to exclude it, and nothing here scores AI use as risk. The score rises with
 * what is unknown or unprotected: training on our data, no test evidence, no
 * defence against AI-specific attacks, no way out.
 *
 * Contains public sector information licensed under the Open Government Licence v3.0.
 */
export const AI_SUPPLIER: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "ai_use",
        title: "The supplier's use of AI",
        description: "What AI the supplier uses or supplies, and where it comes from.",
        questions: [
          { key: "supplier_name", label: "Which supplier is this?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "ai_involvement", label: "How does the supplier use AI?", type: "single_select", required: true,
            help: "PPN 02/24 asks suppliers to say where they use AI, both in delivering services and in their bids. Using AI is not grounds to exclude a supplier.",
            legalRefs: ["ppn.0224"], evidence: "none",
            options: [
              { value: "in_delivery", label: "Uses AI in delivering the service to us", weight: 0 },
              { value: "ai_product", label: "Supplies an AI product, model or service", weight: 0 },
              { value: "none", label: "Does not use AI in what it provides", weight: 0 },
            ] },
          { key: "ai_description", label: "What AI, doing what, and built on which models from whom?", type: "long_text", required: false,
            showWhen: { op: "notEquals", question: "ai_involvement", value: "none" },
            requireWhen: { op: "notEquals", question: "ai_involvement", value: "none" },
            legalRefs: ["ppn.0224", "gds.aiplaybook"], evidence: "optional" },
          { key: "model_provenance", label: "Whose model is it?", type: "single_select", required: false,
            showWhen: { op: "notEquals", question: "ai_involvement", value: "none" },
            legalRefs: ["ooai.procurement"], evidence: "none",
            options: [
              { value: "own", label: "The supplier's own" },
              { value: "foundation_third_party", label: "A third party's foundation model, which the supplier builds on" },
              { value: "open_weights", label: "An open-weights model" },
              { value: "mixed", label: "A mix" },
              { value: "unknown", label: "Not established" },
            ] },
          { key: "bid_ai_use", label: "Did the supplier use AI to prepare its bid?", type: "single_select", required: false,
            help: "PPN 02/24 suggests asking, so that claims in the bid can be checked rather than taken as written.",
            legalRefs: ["ppn.0224"], evidence: "none",
            options: [
              { value: "yes", label: "Yes, and said so" },
              { value: "no", label: "No" },
              { value: "not_asked", label: "Not asked" },
            ] },
        ],
      },
      {
        key: "data",
        title: "Our data",
        questions: [
          { key: "trains_on_our_data", label: "Does the supplier use our data to train or improve its models?", type: "single_select", required: true,
            help: "Including data about the people we serve, and prompts and outputs.",
            legalRefs: ["ccs.dataethics", "ukgdpr.art5"], evidence: "optional",
            options: [
              { value: "no", label: "No — the contract excludes it", weight: 0 },
              { value: "with_agreement", label: "Only where we have agreed to it", weight: 1 },
              { value: "yes_without_agreement", label: "Yes, without our agreement", weight: 6 },
              { value: "unknown", label: "Not established", weight: 4 },
            ] },
          { key: "personal_data", label: "Will it process personal data on our behalf?", type: "boolean", required: true,
            help: "If so it is a processor, and the third-party register checks for an Article 28 agreement separately.",
            legalRefs: ["ukgdpr.art28"], evidence: "none" },
          { key: "data_quality", label: "What does the supplier say about the quality, bias and limits of the data its AI was trained on?", type: "long_text", required: false,
            help: "The Playbook asks buyers to focus on data quality, bias mitigation and limitations when specifying AI.",
            legalRefs: ["gds.aiplaybook", "ccs.dataethics"], evidence: "optional" },
        ],
      },
      {
        key: "assurance",
        title: "Testing and transparency",
        questions: [
          { key: "testing_evidence", label: "What evidence of testing has the supplier given?", type: "single_select", required: true,
            legalRefs: ["dsit.airmt"], evidence: "optional",
            options: [
              { value: "independent", label: "Results of independent testing or audit", weight: 0 },
              { value: "own", label: "The supplier's own test results only", weight: 2 },
              { value: "none", label: "None", weight: 5 },
            ] },
          { key: "bias_testing", label: "Has the supplier tested for bias across the groups our use affects?", type: "single_select", required: true,
            legalRefs: ["ccs.dataethics", "uk.equality2010"], evidence: "optional",
            options: [
              { value: "done", label: "Yes, with results", weight: 0 },
              { value: "partial", label: "In part", weight: 2 },
              { value: "none", label: "No", weight: 4 },
              { value: "not_relevant", label: "Not relevant — the AI makes no judgement about people", weight: 0 },
            ] },
          { key: "explainability", label: "Can the supplier explain how outputs are produced, to the level our use needs?", type: "single_select", required: true,
            legalRefs: ["ccs.dataethics", "ico.ai"], evidence: "none",
            options: [
              { value: "yes", label: "Yes", weight: 0 },
              { value: "partly", label: "Partly", weight: 2 },
              { value: "no", label: "No", weight: 4 },
            ] },
          { key: "atrs_support", label: "Will the supplier provide what a transparency record needs?", type: "single_select", required: true,
            help: "An Algorithmic Transparency Recording Standard record asks about the model, its data and its testing — information only the supplier may hold.",
            legalRefs: ["atrs"], evidence: "none",
            options: [
              { value: "yes", label: "Yes", weight: 0 },
              { value: "partly", label: "Partly", weight: 1 },
              { value: "no", label: "No", weight: 3 },
              { value: "not_needed", label: "No record will be needed", weight: 0 },
            ] },
          { key: "data_ethics", label: "Has the supplier answered the Crown Commercial Service's data ethics requirements?", type: "single_select", required: true,
            legalRefs: ["ccs.dataethics"], evidence: "optional",
            options: [
              { value: "answered", label: "Yes, in full", weight: 0 },
              { value: "partly", label: "In part", weight: 1 },
              { value: "not_asked", label: "Not asked", weight: 2 },
            ] },
        ],
      },
      {
        key: "security",
        title: "Security",
        questions: [
          { key: "security_assurance", label: "What security assurance does the supplier hold for this service?", type: "multi_select", required: true,
            legalRefs: ["ncsc.caf"], evidence: "optional",
            options: [
              { value: "iso27001", label: "ISO/IEC 27001" },
              { value: "cyber_essentials_plus", label: "Cyber Essentials Plus" },
              { value: "soc2", label: "SOC 2" },
              { value: "caf", label: "Assessed against the Cyber Assessment Framework" },
              { value: "none", label: "None" },
            ] },
          { key: "ai_threats", label: "Has the supplier shown how it defends against attacks specific to AI — prompt injection, data poisoning, model extraction?", type: "single_select", required: true,
            legalRefs: ["ncsc.mlprinciples"], evidence: "optional",
            options: [
              { value: "yes", label: "Yes", weight: 0 },
              { value: "partly", label: "Partly", weight: 2 },
              { value: "no", label: "No", weight: 4 },
            ] },
        ],
      },
      {
        key: "contract",
        title: "The contract",
        questions: [
          { key: "contract_terms", label: "Which of these does the contract hold the supplier to?", type: "multi_select", required: true,
            help: "The first five are expected for any AI supply; the register reports a contract without them.",
            legalRefs: ["ppn.0224", "ooai.procurement", "dsit.airmt"], evidence: "optional",
            options: AI_CONTRACT_TERMS.map((t) => ({ value: t.value, label: t.label })) },
          { key: "ip_ownership", label: "Who owns models, outputs and anything developed for us?", type: "long_text", required: false,
            legalRefs: ["gds.aiplaybook"], evidence: "none" },
          { key: "lock_in", label: "How hard would it be to move to another supplier?", type: "single_select", required: true,
            help: "The Playbook asks buyers to plan against vendor lock-in from the start.",
            legalRefs: ["gds.aiplaybook"], evidence: "none",
            options: [
              { value: "straightforward", label: "Straightforward", weight: 0 },
              { value: "possible", label: "Possible, with effort", weight: 1 },
              { value: "hard", label: "Hard — data, prompts or integrations would not come with us", weight: 3 },
            ] },
          { key: "fallback", label: "Could the service continue if the supplier's AI failed or was withdrawn?", type: "single_select", required: true,
            legalRefs: ["dsit.airmt"], evidence: "none",
            options: [
              { value: "yes", label: "Yes", weight: 0 },
              { value: "degraded", label: "In a reduced form", weight: 1 },
              { value: "no", label: "No", weight: 3 },
            ] },
        ],
      },
      {
        key: "conclusion",
        title: "Conclusion",
        questions: [
          { key: "recommendation", label: "What do you recommend?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "proceed", label: "Proceed" },
              { value: "proceed_with_conditions", label: "Proceed, with conditions" },
              { value: "do_not_proceed", label: "Do not proceed" },
            ] },
          { key: "conditions", label: "On what conditions?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "recommendation", value: "proceed_with_conditions" },
            requireWhen: { op: "equals", question: "recommendation", value: "proceed_with_conditions" },
            legalRefs: [], evidence: "none" },
        ],
      },
    ],
  },
  scoring: {
    method: "weighted_sum",
    questions: [
      "trains_on_our_data",
      "testing_evidence",
      "bias_testing",
      "explainability",
      "atrs_support",
      "data_ethics",
      "ai_threats",
      "lock_in",
      "fallback",
    ],
    // The worst case sums to 34. A supplier that excludes training on our data,
    // has been tested independently and can be left behind stays in the first
    // band; one that trains on our data and offers nothing to check cannot get
    // below the third.
    bands: [
      { min: 0, max: 5, label: "Low", tier: "low" },
      { min: 6, max: 12, label: "Moderate", tier: "medium" },
      { min: 13, max: 20, label: "High", tier: "high" },
      { min: 21, max: 100, label: "Not acceptable without change", tier: "critical" },
    ],
  },
  reviewIntervalMonths: 12,
};
