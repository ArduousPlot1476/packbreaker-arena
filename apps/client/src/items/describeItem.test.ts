// CF 57 — describeItem unit + coverage tests.
//
// Covers every one of the 6 Trigger variants and 6 Effect variants at least
// once (real shipped items where they exist; synthetic fixtures / describeEffect
// for the sim-inert effects and the positive-sign cooldown edge). The coverage
// test asserts all 45 shipped items produce non-empty output — Rune Pedestal and
// Lucky Penny (each with only an omitted effect) fall back to a structural tag
// summary, pinned explicitly.

import { describe, expect, it } from 'vitest';
import { ITEMS, getItem } from '@packbreaker/content';
import type { Effect, ItemId, PassiveStats } from '@packbreaker/content';
import {
  describeEffect,
  describeItem,
  describePassiveStats,
} from './describeItem';

describe('describeItem — trigger variants (real items)', () => {
  it('on_round_start + on_cooldown (apple, two heal triggers)', () => {
    expect(describeItem(getItem('apple' as ItemId))).toEqual([
      'Round start — heal 5',
      'Every 6s — heal 2',
    ]);
  });

  it('on_cooldown → damage (iron-sword, ticks via TICKS_PER_SECOND)', () => {
    expect(describeItem(getItem('iron-sword' as ItemId))).toEqual([
      'Every 5s — 4 dmg to enemy',
    ]);
  });

  it('on_hit (vampire-fang)', () => {
    expect(describeItem(getItem('vampire-fang' as ItemId))).toEqual([
      'On hit — heal 2',
    ]);
  });

  it('on_taken_damage (wooden-shield)', () => {
    expect(describeItem(getItem('wooden-shield' as ItemId))).toEqual([
      'When you take damage — heal 2',
    ]);
  });

  it('on_adjacent_trigger with matchTags (whetstone)', () => {
    expect(describeItem(getItem('whetstone' as ItemId))).toEqual([
      'When an adjacent weapon triggers — nearby weapon items +1 dmg',
    ]);
  });

  it('on_low_health with maxTriggersPerCombat: 1 → "(once)" (iron-cap)', () => {
    expect(describeItem(getItem('iron-cap' as ItemId))).toEqual([
      'Below 50% HP — heal 10 (once)',
    ]);
  });

  it('maxTriggersPerCombat > 1 → "(up to N×)" (bread)', () => {
    expect(describeItem(getItem('bread' as ItemId))).toEqual([
      'When you take damage — heal 1 (up to 5×)',
    ]);
  });
});

describe('describeItem — effect variants', () => {
  it('damage → "N dmg to enemy" (iron-sword)', () => {
    expect(describeEffect({ type: 'damage', amount: 7, target: 'opponent' })).toBe(
      '7 dmg to enemy',
    );
  });

  it('heal (self implicit vs explicit target)', () => {
    expect(describeEffect({ type: 'heal', amount: 3, target: 'self' })).toBe('heal 3');
    expect(describeEffect({ type: 'heal', amount: 3, target: 'opponent' })).toBe(
      'heal enemy 3',
    );
  });

  it('apply_status: poison/burn show stacks, stun does not, durationTicks → "for Ns"', () => {
    // poison 2 (venom-flask), burn 1 (spark-stone), stun (iron-mace)
    expect(describeItem(getItem('venom-flask' as ItemId))).toEqual([
      'Every 4s — poison 2 to enemy',
    ]);
    expect(describeItem(getItem('spark-stone' as ItemId))).toEqual([
      'When an adjacent weapon triggers — burn 1 to enemy',
    ]);
    expect(describeItem(getItem('iron-mace' as ItemId))).toEqual([
      'Every 5s — 2 dmg to enemy, stun enemy',
    ]);
    expect(
      describeEffect({
        type: 'apply_status',
        status: 'burn',
        stacks: 1,
        durationTicks: 30,
        target: 'opponent',
      }),
    ).toBe('burn 1 to enemy for 3s');
  });

  it('add_gold is omitted (unimplemented no-op); lucky-penny → tag fallback', () => {
    // Sim skips add_gold and no run-controller credit path exists, so it grants
    // nothing — omit it (Codex Phase 2.5). Lucky Penny's only effect is add_gold,
    // so it falls back to its structural tag summary.
    expect(describeEffect({ type: 'add_gold', amount: 2 })).toBeNull();
    expect(describeItem(getItem('lucky-penny' as ItemId))).toEqual(['Gold']);
  });

  it('buff_adjacent damage → "nearby [tags ]items +N dmg" (resonance-crystal, two effects)', () => {
    expect(describeItem(getItem('resonance-crystal' as ItemId))).toEqual([
      'When an adjacent item triggers — nearby items +1 dmg, nearby items fire 10% faster',
    ]);
  });

  it('summon_temp_item is omitted (sim no-op, unused)', () => {
    const summon: Effect = {
      type: 'summon_temp_item',
      itemId: 'iron-sword' as ItemId,
      durationTicks: 30,
    };
    expect(describeEffect(summon)).toBeNull();
  });
});

