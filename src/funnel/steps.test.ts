import { describe, expect, it } from 'vitest'
import { firstIncompleteStepId, isQualified, nextStepId, pruneAnswers, visibleStepIds } from './steps'

describe('step flow', () => {
  it('skips application follow-ups when the user has not applied', () => {
    expect(nextStepId('applied', { applied: 'no' })).toBe('assets')
    expect(visibleStepIds({ applied: 'no' })).not.toContain('represented')
  })

  it('shows application follow-ups when the user has applied', () => {
    expect(nextStepId('applied', { applied: 'yes' })).toBe('application_status')
    expect(nextStepId('application_status', { applied: 'yes' })).toBe('represented')
  })

  it('starts with ZIP and ends with contact', () => {
    expect(visibleStepIds({})[0]).toBe('zip')
    expect(nextStepId('zip', {})).toBe('age')
    expect(nextStepId('marital_status', {})).toBe('contact')
    expect(nextStepId('contact', {})).toBeNull()
  })

  it('finds the first unanswered step', () => {
    expect(firstIncompleteStepId({})).toBe('zip')
    expect(firstIncompleteStepId({ zip: '10001', state: 'NY', age: '50_54', benefits: 'none' })).toBe('work_hours')
  })

  it('drops answers for steps hidden by a changed answer', () => {
    const pruned = pruneAnswers({ applied: 'no', represented: 'yes', age: '50_54', zip: '10001', state: 'NY' })
    expect(pruned).toEqual({ applied: 'no', age: '50_54', zip: '10001', state: 'NY' })
  })
})

describe('isQualified', () => {
  const base = { benefits: 'none', work_hours: 'not_working', duration: 'yes', treatment: 'yes', applied: 'no' }

  it('qualifies the core profile', () => {
    expect(isQualified(base)).toBe(true)
  })

  it.each([
    ['already receiving benefits', { benefits: 'ssdi' }],
    ['working over 20 hours', { work_hours: 'over_20' }],
    ['condition under 12 months', { duration: 'no' }],
    ['not under treatment', { treatment: 'no' }],
    ['already represented', { applied: 'yes', represented: 'yes' }],
  ])('does not qualify when %s', (_, change) => {
    expect(isQualified({ ...base, ...change })).toBe(false)
  })
})
