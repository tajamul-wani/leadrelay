import { createHash } from 'node:crypto'
import { fail, succeed, type Deps, type EnrichedLead, type Outcome } from '../deps.js'
import { describeThrown, summarizeApiError } from './redact.js'

// Meta Conversions API delivery for the in-process pipeline.
//
// The event carries the same `event_id` as the browser Pixel event, so Meta
// counts one conversion however many of the two arrive. Personal data is
// normalized and then SHA-256 hashed; only the fields Meta cannot accept hashed
// (IP, user agent, fbc, fbp) are sent in the clear. Quiz answers are never sent:
// for a disability funnel those are health details and an ad platform has no
// business holding them.

const DEFAULT_GRAPH_VERSION = 'v24.0'
const TIMEOUT_MS = 10_000
const RETRY_DELAYS_MS = [500, 2000]

/** Meta rejects events older than this, which also bounds how long a replay is worth attempting. */
export const MAX_EVENT_AGE_DAYS = 7

type HashedField = [string]

export type CapiEvent = {
  data: Array<{
    event_name: 'Lead'
    event_time: number
    event_id: string
    action_source: 'website'
    event_source_url: string
    user_data: Record<string, string | HashedField>
    custom_data: { funnel_variant: string }
  }>
  test_event_code?: string
}

export function buildCapiEvent(lead: EnrichedLead, testEventCode?: string): CapiEvent {
  const { contact, attribution, context } = lead

  const userData: Record<string, string | HashedField> = {
    em: hash(contact.email),
    // Digits only, including the country code: +14155552671 becomes 14155552671.
    ph: hash(contact.phone.replace(/\D/g, '')),
    fn: hash(letters(contact.first_name)),
    ln: hash(letters(contact.last_name)),
    st: hash(contact.state),
    zp: hash(contact.zip),
    country: hash('us'),
    external_id: hash(lead.lead_id),
  }
  // Sent unhashed because Meta matches on them directly.
  if (context.ip) userData.client_ip_address = context.ip
  if (context.user_agent) userData.client_user_agent = context.user_agent
  if (attribution.fbc) userData.fbc = attribution.fbc
  if (attribution.fbp) userData.fbp = attribution.fbp

  const event: CapiEvent = {
    data: [
      {
        event_name: 'Lead',
        event_time: eventTime(lead.submitted_at),
        event_id: lead.event_id,
        action_source: 'website',
        event_source_url: attribution.page_url,
        user_data: userData,
        custom_data: { funnel_variant: attribution.variant },
      },
    ],
  }
  if (testEventCode) event.test_event_code = testEventCode
  return event
}

/**
 * Posts the event and confirms Meta actually accepted it.
 *
 * Meta answers a rejected event with HTTP 200 and `events_received: 0`, so the
 * status code alone is not evidence of delivery.
 */
export async function sendCapiEvent(event: CapiEvent, deps: Deps): Promise<Outcome<null>> {
  const { env, sleep } = deps
  const version = env.META_GRAPH_VERSION || DEFAULT_GRAPH_VERSION
  const url = `https://graph.facebook.com/${version}/${env.META_PIXEL_ID}/events`

  let reason = 'unknown error'
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const result = await attemptSend(url, event, deps)
    if (result.ok) return succeed(null)
    reason = result.reason
    if (!result.retryable) break
    if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt])
  }
  return fail(reason)
}

type SendResult = { ok: true } | { ok: false; reason: string; retryable: boolean }

async function attemptSend(
  url: string,
  event: CapiEvent,
  { env, fetch }: Deps,
): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.META_CAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const payload = (await res.json().catch(() => ({}))) as { events_received?: number }

    if (!res.ok) {
      // A rejected payload or an invalid token will not succeed on retry.
      const retryable = res.status >= 500 || res.status === 429
      return { ok: false, reason: summarizeApiError(res.status, payload), retryable }
    }
    if (!payload.events_received) {
      return { ok: false, reason: 'HTTP 200 but events_received was 0', retryable: false }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: describeThrown(error), retryable: true }
  }
}

const hash = (value: string): HashedField => [
  createHash('sha256').update(value.trim().toLowerCase()).digest('hex'),
]

/** Meta expects names without punctuation, spacing or accents stripped to letters. */
const letters = (value: string) => value.toLowerCase().replace(/[^\p{L}]/gu, '')

/** Meta rejects timestamps in the future, which a skewed client clock can produce. */
function eventTime(submittedAt: string): number {
  const now = Math.floor(Date.now() / 1000)
  const submitted = Math.floor(Date.parse(submittedAt) / 1000)
  return Number.isFinite(submitted) ? Math.min(submitted, now) : now
}
