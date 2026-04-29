// combat.test.ts — M1.2.3b unit-level resolver behaviors. Fixture-suite
// tests live in fixtures-suite.test.ts; this file covers the targeted
// invariants from the M1.2.3b spec § 6.

import { describe, expect, it } from 'vitest';
import {
  ClassId,
  ItemId,
  ITEMS,
  PlacementId,
  RelicId,
  SimSeed,
  type BagPlacement,
  type BagState,
  type CombatInput,
  type Combatant,
  type Item,
  type RelicSlots,
  type Trigger,
} from '@packbreaker/content';
import { simulateCombat } from '../src/combat';

const TINKER = ClassId('tinker');
const MARAUDER = ClassId('marauder');
const NO_RELICS: RelicSlots = { starter: null, mid: null, boss: null };

function placement(slug: string, idStr: string, col: number, row: number): BagPlacement {
  return {
    placementId: PlacementId(idStr),
    itemId: ItemId(slug),
    anchor: { col, row },
    rotation: 0,
  };
}

function bag(...placements: BagPlacement[]): BagState {
  return { dimensions: { width: 6, height: 4 }, placements };
}

function combatant(
  bagState: BagState,
  startingHp: number,
  classId = TINKER,
  relics: RelicSlots = NO_RELICS,
): Combatant {
  return { bag: bagState, relics, classId, startingHp };
}

function input(player: Combatant, ghost: Combatant, seed = 1): CombatInput {
  return { seed: SimSeed(seed), player, ghost };
}

function defineTestItem(slug: string, triggers: ReadonlyArray<Trigger>, tags: ReadonlyArray<Item['tags'][number]> = [], shape: Item['shape'] = [{ col: 0, row: 0 }]): Item {
  return {
    id: ItemId(slug),
    name: slug,
    rarity: 'common',
    classAffinity: null,
    shape,
    tags,
    cost: 3,
    triggers,
    artId: slug,
  };
}

// ─── Determinism + independence ─────────────────────────────────────

describe('determinism', () => {
  it('same input twice yields byte-identical events / outcome / hp', () => {
    const inp = input(
      combatant(bag(placement('iron-sword', 'p1', 0, 0)), 30),
      combatant(bag(), 30),
    );
    const r1 = simulateCombat(inp);
    const r2 = simulateCombat(inp);
    expect(r1.events).toEqual(r2.events);
    expect(r1.outcome).toBe(r2.outcome);
    expect(r1.finalHp).toEqual(r2.finalHp);
    expect(r1.endedAtTick).toBe(r2.endedAtTick);
  });

  it('two parallel sims with the same input do not leak state', () => {
    const inp = input(
      combatant(bag(placement('iron-sword', 'p1', 0, 0)), 30),
      combatant(bag(), 30),
    );
    const a = simulateCombat(inp);
    const b = simulateCombat(inp);
    const c = simulateCombat(inp);
    expect(a.events).toEqual(b.events);
    expect(b.events).toEqual(c.events);
  });
});

// ─── Class passive damage bonus ─────────────────────────────────────

describe('class passive damage bonus', () => {
  it('Marauder applies +1 to every damage effect', () => {
    const neutralRes = simulateCombat(
      input(
        combatant(bag(placement('iron-sword', 'p1', 0, 0)), 30, TINKER),
        combatant(bag(), 30),
      ),
    );
    const marauderRes = simulateCombat(
      input(
        combatant(bag(placement('iron-sword', 'p1', 0, 0)), 30, MARAUDER),
        combatant(bag(), 30),
      ),
    );

    const neutralFirstDmg = neutralRes.events.find((e) => e.type === 'damage');
    const marauderFirstDmg = marauderRes.events.find((e) => e.type === 'damage');
    expect(neutralFirstDmg && 'amount' in neutralFirstDmg && neutralFirstDmg.amount).toBe(4);
    expect(marauderFirstDmg && 'amount' in marauderFirstDmg && marauderFirstDmg.amount).toBe(5);
  });
});

// ─── Relic stacking ────────────────────────────────────────────────

