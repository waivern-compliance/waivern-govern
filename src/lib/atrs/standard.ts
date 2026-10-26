/**
 * The Algorithmic Transparency Recording Standard, version 4.0.
 *
 * The fields of DSIT's own template, under its own reference numbers, so a
 * record kept here can be checked line by line against the template and its
 * guidance, and an export pasted into it without reinterpretation. Prompts are
 * shortened from the template's; the guidance it links to is where the detail
 * lives, and is linked from the record page.
 *
 * Central government departments, and arm's length bodies in scope, must
 * publish a record for algorithmic tools that have a significant influence on
 * decisions affecting the public or that interact with the public directly.
 * Other public bodies are encouraged to.
 *
 * Contains public sector information licensed under the Open Government Licence v3.0.
 */

export const ATRS_VERSION = "4.0";
export const ATRS_TEMPLATE_URL =
  "https://www.gov.uk/government/publications/algorithmic-transparency-template";
export const ATRS_GUIDANCE_URL =
  "https://www.gov.uk/government/publications/guidance-for-organisations-using-the-algorithmic-transparency-recording-standard";
export const ATRS_SUBMISSION_EMAIL = "algorithmic-transparency@dsit.gov.uk";

export type AtrsFieldType = "text" | "long" | "select" | "yesno" | "url" | "email";

export type AtrsField = {
  /** The template's own reference, e.g. "2.1.3". */
  ref: string;
  label: string;
  prompt: string;
  type: AtrsFieldType;
  options?: readonly string[];
  /**
   * Whether a record can be approved without it. "always" fields are needed;
   * "third_party" only when third parties were involved; "optional" fields are
   * the template's "where applicable" ones.
   */
  need: "always" | "third_party" | "optional";
};

export type AtrsSection = {
  ref: string;
  title: string;
  /** Metadata and Tier 1 are for the public; Tier 2 for specialists. */
  tier: "metadata" | "tier1" | "tier2";
  description: string;
  /**
   * The template lets a tool built on an off-the-shelf model the organisation
   * has not trained, tuned or tested leave the model and development data
   * sections blank. They are never needed for approval.
   */
  optionalSection?: boolean;
  fields: readonly AtrsField[];
};

export const ATRS_PHASES = ["Pre-deployment", "Private Beta", "Public Beta", "Production", "Retired"] as const;

export const ATRS_REGIONS = [
  "International", "UK", "Great Britain", "England and Wales", "Northern Ireland", "Scotland",
  "Wales", "England", "London", "North East", "North West", "Yorkshire and the Humber",
  "East Midlands", "West Midlands", "South East", "East of England", "South West",
] as const;

