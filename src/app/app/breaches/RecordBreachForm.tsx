"use client";

import { useActionState } from "react";
import { recordBreachAction, type BreachResult } from "./actions";

/**
 * Record it now, assess it after.
 *
 * Four facts and the time you became aware. The clock runs from that moment
 * whether or not anybody has decided what the breach amounts to, so a form
 * that demanded the assessment first would encourage recording it late.
 */
export function RecordBreachForm({
  entities,
}: {
  entities: Array<{ id: string; name: string }>;
}) {
  const [result, action, pending] = useActionState<BreachResult, FormData>(
    recordBreachAction,
    null,
  );

  return (
    <details className="rounded border border-line bg-surface" open={Boolean(result && !result.ok)}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Record a breach
      </summary>
      <form action={action} className="space-y-3 border-t border-line p-4">
        <label className="block space-y-1">
          <Label text="What happened?" />
          <input
            name="title"
            required
            placeholder="Laptop lost in transit"
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        <label className="block space-y-1">
          <Label text="Describe it" hint="What is known so far. It can be added to." />
          <textarea
            name="description"
            required
            rows={3}
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label
              text="When did you become aware?"
              hint="This starts the seventy-two hours — not when it happened."
            />
            <input
              name="discoveredAt"
              type="datetime-local"
              required
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1">
            <Label text="When did it happen?" hint="If known. Often it is not." />
            <input
              name="occurredAt"
              type="datetime-local"
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label text="Your role" hint="A processor tells the controller, not the authority." />
            <select
              name="controllerRole"
              defaultValue="controller"
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            >
              <option value="controller">Controller</option>
              <option value="joint_controller">Joint controller</option>
              <option value="processor">Processor</option>
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="Entity" />
            <select
              name="entityId"
              required
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            >
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium uppercase tracking-wider text-ink-soft">
            What kind of breach
          </legend>
          {[
            ["confidentiality", "Confidentiality — seen or taken by somebody unauthorised"],
            ["integrity", "Integrity — altered when it should not have been"],
            ["availability", "Availability — lost, destroyed or unreachable"],
          ].map(([value, label]) => (
            <label key={value} className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="categories" value={value} className="mt-1 accent-brand" />
              <span>{label}</span>
            </label>
          ))}
          <p className="text-xs text-ink-soft">
            More than one can apply — ransomware that exfiltrated first is both.
          </p>
        </fieldset>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="ownMe" className="mt-1 accent-brand" />
          <span>I am handling this</span>
        </label>

        {result ? (
          <p
            role="alert"
            className={`rounded border px-4 py-2.5 text-sm ${
              result.ok
                ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                : "border-amber-700 bg-amber-50 text-amber-900"
            }`}
          >
            {result.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {pending ? "Recording…" : "Record it"}
        </button>
        <p className="text-xs text-ink-soft">
          Record it before you know whether it is notifiable. Assessing comes
          next, and the clock is already running.
        </p>
      </form>
    </details>
  );
}

function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
      {text}
      {hint ? (
        <span className="block font-normal normal-case tracking-normal">{hint}</span>
      ) : null}
    </span>
  );
}
