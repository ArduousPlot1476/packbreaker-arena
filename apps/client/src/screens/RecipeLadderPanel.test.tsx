// Render tests for the desktop recipe ladder. These cover the definition-of-
// done items that are properties of the SURFACE rather than the derivation:
// all 12 always visible, the three states render distinctly, the adjacency
// instruction is present before the player places anything, and COMBINE is
// afforded only on the READY rung.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { RecipeLadderPanel } from './RecipeLadderPanel';
import type { ItemId, Recipe, RecipeMatch } from '../run/types';

const SWORD = 'iron-sword' as ItemId;
const DAGGER = 'iron-dagger' as ItemId;
const STEEL = 'steel-sword' as ItemId;
const HERB = 'healing-herb' as ItemId;
const SALVE = 'healing-salve' as ItemId;

const STEEL_RECIPE: Recipe = { id: 'r-steel-sword', inputs: [SWORD, DAGGER], output: STEEL };
const SALVE_RECIPE: Recipe = { id: 'r-healing-salve', inputs: [HERB, HERB], output: SALVE };
const STEEL_MATCH: RecipeMatch = { recipe: STEEL_RECIPE, uids: ['a', 'b'] };

describe('RecipeLadderPanel', () => {
  it('renders all 12 recipes on a fresh run, before anything is owned', () => {
    const { container } = render(
      <RecipeLadderPanel recipes={[]} scoutedRecipes={[]} onCombine={() => {}} />,
    );
    expect(container.querySelectorAll('[data-testid^="ladder-row-"]')).toHaveLength(12);
  });

  it('states the adjacency rule with an empty bag', () => {
    // DoD 3's precondition: the rule is legible BEFORE the player ever
    // places two inputs together.
    const { getByText } = render(
      <RecipeLadderPanel recipes={[]} scoutedRecipes={[]} onCombine={() => {}} />,
    );
    expect(getByText('Inputs must sit edge-to-edge in the bag to combine.')).toBeInTheDocument();
  });

  it('shows a HELD row naming adjacency when inputs are owned but apart', () => {
    const { container, getByText } = render(
      <RecipeLadderPanel recipes={[]} scoutedRecipes={[SALVE_RECIPE]} onCombine={() => {}} />,
    );
    const row = container.querySelector('[data-testid="ladder-row-r-healing-salve"]');
    expect(row?.getAttribute('data-state')).toBe('held');
    expect(getByText('NOT TOUCHING')).toBeInTheDocument();
    expect(getByText('1 HELD')).toBeInTheDocument();
  });

  it('renders the three states with distinct data-state values', () => {
    const { container } = render(
      <RecipeLadderPanel
        recipes={[STEEL_MATCH]}
        scoutedRecipes={[SALVE_RECIPE]}
        onCombine={() => {}}
      />,
    );
    const states = Array.from(container.querySelectorAll('[data-testid^="ladder-row-"]')).map((n) =>
      n.getAttribute('data-state'),
    );
    expect(states[0]).toBe('ready');
    expect(states[1]).toBe('held');
    expect(new Set(states)).toEqual(new Set(['ready', 'held', 'known']));
  });

  it('distinguishes the three states without relying on colour', () => {
    // Greyscale safety (DoD 2): border-style, chip presence and the status
    // word must differ. Asserted on borderLeftStyle, the non-colour channel.
    const { container } = render(
      <RecipeLadderPanel
        recipes={[STEEL_MATCH]}
        scoutedRecipes={[SALVE_RECIPE]}
        onCombine={() => {}}
      />,
    );
    const styleOf = (id: string) =>
      (container.querySelector(`[data-testid="ladder-row-${id}"]`) as HTMLElement).style
        .borderLeftStyle;
    expect(styleOf('r-steel-sword')).toBe('solid');
    expect(styleOf('r-healing-salve')).toBe('dashed');
    // KNOWN rows keep a solid-but-transparent border so row heights match;
    // their distinguishing channels are the absent chip word and dimming.
    const known = container.querySelector('[data-testid="ladder-row-r-greatsword"]') as HTMLElement;
    expect(known.getAttribute('data-state')).toBe('known');
    expect(known.style.borderLeftColor).toBe('transparent');
  });

  it('affords COMBINE only on the READY rung and fires the callback', () => {
    const onCombine = vi.fn();
    const { getAllByRole, getByText } = render(
      <RecipeLadderPanel
        recipes={[STEEL_MATCH]}
        scoutedRecipes={[SALVE_RECIPE]}
        onCombine={onCombine}
      />,
    );
    const buttons = getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(getByText('COMBINE'));
    expect(onCombine).toHaveBeenCalledWith(STEEL_MATCH);
  });

  it('swaps COMBINE for NO ROOM when the sim rejected that match', () => {
    const { getByText, queryByText } = render(
      <RecipeLadderPanel
        recipes={[STEEL_MATCH]}
        scoutedRecipes={[]}
        onCombine={() => {}}
        rejectedKey={'r-steel-sword:a,b'}
      />,
    );
    expect(getByText('NO ROOM')).toBeInTheDocument();
    expect(queryByText('COMBINE')).toBeNull();
  });

  it('tallies the three rungs in the header', () => {
    const { getByText } = render(
      <RecipeLadderPanel
        recipes={[STEEL_MATCH]}
        scoutedRecipes={[SALVE_RECIPE]}
        onCombine={() => {}}
      />,
    );
    expect(getByText('1 READY')).toBeInTheDocument();
    expect(getByText('1 HELD')).toBeInTheDocument();
    expect(getByText('12 KNOWN')).toBeInTheDocument();
  });
});
