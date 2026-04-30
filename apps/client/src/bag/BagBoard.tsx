// 6×4 bag grid surface. Owns pointer-event handling for raw drag/drop in
// commit 3; @dnd-kit DndContext integration lands at the RunScreen level
// in commit 6.

import { useCallback, useRef, type PointerEvent } from 'react'
import { BAG_COLS, BAG_ROWS, type BagItem, type Cell } from '../data.local'
import type { RecipeMatch } from '../run/recipes'
import { BagCell } from './BagCell'
import { DraggableItem } from './DraggableItem'
import { RecipeGlow } from './RecipeGlow'
import { cellPx, footprint, placementValid } from './layout'
import type { DragState } from './types'

interface BagBoardProps {
  bag: BagItem[]
  drag: DragState | null
  hover: { col: number; row: number } | null
  setHover: (h: { col: number; row: number } | null) => void
  onDrop: (col: number, row: number) => void
  onPickUp: (e: PointerEvent<HTMLDivElement>, item: BagItem) => void
  dimmed: boolean
  recipeMatches: RecipeMatch[]
  onCombine: (m: RecipeMatch) => void
}

export function BagBoard({
  bag,
  drag,
  hover,
  setHover,
  onDrop,
  onPickUp,
  dimmed,
  recipeMatches,
  onCombine,
}: BagBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const W = BAG_COLS * cellPx
  const H = BAG_ROWS * cellPx

  const cellAt = useCallback((clientX: number, clientY: number): [number, number] => {
    const r = boardRef.current!.getBoundingClientRect()
    const x = clientX - r.left
    const y = clientY - r.top
    return [Math.floor(x / cellPx), Math.floor(y / cellPx)]
  }, [])

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return
    const [c, r] = cellAt(e.clientX, e.clientY)
    setHover({ col: c, row: r })
  }

  let preview: { valid: boolean; cells: Cell[] } | null = null
  if (drag && hover) {
    const valid = placementValid(
      bag,
      drag.itemId,
      hover.col,
      hover.row,
      drag.rot,
      drag.fromBagUid ?? null,
    )
    preview = { valid, cells: footprint(drag.itemId, hover.col, hover.row, drag.rot).cells }
  }

  return (
    <div className="relative" style={{ padding: 16 }}>
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
      <div
        ref={boardRef}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => {
          if (!drag) return
          const [c, r] = cellAt(e.clientX, e.clientY)
          onDrop(c, r)
        }}
        className={dimmed ? 'bag-dimmed' : ''}
        style={{
          width: W,
          height: H,
          background: 'var(--bg-mid)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          position: 'relative',
        }}
      >
        <svg width={W} height={H} className="absolute inset-0 pointer-events-none">
          {Array.from({ length: BAG_COLS + 1 }).map((_, i) => (
            <line
              key={`v${i}`}
              x1={i * cellPx}
              y1={0}
              x2={i * cellPx}
              y2={H}
              stroke="#2D3854"
              strokeWidth="1"
            />
          ))}
          {Array.from({ length: BAG_ROWS + 1 }).map((_, i) => (
            <line
              key={`h${i}`}
              x1={0}
              y1={i * cellPx}
              x2={W}
              y2={i * cellPx}
              stroke="#2D3854"
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
                  x={x * cellPx + 2}
                  y={y * cellPx + 2}
                  width={cellPx - 4}
                  height={cellPx - 4}
                  rx="5"
                  fill={preview!.valid ? 'rgba(34,197,94,0.18)' : 'rgba(239,68,68,0.18)'}
                  stroke={preview!.valid ? '#22C55E' : '#EF4444'}
                  strokeWidth="2"
                  strokeDasharray={preview!.valid ? '0' : '4 3'}
                />
              ) : null,
            )}
          </svg>
        )}

        {bag.map((b) => (
          <DraggableItem key={b.uid} item={b} drag={drag} onPickUp={onPickUp} />
        ))}
      </div>
      <div className="flex items-center justify-between mt-2" style={{ width: W }}>
        <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {bag.length} ITEM{bag.length === 1 ? '' : 'S'} PLACED
        </div>
        <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {recipeMatches.length > 0 ? (
            <span style={{ color: '#F59E0B' }}>{recipeMatches.length} RECIPE READY</span>
          ) : (
            'NO RECIPES READY'
          )}
        </div>
      </div>
    </div>
  )
}
