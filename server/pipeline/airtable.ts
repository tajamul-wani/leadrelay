import { fail, succeed, type Deps, type Outcome } from '../deps.js'
import { describeThrown, summarizeApiError } from './redact.js'

// Airtable REST client for the in-process pipeline.
//
// Writes upsert on `Lead ID` rather than creating records, so a retry, a replay
// or a double submission updates the existing row instead of adding a second
// one. The lead UUID is the idempotency key for the whole system.

const TIMEOUT_MS = 10_000

export type StoredLead = {
  recordId: string
  /** Delivery attempts already recorded, so the pipeline can increment rather than overwrite. */
  capiAttempts: number
}

export async function upsertLead(
  fields: Record<string, unknown>,
  { env, fetch }: Deps,
): Promise<Outcome<StoredLead>> {
  const response = await request(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/Leads`,
    {
      performUpsert: { fieldsToMergeOn: ['Lead ID'] },
      typecast: true,
      records: [{ fields }],
    },
    { env, fetch },
  )
  if (!response.ok) return response

  const record = (response.value as { records?: Array<{ id?: string; fields?: Record<string, unknown> }> })
    .records?.[0]
  if (!record?.id) return fail('Airtable returned no record id')

  return succeed({
    recordId: record.id,
    capiAttempts: Number(record.fields?.['CAPI Attempts'] ?? 0),
  })
}

export async function patchRecord(
  recordId: string,
  fields: Record<string, unknown>,
  { env, fetch }: Deps,
): Promise<Outcome<null>> {
  const response = await request(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/Leads/${recordId}`,
    { typecast: true, fields },
    { env, fetch },
  )
  return response.ok ? succeed(null) : response
}

async function request(
  url: string,
  body: unknown,
  { env, fetch }: Pick<Deps, 'env' | 'fetch'>,
): Promise<Outcome<unknown>> {
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) return fail(summarizeApiError(res.status, payload))
    return succeed(payload)
  } catch (error) {
    return fail(describeThrown(error))
  }
}
