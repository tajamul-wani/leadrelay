# Lead Payload Contract

A lead passes through two HTTP hops. Each hop has a fixed payload shape so the funnel, the API function and the n8n workflow can be built and tested independently.

```
Browser  --(1) POST /api/lead-->  Vercel function  --(2) POST webhook-->  n8n
```

## 1. Browser to `/api/lead`

```json
{
  "lead_id": "3f1c2a9e-8b7d-4c1e-9f0a-2d6b5e4c3a21",
  "event_id": "3f1c2a9e-8b7d-4c1e-9f0a-2d6b5e4c3a21",
  "submitted_at": "2026-09-17T10:15:30.000Z",
  "is_test": false,
  "contact": {
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane.doe@example.com",
    "phone": "+15551234567",
    "zip": "90210",
    "state": "CA"
  },
  "quiz": {
    "qualified": true,
    "answers": {}
  },
  "consent": {
    "given": true,
    "version": "tcpa-v1",
    "text": "Exact consent language displayed next to the checkbox.",
    "timestamp": "2026-09-17T10:15:28.000Z"
  },
  "attribution": {
    "utm_source": "facebook",
    "utm_medium": "paid_social",
    "utm_campaign": "ssdi_q3",
    "utm_content": null,
    "utm_term": null,
    "fbclid": "IwAR0abc",
    "fbc": "fb.1.1758104100000.IwAR0abc",
    "fbp": "fb.1.1758104000000.1234567890",
    "referrer": null,
    "page_url": "https://leadrelay.vercel.app/?utm_source=facebook&fbclid=IwAR0abc",
    "variant": "control"
  }
}
```

| Field | Rules |
|---|---|
| `lead_id` | UUID v4 generated in the browser at submission. Idempotency key: resubmitting the same `lead_id` updates the existing record. |
| `event_id` | Sent as `eventID` with the Pixel `Lead` event and as `event_id` with the Conversions API event, so Meta deduplicates the pair. Currently equal to `lead_id`. |
| `contact.phone` | E.164 (`+1` followed by 10 digits). |
| `contact.state` | Two-letter uppercase US state code. |
| `consent.given` | Must be `true`; the API rejects the submission otherwise. |
| `attribution.fbc` | `_fbc` cookie if present, otherwise built from `fbclid` as `fb.1.<ms timestamp>.<fbclid>`. |
| `attribution.fbp` | `_fbp` cookie set by the Pixel; `null` if unavailable. |
| `quiz.answers` | Question key to answer value. Keys are defined by the funnel steps. |

## 2. Vercel function to n8n webhook

The function validates and normalizes the body, then forwards it with a `context` block the browser cannot supply reliably:

```json
{
  "...": "all fields from hop 1",
  "context": {
    "ip": "203.0.113.10",
    "user_agent": "Mozilla/5.0 ...",
    "received_at": "2026-09-17T10:15:30.412Z"
  }
}
```

Request header: `X-LeadRelay-Secret: <shared secret>`. The n8n webhook rejects requests without it.

### Response

| Status | Meaning | Caller behavior |
|---|---|---|
| `200` `{ "ok": true, "lead_id": "..." }` | Lead stored in Airtable | Done |
| `403` | Missing or wrong secret (rejected by the n8n webhook) | Do not retry; alert |
| `4xx` other | Payload rejected | Do not retry; alert |
| `5xx` / timeout | Automation layer unavailable | Retry, then fall back |

The response is returned after the Airtable write succeeds, not immediately on receipt, so a `200` means the lead is persisted. Conversions API delivery happens after the response and is tracked on the record (`CAPI Status`).
