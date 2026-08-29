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

**Being up is not the same as working.** `/api/health` reports whether this
build can actually serve: whether the database answers, and whether its schema
matches the migrations this code was compiled against. Point the platform's
health check at it rather than at the port — a Next.js process binds its port
and reports ready before it has spoken to the database once, and a forgotten
migration otherwise produces a deployment that sits green while every page
fails.

## Deploying

See [docs/deploying.md](docs/deploying.md) — Railway, three services: the app,
Postgres, and a scheduled job for the sweep. Three things catch people out.
`DATABASE_URL` on the app must be a Railway service reference, not a pasted
string, or the first sign-in fails as `ECONNREFUSED`. There is no password
login, so an OIDC provider must be configured and you must grant yourself
access, or nobody can get in. And nothing time-based happens until the scheduled
job exists.

The repository contains a `vercel.json`, correct for Vercel and inert on
Railway — the region pinning and cron schedule in it do nothing there.

## Architecture notes

**Everything time-based runs off the request path.** Reassessment cycles,
reminders, service-level breach detection and outbound webhook delivery all
outlive a request, so none of them happen inside one. A route handler writes
state and stops; a scheduled job does the rest, on its own schedule, against the
database directly. That job is idempotent — running it twice, or retrying after
a partial failure, converges on the same state — which is most of what
durability buys and needs no queue to achieve.

Two ways to run it: `pnpm sweep` as a job (what the deployment uses), or
`/api/cron/sweep` behind a bearer token for a scheduler that can only make an
HTTP request. Nothing in the sweep makes a governance decision; it raises tasks
and a human decides.

**Where things run is deliberate.** The database sits in the EU rather than the
UK, because Railway has no UK region — lawful, since the EU holds UK adequacy, but a weaker claim
than UK residency and stated as such rather than glossed. A buyer who requires
the data to stay in the UK needs a London-region provider instead. Either way, a
default US region would be a straightforward disqualification.

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

**Data goes both ways.** `GET /api/v1/export/context` returns the whole
governance picture as one versioned document — approved assessments with who
signed and why, the risk register with its acceptances, Article 30 records,
suppliers and DPAs, and an evidence index whose links resolve to references
rather than internal ids. `since` gives an incremental pull, `entity` narrows to
one legal entity. Only settled facts are exported: an assessment appears once it
is approved, because generating a compliance document from unfinished work would
put an unreviewed claim into something that reads as settled.

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

**The AI register records what exists, not only what was assessed.** A register
that only holds assessed systems cannot answer the question an AI governance
lead actually has, which is what is running that nobody has looked at. So a
system can be added with no owner and no assessment — that is a reportable state,
not a validation error, and refusing to record it is how shadow AI stays
invisible. Gaps are computed rather than stored, because a gap is a fact about
the present: a system that moved into production yesterday is unmonitored today
whether or not anybody re-saved the record.

Risk facts — what consequence it has for people, what oversight is in place,
whether bias was assessed — live on the assessment and are read from it, never
copied into the register. A copy drifts from the judgement somebody signed.

**Four ways in, one set of permissions.** A membership carries a persona
alongside its roles: privacy governance, AI governance, engineering or product.
It decides what the home screen leads with and in whose words — a product
manager sees "With the privacy team" where a DPO sees "in review" — and it
decides nothing else. Roles answer what somebody may decide; personas answer how
they work, and the two are orthogonal: a privacy analyst and an AI lead hold
identical capabilities yet need different homes. Tests assert that no
authorisation path and no service ever reads a persona.

## Status

The five-phase spine is complete: tenancy and entity scoping, role-based
capabilities, OIDC sign-in, the tamper-evident audit chain, the template engine
with its shipped assessment library, the assessment runtime including no-account
contributor links, the risk register with mitigations and attested acceptance,
and the workflow layer — threshold-routed approvals, tasks, SLA breach recording
and recurring governance.

A first governance dashboard is in — attention tiles, risk posture before and
after treatment, the assessment pipeline, service levels and a per-entity table.

The integration surface is in, both directions: signed ingest for processing
activities, vendors, DPAs, evidence and scan runs; a findings queue where a
person converts an observation into a risk; signed export endpoints the Portal
can pull from incrementally; and outbound webhooks carrying approvals and risk
acceptances back to subscribers.

Still to come: the RoPA and third-party risk editing surfaces, the AI workflow
graph over the link table, the maintained country risk library, exportable
reports and audit logs, internal collaboration, and trend reporting over
accumulated history.

`pnpm seed:demo` loads a plausible portfolio — fourteen assessments at every
stage, nine risks treated to varying degrees, some work already late — because a
dashboard reviewed against a single record tells you nothing about whether it
works.
