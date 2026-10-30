import type { TemplateDefinition } from "../schema";

/**
 * A legitimate interests assessment under UK GDPR Article 6(1): first whether
 * the processing falls within a recognised legitimate interest (point (ea),
 * Annex 1), and if not, the three-part test under point (f).
 *
 * Recognised legitimate interests were inserted by the Data (Use and Access)
 * Act 2025 from 5 February 2026. They need no balancing test, so where one
 * applies the assessment records the condition, why the processing is
 * necessary for it, and how objections are handled — Article 21(1) reaches
 * point (ea) too — and skips the purpose, necessity and balancing sections.
 *
 * On attribution: "LIA" is the ICO's name for this, and the CNIL does not
 * publish a template of its own. The substance is the Article itself and EDPB
 * Guidelines 1/2024, which set out the same three limbs — a purpose that is
 * legitimate, processing that is necessary for it, and a balance that does not
 * override the interests or rights of the people affected. That is what this
 * follows, and it is cited accordingly rather than to a body that did not
 * issue it.
 *
 * It is a template kind of its own rather than a section inside a DPIA,
 * because the test is required wherever the basis is relied on and most of
 * those cases never reach the DPIA threshold.
 *
 * Scored as a weighted sum, not likelihood times impact. The output is not a
 * risk rating: it is whether the basis holds. A balancing test that produced a
 * number on the risk register would be answering a different question from the
 * one it asked.
 */
