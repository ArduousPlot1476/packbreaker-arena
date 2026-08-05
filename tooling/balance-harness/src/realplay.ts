// The real-play run driver.
//
// ─── Why this exists, and why it does NOT reuse generate.ts ────────────────
//
// packages/sim/test/determinism/generate.ts already drives full runs headlessly.
// It is the wrong driver for balance, because the corpus path and the real-play
// path are two different games:
//
//   surface          corpus                        real play
//   ---------------  ----------------------------  ------------------------------
//   ghost items      [2,2,3,3,4,4,5,5,6,6]         [1,1,2,4,6,8,10,12,13,14,5]
//   ghost HP         bag-derived (maxHpBonus sum)  20 + (round-1)*2
//   ghost/shop pool  all 45 ITEMS                  44 SHOP_OFFER_ITEMS (CF 66)
//   round-11 boss    neutral, NO mutators, ~67 HP  Forge Tyrant, 45 HP, +1, +15%
//   combat seed      fresh rng per round           the RUN seed, every round
//   mid relic        never granted                 always offered at round 6
//
// THE REAL-PLAY COLUMN IS DERIVED, NOT DECLARED. Every value in it comes from a
// module this file imports, so it moves when the game moves — but the table is
// prose and does NOT. Three of these six rows were stale when audited on
// 2026-08-05: two ghost rows had described the pre-2026-08-05 curve since that
// tuning landed, and the boss row the pre-retune numbers. A table whose whole
// job is to argue "the corpus and real play are two different games" was
// describing a third game that exists nowhere. Re-read it against ghost.ts and
// contracts.ts whenever either changes.
//
// Canon already names this (decision-log 2026-07-25): "fixture drift is a poor
// proxy for real-play impact". A harness on the corpus path would measure a game
// nobody plays — and specifically would NOT reproduce the 76/76 rounds-4-10 band,
// because that band is a property of apps/client/src/combat/ghost.ts, not of the
// sim.
//
// So this driver mirrors apps/client/src/run/useRun.ts's ordering and IMPORTS
// the client's own derivations. It does not copy them: a copy is a co-drift pair,
// which is the exact failure trophyDeltaFor was created to unwind. When someone
// tunes ITEM_COUNT_BY_ROUND, this harness moves with it automatically.
//
// Imports are relative rather than by package name. apps/client declares no
// "exports" map, so a deep specifier resolves only by luck of the resolver; a
// relative path through the workspace is unambiguous under tsx.

import {
  applyAction,
  computeDamageStats,
  createRun,
  effectiveItemCost,
  type RunController,
  type RunControllerAction,
} from '@packbreaker/sim';
import {
  ContractId,
  type ClassId,
  type CombatInput,
  type CombatResult,
  type ItemId,
  type RelicId,
  type Ruleset,
  type SimSeed,
} from '@packbreaker/content';

import { opponentForRound } from '../../../apps/client/src/combat/opponentForRound.ts';
import { runCombat } from '../../../apps/client/src/combat/sim-bridge.combat.ts';
import { generateShop } from '../../../apps/client/src/run/sim-bridge.ts';
import { ICONNED_RECIPES, SHOP_POOL_ITEMS } from '../../../apps/client/src/run/content.ts';
import { advanceCombatTickClock } from '../../../apps/client/src/combat/tickAdvancer.ts';

import { fitsAnywhere } from './bagfit.ts';
import type { Policy } from './policies.ts';

/** Playback constants, mirrored from CombatScene/CombatOverlay. Duplicated here
 *  ONLY because they are module-private consts on the scene; if they are ever
 *  exported, import them instead. */
const MS_PER_TICK = 100;
const FRAME_MS = 1000 / 60;
const DEAD_TIME_THRESHOLD_TICKS = 8;
const LEAD_IN_TICKS = 2;
const COMBAT_END_SETTLE_MS = 480;

/** Event types that make a combat worth watching. Mirrors CombatOverlay's
 *  MEANINGFUL_EVENT_TYPES — a combat with none of them AND a draw outcome never
 *  mounts Phaser at all, so its playback cost is zero. */
