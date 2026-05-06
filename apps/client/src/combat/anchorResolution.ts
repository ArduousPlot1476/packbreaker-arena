// Pure anchor-resolution for combat-scene VFX (M1.4a foundation;
// consumed by M1.4b). Pure-helper precedent: tickAdvancer.ts.
//
// § 4.5 R1: ANCHOR_RULE entries encode design intent; resolveAnchor
// reads event.source / event.target discriminators verbatim from the
// sim event, with no inference from payload heuristics.
// § 4.5 R2: resolver reads pixel positions from BagLayout — it MUST
// NOT recompute from layout.cellSize + layout.dimensions independently.

import type { CombatEvent, EntityRef, ItemRef } from '@packbreaker/content';
import type { BagLayout, CellPosition } from '../bag/layout';

export type AnchorMode = 'source' | 'target' | 'both' | 'portrait' | 'unanchored';

/** Locked design intent per decision-log 2026-05-05 scoping ratification
 *  + 2026-05-05+ chat ratification locking three placeholders to 'target'
 *  before commit so M1.4b's VFX work doesn't land into a
 *  predicate-vs-name trap (§ 4.5 R1). Heal row amended 2026-05-06
 *  ('source' → 'both') per decision-log heal-anchor entry; render
 *  refactor lands in M1.4b2.1.
 *
 *  | Event          | Mode         | Intent
 *  |----------------|--------------|---------------------------------------------
 *  | damage         | 'both'       | source flash on attacker + impact at target
 *  | heal           | 'both'       | recipient +N floater + source-item flash (M1.4b2.1)
 *  | status_apply   | 'target'     | new debuff/buff lands on target
 *  | status_tick    | 'target'     | tick effects show on affected entity
 *  | item_trigger   | 'source'     | the item just did its thing
 *  | combat_end     | 'portrait'   | KO flash at portrait positions
 *  | combat_start   | 'unanchored' | No VFX intent in M1. Revisit if pre-combat ready-up becomes scope.
 *  | stun_consumed  | 'target'     | M1.4b VFX intent — affected entity is focus.
 *  | buff_apply     | 'target'     | M1.4b VFX intent — recipient is focus.
 *  | buff_remove    | 'target'     | M1.4b VFX intent — recipient is focus.
 */
export const ANCHOR_RULE: Record<CombatEvent['type'], AnchorMode> = {
  combat_start: 'unanchored',
  item_trigger: 'source',
  damage: 'both',
  heal: 'both',
  status_apply: 'target',
  status_tick: 'target',
  stun_consumed: 'target',
  buff_apply: 'target',
  buff_remove: 'target',
  combat_end: 'portrait',
};

export interface ResolvedAnchors {
  readonly source?: CellPosition;
  readonly target?: CellPosition;
}

/** Pure: same (event, layout) → same ResolvedAnchors. Item-ref
 *  lookups fall back to the side's portrait anchor when the placement
 *  is absent from itemAnchors (M1 ghost.itemAnchors is always empty;
 *  player.itemAnchors may also miss for items added between layout
 *  measurement and the event firing — e.g. a future contract that
 *  spawns items mid-combat). */
export function resolveAnchor(event: CombatEvent, layout: BagLayout): ResolvedAnchors {
  const mode = ANCHOR_RULE[event.type];
  if (mode === 'unanchored') return {};
  if (mode === 'portrait') {
    // combat_end — convention: source = player, target = ghost (matches
    // the on-screen ordering CombatScene renders against).
    return {
      source: layout.player.portraitAnchor,
      target: layout.ghost.portraitAnchor,
    };
  }

  // Modes 'source' | 'target' | 'both' — switch on event.type so
  // TypeScript narrows the discriminator, then read the populated
  // anchors per mode.
  const result: { source?: CellPosition; target?: CellPosition } = {};
  switch (event.type) {
    case 'damage':
    case 'heal':
    case 'status_apply':
      if (mode === 'source' || mode === 'both') {
        result.source = resolveItem(event.source, layout);
      }
      if (mode === 'target' || mode === 'both') {
        result.target = resolveEntity(event.target, layout);
      }
      break;
    case 'item_trigger':
      if (mode === 'source' || mode === 'both') {
        result.source = resolveItem(event.source, layout);
      }
      break;
    case 'status_tick':
      if (mode === 'target' || mode === 'both') {
        result.target = resolveEntity(event.target, layout);
      }
      break;
    case 'stun_consumed':
      // source: ItemRef, target: EntityRef — same shape as damage/heal/status_apply.
      if (mode === 'source' || mode === 'both') {
        result.source = resolveItem(event.source, layout);
      }
      if (mode === 'target' || mode === 'both') {
        result.target = resolveEntity(event.target, layout);
      }
      break;
    case 'buff_apply':
      // source: ItemRef, target: ItemRef — buff hops item-to-item, so
      // target uses resolveItem (not resolveEntity).
      if (mode === 'source' || mode === 'both') {
        result.source = resolveItem(event.source, layout);
      }
      if (mode === 'target' || mode === 'both') {
        result.target = resolveItem(event.target, layout);
      }
      break;
    case 'buff_remove':
      // target: ItemRef only (no source on event).
      if (mode === 'target' || mode === 'both') {
        result.target = resolveItem(event.target, layout);
      }
      break;
    default:
      // combat_start — sole 'unanchored' mode is the early-return path
      // above, so this default catches no live event types today;
      // future unanchored modes fall here.
      break;
  }
  return result;
}

function resolveItem(ref: ItemRef, layout: BagLayout): CellPosition {
  return layout[ref.side].itemAnchors.get(ref.placementId) ?? layout[ref.side].portraitAnchor;
}

function resolveEntity(side: EntityRef, layout: BagLayout): CellPosition {
  return layout[side].portraitAnchor;
}
