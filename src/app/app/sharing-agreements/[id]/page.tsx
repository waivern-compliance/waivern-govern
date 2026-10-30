import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { db, scoped } from "@/db/client";
import { memberships, processingActivities, suppliers, users } from "@/db/schema";
import { Attachments } from "@/components/documents/Attachments";
import { EditForm } from "@/components/EditForm";
import { NotPermitted } from "@/components/NotPermitted";
import { describeArt10, describeSchedule1 } from "@/lib/dpa2018/schedule-1";
import {
  GATEWAY_KINDS,
  GATEWAY_SUGGESTIONS,
  SHARING_DIRECTIONS,
  SHARING_GAP_WORDS,
  type PartyBasis,
} from "@/lib/dpa2018/sharing";
import { describeBases } from "@/lib/gdpr/lawful-basis";
import { can } from "@/lib/rbac";
import { savedKey } from "@/lib/saved-key";
import { getActiveSession } from "@/lib/session";
import { documentsFor } from "@/services/documents";
import { loadSharingAgreement } from "@/services/sharing-agreements";
import {
  addSharingPartyAction,
  endSharingAgreementAction,
  removeSharingPartyAction,
  reviewSharingAgreementAction,
  updateSharingAgreementAction,
  updateSharingPartyAction,
} from "../actions";
import { BasisFields } from "../BasisFields";
import { Label, inputClass } from "../../requests/fields";

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const button = "rounded border border-line bg-surface px-4 py-2 text-sm hover:border-brand";

function describe(basis: PartyBasis) {
  return [
    describeBases(basis.lawfulBases) || "No lawful basis recorded",
    basis.schedule1Condition ? describeSchedule1(basis.schedule1Condition) : "",
    basis.art10Condition ? `Article 10: ${describeArt10(basis.art10Condition)}` : "",
  ].filter(Boolean).join(" · ");
}

