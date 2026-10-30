# Integration API v1

Two systems push records into Waivern Governance Tool: the **Waivern Compliance Portal**
(discovery, DPA extraction, generated documents) and the **Waivern Consent Analyser** (formerly the HAR Analyser)
(cookie, tracker and consent-behaviour scanning). Both use the same envelope.

They are separate products on separate infrastructure. Nothing shares a
database; the contract is versioned and each side deploys independently.

## Authenticating

Every request carries three headers:

| Header | Value |
| --- | --- |
| `x-waivern-connection` | The connection id issued when the integration was set up |
| `x-waivern-timestamp` | Unix seconds |
| `x-waivern-signature` | `HMAC-SHA256(secret, "<timestamp>.<canonical request>")`, hex |

The canonical request is four parts, newline separated:

```
<METHOD>
<path including query string>
<raw body, empty for GET>
```

so the full signed string is `<timestamp>.<METHOD>\n<path>\n<body>`.

Three things are deliberate here:

- **The timestamp is inside the signed material.** If it were only a header, a
  captured body could be replayed under a fresh timestamp and still verify.
  Requests more than five minutes out — in either direction — are refused.
- **The method and path are inside it too.** A signature is bound to the
  endpoint it was made for, so a captured request cannot be redirected at a
  different endpoint whose schema the same body happens to satisfy, and an
  export signed for one entity cannot be replayed for another. It also gives a
  GET, which has no body, something specific to sign.
- **The signature covers the raw bytes**, verified before parsing. Two different
  byte strings can parse to the same object; only one of them was signed.

```bash
# POST
BODY='{"records":[...]}'
PATH_Q='/api/v1/ingest/processing-activities'
TS=$(date +%s)
SIG=$(printf '%s.POST\n%s\n%s' "$TS" "$PATH_Q" "$BODY" \
  | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.* //')

curl -X POST "https://govern.example$PATH_Q" \
  -H 'content-type: application/json' \
  -H "x-waivern-connection: $CONNECTION_ID" \
  -H "x-waivern-timestamp: $TS" \
  -H "x-waivern-signature: $SIG" \
  -d "$BODY"

# GET — the body part is empty, so the string ends with a newline
PATH_Q='/api/v1/export/context?since=2026-08-01T00:00:00Z'
TS=$(date +%s)
SIG=$(printf '%s.GET\n%s\n' "$TS" "$PATH_Q" \
  | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.* //')

curl "https://govern.example$PATH_Q" \
  -H "x-waivern-connection: $CONNECTION_ID" \
  -H "x-waivern-timestamp: $TS" \
  -H "x-waivern-signature: $SIG"
```

Secrets are encrypted at rest with a key held outside the database, and shown
once at creation. A lost secret is rotated, not recovered.

Failures return `401` with no detail. An unauthenticated caller learns that the
request was rejected — not whether the connection exists, whether it is active,
or which part of the signature was wrong. Each of those is a probe.

## Endpoints

| Endpoint | Portal | Scanner | Purpose |
| --- | :---: | :---: | --- |
| `POST /api/v1/ingest/processing-activities` | ● | | Article 30 records |
| `POST /api/v1/ingest/vendors` | ● | ● | Suppliers and third parties |
| `POST /api/v1/ingest/dpas` | ● | | Article 28 terms |
| `POST /api/v1/ingest/evidence` | ● | ● | Documents, attestations, links |
| `POST /api/v1/ingest/scans` | | ● | A scan run and its findings |
| `POST /api/v1/ingest/ai-use-cases` | ● | | AI systems for the AI register |

A connection may only use the endpoints for its kind; anything else is `403`.
The scanner may push vendors because a tracker seen on a page is a third party
processing personal data, whether or not procurement knew about it.

## Reading data back out

Ingest is only half the contract. The Portal also needs to pull current state —
to backfill after downtime, to sync on a schedule, and to generate documents
from facts rather than from events it may have missed.

| Endpoint | Returns |
| --- | --- |
| `GET /api/v1/export/context` | The whole governance picture in one document |
| `GET /api/v1/export/ropa` | Article 30 records plus the assessments covering them |
| `GET /api/v1/export/ai-profile` | The organisation's NIST AI RMF profile, current against target |
| `GET /api/v1/export/requests-summary` | How data subject requests were answered: counts only, no requests |
| `GET /api/v1/export/complaints-summary` | How data protection complaints were handled: counts only, no complaints |

