import { z } from 'zod'

// Lead payload shared by the funnel (browser) and the /api/lead function.
// See docs/lead-payload.md for the contract.

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
] as const

/** Returns the E.164 form (+1XXXXXXXXXX) of a US phone number, or null if invalid. */
export function normalizeUsPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  if (digits.length !== 10) return null
  // NANP: area code and exchange cannot start with 0 or 1.
  if (/^[01]/.test(digits) || /^[01]/.test(digits.slice(3))) return null
  return `+1${digits}`
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase()
}

export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

const nullableString = z.string().trim().max(500).nullable()

export const leadSubmissionSchema = z.object({
  lead_id: z.uuid(),
  event_id: z.uuid(),
  submitted_at: z.iso.datetime(),
  is_test: z.boolean(),
  /** Hidden honeypot field. Humans never see it; a value means the submission is automated. */
  website: z.string().max(200).optional(),
  contact: z.object({
    first_name: z.string().transform(normalizeName).pipe(z.string().min(1).max(100)),
    last_name: z.string().transform(normalizeName).pipe(z.string().min(1).max(100)),
    email: z.string().transform(normalizeEmail).pipe(z.email().max(254)),
    phone: z
      .string()
      .transform((value, ctx) => {
        const phone = normalizeUsPhone(value)
        if (!phone) {
          ctx.addIssue({ code: 'custom', message: 'Enter a valid US phone number' })
          return z.NEVER
        }
        return phone
      }),
    zip: z.string().trim().regex(/^\d{5}$/, 'Enter a 5-digit ZIP code'),
    state: z.enum(US_STATES),
  }),
  quiz: z.object({
    qualified: z.boolean(),
    answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  }),
  consent: z.object({
    given: z.literal(true),
    version: z.string().min(1),
    text: z.string().min(1),
    timestamp: z.iso.datetime(),
  }),
  attribution: z.object({
    utm_source: nullableString,
    utm_medium: nullableString,
    utm_campaign: nullableString,
    utm_content: nullableString,
    utm_term: nullableString,
    fbclid: nullableString,
    fbc: nullableString,
    fbp: nullableString,
    referrer: nullableString,
    page_url: z.url().max(2000),
    variant: z.string().min(1).max(50),
  }),
})

export type LeadSubmission = z.input<typeof leadSubmissionSchema>
export type NormalizedLead = z.output<typeof leadSubmissionSchema>
