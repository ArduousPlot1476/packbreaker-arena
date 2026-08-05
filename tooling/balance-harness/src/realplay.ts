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
//   ghost items      [2,2,3,3,4,4,5,5,6,6]         [1,1,2,3,4,5,5,6,7,8,5]
//   ghost HP         bag-derived (maxHpBonus sum)  30 + floor((round-1)/2)*2
//   ghost/shop pool  all 45 ITEMS                  44 SHOP_OFFER_ITEMS (CF 66)
//   round-11 boss    neutral, NO mutators, ~67 HP  Forge Tyrant, 50 HP, +2, +15%
//   combat seed      fresh rng per round           the RUN seed, every round
//   mid relic        never granted                 always offered at round 6
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
  type RunController,
  type RunControllerAction,
} from '@packbreaker/sim';
import {
  ContractId,
  type ClassId,
  type CombatInput,
  type CombatResult,
  type RelicId,
  type SimSeed,
} from '@packbreaker/content';

import { opponentForRound } from '../../../apps/client/src/combat/opponentForRound.ts';
import { runCombat } from '../../../apps/client/src/combat/sim-bridge.combat.ts';
import { generateShop } from '../../../apps/client/src/run/sim-bridge.ts';
import { ICONNED_RECIPES, SHOP_POOL_ITEMS } from '../../../apps/client/src/run/content.ts';
import { advanceCombatTickClock } from '../../../apps/client/src/combat/tickAdvancer.ts';

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
  readonly heartsAtStart: number;
  readonly goldAtRoundStart: number;
  readonly goldHeldAtCombat: number;
  readonly purchasesByRarity: Readonly<Record<string, number>>;
  readonly rerolls: number;
  readonly combines: number;
  readonly bagCellsUsed: number;
  /** Offers this round that were BOTH affordable and placeable — the choice
   *  space the round actually presented, independent of what the bot took. */
  readonly liveOffers: number;
  /** Ready recipe matches at combat time. */
  readonly readyRecipes: number;
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

export function runOne(spec: RunSpec): RunRecord {
  const ctrl = createRun({
    seed: spec.seed,
    classId: spec.classId,
    contractId: NEUTRAL,
    startingRelicId: spec.startingRelicId,
    // Client parity: the run screen plays the ICONNED subsets, not the raw
    // registries (CF 37 / CF 66).
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
  let goldAtRoundStart = ctrl.getState().gold;
  let seenOfferedThisRound = new Set<string>();

  const noteOffers = () => {
    for (const id of ctrl.getState().shop.slots) {
      if (id !== undefined && !seenOfferedThisRound.has(String(id))) {
        seenOfferedThisRound.add(String(id));
        itemsOffered.push(String(id));
      }
    }
  };
  noteOffers();

  for (let guard = 0; guard < MAX_ACTIONS && ctrl.getPhase() !== 'ended'; guard++) {
    const phase = ctrl.getPhase();

    if (phase === 'resolution') {
      ctrl.advancePhase();
      if (ctrl.getPhase() === 'arranging') {
        // New round: reset per-round accumulators BEFORE the shop refreshes.
        roundPurchases = {};
        roundRerolls = 0;
        roundCombines = 0;
        goldAtRoundStart = ctrl.getState().gold;
        seenOfferedThisRound = new Set();
        overrideFromClientShop(ctrl, `h${ctrl.getState().currentRound}`);
        noteOffers();
      }
      continue;
    }

    const decision = spec.policy.decide({ ctrl, pending });

    if (decision.kind === 'fight') {
      const s = ctrl.getState();
      const opponent = opponentForRound(s.seed, s.currentRound, s.ruleset.bagDimensions);
      const heartsAtStart = s.hearts;
      const goldHeldAtCombat = s.gold;
      const liveOffers = countLiveOffers(ctrl);
      const readyRecipes = ctrl.detectRecipes().filter((m) => ctrl.findCombineRotation(m) !== null)
        .length;
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
        heartsAtStart,
        goldAtRoundStart,
        goldHeldAtCombat,
        purchasesByRarity: { ...roundPurchases },
        rerolls: roundRerolls,
        combines: roundCombines,
        bagCellsUsed,
        liveOffers,
        readyRecipes,
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

    if (action.type === 'reroll_shop') {
      ctrl.rerollShop();
      roundRerolls++;
      // Override AFTER the sim call so rerollsThisRound is post-increment.
      overrideFromClientShop(ctrl, `h${ctrl.getState().currentRound}r${roundRerolls}`);
      noteOffers();
      continue;
    }

    try {
      applyAction(ctrl, action);
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

/** Offers that are BOTH affordable and physically placeable right now. This is
 *  the deliberation surface — the choice space the round presented, which is
 *  policy-independent, unlike "what did the bot buy". */
function countLiveOffers(ctrl: RunController): number {
  const s = ctrl.getState();
  let n = 0;
  for (let i = 0; i < s.shop.slots.length; i++) {
    if (s.shop.purchased.includes(i)) continue;
    const id = s.shop.slots[i];
    if (id === undefined) continue;
    const item = SHOP_POOL_ITEMS[String(id)];
    if (item === undefined) continue;
    if (item.cost > s.gold) continue;
    n++;
  }
  return n;
}

function countBagCells(ctrl: RunController): number {
  let n = 0;
  for (const p of ctrl.getState().bag.placements) {
    const item = SHOP_POOL_ITEMS[String(p.itemId)];
    n += item?.shape?.length ?? 1;
  }
  return n;
}
