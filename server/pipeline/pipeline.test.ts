import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { Deps, EnrichedLead, Env } from '../deps.js'
import { runPipeline, usesN8n } from './index.js'

const lead: EnrichedLead = {
  lead_id: '3f1c2a9e-8b7d-4c1e-9f0a-2d6b5e4c3a21',
  event_id: '3f1c2a9e-8b7d-4c1e-9f0a-2d6b5e4c3a21',
  submitted_at: '2026-09-17T10:15:30.000Z',
  is_test: true,
  contact: {
    first_name: "Jane O'Neil",
    last_name: 'Doe',
    email: 'jane@example.com',
    phone: '+14155552671',
    zip: '10001',
    state: 'NY',
  },
  quiz: { qualified: true, answers: { age: '50_54' } },
  consent: {
    given: true,
    version: 'tcpa-2026-09-v2',
    text: 'I agree to be contacted.',
    timestamp: '2026-09-17T10:15:28.000Z',
  },
  attribution: {
    utm_source: 'facebook',
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    fbclid: 'abc123',
    fbc: 'fb.1.1758103800000.abc123',
    fbp: 'fb.1.1758103700000.9876',
    referrer: null,
    page_url: 'https://leadrelay-funnel.vercel.app/',
    variant: 'v1',
  },
  context: { ip: '198.51.100.7', user_agent: 'Vitest', received_at: '2026-09-17T10:15:31.000Z' },
}

const env = {
  AIRTABLE_BASE_ID: 'appTEST',
  AIRTABLE_TOKEN: 'patTEST.secret',
  META_PIXEL_ID: '1234567890',
  META_CAPI_TOKEN: 'EAAtokensecret1234567890',
  SLACK_WEBHOOK_URL: 'https://hooks.slack.test/x',
}

const AIRTABLE = 'https://api.airtable.com'
const META = 'https://graph.facebook.com'

type Stub = { status: number; body?: unknown } | Error

const upsertOk: Stub = { status: 200, body: { records: [{ id: 'recTEST', fields: {} }] } }
const metaOk: Stub = { status: 200, body: { events_received: 1 } }

function setup(routes: Record<string, Stub[]>, overrides: Partial<Env> = {}) {
  const calls: Array<{ url: string; body: Record<string, never>; headers: Record<string, string> }> = []
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const key = Object.keys(routes).find((prefix) => String(url).startsWith(prefix))
    if (!key) throw new Error(`unexpected request to ${String(url)}`)
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? 'null')),
      headers: (init?.headers ?? {}) as Record<string, string>,
    })
    const queue = routes[key]
    const next = queue.length > 1 ? queue.shift()! : queue[0]
    if (next instanceof Error) throw next
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status })
  })

  const deps: Deps = {
    env: { ...env, ...overrides },
    fetch: fetch as unknown as typeof globalThis.fetch,
    sleep: async () => {},
    log: () => {},
  }
  return { deps, calls }
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
const hosts = (calls: Array<{ url: string }>) => calls.map((call) => new URL(call.url).host)

describe('usesN8n', () => {
  it('selects n8n only when both the URL and the secret are present', () => {
    expect(usesN8n({})).toBe(false)
    expect(usesN8n({ N8N_WEBHOOK_URL: 'https://n8n.test/hook' })).toBe(false)
    expect(usesN8n({ N8N_WEBHOOK_URL: 'https://n8n.test/hook', N8N_WEBHOOK_SECRET: 's' })).toBe(true)
  })
})

