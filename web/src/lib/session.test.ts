import { describe, expect, it } from 'vitest'
import { visibleTabs } from './session'

describe('visibleTabs', () => {
  it('confines an investigator to their own view', () => {
    expect(visibleTabs(['INVESTIGATOR'])).toEqual(['INVESTIGATOR'])
  })

  it('lets a manager open a team member queue but not the executive view', () => {
    expect(visibleTabs(['MANAGER'])).toEqual(['INVESTIGATOR', 'MANAGER'])
  })

  it('gives an executive every view', () => {
    expect(visibleTabs(['EXECUTIVE'])).toEqual(['INVESTIGATOR', 'MANAGER', 'EXECUTIVE'])
  })

  it('grants the highest privilege when several roles are present', () => {
    expect(visibleTabs(['INVESTIGATOR', 'EXECUTIVE'])).toEqual([
      'INVESTIGATOR',
      'MANAGER',
      'EXECUTIVE',
    ])
  })

  it('defaults to the narrowest view for an unrecognised role set', () => {
    expect(visibleTabs([])).toEqual(['INVESTIGATOR'])
  })
})
