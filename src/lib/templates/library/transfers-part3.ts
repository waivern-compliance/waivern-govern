import type { TemplateDefinition } from "../schema";

/**
 * A transfer assessment for law enforcement processing under Part 3 of the
 * Data Protection Act 2018 (Chapter 5, ss.72–78), separate from the UK GDPR
 * one because Part 3's conditions are its own. Checked on legislation.gov.uk
 * on 31 October 2026 (up to date to 30 October 2026), as the Data (Use and
 * Access) Act 2025 rebuilt the Chapter from 5 February 2026.
 *
 * Section 73: the transfer must be necessary for a law enforcement purpose
 * (condition 1); approved by regulations under s.74AA, subject to appropriate
 * safeguards under s.75, or based on special circumstances under s.76
 * (condition 2); and to a relevant authority or international organisation, a
 * processor under a s.59 contract, or — for the competent authorities s.73(4)(b)
 * names — another recipient meeting s.77 (condition 3). Data first received
 * from an EU member State needs its authorisation, unless urgent (s.73(1)(b),
 * (5), (6)).
 *
 * Section 75: a binding legal instrument to which a competent authority is a
 * party, or the controller's own reasonable and proportionate view, each
 * meeting the data protection test — protection not materially lower than
 * under Part 3 and Parts 5 to 7. Sections 75(3), 76(3) and 77(7): each
 * transfer documented (date and time, recipient, justification, data), and the
 * Commission told of categories of s.75(1A)(b) transfers and of each s.77 one.
 * Section 78: onward transfers. Section 78A: the national security exemption,
 * which leaves parts of ss.73 and 78 in place.
 *
 * Scored as the UK GDPR assessment is, so a board sees one scale.
 */
const SAFEGUARDS: Array<{ op: "equals"; question: string; value: string }> = ["instrument", "assessment"].map((value) => ({
  op: "equals",
  question: "mechanism",
  value,
}));