describe('relic stacking', () => {
  it("Razor's Edge + Marauder passive = +3 base damage", () => {
    const relics: RelicSlots = {
      starter: RelicId('razors-edge'),
      mid: null,
      boss: null,
    };
    const res = simulateCombat(
      input(
        combatant(bag(placement('iron-sword', 'p1', 0, 0)), 30, MARAUDER, relics),
        combatant(bag(), 30),
      ),
    );
    const firstDmg = res.events.find((e) => e.type === 'damage');
    // Iron Sword base 4, +1 Marauder, +2 Razor's Edge = 7
    expect(firstDmg && 'amount' in firstDmg && firstDmg.amount).toBe(7);
  });
});

// ─── Lifesteal ─────────────────────────────────────────────────────

describe('lifesteal', () => {
  it('Bloodfont (20%) heals 1 on a 5-damage hit (floor of 1.0)', () => {
    // Steel Sword (uncommon, 6 dmg / 50 ticks). Use 5-damage source via a
    // synthetic item to hit the exact case in the spec.
    const fiveHit = defineTestItem('test-5dmg', [
      { type: 'on_cooldown', cooldownTicks: 50, effects: [{ type: 'damage', amount: 5, target: 'opponent' }] },
    ], ['weapon']);
    const customItems = { ...ITEMS, [fiveHit.id]: fiveHit };

    const relics: RelicSlots = {
      starter: RelicId('bloodfont'),
      mid: null,
      boss: null,
    };
    // Pre-damage player so the lifesteal heal is measurable (player at full HP would suppress).
    const player = combatant(bag(placement('test-5dmg', 'p1', 0, 0)), 30, TINKER, relics);
    // Need player to take some damage first. Add a synthetic ghost weapon.
    const ghostBurst = defineTestItem('ghost-burst', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 10, target: 'opponent' }] },
    ], ['weapon']);
    customItems[ghostBurst.id] = ghostBurst;
    const ghostWithWeapon = combatant(bag(placement('ghost-burst', 'g1', 0, 0)), 30);

    const res = simulateCombat(input(player, ghostWithWeapon), { items: customItems });

    // Find the FIRST damage event from player's test-5dmg item (tick 50).
    const first5Dmg = res.events.find(
      (e) => e.type === 'damage' && 'amount' in e && e.amount === 5 && e.target === 'ghost',
    );
    expect(first5Dmg).toBeDefined();
    const idx = res.events.indexOf(first5Dmg!);
    // Next event should be a heal of 1 (lifesteal) targeting player.
    const next = res.events[idx + 1];
    expect(next?.type).toBe('heal');
    if (next?.type === 'heal') {
      expect(next.amount).toBe(1);
      expect(next.target).toBe('player');
    }
  });
});

// ─── Burn bypass: status_tick → no on_taken_damage ──────────────────

