# Plan: UK PECR as amended by the Data (Use and Access) Act 2025

Status: decisions settled as recommended (30 October 2026); Phases 0–4 built.

## What is asked for

Govern supports the Privacy and Electronic Communications Regulations 2003 (PECR) as the
DUAA amended them. It covers UK law only; the EU ePrivacy Directive is out of scope for
now.

The core is a **cookie inventory** kept in Govern. It covers every cookie and similar
technology on the organisation's websites and apps, and records the Schedule A1 basis
each one relies on. The inventory is filled from the **Waivern Consent Analyser** in two
ways: by uploading a JSON report it produced, or by Govern running a scan itself with an
analyser API token.

## The law, as checked on legislation.gov.uk

The DUAA's PECR changes are Part 5, Chapter 2 (ss.109–116, with Schedules 12 and 13).
They have been in force since **5 February 2026** (S.I. 2026/82). That is earlier than
19 June 2026, when the changes to the rights came in.

| Provision | What changed |
|---|---|
| s.112, Sch 12 | Regulation 6(1) still restricts storing or reading information on a user's device. A new **Schedule A1** lists when it does not apply. See the next table. |
| s.114 | New reg 22(3A) is a **soft opt-in for charities**. The marketing must be solely to further the charity's charitable purposes. The details must have been collected when the person expressed interest or offered or gave support. The person must get a simple, free chance to refuse when the details are collected and in every later message. Only charities registered in England and Wales, Scotland or Northern Ireland qualify. |
| s.111 | Reg 5A breach notification must now be made "where feasible, not later than 72 hours" after becoming aware, with reasons if later. Reg 5A applies to providers of public electronic communications services. |
| s.110 | Reg 2 gets a statutory definition of direct marketing (advertising or marketing material "directed to particular individuals"). A call now includes an attempted call, and a recipient includes an intended one. |
| s.115, Sch 13 | DPA 2018 Parts 5–7 enforcement now applies to PECR: information, assessment and interview notices, enforcement and penalty notices, and liability for officers for failures under regs 19–24. The penalty maximums are not on the pages checked. They are widely reported as matching the UK GDPR's, but that is not confirmed here. |
| s.116 | Codes of conduct for PECR. |

**Schedule A1: when storing or reading information needs no consent.**

| Para | Basis | Conditions |
|---|---|---|
| 2 | Consent | Clear and comprehensive information about the purpose, and consent. Consent can be given through browser settings. Repeated use for the same purpose rests on the first consent. |
| 3 | Transmission | Technical storage or access whose sole purpose is carrying a communication over a network. |
| 4 | Strictly necessary | Strictly necessary for a service the user asked for. The examples given are security of the service or the device, fraud prevention, fault detection, authentication and remembering what the user entered. |
| 5 | **Statistics** | Collected by the service provider, solely to improve the service or website. Shared with nobody except someone helping to make those improvements. Clear and comprehensive information. A **simple, free way to object**, which the user has not used. |
| 6 | **Appearance and function** | A website (which includes an app). Solely to adapt its appearance or function to the user's preferences, or otherwise enhance them. Clear and comprehensive information. A simple, free way to object, not used. |
| 7 | Emergency assistance | Solely to find the user's location after a communication asking for emergency help. |

Paragraphs 5 and 6 are new. Analytics and preference cookies set before consent are no
longer automatically unlawful in the UK. They are lawful **only if** the conditions are
met and can be shown, which is what a register exists to record.

## Where Govern stands

- **Scan findings.** `POST /api/v1/ingest/scans` already takes findings with
  `cookieName`, `vendor` and `setBeforeConsent`. They can be turned into risks, but they
  are observations, not an inventory.
- **Integration kind.** The enum has `har_analyser`, which is the Consent Analyser under
  an earlier name.
- **Building blocks to reuse:** the supplier register (who data is shared with), evidence,
  `record_link`, sealed secrets (`lib/integration/crypto.ts`, used for integration
  secrets), `lib/net/fetch-page.ts` for vetting URLs, the hourly sweep, and the
  decision-with-rationale pattern from breaches, requests and complaints.
