// Unit tests for CraftingTab. Verifies the two-section layout
// ("READY TO CRAFT" + "AVAILABLE WITH CURRENT ITEMS"), empty state,
// COMBINE row interaction, and the 44×44 touch-target floor.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { CraftingTab } from './CraftingTab';
import type { RecipeMatch } from '../../../run/recipes';
import type { ItemId, Recipe } from '../../../run/types';

const SWORD = 'iron-sword' as ItemId;
const DAGGER = 'iron-dagger' as ItemId;
const STEEL = 'steel-sword' as ItemId;
const HERB = 'healing-herb' as ItemId;
const SALVE = 'healing-salve' as ItemId;

const STEEL_MATCH: RecipeMatch = {
  recipe: { id: 'r-steel-sword', inputs: [SWORD, DAGGER], output: STEEL },
  uids: ['a', 'b'],
};

const SALVE_SCOUT: Recipe = {
  id: 'r-healing-salve',
  inputs: [HERB, HERB],
  output: SALVE,
};

describe('CraftingTab', () => {
  it('shows empty-state copy in BOTH sections when nothing is ready or scoutable', () => {
    const { getByText } = render(
      <CraftingTab recipes={[]} scoutedRecipes={[]} onCombine={() => {}} />,
    );
    expect(getByText('READY TO CRAFT')).toBeInTheDocument();
    expect(getByText('NO RECIPES READY')).toBeInTheDocument();
    expect(
      getByText('Place items adjacent to see combinations.'),
    ).toBeInTheDocument();
    // Per Trey's screenshot review: the scouted section is ALWAYS
    // rendered, with its own empty state when nothing is scoutable.
    expect(getByText('AVAILABLE WITH CURRENT ITEMS')).toBeInTheDocument();
    expect(getByText('No recipes possible with current items.')).toBeInTheDocument();
  });

  it('renders one COMBINE row per ready recipe with the output name', () => {
    const { getByText, getByRole } = render(
      <CraftingTab recipes={[STEEL_MATCH]} scoutedRecipes={[]} onCombine={() => {}} />,
    );
    expect(getByText('Steel Sword')).toBeInTheDocument();
    expect(getByText('2 INPUTS')).toBeInTheDocument();
    expect(getByRole('button', { name: 'COMBINE' })).toBeInTheDocument();
  });

  it('fires onCombine with the matched recipe when COMBINE is tapped', () => {
    const onCombine = vi.fn();
    const { getByRole } = render(
      <CraftingTab recipes={[STEEL_MATCH]} scoutedRecipes={[]} onCombine={onCombine} />,
    );
    fireEvent.click(getByRole('button', { name: 'COMBINE' }));
    expect(onCombine).toHaveBeenCalledWith(STEEL_MATCH);
  });

  it('COMBINE button meets the 44×44 touch-target floor', () => {
    const { getByRole } = render(
      <CraftingTab recipes={[STEEL_MATCH]} scoutedRecipes={[]} onCombine={() => {}} />,
    );
    const button = getByRole('button', { name: 'COMBINE' }) as HTMLElement;
    expect(parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });

  it('renders a scouted-recipes section listing each recipe with its inputs', () => {
    const { getByText } = render(
      <CraftingTab recipes={[]} scoutedRecipes={[SALVE_SCOUT]} onCombine={() => {}} />,
    );
    expect(getByText('AVAILABLE WITH CURRENT ITEMS')).toBeInTheDocument();
    expect(getByText('Healing Salve')).toBeInTheDocument();
    expect(getByText('Healing Herb + Healing Herb')).toBeInTheDocument();
    expect(getByText('REARRANGE')).toBeInTheDocument();
  });

  it('renders both sections when both ready and scouted recipes exist', () => {
    const { getByText, getByRole } = render(
      <CraftingTab
        recipes={[STEEL_MATCH]}
        scoutedRecipes={[SALVE_SCOUT]}
        onCombine={() => {}}
      />,
    );
    expect(getByText('READY TO CRAFT')).toBeInTheDocument();
    expect(getByText('AVAILABLE WITH CURRENT ITEMS')).toBeInTheDocument();
    expect(getByRole('button', { name: 'COMBINE' })).toBeInTheDocument();
    expect(getByText('Steel Sword')).toBeInTheDocument();
    expect(getByText('Healing Salve')).toBeInTheDocument();
  });
});
