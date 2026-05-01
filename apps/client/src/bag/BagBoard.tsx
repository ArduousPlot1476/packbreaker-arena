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

import { BAG_COLS, BAG_ROWS, type BagItem, type Cell } from '../data.local';
import type { RecipeMatch } from '../run/recipes';
import { BagCell } from './BagCell';
import { useCellSize } from './CellSize';
import { DraggableItem } from './DraggableItem';
import { RecipeGlow } from './RecipeGlow';
import { footprint, placementValid } from './layout';
import type { DragState } from './types';

interface BagBoardProps {
  bag: BagItem[];
  drag: DragState | null;
  hover: { col: number; row: number } | null;
  dimmed: boolean;
  recipeMatches: RecipeMatch[];
  onCombine: (m: RecipeMatch) => void;
  /**
   * Compact mode (mobile): hides the BAG header + items-placed footer
   * rows so the bag fits in 240px (4 × 52px cells + 32px padding).
   * Default `false` (desktop layout).
   */
  compact?: boolean;
}

export function BagBoard({
  bag,
  drag,
  hover,
  dimmed,
  recipeMatches,
  onCombine,
  compact = false,
}: BagBoardProps) {
  const cellSize = useCellSize();
  const W = BAG_COLS * cellSize;
  const H = BAG_ROWS * cellSize;

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

        <RecipeGlow bag={bag} matches={recipeMatches} onCombine={onCombine} />

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
          <DraggableItem key={b.uid} item={b} disabled={dimmed} />
        ))}
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
