# Plan: a register for data protection complaints

Status: decisions settled as recommended; all three phases built. Written 29 October 2026.

## What is asked for

Govern records how an organisation handles a complaint from a person about how their
personal data has been handled: when it arrived, that it was acknowledged in time,
what was looked into, how the person was kept informed and what the outcome was. It
works the same way as the data subject request register.

## The law, as checked on legislation.gov.uk

Section 103 of the Data (Use and Access) Act 2025 inserted **sections 164A and 164B**
into the Data Protection Act 2018. The duty in s.164A has been in force since
**19 June 2026** (the Act's Commencement No. 6 Regulations, S.I. 2026/82).

| Provision | What it requires |
|---|---|
| s.164A(1) | A **data subject** may complain to the controller if they think there has been an infringement of the UK GDPR, or of Part 3, relating to their personal data. The section names only the data subject; a representative acting for them is not given a right of their own. |
| s.164A(2) | The controller must **facilitate** complaints. The section gives "providing a complaint form which can be completed electronically" as an example, alongside other means. |
| s.164A(3) | The controller must **acknowledge** receipt "within the period of 30 days beginning when the complaint is received". These are calendar days, not working days and not a month. |
| s.164A(4) | **Without undue delay**, the controller must (a) take appropriate steps to respond, and (b) tell the complainant the **outcome**. No fixed period is set. |
| s.164A(5) | Appropriate steps include (a) making enquiries into the subject of the complaint, to the extent appropriate, and (b) **keeping the complainant informed of progress**. |
| s.164B | The Secretary of State may make regulations requiring controllers to report to the Commission how many complaints they received in specified periods. **No such regulations had been made** as of this plan, as far as could be found. |

Related changes made by the same section:

- Article 77 of the UK GDPR is omitted. The right to complain to the regulator is now in
  DPA 2018 s.165(2), which covers the UK GDPR as well as Parts 3 and 4.
- The regulator is now the **Information Commission**. legislation.gov.uk shows
  ss.165–166 amended from "Commissioner" to "Commission" from 30 September 2026. Govern's
  existing wording says "the supervisory authority", which is still correct.

### Reading the 30 days

"Beginning when the complaint is received" makes the day of receipt day 1. A complaint
received on 1 July must therefore be acknowledged by the end of 30 July. Govern will use
that reading, which is the earlier of the two possible ones, and say so on the page.
Weekends and bank holidays do not move the date, because the period is counted in days,
not as a month. This differs from the request clock.

### What the law does not say

- It sets no deadline for the outcome, only "without undue delay".
- It does not say how often to update the complainant on progress.
- It does not require the controller to tell the complainant they may complain to the
  Commission. It is good practice, and the Commission is likely to expect it.
- There is no EU equivalent. The EU GDPR has no duty on controllers to handle
  complaints. Article 77 there gives a right to complain to the supervisory authority only.

## Where Govern stands

Nothing records a complaint. What is already there:

- **The request register is the pattern to copy.** `data_subject_request` plus an
  append-only `data_subject_request_decision`, a pure `lib/dsr/statutory.ts` for the
  clock, `raiseDsrDeadlines` in the sweep, `requestMetrics` for timeliness, and the
  `/app/requests` pages. Complaints need a smaller version of each.
- **`dsr.handle`** already limits who can see people's own data in requests.
- **The public intake form** (`/request/[slug]`, `services/dsr-intake.ts`) is already a
  published, per-entity electronic form, which is what s.164A(2) names as its example.
- **Responses that refuse a request** already must record `toldOfComplaintRight`
  (Art. 12(4)). That right is about the regulator, not the controller, so it is a
  separate thing.
- The **AI concerns** register (`concern`) handles challenges to AI systems and
  whistleblowing. That is a different duty. A concern that turns out to be about
  personal data can be recorded again as a complaint and linked, but the two registers
  are not merged.

## Decisions (all settled as recommended, 30 October 2026)

1. **Linking to a data subject request.** Many complaints will be about a request:
   that it was late, refused or incomplete. *Recommendation:* a complaint can have an
   optional `request_id` linking it to a request in the same entity. The request page
   gets a "Record a complaint about this request" action and lists linked complaints.
   The complaint page shows the request's clock and outcome. Both are behind the same
   capability (decision 4), so the link exposes nothing new. Links to a breach or a
   processing activity use the existing `record_link` rather than new columns.
2. **The public intake form.** s.164A(2) names an electronic form as its example.
   *Recommendation:* use the same published address. `/request/[slug]` asks first
   "Are you making a request or a complaint?", and each form has a switch for whether it
   takes complaints, on by default. It keeps the same bot defences and limits, counted
   together. A complaint submitted there raises a `complaint_intake` task. The page shows
   back only the reference and the acknowledgement deadline. A second address is
   possible, but it would give the organisation two links to publish and keep in step.
3. **UK only, or EU too.** The duty and its clock exist only in UK law. *Recommendation:*
   each complaint gets a `jurisdiction`, defaulting from the organisation setting the
   request register already uses. The 30-day acknowledgement clock and the s.164A
   wording apply only to UK complaints received on or after 19 June 2026. EU complaints
   can still be recorded, as good practice, with no statutory deadline shown. This costs
   little and avoids sending EU entities to a spreadsheet. If you prefer, v1 can be
   UK-only, with no jurisdiction field.
4. **Capability.** *Recommendation:* reuse `dsr.handle` and relabel it "Handle requests
   and complaints". Complaints carry the same personal data, are handled by the same
   people, and decision 1 needs one person to see both sides of a link. A separate
   `complaint.handle` makes sense only if a different team handles complaints. In that
   case the request link would show only a reference to someone without `dsr.handle`.
5. **What "without undue delay" means in Govern.** *Recommendation:* an
   organisation-set **outcome target**, defaulting to 30 days after acknowledgement, and
   a **progress update interval**, defaulting to every 30 days while the complaint is
   open. Both are presented as the organisation's own standard, never as the law.
   Missing either raises a task, not a "breach of the Act" flag. Recording a reason when
   the target is missed (`late_reason`, as on requests) shows why a delay was not undue.
6. **Who can complain.** s.164A gives the right to the data subject only. *Recommendation:*
   record a representative the same way as on requests (name, and that their authority
   was checked), treated as acting for the data subject. A complaint from someone about
   a different person's data is recorded as a complaint by that other person, through
   their representative, or else declined with a reason.

## Data model

### `data_protection_complaint`

| Column | Notes |
|---|---|
| `organisation_id`, `entity_id`, `reference` | `CMP-2026-0001` from `reference_counters` |
| `jurisdiction` | `uk` \| `eu` (decision 3) |
| `controller_role` | As on requests. A processor passes the complaint on to its controller |
| `channel` | The request channel list (email, web form, post, phone…) |
| `received_at` | When it arrived, which starts the clock |
| `complainant_name`, `complainant_contact`, `representative`, `authority_checked` | Minimal, as on requests. No identity documents |
| `subject` | What it is about: `request_handling`, `accuracy`, `security`, `disclosure`, `retention`, `marketing`, `lawfulness`, `transparency`, `automated_decision`, `other`. Used for reporting and to suggest the processing activities involved |
| `description` | The complaint, in the complainant's terms |
| `request_id` | Optional (decision 1) |
| `status` | `received` → `acknowledged` → `investigating` → `outcome_sent` \| `withdrawn` → `closed` |
| `acknowledged_at`, `acknowledgement_channel` | |
| `outcome` | `upheld` \| `partly_upheld` \| `not_upheld` \| `withdrawn` \| `passed_to_controller` |
| `outcome_at`, `outcome_summary`, `remedial_action`, `told_of_regulator_right` | The outcome letter is written elsewhere. Govern records what was said, and optionally links to it as `evidence`, as requests do |
| `owner_id`, `late_reason`, `closed_at` | |

### `data_protection_complaint_event` (append-only)

These are the dated steps, each recorded by a named person with a note:

- `acknowledged`
- `enquiry`: what was looked into and with whom, which is the s.164A(5)(a) record
- `progress_update`: when the complainant was told how it stands, under s.164A(5)(b)
- `outcome_sent`
- `withdrawn`
- `regulator_contact`: when the Commission makes enquiries about the same matter

### `lib/complaints/statutory.ts` (pure)

- `acknowledgementDeadline(receivedAt)`: the receipt date plus 29 days, to the end of
  that day.
- `complaintClock`: the acknowledgement state, then the organisation's outcome target and
  the next progress update due. Each is `running` \| `due_soon` \| `overdue` \| `met`.
  The first is labelled as statutory, the other two as the organisation's own standard.
- `s164aApplies(jurisdiction, receivedAt)`: UK, and received on or after 19 June 2026.

## Phases

### Phase 1: the register (built)
- **Data:** migration and enums; `lib/complaints/statutory.ts` with tests covering:
  - receipt on the 1st;
  - receipt at month end;
  - receipt the day before 19 June 2026;
  - EU (no clock).
- **Service:** `services/complaints.ts`, with record, acknowledge, add event, record
  outcome, close and load. It also adds the request link (decision 1) and DPA 2018
  s.164A–164B to `legal-references.ts`.
- **Pages:** `/app/complaints` (list, filterable by status, subject and clock) and
  `/app/complaints/[id]`, plus the action on the request page.
- **Wiring:**
  - `nav.ts`, `records.ts`, a help topic, a guidance step and the capability label;
  - audit actions `complaint.recorded`, `complaint.acknowledged`,
    `complaint.event_recorded`, `complaint.outcome_sent`, `complaint.closed`;
  - retention subject types;
  - `tests/tenant-isolation.test.ts`.
- **Rules the service enforces:**
  - a complaint cannot close without an outcome, or a withdrawal, recorded;
  - an acknowledgement after the deadline needs a `late_reason`.
- **As built:**
  - The targets are organisation columns `complaint_outcome_target_days` and
    `complaint_update_interval_days`, set on the complaints page by the people who may
    configure requests.
  - An outcome sent with no acknowledgement recorded counts as the acknowledgement.
  - Only a processor or joint controller can record "passed to the controller". A
    processor's complaint shows no statutory clock.
  - The request link is a column. Links to breaches through `record_link` are left for
    later, because the new record types are not yet linkable.
  - A request's page lists the complaints about it, and links to a complaint form
    pre-filled from the request.

### Phase 2: deadlines and reporting (built)
- **Sweep:** `raiseComplaintDeadlines`, using task type `complaint_deadline`, keyed on the
  complaint and clock state, the same way as requests.
- **Dashboard:** "complaints to acknowledge this week".
- **Metrics:** received, acknowledged in time, median days to outcome, outcomes by
  subject, by month. Counts are ready for any s.164B return, though none is required
  yet.
- **Integration API:** add complaint counts to `export/requests-summary`, or a sibling
  `export/complaints-summary`, documented first in `integration-api.md`.
- **As built:**
  - One `complaint_deadline` task per complaint, per dial (acknowledgement, outcome,
    update) and per due date, raised a week before and again once overdue. Keying on
    the due date means each new update interval gets its own reminder. Tasks go to the
    handler, or to privacy admins when there isn't one.
  - The dashboard shows complaints to acknowledge this week, and those past the 30
    days.
  - `lib/complaints/metrics.ts` is pure. `complaintMetrics` drives the panel on the
    complaints page.
  - The API endpoint is a sibling, `GET /api/v1/export/complaints-summary`. It has the
    same query rules as the requests summary, and also returns the organisation's
    targets so "within target" can be read.

### Phase 3: public intake (built)
Only if decision 2 is yes. The form gets the request-or-complaint choice; a per-form
switch; submissions go through `recordComplaint` with channel `web_form` and raise a
`complaint_intake` task; the reference and acknowledgement deadline are shown back.
- **As built:**
  - `dsr_intake_link.takes_complaints` defaults to on, so forms already published
    started offering the choice as soon as this was deployed. It is switched per form
    on the requests page.
  - `submitComplaintIntake` shares the request form's checks: the hidden trap field,
    the signed start time and the hourly limits, with requests and complaints counted
    together.
  - A complainant can give the reference of an earlier request. It is kept with what
    they wrote, not linked automatically, because nothing proves the request is theirs.
  - The complaint records the form it came through (`intake_link_id`) and raises a
    `complaint_intake` task. The page shows back only the reference, and the
    acknowledgement date where s.164A applies.

## Rough size

The request register's Phase 1 without the scope and objection machinery. Estimates:

| Phase | Estimate |
|---|---|
| Phase 1 | 1.5–2 days |
| Phase 2 | about 1 day |
| Phase 3 | about half a day |

## Out of scope

- Writing acknowledgement or outcome letters (as for requests).
- Handling complaints that are not about personal data, such as service complaints.
- Filing s.164B returns, until regulations exist to say what they contain.
