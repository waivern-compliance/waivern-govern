"use client";

import { useActionState } from "react";
import type { extractionFindings, extractionLinks, extractions } from "@/db/schema";
import {
  decideFindingAction,
  declineLinkAction,
  followLinkAction,
  readAgreementAction,
  type ExtractionResult,
} from "@/app/app/third-parties/extractionActions";

type Run = typeof extractions.$inferSelect;
type Finding = typeof extractionFindings.$inferSelect;
type Link = typeof extractionLinks.$inferSelect;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Ask the organisation's model to read the attached agreement.
 *
 * What is on screen is a set of proposals, not an answer. Each one shows the
 * sentence it came from and the file or page that sentence is in, because the
 * only useful version of this feature is one where a reviewer can check it
 * faster than they could have read the contract themselves.
 */
export function ReadAgreement({
  dpaId,
  entityId,
  revalidate,
  available,
  latest,
  mayEdit,
}: {
  dpaId: string;
  entityId: string | null;
  revalidate: string;
  available: boolean;
  latest: { run: Run; findings: Finding[]; links: Link[] } | null;
  mayEdit: boolean;
}) {
  const [result, run, running] = useActionState<ExtractionResult>(
    readAgreementAction.bind(null, { dpaId, entityId, revalidate }),
    null,
  );

  if (!available && !latest) return null;

  const transfers = latest?.findings.filter((f) => f.kind === "transfer_mechanism") ?? [];
  const processors = latest?.findings.filter((f) => f.kind === "sub_processor") ?? [];
  const context = { entityId, revalidate };

  return (
    <div className="space-y-3 rounded border border-line bg-ground p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          Transfers and sub-processors
        </span>
        {available && mayEdit ? (
          <form action={run}>
            <button
              type="submit"
              disabled={running}
              className="rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-ground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
            >
              {running ? "Reading…" : latest ? "Read the files again" : "Read the attached files"}
            </button>
          </form>
        ) : null}
      </div>

      {result ? (
        <p
          role="status"
          className={`rounded border px-3 py-2 text-xs ${
            result.ok
              ? "border-emerald-700 bg-emerald-50 text-emerald-900"
              : "border-amber-700 bg-amber-50 text-amber-900"
          }`}
        >
          {result.message}
        </p>
      ) : null}

      {!latest ? (
        <p className="text-xs text-ink-soft">
          The model reads the files attached here and to the third party, and proposes the
          transfer mechanism and sub-processors they name. Nothing it proposes is recorded
          until you accept it.
        </p>
      ) : (
        <>
          <p className="font-mono text-[11px] text-ink-soft">
            {latest.run.model} · {day(latest.run.createdAt)} · {latest.run.requestedByLabel} ·{" "}
            read {latest.run.sources.map((s) => s.name).join(", ") || "nothing"}
          </p>

          {latest.run.failure ? (
            <p className="rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {latest.run.failure}
            </p>
          ) : null}

          {latest.run.unreadable.length > 0 ? (
            <ul className="space-y-1 text-xs text-ink-soft">
              {latest.run.unreadable.map((u) => (
                <li key={u.name}>
                  <span className="font-medium">{u.name}</span> — {u.reason}
                </li>
              ))}
            </ul>
          ) : null}

          {latest.run.redactions.length > 0 ? (
            <p className="text-xs text-ink-soft">
              Removed before sending:{" "}
              {latest.run.redactions.map((r) => `${r.count} ${r.kind}`).join(", ")}.
            </p>
          ) : null}

          <Group title="Transfer mechanism" findings={transfers} run={latest.run} mayEdit={mayEdit} context={context} />
          <Group title="Sub-processors" findings={processors} run={latest.run} mayEdit={mayEdit} context={context} />

          {latest.links.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium">Lists held elsewhere</p>
              <p className="text-xs text-ink-soft">
                These addresses came out of the supplier&rsquo;s own documents. The platform
                will not open one until you ask it to.
              </p>
              <ul className="space-y-2">
                {latest.links.map((link) => (
                  <LinkRow key={link.id} link={link} mayEdit={mayEdit} context={context} />
                ))}
              </ul>
            </div>
          ) : null}

          {latest.findings.length === 0 && !latest.run.failure ? (
            <p className="text-xs text-ink-soft">
              Nothing was found to propose. That is a real answer: the agreement may not
              name any, or may hold the list somewhere else.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Group({
  title,
  findings,
  run,
  mayEdit,
  context,
}: {
  title: string;
  findings: Finding[];
  run: Run;
  mayEdit: boolean;
  context: { entityId: string | null; revalidate: string };
}) {
  if (findings.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">{title}</p>
      <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
        {findings.map((finding) => (
          <li key={finding.id} className="space-y-1.5 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium">
                {finding.value}
                {finding.country ? (
                  <span className="ml-2 font-normal text-ink-soft">{finding.country}</span>
                ) : null}
              </span>
              {finding.status === "proposed" && mayEdit ? (
                <span className="flex gap-2">
                  <form action={decideFindingAction.bind(null, finding.id, true, context)}>
                    <button type="submit" className="rounded border border-line px-2 py-1 text-xs font-medium hover:bg-ground">
                      Accept
                    </button>
                  </form>
                  <form action={decideFindingAction.bind(null, finding.id, false, context)}>
                    <button type="submit" className="text-xs text-ink-soft underline hover:text-ink">
                      Reject
                    </button>
                  </form>
                </span>
              ) : (
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                  {finding.status}
                  {finding.decidedAt ? ` ${day(finding.decidedAt)}` : ""}
                </span>
              )}
            </div>
            {finding.detail ? <p className="text-xs text-ink-soft">{finding.detail}</p> : null}
            <blockquote className="border-l-2 border-line pl-2 text-xs italic text-ink-soft">
              “{finding.quote}”
            </blockquote>
            <Provenance finding={finding} run={run} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Where this came from, in enough detail to check it.
 *
 * A filename that links to the file, or the URL and the moment it was
 * retrieved, plus the hash of whichever it was — so a page that has since
 * changed can be told apart from one that has not.
 */
function Provenance({ finding, run }: { finding: Finding; run: Run }) {
  const source = run.sources.find((s) => s.label === finding.sourceLabel);
  const hash = finding.sourceSha256 ? ` · sha256 ${finding.sourceSha256.slice(0, 12)}…` : "";

  if (finding.sourceKind === "web_page" && finding.sourceUrl) {
    return (
      <p className="font-mono text-[11px] text-ink-soft">
        from{" "}
        <a
          href={finding.sourceUrl}
          rel="noopener noreferrer nofollow"
          target="_blank"
          className="text-brand hover:underline"
        >
          {finding.sourceUrl}
        </a>
        {finding.sourceFetchedAt ? ` · fetched ${day(finding.sourceFetchedAt)}` : ""}
        {hash}
      </p>
    );
  }

  return (
    <p className="font-mono text-[11px] text-ink-soft">
      from{" "}
      {finding.sourceDocumentId ? (
        <a href={`/api/documents/${finding.sourceDocumentId}`} className="text-brand hover:underline">
          {source?.name ?? "the attached file"}
        </a>
      ) : (
        (source?.name ?? "the attached file")
      )}
      {hash}
    </p>
  );
}

function LinkRow({
  link,
  mayEdit,
  context,
}: {
  link: Link;
  mayEdit: boolean;
  context: { entityId: string | null; revalidate: string };
}) {
  const [result, follow, following] = useActionState<ExtractionResult>(
    followLinkAction.bind(null, link.id, context),
    null,
  );

  return (
    <li className="space-y-1 rounded border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <a
          href={link.url}
          rel="noopener noreferrer nofollow"
          target="_blank"
          className="break-all text-xs text-brand hover:underline"
        >
          {link.url}
        </a>
        {link.status === "proposed" && mayEdit ? (
          <span className="flex gap-2">
            <form action={follow}>
              <button
                type="submit"
                disabled={following}
                className="rounded border border-line px-2 py-1 text-xs font-medium hover:bg-ground disabled:opacity-60"
              >
                {following ? "Fetching…" : "Fetch and read"}
              </button>
            </form>
            <form action={declineLinkAction.bind(null, link.id, context)}>
              <button type="submit" className="text-xs text-ink-soft underline hover:text-ink">
                Not this one
              </button>
            </form>
          </span>
        ) : (
          <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
            {link.status}
            {link.fetchedAt ? ` ${day(link.fetchedAt)}` : ""}
          </span>
        )}
      </div>
      {link.why ? <p className="text-xs text-ink-soft">{link.why}</p> : null}
      {link.fetchedSha256 ? (
        <p className="font-mono text-[11px] text-ink-soft">
          sha256 {link.fetchedSha256.slice(0, 12)}… · {link.fetchedCharacters} characters
        </p>
      ) : null}
      {link.failure ? <p className="text-xs text-amber-900">{link.failure}</p> : null}
      {result && !result.ok ? (
        <p role="status" className="rounded border border-amber-700 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {result.message}
        </p>
      ) : null}
    </li>
  );
}
