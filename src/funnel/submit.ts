import { CONSENT_TEXT, CONSENT_VERSION } from '../../shared/compliance'
import type { LeadSubmission } from '../../shared/lead'
import { loadAttribution, readCookie, resolveFbc } from '../lib/attribution'
import { trackLead } from '../lib/pixel'
import { isQualified, QUIZ_STEPS, type Answers } from './steps'

export const FUNNEL_VARIANT = 'v1'

// A submitted lead is written to localStorage before the request is sent and
// removed only after the API confirms it. If the request fails, or the tab is
// closed mid-request, the lead is resent on the next visit with the same
// lead_id, which the pipeline treats as an idempotent upsert.
const OUTBOX_KEY = 'leadrelay.outbox'
const RETRY_DELAYS_MS = [800, 2000, 4000]

export type ContactInput = {
  first_name: string
  last_name: string
  email: string
  phone: string
}

export type SubmitResult = { ok: true } | { ok: false; retryable: boolean; message: string }

export function buildLead(answers: Answers, contact: ContactInput, honeypot: string): LeadSubmission {
  const attribution = loadAttribution()
  const cookies = document.cookie
  const leadId = crypto.randomUUID()
  const now = new Date().toISOString()
  const quizIds = new Set(QUIZ_STEPS.map((step) => step.id))

  return {
    lead_id: leadId,
    event_id: leadId,
    submitted_at: now,
    is_test: sessionStorage.getItem('leadrelay.is_test') === '1',
    ...(honeypot ? { website: honeypot } : {}),
    contact: { ...contact, zip: answers.zip, state: answers.state as LeadSubmission['contact']['state'] },
    quiz: {
      qualified: isQualified(answers),
      answers: Object.fromEntries(Object.entries(answers).filter(([id]) => quizIds.has(id))),
    },
    consent: { given: true, version: CONSENT_VERSION, text: CONSENT_TEXT, timestamp: now },
    attribution: {
      utm_source: attribution?.utm_source ?? null,
      utm_medium: attribution?.utm_medium ?? null,
      utm_campaign: attribution?.utm_campaign ?? null,
      utm_content: attribution?.utm_content ?? null,
      utm_term: attribution?.utm_term ?? null,
      fbclid: attribution?.fbclid ?? null,
      fbc: resolveFbc(readCookie(cookies, '_fbc'), attribution?.fbclid ?? null, attribution?.landed_at ?? Date.now()),
      fbp: readCookie(cookies, '_fbp'),
      referrer: attribution?.referrer ?? null,
      page_url: attribution?.landing_url ?? window.location.href,
      variant: FUNNEL_VARIANT,
    },
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function post(lead: LeadSubmission): Promise<SubmitResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
        keepalive: true,
      })
      if (res.ok) return { ok: true }
      // 4xx means the data was rejected; retrying the same payload cannot succeed.
      if (res.status < 500 && res.status !== 429) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        return { ok: false, retryable: false, message: body.message ?? 'Please check your details and try again.' }
      }
    } catch {
      // Network error: fall through to retry.
    }
    if (attempt >= RETRY_DELAYS_MS.length) {
      return { ok: false, retryable: true, message: 'We could not send your details. Please check your connection and try again.' }
    }
    await sleep(RETRY_DELAYS_MS[attempt])
  }
}

/** Sends a lead, keeping it in the outbox until the API accepts it. Fires the Pixel Lead event on success. */
export async function submitLead(lead: LeadSubmission): Promise<SubmitResult> {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(lead))
  const result = await post(lead)
  if (result.ok || !result.retryable) localStorage.removeItem(OUTBOX_KEY)
  if (result.ok) trackLead(lead.event_id, lead.attribution.variant)
  return result
}

/** Resends a lead left in the outbox by a previous failed or interrupted submission. */
export async function flushOutbox(): Promise<void> {
  const raw = localStorage.getItem(OUTBOX_KEY)
  if (!raw) return
  try {
    await submitLead(JSON.parse(raw) as LeadSubmission)
  } catch {
    localStorage.removeItem(OUTBOX_KEY)
  }
}
