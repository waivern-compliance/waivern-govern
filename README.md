# Waivern Govern

A privacy and AI governance workflow platform. Designed against the BBC's
*Privacy and AI Governance Platform* RFI (11 August 2026) and its 46
clarification responses, and built to integrate with the Waivern Compliance
Portal at the record level.

The name is a placeholder.

## What it is, and what it deliberately is not

This is a **workflow and case-management** platform: assessments, risk
decisions, approvals, recurring governance and an audit record. It is **not** a
data discovery or content-scanning tool — the buyer was explicit that the
distinction between structured and unstructured repositories is not applicable
to this scope, that recording *categories* of personal data is sufficient, and
that discovery of unregistered AI usage is out of scope.

Discovery lives in the Waivern Compliance Portal, which feeds this platform over
a versioned API. See `docs/` for the full design.

## Running it locally

Requires Node 22, pnpm 10 and Docker.

```bash
pnpm install
cp .env.example .env.local        # then set AUTH_SECRET and TASK_LINK_SECRET
pnpm db:up                        # Postgres 16 on port 55432
pnpm db:migrate
pnpm seed
pnpm dev
```

Open http://localhost:3000. With `ALLOW_DEV_SIGN_IN=true` you can sign in as any
seeded user with no password — try `dpo@example.bbc.co.uk` for an
organisation-wide administrator, or `studios.approver@example.bbc.co.uk` for
someone scoped to a single legal entity. The build throws if that flag is ever
set alongside `NODE_ENV=production`.

