// Adjacency-buff replica + reveal model tests (CF-89 PR-A). Real shipped
// content ids throughout; every numeric expectation derives from
// packages/content values + the sim's applyPct flooring.

import { describe, expect, it } from 'vitest'
import { formatSeconds } from '../items/describeItem'
import type { BagItem, ItemId } from './types'
import {
  computeAdjacencyBuffTotals,
  computeChipEntries,
  computeItemRevealRows,
} from './adjacencyReveal'

function item(uid: string, itemId: string, col: number, row: number, rot = 0): BagItem {
  return { uid, itemId: itemId as ItemId, col, row, rot }
}

describe('computeAdjacencyBuffTotals — the four ratified sim rules', () => {
  it('Whetstone beside Iron Sword: sword receives damage +1 (per-source dedupe — one contribution although combat re-fires the reaction every provocation)', () => {
    const bag = [item('sword', 'iron-sword', 0, 0), item('whet', 'whetstone', 1, 0)]
    expect(computeAdjacencyBuffTotals(bag).get('sword')).toEqual({ damage: 1, cooldownPct: 0 })
  })

  it('different sources STACK additively: Whetstone + Forge Anvil both beside Iron Sword → damage +3', () => {
    // Sword 1×2 V at (1,0)-(1,1); whetstone at (0,0) touches (1,0); anvil 2×2
    // at (2,0) touches (1,0)+(1,1). combat.ts:819-830: different sources to
    // the same (target, stat) DO stack.
    const bag = [
      item('sword', 'iron-sword', 1, 0),
      item('whet', 'whetstone', 0, 0),
      item('anvil', 'forge-anvil', 2, 0),
    ]
    expect(computeAdjacencyBuffTotals(bag).get('sword')).toEqual({ damage: 3, cooldownPct: 0 })
  })

  it('Mana Potion beside Iron Sword: sword receives cooldownPct −15 (round-start aura, deterministic from tick 0)', () => {
    const bag = [item('mana', 'mana-potion', 0, 0), item('sword', 'iron-sword', 1, 0)]
    expect(computeAdjacencyBuffTotals(bag).get('sword')).toEqual({ damage: 0, cooldownPct: -15 })
  })

  it("CONDITIONAL EXCLUDED: Berserker's Greataxe beside Iron Sword contributes NOTHING to the deterministic totals", () => {
    // The +3 damage buff is hosted on on_low_health (thresholdPct 50) — it
    // only exists if the owner's HP crosses 50%, so a resolved after-value
    // would be a lie. Class-2 amounts never enter the totals.
    const bag = [item('axe', 'berserkers-greataxe', 0, 0), item('sword', 'iron-sword', 2, 0)]
    expect(computeAdjacencyBuffTotals(bag).get('sword')).toBeUndefined()
  })

  it('reaction gate: Whetstone with NO provoking neighbor contributes nothing (buff can never fire)', () => {
    // Vampire Fang is a weapon (passes the effect filter) but on_hit-only
    // (cannot provoke) — with no provoker adjacent, the reaction never fires
    // in combat, so the static total must stay empty.
    const bag = [item('whet', 'whetstone', 0, 0), item('fang', 'vampire-fang', 1, 0)]
    expect(computeAdjacencyBuffTotals(bag).get('fang')).toBeUndefined()
  })
})