- **Existing PECR references:** only the help text on objections to marketing mentions
  PECR (regs 21 and 22). There are no legal references for it.
- **No background worker.** Govern runs on Railway with an hourly sweep. A scan takes
  1–5 minutes, so starting and following one has to fit that (see Phase 2).

## The Consent Analyser, as it is today

From `waivern-consent-analyser`, `main.py` unless noted:

- **Starting a scan is asynchronous.** `POST /analyse/url` takes the form fields `url`,
  `mode` (gdpr | ccpa | gcm), `region` (eu | us | uk; uk needs the UK proxy configured)
  and `ai_mode`. It answers `303 → /runs/{run_id}/progress`. Then
  `GET /runs/{id}/status` returns `{done, failed}`, and `GET /runs/{id}/report.json`
  returns the report. The Portal's `api/services/cookie_analyser.py` already does this
  and can be ported.
- **Auth** is `Authorization: Bearer wvn_<32hex>`. Tokens are per user and have no
  scopes. **An invalid token silently becomes anonymous**, and anonymous runs are not
  private. The HTTP **quota is read from the browser session, not the token**.
- **The report** has `schema_version: "2.0"`, with `metadata`, `cmp_interaction`,
  `screenshots` (base64 and large), `checklist[]` and `summary`. There is no Pydantic
  model.
- **There is no top-level cookie list.** Cookies appear only inside checklist evidence:
  - B.2: tracking cookies before consent;
  - G.1: first-party cookies after Accept, with expiry and classification;
  - F.1: third-party cookies;
  - E.1: requests after Reject.

  "Set before consent" can only be inferred from which check a cookie appears under.
- **Purpose classification is pre-DUAA.**
  - The rule-based classifier puts `_ga` and `_hj` in **AD** (`vendor_db.py:400`).
  - The optional AI classification (`metadata.cookie_ai_classification`) is closer: it
    gives strictly_necessary, functional, analytics, advertising or unknown.
  - Nothing knows Schedule A1. Checks B.2 and E.1 will mark exempt analytics as FAIL.

## Decisions (all settled as recommended, 30 October 2026)

1. **What the inventory is organised by.** *Recommendation:* a **digital property** (a
   website or app) belonging to an entity, with the inventory per property. Schedule A1
   is about a service and its information and objection mechanism, which differ from one
   site to another.
2. **How a scan's cookies become the inventory.** *Recommendation:* each scan **proposes**
   changes: new items, items no longer seen, and items first seen before consent. A
   person accepts them. Nothing gets a basis automatically. The analyser's category is
   shown as a suggestion only, as scan severity already is.
3. **The analyser token.** *Recommendation:* one per organisation, entered by an owner or
   privacy admin and stored sealed. The base URL defaults to
   `https://consent-analyser-emea.waivern.com` and is changeable. Because an invalid token
   silently makes the run public, Govern checks the token before every scan: it must be
   able to read back a report it started.
4. **Changes to the Consent Analyser** (separate repo and PR). *Recommendation*, before
   Phase 2:
   - (a) a top-level `storage[]` inventory, one entry per cookie or storage key, with
     name, domain, first or third party, expiry, the phases it was seen in (before
     consent, after Accept, after Reject) and a purpose category including
     **statistics** and **functional**, as `schema_version: "2.1"`;
   - (b) `401` for an invalid bearer token;
   - (c) the quota charged to the token's owner over HTTP, as MCP already does.

   Govern reads 2.0 from checklist evidence until then, but that is fragile.
5. **The report itself.** *Recommendation:* store the report with the screenshots removed,
   as evidence for the run, with the analyser's run id and a link back to its HTML
   report. The screenshots stay with the analyser.
6. **Capability.** *Recommendation:* the existing `record.read` and `record.write`, not
   `dsr.handle`. A cookie inventory holds no data subject's personal data. Configuring
   the token uses the same organisation-wide rule as the request forms.