`context` and `ropa` accept `entity` (repeatable), `since` (ISO-8601, for incremental sync) and
`limit` (1–1000). A malformed query returns `400` with the reason rather than
being silently ignored — dropping an unparseable `since` would hand back a full
export when a delta was asked for, and the caller would have no way to tell.

A processing activity carries every Article 30(1) element, in both directions:
`purposes`, `lawfulBasis`, `subjectCategories`, `dataCategories`, `recipients`,
`transfers`, `retention`, `securityMeasures`, `controllerRole` and
`controllerName`. All are optional on ingest. The Portal is generating a
document from these, and a record that arrives thin should arrive rather than be
rejected — Waivern Governance Tool reports its own gaps on the register instead.

**Lawful basis.** `lawfulBasis` is free text, as before. Two optional fields carry
the basis as a choice:

- `lawfulBases`: an array of `consent`, `contract`, `legal_obligation`,
  `vital_interests`, `public_task`, `recognised_legitimate_interests` (UK GDPR
  Article 6(1)(ea), added by the Data (Use and Access) Act 2025) and
  `legitimate_interests`;
- `recognisedCondition`: with recognised legitimate interests, the Annex 1
  condition: `public_task_disclosure`, `national_security`, `emergency`, `crime`
  or `safeguarding`.

