// combat-ramp.test.ts — CF-83 ceiling-decrement resolution ramp + CF-84
// termination invariant. decision-log.md 2026-07-19 § "CF-83 RAMP + CF-84 DRAW
// SEMANTICS RATIFIED" (Phase 2, PR-A).

import { describe, expect, it } from 'vitest';
import {
  ClassId,
  ItemId,
  ITEMS,
  PlacementId,
  BASE_COMBATANT_HP,
  DEFAULT_RULESET,
  MAX_COMBAT_TICKS,
  type BagPlacement,
  type BagState,
  type BuffableStat,
  type CombatInput,
  type Combatant,
  type Item,
  type ItemShape,
  type RelicSlots,
} from '@packbreaker/content';
import { RAMP_RATE, RAMP_START_TICK, simulateCombat } from '../src/combat';

const TINKER = ClassId('tinker');
const NO_RELICS: RelicSlots = { starter: null, mid: null, boss: null };

function placement(slug: string, idStr: string): BagPlacement {
  return { placementId: PlacementId(idStr), itemId: ItemId(slug), anchor: { col: 0, row: 0 }, rotation: 0 };
}
function bag(...placements: BagPlacement[]): BagState {
  return { dimensions: DEFAULT_RULESET.bagDimensions, placements };
}
function combatant(bagState: BagState, startingHp = BASE_COMBATANT_HP): Combatant {
  return { bag: bagState, relics: NO_RELICS, classId: TINKER, startingHp };
}
function input(player: Combatant, ghost: Combatant): CombatInput {
  return { seed: 1 as CombatInput['seed'], player, ghost };
}

// ─── Ramp resolves the modal stall ──────────────────────────────────

describe('CF-83 resolution ramp', () => {
  // Two empty bags: neither side deals damage → a pure stall. Pre-ramp this is
  // an endedAtTick=600 timeout draw (the fault CF-83 fixes).
  const stall = () => simulateCombat(input(combatant(bag()), combatant(bag())));

  it('resolves a full-HP zero-damage stall before the cap (no tick-600)', () => {
    const r = stall();
    expect(r.endedAtTick).toBeLessThan(MAX_COMBAT_TICKS);
    // Both 30 HP, RAMP_RATE 3/tick from RAMP_START_TICK: hp 0 at tick
    // RAMP_START_TICK + ceil(30/3) - 1 = 500 + 10 - 1 = 509 (first drain at 500).
    expect(r.endedAtTick).toBe(RAMP_START_TICK + Math.ceil(BASE_COMBATANT_HP / RAMP_RATE) - 1);
  });

  it('a symmetric full-HP stall is a mutual-KO draw with endReason ramp_ko', () => {
    const r = stall();
    expect(r.outcome).toBe('draw');
    expect(r.endReason).toBe('ramp_ko');
    expect(r.finalHp).toEqual({ player: 0, ghost: 0 });
    // T1: a mutual KO is sub-cap, distinguishable from a timeout by endedAtTick.
    expect(r.endedAtTick).toBeLessThan(MAX_COMBAT_TICKS);
  });

  it('emits ramp_tick events, first at exactly RAMP_START_TICK (500, not 501)', () => {
    const rampTicks = stall().events.filter((e) => e.type === 'ramp_tick');
    expect(rampTicks.length).toBeGreaterThan(0);
    expect(rampTicks[0]!.tick).toBe(RAMP_START_TICK);
    // In MEANINGFUL_EVENT_TYPES → the client will NOT zero-content-fast-skip this draw.
  });

  it('an item-driven death before the ramp is endReason ko (ramp untouched)', () => {
    // Iron Sword (4 dmg / 50 ticks, Tinker) closes a 30-HP bare ghost by ~tick 400.
    const r = simulateCombat(input(combatant(bag(placement('iron-sword', 'p1'))), combatant(bag())));
    expect(r.outcome).toBe('player_win');
    expect(r.endedAtTick).toBeLessThan(RAMP_START_TICK);
    expect(r.endReason).toBe('ko');
  });

  // TRIGGER-BYPASS REGRESSION (ratification item 5). The ramp is a direct HP
  // mutation; it must NOT enter trigger resolution. Healing Salve heals exactly 3
  // on on_taken_damage — verified at the change site:
  it('Healing Salve heals exactly 3 on taken damage (the value the bypass protects)', () => {
    const salve = ITEMS[ItemId('healing-salve')]!;
    const onTaken = salve.triggers.find((t) => t.type === 'on_taken_damage');
    expect(onTaken).toBeDefined();
    expect(onTaken!.effects).toEqual([{ type: 'heal', amount: 3, target: 'self' }]);
  });

  it('a Healing-Salve stall still resolves via the ramp (would time out if the ramp were healable)', () => {
    // Both sides carry only Healing Salve → no damage → stall. If the ramp routed
    // through applyDamage, its 3/tick would fire on_taken_damage → Salve heals 3 →
    // net 0 → endedAtTick 600. A direct-mutation ramp ignores triggers → resolves.
    const r = simulateCombat(
      input(combatant(bag(placement('healing-salve', 'p1'))), combatant(bag(placement('healing-salve', 'g1')))),
    );
    expect(r.endedAtTick).toBeLessThan(MAX_COMBAT_TICKS);
    expect(r.outcome).toBe('draw');
    expect(r.endReason).toBe('ramp_ko');
  });
});

