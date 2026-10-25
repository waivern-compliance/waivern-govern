import { AI_RISK_CATEGORIES } from "@/lib/risk/categories";
import type { TemplateDefinition } from "../schema";

/**
 * AI risk identification, following DSIT's AI Risk Management Toolkit.
 *
 * One section per risk category in the toolkit, each asking the questions its
 * Appendix 1 says expose where risk is hiding — condensed and turned into
 * answers somebody can actually give, because a hundred and fifty open prompts
 * get answered "N/A" in bulk. Where the toolkit allows evidence from an existing
 * Cyber Assessment Framework submission to stand in, the security questions say
 * so rather than asking the same thing twice.
 *
 * This is the identification step, not the register. The toolkit scores each
 * risk on its own likelihood and impact; the assessment's job is to find them,
 * and its last section names the categories where a risk needs to go on the
 * register — where it is scored on the organisation's scale and judged against
 * appetite for that category.
 *
 * The overall score is a weighted sum like the existing AI risk assessment, and
 * for the same reason: it decides how far up the approval chain the assessment
 * goes, and AI exposure does not reduce to two axes. It is not a substitute for
 * the per-risk ratings.
 *
 * Questions that also appear in the AI risk assessment — consequence, human
 * oversight, monitoring, bias, contestability, the review interval — keep the
 * same keys and options on purpose. The AI register and the approval workflow
 * read those keys, so either template feeds them without a second mapping.
 *
 * Contains public sector information licensed under the Open Government Licence v3.0.
 */