export const ATRS_SECTIONS: readonly AtrsSection[] = [
  {
    ref: "0",
    title: "Metadata and title",
    tier: "metadata",
    description: "For filtering, search and display in the public repository.",
    fields: [
      { ref: "0.1", label: "Title", prompt: "The name the tool is known by. This becomes the title of the record.", type: "text", need: "always" },
      { ref: "0.2", label: "Organisation name", prompt: "The full name of the body that completed the record and is responsible for using the tool.", type: "text", need: "always" },
      { ref: "0.3", label: "Phase", prompt: "The phase the tool is in now.", type: "select", options: ATRS_PHASES, need: "always" },
      { ref: "0.4", label: "Region", prompt: "The main region whose public the tool affects.", type: "select", options: ATRS_REGIONS, need: "always" },
      { ref: "0.5", label: "One sentence description", prompt: "One sentence describing the tool, shown under the title.", type: "text", need: "always" },
    ],
  },
  {
    ref: "1",
    title: "Summary information",
    tier: "tier1",
    description: "A plain description of the tool for the general public.",
    fields: [
      { ref: "1.1", label: "Name", prompt: "The name the tool is known by.", type: "text", need: "always" },
      { ref: "1.2", label: "Description", prompt: "What the tool is, and why it is being used.", type: "long", need: "always" },
      { ref: "1.3", label: "Website URL", prompt: "A public web page with more about the tool, if there is one.", type: "url", need: "optional" },
      { ref: "1.4", label: "Contact email", prompt: "A team address rather than a person's, for continuity.", type: "email", need: "always" },
    ],
  },
  {
    ref: "2.1",
    title: "Owner and responsibility",
    tier: "tier2",
    description: "Who is accountable for developing and deploying the tool.",
    fields: [
      { ref: "2.1.1", label: "Organisation or department", prompt: "The full name of the body responsible for using the tool.", type: "text", need: "always" },
      { ref: "2.1.2", label: "Team", prompt: "The full name of the team responsible for using the tool.", type: "text", need: "always" },
      { ref: "2.1.3", label: "Senior responsible owner", prompt: "The role title — not the name — of the person accountable for the tool.", type: "text", need: "always" },
      { ref: "2.1.4", label: "Third party involvement", prompt: "Have any third parties been involved in developing or deploying the tool?", type: "yesno", need: "always" },
      { ref: "2.1.4.1", label: "Third party", prompt: "Every organisation contracted to develop or deploy all or part of the tool.", type: "long", need: "third_party" },
      { ref: "2.1.4.2", label: "Companies House number", prompt: "Their Companies House numbers, where they have them.", type: "text", need: "optional" },
      { ref: "2.1.4.3", label: "Third party role", prompt: "What each third party did.", type: "long", need: "third_party" },
      { ref: "2.1.4.4", label: "Procurement procedure type", prompt: "How each was contracted — open, restricted, a framework call-off, a dynamic purchasing system.", type: "long", need: "third_party" },
      { ref: "2.1.4.5", label: "Third party data access terms", prompt: "The terms on which third parties have access to data.", type: "long", need: "third_party" },
    ],
  },
  {
    ref: "2.2",
    title: "Description and rationale",
    tier: "tier2",
    description: "What the tool is for, and why it was chosen.",
    fields: [
      { ref: "2.2.1", label: "Detailed description", prompt: "How the tool works, its purpose, intended users and main functions — including its scope and where it does not apply.", type: "long", need: "always" },
      { ref: "2.2.2", label: "Benefits", prompt: "The main benefits it is expected to deliver.", type: "long", need: "always" },
      { ref: "2.2.3", label: "Previous process", prompt: "The process it replaced, where there was one.", type: "long", need: "optional" },
      { ref: "2.2.4", label: "Alternatives considered", prompt: "Other algorithmic and non-algorithmic options considered, and why this one was chosen.", type: "long", need: "always" },
    ],
  },
  {
    ref: "2.3",
    title: "Deployment context",
    tier: "tier2",
    description: "How the tool fits into the work it supports.",
    fields: [
      { ref: "2.3.1", label: "Integration into broader operational process", prompt: "What decisions or processes its output informs, and what it gives the people who use it.", type: "long", need: "always" },
      { ref: "2.3.2", label: "Human review", prompt: "When and how a person reviews its output, and how that review is assured.", type: "long", need: "always" },
      { ref: "2.3.3", label: "Frequency and scale of usage", prompt: "How often it is used and at what scale — decisions a month, people interacting with it.", type: "long", need: "always" },
      { ref: "2.3.4", label: "Required training", prompt: "Training the people using it must complete, if any.", type: "long", need: "optional" },
      { ref: "2.3.5", label: "Appeals and review", prompt: "Whether a member of the public can appeal a decision it assisted, and how.", type: "long", need: "always" },
    ],
  },
  {
    ref: "2.4.1",
    title: "Tool specification",
    tier: "tier2",
    description: "The technical shape of the tool as a whole.",
    fields: [
      { ref: "2.4.1.1", label: "System architecture", prompt: "A high-level description of the architecture and its key technical features, or a link to documentation.", type: "long", need: "always" },
      { ref: "2.4.1.2", label: "System-level input", prompt: "What goes into the tool.", type: "long", need: "always" },
      { ref: "2.4.1.3", label: "System-level output", prompt: "What comes out of it.", type: "long", need: "always" },
      { ref: "2.4.1.4", label: "Maintenance", prompt: "How it is maintained and reviewed, including how often any model is retrained.", type: "long", need: "always" },
      { ref: "2.4.1.5", label: "Models", prompt: "Every model in the tool — rule-based, machine learning, statistical, foundation models.", type: "long", need: "always" },
    ],
  },
  {
    ref: "2.4.2",
    title: "Model specification",
    tier: "tier2",
    description:
      "One model in the tool. May be left blank for an off-the-shelf model the organisation has not trained, tuned, tested or refined.",
    optionalSection: true,
    fields: [
      { ref: "2.4.2.1", label: "Model name", prompt: "Its name — for a pre-trained model, the provider, or that it is self-hosted.", type: "text", need: "optional" },
      { ref: "2.4.2.2", label: "Model version", prompt: "Its version, as the provider gives it.", type: "text", need: "optional" },
      { ref: "2.4.2.3", label: "Model task", prompt: "The task it is designed to perform.", type: "long", need: "optional" },
      { ref: "2.4.2.4", label: "Model input", prompt: "What it takes in.", type: "long", need: "optional" },
      { ref: "2.4.2.5", label: "Model output", prompt: "What it produces.", type: "long", need: "optional" },
      { ref: "2.4.2.6", label: "Model architecture", prompt: "How it is designed and works — the type of model, methods, and any explicit feature weighting.", type: "long", need: "optional" },
      { ref: "2.4.2.7", label: "Model performance", prompt: "How it was evaluated for deployment, the metrics used and what they found.", type: "long", need: "optional" },
      { ref: "2.4.2.8", label: "Datasets and their purposes", prompt: "Every dataset used to develop it, and what each was used for.", type: "long", need: "optional" },
    ],
  },
  {
    ref: "2.4.3",
    title: "Development data specification",
    tier: "tier2",
    description:
      "The data used to develop a model. May be left blank on the same terms as the model specification.",
    optionalSection: true,
    fields: [
      { ref: "2.4.3.1", label: "Development data description", prompt: "The datasets used, with public links where possible.", type: "long", need: "optional" },
      { ref: "2.4.3.2", label: "Data modality", prompt: "Text, image, audio, video, tabular, time series, graph, geospatial, multimodal or other.", type: "text", need: "optional" },
      { ref: "2.4.3.3", label: "Data quantities", prompt: "How much data, and how it was split for training, validation and testing.", type: "long", need: "optional" },
      { ref: "2.4.3.4", label: "Sensitive attributes", prompt: "Personal data, protected characteristics or known proxies in it, and how they are handled.", type: "long", need: "optional" },
      { ref: "2.4.3.5", label: "Data completeness and representativeness", prompt: "Missing data, and how representative it is of the population concerned.", type: "long", need: "optional" },
      { ref: "2.4.3.6", label: "Data cleaning", prompt: "Any cleaning or pre-processing.", type: "long", need: "optional" },
      { ref: "2.4.3.7", label: "Data collection", prompt: "How and why it was originally collected, and why it suits this use if repurposed.", type: "long", need: "optional" },
      { ref: "2.4.3.8", label: "Data access and storage", prompt: "Who has access, for how long it is kept, who is responsible, and how sensitive data is protected.", type: "long", need: "optional" },
      { ref: "2.4.3.9", label: "Data sharing agreements", prompt: "Who it is shared with, on what terms.", type: "long", need: "optional" },
    ],
  },
  {
    ref: "2.4.4",
    title: "Operational data specification",
    tier: "tier2",
    description: "The data the tool uses once it is running.",
    fields: [
      { ref: "2.4.4.1", label: "Data sources", prompt: "Where its data comes from in operation — user inputs, API calls and so on.", type: "long", need: "always" },
      { ref: "2.4.4.2", label: "Sensitive attributes", prompt: "Personal data, protected characteristics or known proxies in it, and how they are handled.", type: "long", need: "always" },
      { ref: "2.4.4.3", label: "Data processing methods", prompt: "Any pre-processing of operational data.", type: "long", need: "optional" },
      { ref: "2.4.4.4", label: "Data access and storage", prompt: "Whether inputs or logs are stored, who can access them, for how long, and who is responsible.", type: "long", need: "always" },
      { ref: "2.4.4.5", label: "Data sharing agreements", prompt: "Who operational data is shared with, on what terms.", type: "long", need: "optional" },
    ],
  },
  {
    ref: "2.5",
    title: "Risks, mitigations and impact assessments",
    tier: "tier2",
    description: "What was assessed, what could go wrong, and what is done about it.",
    fields: [
      { ref: "2.5.1", label: "Impact assessments", prompt: "The impact assessments carried out — DPIA, equality, algorithmic — with dates, findings and public links.", type: "long", need: "always" },
      { ref: "2.5.2", label: "Risks and mitigations", prompt: "The main risks of using the tool, especially to individuals and groups, and how each is mitigated.", type: "long", need: "always" },
    ],
  },
];