// ─── Round-2 guard: the ramp must not override an item KO ────────────
// Codex PR-A round-2 P2. When runTick lands an item/status KO at tick >=
// RAMP_START_TICK, the death check should resolve it decisively; without the
// guard the ramp runs first and drains the SURVIVOR too, flipping a win/loss
// into a false draw. The dangerous direction (a side item-KO'd while the
// survivor is alive and earns the round) is UN-sampled by the frozen corpus —
// POPULATION CAVEAT (ii) — so it is pinned here by construction. iron-sword =
// 4 dmg / 50 ticks (fires at 50,100,...); a 40-HP bare ghost dies on the 10th
// hit at exactly tick 500 === RAMP_START_TICK.

describe('CF-83 round-2 KO-before-ramp guard', () => {
  it('ghost item-KO at tick 500 with the player alive resolves player_win, not a ramp draw (heart-robbing direction)', () => {
    // Player 3 HP + iron-sword; ghost 40 HP, no damage. runTick KOs the ghost at
    // tick 500; pre-guard the ramp then drains the alive 3-HP player to 0 → false
    // draw (a heart the player earned). The guard skips the ramp once ghost is down.
    const r = simulateCombat(
      input(combatant(bag(placement('iron-sword', 'p1')), 3), combatant(bag(), 40)),
    );
    expect(r.outcome).toBe('player_win'); // RED (draw) under ramp-before-death-check
    expect(r.endedAtTick).toBe(RAMP_START_TICK);
    expect(r.finalHp).toEqual({ player: 3, ghost: 0 });
  });

  it('player item-KO at tick 500 with the ghost alive resolves ghost_win, not a ramp draw (mirror)', () => {
    const r = simulateCombat(
      input(combatant(bag(), 40), combatant(bag(placement('iron-sword', 'g1')), 3)),
    );
    expect(r.outcome).toBe('ghost_win'); // RED (draw) under ramp-before-death-check
    expect(r.endedAtTick).toBe(RAMP_START_TICK);
    expect(r.finalHp).toEqual({ player: 0, ghost: 3 });
  });

  it('a side that item-dips to 0 but heals above 0 by the death check is alive, so the ramp still resolves it (ramp_ko — guard does not over-fire)', () => {
    // Ghost: Healing Salve + 8 HP. At tick 500 an iron-sword hit drops it to 0
    // (damage rem 0), then the salve's on_taken_damage heal (3) revives it to 3 —
    // ALIVE at the death check. Both sides survive runTick, so the guard applies
    // the ramp, which finishes the ghost 3→0 → ramp_ko at tick 500. This is green
    // under BOTH the current ordering and the guard; it goes RED only under an
    // OVER-firing guard that skips the ramp on the mid-tick dip (which would let
    // the combat run past tick 500). endedAtTick === 500 pins that.
    const r = simulateCombat(
      input(
        combatant(bag(placement('iron-sword', 'p1')), 30),
        combatant(bag(placement('healing-salve', 'g1')), 8),
      ),
    );
    expect(r.outcome).toBe('player_win');
    expect(r.endReason).toBe('ramp_ko');
    expect(r.endedAtTick).toBe(RAMP_START_TICK);
    // Pin the transient dip: an item hit took the ghost to exactly 0 at tick 500,
    // and the combat still resolved via the ramp (not an item KO) — so the salve
    // revived it above 0 and the guard did NOT treat it as already-resolved.
    const itemDipToZero = r.events.some(
      (e) => e.type === 'damage' && e.target === 'ghost' && e.tick === RAMP_START_TICK && e.remainingHp === 0,
    );
    expect(itemDipToZero).toBe(true);
  });
});