7. **What else is in the first version.** *Recommendation:* the cookie inventory first
   (Phases 0–3), then an **electronic marketing register** (Phase 4) if clients run email
   or SMS marketing. Build the reg 5A breach flag (Phase 5) only if a client is a public
   telecoms provider; none is known to be.

## Data model

### `digital_property`
`organisation_id`, `entity_id`, `reference` (`WEB-2026-0001`), `name`, `url` (or an app
identifier), `kind` (website | app), `owner_id`, plus:
- `information_url`: where the clear and comprehensive information is (the cookie notice);
- `objection_mechanism`: how users object to statistics or appearance storage, in a
  sentence;
- `cmp`: the consent platform, as last detected or entered;
- `last_scanned_at`.

### `storage_item` (the inventory)
One row per name, domain and property:
- `name`, `kind` (cookie | local_storage | session_storage | pixel | sdk | other),
  `domain`, `party` (first | third);
- `expiry` as text ("session", "13 months"), `supplier_id` (optional), `purpose`
  (free text);
- `suggested_category`: the analyser's, kept only for reference;
- `seen_before_consent`, `seen_after_reject` (from the latest scan), `first_seen_at`,
  `last_seen_at`;
- `status` (active | not_seen | removed), and `source` (scan | manual).

### `storage_decision` (append-only, like the other registers)
- `basis`: consent | transmission | strictly_necessary | statistics |
  appearance_function | emergency | **none**. `none` means it must be removed or put
  behind consent.
- `conditions`: jsonb holding what was confirmed. For statistics: provider only, sole
  purpose, shared only with whom, information link, objection means. For appearance: the
  same without the sharing condition.
- `statutory_basis` ("PECR Sch A1 para 5"), `rationale` (required), and who decided and
  when.

### `consent_scan`
- `property_id`, `source` (upload | api), `analyser_run_id`, `analyser_url`;
- `mode`, `region`, `status` (running | done | failed), `started_at`, `completed_at`;
- `summary` (jsonb), `evidence_id`, and `proposals_pending`.

### Organisation
`consent_analyser_url`, and `consent_analyser_token` sealed with `sealSecret`.

### `lib/pecr/statutory.ts` (pure)
- `conditionsFor(basis)` lists what each Schedule A1 paragraph needs.
- `gaps(item, decision, property)` returns what is missing. Examples: a statistics basis
  with no objection mechanism on the property, a third-party statistics cookie whose
  supplier isn't recorded as helping improve the service, or an item seen before consent
  whose basis is consent.
- `suggestedBasis(category)` is a suggestion and never applied by itself.

## Phases

### Phase 0: the statutory module and references (built)
- `lib/pecr/statutory.ts` and its tests.
- Legal references for PECR regs 2, 5A, 6, 21, 22 and Schedule A1, DUAA ss.110–116, and
  the ICO's storage and access guidance.
- Rename `har_analyser` to "Consent Analyser" where it is shown (the enum value stays).

### Phase 1: the inventory, by hand and by upload (built)
- **Data:** a migration for the four tables, with row-level security.
- **Service:** `services/storage-inventory.ts`: properties, items, decisions and gaps.
- **Pages:**
  - `/app/cookies`: properties, and the register across them (filter by basis, gaps and
    seen before consent);
  - `/app/cookies/[property]`: the inventory, decisions, scans and pending proposals.
- **Upload:** a JSON report from the analyser.
  - Validation follows the analyser's own: `schema_version` "2.0" (or 2.1 later),
    `checklist` is a list, `summary` and `metadata` are objects. A `bot_blocked` report
    is refused, because the scan saw a block page and not the site.
  - The target URL must match the property, or the user confirms the mismatch.
  - Screenshots are stripped and the size is capped.
  - Cookies are extracted from the B.2, G.1 and F.1 evidence and `cookie_ai_classification`
    into proposals.
  - Failing checks become scan findings, as the scans ingest already does.