export const TRA_PART3: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "transfer",
        title: "The transfer",
        description: "Section 73(2), condition 1: necessary for a law enforcement purpose. Section 73(4), condition 3: to whom.",
        questions: [
          { key: "transfer_name", label: "What is this transfer called?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "recipient", label: "Who receives the data?", type: "short_text", required: true, legalRefs: ["uk.dpa2018.s73"], evidence: "none" },
          { key: "destination", label: "Destination country, or the international organisation's seat", type: "country", required: true, legalRefs: ["uk.dpa2018.s73"], evidence: "none" },
          { key: "recipient_type", label: "What kind of recipient is it?", type: "single_select", required: true, legalRefs: ["uk.dpa2018.s73"], evidence: "none",
            options: [
              { value: "relevant_authority", label: "A relevant authority in the third country — one with functions for law enforcement purposes (s.73(4)(a))" },
              { value: "international_organisation", label: "An international organisation carrying out functions for law enforcement purposes (s.73(4)(a))" },
              { value: "processor", label: "A processor, under a contract that complies with s.59 (s.73(4)(aa))" },
              { value: "other", label: "Someone else — only for the competent authorities s.73(4)(b) names, and only on the s.77 conditions" },
            ] },
          { key: "processor_contract", label: "Where is the s.59 contract held?", type: "short_text", required: false,
            showWhen: { op: "equals", question: "recipient_type", value: "processor" },
            requireWhen: { op: "equals", question: "recipient_type", value: "processor" },
            legalRefs: ["uk.dpa2018.s73"], evidence: "required" },
          { key: "law_enforcement_purpose", label: "Which law enforcement purpose is it for, and why is the transfer necessary for it?", type: "long_text", required: true,
            help: "Section 31: preventing, investigating, detecting or prosecuting offences, executing penalties, and safeguarding against threats to public security.",
            legalRefs: ["uk.dpa2018.s31", "uk.dpa2018.s73"], evidence: "none" },
          { key: "data_categories", label: "Categories of personal data transferred", type: "data_category", required: true,
            help: "Categories only. This platform does not hold or correlate individuals' data.",
            legalRefs: [], evidence: "none" },
          { key: "sensitive_processing", label: "Does it include sensitive processing?", type: "boolean", required: true,
            help: "Section 35(8): racial or ethnic origin, political opinions, religious or philosophical beliefs, trade union membership, genetic or biometric data to identify someone, health, sex life or sexual orientation.",
            legalRefs: ["uk.dpa2018.s35"], evidence: "none" },
          { key: "frequency", label: "How often does the transfer happen?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "one_off", label: "One-off" },
              { value: "periodic", label: "Periodic" },
              { value: "continuous", label: "Continuous or on demand" },
            ] },
          { key: "member_state_origin", label: "Was any of the data first received from an EU member State?", type: "boolean", required: true,
            help: "Then that member State, or a competent authority there, must authorise the transfer under its law (s.73(1)(b)).",
            legalRefs: ["uk.dpa2018.s73"], evidence: "none" },
          { key: "member_state_authorisation", label: "Has the member State authorised it?", type: "single_select", required: false,
            showWhen: { op: "equals", question: "member_state_origin", value: true },
            requireWhen: { op: "equals", question: "member_state_origin", value: true },
            legalRefs: ["uk.dpa2018.s73"], evidence: "optional",
            options: [
              { value: "authorised", label: "Yes" },
              { value: "urgent", label: "No — urgent: an immediate and serious threat, and authorisation could not be had in good time (s.73(5)); the member State's authority told without delay (s.73(6))" },
              { value: "not_yet", label: "Not yet — the transfer cannot be made" },
            ] },
        ],
      },
      {
        key: "mechanism",
        title: "What permits the transfer",
        description: "Section 73(3), condition 2: approved by regulations (s.74AA), appropriate safeguards (s.75), or special circumstances (s.76).",
        questions: [
          { key: "mechanism", label: "What permits this transfer?", type: "single_select", required: true,
            legalRefs: ["uk.dpa2018.s73", "uk.dpa2018.s74aa", "uk.dpa2018.s75", "uk.dpa2018.s76"], evidence: "none",
            options: [
              { value: "regulations", label: "Approved by regulations under s.74AA, in force at the time of the transfer" },
              { value: "instrument", label: "Appropriate safeguards: a legal instrument binding the recipient, with a competent authority a party (s.75(1A)(a))" },
              { value: "assessment", label: "Appropriate safeguards: our own view that the data protection test is met (s.75(1A)(b))" },
              { value: "special", label: "Special circumstances (s.76)" },
              { value: "none", label: "Nothing identified yet" },
            ] },
          { key: "approval_scope", label: "Do the regulations cover this transfer — this recipient and kind of data?", type: "boolean", required: false,
            help: "Regulations under s.74AA may approve only some transfers to a country. Check the regulations and the Secretary of State's published list (s.74B), not only the country.",
            showWhen: { op: "equals", question: "mechanism", value: "regulations" },
            requireWhen: { op: "equals", question: "mechanism", value: "regulations" },
            legalRefs: ["uk.dpa2018.s74aa"], evidence: "optional" },
          { key: "instrument", label: "Which instrument, who is party to it, and where is it held?", type: "short_text", required: false,
            help: "Section 75(4): intended to be relied on for transfers of this kind, at least one competent authority a party, and each that is party considering the data protection test met.",
            showWhen: { op: "equals", question: "mechanism", value: "instrument" },
            requireWhen: { op: "equals", question: "mechanism", value: "instrument" },
            legalRefs: ["uk.dpa2018.s75"], evidence: "required" },
          { key: "special_purpose", label: "Which special purpose is the transfer necessary for?", type: "single_select", required: false,
            showWhen: { op: "equals", question: "mechanism", value: "special" },
            requireWhen: { op: "equals", question: "mechanism", value: "special" },
            legalRefs: ["uk.dpa2018.s76"], evidence: "none",
            options: [
              { value: "a", label: "(a) To protect the vital interests of the data subject or another person" },
              { value: "b", label: "(b) To safeguard the data subject's legitimate interests" },
              { value: "c", label: "(c) To prevent an immediate and serious threat to the public security or national security of a third country or the UK" },
              { value: "d", label: "(d) In particular circumstances, for any law enforcement purpose" },
              { value: "e", label: "(e) In particular circumstances, for a legal purpose — proceedings, legal advice, or legal rights" },
            ] },
          { key: "special_override", label: "Do the person's fundamental rights and freedoms override the public interest in the transfer?", type: "boolean", required: false,
            help: "For (d) and (e): if they do, the transfer is not necessary for a special purpose (s.76(2)).",
            showWhen: { op: "or", any: [
              { op: "equals", question: "special_purpose", value: "d" },
              { op: "equals", question: "special_purpose", value: "e" },
            ] },
            requireWhen: { op: "or", any: [
              { op: "equals", question: "special_purpose", value: "d" },
              { op: "equals", question: "special_purpose", value: "e" },
            ] },
            legalRefs: ["uk.dpa2018.s76"], evidence: "none" },
          { key: "special_not_excessive", label: "Is no more data transferred than the special purpose needs?", type: "boolean", required: false,
            help: "Section 76(2A).",
            showWhen: { op: "equals", question: "mechanism", value: "special" },
            requireWhen: { op: "equals", question: "mechanism", value: "special" },
            legalRefs: ["uk.dpa2018.s76"], evidence: "none" },
        ],
      },
      {
        key: "other_recipient",
        title: "A recipient other than a relevant authority",
        description: "Section 77: all four conditions, the authority told, the transfer documented and the Commission informed.",
        showWhen: { op: "equals", question: "recipient_type", value: "other" },
        questions: [
          { key: "s77_strictly_necessary", label: "Why is the transfer strictly necessary in this specific case, for a task the law gives us for a law enforcement purpose?", type: "long_text", required: true,
            legalRefs: ["uk.dpa2018.s77"], evidence: "none" },
          { key: "s77_rights", label: "Have we determined that no fundamental rights and freedoms of the person override the public interest in the transfer?", type: "boolean", required: true,
            legalRefs: ["uk.dpa2018.s77"], evidence: "none" },
          { key: "s77_authority_ineffective", label: "Why would transferring to a relevant authority there be ineffective or inappropriate?", type: "long_text", required: true,
            help: "For example, it could not be made in time to serve its purpose.",
            legalRefs: ["uk.dpa2018.s77"], evidence: "none" },
          { key: "s77_purposes_told", label: "Has the recipient been told the specific purposes the data may be processed for?", type: "boolean", required: true,
            legalRefs: ["uk.dpa2018.s77"], evidence: "optional" },
          { key: "s77_authority_informed", label: "Has a relevant authority in that country been told of the transfer?", type: "single_select", required: true,
            legalRefs: ["uk.dpa2018.s77"], evidence: "none",
            options: [
              { value: "yes", label: "Yes, without undue delay" },
              { value: "ineffective", label: "No — that would be ineffective or inappropriate" },
              { value: "not_yet", label: "Not yet" },
            ] },
        ],
      },
      {
        key: "data_protection_test",
        title: "The data protection test",
        description: "Section 75(5)–(7): acting reasonably and proportionately, would protection after the transfer, taken as a whole, be not materially lower than under Part 3 and Parts 5 to 7?",
        showWhen: { op: "or", any: SAFEGUARDS },
        questions: [
          { key: "dpt_nature_volume", label: "What is the nature and volume of the data, and how much checking does that make reasonable and proportionate?", type: "long_text", required: true,
            legalRefs: ["uk.dpa2018.s75"], evidence: "none" },
          { key: "dpt_steps", label: "What did you do to reach a view on protection in the destination?", type: "long_text", required: true,
            help: "The rule of law and respect for human rights there, the recipient's supervision, redress for the people concerned, onward transfer rules — the matters s.74AB lists — and the instrument's terms.",
            legalRefs: ["uk.dpa2018.s74aa", "uk.dpa2018.s75"], evidence: "optional" },
          { key: "dpt_conclusion", label: "Would the protection be not materially lower?", type: "single_select", required: true,
            legalRefs: ["uk.dpa2018.s75"], evidence: "none",
            options: [
              { value: "met", label: "Yes — the test is met" },
              { value: "not_met", label: "No — materially lower" },
              { value: "undetermined", label: "Not yet determined" },
            ] },
          { key: "dpt_not_met_action", label: "The test is not met, so the transfer cannot rely on s.75. What will you do?", type: "long_text", required: false,
            help: "Add safeguards and reassess, rely on s.76 if a special purpose genuinely applies, or do not transfer.",
            showWhen: { op: "equals", question: "dpt_conclusion", value: "not_met" },
            requireWhen: { op: "equals", question: "dpt_conclusion", value: "not_met" },
            legalRefs: ["uk.dpa2018.s75", "uk.dpa2018.s76"], evidence: "none" },
        ],
      },
      {
        key: "records",
        title: "Records, the Commission and onward transfers",
        questions: [
          { key: "documented", label: "Is each transfer documented — date and time, the recipient, the justification and the data transferred?", type: "boolean", required: true,
            help: "Required for s.75 transfers (other than to a processor), s.76 transfers and s.77 transfers, and given to the Information Commission on request (ss.75(3), 76(3), 77(7)). Logging of disclosures (s.62) is a separate duty.",
            legalRefs: ["uk.dpa2018.s75", "uk.dpa2018.s76", "uk.dpa2018.s77"], evidence: "optional" },
          { key: "commission_informed", label: "Has the Information Commission been told?", type: "single_select", required: true,
            legalRefs: ["uk.dpa2018.s75", "uk.dpa2018.s77"], evidence: "optional",
            options: [
              { value: "categories", label: "Yes — of the category of transfers relying on our own view (s.75(2))" },
              { value: "each", label: "Yes — of this transfer to another recipient (s.77(7)(b))" },
              { value: "not_needed", label: "Not needed — regulations, an instrument, special circumstances, or a processor" },
              { value: "not_yet", label: "Not yet" },
            ] },
          { key: "onward", label: "May the recipient pass the data on to another third country or international organisation?", type: "boolean", required: true,
            help: "Section 78: only with our authorisation, given after taking into account the seriousness of the circumstances, the purpose and the protection at the destination — save in an urgent case.",
            legalRefs: ["uk.dpa2018.s78"], evidence: "none" },
          { key: "onward_terms", label: "On what terms, and how is our authorisation sought?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "onward", value: true },
            requireWhen: { op: "equals", question: "onward", value: true },
            legalRefs: ["uk.dpa2018.s78"], evidence: "optional" },
          { key: "national_security", label: "Is the national security exemption relied on for any of this?", type: "boolean", required: true,
            help: "Section 78A: provisions of Chapter 5 do not apply where exemption is required to safeguard national security — but parts of ss.73 and 78 still do (s.78A(4)). A Minister's certificate (s.79) is conclusive evidence that it is required.",
            legalRefs: ["uk.dpa2018.s78a", "uk.dpa2018.s79"], evidence: "none" },
          { key: "national_security_detail", label: "Which provisions are not applied, why is that required, and is there a s.79 certificate?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "national_security", value: true },
            requireWhen: { op: "equals", question: "national_security", value: true },
            legalRefs: ["uk.dpa2018.s78a", "uk.dpa2018.s79"], evidence: "optional" },
        ],
      },
      {
        key: "assessment",
        title: "Risk assessment",
        questions: [
          { key: "likelihood", label: "How likely is it that the transfer results in harm to the people involved?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "remote", label: "Remote" },
              { value: "unlikely", label: "Unlikely" },
              { value: "possible", label: "Possible" },
              { value: "likely", label: "Likely" },
            ] },
          { key: "impact", label: "How severe would that harm be?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "minimal", label: "Minimal" },
              { value: "limited", label: "Limited" },
              { value: "significant", label: "Significant" },
              { value: "severe", label: "Severe — serious or irreversible harm, including to liberty" },
            ] },
          { key: "conclusion", label: "What is your conclusion, and on what basis?", type: "long_text", required: true, legalRefs: ["uk.dpa2018.s73"], evidence: "none" },
          { key: "review_trigger", label: "What would make you reassess this before its next scheduled review?", type: "long_text", required: true,
            help: "Regulations amended or revoked (s.74B), a change in the destination's law, a new recipient, a change in the data transferred.",
            legalRefs: [], evidence: "none" },
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
