// BagBoard smoke test: renders correctly with empty and populated bag
// states. Wrapped in DndContext because BagCell + DraggableItem use
// @dnd-kit hooks. CF-89 PR-A: adjacency-reveal gating tests — the reveal
// prop defaults OFF and every surface is absent unless a mount opts in.

import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('BagBoard — adjacency reveal gating (CF-89 PR-A, default OFF)', () => {
  // Whetstone beside Iron Sword: a live reaction pair, so any reveal surface
  // that CAN render, WOULD render — absence proves the gate, not the content.
  const SYNERGY_BAG: BagItem[] = [
    { uid: 'sword', itemId: 'iron-sword' as ItemId, col: 0, row: 0, rot: 0 },
    { uid: 'whet', itemId: 'whetstone' as ItemId, col: 1, row: 0, rot: 0 },
  ];

  function renderBoard(props: Partial<Parameters<typeof BagBoard>[0]> = {}) {
    return render(
      <DndContext>
        <BagBoard
          bag={SYNERGY_BAG}
          drag={null}
          hover={null}
          dimmed={false}
          recipeMatches={[]}
          onCombine={vi.fn()}
          {...props}
        />
      </DndContext>,
    );
  }

  it('UNGATED (prop absent): inspect popover opens WITHOUT an adjacency section; no chips overlay', () => {
    renderBoard();
    fireEvent.click(screen.getByLabelText('Whetstone'));
    // The CF 57 popover itself still works…
    expect(screen.getByTestId('item-info-popover')).toBeTruthy();
    // …but carries no reveal section, and the chips overlay is not mounted.
    expect(screen.queryByTestId('adjacency-section')).toBeNull();
    expect(screen.queryByTestId('adjacency-chips')).toBeNull();
  });

  it('the RoundResolution S2b shape (readOnly, prop absent) renders zero reveal surfaces AND no inspect popover', () => {
    // Mirrors the exact S2b mount: readOnly + no adjacencyReveal
    // (screens/RoundResolution.tsx renders <BagBoard readOnly …/> with no
    // reveal prop). readOnly keeps the popover fail-closed on opponent items
    // (CF 57 contract) and the default-OFF gate keeps every reveal surface out.
    const { container } = renderBoard({ readOnly: true });
    expect(container.querySelectorAll('button')).toHaveLength(0); // no inspect triggers
    expect(screen.queryByTestId('item-info-popover')).toBeNull();
    expect(screen.queryByTestId('adjacency-section')).toBeNull();
    expect(screen.queryByTestId('adjacency-chips')).toBeNull();
  });

  it('GATED ON ("popover"): opening Whetstone shows the adjacency section and the affected-cell chip on the sword', () => {
    renderBoard({ adjacencyReveal: 'popover' });
    fireEvent.click(screen.getByLabelText('Whetstone'));
    expect(screen.getByTestId('adjacency-section')).toBeTruthy();
    // Class-1 row with the resolved after-value (iron-sword damage 4 → 5).
    expect(screen.getByTestId('adjacency-row-class1').textContent).toContain('4 → 5');
    // Reveal-on-intent chip on the affected sword tile.
    const chips = screen.getAllByTestId('adjacency-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0]!.textContent).toBe('+1');
  });

  it('suppressing the only adjacency row leaves NO orphaned ADJACENCY section header (Codex round-1 P2)', () => {
    // Spark Stone beside Copper Coin: the class-3 row is gate-suppressed (no
    // provoker), so the popover must render its plain CF 57 shape — no empty
    // ADJACENCY header.
    render(
      <DndContext>
        <BagBoard
          bag={[
            { uid: 'spark', itemId: 'spark-stone' as ItemId, col: 0, row: 0, rot: 0 },
            { uid: 'coin', itemId: 'copper-coin' as ItemId, col: 1, row: 0, rot: 0 },
          ]}
          drag={null}
          hover={null}
          dimmed={false}
          recipeMatches={[]}
          onCombine={vi.fn()}
          adjacencyReveal="popover"
        />
      </DndContext>,
    );
    fireEvent.click(screen.getByLabelText('Spark Stone'));
    expect(screen.getByTestId('item-info-popover')).toBeTruthy();
    expect(screen.queryByTestId('adjacency-section')).toBeNull();
  });

  it('chips are reveal-on-intent: closing the popover removes them', () => {
    renderBoard({ adjacencyReveal: 'popover' });
    const trigger = screen.getByLabelText('Whetstone');
    fireEvent.click(trigger);
    expect(screen.getAllByTestId('adjacency-chip')).toHaveLength(1);
    fireEvent.click(trigger); // toggle closed
    expect(screen.queryByTestId('adjacency-chip')).toBeNull();
  });
});
