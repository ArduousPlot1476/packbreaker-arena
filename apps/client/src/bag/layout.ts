// Bag-grid coordinate utilities. Cell-to-pixel conversion, item footprint
// computation, placement validation, recipe-glow priority resolution, and
// combine-button anchor positioning.
//
// M1.3.4a — data.local dissolution moved cellsOf + dimsOf into this module
// (they operate on the client BagItem shape, so they belong with the bag
// pure helpers, not in ui-kit or sim). BAG_COLS / BAG_ROWS are derived
// from DEFAULT_RULESET.bagDimensions; threading state-driven dimensions
// through these pure helpers is M2 work when bag-dimension-mutating
// contracts ship.

import { DEFAULT_RULESET } from '@packbreaker/content'
import type { RarityKey } from '@packbreaker/ui-kit'
import { ITEMS } from '../run/content'
import type { BagItem, Cell, ItemId, RecipeMatch } from '../run/types'

export const cellPx = 88

/** Bag dimensions derived from DEFAULT_RULESET. M1 contracts don't mutate
 *  bagDimensions; M2 contract-driven mutators will need to thread the
 *  dimensions through these pure helpers as a parameter. */
export const BAG_COLS = DEFAULT_RULESET.bagDimensions.width
export const BAG_ROWS = DEFAULT_RULESET.bagDimensions.height

export const RARITY_RANK: Record<RarityKey, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
}

/** Bag-cell rotation for an item id (square footprints are rotation-invariant). */
export function dimsOf(itemId: ItemId, rot = 0): { w: number; h: number } {
  const def = ITEMS[itemId]
  if (!def) {
    // Unknown ids should never reach UI under M1.3.4a's iconned-pool
    // constraint, but defensively fall back to a 1×1 footprint so layout
    // doesn't crash on an unexpected sim-generated id.
    return { w: 1, h: 1 }
  }
  let w = def.w
  let h = def.h
  if (rot % 180 !== 0) [w, h] = [h, w]
  return { w, h }
}

/** Cells occupied by a placed bag item, given its anchor + rotation. */
export function cellsOf(bagItem: BagItem): Cell[] {
  const { w, h } = dimsOf(bagItem.itemId, bagItem.rot)
  const out: Cell[] = []
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      out.push([bagItem.col + dx, bagItem.row + dy])
    }
  }
  return out
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

// ─── Combine-button anchor: four-direction first-fit (M0 deferred item 1) ──

export type AnchorDirection = 'upper-right' | 'upper-left' | 'lower-right' | 'lower-left'

const ANCHOR_PRIORITY: readonly AnchorDirection[] = [
  'upper-right',
  'upper-left',
  'lower-right',
  'lower-left',
] as const

// Collision-check button bounding box. Configurable defaults match the
// estimated rendered button width for "COMBINE → output" (the actual
// rendered button can be wider; this value is intentionally a
// conservative estimate per spec).
export const COMBINE_BUTTON_W = 44
export const COMBINE_BUTTON_H = 24
export const COMBINE_BUTTON_GAP = 6

export interface CombineAnchorPos {
  cx: number
  cy: number
  transform: string
  direction: AnchorDirection
  fallback: boolean
}

interface ClusterBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

interface ButtonRect {
  x: number
  y: number
  w: number
  h: number
}

interface AnchorCandidate {
  cx: number
  cy: number
  transform: string
  rect: ButtonRect
}

function anchorCandidate(
  direction: AnchorDirection,
  bounds: ClusterBounds,
  cellSize: number,
): AnchorCandidate {
  const left = bounds.minX * cellSize
  const right = (bounds.maxX + 1) * cellSize
  const top = bounds.minY * cellSize
  const bottom = (bounds.maxY + 1) * cellSize
  const W = COMBINE_BUTTON_W
  const H = COMBINE_BUTTON_H
  const G = COMBINE_BUTTON_GAP
  switch (direction) {
    case 'upper-right':
      return {
        cx: right + G,
        cy: top - G,
        transform: 'translate(-100%, -100%)',
        rect: { x: right + G - W, y: top - G - H, w: W, h: H },
      }
    case 'upper-left':
      return {
        cx: left - G,
        cy: top - G,
        transform: 'translate(0, -100%)',
        rect: { x: left - G, y: top - G - H, w: W, h: H },
      }
    case 'lower-right':
      return {
        cx: right + G,
        cy: bottom + G,
        transform: 'translate(-100%, 0)',
        rect: { x: right + G - W, y: bottom + G, w: W, h: H },
      }
    case 'lower-left':
      return {
        cx: left - G,
        cy: bottom + G,
        transform: 'translate(0, 0)',
        rect: { x: left - G, y: bottom + G, w: W, h: H },
      }
  }
}

function rectOffGrid(rect: ButtonRect, cellSize: number): boolean {
  const W = BAG_COLS * cellSize
  const H = BAG_ROWS * cellSize
  return rect.x < 0 || rect.y < 0 || rect.x + rect.w > W || rect.y + rect.h > H
}

function rectOverlapsCells(
  rect: ButtonRect,
  occupiedCells: ReadonlySet<string>,
  cellSize: number,
): boolean {
  const startCol = Math.floor(rect.x / cellSize)
  const endCol = Math.floor((rect.x + rect.w - 1) / cellSize)
  const startRow = Math.floor(rect.y / cellSize)
  const endRow = Math.floor((rect.y + rect.h - 1) / cellSize)
  for (let c = startCol; c <= endCol; c++) {
    for (let r = startRow; r <= endRow; r++) {
      if (occupiedCells.has(`${c},${r}`)) return true
    }
  }
  return false
}

// Four-direction first-fit anchor positioning. Tries upper-right,
// upper-left, lower-right, lower-left in priority order; the first
// candidate whose button rect is fully on-grid AND doesn't overlap any
// non-cluster bag item wins. If all four collide (extremely dense bags)
// returns the upper-right anchor with `fallback: true` and accepts the
// visual overlap.
//
// `cellSize` defaults to the desktop cellPx (88) for back-compat with
// pre-M1.3.3 callers. Mobile callers pass 52 (per decision-log
// 2026-04-27 second-style-frame ratification).
export function combineAnchorPosition(
  uids: string[],
  bag: BagItem[],
  cellSize: number = cellPx,
): CombineAnchorPos | null {
  const clusterCells = uids.flatMap((uid) => {
    const b = bag.find((x) => x.uid === uid)
    return b ? cellsOf(b) : []
  })
  if (!clusterCells.length) return null
  const xs = clusterCells.map((c) => c[0])
  const ys = clusterCells.map((c) => c[1])
  const bounds: ClusterBounds = {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }

  const skip = new Set(uids)
  const nonClusterCells = new Set<string>()
  for (const b of bag) {
    if (skip.has(b.uid)) continue
    for (const [x, y] of cellsOf(b)) nonClusterCells.add(`${x},${y}`)
  }

  for (const direction of ANCHOR_PRIORITY) {
    const candidate = anchorCandidate(direction, bounds, cellSize)
    if (rectOffGrid(candidate.rect, cellSize)) continue
    if (rectOverlapsCells(candidate.rect, nonClusterCells, cellSize)) continue
    return {
      cx: candidate.cx,
      cy: candidate.cy,
      transform: candidate.transform,
      direction,
      fallback: false,
    }
  }

  const fallback = anchorCandidate('upper-right', bounds, cellSize)
  return {
    cx: fallback.cx,
    cy: fallback.cy,
    transform: fallback.transform,
    direction: 'upper-right',
    fallback: true,
  }
}
