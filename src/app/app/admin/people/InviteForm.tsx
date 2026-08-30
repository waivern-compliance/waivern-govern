"use client";

import { useActionState } from "react";
import { PERSONA_LABEL, PERSONAS } from "@/lib/persona";
import { inviteAction, type AdminResult } from "../actions";

/**
 * Grant somebody access.
 *
 * Deliberately one role at a time. A form offering every role at once invites
 * granting more than was meant, and adding a second role to somebody is one
 * more pass through this — which is the right amount of friction for the
 * operation that decides who can approve things.
 */
export function InviteForm({
  roles,
  roleNotes,
  entities,
}: {
  roles: readonly string[];
  roleNotes: Record<string, string>;
  entities: Array<{ id: string; name: string }>;
}) {
  const [result, action, pending] = useActionState<AdminResult, FormData>(inviteAction, null);

  return (
    <details className="rounded border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
        Give somebody access
      </summary>
      <form action={action} className="space-y-3 border-t border-line p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Their email address
            </span>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Their name, if you know it
            </span>
            <input
              name="name"
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
            Role
          </span>
          <select
            name="role"
            required
            defaultValue="contributor"
            className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")} — {roleNotes[r] ?? ""}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Confine to one entity
            </span>
            <select
              name="entityId"
              defaultValue=""
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            >
              <option value="">The whole organisation</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Show the platform as
            </span>
            <select
              name="persona"
              defaultValue=""
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            >
              <option value="">Not set</option>
              {PERSONAS.map((p) => (
                <option key={p} value={p}>{PERSONA_LABEL[p]}</option>
              ))}
            </select>
          </label>
        </div>

        {result ? (
          <p
            role="status"
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
          {pending ? "Granting…" : "Grant access"}
        </button>
        <p className="text-xs text-ink-soft">
          They sign in with the identity provider — no password is created here.
          Somebody who already has access keeps what they have and gains this
          role as well.
        </p>
      </form>
    </details>
  );
}
