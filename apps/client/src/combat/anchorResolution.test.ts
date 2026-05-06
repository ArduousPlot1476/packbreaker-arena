// Unit tests for combat/anchorResolution.ts (M1.4a foundation).
// Locks the ANCHOR_RULE table against decision-log 2026-05-05's design
// intent and verifies resolveAnchor's discriminator-respecting,
// fallback-honoring resolution logic.

import { describe, expect, it } from 'vitest';
import type { CombatEvent, ItemRef, PlacementId } from '@packbreaker/content';
import type { BagLayout } from '../bag/layout';
import { ANCHOR_RULE, resolveAnchor } from './anchorResolution';

const PLAYER_PORTRAIT = { x: 320, y: 360 };
const GHOST_PORTRAIT = { x: 960, y: 360 };
const PLAYER_ITEM_A = { x: 144, y: 244 };
const PLAYER_ITEM_B = { x: 320, y: 332 };

const PLACEMENT_A = 'item-a' as PlacementId;
const PLACEMENT_B = 'item-b' as PlacementId;
const PLACEMENT_UNKNOWN = 'item-z' as PlacementId;
const GHOST_PLACEMENT = 'ghost-item' as PlacementId;

function buildLayout(): BagLayout {
  return {
    cellSize: 88,
    dimensions: { width: 6, height: 4 },
    player: {
      itemAnchors: new Map<PlacementId, { x: number; y: number }>([
        [PLACEMENT_A, PLAYER_ITEM_A],
        [PLACEMENT_B, PLAYER_ITEM_B],
      ]),
      portraitAnchor: PLAYER_PORTRAIT,
    },
    ghost: {
      itemAnchors: new Map(),
      portraitAnchor: GHOST_PORTRAIT,
    },
  };
}

describe('ANCHOR_RULE — locked design intent (decision-log 2026-05-05)', () => {
  it('damage anchors at both source and target', () => {
    expect(ANCHOR_RULE.damage).toBe('both');
  });
  it('heal anchors at both source and target (decision-log 2026-05-06)', () => {
    expect(ANCHOR_RULE.heal).toBe('both');
  });
  it('status_apply anchors at target', () => {
    expect(ANCHOR_RULE.status_apply).toBe('target');
  });
  it('status_tick anchors at target', () => {
    expect(ANCHOR_RULE.status_tick).toBe('target');
  });
  it('item_trigger anchors at source', () => {
    expect(ANCHOR_RULE.item_trigger).toBe('source');
  });
  it('combat_end resolves to portrait', () => {
    expect(ANCHOR_RULE.combat_end).toBe('portrait');
  });
  it('combat_start is unanchored (no VFX intent in M1; revisit if pre-combat ready-up becomes scope)', () => {
    expect(ANCHOR_RULE.combat_start).toBe('unanchored');
  });
  it('stun_consumed anchors at target (M1.4b VFX intent — affected entity is focus)', () => {
    expect(ANCHOR_RULE.stun_consumed).toBe('target');
  });
  it('buff_apply anchors at target (M1.4b VFX intent — recipient is focus)', () => {
    expect(ANCHOR_RULE.buff_apply).toBe('target');
  });
  it('buff_remove anchors at target (M1.4b VFX intent — recipient is focus)', () => {
    expect(ANCHOR_RULE.buff_remove).toBe('target');
  });
});

