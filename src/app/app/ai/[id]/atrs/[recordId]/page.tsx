import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { NotPermitted } from "@/components/NotPermitted";
import {
  ATRS_GUIDANCE_URL,
  ATRS_SECTIONS,
  ATRS_SUBMISSION_EMAIL,
  ATRS_TEMPLATE_URL,
  invalidFields,
  missingFields,
  thirdPartiesInvolved,
} from "@/lib/atrs/standard";
import { can } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { loadRecord } from "@/services/atrs";
import { discardAction } from "../actions";
import { ApproveButton, PublishForm, RecordForm } from "./forms";

const STATUS_WORDS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved, not yet published",
  published: "Published",
  superseded: "Superseded",
};

export default async function AtrsRecordPage({
  params,
}: {
  params: Promise<{ id: string; recordId: string }>;
}) {
  const { id, recordId } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadRecord(recordId, active.membership.organisationId);
  if (!loaded || loaded.useCase.id !== id) notFound();
  const { record, useCase } = loaded;

  const grants = active.membership.grants;
  if (!can(grants, "record.read", record.entityId)) {
    return (
      <NotPermitted
        what={`The transparency record for ${useCase.reference} belongs to another part of the organisation, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }

  const draft = record.status === "draft";
  const mayEdit = draft && can(grants, "record.write", record.entityId);
  const mayApprove =
    draft &&
    can(grants, "approval.decide", record.entityId) &&
    record.createdByUserId !== active.userId;
  const mayPublish = record.status === "approved" && can(grants, "record.write", record.entityId);

  const missing = missingFields(record.fields);
  const invalid = invalidFields(record.fields);
  const showThirdParty = thirdPartiesInvolved(record.fields);

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href={`/app/ai/${id}`} className="text-xs text-ink-soft hover:text-brand">
          ← {useCase.reference} {useCase.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Algorithmic transparency record
        </h1>
        <p className="font-mono text-xs text-ink-soft">
          Version {record.version} · ATRS v{record.standardVersion} · {STATUS_WORDS[record.status]}
        </p>
        <p className="max-w-prose text-sm text-ink-soft">
          The public record of how this system is used, in the Algorithmic
          Transparency Recording Standard&rsquo;s own fields and numbering. See the{" "}
          <a href={ATRS_GUIDANCE_URL} className="underline" target="_blank" rel="noreferrer">
            guidance
          </a>{" "}
          and the{" "}
          <a href={ATRS_TEMPLATE_URL} className="underline" target="_blank" rel="noreferrer">
            template
          </a>
          .
        </p>
      </header>

      <section className="space-y-3 rounded border border-line bg-surface p-4 text-sm">
        {record.status === "draft" ? (
          <>
            <p>
              Started by {record.createdByLabel} on {record.createdAt.toISOString().slice(0, 10)}.{" "}
              {missing.length === 0 && invalid.length === 0 ? (
                <strong>Ready for approval.</strong>
              ) : (
                <>
                  <strong>
                    {missing.length} field{missing.length === 1 ? "" : "s"} to complete
                  </strong>
                  {invalid.length > 0 ? `, ${invalid.length} to correct` : ""} before it can be
                  approved.
                </>
              )}
            </p>
            {record.version === 1 && Object.keys(record.fields).length > 0 ? (
              <p className="text-xs text-ink-soft">
                Started from the register and this system&rsquo;s approved assessments.
                Read every field: it is a public statement once approved.
              </p>
            ) : null}
            {mayApprove ? (
              <ApproveButton recordId={record.id} />
            ) : can(grants, "approval.decide", record.entityId) ? (
              <p className="text-xs text-ink-soft">
                You started this draft, so somebody else approves it.
              </p>
            ) : (
              <p className="text-xs text-ink-soft">Approved by somebody with the approver role.</p>
            )}
          </>
        ) : (
          <>
            <p>
              Approved by {record.approvedByLabel} on {record.approvedAt?.toISOString().slice(0, 10)}.
              {record.publicationUrl ? (
                <>
                  {" "}Published{" "}
                  <a href={record.publicationUrl} className="underline" target="_blank" rel="noreferrer">
                    here
                  </a>{" "}
                  on {record.publishedAt?.toISOString().slice(0, 10)}.
                </>
              ) : null}
              {record.supersededAt
                ? ` Superseded on ${record.supersededAt.toISOString().slice(0, 10)}.`
                : ""}
            </p>
            {record.status === "approved" ? (
              <p className="text-xs text-ink-soft">
                To publish, export the record and send it to {ATRS_SUBMISSION_EMAIL}. When it
                appears in the repository, record where.
              </p>
            ) : null}
            {mayPublish ? <PublishForm recordId={record.id} /> : null}
          </>
        )}
        <p className="flex flex-wrap gap-x-4 text-xs">
          <a href={`/app/ai/${id}/atrs/${record.id}/export?format=csv`} className="text-brand hover:underline">
            Export for the ATRS spreadsheet (CSV)
          </a>
          <a href={`/app/ai/${id}/atrs/${record.id}/export?format=json`} className="text-brand hover:underline">
            Export as JSON
          </a>
        </p>
      </section>

      {mayEdit ? (
        <>
          <RecordForm
            recordId={record.id}
            sections={ATRS_SECTIONS}
            values={record.fields}
            missing={missing.map((f) => f.ref)}
          />
          <form action={discardAction.bind(null, record.id)}>
            <button type="submit" className="text-xs text-ink-soft underline hover:text-red-800">
              Discard this draft
            </button>
          </form>
        </>
      ) : (
        <div className="space-y-8">
          {ATRS_SECTIONS.map((section) => (
            <section key={section.ref} className="space-y-2">
              <h2 className="text-base font-semibold">
                <span className="font-mono text-xs text-ink-soft">{section.ref}</span> {section.title}
              </h2>
              <dl className="space-y-3 rounded border border-line bg-surface p-4 text-sm">
                {section.fields
                  .filter((f) => showThirdParty || !f.ref.startsWith("2.1.4."))
                  .map((f) => (
                    <div key={f.ref}>
                      <dt className="text-xs font-medium text-ink-soft">
                        <span className="font-mono">{f.ref}</span> {f.label}
                      </dt>
                      <dd className="whitespace-pre-line">
                        {record.fields[f.ref] ?? <span className="text-ink-soft">—</span>}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