// ─── Termination invariant (Rule 28-falsifiable by construction) ─────

function cellCount(shape: ItemShape): number {
  return shape.length;
}

describe('CF-83 ramp termination invariant', () => {
  it('max packable starting HP <= RAMP_RATE * ramp window (no combat reaches the cap)', () => {
    const cells = DEFAULT_RULESET.bagDimensions.width * DEFAULT_RULESET.bagDimensions.height; // 24
    const withHp = Object.values(ITEMS).filter(
      (i): i is Item & { passiveStats: { maxHpBonus: number } } =>
        typeof i.passiveStats?.maxHpBonus === 'number',
    );
    // The densest packing uses the highest maxHpBonus-per-cell items; every such
    // item in the shipped registry is 1x1, so a greedy fill is exact. Legendaries
    // are single (1 copy — boss reward); non-legendaries are repeatable.
    const repeatable = withHp.filter((i) => i.rarity !== 'legendary');
    const legendary = withHp.filter((i) => i.rarity === 'legendary');
    const bestRepeatablePerCell = Math.max(
      ...repeatable.map((i) => i.passiveStats.maxHpBonus / cellCount(i.shape)),
    ); // iron-shield: 8/1 = 8
    const best = legendary
      .map((i) => ({ bonus: i.passiveStats.maxHpBonus, cells: cellCount(i.shape) }))
      .reduce(
        (acc, l) => Math.max(acc, l.bonus + (cells - l.cells) * bestRepeatablePerCell),
        cells * bestRepeatablePerCell,
      ); // 1 world-forged-heart (15) + 23 iron-shields (184) = 199
    const maxStartingHp = BASE_COMBATANT_HP + best;

    // Ceiling reaches 0 by RAMP_START_TICK + ceil(HP_max / RAMP_RATE); for that to
    // fall inside the cap, HP_max <= RAMP_RATE * (MAX_COMBAT_TICKS - RAMP_START_TICK).
    expect(maxStartingHp).toBe(229); // pins the current registry derivation (Step 0)
    expect(maxStartingHp).toBeLessThanOrEqual(RAMP_RATE * (MAX_COMBAT_TICKS - RAMP_START_TICK));
    // Breaks the moment content adds a denser maxHpBonus item or the bag grows
    // past 32 cells: 30 + 15 + 32*8 = 301 > 300.
  });

  // The ceiling-decrement proof assumes MONOTONIC descent of effective max HP.
  // A buff that raised max HP mid-combat would break it silently. BuffableStat has
  // no max-HP member — asserted at compile time (this line fails to build if a
  // max-HP buffable stat is ever added):
  it('no BuffableStat can raise max HP mid-combat', () => {
    const _exhaustive: Exclude<
      BuffableStat,
      'damage' | 'cooldown_pct' | 'trigger_chance_pct'
    > extends never
      ? true
      : false = true;
    expect(_exhaustive).toBe(true);
  });
});
