"use client";

import { useActionState } from "react";
import {
  archiveDpaAction,
  restoreDpaAction,
  updateDpaAction,
  type ArchiveResult,
} from "@/app/app/third-parties/actions";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/**
 * Correcting and retiring an agreement.
 *
 * Both were missing, and their absence pushed people towards worse records: a
 * mistyped date could only be fixed by recording a second agreement, and an
 * agreement that ended early could only be expressed by editing its expiry to
 * a date that never appeared in the contract.
 */
export function AgreementAdmin({
  supplierId,
  dpa,
}: {
  supplierId: string;
  dpa: {
    id: string;
    title: string;
    documentRef: string | null;
    signedAt: Date | null;
    expiresAt: Date | null;
    transferMechanism: string | null;
    subProcessors: string[];
    archivedAt: Date | null;
    archivedReason: string | null;
  };
}) {
  const [result, archive, archiving] = useActionState<ArchiveResult, FormData>(
    archiveDpaAction.bind(null, supplierId, dpa.id),
    null,
  );

  if (dpa.archivedAt) {
    return (
      <div className="space-y-1.5 rounded border border-line bg-ground px-3 py-2">
        <p className="text-xs text-ink-soft">
          Archived {day(dpa.archivedAt)}
          {dpa.archivedReason ? ` — ${dpa.archivedReason}` : ""}. It is out of the
          in-force calculation and raises no renewal reminders, and remains here
          because the register has to be able to say what governed processing then.
        </p>
        <form action={restoreDpaAction.bind(null, supplierId, dpa.id)}>
          <button type="submit" className="text-xs text-brand underline">
            Bring it back into the register
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      <details className="w-full rounded border border-line bg-ground">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
          Edit this agreement
        </summary>
        <form
          action={updateDpaAction.bind(null, supplierId, dpa.id)}
          className="space-y-3 border-t border-line p-3"
        >
          <Field label="Title" name="title" defaultValue={dpa.title} required />
          <Field
            label="Document reference"
            name="documentRef"
            defaultValue={dpa.documentRef ?? ""}
            hint="where the signed copy lives"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Signed" name="signedAt" type="date" defaultValue={day(dpa.signedAt)} />
            <Field
              label="Expires"
              name="expiresAt"
              type="date"
              defaultValue={day(dpa.expiresAt)}
              hint="leave empty if perpetual"
            />
          </div>
          <Field
            label="Transfer mechanism"
            name="transferMechanism"
            defaultValue={dpa.transferMechanism ?? ""}
            hint="SCCs, UK Addendum, adequacy — if data leaves the UK"
          />
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
              Sub-processors
              <span className="block font-normal normal-case tracking-normal">
                Article 28(2) — one per line
              </span>
            </span>
            <textarea
              name="subProcessors"
              rows={3}
              defaultValue={(dpa.subProcessors ?? []).join("\n")}
              className="w-full rounded border border-line bg-surface px-3 py-1.5 text-xs"
            />
          </label>
          <button
            type="submit"
            className="rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-ground"
          >
            Save changes
          </button>
        </form>
      </details>

      <details className="w-full rounded border border-line bg-ground">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
          Archive this agreement
        </summary>
        <form action={archive} className="space-y-2 border-t border-line p-3">
          <p className="text-xs text-ink-soft">
            For an agreement that has ended for a reason its expiry date does not
            describe — terminated, superseded, the supplier dropped, or recorded in
            error. It stays in the record and stops counting as in force. If it is
            the only agreement, this third party will immediately report as
            uncovered, which is the point.
          </p>
          <input
            name="reason"
            required
            placeholder="Superseded by the 2026 agreement"
            className="w-full rounded border border-line bg-surface px-3 py-1.5 text-xs"
          />
          {result && !result.ok ? (
            <p role="status" className="rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {result.message}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={archiving}
            className="rounded border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-ground disabled:opacity-60"
          >
            {archiving ? "Archiving…" : "Archive it"}
          </button>
        </form>
      </details>
    </div>
  );
}

function Field({
  label,
  name,
  hint,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  hint?: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
        {label}
        {hint ? (
          <span className="block font-normal normal-case tracking-normal">{hint}</span>
        ) : null}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded border border-line bg-surface px-3 py-1.5 text-xs"
      />
    </label>
  );
}
