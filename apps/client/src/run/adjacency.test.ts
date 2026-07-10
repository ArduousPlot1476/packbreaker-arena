// Detector unit tests (CF 60). Real shipped content ids; mirrors the sim's
// fireAdjacentReactions semantics (see adjacency.ts header).

import { describe, expect, it } from 'vitest'
import type { BagItem, ItemId } from './types'
import { detectAdjacencySynergies } from './adjacency'

function item(uid: string, itemId: string, col: number, row: number, rot = 0): BagItem {
  return { uid, itemId: itemId as ItemId, col, row, rot }
}

describe('detectAdjacencySynergies (CF 60)', () => {
  it('happy pair: Whetstone beside Iron Sword → 1 synergy, reactor=whetstone provoker=sword', () => {
    // Iron Sword (weapon, on_cooldown top-level) provokes; Whetstone
    // (on_adjacent_trigger matchTags ['weapon']) reacts. Direction matters:
    // sword provokes whetstone, never the reverse (whetstone can't provoke).
    const bag = [
      item('sword', 'iron-sword', 0, 0), // 1×2 V → (0,0),(0,1)
      item('whet', 'whetstone', 1, 0), // 1×1 → (1,0), edge-adjacent to (0,0)
    ]
    expect(detectAdjacencySynergies(bag)).toEqual([{ reactorUid: 'whet', provokerUid: 'sword' }])
  })

  it('tag mismatch: Whetstone beside Mana Potion (consumable, top-level) → 0', () => {
    // Mana Potion CAN provoke (on_round_start) but is tagged ['consumable'],
    // so Whetstone's matchTags ['weapon'] filter rejects it — isolates rule 2.
    const bag = [item('mana', 'mana-potion', 0, 0), item('whet', 'whetstone', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([])
  })

  it('no-trigger neighbor: Whetstone beside Copper Coin → 0', () => {
    // Copper Coin has no triggers (can't provoke); Whetstone can't provoke either.
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
    expect(detectAdjacencySynergies(bag)).toEqual([{ reactorUid: 'whet', provokerUid: 'sword' }])
  })

  it('match-all: Resonance Crystal (no matchTags) beside Iron Sword → 1', () => {
    // Resonance Crystal's on_adjacent_trigger omits matchTags → match-all
    // (combat.ts:577), so any top-level-firing neighbor provokes it.
    const bag = [
      item('sword', 'iron-sword', 0, 0),
      item('res', 'resonance-crystal', 1, 0),
    ]
    expect(detectAdjacencySynergies(bag)).toEqual([{ reactorUid: 'res', provokerUid: 'sword' }])
  })

  it('reaction-only provoker: Vampire Fang (on_hit only) beside Resonance Crystal (match-all) → 0', () => {
    // on_hit fires ONLY as a reaction (isTopLevel=false, combat.ts:454), so it
    // never provokes an adjacent reaction. Match-all reactor removes the tag
    // variable, isolating canProvoke: the sim would fire nothing here.
    const bag = [item('fang', 'vampire-fang', 0, 0), item('res', 'resonance-crystal', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([])
  })

  it('reaction-only provoker: Wooden Shield (on_taken_damage only) beside Resonance Crystal → 0', () => {
    // on_taken_damage also fires only as a reaction (combat.ts:454) — not a
    // provoker, so no synergy despite the match-all reactor being adjacent.
    const bag = [item('shield', 'wooden-shield', 0, 0), item('res', 'resonance-crystal', 1, 0)]
    expect(detectAdjacencySynergies(bag)).toEqual([])
  })
})
