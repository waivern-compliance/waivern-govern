import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { memberships, processingActivities, users } from "@/db/schema";
import { EditForm } from "@/components/EditForm";
import { NotPermitted } from "@/components/NotPermitted";
import { RequestClock } from "@/components/dsr/RequestClock";
import {
  JURISDICTION_LABEL,
  PROCESSING_BASIS_LABEL,
  REFUSAL_MUST_SAY,
  RESTRICT_WHILE_WEIGHED,
  RIGHTS,
  basisSuggestedBy,
  type ProcessingBasis,
  type Right,
} from "@/lib/dsr/statutory";
import { can } from "@/lib/rbac";
import { savedKey } from "@/lib/saved-key";
import { getActiveSession } from "@/lib/session";
import { complaintsAboutRequest } from "@/services/complaints";
import { loadRequest } from "@/services/data-subject-requests";
import { ActionForm } from "../ActionForm";
import { ADM_SAFEGUARDS, ADM_SAFEGUARD_KEYS, describeAdm } from "@/lib/gdpr/automated-decisions";
import { describeBases } from "@/lib/gdpr/lawful-basis";
import { RequestDecisionForm } from "../RequestDecisionForm";
import { closeRequestAction, identityAction, passToControllerAction, respondAction, updateRequestAction } from "../actions";
import { CHANNEL_LABEL, ChannelSelect, Label, RightsField, inputClass, stamp } from "../fields";
import { Scope } from "./Scope";
import {
  PART3_REFUSAL_MUST_SAY,
  RESTRICTION_GROUNDS,
  RESTRICTION_PROVISIONS,
  type Part3Restriction,
} from "@/lib/dpa2018/part3-rights";
import {
  APPROPRIATE_PROFESSIONAL,
  EXEMPTIONS,
  EXPECTATION_LIMBS,
  REQUESTER_CAPACITIES,
  isExemption,
  opinionInPeriod,
  type ExemptionDetail,
  type HealthOpinion,
} from "@/lib/dpa2018/exemptions";

