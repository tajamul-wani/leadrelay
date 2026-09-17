import { describe, expect, it } from 'vitest'
import { stateFromZip } from './zip.js'

describe('stateFromZip', () => {
  it.each([
    ['10001', 'NY'],
    ['02108', 'MA'],
    ['05501', 'MA'],
    ['05401', 'VT'],
    ['20001', 'DC'],
    ['20101', 'VA'],
    ['33101', 'FL'],
    ['60601', 'IL'],
    ['73301', 'TX'],
    ['73102', 'OK'],
    ['75201', 'TX'],
    ['88510', 'TX'],
    ['89101', 'NV'],
    ['90210', 'CA'],
    ['96101', 'CA'],
    ['96813', 'HI'],
    ['98101', 'WA'],
    ['99501', 'AK'],
  ])('%s is in %s', (zip, state) => {
    expect(stateFromZip(zip)).toBe(state)
  })

  it.each(['00901', '09001', '34001', '96201', '96910', '1234', 'abcde'])('returns null for %s', (zip) => {
    expect(stateFromZip(zip)).toBeNull()
  })
})
