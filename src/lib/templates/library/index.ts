import type { TemplateKind } from "@/services/templates";
import type { TemplateDefinition } from "../schema";
import { AI_RISK } from "./ai-risk";
import { DPIA } from "./dpia";
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
    kind: "ai_risk",
    name: "AI risk assessment",
    description:
      "Covers predictive, generative and agentic systems, with structured bias and fairness assessment.",
    definition: AI_RISK,
  },
];
