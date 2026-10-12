import { RESTRICTED_STATES } from '../../shared/compliance.js'
import type { Deps, EnrichedLead, Env } from '../deps.js'
import { patchRecord, upsertLead } from './airtable.js'
import { buildCapiEvent, sendCapiEvent } from './capi.js'
import { toAirtableFields } from './fields.js'

// The lead pipeline, in process.
//
// This performs the same work as the n8n Lead Intake workflow: store the lead,
// then send the deduplicated Conversions API event and record the delivery state
// on the record.
//
// Why both exist. n8n earns its place where a workflow changes often and
// somebody needs to see what happened on a given run, so it stays the default
// when it is configured. But the lead path is the revenue path: it belongs in
// version control, under test, with no dependency on a third-party execution
// quota. Running it here is also what keeps the public demo working.
//
// Delivery state is deliberately ordered. The lead is stored first and the
// response depends only on that, because a stored lead with a failed Meta event
// is a reporting problem, while a lost lead is money already spent on the click.

export type PipelineResult =
  /** The lead is stored. `capi` reports what happened to the conversion event. */
  | { ok: true; capi: 'sent' | 'failed' | 'skipped'; reason?: string }
  | { ok: false; reason: string }

export function usesN8n(env: Env): boolean {
  return Boolean(env.N8N_WEBHOOK_URL && env.N8N_WEBHOOK_SECRET)
}

export async function runPipeline(lead: EnrichedLead, deps: Deps): Promise<PipelineResult> {
  const { env, log } = deps

  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_TOKEN) {
    return { ok: false, reason: 'Airtable is not configured' }
  }

  const metaConfigured = Boolean(env.META_PIXEL_ID && env.META_CAPI_TOKEN)

  const stored = await upsertLead(
    toAirtableFields(lead, {
      ingestPath: lead.ingest_path === 'replay' ? 'Replay' : 'Live',
      restrictedStates: RESTRICTED_STATES,
      capiStatus: metaConfigured ? 'Pending' : 'Skipped',
    }),
    deps,
  )
  if (!stored.ok) return { ok: false, reason: stored.reason }

  if (!metaConfigured) {
    log('Meta is not configured; conversion event skipped', { lead_id: lead.lead_id })
    return { ok: true, capi: 'skipped' }
  }

  const event = buildCapiEvent(lead, env.META_TEST_EVENT_CODE)
  const delivery = await sendCapiEvent(event, deps)
  const attempts = stored.value.capiAttempts + 1

  if (delivery.ok) {
    await patchRecord(
      stored.value.recordId,
      {
        'CAPI Status': 'Sent',
        'CAPI Sent At': new Date().toISOString(),
        'CAPI Attempts': attempts,
        'CAPI Last Error': null,
      },
      deps,
    )
    return { ok: true, capi: 'sent' }
  }

  // The lead is safe; only the conversion event failed. Recording the attempt
  // and the sanitized reason is what makes the failure findable and replayable.
  await patchRecord(
    stored.value.recordId,
    {
      'CAPI Status': 'Failed',
      'CAPI Attempts': attempts,
      'CAPI Last Error': delivery.reason,
    },
    deps,
  )
  return { ok: true, capi: 'failed', reason: delivery.reason }
}
