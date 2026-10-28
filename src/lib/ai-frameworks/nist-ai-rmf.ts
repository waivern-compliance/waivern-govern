/**
 * NIST AI Risk Management Framework 1.0 (NIST AI 100-1, January 2023): its
 * four functions, nineteen categories and seventy-two subcategories, and the
 * seven characteristics of trustworthy AI it measures against.
 *
 * Reference data only. Nothing here decides how an organisation works until a
 * NIST framework pack draws on it (docs/ai-framework-switch-plan.md). The
 * category and subcategory wording is NIST's own, verbatim, so a reviewer can
 * match it to the framework; NIST publications are works of the US Government
 * and not subject to copyright.
 *
 * Source: https://doi.org/10.6028/NIST.AI.100-1, Tables 1 to 4.
 */

export const NIST_AI_RMF_SOURCE = "https://doi.org/10.6028/NIST.AI.100-1";

export type NistFunction = "GOVERN" | "MAP" | "MEASURE" | "MANAGE";

export const NIST_FUNCTIONS: ReadonlyArray<{ fn: NistFunction; label: string; summary: string }> = [
  { fn: "GOVERN", label: "Govern", summary: "A culture of AI risk management is cultivated and present: policies, accountability, workforce, engagement and third parties." },
  { fn: "MAP", label: "Map", summary: "Context is recognised and risks related to that context are identified." },
  { fn: "MEASURE", label: "Measure", summary: "Identified risks are assessed, analysed or tracked." },
  { fn: "MANAGE", label: "Manage", summary: "Risks are prioritised and acted upon based on their projected impact." },
];

export type NistCategory = { fn: NistFunction; category: number; text: string };
export type NistSubcategory = { fn: NistFunction; category: number; n: number; text: string };

export const NIST_CATEGORIES: readonly NistCategory[] = [
  { fn: "GOVERN", category: 1, text: "Policies, processes, procedures, and practices across the organization related to the mapping, measuring, and managing of AI risks are in place, transparent, and implemented effectively." },
  { fn: "GOVERN", category: 2, text: "Accountability structures are in place so that the appropriate teams and individuals are empowered, responsible, and trained for mapping, measuring, and managing AI risks." },
  { fn: "GOVERN", category: 3, text: "Workforce diversity, equity, inclusion, and accessibility processes are prioritized in the mapping, measuring, and managing of AI risks throughout the lifecycle." },
  { fn: "GOVERN", category: 4, text: "Organizational teams are committed to a culture that considers and communicates AI risk." },
  { fn: "GOVERN", category: 5, text: "Processes are in place for robust engagement with relevant AI actors." },
  { fn: "GOVERN", category: 6, text: "Policies and procedures are in place to address AI risks and benefits arising from third-party software and data and other supply chain issues." },
  { fn: "MAP", category: 1, text: "Context is established and understood." },
  { fn: "MAP", category: 2, text: "Categorization of the AI system is performed." },
  { fn: "MAP", category: 3, text: "AI capabilities, targeted usage, goals, and expected benefits and costs compared with appropriate benchmarks are understood." },
  { fn: "MAP", category: 4, text: "Risks and benefits are mapped for all components of the AI system including third-party software and data." },
  { fn: "MAP", category: 5, text: "Impacts to individuals, groups, communities, organizations, and society are characterized." },
  { fn: "MEASURE", category: 1, text: "Appropriate methods and metrics are identified and applied." },
  { fn: "MEASURE", category: 2, text: "AI systems are evaluated for trustworthy characteristics." },
  { fn: "MEASURE", category: 3, text: "Mechanisms for tracking identified AI risks over time are in place." },
  { fn: "MEASURE", category: 4, text: "Feedback about efficacy of measurement is gathered and assessed." },
  { fn: "MANAGE", category: 1, text: "AI risks based on assessments and other analytical output from the MAP and MEASURE functions are prioritized, responded to, and managed." },
  { fn: "MANAGE", category: 2, text: "Strategies to maximize AI benefits and minimize negative impacts are planned, prepared, implemented, documented, and informed by input from relevant AI actors." },
  { fn: "MANAGE", category: 3, text: "AI risks and benefits from third-party entities are managed." },
  { fn: "MANAGE", category: 4, text: "Risk treatments, including response and recovery, and communication plans for the identified and measured AI risks are documented and monitored regularly." },
];

