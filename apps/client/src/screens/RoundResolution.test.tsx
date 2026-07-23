// CF-85 Surface 2b — post-combat opponent-build reveal (decision-log.md
// 2026-07-20 § "CF-85 SCOPE REDRAWN against Phase-1 read-only …", the
// PRIMARY clause-2 leg). Acceptance: after a round resolves the player can
// see the ghost's actual items and layout; the reveal is post-combat only
// (§14's pre-combat restriction is N/A here); it REUSES the existing bag
// renderer (BagBoard readOnly — no bespoke grid); the inspect popover
// stays fail-closed on opponent items (the CF 57 DraggableItem contract).
//
// Collapsed by default so the reveal never evicts core round state
// (anchor DoD 6) — gold/trophy/hearts assertions run pre- and post-toggle.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type { BagItem, ItemId } from '../run/types';
import { RoundResolution } from './RoundResolution';

const GHOST_BAG: BagItem[] = [
  { uid: 'g0', itemId: 'iron-sword' as ItemId, col: 0, row: 0, rot: 0 },
  { uid: 'g1', itemId: 'healing-herb' as ItemId, col: 2, row: 1, rot: 0 },
  { uid: 'g2', itemId: 'spark-stone' as ItemId, col: 4, row: 2, rot: 0 },
];

function baseProps() {
  return {
    round: 3,
    outcome: 'win' as const,
    damageDealt: 14,
    damageTaken: 6,
    goldEarned: 5,
    trophyEarned: 14,
    hearts: 3,
    maxHearts: 3,
    onNext: vi.fn(),
  };
}

describe('RoundResolution — CF-85 Surface 2b opponent-build reveal', () => {
  it('renders NO reveal affordance when opponentBuild is absent (back-compat)', () => {
    const { queryByTestId } = render(<RoundResolution {...baseProps()} />);
    expect(queryByTestId('view-opponent-build')).toBeNull();
    expect(queryByTestId('opponent-build-board')).toBeNull();
  });

  it('renders the toggle when opponentBuild is provided, collapsed by default', () => {
    const { getByTestId, queryByTestId } = render(
      <RoundResolution
        {...baseProps()}
        opponentBuild={{ classLabel: 'Marauder', bagItems: GHOST_BAG }}
      />,
    );
    expect(getByTestId('view-opponent-build')).toBeInTheDocument();
    expect(queryByTestId('opponent-build-board')).toBeNull();
  });

  it('toggle reveals the ghost bag via the EXISTING bag renderer (6×4 grid + one node per item), then hides it', () => {
    const { getByTestId, queryByTestId } = render(
      <RoundResolution
        {...baseProps()}
        opponentBuild={{ classLabel: 'Marauder', bagItems: GHOST_BAG }}
      />,
    );
    fireEvent.click(getByTestId('view-opponent-build'));

    const board = getByTestId('opponent-build-board');
    // BagBoard's real grid: 6 × 4 = 24 BagCell drop targets (the same
    // renderer the player board uses — no bespoke grid).
    expect(board.querySelectorAll('[data-cell-col]')).toHaveLength(24);
    // One rendered item node per ghost bag entry. readOnly items carry
    // cursor:default (DraggableItem disabled styling).
    expect(board.querySelectorAll('[style*="cursor: default"]')).toHaveLength(GHOST_BAG.length);
    // The ghost's apparent class is captioned on the reveal.
    expect(getByTestId('opponent-build-caption').textContent).toContain('Marauder');

    fireEvent.click(getByTestId('view-opponent-build'));
    expect(queryByTestId('opponent-build-board')).toBeNull();
  });

  it('fail-closed inspector: revealed opponent items expose NO inspect button (CF 57 contract)', () => {
    const { getByTestId } = render(
      <RoundResolution
        {...baseProps()}
        opponentBuild={{ classLabel: 'Tinker', bagItems: GHOST_BAG }}
      />,
    );
    fireEvent.click(getByTestId('view-opponent-build'));
    const board = getByTestId('opponent-build-board');
    // With enableInfoPopover fail-closed, DraggableItem renders the bare
    // visual — zero <button> elements inside the board.
    expect(board.querySelectorAll('button')).toHaveLength(0);
  });

  it('core round state stays rendered while the reveal is open (DoD 6: no eviction)', () => {
    const { getByTestId, getByText } = render(
      <RoundResolution
        {...baseProps()}
        opponentBuild={{ classLabel: 'Marauder', bagItems: GHOST_BAG }}
      />,
    );
    fireEvent.click(getByTestId('view-opponent-build'));
    expect(getByText('GOLD')).toBeInTheDocument();
    expect(getByText('TROPHY')).toBeInTheDocument();
    expect(getByText('HEARTS')).toBeInTheDocument();
    expect(getByText(/DEALT/)).toBeInTheDocument();
    expect(getByText('NEXT ROUND →')).toBeInTheDocument();
  });

  it('CF-89 PR-A gate: the S2b readOnly mount renders ZERO adjacency-reveal surfaces even over a LIVE synergy pair', () => {
    // Ghost bag with a real reaction pair (whetstone beside iron-sword) AND a
    // real aura pair (mana-potion beside iron-sword): if the reveal were
    // inheriting into this mount, every surface below would render. The
    // RoundResolution BagBoard passes NO adjacencyReveal prop (default OFF —
    // the ratified fail-safe direction, decision-log.md 2026-07-22
    // § "CF-89 L1/L2 PHASE 1 RATIFIED …" § 4), so none may appear.
    const synergyGhostBag: BagItem[] = [
      { uid: 'g0', itemId: 'iron-sword' as ItemId, col: 0, row: 0, rot: 0 },
      { uid: 'g1', itemId: 'whetstone' as ItemId, col: 1, row: 0, rot: 0 },
      { uid: 'g2', itemId: 'mana-potion' as ItemId, col: 1, row: 1, rot: 0 },
    ];
    const { getByTestId, queryByTestId } = render(
      <RoundResolution
        {...baseProps()}
        opponentBuild={{ classLabel: 'Tinker', bagItems: synergyGhostBag }}
      />,
    );
    fireEvent.click(getByTestId('view-opponent-build'));
    expect(getByTestId('opponent-build-board')).toBeInTheDocument();
    expect(queryByTestId('adjacency-section')).toBeNull();
    expect(queryByTestId('adjacency-chips')).toBeNull();
    expect(queryByTestId('adjacency-chip')).toBeNull();
  });

  it('draw outcome still renders the reveal (mutual-KO draws are exactly where "what killed me" matters)', () => {
    const { getByTestId } = render(
      <RoundResolution
        {...baseProps()}
        outcome="draw"
        opponentBuild={{ classLabel: 'Marauder', bagItems: GHOST_BAG }}
      />,
    );
    fireEvent.click(getByTestId('view-opponent-build'));
    expect(getByTestId('opponent-build-board')).toBeInTheDocument();
  });
});
