// Unit tests for RelicsTab. Verifies the class header card +
// relic-slot rendering layout per Trey's decision-2 ratification.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { INITIAL } from '../../../data.local';
import { RelicsTab } from './RelicsTab';

describe('RelicsTab', () => {
  it('renders class header card with class name + passive description', () => {
    const { getByText } = render(<RelicsTab state={INITIAL} />);
    expect(getByText('CLASS')).toBeInTheDocument();
    expect(getByText(INITIAL.className)).toBeInTheDocument();
    expect(getByText('+10% recipe potency')).toBeInTheDocument();
  });

  it("renders 3 relic slots — 1 active (Apprentice's Loop) + 2 EMPTY", () => {
    const { getByText, getAllByText } = render(<RelicsTab state={INITIAL} />);
    expect(getByText("Apprentice's Loop")).toBeInTheDocument();
    expect(getByText('+1 reroll / round')).toBeInTheDocument();
    const empty = getAllByText('EMPTY');
    expect(empty).toHaveLength(2);
  });
});