describe('computeItemRevealRows — three display classes', () => {
  it('RATIFIED FALSIFIER — affected ≠ provokers: Whetstone beside Iron Sword AND Vampire Fang', () => {
    // Sword provokes (on_cooldown, weapon); fang cannot (on_hit only). The
    // reaction fires once and buffs BOTH weapons (effect matchTags ['weapon']):
    // affected = {sword, fang}, provokers = {sword}. combat.ts:812-817 applies
    // the effect to every matching adjacent, not to the provoker.
    const bag = [
      item('sword', 'iron-sword', 0, 0), // (0,0),(0,1)
      item('whet', 'whetstone', 1, 0), // adjacent to sword (0,0) and fang (2,0)
      item('fang', 'vampire-fang', 2, 0),
    ]
    const rows = computeItemRevealRows(bag, 'whet')
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.revealClass).toBe(1)
    expect(row.affected).not.toBeNull()
    expect(row.affected!.map((a) => a.uid).sort()).toEqual(['fang', 'sword'])
    // Sword: damage 4 → 5. Fang: LISTED but delta-less (heals on hit, owns no
    // damage effect — the buff exists on it, latent).
    const sword = row.affected!.find((a) => a.uid === 'sword')!
    expect(sword.deltas).toEqual([{ kind: 'damage', before: 4, after: 5 }])
    const fang = row.affected!.find((a) => a.uid === 'fang')!
    expect(fang.deltas).toEqual([])
  })

  it('gate closes: Whetstone beside ONLY Vampire Fang → row present, affected [] (no provoker, buff can never fire)', () => {
    const bag = [item('whet', 'whetstone', 0, 0), item('fang', 'vampire-fang', 1, 0)]
    const rows = computeItemRevealRows(bag, 'whet')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.revealClass).toBe(1)
    expect(rows[0]!.affected).toEqual([])
  })

  it('DoD worked case: Mana Potion → Iron Sword cooldown 50t → 42t → "4.2s" (applyPct floor + formatSeconds)', () => {
    const bag = [item('mana', 'mana-potion', 0, 0), item('sword', 'iron-sword', 1, 0)]
    const rows = computeItemRevealRows(bag, 'mana')
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.revealClass).toBe(1)
    expect(row.qualifier).toBeNull()
    const sword = row.affected!.find((a) => a.uid === 'sword')!
    expect(sword.deltas).toEqual([{ kind: 'cooldown', before: 50, after: 42 }])
    expect(formatSeconds(50)).toBe('5')
    expect(formatSeconds(42)).toBe('4.2')
  })

  it('class 2 (conditional host): Berserker\'s Greataxe row carries "if triggered", affected listed WITHOUT deltas', () => {
    const bag = [item('axe', 'berserkers-greataxe', 0, 0), item('sword', 'iron-sword', 2, 0)]
    const rows = computeItemRevealRows(bag, 'axe')
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.revealClass).toBe(2)
    expect(row.qualifier).toBe('if triggered')
    expect(row.affected!.map((a) => a.uid)).toEqual(['sword'])
    expect(row.affected![0]!.deltas).toEqual([])
  })

  it('class 2 (probabilistic stat): Rune Pedestal beside Poison Vial → "chance on trigger", no after-values', () => {
    // trigger_chance_pct is a per-fire chanceRng roll (combat.ts:660-671) —
    // any resolved after-number would be an expectation, not a value.
    const bag = [item('rune', 'rune-pedestal', 0, 0), item('vial', 'poison-vial', 1, 0)]
    const rows = computeItemRevealRows(bag, 'rune')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.revealClass).toBe(2)
    expect(rows[0]!.qualifier).toBe('chance on trigger')
    expect(rows[0]!.affected!.map((a) => a.uid)).toEqual(['vial'])
    expect(rows[0]!.affected![0]!.deltas).toEqual([])
  })

  it('class 3 (opponent-status reaction): Spark Stone beside Iron Sword → condition + effect, affected panel SUPPRESSED (null)', () => {
    const bag = [item('spark', 'spark-stone', 0, 0), item('sword', 'iron-sword', 1, 0)]
    const rows = computeItemRevealRows(bag, 'spark')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.revealClass).toBe(3)
    expect(rows[0]!.affected).toBeNull()
    expect(rows[0]!.qualifier).toBeNull()
  })

  it('class-3 GATE (Codex round-1 P2): Spark Stone beside Copper Coin (no triggers) → ZERO rows', () => {
    // No adjacent item can provoke → the sim can never fire the reaction in
    // this layout → the row is suppressed, matching the board (the detector
    // emits no pair, so nothing glows).
    const bag = [item('spark', 'spark-stone', 0, 0), item('coin', 'copper-coin', 1, 0)]
    expect(computeItemRevealRows(bag, 'spark')).toEqual([])
  })

  it('class-3 GATE: Spark Stone beside Vampire Fang (weapon tag but on_hit-only → not a provoker) → ZERO rows', () => {
    // Passes the trigger-level matchTags on TAGS but fails canProvoke — the
    // gate is provoker-existence, not tag-existence.
    const bag = [item('spark', 'spark-stone', 0, 0), item('fang', 'vampire-fang', 1, 0)]
    expect(computeItemRevealRows(bag, 'spark')).toEqual([])
  })

  it('class-3 GATE quantifier falsifier: Spark Stone beside Copper Coin AND Iron Sword → row PRESENT', () => {
    // One provoker among several non-provokers must open the gate — true
    // under `some`, false under `every`; the other gate cases pass under
    // either quantifier.
    const bag = [
      item('spark', 'spark-stone', 1, 0),
      item('coin', 'copper-coin', 0, 0),
      item('sword', 'iron-sword', 2, 0),
    ]
    const rows = computeItemRevealRows(bag, 'spark')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.revealClass).toBe(3)
  })

  it('multi-effect: Resonance Crystal beside Iron Sword renders ONE ROW PER EFFECT, both class 1', () => {
    // damage +1 AND cooldown_pct −10, both on the same on_adjacent_trigger.
    const bag = [item('res', 'resonance-crystal', 0, 0), item('sword', 'iron-sword', 1, 0)]
    const rows = computeItemRevealRows(bag, 'res')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.revealClass)).toEqual([1, 1])
    const dmgRow = rows[0]!
    const cdRow = rows[1]!
    expect(dmgRow.affected![0]!.deltas).toEqual([{ kind: 'damage', before: 4, after: 5 }])
    // applyPct(50, -10) = floor(50*90/100) = 45.
    expect(cdRow.affected![0]!.deltas).toEqual([{ kind: 'cooldown', before: 50, after: 45 }])
  })

  it('BOUNDARY: non-adjacency triggers stay out — Master Alchemist\'s Kit shows its trigger_chance_pct row only, never the round-start poison', () => {
    const bag = [item('kit', 'master-alchemists-kit', 0, 0), item('vial', 'poison-vial', 2, 0)]
    const rows = computeItemRevealRows(bag, 'kit')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.revealClass).toBe(2) // trigger_chance_pct → probabilistic
    expect(rows[0]!.text).not.toMatch(/poison/)
  })

  it('item with no adjacency relationships → zero rows (Iron Sword alone)', () => {
    expect(computeItemRevealRows([item('sword', 'iron-sword', 0, 0)], 'sword')).toEqual([])
  })
})

