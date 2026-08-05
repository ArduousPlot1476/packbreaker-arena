// Procedural ghost template for M1.3.4a — real player-submitted ghosts
// land in M2 when the server stores per-(round, trophy_band) builds.
//
// The template scales item count + rarity-gate with round so combat
// difficulty grows monotonically: round 1 → 1 item, round 10 → 14 items.
// Items are drawn from the shop-offer subset (apps/client/src/run/content
// SHOP_OFFER_ITEMS — the iconned set minus boss-reward-only exclusions, CF 66)
// so the ghost build stays visually coherent with the items the player sees in
// their own shop. Class alternates by parity:
// odd rounds → marauder, even rounds → tinker — a deliberate
// affinity-mix so combat dynamics differ round-to-round.
//
// NOT a port of packages/sim/test/determinism/ghost-generator.ts (that
// generator is test scaffolding, ratified do-not-import in production).
// This is a fresh, simpler procedural builder; the design surface is
// intentionally narrow — it's a placeholder until M2 ghost storage and
// must remain easy to delete.

import {
  RARITY_GATE_BY_ROUND,
  type BagDimensions,
  type BagPlacement,
  type ClassId,
  type Combatant,
  type GhostId,
  type ItemId,
  type PlacementId,
  type Rarity,
  type SimSeed,
} from '@packbreaker/content';
import { createRng } from '@packbreaker/sim';
import { ITEMS, SHOP_OFFER_ITEMS } from '../run/content';
import { isResolver } from '../run/resolvers';
import { shopSeedFor } from '../run/sim-bridge';

/** Rounds where the ghost is guaranteed a weapon. Matches the shop's guarantee
 *  window in run/sim-bridge.ts — the two are one rule.
 *
 *  The ghost needs this from round 1, not round 2. A player who buys a SHIELD in
 *  round 1 should LOSE and learn what the game is about; against an inert ghost
 *  they instead DRAW, which costs the same heart and teaches nothing. Measured:
 *  deferring the ghost's guarantee to round 2 left 13% of all combats inert
 *  again, entirely from bags with no damage source.
 *
 *  Round 1 is kept winnable through HP instead — see GHOST_HP_BY_ROUND. Making
 *  it a weapon-vs-weapon mirror at equal HP produced a measured 50/50 coin flip,
 *  which is not "gentle but losable", it is a tax. */
const RESOLVER_GUARANTEE_ROUNDS = 3;

const RARITY_ORDER: ReadonlyArray<Rarity> = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

// Ghost item count by round. 11 entries; rounds 12+ clamp to 5 via the `?? 5`
// fallback below, which is structurally unreachable at maxRounds = 11.
//
// TUNED AGAINST THE BALANCE HARNESS (tooling/balance-harness), 2026-08-05.
//
// The previous curve [1,1,2,3,4,5,5,6,7,8,5] left rounds 4–10 at 74–95% player
// win — the unlosable band CF-93 exists to complain about. The cause was a
// BAG-SIZE mismatch, visible once the harness reported cells-used per round:
// the player fills the 24-cell bag by round 8 (measured 21.6 cells), while the
// ghost was carrying 6 items ≈ 9 cells. The ghost was fighting at roughly half
// the player's board.
//
// This curve tracks the player's measured fill instead. Result across 1069
// combats, resolver-first policy:
//
//   rounds 4–10 win%   74–95%  ->  50–75%      (genuinely losable)
//   median run          3/11   ->  9/11
//
// Rounds 1–3 stay low deliberately — they are the teaching band, and the
// resolver guarantees (here and in run/sim-bridge.ts) do the work there.
// Round 11 is the balance-bible.md § 15 boss; opponentForRound branches to
// FORGE_TYRANT before reaching this table, so that entry is generator-only.
const ITEM_COUNT_BY_ROUND: ReadonlyArray<number> = [1, 1, 2, 4, 6, 8, 10, 12, 13, 14, 5];

// Reroll-stride offset for ghost seeds. We reuse shopSeedFor's stride
// formula with a sentinel value (7 × 65521) far above realistic reroll
// counts so ghost seeds never collide with shop seeds at the same round.
const GHOST_SEED_REROLL_OFFSET = 7 * 65521;

