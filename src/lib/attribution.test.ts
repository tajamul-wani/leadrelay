import { describe, expect, it } from 'vitest'
import { parseAttribution, readCookie, resolveFbc } from './attribution'

describe('resolveFbc', () => {
  it('prefers the _fbc cookie', () => {
    expect(resolveFbc('fb.1.100.cookieclick', 'urlclick', 200)).toBe('fb.1.100.cookieclick')
  })

  it('builds fbc from fbclid when the cookie is missing', () => {
    expect(resolveFbc(null, 'IwAR0abc', 1758104100000)).toBe('fb.1.1758104100000.IwAR0abc')
  })

  it('returns null without a click ID', () => {
    expect(resolveFbc(null, null, 1)).toBeNull()
  })
})

describe('parseAttribution', () => {
  it('reads UTM parameters and fbclid, treating blanks as null', () => {
    const a = parseAttribution('https://x.test/?utm_source=facebook&utm_medium=&fbclid=IwAR0abc', '', 5)
    expect(a).toMatchObject({ utm_source: 'facebook', utm_medium: null, fbclid: 'IwAR0abc', referrer: null, landed_at: 5 })
  })
})

describe('readCookie', () => {
  it('finds a cookie by exact name', () => {
    expect(readCookie('a=1; _fbp=fb.1.2.3; _fbpx=no', '_fbp')).toBe('fb.1.2.3')
    expect(readCookie('a=1', '_fbc')).toBeNull()
  })
})