describe('runPipeline', () => {
  it('stores the lead, then sends the event and records delivery', async () => {
    const { deps, calls } = setup({ [AIRTABLE]: [upsertOk, { status: 200 }], [META]: [metaOk] })
    const result = await runPipeline(lead, deps)

    expect(result).toMatchObject({ ok: true, capi: 'sent' })
    expect(hosts(calls)).toEqual(['api.airtable.com', 'graph.facebook.com', 'api.airtable.com'])

    const record = (calls[0].body as unknown as { records: Array<{ fields: Record<string, unknown> }> }).records[0]
      .fields
    expect(record).toMatchObject({
      'Lead ID': lead.lead_id,
      'CAPI Status': 'Pending',
      'Ingest Path': 'Live',
      Routing: 'Standard',
      'Qualification Status': 'Qualified',
    })
    // Empty attribution values are omitted so a replay cannot blank out a filled column.
    expect(record).not.toHaveProperty('UTM Medium')

    const marked = (calls[2].body as unknown as { fields: Record<string, unknown> }).fields
    expect(marked).toMatchObject({ 'CAPI Status': 'Sent', 'CAPI Attempts': 1, 'CAPI Last Error': null })
  })

  it('sends the Pixel event ID and hashes personal data, leaving matchable fields in the clear', async () => {
    const { deps, calls } = setup({ [AIRTABLE]: [upsertOk, { status: 200 }], [META]: [metaOk] })
    await runPipeline(lead, deps)

    const event = (calls[1].body as unknown as { data: Array<Record<string, never>> }).data[0]
    expect(event).toMatchObject({ event_name: 'Lead', event_id: lead.event_id, action_source: 'website' })

    const user = event.user_data as unknown as Record<string, string[] | string>
    expect(user.em).toEqual([sha256('jane@example.com')])
    expect(user.ph).toEqual([sha256('14155552671')])
    expect(user.fn).toEqual([sha256('janeoneil')])
    expect(user.zp).toEqual([sha256('10001')])
    expect(user.client_ip_address).toBe('198.51.100.7')
    expect(user.fbc).toBe('fb.1.1758103800000.abc123')

    // Quiz answers are health details on this funnel and never reach an ad platform.
    expect(JSON.stringify(calls[1].body)).not.toContain('50_54')
    expect(JSON.stringify(calls[1].body)).not.toContain('jane@example.com')
  })

  it('treats HTTP 200 with events_received 0 as a failed delivery', async () => {
    const { deps, calls } = setup({
      [AIRTABLE]: [upsertOk, { status: 200 }],
      [META]: [{ status: 200, body: { events_received: 0 } }],
    })
    const result = await runPipeline(lead, deps)

    expect(result).toMatchObject({ ok: true, capi: 'failed' })
    const marked = (calls[2].body as unknown as { fields: Record<string, unknown> }).fields
    expect(marked['CAPI Status']).toBe('Failed')
    expect(marked['CAPI Last Error']).toContain('events_received was 0')
  })

  it('stores a sanitized reason when Meta rejects the event, keeping the token out of the record', async () => {
    const { deps, calls } = setup({
      [AIRTABLE]: [upsertOk, { status: 200 }],
      [META]: [
        {
          status: 400,
          body: {
            error: {
              message: 'Invalid OAuth access token Bearer EAAtokensecret1234567890',
              type: 'OAuthException',
              code: 190,
              fbtrace_id: 'Ab3',
            },
          },
        },
      ],
    })
    const result = await runPipeline(lead, deps)

    expect(result).toMatchObject({ ok: true, capi: 'failed' })
    const error = String(
      (calls[2].body as unknown as { fields: Record<string, unknown> }).fields['CAPI Last Error'],
    )
    expect(error).toContain('HTTP 400')
    expect(error).toContain('OAuthException')
    expect(error).toContain('code 190')
    expect(error).toContain('[REDACTED]')
    expect(error).not.toContain('EAAtokensecret')
  })

  it('retries a 503 from Meta but not a 400', async () => {
    const retried = setup({ [AIRTABLE]: [upsertOk, { status: 200 }], [META]: [{ status: 503 }, metaOk] })
    expect(await runPipeline(lead, retried.deps)).toMatchObject({ capi: 'sent' })
    expect(hosts(retried.calls).filter((host) => host === 'graph.facebook.com')).toHaveLength(2)

    const rejected = setup({ [AIRTABLE]: [upsertOk, { status: 200 }], [META]: [{ status: 400 }] })
    expect(await runPipeline(lead, rejected.deps)).toMatchObject({ capi: 'failed' })
    expect(hosts(rejected.calls).filter((host) => host === 'graph.facebook.com')).toHaveLength(1)
  })

  it('reports a storage failure without attempting delivery', async () => {
    const { deps, calls } = setup({ [AIRTABLE]: [{ status: 422, body: { error: { type: 'INVALID_REQUEST' } } }] })
    const result = await runPipeline(lead, deps)

    expect(result).toEqual({ ok: false, reason: 'HTTP 422 | INVALID_REQUEST' })
    expect(hosts(calls)).toEqual(['api.airtable.com'])
  })

  it('stores the lead and skips the event when Meta is not configured', async () => {
    const { deps, calls } = setup({ [AIRTABLE]: [upsertOk] }, { META_PIXEL_ID: '', META_CAPI_TOKEN: '' })
    const result = await runPipeline(lead, deps)

    expect(result).toEqual({ ok: true, capi: 'skipped' })
    expect(hosts(calls)).toEqual(['api.airtable.com'])
    const record = (calls[0].body as unknown as { records: Array<{ fields: Record<string, unknown> }> }).records[0]
      .fields
    expect(record['CAPI Status']).toBe('Skipped')
  })

  it('adds the test event code only while one is configured', async () => {
    const { deps, calls } = setup(
      { [AIRTABLE]: [upsertOk, { status: 200 }], [META]: [metaOk] },
      { META_TEST_EVENT_CODE: 'TEST1234' },
    )
    await runPipeline(lead, deps)
    expect(calls[1].body).toMatchObject({ test_event_code: 'TEST1234' })
  })
})
