"use client";

import { savedKey } from "@/lib/saved-key";
import { useRefusableAction } from "@/lib/use-refusable-action";
import {
  addEntityAction,
  makeDefaultEntityAction,
  renameEntityAction,
  setProviderAction,
  type AdminResult,
} from "../actions";

type Entity = { id: string; name: string; legalEntityRef: string | null; isDefault: boolean; publicCommsProvider: boolean };

const input =
  "rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand";
const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

function Outcome({ result }: { result: AdminResult }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-800" : "text-red-800"}`}>
      {result.message}
    </p>
  );
}

/**
 * The legal entities within this organisation — for the BBC, BBC Public
 * Service and BBC Studios. An owner over the whole organisation adds and
 * renames them here; anyone else who reaches this page sees the list only.
 */
export function EntitiesPanel({ entities, mayManage }: { entities: Entity[]; mayManage: boolean }) {
  const add = useRefusableAction<AdminResult>(addEntityAction);

  return (
    <section className="space-y-4 rounded border border-line bg-surface p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Legal entities ({entities.length})</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          The companies or bodies within this organisation that records are classified, reported
          and access-scoped by. Not services, products or departments. Records arriving with no
          entity named land in the default.
        </p>
      </div>

      <ul className="divide-y divide-line rounded border border-line">
        {entities.map((e) =>
          mayManage ? (
            <EntityRow key={e.id} entity={e} />
          ) : (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-2.5 text-sm">
              <span className="font-medium">{e.name}</span>
              <span className="font-mono text-[11px] text-ink-soft">
                {e.legalEntityRef ?? "no reference"}
                {e.isDefault ? " · default" : ""}
                {e.publicCommsProvider ? " · public communications provider" : ""}
              </span>
            </li>
          ),
        )}
      </ul>

      {mayManage ? (
        <>
          <form {...add.formProps} className="flex flex-wrap items-end gap-2">
            <label className="block space-y-1">
              <span className={label}>Add a legal entity</span>
              <input name="name" required minLength={2} placeholder="BBC Studios Distribution Limited" className={`${input} w-72`} />
            </label>
            <label className="block space-y-1">
              <span className={label}>Reference (optional)</span>
              <input name="legalEntityRef" placeholder="Company number or code" className={`${input} w-48 font-mono`} />
            </label>
            <button
              type="submit"
              disabled={add.pending}
              className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-50"
            >
              {add.pending ? "Adding…" : "Add"}
            </button>
          </form>
          <Outcome result={add.result} />
          <p className="max-w-prose text-xs text-ink-soft">
            Renaming keeps every record with its entity. The Portal and any script that names an
            entity by its name or reference will need the new one. Entities cannot be removed:
            records and their history point at them.
          </p>
        </>
      ) : (
        <p className="max-w-prose text-xs text-ink-soft">
          Only an owner of the whole organisation can add or rename legal entities.
        </p>
      )}
    </section>
  );
}

function EntityRow({ entity }: { entity: Entity }) {
  const rename = useRefusableAction<AdminResult>(renameEntityAction.bind(null, entity.id), { resetOnSuccess: false });
  const makeDefault = useRefusableAction<AdminResult>(makeDefaultEntityAction.bind(null, entity.id), {
    resetOnSuccess: false,
  });
  const provider = useRefusableAction<AdminResult>(
    setProviderAction.bind(null, entity.id, !entity.publicCommsProvider),
    { resetOnSuccess: false },
  );

  return (
    <li className="space-y-2 px-4 py-3">
      {/* Keyed on the saved values, so a save rebuilds the fields from them; the
          row itself is not, so the message saying it saved survives. */}
      <form
        key={savedKey(entity.name, entity.legalEntityRef, entity.isDefault)}
        {...rename.formProps}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="block space-y-1">
          <span className="sr-only">Name of {entity.name}</span>
          <input name="name" required minLength={2} defaultValue={entity.name} className={`${input} w-72 font-medium`} />
        </label>
        <label className="block space-y-1">
          <span className="sr-only">Reference of {entity.name}</span>
          <input
            name="legalEntityRef"
            defaultValue={entity.legalEntityRef ?? ""}
            placeholder="no reference"
            className={`${input} w-48 font-mono`}
          />
        </label>
        <button
          type="submit"
          disabled={rename.pending}
          className="rounded border border-line bg-surface px-3 py-2 text-xs hover:border-brand disabled:opacity-50"
        >
          {rename.pending ? "Saving…" : "Save"}
        </button>
        {entity.isDefault ? (
          <span className="rounded border border-emerald-700 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] text-emerald-900">
            default
          </span>
        ) : null}
      </form>
      {entity.isDefault ? null : (
        <form {...makeDefault.formProps}>
          <button
            type="submit"
            disabled={makeDefault.pending}
            className="text-xs text-ink-soft underline-offset-2 hover:text-brand hover:underline disabled:opacity-50"
          >
            Make this the default
          </button>
        </form>
      )}
      <form {...provider.formProps} className="flex flex-wrap items-baseline gap-2 text-xs">
        {entity.publicCommsProvider ? (
          <span className="rounded border border-line px-2 py-0.5 font-mono text-[11px]">public communications provider</span>
        ) : null}
        <button
          type="submit"
          disabled={provider.pending}
          className="text-ink-soft underline-offset-2 hover:text-brand hover:underline disabled:opacity-50"
        >
          {entity.publicCommsProvider
            ? "Not a public communications provider"
            : "Mark as a public communications provider (PECR reg 5A)"}
        </button>
      </form>
      <Outcome result={rename.result} />
      <Outcome result={makeDefault.result} />
      <Outcome result={provider.result} />
    </li>
  );
}
