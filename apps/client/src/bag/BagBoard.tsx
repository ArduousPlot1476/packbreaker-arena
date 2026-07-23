// 6×4 bag grid surface. Cells are useDroppable; items are useDraggable.
// Drag/drop coordination lives in the DndContext at the RunScreen level.
//
// Cell size flows from CellSizeContext (default 88 desktop, 52 mobile
// per decision-log 2026-04-27 second-style-frame ratification). Pure
// pixel math (combineAnchorPosition) is parameterized by cell size in
// layout.ts.
//
// `compact` mode hides the BAG/recipe-count header + items-placed
// footer rows for the mobile layout (per Trey's decision-6 mitigation
// — total bag area must fit 240px at 52px cells × 4 rows + 32px
// padding, no room for the desktop header/footer).

import { useCallback, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type { BagItem, Cell, RecipeMatch } from '../run/types';
import { detectAdjacencySynergies } from '../run/adjacency';
import { computeChipEntries, computeItemRevealRows } from '../run/adjacencyReveal';
import type { RevealRow } from '../run/adjacencyReveal';
import { AdjacencyChips } from './AdjacencyChips';
import { AdjacencyGlow } from './AdjacencyGlow';
import { BagCell } from './BagCell';
import { useCellSize } from './CellSize';
import { DraggableItem } from './DraggableItem';
import { RecipeGlow } from './RecipeGlow';
import { BAG_COLS, BAG_ROWS, footprint, placementValid } from './layout';
import type { DragState } from './types';

interface BagBoardProps {
  bag: BagItem[];
  drag: DragState | null;
  hover: { col: number; row: number } | null;
  dimmed: boolean;
  recipeMatches: RecipeMatch[];
  onCombine: (m: RecipeMatch) => void;
  /**
   * combineMatchKey of a match the sim just rejected for lack of room —
   * forwarded to RecipeGlow so the tapped COMBINE button shows an inline
   * "NO ROOM — REARRANGE" note. Optional; omit for no active rejection.
   */
  combineRejection?: string | null;
  /**
   * Compact mode (mobile): hides the BAG header + items-placed footer
   * rows so the bag fits in 240px (4 × 52px cells + 32px padding).
   * Default `false` (desktop layout).
   */
  compact?: boolean;
  /**
   * Ref attached to the inner grid `<div>` (cell-origin element). Used
   * by CombatOverlay at combat-phase entry to measure the player bag's
   * screen-space origin via getBoundingClientRect for the BagLayout
   * handshake (M1.4a). Optional — non-combat callers can omit.
   */
  containerRef?: RefObject<HTMLDivElement>;
  /**
   * Read-only display mode (CF-85 Surface 2b: the post-combat opponent-
   * build reveal renders the ghost bag through THIS renderer — one grid,
   * no bespoke sibling). Items are non-draggable WITHOUT the dimmed
   * combat styling, and the item-info popover stays fail-closed on
   * opponent items per the CF 57 DraggableItem contract. Default `false`
   * (interactive player board).
   */
  readOnly?: boolean;
  /**
   * Adjacency-reveal gate + presentation (CF-89 PR-A). UNDEFINED = OFF —
   * the ratified fail-safe default: a mount that does not opt in (the
   * RoundResolution S2b readOnly reveal, any future mount) renders zero
   * reveal surfaces. Deliberately NOT keyed off `readOnly` — that would
   * conflate two concerns. The two run screens opt in with their locked
   * presentation: DesktopRunScreen 'popover', MobileRunScreen 'sheet'.
   */
  adjacencyReveal?: 'popover' | 'sheet';
}

export function BagBoard({
  bag,
  drag,
  hover,
  dimmed,
  recipeMatches,
  onCombine,
  combineRejection,
  compact = false,
  containerRef,
  readOnly = false,
  adjacencyReveal,
}: BagBoardProps) {
  const cellSize = useCellSize();
  const W = BAG_COLS * cellSize;
  const H = BAG_ROWS * cellSize;
  // CF 60: live adjacency-synergy pairs for the teal glow overlay. Local memo
  // on `bag` (glow-only — NOT lifted to the parent screens; recipeMatches is a
  // prop only because the parents also consume it, whereas synergies are used
  // solely here). One mount in BagBoard covers Desktop + Mobile run screens.
  const synergies = useMemo(() => detectAdjacencySynergies(bag), [bag]);

  // CF-89 PR-A: adjacency reveal model, computed ONLY when a mount opts in
  // (adjacencyReveal set). Ungated mounts pay nothing and render nothing.
  const revealEnabled = adjacencyReveal !== undefined;
  const revealRows = useMemo<ReadonlyMap<string, RevealRow[]> | null>(
    () =>
      revealEnabled
        ? new Map(bag.map((b) => [b.uid, computeItemRevealRows(bag, b.uid)]))
        : null,
    [bag, revealEnabled],
  );
  // Which item's reveal is open — drives the affected-cell chips
  // (reveal-on-intent: chips exist only while a reveal is up).
  const [revealUid, setRevealUid] = useState<string | null>(null);
  const onInfoOpenChange = useCallback((uid: string, open: boolean) => {
    setRevealUid((prev) => (open ? uid : prev === uid ? null : prev));
  }, []);
  const chipEntries = useMemo(
    () => (revealEnabled && revealUid !== null ? computeChipEntries(bag, revealUid) : []),
    [bag, revealEnabled, revealUid],
  );

  let preview: { valid: boolean; cells: Cell[] } | null = null;
  if (drag && hover) {
    const valid = placementValid(
      bag,
      drag.itemId,
      hover.col,
      hover.row,
      drag.rot,
      drag.fromBagUid ?? null,
    );
    preview = { valid, cells: footprint(drag.itemId, hover.col, hover.row, drag.rot).cells };
  }

  return (
    <div className="relative" style={{ padding: 16 }}>
      {!compact && (
        <div className="flex items-center justify-between mb-3" style={{ width: W }}>
          <div
            className="label-cap"
            style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.18em' }}
          >
            BAG · 6×4
          </div>
          <div className="label-cap" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            R = ROTATE · DRAG TO MOVE
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className={dimmed ? 'bag-dimmed' : ''}
        style={{
          width: W,
          height: H,
          background: 'var(--bg-mid)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          position: 'relative',
          // Lock pinch-zoom + scroll-while-touching on the bag area
          // (mobile). Drag/drop interactions own this surface
          // exclusively. Items' touchAction is 'none' too so the lock
          // applies whether the touch starts on a cell or an item.
          touchAction: 'none',
        }}
      >
        <svg width={W} height={H} className="absolute inset-0 pointer-events-none">
          {Array.from({ length: BAG_COLS + 1 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={i * cellSize}
              y1={0}
              x2={i * cellSize}
              y2={H}
              stroke="var(--border-default)"
              strokeWidth="1"
            />
          ))}
          {Array.from({ length: BAG_ROWS + 1 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={i * cellSize}
              x2={W}
              y2={i * cellSize}
              stroke="var(--border-default)"
              strokeWidth="1"
            />
          ))}
        </svg>

        {Array.from({ length: BAG_ROWS }).flatMap((_, row) =>
          Array.from({ length: BAG_COLS }).map((_, col) => (
            <BagCell key={`${col},${row}`} col={col} row={row} />
          )),
        )}

        <AdjacencyGlow bag={bag} synergies={synergies} />

        <RecipeGlow
          bag={bag}
          matches={recipeMatches}
          onCombine={onCombine}
          rejectedKey={combineRejection}
        />

        {preview && (
          <svg width={W} height={H} className="absolute inset-0 pointer-events-none">
            {preview.cells.map(([x, y], i) =>
              x >= 0 && y >= 0 && x < BAG_COLS && y < BAG_ROWS ? (
                <rect
                  key={i}
                  x={x * cellSize + 2}
                  y={y * cellSize + 2}
                  width={cellSize - 4}
                  height={cellSize - 4}
                  rx="5"
                  fill={preview!.valid ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'}
                  stroke={preview!.valid ? 'var(--r-uncommon)' : 'var(--life-red)'}
                  strokeWidth="2"
                  strokeDasharray={preview!.valid ? '0' : '4 3'}
                />
              ) : null,
            )}
          </svg>
        )}

        {bag.map((b) => (
          <DraggableItem
            key={b.uid}
            item={b}
            disabled={dimmed || readOnly}
            enableInfoPopover={!readOnly}
            adjacencyRows={revealEnabled ? revealRows?.get(b.uid) : undefined}
            revealPresentation={
              adjacencyReveal === undefined
                ? undefined
                : adjacencyReveal === 'sheet'
                  ? 'sheet'
                  : 'anchored'
            }
            onInfoOpenChange={revealEnabled ? onInfoOpenChange : undefined}
          />
        ))}

        {/* After the tiles so chips paint on top of the items they annotate. */}
        {revealEnabled && <AdjacencyChips bag={bag} entries={chipEntries} />}
      </div>
      {!compact && (
        <div className="flex items-center justify-between mt-2" style={{ width: W }}>
          <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {bag.length} ITEM{bag.length === 1 ? '' : 'S'} PLACED
          </div>
          <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {recipeMatches.length > 0 ? (
              <span style={{ color: 'var(--r-legendary)' }}>
                {recipeMatches.length} RECIPE READY
              </span>
            ) : (
              'NO RECIPES READY'
            )}
          </div>
        </div>
      )}
    </div>
  );
}
