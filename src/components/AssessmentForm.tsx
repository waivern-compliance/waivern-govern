"use client";

import { useMemo, useState, useTransition } from "react";
import type { ResolvedRef } from "@/lib/legal-refs";
import { optionsForType } from "@/lib/templates/catalogues";
import { evaluate, type AnswerValue, type Answers } from "@/lib/templates/logic";
import type { Question, TemplateDefinition } from "@/lib/templates/schema";

export type SaveResult = { ok: true } | { ok: false; message: string };

type Props = {
  definition: TemplateDefinition;
  initialAnswers: Answers;
  /** Restricts the form to one section, for a contributor working on their part. */
  onlySection?: string | null;
  readOnly?: boolean;
  legalRefs: Record<string, ResolvedRef>;
  answerMeta?: Record<string, { by: string; at: string }>;
  onSave: (answers: Record<string, AnswerValue>) => Promise<SaveResult>;
  onFinish?: () => Promise<SaveResult>;
  finishLabel?: string;
};

/**
 * The same evaluator runs here and on the server. Here it makes the form
 * respond as you answer; there it is the guarantee. Neither substitutes for the
 * other — a rule enforced only in the browser is a suggestion.
 */
export function AssessmentForm({
  definition,
  initialAnswers,
  onlySection,
  readOnly = false,
  legalRefs,
  answerMeta = {},
  onSave,
  onFinish,
  finishLabel = "Submit for review",
}: Props) {
  const [answers, setAnswers] = useState<Answers>(initialAnswers);
  const [dirty, setDirty] = useState<Record<string, AnswerValue>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const evaluation = useMemo(
    () => evaluate(definition.schema, answers),
    [definition.schema, answers],
  );

  const sections = definition.schema.sections.filter(
    (s) => (!onlySection || s.key === onlySection) && evaluation.sections[s.key]?.visible,
  );

  /**
   * Progress counts only what this person was actually asked.
   *
   * A contributor sent one section must not be told they have nineteen
   * questions outstanding across an assessment they cannot see — and, more
   * seriously, must not have their "finished" button held shut by required
   * questions that belong to somebody else.
   */
  const inScope = useMemo(() => {
    const keys = new Set<string>();
    for (const s of definition.schema.sections) {
      if (onlySection && s.key !== onlySection) continue;
      for (const q of s.questions) keys.add(q.key);
    }
    return keys;
  }, [definition.schema.sections, onlySection]);

  const scoped = Object.entries(evaluation.questions).filter(
    ([key, q]) => q.visible && inScope.has(key),
  );
  const visibleCount = scoped.length;
  const answeredCount = scoped.filter(([key]) => !isBlank(answers[key])).length;
  const outstanding = scoped.filter(([key, q]) => q.required && isBlank(answers[key])).length;

  function set(key: string, value: AnswerValue) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setDirty((d) => ({ ...d, [key]: value }));
    setMessage(null);
  }

  function save(then?: () => Promise<SaveResult>) {
    startTransition(async () => {
      // Only send what changed, and only what is still being asked — a value
      // for a question the logic has since hidden would be rejected server-side
      // anyway, and sending it turns a save into a confusing error.
      const payload = Object.fromEntries(
        Object.entries(dirty).filter(([k]) => evaluation.questions[k]?.visible),
      );
      if (Object.keys(payload).length > 0) {
        const result = await onSave(payload);
        if (!result.ok) {
          setMessage({ tone: "error", text: result.message });
          return;
        }
        setDirty({});
      }
      if (then) {
        const result = await then();
        setMessage(
          result.ok
            ? { tone: "ok", text: "Submitted." }
            : { tone: "error", text: result.message },
        );
        return;
      }
      setMessage({ tone: "ok", text: "Saved." });
    });
  }

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-10 -mx-6 border-b border-line bg-ground/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs text-ink-soft">
            {answeredCount} of {visibleCount} answered
            {outstanding > 0 ? ` · ${outstanding} still required` : " · nothing outstanding"}
          </p>
          {!readOnly ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => save()}
                disabled={pending || Object.keys(dirty).length === 0}
                className="rounded border border-line bg-surface px-3 py-1.5 text-sm disabled:opacity-40 hover:border-brand focus-visible:outline-2 focus-visible:outline-brand"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              {onFinish ? (
                <button
                  type="button"
                  onClick={() => save(onFinish)}
                  disabled={pending || outstanding > 0}
                  title={outstanding > 0 ? `${outstanding} required question(s) still unanswered` : undefined}
                  className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {finishLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {message ? (
          <p
            role="status"
            className={`mt-2 text-sm ${message.tone === "error" ? "text-red-800" : "text-emerald-800"}`}
          >
            {message.text}
          </p>
        ) : null}
      </div>

      {sections.map((section) => (
        <section key={section.key} className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
            {section.description ? (
              <p className="max-w-prose text-sm text-ink-soft">{section.description}</p>
            ) : null}
          </div>

          {section.questions
            .filter((q) => evaluation.questions[q.key]?.visible)
            .map((question) => (
              <Field
                key={question.key}
                question={question}
                value={answers[question.key]}
                required={evaluation.questions[question.key].required}
                readOnly={readOnly}
                legalRefs={legalRefs}
                meta={answerMeta[question.key]}
                onChange={(v) => set(question.key, v)}
              />
            ))}
        </section>
      ))}

      {sections.length === 0 ? (
        <p className="text-sm text-ink-soft">
          There is nothing to answer here yet. Earlier answers decide which
          questions apply.
        </p>
      ) : null}
    </div>
  );
}

function isBlank(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function Field({
  question,
  value,
  required,
  readOnly,
  legalRefs,
  meta,
  onChange,
}: {
  question: Question;
  value: AnswerValue | undefined;
  required: boolean;
  readOnly: boolean;
  legalRefs: Props["legalRefs"];
  meta?: { by: string; at: string };
  onChange: (v: AnswerValue) => void;
}) {
  const id = `q-${question.key}`;
  const options = question.options?.length
    ? question.options.map((o) => ({ value: o.value, label: o.label }))
    : optionsForType(question.type);

  const control = (() => {
    if (question.type === "long_text") {
      return (
        <textarea
          id={id}
          rows={4}
          disabled={readOnly}
          value={typeof value === "string" ? value : ""}
          placeholder={question.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded border border-line bg-surface px-3 py-2 text-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
        />
      );
    }
    if (question.type === "boolean") {
      return (
        <div className="flex gap-2" role="group" aria-labelledby={id}>
          {[
            { v: true, label: "Yes" },
            { v: false, label: "No" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              disabled={readOnly}
              aria-pressed={value === o.v}
              onClick={() => onChange(o.v)}
              className={`rounded border px-4 py-1.5 text-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand ${
                value === o.v
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface hover:border-brand"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    }
    if (question.type === "number") {
      return (
        <input
          id={id}
          type="number"
          disabled={readOnly}
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-56 rounded border border-line bg-surface px-3 py-2 text-sm tabular-nums disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
        />
      );
    }
    if (question.type === "date") {
      return (
        <input
          id={id}
          type="date"
          disabled={readOnly}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="rounded border border-line bg-surface px-3 py-2 text-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
        />
      );
    }
    if (question.type === "single_select" && options) {
      return (
        <div className="space-y-1.5">
          {options.map((o) => (
            <label key={o.value} className="flex items-start gap-2.5 text-sm">
              <input
                type="radio"
                name={id}
                disabled={readOnly}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
                className="mt-1 accent-brand"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      );
    }
    if (options) {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {options.map((o) => (
            <label key={o.value} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                disabled={readOnly}
                checked={selected.includes(o.value)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value),
                  )
                }
                className="mt-1 accent-brand"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      );
    }
    return (
      <input
        id={id}
        type="text"
        disabled={readOnly}
        value={typeof value === "string" ? value : ""}
        placeholder={question.placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-line bg-surface px-3 py-2 text-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
      />
    );
  })();

  const refs = question.legalRefs.map((code) => legalRefs[code]).filter(Boolean);

  return (
    <div className="space-y-2 border-l-2 border-line pl-4">
      <label id={id} htmlFor={id} className="block text-sm font-medium">
        {question.label}
        {required ? <span className="ml-1 text-red-700" aria-label="required">*</span> : null}
      </label>
      {question.help ? <p className="text-xs text-ink-soft">{question.help}</p> : null}
      {control}
      {refs.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {refs.map((r) => (
            <li key={r.citation} className="text-[11px] text-ink-soft">
              <span className="font-mono">
                {r.regime} {r.citation}
              </span>
              {" — "}
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline"
                >
                  {r.title}
                </a>
              ) : (
                r.title
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {meta ? (
        <p className="font-mono text-[11px] text-ink-soft">
          answered by {meta.by} · {meta.at}
        </p>
      ) : null}
    </div>
  );
}
