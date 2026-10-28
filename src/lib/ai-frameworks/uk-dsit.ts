import type { AppetiteLevel } from "@/lib/risk/appetite";
import { AI_RISK_CATEGORIES, type AiRiskCategory } from "@/lib/risk/categories";
import { TREATMENT_SUGGESTIONS } from "@/lib/risk/treatment-library";
import type { AiFrameworkPack } from "./types";

/**
 * What each level means for each category, in short.
 *
 * Paraphrased from Appendix 2 of DSIT's AI Risk Management Toolkit, which
 * offers these as examples to adapt rather than a standard to adopt. Shown
 * beside the form as a prompt, so the statement somebody writes is theirs.
 */
const APPETITE_GUIDANCE: Record<AiRiskCategory, Record<AppetiteLevel, string>> = {
  financial: {
    averse: "No financial loss from the AI solution is acceptable.",
    minimal: "Minimal financial impact, and only where essential to delivery.",
    cautious: "Little residual loss, and only for a clear benefit to users or the organisation.",
    open: "Investment for productivity gains, with losses managed to an acceptable level.",
  },
  legal_regulatory: {
    averse: "No AI project with any chance of legal challenge, however unlikely to succeed.",
    minimal: "Only projects with no chance of significant legal challenge.",
    cautious: "Only projects with little chance of a successful legal challenge.",
    open: "Projects open to challenge, where mitigation makes success likely and the gain outweighs the risk.",
  },
  transparency_explainability: {
    averse: "Avoid AI projects carrying transparency or explainability risk.",
    minimal: "Low risk only, with significant effort on open communication about the AI.",
    cautious: "Where benefits outweigh the risk, with processes to explain decisions to the people affected.",
    open: "Some risk accepted for benefit, with controls scaled to the trade-off between accuracy and explainability.",
  },
  fairness: {
    averse: "No AI project that may affect people's rights or discriminate unfairly.",
    minimal: "Low chance of unfair outcomes, only if essential, with steps such as human-in-the-loop to eliminate it.",
    cautious: "Little chance of significant unfairness, where benefits outweigh risk and it is mitigated.",
    open: "Potential impact on rights accepted where benefits outweigh it and controls minimise it.",
  },
  accountability_governance: {
    averse: "Avoid projects with accountability risk; no decision taken outside AI processes and oversight.",
    minimal: "Low risk only; controls maximise accountability through robust controls and sanctions.",
    cautious: "Where benefits outweigh the risk, with appropriate controls and sanctions.",
    open: "Some risk accepted for benefit, with controls scaled to the risk.",
  },
  contestability_redress: {
    averse: "No AI project where anyone affected could contest a decision or outcome.",
    minimal: "Only where there is a very small likelihood of an outcome being contested.",
    cautious: "Only where there is little chance of contest, and steps are taken to minimise it.",
    open: "Contest is possible, and appropriate steps are taken to minimise its likelihood.",
  },
  technical_robustness: {
    averse: "No AI system that cannot reliably function as intended across its lifecycle.",
    minimal: "Only essential AI systems, to protect current operations.",
    cautious: "Robustness risk accepted where mitigated through stress testing, performance targets and improvement.",
    open: "Robustness is weighed as an enabler of better delivery; agile iteration accepted.",
  },
  security: {
    averse: "No tolerance for AI security risks such as data poisoning, leakage or prompt injection.",
    minimal: "Minimal appetite, with stringent security measures in place.",
    cautious: "Limited risk accepted for business need, with appropriate measures scaled to the risk.",
    open: "Cautious acceptance for business need, with appropriate measures scaled to the risk.",
  },
  environment_people: {
    averse: "No AI project with a high chance of harm to wellbeing, infrastructure or the environment.",
    minimal: "Low chance of harm only, if essential, with steps such as human-in-the-loop to eliminate it.",
    cautious: "Little chance of significant harm, where benefits outweigh risk and it is mitigated.",
    open: "Potential harm accepted where benefits outweigh it and controls minimise it.",
  },
};

/**
 * The UK set: DSIT's AI Risk Management Toolkit for categories, appetite and
 * treatments. What every organisation has followed from the start, gathered
 * here so another framework can stand beside it.
 *
 * Contains public sector information licensed under the Open Government Licence v3.0.
 */
export const UK_DSIT: AiFrameworkPack = {
  id: "uk_dsit",
  label: "UK AI governance (DSIT and the AI Playbook)",
  summary:
    "DSIT's AI Risk Management Toolkit for risk categories, appetite and treatments, with the AI Playbook for how AI work is approved.",
  categories: AI_RISK_CATEGORIES,
  appetiteGuidance: APPETITE_GUIDANCE,
  treatments: TREATMENT_SUGGESTIONS,
};
