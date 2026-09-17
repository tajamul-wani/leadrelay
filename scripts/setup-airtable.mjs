// Creates or updates the Airtable "Leads" table schema.
//
// Idempotent: creates the table if it is missing, otherwise adds any fields
// that do not exist yet. Existing fields are never modified or deleted.
//
// Usage:
//   npm run setup:airtable
//
// Required environment variables:
//   AIRTABLE_BASE_ID      Base ID (starts with "app")
//   AIRTABLE_SETUP_TOKEN  Personal access token with schema.bases:read and schema.bases:write

const { AIRTABLE_BASE_ID: baseId, AIRTABLE_SETUP_TOKEN: token } = process.env;

if (!baseId || !token) {
  console.error('Missing AIRTABLE_BASE_ID or AIRTABLE_SETUP_TOKEN.');
  process.exit(1);
}

const TABLE_NAME = 'Leads';
const API = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;

const dateTime = { dateFormat: { name: 'iso' }, timeFormat: { name: '24hour' }, timeZone: 'utc' };
const select = (...names) => ({ choices: names.map((name) => ({ name })) });
const checkbox = { icon: 'check', color: 'greenBright' };

// The first field is the table's primary field.
const FIELDS = [
  // Identity
  { name: 'Lead ID', type: 'singleLineText', description: 'Client-generated UUID. Idempotency key for upserts.' },
  { name: 'Meta Event ID', type: 'singleLineText', description: 'event_id shared by the Pixel and Conversions API events.' },
  { name: 'Submitted At', type: 'dateTime', options: dateTime, description: 'Time the user submitted the form (client clock).' },
  { name: 'Received At', type: 'dateTime', options: dateTime, description: 'Time the API accepted the lead (server clock).' },

  // Contact
  { name: 'First Name', type: 'singleLineText' },
  { name: 'Last Name', type: 'singleLineText' },
  { name: 'Email', type: 'email' },
  { name: 'Phone', type: 'phoneNumber', description: 'E.164 format, e.g. +15551234567.' },
  { name: 'ZIP', type: 'singleLineText' },
  { name: 'State', type: 'singleLineText', description: 'Two-letter US state code.' },

  // Qualification
  { name: 'Qualification Status', type: 'singleSelect', options: select('Qualified', 'Needs Review') },
  { name: 'Quiz Answers', type: 'multilineText', description: 'JSON of all quiz answers.' },

  // TCPA consent
  { name: 'Consent Given', type: 'checkbox', options: checkbox },
  { name: 'Consent Text', type: 'multilineText', description: 'Exact consent language shown at submission.' },
  { name: 'Consent Timestamp', type: 'dateTime', options: dateTime },
  { name: 'IP Address', type: 'singleLineText' },
  { name: 'User Agent', type: 'multilineText' },
  { name: 'Page URL', type: 'url' },

  // Attribution
  { name: 'UTM Source', type: 'singleLineText' },
  { name: 'UTM Medium', type: 'singleLineText' },
  { name: 'UTM Campaign', type: 'singleLineText' },
  { name: 'UTM Content', type: 'singleLineText' },
  { name: 'UTM Term', type: 'singleLineText' },
  { name: 'fbclid', type: 'singleLineText' },
  { name: 'fbc', type: 'singleLineText' },
  { name: 'fbp', type: 'singleLineText' },
  { name: 'Referrer', type: 'url' },
  { name: 'Funnel Variant', type: 'singleLineText' },

  // Meta delivery
  { name: 'CAPI Status', type: 'singleSelect', options: select('Pending', 'Sent', 'Failed', 'Skipped') },
  { name: 'CAPI Attempts', type: 'number', options: { precision: 0 } },
  { name: 'CAPI Sent At', type: 'dateTime', options: dateTime },
  { name: 'CAPI Last Error', type: 'multilineText' },

  // Operations
  { name: 'Routing', type: 'singleSelect', options: select('Standard', 'Restricted State') },
  { name: 'Is Test', type: 'checkbox', options: checkbox },
  { name: 'Ingest Path', type: 'singleSelect', options: select('Live', 'Replay') },
  { name: 'Raw Payload', type: 'multilineText', description: 'Full validated payload, kept for debugging and replay.' },
];

async function airtable(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${method} ${url} failed (${res.status}): ${JSON.stringify(data.error ?? data)}`);
  }
  return data;
}

const { tables } = await airtable('GET', API);
const existing = tables.find((t) => t.name === TABLE_NAME);

if (!existing) {
  await airtable('POST', API, {
    name: TABLE_NAME,
    description: 'One record per submitted lead.',
    fields: FIELDS,
  });
  console.log(`Created table "${TABLE_NAME}" with ${FIELDS.length} fields.`);
} else {
  const present = new Set(existing.fields.map((f) => f.name));
  const missing = FIELDS.filter((f) => !present.has(f.name));
  for (const field of missing) {
    await airtable('POST', `${API}/${existing.id}/fields`, field);
    console.log(`Added field "${field.name}".`);
  }
  console.log(`Table "${TABLE_NAME}" is up to date (${missing.length} field(s) added).`);
}
