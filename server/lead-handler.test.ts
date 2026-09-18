import { describe, expect, it, vi } from 'vitest'
import { clientIp, handleLead, type Deps } from './lead-handler.js'

const lead = {
  lead_id: '3f1c2a9e-8b7d-4c1e-9f0a-2d6b5e4c3a21',
  event_id: '3f1c2a9e-8b7d-4c1e-9f0a-2d6b5e4c3a21',
  submitted_at: '2026-09-17T10:15:30.000Z',
  is_test: true,
  contact: { first_name: 'Jane', last_name: 'Doe', email: 'jane@example.com', phone: '(415) 555-2671', zip: '10001', state: 'NY' },
  quiz: { qualified: true, answers: { age: '50_54' } },
  consent: { given: true, version: 'v1', text: 'I agree', timestamp: '2026-09-17T10:15:28.000Z' },
  attribution: {
    utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
    fbclid: null, fbc: null, fbp: null, referrer: null, page_url: 'https://leadrelay.vercel.app/', variant: 'v1',
  },
}

const env = {
  N8N_WEBHOOK_URL: 'https://n8n.test/webhook/leadrelay-intake',
  N8N_WEBHOOK_SECRET: 'secret',
  AIRTABLE_BASE_ID: 'appTEST',
  AIRTABLE_TOKEN: 'patTEST',
  SLACK_WEBHOOK_URL: 'https://hooks.slack.test/x',
}

function setup(responses: Record<string, Array<number | Error>>) {
  const calls: Array<{ url: string; body: string }> = []
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const key = Object.keys(responses).find((prefix) => String(url).startsWith(prefix))!
    calls.push({ url: String(url), body: String(init?.body ?? '') })
    const next = responses[key].length > 1 ? responses[key].shift()! : responses[key][0]
    if (next instanceof Error) throw next
    return new Response('{}', { status: next })
  })
  const deps: Deps = { env, fetch: fetch as unknown as typeof globalThis.fetch, sleep: async () => {}, log: () => {} }
  return { deps, calls }
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://leadrelay.test/api/lead', {
    method: 'POST',
    headers: { 'user-agent': 'Vitest', 'x-forwarded-for': '198.51.100.7, 10.0.0.1', ...headers },
    body: JSON.stringify(body),
  })

describe('handleLead', () => {
  it('forwards a valid lead to n8n with context and the secret header', async () => {
    const { deps, calls } = setup({ 'https://n8n.test': [200] })
    const res = await handleLead(post(lead), deps)
    expect(res.status).toBe(200)
    const sent = JSON.parse(calls[0].body)
    expect(sent.contact.phone).toBe('+14155552671')
    expect(sent.context).toMatchObject({ ip: '198.51.100.7', user_agent: 'Vitest' })
    expect(vi.mocked(deps.fetch).mock.calls[0][1]?.headers).toMatchObject({ 'X-LeadRelay-Secret': 'secret' })
  })

  it('rejects invalid payloads without calling n8n', async () => {
    const { deps, calls } = setup({ 'https://n8n.test': [200] })
    const res = await handleLead(post({ ...lead, contact: { ...lead.contact, phone: '123' } }), deps)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ fields: ['contact.phone'] })
    expect(calls).toHaveLength(0)
  })

  it('silently drops honeypot submissions', async () => {
    const { deps, calls } = setup({ 'https://n8n.test': [200] })
    const res = await handleLead(post({ ...lead, website: 'http://spam.test' }), deps)
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('rejects restricted states on the server', async () => {
    const { deps, calls } = setup({ 'https://n8n.test': [200] })
    const res = await handleLead(post({ ...lead, contact: { ...lead.contact, state: 'CA', zip: '90210' } }), deps)
    expect(res.status).toBe(422)
    expect(calls).toHaveLength(0)
  })

  it('retries transient n8n failures', async () => {
    const { deps, calls } = setup({ 'https://n8n.test': [503, 200] })
    const res = await handleLead(post(lead), deps)
    expect(res.status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  it('does not retry a 403 and falls back to Airtable with a Slack alert', async () => {
    const { deps, calls } = setup({ 'https://n8n.test': [403], 'https://api.airtable.com': [200], 'https://hooks.slack.test': [200] })
    const res = await handleLead(post(lead), deps)
    expect(res.status).toBe(202)
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['n8n.test', 'api.airtable.com', 'hooks.slack.test'])
    const record = JSON.parse(calls[1].body).records[0].fields
    expect(record).toMatchObject({ 'Lead ID': lead.lead_id, 'CAPI Status': 'Pending', 'Ingest Path': 'Fallback' })
    const alert = JSON.parse(calls[2].body)
    expect(alert.blocks[0].text.text).toContain('Lead stored via fallback')
    expect(alert.blocks[1].fields.map((f: { text: string }) => f.text).join(' ')).toContain(lead.lead_id)
    expect(calls[2].body).not.toContain('jane@example.com')
    expect(calls[2].body).not.toContain('+14155552671')
  })

  it('returns 503 and raises a critical alert when n8n and Airtable are both unavailable', async () => {
    const { deps, calls } = setup({ 'https://n8n.test': [new Error('down')], 'https://api.airtable.com': [500], 'https://hooks.slack.test': [200] })
    const res = await handleLead(post(lead), deps)
    expect(res.status).toBe(503)
    const alert = JSON.parse(calls.at(-1)!.body)
    expect(alert.blocks[0].text.text).toContain('Lead could not be stored')
    expect(alert.text).toContain(':rotating_light:')
  })
})

describe('clientIp', () => {
  it('uses the first x-forwarded-for address', () => {
    expect(clientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }))).toBe('203.0.113.9')
  })
})