describe('burn bypass on_taken_damage', () => {
  it('status_tick damage emits no on_taken_damage reaction events', () => {
    const burnInflictor = defineTestItem('burn-inflictor', [
      { type: 'on_round_start', effects: [{ type: 'apply_status', status: 'burn', stacks: 5, target: 'opponent' }] },
    ]);
    const customItems = { ...ITEMS, [burnInflictor.id]: burnInflictor };

    const player = combatant(bag(placement('burn-inflictor', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(placement('wooden-shield', 'g1', 0, 0)), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    // Find the first status_tick (burn) event.
    const firstStatusTick = res.events.findIndex((e) => e.type === 'status_tick');
    expect(firstStatusTick).toBeGreaterThan(-1);

    // The very next event should NOT be an item_trigger for Wooden Shield's
    // on_taken_damage. (Wooden Shield is the only on_taken_damage source.)
    // It should be either another status_tick or a different non-reaction event.
    const next = res.events[firstStatusTick + 1];
    if (next?.type === 'item_trigger') {
      expect(next.trigger).not.toBe('on_taken_damage');
    }
    // Stronger assertion: no on_taken_damage trigger should fire for the
    // entire combat, since status_ticks are the only damage source here and
    // they bypass on_taken_damage.
    const otdTriggers = res.events.filter(
      (e) => e.type === 'item_trigger' && e.trigger === 'on_taken_damage',
    );
    expect(otdTriggers).toHaveLength(0);
  });
});

// ─── on_cooldown maxTriggersPerCombat ───────────────────────────────

describe('on_cooldown maxTriggersPerCombat cap', () => {
  it('a synthetic on_cooldown trigger with cap=2 fires exactly twice', () => {
    const cappedItem = defineTestItem('test-capped', [
      {
        type: 'on_cooldown',
        cooldownTicks: 50,
        maxTriggersPerCombat: 2,
        effects: [{ type: 'damage', amount: 1, target: 'opponent' }],
      },
    ], ['weapon']);
    const customItems = { ...ITEMS, [cappedItem.id]: cappedItem };

    const player = combatant(bag(placement('test-capped', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    const fires = res.events.filter(
      (e) => e.type === 'item_trigger' && e.trigger === 'on_cooldown' && e.source.placementId === PlacementId('p1'),
    );
    expect(fires).toHaveLength(2);
    // First fire at tick 50, second at tick 100. After that, capped — never again.
    expect(fires[0]!.tick).toBe(50);
    expect(fires[1]!.tick).toBe(100);
  });
});

// ─── combat_start / combat_end ─────────────────────────────────────

describe('combat_start / combat_end', () => {
  it('combat_start emitted at tick 0 with both starting HP values', () => {
    const res = simulateCombat(
      input(combatant(bag(), 25), combatant(bag(), 35)),
    );
    expect(res.events[0]).toEqual({
      tick: 0,
      type: 'combat_start',
      playerHp: 25,
      ghostHp: 35,
    });
  });

  it('combat_end emitted on natural end with correct outcome and finalHp', () => {
    const player = combatant(bag(placement('throwing-knife', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(), 8); // Throwing Knife dmg 8 = exact lethal at tick 0.
    const res = simulateCombat(input(player, ghost));
    expect(res.outcome).toBe('player_win');
    expect(res.finalHp).toEqual({ player: 30, ghost: 0 });
    const last = res.events[res.events.length - 1]!;
    expect(last.type).toBe('combat_end');
    if (last.type === 'combat_end') {
      expect(last.outcome).toBe('player_win');
      expect(last.finalHp).toEqual({ player: 30, ghost: 0 });
    }
  });
});

// ─── on_low_health threshold boundary ───────────────────────────────

describe('on_low_health threshold boundary', () => {
  it('hp=15/30 (hpPct=50) does NOT fire (50 is NOT < 50)', () => {
    const burst15 = defineTestItem('burst-15', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 15, target: 'opponent' }] },
    ], ['weapon']);
    const customItems = { ...ITEMS, [burst15.id]: burst15 };

    // Ghost has Iron Cap. Player's burst15 → ghost takes 15 damage → hp=15.
    const player = combatant(bag(placement('burst-15', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(placement('iron-cap', 'g1', 0, 0)), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    // Iron Cap should NOT fire — its on_low_health trigger was never eligible
    // (hpPct stayed at 50, never < 50).
    const ironCapFires = res.events.filter(
      (e) => e.type === 'item_trigger' && e.source.placementId === PlacementId('g1'),
    );
    expect(ironCapFires).toHaveLength(0);
  });

  it('hp=14/30 (hpPct=46) fires (46 < 50)', () => {
    const burst16 = defineTestItem('burst-16', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 16, target: 'opponent' }] },
    ], ['weapon']);
    const customItems = { ...ITEMS, [burst16.id]: burst16 };

    const player = combatant(bag(placement('burst-16', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(placement('iron-cap', 'g1', 0, 0)), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    // Iron Cap should fire exactly once (heals 10).
    const ironCapFires = res.events.filter(
      (e) =>
        e.type === 'item_trigger' &&
        e.source.placementId === PlacementId('g1') &&
        e.trigger === 'on_low_health',
    );
    expect(ironCapFires).toHaveLength(1);
    // Iron Cap healed 10 → ghost 14 + 10 = 24. Sanity-check from event log.
    const ghostHeals = res.events.filter(
      (e) => e.type === 'heal' && e.target === 'ghost',
    );
    expect(ghostHeals.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Zero-amount events ─────────────────────────────────────────────

describe('zero-amount events', () => {
  it('damage at HP=0 emits damage event with amount=0 and fires NO reactions', () => {
    // Player burst30 + burst5 both on_round_start. Canonical order: burst30
    // (col 0) first, zeroes ghost. burst5 (col 1) second, hits at HP=0.
    //
    // Ghost has Bloodmoon Plate (on_taken_damage: damage(3, opp) — retaliates
    // but does NOT heal ghost). Using a non-healing reaction lets us test the
    // zero-damage suppression cleanly: Wooden Shield would heal ghost back to
    // 2 between E1 and E2, defeating the zero premise.
    const burst30 = defineTestItem('burst-30', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 30, target: 'opponent' }] },
    ], ['weapon']);
    const burst5 = defineTestItem('burst-5', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 5, target: 'opponent' }] },
    ], ['weapon']);
    const customItems = { ...ITEMS, [burst30.id]: burst30, [burst5.id]: burst5 };

    const player = combatant(
      bag(placement('burst-30', 'p1', 0, 0), placement('burst-5', 'p2', 1, 0)),
      30,
    );
    const ghost = combatant(bag(placement('bloodmoon-plate', 'g1', 0, 0)), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    const ghostDamages = res.events.filter(
      (e) => e.type === 'damage' && e.target === 'ghost',
    );
    expect(ghostDamages.length).toBeGreaterThanOrEqual(2);

    const second = ghostDamages[1]!;
    if (second.type === 'damage') {
      expect(second.amount).toBe(0);
      expect(second.remainingHp).toBe(0);
    }

    // Bloodmoon Plate fires ONCE on E1 (amount=30, top-level). It must NOT
    // fire on E2 (amount=0) per locked answer 11 — zero-damage events suppress
    // reactions.
    const bloodmoonFires = res.events.filter(
      (e) => e.type === 'item_trigger' && e.source.placementId === PlacementId('g1'),
    );
    expect(bloodmoonFires).toHaveLength(1);
  });

  it('heal at full HP emits NO heal event (zero-gain heals suppressed)', () => {
    const player = combatant(bag(placement('apple', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(), 30);
    // Apple's on_round_start: heal(5, self) at full HP → 0 actual gain.
    // Apple's on_cooldown(60): heal(2, self) — also 0 gain at full HP.
    const res = simulateCombat(input(player, ghost));

    const healEvents = res.events.filter((e) => e.type === 'heal');
    expect(healEvents).toHaveLength(0);
  });
});

// ─── Buff de-dupe ──────────────────────────────────────────────────

describe('buff de-dupe', () => {
  it('two adjacent Whetstones to one Iron Sword emit two buff_apply events; subsequent fires emit zero', () => {
    // Layout: Iron Sword 1×2V at (0,0). Whetstone A at (1,0). Whetstone B at (1,1).
    // Iron Sword cells: (0,0), (0,1). Whetstone A at (1,0), B at (1,1). Both
    // edge-adjacent to Iron Sword.
    const player = combatant(
      bag(
        placement('iron-sword', 'sword', 0, 0),
        placement('whetstone', 'wsA', 1, 0),
        placement('whetstone', 'wsB', 1, 1),
      ),
      30,
    );
    const ghost = combatant(bag(), 30);
    const res = simulateCombat(input(player, ghost));

    // Iron Sword fires multiple times (50, 100, 150 …). Each fire triggers
    // both Whetstones reactively. Only the first fire of each Whetstone
    // produces a buff_apply event.
    const buffApplies = res.events.filter((e) => e.type === 'buff_apply');
    expect(buffApplies).toHaveLength(2);
    // Different sources (wsA, wsB) — both targeting the sword for 'damage'.
    const sources = new Set(buffApplies.map((e) => (e.type === 'buff_apply' ? e.source.placementId : '')));
    expect(sources).toEqual(new Set([PlacementId('wsA'), PlacementId('wsB')]));

    // Iron Sword damage = base 4 + 1 + 1 = 6 from FIRST fire onward (Order B:
    // adjacent reactions fire BEFORE the originating trigger's effects).
    const swordDamage = res.events.filter(
      (e) =>
        e.type === 'damage' &&
        e.source.placementId === PlacementId('sword'),
    );
    expect(swordDamage.length).toBeGreaterThan(0);
    for (const d of swordDamage) {
      if (d.type === 'damage') expect(d.amount).toBe(6);
    }
  });
});

// ─── Simultaneous death → draw outcome ─────────────────────────────

describe('simultaneous death', () => {
  it("both sides reaching HP=0 in the same tick yields outcome='draw'", () => {
    const lethalBurst = defineTestItem('test-lethal', [
      { type: 'on_round_start', effects: [{ type: 'damage', amount: 30, target: 'opponent' }] },
    ], ['weapon']);
    const customItems = { ...ITEMS, [lethalBurst.id]: lethalBurst };

    const player = combatant(bag(placement('test-lethal', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(placement('test-lethal', 'g1', 0, 0)), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    expect(res.outcome).toBe('draw');
    expect(res.finalHp).toEqual({ player: 0, ghost: 0 });
  });
});

// ─── No-op effects ─────────────────────────────────────────────────

describe('no-op effects (M1.2.3b deferrals)', () => {
  it('add_gold effect is a sim-side no-op (run controller handles in M1.2.4)', () => {
    // Lucky Penny has on_round_start: add_gold(2). Sim ignores; no error,
    // no event beyond the item_trigger itself.
    const player = combatant(bag(placement('lucky-penny', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(), 30);
    const res = simulateCombat(input(player, ghost));

    // item_trigger emits, but no add_gold event in the schema (and no other
    // side effect either).
    const trigger = res.events.find((e) => e.type === 'item_trigger' && e.source.placementId === PlacementId('p1'));
    expect(trigger).toBeDefined();
    // Expected events at tick 0: combat_start + item_trigger only (plus the
    // tick-cap combat_end at 600).
    expect(res.events.filter((e) => e.tick === 0).length).toBe(2);
  });

  it('summon_temp_item effect is a sim-side no-op (deferred to a future content lever)', () => {
    const summoner = defineTestItem('test-summoner', [
      {
        type: 'on_round_start',
        effects: [{ type: 'summon_temp_item', itemId: ItemId('iron-sword'), durationTicks: 100 }],
      },
    ]);
    const customItems = { ...ITEMS, [summoner.id]: summoner };

    const player = combatant(bag(placement('test-summoner', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    // Combat has no damage source, so it times out at draw.
    expect(res.outcome).toBe('draw');
    // Only item_trigger emits at tick 0; no synthesized placement / damage.
    expect(res.events.filter((e) => e.type === 'damage')).toHaveLength(0);
  });
});

// ─── Random target selectors ───────────────────────────────────────

describe('random target selectors', () => {
  it('opp_random_item returns null on empty bag — no event, no rng cost', () => {
    const randDamager = defineTestItem('test-rand', [
      {
        type: 'on_round_start',
        effects: [{ type: 'damage', amount: 5, target: 'opp_random_item' }],
      },
    ], ['weapon']);
    const customItems = { ...ITEMS, [randDamager.id]: randDamager };

    const player = combatant(bag(placement('test-rand', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(), 30); // empty
    const res = simulateCombat(input(player, ghost), { items: customItems });

    // No damage event — empty bag returned null from resolveTarget.
    expect(res.events.filter((e) => e.type === 'damage')).toHaveLength(0);
  });

  it('opp_random_item on a non-empty bag picks one item and applies damage to its side', () => {
    const randDamager = defineTestItem('test-rand', [
      {
        type: 'on_round_start',
        effects: [{ type: 'damage', amount: 5, target: 'opp_random_item' }],
      },
    ], ['weapon']);
    const customItems = { ...ITEMS, [randDamager.id]: randDamager };

    const player = combatant(bag(placement('test-rand', 'p1', 0, 0)), 30);
    // Non-empty ghost bag — random_item resolveTarget returns an ItemRef,
    // resolveTargetSideForDamage collapses to 'ghost' side.
    const ghost = combatant(bag(placement('buckler', 'g1', 0, 0)), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    const dmg = res.events.find((e) => e.type === 'damage');
    expect(dmg).toBeDefined();
    if (dmg?.type === 'damage') {
      expect(dmg.target).toBe('ghost');
      expect(dmg.amount).toBe(5);
    }
  });
});

// ─── on_adjacent_trigger matchTags filtering ────────────────────────

describe('on_adjacent_trigger filtering', () => {
  it('non-matching matchTags suppresses the reaction', () => {
    // Apple (food, consumable) on_round_start fires at tick 0. Whetstone
    // adjacent has on_adjacent_trigger matchTags=[weapon] — Apple is NOT a
    // weapon, so Whetstone must NOT fire reactively.
    const player = combatant(
      bag(placement('apple', 'p1', 0, 0), placement('whetstone', 'p2', 1, 0)),
      30,
    );
    const ghost = combatant(bag(), 30);
    const res = simulateCombat(input(player, ghost));

    const whetstoneFires = res.events.filter(
      (e) => e.type === 'item_trigger' && e.source.placementId === PlacementId('p2'),
    );
    expect(whetstoneFires).toHaveLength(0);
  });

  it('on_adjacent_trigger respects maxTriggersPerCombat cap', () => {
    // Whetstone with synthetic cap=1 fires once and never again.
    const cappedWhetstone = defineTestItem('test-cap-ws', [
      {
        type: 'on_adjacent_trigger',
        matchTags: ['weapon'],
        maxTriggersPerCombat: 1,
        effects: [{ type: 'buff_adjacent', stat: 'damage', amount: 1, matchTags: ['weapon'] }],
      },
    ], ['tool', 'metal']);
    const customItems = { ...ITEMS, [cappedWhetstone.id]: cappedWhetstone };

    const player = combatant(
      bag(
        placement('iron-sword', 'sword', 0, 0),
        placement('test-cap-ws', 'ws', 1, 0),
      ),
      30,
    );
    const ghost = combatant(bag(), 30);
    const res = simulateCombat(input(player, ghost), { items: customItems });

    // Iron Sword fires 8+ times. Whetstone should fire exactly once (cap=1).
    const wsFires = res.events.filter(
      (e) => e.type === 'item_trigger' && e.source.placementId === PlacementId('ws'),
    );
    expect(wsFires).toHaveLength(1);
  });
});

// ─── trigger_chance_pct buff no-op ─────────────────────────────────

describe('trigger_chance_pct buff no-op', () => {
  it('Rune Pedestal next to a gem item produces no buff_apply or buff state', () => {
    // Rune Pedestal: on_adjacent_trigger matchTags=[gem,consumable] →
    // buff_adjacent stat=trigger_chance_pct +20. M1.2.3b: trigger_chance_pct
    // is a no-op (deferred). No buff_apply event should emit.
    //
    // Frost Shard (gem, ice) has on_cooldown(60) apply_status(stun) — fires
    // reactively triggering Rune Pedestal.
    const player = combatant(
      bag(
        placement('rune-pedestal', 'rp', 0, 0),
        placement('frost-shard', 'fs', 1, 0),
      ),
      30,
    );
    const ghost = combatant(bag(), 30);
    const res = simulateCombat(input(player, ghost));

    // Rune Pedestal's on_adjacent_trigger DOES fire (item_trigger emits).
    const rpFires = res.events.filter(
      (e) => e.type === 'item_trigger' && e.source.placementId === PlacementId('rp'),
    );
    expect(rpFires.length).toBeGreaterThan(0);

    // But its buff_adjacent effect is no-op'd — zero buff_apply events for
    // trigger_chance_pct.
    const buffApplies = res.events.filter(
      (e) => e.type === 'buff_apply' && e.stat === 'trigger_chance_pct',
    );
    expect(buffApplies).toHaveLength(0);
  });
});

// ─── Bread maxTriggersPerCombat cap ────────────────────────────────

describe('on_taken_damage maxTriggersPerCombat cap', () => {
  it('Bread (cap=5) heals exactly 5 times then is capped', () => {
    // Player has Bread. Ghost has Crossbow firing every 70 ticks. Bread heals
    // 1 per damage event but caps at 5 fires. After 5 heals, shouldFire
    // returns false — line 431 in combat.ts (no recordFire path).
    const player = combatant(bag(placement('bread', 'p1', 0, 0)), 30);
    const ghost = combatant(bag(placement('crossbow', 'g1', 0, 0)), 30);
    const res = simulateCombat(input(player, ghost));

    const breadFires = res.events.filter(
      (e) => e.type === 'item_trigger' && e.source.placementId === PlacementId('p1'),
    );
    expect(breadFires).toHaveLength(5);
  });
});

// ─── cooldown_pct math ─────────────────────────────────────────────

describe('cooldown_pct buff math', () => {
  it('Iron Sword adjacent to Mana Potion fires at tick 42 (applyPct(50, -15))', () => {
    // Iron Sword 1×2V at (0,0). Mana Potion 1×1 at (1,0). Adjacent.
    const player = combatant(
      bag(
        placement('iron-sword', 'sword', 0, 0),
        placement('mana-potion', 'mp', 1, 0),
      ),
      30,
    );
    const ghost = combatant(bag(), 30);
    const res = simulateCombat(input(player, ghost));

    // First Iron Sword damage event should be at tick 42 (50 × 0.85).
    const firstSwordDmg = res.events.find(
      (e) => e.type === 'damage' && e.source.placementId === PlacementId('sword'),
    );
    expect(firstSwordDmg).toBeDefined();
    expect(firstSwordDmg!.tick).toBe(42);
  });
});
