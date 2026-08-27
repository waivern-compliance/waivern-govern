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

## Status

Phase 1 of 5 complete: tenancy, entity scoping, role-based capabilities, OIDC
sign-in and the audit chain. Phases 2–5 add the template engine, the assessment
runtime, the risk register and the workflow layer.
