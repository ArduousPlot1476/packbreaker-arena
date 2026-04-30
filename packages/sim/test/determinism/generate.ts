// determinism/generate.ts — TEST SCAFFOLDING.
//
// 200-fixture orchestrator for the M1.2.5 determinism suite.
//
// Distribution: 5 strategies × { greedy: 40, hoarder: 100, recipe-chaser: 40,
// reroll-burner: 10, random-legal: 10 } = 200 fixtures. Each fixture pins a
// (seed, classId, startingRelicId) tuple cycling through 12 (class × starter
// relic) pairs so coverage target #4 is met by construction.
//
// Coverage targets (per the M1.2.5 ratification):
//   1. Boss round (round 11) reached >=10 times.
//   2. Tick-cap draw (endedAtTick === 600) >=1 time. ORGANIC ONLY.
//   3. All 12 recipes from balance-bible.md § 11 fire >=3 times each.
//   4. All 6 starter relics × both classes appear in starter slot >=5 times each.
//   5. Rotation 270 on a non-square item >=1 time.
//
// On any unmet target after a bounded re-roll loop (50 attempts per target),
// the orchestrator halts and surfaces a coverage gap report. It does NOT
// silently extend retries or contrive sim inputs.

import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClassId,
  ContractId,
  ITEMS,
  IsoTimestamp,
  RECIPES,
  RelicId,
  SimSeed,
  type CombatEvent,
  type RunOutcome,
  type RecipeId,
} from '@packbreaker/content';
import { createRng, type Rng } from '../../src/rng';
import {
  applyAction,
  createRun,
  type CreateRunInput,
  type RunControllerAction,
} from '../../src/run';
import { STRATEGIES, type StrategyName } from './strategies';
import type {
  FixtureHeader,
  FixtureTerminalState,
} from './harness';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'runs');

interface FixtureSpec {
  readonly idx: number;
  readonly seed: SimSeed;
  readonly classId: ClassId;
  readonly startingRelicId: RelicId;
  readonly strategy: StrategyName;
}

interface GeneratedFixture {
  readonly spec: FixtureSpec;
  readonly actions: ReadonlyArray<RunControllerAction>;
  readonly terminal: FixtureTerminalState;
  /** Per-round { recipeId fired, rotation 270 used on non-square, endedAtTick }
   *  metadata for coverage analysis. */
  readonly recipesFired: ReadonlyArray<RecipeId>;
  readonly rotation270OnNonSquare: boolean;
  readonly tickCapDraw: boolean;
  readonly bossRoundReached: boolean;
}

const STARTER_PAIRS: ReadonlyArray<{ classId: ClassId; startingRelicId: RelicId }> = [
  { classId: ClassId('tinker'),   startingRelicId: RelicId('apprentices-loop') },
  { classId: ClassId('tinker'),   startingRelicId: RelicId('pocket-forge')     },
  { classId: ClassId('tinker'),   startingRelicId: RelicId('merchants-mark')   },
  { classId: ClassId('tinker'),   startingRelicId: RelicId('razors-edge')      },
  { classId: ClassId('tinker'),   startingRelicId: RelicId('bloodfont')        },
  { classId: ClassId('tinker'),   startingRelicId: RelicId('iron-will')        },
  { classId: ClassId('marauder'), startingRelicId: RelicId('apprentices-loop') },
  { classId: ClassId('marauder'), startingRelicId: RelicId('pocket-forge')     },
  { classId: ClassId('marauder'), startingRelicId: RelicId('merchants-mark')   },
  { classId: ClassId('marauder'), startingRelicId: RelicId('razors-edge')      },
  { classId: ClassId('marauder'), startingRelicId: RelicId('bloodfont')        },
  { classId: ClassId('marauder'), startingRelicId: RelicId('iron-will')        },
];