export const NIST_SUBCATEGORIES: readonly NistSubcategory[] = [
  { fn: "GOVERN", category: 1, n: 1, text: "Legal and regulatory requirements involving AI are understood, managed, and documented." },
  { fn: "GOVERN", category: 1, n: 2, text: "The characteristics of trustworthy AI are integrated into organizational policies, processes, procedures, and practices." },
  { fn: "GOVERN", category: 1, n: 3, text: "Processes, procedures, and practices are in place to determine the needed level of risk management activities based on the organization’s risk tolerance." },
  { fn: "GOVERN", category: 1, n: 4, text: "The risk management process and its outcomes are established through transparent policies, procedures, and other controls based on organizational risk priorities." },
  { fn: "GOVERN", category: 1, n: 5, text: "Ongoing monitoring and periodic review of the risk management process and its outcomes are planned and organizational roles and responsibilities clearly defined, including determining the frequency of periodic review." },
  { fn: "GOVERN", category: 1, n: 6, text: "Mechanisms are in place to inventory AI systems and are resourced according to organizational risk priorities." },
  { fn: "GOVERN", category: 1, n: 7, text: "Processes and procedures are in place for decommissioning and phasing out AI systems safely and in a manner that does not increase risks or decrease the organization’s trustworthiness." },
  { fn: "GOVERN", category: 2, n: 1, text: "Roles and responsibilities and lines of communication related to mapping, measuring, and managing AI risks are documented and are clear to individuals and teams throughout the organization." },
  { fn: "GOVERN", category: 2, n: 2, text: "The organization’s personnel and partners receive AI risk management training to enable them to perform their duties and responsibilities consistent with related policies, procedures, and agreements." },
  { fn: "GOVERN", category: 2, n: 3, text: "Executive leadership of the organization takes responsibility for decisions about risks associated with AI system development and deployment." },
  { fn: "GOVERN", category: 3, n: 1, text: "Decision-making related to mapping, measuring, and managing AI risks throughout the lifecycle is informed by a diverse team (e.g., diversity of demographics, disciplines, experience, expertise, and backgrounds)." },
  { fn: "GOVERN", category: 3, n: 2, text: "Policies and procedures are in place to define and differentiate roles and responsibilities for human-AI configurations and oversight of AI systems." },
  { fn: "GOVERN", category: 4, n: 1, text: "Organizational policies and practices are in place to foster a critical thinking and safety-first mindset in the design, development, deployment, and uses of AI systems to minimize potential negative impacts." },
  { fn: "GOVERN", category: 4, n: 2, text: "Organizational teams document the risks and potential impacts of the AI technology they design, develop, deploy, evaluate, and use, and they communicate about the impacts more broadly." },
  { fn: "GOVERN", category: 4, n: 3, text: "Organizational practices are in place to enable AI testing, identification of incidents, and information sharing." },
  { fn: "GOVERN", category: 5, n: 1, text: "Organizational policies and practices are in place to collect, consider, prioritize, and integrate feedback from those external to the team that developed or deployed the AI system regarding the potential individual and societal impacts related to AI risks." },
  { fn: "GOVERN", category: 5, n: 2, text: "Mechanisms are established to enable the team that developed or deployed AI systems to regularly incorporate adjudicated feedback from relevant AI actors into system design and implementation." },
  { fn: "GOVERN", category: 6, n: 1, text: "Policies and procedures are in place that address AI risks associated with third-party entities, including risks of infringement of a third-party’s intellectual property or other rights." },
  { fn: "GOVERN", category: 6, n: 2, text: "Contingency processes are in place to handle failures or incidents in third-party data or AI systems deemed to be high-risk." },
  { fn: "MAP", category: 1, n: 1, text: "Intended purposes, potentially beneficial uses, context-specific laws, norms and expectations, and prospective settings in which the AI system will be deployed are understood and documented. Considerations include: the specific set or types of users along with their expectations; potential positive and negative impacts of system uses to individuals, communities, organizations, society, and the planet; assumptions and related limitations about AI system purposes, uses, and risks across the development or product AI lifecycle; and related TEVV and system metrics." },
  { fn: "MAP", category: 1, n: 2, text: "Interdisciplinary AI actors, competencies, skills, and capacities for establishing context reflect demographic diversity and broad domain and user experience expertise, and their participation is documented. Opportunities for interdisciplinary collaboration are prioritized." },
  { fn: "MAP", category: 1, n: 3, text: "The organization’s mission and relevant goals for AI technology are understood and documented." },
  { fn: "MAP", category: 1, n: 4, text: "The business value or context of business use has been clearly defined or – in the case of assessing existing AI systems – re-evaluated." },
  { fn: "MAP", category: 1, n: 5, text: "Organizational risk tolerances are determined and documented." },
  { fn: "MAP", category: 1, n: 6, text: "System requirements (e.g., “the system shall respect the privacy of its users”) are elicited from and understood by relevant AI actors. Design decisions take socio-technical implications into account to address AI risks." },
  { fn: "MAP", category: 2, n: 1, text: "The specific tasks and methods used to implement the tasks that the AI system will support are defined (e.g., classifiers, generative models, recommenders)." },
  { fn: "MAP", category: 2, n: 2, text: "Information about the AI system’s knowledge limits and how system output may be utilized and overseen by humans is documented. Documentation provides sufficient information to assist relevant AI actors when making decisions and taking subsequent actions." },
  { fn: "MAP", category: 2, n: 3, text: "Scientific integrity and TEVV considerations are identified and documented, including those related to experimental design, data collection and selection (e.g., availability, representativeness, suitability), system trustworthiness, and construct validation." },
  { fn: "MAP", category: 3, n: 1, text: "Potential benefits of intended AI system functionality and performance are examined and documented." },
  { fn: "MAP", category: 3, n: 2, text: "Potential costs, including non-monetary costs, which result from expected or realized AI errors or system functionality and trustworthiness – as connected to organizational risk tolerance – are examined and documented." },
  { fn: "MAP", category: 3, n: 3, text: "Targeted application scope is specified and documented based on the system’s capability, established context, and AI system categorization." },
  { fn: "MAP", category: 3, n: 4, text: "Processes for operator and practitioner proficiency with AI system performance and trustworthiness – and relevant technical standards and certifications – are defined, assessed, and documented." },
  { fn: "MAP", category: 3, n: 5, text: "Processes for human oversight are defined, assessed, and documented in accordance with organizational policies from the GOVERN function." },
  { fn: "MAP", category: 4, n: 1, text: "Approaches for mapping AI technology and legal risks of its components – including the use of third-party data or software – are in place, followed, and documented, as are risks of infringement of a third party’s intellectual property or other rights." },
  { fn: "MAP", category: 4, n: 2, text: "Internal risk controls for components of the AI system, including third-party AI technologies, are identified and documented." },
  { fn: "MAP", category: 5, n: 1, text: "Likelihood and magnitude of each identified impact (both potentially beneficial and harmful) based on expected use, past uses of AI systems in similar contexts, public incident reports, feedback from those external to the team that developed or deployed the AI system, or other data are identified and documented." },
  { fn: "MAP", category: 5, n: 2, text: "Practices and personnel for supporting regular engagement with relevant AI actors and integrating feedback about positive, negative, and unanticipated impacts are in place and documented." },
  { fn: "MEASURE", category: 1, n: 1, text: "Approaches and metrics for measurement of AI risks enumerated during the MAP function are selected for implementation starting with the most significant AI risks. The risks or trustworthiness characteristics that will not – or cannot – be measured are properly documented." },
  { fn: "MEASURE", category: 1, n: 2, text: "Appropriateness of AI metrics and effectiveness of existing controls are regularly assessed and updated, including reports of errors and potential impacts on affected communities." },
  { fn: "MEASURE", category: 1, n: 3, text: "Internal experts who did not serve as front-line developers for the system and/or independent assessors are involved in regular assessments and updates. Domain experts, users, AI actors external to the team that developed or deployed the AI system, and affected communities are consulted in support of assessments as necessary per organizational risk tolerance." },
  { fn: "MEASURE", category: 2, n: 1, text: "Test sets, metrics, and details about the tools used during TEVV are documented." },
  { fn: "MEASURE", category: 2, n: 2, text: "Evaluations involving human subjects meet applicable requirements (including human subject protection) and are representative of the relevant population." },
  { fn: "MEASURE", category: 2, n: 3, text: "AI system performance or assurance criteria are measured qualitatively or quantitatively and demonstrated for conditions similar to deployment setting(s). Measures are documented." },
  { fn: "MEASURE", category: 2, n: 4, text: "The functionality and behavior of the AI system and its components – as identified in the MAP function – are monitored when in production." },
  { fn: "MEASURE", category: 2, n: 5, text: "The AI system to be deployed is demonstrated to be valid and reliable. Limitations of the generalizability beyond the conditions under which the technology was developed are documented." },
  { fn: "MEASURE", category: 2, n: 6, text: "The AI system is evaluated regularly for safety risks – as identified in the MAP function. The AI system to be deployed is demonstrated to be safe, its residual negative risk does not exceed the risk tolerance, and it can fail safely, particularly if made to operate beyond its knowledge limits. Safety metrics reflect system reliability and robustness, real-time monitoring, and response times for AI system failures." },
  { fn: "MEASURE", category: 2, n: 7, text: "AI system security and resilience – as identified in the MAP function – are evaluated and documented." },
  { fn: "MEASURE", category: 2, n: 8, text: "Risks associated with transparency and accountability – as identified in the MAP function – are examined and documented." },
  { fn: "MEASURE", category: 2, n: 9, text: "The AI model is explained, validated, and documented, and AI system output is interpreted within its context – as identified in the MAP function – to inform responsible use and governance." },
  { fn: "MEASURE", category: 2, n: 10, text: "Privacy risk of the AI system – as identified in the MAP function – is examined and documented." },
  { fn: "MEASURE", category: 2, n: 11, text: "Fairness and bias – as identified in the MAP function – are evaluated and results are documented." },
  { fn: "MEASURE", category: 2, n: 12, text: "Environmental impact and sustainability of AI model training and management activities – as identified in the MAP function – are assessed and documented." },
  { fn: "MEASURE", category: 2, n: 13, text: "Effectiveness of the employed TEVV metrics and processes in the MEASURE function are evaluated and documented." },
  { fn: "MEASURE", category: 3, n: 1, text: "Approaches, personnel, and documentation are in place to regularly identify and track existing, unanticipated, and emergent AI risks based on factors such as intended and actual performance in deployed contexts." },
  { fn: "MEASURE", category: 3, n: 2, text: "Risk tracking approaches are considered for settings where AI risks are difficult to assess using currently available measurement techniques or where metrics are not yet available." },
  { fn: "MEASURE", category: 3, n: 3, text: "Feedback processes for end users and impacted communities to report problems and appeal system outcomes are established and integrated into AI system evaluation metrics." },
  { fn: "MEASURE", category: 4, n: 1, text: "Measurement approaches for identifying AI risks are connected to deployment context(s) and informed through consultation with domain experts and other end users. Approaches are documented." },
  { fn: "MEASURE", category: 4, n: 2, text: "Measurement results regarding AI system trustworthiness in deployment context(s) and across the AI lifecycle are informed by input from domain experts and relevant AI actors to validate whether the system is performing consistently as intended. Results are documented." },
  { fn: "MEASURE", category: 4, n: 3, text: "Measurable performance improvements or declines based on consultations with relevant AI actors, including affected communities, and field data about context-relevant risks and trustworthiness characteristics are identified and documented." },
  { fn: "MANAGE", category: 1, n: 1, text: "A determination is made as to whether the AI system achieves its intended purposes and stated objectives and whether its development or deployment should proceed." },
  { fn: "MANAGE", category: 1, n: 2, text: "Treatment of documented AI risks is prioritized based on impact, likelihood, and available resources or methods." },
  { fn: "MANAGE", category: 1, n: 3, text: "Responses to the AI risks deemed high priority, as identified by the MAP function, are developed, planned, and documented. Risk response options can include mitigating, transferring, avoiding, or accepting." },
  { fn: "MANAGE", category: 1, n: 4, text: "Negative residual risks (defined as the sum of all unmitigated risks) to both downstream acquirers of AI systems and end users are documented." },
  { fn: "MANAGE", category: 2, n: 1, text: "Resources required to manage AI risks are taken into account – along with viable non-AI alternative systems, approaches, or methods – to reduce the magnitude or likelihood of potential impacts." },
  { fn: "MANAGE", category: 2, n: 2, text: "Mechanisms are in place and applied to sustain the value of deployed AI systems." },
  { fn: "MANAGE", category: 2, n: 3, text: "Procedures are followed to respond to and recover from a previously unknown risk when it is identified." },
  { fn: "MANAGE", category: 2, n: 4, text: "Mechanisms are in place and applied, and responsibilities are assigned and understood, to supersede, disengage, or deactivate AI systems that demonstrate performance or outcomes inconsistent with intended use." },
  { fn: "MANAGE", category: 3, n: 1, text: "AI risks and benefits from third-party resources are regularly monitored, and risk controls are applied and documented." },
  { fn: "MANAGE", category: 3, n: 2, text: "Pre-trained models which are used for development are monitored as part of AI system regular monitoring and maintenance." },
  { fn: "MANAGE", category: 4, n: 1, text: "Post-deployment AI system monitoring plans are implemented, including mechanisms for capturing and evaluating input from users and other relevant AI actors, appeal and override, decommissioning, incident response, recovery, and change management." },
  { fn: "MANAGE", category: 4, n: 2, text: "Measurable activities for continual improvements are integrated into AI system updates and include regular engagement with interested parties, including relevant AI actors." },
  { fn: "MANAGE", category: 4, n: 3, text: "Incidents and errors are communicated to relevant AI actors, including affected communities. Processes for tracking, responding to, and recovering from incidents and errors are followed and documented." },
];

