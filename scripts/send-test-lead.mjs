// Sends a synthetic lead directly to the n8n Lead Intake webhook.
//
// Usage:
//   npm run test:lead            # production webhook URL
//   npm run test:lead -- --test  # n8n editor test URL (/webhook-test/)
//   npm run test:lead -- --invalid
//   npm run test:lead -- --no-secret
//
// Required environment variables:
//   N8N_WEBHOOK_URL     Production webhook URL of the Lead Intake workflow
//   N8N_WEBHOOK_SECRET  Value of the X-LeadRelay-Secret header

import { randomUUID } from 'node:crypto';

const args = new Set(process.argv.slice(2));
const { N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET } = process.env;

if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
  console.error('Missing N8N_WEBHOOK_URL or N8N_WEBHOOK_SECRET.');
  process.exit(1);
}

const url = args.has('--test') ? N8N_WEBHOOK_URL.replace('/webhook/', '/webhook-test/') : N8N_WEBHOOK_URL;
const id = randomUUID();
const now = Date.now();
const fbclid = `IwAR0test${now}`;

const lead = {
  lead_id: id,
  event_id: id,
  submitted_at: new Date(now).toISOString(),
  is_test: true,
  contact: {
    first_name: 'Test',
    last_name: 'Lead',
    email: `test+${id.slice(0, 8)}@example.com`,
    phone: args.has('--invalid') ? '555-1234' : '+15555550123',
    zip: '90210',
    state: 'CA',
  },
  quiz: { qualified: true, answers: {} },
  consent: {
    given: true,
    version: 'tcpa-v1',
    text: 'Synthetic consent text for testing.',
    timestamp: new Date(now - 2000).toISOString(),
  },
  attribution: {
    utm_source: 'facebook',
    utm_medium: 'paid_social',
    utm_campaign: 'pipeline_test',
    utm_content: null,
    utm_term: null,
    fbclid,
    fbc: `fb.1.${now - 60000}.${fbclid}`,
    fbp: `fb.1.${now - 120000}.1234567890`,
    referrer: null,
    page_url: `https://leadrelay.vercel.app/?utm_source=facebook&fbclid=${fbclid}`,
    variant: 'control',
  },
  context: {
    ip: '203.0.113.10',
    user_agent: 'Mozilla/5.0 (LeadRelay test script)',
    received_at: new Date(now).toISOString(),
  },
};

const headers = { 'Content-Type': 'application/json' };
if (!args.has('--no-secret')) headers['X-LeadRelay-Secret'] = N8N_WEBHOOK_SECRET;

const started = Date.now();
const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(lead) });
const text = await res.text();

console.log(`lead_id: ${id}`);
console.log(`status:  ${res.status} (${Date.now() - started} ms)`);
console.log(`body:    ${text}`);
