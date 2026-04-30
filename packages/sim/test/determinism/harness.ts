// determinism/harness.ts — JSONL fixture parser + replay + byte-comparison.
//
// Fixture format (M1.2.5):
//   line 1   : header object  { fixtureVersion, generatedAt, strategy, seed, schemaVersion }
//   line 2   : 'create_run' action — first action in the stream, used to build the controller
//   lines 3..N-1 : RunControllerAction JSON (excluding 'create_run')
//   line N   : terminal-state object { outcome, roundsReached, finalHearts, perRoundCombatEvents }
//
// Determinism contract: identical fixture (header + action stream) → identical
// terminal state byte-for-byte. Any divergence is a determinism break, not a
// regeneration trigger.
//
// CombatEvent[] are captured per-round at every start_combat /
// start_combat_from_ghost_build action.

import type {
  CombatEvent,
  RunOutcome,
  RoundNumber,
} from '@packbreaker/content';
import {
  applyAction,
  createRun,
  type RunController,
  type RunControllerAction,
} from '../../src/run';

export interface FixtureHeader {
  readonly fixtureVersion: 1;
  readonly generatedAt: string;
  readonly strategy: string;
  readonly seed: number;
  readonly schemaVersion: 4;
}

export interface FixtureTerminalState {
  readonly outcome: RunOutcome;
  readonly roundsReached: number;
  readonly finalHearts: number;
  readonly perRoundCombatEvents: ReadonlyArray<ReadonlyArray<CombatEvent>>;
}

export interface ParsedFixture {
  readonly header: FixtureHeader;
  /** Action stream excluding the leading 'create_run' (which is consumed by
   *  replayFixture to build the controller). */
  readonly createAction: Extract<RunControllerAction, { type: 'create_run' }>;
  readonly actions: ReadonlyArray<RunControllerAction>;
  readonly expectedTerminal: FixtureTerminalState;
}

export function parseFixture(jsonlText: string): ParsedFixture {
  const lines = jsonlText.split('\n').filter((l) => l.length > 0);
  if (lines.length < 3) {
    throw new Error(
      `parseFixture: expected header + create_run + terminal-state (>=3 lines), got ${lines.length}`,
    );
  }
  const header = JSON.parse(lines[0]!) as FixtureHeader;
  const createAction = JSON.parse(lines[1]!) as RunControllerAction;
  if (createAction.type !== 'create_run') {
    throw new Error(
      `parseFixture: line 2 must be 'create_run' action, got '${createAction.type}'`,
    );
  }
  const expectedTerminal = JSON.parse(
    lines[lines.length - 1]!,
  ) as FixtureTerminalState;
  const actions = lines
    .slice(2, -1)
    .map((l) => JSON.parse(l) as RunControllerAction);
  return { header, createAction, actions, expectedTerminal };
}

export interface ReplayResult {
  readonly terminal: FixtureTerminalState;
  readonly controller: RunController;
}

/** Replays the fixture against a fresh RunController and produces the actual
 *  terminal state. The harness compares this against the fixture's expected
 *  terminal-state line. */
export function replayFixture(fixture: ParsedFixture): ReplayResult {
  const c = fixture.createAction;
  const controller = createRun({
    seed: c.seed,
    classId: c.classId,
    contractId: c.contractId,
    startingRelicId: c.startingRelicId,
    ...(c.startedAt !== undefined ? { startedAt: c.startedAt } : {}),
  });
  const perRoundCombatEvents: CombatEvent[][] = [];
  for (const action of fixture.actions) {
    applyAction(controller, action);
    if (
      action.type === 'start_combat' ||
      action.type === 'start_combat_from_ghost_build'
    ) {
      perRoundCombatEvents.push([...controller.getEvents()]);
    }
  }
  const state = controller.getState();
  const lastRound = state.history.length > 0
    ? (state.history[state.history.length - 1]!.round as RoundNumber)
    : 0;
  return {
    controller,
    terminal: {
      outcome: state.outcome as RunOutcome,
      roundsReached: lastRound,
      finalHearts: state.hearts,
      perRoundCombatEvents,
    },
  };
}

