// Meta Pixel loader and event helpers.

type Fbq = {
  (command: 'init', pixelId: string): void
  (command: 'set', key: 'autoConfig', value: boolean, pixelId: string): void
  (command: 'track', event: string, params?: Record<string, unknown>, options?: { eventID: string }): void
  (command: 'trackCustom', event: string, params?: Record<string, unknown>): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: Fbq
  loaded: boolean
  version: string
}

declare global {
  interface Window {
    fbq?: Fbq
    _fbq?: Fbq
  }
}

const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined

/** Injects the standard Pixel snippet once and fires PageView. */
export function initPixel(): void {
  if (!PIXEL_ID || window.fbq) return

  const fbq = function (...args: unknown[]) {
    if (fbq.callMethod) fbq.callMethod(...args)
    else fbq.queue.push(args)
  } as unknown as Fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  window.fbq = fbq
  window._fbq = fbq

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  document.head.appendChild(script)

  // Disable Meta's autoConfig before init. It infers conversion events from button
  // text and turns on automatic advanced matching, which reads form field values.
  // On a health-adjacent funnel we send only the data we choose, and only the
  // events we define.
  fbq('set', 'autoConfig', false, PIXEL_ID)
  fbq('init', PIXEL_ID)
  fbq('track', 'PageView')
}

/**
 * Fires the browser Lead event. eventID must equal the event_id sent to the
 * Conversions API so Meta deduplicates the pair.
 */
export function trackLead(eventId: string, variant: string): void {
  window.fbq?.('track', 'Lead', { funnel_variant: variant }, { eventID: eventId })
}

/**
 * Custom step event for funnel drop-off analysis. Sends only the step number:
 * step names or answers in a health-related funnel could expose sensitive data.
 */
export function trackStep(stepIndex: number): void {
  window.fbq?.('trackCustom', 'QuizStepCompleted', { step_index: stepIndex })
}
