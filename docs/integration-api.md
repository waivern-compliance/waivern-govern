# Integration API v1

Two systems push records into Waivern Govern: the **Waivern Compliance Portal**
(discovery, DPA extraction, generated documents) and the **HAR Analyser**
(cookie, tracker and consent-behaviour scanning). Both use the same envelope.

They are separate products on separate infrastructure. Nothing shares a
database; the contract is versioned and each side deploys independently.

## Authenticating

Every request carries three headers:

| Header | Value |
| --- | --- |
| `x-waivern-connection` | The connection id issued when the integration was set up |
| `x-waivern-timestamp` | Unix seconds |
| `x-waivern-signature` | `HMAC-SHA256(secret, "<timestamp>.<raw body>")`, hex |

The timestamp is **inside** the signed material. If it were only alongside it, a
captured body could be replayed under a fresh timestamp and still verify.
Requests more than five minutes out — in either direction — are refused.

The signature covers the **raw bytes** of the body, and the server verifies
before parsing. Two different byte strings can parse to the same object; only
one of them was signed.

```bash
BODY='{"records":[...]}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" \
  | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.* //')

curl -X POST https://govern.example/api/v1/ingest/processing-activities \
  -H 'content-type: application/json' \
  -H "x-waivern-connection: $CONNECTION_ID" \
  -H "x-waivern-timestamp: $TS" \
  -H "x-waivern-signature: $SIG" \
  -d "$BODY"
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

A connection may only use the endpoints for its kind; anything else is `403`.
The scanner may push vendors because a tracker seen on a page is a third party
processing personal data, whether or not procurement knew about it.

## Idempotency

Every record carries `externalRef`, the producing system's own identifier. A
re-push updates rather than duplicates. This is what lets a scanner run nightly
without silting up the register, and what makes a retry after a network failure
safe.

Batches are capped at 500 records, bodies at 2 MB.

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