export type FixtureDivergence =
  | { readonly kind: 'outcome'; readonly expected: RunOutcome; readonly actual: RunOutcome }
  | { readonly kind: 'roundsReached'; readonly expected: number; readonly actual: number }
  | { readonly kind: 'finalHearts'; readonly expected: number; readonly actual: number }
  | { readonly kind: 'perRoundCount'; readonly expected: number; readonly actual: number }
  | {
      readonly kind: 'roundEvents';
      readonly round: number;
      readonly firstDivergentTick: number | null;
      readonly expected: ReadonlyArray<CombatEvent>;
      readonly actual: ReadonlyArray<CombatEvent>;
    };

/** Compares actual replay terminal state against the fixture's expected
 *  terminal state. Returns null on byte-identical match, otherwise the first
 *  divergence. */
export function diffTerminalStates(
  expected: FixtureTerminalState,
  actual: FixtureTerminalState,
): FixtureDivergence | null {
  if (expected.outcome !== actual.outcome) {
    return { kind: 'outcome', expected: expected.outcome, actual: actual.outcome };
  }
  if (expected.roundsReached !== actual.roundsReached) {
    return {
      kind: 'roundsReached',
      expected: expected.roundsReached,
      actual: actual.roundsReached,
    };
  }
  if (expected.finalHearts !== actual.finalHearts) {
    return {
      kind: 'finalHearts',
      expected: expected.finalHearts,
      actual: actual.finalHearts,
    };
  }
  if (expected.perRoundCombatEvents.length !== actual.perRoundCombatEvents.length) {
    return {
      kind: 'perRoundCount',
      expected: expected.perRoundCombatEvents.length,
      actual: actual.perRoundCombatEvents.length,
    };
  }
  for (let i = 0; i < expected.perRoundCombatEvents.length; i++) {
    const exp = expected.perRoundCombatEvents[i]!;
    const act = actual.perRoundCombatEvents[i]!;
    const expJson = exp.map((e) => JSON.stringify(e));
    const actJson = act.map((e) => JSON.stringify(e));
    if (expJson.length === actJson.length && expJson.every((s, j) => s === actJson[j])) continue;
    let firstTick: number | null = null;
    const minLen = Math.min(expJson.length, actJson.length);
    for (let j = 0; j < minLen; j++) {
      if (expJson[j] !== actJson[j]) {
        firstTick = exp[j]!.tick;
        break;
      }
    }
    if (firstTick === null && expJson.length !== actJson.length) {
      const overflowSide = expJson.length > actJson.length ? exp : act;
      firstTick = overflowSide[minLen]?.tick ?? null;
    }
    return {
      kind: 'roundEvents',
      round: i + 1,
      firstDivergentTick: firstTick,
      expected: exp,
      actual: act,
    };
  }
  return null;
}

/** Renders a divergence into a multi-line string for vitest's expect(...).toBe
 *  failure message. */
export function formatDivergence(
  fixture: string,
  div: FixtureDivergence,
): string {
  switch (div.kind) {
    case 'outcome':
      return `[${fixture}] outcome diverged: expected '${div.expected}', got '${div.actual}'`;
    case 'roundsReached':
      return `[${fixture}] roundsReached diverged: expected ${div.expected}, got ${div.actual}`;
    case 'finalHearts':
      return `[${fixture}] finalHearts diverged: expected ${div.expected}, got ${div.actual}`;
    case 'perRoundCount':
      return `[${fixture}] perRoundCombatEvents length diverged: expected ${div.expected} rounds, got ${div.actual}`;
    case 'roundEvents': {
      const tick = div.firstDivergentTick;
      const expectedJson = JSON.stringify(div.expected, null, 2);
      const actualJson = JSON.stringify(div.actual, null, 2);
      return [
        `[${fixture}] round ${div.round} CombatEvent[] diverged at tick=${tick ?? '<length-mismatch>'}`,
        `expected (${div.expected.length} events):`,
        expectedJson,
        `actual (${div.actual.length} events):`,
        actualJson,
      ].join('\n');
    }
  }
}