const MEANINGFUL = new Set([
  'damage',
  'heal',
  'status_apply',
  'status_tick',
  'item_trigger',
  'stun_consumed',
  'buff_apply',
  'buff_remove',
  'ramp_tick',
]);

/** Exact playback duration in ms, by REPLAYING the client's own pure tick clock
 *  over the event stream. Not a model — `advanceCombatTickClock` is the same
 *  function the scene runs, including dead-time fast-forward. This is the term a
 *  balance change actually moves: a faster kill is a shorter combat. */
export function playbackMs(events: CombatResult['events'], endedAtTick: number): number {
  if (!events.some((e) => MEANINGFUL.has(e.type))) return 0; // zero-content fast-skip
  let tick = 0;
  let acc = 0;
  let frames = 0;
  let idx = 0;
  // Bounded: 600 sim ticks at 60fps cannot exceed ~36k frames even with no
  // fast-forward at all. The cap is a runaway guard, not a behaviour.
  for (let guard = 0; guard < 60_000; guard++) {
    while (idx < events.length && events[idx]!.tick <= tick) idx++;
    const r = advanceCombatTickClock({
      currentTick: tick,
      accumulator: acc,
      delta: FRAME_MS,
      msPerTick: MS_PER_TICK,
      endedAtTick,
      nextEventTick: idx < events.length ? events[idx]!.tick : null,
      deadTimeThresholdTicks: DEAD_TIME_THRESHOLD_TICKS,
      leadInTicks: LEAD_IN_TICKS,
    });
    tick = r.newTick;
    acc = r.newAccumulator;
    frames++;
    if (r.reachedEnd) break;
  }
  return frames * FRAME_MS + COMBAT_END_SETTLE_MS;
}

export interface RoundRecord {
  readonly round: number;
  readonly outcome: 'player_win' | 'ghost_win' | 'draw';
  readonly endReason: string;
  readonly endedAtTick: number;
  readonly playbackMs: number;
  /** Item damage the player dealt / took. Ramp drain is EXCLUDED by
   *  computeDamageStats (CF-83), which is exactly what makes the pair a clean
   *  inertness test: ramp damage would otherwise make every stalled combat look
   *  like it had damage in it. */
  readonly damageDealt: number;
  readonly damageTaken: number;
  /** Neither side landed a single point of item damage in the entire combat.
   *
   *  This is the diagnosis the first sweep was missing. A 22% draw rate says
   *  combats aren't resolving; this says WHY — 14 of 20 Commons deal no damage
   *  at all, so a 1-item bag on both sides means 30 HP vs 30 HP with nothing
   *  able to move either number, until the ramp kills both on the same tick. */
  readonly bothSidesInert: boolean;
  readonly heartsAtStart: number;
  readonly goldAtRoundStart: number;
  readonly goldHeldAtCombat: number;
  /** GROSS gold spent this round — every decrease summed as it happens, not the
   *  net wallet delta.
   *
   *  The two are the same number only for a policy that never sells. They are
   *  NOT the same for `sell-to-fit`: a round that opens at 10g, sells for 4g and
   *  spends 14g arrives at combat with 0g, and the net delta calls that 10g of
   *  spend. That understates precisely the late-game churn this metric exists to
   *  measure, and it understates it only under the selling policy — which would
   *  have made the two policies' spend columns quietly incomparable.
   *
   *  Summed from the controller's own gold between actions rather than from a
   *  re-derived price, so it cannot drift from `effectiveItemCost` or
   *  `computeRerollCost`. Buy and reroll are the sim's only two gold sinks
   *  (state.ts:612 and :747); sells raise gold and contribute nothing here. */
  readonly goldSpent: number;
  /** GROSS gold taken in from sales this round, summed at each sale.
   *
   *  Deliberately NOT "sale proceeds respent". That quantity was reported once
   *  and is not measurable: gold is fungible, so there is no fact of the matter
   *  about which coin funded which purchase. The derived version
   *  `goldSpent - (goldAtRoundStart - goldHeldAtCombat)` is algebraically
   *  identical to gross proceeds — substituting the round's conservation
   *  identity `G1 = G0 - S + R` collapses it to R — so it reported the whole
   *  refund as respent even when the sale happened AFTER the last purchase.
   *
   *  Measured at the sale rather than derived from the wallet, so it stays true
   *  if a future within-round gold source breaks that identity. Paired with
   *  goldSpent, the two say "churn cost this much and returned this much"
   *  without either standing in for the other. */
  readonly goldRecovered: number;
  readonly purchasesByRarity: Readonly<Record<string, number>>;
  readonly rerolls: number;
  readonly combines: number;
  readonly bagCellsUsed: number;
  /** Offers that were BOTH affordable and placeable AT SHOP ENTRY — the choice
   *  space the round presented before the bot spent a coin.
   *
   *  THE SAMPLE POINT IS THE WHOLE POINT, and it used to be wrong. This was
   *  measured at Continue, i.e. AFTER purchases, which inverts it: a round where
   *  the player deliberated over five offers and bought three scored as EMPTY
   *  (they were down to 1 gold by then), while a round where the player bought
   *  nothing and sat on 39 gold scored as FULL of choice. Measured on f381637,
   *  rounds 1-5 read 100% empty while the bot was buying 1.0-2.5 items a round,
   *  and round 11 read 4% empty holding 39 gold with a full bag.
   *
   *  Sampled at the round's OPENING shop only — not after a reroll. A reroll is
   *  a decision made in RESPONSE to the opening surface, so folding it in would
   *  make this measure the bot's reaction instead of the round's offer. Rerolls
   *  are reported separately. */
  readonly liveOffers: number;
  /** Offers affordable at shop entry IGNORING placeability. The discriminator:
   *  `affordableOffers > 0 && liveOffers === 0` is the bag saying no while the
   *  wallet says yes — the late-game wall, distinguished from simply being
   *  broke. Without this pair the two failure modes are one number. */
  readonly affordableOffers: number;
  /** The live count at Continue, AFTER the bot has spent. Not the pacing signal
   *  — this is unspent capacity: how much the round still had on the table when
   *  the player walked away from it. High late-round values with low purchases
   *  are the late-game saturation signature. */
  readonly residualOffers: number;
  /** Ready recipe matches at combat time. */
  readonly readyRecipes: number;
  /** Did this round offer a recipe decision AT ANY POINT?
   *
   *  Third instance of the sample-point defect: `readyRecipes` is counted at
   *  Continue, so a recipe that was ready and got COMBINED reads 0 there — the
   *  round scored as having no recipe decision precisely because the player took
   *  it. This ORs the three moments: ready when the shop opened, combined during
   *  the round, or still ready at Continue. */
  readonly hadRecipeDecision: boolean;
}

