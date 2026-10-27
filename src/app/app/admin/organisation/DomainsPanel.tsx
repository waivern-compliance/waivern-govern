"use client";

import { useRefusableAction } from "@/lib/use-refusable-action";
import {
  claimDomainAction,
  removeDomainAction,
  verifyDomainAction,
  type AdminResult,
} from "../actions";

type Claim = {
  id: string;
  domain: string;
  verifiedAt: string | null;
  recordName: string;
  recordValue: string;
};

function Outcome({ result }: { result: AdminResult }) {
  if (!result) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={`text-xs ${result.ok ? "text-emerald-800" : "text-red-800"}`}>
      {result.message}
    </p>
  );
}

/**
 * The email domains this organisation has claimed.
 *
 * A verified domain lets anyone with an address at it, which their identity
 * provider has verified, sign in and join as a contributor — the organisation's
 * front door, so it is the owner's to open. Proof is a DNS record only the
 * domain's owner can publish.
 */
export function DomainsPanel({ claims }: { claims: Claim[] }) {
  const add = useRefusableAction<AdminResult>(claimDomainAction);

  return (
    <section className="space-y-4 rounded border border-line bg-surface p-5">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Email domains</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          Once a domain is verified, anyone who signs in with Google using an address at it joins
          this organisation as a contributor, without an invitation. You can give them more from
          People. Somebody you have removed is never let back in this way, and public email
          domains such as gmail.com cannot be claimed.
        </p>
      </div>

      {claims.length > 0 ? (
        <ul className="divide-y divide-line rounded border border-line">
          {claims.map((c) => (
            <ClaimRow key={c.id} claim={c} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">No domains claimed. People join by invitation only.</p>
      )}

      <form {...add.formProps} className="flex flex-wrap items-end gap-2">
        <label className="block space-y-1">
          <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft">
            Claim a domain
          </span>
          <input
            name="domain"
            required
            placeholder="example.gov.uk"
            className="w-64 rounded border border-line bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-brand"
          />
        </label>
        <button
          type="submit"
          disabled={add.pending}
          className="rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand disabled:opacity-50"
        >
          Claim
        </button>
      </form>
      <Outcome result={add.result} />
    </section>
  );
}

function ClaimRow({ claim }: { claim: Claim }) {
  const verify = useRefusableAction<AdminResult>(verifyDomainAction.bind(null, claim.id), { resetOnSuccess: false });
  const remove = useRefusableAction<AdminResult>(removeDomainAction.bind(null, claim.id), { resetOnSuccess: false });

  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm">{claim.domain}</span>
        <span
          className={`rounded border px-2 py-0.5 font-mono text-[11px] ${
            claim.verifiedAt
              ? "border-emerald-700 bg-emerald-50 text-emerald-900"
              : "border-amber-700 bg-amber-50 text-amber-900"
          }`}
        >
          {claim.verifiedAt ? `verified ${claim.verifiedAt}` : "not yet verified"}
        </span>
      </div>

      {claim.verifiedAt ? null : (
        <div className="space-y-1 text-xs text-ink-soft">
          <p>Publish this TXT record with whoever runs the domain&rsquo;s DNS, then check it:</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded bg-ground px-3 py-2 font-mono text-[11px] text-ink">
            <dt className="text-ink-soft">Name</dt>
            <dd className="break-all">{claim.recordName}</dd>
            <dt className="text-ink-soft">Value</dt>
            <dd className="break-all">{claim.recordValue}</dd>
          </dl>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {claim.verifiedAt ? null : (
          <form {...verify.formProps}>
            <button
              type="submit"
              disabled={verify.pending}
              className="rounded border border-line bg-surface px-3 py-1.5 text-xs hover:border-brand disabled:opacity-50"
            >
              {verify.pending ? "Checking…" : "Check now"}
            </button>
          </form>
        )}
        <form {...remove.formProps}>
          <button
            type="submit"
            disabled={remove.pending}
            className="rounded border border-line bg-surface px-3 py-1.5 text-xs hover:border-red-700 disabled:opacity-50"
          >
            Remove
          </button>
        </form>
      </div>
      <Outcome result={verify.result} />
      <Outcome result={remove.result} />
    </li>
  );
}
