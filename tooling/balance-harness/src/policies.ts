// Player policies.
//
// packages/sim/test/determinism/strategies.ts already implements six of them.
// They are IMPORT-ONLY here — never edited, never forked. That file plus
// generate.ts and ghost-generator.ts are the INPUTS to fixture generation:
// editing one leaves all 224 committed fixtures passing while changing what the
// next regeneration produces, which is a divergence that surfaces months later
// as an unexplained corpus churn.
//
// The one thing that must change is combat. The corpus strategies return a
// `start_combat*` action, which runs combat INSIDE the controller
// (runCombatInternal) — a path real play never traverses. The adapter below
// translates that return into a "fight" sentinel and hands combat to the
// real-play driver instead.
//
// HONEST LIMIT, and it belongs in every report these produce: strategies.ts's
// own header says the strategies "are heuristic and aim for path coverage, not
// realism". They are a baseline, not a player model. Absolute numbers from them
// describe the policy; DELTAS under a fixed policy describe the change.

import type { RunController, RunControllerAction } from '@packbreaker/sim';
import { composeRuleset, createRng, effectiveItemCost, type Rng } from '@packbreaker/sim';
import {
  CONTRACTS,
  type ItemId,
  type PlacementId,
  type Rarity,
  type SimSeed,
} from '@packbreaker/content';
import { isResolver } from '../../../apps/client/src/run/resolvers.ts';
import { SHOP_POOL_ITEMS } from '../../../apps/client/src/run/content.ts';
import {
  STRATEGIES,
  type StrategyName,
} from '../../../packages/sim/test/determinism/strategies.ts';
import { fitsAnywhere } from './bagfit.ts';

export interface PolicyContext {
  readonly ctrl: RunController;
  /** Bought-but-unplaced items. Mirrors the controller's private list. */
  readonly pending: ReadonlyArray<string>;
}

export type PolicyDecision =
  | { readonly kind: 'action'; readonly action: RunControllerAction }
  /** Done arranging — the DRIVER owns combat, not the policy. */
  | { readonly kind: 'fight' }
  /** No legal move; end the run. */
  | { readonly kind: 'stop' };

export interface Policy {
  readonly name: string;
  decide(ctx: PolicyContext): PolicyDecision;
}

/** Corpus strategies, plus the harness's own. `resolver-first` is NOT a corpus
 *  strategy and must never be added to strategies.ts — that file is a fixture
 *  input. */
export const POLICY_NAMES: ReadonlyArray<string> = [
  'greedy',
  'hoarder',
  'recipe-chaser',
  'reroll-burner',
  'random-legal',
  'resolver-first',
  'sell-to-fit',
];

/** Buys a weapon when it can, then plays greedily.
 *
 *  WHY THIS EXISTS, and the bias it is here to avoid.
 *
 *  The corpus strategies buy by SLOT INDEX or by RARITY, never by what an item
 *  does. `greedy` takes the first affordable slot; `hoarder` takes the most
 *  expensive. Neither will preferentially pick up a weapon, so both understate
 *  what a player experiences in the opening — measured, they bought 0.58 items
 *  in round 1 and lost 91% of them even with a weapon guaranteed to be on offer.
 *
 *  That is not a difficulty measurement, it is a measurement of a bot declining
 *  to play. Buying a weapon in round 1 is not exotic play; it is the floor.
 *
 *  HONESTY NOTE: this policy was written alongside the shop guarantee it helps
 *  evaluate, which is a real risk of grading my own homework. Mitigation — it is
 *  additive, the five corpus policies stay in every sweep, and the report shows
 *  both. If the guarantee only looks good under `resolver-first`, that shows up
 *  as a split between policies rather than being hidden by averaging. */
function resolverFirstPolicy(seed: SimSeed): Policy {
  const greedy = STRATEGIES.greedy;
  const rng: Rng = createRng(seed);

  return {
    name: 'resolver-first',
    decide({ ctrl, pending }) {
      // Placement and everything else is greedy's job; only the BUY decision is
      // overridden, and only while the bag still has no way to win a fight.
      if (pending.length === 0) {
        const state = ctrl.getState();
        const ownsResolver = state.bag.placements.some((p) =>
          isResolver(SHOP_POOL_ITEMS[String(p.itemId)]!),
        );
        if (!ownsResolver) {
          const contract = CONTRACTS[state.contractId]!;
          const itemCostDelta = composeRuleset(contract, state.classId, state.relics).derived
            .itemCostDelta;
          for (let i = 0; i < state.shop.slots.length; i++) {
            if (state.shop.purchased.includes(i)) continue;
            const id = state.shop.slots[i];
            if (id === undefined) continue;
            const item = SHOP_POOL_ITEMS[String(id)];
            if (item === undefined || !isResolver(item)) continue;
            const cost = effectiveItemCost(
              item,
              itemCostDelta,
              state.ruleset.itemCostMultiplierBp,
            );
            if (cost > state.gold) continue;
            return { kind: 'action', action: { type: 'buy_item', slotIndex: i } };
          }
        }
      }

      const action = greedy({ ctrl, rng, pending: pending as never } as never);
      if (action === null) return { kind: 'stop' };
      if (action.type === 'start_combat' || action.type === 'start_combat_from_ghost_build') {
        return { kind: 'fight' };
      }
      return { kind: 'action', action };
    },
  };
}

