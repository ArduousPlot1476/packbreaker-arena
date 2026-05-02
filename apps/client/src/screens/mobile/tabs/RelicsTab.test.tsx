// Unit tests for RelicsTab. Verifies the class header card +
// relic-slot rendering layout per Trey's decision-2 ratification.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DEFAULT_RULESET, type SimSeed } from '@packbreaker/content';
import type { RunState } from '../../../run/types';
import { RelicsTab } from './RelicsTab';

const TEST_RUN_STATE: RunState = {
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
  seed: 12345 as SimSeed,
  history: [],
};

describe('RelicsTab', () => {
  it('renders class header card with class name + passive description', () => {
    const { getByText } = render(<RelicsTab state={TEST_RUN_STATE} />);
    expect(getByText('CLASS')).toBeInTheDocument();
    expect(getByText(TEST_RUN_STATE.className)).toBeInTheDocument();
    expect(getByText('+10% recipe potency')).toBeInTheDocument();
  });

  it("renders 3 relic slots — 1 active (Apprentice's Loop) + 2 EMPTY", () => {
    const { getByText, getAllByText } = render(<RelicsTab state={TEST_RUN_STATE} />);
    expect(getByText("Apprentice's Loop")).toBeInTheDocument();
    expect(getByText('+1 reroll / round')).toBeInTheDocument();
    const empty = getAllByText('EMPTY');
    expect(empty).toHaveLength(2);
  });
});