export interface RunRecord {
  readonly seed: number;
  readonly classId: string;
  readonly policy: string;
  readonly outcome: string;
  readonly roundsReached: number;
  readonly finalHearts: number;
  readonly rounds: ReadonlyArray<RoundRecord>;
  readonly itemsPurchased: ReadonlyArray<string>;
  readonly itemsOffered: ReadonlyArray<string>;
  readonly recipesCompleted: ReadonlyArray<string>;
}

export interface RunSpec {
  readonly seed: SimSeed;
  readonly classId: ClassId;
  readonly startingRelicId: RelicId;
  readonly policy: Policy;
  /** Sweep knob. Replaces the neutral contract's ruleset so a grid can vary
   *  hearts / gold / shop size without editing packages/content between runs.
   *  Undefined = shipped values. */
  readonly rulesetOverride?: Ruleset;
  /** Sweep knob for the round-11 boss. Undefined = shipped values.
   *
   *  Unlike `rulesetOverride` there is no injection point in the shipped code to
   *  reuse: `opponentForRound` reads CONTRACTS['forge-tyrant-boss'] directly and
   *  takes no parameter. So the harness rewrites the assembled RoundOpponent at
   *  its own boundary — applying each field by exactly the route the shipped code
   *  applies it (hpOverride straight onto `startingHp`, damage and lifesteal
   *  through `mutators` for the sim to fold ghost-side), so a swept number and a
   *  landed number mean the same thing. */
  readonly bossOverride?: BossOverride;
}

export interface BossOverride {
  readonly hpOverride?: number;
  readonly damageBonus?: number;
  readonly lifestealPctBonus?: number;
}

const NEUTRAL = ContractId('neutral');
const MAX_ACTIONS = 4000;

