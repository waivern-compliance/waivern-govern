"use client";

import { PROFILE_STATUSES, PROFILE_STATUS_LABEL, type ProfileStatus } from "@/lib/ai-frameworks/profile";
import { savedKey } from "@/lib/saved-key";
import { useRefusableAction } from "@/lib/use-refusable-action";
import { setProfileItemAction, type ProfileResult } from "./actions";

const select = "rounded border border-line bg-ground px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-brand";
const label = "block text-[11px] font-medium uppercase tracking-wider text-ink-soft";

/** Where the organisation stands on one subcategory, and where it means to be. */
export function ProfileItemForm({
  code,
  current,
  target,
  notes,
}: {
  code: string;
  current: ProfileStatus | null;
  target: ProfileStatus | null;
  notes: string | null;
}) {
  const save = useRefusableAction<ProfileResult>(setProfileItemAction.bind(null, code), { resetOnSuccess: false });
  return (
    <div className="space-y-1">
      {/* Keyed on the saved values, so a save rebuilds the fields from them. */}
      <form key={savedKey(current, target, notes)} {...save.formProps} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className={label}>Now</span>
          <select name="current" defaultValue={current ?? ""} className={select} aria-label={`Where ${code} stands now`}>
            <option value="">Not assessed</option>
            {PROFILE_STATUSES.map((s) => (
              <option key={s} value={s}>{PROFILE_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className={label}>Target</span>
          <select name="target" defaultValue={target ?? ""} className={select} aria-label={`Target for ${code}`}>
            <option value="">Not set</option>
            {PROFILE_STATUSES.map((s) => (
              <option key={s} value={s}>{PROFILE_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="min-w-56 flex-1 space-y-1">
          <span className={label}>Notes</span>
          <input
            name="notes"
            defaultValue={notes ?? ""}
            maxLength={2000}
            placeholder="How it is met, or what is missing"
            className={`${select} w-full`}
            aria-label={`Notes on ${code}`}
          />
        </label>
        <button
          type="submit"
          disabled={save.pending}
          className="rounded border border-line bg-surface px-3 py-1.5 text-xs hover:border-brand disabled:opacity-50"
        >
          {save.pending ? "Saving…" : "Save"}
        </button>
      </form>
      {save.result ? (
        <p role={save.result.ok ? "status" : "alert"} className={`text-xs ${save.result.ok ? "text-emerald-800" : "text-red-800"}`}>
          {save.result.message}
        </p>
      ) : null}
    </div>
  );
}