/** Placement attempts before the generator gives up. Scales with the item
 *  target: at 14 items in a 24-cell bag most draws collide late, so a flat 50
 *  would silently under-fill the ghost and quietly undo the difficulty lift. */
const GHOST_PLACEMENT_ATTEMPTS = 200;

/** Ghost starting HP by round.
 *
 *  Was `BASE_COMBATANT_HP + floor((round-1)/2) * 2` — a flat 30 at rounds 1–2,
 *  identical to the player's baseline. That made round 1, once BOTH sides were
 *  guaranteed a weapon, a pure mirror decided by whose cooldown was shorter: a
 *  measured 50/50 coin flip on the very first fight of the run.
 *
 *  `20 + (round-1) * 2` keeps the SAME round-10 endpoint (38) while opening the
 *  early rounds. A player who bought a weapon kills a 20 HP ghost in roughly half
 *  the time it needs to kill their 30, so round 1 is a comfortable win; a player
 *  who bought a shield still loses, because the ghost can now actually kill. That
 *  is the difference between teaching a lesson and taxing a die roll.
 *
 *  Client-side, so the determinism corpus (which uses its own generator) is
 *  untouched. Deliberately NOT bag-derived — see the note at the call site. */
function ghostHpForRound(round: number): number {
  return 20 + Math.max(0, round - 1) * 2;
}

export interface GhostTemplate {
  readonly id: GhostId;
  readonly classId: ClassId;
  readonly combatant: Combatant;
}

/** Builds a deterministic Combatant for the given round + run seed.
 *
 *  M1.3.4a invariants:
 *    - Inputs (baseSeed, round) → identical GhostTemplate. Pure function.
 *    - bag.dimensions === ruleset.bagDimensions (passed in to keep the
 *      function decoupled from the ruleset import).
 *    - placements.length ≤ ITEM_COUNT_BY_ROUND[round-1] — the loop
 *      gives up after GHOST_PLACEMENT_ATTEMPTS if the bag is too tight. */
