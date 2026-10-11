// Sends a synthetic lead through the pipeline, without a browser.
//
// By default it posts to the API, which is the path real traffic takes and
// which covers whichever delivery route is configured. Posting straight to the
// n8n webhook is still available for debugging that workflow in isolation.
//
// Usage:
//   npm run test:lead                          # local API (dev server must be running)
//   npm run test:lead -- --url https://...     # a deployed API
//   npm run test:lead -- --n8n                 # straight to the n8n webhook
//   npm run test:lead -- --n8n --test          # the n8n editor test URL
//   npm run test:lead -- --invalid             # payload that must be rejected
//   npm run test:lead -- --restricted          # restricted state, must be refused
//   npm run test:lead -- --n8n --no-secret     # webhook auth drill
//
// Environment variables are only needed for the --n8n modes:
//   N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET

import { randomUUID } from 'node:crypto';

const argv = process.argv.slice(2);
const args = new Set(argv);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1];
};

const DEFAULT_API_URL = 'http://localhost:5173/api/lead';
const { N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET } = process.env;

let url;
if (args.has('--n8n')) {
  if (!N8N_WEBHOOK_URL || !N8N_WEBHOOK_SECRET) {
    console.error('--n8n needs N8N_WEBHOOK_URL and N8N_WEBHOOK_SECRET in the environment.');
    process.exit(1);
  }
  url = args.has('--test') ? N8N_WEBHOOK_URL.replace('/webhook/', '/webhook-test/') : N8N_WEBHOOK_URL;
} else {
  url = option('--url') ?? DEFAULT_API_URL;
}

const id = randomUUID();
const now = Date.now();
const fbclid = `IwAR0test${now}`;

// A restricted state is refused before any health question, so the default
// fixture uses a servable one. --restricted exercises the refusal instead.
const location = args.has('--restricted') ? { zip: '90210', state: 'CA' } : { zip: '10001', state: 'NY' };

const lead = {
  lead_id: id,
  event_id: id,
  submitted_at: new Date(now).toISOString(),
  is_test: true,
  contact: {
    first_name: 'Test',
    last_name: 'Lead',
    email: `test+${id.slice(0, 8)}@example.com`,
    phone: args.has('--invalid') ? '555-1234' : '+12125550123',
    ...location,
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
    page_url: `https://leadrelay-funnel.vercel.app/?utm_source=facebook&fbclid=${fbclid}`,
    variant: 'control',
  },
};

// The API adds IP, user agent and receive time itself; n8n expects them present.
if (args.has('--n8n')) {
  lead.context = {
    ip: '203.0.113.10',
    user_agent: 'Mozilla/5.0 (LeadRelay test script)',
    received_at: new Date(now).toISOString(),
  };
}

const headers = { 'Content-Type': 'application/json' };
if (args.has('--n8n') && !args.has('--no-secret')) headers['X-LeadRelay-Secret'] = N8N_WEBHOOK_SECRET;

const started = Date.now();
const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(lead) });
const text = await res.text();

console.log(`target:  ${url}`);
console.log(`lead_id: ${id}`);
console.log(`status:  ${res.status} (${Date.now() - started} ms)`);
console.log(`body:    ${text}`);