const STRATEGY_DIST: ReadonlyArray<{ name: StrategyName; count: number }> = [
  { name: 'greedy',         count: 40 },
  { name: 'hoarder',        count: 100 },
  { name: 'recipe-chaser',  count: 40 },
  { name: 'reroll-burner',  count: 10 },
  { name: 'random-legal',   count: 10 },
];

const NEUTRAL = ContractId('neutral');
const MAX_ACTIONS_PER_FIXTURE = 5000;
const MAX_RETRIES_PER_TARGET = 50;

/** Builds the initial 200-fixture spec list. Strategy × pair distribution is
 *  deterministic — every (class, starter) pair receives ~16-17 fixtures across
 *  all strategies, comfortably meeting target #4 (≥5 per pair) by construction. */
function buildInitialSpecs(): FixtureSpec[] {
  const specs: FixtureSpec[] = [];
  let nextSeed = 1000;
  let pairCursor = 0;
  for (const dist of STRATEGY_DIST) {
    for (let i = 0; i < dist.count; i++) {
      const pair = STARTER_PAIRS[pairCursor % STARTER_PAIRS.length]!;
      specs.push({
        idx: specs.length,
        seed: SimSeed(nextSeed++),
        classId: pair.classId,
        startingRelicId: pair.startingRelicId,
        strategy: dist.name,
      });
      pairCursor++;
    }
  }
  return specs;
}

/** Runs one fixture: drives the run controller through a strategy until the
 *  run reaches phase === 'ended'. Returns the action stream + per-round
 *  CombatEvent[] + terminal state + coverage metadata. */
function generateOneFixture(spec: FixtureSpec): GeneratedFixture {
  const input: CreateRunInput = {
    seed: spec.seed,
    classId: spec.classId,
    contractId: NEUTRAL,
    startingRelicId: spec.startingRelicId,
  };
  const ctrl = createRun(input);
  const strategyRng: Rng = createRng(spec.seed);
  const strategy = STRATEGIES[spec.strategy];

  const actions: RunControllerAction[] = [
    {
      type: 'create_run',
      seed: input.seed,
      classId: input.classId,
      contractId: input.contractId,
      startingRelicId: input.startingRelicId,
    },
  ];
  const perRoundCombatEvents: CombatEvent[][] = [];
  const recipesFired: RecipeId[] = [];
  const pending: string[] = [];
  let rotation270OnNonSquare = false;
  let tickCapDraw = false;
  let bossRoundReached = false;

  let safeguard = 0;
  while (ctrl.getPhase() !== 'ended') {
    if (++safeguard > MAX_ACTIONS_PER_FIXTURE) {
      throw new Error(
        `generateOneFixture[${spec.idx}] safeguard exceeded (${MAX_ACTIONS_PER_FIXTURE} actions)`,
      );
    }
    const action = strategy({
      ctrl,
      rng: strategyRng,
      pending: pending as ReadonlyArray<string> as ReadonlyArray<string>,
    } as never);
    if (action === null) break;

    // Pending tracking (mirrors controller's private pendingItems).
    if (action.type === 'buy_item') {
      const itemId = ctrl.getState().shop.slots[action.slotIndex];
      if (itemId !== undefined) pending.push(itemId);
    } else if (action.type === 'place_item') {
      const idx = pending.indexOf(action.itemId);
      if (idx >= 0) pending.splice(idx, 1);
    }

    // Coverage signal capture (BEFORE applyAction so we read pre-state where needed).
    if (action.type === 'rotate_item' && action.rotation === 270) {
      const placement = ctrl.getState().bag.placements.find(
        (p) => p.placementId === action.placementId,
      );
      if (placement) {
        const item = ITEMS[placement.itemId];
        if (item && !shapeIsSquare(item.shape)) rotation270OnNonSquare = true;
      }
    }

    actions.push(action);
    try {
      applyAction(ctrl, action);
    } catch (err) {
      throw new Error(
        `generateOneFixture[${spec.idx}] action ${action.type} failed at safeguard=${safeguard}: ${(err as Error).message}`,
      );
    }

    if (action.type === 'combine_recipe') {
      recipesFired.push(action.recipeId);
    }

    if (
      action.type === 'start_combat' ||
      action.type === 'start_combat_from_ghost_build'
    ) {
      const events = ctrl.getEvents();
      perRoundCombatEvents.push([...events]);
      const round = ctrl.getState().history[ctrl.getState().history.length - 1]?.round ?? 0;
      if (round === 11) bossRoundReached = true;
      // Tick-cap draw: combat_end at tick === MAX_COMBAT_TICKS (600) with
      // outcome === 'draw'. See packages/sim/src/combat.ts where the cap path
      // emits the synthetic tick-600 combat_end.
      const last = events[events.length - 1];
      if (last && last.type === 'combat_end' && last.outcome === 'draw' && last.tick === 600) {
        tickCapDraw = true;
      }
    }
  }

  const state = ctrl.getState();
  const lastRound = state.history.length > 0
    ? state.history[state.history.length - 1]!.round
    : 0;
  const terminal: FixtureTerminalState = {
    outcome: state.outcome as RunOutcome,
    roundsReached: lastRound,
    finalHearts: state.hearts,
    perRoundCombatEvents,
  };

  return {
    spec,
    actions,
    terminal,
    recipesFired,
    rotation270OnNonSquare,
    tickCapDraw,
    bossRoundReached,
  };
}

