import { RESTRICTED_STATES } from '../shared/compliance.js'
import { leadSubmissionSchema, type NormalizedLead } from '../shared/lead.js'

// Request handler behind POST /api/lead.
//
// 1. Validate and normalize the payload (shared schema with the funnel).
// 2. Add server-side context: client IP, user agent, receive time.
// 3. Forward to the n8n Lead Intake webhook, retrying transient failures.
// 4. If n8n cannot confirm the lead was stored, write it directly to Airtable
//    as a fallback (CAPI Status "Pending") and alert Slack, so the lead is never
//    lost and can be replayed through n8n later.

export type Env = {
  N8N_WEBHOOK_URL?: string
  N8N_WEBHOOK_SECRET?: string
  AIRTABLE_BASE_ID?: string
  AIRTABLE_TOKEN?: string
  SLACK_WEBHOOK_URL?: string
}

export type Deps = {
  env: Env
  fetch: typeof fetch
  sleep: (ms: number) => Promise<void>
  log: (message: string, detail?: Record<string, unknown>) => void
}

export type EnrichedLead = NormalizedLead & {
  context: { ip: string | null; user_agent: string | null; received_at: string }
}

const MAX_BODY_BYTES = 32_000
const N8N_TIMEOUT_MS = 15_000
const N8N_RETRY_DELAYS_MS = [500, 1500]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export async function handleLead(request: Request, deps: Deps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { ok: false, message: 'Method not allowed.' })

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, message: 'Request too large.' })

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return json(400, { ok: false, message: 'Invalid JSON.' })
  }

  const parsed = leadSubmissionSchema.safeParse(body)
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))]
    return json(400, { ok: false, message: 'Please check your details and try again.', fields })
  }

  const lead = parsed.data
  if (lead.website) {
    // Honeypot filled: respond as if accepted so bots get no signal, but store nothing.
    deps.log('Honeypot submission dropped', { lead_id: lead.lead_id })
    return json(200, { ok: true, lead_id: lead.lead_id })
  }
  if (RESTRICTED_STATES.includes(lead.contact.state)) {
    return json(422, { ok: false, message: 'We are not able to accept requests from your state.' })
  }

  const enriched: EnrichedLead = {
    ...lead,
    context: {
      ip: clientIp(request),
      user_agent: request.headers.get('user-agent'),
      received_at: new Date().toISOString(),
    },
  }

  const forwarded = await forwardToN8n(enriched, deps)
  if (forwarded.ok) return json(200, { ok: true, lead_id: lead.lead_id })

  deps.log('n8n forward failed, using Airtable fallback', { lead_id: lead.lead_id, reason: forwarded.reason })
  const stored = await storeFallback(enriched, deps)

  await alertSlack(
    stored.ok
      ? {
          severity: 'warning',
          title: 'Lead stored via fallback',
          impact: 'Lead is safe. Its Meta event is pending and the replay workflow will deliver it.',
          fields: {
            Lead: lead.lead_id,
            'Stored in': 'Airtable (direct write)',
            'Meta event': 'Pending replay',
            'n8n error': forwarded.reason,
          },
        }
      : {
          severity: 'critical',
          title: 'Lead could not be stored',
          impact: 'Action needed: the lead exists only in the visitor browser outbox and Vercel logs.',
          fields: {
            Lead: lead.lead_id,
            'n8n error': forwarded.reason,
            'Airtable error': stored.reason,
          },
        },
    deps,
  )

  if (stored.ok) return json(202, { ok: true, lead_id: lead.lead_id })
  return json(503, { ok: false, message: 'We could not send your details. Please try again in a moment.' })
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')
  return ip || null
}

type Outcome = { ok: true } | { ok: false; reason: string }

async function forwardToN8n(lead: EnrichedLead, { env, fetch, sleep }: Deps): Promise<Outcome> {
  if (!env.N8N_WEBHOOK_URL || !env.N8N_WEBHOOK_SECRET) return { ok: false, reason: 'n8n is not configured' }

  let reason = 'unknown error'
  for (let attempt = 0; attempt <= N8N_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(env.N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-LeadRelay-Secret': env.N8N_WEBHOOK_SECRET },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(N8N_TIMEOUT_MS),
      })
      if (res.ok) return { ok: true }
      reason = `HTTP ${res.status}`
      // 4xx (bad secret, rejected payload) will not succeed on retry.
      if (res.status < 500 && res.status !== 429) break
    } catch (error) {
      reason = error instanceof Error ? error.name : 'network error'
    }
    if (attempt < N8N_RETRY_DELAYS_MS.length) await sleep(N8N_RETRY_DELAYS_MS[attempt])
  }
  return { ok: false, reason }
}

/**
 * Minimal record for recovery: enough for the team to act on the lead, plus the
 * full payload so the replay workflow can run it through the normal n8n path.
 */
async function storeFallback(lead: EnrichedLead, { env, fetch }: Deps): Promise<Outcome> {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_TOKEN) return { ok: false, reason: 'Airtable is not configured' }

  try {
    const res = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/Leads`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ['Lead ID'] },
        typecast: true,
        records: [
          {
            fields: {
              'Lead ID': lead.lead_id,
              'Meta Event ID': lead.event_id,
              'Submitted At': lead.submitted_at,
              'Received At': lead.context.received_at,
              'First Name': lead.contact.first_name,
              'Last Name': lead.contact.last_name,
              Email: lead.contact.email,
              Phone: lead.contact.phone,
              ZIP: lead.contact.zip,
              State: lead.contact.state,
              'Qualification Status': lead.quiz.qualified ? 'Qualified' : 'Needs Review',
              'Consent Given': true,
              'CAPI Status': 'Pending',
              'Is Test': lead.is_test,
              'Ingest Path': 'Fallback',
              'Raw Payload': JSON.stringify(lead, null, 2),
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) return { ok: true }
    const detail = (await res.json().catch(() => ({}))) as { error?: { type?: string } | string }
    const type = typeof detail.error === 'string' ? detail.error : detail.error?.type
    return { ok: false, reason: `HTTP ${res.status}${type ? ` ${type}` : ''}` }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : 'network error' }
  }
}

type Alert = {
  severity: 'warning' | 'critical'
  title: string
  impact: string
  fields: Record<string, string>
}

/**
 * Posts an operational alert as Slack blocks: a titled header, labelled fields,
 * the impact, and the source. Messages carry lead IDs and error codes only,
 * never contact details.
 */
async function alertSlack(alert: Alert, { env, fetch, log }: Deps): Promise<void> {
  const icon = alert.severity === 'critical' ? ':rotating_light:' : ':warning:'
  const body = {
    text: `${icon} ${alert.title} — ${alert.fields.Lead ?? ''}`.trim(),
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: `${icon} ${alert.title}`, emoji: true } },
      {
        type: 'section',
        fields: Object.entries(alert.fields).map(([label, value]) => ({
          type: 'mrkdwn',
          text: `*${label}*\n\`${value}\``,
        })),
      },
      { type: 'section', text: { type: 'mrkdwn', text: alert.impact } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'Source: `api/lead` on Vercel' }] },
    ],
  }

  if (!env.SLACK_WEBHOOK_URL) {
    log('Slack is not configured; alert not sent', { title: alert.title, ...alert.fields })
    return
  }
  try {
    await fetch(env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    log('Slack alert failed', { title: alert.title, ...alert.fields })
  }
}