const RARITY_ORDER: Readonly<Record<Rarity, number>> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

function rarityRank(itemId: string): number {
  const item = SHOP_POOL_ITEMS[itemId];
  return item === undefined ? -1 : (RARITY_ORDER[item.rarity] ?? -1);
}

/** `resolver-first`, plus the one late-game move it cannot make: selling.
 *
 *  WHY THIS EXISTS. `resolver-first` delegates everything except the opening
 *  weapon buy to `greedy`, and greedy's buy gate is:
 *
 *      if (findFirstValidPlacement(state.bag, itemId, [0]) === null) continue;
 *
 *  — it refuses to buy anything that does not ALREADY fit, at rotation 0 only.
 *  Its sell branch fires only for an item already PENDING from a buy. So a full
 *  bag is an ABSORBING STATE: no buy, therefore no sell, therefore no buy.
 *  Measured on f381637 under resolver-first, the bag reaches 23.9 of 24 cells by
 *  round 11, purchases fall to 0.16/round, and gold climbs to 39 unspent. Under
 *  a 6x win bonus it is starker: 24.0/24 cells, 0.00 purchases, 87 gold.
 *
 *  That made the question "does the late game run out of decisions?"
 *  unanswerable — the number was a property of the policy. A human sells a
 *  Common and buys the Epic; this policy is the floor of that competence.
 *
 *  IT IS A STRICT SUPERSET of resolver-first: same opening, same greedy
 *  delegation, one added clause. So `sell-to-fit` minus `resolver-first` is
 *  exactly the value of being able to sell, which is the ablation the late-game
 *  question needs.
 *
 *  TERMINATION. Sell candidates are restricted to placements of STRICTLY lower
 *  rarity than the target, so each sell shrinks that set by one and the clear
 *  loop is bounded by the bag's placement count. The explicit guard below is a
 *  backstop, not the argument. The policy also refuses to sell its last resolver
 *  — clearing space by disarming yourself is not competent play, and it would
 *  hand the opening clause a fight it already won. */
