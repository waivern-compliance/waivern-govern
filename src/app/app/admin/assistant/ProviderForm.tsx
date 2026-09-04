"use client";

import { useActionState, useState } from "react";
import {
  SUGGESTIONS_REVIEWED,
  VENDOR_ENDPOINTS,
  suggestionsFor,
} from "@/lib/assistant/models";
import type { ProviderKind } from "@/lib/assistant/providers";
import { saveProviderAction, testProviderAction, type AdminResult } from "../actions";

const SURFACES: Array<{ id: string; label: string; note: string }> = [
  {
    id: "assessment",
    label: "Answering an assessment",
    note: "Sees the template's questions. Never the answers.",
  },
  {
    id: "help",
    label: "Questions about the platform",
    note: "Answers only from the built-in help topics. Sees no records.",
  },
];

export function ProviderForm({
  existing,
}: {
  existing: {
    kind: string;
    baseUrl: string;
    model: string;
    apiVersion: string | null;
    surfaces: string[];
    isActive: boolean;
  } | null;
}) {
  const [saved, save, saving] = useActionState<AdminResult, FormData>(saveProviderAction, null);
  const [tested, test, testing] = useActionState<AdminResult, FormData>(
    async (prev: AdminResult) => testProviderAction(prev),
    null,
  );

  /**
   * Held in state so the model suggestions follow it.
   *
   * Offering Anthropic identifiers while the OpenAI shape is selected is how
   * the two fields end up disagreeing, which reads as an authentication
   * failure rather than as the configuration error it is.
   */
  const [kind, setKind] = useState<ProviderKind>(
    existing?.kind === "anthropic" ? "anthropic" : "openai_compatible",
  );
  const models = suggestionsFor(kind);
  const endpoints = VENDOR_ENDPOINTS.filter((e) => e.kind === kind);

  return (
    <div className="space-y-5">
      <form action={save} className="space-y-4 rounded border border-line bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
              Wire format
            </span>
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ProviderKind)}
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
            >
              <option value="openai_compatible">
                OpenAI-compatible — Azure OpenAI, OpenAI, self-hosted
              </option>
              <option value="anthropic">
                Anthropic — api.anthropic.com, or a proxy speaking its shape
              </option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
              Model
              <span className="block font-normal normal-case tracking-normal">
                The API identifier, not the name it is marketed under — {'"'}claude-sonnet-5{'"'},
                not {'"'}Sonnet 5{'"'}.
              </span>
            </span>
            <input
              name="model"
              required
              list="model-suggestions"
              defaultValue={existing?.model ?? ""}
              placeholder="claude-sonnet-5, gpt-4o, or your Azure deployment name"
              className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
            />
            <datalist id="model-suggestions">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.vendor} — {m.label}
                </option>
              ))}
            </datalist>
            <span className="block text-xs text-ink-soft">
              Suggestions for this wire format, reviewed {SUGGESTIONS_REVIEWED}. Type
              anything — a fine-tune, a private deployment, an Azure deployment
              name. Your provider&rsquo;s documentation is what is authoritative.
            </span>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
            Endpoint
            <span className="block font-normal normal-case tracking-normal">
              The full URL your organisation controls. Nothing is sent anywhere else.
            </span>
          </span>
          <input
            name="baseUrl"
            type="url"
            required
            defaultValue={existing?.baseUrl ?? ""}
            placeholder="https://api.anthropic.com/v1/messages, or your Azure deployment URL"
            list="endpoint-suggestions"
            className="w-full rounded border border-line bg-ground px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-brand"
          />
          <datalist id="endpoint-suggestions">
            {endpoints.map((e) => (
              <option key={e.url} value={e.url}>
                {e.vendor}
                {e.note ? ` — ${e.note}` : ""}
              </option>
            ))}
          </datalist>
          <span className="block text-xs text-ink-soft">
            Endpoints for this wire format. Some are templates — anything in
            angle brackets is yours to replace, and saving it unedited is
            refused rather than failing later as a name that will not resolve.
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
              API version
              <span className="block font-normal normal-case tracking-normal">
                Azure needs one. Others ignore it.
              </span>
            </span>
            <input
              name="apiVersion"
              defaultValue={existing?.apiVersion ?? ""}
              placeholder="2024-10-21"
              className="w-full rounded border border-line bg-ground px-3 py-2 font-mono text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
              Key
              <span className="block font-normal normal-case tracking-normal">
                {existing ? "A key is stored. Leave blank to keep it." : "Stored encrypted; never shown again."}
              </span>
            </span>
            <input
              name="apiKey"
              type="password"
              autoComplete="off"
              required={!existing}
              className="w-full rounded border border-line bg-ground px-3 py-2 font-mono text-xs focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wider text-ink-soft">
            Where it may appear
          </legend>
          {SURFACES.map((s) => (
            <label key={s.id} className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="surfaces"
                value={s.id}
                defaultChecked={existing?.surfaces.includes(s.id) ?? false}
                className="mt-1 accent-brand"
              />
              <span>
                {s.label}
                <span className="block text-xs text-ink-soft">{s.note}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-ink-soft">
            Nothing is enabled by default. A surface left unticked shows no
            assistant at all.
          </p>
        </fieldset>

        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={existing?.isActive ?? true}
            className="mt-1 accent-brand"
          />
          <span>
            In use
            <span className="block text-xs text-ink-soft">
              Unticking this stops every call without discarding the settings.
            </span>
          </span>
        </label>

        {saved ? (
          <p
            role="status"
            className={`rounded border px-4 py-2.5 text-sm ${
              saved.ok
                ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                : "border-amber-700 bg-amber-50 text-amber-900"
            }`}
          >
            {saved.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {existing ? (
        <form action={test} className="space-y-2 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Check it answers</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            Sends one throwaway question containing no records. Worth doing
            before anybody meets this in the middle of an assessment — a wrong
            endpoint or a missing API version shows up here instead of there.
          </p>
          {tested ? (
            <p
              role="status"
              className={`rounded border px-4 py-2.5 text-sm ${
                tested.ok
                  ? "border-emerald-700 bg-emerald-50 text-emerald-900"
                  : "border-red-700 bg-red-50 text-red-900"
              }`}
            >
              {tested.message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={testing}
            className="rounded border border-line px-4 py-2 text-sm font-medium hover:bg-ground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
          >
            {testing ? "Asking…" : "Send a test question"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
