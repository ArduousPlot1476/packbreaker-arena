// CF-85 Surface 2a — real opponent-intent derivation (decision-log.md
// 2026-07-20 § "CF-85 SCOPE REDRAWN against Phase-1 read-only …").
//
// gdd.md § 14: "Opponent intent shows the opponent's apparent class and
// 1–2 marquee item silhouettes — never their full bag pre-combat." The
// pre-CF-85 panel faked all of it (literal "Ghost", hardcoded sword +
// shield). This module derives the REAL intent from the same ghost the
// combat will actually fight.
//
// Coupling discipline (anchor entry, Redraw item 1): `makeGhostForRound`
// is ratified-disposable M2-deletion scaffolding, so the generator call is
// quarantined in ghostIntentForRound — the ONE sanctioned call site next
// to CombatOverlay's — and everything downstream (marquee selection,
// rendering) consumes only the GhostTemplate/Combatant SHAPE. When M2
// ghost storage replaces the generator, swap the one call; the selection
// and every rendering consumer survive unchanged.

import type { BagDimensions, BagPlacement, ClassId, SimSeed } from '@packbreaker/content';
import { CLASSES } from '@packbreaker/content';
import { RARITY_RANK } from '../bag/layout';
import { ITEMS } from '../run/content';
import type { ItemId } from '../run/types';
import { makeGhostForRound } from './ghost';

/** How many marquee silhouettes the intent panel may show. gdd.md § 14
 *  caps the pre-combat reveal at 1–2 items; 2 is the ratified maximum. */
export const MARQUEE_MAX = 2;

export interface GhostIntent {
  readonly classId: ClassId;
  /** Display name for the apparent class (e.g. "Marauder"). */
  readonly classLabel: string;
  /** 1–2 marquee item ids drawn from the ghost's REAL placements
   *  (deduped; empty only if the ghost bag is empty). */
  readonly marqueeItemIds: ReadonlyArray<ItemId>;
}

/** Picks the ghost's marquee items from its real placements: highest
 *  rarity first (the build's headline threat), lexicographic itemId
 *  tie-break for determinism, deduped by itemId (two Iron Swords are one
 *  silhouette), capped at MARQUEE_MAX. Pure on the Combatant bag SHAPE —
 *  no generator import, so it survives the M2 generator deletion. */
export function selectMarqueeItemIds(
  placements: ReadonlyArray<BagPlacement>,
  max: number = MARQUEE_MAX,
): ItemId[] {
  const unique: ItemId[] = [];
  for (const p of placements) {
    const id = p.itemId as ItemId;
    if (!unique.includes(id) && ITEMS[id]) unique.push(id);
  }
  unique.sort((a, b) => {
    const rarityDelta = RARITY_RANK[ITEMS[b]!.rarity] - RARITY_RANK[ITEMS[a]!.rarity];
    if (rarityDelta !== 0) return rarityDelta;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return unique.slice(0, max);
}

/** Real intent for the round the player is arranging against. Same
 *  (seed, round, dims) call CombatOverlay.buildCombatInput makes, so the
 *  panel's promise and the combat's reality are one derivation — the
 *  intent can never advertise a ghost the fight won't produce. */
export function ghostIntentForRound(
  seed: SimSeed,
  round: number,
  dims: BagDimensions,
): GhostIntent {
  const ghost = makeGhostForRound(seed, round, dims);
  return {
    classId: ghost.classId,
    classLabel: CLASSES[ghost.classId]?.displayName ?? String(ghost.classId),
    marqueeItemIds: selectMarqueeItemIds(ghost.combatant.bag.placements),
  };
}