/**
 * The characteristics of trustworthy AI (section 3). Each is evaluated under
 * one MEASURE 2 subcategory, given here, which is where a NIST profile records
 * how it is being met.
 */
export const TRUSTWORTHY_CHARACTERISTICS = [
  { value: "valid_reliable", label: "Valid and reliable", measuredBy: "MEASURE 2.5",
    summary: "Does what it is meant to, accurately and robustly, including in conditions it was not built for." },
  { value: "safe", label: "Safe", measuredBy: "MEASURE 2.6",
    summary: "Does not endanger human life, health, property or the environment, and can fail safely." },
  { value: "secure_resilient", label: "Secure and resilient", measuredBy: "MEASURE 2.7",
    summary: "Withstands attack and unexpected change, and recovers its function when it degrades." },
  { value: "accountable_transparent", label: "Accountable and transparent", measuredBy: "MEASURE 2.8",
    summary: "People can find out about the system and its outputs, and someone answers for them." },
  { value: "explainable_interpretable", label: "Explainable and interpretable", measuredBy: "MEASURE 2.9",
    summary: "How the system reaches an output, and what that output means in context, can be understood." },
  { value: "privacy_enhanced", label: "Privacy-enhanced", measuredBy: "MEASURE 2.10",
    summary: "Safeguards autonomy, identity and dignity by limiting observation, intrusion and inference about people." },
  { value: "fair_bias_managed", label: "Fair, with harmful bias managed", measuredBy: "MEASURE 2.11",
    summary: "Equality and equity are addressed, and systemic, computational and human bias is managed." },
] as const;

