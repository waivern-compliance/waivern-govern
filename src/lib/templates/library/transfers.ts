import type { TemplateDefinition } from "../schema";

/**
 * UK transfer risk assessment, following the structure of the ICO's TRA tool:
 * describe the transfer, identify the Article 46 mechanism, assess whether the
 * destination's law and practice undermine it, and decide what to do about it.
 */
export const TRA_UK: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "transfer",
        title: "The transfer",
        questions: [
          { key: "transfer_name", label: "What is this transfer called?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "importer", label: "Who receives the data?", type: "short_text", required: true, help: "Organisation name and role — processor, controller or sub-processor.", legalRefs: [], evidence: "none" },
          { key: "destination", label: "Destination country", type: "country", required: true, legalRefs: ["ukgdpr.art44"], evidence: "none" },
          { key: "data_categories", label: "Categories of personal data transferred", type: "data_category", required: true, legalRefs: [], evidence: "none" },
          { key: "special_category", label: "Does the transfer include special category or criminal offence data?", type: "boolean", required: true, legalRefs: ["ukgdpr.art9"], evidence: "none" },
          { key: "frequency", label: "How often does the transfer happen?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "one_off", label: "One-off" },
              { value: "periodic", label: "Periodic" },
              { value: "continuous", label: "Continuous or on demand" },
            ] },
        ],
      },
      {
        key: "mechanism",
        title: "Transfer mechanism",
        questions: [
          { key: "mechanism", label: "What permits this transfer?", type: "single_select", required: true, legalRefs: ["ukgdpr.art45", "ukgdpr.art46", "ukgdpr.art49"], evidence: "none",
            options: [
              { value: "adequacy", label: "Adequacy regulations cover the destination" },
              { value: "idta", label: "IDTA" },
              { value: "addendum", label: "UK Addendum to the EU SCCs" },
              { value: "bcr", label: "Binding corporate rules" },
              { value: "derogation", label: "An Article 49 derogation" },
              { value: "none", label: "Nothing identified yet" },
            ] },
          { key: "mechanism_evidence", label: "Where is the signed agreement held?", type: "short_text", required: false,
            showWhen: { op: "or", any: [
              { op: "equals", question: "mechanism", value: "idta" },
              { op: "equals", question: "mechanism", value: "addendum" },
              { op: "equals", question: "mechanism", value: "bcr" },
            ] },
            requireWhen: { op: "or", any: [
              { op: "equals", question: "mechanism", value: "idta" },
              { op: "equals", question: "mechanism", value: "addendum" },
              { op: "equals", question: "mechanism", value: "bcr" },
            ] },
            legalRefs: ["ico.idta"], evidence: "required" },
          { key: "derogation_basis", label: "Which derogation, and why is it available for a transfer of this kind?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "mechanism", value: "derogation" },
            requireWhen: { op: "equals", question: "mechanism", value: "derogation" },
            help: "Article 49 derogations are exceptions. They are not intended for regular or systematic transfers.",
            legalRefs: ["ukgdpr.art49"], evidence: "none" },
        ],
      },
      {
        key: "destination_law",
        title: "Law and practice in the destination",
        description: "Only needed where the transfer relies on Article 46 safeguards rather than adequacy.",
        showWhen: { op: "notEquals", question: "mechanism", value: "adequacy" },
        questions: [
          { key: "surveillance_regime", label: "Can public authorities in the destination compel access to this data?", type: "single_select", required: true, legalRefs: ["ico.tra"], evidence: "optional",
            options: [
              { value: "no_evidence", label: "No evidence of a regime reaching data of this kind" },
              { value: "limited", label: "Access is possible but narrow, and subject to independent oversight" },
              { value: "broad", label: "Broad access powers, with limited oversight or redress" },
              { value: "unknown", label: "Not established" },
            ] },
          { key: "redress", label: "Do UK data subjects have an effective route to redress there?", type: "single_select", required: true, legalRefs: ["ico.tra"], evidence: "none",
            options: [
              { value: "effective", label: "Yes, and it is accessible in practice" },
              { value: "partial", label: "Partially, or in theory only" },
              { value: "none", label: "No effective route" },
              { value: "unknown", label: "Not established" },
            ] },
          { key: "supplementary", label: "What supplementary measures are in place?", type: "multi_select", required: false, legalRefs: ["edpb.rec01-2020"], evidence: "optional",
            options: [
              { value: "encryption_in_transit", label: "Encryption in transit" },
              { value: "encryption_at_rest", label: "Encryption at rest, keys held in the UK" },
              { value: "pseudonymisation", label: "Pseudonymisation before transfer" },
              { value: "split_processing", label: "Split or multi-party processing" },
              { value: "contractual", label: "Additional contractual commitments, including challenge and notification" },
              { value: "policy", label: "Organisational policy — access minimisation, transparency reporting" },
              { value: "none", label: "None" },
            ] },
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
              { value: "severe", label: "Severe" },
            ] },
          { key: "conclusion", label: "What is your conclusion, and on what basis?", type: "long_text", required: true, legalRefs: ["ico.tra"], evidence: "none" },
          { key: "review_trigger", label: "What would make you reassess this before its next scheduled review?", type: "long_text", required: true, help: "A change in the destination's law, a new sub-processor, a change in the data transferred.", legalRefs: [], evidence: "none" },
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

