// determinism/harness.test.ts — M1.2.5 determinism harness.
//
// Two responsibilities:
//   1. Unit-test the harness itself (parseFixture / replayFixture /
//      diffTerminalStates) against an in-memory fixture stream — this commit.
//   2. Iterate every *.jsonl fixture under test/fixtures/runs/ and assert
//      byte-identical replay — fixtures land in the next commit (M1.2.5
//      strategy generator). Until then the dir-iteration block runs over
//      zero files and passes vacuously.
//
// The .jsonl filter keeps M1.2.4's existing *.json run fixtures
// (run-fixtures.test.ts) untouched.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClassId,
  ContractId,
  GhostId,
  IsoTimestamp,
  ItemId,
  PlacementId,
  RelicId,
  SimSeed,
  type GhostBuild,
} from '@packbreaker/content';
import {
  diffTerminalStates,
  formatDivergence,
  parseFixture,
  replayFixture,
  type FixtureHeader,
  type FixtureTerminalState,
  type ParsedFixture,
} from './harness';
import type { RunControllerAction } from '../../src/run';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'runs');

const TINKER = ClassId('tinker');
const NEUTRAL = ContractId('neutral');
const APPRENTICES_LOOP = RelicId('apprentices-loop');
const NO_RELICS = { starter: null, mid: null, boss: null };

/** Builds a small synthetic happy-path fixture in-memory: createRun, buy +
 *  place a 1×1, fight a no-bag ghost, advance to round 2. Used to lock the
 *  parse/replay/compare round-trip without touching disk. */
function buildSyntheticHappyPath(): { jsonl: string; expected: FixtureTerminalState } {
  const header: FixtureHeader = {
    fixtureVersion: 1,
    generatedAt: '2025-01-01T00:00:00.000Z',
    strategy: 'unit-test',
    seed: 1,
    schemaVersion: 4,
  };
  const ghost: GhostBuild = {
    id: GhostId('test-ghost'),
    classId: TINKER,
    bag: { dimensions: { width: 6, height: 4 }, placements: [] },
    relics: NO_RELICS,
    recordedRound: 1,
    trophyAtRecord: 0,
    seed: SimSeed(1),
    submittedAt: IsoTimestamp('2025-01-01T00:00:00.000Z'),
    source: 'bot',
  };
  const actions: RunControllerAction[] = [
    {
      type: 'create_run',
      seed: SimSeed(1),
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    },
    { type: 'buy_item', slotIndex: 0 },
    {
      type: 'start_combat_from_ghost_build',
      ghost,
    },
    { type: 'advance_phase' },
  ];
  // We DON'T compute the terminal state ourselves — the test calls replayFixture
  // and uses its output as the expected. The round-trip then re-replays and
  // diffs it against itself. (For actual fixture files the expected terminal
  // is captured at generation time and locked in line N of the file.)
  const placeholderTerminal: FixtureTerminalState = {
    outcome: 'in_progress',
    roundsReached: 0,
    finalHearts: 0,
    perRoundCombatEvents: [],
  };
  const lines = [
    JSON.stringify(header),
    ...actions.map((a) => JSON.stringify(a)),
    JSON.stringify(placeholderTerminal),
  ];
  return { jsonl: lines.join('\n'), expected: placeholderTerminal };
}

describe('determinism harness — unit', () => {
  it('parseFixture splits header / actions / terminal-state lines correctly', () => {
    const { jsonl } = buildSyntheticHappyPath();
    const parsed = parseFixture(jsonl);
    expect(parsed.header.fixtureVersion).toBe(1);
    expect(parsed.createAction.type).toBe('create_run');
    expect(parsed.actions.length).toBeGreaterThan(0);
    expect(parsed.expectedTerminal).toBeDefined();
  });

  it('parseFixture rejects fixtures with fewer than 3 lines', () => {
    expect(() => parseFixture('{}')).toThrow(/at least|>=3/);
  });

  it("parseFixture rejects fixtures whose first action isn't 'create_run'", () => {
    const lines = [
      JSON.stringify({ fixtureVersion: 1, generatedAt: '', strategy: '', seed: 0, schemaVersion: 4 }),
      JSON.stringify({ type: 'buy_item', slotIndex: 0 }),
      JSON.stringify({ outcome: 'in_progress', roundsReached: 0, finalHearts: 0, perRoundCombatEvents: [] }),
    ];
    expect(() => parseFixture(lines.join('\n'))).toThrow(/create_run/);
  });

  it('replayFixture produces a terminal state that diff-matches itself (round-trip)', () => {
    const { jsonl } = buildSyntheticHappyPath();
    const parsed = parseFixture(jsonl);
    const first = replayFixture(parsed);
    const lockedFixture: ParsedFixture = {
      ...parsed,
      expectedTerminal: first.terminal,
    };
    const second = replayFixture(lockedFixture);
    expect(diffTerminalStates(lockedFixture.expectedTerminal, second.terminal)).toBeNull();
  });

  it('diffTerminalStates flags outcome mismatch', () => {
    const a: FixtureTerminalState = {
      outcome: 'in_progress',
      roundsReached: 1,
      finalHearts: 3,
      perRoundCombatEvents: [],
    };
    const b: FixtureTerminalState = { ...a, outcome: 'won' };
    const div = diffTerminalStates(a, b);
    expect(div?.kind).toBe('outcome');
  });

  it('diffTerminalStates flags per-round CombatEvent[] divergence with first divergent tick', () => {
    const evA = { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 } as const;
    const evB = { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 35 } as const;
    const a: FixtureTerminalState = {
      outcome: 'in_progress',
      roundsReached: 1,
      finalHearts: 3,
      perRoundCombatEvents: [[evA]],
    };
    const b: FixtureTerminalState = { ...a, perRoundCombatEvents: [[evB]] };
    const div = diffTerminalStates(a, b);
    expect(div?.kind).toBe('roundEvents');
    if (div?.kind === 'roundEvents') {
      expect(div.firstDivergentTick).toBe(0);
      expect(div.round).toBe(1);
    }
  });

  it('formatDivergence renders a multi-line failure message for roundEvents', () => {
    const a: FixtureTerminalState = {
      outcome: 'won',
      roundsReached: 1,
      finalHearts: 3,
      perRoundCombatEvents: [[]],
    };
    const b: FixtureTerminalState = { ...a, finalHearts: 2 };
    const div = diffTerminalStates(a, b)!;
    const msg = formatDivergence('test.jsonl', div);
    expect(msg).toMatch(/test\.jsonl/);
    expect(msg).toMatch(/finalHearts/);
  });
});

// ─── Determinism replay over fixture corpus ─────────────────────────

const fixtureFiles = (() => {
  try {
    return readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith('.jsonl'))
      .sort();
  } catch {
    return [];
  }
})();

describe('determinism harness — fixture corpus', () => {
  if (fixtureFiles.length === 0) {
    it.skip('(no .jsonl fixtures yet — generated in M1.2.5 step 4)', () => {});
    return;
  }
  for (const file of fixtureFiles) {
    it(`determinism: ${file}`, () => {
      const raw = readFileSync(join(FIXTURES_DIR, file), 'utf-8');
      const parsed = parseFixture(raw);
      const replayed = replayFixture(parsed);
      const div = diffTerminalStates(parsed.expectedTerminal, replayed.terminal);
      if (div !== null) {
        expect.fail(formatDivergence(file, div));
      }
    });
  }
});
