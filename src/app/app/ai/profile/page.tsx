import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpLink } from "@/components/help/HelpLink";
import { NotPermitted } from "@/components/NotPermitted";
import { playbookFor } from "@/lib/ai-frameworks/nist-playbook";
import { PROFILE_STATUS_LABEL, isGap, type ProfileStatus } from "@/lib/ai-frameworks/profile";
import { can, mayEditAiProfile } from "@/lib/rbac";
import { getActiveSession } from "@/lib/session";
import { nistProfile, type ProfileRow } from "@/services/ai-profile";
import { ProfileItemForm } from "./ProfileItemForm";

type View = "all" | "gaps" | "unassessed";

/** A file download, not a page, so a plain link rather than client-side navigation. */
const EXPORT = "/app/ai/profile/export";

const VIEWS: Array<{ value: View; label: string }> = [
  { value: "all", label: "All 72" },
  { value: "gaps", label: "Short of target" },
  { value: "unassessed", label: "Not assessed" },
];

const statusText = (s: ProfileStatus | null, unset: string) => (s ? PROFILE_STATUS_LABEL[s] : unset);

/**
 * The NIST AI RMF profile: for each subcategory, where the organisation stands
 * now, where it means to be, and what Govern already holds towards it.
 *
 * Available whichever framework the organisation follows. An organisation on
 * the UK set that is asked to show alignment with NIST answers it here.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const active = await getActiveSession();
  if (!active) redirect("/sign-in");
  if (!can(active.membership.grants, "record.read")) {
    return <NotPermitted what="NIST AI RMF profile" organisationName={active.membership.organisationName} />;
  }
  const mayEdit = mayEditAiProfile(active.membership.grants);
  const { view: rawView } = await searchParams;
  const view: View = rawView === "gaps" || rawView === "unassessed" ? rawView : "all";
  const shown = (r: ProfileRow) =>
    view === "gaps" ? isGap(r.current, r.target) : view === "unassessed" ? r.current === null : true;

  const profile = await nistProfile(active.membership.organisationId);
  const { tally } = profile;
  const assessed = 72 - tally.unassessed;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <header className="space-y-2 border-b border-line pb-6">
        <Link href="/app/ai" className="text-xs text-ink-soft hover:text-brand">
          ← AI register
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">NIST AI RMF profile</h1>
          <a href={EXPORT} download className="text-xs text-ink-soft hover:text-brand">
            Download as a spreadsheet ↓
          </a>
        </div>
        <p className="max-w-prose text-sm text-ink-soft">
          Where the organisation stands against each of NIST AI RMF 1.0&rsquo;s 72 subcategories, and
          where it means to be: NIST&rsquo;s current and target profiles, side by side, so the gap between
          them is what you see. The evidence under each is what Govern already holds towards it. It is
          counted, not judged; whether it meets the outcome is for you to say.
        </p>
      </header>

      <HelpLink topic="ai-profile" />

      <section className="grid gap-3 sm:grid-cols-4">
        <Tile label="Assessed" value={`${assessed} of 72`} />
        <Tile label="Achieved now" value={String(tally.achieved)} />
        <Tile label="Targets set" value={String(tally.targetsSet)} />
        <Tile label="Short of target" value={String(tally.gaps)} warn={tally.gaps > 0} />
      </section>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Which subcategories to show">
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={v.value === "all" ? "/app/ai/profile" : `/app/ai/profile?view=${v.value}`}
            aria-current={v.value === view ? "page" : undefined}
            className={`rounded border px-3 py-1.5 ${v.value === view ? "border-brand text-brand" : "border-line hover:border-brand"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {profile.functions.map((fn) => {
        const categories = fn.categories
          .map((c) => ({ ...c, rows: c.rows.filter(shown) }))
          .filter((c) => c.rows.length > 0);
        if (categories.length === 0) return null;
        return (
          <section key={fn.fn} className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
              <h2 className="text-lg font-semibold">{fn.label}</h2>
              <span className="text-xs text-ink-soft">
                {fn.tally.achieved} achieved · {fn.tally.partial} partly · {fn.tally.not_started} not started ·{" "}
                {fn.tally.unassessed} not assessed · {fn.tally.gaps} short of target
              </span>
            </div>
            <p className="max-w-prose text-sm text-ink-soft">{fn.summary}</p>

            {categories.map((c) => (
              <div key={c.category} className="space-y-2">
                <h3 className="text-sm font-medium">
                  <span className="font-mono text-xs text-ink-soft">
                    {fn.fn} {c.category}
                  </span>{" "}
                  {c.text}
                </h3>
                <ul className="divide-y divide-line rounded border border-line bg-surface">
                  {c.rows.map((r) => (
                    <Row key={r.id} row={r} mayEdit={mayEdit} />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      {tally.gaps === 0 && view === "gaps" ? (
        <p className="text-sm text-ink-soft">Nothing is short of its target.</p>
      ) : null}
    </main>
  );
}

function Tile({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded border p-4 ${warn ? "border-amber-700 bg-amber-50" : "border-line bg-surface"}`}>
      <p className="text-xs uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function Row({ row, mayEdit }: { row: ProfileRow; mayEdit: boolean }) {
  const playbook = playbookFor(row.id);
  const gap = isGap(row.current, row.target);
  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="max-w-prose text-sm">
          <span className="font-mono text-xs font-medium">{row.id}</span> {row.text}
        </p>
        {gap ? (
          <span className="rounded border border-amber-700 bg-amber-50 px-2 py-0.5 font-mono text-[11px] text-amber-900">
            short of target
          </span>
        ) : null}
      </div>

      {row.evidence.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Evidence in Govern">
          {row.evidence.map((e) => (
            <li key={e.feature} className="rounded border border-line px-2 py-0.5 text-[11px] text-ink-soft">
              {e.label} · {e.count}
            </li>
          ))}
        </ul>
      ) : null}

      {mayEdit ? (
        <ProfileItemForm code={row.id} current={row.current} target={row.target} notes={row.notes} />
      ) : (
        <p className="text-sm">
          Now: {statusText(row.current, "not assessed")} · Target: {statusText(row.target, "not set")}
          {row.notes ? <span className="block text-ink-soft">{row.notes}</span> : null}
        </p>
      )}
      {row.updatedBy ? (
        <p className="text-[11px] text-ink-soft">
          Last set by {row.updatedBy}
          {row.updatedAt ? `, ${row.updatedAt.toISOString().slice(0, 10)}` : ""}
        </p>
      ) : null}

      {playbook ? (
        <details>
          <summary className="cursor-pointer text-xs text-brand">
            What the NIST Playbook suggests ({playbook.actions.length} actions, {playbook.documentation.length} questions)
          </summary>
          <div className="grid gap-4 pt-2 text-xs text-ink-soft md:grid-cols-2">
            <div className="space-y-1">
              <p className="font-medium text-ink">Suggested actions</p>
              {playbook.actionsIntro ? <p>{playbook.actionsIntro}</p> : null}
              <ul className="list-disc space-y-1 pl-4">
                {playbook.actions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-ink">Questions to document</p>
              <ul className="list-disc space-y-1 pl-4">
                {playbook.documentation.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      ) : null}
    </li>
  );
}