export const DSIT_AI_RISK: TemplateDefinition = {
  schema: {
    sections: [
      {
        key: "context",
        title: "The system and its context",
        description:
          "Enough to know what is being assessed, how far it reaches, and who is looking at it.",
        questions: [
          { key: "use_case_name", label: "What is the system called?", type: "short_text", required: true, legalRefs: [], evidence: "none" },
          { key: "purpose", label: "What is it for, and what decision or output does it produce?", type: "long_text", required: true, legalRefs: ["gds.aiplaybook"], evidence: "none" },
          { key: "lifecycle_stage", label: "Where is it in its lifecycle?", type: "single_select", required: true,
            help: "The toolkit expects risks to be reassessed as the system moves through alpha, beta and live, and whenever the model is updated.",
            legalRefs: ["dsit.airmt"], evidence: "none",
            options: [
              { value: "proposed", label: "Proposed" },
              { value: "development", label: "In development" },
              { value: "pilot", label: "Piloting with real users" },
              { value: "production", label: "In production" },
              { value: "retiring", label: "Being retired" },
            ] },
          { key: "deployment_pattern", label: "How is it deployed?", type: "single_select", required: true, legalRefs: ["gds.aiplaybook"], evidence: "none",
            options: [
              { value: "public_web_app", label: "A public AI app or website, used as-is" },
              { value: "embedded", label: "AI features inside software we bought" },
              { value: "public_api", label: "A provider's public API, called from our code" },
              { value: "privately_hosted", label: "A model hosted on infrastructure we control" },
              { value: "local", label: "A model running on people's own devices" },
              { value: "trained_here", label: "A model trained or fine-tuned here" },
            ] },
          { key: "affects_people", label: "Does the system affect people, directly or indirectly?", type: "boolean", required: true, legalRefs: ["ukgdpr.art22"], evidence: "none" },
          { key: "consequence", label: "What is the strongest consequence for someone affected?", type: "single_select", required: false,
            showWhen: { op: "equals", question: "affects_people", value: true },
            requireWhen: { op: "equals", question: "affects_people", value: true },
            legalRefs: ["ukgdpr.art22", "gds.aiplaybook"], evidence: "none",
            options: [
              { value: "informational", label: "Informational only — no decision follows", weight: 0 },
              { value: "influences", label: "Influences a decision a person then takes", weight: 2 },
              { value: "recommends", label: "Recommends a decision that is usually followed", weight: 4 },
              { value: "decides", label: "Decides, with no meaningful human review", weight: 7 },
            ] },
          { key: "public_facing", label: "Do members of the public interact with it, or receive its outputs?", type: "boolean", required: true, legalRefs: ["gds.aiplaybook", "atrs"], evidence: "none" },
          { key: "ai_disclosure", label: "How are people told that AI is involved?", type: "long_text", required: false,
            help: "The Playbook asks for automated responses to the public to say so — for example, that a reply was written by an AI chatbot.",
            showWhen: { op: "equals", question: "public_facing", value: true },
            requireWhen: { op: "equals", question: "public_facing", value: true },
            legalRefs: ["gds.aiplaybook"], evidence: "none" },
          { key: "risk_team", label: "Who is in the team identifying and managing its risks, and who leads it?", type: "long_text", required: true,
            help: "The toolkit expects a multidisciplinary team — data, engineering, security, legal, domain experts and end users — led by an AI governance officer.",
            legalRefs: ["dsit.airmt"], evidence: "none" },
        ],
      },
      {
        key: "financial",
        title: "Financial",
        questions: [
          { key: "running_costs", label: "Have running, scaling and maintenance costs beyond the pilot been estimated?", type: "single_select", required: true, legalRefs: ["dsit.airmt"], evidence: "optional",
            options: [
              { value: "estimated", label: "Yes, estimated and budgeted", weight: 0 },
              { value: "partly", label: "Partly — the pilot is costed, scale is not", weight: 1 },
              { value: "not_considered", label: "Not considered", weight: 3 },
            ] },
          { key: "error_costs", label: "What would errors, outages or non-compliance cost to put right?", type: "long_text", required: true,
            help: "Including remediation, compensation, fines, and the cost of running the service without it.",
            legalRefs: ["dsit.airmt"], evidence: "none" },
          { key: "success_measures", label: "Are success measures defined, so you would know whether it delivers the benefit it was adopted for?", type: "single_select", required: true, legalRefs: ["dsit.airmt"], evidence: "none",
            options: [
              { value: "measured", label: "Yes, defined and measured", weight: 0 },
              { value: "defined", label: "Defined, not yet measured", weight: 1 },
              { value: "none", label: "No", weight: 3 },
            ] },
        ],
      },
      {
        key: "legal",
        title: "Legal and regulatory compliance",
        questions: [
          { key: "legal_frameworks", label: "Which legal frameworks have been considered?", type: "multi_select", required: true, legalRefs: ["dsit.airmt"], evidence: "none",
            options: [
              { value: "human_rights", label: "Human rights law" },
              { value: "equality", label: "Equality law, including the Public Sector Equality Duty" },
              { value: "data_protection", label: "Data protection law" },
              { value: "intellectual_property", label: "Intellectual property" },
              { value: "social_value", label: "The Social Value Act" },
              { value: "ai_law", label: "AI-specific law, such as the EU AI Act" },
              { value: "sector", label: "Sector-specific regulation" },
            ] },
          { key: "legal_advice", label: "Has legal advice been taken on this use of AI?", type: "single_select", required: true, legalRefs: ["gds.aiplaybook"], evidence: "optional",
            options: [
              { value: "taken", label: "Yes", weight: 0 },
              { value: "planned", label: "Planned", weight: 2 },
              { value: "not_sought", label: "No", weight: 4 },
            ] },
          { key: "personal_data", label: "Does it process personal data at any stage?", type: "boolean", required: true,
            help: "Including training, fine-tuning, prompts, retrieval and outputs.",
            legalRefs: ["ukgdpr.art5", "ico.ai"], evidence: "none" },
          { key: "dpia_reference", label: "Reference of the related DPIA", type: "short_text", required: false,
            help: "The Playbook expects a DPIA before an AI system processes personal data.",
            showWhen: { op: "equals", question: "personal_data", value: true },
            requireWhen: { op: "equals", question: "personal_data", value: true },
            legalRefs: ["ukgdpr.art35"], evidence: "none" },
          { key: "solely_automated", label: "Does it make decisions with legal or similarly significant effects on people without meaningful human involvement?", type: "single_select", required: false,
            showWhen: { op: "equals", question: "affects_people", value: true },
            requireWhen: { op: "equals", question: "affects_people", value: true },
            legalRefs: ["ukgdpr.art22"], evidence: "none",
            options: [
              { value: "no", label: "No", weight: 0 },
              { value: "yes", label: "Yes", weight: 6 },
            ] },
          { key: "third_party_terms", label: "What third-party data, models or software does it rely on, and do their contract or licence terms permit this use?", type: "long_text", required: true, legalRefs: ["dsit.airmt"], evidence: "optional" },
          { key: "legal_review", label: "How will compliance be kept under review as the law and guidance change?", type: "long_text", required: true, legalRefs: ["dsit.airmt"], evidence: "none" },
        ],
      },
      {
        key: "transparency",
        title: "Transparency and explainability",
        questions: [
          { key: "people_aware", label: "Are the people using it, or affected by it, told that AI is involved?", type: "single_select", required: true, legalRefs: ["gds.aiplaybook", "ukgdpr.art22"], evidence: "none",
            options: [
              { value: "always", label: "Yes, always", weight: 0 },
              { value: "sometimes", label: "Sometimes, or only if they ask", weight: 2 },
              { value: "not_told", label: "No", weight: 4 },
              { value: "not_applicable", label: "Nobody is affected outside the team using it", weight: 0 },
            ] },
          { key: "explainability", label: "Can an individual outcome be explained to the person it affects?", type: "single_select", required: true, legalRefs: ["ico.ai"], evidence: "none",
            options: [
              { value: "explainable", label: "Yes — the factors behind each outcome can be given", weight: 0 },
              { value: "general_only", label: "Only in general terms", weight: 2 },
              { value: "cannot", label: "No", weight: 4 },
              { value: "not_needed", label: "Not needed — no outcome affects anyone", weight: 0 },
            ] },
          { key: "atrs_status", label: "Is it covered by an Algorithmic Transparency Recording Standard record?", type: "single_select", required: true,
            help: "Required for central government departments and in-scope arm's length bodies where the tool influences decisions affecting the public, and encouraged for other public bodies.",
            legalRefs: ["atrs", "gds.aiplaybook"], evidence: "none",
            options: [
              { value: "published", label: "Yes, published", weight: 0 },
              { value: "in_progress", label: "Being written", weight: 1 },
              { value: "required_not_started", label: "Required, not started", weight: 3 },
              { value: "not_required", label: "Not required", weight: 0 },
              { value: "unsure", label: "Not sure whether it is required", weight: 2 },
            ] },
          { key: "model_choice", label: "Why was this model chosen over the alternatives, including approaches that do not use AI?", type: "long_text", required: true, legalRefs: ["gds.aiplaybook", "atrs"], evidence: "none" },
          { key: "who_explains", label: "Who needs to be able to explain its outputs, and can they?", type: "long_text", required: false, legalRefs: ["dsit.airmt"], evidence: "none" },
        ],
      },
      {
        key: "fairness",
        title: "Fairness",
        questions: [
          { key: "bias_considered", label: "Has bias and fairness been assessed for this system?", type: "single_select", required: true, legalRefs: ["uk.equality2010", "ico.ai"], evidence: "optional",
            options: [
              { value: "tested", label: "Yes — tested, with documented results", weight: 0 },
              { value: "reviewed", label: "Yes — reviewed qualitatively, not measured", weight: 2 },
              { value: "planned", label: "Planned but not yet done", weight: 4 },
              { value: "not_done", label: "Not assessed", weight: 6 },
            ] },
          { key: "bias_evidence", label: "Where are the results held?", type: "short_text", required: false,
            showWhen: { op: "equals", question: "bias_considered", value: "tested" },
            requireWhen: { op: "equals", question: "bias_considered", value: "tested" },
            legalRefs: [], evidence: "required" },
          { key: "intersectional", label: "Has performance been compared across protected characteristics, including in combination?", type: "single_select", required: true, legalRefs: ["uk.equality2010", "gds.aiplaybook"], evidence: "optional",
            options: [
              { value: "intersectional", label: "Yes, including intersectional groups", weight: 0 },
              { value: "single", label: "Characteristic by characteristic only", weight: 1 },
              { value: "not_compared", label: "Not compared", weight: 3 },
              { value: "not_applicable", label: "Not applicable — no outcome concerns people", weight: 0 },
            ] },
          { key: "sensitive_inputs", label: "Does it use special category data, or data that could act as a proxy for it?", type: "single_select", required: true,
            help: "Postcode, name and language can all proxy for protected characteristics.",
            legalRefs: ["ukgdpr.art9"], evidence: "none",
            options: [
              { value: "no", label: "No", weight: 0 },
              { value: "proxies_possible", label: "No direct use, but proxies are plausible", weight: 2 },
              { value: "yes", label: "Yes, directly", weight: 4 },
            ] },
          { key: "affected_groups", label: "Which groups could be disadvantaged, and how would you know?", type: "long_text", required: true,
            help: "Answer this even where testing found nothing — naming the groups is what makes later monitoring possible.",
            legalRefs: [], evidence: "none" },
          { key: "equality_impact", label: "Has an equality impact assessment been carried out?", type: "single_select", required: true, legalRefs: ["uk.equality2010.s149"], evidence: "optional",
            options: [
              { value: "done", label: "Yes", weight: 0 },
              { value: "planned", label: "Planned", weight: 2 },
              { value: "not_done", label: "No", weight: 4 },
              { value: "not_public_body", label: "Not applicable — we are not subject to the equality duty", weight: 0 },
            ] },
        ],
      },
      {
        key: "accountability",
        title: "Accountability and governance",
        questions: [
          { key: "accountable_owner", label: "Is one named person accountable for the system and its outputs, with the authority and budget to act?", type: "single_select", required: true, legalRefs: ["gds.aiplaybook", "dsit.airmt"], evidence: "none",
            options: [
              { value: "yes", label: "Yes", weight: 0 },
              { value: "named_without_authority", label: "Someone is named, but without the authority or budget to act", weight: 2 },
              { value: "no", label: "No", weight: 5 },
            ] },
          { key: "governance_board", label: "Has an AI governance board, or AI expertise on an existing board, reviewed this use?", type: "single_select", required: true, legalRefs: ["gds.aiplaybook"], evidence: "optional",
            options: [
              { value: "approved", label: "Yes, and approved it", weight: 0 },
              { value: "scheduled", label: "Scheduled", weight: 1 },
              { value: "none", label: "No", weight: 3 },
            ] },
          { key: "roles_documented", label: "Are roles documented for its data, model changes, deployment and monitoring — including who may change the model?", type: "single_select", required: true, legalRefs: ["gds.aiplaybook"], evidence: "optional",
            options: [
              { value: "documented", label: "Yes", weight: 0 },
              { value: "partly", label: "Partly", weight: 2 },
              { value: "not_documented", label: "No", weight: 3 },
            ] },
          { key: "incident_plan", label: "Is there an incident response plan that covers this system?", type: "single_select", required: true, legalRefs: ["dsit.airmt"], evidence: "optional",
            options: [
              { value: "tested", label: "Yes, and it has been exercised", weight: 0 },
              { value: "exists", label: "Yes", weight: 1 },
              { value: "none", label: "No", weight: 4 },
            ] },
          { key: "raising_concerns", label: "How can staff and the public raise concerns about it, including confidentially?", type: "long_text", required: true, legalRefs: ["dsit.airmt"], evidence: "none" },
        ],
      },
      {
        key: "contestability_section",
        title: "Contestability and redress",
        questions: [
          { key: "contestability", label: "Can someone affected challenge or appeal an outcome?", type: "single_select", required: true, legalRefs: ["ukgdpr.art22", "gds.aiplaybook"], evidence: "none",
            options: [
              { value: "documented_route", label: "Yes — a documented route, with a human decision-maker", weight: 0 },
              { value: "informal", label: "Informally, through existing complaints channels", weight: 2 },
              { value: "none", label: "No route exists", weight: 4 },
              { value: "not_applicable", label: "Not applicable — no decision affects anyone", weight: 0 },
            ] },
          { key: "redress_accessible", label: "Is that route accessible to everyone affected, including people in vulnerable circumstances?", type: "single_select", required: false,
            showWhen: { op: "or", any: [
              { op: "equals", question: "contestability", value: "documented_route" },
              { op: "equals", question: "contestability", value: "informal" },
            ] },
            requireWhen: { op: "or", any: [
              { op: "equals", question: "contestability", value: "documented_route" },
              { op: "equals", question: "contestability", value: "informal" },
            ] },
            legalRefs: ["dsit.airmt"], evidence: "none",
            options: [
              { value: "yes", label: "Yes", weight: 0 },
              { value: "partly", label: "Partly", weight: 2 },
              { value: "no", label: "No", weight: 3 },
            ] },
          { key: "rectification", label: "How are factual errors about a person corrected, and the correction carried through?", type: "long_text", required: false,
            showWhen: { op: "equals", question: "personal_data", value: true },
            legalRefs: ["ukgdpr.art16"], evidence: "none" },
        ],
      },
      {
        key: "robustness",
        title: "Technical robustness",
        questions: [
          { key: "performance_target", label: "Is there a defined level of performance it must maintain, measured against agreed metrics?", type: "single_select", required: true, legalRefs: ["dsit.airmt", "gds.aiplaybook"], evidence: "optional",
            options: [
              { value: "defined_measured", label: "Yes, defined and measured", weight: 0 },
              { value: "defined", label: "Defined, not yet measured", weight: 2 },
              { value: "none", label: "No", weight: 4 },
            ] },
          { key: "data_provenance", label: "How well understood is the training and input data?", type: "single_select", required: true, legalRefs: ["dsit.airmt"], evidence: "optional",
            options: [
              { value: "documented", label: "Fully documented, with rights and licensing confirmed", weight: 0 },
              { value: "partial", label: "Partly documented — the main sources are known", weight: 2 },
              { value: "vendor_asserted", label: "Known only through vendor assertion", weight: 3 },
              { value: "opaque", label: "Not established", weight: 5 },
            ] },
          { key: "stress_testing", label: "Has it been tested in adverse or unexpected conditions, including by people outside the project team?", type: "single_select", required: true,
            help: "The toolkit recommends red-teaming by independent experts; the Playbook asks for the system's behaviour in anomalous scenarios to be recorded.",
            legalRefs: ["dsit.airmt", "gds.aiplaybook"], evidence: "optional",
            options: [
              { value: "independent", label: "Yes, including independent red-teaming", weight: 0 },
              { value: "internal", label: "Tested by the project team only", weight: 2 },
              { value: "none", label: "No", weight: 4 },
            ] },
          { key: "human_oversight", label: "What human oversight is in place?", type: "single_select", required: true, legalRefs: ["gds.aiplaybook"], evidence: "none",
            options: [
              { value: "in_the_loop", label: "A person reviews every output before it has effect", weight: 0 },
              { value: "on_the_loop", label: "A person monitors and can intervene", weight: 2 },
              { value: "post_hoc", label: "Sampling or review after the fact", weight: 3 },
              { value: "none", label: "None", weight: 5 },
            ] },
          { key: "monitoring", label: "What is monitored in production?", type: "multi_select", required: false,
            showWhen: { op: "or", any: [
              { op: "equals", question: "lifecycle_stage", value: "production" },
              { op: "equals", question: "lifecycle_stage", value: "pilot" },
            ] },
            legalRefs: ["dsit.airmt"], evidence: "optional",
            options: [
              { value: "accuracy", label: "Accuracy or quality", weight: 0 },
              { value: "drift", label: "Input or output drift", weight: 0 },
              { value: "harmful_output", label: "Harmful or toxic output", weight: 0 },
              { value: "fairness", label: "Outcomes across groups", weight: 0 },
              { value: "complaints", label: "Complaints and escalations", weight: 0 },
              { value: "usage", label: "Usage volume and pattern", weight: 0 },
              { value: "none", label: "Nothing is monitored", weight: 4 },
            ] },
          { key: "fallback", label: "If it had to be switched off, could the service carry on?", type: "single_select", required: true, legalRefs: ["dsit.airmt", "gds.aiplaybook"], evidence: "none",
            options: [
              { value: "tested", label: "Yes — a fallback exists and has been tried", weight: 0 },
              { value: "planned", label: "A fallback is planned but untried", weight: 2 },
              { value: "none", label: "No", weight: 4 },
            ] },
          { key: "kill_switch", label: "Who can switch it off, and how quickly?", type: "long_text", required: true, legalRefs: ["dsit.airmt"], evidence: "none" },
        ],
      },
      {
        key: "security",
        title: "Security",
        description:
          "Where an existing Cyber Assessment Framework submission has been extended to cover this system's use of AI, cite it rather than answering again.",
        questions: [
          { key: "caf_coverage", label: "Does a Cyber Assessment Framework assessment cover this system's use of AI?", type: "single_select", required: true, legalRefs: ["ncsc.caf"], evidence: "optional",
            options: [
              { value: "covered", label: "Yes, extended to cover its use of AI", weight: 0 },
              { value: "partly", label: "The system is covered, its AI is not", weight: 1 },
              { value: "not_covered", label: "No", weight: 2 },
            ] },
          { key: "ml_principles", label: "Have the NCSC principles for the security of machine learning been applied?", type: "single_select", required: true, legalRefs: ["ncsc.mlprinciples"], evidence: "optional",
            options: [
              { value: "applied", label: "Yes", weight: 0 },
              { value: "partly", label: "Partly", weight: 2 },
              { value: "not_considered", label: "No", weight: 3 },
            ] },
          { key: "ai_threats", label: "Which AI-specific threats have been assessed?", type: "multi_select", required: true, legalRefs: ["gds.aiplaybook"], evidence: "optional",
            options: [
              { value: "prompt_injection", label: "Prompt injection", weight: 0 },
              { value: "data_poisoning", label: "Data or model poisoning", weight: 0 },
              { value: "data_leakage", label: "Data leakage through prompts or outputs", weight: 0 },
              { value: "perturbation", label: "Perturbation or adversarial inputs", weight: 0 },
              { value: "hallucination", label: "Hallucination presented as fact", weight: 0 },
              { value: "toolchain", label: "An insecure AI toolchain or dependency", weight: 0 },
              { value: "none", label: "None have been assessed", weight: 4 },
            ] },
          { key: "data_integrity", label: "Are its datasets drawn from trusted sources and checked for unauthorised change before use?", type: "single_select", required: true, legalRefs: ["dsit.airmt"], evidence: "optional",
            options: [
              { value: "yes", label: "Yes", weight: 0 },
              { value: "partly", label: "Partly", weight: 2 },
              { value: "no", label: "No", weight: 3 },
              { value: "not_applicable", label: "Not applicable — we supply no data to it", weight: 0 },
            ] },
          { key: "security_testing", label: "Is it tested for vulnerabilities before release and after changes?", type: "single_select", required: true, legalRefs: ["dsit.airmt"], evidence: "optional",
            options: [
              { value: "both", label: "Yes, before release and after changes", weight: 0 },
              { value: "release_only", label: "Before first release only", weight: 2 },
              { value: "no", label: "No", weight: 4 },
            ] },
        ],
      },
      {
        key: "people",
        title: "Environment and people",
        questions: [
          { key: "wellbeing", label: "Could it affect anyone's physical or mental wellbeing, or the safety of infrastructure or the environment?", type: "single_select", required: true, legalRefs: ["dsit.airmt"], evidence: "none",
            options: [
              { value: "no", label: "No", weight: 0 },
              { value: "possibly", label: "Possibly", weight: 2 },
              { value: "yes", label: "Yes", weight: 4 },
            ] },
          { key: "audience", label: "Who is exposed to it?", type: "multi_select", required: true, legalRefs: [], evidence: "none",
            options: [
              { value: "internal_few", label: "A small internal team", weight: 0 },
              { value: "internal_wide", label: "Staff across the organisation", weight: 1 },
              { value: "contributors", label: "Contributors, contractors or suppliers", weight: 2 },
              { value: "public", label: "The public", weight: 3 },
              { value: "children", label: "Children, or an audience likely to include them", weight: 4 },
              { value: "vulnerable", label: "People in a vulnerable position", weight: 4 },
            ] },
          { key: "vulnerable_protection", label: "How are children or people in vulnerable positions protected?", type: "long_text", required: false,
            showWhen: { op: "or", any: [
              { op: "includes", question: "audience", value: "children" },
              { op: "includes", question: "audience", value: "vulnerable" },
            ] },
            requireWhen: { op: "or", any: [
              { op: "includes", question: "audience", value: "children" },
              { op: "includes", question: "audience", value: "vulnerable" },
            ] },
            legalRefs: ["dsit.airmt"], evidence: "none" },
          { key: "environmental_cost", label: "Has the energy and environmental cost of training and running it been weighed against the benefit?", type: "single_select", required: true, legalRefs: ["gds.aiplaybook"], evidence: "none",
            options: [
              { value: "weighed", label: "Yes", weight: 0 },
              { value: "not_weighed", label: "No", weight: 2 },
            ] },
        ],
      },
      {
        key: "findings",
        title: "What was found",
        questions: [
          { key: "risk_categories", label: "In which categories does this system carry a risk that belongs on the risk register?", type: "multi_select", required: true,
            help: "Raise each one from this assessment under its category. That is where it is scored on the organisation's scale, judged against appetite for that category, and treated.",
            legalRefs: ["dsit.airmt", "hmt.orangebook"], evidence: "none",
            options: [
              ...AI_RISK_CATEGORIES.map((c) => ({ value: c.value, label: c.label })),
              { value: "none", label: "None — nothing found needs to go on the register" },
            ] },
          { key: "review_interval", label: "How soon should this assessment be revisited?", type: "single_select", required: true,
            help: "Sooner than the template's usual cycle if the system, its data or its use is likely to change.",
            legalRefs: ["dsit.airmt"], evidence: "none",
            options: [
              { value: "quarterly", label: "Quarterly" },
              { value: "biannual", label: "Every six months" },
              { value: "annual", label: "Annually" },
            ] },
        ],
      },
    ],
  },
  scoring: {
    method: "weighted_sum",
    questions: [
      "consequence",
      "running_costs",
      "success_measures",
      "legal_advice",
      "solely_automated",
      "people_aware",
      "explainability",
      "atrs_status",
      "bias_considered",
      "intersectional",
      "sensitive_inputs",
      "equality_impact",
      "accountable_owner",
      "governance_board",
      "roles_documented",
      "incident_plan",
      "contestability",
      "redress_accessible",
      "performance_target",
      "data_provenance",
      "stress_testing",
      "human_oversight",
      "monitoring",
      "fallback",
      "caf_coverage",
      "ml_principles",
      "ai_threats",
      "data_integrity",
      "security_testing",
      "wellbeing",
      "audience",
      "environmental_cost",
    ],
    // A well-governed internal tool lands in the first band; one that decides
    // about the public with no oversight, testing or route to challenge cannot
    // get out of the last. The cut points sit where the existing AI risk
    // assessment's do, scaled to the larger number of questions.
    bands: [
      { min: 0, max: 15, label: "Minimal", tier: "low" },
      { min: 16, max: 35, label: "Limited", tier: "medium" },
      { min: 36, max: 60, label: "High", tier: "high" },
      { min: 61, max: 200, label: "Unacceptable without change", tier: "critical" },
    ],
  },
  reviewIntervalMonths: 12,
};
