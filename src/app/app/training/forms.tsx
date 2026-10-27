"use client";

import { useState } from "react";
import { useRefusableAction } from "@/lib/use-refusable-action";
import { recordAction, type TrainingResult } from "./actions";

const field = "w-full rounded border border-line bg-ground px-3 py-2 text-sm";
const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

type Option = { value: string; label: string };

export function RecordForm({ courses, people }: { courses: Option[]; people?: Option[] }) {
  const { result, pending, formProps } = useRefusableAction<TrainingResult>(recordAction);
  const [course, setCourse] = useState(courses[0]?.value ?? "other");
  return (
    <form {...formProps} className="space-y-3 border-t border-line p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {people ? (
          <label className="block space-y-1 sm:col-span-2">
            <span className={label}>Who</span>
            <select name="userId" className={field}>
              {people.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block space-y-1">
          <span className={label}>Learning</span>
          <select name="courseKey" value={course} onChange={(e) => setCourse(e.target.value)} className={field}>
            {courses.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
            <option value="other">Something else</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className={label}>Completed on</span>
          <input name="completedAt" type="date" required className={field} />
        </label>
        <label className="block space-y-1">
          <span className={label}>{course === "other" ? "What it was" : "What it was called · optional"}</span>
          <input name="title" required={course === "other"} className={field} placeholder="Civil Service Learning: AI ethics" />
        </label>
        <label className="block space-y-1">
          <span className={label}>Evidence · optional</span>
          <input name="evidenceRef" className={field} placeholder="Certificate link or reference" />
        </label>
      </div>
      {result ? (
        <p
          role="status"
          className={`rounded border px-3 py-2 text-sm ${
            result.ok ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-amber-700 bg-amber-50 text-amber-900"
          }`}
        >
          {result.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-60"
      >
        {pending ? "Recording…" : "Record it"}
      </button>
    </form>
  );
}
