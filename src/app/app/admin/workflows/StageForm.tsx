"use client";

import { useActionState } from "react";
import { ROLES, ROLE_BLURB, ROLE_LABEL } from "@/lib/rbac";
import { isSimple } from "@/lib/workflow/routing";
import type { StageView } from "@/services/approval-routing";
import { updateStageAction, type RoutingResult } from "./actions";

const TIERS = ["low", "medium", "high", "critical"] as const;

/**
 * Change who decides one gate.
 *
 * The people currently holding the role are listed beside it, because "the
 * privacy analyst approves this" and "Sam approves this" are the same fact and
 * only one of them is checkable at a glance. Where nobody holds it, that is
 * said plainly: a gate with no eligible approver does not fail, it waits.
 */
export function StageForm({ stage }: { stage: StageView }) {
  const [result, action, pending] = useActionState<RoutingResult, FormData>(
    updateStageAction.bind(null, stage.id),
    null,
  );
  const simple = isSimple(stage.condition);

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium">
          {stage.position}. {stage.name}
        </span>
        <span className="font-mono text-[11px] text-ink-soft">
          applies when {stage.appliesWhen}
          {stage.pending > 0 ? ` · ${stage.pending} waiting` : ""}
        </span>
      </div>

      <p className="text-xs text-ink-soft">
        Decided by anyone holding <span className="font-medium text-ink">{stage.roleLabel}</span>{" "}
        in the assessment&rsquo;s entity.{" "}
        {stage.eligible.length === 0 ? (
          <span className="text-amber-900">
            Nobody currently holds it, so this gate will wait indefinitely. Grant the role,
            or change it here.
          </span>
        ) : (
          <>
            Today that is{" "}
            {stage.eligible
              .map((p) => p.email + (p.entityName ? ` (${p.entityName})` : ""))
              .join(", ")}
            .
          </>
        )}
      </p>

      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-soft">
            Name
          </span>
          <input
            name="name"
            defaultValue={stage.name}
            required
            className="w-full rounded border border-line bg-ground px-3 py-1.5 text-xs"
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-soft">
            Decided by
          </span>
          <select
            name="requiredRole"
            defaultValue={stage.requiredRole}
            className="w-full rounded border border-line bg-ground px-3 py-1.5 text-xs"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]} — {ROLE_BLURB[role]}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-soft">
            Time allowed (hours)
            <span className="block font-normal normal-case tracking-normal">
              Empty means no service level is watched
            </span>
          </span>
          <input
            name="slaHours"
            type="number"
            min={1}
            defaultValue={stage.slaHours ?? ""}
            className="w-full rounded border border-line bg-ground px-3 py-1.5 text-xs"
          />
        </label>

        <div className="space-y-1">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-ink-soft">
            Applies when
          </span>
          {simple ? (
            <>
              <select
                name="conditionOp"
                defaultValue={stage.condition.op}
                className="w-full rounded border border-line bg-ground px-3 py-1.5 text-xs"
              >
                <option value="always">Always</option>
                <option value="scoreAtLeast">The risk score reaches a number</option>
                <option value="tierAtLeast">The risk reaches a tier</option>
                <option value="specialCategoryData">Special-category data is involved</option>
                <option value="transferToNonAdequate">
                  Data goes somewhere without adequacy
                </option>
              </select>
              <div className="flex gap-2">
                <input
                  name="conditionScore"
                  type="number"
                  min={0}
                  placeholder="score"
                  defaultValue={stage.condition.op === "scoreAtLeast" ? stage.condition.value : ""}
                  className="w-24 rounded border border-line bg-ground px-2 py-1 text-xs"
                />
                <select
                  name="conditionTier"
                  defaultValue={stage.condition.op === "tierAtLeast" ? stage.condition.value : "high"}
                  className="w-32 rounded border border-line bg-ground px-2 py-1 text-xs"
                >
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <input type="hidden" name="conditionOp" value="keep" />
              <p className="rounded border border-line bg-ground px-3 py-2 text-xs text-ink-soft">
                {stage.appliesWhen}
                <span className="mt-1 block">
                  This rule combines several conditions, so it is shown rather than offered for
                  editing — rebuilding one in a form is how a rule nobody fully read gets
                  replaced. The role and timing above can still be changed.
                </span>
              </p>
            </>
          )}
        </div>

        <div className="sm:col-span-2 space-y-2">
          {result ? (
            <p
              role="status"
              className={`rounded border px-3 py-2 text-xs ${
                result.ok
                  ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                  : "border-amber-700 bg-amber-50 text-amber-900"
              }`}
            >
              {result.message}
            </p>
          ) : null}
          {stage.pending > 0 ? (
            <p className="text-xs text-ink-soft">
              {stage.pending} approval{stage.pending === 1 ? "" : "s"} already waiting on this
              stage will be redirected to whichever role you save.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-ground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
          >
            {pending ? "Saving…" : "Save this stage"}
          </button>
        </div>
      </form>
    </li>
  );
}
