# LeadRelay

Lead capture pipeline for a multi-step eligibility funnel. A React funnel collects qualification answers and contact details, a serverless API validates and enriches each submission, and an n8n workflow stores the lead in Airtable and sends a deduplicated conversion event to the Meta Conversions API.

The demo funnel, BenefitBridge, is a Social Security disability benefits eligibility check.

## Architecture

```
Browser (React, Vite, TypeScript)
  |  Meta Pixel: PageView, QuizStepCompleted, Lead (eventID = lead_id)
  |
  |  POST /api/lead
  v
Vercel Function (api/lead.ts -> server/lead-handler.ts)
  |  validate and normalize (shared Zod schema)
  |  reject restricted states, drop honeypot submissions
  |  add client IP, user agent, receive time
  |
  |  then one of two interchangeable delivery paths:
  |
  +--> n8n: LeadRelay Lead Intake (n8n/lead-intake.json)
  |      when N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET are set.
  |      Retries on 5xx and timeouts; on failure the API writes the lead
  |      directly to Airtable (Ingest Path = Fallback, CAPI Status = Pending)
  |      and alerts Slack, so the lead is never lost.
  |
  +--> in-process pipeline (server/pipeline/)
         otherwise. Same steps, in TypeScript, under unit test.
  |
  |  both paths: upsert the Airtable record on Lead ID, respond only once it
  |  is stored, then send the Conversions API event and record its status
  v
Airtable: Leads table            Meta Conversions API
```

In both paths a success response means the lead is **stored**, not merely received. Every recovery decision downstream depends on that distinction.

## Ingest paths

The lead pipeline is implemented twice, on purpose.

| | n8n | In-process |
|---|---|---|
| Selected when | `N8N_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET` are set | Otherwise |
| Lives in | `n8n/lead-intake.json` | `server/pipeline/` |
| Strength | Every run is inspectable; steps can be changed without a deploy | Version controlled, unit tested, no third-party execution quota |
| Failure handling | API retries, then falls back to a direct Airtable write | Storage failure is reported directly; Airtable is already the destination |

n8n earns its place where a workflow changes often and somebody needs to see what happened on a given run. But the lead path is the revenue path, so it also belongs in version control and under test — and the public demo cannot depend on a metered execution quota. Keeping both, behind one environment switch, makes the trade-off explicit rather than theoretical.

Both paths write the same Airtable fields (`server/pipeline/fields.ts` mirrors the n8n `Validate Lead` node) and send the same deduplicated Conversions API event.

## Tech stack

| Layer | Technology |
|---|---|
| Funnel | React 19, React Router, TypeScript, Tailwind CSS 4, Vite |
| API | Vercel Functions (Node.js, Web `Request`/`Response`) |
| Validation | Zod schema shared by the browser and the API |
| Automation | n8n |
| Database | Airtable |
| Tracking | Meta Pixel, Meta Conversions API |
| Alerts | Slack (incoming webhook from the API, bot token from n8n) |
| Tests | Vitest (unit), Playwright (end-to-end) |

## Project structure

```
api/            Vercel Function entry points
server/         API request handling (validation, delivery, fallback, alerts)
  pipeline/     In-process lead pipeline: Airtable write, Conversions API, error sanitizing
shared/         Code used by both browser and API: lead schema, compliance settings, ZIP lookup
src/
  funnel/       Step definitions, branching, qualification, state, submission and outbox
  lib/          Attribution capture and Meta Pixel helpers
  pages/        Step and information pages
  components/   Layout and shared UI
n8n/            Exported n8n workflows (credentials not included)
scripts/        Airtable schema setup and pipeline test tooling
docs/           Payload contract
```

## Funnel

- **Step order:** ZIP code first, so people in restricted states are told immediately and are never asked health questions. The quiz steps follow, then contact details.
- **Steps as data:** defined in `src/funnel/steps.ts`. A step can be conditional (`when`), and answers to steps that become hidden are pruned.
- **One URL per step:** browser navigation works, and a typed URL beyond the first unanswered step redirects back to it.
- **Refresh-safe:** answers are kept in `sessionStorage`.
- **Qualification:** `isQualified` computes a non-blocking tier (`Qualified` or `Needs Review`). Every lead from a supported state can submit.
- **Consent:** a required, unchecked checkbox. The consent text names the submit button, and the text and its version are stored with each lead (`shared/compliance.ts`).
- **Accessibility:** targets WCAG 2.2 AA. Focus moves to the heading and the document title updates on each step; inputs use `autocomplete`, and errors are announced in text.

