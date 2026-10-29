"use client";

import { useActionState, useState } from "react";
import type { IntakeResult } from "@/services/dsr-intake";
import { submitRequestAction } from "./actions";

const input = "w-full rounded border border-line bg-surface px-3 py-2 text-sm";

/** What each right is, in the words somebody would use to ask for it. */
const ASKS: Array<[string, string]> = [
  ["access", "A copy of the personal data you hold about me"],
  ["rectification", "Correct information about me that is wrong or incomplete"],
  ["erasure", "Delete my personal data"],
  ["objection", "Stop using my data for a particular purpose, such as marketing"],
  ["restriction", "Stop using my data for now, but keep it"],
  ["portability", "Give me my data in a form I can take elsewhere"],
  ["automated_decision", "Have a person look again at a decision made about me automatically"],
  ["withdraw_consent", "Withdraw consent I gave earlier"],
];

export function RequestForm({
  slug,
  started,
  controllerName,
  limits,
  complaintSubjects,
}: {
  slug: string;
  started: string;
  controllerName: string;
  limits: { name: number; contact: number; relationship: number; description: number };
  /** What a complaint can be about, or null where this form takes requests only. */
  complaintSubjects: Array<[string, string]> | null;
}) {
  const [result, action, pending] = useActionState<IntakeResult | null, FormData>(
    submitRequestAction.bind(null, slug),
    null,
  );
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [kind, setKind] = useState<"request" | "complaint">("request");
  const complaint = kind === "complaint";

  if (result?.ok && complaint) {
    return (
      <section role="status" className="space-y-3 rounded border border-emerald-700 bg-emerald-50 p-5 text-emerald-950">
        <h2 className="text-lg font-semibold">Your complaint has been sent</h2>
        <p className="text-sm">
          Your reference is <strong className="font-mono">{result.reference}</strong>. Keep it: quote it in
          anything you send {controllerName} about this complaint.
        </p>
        <p className="text-sm">{result.dueWords}</p>
        <p className="text-sm">
          This page does not show the progress of your complaint; they will reply to the address you gave.
          If you are not satisfied with how they deal with it, you can complain to the Information
          Commission.
        </p>
      </section>
    );
  }

  if (result?.ok) {
    return (
      <section role="status" className="space-y-3 rounded border border-emerald-700 bg-emerald-50 p-5 text-emerald-950">
        <h2 className="text-lg font-semibold">Your request has been sent</h2>
        <p className="text-sm">
          Your reference is <strong className="font-mono">{result.reference}</strong>. Keep it: quote it in
          anything you send {controllerName} about this request.
        </p>
        <p className="text-sm">{result.dueWords}</p>
        <p className="text-sm">
          The time can be extended by up to two more months for a complex request, and if they need to
          confirm who you are they will contact you — the time then runs from when you reply. This page
          does not show the progress of your request; they will reply to the address you gave.
        </p>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="started" value={started} />
      {/* Left empty by people; filled by software that fills in every field it sees. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {complaintSubjects ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What would you like to do?</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="kind" value="request" defaultChecked onChange={() => setKind("request")} className="accent-brand" />
            Make a request — for example, for a copy of my data, or to have it deleted
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="kind" value="complaint" onChange={() => setKind("complaint")} className="accent-brand" />
            Make a complaint about how my personal data has been handled
          </label>
        </fieldset>
      ) : (
        <input type="hidden" name="kind" value="request" />
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who is the {complaint ? "complaint" : "request"} for?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="forSomeoneElse" value="no" defaultChecked onChange={() => setForSomeoneElse(false)} className="accent-brand" />
          Me
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="forSomeoneElse" value="yes" onChange={() => setForSomeoneElse(true)} className="accent-brand" />
          Someone else — I am acting for them (for example as their solicitor, parent or carer)
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">{forSomeoneElse ? "Their full name" : "Your full name"}</span>
          <input name="requesterName" required maxLength={limits.name} autoComplete={forSomeoneElse ? "off" : "name"} className={input} />
        </label>
        {forSomeoneElse ? (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Your full name</span>
            <input name="representativeName" required maxLength={limits.name} autoComplete="name" className={input} />
          </label>
        ) : null}
        <label className="block space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">Where should the reply go?</span>
          <span className="block text-xs text-ink-soft">An email address or a postal address.</span>
          <input name="contact" required maxLength={limits.contact} autoComplete="email" className={input} />
        </label>
        {complaint ? (
          <label className="block space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">A reference for an earlier request <span className="font-normal text-ink-soft">(optional)</span></span>
            <span className="block text-xs text-ink-soft">If the complaint is about a request you made, the reference they gave you.</span>
            <input name="earlierReference" maxLength={60} className={input} />
          </label>
        ) : (
          <label className="block space-y-1 text-sm sm:col-span-2">
            <span className="font-medium">How {forSomeoneElse ? "do they" : "do you"} know {controllerName}? <span className="font-normal text-ink-soft">(optional)</span></span>
            <span className="block text-xs text-ink-soft">For example: customer, employee, job applicant, visitor to the website. It helps them search the right places.</span>
            <input name="relationship" maxLength={limits.relationship} className={input} />
          </label>
        )}
      </div>

      {complaint && complaintSubjects ? (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">What is the complaint about?</span>
          <select name="subject" defaultValue="other" className={input}>
            {complaintSubjects.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What are you asking for?</legend>
          <p className="text-xs text-ink-soft">Choose all that apply. If you are not sure, choose the closest and explain below.</p>
          {ASKS.map(([value, label]) => (
            <label key={value} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="rights" value={value} className="mt-1 accent-brand" />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      )}

      <label className="block space-y-1 text-sm">
        <span className="font-medium">{complaint ? "What is your complaint?" : "Tell them more"}</span>
        <span className="block text-xs text-ink-soft">
          {complaint
            ? "What happened, when, and what you would like them to do about it."
            : "What you want, and anything that helps them find it: dates, account numbers, the service you used."}
        </span>
        <textarea name="description" required rows={5} maxLength={limits.description} className={input} />
      </label>

      <p className="max-w-prose text-xs text-ink-soft">
        Do not send copies of passports or other identity documents. If {controllerName} needs to
        confirm who you are, they will contact you and say what they need. What you enter here is
        used only to handle this {complaint ? "complaint" : "request"}.
      </p>

      {result && !result.ok ? (
        <p role="alert" className="rounded border border-amber-700 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          {result.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {pending ? "Sending…" : complaint ? "Send the complaint" : "Send the request"}
      </button>
    </form>
  );
}
