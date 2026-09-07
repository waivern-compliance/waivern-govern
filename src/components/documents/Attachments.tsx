"use client";

import { useActionState } from "react";
import { ACCEPTED, MAX_BYTES } from "@/lib/documents/limits";
import type { StoredDocument } from "@/services/documents";
import {
  moveDocumentAction,
  removeDocumentAction,
  uploadDocumentsAction,
  type UploadResult,
} from "@/app/app/third-parties/documentActions";

/** Somewhere else on this third party a file could belong instead. */
export type MoveTarget = { value: string; label: string; current: boolean };

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
  moveTargets = [],
}: {
  subjectType: StoredDocument["subjectType"];
  subjectId: string;
  entityId: string | null;
  revalidate: string;
  documents: Array<StoredDocument & { uploaderEmail: string | null }>;
  mayEdit: boolean;
  /** What these are, in the words of the record they hang off. */
  what: string;
  /**
   * Where else this file could live. Offered because people attach the signed
   * contract wherever the upload box happens to be, and an agreement reading
   * "nothing attached" while the contract sits below it is worse than useless.
   */
  moveTargets?: MoveTarget[];
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
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {moveTargets.length > 1 ? (
                    <form
                      action={moveDocumentAction.bind(null, d.id, revalidate)}
                      className="flex items-center gap-1.5"
                    >
                      <label className="text-[11px] text-ink-soft">
                        Belongs to
                        <select
                          name="target"
                          defaultValue={moveTargets.find((t) => t.current)?.value}
                          className="ml-1.5 max-w-[16rem] rounded border border-line bg-surface px-1.5 py-0.5 text-[11px]"
                        >
                          {moveTargets.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="text-[11px] text-brand underline">
                        Move
                      </button>
                    </form>
                  ) : null}
                  <form action={removeDocumentAction.bind(null, d.id, revalidate)}>
                    <button
                      type="submit"
                      className="text-xs text-ink-soft underline hover:text-red-900"
                    >
                      Remove
                    </button>
                  </form>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-soft">Nothing attached here yet — {what}.</p>
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
