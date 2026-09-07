"use client";

import Link from "next/link";
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
  mayConfigure,
  readable,
}: {
  dpaId: string;
  entityId: string | null;
  revalidate: string;
  available: boolean;
  latest: { run: Run; findings: Finding[]; links: Link[] } | null;
  mayEdit: boolean;
  /** Whether this person could switch the capability on themselves. */
  mayConfigure: boolean;
  /** The files this would be given, and which record each hangs off. */
  readable: Array<{ name: string; where: string }>;
}) {
  const [result, run, running] = useActionState<ExtractionResult>(
    readAgreementAction.bind(null, { dpaId, entityId, revalidate }),
    null,
  );

  // Never render nothing. An absent feature that leaves no trace is
  // indistinguishable from one that does not exist, and the first report of
  // this was somebody looking for a button that had simply been switched off.
  if (!available && !latest) {
    return (
      <div className="space-y-1.5 rounded border border-dashed border-line bg-ground px-3 py-2">
        <p className="text-xs font-medium text-ink-soft">
          Read transfers and sub-processors from the attached files
        </p>
        <p className="text-xs text-ink-soft">
          A model can read the {readable.length > 0 ? "files attached here" : "agreement once a copy is attached"} and
          propose the transfer mechanism and sub-processors they name, each with the
          sentence it came from. It is switched off for this organisation.{" "}
          {mayConfigure ? (
            <>
              Turn on <span className="font-medium">Reading an uploaded agreement</span> under{" "}
              <Link href="/app/admin/assistant" className="text-brand hover:underline">
                Settings → Assistant
              </Link>
              .
            </>
          ) : (
            <>An administrator can turn it on under Settings → Assistant.</>
          )}
        </p>
      </div>
    );
  }

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

      {running ? (
        <p role="status" className="rounded border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
          Reading{readable.length > 0 ? ` ${readable.length} file${readable.length === 1 ? "" : "s"}` : ""}.
          A long agreement takes a minute or two — the model reads all of it before
          answering. Leave this page open.
        </p>
      ) : null}

      {/*
        The run itself is rendered below with its own failure, so repeating the
        action's message would show the same sentence twice — which is what the
        first report of the timeout looked like.
      */}
      {result && result.message !== latest?.run.failure ? (
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
        <div className="space-y-1.5">
          <p className="text-xs text-ink-soft">
            Proposes the transfer mechanism and sub-processors named in the files below.
            Nothing it proposes is recorded until you accept it.
          </p>
          {readable.length > 0 ? (
            <ul className="space-y-0.5">
              {readable.map((file) => (
                <li key={`${file.where}:${file.name}`} className="font-mono text-[11px] text-ink-soft">
                  {file.name} <span className="font-sans">— on {file.where}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-soft">
              Nothing to read yet. Attach the signed agreement above, or move a file
              already held against the third party onto this agreement.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="font-mono text-[11px] text-ink-soft">
            {latest.run.model} · {day(latest.run.createdAt)} · {latest.run.requestedByLabel} ·{" "}
            read {latest.run.sources.map((s) => s.name).join(", ") || "nothing"}
          </p>

          {/*
            Shapes, never content. Enough to tell a request that was too big
            from an answer that was cut off from one that was never JSON —
            which is the distinction the first three failure reports needed and
            could not make.
          */}
          {Object.keys(latest.run.diagnostics).length > 0 ? (
            <p className="font-mono text-[11px] text-ink-soft">
              {[
                latest.run.diagnostics.ms !== undefined
                  ? `${(latest.run.diagnostics.ms / 1000).toFixed(1)}s`
                  : null,
                latest.run.diagnostics.promptChars !== undefined
                  ? `sent ${latest.run.diagnostics.promptChars.toLocaleString("en-GB")} chars`
                  : null,
                latest.run.diagnostics.replyChars
                  ? `back ${latest.run.diagnostics.replyChars.toLocaleString("en-GB")}`
                  : null,
                latest.run.diagnostics.stopReason
                  ? `stopped: ${latest.run.diagnostics.stopReason}`
                  : null,
                latest.run.diagnostics.droppedCitations
                  ? `${latest.run.diagnostics.droppedCitations} unciteable, dropped`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}

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
