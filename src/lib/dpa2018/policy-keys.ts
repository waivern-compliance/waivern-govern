/**
 * What an appropriate policy document can cover: a Schedule 1 condition
 * (Schedule 1 Part 4), or Part 3 sensitive processing on consent or a
 * Schedule 8 condition (s.42). One register holds both, because both ask the
 * same of the document.
 */

import { PART3_POLICY_KEYS, describePart3PolicyKey, isPart3PolicyKey, type Part3PolicyKey } from "./part3";
import { SCHEDULE_1, SCHEDULE_1_KEYS, describeSchedule1, isSchedule1Condition, type Schedule1Condition } from "./schedule-1";

export type PolicyKey = Schedule1Condition | Part3PolicyKey;

/** In the order the Act sets them out. */
export const POLICY_KEYS: readonly PolicyKey[] = [...SCHEDULE_1_KEYS, ...PART3_POLICY_KEYS];

export function isPolicyKey(v: unknown): v is PolicyKey {
  return isSchedule1Condition(v) || isPart3PolicyKey(v);
}

/** "para 18", "Sch 8 para 4", "Part 3 consent". */
export function policyKeyShort(key: PolicyKey): string {
  if (isSchedule1Condition(key)) return `para ${SCHEDULE_1[key].paragraph}`;
  return key === "part3_consent" ? "Part 3 consent" : `Sch 8 para ${key.replace("sch8_p", "")}`;
}

export function describePolicyKey(key: PolicyKey): string {
  return isSchedule1Condition(key) ? describeSchedule1(key) : describePart3PolicyKey(key);
}
