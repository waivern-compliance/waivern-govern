"use client";

import { useActionState, useState } from "react";
import {
  PROCESSING_BASIS_LABEL,
  RIGHTS,
  objectionTest,
  type ProcessingBasis,
  type Right,
} from "@/lib/dsr/statutory";
import { recordRequestDecisionAction, type RequestResult } from "./actions";
import { Label, inputClass } from "./fields";

type Outcome = "done" | "complied" | "partly" | "refused" | "not_applicable";

const KINDS: Array<{
  value: string;
  label: string;
  basis?: string;
  note: string;
  outcomes?: Array<[Outcome, string]>;
}> = [
  {
    value: "clarification_requested",
    label: "Asked them to clarify",
    basis: "Article 12(3), as amended by the DUAA 2025",
    note: "UK only: the month stops until they answer. Only for an access request where you hold a lot about them and genuinely need to know what they want.",
  },
  {
    value: "clarification_received",
    label: "They clarified",
    note: "The month starts running again from here.",
  },
  {
    value: "extension",
    label: "Extended the time",
    basis: "Article 12(3)",
    note: "Up to two more months, for complexity or number of requests. Tell them within the first month, with the reasons.",
  },
  {
    value: "objection",
    label: "Decided an objection",
    basis: "Article 21",
    note: "Turns on what the processing objected to relies on.",
    outcomes: [
      ["complied", "Upheld — processing stopped"],
      ["refused", "Overridden — compelling grounds, or legal claims"],
      ["not_applicable", "Article 21 does not apply"],
    ],
  },
  {
    value: "erasure",
    label: "Decided erasure",
    basis: "Article 17",
    note: "Refuse only under an Article 17(3) exception, and name it.",
    outcomes: [
      ["complied", "Erased"],
      ["partly", "Partly erased"],
      ["refused", "Kept under an exception"],
    ],
  },
  {
    value: "rectification",
    label: "Decided rectification",
    basis: "Article 16",
    note: "Correct what is inaccurate; complete what is incomplete, with a supplementary statement if need be.",
    outcomes: [["complied", "Corrected"], ["partly", "Partly corrected"], ["refused", "Not corrected — it is accurate"]],
  },
  {
    value: "restriction",
    label: "Decided restriction",
    basis: "Article 18",
    note: "Including while an objection or a dispute about accuracy is being settled.",
    outcomes: [["complied", "Restricted"], ["refused", "Not restricted"], ["not_applicable", "Not applicable"]],
  },
  {
    value: "portability",
    label: "Decided portability",
    basis: "Article 20",
    note: "Only data they provided, processed by automated means on consent or contract.",
    outcomes: [["complied", "Provided"], ["partly", "Partly provided"], ["not_applicable", "Article 20 does not apply"]],
  },
  {
    value: "automated_decision",
    label: "Decided on an automated decision",
    basis: "Article 22",
    note: "Human intervention, their point of view heard, the decision contested.",
    outcomes: [["complied", "Reviewed by a person"], ["refused", "Not reviewed"], ["not_applicable", "Not solely automated"]],
  },
  {
    value: "exemption",
    label: "Relied on an exemption",
    basis: "DPA 2018 Schedule 2",
    note: "Name the paragraph. Applied to the specific information, not the whole request.",
  },
  {
    value: "fee",
    label: "Charged a fee",
    basis: "Article 12(5)(a)",
    note: "Only where the request is manifestly unfounded or excessive, or for further copies.",
  },
  {
    value: "refusal",
    label: "Refused as unfounded or excessive",
    basis: "Article 12(5)(b)",
    note: "The burden of showing it is yours. Tell them why, and that they may complain.",
  },
  {
    value: "recipients_notified",
    label: "Told the recipients",
    basis: "Article 19",
    note: "Each recipient of data that was rectified, erased or restricted, unless impossible or disproportionate.",
  },
  {
    value: "other",
    label: "Something else",
    note: "Anything worth a record: a search made, a team asked, a call returned.",
  },
];

const BASES = Object.keys(PROCESSING_BASIS_LABEL) as ProcessingBasis[];

/**
 * Record one decision about a request, with its reasoning.
 *
 * The reasoning is required whatever the outcome. The pause and extension
 * decisions move the deadline, so they are entered here too, with when they
 * took effect, rather than as a date edited on the request.
 */
export function RequestDecisionForm({ requestId, rights }: { requestId: string; rights: string[] }) {
  const [result, action, pending] = useActionState<RequestResult, FormData>(
    recordRequestDecisionAction.bind(null, requestId),
    null,
  );
  const [kind, setKind] = useState(KINDS[0].value);
  const [basis, setBasis] = useState<ProcessingBasis>("legitimate_interests");
  const chosen = KINDS.find((k) => k.value === kind)!;
  const test = kind === "objection" ? objectionTest(basis) : null;
  // An objection offers only what Article 21 allows on that basis: upheld
  // alone for direct marketing, not applicable alone where it does not reach.
  const outcomes = chosen.outcomes?.filter(([o]) =>
    !test ? true : !test.applies ? o === "not_applicable" : test.overridable ? true : o === "complied",
  );

  return (
    <form action={action} className="space-y-3 rounded border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold">Record a decision</h2>

      <label className="block space-y-1">
        <Label text="What was decided" />
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
      </label>
      <p className="max-w-prose text-xs text-ink-soft">{chosen.note}</p>

      {kind === "objection" ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <Label text="What does the processing objected to rely on?" />
            <select
              name="processingBasis"
              value={basis}
              onChange={(e) => setBasis(e.target.value as ProcessingBasis)}
              className={inputClass}
            >
              {BASES.map((b) => (
                <option key={b} value={b}>{PROCESSING_BASIS_LABEL[b]}</option>
              ))}
            </select>
          </label>
          {test ? (
            <p
              className={`rounded border px-3 py-2 text-xs ${
                test.overridable
                  ? "border-line bg-ground text-ink-soft"
                  : "border-amber-700 bg-amber-50 text-amber-900"
              }`}
            >
              <span className="font-mono">{test.provision}</span> — {test.words}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {outcomes ? (
          <label className="block space-y-1">
            <Label text="Outcome" />
            <select name="outcome" className={inputClass} key={`${kind}-${basis}`}>
              {outcomes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="outcome" value="done" />
        )}
        {rights.length > 1 ? (
          <label className="block space-y-1">
            <Label text="Which right this decides" />
            <select name="right" className={inputClass}>
              <option value="">The request as a whole</option>
              {rights.map((r) => (
                <option key={r} value={r}>{RIGHTS[r as Right]?.label ?? r}</option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="right" value={rights[0] ?? ""} />
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <Label text="Provision relied on" hint="Edit to the exact paragraph." />
          <input
            name="statutoryBasis"
            key={`${kind}-${basis}`}
            defaultValue={test?.provision ?? chosen.basis ?? ""}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <Label text="When it took effect" hint="Leave blank for now. A pause counts from here." />
          <input name="effectiveAt" type="datetime-local" className={inputClass} />
        </label>
      </div>

      <label className="block space-y-1">
        <Label text="Why" hint="Required. The reasoning is what makes the decision defensible later." />
        <textarea name="rationale" required rows={3} className={inputClass} />
      </label>

      {result ? (
        <p
          role="alert"
          className={`rounded border px-4 py-2.5 text-sm ${
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
        className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Recording…" : "Record the decision"}
      </button>
    </form>
  );
}
