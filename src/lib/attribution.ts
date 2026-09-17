// Captures ad-click attribution on landing and keeps it for the session,
// so parameters survive navigation between funnel steps.

const STORAGE_KEY = 'leadrelay.attribution'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

export type Attribution = {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
  referrer: string | null
  landing_url: string
  landed_at: number
}

export function readCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.split('; ').find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

/**
 * Meta click ID. Prefers the _fbc cookie set by the Pixel; otherwise builds the
 * value from fbclid in the documented format fb.1.<ms timestamp>.<fbclid>.
 */
export function resolveFbc(cookieFbc: string | null, fbclid: string | null, clickTimeMs: number): string | null {
  if (cookieFbc) return cookieFbc
  if (!fbclid) return null
  return `fb.1.${clickTimeMs}.${fbclid}`
}

export function parseAttribution(url: string, referrer: string, now: number): Attribution {
  const params = new URL(url).searchParams
  const get = (key: string) => params.get(key)?.trim() || null
  return {
    utm_source: get('utm_source'),
    utm_medium: get('utm_medium'),
    utm_campaign: get('utm_campaign'),
    utm_content: get('utm_content'),
    utm_term: get('utm_term'),
    fbclid: get('fbclid'),
    referrer: referrer || null,
    landing_url: url,
    landed_at: now,
  }
}

/**
 * Stores attribution from the landing URL. A later page view without campaign
 * parameters does not overwrite the original click data.
 */
export function captureAttribution(): Attribution {
  const current = parseAttribution(window.location.href, document.referrer, Date.now())
  const stored = loadAttribution()
  const hasCampaignData = current.fbclid !== null || UTM_KEYS.some((key) => current[key] !== null)

  if (stored && !hasCampaignData) return stored
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  return current
}

export function loadAttribution(): Attribution | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Attribution) : null
  } catch {
    return null
  }
}
