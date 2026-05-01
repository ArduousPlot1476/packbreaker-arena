// Per-cell drop target. useDroppable registers the cell's bounds with
// @dnd-kit; the DndContext at the RunScreen level handles drag/drop
// coordination via collision detection.

import { useDroppable } from '@dnd-kit/core';
import { cellPx } from './layout';
import type { DroppableData } from './types';

interface BagCellProps {
  col: number;
  row: number;
}

export function BagCell({ col, row }: BagCellProps) {
  const data: DroppableData = { kind: 'cell', col, row };
  const { setNodeRef } = useDroppable({
    id: `cell:${col}:${row}`,
    data,
  });
  return (
    <div
      ref={setNodeRef}
      data-cell-col={col}
      data-cell-row={row}
      style={{
        position: 'absolute',
        left: col * cellPx,
        top: row * cellPx,
        width: cellPx,
        height: cellPx,
      }}
    />
  );
}
