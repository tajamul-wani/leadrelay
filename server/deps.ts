import type { NormalizedLead } from '../shared/lead.js'

// Configuration and injected dependencies shared by the request handler and the
// in-process pipeline. Everything the server touches arrives through Deps, so
// tests drive the whole path without network access or a clock.

export type Env = {
  /** When set together with the secret, leads are forwarded to n8n instead of being processed here. */
  N8N_WEBHOOK_URL?: string
  N8N_WEBHOOK_SECRET?: string
  AIRTABLE_BASE_ID?: string
  AIRTABLE_TOKEN?: string
  SLACK_WEBHOOK_URL?: string
  /** Meta dataset (pixel) ID and Conversions API token, used by the in-process pipeline. */
  META_PIXEL_ID?: string
  META_CAPI_TOKEN?: string
  META_GRAPH_VERSION?: string
  /** Set only while verifying events in Meta Events Manager. Leave empty in production. */
  META_TEST_EVENT_CODE?: string
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

/** Result of a step that either succeeded or failed with a reason safe to store. */
export type Outcome<T = null> = { ok: true; value: T } | { ok: false; reason: string }

export const succeed = <T>(value: T): Outcome<T> => ({ ok: true, value })
export const fail = (reason: string): Outcome<never> => ({ ok: false, reason })
