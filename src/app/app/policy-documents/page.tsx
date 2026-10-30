import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities, memberships, users } from "@/db/schema";
import { EditForm } from "@/components/EditForm";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { POLICY_DOCUMENT_GAP_WORDS, SCHEDULE_1 } from "@/lib/dpa2018/schedule-1";
import { can, scopedEntityIds } from "@/lib/rbac";
import { getActiveSession, visibleEntityIds } from "@/lib/session";
import { policyDocumentRegister } from "@/services/policy-documents";
import { createPolicyDocumentAction } from "./actions";
import { PolicyFields } from "./PolicyFields";
import { Label, inputClass } from "../requests/fields";

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function PolicyDocumentsPage() {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  if (!can(active.membership.grants, "record.read")) {
    return <NotPermitted what="The appropriate policy document register" organisationName={active.membership.organisationName} />;
  }

  const org = active.membership.organisationId;
  const grants = active.membership.grants;
  const [{ rows, uncovered }, orgEntities, members] = await Promise.all([
    policyDocumentRegister(org, visibleEntityIds(active)),
    scoped(org, () => db.select({ id: entities.id, name: entities.name }).from(entities).where(eq(entities.organisationId, org)).orderBy(asc(entities.name))),
    scoped(org, () =>
      db
        .select({ id: users.id, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organisationId, org))
        .orderBy(asc(users.email)),
    ),
  ]);
  const organisationWide = scopedEntityIds(grants, "record.write") === null;
  const writable = orgEntities.filter((e) => can(grants, "record.write", e.id));
  const current = rows.filter((r) => !r.doc.withdrawnAt);
  const withdrawn = rows.filter((r) => r.doc.withdrawnAt);

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app" className="text-xs text-ink-soft hover:text-brand">
          ← {active.membership.organisationName}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Appropriate policy documents</h1>
        <p className="max-w-prose text-sm text-ink-soft">
          Most Data Protection Act 2018 Schedule 1 conditions for special category and criminal offence data are met
          only while an appropriate policy document is in place: one that explains how the Article 5 principles are met
          and what the retention and erasure policy is (Schedule 1, Part 4). This register records which conditions
          each document covers. The documents themselves are yours; attach them here.
        </p>
      </header>

      <HelpLink topic="policy-documents" />

      {uncovered.length > 0 ? (
        <section className="space-y-1.5 rounded border border-red-800 bg-red-50 p-4" aria-label="Processing no document covers">
          <h2 className="text-sm font-semibold text-red-900">Processing no current document covers</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-red-900">
            {uncovered.map((a) => (
              <li key={a.id}>
                <Link href={`/app/ropa/${a.id}`} className="hover:underline">
                  <span className="font-mono text-xs">{a.reference}</span> {a.name}
                </Link>{" "}
                relies on {a.uncovered.map((k) => `paragraph ${SCHEDULE_1[k].paragraph}`).join(", ")}
                {a.uncovered.every((k) => SCHEDULE_1[k].policyDocument === "unless") ? ", unless its exception applies" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {writable.length > 0 || organisationWide ? (
        <details className="rounded border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Add a policy document</summary>
          <EditForm action={createPolicyDocumentAction} className="space-y-4 border-t border-line p-4">
            <PolicyFields entities={organisationWide ? orgEntities : writable} members={members} organisationWide={organisationWide} />
            <label className="block max-w-xs space-y-1">
              <Label text="Last reviewed" hint="Optional. Leave blank if it has not been." />
              <input type="date" name="lastReviewedAt" className={inputClass} />
            </label>
            <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Add it
            </button>
          </EditForm>
        </details>
      ) : null}

      <ul className="space-y-3">
        {current.map((r) => (
          <PolicyRow key={r.doc.id} row={r} />
        ))}
        {current.length === 0 ? (
          <li className="rounded border border-line bg-surface px-4 py-6 text-sm text-ink-soft">
            None recorded. Add each appropriate policy document, with the Schedule 1 conditions it covers.
          </li>
        ) : null}
      </ul>

      {withdrawn.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Withdrawn, and kept for six months</h2>
          <ul className="space-y-3">
            {withdrawn.map((r) => <PolicyRow key={r.doc.id} row={r} />)}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function PolicyRow({ row }: { row: Awaited<ReturnType<typeof policyDocumentRegister>>["rows"][number] }) {
  const { doc, entityName, gaps, relying } = row;
  return (
    <li>
      <Link
        href={`/app/policy-documents/${doc.id}`}
        className="block space-y-1.5 rounded border border-line bg-surface p-4 hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="font-medium">
            {doc.title}
            {doc.version ? <span className="font-normal text-ink-soft"> · {doc.version}</span> : null}
          </span>
          <span className="text-xs text-ink-soft">
            {entityName ?? "Every entity"}
            {doc.withdrawnAt ? ` · withdrawn ${day(doc.withdrawnAt)}` : doc.lastReviewedAt ? ` · reviewed ${day(doc.lastReviewedAt)}` : ""}
          </span>
        </div>
        <p className="text-xs text-ink-soft">
          {doc.conditions.length > 0
            ? `Covers paragraph${doc.conditions.length === 1 ? "" : "s"} ${doc.conditions.map((k) => SCHEDULE_1[k].paragraph).join(", ")}`
            : "Covers nothing yet"}
          {doc.withdrawnAt ? "" : ` · relied on by ${relying.length} activit${relying.length === 1 ? "y" : "ies"}`}
        </p>
        {gaps.length > 0 ? (
          <p className="text-xs text-amber-900">{gaps.map((g) => POLICY_DOCUMENT_GAP_WORDS[g]).join(" · ")}</p>
        ) : null}
      </Link>
    </li>
  );
}