const OUTCOME_LABEL: Record<string, string> = {
  done: "done",
  complied: "complied",
  partly: "partly",
  refused: "refused",
  not_applicable: "not applicable",
};

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");

  const loaded = await loadRequest(id, active.membership.organisationId);
  if (!loaded) notFound();
  const { request, entityName, decisions, clock, extended, ownerEmail, scope, competentAuthority } = loaded;
  const part3 = request.regime === "dpa_part3";

  if (!can(active.membership.grants, "dsr.handle", request.entityId)) {
    return (
      <NotPermitted
        what={`${request.reference} is a request from a data subject, and`}
        organisationName={active.membership.organisationName}
      />
    );
  }

  const open = !request.respondedAt && !request.closedAt;
  const now = new Date();
  const opinions = decisions
    .filter((d) => d.kind === "health_opinion")
    .map((d) => {
      const o = d.detail as HealthOpinion;
      return {
        id: d.id,
        label: `${o.professionalRole}, ${o.givenOn}: test ${o.testMet ? "met" : "not met"}`,
        usable: o.testMet && opinionInPeriod(o, now),
        disclose: !o.testMet && opinionInPeriod(o, now),
      };
    });
  const complaints = await complaintsAboutRequest(request.id, active.membership.organisationId);
  const colleagues = await scoped(active.membership.organisationId, () => db
    .select({ id: users.id, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organisationId, active.membership.organisationId))
    .orderBy(asc(users.email)));

  // The activities in scope, for an objection to be decided against each.
  const activityIds = scope.flatMap((e) => (e.processingActivityId ? [e.processingActivityId] : []));
  const scopedActivities = activityIds.length
    ? await scoped(active.membership.organisationId, () => db
        .select()
        .from(processingActivities)
        .where(
          and(
            eq(processingActivities.organisationId, active.membership.organisationId),
            inArray(processingActivities.id, activityIds),
          ),
        )
        .orderBy(asc(processingActivities.reference)))
    : [];
  const activityLabel = new Map(scopedActivities.map((a) => [a.id, `${a.reference} ${a.name}`]));
  const objectionPending = request.rights.includes("objection") && !decisions.some((d) => d.kind === "objection");
  const automatedAsked = request.rights.includes("automated_decision");

  return (
    <main className="mx-auto max-w-3xl space-y-9 px-6 py-12">
      <header className="space-y-3 border-b border-line pb-6">
        <Link href="/app/requests" className="text-xs text-ink-soft hover:text-brand">
          ← Data subject requests
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-sm text-ink-soft">{request.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {request.rights.map((r) => RIGHTS[r as Right]?.label ?? r).join(", ")}
          </h1>
        </div>
        <p className="text-xs text-ink-soft">
          {entityName} · {request.controllerRole.replace(/_/g, " ")} · {request.status.replace(/_/g, " ")} ·{" "}
          {part3 ? "law enforcement processing (Part 3)" : JURISDICTION_LABEL[request.jurisdiction]}
          {extended ? " · extended" : ""}
          {ownerEmail ? ` · handled by ${ownerEmail}` : " · nobody handling it yet"}
        </p>
        <p className="text-xs text-ink-soft">
          From {request.requesterName}
          {request.representative ? `, through ${request.representative}` : ""} · received {stamp(request.receivedAt)} by{" "}
          {CHANNEL_LABEL[request.channel]?.toLowerCase() ?? request.channel}
        </p>
        <RequestClock clock={clock} />
        {request.controllerRole === "processor" && !request.passedToControllerAt ? (
          <p className="max-w-prose rounded border border-amber-700 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            You are the processor. Article 28(3)(e): pass the request to the
            controller without delay and help them answer it — do not answer
            the person yourself unless the controller has told you to.
          </p>
        ) : null}
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">What was asked</h2>
        <p className="max-w-prose whitespace-pre-line text-sm">{request.description}</p>
        <ul className="space-y-1.5">
          {request.rights.map((r) => {
            const right = RIGHTS[r as Right];
            return right ? (
              <li key={r} className="rounded border border-line bg-surface px-3 py-2 text-xs">
                <span className="font-medium">{right.label}</span>{" "}
                <span className="font-mono text-ink-soft">{right.article}</span> — {right.summary}
              </li>
            ) : null;
          })}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Identity</h2>
        <p className="max-w-prose text-sm text-ink-soft">
          {request.identityVerifiedAt
            ? `Confirmed ${stamp(request.identityVerifiedAt)}: ${request.identityMethod}.`
            : request.identityRequestedAt
              ? `Proof asked for ${stamp(request.identityRequestedAt)}. The month starts when it arrives.`
              : request.identityMethod
                ? `Not in doubt: ${request.identityMethod}.`
                : "Not asked for, so the month has run from receipt. Ask only where there is reasonable doubt about who is asking (Article 12(6)); the month then waits for the answer."}
        </p>
        {open ? (
          <ActionForm action={identityAction.bind(null, request.id)} submit="Record">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="What happened" />
                <select name="step" defaultValue={request.identityRequestedAt ? "verified" : "requested"} className={inputClass}>
                  <option value="requested">We asked for proof of identity</option>
                  <option value="verified">Identity confirmed</option>
                </select>
              </label>
              <label className="block space-y-1">
                <Label text="When" hint="Leave blank for now." />
                <input name="at" type="datetime-local" className={inputClass} />
              </label>
            </div>
            <label className="block space-y-1">
              <Label text="How it was checked" hint="The method, never the document: “matched account email and postcode”." />
              <input name="method" className={inputClass} />
            </label>
          </ActionForm>
        ) : null}
      </section>

      {request.controllerRole === "processor" ? (
        request.passedToControllerAt ? (
          <section className="space-y-1 rounded border border-line bg-surface p-5">
            <h2 className="text-sm font-semibold">
              Passed to {request.controllerName} {stamp(request.passedToControllerAt)}
            </h2>
            {request.assistanceSummary ? (
              <p className="max-w-prose text-sm">{request.assistanceSummary}</p>
            ) : null}
            <p className="text-xs text-ink-soft">The controller answers the person. This request can be closed.</p>
          </section>
        ) : !request.closedAt ? (
          <ActionForm action={passToControllerAction.bind(null, request.id)} submit="Record the hand-over">
            <h2 className="text-sm font-semibold">Pass it to the controller</h2>
            <p className="max-w-prose text-xs text-ink-soft">
              Article 28(3)(e). Check the data processing agreement for how
              quickly, and to whom.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <Label text="Controller" />
                <input name="controllerName" required className={inputClass} />
              </label>
              <label className="block space-y-1">
                <Label text="When" hint="Leave blank for now." />
                <input name="at" type="datetime-local" className={inputClass} />
              </label>
            </div>
            <label className="block space-y-1">
              <Label text="Help given" hint="Data extracted, records searched, anything the controller asked for." />
              <textarea name="assistance" rows={2} className={inputClass} />
            </label>
          </ActionForm>
        ) : null
      ) : null}

      <Scope request={request} scope={scope} decisions={decisions} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Decisions ({decisions.length})</h2>
        <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
          {decisions.map((d) => (
            <li key={d.id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-medium">
                  {d.kind.replace(/_/g, " ")}
                  {d.outcome !== "done" ? ` — ${OUTCOME_LABEL[d.outcome]}` : ""}
                  {d.right && request.rights.length > 1 ? ` (${RIGHTS[d.right as Right]?.label ?? d.right})` : ""}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">{d.statutoryBasis ?? "no provision cited"}</span>
              </div>
              {d.processingActivityId ? (
                <p className="text-xs text-ink-soft">
                  About {activityLabel.get(d.processingActivityId) ?? "a processing activity no longer in scope"}
                </p>
              ) : null}
              {d.processingBasis ? (
                <p className="text-xs text-ink-soft">
                  Processing relies on {PROCESSING_BASIS_LABEL[d.processingBasis as ProcessingBasis]?.toLowerCase() ?? d.processingBasis}
                </p>
              ) : null}
              <DecisionDetail kind={d.kind} exemption={d.exemption} detail={d.detail} opinions={opinions} />
              <p className="max-w-prose text-sm">{d.rationale}</p>
              <p className="font-mono text-[11px] text-ink-soft">
                {d.decidedByEmail ?? d.decidedByLabel} · {stamp(d.decidedAt)}
                {Math.abs(d.effectiveAt.getTime() - d.decidedAt.getTime()) > 60_000 ? ` · took effect ${stamp(d.effectiveAt)}` : ""}
              </p>
            </li>
          ))}
          {decisions.length === 0 ? (
            <li className="px-4 py-5 text-sm text-ink-soft">
              Nothing decided yet. Work out where their data is held, and what
              each right asks of you.
            </li>
          ) : null}
        </ul>
      </section>

      {objectionPending && !request.closedAt ? (
        <p className="max-w-prose rounded border border-line bg-surface px-3 py-2 text-xs text-ink-soft">
          {RESTRICT_WHILE_WEIGHED}{" "}
          {request.rights.includes("restriction")
            ? "They have asked for it, so restrict now and record that as a decision."
            : "Consider offering it, or restricting anyway while you decide."}
        </p>
      ) : null}

      {automatedAsked ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Automated decisions in scope</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            Article 22C: where a significant decision about them was taken solely by automated means, they are
            entitled to information about it, to make representations, to obtain human intervention and to contest
            it. What each activity in scope records:
          </p>
          {scopedActivities.length === 0 ? (
            <p className="text-xs text-ink-soft">No processing activity in scope yet.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface text-sm">
              {scopedActivities.map((a) => (
                <li key={a.id} className="space-y-1 px-4 py-3">
                  <Link href={`/app/ropa/${a.id}`} className="hover:text-brand">
                    <span className="font-mono text-xs text-ink-soft">{a.reference}</span> {a.name}
                  </Link>
                  <p className="text-xs text-ink-soft">{describeAdm(a)}</p>
                  {a.automatedDecisions ? (
                    <ul className="text-xs text-ink-soft">
                      {ADM_SAFEGUARD_KEYS.map((k) => (
                        <li key={k}>
                          {a.admSafeguards?.[k]?.confirmed ? "✓" : "✗"} {ADM_SAFEGUARDS[k].label}
                          {a.admSafeguards?.[k]?.note ? ` — ${a.admSafeguards[k]!.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!request.closedAt && !part3 && request.rights.includes("access") ? (
        <p className="max-w-prose rounded border border-line bg-ground px-3 py-2 text-xs text-ink-soft">
          Health data: a controller that is not a health professional may disclose health data the person has not
          already seen only on the appropriate health professional&apos;s opinion, from the last six months, that
          the serious harm test is not met (Data Protection Act 2018 Schedule 3 paragraph 6).{" "}
          {opinions.some((o) => o.disclose)
            ? "This request has one."
            : "Record it here as a health professional's opinion if the answer includes health data."}
        </p>
      ) : null}

      {!request.closedAt ? (
        <RequestDecisionForm
          requestId={request.id}
          rights={request.rights}
          part3={part3}
          opinions={opinions}
          activities={scopedActivities.map((a) => ({
            id: a.id,
            label: `${a.reference} ${a.name}`,
            lawfulBasis: describeBases(a.lawfulBases ?? []) || a.lawfulBasis,
            suggested: basisSuggestedBy(a),
          }))}
        />
      ) : null}

      {request.respondedAt ? (
        <section className="space-y-1 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">
            {request.status === "refused" ? "Refused" : "Responded"} {stamp(request.respondedAt)} by{" "}
            {CHANNEL_LABEL[request.responseChannel ?? ""]?.toLowerCase() ?? request.responseChannel}
          </h2>
          <p className="max-w-prose text-sm">{request.responseSummary}</p>
          {request.responseLink ? (
            <a href={request.responseLink} className="text-xs text-brand underline" rel="noreferrer" target="_blank">
              The response, where it is kept
            </a>
          ) : null}
          {request.toldOfComplaintRight ? (
            <p className="text-xs text-ink-soft">Told they may complain to the supervisory authority and seek a judicial remedy.</p>
          ) : null}
          {request.lateReason ? (
            <p className="max-w-prose text-xs text-amber-900">Late because: {request.lateReason}</p>
          ) : null}
        </section>
      ) : open ? (
        <ActionForm action={respondAction.bind(null, request.id)} submit="Record the response">
          <h2 className="text-sm font-semibold">Record the response</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            Write it in whatever you use for letters; record here what was sent
            and, if you can, link to it. Anything short of doing everything
            asked must say why — {part3 ? PART3_REFUSAL_MUST_SAY : REFUSAL_MUST_SAY}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <Label text="Outcome" />
              <select name="outcome" defaultValue="complied" className={inputClass}>
                <option value="complied">Did what was asked</option>
                <option value="partly">Partly</option>
                <option value="refused">Refused</option>
              </select>
            </label>
            <label className="block space-y-1">
              <Label text="Sent by" />
              <ChannelSelect defaultValue={request.channel === "via_processor" ? "email" : request.channel} />
            </label>
            <label className="block space-y-1">
              <Label text="When" hint="Leave blank for now." />
              <input name="respondedAt" type="datetime-local" className={inputClass} />
            </label>
          </div>
          <label className="block space-y-1">
            <Label text="What was sent" hint="A sentence or two: what was provided, done or withheld." />
            <textarea name="summary" required rows={2} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="Where the response is kept" hint="Optional link, to wherever the letter or pack lives." />
            <input name="link" type="url" placeholder="https://" className={inputClass} />
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" name="toldOfComplaintRight" className="mt-1 accent-brand" />
            <span>It told them they may complain to the supervisory authority and seek a judicial remedy</span>
          </label>
          {clock.state === "overdue" ? (
            <label className="block space-y-1">
              <Label text="Why it was late" hint="Required: the deadline has passed." />
              <textarea name="lateReason" rows={2} className={inputClass} />
            </label>
          ) : null}
        </ActionForm>
      ) : null}

      {!request.closedAt ? (
        <ActionForm action={closeRequestAction.bind(null, request.id)} submit="Close the request">
          <h2 className="text-sm font-semibold">Close</h2>
          <p className="max-w-prose text-xs text-ink-soft">
            {request.respondedAt
              ? "Once anything that followed the response is done — corrections made, recipients told."
              : "An unanswered request can only be closed if the person withdrew it, or never confirmed who they were after you reasonably asked."}
          </p>
          <label className="block space-y-1">
            <Label text="Why" />
            <textarea name="rationale" required rows={2} className={inputClass} />
          </label>
          {!request.respondedAt ? (
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="withdrawn" className="mt-1 accent-brand" />
              <span>They withdrew it</span>
            </label>
          ) : null}
        </ActionForm>
      ) : (
        <section className="space-y-1 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">
            {request.status === "withdrawn" ? "Withdrawn" : "Closed"} {stamp(request.closedAt)}
          </h2>
          <p className="max-w-prose text-sm text-ink-soft">{request.closureRationale}</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Complaints about this request ({complaints.length})</h2>
        {complaints.length > 0 ? (
          <ul className="divide-y divide-line overflow-hidden rounded border border-line bg-surface">
            {complaints.map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
                <Link href={`/app/complaints/${c.id}`} className="font-mono text-xs text-brand underline">
                  {c.reference}
                </Link>
                <span className="font-mono text-[11px] text-ink-soft">
                  received {c.receivedAt.toISOString().slice(0, 10)} · {c.status.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="max-w-prose text-xs text-ink-soft">
          If the person complains to you about how this request was handled, record it as a
          complaint: the 30 days to acknowledge it run separately from this request&apos;s month.{" "}
          <Link href={`/app/complaints?request=${request.id}`} className="text-brand underline">
            Record a complaint about this request
          </Link>
        </p>
      </section>

      <EditForm
        key={savedKey(request)}
        action={updateRequestAction.bind(null, request.id)}
        className="space-y-4 rounded border border-line bg-surface p-5"
      >
        <h2 className="text-sm font-semibold">The record</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label text="Who is asking" />
            <input name="requesterName" defaultValue={request.requesterName} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="How to reach them" />
            <input name="requesterContact" defaultValue={request.requesterContact ?? ""} className={inputClass} />
          </label>
        </div>
        <label className="block space-y-1">
          <Label text="What they asked for" />
          <textarea name="description" rows={3} defaultValue={request.description} className={inputClass} />
        </label>
        <RightsField selected={request.rights} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Label text="Acting for them" />
            <input name="representative" defaultValue={request.representative ?? ""} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="Their authority to act checked?" />
            <select
              name="representativeAuthorityChecked"
              defaultValue={request.representativeAuthorityChecked === null ? "" : request.representativeAuthorityChecked ? "yes" : "no"}
              className={inputClass}
            >
              <option value="">Not applicable or not yet</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        <label className="block space-y-1">
          <Label text="Who they are to you" hint="Customer, employee, applicant — one per line. Decides where to look." />
          <textarea name="subjectCategories" rows={2} defaultValue={request.subjectCategories.join("\n")} className={inputClass} />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <Label text="Arrived by" />
            <ChannelSelect defaultValue={request.channel} />
          </label>
          {competentAuthority || part3 ? (
            <label className="block space-y-1 sm:col-span-3">
              <Label text="Regime" hint="Part 3 of the Data Protection Act 2018 for law enforcement processing by a competent authority." />
              <select name="regime" defaultValue={request.regime} className={inputClass}>
                <option value="uk_gdpr">UK GDPR</option>
                <option value="dpa_part3">Law enforcement processing (Part 3)</option>
              </select>
            </label>
          ) : null}
          <label className="block space-y-1">
            <Label text="Your role" />
            <select name="controllerRole" defaultValue={request.controllerRole} className={inputClass}>
              <option value="controller">Controller</option>
              <option value="joint_controller">Joint controller</option>
              <option value="processor">Processor</option>
            </select>
          </label>
          <label className="block space-y-1">
            <Label text="Handled by" />
            <select name="ownerId" defaultValue={request.ownerId ?? ""} className={inputClass}>
              <option value="">Nobody yet</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>{c.email}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="max-w-prose text-xs text-ink-soft">
          When it arrived and the law it is handled under are not editable:
          they set the deadline, and changing them afterwards would rewrite it.
        </p>
        <button
          type="submit"
          className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Save the record
        </button>
      </EditForm>
    </main>
  );
}

/** What a Schedule 2 or 3 paragraph asked to be recorded, as it was. */
function DecisionDetail({
  kind,
  exemption,
  detail,
  opinions,
}: {
  kind: string;
  exemption: string | null;
  detail: unknown;
  opinions: Array<{ id: string; label: string }>;
}) {
  if (kind === "health_opinion") {
    const o = detail as HealthOpinion;
    return (
      <p className="text-xs text-ink-soft">
        {o.professionalRole}, given {o.givenOn} — {APPROPRIATE_PROFESSIONAL[o.appropriate]}. Serious harm test{" "}
        {o.testMet ? "met" : "not met"}.
      </p>
    );
  }
  if (kind === "part3_restriction") {
    const r = detail as Part3Restriction;
    return (
      <p className="text-xs text-ink-soft">
        {RESTRICTION_PROVISIONS[r.provision]}
        {r.grounds.length > 0 ? `: ${r.grounds.map((g) => RESTRICTION_GROUNDS[g].toLowerCase()).join("; ")}` : ""}.{" "}
        {r.provision === "s78a" ? (r.certificate ? `Certificate: ${r.certificate}. ` : "No s.79 certificate recorded. ") : ""}
        {r.personTold ? "The person was told, with the reasons." : `Not told: ${r.notToldReason}`}
      </p>
    );
  }
  if (kind !== "exemption" || !isExemption(exemption)) return null;
  const d = detail as ExemptionDetail;
  const lines: string[] = [`${EXEMPTIONS[exemption].label}.`];
  if (d.secretaryOfState) {
    lines.push(
      "Substantial risk of prejudice, outweighing the risk to the person, necessary and proportionate (para 4A(4)).",
      `Considered: ${d.vulnerability}`,
      d.personTold ? "The person was told (para 4B(2))." : `Not told: ${d.notToldReason}`,
    );
  }
  if (d.controllerIsHealthProfessional === true) lines.push("Decided by a health professional.");
  if (d.controllerIsHealthProfessional === false) {
    lines.push(
      `On the opinion of ${opinions.find((o) => o.id === d.opinionDecisionId)?.label ?? "a health professional"}.`,
      `Not reasonable to consult again: ${d.reconsultNotReasonable}`,
    );
  }
  if (d.requesterCapacity) lines.push(`Asked by someone who ${REQUESTER_CAPACITIES[d.requesterCapacity].charAt(0).toLowerCase()}${REQUESTER_CAPACITIES[d.requesterCapacity].slice(1)}.`);
  if (d.expectation) lines.push(EXPECTATION_LIMBS[d.expectation]);
  return <p className="text-xs text-ink-soft">{lines.join(" ")}</p>;
}