describe('computeChipEntries — resolved-number chips only', () => {
  it('open Whetstone beside sword + fang: chips on BOTH (nonzero received totals — the fang buff is real sim state even though latent)', () => {
    const bag = [
      item('sword', 'iron-sword', 0, 0),
      item('whet', 'whetstone', 1, 0),
      item('fang', 'vampire-fang', 2, 0),
    ]
    // Fang DOES receive the +1 damage buff (nonzero total) — it gets a chip
    // even though it has no damage effect to move: the buff is real sim state.
    const entries = computeChipEntries(bag, 'whet')
    expect(entries.map((e) => e.uid).sort()).toEqual(['fang', 'sword'])
    expect(entries.find((e) => e.uid === 'sword')).toEqual({ uid: 'sword', damage: 1, cooldownPct: 0 })
  })

  it('class-2 source yields no chips: open Berserker\'s Greataxe → []', () => {
    const bag = [item('axe', 'berserkers-greataxe', 0, 0), item('sword', 'iron-sword', 2, 0)]
    expect(computeChipEntries(bag, 'axe')).toEqual([])
  })

  it('class-3 source yields no chips: open Spark Stone → []', () => {
    const bag = [item('spark', 'spark-stone', 0, 0), item('sword', 'iron-sword', 1, 0)]
    expect(computeChipEntries(bag, 'spark')).toEqual([])
  })
})