## Tracking and deduplication

- **Shared event ID:** each submission gets a UUID used as `lead_id`, the Pixel `eventID` and the Conversions API `event_id`. Meta deduplicates the browser and server events on this value.
- **Pixel event timing:** the `Lead` event fires only after the API accepts the submission.
- **Attribution:** UTM parameters and `fbclid` are captured on landing and kept for the session. `fbc` comes from the `_fbc` cookie or is built from `fbclid` (`fb.1.<timestamp>.<fbclid>`); `fbp` comes from the `_fbp` cookie.
- **Conversions API user data:**
  - Hashed with SHA-256 after normalization: email, phone, first and last name, state, ZIP, country, external ID.
  - Sent unhashed, as Meta requires: client IP address, user agent, `fbc` and `fbp`.
- **Custom data:** only the funnel variant. Quiz answers are never sent to Meta. Step events carry only the step number.

## Failure handling

| Failure | Behavior |
|---|---|
| Browser cannot reach the API | Up to 3 retries with backoff; the lead stays in a `localStorage` outbox and is resent on the next visit with the same `lead_id` |
| Invalid payload | 400 with the failing field paths; no retry |
| n8n returns 5xx or times out | API retries twice, then falls back to a direct Airtable write and a Slack alert |
| n8n rejects the request (4xx) | No retry; Airtable fallback and Slack alert |
| n8n and Airtable both unavailable | API returns 503; the browser outbox keeps the lead |
| Airtable write fails inside n8n | Webhook responds 503 and the execution is marked failed |
| Airtable write fails on the in-process path | 503 with a critical Slack alert; the browser outbox keeps the lead |
| Conversions API returns 5xx, 429 or times out | Retried twice with backoff before being recorded as failed |
| Conversions API call fails | Record set to `CAPI Status = Failed` with a sanitized error summary. The lead is stored, so the response is still a success |
| Conversions API returns 200 with `events_received: 0` | Treated as a failure. A status code is not evidence of delivery |

Error summaries stored or sent in alerts are reduced to status, error type, code, message and trace ID, with token patterns redacted. Raw HTTP client errors include request headers and are never stored.

### Alerting

Any failed n8n execution triggers `LeadRelay · Error Handler` (`n8n/error-handler.json`), which posts the workflow, failing step, lead ID, sanitized error and the impact on the lead to Slack. The API posts its own alerts for fallback writes (warning) and complete storage failures (critical).

### Replay

A lead whose conversion event never reached Meta is left at `CAPI Status` of `Pending` or `Failed` with its full payload in `Raw Payload`. Two implementations recover it, matching the two ingest paths:

- **`LeadRelay · Replay Failed`** (`n8n/replay-failed.json`) runs on a schedule every 15 minutes and reports counts to Slack.
- **`npm run replay`** (`scripts/replay-pending.mjs`) does the same from the repo, for deployments that do not run n8n.

Both select the same records — undelivered, with a stored payload, at least 10 minutes old so in-flight leads are left alone, and less than 7 days old because the Conversions API rejects older events — then re-post each payload with `ingest_path: "replay"`.

Recovery therefore runs through the same intake path as live traffic rather than a parallel implementation, which is deliberate: a separate recovery path only runs on your worst day, so it is the code you can least afford to trust. The replay marker means the record keeps saying how the lead originally arrived instead of being relabelled as live traffic, and the attempt counter carries forward rather than resetting.

Airtable upserts on `Lead ID` and Meta deduplicates on `event_id`, so replaying a lead that already succeeded is harmless.

Airtable writes use `performUpsert` on `Lead ID`, so retries and replays update the existing record instead of creating duplicates.

## Local development