| Command | What it does |
| --- | --- |
| `pnpm test` | Integration tests. Needs the local database running. |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm audit:verify` | Recomputes every organisation's audit chain and reports breaks. |
| `pnpm db:generate` | Generates a migration from schema changes. |
| `pnpm db:reset` | Drops and rebuilds the schema. Destroys all data, audit chain included. |

## A note on local performance

`node_modules` and `.next` each carry a `.metadata_never_index` marker so
Spotlight skips them. Without it, a rebuild generates enough file events to peg
`mds_stores` and starve the machine — which looks exactly like Next.js hanging,
because every build and dev server then sits at near-zero CPU waiting for I/O.
If you clone fresh and the toolchain feels wedged, check `uptime` before you
debug the app.

## Architecture notes

**Everything time-based runs off the request path.** Vercel has no long-running
worker, so reassessment cycles, reminders, SLA breach detection and outbound
sync run as durable step functions triggered by cron and by events. A route
handler writes state and emits an event; it never does work it cannot finish.

**Region pinning is deliberate.** Functions run in `lhr1` and the database in
`eu-west-2`. UK data residency is a hard expectation for the buyers this is
aimed at, and a default US region would be a straightforward disqualification.

**One assessment engine, many types.** DPIA, UK TRA, EU TIA, AI risk assessment
and screening questionnaires are all published versions of a single template
object running through a single `assessment` record. This is what makes a shared
data model and consolidated reporting real rather than asserted, and it is why
adding breach management or policy attestation later is a new template kind
rather than a new subsystem.

**The audit chain is append-only and tamper-evident.** Each event carries the
hash of its predecessor, and the database refuses `UPDATE` and `DELETE` on the
table by trigger. Appends serialise behind a row lock on the chain head, so
concurrent writers cannot fork the chain or skip a sequence number.
`verifyAuditChain` recomputes the whole chain — the same routine an auditor runs
against an export, so the client does not have to take our word for it.

**AI is advisory only.** Model output never writes to a decision field. It lands
in a suggestion record that a named human accepts or rejects, and the acceptance
is itself audited. Every suggestion biases toward escalation. Under UK GDPR
Article 35 the controller carries the assessment; a platform that lets a model
quietly set a residual risk score has moved accountability somewhere it cannot
legally sit.

**Contributors do not need accounts.** A contributor link grants access to one
assessment, optionally one section of it, and the scope is enforced at the write
rather than only reflected in what the page renders. The token is stored as a
SHA-256 hash and never in plain text. It is single-*purpose*, not
single-request: loading the page, saving and submitting are separate requests
and people come back to finish, so the link lives until it expires, is
completed, or is revoked — with every use counted and audited.

**Risk ratings are derived, never asserted.** Score is likelihood times impact
and tier is derived from score, enforced by database check constraints as well
as in code — a register where the rating and its inputs tell different stories
is worse than one with no rating at all.

**Accepting a risk is an act, not a status change.** It requires a residual
rating, a written rationale and an expiry date, it is refused to the person who
owns the risk, and it needs the approver role rather than an administrative one.
Acceptances are append-only: accepting again supersedes rather than edits, so
the register shows the succession of decisions. When one expires the risk stays
recorded as accepted and a prompt is raised — nothing overturns a person's
decision behind their back.

**Approvals are routed by what was answered, not by who started the work.** A
DPIA that scores low goes to one reviewer; the same DPIA touching special
category data, or sending data somewhere without adequacy, picks up the DPO.
Every stage of the workflow is recorded against the assessment — including the
ones whose condition did not hold, marked skipped with the reason, because a
gate that silently never appeared cannot be told apart from one somebody
removed.

**Time-based work runs on an hourly sweep.** `/api/cron/sweep` materialises
recurring schedules, raises reviews for lapsed risk acceptances, chases overdue
mitigations and records SLA breaches. Every step is idempotent — tasks and
notifications carry keys — so running it twice, or re-running after a partial
failure, converges on the same state. Nothing in the sweep changes a governance
decision; it raises tasks and a human decides.

**The dashboard counts honestly.** Numbers are derived from the records rather
than kept in a summary table, because a governance dashboard that can disagree
with the register it summarises is worse than none. A risk nobody has rated for
residual counts as *not within appetite* — an unmeasured risk is not a tolerable
one, and reporting it as fine is how a dashboard reassures an executive about
exposure nobody has looked at.

Chart colours are validated, not chosen by eye: the inherent/residual pair is
one hue in two steps (an ordinal ramp, all checks pass) and the service-level
trio uses the fixed status palette without "serious", because amber and orange
measure only 13.6 apart in normal vision and would be hard to separate side by
side. Risk tier is carried by the row label rather than by hue, and every status
mark ships a visible label and a count.

**Two systems push records in.** The Waivern Compliance Portal sends Article 30
records, suppliers, DPAs and evidence; the HAR Analyser sends scan runs. Both
authenticate with an HMAC signature over the raw body with the timestamp inside
the signed material, so a captured request cannot be replayed. Secrets are
encrypted at rest with a key held outside the database. Every record carries the
producing system's own identifier, so a nightly scan updates rather than piles
up. See [docs/integration-api.md](docs/integration-api.md).

**A scan finding never becomes a risk on its own.** The scanner's severity and
its suggestion are shown to a person and recorded for provenance; a named human
decides whether the finding belongs on the register and rates it themselves. The
audit trail keeps both, side by side, as separate facts. A scanner deciding what
constitutes a governance risk would be automation making the classification,
which is the one thing this platform must not do.

## Status

The five-phase spine is complete: tenancy and entity scoping, role-based
capabilities, OIDC sign-in, the tamper-evident audit chain, the template engine
with its shipped assessment library, the assessment runtime including no-account
contributor links, the risk register with mitigations and attested acceptance,
and the workflow layer — threshold-routed approvals, tasks, SLA breach recording
and recurring governance.

A first governance dashboard is in — attention tiles, risk posture before and
after treatment, the assessment pipeline, service levels and a per-entity table.

The integration surface is in: signed ingest for processing activities,
vendors, DPAs, evidence and scan runs, a findings queue where a person converts
an observation into a risk, and outbound webhooks carrying approvals and risk
acceptances back to subscribers.

Still to come: the RoPA and third-party risk editing surfaces, the AI workflow
graph over the link table, the maintained country risk library, exports, and
trend reporting over accumulated history.

`pnpm seed:demo` loads a plausible portfolio — fourteen assessments at every
stage, nine risks treated to varying degrees, some work already late — because a
dashboard reviewed against a single record tells you nothing about whether it
works.
