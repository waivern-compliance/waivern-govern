"use client";

import { useActionState } from "react";
import { ACCEPTED, MAX_BYTES } from "@/lib/documents/limits";
import type { StoredDocument } from "@/services/documents";
import {
  removeDocumentAction,
  uploadDocumentsAction,
  type UploadResult,
} from "@/app/app/third-parties/documentActions";

const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/**
 * Files on a record, and a way to add more.
 *
 * Several at a time: an arrangement is often a master agreement, a processing
 * schedule and a sub-processor annexe, and uploading them one at a time is how
 * two of the three go missing.
 */
export function Attachments({
  subjectType,
  subjectId,
  entityId,
  revalidate,
  documents,
  mayEdit,
  what,
}: {
  subjectType: StoredDocument["subjectType"];
  subjectId: string;
  entityId: string | null;
  revalidate: string;
  documents: Array<StoredDocument & { uploaderEmail: string | null }>;
  mayEdit: boolean;
  /** What these are, in the words of the record they hang off. */
  what: string;
}) {
  const [result, action, pending] = useActionState<UploadResult, FormData>(
    uploadDocumentsAction.bind(null, { subjectType, subjectId, entityId, revalidate }),
    null,
  );

  return (
    <div className="space-y-2.5">
      {documents.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-ground">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2">
              <span className="space-y-0.5">
                <a
                  href={`/api/documents/${d.id}`}
                  className="text-sm font-medium text-brand hover:underline"
                >
                  {d.filename}
                </a>
                {d.description ? (
                  <span className="block text-xs text-ink-soft">{d.description}</span>
                ) : null}
                <span className="block font-mono text-[11px] text-ink-soft">
                  {size(d.byteSize)} · {d.uploaderEmail ?? d.uploadedByLabel} ·{" "}
                  {d.uploadedAt.toISOString().slice(0, 10)} · sha256 {d.sha256.slice(0, 12)}…
                </span>
              </span>
              {mayEdit ? (
                <form action={removeDocumentAction.bind(null, d.id, revalidate)}>
                  <button
                    type="submit"
                    className="text-xs text-ink-soft underline hover:text-red-900"
                  >
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-soft">No {what} attached.</p>
      )}

      {mayEdit ? (
        <form action={action} className="space-y-2 rounded border border-dashed border-line p-3">
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
              Attach {what}
              <span className="block font-normal normal-case tracking-normal">
                Several at once. Up to {MAX_BYTES / 1024 / 1024}MB each —{" "}
                {[...new Set(ACCEPTED.values())].join(", ")}.
              </span>
            </span>
            <input
              type="file"
              name="files"
              multiple
              required
              accept={[...ACCEPTED.keys()].join(",")}
              className="w-full text-xs file:mr-3 file:rounded file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs"
            />
          </label>
          <input
            name="description"
            placeholder="What these are, if it is not obvious from the filename"
            className="w-full rounded border border-line bg-ground px-3 py-1.5 text-xs"
          />
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
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-line px-3 py-1.5 text-xs font-medium hover:bg-ground disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-brand"
          >
            {pending ? "Uploading…" : "Attach"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