- **Wiring:** nav, records, help topic, guidance step, audit actions (`pecr.*`),
  retention subject types and tenant-isolation tests.
- **As built:**
  - Proposals are a fifth table, `storage_proposal`.
  - A scan's observations about items already on the inventory are facts and update
    straight away: last seen, seen before consent, seen after Reject, and the scanner's
    category. Gaps then flag conflicts, such as a consent-based cookie seen before
    consent. Only additions to the inventory and retirements from it wait for a person.
  - A rejected "new" item that a later scan still finds is proposed again.
  - Items added by hand are never proposed as not seen.
  - Cookie values (`value`, `value_snippet`, `set_cookie_header`) are stripped along
    with the screenshots, because a value can identify whoever ran the scan.
  - The analyser's rule-based `AD` class is read as "advertising or analytics" and
    suggests no basis. The AI category is preferred where there is one.
  - The browser removes the screenshots before upload, so large reports fit within the
    12 MB server action limit. The server strips them again.
  - Writes check the entity the website belongs to (`record.write` there).

### Phase 2: scanning through the analyser API (built)
- **Settings:** the token and base URL, set by owners and privacy admins.
- **Scan now:** a button on the property page.
  1. `POST /analyse/url` with `mode=gdpr`, `region=uk` (falling back to `eu` with a note
     if the analyser has no UK proxy) and `ai_mode=ai`. The run id comes from the 303.
  2. The page polls the run's status every 10 seconds through a server action. When it is
     done, Govern fetches `report.json` and ingests it as an upload would be.
  3. The hourly sweep picks up runs nobody stayed to watch, and fails them after 15
     minutes.