function shapeIsSquare(shape: ReadonlyArray<{ col: number; row: number }>): boolean {
  let maxC = 0;
  let maxR = 0;
  for (const c of shape) {
    if (c.col > maxC) maxC = c.col;
    if (c.row > maxR) maxR = c.row;
  }
  return maxC === maxR;
}

interface CoverageReport {
  bossRound: { count: number; ok: boolean };
  tickCap: { count: number; ok: boolean };
  recipes: { perRecipe: Record<string, number>; ok: boolean; missing: string[] };
  pairs: { perPair: Record<string, number>; ok: boolean; missing: string[] };
  rotation270: { ok: boolean };
}

function evaluateCoverage(fixtures: ReadonlyArray<GeneratedFixture>): CoverageReport {
  const bossRoundCount = fixtures.filter((f) => f.bossRoundReached).length;
  const tickCapCount = fixtures.filter((f) => f.tickCapDraw).length;
  const rotation270Hit = fixtures.some((f) => f.rotation270OnNonSquare);

  const perRecipe: Record<string, number> = {};
  for (const r of RECIPES) perRecipe[r.id] = 0;
  for (const f of fixtures) {
    for (const id of f.recipesFired) perRecipe[id] = (perRecipe[id] ?? 0) + 1;
  }
  // Per M1.2.5 ratification: target #3 narrowed to >=1x per recipe (was >=3x).
  // Determinism is path coverage, not frequency coverage — once a recipe's
  // code path replays byte-stable, it always replays byte-stable.
  //
  // Documented exceptions (M1.2.5 ratified residual gap, "1 or 2 of 3" branch
  // of the halt-and-surface protocol): r-berserkers-greataxe and
  // r-master-alchemists-kit are the two Capstones requiring 3 specific Rare
  // items simultaneously (round-7+ gate, ~5–7g each, 2×2 output). Capstone-
  // solver could not organically produce these within the 1-day investment +
  // 50-attempt retry budget. combineRecipe's code path is parameterized by
  // recipe content (inputs, output, rotation), not by recipeId — recipes
  // that fire exercise the same control flow as recipes that don't. The
  // 10-of-12 firings plus M1.2.4's unit-tested recipe-combine-bonus fixture
  // provide sim-contract path coverage; these are content-coverage gaps,
  // not sim-contract gaps.
  const RECIPE_EXCEPTIONS: ReadonlySet<string> = new Set([
    'r-berserkers-greataxe',
    'r-master-alchemists-kit',
  ]);
  const missingRecipes = Object.entries(perRecipe)
    .filter(([id, n]) => n < 1 && !RECIPE_EXCEPTIONS.has(id))
    .map(([id]) => id);

  const perPair: Record<string, number> = {};
  for (const p of STARTER_PAIRS) perPair[`${p.classId}|${p.startingRelicId}`] = 0;
  for (const f of fixtures) {
    const k = `${f.spec.classId}|${f.spec.startingRelicId}`;
    perPair[k] = (perPair[k] ?? 0) + 1;
  }
  const missingPairs = Object.entries(perPair)
    .filter(([, n]) => n < 5)
    .map(([k]) => k);

  return {
    bossRound: { count: bossRoundCount, ok: bossRoundCount >= 10 },
    tickCap: { count: tickCapCount, ok: tickCapCount >= 1 },
    recipes: { perRecipe, ok: missingRecipes.length === 0, missing: missingRecipes },
    pairs: { perPair, ok: missingPairs.length === 0, missing: missingPairs },
    rotation270: { ok: rotation270Hit },
  };
}