export type TrustworthyCharacteristic = (typeof TRUSTWORTHY_CHARACTERISTICS)[number]["value"];

/** "MEASURE 2.11", as NIST writes it. */
export function subcategoryId(s: Pick<NistSubcategory, "fn" | "category" | "n">): string {
  return `${s.fn} ${s.category}.${s.n}`;
}

/** The reference-library code for a function, category or subcategory: `nist.airmf.measure.2.11`. */
export function nistCode(fn: NistFunction, category?: number, n?: number): string {
  return ["nist.airmf", fn.toLowerCase(), category, n].filter((p) => p !== undefined).join(".");
}

const BY_ID = new Map(NIST_SUBCATEGORIES.map((s) => [subcategoryId(s), s]));

/** A subcategory by its NIST identifier, "GOVERN 2.3". */
export function nistSubcategory(id: string): NistSubcategory | null {
  return BY_ID.get(id) ?? null;
}

const REF = { regime: "NIST AI RMF 1.0", url: NIST_AI_RMF_SOURCE, jurisdiction: "US" } as const;

/**
 * Every function, category and subcategory as an entry in the shared reference
 * library, so a template can cite "MEASURE 2.11" the way it cites Article 35.
 */
export const NIST_LEGAL_REFERENCES = [
  ...NIST_FUNCTIONS.map((f) => ({ ...REF, code: nistCode(f.fn), citation: f.fn, title: `${f.label}: ${f.summary}` })),
  ...NIST_CATEGORIES.map((c) => ({ ...REF, code: nistCode(c.fn, c.category), citation: `${c.fn} ${c.category}`, title: c.text })),
  ...NIST_SUBCATEGORIES.map((s) => ({ ...REF, code: nistCode(s.fn, s.category, s.n), citation: subcategoryId(s), title: s.text })),
];