- **Safety:**
  - the property URL is vetted with `fetch-page`'s rules before it is sent;
  - the token is never logged;
  - an anonymous-looking run (the report can't be read back with the token) is reported
    as a token problem and not ingested.
- **As built:**
  - Decision 4's analyser changes shipped first in waivern-consent-analyser#145: report
    schema 2.1 with `storage[]`, 401 for an invalid token, and HTTP scans charged to
    the token's owner (402 when they are out of credits).
  - `lib/pecr/analyser-client.ts` calls the analyser and has no database access.
    `services/consent-analyser.ts` holds the organisation's settings and the
    start/check/finish steps.
  - The token is checked with the analyser before it is saved. The check reads the
    status of a run id that doesn't exist, which costs nothing.
  - The token is sealed in organisation columns, like integration secrets. Only its
    last four characters are shown or written to the audit log.
  - A finished run is claimed (`completed_at`) before its report is fetched, so two
    callers asking at the same moment cannot both take it in.
  - The page asks every 10 seconds while it is open. The sweep's
    `finishRunningScans` handles runs nobody stayed to watch, and gives up after 15
    minutes.
  - The settings are set by organisation-wide grants with `workflow.configure`
    (owner or privacy admin).
  - The website's address is vetted with `fetch-page`'s rules (no private or
    loopback addresses) before it is sent to the analyser.
  - The sweep finishes running scans before it raises rescan reminders, so a scan
    finished in the sweep moves the next due date on.

### Phase 3: keeping it current (built)
- **Rescan tasks:** each property gets a rescan schedule (default quarterly) through the
  existing scheduler.
- **Change tasks:** after a scan, a task is raised for anything new, not seen, or newly
  seen before consent.
- **Gaps:** these show on the property and on the dashboard, for example "3 cookies with
  no basis, 1 statistics cookie with no objection route".
- **As built:**
  - The interval is a column on the property, `rescan_interval_months` (1, 3, 6 or 12;
    default 3; null for no reminders), not a row in `schedule`. A schedule rolls forward on
    its own dates, but a rescan is due from the last scan, whenever that happened.
  - The sweep raises `pecr_rescan` a fortnight ahead, once per due date, to the site's
    owner or else privacy admins. Taking in a report closes any open reminder for the
    property, and the next due date counts from that scan. A site never scanned counts
    from when it was added.
  - Ingest raises one `pecr_scan_changes` task per scan, keyed on the scan, naming how
    many items are new, no longer seen, and newly set before consent (an item on the
    inventory whose last scan did not see it before consent). A scan that finds nothing
    raises nothing.
  - Gaps carry a kind (`lib/pecr/statutory.ts:gapsOf`), counted once per item per kind
    and ordered most pressing first: before consent, after Reject, recorded as no basis,
    no basis, no objection route, no information, no supplier, condition unconfirmed.
    They show on the property page, each register row, and two dashboard tiles ("Cookies
    with gaps" and "Cookie scans due"), visible to anyone with `record.read`.

### Phase 4: the electronic marketing register (built)
- **One row per campaign or channel:** email, SMS, live calls, automated calls,
  linked to the ROPA processing activity that has direct marketing among its purposes.
- **The basis for each:**
  - consent;
  - the ordinary soft opt-in (reg 22(3)): the details were got in a sale or
    negotiation, the products are similar, and there is a chance to refuse;
  - the charity soft opt-in (reg 22(3A)) with its conditions and registration;
  - for live calls, TPS/CTPS screening and its date (reg 21).
- **Objections:** objections to direct marketing upheld in the request register count
  against the activity, which they already do.
- **Out of scope:** the suppression list, which stays in the marketing tool.
- **As built:**
  - `lib/pecr/marketing.ts` (pure) holds the channels, the bases each can use, their
    conditions and the gaps. Regulation 23 (sender identity and an opt-out address) is
    asked of every email and text basis, consent included. Automated calls (reg 19) can
    rely only on consent; calls about claims management or pensions are a condition of
    the screened-calls basis (regs 21A, 21B).
  - Tables `marketing_activity` and `marketing_decision` (append-only), with row-level
    security. References are `MKT-YYYY-NNNN`.
  - "Who it reaches" (individuals, businesses only, or both) decides whether the
    corporate-subscriber basis is offered. A basis the channel cannot use is refused when
    recorded, and shown as a gap if the channel changes later.
  - A charity soft opt-in with no registration number is a gap.
  - Live calls on the screened basis record each TPS and CTPS screening. One holds for 28
    days. The sweep raises `marketing_tps_screening` three days before it runs out, or at
    once if there was never one; recording a screening closes it.
  - Objections are counted with the request register's `objectionCounts` through the
    linked ROPA activity. An overridden objection to direct marketing is the first gap.
  - `/app/marketing` and `/app/marketing/[id]`, nav, help topic, guidance step, legal
    references for regs 19 and 23 and the ICO's direct marketing guidance, and the
    tenant-isolation tests.

### Phase 5: reg 5A breach notification (about half a day, only if needed)
- **Provider flag:** a flag on the entity marking it as a public electronic
  communications provider.
- **The clock:** for such an entity the breach register runs the reg 5A clock beside
  Article 33's: 72 hours where feasible, with reasons if later.

### Phase 6: the Portal (about 1 day in Govern; the Portal work is separate)
- **Export:** `GET /api/v1/export/storage`, documented first in `integration-api.md`. It
  returns settled decisions per property: name, party, purpose, basis, conditions and
  the information and objection routes.
- **Portal side:** the Portal's Cookie Notice generation reads it, so the notice states
  the basis Govern recorded, not one the model inferred.

## Rough size

| Phase | Estimate |
|---|---|
| Phase 0 | about half a day |
| Phase 1 | about 3 days |
| Phase 2 | about 1.5 days, plus the analyser changes in decision 4 |
| Phase 3 | about 1 day |
| Phase 4 | about 2 days |
| Phase 5 | about half a day (only if needed) |
| Phase 6 | about 1 day, plus the Portal side |

Phases 0–2 make a working UK cookie register fed by the analyser.

## Out of scope

- The EU ePrivacy Directive and national cookie laws (decided).
- Running the consent banner, or changing the website. Govern records decisions; the site
  and its consent platform implement them.
- The marketing suppression list and campaign tools.
- Deciding a basis automatically from a scan.
