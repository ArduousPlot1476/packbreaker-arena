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

  it('names every recipe INPUT in text, not only the output (Codex round 1, P2)', () => {
    // The panel exists to teach which inputs a recipe needs. An earlier cut
    // drew inputs as RarityFrame glyphs at size 18 — a 4px content box under an
    // 8px gem — and named only the output, so that fact was unreadable on
    // desktop. Inputs must be recoverable as text on every rung.
    const { container, getByText } = render(
      <RecipeLadderPanel recipes={[]} scoutedRecipes={[]} onCombine={() => {}} />,
    );
    // A 2-input recipe and a 3-input capstone, both on the KNOWN rung.
    expect(getByText('Iron Sword + Iron Dagger → Steel Sword')).toBeInTheDocument();
    expect(
      getByText("Greatsword + Warhammer + Vampire Fang → Berserker's Greataxe"),
    ).toBeInTheDocument();
    // No row is icon-only: every one of the 12 carries an input→output line.
    const rows = Array.from(container.querySelectorAll('[data-testid^="ladder-row-"]'));
    expect(rows).toHaveLength(12);
    for (const row of rows) {
      expect(row.textContent).toContain('→');
    }
  });

  it('tallies the three rungs so they sum to the rendered rows (Codex round 2, P2)', () => {
    // The rungs are mutually exclusive, so the header must count the KNOWN
    // rung, not the row total. An earlier cut printed `rows.length` here and
    // rendered "1 READY · 1 HELD · 12 KNOWN" over a ladder holding 10 known
    // rows — and the FIRST version of this test asserted '12 KNOWN', pinning
    // the defect in place. The sum invariant below is what makes that class of
    // mistake impossible to re-assert.
    const { container, getByText } = render(
      <RecipeLadderPanel
        recipes={[STEEL_MATCH]}
        scoutedRecipes={[SALVE_RECIPE]}
        onCombine={() => {}}
      />,
    );
    expect(getByText('1 READY')).toBeInTheDocument();
    expect(getByText('1 HELD')).toBeInTheDocument();
    expect(getByText('10 KNOWN')).toBeInTheDocument();

    const rendered = container.querySelectorAll('[data-testid^="ladder-row-"]').length;
    const tally = (label: string) =>
      Number(/^(\d+)/.exec(getByText(new RegExp(`^\\d+ ${label}$`)).textContent!)![1]);
    expect(tally('READY') + tally('HELD') + tally('KNOWN')).toBe(rendered);
  });

  it('sizes by flex, with no pixel height budget to drift (Codex round 3)', () => {
    // The REAL geometry gate is scratch/cf95-recipe-ladder/assert.mjs, because
    // happy-dom has no layout engine and getBoundingClientRect is all zeros
    // here — a "panel fits its column" assertion in this file would be
    // vacuously green. What IS checkable here is the structural contract that
    // made the overflow possible: a hardcoded cap. Three hand-tuned row heights
    // (34 → 30 → 27) each drifted out of sync with sibling geometry, so the
    // cap must not come back.
    const { container } = render(
      <RecipeLadderPanel recipes={[]} scoutedRecipes={[]} onCombine={() => {}} />,
    );
    const panel = container.querySelector('[data-testid="recipe-ladder-panel"]') as HTMLElement;
    const grid = panel.querySelector('.grid') as HTMLElement;

    // Zero serializes as '0' in happy-dom and '0px' in browsers — accept both,
    // since the assertion is about the value, not the serializer.
    const isZero = (v: string) => v === '0' || v === '0px';

    // The panel yields; the grid absorbs the shrink and scrolls if it must.
    expect(isZero(panel.style.minHeight)).toBe(true);
    expect(panel.style.flex).toBe('0 1 auto');
    expect(isZero(grid.style.minHeight)).toBe(true);
    expect(grid.style.flex).toBe('1 1 auto');
    expect(grid.style.overflowY).toBe('auto');

    // No pixel cap anywhere in the panel's own chain — that is the regression.
    expect(grid.style.maxHeight).toBe('');
    expect(panel.style.height).toBe('');
    // Rows carry no shared height constant either.
    const row = container.querySelector('[data-testid^="ladder-row-"]') as HTMLElement;
    expect(row.style.minHeight).toBe('');
    expect(row.style.height).toBe('');
  });

  it('tallies correctly on a fresh run, where every rung but KNOWN is empty', () => {
    const { getByText } = render(
      <RecipeLadderPanel recipes={[]} scoutedRecipes={[]} onCombine={() => {}} />,
    );
    expect(getByText('0 READY')).toBeInTheDocument();
    expect(getByText('0 HELD')).toBeInTheDocument();
    expect(getByText('12 KNOWN')).toBeInTheDocument();
  });
});
