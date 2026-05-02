// RecipeGlow smoke test: renders a per-cell glow rect for each cluster
// cell and a combine-button anchored to the cluster.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BagItem, ItemId, RecipeMatch } from '../run/types';
import { RecipeGlow } from './RecipeGlow';

describe('RecipeGlow', () => {
  it('renders a glow rect for each cluster cell + a combine button', () => {
    const bag: BagItem[] = [
      { uid: 'a', itemId: 'iron-sword' as ItemId, col: 1, row: 0, rot: 0 }, // 1×2 V → (1,0)+(1,1)
      { uid: 'b', itemId: 'iron-dagger' as ItemId, col: 2, row: 0, rot: 0 }, // 1×1 → (2,0)
    ];
    const match: RecipeMatch = {
      recipe: {
        id: 'r-steel-sword',
        inputs: ['iron-sword' as ItemId, 'iron-dagger' as ItemId],
        output: 'steel-sword' as ItemId,
      },
      uids: ['a', 'b'],
    };
    const { container } = render(
      <RecipeGlow bag={bag} matches={[match]} onCombine={vi.fn()} />,
    );

    // Glow SVG: one <rect> per cluster cell. Cluster has 3 cells.
    const glowSvg = container.querySelector('svg.recipe-glow');
    expect(glowSvg).not.toBeNull();
    expect(glowSvg!.querySelectorAll('rect')).toHaveLength(3);

    // Combine button labelled with the output name.
    const button = screen.getByRole('button', { name: /COMBINE.*STEEL SWORD/i });
    expect(button).toBeInTheDocument();
  });

  it('renders nothing when matches is empty', () => {
    const { container } = render(
      <RecipeGlow bag={[]} matches={[]} onCombine={vi.fn()} />,
    );
    expect(container.querySelectorAll('rect')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});
