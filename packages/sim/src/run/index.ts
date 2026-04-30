// run/ barrel — public surface for the M1.2.4 run-state machine and the
// M1.2.5 determinism action-stream API.

export type { CreateRunInput, RunController, RunPhase } from './state';
export { createRun } from './state';

export type { RecipeMatch } from './recipes';
export { detectRecipes } from './recipes';

export type { ComposedRuleset, DerivedModifiers } from './ruleset';
export { composeRuleset, baseIncomeForRound } from './ruleset';

export {
  computeRerollCost,
  effectiveItemCost,
  generateShop,
  sellValueOf,
} from './shop';

export { replayCombat } from './replay';

export type { RunControllerAction } from './actions';
export { applyAction } from './actions';
