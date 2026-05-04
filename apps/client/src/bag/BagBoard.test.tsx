// BagBoard smoke test: renders correctly with empty and populated bag
// states. Wrapped in DndContext because BagCell + DraggableItem use
// @dnd-kit hooks.

import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { render } from '@testing-library/react';
import type { BagItem, ItemId } from '../run/types';
import { BagBoard } from './BagBoard';

// Inline a small bag fixture mirroring the M0 SEED_BAG shape so the
// "populated" test can count rendered DraggableItem nodes.
const TEST_BAG: BagItem[] = [
  { uid: 'b1', itemId: 'iron-sword' as ItemId, col: 1, row: 0, rot: 0 },
  { uid: 'b2', itemId: 'healing-herb' as ItemId, col: 4, row: 0, rot: 0 },
  { uid: 'b3', itemId: 'spark-stone' as ItemId, col: 0, row: 3, rot: 0 },
  { uid: 'b4', itemId: 'copper-coin' as ItemId, col: 5, row: 3, rot: 0 },
];

describe('BagBoard', () => {
  it('renders the empty 6×4 grid (no item nodes) when bag is empty', () => {
    const { container } = render(
      <DndContext>
        <BagBoard
          bag={[]}
          drag={null}
          hover={null}
          dimmed={false}
          recipeMatches={[]}
          onCombine={vi.fn()}
        />
      </DndContext>,
    );

    // 6 cols × 4 rows = 24 BagCell drop targets, identified via the
    // data-cell-* attributes added in BagCell.tsx.
    expect(container.querySelectorAll('[data-cell-col]')).toHaveLength(24);
    // No DraggableItem nodes — they style with `cursor: grab` so we can
    // assert via that signal.
    expect(container.querySelectorAll('[style*="cursor: grab"]')).toHaveLength(0);
  });

  it('renders one DraggableItem per bag entry when populated', () => {
    const populated: BagItem[] = TEST_BAG;
    const { container } = render(
      <DndContext>
        <BagBoard
          bag={populated}
          drag={null}
          hover={null}
          dimmed={false}
          recipeMatches={[]}
          onCombine={vi.fn()}
        />
      </DndContext>,
    );

    expect(container.querySelectorAll('[data-cell-col]')).toHaveLength(24);
    // Each draggable item carries `cursor: grab` in its inline style.
    expect(container.querySelectorAll('[style*="cursor: grab"]')).toHaveLength(populated.length);
  });
});
