import { describe, expect, it } from 'vitest'
import { leadSubmissionSchema, normalizeUsPhone } from './lead.js'

const valid = {
  lead_id: '3f1c2a9e-8b7d-4c1e-9f0a-2d6b5e4c3a21',
  event_id: '3f1c2a9e-8b7d-4c1e-9f0a-2d6b5e4c3a21',
  submitted_at: '2026-09-17T10:15:30.000Z',
  is_test: false,
  contact: {
    first_name: '  Jane  ',
    last_name: 'Doe',
    email: ' Jane.Doe@Example.COM ',
    phone: '(415) 555-2671',
    zip: '94103',
    state: 'CA',
  },
  quiz: { qualified: true, answers: { age: '50_64' } },
  consent: { given: true, version: 'tcpa-v1', text: 'I agree', timestamp: '2026-09-17T10:15:28.000Z' },
  attribution: {
    utm_source: 'facebook', utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
    fbclid: null, fbc: null, fbp: null, referrer: null,
    page_url: 'https://leadrelay.vercel.app/', variant: 'control',
  },
}

describe('normalizeUsPhone', () => {
  it.each([
    ['(415) 555-2671', '+14155552671'],
    ['415.555.2671', '+14155552671'],
    ['+1 415 555 2671', '+14155552671'],
    ['14155552671', '+14155552671'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeUsPhone(input)).toBe(expected)
  })

  it.each(['555-2671', '015-555-2671', '415-155-2671', '+44 20 7946 0958'])('rejects %s', (input) => {
    expect(normalizeUsPhone(input)).toBeNull()
  })
})

describe('leadSubmissionSchema', () => {
  it('normalizes contact fields', () => {
    const lead = leadSubmissionSchema.parse(valid)
    expect(lead.contact).toMatchObject({ first_name: 'Jane', email: 'jane.doe@example.com', phone: '+14155552671' })
  })

  it('rejects submissions without consent', () => {
    const result = leadSubmissionSchema.safeParse({ ...valid, consent: { ...valid.consent, given: false } })
    expect(result.success).toBe(false)
  })

  it('rejects unknown states and bad ZIP codes', () => {
    const result = leadSubmissionSchema.safeParse({ ...valid, contact: { ...valid.contact, state: 'XX', zip: '9410' } })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((i) => i.path.join('.'))).toEqual(['contact.zip', 'contact.state'])
  })
})
