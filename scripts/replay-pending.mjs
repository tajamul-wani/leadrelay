// Re-delivers leads that were stored but whose conversion event never reached
// Meta: anything left at CAPI Status "Pending" or "Failed".
//
// This is the in-repo equivalent of the n8n Replay Failed workflow. Recovery
// runs through the same intake endpoint as live traffic rather than a parallel
// implementation, because a separate recovery path only runs on your worst day
// and so is exactly the code you cannot trust.
//
// Replaying something that already succeeded is harmless: Airtable upserts on
// Lead ID and Meta deduplicates on event_id.
//
// Usage:
//   npm run replay                              # against the local dev server
//   npm run replay -- --url https://.../api/lead
//   npm run replay -- --dry-run                 # list candidates, send nothing
//
// Required environment: AIRTABLE_BASE_ID, AIRTABLE_TOKEN

const argv = process.argv.slice(2);
const args = new Set(argv);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
};

const API_URL = option('--url') ?? 'http://localhost:5173/api/lead';
const DRY_RUN = args.has('--dry-run');

// Leave in-flight leads alone; a submission seconds old may still be mid-delivery.
const MIN_AGE_MINUTES = 10;
// Meta rejects events older than this, so replaying them only produces errors.
const MAX_AGE_DAYS = 7;

const { AIRTABLE_BASE_ID, AIRTABLE_TOKEN } = process.env;
if (!AIRTABLE_BASE_ID || !AIRTABLE_TOKEN) {
  console.error('Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN.');
  process.exit(1);
}

const formula = `AND(OR({CAPI Status}='Pending',{CAPI Status}='Failed'),{Raw Payload}!='')`;
const listUrl =
  `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Leads` +
  `?pageSize=100&filterByFormula=${encodeURIComponent(formula)}`;

const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
if (!listRes.ok) {
  const body = await listRes.json().catch(() => ({}));
  console.error(`Airtable list failed: HTTP ${listRes.status} ${body.error?.type ?? ''}`);
  process.exit(1);
}

const now = Date.now();
const all = (await listRes.json()).records;
const candidates = [];
let tooNew = 0;
let tooOld = 0;

for (const record of all) {
  const receivedAt = Date.parse(record.fields['Received At'] ?? record.fields['Submitted At']);
  const ageMinutes = (now - receivedAt) / 60000;
  if (ageMinutes < MIN_AGE_MINUTES) {
    tooNew++;
    continue;
  }
  if (ageMinutes > MAX_AGE_DAYS * 24 * 60) {
    tooOld++;
    continue;
  }
  candidates.push(record);
}

console.log(`undelivered: ${all.length}  replayable: ${candidates.length}  in flight: ${tooNew}  past the 7-day window: ${tooOld}`);
if (candidates.length === 0) process.exit(0);

let sent = 0;
let failed = 0;

for (const record of candidates) {
  const leadId = record.fields['Lead ID'];
  let payload;
  try {
    payload = JSON.parse(record.fields['Raw Payload']);
  } catch {
    console.log(`  ${leadId}  skipped: stored payload is not valid JSON`);
    failed++;
    continue;
  }

  // Mark the attempt so the record keeps saying how the lead originally arrived.
  payload.ingest_path = 'replay';

  if (DRY_RUN) {
    console.log(`  ${leadId}  would replay (currently ${record.fields['CAPI Status']}, ${record.fields['Ingest Path']})`);
    continue;
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const detail = res.ok ? '' : ` ${(await res.text()).slice(0, 120)}`;
  console.log(`  ${leadId}  HTTP ${res.status}${detail}`);
  if (res.ok) sent++;
  else failed++;
}

if (!DRY_RUN) console.log(`replayed: ${sent}  failed: ${failed}`);
process.exitCode = failed > 0 ? 1 : 0;