Requirements: Node.js 24+.

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # funnel and /api/lead on http://localhost:5173
```

The Vite dev server serves `api/lead.ts` through a local middleware, so the funnel calls the same handler code locally as in production.

Append `?test=1` to the funnel URL to mark submissions as test leads (`Is Test` in Airtable).

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with the local API |
| `npm run build` | Type-check and production build |
| `npm test` | Unit tests |
| `npm run test:e2e` | End-to-end tests (Playwright, Pixel blocked and API stubbed) |
| `npm run lint` | Lint |
| `npm run setup:airtable` | Create or update the Airtable `Leads` table schema |
| `npm run test:lead` | Send a synthetic lead through the API (`--url`, `--invalid`, `--restricted`, or `--n8n` to target the webhook directly) |
| `npm run replay` | Re-deliver leads left at `CAPI Status` `Pending` or `Failed` (`--url`, `--dry-run`) |

## Environment variables

See `.env.example`. Only variables prefixed with `VITE_` are exposed to the browser.

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_META_PIXEL_ID` | Browser | Meta Pixel / dataset ID |
| `N8N_WEBHOOK_URL` | API, scripts | n8n Lead Intake webhook URL. Selects the n8n path when set with the secret |
| `N8N_WEBHOOK_SECRET` | API, scripts | Value of the `X-LeadRelay-Secret` header |
| `AIRTABLE_BASE_ID` | API, scripts | Airtable base ID |
| `AIRTABLE_TOKEN` | API | Token for the Airtable write |
| `META_PIXEL_ID` | API | Meta dataset ID, in-process path only |
| `META_CAPI_TOKEN` | API | Conversions API access token, in-process path only |
| `META_GRAPH_VERSION` | API | Graph API version. Defaults to `v24.0` |
| `META_TEST_EVENT_CODE` | API | Set only while verifying events in Events Manager |
| `SLACK_WEBHOOK_URL` | API | Slack incoming webhook for alerts |
| `AIRTABLE_SETUP_TOKEN` | Setup script | Token with schema read and write scopes |

## Airtable setup

1. Create a base.
2. Create a personal access token with `schema.bases:read` and `schema.bases:write`, limited to that base.
3. Set `AIRTABLE_BASE_ID` and `AIRTABLE_SETUP_TOKEN`, then run `npm run setup:airtable`.

The script is idempotent: it creates the `Leads` table if it's missing and otherwise adds only missing fields. Field definitions are in `scripts/setup-airtable.mjs`.

## n8n setup

Three workflows: `lead-intake.json` (webhook), `error-handler.json` (error trigger) and `replay-failed.json` (schedule).

1. Create credentials:
   - **Airtable Personal Access Token:** scopes `data.records:read`, `data.records:write`, `schema.bases:read`.
   - **Header Auth for Meta:** `Authorization: Bearer <Conversions API access token>`.
   - **Header Auth for the webhook:** `X-LeadRelay-Secret: <secret>`.
2. Import `n8n/lead-intake.json` and select the credentials on the Webhook, Airtable and Meta nodes. Imported credential references must be re-selected.
3. In the `Config` node, set:
   - `airtable_base_id`
   - `meta_pixel_id`
   - `meta_graph_version`
   - `restricted_states` (comma-separated)
   - `meta_test_event_code`, while testing in Meta Events Manager. Leave it empty in production.
4. Publish the intake workflow and set `N8N_WEBHOOK_URL` to its production webhook URL.
5. Import `error-handler.json`, select the Slack credential, and set it as the **Error Workflow** in the settings of the other two workflows. It does not need publishing.
6. Import `replay-failed.json`, select its credentials, set `airtable_base_id` and `intake_webhook_url` in its `Config` node, and publish it.

## Deployment

The project deploys to Vercel as a Vite static site with Functions in `api/`. `vercel.json` rewrites all non-API routes to `index.html` for client-side routing. Set the environment variables in the Vercel project settings.

## Continuous integration

`.github/workflows/ci.yml` runs lint, type-check and build, unit tests and end-to-end tests on every push and pull request. End-to-end tests stub `/api/lead` and block the Meta Pixel, so CI needs no credentials and makes no third-party calls. The Playwright report is uploaded as an artifact when a run fails.

## Payload contract

The request formats between the browser, the API and n8n are documented in `docs/lead-payload.md`.

## Known limitations

- **ZIP to state:** ZIP codes are mapped using 3-digit prefix ranges. The lookup doesn't confirm that a ZIP code exists, and a small number of ZIP codes that span two states resolve to one of them.
- **n8n retries:** node retry settings retry every error, including 4xx responses. The in-process path distinguishes retryable failures from permanent ones.
- **Replay is not scheduled without n8n:** `npm run replay` recovers undelivered leads from the repo, but nothing runs it automatically. The n8n workflow has a schedule trigger; the script needs cron or a scheduled function.
- **Duplicate people:** a person who completes the funnel twice creates two leads. Deduplication by email or phone is not implemented.
- **Replay window:** leads older than 7 days are not replayed, because the Conversions API rejects them. They stay visible in Airtable as `Pending` or `Failed`.
- **Single Airtable table:** delivery state lives on the lead record rather than in a separate delivery log, so a lead keeps only its most recent delivery attempt and error.
