# Plan: a register for data subject requests (access, objection and the other rights)

Status: Phases 0–4 built (statutory module, register, deadlines, scope from the ROPA, Article 19,
processor hand-over, objections against activities and the LIA loop). Phase 5 not started. Written 29 October 2026.

## What is asked for

Govern records how an organisation handles a person exercising their rights under
Articles 15–22 — access (DSAR), rectification, erasure, restriction, portability,
objection, and rights around automated decisions — with the statutory clock, the
decisions taken and the reasoning behind each, the same way it already records
breaches.

## Where Govern stands

Nothing handles a request. Rights appear only as questions:

| Where rights appear today | What it is |
|---|---|
| `templates/library/lia.ts:107` | "How can they object…" (Art. 21), answered once per LIA |
| `templates/library/dpia.ts:83`, `cnil-pia.ts:135` | How rights will be supported, answered once per assessment |
| `legal-references.ts` | `eugdpr.art21`, `ukgdpr.art16`, `ukgdpr.art22`; no Art. 12, 15, 17–20 |
| Portal `dsrp` document type | The written procedure; Govern holds no record of it being followed |

What the plan reuses, all already in Govern:

- **The breach register is the pattern to copy.** `breach` plus an append-only
  `breach_decision` (kind, outcome, `statutoryBasis`, a `rationale` that is never
  optional, `dueAt`/`completedAt`, `lateReason`), and a pure `lib/breach/statutory.ts`
  that works out obligations and the clock but decides nothing. Requests need the
  same three things.
- **The sweep raises statutory deadlines as tasks.** `raiseBreachDeadlines` raises one
  `breach_deadline` task per breach, keyed on the breach and clock state, due at the
  statutory deadline. Request deadlines can work the same way, using a new task type.
- **ROPA and suppliers** (`processing_activity` with purposes, `lawful_basis`,
  retention; supplier and DPA records) tell a handler where a person's data might be
  held and who it was disclosed to. That is the search scope for an access request and
  the list of recipients to tell under Art. 19.
- **Reference counters, audit chain, retention profiles, `record_link`, `evidence`,
  nav/help/guidance registries, and `records.ts` links** all take a new record type
  without any new mechanism.
- **A precedent for restricted access:** `concern.confidential` limits who can see
  confidential AI concerns. Requests hold the requester's own personal data, and
  sometimes special category data, so access to them should be limited in the same way.

## Decisions for you before building

1. **Which law sets the clock.** The UK GDPR as amended by the Data (Use and Access)
   Act 2025 lets the clock stop while the controller waits for clarification of an
   access request. It also says searches need only be reasonable and proportionate,
   and requires a complaints route acknowledged within 30 days. The EU GDPR has none of
   these, and Govern has no jurisdiction setting. *Recommendation:* add a
   `jurisdiction` field (`uk` | `eu`) to each request, defaulting from a new
   organisation setting. The CNIL template already carries a `jurisdiction`.
   *Settled:* all the DUAA's changes to the rights came into force on 19 June 2026. A UK
   request received before then is not paused for clarification.
2. **What is kept about the requester.** *Recommendation:* store a name, a contact
   route and how their identity was checked (method, who checked, when), never a copy
   of the ID document. This keeps to data minimisation, and Govern's `evidence` table
   holds URIs rather than files anyway.
3. **Who can see requests.** *Recommendation:* a new capability, `dsr.handle`, for
   privacy admins and analysts only, rather than the general `record.write`. List and
   detail pages, and exports, check for it.
4. **Response letters.** Govern doesn't produce formatted documents, and it shouldn't
   assume where the letter is written: Word, a case-management system, an email client
   or any other tool. *Recommendation:* Govern records what was sent, when, how, a
   summary, and optionally a link to the letter wherever it lives (an `evidence` URI).
5. **A public intake form.** *Recommendation:* not in the first version. Requests are
   logged by staff from whatever channel they arrive on. A per-entity web form, built
   on the contributor-link mechanism, can come in Phase 5.

## Data model

### `data_subject_request`

