// Cell-size context for the bag grid. Desktop default is the constant
// `cellPx` (88) from layout.ts; mobile orchestrators wrap their bag
// subtree with `<CellSizeProvider value={52}>` per decision-log
// 2026-04-27 second-style-frame ratification.
//
// Bag/ components (BagBoard, BagCell, DraggableItem, RecipeGlow) read
// the active size via `useCellSize()` and pass it through to the pure
// pixel-math utilities in layout.ts.

import { createContext, useContext, type ReactNode } from 'react';
import { cellPx as DEFAULT_CELL_SIZE } from './layout';

const CellSizeContext = createContext<number>(DEFAULT_CELL_SIZE);

export function CellSizeProvider({ value, children }: { value: number; children: ReactNode }) {
  return <CellSizeContext.Provider value={value}>{children}</CellSizeContext.Provider>;
}

export function useCellSize(): number {
  return useContext(CellSizeContext);
}
