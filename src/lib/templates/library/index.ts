import type { AiFrameworkId } from "@/lib/ai-frameworks";
import type { TemplateKind } from "@/services/templates";
import type { TemplateDefinition } from "../schema";
import { AI_RISK } from "./ai-risk";
import { AI_SUPPLIER } from "./ai-supplier";
import { BREACH_SEVERITY } from "./breach";
import { CNIL_PIA } from "./cnil-pia";
import { DPIA } from "./dpia";
import { DPIA_PART3 } from "./dpia-part3";
import { DSIT_AI_RISK } from "./dsit-ai-risk";
import { EIA } from "./eia";
import { LIA } from "./lia";
import { NIST_AI_RISK } from "./nist-ai-risk";
import { SCREENING } from "./screening";
import { TIA_EU, TRA_UK } from "./transfers";

export { LEGAL_REFERENCES } from "./legal-references";

/**
 * Templates Waivern ships and keeps current. A client may copy one and diverge,
 * but editing ours in place would put their changes at risk the next time we
 * update it — so the copy is the supported route.
 */
export const SYSTEM_TEMPLATES: Array<{
  kind: TemplateKind;
  name: string;
  description: string;
  jurisdiction?: string;
  /**
   * Installed only for an organisation following this AI governance
   * framework. Templates without one go to everyone.
   */
  aiFramework?: AiFrameworkId;
  /** Installed only for an organisation with an entity that is a competent authority (Part 3). */
  competentAuthority?: boolean;
  definition: TemplateDefinition;
}> = [
  {
    kind: "screening",
    name: "DPIA screening questionnaire",
    description: "Short triage deciding whether a full DPIA is required.",
    jurisdiction: "UK",
    definition: SCREENING,
  },
  {
    kind: "dpia",
    name: "Data protection impact assessment",
    description: "Full DPIA covering the minimum content required by Article 35(7).",
    jurisdiction: "UK",
    definition: DPIA,
  },
  {
    kind: "dpia",
    name: "Data protection impact assessment (law enforcement, Part 3)",
    description:
      "For a competent authority's law enforcement processing (Data Protection Act 2018 s.64): the purpose, sensitive processing and Schedule 8, categories of data subject, fact and opinion, logging and rights restrictions.",
    jurisdiction: "UK",
    competentAuthority: true,
    definition: DPIA_PART3,
  },
  {
    kind: "dpia",
    name: "Data protection impact assessment (CNIL method)",
    description:
      "The CNIL's PIA structure — context, fundamental principles, three feared events, validation.",
    jurisdiction: "EU",
    definition: CNIL_PIA,
  },
  {
    kind: "lia",
    name: "Legitimate interests assessment",
    description:
      "Whether an Annex 1 recognised legitimate interest applies (UK GDPR Article 6(1)(ea)), and if not the three-part test under Article 6(1)(f): purpose, necessity, and the balance against data subjects' rights.",
    jurisdiction: "UK",
    definition: LIA,
  },
  {
    kind: "tra",
    name: "Transfer risk assessment (UK)",
    description: "UK international transfer assessment following the ICO's TRA structure.",
    jurisdiction: "UK",
    definition: TRA_UK,
  },
  {
    kind: "tia",
    name: "Transfer impact assessment (EU)",
    description: "EU transfer assessment following the EDPB's six-step method.",
    jurisdiction: "EU",
    definition: TIA_EU,
  },
  {
    kind: "breach",
    name: "Breach severity assessment",
    description:
      "The ICO's factors for judging whether a breach must be reported, and whether the people affected must be told.",
    jurisdiction: "UK",
    definition: BREACH_SEVERITY,
  },
  {
    kind: "ai_risk",
    name: "AI risk assessment",
    description:
      "Covers predictive, generative and agentic systems, with structured bias and fairness assessment.",
    definition: AI_RISK,
  },
  {
    kind: "ai_risk",
    name: "AI risk identification (DSIT toolkit)",
    description:
      "The nine risk categories of DSIT's AI Risk Management Toolkit, with the UK government AI Playbook's expectations on transparency, oversight and security.",
    jurisdiction: "UK",
    aiFramework: "uk_dsit",
    definition: DSIT_AI_RISK,
  },
  {
    kind: "ai_risk",
    name: "AI risk identification (NIST AI RMF)",
    description:
      "NIST AI RMF 1.0: context, categorisation, benefits, third parties and impacts from Map, each characteristic of trustworthy AI from Measure, and the go or no-go determination from Manage.",
    jurisdiction: "US",
    aiFramework: "nist_ai_rmf",
    definition: NIST_AI_RISK,
  },
  {
    kind: "supplier_record",
    name: "AI supplier assessment",
    description:
      "What a supplier's AI does with our data, how it was tested, and what the contract holds them to — following PPN 02/24 and the Crown Commercial Service's data ethics requirements.",
    jurisdiction: "UK",
    definition: AI_SUPPLIER,
  },
  {
    kind: "eia",
    name: "Equality impact assessment",
    description:
      "The public sector equality duty's three aims, and the impact on each protected characteristic — including how an AI system performs across them.",
    jurisdiction: "UK",
    definition: EIA,
  },
];
