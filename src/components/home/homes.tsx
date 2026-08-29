import Link from "next/link";
import { RiskTierBadge } from "@/components/RiskTierBadge";
import { navFor } from "@/lib/nav";
import { statusWords, type Persona } from "@/lib/persona";
import { can } from "@/lib/rbac";
import type { ActiveSession } from "@/lib/session";
import { visibleEntityIds } from "@/lib/session";
import { dashboardMetrics } from "@/services/metrics";
import { Empty, Panel, Row, Rows, Tile, Tiles, dueWords } from "./parts";
import { aiEstate, myAssessments, myMitigations, myTasks, unratedRisks } from "./data";
import {
  GAP_WORDS,
  SERIOUS_GAPS,
  STAGE_LABEL,
  registerSummary,
  type LifecycleStage,
} from "@/services/ai-register";

const taskHref: Record<string, (id: string) => string> = {
  assessment: (id) => `/app/assessments/${id}`,
  risk: (id) => `/app/risks/${id}`,
  mitigation: () => "/app/risks",
};

function hrefFor(subjectType: string, subjectId: string) {
  return taskHref[subjectType]?.(subjectId) ?? "/app";
}

/** Tasks, rendered the same way wherever they appear. */
async function TaskPanel({
  active,
  title,
  hint,
  empty,
  persona,
}: {
  active: ActiveSession;
  title: string;
  hint?: string;
  empty: string;
  persona: Persona;
}) {
  const tasks = await myTasks(active);
  const mine = tasks.filter(
    (t) =>
      t.assigneeUserId === active.userId ||
      (t.assigneeRole && active.membership.grants.some((g) => g.role === t.assigneeRole)),
  );
  const shown = mine.length > 0 ? mine : tasks;

  return (
    <Panel title={title} hint={hint} action={{ href: "/app/tasks", label: "All tasks" }}>
      {shown.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <Rows>
          {shown.slice(0, 6).map((t) => {
            const due = dueWords(t.dueAt);
            return (
              <Row
                key={t.id}
                href={hrefFor(t.subjectType, t.subjectId)}
                title={t.title}
                detail={t.description}
                meta={t.breachedAt ? `overdue · ${due.text}` : due.text}
                tone={t.breachedAt ? "stop" : due.tone}
              />
            );
          })}
        </Rows>
      )}
      {persona === "product" || persona === "engineering" ? null : (
        <p className="text-xs text-ink-soft">
          {tasks.length} open across everything you can see.
        </p>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

/** Privacy governance: the programme, and what needs a person. */
export async function PrivacyHome({ active }: { active: ActiveSession }) {
  const m = await dashboardMetrics(
    active.membership.organisationId,
    visibleEntityIds(active),
  );

  return (
    <div className="space-y-10">
      <Tiles>
        <Tile
          label="Awaiting a decision"
          value={m.attention.awaitingDecision}
          note={`${m.attention.openGates} approval gate${m.attention.openGates === 1 ? "" : "s"} open`}
          href="/app/tasks"
          tone={m.attention.awaitingDecision > 0 ? "warn" : "plain"}
        />
        <Tile
          label="Overdue"
          value={m.attention.overdueTasks}
          note="past their service level"
          href="/app/tasks"
          tone={m.attention.overdueTasks > 0 ? "stop" : "plain"}
        />
        <Tile
          label="Not within appetite"
          value={m.attention.notWithinAppetite}
          note={m.unratedRisks > 0 ? `includes ${m.unratedRisks} unrated` : "residual high or critical"}
          href="/app/risks"
          tone={m.attention.notWithinAppetite > 0 ? "stop" : "plain"}
        />
        <Tile
          label="Lapsed acceptances"
          value={m.attention.lapsedAcceptances}
          note="need looking at again"
          href="/app/risks"
          tone={m.attention.lapsedAcceptances > 0 ? "warn" : "plain"}
        />
      </Tiles>

      <TaskPanel
        active={active}
        persona="privacy_governance"
        title="Waiting on you"
        empty="Nothing is waiting on you."
      />

      <QuickLinks active={active} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** AI governance: what is running, and what nobody has looked at. */
export async function AiHome({ active }: { active: ActiveSession }) {
  const [summary, estate] = await Promise.all([
    registerSummary(active.membership.organisationId, visibleEntityIds(active)),
    aiEstate(active),
  ]);

  return (
    <div className="space-y-10">
      <Tiles>
        <Tile
          label="On the register"
          value={summary.total}
          note={`${summary.live} live`}
          href="/app/ai"
        />
        <Tile
          label="Never assessed"
          value={summary.neverAssessed}
          note="nobody has looked at these"
          href="/app/ai"
          tone={summary.neverAssessed > 0 ? "stop" : "plain"}
        />
        <Tile
          label="Running unexamined"
          value={summary.serious}
          note="unassessed, unmonitored or unsupervised"
          href="/app/ai"
          tone={summary.serious > 0 ? "stop" : "plain"}
        />
        <Tile
          label="Awaiting a decision"
          value={estate.awaitingDecision}
          note="assessments with a reviewer"
          href="/app/tasks"
          tone={estate.awaitingDecision > 0 ? "warn" : "plain"}
        />
      </Tiles>

      <Panel
        title="Needs attention"
        hint="Systems with something outstanding, worst first."
        action={{ href: "/app/ai", label: "Whole register" }}
      >
        {summary.withGaps === 0 ? (
          <Empty>
            {summary.total === 0
              ? "Nothing on the register yet. Start with what you already know is running."
              : "Nothing outstanding across the register."}
          </Empty>
        ) : (
          <Rows>
            {summary.entries
              .filter((e) => e.gaps.length > 0)
              .sort((a, b) => {
                const weight = (g: typeof a.gaps) =>
                  g.filter((x) => SERIOUS_GAPS.includes(x)).length * 10 + g.length;
                return weight(b.gaps) - weight(a.gaps);
              })
              .slice(0, 8)
              .map((e) => (
                <Row
                  key={e.useCase.id}
                  href={`/app/ai/${e.useCase.id}`}
                  title={e.useCase.name}
                  detail={e.gaps.map((g) => GAP_WORDS[g]).join(" · ")}
                  meta={STAGE_LABEL[e.useCase.lifecycleStage as LifecycleStage]}
                  tone={e.gaps.some((g) => SERIOUS_GAPS.includes(g)) ? "stop" : "warn"}
                />
              ))}
          </Rows>
        )}
      </Panel>

      <TaskPanel
        active={active}
        persona="ai_governance"
        title="Waiting on you"
        empty="Nothing is waiting on you."
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Engineering: what is being asked about your services, and what you owe. */
export async function EngineeringHome({ active }: { active: ActiveSession }) {
  const controls = await myMitigations(active);

  return (
    <div className="space-y-10">
      <TaskPanel
        active={active}
        persona="engineering"
        title="Questions for you"
        hint="Someone needs an answer about a system you run."
        empty="Nothing is waiting on you right now."
      />

      <Panel
        title="Controls you own"
        hint="Things you agreed to put in place, and when they are due."
      >
        {controls.length === 0 ? (
          <Empty>You are not on the hook for any controls.</Empty>
        ) : (
          <Rows>
            {controls.map(({ mitigation, risk }) => {
              const due = dueWords(mitigation.dueAt);
              return (
                <Row
                  key={mitigation.id}
                  href={`/app/risks/${risk.id}`}
                  title={mitigation.description}
                  detail={`On ${risk.reference} — ${risk.title}`}
                  meta={`${mitigation.status.replace(/_/g, " ")} · ${due.text}`}
                  tone={due.tone}
                />
              );
            })}
          </Rows>
        )}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Product: can this ship, and what is holding it up. */
export async function ProductHome({ active }: { active: ActiveSession }) {
  const mine = await myAssessments(active);
  const open = mine.filter((r) => !["approved", "rejected", "superseded", "withdrawn"].includes(r.assessment.status));
  const cleared = mine.filter((r) => r.assessment.status === "approved").length;
  const needsYou = mine.filter((r) =>
    ["draft", "in_progress", "returned"].includes(r.assessment.status),
  ).length;

  return (
    <div className="space-y-10">
      <section className="rounded border border-line bg-surface p-5">
        <h2 className="text-base font-semibold">Starting something new?</h2>
        <p className="mt-1 max-w-prose text-sm text-ink-soft">
          A few short questions will tell you whether it needs a closer look
          before it goes live. Most things do not.
        </p>
        <Link
          href="/app/assessments"
          className="mt-3 inline-block rounded bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Check whether it needs a review
        </Link>
      </section>

      {needsYou > 0 ? (
        <div className="rounded border-l-2 border-amber-700 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-950">
            <strong>
              {needsYou} of your requests {needsYou === 1 ? "needs" : "need"} something
              from you.
            </strong>{" "}
            {needsYou === 1 ? "Nothing moves until it is finished." : "Nothing moves until they are finished."}
          </p>
        </div>
      ) : null}

      <Panel title="Your requests" hint="What you have asked for, and where it stands.">
        {mine.length === 0 ? (
          <Empty>
            You have not asked for anything yet. Start with the check above.
          </Empty>
        ) : (
          <Rows>
            {mine.slice(0, 10).map(({ assessment: a }) => (
              <Row
                key={a.id}
                href={`/app/assessments/${a.id}`}
                title={a.title}
                detail={
                  a.status === "returned"
                    ? "Sent back — see what was asked for"
                    : a.status === "in_review"
                      ? "Nothing needed from you while this is being looked at"
                      : null
                }
                meta={statusWords(a.status, "product")}
                tone={
                  a.status === "returned" ? "warn"
                  : a.status === "rejected" ? "stop"
                  : "plain"
                }
              />
            ))}
          </Rows>
        )}
        {cleared > 0 ? (
          <p className="text-xs text-ink-soft">
            {cleared} cleared and on record.
          </p>
        ) : null}
      </Panel>

      <TaskPanel
        active={active}
        persona="product"
        title="Anything else waiting on you"
        empty="Nothing else."
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function QuickLinks({ active }: { active: ActiveSession }) {
  const items = navFor(active.membership.grants).filter((i) => i.href !== "/app/tasks");
  if (items.length === 0) return null;
  return (
    <Panel title="Everything else">
      <Rows>
        {items.map((i) => (
          <Row key={i.href} href={i.href} title={i.label} detail={i.hint} />
        ))}
      </Rows>
    </Panel>
  );
}

export { QuickLinks };
