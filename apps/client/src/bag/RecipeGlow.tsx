// Recipe-ready visual: per-cell dashed pulsing outline (rarity-keyed) +
// combine button anchored to the cluster bounding box. Glow renders at
// zIndex 5; combine button at zIndex 10 above the glow.
//
// M0 deferred item 2 — closed at M1.3.2 commit 7. Per-cell rect
// rendering retained. Evaluation on the post-styling-pass visual
// register (1px frame borders, 1.5s/cycle marching dash, rarity-keyed
// alpha pulse) showed unified halo legibility on both 2-cell and
// 3-cell clusters; the failure mode the M0 spec named (internal seam
// fighting halo) did not surface. Perimeter-path approach (~30 lines
// edge-traversal geometry per the M0 deferred item 2 spec) deferred
// indefinitely; revisit only if telemetry/playtest surfaces "busy"
// read in cluster shapes not exercised here (4+ cell clusters,
// L-shapes, T-shapes — none of which exist in M1 recipe content per
// balance-bible.md § 11).

import { RARITY } from '@packbreaker/ui-kit'
import { ITEMS } from '../run/content'
import type { BagItem, RecipeMatch } from '../run/types'
import { useCellSize } from './CellSize'
import { BAG_COLS, BAG_ROWS, combineAnchorPosition, glowCellsForMatches } from './layout'

interface RecipeGlowProps {
  bag: BagItem[]
  matches: RecipeMatch[]
  onCombine: (m: RecipeMatch) => void
}

export function RecipeGlow({ bag, matches, onCombine }: RecipeGlowProps) {
  const cellSize = useCellSize()
  const W = BAG_COLS * cellSize
  const H = BAG_ROWS * cellSize
  const glowCells = glowCellsForMatches(matches, bag)

  return (
    <>
      <svg
        width={W}
        height={H}
        className="absolute inset-0 pointer-events-none recipe-glow"
        style={{ zIndex: 5 }}
      >
        {[...glowCells.entries()].map(([k, rarity]) => {
          const [x, y] = k.split(',').map(Number)
          return (
            <rect
              key={k}
              x={x * cellSize + 3}
              y={y * cellSize + 3}
              width={cellSize - 6}
              height={cellSize - 6}
              rx="6"
              style={{ stroke: RARITY[rarity].color }}
            />
          )
        })}
      </svg>

      {matches.map((m, i) => {
        const anchor = combineAnchorPosition(m.uids, bag, cellSize)
        if (!anchor) return null
        return (
          <button
            key={`${m.recipe.id}:${i}`}
            onClick={() => onCombine(m)}
            className="absolute combine-pop label-cap ease-snap hover-lift"
            style={{
              left: anchor.cx,
              top: anchor.cy,
              transform: anchor.transform,
              background: 'var(--r-legendary)',
              color: 'var(--bg-deep)',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.12em',
              border: '2px solid var(--coin-stroke)',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(245,158,11,0.35)',
              zIndex: 10,
              whiteSpace: 'nowrap',
            }}
          >
            COMBINE → {ITEMS[m.recipe.output].name.toUpperCase()}
          </button>
        )
      })}
    </>
  )
}
