// Literal-union enumeration tests (M1.5c PR 2 / CF 49).
//
// The deterministic catch for narrowed literal unions: assertNever gates
// variant NAMES, and `Canonical satisfies Inferred` reports plain string
// across the brand boundary, so a too-narrow z.enum on a property literal
// (e.g. a dropped CombatOutcome member) is invisible to both compile-time
// gates. These tests enumerate EVERY canonical member (accept) plus one
// known non-member (reject) per closed literal union.
//
// Member sets read verbatim from schemas.ts:
//   RunOutcome   :526  'in_progress' | 'won' | 'eliminated' | 'abandoned'
//   RoundOutcome :507  'win' | 'loss'
//   CombatOutcome:687  'player_win' | 'ghost_win' | 'draw'
//   relic slot   :900  'mid' | 'boss'
//   Rotation     :167  0 | 90 | 180 | 270
// Non-members are deliberate cross-contaminants (a member of a SIBLING
// union) so the test also catches accidental widening.

import { describe, expect, it } from 'vitest'
import {
  CombatOutcomeSchema,
  RelicSlotSchema,
  RotationSchema,
  RoundOutcomeSchema,
  RunOutcomeSchema,
} from '../validation/telemetryBatch.js'

const stringCases = [
  { name: 'RunOutcome', schema: RunOutcomeSchema, members: ['in_progress', 'won', 'eliminated', 'abandoned'], nonMember: 'lost' },
  { name: 'RoundOutcome', schema: RoundOutcomeSchema, members: ['win', 'loss'], nonMember: 'draw' },
  { name: 'CombatOutcome', schema: CombatOutcomeSchema, members: ['player_win', 'ghost_win', 'draw'], nonMember: 'won' },
  { name: 'RelicSlot', schema: RelicSlotSchema, members: ['mid', 'boss'], nonMember: 'starter' },
] as const

describe('literal-union enumeration — string unions', () => {
  for (const c of stringCases) {
    it(`${c.name} accepts every member`, () => {
      for (const member of c.members) {
        expect(c.schema.safeParse(member).success).toBe(true)
      }
    })
    it(`${c.name} rejects non-member '${c.nonMember}'`, () => {
      expect(c.schema.safeParse(c.nonMember).success).toBe(false)
    })
  }
})

describe('literal-union enumeration — Rotation (numeric)', () => {
  it('accepts every member', () => {
    for (const member of [0, 90, 180, 270]) {
      expect(RotationSchema.safeParse(member).success).toBe(true)
    }
  })
  it('rejects non-member 45', () => {
    expect(RotationSchema.safeParse(45).success).toBe(false)
  })
})
