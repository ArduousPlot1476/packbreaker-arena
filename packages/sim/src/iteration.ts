// Deterministic iteration helpers. tech-architecture.md § 4.1 rule 6:
// "Iteration order over items: always by (row, col) ascending, then by item id
// for ties." Codified here so combat / recipe-detection / effect-target code
// can never accidentally introduce non-deterministic iteration.
//
// canonicalCells takes the items registry as a parameter (instead of importing
// ITEMS directly) so this module stays content-package-agnostic and trivially
// testable. The combat module in M1.2.3 will pass ITEMS at the call site.
//
// ── tick-ordering rules (M1.2.2) ──────────────────────────────────────
// Phases run in the order in TICK_PHASES below for every combat tick.
//   - Within a phase, items iterate in canonicalPlacements order.
//   - Within status_ticks, player side fully resolves before ghost side.
//   - Stun is consumed atomically inside the cooldowns phase
//     (sim/status.ts → consumeStunIfPending). When a stun consumes, the
//     skipped trigger emits a 'stun_consumed' CombatEvent and the
//     cooldown's effects are NOT applied.
//   - Random target resolution (resolveTarget below) rolls rng.next() at
//     the moment of effect application, not at trigger entry. Empty
//     target lists short-circuit without rolling.

import type {
  BagPlacement,
  BagState,
  CellCoord,
  EntityRef,
  Item,
  ItemId,
  ItemRef,
  Rotation,
  TargetSelector,
} from '@packbreaker/content';
import type { Rng } from './rng';

/** Sorts placements in canonical sim-iteration order:
 *  by anchor.row asc, then anchor.col asc, then placementId asc.
 *  This is the ONLY order sim code may iterate placements in. */
export function canonicalPlacements(bag: BagState): ReadonlyArray<BagPlacement> {
  return stableSort(bag.placements, (a, b) => {
    if (a.anchor.row !== b.anchor.row) return a.anchor.row - b.anchor.row;
    if (a.anchor.col !== b.anchor.col) return a.anchor.col - b.anchor.col;
    return compareStrings(a.placementId, b.placementId);
  });
}

/** Returns the bag cells covered by a placement, in (row, col) ascending order.
 *  Used by adjacency, recipe-detection, and effect-target resolution.
 *
 *  M1 content is exclusively rectangular (1×1, 1×2, 2×1, 2×2). For non-180°
 *  rotations the bounding-box dimensions swap. Non-rectangular shapes (L, T,
 *  etc.) are post-M1 content; this implementation will need a real shape-rotation
 *  pass before then. */
export function canonicalCells(
  placement: BagPlacement,
  items: Readonly<Record<ItemId, Item>>,
): ReadonlyArray<CellCoord> {
  const item = items[placement.itemId];
  if (!item) {
    throw new Error(`canonicalCells: unknown itemId "${String(placement.itemId)}"`);
  }
  const { w, h } = boundingBox(item.shape, placement.rotation);
  const cells: CellCoord[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      cells.push({
        col: placement.anchor.col + dx,
        row: placement.anchor.row + dy,
      });
    }
  }
  return cells;
}

/** Stable-sort wrapper. Modern JS engines (V8, SpiderMonkey, JSC) implement
 *  Array.prototype.sort as TimSort which is stable, but funnel through this
 *  helper so the dependency on stability is documented at the call site. */
export function stableSort<T>(
  items: ReadonlyArray<T>,
  compare: (a: T, b: T) => number,
): ReadonlyArray<T> {
  return [...items].sort(compare);
}

/** The 6 tick phases per tick, in run order. tech-architecture.md § 4.1 +
 *  balance-bible.md § 1.4. Codified here so combat-resolver code (M1.2.3)
 *  can iterate `TICK_PHASES` literally rather than re-derive the order. */
export const TICK_PHASES = [
  'round_start',         // tick 0 only: on_round_start triggers (canonical placement order)
  'cooldowns',           // on_cooldown triggers whose counter elapsed (canonical order)
  'damage_resolution',   // damage events resolve, on_hit + on_taken_damage reactions fire
  'status_ticks',        // burn first, then poison; player side before ghost side; per-stack damage
  'low_health',          // on_low_health triggers (one-time per combat per item, gated by maxTriggersPerCombat)
  'cleanup',             // status decay, remainingTicks decrement, expired status cleanup, death checks
] as const;

export type TickPhase = (typeof TICK_PHASES)[number];

/** Resolves a TargetSelector to an EntityRef or ItemRef at the moment of effect
 *  application. Consumes one rng.next() call IF AND ONLY IF the selector requires
 *  a random pick AND the candidate list is non-empty. Returns null when a random
 *  selector finds an empty bag — the caller treats null as a no-op and emits no
 *  event (and consumes no rng). */
export function resolveTarget(
  selector: TargetSelector,
  sourceItemSide: EntityRef,
  playerBag: BagState,
  ghostBag: BagState,
  rng: Rng,
): EntityRef | ItemRef | null {
  switch (selector) {
    case 'self':
      return sourceItemSide;
    case 'opponent':
      return sourceItemSide === 'player' ? 'ghost' : 'player';
    case 'self_random_item': {
      const sideBag = sourceItemSide === 'player' ? playerBag : ghostBag;
      return pickRandomItemRef(sideBag, sourceItemSide, rng);
    }
    case 'opp_random_item': {
      const oppSide: EntityRef = sourceItemSide === 'player' ? 'ghost' : 'player';
      const oppBag = oppSide === 'player' ? playerBag : ghostBag;
      return pickRandomItemRef(oppBag, oppSide, rng);
    }
  }
}

function pickRandomItemRef(bag: BagState, side: EntityRef, rng: Rng): ItemRef | null {
  const placements = canonicalPlacements(bag);
  if (placements.length === 0) return null;
  const idx = rng.nextInt(0, placements.length - 1);
  return { side, placementId: placements[idx]!.placementId };
}

// ── helpers ──────────────────────────────────────────────────────────

function boundingBox(shape: ReadonlyArray<CellCoord>, rotation: Rotation): { w: number; h: number } {
  let maxCol = 0;
  let maxRow = 0;
  for (const c of shape) {
    if (c.col > maxCol) maxCol = c.col;
    if (c.row > maxRow) maxRow = c.row;
  }
  let w = maxCol + 1;
  let h = maxRow + 1;
  if (rotation === 90 || rotation === 270) [w, h] = [h, w];
  return { w, h };
}

// String compare without locale (locale-aware compare can vary across runtimes).
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