describe('describeItem — buff_adjacent cooldown_pct sign (counterintuitive)', () => {
  it('NEGATIVE amount = faster (all shipped items; mana-potion −15)', () => {
    expect(describeItem(getItem('mana-potion' as ItemId))).toEqual([
      'Round start — nearby items fire 15% faster',
    ]);
    expect(
      describeEffect({ type: 'buff_adjacent', stat: 'cooldown_pct', amount: -25 }),
    ).toBe('nearby items fire 25% faster');
  });

  it('POSITIVE amount = slower (synthetic — no shipped item does this)', () => {
    expect(
      describeEffect({ type: 'buff_adjacent', stat: 'cooldown_pct', amount: 20 }),
    ).toBe('nearby items fire 20% slower');
  });

  it('zero amount is omitted', () => {
    expect(
      describeEffect({ type: 'buff_adjacent', stat: 'cooldown_pct', amount: 0 }),
    ).toBeNull();
  });
});

describe('describeItem — inert trigger_chance_pct omission (CF 57 Q1)', () => {
  it('effect-level: trigger_chance_pct buff returns null', () => {
    expect(
      describeEffect({ type: 'buff_adjacent', stat: 'trigger_chance_pct', amount: 30 }),
    ).toBeNull();
  });

  it('Master Alchemist’s Kit keeps its poison line, drops the proc-buff line', () => {
    const lines = describeItem(getItem('master-alchemists-kit' as ItemId));
    expect(lines).toEqual(['Round start — poison 3 to enemy']);
    expect(lines.join(' ')).not.toMatch(/trigger|chance/i);
  });

  it('Rune Pedestal (only effect is inert, no passives) → structural tag fallback', () => {
    // Sole item blanked by the omit rule; must fall back, NOT re-describe the buff.
    const lines = describeItem(getItem('rune-pedestal' as ItemId));
    expect(lines).toEqual(['Tool · Gem']);
    expect(lines.join(' ')).not.toMatch(/trigger|chance|%/);
  });
});

describe('describePassiveStats', () => {
  it('emits only maxHpBonus; omits unimplemented goldPerRound + bonusBaseDamage', () => {
    // maxHpBonus is the sole passive the run controller applies; the other two
    // have no consumer, so they are omitted (Codex Phase 2.5) not advertised.
    const stats: PassiveStats = { maxHpBonus: 18, bonusBaseDamage: 2, goldPerRound: 3 };
    expect(describePassiveStats(stats)).toEqual(['+18 max HP']);
  });

  it('passive + trigger compose (tower-shield: heal line then +18 max HP)', () => {
    expect(describeItem(getItem('tower-shield' as ItemId))).toEqual([
      'When you take damage — heal 2',
      '+18 max HP',
    ]);
  });

  it('pure-passive: buckler → +5 max HP (real); copper-coin → Gold fallback (goldPerRound omitted)', () => {
    expect(describeItem(getItem('buckler' as ItemId))).toEqual(['+5 max HP']);
    // Its only content is the unimplemented goldPerRound → structural tag fallback.
    expect(describeItem(getItem('copper-coin' as ItemId))).toEqual(['Gold']);
  });
});

describe('describeItem — dual-trigger epic (berserkers-greataxe)', () => {
  it('on_cooldown damage + on_low_health adjacency buff', () => {
    expect(describeItem(getItem('berserkers-greataxe' as ItemId))).toEqual([
      'Every 5s — 14 dmg to enemy',
      'Below 50% HP — nearby items +3 dmg (once)',
    ]);
  });
});

describe('describeItem — coverage: all 45 shipped items produce non-empty output', () => {
  const entries = Object.values(ITEMS);

  it('registry has 45 items', () => {
    expect(entries).toHaveLength(45);
  });

  it('every item yields ≥1 line, all non-empty strings', () => {
    for (const item of entries) {
      const lines = describeItem(item);
      expect(lines.length, `${item.id} produced no lines`).toBeGreaterThan(0);
      for (const line of lines) {
        expect(typeof line).toBe('string');
        expect(line.trim().length, `${item.id} produced a blank line`).toBeGreaterThan(0);
      }
    }
  });
});
