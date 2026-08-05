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
import { createRng, type Rng } from '@packbreaker/sim';
import type { SimSeed } from '@packbreaker/content';
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

export const POLICY_NAMES: ReadonlyArray<StrategyName> = [
  'greedy',
  'hoarder',
  'recipe-chaser',
  'reroll-burner',
  'random-legal',
];

/** Wraps a corpus strategy. Each policy instance owns its own rng stream, seeded
 *  off the run seed so a sweep is reproducible. */
export function adaptStrategy(name: StrategyName, seed: SimSeed): Policy {
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
