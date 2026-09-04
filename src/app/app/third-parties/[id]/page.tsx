import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { Attachments } from "@/components/documents/Attachments";
import { GapChips } from "@/components/GapChips";
import { Discussion } from "@/components/Discussion";
import { NotPermitted } from "@/components/NotPermitted";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { documentsFor } from "@/services/documents";
import { GAP_WORDS, HARD_GAPS, loadSupplier } from "@/services/third-party";
import { confirmSupplierAction, recordDpaAction, updateSupplierAction } from "../actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function SupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  if (!can(active.membership.grants, "record.read")) {
    return (
      <NotPermitted
        what="The third-party register"
        organisationName={active.membership.organisationName}
      />
    );
  }

  const loaded = await loadSupplier(id, active.membership.organisationId);
  if (!loaded) notFound();

  const { supplier, dpas, current, gaps, hardGaps } = loaded;
  const mayEdit = can(active.membership.grants, "record.write");

  const colleagues = await db
    .select({ id: users.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, active.membership.organisationId))
    .orderBy(asc(users.email));

  const org = active.membership.organisationId;
  const [supplierDocs, ...dpaDocs] = await Promise.all([
    documentsFor(org, "supplier", supplier.id),
    ...dpas.map((d) => documentsFor(org, "dpa", d.id)),
  ]);
  const docsByDpa = new Map(dpas.map((d, i) => [d.id, dpaDocs[i] ?? []]));
  const here = `/app/third-parties/${supplier.id}`;

  const needsConfirming = Boolean(supplier.sourceConnectionId && !supplier.reviewedAt);

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <header className="space-y-3 border-b border-line pb-6">
        <Link href="/app/third-parties" className="text-xs text-ink-soft hover:text-brand">
          ← Third parties
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{supplier.name}</h1>
        <p className="text-xs text-ink-soft">
          {supplier.sourceConnectionId ? "Reported by a connected tool" : "Recorded by a person"}
          {supplier.reviewedAt ? ` · confirmed ${day(supplier.reviewedAt)}` : ""}
        </p>
        <GapChips
          gaps={gaps}
          words={GAP_WORDS}
          serious={HARD_GAPS}
          clear="Article 28 satisfied"
        />
        {hardGaps.length > 0 ? (
          <p className="max-w-prose text-xs text-red-900">
            Article 28(3) requires processing to be governed by a contract. No
            agreement, an unsigned one and an expired one are the same failure
            in substance.
          </p>
        ) : null}
      </header>

      {needsConfirming && mayEdit ? (
        <section className="space-y-3 rounded border border-amber-700 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            A tool reported this. Is it really your processor?
          </h2>
          <p className="max-w-prose text-xs text-amber-900">
            A scanner sees a third party on a page; it cannot tell whether that
            party processes personal data on your behalf, or is a recipient in
            its own right, or was a mistake. Confirming records that a person
            looked — it does not assert an agreement exists.
          </p>
          <form action={confirmSupplierAction.bind(null, supplier.id)}>
            <button
              type="submit"
              className="rounded bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              I have looked at this
            </button>
          </form>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Agreements</h2>
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {dpas.map((d) => (
            <li key={d.id} className="space-y-1 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="font-medium">
                  {d.title}
                  {current?.id === d.id ? (
                    <span className="ml-2 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                      in force
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {d.signedAt ? `signed ${day(d.signedAt)}` : "not signed"}
                  {d.expiresAt ? ` → ${day(d.expiresAt)}` : " → no end date"}
                </span>
              </div>
              <p className="text-xs text-ink-soft">
                {d.documentRef ? `${d.documentRef} · ` : ""}
                {d.transferMechanism
                  ? `transfers: ${d.transferMechanism}`
                  : "no transfer mechanism recorded"}
                {" · "}
                {(d.subProcessors ?? []).length > 0
                  ? `sub-processors: ${(d.subProcessors ?? []).join(", ")}`
                  : "sub-processors not recorded"}
              </p>
              <Attachments
                subjectType="dpa"
                subjectId={d.id}
                entityId={null}
                revalidate={here}
                documents={docsByDpa.get(d.id) ?? []}
                mayEdit={mayEdit}
                what="the signed agreement and its schedules"
              />
            </li>
          ))}
          {dpas.length === 0 ? (
            <li className="px-4 py-6 text-sm text-ink-soft">
              No agreement recorded. If one exists, record it here so the expiry
              is watched — otherwise nothing will notice when it lapses.
            </li>
          ) : null}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Other documents</h2>
        <p className="max-w-prose text-xs text-ink-soft">
          Anything about this third party that is not tied to one agreement —
          due diligence, certifications, an audit report.
        </p>
        <Attachments
          subjectType="supplier"
          subjectId={supplier.id}
          entityId={null}
          revalidate={here}
          documents={supplierDocs}
          mayEdit={mayEdit}
          what="documents"
        />
      </section>

      {mayEdit ? (
        <>
          <details className="rounded border border-line bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Record an agreement
            </summary>
            <form
              action={recordDpaAction.bind(null, supplier.id)}
              className="space-y-3 border-t border-line p-4"
            >
              <Field label="Title" name="title" required />
              <Field label="Document reference" name="documentRef" hint="where the signed copy lives" />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Signed" name="signedAt" type="date" />
                <Field label="Expires" name="expiresAt" type="date" hint="leave empty if perpetual" />
              </div>
              <Field
                label="Transfer mechanism"
                name="transferMechanism"
                hint="SCCs, UK Addendum, adequacy — if data leaves the UK"
              />
              <Area
                label="Sub-processors"
                name="subProcessors"
                hint="Article 28(2) — one per line"
              />
              <button
                type="submit"
                className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                Record it
              </button>
            </form>
          </details>

          <form
            action={updateSupplierAction.bind(null, supplier.id)}
            className="space-y-4 rounded border border-line bg-surface p-5"
          >
            <h2 className="text-sm font-semibold">The third party</h2>
            <Field label="Name" name="name" defaultValue={supplier.name} />
            <Area
              label="What they do for you"
              name="description"
              defaultValue={supplier.description ?? ""}
              rows={2}
            />
            <Area
              label="Categories"
              name="categories"
              defaultValue={(supplier.categories ?? []).join("\n")}
            />
            <label className="block space-y-1">
              <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
                Owner
                <span className="block font-normal normal-case tracking-normal">
                  who is accountable for this relationship
                </span>
              </span>
              <select
                name="ownerId"
                defaultValue={supplier.ownerId ?? ""}
                className="w-full rounded border border-line bg-ground px-3 py-2 text-sm"
              >
                <option value="">Nobody yet</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>{c.email}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Save
            </button>
          </form>
        </>
      ) : null}

      <Discussion
        subjectType="supplier"
        subjectId={id}
        entityId={null}
        subjectLabel={supplier.name}
      />
    </main>
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

function Field({
  label,
  name,
  hint,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  hint?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block space-y-1">
      <Label text={label} hint={hint} />
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
      />
    </label>
  );
}

function Area({
  label,
  name,
  hint,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  hint?: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <label className="block space-y-1">
      <Label text={label} hint={hint} />
      <textarea
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        className="w-full rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
      />
    </label>
  );
}