describe('resolveAnchor — discriminator-respecting resolution', () => {
  const layout = buildLayout();
  const playerSourceA: ItemRef = { side: 'player', placementId: PLACEMENT_A };
  const playerSourceB: ItemRef = { side: 'player', placementId: PLACEMENT_B };
  const playerSourceUnknown: ItemRef = { side: 'player', placementId: PLACEMENT_UNKNOWN };
  const ghostSource: ItemRef = { side: 'ghost', placementId: GHOST_PLACEMENT };

  it('damage (mode=both) returns source from itemAnchors and target from portraitAnchor', () => {
    const ev: CombatEvent = {
      tick: 5,
      type: 'damage',
      source: playerSourceA,
      target: 'ghost',
      amount: 3,
      remainingHp: 27,
    };
    expect(resolveAnchor(ev, layout)).toEqual({
      source: PLAYER_ITEM_A,
      target: GHOST_PORTRAIT,
    });
  });

  it('heal (mode=both) populates source from itemAnchors and target from portraitAnchor', () => {
    const ev: CombatEvent = {
      tick: 7,
      type: 'heal',
      source: playerSourceB,
      target: 'player',
      amount: 2,
      newHp: 20,
    };
    expect(resolveAnchor(ev, layout)).toEqual({ source: PLAYER_ITEM_B, target: PLAYER_PORTRAIT });
  });

  it('status_apply (mode=target) populates only target as portrait', () => {
    const ev: CombatEvent = {
      tick: 4,
      type: 'status_apply',
      source: playerSourceA,
      target: 'ghost',
      status: 'burn',
      stacks: 2,
    };
    expect(resolveAnchor(ev, layout)).toEqual({ target: GHOST_PORTRAIT });
  });

  it('status_tick (mode=target, no source on event) populates only target', () => {
    const ev: CombatEvent = {
      tick: 9,
      type: 'status_tick',
      target: 'player',
      status: 'burn',
      damage: 1,
      remainingHp: 19,
    };
    expect(resolveAnchor(ev, layout)).toEqual({ target: PLAYER_PORTRAIT });
  });

  it('item_trigger (mode=source, no target on event) populates only source', () => {
    const ev: CombatEvent = {
      tick: 2,
      type: 'item_trigger',
      source: playerSourceA,
      trigger: 'on_cooldown',
    };
    expect(resolveAnchor(ev, layout)).toEqual({ source: PLAYER_ITEM_A });
  });

  it('combat_end (mode=portrait) populates source=player and target=ghost from portraits', () => {
    const ev: CombatEvent = {
      tick: 100,
      type: 'combat_end',
      outcome: 'player_win',
      finalHp: { player: 22, ghost: 0 },
    };
    expect(resolveAnchor(ev, layout)).toEqual({
      source: PLAYER_PORTRAIT,
      target: GHOST_PORTRAIT,
    });
  });

  it('item-source with unknown PlacementId falls back to side portraitAnchor', () => {
    const ev: CombatEvent = {
      tick: 5,
      type: 'item_trigger',
      source: playerSourceUnknown,
      trigger: 'on_cooldown',
    };
    expect(resolveAnchor(ev, layout)).toEqual({ source: PLAYER_PORTRAIT });
  });

  it('cross-side discrimination: ghost-source resolves against ghost portrait (M1 ghost.itemAnchors empty)', () => {
    const ev: CombatEvent = {
      tick: 5,
      type: 'item_trigger',
      source: ghostSource,
      trigger: 'on_cooldown',
    };
    // ghost.itemAnchors is empty in M1, so lookup misses and falls back
    // to ghost.portraitAnchor. Cross-side: never resolves to player's
    // anchors.
    expect(resolveAnchor(ev, layout)).toEqual({ source: GHOST_PORTRAIT });
  });

  it('damage with player target resolves target to player portrait, not ghost', () => {
    const ev: CombatEvent = {
      tick: 5,
      type: 'damage',
      source: ghostSource, // ghost attacking player
      target: 'player',
      amount: 4,
      remainingHp: 16,
    };
    expect(resolveAnchor(ev, layout)).toEqual({
      source: GHOST_PORTRAIT, // ghost.itemAnchors miss → ghost portrait
      target: PLAYER_PORTRAIT,
    });
  });

  it('combat_start (unanchored mode) returns an empty ResolvedAnchors', () => {
    const startEv: CombatEvent = {
      tick: 0,
      type: 'combat_start',
      playerHp: 30,
      ghostHp: 30,
    };
    expect(resolveAnchor(startEv, layout)).toEqual({});
  });

  it('stun_consumed (mode=target, target: EntityRef) populates target as portrait', () => {
    const ev: CombatEvent = {
      tick: 8,
      type: 'stun_consumed',
      source: playerSourceA,
      target: 'ghost',
    };
    expect(resolveAnchor(ev, layout)).toEqual({ target: GHOST_PORTRAIT });
  });

  it('buff_apply (mode=target, target: ItemRef) resolves target via itemAnchors', () => {
    // Buff hops item-to-item; target is an ItemRef. Player.itemAnchors
    // has PLACEMENT_A → expect direct lookup, no fallback.
    const ev: CombatEvent = {
      tick: 12,
      type: 'buff_apply',
      source: playerSourceB,
      target: playerSourceA,
      stat: 'damage',
      amount: 1,
    };
    expect(resolveAnchor(ev, layout)).toEqual({ target: PLAYER_ITEM_A });
  });

  it('buff_remove (mode=target, target: ItemRef) falls back to portrait when placement absent', () => {
    // Unknown PlacementId on the player side — same lookup-then-fallback
    // contract as item-source events. Falls back to player.portraitAnchor.
    const ev: CombatEvent = {
      tick: 18,
      type: 'buff_remove',
      target: playerSourceUnknown,
      stat: 'damage',
      amount: 1,
    };
    expect(resolveAnchor(ev, layout)).toEqual({ target: PLAYER_PORTRAIT });
  });
});