/**
 * EU transfer impact assessment. Structurally close to the UK TRA — both descend
 * from Schrems II — but it turns on EU adequacy decisions and the EDPB's
 * six-step method rather than the ICO's tool, and the two must be answerable
 * separately because a transfer can be lawful under one regime and not the other.
 */
export const TIA_EU: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "transfer",
        title: "The transfer",
        questions: [
          { key: "transfer_name", label: "What is this transfer called?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "exporter_entity", label: "Which EU entity is exporting the data?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "importer", label: "Who receives the data?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "destination", label: "Destination country", type: "country", required: true, legalRefs: ["eugdpr.art46"], evidence: "none" },
          { key: "data_categories", label: "Categories of personal data transferred", type: "data_category", required: true, legalRefs: [], evidence: "none" },
          { key: "onward_transfers", label: "Are there onward transfers to further countries?", type: "boolean", required: true, legalRefs: [], evidence: "none" },
          { key: "onward_detail", label: "To where, and under what safeguards?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "onward_transfers", value: true },
            requireWhen: { op: "equals", question: "onward_transfers", value: true },
            legalRefs: [], evidence: "none" },
        ],
      },
      {
        key: "tool",
        title: "Article 46 transfer tool",
        questions: [
          { key: "mechanism", label: "Which transfer tool is relied on?", type: "single_select", required: true, legalRefs: ["eugdpr.art46"], evidence: "none",
            options: [
              { value: "adequacy", label: "An EU adequacy decision covers the destination" },
              { value: "sccs", label: "Standard contractual clauses (2021/914)" },
              { value: "bcr", label: "Binding corporate rules" },
              { value: "derogation", label: "An Article 49 derogation" },
              { value: "none", label: "Nothing identified yet" },
            ] },
          { key: "sccs_modules", label: "Which SCC module applies?", type: "single_select", required: false,
            showWhen: { op: "equals", question: "mechanism", value: "sccs" },
            requireWhen: { op: "equals", question: "mechanism", value: "sccs" },
            legalRefs: ["eugdpr.art46"], evidence: "required",
            options: [
              { value: "m1", label: "Module 1 — controller to controller" },
              { value: "m2", label: "Module 2 — controller to processor" },
              { value: "m3", label: "Module 3 — processor to processor" },
              { value: "m4", label: "Module 4 — processor to controller" },
            ] },
        ],
      },
      {
        key: "destination_law",
        title: "Assessment of the destination's law and practice",
        description: "Step 3 of the EDPB method. Not required where an adequacy decision applies.",
        showWhen: { op: "notEquals", question: "mechanism", value: "adequacy" },
        questions: [
          { key: "legislation_review", label: "What did you find in the destination's surveillance and access legislation?", type: "long_text", required: true, legalRefs: ["cjeu.schrems2", "edpb.rec01-2020"], evidence: "optional" },
          { key: "practice_evidence", label: "What evidence do you have about practice, as opposed to the law on paper?", type: "long_text", required: true, help: "Transparency reports, documented requests, published case law, importer attestations.", legalRefs: ["edpb.rec01-2020"], evidence: "optional" },
          { key: "problematic", label: "Does that law or practice undermine the transfer tool?", type: "single_select", required: true, legalRefs: ["cjeu.schrems2"], evidence: "none",
            options: [
              { value: "no", label: "No — the tool remains effective" },
              { value: "yes_mitigable", label: "Yes, but supplementary measures can bring it up to standard" },
              { value: "yes_not_mitigable", label: "Yes, and no measure identified brings it up to standard" },
              { value: "unknown", label: "Not established" },
            ] },
          { key: "supplementary", label: "Which supplementary measures are applied?", type: "multi_select", required: false,
            showWhen: { op: "equals", question: "problematic", value: "yes_mitigable" },
            requireWhen: { op: "equals", question: "problematic", value: "yes_mitigable" },
            legalRefs: ["edpb.rec01-2020"], evidence: "optional",
            options: [
              { value: "strong_encryption", label: "Strong encryption with keys retained in the EEA" },
              { value: "pseudonymisation", label: "Pseudonymisation, re-identification impossible at the importer" },
              { value: "split_processing", label: "Split processing across jurisdictions" },
              { value: "contractual", label: "Contractual — challenge obligations, transparency, audit" },
              { value: "organisational", label: "Organisational — access control, data minimisation, policy" },
            ] },
        ],
      },
      {
        key: "assessment",
        title: "Conclusion",
        questions: [
          { key: "likelihood", label: "Likelihood of harm to data subjects", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "remote", label: "Remote" },
              { value: "unlikely", label: "Unlikely" },
              { value: "possible", label: "Possible" },
              { value: "likely", label: "Likely" },
            ] },
          { key: "impact", label: "Severity of that harm", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "minimal", label: "Minimal" },
              { value: "limited", label: "Limited" },
              { value: "significant", label: "Significant" },
              { value: "severe", label: "Severe" },
            ] },
          { key: "decision", label: "Can the transfer proceed?", type: "single_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "proceed", label: "Proceed" },
              { value: "proceed_with_measures", label: "Proceed, subject to the measures above" },
              { value: "suspend", label: "Do not proceed — suspend or do not start" },
            ] },
          { key: "rationale", label: "Rationale for that decision", type: "long_text", required: true, legalRefs: [], evidence: "none" },
        ],
      },
      {
        key: "supplementary",
        title: "Supplementary measures",
        description:
          "Step four. Required where the destination's law or practice stops the Article 46 tool being effective on its own.",
        showWhen: { op: "notEquals", question: "decision", value: "suspend" },
        questions: [
          { key: "measures_needed", label: "Are supplementary measures needed?", type: "boolean", required: true, help: "Answer from the assessment above, not from what is convenient to implement.", legalRefs: ["edpb.rec01-2020"], evidence: "none" },
          { key: "technical_measures", label: "Technical measures", type: "multi_select", required: false,
            showWhen: { op: "equals", question: "measures_needed", value: true },
            requireWhen: { op: "equals", question: "measures_needed", value: true },
            help: "The EDPB treats encryption and pseudonymisation as effective only under stated conditions — including that keys stay outside the destination.",
            legalRefs: ["edpb.rec01-2020"], evidence: "none",
            options: [
              { value: "encryption_at_rest", label: "Encryption at rest, keys held in the EEA" },
              { value: "encryption_transit", label: "Encryption in transit" },
              { value: "pseudonymisation", label: "Pseudonymisation, re-identification data held in the EEA" },
              { value: "split_processing", label: "Split or multi-party processing" },
              { value: "no_plaintext_access", label: "Importer cannot access data in the clear" },
            ] },
          { key: "contractual_measures", label: "Contractual measures", type: "long_text", required: false,
            showWhen: { op: "equals", question: "measures_needed", value: true },
            legalRefs: ["edpb.rec01-2020"], evidence: "optional" },
          { key: "organisational_measures", label: "Organisational measures", type: "long_text", required: false,
            showWhen: { op: "equals", question: "measures_needed", value: true },
            help: "Transparency reporting, a documented policy for handling access requests, internal escalation.",
            legalRefs: ["edpb.rec01-2020"], evidence: "optional" },
          { key: "measures_effective", label: "Do these measures make the transfer tool effective in practice?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "measures_needed", value: true },
            requireWhen: { op: "equals", question: "measures_needed", value: true },
            help: "Against the specific problem identified in the destination's law, not in general.",
            legalRefs: ["edpb.rec01-2020"], evidence: "none" },
        ],
      },
      {
        key: "procedure",
        title: "Procedural steps and review",
        description: "Steps five and six. What had to be done formally, and when this is looked at again.",
        questions: [
          { key: "consultation_required", label: "Does adopting these measures require the supervisory authority to be consulted?", type: "boolean", required: false,
            showWhen: { op: "equals", question: "measures_needed", value: true },
            help: "Modifying standard contractual clauses, rather than adding to them, requires authorisation.",
            legalRefs: ["eugdpr.art46", "edpb.rec01-2020"], evidence: "none" },
          { key: "consultation_detail", label: "Which authority, and what was the outcome?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "consultation_required", value: true },
            requireWhen: { op: "equals", question: "consultation_required", value: true },
            legalRefs: ["eugdpr.art46"], evidence: "required" },
          { key: "importer_notification", label: "How will the importer tell you if it can no longer comply?", type: "long_text", required: true, help: "The clauses require them to say so. This records how you would find out.", legalRefs: ["edpb.rec01-2020"], evidence: "none" },
          { key: "monitoring", label: "What will you monitor between reviews?", type: "long_text", required: true, help: "Developments in the destination's law, and the importer's own reporting.", legalRefs: ["edpb.rec01-2020"], evidence: "none" },
          { key: "review_date", label: "When will this be re-evaluated?", type: "date", required: true, help: "Step six. Also whenever the destination's law changes materially.", legalRefs: ["edpb.rec01-2020"], evidence: "none" },
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