function sellToFitPolicy(seed: SimSeed): Policy {
  const greedy = STRATEGIES.greedy;
  const rng: Rng = createRng(seed);

  /** The offer we are currently making room for, and how many sells we have
   *  spent on it. Reset when the target is bought, vanishes, or proves
   *  unreachable. */
  let clearingFor: ItemId | null = null;
  let sellsThisClear = 0;
  /** Targets abandoned this run — never re-attempted, so a target that cannot
   *  be cleared cannot re-trigger the loop every tick. */
  const abandoned = new Set<string>();

  return {
    name: 'sell-to-fit',
    decide({ ctrl, pending }) {
      const state = ctrl.getState();

      // Placement first, always — greedy owns it, and a pending item means the
      // buy already happened.
      if (pending.length === 0) {
        const itemCostDelta = state.derived.itemCostDelta;
        const costOf = (id: string): number =>
          effectiveItemCost(
            SHOP_POOL_ITEMS[id]!,
            itemCostDelta,
            state.ruleset.itemCostMultiplierBp,
          );

        // ── resolver-first's opening clause, unchanged ────────────────────
        const ownsResolver = state.bag.placements.some((p) =>
          isResolver(SHOP_POOL_ITEMS[String(p.itemId)]!),
        );
        if (!ownsResolver) {
          for (let i = 0; i < state.shop.slots.length; i++) {
            if (state.shop.purchased.includes(i)) continue;
            const id = state.shop.slots[i];
            if (id === undefined) continue;
            const item = SHOP_POOL_ITEMS[String(id)];
            if (item === undefined || !isResolver(item)) continue;
            if (costOf(String(id)) > state.gold) continue;
            return { kind: 'action', action: { type: 'buy_item', slotIndex: i } };
          }
        }

        // ── the added clause: clear room for the best offer that won't fit ──

        // Drop a stale target: bought, rerolled away, or no longer affordable.
        if (clearingFor !== null) {
          const stillOffered = state.shop.slots.some(
            (id, i) => id === clearingFor && !state.shop.purchased.includes(i),
          );
          if (!stillOffered || costOf(String(clearingFor)) > state.gold) {
            clearingFor = null;
            sellsThisClear = 0;
          }
        }

        // If the target now fits, take it. This buy is OURS rather than
        // greedy's on purpose: greedy takes the first affordable slot, which
        // could be a Common dropped straight into the cell we just cleared,
        // leaving the target still unfitting and the clear loop live forever.
        if (clearingFor !== null && fitsAnywhere(state.bag, clearingFor, SHOP_POOL_ITEMS as never)) {
          const slotIndex = state.shop.slots.findIndex(
            (id, i) => id === clearingFor && !state.shop.purchased.includes(i),
          );
          if (slotIndex >= 0) {
            clearingFor = null;
            sellsThisClear = 0;
            return { kind: 'action', action: { type: 'buy_item', slotIndex } };
          }
        }

        // Pick a target: the highest-rarity affordable offer that does not fit.
        if (clearingFor === null) {
          let best: { id: ItemId; rank: number } | null = null;
          for (let i = 0; i < state.shop.slots.length; i++) {
            if (state.shop.purchased.includes(i)) continue;
            const id = state.shop.slots[i];
            if (id === undefined) continue;
            const key = String(id);
            if (abandoned.has(key)) continue;
            if (SHOP_POOL_ITEMS[key] === undefined) continue;
            if (costOf(key) > state.gold) continue;
            if (fitsAnywhere(state.bag, id as ItemId, SHOP_POOL_ITEMS as never)) continue;
            const rank = rarityRank(key);
            if (best === null || rank > best.rank) best = { id: id as ItemId, rank };
          }
          if (best !== null) {
            clearingFor = best.id;
            sellsThisClear = 0;
          }
        }

        // Sell the cheapest thing strictly worse than the target.
        if (clearingFor !== null) {
          const targetRank = rarityRank(String(clearingFor));
          const resolverCount = state.bag.placements.filter((p) =>
            isResolver(SHOP_POOL_ITEMS[String(p.itemId)]!),
          ).length;

          let victim: { id: PlacementId; rank: number } | null = null;
          for (const p of state.bag.placements) {
            const key = String(p.itemId);
            const rank = rarityRank(key);
            if (rank < 0 || rank >= targetRank) continue;
            // Never disarm: keep at least one fight-ending item.
            if (resolverCount <= 1 && isResolver(SHOP_POOL_ITEMS[key]!)) continue;
            if (victim === null || rank < victim.rank) {
              victim = { id: p.placementId, rank };
            }
          }

          if (victim !== null && sellsThisClear < state.bag.placements.length) {
            sellsThisClear++;
            return { kind: 'action', action: { type: 'sell_item', placementId: victim.id } };
          }
          // Nothing left worth selling — give up on this target for the run.
          abandoned.add(String(clearingFor));
          clearingFor = null;
          sellsThisClear = 0;
        }
      }

      const action = greedy({ ctrl, rng, pending: pending as never } as never);
      if (action === null) return { kind: 'stop' };
      if (action.type === 'start_combat' || action.type === 'start_combat_from_ghost_build') {
        return { kind: 'fight' };
      }
      return { kind: 'action', action };
    },
  };
}

/** Wraps a corpus strategy. Each policy instance owns its own rng stream, seeded
 *  off the run seed so a sweep is reproducible. */
export function adaptStrategy(name: string, seed: SimSeed): Policy {
  if (name === 'resolver-first') return resolverFirstPolicy(seed);
  if (name === 'sell-to-fit') return sellToFitPolicy(seed);
  return adaptCorpusStrategy(name as StrategyName, seed);
}

function adaptCorpusStrategy(name: StrategyName, seed: SimSeed): Policy {
  const strategy = STRATEGIES[name];
  // Strategy rng is deliberately a SEPARATE stream from the run rng — mirrors
  // generate.ts, where perturbing the run cursor would change the shop.
  const rng: Rng = createRng(seed);
  return {
    name,
    decide({ ctrl, pending }) {
      const action = strategy({
        ctrl,
        rng,
        pending: pending as never,
      } as never);
      if (action === null) return { kind: 'stop' };
      if (
        action.type === 'start_combat' ||
        action.type === 'start_combat_from_ghost_build'
      ) {
        return { kind: 'fight' };
      }
      return { kind: 'action', action };
    },
  };
}