/** Re-derives the client shop and pushes it into the controller.
 *
 *  useRun.ts does this at three points: after createRun, after every reroll, and
 *  after every advancePhase into 'arranging'. The sim generates a shop of its
 *  own on the run rng; the client overwrites it with one derived from
 *  shopSeedFor(seed, round, rerolls). Miss any of the three and the harness
 *  measures a shop no player ever sees. */
function overrideFromClientShop(ctrl: RunController, uidPrefix: string): void {
  const s = ctrl.getState();
  const slots = generateShop(
    s.seed,
    s.currentRound,
    s.classId,
    s.ruleset,
    // POST-increment: rerollShop() bumps rerollsThisRound before this runs, and
    // useRun reads the value after the sim call for exactly that reason.
    s.shop.rerollsThisRound,
    uidPrefix,
  );
  // ShopSlot.itemId is nullable because a SOLD slot carries null in the client's
  // display model. A freshly generated shop never has one — generateShop maps
  // straight off shopState.slots — so a null here means the generator changed
  // shape, and throwing is better than silently shipping a short shop into the
  // controller and measuring a shop size nobody plays.
  const itemIds = slots.map((slot) => {
    if (slot.itemId === null) throw new Error('generateShop produced a null slot');
    return slot.itemId;
  });
  ctrl.overrideShopSlots(itemIds);
}

/** Rewrites the round-11 boss's numbers for a sweep. Identity when no override
 *  is given, and identity on rounds 1-10 regardless (those carry no mutators).
 *
 *  Mirrors the shipped two-site split exactly (opponentForRound.ts:89-96):
 *  `hpOverride` lands on `combatant.startingHp` because simulateCombat never
 *  reads it, while `damageBonus` / `lifestealPctBonus` stay in `mutators` for
 *  applyBossMutatorsToGhost to fold. Getting this wrong would make the sweep
 *  measure a boss the content could not express. */
function applyBossOverride(
  opponent: ReturnType<typeof opponentForRound>,
  override: BossOverride | undefined,
): ReturnType<typeof opponentForRound> {
  if (override === undefined) return opponent;
  const bossMutators = opponent.mutators.filter((m) => m.type === 'boss_only');
  if (bossMutators.length === 0) return opponent; // not the boss round

  const mutators = opponent.mutators.map((m) =>
    m.type === 'boss_only'
      ? {
          ...m,
          hpOverride: override.hpOverride ?? m.hpOverride,
          damageBonus: override.damageBonus ?? m.damageBonus,
          lifestealPctBonus: override.lifestealPctBonus ?? m.lifestealPctBonus,
        }
      : m,
  );

  return {
    ...opponent,
    mutators,
    combatant: {
      ...opponent.combatant,
      startingHp: override.hpOverride ?? opponent.combatant.startingHp,
    },
  };
}

