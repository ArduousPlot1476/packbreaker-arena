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
import { CONTRACTS, type SimSeed } from '@packbreaker/content';
import { isResolver } from '../../../apps/client/src/run/resolvers.ts';
import { SHOP_POOL_ITEMS } from '../../../apps/client/src/run/content.ts';
import {
  STRATEGIES,
  type StrategyName,
} from '../../../packages/sim/test/determinism/strategies.ts';

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

/** Wraps a corpus strategy. Each policy instance owns its own rng stream, seeded
 *  off the run seed so a sweep is reproducible. */
export function adaptStrategy(name: string, seed: SimSeed): Policy {
  if (name === 'resolver-first') return resolverFirstPolicy(seed);
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