On ingest, `lawfulBases` wins when sent. Otherwise the bases are read from
`lawfulBasis` where every part of it names exactly one basis ("Contract; legitimate
interests"); text that does not is kept as the note and no basis is guessed, and a
basis already chosen in Waivern Governance Tool is left as it was. Exports carry all
three fields, with `lawfulBasis` as the note.

The context document is versioned (`contextVersion`), so the Portal can tell
what shape it received:

```json
{
  "contextVersion": "1.0",
  "generatedAt": "2026-08-28T09:14:02.881Z",
  "organisation": { "name": "BBC Group", "slug": "bbc-group" },
  "scope": { "entities": null, "since": null },
  "processingActivities": [ ... ],
  "assessments": [ ... ],
  "risks": [ ... ],
  "suppliers": [ ... ],
  "evidence": [ ... ],
  "aiSystems": [ ... ],
  "counts": { "assessments": 4, "risks": 10, "evidence": 1, "aiSystems": 3 }
}
```

Version 1.1 added `aiSystems`. The change is additive: a reader written for 1.0
that ignores keys it does not know reads 1.1 unchanged.

**Only settled facts are exported.** An assessment appears once it is approved,
never while it is in draft or in review — generating a compliance document from
somebody's unfinished work would put an unreviewed claim into a document that
reads as settled. Each one carries who signed, when, and on what reasoning,
including the stages that were skipped and why:

```json
{
  "reference": "TIA-2026-0001", "kind": "tia", "entity": "BBC Studios",
  "score": { "value": 4, "band": "Medium", "tier": "medium" },
  "approvals": [
    { "stage": "Privacy review", "decision": "approved",
      "by": "privacy.analyst@example.bbc.co.uk",
      "rationale": "Reviewed against the template and the supporting evidence.",
      "reason": "Applies: always required" },
    { "stage": "Data protection officer", "decision": "skipped",
      "reason": "Not required: risk is high or above did not hold" }
  ]
}
```

Answers come from the frozen revision taken at approval, not from the live
record, and `notApplicable` names the questions the logic was not asking — so a
reader can tell an absent answer from a question that never applied.

Risks carry their inherent and residual ratings, their mitigations, and the
acceptance in force. `expired` is stated rather than left to be worked out,
because a generated document must not present a lapsed acceptance as current:

```json
{
  "reference": "RISK-2026-0001",
  "inherent": { "likelihood": 3, "impact": 3, "score": 9, "tier": "high" },
  "residual": { "likelihood": 2, "impact": 2, "score": 4, "tier": "medium" },
  "acceptance": {
    "acceptedBy": "ps.approver@example.bbc.co.uk",
    "rationale": "Within appetite once the taxonomy exclusion is live.",
    "expiresAt": "2027-02-23T21:59:10.041Z",
    "expired": false
  }
}
```

Evidence resolves its links to references the Portal can recognise, rather than
internal ids that mean nothing over there:

```json
{ "title": "Scan bbc-homepage-2026-08-28", "kind": "scan",
  "supports": ["ROPA-2026-0001", "RISK-2026-0010"] }
```

AI systems are exported from the register as they stand, with the register's
own gaps, so a generated document can say what is not yet in place. What has
been judged comes only from an approved assessment; `assessment` is null until
one is. `externalRef` is the Portal's own identifier where the Portal recorded
the system, so it can match its records to ours:

```json
{
  "reference": "AI-2026-0002", "externalRef": "portal-sys-41",
  "entity": "BBC Public Service", "name": "Summarise licence fee complaints",
  "systemType": "generative", "provenance": "third_party_api",
  "deploymentPattern": "public_api", "lifecycleStage": "pilot",
  "owner": "programme.lead@example.bbc.co.uk", "supplier": "OpenModel Ltd",
  "transparency": { "scope": "required", "publishedAt": null },
  "assessment": { "reference": "AIRA-2026-0003", "tier": "medium",
                  "band": "Limited", "approvedAt": "2026-10-20T10:02:11.000Z" },
  "gaps": ["transparency_record_missing", "supplier_not_assessed"]
}
```

### The AI RMF profile

`GET /api/v1/export/ai-profile` returns the organisation's profile against the
NIST AI Risk Management Framework 1.0 (NIST AI 100-1): for each of the 72
subcategories, where the organisation stands now, where it means to be, and
what Govern holds towards it. It is what the Portal writes an "AI RMF profile"
document from.

It takes **no query parameters**, and refuses any it is given with `400`:

- **No `entity`.** The profile is organisation-wide. An organisation sets one
  current and one target per subcategory, not one per legal entity, so there is
  nothing to narrow — and silently ignoring `entity` would hand back the whole
  organisation's profile to a caller who believed it had asked for one entity's.
- **No `since` or `limit`.** It is always 72 rows, and a profile document must
  describe all of them: an unassessed subcategory is a finding, not an absence.
  A partial profile would read as a complete one with fewer gaps.

```json
{
  "profileVersion": "1.0",
  "generatedAt": "2026-10-29T09:14:02.881Z",
  "organisation": { "name": "BBC Group", "slug": "bbc-group", "aiFramework": "nist_ai_rmf" },
  "framework": {
    "id": "nist_ai_rmf", "name": "NIST AI Risk Management Framework",
    "edition": "1.0", "publication": "NIST AI 100-1",
    "source": "https://doi.org/10.6028/NIST.AI.100-1"
  },
  "summary": { "subcategories": 72, "achieved": 9, "partial": 20, "not_started": 11,
               "not_applicable": 2, "unassessed": 30, "targetsSet": 44, "gaps": 23 },
  "functions": [
    { "function": "MEASURE", "label": "Measure", "summary": "...",
      "tally": { "achieved": 2, "partial": 6, "...": 0 } }
  ],
  "subcategories": [
    {
      "id": "MEASURE 2.11", "function": "MEASURE", "category": "MEASURE 2",
      "outcome": "Fairness and bias – as identified in the MAP function – are evaluated and results are documented.",
      "current": "partial", "target": "achieved", "gap": true,
      "notes": "Bias tested on two of five models.",
      "evidence": [
        { "feature": "eia", "label": "Equality impact assessment", "count": 3 }
      ],
      "updatedBy": "ai.lead@example.bbc.co.uk", "updatedAt": "2026-10-28T16:40:12.000Z"
    }
  ]
}
```

- `current` and `target` are `not_started`, `partial`, `achieved` or
  `not_applicable`, or `null` when nobody has said. `null` for `current` means
  **not assessed**, and must not be written up as "not started".
- `gap` is computed here, so the Portal and Govern agree on it: true when the
  target is `partial` or `achieved` and the current status falls short of it.
  Not assessed counts as short, since nobody can show the outcome is met.
- `outcome` and the subcategory ids are NIST's own wording, verbatim.
- `evidence` counts the records Govern holds under the features the crosswalk
  maps to that subcategory. **A count is never a status**: twenty systems on the
  AI register go towards GOVERN 1.6, but whether that inventory is adequate is a
  person's judgement, recorded in `current`. A document may cite the counts; it
  must not infer achievement from them.
- `updatedBy` and `updatedAt` are `null` for a subcategory nobody has set.
- `profileVersion` versions this shape, as `contextVersion` versions the
  context document; additive changes bump the minor version.

The profile is returned whatever AI governance framework the organisation
currently follows (`organisation.aiFramework`), because an organisation moving
from the UK framework to NIST may build its profile before it switches.

Unlike the context and RoPA feeds, each call is **recorded in the audit trail**
as `data.exported` (dataset `nist-ai-rmf-profile`, format `json`), with the
connection as the actor — the same event a person's CSV download of the profile
records. The profile carries people's own assessments of where the organisation
falls short, and who took them out of Govern should be on the record.

Exports are `cache-control: no-store`. Governance state changes when people
decide things, and a cached export could hand back a decision that has since
been withdrawn.

### Data subject requests, summarised

`GET /api/v1/export/requests-summary` says how the organisation has handled
requests from data subjects: how many arrived, of which rights, how many were
answered within the statutory time and how many late, how many were extended,
and how objections were decided. It is what lets the Portal's data subject
rights procedure state real response times rather than an aspiration.

**Counts only.** No reference, requester, description, date of an individual
request or reasoning leaves Govern through this endpoint. Requests are the
requesters' own personal data, and the Portal needs the totals, not the cases.

It accepts:

- `entity` (repeatable) — narrow to those entities, as for `context`.
- `months` — the window, 1–24, default 12. The window is whole calendar months
  ending with the current one, and covers requests **received** in it.

`since` and `limit` are refused with `400`: a summary of a delta, or of the
first N requests, would read as a summary of everything.

```json
{
  "summaryVersion": "1.0",
  "generatedAt": "2026-10-30T09:14:02.881Z",
  "organisation": { "name": "BBC Group", "slug": "bbc-group", "defaultJurisdiction": "uk" },
  "scope": { "entities": null, "months": 12, "from": "2025-11-01T00:00:00.000Z", "to": "2026-10-30T09:14:02.881Z" },
  "totals": {
    "received": 41, "answered": 37, "onTime": 35, "late": 2,
    "extended": 4, "refused": 3, "withdrawn": 1, "open": 3, "overdue": 0,
    "medianDaysToRespond": 19
  },
  "byRight": [
    { "right": "access", "label": "Access", "article": "Article 15",
      "received": 30, "answered": 28, "onTime": 27, "late": 1 }
  ],
  "byMonth": [
    { "period": "2026-10", "received": 4, "answered": 3, "onTime": 3, "late": 0, "extended": 0 }
  ],
  "objections": { "decided": 6, "upheld": 4, "overridden": 1, "notApplicable": 1 }
}
```

- `onTime` and `late` count answered requests against the statutory deadline
  as Govern worked it out: one month (three if extended), moved off weekends
  and, for UK requests, bank holidays, waiting for identity where it was asked
  for, and pausing for clarification under UK law from 19 June 2026.
- A request invoking several rights counts once under each in `byRight`, so
  those rows can add up to more than `totals.received`. Rights nobody invoked
  are left out.
- `byMonth` puts each event in the month it happened: `received` when the
  request arrived; `answered`, `onTime`, `late` and `extended` when the
  response went. Every month in the window is present, including empty ones.
- `medianDaysToRespond` is calendar days from receipt to response, or `null`
  when nothing in the window was answered.
- `objections` counts objection decisions, one per processing activity decided,
  on requests in the window. `overridden` means compelling legitimate grounds
  or legal claims were relied on.
- **Small numbers are not suppressed.** Three erasure requests in a month is
  three. Whether a figure is fit to publish is the Portal's decision when it
  writes a document, not something this endpoint decides by hiding it.
- `summaryVersion` versions this shape; additive changes bump the minor version.

### Data protection complaints, summarised

`GET /api/v1/export/complaints-summary` says how the organisation has handled
complaints made to it under DPA 2018 s.164A: how many arrived, about what, how
many were acknowledged within the 30 days, how many outcomes were sent and how
they came out. It is what lets the Portal's complaints procedure, or its data
subject rights procedure, state real figures — and they are the counts a return
under s.164B would ask for, if regulations under it are ever made.

**Counts only**, as for requests: no reference, complainant, description, date
of an individual complaint or note leaves Govern through this endpoint.

It accepts `entity` (repeatable) and `months` (1–24, default 12), exactly as
the requests summary does, and refuses `since` and `limit` with `400` for the
same reason. The window covers complaints **received** in it.

```json
{
  "summaryVersion": "1.0",
  "generatedAt": "2026-10-30T09:14:02.881Z",
  "organisation": { "name": "BBC Group", "slug": "bbc-group", "defaultJurisdiction": "uk" },
  "targets": { "outcomeTargetDays": 30, "updateIntervalDays": 30 },
  "scope": { "entities": null, "months": 12, "from": "2025-11-01T00:00:00.000Z", "to": "2026-10-30T09:14:02.881Z" },
  "totals": {
    "received": 9, "acknowledged": 8, "acknowledgedInTime": 7, "acknowledgedLate": 1,
    "outcomesSent": 6, "outcomeWithinTarget": 5, "outcomeAfterTarget": 1,
    "withdrawn": 1, "open": 2, "acknowledgementOverdue": 0,
    "medianDaysToAcknowledge": 3, "medianDaysToOutcome": 24
  },
  "outcomes": { "upheld": 2, "partlyUpheld": 2, "notUpheld": 2, "passedToController": 0 },
  "bySubject": [
    { "subject": "request_handling", "label": "How a request about their data was handled",
      "received": 4, "acknowledged": 4, "acknowledgedInTime": 4, "acknowledgedLate": 0,
      "outcomesSent": 3, "upheld": 2 }
  ],
  "byMonth": [
    { "period": "2026-10", "received": 1, "acknowledged": 1, "acknowledgedInTime": 1,
      "acknowledgedLate": 0, "outcomesSent": 0 }
  ]
}
```

- `acknowledgedInTime` and `acknowledgedLate` count only complaints s.164A
  applies to: UK, received from 19 June 2026, and not received as processor. The
  30 days count the day of receipt as the first, and do not move off weekends or
  bank holidays. An outcome sent before any acknowledgement counts as one.
  `acknowledged` counts every complaint acknowledged, whatever the law.
- `outcomeWithinTarget` and `outcomeAfterTarget` are measured against the
  organisation's **own** target, given in `targets`, not a statutory period: the
  Act requires the outcome "without undue delay" and sets no figure. Where the
  target is `0` (off), neither is counted.
- `upheld` in `bySubject` counts outcomes upheld or partly upheld.
- `byMonth` puts each event in the month it happened: `received` when the
  complaint arrived, `acknowledged` (and in time or late) when the
  acknowledgement went, `outcomesSent` when the outcome did. Every month in the
  window is present, including empty ones. Subjects nobody complained about are
  left out of `bySubject`.
- `medianDaysToAcknowledge` and `medianDaysToOutcome` are calendar days from
  receipt, or `null` when nothing in the window got that far.
- Small numbers are not suppressed, as for requests.
- `summaryVersion` versions this shape; additive changes bump the minor version.

## Idempotency

Every record carries `externalRef`, the producing system's own identifier. A
re-push updates rather than duplicates. This is what lets a scanner run nightly
without silting up the register, and what makes a retry after a network failure
safe.

Batches are capped at 500 records, bodies at 2 MB.

## AI systems

`POST /api/v1/ingest/ai-use-cases` records AI systems the Portal has found or
been told about:

```json
{ "records": [{
  "externalRef": "portal-sys-41",
  "name": "Summarise licence fee complaints",
  "purpose": "Finds themes in complaint letters for the complaints team.",
  "systemType": "generative", "provenance": "third_party_api",
  "deploymentPattern": "public_api", "lifecycleStage": "pilot",
  "supplierName": "OpenModel Ltd", "modelName": "om-large-2",
  "deployedIn": ["Complaints workbench"],
  "processesPersonalData": true, "dataCategories": ["contact", "correspondence"]
}] }
```

The Portal describes a system; people here govern it. A push sets what the
system is — name, purpose, type, provenance, deployment, model, data — and on
first recording its stage (`proposed` if not given). It never changes, on a
later push, who owns the system, its AI governance officer, its transparency
scope, its review date or its lifecycle stage: moving a system live is a
decision with a gate, and an integration does not take it.

`supplierName` links the system to a supplier on the third-party register where
one matches by name. An unknown name is kept as the vendor rather than creating
a supplier nobody has looked at, and a link somebody made here is never
replaced.

## Entities

Records are filed against a legal entity. Name one with `entity` (its name or
its `legalEntityRef`), or omit it and the connection's default is used. An
entity that does not exist causes that record to be **skipped, not redirected** —
quietly filing one legal entity's records under another is wrong in a way nobody
notices.

Responses report what happened per batch:

```json
{ "received": 12, "created": 9, "updated": 2,
  "skipped": [{ "externalRef": "abc", "reason": "Unknown entity \"BBC Nonexistent\"" }] }
```

## Scans

A run lands as **one piece of evidence** with its findings attached, so an
assessment can cite "the scan of 28 August" rather than four hundred loose
observations. Set `attachTo` to an existing reference (`DPIA-2026-0001`,
`ROPA-2026-0004`, `RISK-2026-0002`) to link the run to that record.

```json
{
  "entity": "BBC Public Service",
  "scanRef": "bbc-homepage-2026-08-28",
  "scannedUrl": "https://www.example.bbc.co.uk/",
  "attachTo": "ROPA-2026-0001",
  "summary": { "cmp": "OneTrust", "cookiesBeforeConsent": 3 },
  "findings": [
    {
      "externalRef": "bbc-homepage-2026-08-28:_ga",
      "category": "cookie",
      "severity": "high",
      "title": "Google Analytics cookie set before any consent signal",
      "cookieName": "_ga",
      "vendor": "Google Analytics",
      "setBeforeConsent": true,
      "thirdCountry": "US",
      "advisory": { "suggestion": "Gate the analytics tag behind consent" }
    }
  ]
}
```

**A finding never becomes a risk on its own.** `severity` is the scanner's own
rating and `advisory` is explicitly a suggestion; both are shown to a person and
recorded for provenance, and a named human decides whether the finding belongs
on the register and how serious it is. The audit trail keeps the scanner's
severity and the person's rating side by side, as separate facts:

```json
{ "risk": "RISK-2026-0010", "scannerSeverity": "high",
  "ratedBy": "dpo@example.bbc.co.uk", "rating": { "likelihood": 4, "impact": 3 } }
```

A scanner deciding what constitutes a governance risk would be automation making
the classification. Under UK GDPR the controller carries that judgement, and a
platform that quietly took it would have moved accountability somewhere it
cannot legally sit.

## Outbound events

Governance decisions flow back. A connection with a `webhookUrl` receives:

| Event | When |
| --- | --- |
| `assessment.approved` | The last approval gate passes |
| `assessment.rejected` | Any gate rejects |
| `risk.accepted` | A named approver accepts a risk |

An approved assessment or an accepted risk is a confirmed fact with a human
attached, which is what makes it safe for the Portal to generate a document
from.

Deliveries are queued in the same transaction as the decision — so an approval
never lands without its notification, and a rolled-back decision never announces
itself — and sent later on the hourly sweep. A slow or unreachable subscriber
cannot make an approval fail.

Events are signed exactly as inbound requests are, so a subscriber verifies them
with the secret it already holds. `x-waivern-delivery` carries a stable id for
the subscriber's own idempotency. Failed deliveries retry with exponential
backoff and are abandoned after six attempts.

## Errors

| Status | Meaning |
| --- | --- |
| `401` | Rejected. Deliberately undetailed. |
| `403` | This connection may not use this endpoint. |
| `413` | Body over 2 MB. |
| `422` | Valid signature, payload does not match the contract. Issues are listed. |
| `500` | Our fault. Safe to retry — writes are idempotent on `externalRef`. |