export function makeGhostForRound(
  baseSeed: SimSeed,
  round: number,
  bagDimensions: BagDimensions,
): GhostTemplate {
  const ghostSeed = shopSeedFor(baseSeed, round, GHOST_SEED_REROLL_OFFSET);
  const rng = createRng(ghostSeed);

  const classId: ClassId = (round % 2 === 1 ? 'marauder' : 'tinker') as ClassId;
  const maxRarity = RARITY_GATE_BY_ROUND[round - 1] ?? 'common';
  const maxRarityIdx = RARITY_ORDER.indexOf(maxRarity);
  const targetCount = ITEM_COUNT_BY_ROUND[round - 1] ?? 5;

  // Pool: shop-offer items (iconned minus the boss-reward-only SHOP_EXCLUDED_
  // ITEM_IDS, CF 66) at or below the rarity gate. Using SHOP_OFFER_ITEMS keeps a
  // boss-reward-only Legendary (world-forged-heart) out of ghost builds the same
  // way it's kept out of the shop. Sorted for deterministic iteration (rng draws
  // are independent of insertion order).
  const eligibleIds = (Object.keys(SHOP_OFFER_ITEMS) as ItemId[])
    .sort()
    .filter((id) => RARITY_ORDER.indexOf(ITEMS[id]!.rarity) <= maxRarityIdx);

  // Early rounds draw their FIRST item from the resolver subset only.
  //
  // The ghost draws uniformly from the 20 Commons, of which 14 deal no damage
  // and 2 more deal too little to kill 30 HP — so a round-1 ghost was inert 70%
  // of the time. When the player was ALSO inert (the shop guarantee now prevents
  // that half), nothing moved either HP bar for 500 ticks and sudden death
  // killed both on the same tick: a draw, costing the player a heart for a fight
  // that never happened. Measured: 91% of all draws were exactly this.
  //
  // Guaranteeing the ghost can kill is what makes the round genuinely LOSABLE
  // rather than merely winnable — without it, fixing only the shop would convert
  // the draw band into a free-win band, which is the unlosable-rounds problem
  // CF-93 already exists to complain about.
  //
  // Rounds 1–3 only; rounds 4+ measured 0–1.4% inert without any help.
  const earlyResolvers =
    round <= RESOLVER_GUARANTEE_ROUNDS
      ? eligibleIds.filter((id) => isResolver(SHOP_OFFER_ITEMS[id]!))
      : [];

  const placements: BagPlacement[] = [];
  let attempts = 0;
  while (placements.length < targetCount && attempts < GHOST_PLACEMENT_ATTEMPTS) {
    // Only the first placement is forced; everything after it draws normally, so
    // the ghost keeps its variety and this stays a floor rather than a template.
    const drawPool =
      placements.length === 0 && earlyResolvers.length > 0 ? earlyResolvers : eligibleIds;
    const itemId = drawPool[rng.nextInt(0, drawPool.length - 1)]!;
    const slot = findGhostPlacementSlot(placements, itemId, bagDimensions);
    if (slot) {
      placements.push({
        placementId: `g${placements.length}` as PlacementId,
        itemId,
        anchor: slot.anchor,
        rotation: slot.rotation,
      });
    }
    attempts++;
  }

  // HP scales gently with round (every other round +2 HP). Keeps early
  // rounds winnable and late rounds challenging without making the math
  // unreadable in the replay log.
  //
  // INTENTIONAL non-goal (combat-parity PR, CF 42 / CF 63): this is a
  // deliberate round-scaling difficulty knob, NOT a mirror of the player's
  // sim-side computeStartingHpFromBag derivation. makeGhostForRound is
  // placeholder scaffolding pending M2 ghost storage ("must remain easy to
  // delete" — see file header), so it deliberately does NOT sum the ghost
  // bag's passiveStats.maxHpBonus. Player and ghost use different HP
  // derivations by design; do not "fix" this asymmetry for symmetry's sake.
  const startingHp = ghostHpForRound(round);

  const id = `ghost-r${round}-${(ghostSeed >>> 0).toString(16)}` as GhostId;

  return {
    id,
    classId,
    combatant: {
      bag: { dimensions: bagDimensions, placements },
      relics: { starter: null, mid: null, boss: null },
      classId,
      startingHp,
    },
  };
}

/** First-fit placement search using the client's ItemDef.w/h bounding
 *  boxes (rotation: width and height swap when 90/270). Iconned items in
 *  M1 are 1×1 or 1×2, so first-fit converges fast. Rotation order is
 *  fixed [0, 90, 180, 270] — purely deterministic, no rng. */
function findGhostPlacementSlot(
  existing: ReadonlyArray<BagPlacement>,
  itemId: ItemId,
  dims: BagDimensions,
): { anchor: { col: number; row: number }; rotation: 0 | 90 | 180 | 270 } | null {
  const def = ITEMS[itemId];
  if (!def) return null;
  const occupied = new Set<string>();
  for (const p of existing) {
    const pdef = ITEMS[p.itemId];
    if (!pdef) continue;
    const rotated = p.rotation === 90 || p.rotation === 270;
    const pw = rotated ? pdef.h : pdef.w;
    const ph = rotated ? pdef.w : pdef.h;
    for (let dy = 0; dy < ph; dy++) {
      for (let dx = 0; dx < pw; dx++) {
        occupied.add(`${p.anchor.row + dy}:${p.anchor.col + dx}`);
      }
    }
  }
  const rots: ReadonlyArray<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  for (const rotation of rots) {
    const rotated = rotation === 90 || rotation === 270;
    const w = rotated ? def.h : def.w;
    const h = rotated ? def.w : def.h;
    for (let row = 0; row + h <= dims.height; row++) {
      for (let col = 0; col + w <= dims.width; col++) {
        let valid = true;
        for (let dy = 0; dy < h && valid; dy++) {
          for (let dx = 0; dx < w; dx++) {
            if (occupied.has(`${row + dy}:${col + dx}`)) {
              valid = false;
              break;
            }
          }
        }
        if (valid) return { anchor: { col, row }, rotation };
      }
    }
  }
  return null;
}