export const LIA: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "recognised",
        title: "Recognised legitimate interests",
        description: "Does the processing fall within a condition in Annex 1? If it does, no balancing test is needed.",
        questions: [
          { key: "recognised_condition", label: "Does an Annex 1 condition apply?", type: "single_select", required: true,
            help: "Only these five. Anything else, however worthy, is an ordinary legitimate interest and needs the full test.",
            legalRefs: ["ukgdpr.art6.1ea", "ukgdpr.annex1"], evidence: "none",
            options: [
              { value: "no", label: "No — run the three-part test" },
              { value: "public_task_disclosure", label: "Disclosure on request for another's public task (Annex 1, para 1)" },
              { value: "national_security", label: "National security, public security or defence (para 2)" },
              { value: "emergency", label: "Responding to an emergency (para 3)" },
              { value: "crime", label: "Detecting, investigating or preventing crime (para 5)" },
              { value: "safeguarding", label: "Safeguarding a vulnerable individual (para 6)" },
            ] },
          { key: "recognised_activity_name", label: "Name of the processing", type: "short_text", required: false,
            showWhen: { op: "and", all: [{ op: "answered", question: "recognised_condition" }, { op: "notEquals", question: "recognised_condition", value: "no" }] },
            requireWhen: { op: "and", all: [{ op: "answered", question: "recognised_condition" }, { op: "notEquals", question: "recognised_condition", value: "no" }] },
            legalRefs: ["ukgdpr.art30"], evidence: "none" },
          { key: "recognised_necessity", label: "Why is the processing necessary for that purpose?", type: "long_text", required: false,
            help: "The condition applies only to processing that is necessary for it. Say what would not be possible without it.",
            showWhen: { op: "and", all: [{ op: "answered", question: "recognised_condition" }, { op: "notEquals", question: "recognised_condition", value: "no" }] },
            requireWhen: { op: "and", all: [{ op: "answered", question: "recognised_condition" }, { op: "notEquals", question: "recognised_condition", value: "no" }] },
            legalRefs: ["ukgdpr.annex1"], evidence: "optional" },
          { key: "recognised_request", label: "Who asked for the data, and on what legal basis do they need it?", type: "long_text", required: false,
            help: "Paragraph 1 applies only where the person asking needs it for a task in the public interest or official authority with a basis in law.",
            showWhen: { op: "equals", question: "recognised_condition", value: "public_task_disclosure" },
            requireWhen: { op: "equals", question: "recognised_condition", value: "public_task_disclosure" },
            legalRefs: ["ukgdpr.annex1"], evidence: "optional" },
          { key: "recognised_objection", label: "How can people object, and what compelling grounds would let you continue?", type: "long_text", required: false,
            help: "Article 21(1) reaches recognised legitimate interests: processing stops on objection unless you show compelling legitimate grounds, or need it for legal claims.",
            showWhen: { op: "and", all: [{ op: "answered", question: "recognised_condition" }, { op: "notEquals", question: "recognised_condition", value: "no" }] },
            requireWhen: { op: "and", all: [{ op: "answered", question: "recognised_condition" }, { op: "notEquals", question: "recognised_condition", value: "no" }] },
            legalRefs: ["ukgdpr.art21"], evidence: "none" },
          { key: "recognised_automated", label: "Does any significant decision rest solely on automated processing?", type: "single_select", required: false,
            help: "Article 22B does not allow a significant solely automated decision where the processing relies on recognised legitimate interests.",
            showWhen: { op: "and", all: [{ op: "answered", question: "recognised_condition" }, { op: "notEquals", question: "recognised_condition", value: "no" }] },
            requireWhen: { op: "and", all: [{ op: "answered", question: "recognised_condition" }, { op: "notEquals", question: "recognised_condition", value: "no" }] },
            legalRefs: ["ukgdpr.art22b"], evidence: "none",
            options: [
              { value: "no", label: "No" },
              { value: "yes", label: "Yes — another basis is needed for that decision" },
            ] },
        ],
      },
      {
        key: "purpose",
        title: "The purpose test",
        showWhen: { op: "equals", question: "recognised_condition", value: "no" },
        description: "Is there a legitimate interest, and whose?",
        questions: [
          { key: "activity_name", label: "Name of the processing", type: "short_text", required: true, legalRefs: ["ukgdpr.art30"], evidence: "none" },
          { key: "interest", label: "What is the interest you are pursuing?", type: "long_text", required: true, help: "Stated plainly. 'Improving the service' is not an interest; 'detecting fraudulent transactions before they complete' is.", legalRefs: ["ukgdpr.art6.1f", "ico.legitimate_interests"], evidence: "none" },
          { key: "whose_interest", label: "Whose interest is it?", type: "multi_select", required: true, legalRefs: ["edpb.gl01-2024"], evidence: "none",
            options: [
              { value: "controller", label: "Ours as controller", weight: 0 },
              { value: "third_party", label: "A third party's", weight: 1 },
              { value: "data_subject", label: "The data subject's own", weight: 0 },
              { value: "public", label: "The wider public's", weight: 0 },
            ] },
          { key: "benefit", label: "What is the benefit, and how significant is it?", type: "long_text", required: true, legalRefs: ["edpb.gl01-2024"], evidence: "none" },
          { key: "lawful_and_specific", label: "Is the interest lawful, clearly articulated and real rather than speculative?", type: "single_select", required: true, legalRefs: ["edpb.gl01-2024"], evidence: "none",
            options: [
              { value: "yes", label: "Yes — lawful, specific, and present now", weight: 0 },
              { value: "partly", label: "Partly — real but broadly stated", weight: 2 },
              { value: "no", label: "No — speculative, or hard to state precisely", weight: 4 },
            ] },
          { key: "unlawful_consequence", label: "Would you have to stop if you could not rely on this basis?", type: "long_text", required: true, help: "What happens if the answer to this assessment is no. Worth writing before you know the outcome.", legalRefs: ["ukgdpr.art6.1f"], evidence: "none" },
        ],
      },
      {
        key: "necessity",
        title: "The necessity test",
        showWhen: { op: "equals", question: "recognised_condition", value: "no" },
        description: "Is the processing necessary for that interest?",
        questions: [
          { key: "necessity", label: "Why is this processing necessary to achieve the interest?", type: "long_text", required: true, legalRefs: ["ukgdpr.art6.1f"], evidence: "none" },
          { key: "less_intrusive", label: "Is there a less intrusive way to achieve the same result?", type: "single_select", required: true, legalRefs: ["edpb.gl01-2024"], evidence: "none",
            options: [
              { value: "no", label: "No — considered and none would work", weight: 0 },
              { value: "yes_rejected", label: "Yes, but it was rejected", weight: 3 },
              { value: "not_considered", label: "Not considered", weight: 4 },
            ] },
          { key: "less_intrusive_detail", label: "What was it, and why was it rejected?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "less_intrusive", value: "yes_rejected" },
            requireWhen: { op: "equals", question: "less_intrusive", value: "yes_rejected" },
            legalRefs: ["edpb.gl01-2024"], evidence: "none" },
          { key: "data_minimised", label: "Is the data limited to what the interest requires?", type: "long_text", required: true, legalRefs: ["ukgdpr.art5"], evidence: "none" },
        ],
      },
      {
        key: "balancing",
        title: "The balancing test",
        showWhen: { op: "equals", question: "recognised_condition", value: "no" },
        description:
          "Do the interests or fundamental rights of the people affected override yours?",
        questions: [
          { key: "relationship", label: "What is your relationship with the individuals?", type: "single_select", required: true, legalRefs: ["edpb.gl01-2024"], evidence: "none",
            options: [
              { value: "existing_customer", label: "Existing customer or member", weight: 0 },
              { value: "employee", label: "Employee or worker", weight: 2 },
              { value: "prospect", label: "Prospect with no existing relationship", weight: 3 },
              { value: "none", label: "None — they do not know us", weight: 4 },
            ] },
          { key: "reasonable_expectations", label: "Would they reasonably expect this processing?", type: "single_select", required: true, help: "Judged at the time the data was collected, and from their position rather than yours.", legalRefs: ["edpb.gl01-2024"], evidence: "none",
            options: [
              { value: "clearly", label: "Clearly — it follows from what we told them", weight: 0 },
              { value: "probably", label: "Probably, though it was not spelled out", weight: 2 },
              { value: "unlikely", label: "Unlikely — it would surprise them", weight: 4 },
            ] },
          { key: "vulnerable", label: "Are any of them children or otherwise vulnerable?", type: "single_select", required: true, legalRefs: ["edpb.gl01-2024"], evidence: "none",
            options: [
              { value: "no", label: "No", weight: 0 },
              { value: "some", label: "Some may be", weight: 3 },
              { value: "yes", label: "Yes — children, or people in a position of dependence", weight: 5 },
            ] },
          { key: "special_category", label: "Does it involve special category or criminal offence data?", type: "single_select", required: true, help: "Article 9 needs a condition of its own; legitimate interests is not one.", legalRefs: ["ukgdpr.art9", "ukgdpr.art10"], evidence: "none",
            options: [
              { value: "no", label: "No", weight: 0 },
              { value: "yes", label: "Yes — and an Article 9 condition is identified separately", weight: 4 },
            ] },
          { key: "intrusiveness", label: "How intrusive is it?", type: "single_select", required: true, legalRefs: ["edpb.gl01-2024"], evidence: "none",
            options: [
              { value: "low", label: "Low — limited data, no tracking, no profiling", weight: 0 },
              { value: "moderate", label: "Moderate — some profiling or combination of sources", weight: 2 },
              { value: "high", label: "High — systematic monitoring, or large-scale profiling", weight: 5 },
            ] },
          { key: "impact", label: "What impact could it have on them?", type: "long_text", required: true, help: "Including anyone who would be affected differently from most.", legalRefs: ["edpb.gl01-2024"], evidence: "none" },
          { key: "safeguards", label: "What safeguards reduce that impact?", type: "long_text", required: true, help: "Minimisation, pseudonymisation, retention limits, opt-outs, transparency.", legalRefs: ["ukgdpr.art25"], evidence: "optional" },
          { key: "objection", label: "How can they object, and what happens when they do?", type: "long_text", required: true, help: "Article 21 gives an unconditional right to object to direct marketing.", legalRefs: ["ukgdpr.art21"], evidence: "none" },
          { key: "transparency", label: "Where are they told you rely on legitimate interests, and what the interest is?", type: "short_text", required: true, legalRefs: ["ukgdpr.art13"], evidence: "required" },
        ],
      },
      {
        key: "outcome",
        title: "Outcome",
        description: "The conclusion, recorded so it can be reviewed later.",
        questions: [
          { key: "conclusion", label: "Can you rely on legitimate interests?", type: "single_select", required: true, legalRefs: ["ukgdpr.art6.1f"], evidence: "none",
            options: [
              { value: "recognised", label: "Yes — a recognised legitimate interest, so no balancing test is needed" },
              { value: "yes", label: "Yes — the interest is not overridden" },
              { value: "yes_with_changes", label: "Yes, provided the safeguards above are in place" },
              { value: "no", label: "No — another basis is needed, or the processing should not proceed" },
            ] },
          { key: "conclusion_reasoning", label: "Why?", type: "long_text", required: true, help: "The reasoning is the assessment. A conclusion without it cannot be reviewed and cannot be defended.", legalRefs: ["ukgdpr.art6.1f"], evidence: "none" },
          { key: "assessed_by", label: "Who carried out this assessment?", type: "short_text", required: true, legalRefs: ["ukgdpr.art5"], evidence: "none" },
          { key: "review_date", label: "When will it be reviewed?", type: "date", required: true, help: "The balance shifts as expectations and the processing change.", legalRefs: ["edpb.gl01-2024"], evidence: "none" },
        ],
      },
    ],
  },
  scoring: {
    method: "weighted_sum",
    questions: [
      "whose_interest",
      "lawful_and_specific",
      "less_intrusive",
      "relationship",
      "reasonable_expectations",
      "vulnerable",
      "special_category",
      "intrusiveness",
    ],
    // Not a risk rating: a reading of how hard the basis is to sustain. The
    // bands say what to do next rather than how bad it is.
    bands: [
      { min: 0, max: 4, label: "Straightforward — the basis looks sound", tier: "low" },
      { min: 5, max: 11, label: "Defensible with the safeguards recorded", tier: "medium" },
      { min: 12, max: 18, label: "Hard to sustain — review before relying on it", tier: "high" },
      { min: 19, max: 100, label: "Another basis is likely needed", tier: "critical" },
    ],
  },
  reviewIntervalMonths: 24,
};
