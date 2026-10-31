import {
  LOGGED_OPERATIONS,
  LOGGED_OPERATION_KEYS,
  PART3_BASES,
  SCHEDULE_8,
  SCHEDULE_8_KEYS,
  SENSITIVE_ROUTES,
} from "@/lib/dpa2018/part3";
import type { TemplateDefinition } from "../schema";

/**
 * A DPIA for law enforcement processing under Part 3 of the Data Protection
 * Act 2018 (s.64), separate from the UK GDPR one because Part 3 asks
 * different things and competent authorities score and approve them apart.
 *
 * Section 64(3): a general description of the processing, an assessment of
 * the risks to people's rights and freedoms, the measures to address them,
 * and the safeguards and mechanisms that protect the data and show Part 3 is
 * complied with. Section 64(4): judged on the nature, scope, context and
 * purposes. Where high risk remains, the Information Commission is consulted
 * first (s.65). Then what Part 3 itself turns on: the law enforcement purpose
 * (s.31), lawfulness and sensitive processing (s.35, Schedule 8) with the
 * policy document (s.42), categories of data subject and fact and opinion
 * (s.38), logging (s.62), and how the rights may be restricted (s.45(4)).
 *
 * Scored as the UK GDPR DPIA is, so a board sees one scale.
 */
export const DPIA_PART3: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "description",
        title: "The processing",
        description: "Section 64(3)(a) and (4): its nature, scope, context and purposes.",
        questions: [
          { key: "activity_name", label: "Name of the processing activity", type: "short_text", required: true, legalRefs: ["uk.dpa2018.s61"], evidence: "none" },
          { key: "nature", label: "What will you do with the personal data?", type: "long_text", required: true,
            help: "How it is collected, used, stored, shared and deleted, and by which systems.",
            legalRefs: ["uk.dpa2018.s64"], evidence: "none" },
          { key: "law_enforcement_purpose", label: "Which law enforcement purpose is it for?", type: "multi_select", required: true,
            help: "Section 31, including safeguarding against and preventing threats to public security.",
            legalRefs: ["uk.dpa2018.s31"], evidence: "none",
            options: [
              { value: "prevention", label: "Preventing criminal offences" },
              { value: "investigation", label: "Investigating or detecting criminal offences" },
              { value: "prosecution", label: "Prosecuting criminal offences" },
              { value: "penalties", label: "Executing criminal penalties" },
              { value: "public_security", label: "Safeguarding against threats to public security" },
            ] },
          { key: "competent_authority", label: "Which competent authority carries it out, and under what function?", type: "long_text", required: true,
            help: "A body listed in Schedule 7, or one with statutory functions for a law enforcement purpose (s.30).",
            legalRefs: ["uk.dpa2018.s30", "uk.dpa2018.sch7"], evidence: "none" },
          { key: "scope_context", label: "How much, how often, about whom, and in what setting?", type: "long_text", required: true,
            legalRefs: ["uk.dpa2018.s64"], evidence: "none" },
        ],
      },
      {
        key: "lawfulness",
        title: "Lawfulness and sensitive processing",
        questions: [
          { key: "part3_basis", label: "How is section 35(2) met?", type: "single_select", required: true, legalRefs: ["uk.dpa2018.s35"], evidence: "none",
            options: Object.entries(PART3_BASES).map(([value, label]) => ({ value, label })) },
          { key: "necessity", label: "Why is it necessary for that purpose, and why is less intrusive processing not enough?", type: "long_text", required: true,
            legalRefs: ["uk.dpa2018.s35"], evidence: "none" },
          { key: "sensitive_processing", label: "Is any of it sensitive processing?", type: "boolean", required: true,
            help: "Section 35(8): racial or ethnic origin, political opinions, religious or philosophical beliefs, trade union membership, genetic or biometric data to identify someone, health, sex life or sexual orientation.",
            legalRefs: ["uk.dpa2018.s35"], evidence: "none" },
          { key: "sensitive_route", label: "On what?", type: "single_select", required: false,
            showWhen: { op: "equals", question: "sensitive_processing", value: true },
            requireWhen: { op: "equals", question: "sensitive_processing", value: true },
            legalRefs: ["uk.dpa2018.s35"], evidence: "none",
            options: Object.entries(SENSITIVE_ROUTES).map(([value, label]) => ({ value, label })) },
          { key: "schedule8_condition", label: "Which Schedule 8 condition?", type: "single_select", required: false,
            help: "And why the processing is strictly necessary, not merely necessary.",
            showWhen: { op: "equals", question: "sensitive_route", value: "strictly_necessary" },
            requireWhen: { op: "equals", question: "sensitive_route", value: "strictly_necessary" },
            legalRefs: ["uk.dpa2018.sch8"], evidence: "none",
            options: SCHEDULE_8_KEYS.map((k) => ({ value: k, label: `${SCHEDULE_8[k].label} (para ${SCHEDULE_8[k].paragraph})` })) },
          { key: "policy_document", label: "Which appropriate policy document covers it?", type: "short_text", required: false,
            help: "Section 42: in place whenever the sensitive processing happens, and kept until six months after it stops. Record it on the appropriate policy document register.",
            showWhen: { op: "equals", question: "sensitive_processing", value: true },
            requireWhen: { op: "equals", question: "sensitive_processing", value: true },
            legalRefs: ["uk.dpa2018.s42"], evidence: "optional" },
        ],
      },
      {
        key: "data",
        title: "The data and the people",
        questions: [
          { key: "data_categories", label: "Categories of personal data", type: "data_category", required: true,
            help: "Categories only. This platform does not hold or correlate individuals' data.",
            legalRefs: ["uk.dpa2018.s61"], evidence: "none" },
          { key: "subject_categories", label: "Which categories of data subject are involved?", type: "multi_select", required: true,
            help: "Section 38(3): distinguished, so far as possible.",
            legalRefs: ["uk.dpa2018.s38"], evidence: "none",
            options: [
              { value: "suspects", label: "Suspects" },
              { value: "convicted", label: "People convicted of an offence" },
              { value: "victims", label: "Victims and possible victims" },
              { value: "witnesses", label: "Witnesses and others with information" },
              { value: "other", label: "Others: contacts, associates, members of the public" },
            ] },
          { key: "categories_distinguished", label: "How are those categories kept distinct in the records?", type: "long_text", required: true,
            legalRefs: ["uk.dpa2018.s38"], evidence: "none" },
          { key: "fact_opinion", label: "How is fact distinguished from personal assessment?", type: "long_text", required: true,
            help: "Section 38(2), so far as possible: a witness's account, an officer's assessment and a conviction are not the same kind of record.",
            legalRefs: ["uk.dpa2018.s38"], evidence: "none" },
          { key: "retention", label: "How long will the data be kept, and how is that reviewed?", type: "long_text", required: true,
            legalRefs: ["uk.dpa2018.s61"], evidence: "none" },
        ],
      },
      {
        key: "safeguards",
        title: "Safeguards",
        description: "Section 64(3)(d): what protects the data and shows Part 3 is complied with.",
        questions: [
          { key: "logged_operations", label: "Which operations do the automated systems log?", type: "multi_select", required: true,
            help: "Section 62 requires all six. Consultation and disclosure logs show the date and time and, so far as possible, who did it and to whom.",
            legalRefs: ["uk.dpa2018.s62"], evidence: "optional",
            options: LOGGED_OPERATION_KEYS.map((k) => ({ value: k, label: LOGGED_OPERATIONS[k] })) },
          { key: "log_review", label: "Who reviews the logs, how often, and what for?", type: "long_text", required: true,
            help: "Logs may be used only to verify lawfulness, for self-monitoring and discipline, for integrity and security, and in criminal proceedings (s.62(4)).",
            legalRefs: ["uk.dpa2018.s62"], evidence: "none" },
          { key: "rights_restrictions", label: "Where might people's rights be restricted, and on what ground?", type: "long_text", required: true,
            help: "Sections 44(4), 45(4) and 48(3): only where necessary and proportionate, to avoid obstructing an inquiry or prejudicing crime work, to protect public security, or the rights of others. The reasons are recorded and the person told, unless that would undermine the restriction. National security is no longer among these grounds (since 5 September 2025): it is the s.78A exemption.",
            legalRefs: ["uk.dpa2018.s45", "uk.dpa2018.s78a"], evidence: "none" },
          { key: "security", label: "What security measures protect it?", type: "long_text", required: true, legalRefs: ["uk.dpa2018.s64"], evidence: "optional" },
        ],
      },
      {
        key: "risk",
        title: "Risk assessment",
        description: "Section 64(3)(b) and (c): the risk to the rights and freedoms of the people whose data this is, and the measures against it.",
        questions: [
          { key: "risk_description", label: "What could go wrong for the people involved?", type: "long_text", required: true,
            help: "For example: a witness wrongly recorded as a suspect, an assessment read as fact, disclosure putting a victim at risk.",
            legalRefs: ["uk.dpa2018.s64"], evidence: "none" },
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
              { value: "severe", label: "Severe — serious or irreversible harm, including to liberty" },
            ] },
          { key: "measures", label: "What measures will reduce this risk?", type: "long_text", required: true, legalRefs: ["uk.dpa2018.s64"], evidence: "optional" },
          { key: "residual_accepted", label: "Is residual risk still high after those measures?", type: "boolean", required: true,
            help: "If so, the Information Commission must be consulted before the processing starts (s.65).",
            legalRefs: ["uk.dpa2018.s65"], evidence: "none" },
          { key: "ico_consultation", label: "Where has prior consultation with the Information Commission got to?", type: "single_select", required: false,
            help: "Section 65: the Information Commission has six weeks to give written advice, which it can extend by a month.",
            showWhen: { op: "equals", question: "residual_accepted", value: true },
            requireWhen: { op: "equals", question: "residual_accepted", value: true },
            legalRefs: ["uk.dpa2018.s65"], evidence: "optional",
            options: [
              { value: "not_started", label: "Not yet consulted" },
              { value: "submitted", label: "Submitted, awaiting the Information Commission's advice" },
              { value: "advice_received", label: "The Information Commission's advice has been received" },
            ] },
          { key: "dpo_advice", label: "What did the data protection officer advise, and was it followed? If not, why not?", type: "long_text", required: true,
            help: "A competent authority must designate a DPO (s.69), whose tasks include advising on DPIAs (s.71).",
            legalRefs: ["uk.dpa2018.s69"], evidence: "optional" },
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
