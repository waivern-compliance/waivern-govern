"use client";

import type { Dpo } from "@/lib/dpa2018/public-authority";
import { savedKey } from "@/lib/saved-key";
import { useRefusableAction } from "@/lib/use-refusable-action";
import { setDpoAction, type AdminResult } from "../actions";

type Position = {
  organisationDpo: Dpo | null;
  entities: Array<{
    id: string;
    name: string;
    publicAuthority: boolean;
    ownDpo: Dpo | null;
    effectiveDpo: Dpo | null;
    missing: boolean;
  }>;
};

const input =
  "w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand";
const label = "block text-xs font-medium uppercase tracking-wider text-ink-soft";

/**
 * The data protection officer: one for the organisation, and any entity that
 * has its own. A public authority must have one (Article 37(1)(a)); the panel
 * says which do not, rather than leaving it to be noticed.
 */
export function DpoPanel({
  position,
  members,
  mayManage,
}: {
  position: Position;
  members: Array<{ id: string; email: string }>;
  mayManage: boolean;
}) {
  const missing = position.entities.filter((e) => e.missing);

  return (
    <section className="space-y-4 rounded border border-line bg-surface p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Data protection officer</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Required of a public authority (UK GDPR Article 37(1)(a)) and of an organisation whose core activities
          involve large-scale monitoring or large-scale special category data. Where the person named is a member
          who may decide it, the &ldquo;Data protection officer&rdquo; approval stage goes to them.
        </p>
      </div>

      {missing.length > 0 ? (
        <p role="alert" className="max-w-prose rounded border border-red-800 bg-red-50 px-3 py-2 text-xs text-red-900">
          {missing.map((e) => e.name).join(", ")} {missing.length === 1 ? "is a public authority" : "are public authorities"}{" "}
          with no data protection officer. Article 37(1)(a) requires one.
        </p>
      ) : null}

      <DpoForm entityId={null} title="For the organisation" dpo={position.organisationDpo} members={members} mayManage={mayManage} />

      {position.entities.length > 1 || position.entities.some((e) => e.ownDpo) ? (
        <div className="space-y-3">
          <h3 className={label}>Entities with their own</h3>
          {position.entities.map((e) => (
            <DpoForm
              key={e.id}
              entityId={e.id}
              title={`${e.name}${e.publicAuthority ? " · public authority" : ""}`}
              dpo={e.ownDpo}
              fallback={e.ownDpo ? null : e.effectiveDpo}
              members={members}
              mayManage={mayManage}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DpoForm({
  entityId,
  title,
  dpo,
  fallback,
  members,
  mayManage,
}: {
  entityId: string | null;
  title: string;
  dpo: Dpo | null;
  /** The organisation's DPO, shown where an entity has none of its own. */
  fallback?: Dpo | null;
  members: Array<{ id: string; email: string }>;
  mayManage: boolean;
}) {
  const save = useRefusableAction<AdminResult>(setDpoAction.bind(null, entityId), { resetOnSuccess: false });

  if (!mayManage) {
    const shown = dpo ?? fallback;
    return (
      <div className="rounded border border-line px-4 py-3 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-xs text-ink-soft">
          {shown ? `${shown.name} · ${shown.contact}${dpo ? "" : " (the organisation's)"}` : "None recorded"}
        </p>
      </div>
    );
  }

  return (
    <details className="rounded border border-line px-4 py-3" open={entityId === null}>
      <summary className="cursor-pointer text-sm">
        <span className="font-medium">{title}</span>{" "}
        <span className="text-xs text-ink-soft">
          {dpo ? `— ${dpo.name}` : fallback ? `— uses the organisation's (${fallback.name})` : "— none recorded"}
        </span>
      </summary>
      <form key={savedKey(dpo)} {...save.formProps} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={label}>Name</span>
          <input name="name" defaultValue={dpo?.name ?? ""} className={input} />
        </label>
        <label className="block space-y-1">
          <span className={label}>Contact</span>
          <input name="contact" defaultValue={dpo?.contact ?? ""} placeholder="dpo@example.org" className={input} />
        </label>
        <label className="block space-y-1">
          <span className={label}>Member, if they use this platform</span>
          <select name="userId" defaultValue={dpo?.userId ?? ""} className={input}>
            <option value="">Not a member</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.email}</option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={label}>Reports to</span>
          <input name="reportsTo" defaultValue={dpo?.reportsTo ?? ""} placeholder="The board" className={input} />
        </label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="published" defaultChecked={dpo?.published ?? false} className="mt-1 accent-brand" />
          <span>
            Contact details are published, for example in the privacy notice{" "}
            <span className="font-mono text-[11px] text-ink-soft">Article 37(7)</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={save.pending}
            className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-50"
          >
            {save.pending ? "Saving…" : "Save"}
          </button>
          {dpo ? (
            <label className="flex items-center gap-1.5 text-xs text-ink-soft">
              <input type="checkbox" name="clear" className="accent-brand" />
              {entityId ? "Use the organisation's instead" : "Remove"}
            </label>
          ) : null}
        </div>
        {save.result ? (
          <p role={save.result.ok ? "status" : "alert"} className={`text-xs sm:col-span-2 ${save.result.ok ? "text-emerald-800" : "text-red-800"}`}>
            {save.result.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
