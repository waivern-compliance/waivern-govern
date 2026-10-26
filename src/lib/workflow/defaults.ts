import type { RoutingCondition } from "./routing";
import type { AppRole } from "@/lib/rbac";

/**
 * The approval workflows an organisation starts with.
 *
 * Deliberately shallow. Every extra gate is a delay someone will route around,
 * so a stage has to earn its place by catching something the previous one would
 * not have: a DPIA that is routine gets one reviewer, and picks up the DPO only
 * when the score, the data or the destination says it should.
 */
export type StageSpec = {
  position: number;
  name: string;
  requiredRole: AppRole;
  condition: RoutingCondition;
  slaHours?: number;
  /** Decided by a named board or committee, recorded by someone holding the role. */
  boardName?: string;
};

export const DEFAULT_WORKFLOWS: Array<{
  templateKind: "dpia" | "tra" | "tia" | "ai_risk" | "screening";
  name: string;
  stages: StageSpec[];
}> = [
  {
    templateKind: "screening",
    name: "Screening triage",
    stages: [
      {
        position: 1,
        name: "Privacy triage",
        requiredRole: "privacy_analyst",
        condition: { op: "always" },
        slaHours: 48,
      },
    ],
  },
  {
    templateKind: "dpia",
    name: "DPIA approval",
    stages: [
      {
        position: 1,
        name: "Privacy review",
        requiredRole: "privacy_analyst",
        condition: { op: "always" },
      },
      {
        position: 2,
        name: "Data protection officer",
        requiredRole: "privacy_admin",
        condition: {
          op: "or",
          any: [
            { op: "tierAtLeast", value: "high" },
            { op: "specialCategoryData" },
            { op: "transferToNonAdequate" },
          ],
        },
      },
      {
        position: 3,
        name: "Accountable approver",
        requiredRole: "approver",
        condition: { op: "tierAtLeast", value: "critical" },
      },
    ],
  },
  {
    templateKind: "tra",
    name: "Transfer risk approval",
    stages: [
      {
        position: 1,
        name: "Privacy review",
        requiredRole: "privacy_analyst",
        condition: { op: "always" },
      },
      {
        position: 2,
        name: "Data protection officer",
        requiredRole: "privacy_admin",
        condition: { op: "tierAtLeast", value: "high" },
      },
    ],
  },
  {
    templateKind: "tia",
    name: "Transfer impact approval",
    stages: [
      {
        position: 1,
        name: "Privacy review",
        requiredRole: "privacy_analyst",
        condition: { op: "always" },
      },
      {
        position: 2,
        name: "Data protection officer",
        requiredRole: "privacy_admin",
        condition: { op: "tierAtLeast", value: "high" },
      },
    ],
  },
  {
    templateKind: "ai_risk",
    name: "AI risk approval",
    stages: [
      {
        position: 1,
        name: "Responsible AI review",
        requiredRole: "ai_governance",
        condition: { op: "always" },
      },
      {
        position: 2,
        name: "Data protection officer",
        requiredRole: "privacy_admin",
        condition: {
          op: "or",
          any: [
            { op: "answerEquals", question: "personal_data", value: true },
            { op: "specialCategoryData" },
          ],
        },
      },
      {
        position: 3,
        name: "Accountable approver",
        requiredRole: "approver",
        // A system that decides about people with no human in the loop is the
        // shape that most needs a named person to sign it off.
        condition: {
          op: "or",
          any: [
            { op: "tierAtLeast", value: "high" },
            {
              op: "and",
              all: [
                { op: "answerEquals", question: "consequence", value: "decides" },
                { op: "answerEquals", question: "human_oversight", value: "none" },
              ],
            },
          ],
        },
      },
      {
        position: 4,
        name: "AI governance board",
        requiredRole: "ai_governance",
        boardName: "AI governance board",
        // The Playbook asks for an AI governance board to review and authorise
        // uses of AI. Not every use: the ones rated critical, and the ones over
        // the spend at which government digital spend control requires
        // assurance — £100,000 for anything public-facing, £1 million otherwise.
        condition: {
          op: "or",
          any: [
            { op: "tierAtLeast", value: "critical" },
            { op: "answerAtLeast", question: "expected_spend_gbp", value: 1_000_000 },
            {
              op: "and",
              all: [
                { op: "answerEquals", question: "public_facing", value: true },
                { op: "answerAtLeast", question: "expected_spend_gbp", value: 100_000 },
              ],
            },
          ],
        },
      },
    ],
  },
];

/** Service levels the organisation starts with, in hours. */
export const DEFAULT_SLA: Array<{ taskType: string; targetHours: number; escalateToRole: AppRole }> = [
  { taskType: "answer_section", targetHours: 24 * 7, escalateToRole: "privacy_analyst" },
  { taskType: "review_assessment", targetHours: 24 * 5, escalateToRole: "privacy_admin" },
  { taskType: "approve_stage", targetHours: 24 * 5, escalateToRole: "privacy_admin" },
  { taskType: "mitigation_due", targetHours: 24 * 14, escalateToRole: "privacy_admin" },
  { taskType: "verify_mitigation", targetHours: 24 * 7, escalateToRole: "privacy_admin" },
  { taskType: "reassess", targetHours: 24 * 14, escalateToRole: "privacy_admin" },
  { taskType: "review_acceptance", targetHours: 24 * 14, escalateToRole: "approver" },
  { taskType: "triage_incident", targetHours: 48, escalateToRole: "ai_governance" },
];
