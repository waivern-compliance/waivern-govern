import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { entities, memberships, users } from "@/db/schema";
import { Attachments } from "@/components/documents/Attachments";
import { EditForm } from "@/components/EditForm";
import { NotPermitted } from "@/components/NotPermitted";
import { POLICY_DOCUMENT_GAP_WORDS, SCHEDULE_1, describeSchedule1 } from "@/lib/dpa2018/schedule-1";
import { savedKey } from "@/lib/saved-key";
import { can, scopedEntityIds } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { documentsFor } from "@/services/documents";
import { loadPolicyDocument } from "@/services/policy-documents";
import {
  deletePolicyDocumentAction,
  reviewPolicyDocumentAction,
  updatePolicyDocumentAction,
  withdrawPolicyDocumentAction,
} from "../actions";
import { PolicyFields } from "../PolicyFields";
import { Label, inputClass } from "../../requests/fields";

const day = (d: Date) => d.toISOString().slice(0, 10);

export default async function PolicyDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  const org = active.membership.organisationId;
  const grants = active.membership.grants;

  const loaded = await loadPolicyDocument(id, org);
  if (!loaded) notFound();
  const { doc, entityName, ownerEmail, gaps, relying } = loaded;
  if (!can(grants, "record.read", doc.entityId ?? undefined)) {
    return <NotPermitted what="This policy document" organisationName={active.membership.organisationName} />;
  }
  const organisationWide = scopedEntityIds(grants, "record.write") === null;
  const mayEdit = doc.entityId ? can(grants, "record.write", doc.entityId) : organisationWide;

  const [files, orgEntities, members] = await Promise.all([
    documentsFor(org, "policy_document", doc.id),
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
  const writable = organisationWide ? orgEntities : orgEntities.filter((e) => can(grants, "record.write", e.id));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/policy-documents" className="text-xs text-ink-soft hover:text-brand">
          ← Appropriate policy documents
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {doc.title}
          {doc.version ? <span className="font-normal text-ink-soft"> · {doc.version}</span> : null}
        </h1>
        <p className="text-xs text-ink-soft">
          {entityName ?? "Every entity in the organisation"} · {ownerEmail ?? "no owner"} ·{" "}
          {doc.lastReviewedAt ? `last reviewed ${day(doc.lastReviewedAt)}` : "never reviewed"}
        </p>
        {doc.withdrawnAt ? (
          <p className="max-w-prose rounded border border-line bg-ground px-3 py-2 text-xs">
            Withdrawn on {day(doc.withdrawnAt)}. It covers nothing now, and must be kept until {day(loaded.deletableFrom!)}:
            six months after the controller stops relying on the conditions (Schedule 1 paragraph 40(2)).
          </p>
        ) : gaps.length > 0 ? (
          <p className="text-xs text-amber-900">{gaps.map((g) => POLICY_DOCUMENT_GAP_WORDS[g]).join(" · ")}</p>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Conditions it covers</h2>
        {doc.conditions.length > 0 ? (
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {doc.conditions.map((k) => <li key={k}>{describeSchedule1(k)}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">None chosen.</p>
        )}
      </section>

      {!doc.withdrawnAt ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Processing that relies on it</h2>
          {relying.length > 0 ? (
            <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
              {relying.map((a) => (
                <li key={a.id}>
                  <Link href={`/app/ropa/${a.id}`} className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm hover:bg-ground">
                    <span className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-ink-soft">{a.reference}</span>
                      <span>{a.name}</span>
                    </span>
                    <span className="text-xs text-ink-soft">
                      paragraph{a.needing.length === 1 ? "" : "s"} {a.needing.map((k) => SCHEDULE_1[k].paragraph).join(", ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">No activity on the processing register relies on a condition it covers.</p>
          )}
        </section>
      ) : null}

      <Attachments
        subjectType="policy_document"
        subjectId={doc.id}
        entityId={doc.entityId}
        revalidate={`/app/policy-documents/${doc.id}`}
        documents={files}
        mayEdit={mayEdit}
        what="The policy document"
      />

      {mayEdit && !doc.withdrawnAt ? (
        <>
          <EditForm
            key={savedKey(doc)}
            action={updatePolicyDocumentAction.bind(null, doc.id)}
            className="space-y-4 rounded border border-line bg-surface p-5"
          >
            <h2 className="text-sm font-semibold">Change it</h2>
            <PolicyFields
              values={doc}
              entities={doc.entityId && !writable.some((e) => e.id === doc.entityId) ? [...writable, { id: doc.entityId, name: entityName ?? "" }] : writable}
              members={members}
              organisationWide={organisationWide || doc.entityId === null}
            />
            <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              Save
            </button>
          </EditForm>

          <EditForm action={reviewPolicyDocumentAction.bind(null, doc.id)} className="flex flex-wrap items-end gap-3 rounded border border-line bg-surface p-5">
            <label className="block space-y-1">
              <Label text="Record a review" hint="Paragraph 40(1)(b): reviewed and, where needed, updated. Blank for today." />
              <input type="date" name="reviewedAt" className={inputClass} />
            </label>
            <button type="submit" className="rounded border border-line px-4 py-2 text-sm hover:border-brand">
              Reviewed
            </button>
          </EditForm>

          <EditForm action={withdrawPolicyDocumentAction.bind(null, doc.id)} className="space-y-2 rounded border border-line bg-surface p-5">
            <p className="max-w-prose text-sm text-ink-soft">
              Withdraw it when it is no longer in force. It stops covering any condition, so processing that still
              relies on one shows as uncovered, and it is kept for six months.
            </p>
            <button type="submit" className="rounded border border-red-800 px-4 py-2 text-sm text-red-900 hover:bg-red-50">
              Withdraw
            </button>
          </EditForm>
        </>
      ) : null}

      {mayEdit && doc.withdrawnAt ? (
        <EditForm action={deletePolicyDocumentAction.bind(null, doc.id)} className="space-y-2 rounded border border-line bg-surface p-5">
          <p className="text-sm text-ink-soft">
            Deleting it removes the record and its attached files. Allowed from {day(loaded.deletableFrom!)}.
          </p>
          <button type="submit" className="rounded border border-red-800 px-4 py-2 text-sm text-red-900 hover:bg-red-50">
            Delete
          </button>
        </EditForm>
      ) : null}
    </main>
  );
}
