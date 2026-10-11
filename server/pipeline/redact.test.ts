import { describe, expect, it } from 'vitest'
import { describeThrown, redact, summarizeApiError } from './redact.js'

describe('redact', () => {
  it('removes every credential shape this system handles', () => {
    const text = [
      'Authorization: Bearer EAAGm0PX4ZCpsBA1example',
      'token EAAabcdefghijklmnop1234567890',
      'airtable patAbCdEfGhIjKlMn.0123456789abcdef0123456789abcdef',
      'slack xoxb-1234567890-abcdef',
    ].join(' | ')
    const safe = redact(text)

    expect(safe).not.toMatch(/EAA[A-Za-z0-9]/)
    expect(safe).not.toMatch(/pat[A-Za-z0-9]{10,}\./)
    expect(safe).not.toContain('xoxb-')
    expect(safe.match(/\[REDACTED\]/g)).toHaveLength(4)
  })
})

describe('summarizeApiError', () => {
  it('summarizes a Meta error without carrying the token through', () => {
    const summary = summarizeApiError(401, {
      error: {
        message: 'Malformed access token Bearer EAAtokenexample1234567890',
        type: 'OAuthException',
        code: 190,
        fbtrace_id: 'A2kPUHv3',
      },
    })
    expect(summary).toBe(
      'HTTP 401 | OAuthException | code 190 | Malformed access token [REDACTED] | fbtrace_id A2kPUHv3',
    )
  })

  it('handles the Airtable shapes, both string and object', () => {
    expect(summarizeApiError(404, { error: 'NOT_FOUND' })).toBe('HTTP 404 | NOT_FOUND')
    expect(summarizeApiError(422, { error: { type: 'INVALID_REQUEST', message: 'Unknown field' } })).toBe(
      'HTTP 422 | INVALID_REQUEST | Unknown field',
    )
  })

  it('still produces a usable line when the body is empty or unparseable', () => {
    expect(summarizeApiError(500, {})).toBe('HTTP 500')
    expect(summarizeApiError(502, 'Bad Gateway')).toBe('HTTP 502 | Bad Gateway')
  })
})

describe('describeThrown', () => {
  it('names the underlying cause, because a bare TypeError says nothing', () => {
    // Node reports every connection problem this way; the code is the diagnosis.
    const failed = new TypeError('fetch failed', { cause: { code: 'ETIMEDOUT' } })
    expect(describeThrown(failed)).toBe('TypeError (ETIMEDOUT)')
  })

  it('reports a timeout as a timeout and anything unknown as a network error', () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    expect(describeThrown(timeout)).toBe('timeout')
    expect(describeThrown('boom')).toBe('network error')
  })

  it('never includes the message, which can contain the request URL', () => {
    const failed = new TypeError('fetch failed for https://api.airtable.com/v0/appSECRET/Leads')
    expect(describeThrown(failed)).toBe('TypeError')
  })
})
