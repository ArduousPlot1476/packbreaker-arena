// Unit tests for mirrorsSimShouldEndRun. Pure mirror of sim's
// `outcome !== 'in_progress'` predicate. Closes CF 21 detection-side.
//
// Cases cover all 4 RunOutcome literals shipped in content-schemas.ts:
//   - 'in_progress' → false (run is still active)
//   - 'won' / 'eliminated' / 'abandoned' → true (sim's endRun fired)

import { describe, expect, it } from 'vitest'
import type { RunOutcome } from '@packbreaker/content'
import { mirrorsSimShouldEndRun } from './runEnd'

describe('mirrorsSimShouldEndRun', () => {
  it('returns false when outcome is in_progress', () => {
    const state = { outcome: 'in_progress' as RunOutcome }
    expect(mirrorsSimShouldEndRun(state)).toBe(false)
  })

  it('returns true when outcome is won', () => {
    const state = { outcome: 'won' as RunOutcome }
    expect(mirrorsSimShouldEndRun(state)).toBe(true)
  })

  it('returns true when outcome is eliminated', () => {
    const state = { outcome: 'eliminated' as RunOutcome }
    expect(mirrorsSimShouldEndRun(state)).toBe(true)
  })

  it('returns true when outcome is abandoned', () => {
    const state = { outcome: 'abandoned' as RunOutcome }
    expect(mirrorsSimShouldEndRun(state)).toBe(true)
  })
})
