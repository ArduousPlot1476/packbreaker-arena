// Per-cell drop target. Currently renders a transparent positioned div;
// @dnd-kit useDroppable integration lands in commit 6. Visual feedback
// (glow, valid/invalid preview) is rendered in BagBoard's SVG overlay.

import { cellPx } from './layout'

interface BagCellProps {
  col: number
  row: number
}

export function BagCell({ col, row }: BagCellProps) {
  return (
    <div
      data-cell-col={col}
      data-cell-row={row}
      style={{
        position: 'absolute',
        left: col * cellPx,
        top: row * cellPx,
        width: cellPx,
        height: cellPx,
        pointerEvents: 'none',
      }}
    />
  )
}
