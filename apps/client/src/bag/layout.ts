// Bag-grid coordinate utilities. Cell-to-pixel conversion, item footprint
// computation, placement validation, recipe-glow priority resolution, and
// combine-button anchor positioning.

import {
  BAG_COLS,
  BAG_ROWS,
  cellsOf,
  dimsOf,
  ITEMS,
  type BagItem,
  type Cell,
  type ItemId,
  type RarityKey,
} from '../data.local'
import type { RecipeMatch } from '../run/recipes'

export const cellPx = 88

export const RARITY_RANK: Record<RarityKey, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
}

export interface Footprint {
  cells: Cell[]
  w: number
  h: number
}

export function footprint(itemId: ItemId, col: number, row: number, rot: number): Footprint {
  const { w, h } = dimsOf(itemId, rot)
  const cells: Cell[] = []
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      cells.push([col + dx, row + dy])
    }
  }
  return { cells, w, h }
}

export function placementValid(
  bag: BagItem[],
  itemId: ItemId,
  col: number,
  row: number,
  rot: number,
  ignoreUid: string | null = null,
): boolean {
  const { cells, w, h } = footprint(itemId, col, row, rot)
  if (col < 0 || row < 0 || col + w > BAG_COLS || row + h > BAG_ROWS) return false
  const occupied = new Map<string, string>()
  bag.forEach((b) => {
    if (b.uid === ignoreUid) return
    cellsOf(b).forEach(([x, y]) => occupied.set(`${x},${y}`, b.uid))
  })
  return cells.every(([x, y]) => !occupied.has(`${x},${y}`))
}

// Per-cell glow rarity. When two matches overlap on a cell, the higher
// rarity wins.
export function glowCellsForMatches(
  matches: RecipeMatch[],
  bag: BagItem[],
): Map<string, RarityKey> {
  const map = new Map<string, RarityKey>()
  matches.forEach((m) => {
    const outputRarity = ITEMS[m.recipe.output].rarity
    m.uids.forEach((uid) => {
      const b = bag.find((x) => x.uid === uid)
      if (!b) return
      cellsOf(b).forEach(([x, y]) => {
        const k = `${x},${y}`
        const cur = map.get(k)
        if (!cur || RARITY_RANK[outputRarity] > RARITY_RANK[cur]) {
          map.set(k, outputRarity)
        }
      })
    })
  })
  return map
}

export interface CombineAnchorPos {
  cx: number
  cy: number
  transform: string
}

// M1.3.1 commit 3: ports the prototype's upper-right-with-top-fallback
// algorithm verbatim. Commit 7 replaces this with four-direction first-fit.
export function combineAnchorPosition(uids: string[], bag: BagItem[]): CombineAnchorPos | null {
  const cells = uids.flatMap((uid) => {
    const b = bag.find((x) => x.uid === uid)
    return b ? cellsOf(b) : []
  })
  if (!cells.length) return null
  const xs = cells.map((c) => c[0])
  const ys = cells.map((c) => c[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const touchesTop = minY === 0
  const cx = touchesTop ? minX * cellPx - 6 : (maxX + 1) * cellPx + 6
  const cy = touchesTop ? (maxY + 1) * cellPx + 6 : minY * cellPx - 6
  const transform = touchesTop ? 'translate(0, 0)' : 'translate(-100%, -100%)'
  return { cx, cy, transform }
}
