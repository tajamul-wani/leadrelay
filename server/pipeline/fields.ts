import type { EnrichedLead } from '../deps.js'

// Maps a validated lead onto Airtable field names.
//
// This is the same mapping the n8n Validate Lead node performs. It lives here in
// TypeScript so both ingest paths write identical records, and so the mapping is
// covered by unit tests rather than only by running a workflow.

/** How the record reached Airtable. Drives the `Ingest Path` column. */
export type IngestPath = 'Live' | 'Replay' | 'Fallback'

export type FieldOptions = {
  ingestPath: IngestPath
  restrictedStates: readonly string[]
  /** Starting Conversions API state. A fallback write has no delivery attempt yet. */
  capiStatus: 'Pending' | 'Skipped'
}

export function toAirtableFields(lead: EnrichedLead, options: FieldOptions): Record<string, unknown> {
  const { contact, consent, attribution, context } = lead

  const fields: Record<string, unknown> = {
    'Lead ID': lead.lead_id,
    'Meta Event ID': lead.event_id,
    'Submitted At': lead.submitted_at,
    'Received At': context.received_at,
    'First Name': contact.first_name,
    'Last Name': contact.last_name,
    Email: contact.email,
    Phone: contact.phone,
    ZIP: contact.zip,
    State: contact.state,
    'Qualification Status': lead.quiz.qualified ? 'Qualified' : 'Needs Review',
    'Quiz Answers': JSON.stringify(lead.quiz.answers, null, 2),
    'Consent Given': true,
    'Consent Text': consent.text,
    'Consent Timestamp': consent.timestamp,
    'IP Address': context.ip,
    'User Agent': context.user_agent,
    'Page URL': attribution.page_url,
    'UTM Source': attribution.utm_source,
    'UTM Medium': attribution.utm_medium,
    'UTM Campaign': attribution.utm_campaign,
    'UTM Content': attribution.utm_content,
    'UTM Term': attribution.utm_term,
    fbclid: attribution.fbclid,
    fbc: attribution.fbc,
    fbp: attribution.fbp,
    Referrer: attribution.referrer,
    'Funnel Variant': attribution.variant,
    'CAPI Status': options.capiStatus,
    Routing: options.restrictedStates.includes(contact.state) ? 'Restricted State' : 'Standard',
    'Is Test': lead.is_test,
    'Ingest Path': options.ingestPath,
    'Raw Payload': JSON.stringify(lead, null, 2),
  }

  // Empty values are omitted so a retry or replay never blanks out data an
  // earlier attempt already wrote.
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || value === '') delete fields[key]
  }

  return fields
}
