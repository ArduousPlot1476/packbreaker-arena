// CF-85 Surface 1 — attribution pure-module tests. Acceptance (anchor
// entry, Redraw item 1): a damage tick attributes to the causing item's
// name; a DoT tick attributes to the STATUS-APPLYING item (status_tick is
// source-less on the wire — correlation via the prior status_apply); a
// ramp_tick stays unattributed (no item source — correct, not a gap).
//
// Rule 28 falsifiability (proven during Phase 2, output in the PR body):
// with the status_apply correlation branch removed, the DoT tests fail
// ("expected ITEMS name, got null"); restored byte-identical.

import { describe, expect, it } from 'vitest';
import type {
  CombatEvent,
  EntityRef,
  PlacementId,
  StatusType,
} from '@packbreaker/content';
import { ITEMS } from '../run/content';
import type { BagItem, ItemId } from '../run/types';
import { buildEventAttribution } from './attribution';

const P_SWORD: BagItem = { uid: 'p1', itemId: 'iron-sword' as ItemId, col: 0, row: 0, rot: 0 };
const P_HERB: BagItem = { uid: 'p2', itemId: 'healing-herb' as ItemId, col: 2, row: 0, rot: 0 };
const P_SPARK: BagItem = { uid: 'p3', itemId: 'spark-stone' as ItemId, col: 4, row: 0, rot: 0 };
// Ghost placement DELIBERATELY reuses the raw id string 'p1' to prove the
// side-namespacing: same placementId on both sides must resolve per side.
const G_SHIELD: BagItem = { uid: 'p1', itemId: 'wooden-shield' as ItemId, col: 0, row: 0, rot: 0 };
const G_COIN: BagItem = { uid: 'g1', itemId: 'copper-coin' as ItemId, col: 1, row: 0, rot: 0 };

const PLAYER_BAG = [P_SWORD, P_HERB, P_SPARK];
const GHOST_BAG = [G_SHIELD, G_COIN];

const nameOf = (id: string) => ITEMS[id as ItemId]!.name;

function ref(side: EntityRef, placementId: string) {
  return { side, placementId: placementId as PlacementId };
}

function damage(tick: number, side: EntityRef, placementId: string, target: EntityRef): CombatEvent {
  return { tick, type: 'damage', source: ref(side, placementId), target, amount: 3, remainingHp: 20 };
}

function statusApply(
  tick: number,
  side: EntityRef,
  placementId: string,
  target: EntityRef,
  status: StatusType = 'burn' as StatusType,
): CombatEvent {
  return { tick, type: 'status_apply', source: ref(side, placementId), target, status, stacks: 2 };
}

function statusTick(
  tick: number,
  target: EntityRef,
  status: StatusType = 'burn' as StatusType,
): CombatEvent {
  return { tick, type: 'status_tick', target, status, damage: 1, remainingHp: 19 };
}

describe('buildEventAttribution (CF-85 Surface 1)', () => {
  it('attributes damage / heal / item_trigger to the source item name, per side', () => {
    const events: CombatEvent[] = [
      damage(10, 'player', 'p1', 'ghost'),
      { tick: 12, type: 'heal', source: ref('player', 'p2'), target: 'player', amount: 2, newHp: 25 },
      { tick: 14, type: 'item_trigger', source: ref('ghost', 'g1'), trigger: 'on_cooldown' as never },
      // Ghost 'p1' — same raw placementId as the player's sword, different side.
      damage(16, 'ghost', 'p1', 'player'),
    ];
    const labels = buildEventAttribution(events, PLAYER_BAG, GHOST_BAG);
    expect(labels[0]).toBe(nameOf('iron-sword'));
    expect(labels[1]).toBe(nameOf('healing-herb'));
    expect(labels[2]).toBe(nameOf('copper-coin'));
    expect(labels[3]).toBe(nameOf('wooden-shield'));
  });

  it('attributes a DoT status_tick to the status-applying item, not null', () => {
    const events: CombatEvent[] = [
      statusApply(20, 'player', 'p3', 'ghost'),
      statusTick(30, 'ghost'),
      statusTick(40, 'ghost'),
    ];
    const labels = buildEventAttribution(events, PLAYER_BAG, GHOST_BAG);
    expect(labels[0]).toBe(nameOf('spark-stone'));
    expect(labels[1]).toBe(nameOf('spark-stone'));
    expect(labels[2]).toBe(nameOf('spark-stone'));
  });

  it('re-application re-points the correlation: ticks after a second apply attribute to the second source', () => {
    const events: CombatEvent[] = [
      statusApply(20, 'player', 'p3', 'ghost'),
      statusTick(30, 'ghost'),
      statusApply(35, 'player', 'p1', 'ghost'),
      statusTick(40, 'ghost'),
    ];
    const labels = buildEventAttribution(events, PLAYER_BAG, GHOST_BAG);
    expect(labels[1]).toBe(nameOf('spark-stone'));
    expect(labels[3]).toBe(nameOf('iron-sword'));
  });

  it('correlation is (target, status)-scoped: a burn on the player does not re-point the ghost burn', () => {
    const events: CombatEvent[] = [
      statusApply(20, 'player', 'p3', 'ghost'),
      statusApply(25, 'ghost', 'g1', 'player'),
      statusTick(30, 'ghost'),
      statusTick(30, 'player'),
    ];
    const labels = buildEventAttribution(events, PLAYER_BAG, GHOST_BAG);
    expect(labels[2]).toBe(nameOf('spark-stone'));
    expect(labels[3]).toBe(nameOf('copper-coin'));
  });

  it('a status_tick with no prior apply resolves to null (defensive, never a crash)', () => {
    const labels = buildEventAttribution([statusTick(30, 'ghost')], PLAYER_BAG, GHOST_BAG);
    expect(labels[0]).toBeNull();
  });

  it('ramp_tick stays UNATTRIBUTED — the CF-83 environmental drain has no item source', () => {
    const events: CombatEvent[] = [
      damage(499, 'player', 'p1', 'ghost'),
      { tick: 500, type: 'ramp_tick', target: 'player', amount: 3, remainingHp: 12 },
      { tick: 500, type: 'ramp_tick', target: 'ghost', amount: 3, remainingHp: 9 },
    ];
    const labels = buildEventAttribution(events, PLAYER_BAG, GHOST_BAG);
    expect(labels[0]).toBe(nameOf('iron-sword'));
    expect(labels[1]).toBeNull();
    expect(labels[2]).toBeNull();
  });

  it('lifecycle events resolve to null; an unknown placementId resolves to null', () => {
    const events: CombatEvent[] = [
      { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
      damage(10, 'player', 'nonexistent', 'ghost'),
      {
        tick: 600,
        type: 'combat_end',
        outcome: 'draw',
        finalHp: { player: 0, ghost: 0 },
      },
    ];
    const labels = buildEventAttribution(events, PLAYER_BAG, GHOST_BAG);
    expect(labels[0]).toBeNull();
    expect(labels[1]).toBeNull();
    expect(labels[2]).toBeNull();
  });

  it('output is index-aligned with the input stream (same length, every index defined)', () => {
    const events: CombatEvent[] = [
      { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
      damage(10, 'player', 'p1', 'ghost'),
      statusApply(20, 'player', 'p3', 'ghost'),
      statusTick(30, 'ghost'),
    ];
    const labels = buildEventAttribution(events, PLAYER_BAG, GHOST_BAG);
    expect(labels).toHaveLength(events.length);
  });
});
