import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities } from "@/db/schema";
import { EditForm } from "@/components/EditForm";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { SERIOUS_SHARING_GAPS, SHARING_GAP_WORDS } from "@/lib/dpa2018/sharing";
import { can } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { sharingRegister } from "@/services/sharing-agreements";
import { createSharingAgreementAction } from "./actions";
import { Label, inputClass } from "../requests/fields";

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function SharingAgreementsPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  if (!can(active.membership.grants, "record.read")) {
    return <NotPermitted what="The data sharing agreement register" organisationName={active.membership.organisationName} />;
  }
  const org = active.membership.organisationId;
  const [{ rows, uncovered }, orgEntities] = await Promise.all([
    sharingRegister(org, visibleEntityIds(active)),
    scoped(org, () => db.select({ id: entities.id, name: entities.name }).from(entities).where(eq(entities.organisationId, org)).orderBy(asc(entities.name))),
  ]);
  const writable = orgEntities.filter((e) => can(active.membership.grants, "record.write", e.id));
  const current = rows.filter((r) => !r.agreement.endedAt);
  const ended = rows.filter((r) => r.agreement.endedAt);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Data sharing agreements</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Sharing with other controllers — a council with a health trust, a school with children&apos;s services, a
          safeguarding partnership. Each agreement records the parties, each one&apos;s lawful basis, the legal gateway
          that allows a public body to share, what is shared and when it is reviewed. Processors are governed by
          Article 28 agreements on the third-party register instead.
        </p>
      </header>

      <HelpLink topic="sharing-agreements" />

      {uncovered.length > 0 ? (
        <section className="space-y-1.5 rounded border border-amber-700 bg-amber-50 p-4" aria-label="Sharing no agreement covers">
          <h2 className="text-sm font-semibold text-amber-900">Sharing no current agreement covers</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-amber-900">
            {uncovered.map((a) => (
              <li key={a.id}>
                <Link href={`/app/ropa/${a.id}`} className="hover:underline">
                  <span className="font-mono text-xs">{a.reference}</span> {a.name}
                </Link>{" "}
                shares with {a.controllers.map((c) => c.name).join(", ")}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-900">
            Recipients on the processing register that the third-party register records as another controller.
          </p>
        </section>
      ) : null}

      {writable.length > 0 ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Add an agreement</summary>
          <EditForm action={createSharingAgreementAction} className="space-y-3 border-t border-line p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Title" />
                <input name="title" required placeholder="Information sharing agreement: multi-agency safeguarding hub" className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="Our party" hint="The entity that shares or receives." />
                <select name="entityId" className={inputClass}>
                  {writable.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
            </div>
            <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Add it, then fill it in
            </button>
          </EditForm>
        </details>
      ) : null}

      <ul className="space-y-3">
        {current.map((r) => <AgreementRow key={r.agreement.id} row={r} />)}
        {current.length === 0 ? (
          <li className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            None recorded. Add each agreement under which you share personal data with another controller.
          </li>
        ) : null}
      </ul>

      {ended.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Ended</h2>
          <ul className="space-y-3">{ended.map((r) => <AgreementRow key={r.agreement.id} row={r} />)}</ul>
        </section>
      ) : null}
    </main>
  );
}

function AgreementRow({ row }: { row: Awaited<ReturnType<typeof sharingRegister>>["rows"][number] }) {
  const { agreement, entityName, parties, gaps } = row;
  const serious = gaps.filter((g) => SERIOUS_SHARING_GAPS.includes(g));
  return (
    <li>
      <Link
        href={`/app/sharing-agreements/${agreement.id}`}
        className="block space-y-1.5 rounded border border-line bg-surface p-4 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="flex items-baseline gap-3">
            <span className="font-mono text-xs text-ink-soft">{agreement.reference}</span>
            <span className="font-medium">{agreement.title}</span>
          </span>
          <span className="text-xs text-ink-soft">
            {entityName}
            {agreement.endedAt ? ` · ended ${day(agreement.endedAt)}` : agreement.reviewDueAt ? ` · review due ${day(agreement.reviewDueAt)}` : ""}
          </span>
        </div>
        <p className="text-xs text-ink-soft">
          {parties.length > 0 ? `With ${parties.map((p) => p.supplierName).join(", ")}` : "No other party named"}
        </p>
        {gaps.length > 0 ? (
          <p className="text-xs text-amber-900">
            {[...serious, ...gaps.filter((g) => !serious.includes(g))].map((g) => SHARING_GAP_WORDS[g]).join(" · ")}
          </p>
        ) : null}
      </Link>
    </li>
  );
}