export function runOne(spec: RunSpec): RunRecord {
  const ctrl = createRun({
    seed: spec.seed,
    classId: spec.classId,
    contractId: NEUTRAL,
    startingRelicId: spec.startingRelicId,
    // Client parity: the run screen plays the ICONNED subsets, not the raw
    // registries (CF 37 / CF 66).
    rulesetOverride: spec.rulesetOverride,
    itemsRegistry: SHOP_POOL_ITEMS as never,
    recipesRegistry: ICONNED_RECIPES as never,
  });
  overrideFromClientShop(ctrl, 'h');

  const rounds: RoundRecord[] = [];
  const itemsPurchased: string[] = [];
  const itemsOffered: string[] = [];
  const recipesCompleted: string[] = [];
  const pending: string[] = [];

  let roundPurchases: Record<string, number> = {};
  let roundRerolls = 0;
  let roundCombines = 0;
  let roundGoldSpent = 0;
  let roundGoldRecovered = 0;
  let goldAtRoundStart = ctrl.getState().gold;
  let seenOfferedThisRound = new Set<string>();
  // The round's OPENING deliberation surface, sampled before the policy acts.
  // See RoundRecord.liveOffers for why the sample point matters.
  let offersAtShopEntry = { affordable: 0, live: 0 };
  let readyRecipesAtShopEntry = 0;

  const countReadyRecipes = () =>
    ctrl.detectRecipes().filter((m) => ctrl.findCombineRotation(m) !== null).length;

  const noteOffers = () => {
    for (const id of ctrl.getState().shop.slots) {
      if (id !== undefined && !seenOfferedThisRound.has(String(id))) {
        seenOfferedThisRound.add(String(id));
        itemsOffered.push(String(id));
      }
    }
  };
  noteOffers();
  offersAtShopEntry = countOffers(ctrl);
  readyRecipesAtShopEntry = countReadyRecipes();

  for (let guard = 0; guard < MAX_ACTIONS && ctrl.getPhase() !== 'ended'; guard++) {
    const phase = ctrl.getPhase();

    if (phase === 'resolution') {
      ctrl.advancePhase();
      if (ctrl.getPhase() === 'arranging') {
        // New round: reset per-round accumulators BEFORE the shop refreshes.
        roundPurchases = {};
        roundRerolls = 0;
        roundCombines = 0;
        roundGoldSpent = 0;
        roundGoldRecovered = 0;
        goldAtRoundStart = ctrl.getState().gold;
        seenOfferedThisRound = new Set();
        overrideFromClientShop(ctrl, `h${ctrl.getState().currentRound}`);
        noteOffers();
        // Sample AFTER the shop refreshes and BEFORE the policy gets a turn.
        offersAtShopEntry = countOffers(ctrl);
        readyRecipesAtShopEntry = countReadyRecipes();
      }
      continue;
    }

    const decision = spec.policy.decide({ ctrl, pending });

    if (decision.kind === 'fight') {
      const s = ctrl.getState();
      const opponent = applyBossOverride(
        opponentForRound(s.seed, s.currentRound, s.ruleset.bagDimensions),
        spec.bossOverride,
      );
      const heartsAtStart = s.hearts;
      const goldHeldAtCombat = s.gold;
      const residualOffers = countOffers(ctrl).live;
      const readyRecipes = countReadyRecipes();
      const bagCellsUsed = countBagCells(ctrl);

      ctrl.enterCombatPhase();
      const input: CombatInput = {
        // The client passes the RUN seed every round, not a fresh draw. This is
        // one of the biggest corpus/real-play divergences.
        seed: s.seed,
        player: {
          bag: { dimensions: s.bag.dimensions, placements: s.bag.placements },
          relics: s.relics,
          classId: s.classId,
          startingHp: ctrl.getPlayerStartingHp(),
          recipeBornPlacementIds: ctrl.getRecipeBornPlacementIds(),
        },
        ghost: opponent.combatant,
      };
      const result = runCombat(input, opponent.mutators);
      const { damageDealt, damageTaken } = computeDamageStats(result.events);
      ctrl.applyCombatOutcome({
        outcome: result.outcome,
        damageDealt,
        damageTaken,
        endedAtTick: result.endedAtTick,
        endReason: result.endReason,
        opponentGhostId: opponent.ghostId,
        opponentClassId: opponent.classId,
      });

      rounds.push({
        round: s.currentRound,
        outcome: result.outcome,
        endReason: String(result.endReason),
        endedAtTick: result.endedAtTick,
        playbackMs: playbackMs(result.events, result.endedAtTick),
        damageDealt,
        damageTaken,
        bothSidesInert: damageDealt === 0 && damageTaken === 0,
        heartsAtStart,
        goldAtRoundStart,
        goldHeldAtCombat,
        goldSpent: roundGoldSpent,
        goldRecovered: roundGoldRecovered,
        purchasesByRarity: { ...roundPurchases },
        rerolls: roundRerolls,
        combines: roundCombines,
        bagCellsUsed,
        liveOffers: offersAtShopEntry.live,
        affordableOffers: offersAtShopEntry.affordable,
        residualOffers,
        readyRecipes,
        hadRecipeDecision:
          readyRecipesAtShopEntry > 0 || roundCombines > 0 || readyRecipes > 0,
      });
      continue;
    }

    if (decision.kind === 'stop') break;

    const action: RunControllerAction = decision.action;

    // Mirror the controller's private pendingItems list, exactly as
    // generate.ts does — strategies read it to decide what to place.
    if (action.type === 'buy_item') {
      const itemId = ctrl.getState().shop.slots[action.slotIndex];
      if (itemId !== undefined) {
        pending.push(String(itemId));
        itemsPurchased.push(String(itemId));
        const rarity = SHOP_POOL_ITEMS[String(itemId)]?.rarity ?? 'unknown';
        roundPurchases[rarity] = (roundPurchases[rarity] ?? 0) + 1;
      }
    } else if (action.type === 'place_item') {
      const i = pending.indexOf(String(action.itemId));
      if (i >= 0) pending.splice(i, 1);
    }

    // Gold before every state-changing call. BOTH directions are banked at the
    // moment they happen — down is spend (buy, reroll), up is a sale. Measuring
    // each independently is the point: any one of them derived from the other
    // two via the wallet identity collapses into a quantity that is not what its
    // label says. See RoundRecord.goldSpent / goldRecovered.
    const goldBeforeAction = ctrl.getState().gold;
    const bankGold = () => {
      const after = ctrl.getState().gold;
      if (after < goldBeforeAction) roundGoldSpent += goldBeforeAction - after;
      else if (after > goldBeforeAction) roundGoldRecovered += after - goldBeforeAction;
    };

    if (action.type === 'reroll_shop') {
      ctrl.rerollShop();
      bankGold();
      roundRerolls++;
      // Override AFTER the sim call so rerollsThisRound is post-increment.
      overrideFromClientShop(ctrl, `h${ctrl.getState().currentRound}r${roundRerolls}`);
      noteOffers();
      continue;
    }

    try {
      applyAction(ctrl, action);
      bankGold();
    } catch {
      // A policy that emits an illegal action ends its own run rather than
      // aborting the sweep. Recorded as a short run; visible in roundsReached.
      break;
    }
    if (action.type === 'combine_recipe') {
      roundCombines++;
      recipesCompleted.push(String(action.recipeId));
    }
  }

  const final = ctrl.getState();
  return {
    seed: Number(spec.seed),
    classId: String(spec.classId),
    policy: spec.policy.name,
    outcome: String(final.outcome),
    roundsReached: final.currentRound,
    finalHearts: final.hearts,
    rounds,
    itemsPurchased,
    itemsOffered,
    recipesCompleted,
  };
}

