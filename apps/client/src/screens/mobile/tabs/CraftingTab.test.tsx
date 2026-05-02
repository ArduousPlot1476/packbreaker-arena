// Unit tests for CraftingTab. Empty state + populated state with
// COMBINE rows + COMBINE button touch-target compliance.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { CraftingTab } from './CraftingTab';
import type { RecipeMatch } from '../../../run/recipes';
import type { ItemId } from '../../../run/types';

const SWORD = 'iron-sword' as ItemId;
const DAGGER = 'iron-dagger' as ItemId;
const STEEL = 'steel-sword' as ItemId;

describe('CraftingTab', () => {
  it('shows the empty-state copy when there are no recipes', () => {
    const { getByText } = render(<CraftingTab recipes={[]} onCombine={() => {}} />);
    expect(getByText('NO RECIPES READY')).toBeInTheDocument();
    expect(
      getByText('Place items adjacent to see combinations.'),
    ).toBeInTheDocument();
  });

  it('renders one COMBINE row per recipe with the output name', () => {
    const recipes: RecipeMatch[] = [
      {
        recipe: {
          id: 'r-steel-sword',
          inputs: [SWORD, DAGGER],
          output: STEEL,
        },
        uids: ['a', 'b'],
      },
    ];
    const { getByText, getByRole } = render(
      <CraftingTab recipes={recipes} onCombine={() => {}} />,
    );
    expect(getByText('Steel Sword')).toBeInTheDocument();
    expect(getByText('2 INPUTS')).toBeInTheDocument();
    expect(getByRole('button', { name: 'COMBINE' })).toBeInTheDocument();
  });

  it('fires onCombine with the matched recipe when COMBINE is tapped', () => {
    const recipes: RecipeMatch[] = [
      {
        recipe: {
          id: 'r-steel-sword',
          inputs: [SWORD, DAGGER],
          output: STEEL,
        },
        uids: ['a', 'b'],
      },
    ];
    const onCombine = vi.fn();
    const { getByRole } = render(<CraftingTab recipes={recipes} onCombine={onCombine} />);
    fireEvent.click(getByRole('button', { name: 'COMBINE' }));
    expect(onCombine).toHaveBeenCalledWith(recipes[0]);
  });

  it('COMBINE button meets the 44×44 touch-target floor', () => {
    const recipes: RecipeMatch[] = [
      {
        recipe: {
          id: 'r-steel-sword',
          inputs: [SWORD, DAGGER],
          output: STEEL,
        },
        uids: ['a', 'b'],
      },
    ];
    const { getByRole } = render(<CraftingTab recipes={recipes} onCombine={() => {}} />);
    const button = getByRole('button', { name: 'COMBINE' }) as HTMLElement;
    expect(parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });
});