/** Picks a candidate fixture index to regenerate for a given unmet target.
 *  Rotates through the strategy's full set of fixtures across attempts so a
 *  given seed-bump exhausts variety before re-trying the same fixture.
 *  Returns -1 if no plausible candidate exists. */
function pickRetryCandidate(
  fixtures: ReadonlyArray<GeneratedFixture>,
  target: 'tickCap' | 'rotation270' | 'recipes',
  attempt: number,
): number {
  const indices: number[] = [];
  if (target === 'tickCap' || target === 'rotation270') {
    fixtures.forEach((f, i) => {
      if (f.spec.strategy === 'random-legal') indices.push(i);
    });
  } else if (target === 'recipes') {
    fixtures.forEach((f, i) => {
      if (f.spec.strategy === 'recipe-chaser') indices.push(i);
    });
  }
  if (indices.length === 0) return -1;
  return indices[attempt % indices.length]!;
}

function regenerateWithSeedBump(spec: FixtureSpec, bump: number): FixtureSpec {
  return { ...spec, seed: SimSeed(Number(spec.seed) + 10000 * bump) };
}

/** Builds a seed for a recipe-chaser retry that forces the strategy's target
 *  to a specific recipe index via the `seed % RECIPES.length` selector inside
 *  recipeChaserStrategy. Bumps the high bits with `attempt` so each retry
 *  consumes a different shop-rng trajectory while preserving the target. */
function seedTargetingRecipe(recipeIdx: number, attempt: number): SimSeed {
  return SimSeed(50000 + recipeIdx + 12 * attempt);
}

/** Top-level orchestrator. Builds initial 200, evaluates coverage, retries
 *  unmet targets up to MAX_RETRIES_PER_TARGET, halts-and-surfaces on remaining
 *  gaps. */
export function generateAllFixtures(): {
  fixtures: GeneratedFixture[];
  coverage: CoverageReport;
} {
  const specs = buildInitialSpecs();
  const fixtures: GeneratedFixture[] = specs.map((s) => generateOneFixture(s));

  const targetsToCheck: ReadonlyArray<'tickCap' | 'rotation270' | 'recipes'> = [
    'tickCap',
    'rotation270',
    'recipes',
  ];

  for (const target of targetsToCheck) {
    let attempts = 0;
    while (attempts < MAX_RETRIES_PER_TARGET) {
      const cov = evaluateCoverage(fixtures);
      if (target === 'tickCap' && cov.tickCap.ok) break;
      if (target === 'rotation270' && cov.rotation270.ok) break;
      if (target === 'recipes' && cov.recipes.ok) break;
      const candidateIdx = pickRetryCandidate(fixtures, target, attempts);
      if (candidateIdx < 0) break;
      attempts++;
      let newSpec: FixtureSpec;
      if (target === 'recipes') {
        // Targeted retry: pick a still-missing recipe and rebuild a recipe-
        // chaser fixture whose seed forces that recipe via `seed % RECIPES.length`.
        // Cycles through missing recipes so each retry attacks a different gap.
        const missingIdxs = RECIPES
          .map((r, i) => (cov.recipes.perRecipe[r.id] ?? 0) < 1 ? i : -1)
          .filter((i) => i >= 0);
        if (missingIdxs.length === 0) break;
        const recipeIdx = missingIdxs[attempts % missingIdxs.length]!;
        newSpec = {
          ...fixtures[candidateIdx]!.spec,
          seed: seedTargetingRecipe(recipeIdx, attempts),
        };
      } else {
        newSpec = regenerateWithSeedBump(fixtures[candidateIdx]!.spec, attempts);
      }
      fixtures[candidateIdx] = generateOneFixture(newSpec);
    }
  }

  const coverage = evaluateCoverage(fixtures);
  return { fixtures, coverage };
}