export const ATRS_FIELDS: readonly (AtrsField & { section: AtrsSection })[] = ATRS_SECTIONS.flatMap(
  (section) => section.fields.map((f) => ({ ...f, section })),
);

const KNOWN = new Set(ATRS_FIELDS.map((f) => f.ref));

export function isAtrsRef(ref: string): boolean {
  return KNOWN.has(ref);
}

export type AtrsValues = Record<string, string>;

/** Whether the third-party fields apply. */
export function thirdPartiesInvolved(values: AtrsValues): boolean {
  return values["2.1.4"] === "Yes";
}

/**
 * The fields a record cannot be approved without.
 *
 * A published record with a blank where the senior responsible owner or the
 * appeals route should be is worse than no record: it reads as a public body
 * declining to say. Fields the template marks "where applicable" may be blank.
 */
export function missingFields(values: AtrsValues): (AtrsField & { section: AtrsSection })[] {
  const thirdParty = thirdPartiesInvolved(values);
  return ATRS_FIELDS.filter((f) => {
    const filled = (values[f.ref] ?? "").trim() !== "";
    if (filled) return false;
    if (f.need === "always") return true;
    if (f.need === "third_party") return thirdParty;
    return false;
  });
}

/** Problems with what was entered, as opposed to what is missing. */
export function invalidFields(values: AtrsValues): Array<{ ref: string; message: string }> {
  const problems: Array<{ ref: string; message: string }> = [];
  for (const f of ATRS_FIELDS) {
    const v = (values[f.ref] ?? "").trim();
    if (!v) continue;
    if (f.type === "select" && f.options && !f.options.includes(v)) {
      problems.push({ ref: f.ref, message: `Choose one of the template's options for ${f.label}` });
    }
    if (f.type === "yesno" && v !== "Yes" && v !== "No") {
      problems.push({ ref: f.ref, message: `${f.label} is Yes or No` });
    }
    if (f.type === "url" && !/^https:\/\/\S+$/.test(v)) {
      problems.push({ ref: f.ref, message: `${f.label} should be an https:// address` });
    }
    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      problems.push({ ref: f.ref, message: `${f.label} should be an email address` });
    }
  }
  return problems;
}

/**
 * The record as rows in the template's own "All data" layout — reference,
 * section, field, answer — so it can be pasted into DSIT's spreadsheet.
 */
export function toAllDataRows(values: AtrsValues): Array<[string, string, string, string]> {
  return ATRS_FIELDS.map((f) => [f.ref, f.section.title, f.label, values[f.ref] ?? ""]);
}
