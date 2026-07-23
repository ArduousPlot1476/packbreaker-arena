// Detector unit tests (CF 60; aura pass + role-neutral pair shape, CF-89
// PR-A). Real shipped content ids; mirrors the sim's adjacency semantics (see
// adjacency.ts header).

import { describe, expect, it } from 'vitest'
import type { BagItem, ItemId } from './types'
import { detectAdjacencySynergies } from './adjacency'

function item(uid: string, itemId: string, col: number, row: number, rot = 0): BagItem {
  return { uid, itemId: itemId as ItemId, col, row, rot }
}

describe('detectAdjacencySynergies — kind "reaction" (CF 60 behavior preserved)', () => {
  it('happy pair: Whetstone beside Iron Sword → 1 reaction, source=whetstone target=sword', () => {
    // Iron Sword (weapon, on_cooldown top-level) provokes; Whetstone
    // (on_adjacent_trigger matchTags ['weapon']) reacts. Direction matters:
    // sword provokes whetstone, never the reverse (whetstone can't provoke).
    const bag = [
      item('sword', 'iron-sword', 0, 0), // 1×2 V → (0,0),(0,1)
      item('whet', 'whetstone', 1, 0), // 1×1 → (1,0), edge-adjacent to (0,0)
    ]
    expect(detectAdjacencySynergies(bag)).toEqual([
      { sourceUid: 'whet', targetUid: 'sword', kind: 'reaction' },
    ])
  })

  it('reaction tag mismatch: Whetstone beside Mana Potion → no reaction (but the potion auras onto the whetstone)', () => {
    // Mana Potion CAN provoke (on_round_start) but is tagged ['consumable'],
    // so Whetstone's trigger-level matchTags ['weapon'] rejects it — no
    // reaction pair. The potion's own on_round_start buff_adjacent (no
    // effect-level matchTags = all adjacents) DOES reach the whetstone: one
    // aura pair, potion → whetstone.
    const bag = [item('mana', 'mana-potion', 0, 0), item('whet', 'whetstone', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([
      { sourceUid: 'mana', targetUid: 'whet', kind: 'aura' },
    ])
  })

  it('no-trigger neighbor: Whetstone beside Copper Coin → 0', () => {
    // Copper Coin has no triggers (can't provoke, no aura); Whetstone can't
    // provoke either and hosts no buff_adjacent outside on_adjacent_trigger.
    const bag = [item('coin', 'copper-coin', 0, 0), item('whet', 'whetstone', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([])
  })

  it('diagonal is not adjacency → 0 (edge adjacency only)', () => {
    const bag = [
      item('sword', 'iron-sword', 0, 0), // (0,0),(0,1)
      item('whet', 'whetstone', 1, 2), // corner-touches (0,1); not edge-adjacent
    ]
    expect(detectAdjacencySynergies(bag)).toEqual([])
  })

  it('reactor-only pair: two Whetstones adjacent → 0 (neither can provoke)', () => {
    const bag = [item('w1', 'whetstone', 0, 0), item('w2', 'whetstone', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([])
  })

  it('rotation: Iron Sword rotated 90° reaches Whetstone via its second cell → 1', () => {
    // rot 90 turns the 1×2 V into a 2×1 → cells (0,0),(1,0). Whetstone at (2,0)
    // is edge-adjacent to the rotated second cell (1,0). Hand-rolled
    // anchor-distance math (ignoring rotation) would miss this.
    const bag = [
      item('sword', 'iron-sword', 0, 0, 90),
      item('whet', 'whetstone', 2, 0),
    ]
    expect(detectAdjacencySynergies(bag)).toEqual([
      { sourceUid: 'whet', targetUid: 'sword', kind: 'reaction' },
    ])
  })

  it('match-all: Resonance Crystal (no trigger matchTags) beside Iron Sword → 1 reaction, 0 aura', () => {
    // Resonance Crystal's on_adjacent_trigger omits matchTags → match-all
    // (combat.ts:700-704), so any top-level-firing neighbor provokes it. Its
    // buff_adjacent effects are hosted ON the on_adjacent_trigger, so the aura
    // pass (non-on_adjacent_trigger hosts only) emits nothing for it.
    const bag = [
      item('sword', 'iron-sword', 0, 0),
      item('res', 'resonance-crystal', 1, 0),
    ]
    expect(detectAdjacencySynergies(bag)).toEqual([
      { sourceUid: 'res', targetUid: 'sword', kind: 'reaction' },
    ])
  })

  it('reaction-only provoker: Vampire Fang (on_hit only) beside Resonance Crystal (match-all) → 0', () => {
    // on_hit fires ONLY as a reaction (isTopLevel=false, combat.ts:552-554),
    // so it never provokes an adjacent reaction. Match-all reactor removes the
    // tag variable, isolating canProvoke: the sim would fire nothing here.
    const bag = [item('fang', 'vampire-fang', 0, 0), item('res', 'resonance-crystal', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([])
  })

  it('reaction-only provoker: Wooden Shield (on_taken_damage only) beside Resonance Crystal → 0', () => {
    // on_taken_damage also fires only as a reaction (combat.ts:552-554) — not
    // a provoker, so no synergy despite the match-all reactor being adjacent.
    const bag = [item('shield', 'wooden-shield', 0, 0), item('res', 'resonance-crystal', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([])
  })
})

describe('detectAdjacencySynergies — kind "aura" (CF-89 PR-A; the CF-60 glow-coverage fix)', () => {
  it('Mana Potion beside Iron Sword → 1 aura, source=potion target=sword', () => {
    // on_round_start → buff_adjacent(cooldown_pct −15), no effect matchTags →
    // all adjacents. The sword provokes nothing back (the potion has no
    // on_adjacent_trigger), so the aura pair is the only relationship.
    const bag = [item('mana', 'mana-potion', 0, 0), item('sword', 'iron-sword', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([
      { sourceUid: 'mana', targetUid: 'sword', kind: 'aura' },
    ])
  })

  it('eligibility inversion: Stamina Tonic beside trigger-less Copper Coin → 1 aura', () => {
    // The aura target needs NO triggers at all — a plain passive item
    // qualifies. (The reaction pass would drop this pair: its target gate is
    // the target's own on_adjacent_trigger.)
    const bag = [item('tonic', 'stamina-tonic', 0, 0), item('coin', 'copper-coin', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([
      { sourceUid: 'tonic', targetUid: 'coin', kind: 'aura' },
    ])
  })

  it("Berserker's Greataxe beside Wooden Shield → 1 aura (conditional on_low_health host still pairs)", () => {
    // The on_low_health host makes the buff CONDITIONAL in combat, but the
    // spatial relationship exists at arrange time — the reveal labels it
    // (class 2) rather than hiding it. Greataxe is 2×2 at (0,0); shield at
    // (2,0) is edge-adjacent to the (1,0) cell.
    const bag = [item('axe', 'berserkers-greataxe', 0, 0), item('shield', 'wooden-shield', 2, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([
      { sourceUid: 'axe', targetUid: 'shield', kind: 'aura' },
    ])
  })

  it('both kinds coexist and sort deterministically: sword | whetstone | mana-potion', () => {
    // Layout: sword (0,0)-(0,1), whet (1,0), mana (2,0). Whet is adjacent to
    // both; sword and mana are not adjacent to each other. Pairs: whet reacts
    // to sword ('reaction'); mana auras onto whet ('aura'). Sorted by
    // (sourceUid, targetUid, kind).
    const bag = [
      item('sword', 'iron-sword', 0, 0),
      item('whet', 'whetstone', 1, 0),
      item('mana', 'mana-potion', 2, 0),
    ]
    expect(detectAdjacencySynergies(bag)).toEqual([
      { sourceUid: 'mana', targetUid: 'whet', kind: 'aura' },
      { sourceUid: 'whet', targetUid: 'sword', kind: 'reaction' },
    ])
  })
})