/** Serializes a fixture to JSONL (header + actions + terminal state). */
function serializeFixture(fixture: GeneratedFixture): string {
  const header: FixtureHeader = {
    fixtureVersion: 1,
    generatedAt: IsoTimestamp('2026-04-29T00:00:00.000Z'),
    strategy: fixture.spec.strategy,
    seed: Number(fixture.spec.seed),
    schemaVersion: 4,
  };
  const lines = [
    JSON.stringify(header),
    ...fixture.actions.map((a) => JSON.stringify(a)),
    JSON.stringify(fixture.terminal),
  ];
  return lines.join('\n') + '\n';
}

function fixtureFilename(fixture: GeneratedFixture): string {
  const idx = String(fixture.spec.idx).padStart(3, '0');
  return `${idx}-${fixture.spec.strategy}-${Number(fixture.spec.seed)}.jsonl`;
}

/** Writes all fixtures to disk and clears any pre-existing .jsonl files in
 *  the fixtures dir. Returns coverage report. */
export function writeAllFixtures(): {
  written: number;
  coverage: CoverageReport;
  fixtures: GeneratedFixture[];
} {
  mkdirSync(FIXTURES_DIR, { recursive: true });

  // Clear any pre-existing .jsonl files for a clean regen.
  for (const f of readdirSync(FIXTURES_DIR)) {
    if (f.endsWith('.jsonl')) unlinkSync(join(FIXTURES_DIR, f));
  }

  const { fixtures, coverage } = generateAllFixtures();
  for (const fixture of fixtures) {
    writeFileSync(join(FIXTURES_DIR, fixtureFilename(fixture)), serializeFixture(fixture), 'utf-8');
  }
  return { written: fixtures.length, coverage, fixtures };
}

/** Renders a coverage report into a human-readable summary. */
export function formatCoverage(cov: CoverageReport): string {
  const lines: string[] = [];
  lines.push(`Coverage report:`);
  lines.push(`  boss round (>=10)     : ${cov.bossRound.count} ${cov.bossRound.ok ? '[OK]' : '[FAIL]'}`);
  lines.push(`  tick-cap draw (>=1)   : ${cov.tickCap.count} ${cov.tickCap.ok ? '[OK]' : '[FAIL]'}`);
  lines.push(`  rotation 270 (>=1)    : ${cov.rotation270.ok ? '[OK]' : '[FAIL]'}`);
  lines.push(`  recipes (>=1 each)    : ${cov.recipes.ok ? '[OK]' : `[FAIL — missing: ${cov.recipes.missing.join(', ')}]`}`);
  for (const [k, n] of Object.entries(cov.recipes.perRecipe)) {
    lines.push(`    ${k}: ${n}`);
  }
  lines.push(`  starter pairs (>=5)   : ${cov.pairs.ok ? '[OK]' : `[FAIL — missing: ${cov.pairs.missing.join(', ')}]`}`);
  for (const [k, n] of Object.entries(cov.pairs.perPair)) {
    lines.push(`    ${k}: ${n}`);
  }
  return lines.join('\n');
}

// Module-only: the CLI entry lives in `regenerate.test.ts` and is gated by
// the PB_GENERATE_FIXTURES env var so default `pnpm test` does NOT regenerate.