| Column | Notes |
|---|---|
| `organisation_id`, `entity_id`, `reference` | `DSR-2026-001` from `reference_counters`; unique per organisation |
| `jurisdiction` | `uk` \| `eu` (decision 1) |
| `controller_role` | As on `breach`. A processor doesn't answer; under Art. 28(3)(e) it passes the request to the controller and helps |
| `rights` | jsonb list: `access`, `rectification`, `erasure`, `restriction`, `portability`, `objection`, `automated_decision`, `withdraw_consent`. One letter often invokes several |
| `channel` | email, web form, post, phone, in person, social media, via a representative, via a processor |
| `received_at` | When it arrived. This is the starting point, not when someone noticed it |
| `requester_name`, `requester_contact` | Minimal (decision 2) |
| `representative`, `authority_checked` | For a solicitor, parent or other third party acting for the person |
| `identity_status` | `not_required` \| `requested` \| `verified` \| `failed`, plus `identity_method`. Art. 12(6) only where there is reasonable doubt |
| `subject_categories` | From the ROPA vocabulary: customer, employee, applicant… These drive the search scope |
| `description` | What was asked, in the requester's terms |
| `status` | `received` → `verifying` → `in_progress` ⇄ `paused` → `responded` \| `refused` \| `withdrawn` → `closed` |
| `owner_id`, `responded_at`, `response_channel`, `response_summary`, `closed_at` | |

### `data_subject_request_decision` (append-only, the same shape as `breach_decision`)

`kind` is one of the following:

- `identity_requested`
- `clarification_requested` (pauses a UK clock)
- `clock_resumed`
- `extension` (Art. 12(3), up to two more months; the person must be told within the first month)
- `fee` or `refusal` (Art. 12(5), manifestly unfounded or excessive; the burden of showing it is on the controller)
- `exemption` (DPA 2018 Schedules 2–4, recorded per exemption relied on)
- `objection` (Art. 21)
- `erasure` (Art. 17(3) exceptions)
- `restriction`
- `portability_scope`
- `recipients_notified` (Art. 19)
- `response_sent`

Each decision carries `outcome`, `statutory_basis`, `rationale` (required), `due_at`,
`completed_at`, `late_reason`, and who decided and when. As with breaches, a decision to
refuse or not to act is kept as a record, not represented by something missing.

### `data_subject_request_scope`

One row per place searched or actioned:

- `processing_activity_id` or `supplier_id`
- `status`: `to_search` \| `not_held` \| `found` \| `actioned` \| `not_actioned`, with a
  note and who did it

When a request is recorded, it is seeded from the ROPA activities whose data subject
categories match, and from the suppliers those activities disclose to. This makes
"reasonable and proportionate search" something the handler can show, and gives the
Art. 19 recipient list.

### `lib/dsr/statutory.ts` (pure, like `lib/breach/statutory.ts`)

- **`deadlineFor({ receivedAt, clockStartsAt, pauses, extended, jurisdiction })`** works
  out the deadline using calendar-month arithmetic, following the ICO's reading:
  - the deadline is the same date in the next month;
  - if that month has no such date, it is the last day of the month;
  - if the deadline falls on a weekend or bank holiday, it moves to the next working day.

  The clock starts when the request is received or when identity is confirmed,
  whichever is later. Pauses count only for UK requests. An extension adds up to two
  months.
- **`obligationsFor(right, lawfulBasis)`** works out what each right engages:
  - portability only for consent or contract processed by automated means;
  - objection under 21(1) only for public task or legitimate interests, where the
    controller can override on compelling grounds or for legal claims;
  - objection to direct marketing under 21(2)/(3) is absolute, with no override;
  - erasure lists the 17(3) exceptions;
  - restriction under 18(1)(d) applies while an objection is being weighed.
- **`clockState`**: `running` \| `paused` \| `due_soon` \| `overdue`.

Nothing in this module decides. It only shows which options exist.

## Objection handling, specifically

- An `objection` decision is linked to the processing activities it concerns. Govern
  reads each activity's `lawful_basis`:
  - **Direct marketing:** "upheld" is the only outcome offered (Art. 21(3)), and the
    activity's scope row must reach `actioned`.
  - **Legitimate interests or public task:** "overridden" needs a rationale citing
    compelling legitimate grounds, which is checked as non-empty and audited. Govern
    suggests restricting the processing (Art. 18(1)(d)) while the objection is weighed.
  - **Consent or contract:** Govern explains that Art. 21(1) doesn't apply, and
    suggests treating the request as withdrawal of consent or another right.
- **Feedback into assessments:** each upheld or overridden objection is counted against
  the activity. A threshold the organisation sets (for example, three in a year) raises
  a `reassess` task on the activity's LIA. That makes objections evidence for the
  balancing test, not just individual cases.

