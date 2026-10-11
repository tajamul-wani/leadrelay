// Error text that is stored on a record or sent to Slack is reduced to a short
// summary with credential patterns removed.
//
// Raw HTTP client errors include the request that produced them, and the request
// carries an Authorization header. During development a raw error was written to
// an Airtable field and an access token ended up readable in a browser. Nothing
// here ever stores a raw error.

const CREDENTIAL_PATTERNS = [
  /Bearer\s+[^\s"'\\]+/gi,
  /\bEAA[A-Za-z0-9]{10,}[^\s"'\\]*/g,
  /\bpat[A-Za-z0-9]{10,}\.[A-Za-z0-9]+/g,
  /\bxox[baprs]-[A-Za-z0-9-]+/g,
]

const MAX_SUMMARY_LENGTH = 1000

export function redact(value: unknown): string {
  return CREDENTIAL_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, '[REDACTED]'),
    String(value ?? ''),
  )
}

type ApiErrorShape = {
  type?: string
  code?: string | number
  message?: string
  fbtrace_id?: string
}

/**
 * Reduces an API error response to a single line, for example
 * `HTTP 400 | OAuthException | code 190 | Invalid token | fbtrace_id Ab3`.
 *
 * Handles both shapes this project talks to: Airtable returns `{ error: "NOT_FOUND" }`
 * or `{ error: { type, message } }`, Meta returns `{ error: { message, type, code, fbtrace_id } }`.
 */
export function summarizeApiError(status: number, body: unknown): string {
  const error = extractError(body)
  const parts = [
    `HTTP ${status}`,
    error.type,
    error.code !== undefined ? `code ${error.code}` : null,
    error.message,
    error.fbtrace_id ? `fbtrace_id ${error.fbtrace_id}` : null,
  ]
  return redact(parts.filter(Boolean).join(' | ')).slice(0, MAX_SUMMARY_LENGTH)
}

/**
 * Describes a thrown fetch error by kind only, never by message, because
 * messages can carry the request URL.
 *
 * Node reports every connection problem as a bare `TypeError`, which says
 * nothing useful on its own. The cause carries the code that distinguishes a
 * DNS failure from a refused connection from a timeout, and a code is safe to
 * keep: no URL, no headers, no credentials.
 */
export function describeThrown(error: unknown): string {
  if (!(error instanceof Error)) return 'network error'
  if (error.name === 'TimeoutError') return 'timeout'
  const code = (error.cause as { code?: string } | undefined)?.code
  return code ? `${error.name} (${code})` : error.name
}

function extractError(body: unknown): ApiErrorShape {
  if (typeof body === 'string') return { message: body }
  if (typeof body !== 'object' || body === null) return {}

  const error = (body as { error?: unknown }).error
  if (typeof error === 'string') return { type: error }
  if (typeof error === 'object' && error !== null) return error as ApiErrorShape
  return {}
}
