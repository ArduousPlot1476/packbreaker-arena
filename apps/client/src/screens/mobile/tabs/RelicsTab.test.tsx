// Unit tests for RelicsTab. Verifies the class header card +
// relic-slot rendering layout per Trey's decision-2 ratification.
//
// M1.5b PR 1 Phase 2.5b: rebaselined against state-driven rendering.
// Pre-Phase-2.5b the tests asserted on the prototype hardcoded text
// ("+10% recipe potency", "+1 reroll / round") — the class header
// card + every relic slot now read from the CLASSES + RELICS
// content registries via authoritative state, so the assertions
// match canonical content descriptions.

import { describe, expect, it } from 'vitest';
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
import type { RunState } from '../../../run/types';
import { RelicsTab } from './RelicsTab';

function makeRunStateFixture(overrides: Partial<RunState> = {}): RunState {
  return {
    round: 4,
    totalRounds: 11,
    hearts: 3,
    maxHearts: 3,
    gold: 8,
    trophy: 142,
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
    outcome: 'in_progress' as RunOutcome,
    seed: 12345 as SimSeed,
    history: [],
    ...overrides,
  };
}

describe('RelicsTab', () => {
  it('Tinker + Apprentice\'s Loop default: class header + starter slot render canonical content', () => {
    const { getByText, getAllByText } = render(
      <RelicsTab state={makeRunStateFixture()} />,
    );
    expect(getByText('CLASS')).toBeInTheDocument();
    expect(getByText('Tinker')).toBeInTheDocument();
    expect(
      getByText(/First recipe each round costs no action/),
    ).toBeInTheDocument();
    expect(getByText("Apprentice's Loop")).toBeInTheDocument();
    expect(getByText('+1 reroll per round.')).toBeInTheDocument();
    // Mid + boss slots: 2 EMPTY placeholders.
    expect(getAllByText('EMPTY')).toHaveLength(2);
  });

  it('Marauder + Iron Will: header + starter slot reflect Marauder content', () => {
    const { getByText, getAllByText } = render(
      <RelicsTab
        state={makeRunStateFixture({
          className: 'Marauder',
          classId: 'marauder' as ClassId,
          relics: {
            starter: 'iron-will' as RelicId,
            mid: null,
            boss: null,
          },
        })}
      />,
    );
    expect(getByText('Marauder')).toBeInTheDocument();
    expect(
      getByText(/\+1 base damage on every damage effect/),
    ).toBeInTheDocument();
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText('+1 heart.')).toBeInTheDocument();
    expect(getAllByText('EMPTY')).toHaveLength(2);
  });

  it('Mid relic granted: mid slot renders the chosen relic, boss slot stays EMPTY', () => {
    const { getByText, getAllByText, queryAllByText } = render(
      <RelicsTab
        state={makeRunStateFixture({
          className: 'Marauder',
          classId: 'marauder' as ClassId,
          relics: {
            starter: 'iron-will' as RelicId,
            mid: 'berserkers-pendant' as RelicId,
            boss: null,
          },
        })}
      />,
    );
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText("Berserker's Pendant")).toBeInTheDocument();
    expect(
      getByText('+3 base damage on every damage effect. Stacks.'),
    ).toBeInTheDocument();
    // Only the boss slot remains EMPTY now.
    expect(queryAllByText('EMPTY')).toHaveLength(1);
    // sanity: assert getAllByText returns array, not throw
    expect(getAllByText('EMPTY')).toHaveLength(1);
  });

  it('Boss relic granted: all 3 slots render named content; no EMPTY', () => {
    const { getByText, queryAllByText } = render(
      <RelicsTab
        state={makeRunStateFixture({
          className: 'Marauder',
          classId: 'marauder' as ClassId,
          relics: {
            starter: 'iron-will' as RelicId,
            mid: 'berserkers-pendant' as RelicId,
            boss: 'conquerors-crown' as RelicId,
          },
        })}
      />,
    );
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText("Berserker's Pendant")).toBeInTheDocument();
    expect(getByText("Conqueror's Crown")).toBeInTheDocument();
    expect(
      getByText(/\+4 base damage on every damage effect; \+3g per round won/),
    ).toBeInTheDocument();
    expect(queryAllByText('EMPTY')).toHaveLength(0);
  });

  it('all slots empty (legacy fixture / pre-init_from_sim): 3 EMPTY placeholders', () => {
    const { getAllByText, queryByText } = render(
      <RelicsTab
        state={makeRunStateFixture({
          relics: { starter: null, mid: null, boss: null },
        })}
      />,
    );
    expect(getAllByText('EMPTY')).toHaveLength(3);
    // No named relic content rendered.
    expect(queryByText("Apprentice's Loop")).toBeNull();
  });
});
