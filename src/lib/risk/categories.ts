/**
 * The categories DSIT's AI Risk Management Toolkit sorts AI risk into.
 *
 * One list, used everywhere a risk is categorised: the identification template
 * names a category for each risk it surfaces, the register files the risk under
 * it, and risk appetite is set per category. Three copies would drift, and then
 * a risk filed under one wording would be judged against appetite set under
 * another.
 *
 * The UK framework's list (`lib/ai-frameworks/uk-dsit.ts`). Labels are read
 * through `lib/ai-frameworks`, which knows every framework's categories.
 *
 * `risk.category` stays free text, because risks that are not about AI predate
 * this list and have their own categories. A category outside the list is
 * shown as written and simply has no category-level appetite — it is judged
 * against the organisation's default instead.
 */
export const AI_RISK_CATEGORIES = [
  {
    value: "financial",
    label: "Financial",
    summary: "Running, scaling and remediation costs, and the cost of getting it wrong.",
  },
  {
    value: "legal_regulatory",
    label: "Legal and regulatory compliance",
    summary: "Data protection, equality, human rights, intellectual property and AI-specific law.",
  },
  {
    value: "transparency_explainability",
    label: "Transparency and explainability",
    summary: "Whether people know AI is involved, and whether its outputs can be explained.",
  },
  {
    value: "fairness",
    label: "Fairness",
    summary: "Bias, discrimination, and unfair outcomes for groups or markets.",
  },
  {
    value: "accountability_governance",
    label: "Accountability and governance",
    summary: "Who answers for the system, and whether oversight actually works.",
  },
  {
    value: "contestability_redress",
    label: "Contestability and redress",
    summary: "Whether people can challenge an outcome and have harm put right.",
  },
  {
    value: "technical_robustness",
    label: "Technical robustness",
    summary: "Reliability, data quality, drift, and behaviour in conditions it was not built for.",
  },
  {
    value: "security",
    label: "Security",
    summary: "Data poisoning, leakage, prompt injection and other attacks the system opens up.",
  },
  {
    value: "environment_people",
    label: "Environment and people",
    summary: "Physical and mental wellbeing, safety of infrastructure, and the environment.",
  },
] as const;

export type AiRiskCategory = (typeof AI_RISK_CATEGORIES)[number]["value"];
