// M1.5b PR 1 Phase 2.5b — LeftRail integration tests. Closes the gap
// that let F.3 / F.5 pass while LeftRail lied: the state-write chain
// was always correct, but no test rendered the desktop chrome and
// asserted the visible text reflected the chosen class + relics.
//
// Mocks useRunContext to drive the rendered state directly (same
// pattern as RelicOfferModal.test.tsx) — LeftRail consumes
// authoritative state via context, not props.

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  DEFAULT_RULESET,
  type ClassId,
  type ContractId,
  type RelicId,
  type RunId,
  type RunOutcome,
  type SimSeed,
} from '@packbreaker/content';
import type { RunState } from '../run/types';

type MockUseRunReturn = {
  state: { state: RunState };
};

let mockContext: MockUseRunReturn;

vi.mock('../run/RunContext', () => ({
  useRunContext: () => mockContext,
}));

// Import after vi.mock so the lazy module resolution picks up the
// mocked RunContext.
import { LeftRail } from './LeftRail';

function makeRunStateFixture(overrides: Partial<RunState> = {}): RunState {
  return {
    round: 1,
    totalRounds: 11,
    hearts: 3,
    maxHearts: 3,
    gold: 4,
    trophy: 0,
    rerollCount: 0,
    className: 'Tinker',
    contractName: 'Neutral',
    contractText: 'No modifiers',
    ruleset: DEFAULT_RULESET,
    runId: 'test-run' as RunId,
    classId: 'tinker' as ClassId,
    contractId: 'neutral' as ContractId,
    derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 0 },
    relics: { starter: 'apprentices-loop' as RelicId, mid: null, boss: null },
    bossRewardItemId: null,
    outcome: 'in_progress' as RunOutcome,
    seed: 99999 as SimSeed,
    history: [],
    ...overrides,
  };
}

function mountWithState(state: RunState) {
  mockContext = { state: { state } };
  return render(<LeftRail />);
}

describe('LeftRail', () => {
  it('Tinker + Apprentice\'s Loop default: class card + starter slot render canonical content', () => {
    const { getByText, getAllByText } = mountWithState(makeRunStateFixture());
    expect(getByText('CLASS')).toBeInTheDocument();
    expect(getByText('Tinker')).toBeInTheDocument();
    expect(
      getByText(/First recipe each round costs no action/),
    ).toBeInTheDocument();
    expect(getByText("Apprentice's Loop")).toBeInTheDocument();
    expect(getByText('+1 reroll per round.')).toBeInTheDocument();
    // Mid + boss slots EMPTY.
    expect(getAllByText('EMPTY')).toHaveLength(2);
  });

  it('Marauder + Iron Will: card + starter slot reflect Marauder content (the playtest catch)', () => {
    const { getByText, getAllByText, queryByText } = mountWithState(
      makeRunStateFixture({
        className: 'Marauder',
        classId: 'marauder' as ClassId,
        relics: {
          starter: 'iron-will' as RelicId,
          mid: null,
          boss: null,
        },
      }),
    );
    expect(getByText('Marauder')).toBeInTheDocument();
    expect(
      getByText(/\+1 base damage on every damage effect/),
    ).toBeInTheDocument();
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText('+1 heart.')).toBeInTheDocument();
    // Tinker / Apprentice's Loop must NOT appear under a Marauder run.
    expect(queryByText('Tinker')).toBeNull();
    expect(queryByText("Apprentice's Loop")).toBeNull();
    expect(getAllByText('EMPTY')).toHaveLength(2);
  });

  it('Mid relic granted: mid slot renders the chosen relic (Berserker\'s Pendant), boss stays EMPTY', () => {
    const { getByText, getAllByText } = mountWithState(
      makeRunStateFixture({
        className: 'Marauder',
        classId: 'marauder' as ClassId,
        relics: {
          starter: 'iron-will' as RelicId,
          mid: 'berserkers-pendant' as RelicId,
          boss: null,
        },
      }),
    );
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText("Berserker's Pendant")).toBeInTheDocument();
    expect(
      getByText('+3 base damage on every damage effect. Stacks.'),
    ).toBeInTheDocument();
    // Only the boss slot is EMPTY.
    expect(getAllByText('EMPTY')).toHaveLength(1);
  });

  it('Boss relic granted: all 3 slots render named content; no EMPTY', () => {
    const { getByText, queryAllByText } = mountWithState(
      makeRunStateFixture({
        className: 'Marauder',
        classId: 'marauder' as ClassId,
        relics: {
          starter: 'iron-will' as RelicId,
          mid: 'berserkers-pendant' as RelicId,
          boss: 'conquerors-crown' as RelicId,
        },
      }),
    );
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText("Berserker's Pendant")).toBeInTheDocument();
    expect(getByText("Conqueror's Crown")).toBeInTheDocument();
    expect(
      getByText(/\+4 base damage on every damage effect; \+3g per round won/),
    ).toBeInTheDocument();
    expect(queryAllByText('EMPTY')).toHaveLength(0);
  });

  it('Tinker mid + boss path: catalyst mid + worldforge-seed boss render with descriptions', () => {
    const { getByText } = mountWithState(
      makeRunStateFixture({
        relics: {
          starter: 'apprentices-loop' as RelicId,
          mid: 'catalyst' as RelicId,
          boss: 'worldforge-seed' as RelicId,
        },
      }),
    );
    expect(getByText('Tinker')).toBeInTheDocument();
    expect(getByText('Catalyst')).toBeInTheDocument();
    expect(getByText('+30% recipe potency. Stacks.')).toBeInTheDocument();
    expect(getByText('Worldforge Seed')).toBeInTheDocument();
    expect(
      getByText('+6 starting gold and +10% recipe potency.'),
    ).toBeInTheDocument();
  });
});