export default async function SharingAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  const org = active.membership.organisationId;
  const loaded = await loadSharingAgreement(id, org);
  if (!loaded) notFound();
  const { agreement, entityName, ownerEmail, parties, activities, gaps } = loaded;
  if (!can(active.membership.grants, "record.read", agreement.entityId)) {
    return <NotPermitted what={`${agreement.reference} belongs to another part of the organisation, and`} organisationName={active.membership.organisationName} />;
  }
  const mayEdit = can(active.membership.grants, "record.write", agreement.entityId) && !agreement.endedAt;

  const [files, options, controllers, members] = await Promise.all([
    documentsFor(org, "sharing_agreement", agreement.id),
    scoped(org, () =>
      db
        .select({ id: processingActivities.id, reference: processingActivities.reference, name: processingActivities.name })
        .from(processingActivities)
        .where(and(eq(processingActivities.organisationId, org), eq(processingActivities.entityId, agreement.entityId)))
        .orderBy(asc(processingActivities.reference)),
    ),
    scoped(org, () =>
      db
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(and(eq(suppliers.organisationId, org), ne(suppliers.role, "processor")))
        .orderBy(asc(suppliers.name)),
    ),
    scoped(org, () =>
      db
        .select({ id: users.id, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organisationId, org))
        .orderBy(asc(users.email)),
    ),
  ]);
  const linked = new Set(activities.map((a) => a.id));
  const addable = controllers.filter((c) => !parties.some((p) => p.party.supplierId === c.id));

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/sharing-agreements" className="text-xs text-ink-soft hover:text-brand">
          ← Data sharing agreements
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="font-mono text-sm text-ink-soft">{agreement.reference}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{agreement.title}</h1>
        </div>
        <p className="text-xs text-ink-soft">
          {entityName} · {SHARING_DIRECTIONS[agreement.direction]} · {ownerEmail ?? "no owner"}
          {agreement.lastReviewedAt ? ` · last reviewed ${day(agreement.lastReviewedAt)}` : ""}
          {agreement.reviewDueAt ? ` · review due ${day(agreement.reviewDueAt)}` : ""}
        </p>
        {agreement.endedAt ? (
          <p className="text-xs">Ended {day(agreement.endedAt)}. It covers nothing now, and is kept.</p>
        ) : gaps.length > 0 ? (
          <p className="text-xs text-amber-900">{gaps.map((g) => SHARING_GAP_WORDS[g]).join(" · ")}</p>
        ) : (
          <p className="text-xs text-emerald-900">Nothing missing</p>
        )}
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">The other controllers</h2>
        {parties.length === 0 ? <p className="text-sm text-ink-soft">None named yet.</p> : null}
        {parties.map(({ party, supplierName }) => (
          <div key={party.id} className="space-y-2 rounded border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/app/third-parties/${party.supplierId}`} className="font-medium hover:text-brand">{supplierName}</Link>
              <span className="text-xs text-ink-soft">{describe(party)}</span>
            </div>
            {mayEdit ? (
              <>
                <details>
                  <summary className="cursor-pointer text-xs text-ink-soft">Their basis</summary>
                  <EditForm key={savedKey(party)} action={updateSharingPartyAction.bind(null, agreement.id, party.id)} className="mt-3 space-y-3">
                    <BasisFields basis={party} who={supplierName} />
                    <label className="block space-y-1">
                      <Label text="Note" hint="Optional. Their gateway, if it differs." />
                      <input name="note" defaultValue={party.note ?? ""} className={inputClass} />
                    </label>
                    <button type="submit" className={button}>Save</button>
                  </EditForm>
                </details>
                <EditForm action={removeSharingPartyAction.bind(null, agreement.id, party.id)}>
                  <button type="submit" className="text-xs text-red-900 hover:underline">Remove from the agreement</button>
                </EditForm>
              </>
            ) : party.note ? (
              <p className="text-xs text-ink-soft">{party.note}</p>
            ) : null}
          </div>
        ))}
        {mayEdit ? (
          addable.length > 0 ? (
            <EditForm action={addSharingPartyAction.bind(null, agreement.id)} className="flex flex-wrap items-end gap-2">
              <label className="block space-y-1">
                <Label text="Add a controller" />
                <select name="supplierId" className={inputClass}>
                  {addable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <button type="submit" className={button}>Add</button>
            </EditForm>
          ) : (
            <p className="text-xs text-ink-soft">
              Parties come from the <Link href="/app/third-parties" className="text-brand hover:underline">third-party register</Link>,
              recorded as another controller.
            </p>
          )
        ) : null}
      </section>

      {mayEdit ? (
        <EditForm key={savedKey(agreement)} action={updateSharingAgreementAction.bind(null, agreement.id)} className="space-y-4 rounded border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">The agreement</h2>
          <label className="block space-y-1">
            <Label text="Title" />
            <input name="title" defaultValue={agreement.title} className={inputClass} />
          </label>
          <label className="block space-y-1">
            <Label text="Purpose" hint="Why the data is shared." />
            <textarea name="purpose" rows={2} defaultValue={agreement.purpose ?? ""} className={inputClass} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <Label text="Which way" />
              <select name="direction" defaultValue={agreement.direction} className={inputClass}>
                {Object.entries(SHARING_DIRECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <Label text="Where the power to share comes from" />
              <select name="gatewayKind" defaultValue={agreement.gatewayKind ?? ""} className={inputClass}>
                <option value="">Not yet recorded</option>
                {Object.entries(GATEWAY_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <Label text="The gateway" hint="The enactment, or the power or function relied on. A public body needs one as well as an Article 6 basis." />
            <input name="gateway" list="gateways" defaultValue={agreement.gateway ?? ""} className={inputClass} />
            <datalist id="gateways">
              {GATEWAY_SUGGESTIONS.map((g) => <option key={g} value={g} />)}
            </datalist>
          </label>
          <label className="block space-y-1">
            <Label text="What is shared" hint="Categories of personal data, and whose." />
            <textarea name="dataShared" rows={2} defaultValue={agreement.dataShared ?? ""} className={inputClass} />
          </label>
          <BasisFields basis={agreement} who="Our" />
          <fieldset className="space-y-1.5">
            <legend><Label text="Processing activities it covers" hint={`${entityName}'s activities on the processing register.`} /></legend>
            {options.length > 0 ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {options.map((a) => (
                  <label key={a.id} className="flex items-start gap-2.5 text-sm">
                    <input type="checkbox" name="activityIds" value={a.id} defaultChecked={linked.has(a.id)} className="mt-1 accent-brand" />
                    <span><span className="font-mono text-[11px] text-ink-soft">{a.reference}</span> {a.name}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-soft">None recorded for {entityName}.</p>
            )}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <Label text="Owner" />
              <select name="ownerId" defaultValue={agreement.ownerId ?? ""} className={inputClass}>
                <option value="">Nobody yet</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.email}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <Label text="Signed" />
              <input type="date" name="signedAt" defaultValue={day(agreement.signedAt)} className={inputClass} />
            </label>
            <label className="block space-y-1">
              <Label text="Review due" />
              <input type="date" name="reviewDueAt" defaultValue={day(agreement.reviewDueAt)} className={inputClass} />
            </label>
          </div>
          <button type="submit" className="rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Save the agreement
          </button>
        </EditForm>
      ) : (
        <section className="space-y-2 rounded border border-line bg-surface p-5 text-sm">
          <p><span className="text-ink-soft">Purpose:</span> {agreement.purpose ?? "Not recorded"}</p>
          <p>
            <span className="text-ink-soft">Gateway:</span>{" "}
            {agreement.gatewayKind ? `${GATEWAY_KINDS[agreement.gatewayKind]}${agreement.gateway ? ` — ${agreement.gateway}` : ""}` : "Not recorded"}
          </p>
          <p><span className="text-ink-soft">What is shared:</span> {agreement.dataShared ?? "Not recorded"}</p>
          <p><span className="text-ink-soft">Our basis:</span> {describe(agreement)}</p>
          <p>
            <span className="text-ink-soft">Covers:</span>{" "}
            {activities.length > 0 ? activities.map((a) => `${a.reference} ${a.name}`).join(" · ") : "No processing activity"}
          </p>
        </section>
      )}

      <Attachments
        subjectType="sharing_agreement"
        subjectId={agreement.id}
        entityId={agreement.entityId}
        revalidate={`/app/sharing-agreements/${agreement.id}`}
        documents={files}
        mayEdit={mayEdit}
        what="The signed agreement"
      />

      {mayEdit ? (
        <>
          <EditForm action={reviewSharingAgreementAction.bind(null, agreement.id)} className="flex flex-wrap items-end gap-3 rounded border border-line bg-surface p-5">
            <label className="block space-y-1">
              <Label text="Reviewed today; next review due" />
              <input type="date" name="nextReviewDueAt" className={inputClass} />
            </label>
            <button type="submit" className={button}>Record the review</button>
          </EditForm>
          <EditForm action={endSharingAgreementAction.bind(null, agreement.id)} className="space-y-2 rounded border border-line bg-surface p-5">
            <label className="block space-y-1">
              <Label text="End it" hint="When the sharing stops or the agreement is replaced. It is kept, and covers nothing from then." />
              <input name="reason" placeholder="Replaced by DSA-2027-0001" className={inputClass} />
            </label>
            <button type="submit" className="rounded border border-red-800 px-4 py-2 text-sm text-red-900 hover:bg-red-50">End the agreement</button>
          </EditForm>
        </>
      ) : null}
    </main>
  );
}