## Phases

### Phase 0: the statutory module (no visible change)
`lib/dsr/statutory.ts`, with tests that pin down the edge cases:

- 31 January, so the deadline falls in February;
- a deadline landing on a bank holiday;
- a pause that crosses the end of a month;
- an extension;
- an EU request where pausing is ignored;
- every right × lawful-basis combination.

Bank holidays come from a data file (the gov.uk list), not computed. Add Art. 12,
15, 17, 18, 19, 20 and 21 for both regimes, plus DPA 2018 Sch. 2 and the DUAA
provisions, to `legal-references.ts`.

### Phase 1: the register
- **Data:** migration for the three tables and the enums; `dsr.handle` in `rbac.ts`.
- **Service:** `services/data-subject-requests.ts`, modelled on `breaches.ts`: record,
  load (assemble with clock and obligations), add decision, close.
- **Pages:** `/app/requests` list (filter by right, status, clock state) and
  `/app/requests/[id]` (clock, rights, scope checklist, decisions, response).
- **Wiring:**
  - `nav.ts`, `records.ts`, help topic and guidance step;
  - audit actions `dsr.recorded`, `dsr.decision_recorded`, `dsr.responded`, `dsr.closed`;
  - retention subject types for the three tables;
  - service functions added to `tests/tenant-isolation.test.ts`.

### Phase 2: deadlines
- **Sweep:** `raiseDsrDeadlines`, using a new statutory task type `dsr_deadline`, one task
  per request per clock state, keyed like breach deadlines. A second trigger fires 10
  days before the first-month mark while an extension is being considered, because
  the person must be told about an extension within the first month.
- **Notifications:** the existing route.
- **Dashboard:** "requests due this week" and "overdue".

### Phase 3: scope against ROPA and suppliers (built)
- Seed the scope checklist from ROPA and suppliers when a request is recorded, and again
  when its subject categories change. Matching is on subject category (singular and
  plural alike) within the request's entity; an activity's systems and recipients are
  matched to suppliers by canonical name, and listed as they are written otherwise.
- Record Art. 19 notifications to recipients, per recipient (`recipient_notice`). A
  request will not close while a recipient holding the data is unrecorded after a
  rectification, erasure or restriction was carried out.
- For processor-role requests, record when the request went to the controller and what
  help was given. Once passed on, the request can close without a response.

### Phase 4: objections (built)
- The lawful-basis-aware objection decision, now recorded against a processing activity
  (`data_subject_request_decision.processing_activity_id`, one decision per activity). The
  form suggests the basis from the activity's free-text lawful basis, and direct marketing
  from its purposes; the handler confirms it.
- Restriction while an objection is weighed: prompted, and where the person asked for it,
  refusing restriction is refused until the objection is decided (Art. 18(1)(d)).
- An upheld objection keeps the request open until the activity's scope entry is
  `actioned`.
- The per-activity objection count (upheld or overridden, one per request, rolling twelve
  months) shows on the ROPA record. Past `organisation.objection_review_threshold`
  (default 3, 0 = off) the sweep raises a `reassess` task on the activity's current LIA,
  or on the activity itself where it has none; re-raised at each multiple of the threshold.

### Phase 5: reporting and integration
- **Reporting:** timeliness metrics (on time, extended, late, by right) in `metrics.ts`,
  `trends` and the export.
- **Integration API:** change the contract in `integration-api.md` first, then build
  `GET /api/v1/export/requests-summary` (counts only, no personal data). The Portal's
  DSRP document can then state real response times.
- **Optional:** a public intake form (decision 5).

## Rough size

Similar to the breach register, which is about 570 lines of service code plus five
page files. Estimates:

| Phase | Estimate |
|---|---|
| Phase 0 | about half a day |
| Phase 1 | 2–3 days |
| Phase 2 | 1 day |
| Phase 3 | 1–2 days |
| Phase 4 | 1 day |
| Phase 5 | about 2 days, plus the intake form if wanted |

Phases 0–2 are a usable register with statutory deadlines on their own.

## Out of scope

- Writing response letters. They're written in whatever tool the organisation uses;
  Govern records that one was sent and links to it (decision 4).
- Searching the organisation's own systems for the person's data. Govern records where
  someone looked and what they found; it doesn't connect to those systems.
- Redaction tooling.