/** Offers that are BOTH affordable and physically placeable right now.
 *
 *  Two corrections against the pre-2026-08-05 version, which checked neither
 *  thing properly despite its docstring claiming both:
 *
 *  1. PLACEABILITY was never tested at all — the body was `item.cost > s.gold`
 *     and nothing else. So the late-game problem this metric exists to find (the
 *     bag fills to 24/24 by round 9 and purchasing power has nowhere to go) was
 *     invisible to it by construction. It now tests all four rotations, because
 *     a 2x1 that will not fit horizontally may fit vertically.
 *  2. AFFORDABILITY used the raw `item.cost`, ignoring relic itemCostDelta and
 *     ruleset itemCostMultiplierBp. Every other affordability check in the
 *     codebase goes through `effectiveItemCost`; this one silently didn't, so a
 *     Merchant's Mark run reported the wrong choice space. */
function countOffers(ctrl: RunController): { affordable: number; live: number } {
  const s = ctrl.getState();
  let affordable = 0;
  let live = 0;
  for (let i = 0; i < s.shop.slots.length; i++) {
    if (s.shop.purchased.includes(i)) continue;
    const id = s.shop.slots[i];
    if (id === undefined) continue;
    const item = SHOP_POOL_ITEMS[String(id)];
    if (item === undefined) continue;
    const cost = effectiveItemCost(item, s.derived.itemCostDelta, s.ruleset.itemCostMultiplierBp);
    if (cost > s.gold) continue;
    affordable++;
    if (!fitsAnywhere(s.bag, id as ItemId, SHOP_POOL_ITEMS as never)) continue;
    live++;
  }
  return { affordable, live };
}

function countBagCells(ctrl: RunController): number {
  let n = 0;
  for (const p of ctrl.getState().bag.placements) {
    const item = SHOP_POOL_ITEMS[String(p.itemId)];
    n += item?.shape?.length ?? 1;
  }
  return n;
}
