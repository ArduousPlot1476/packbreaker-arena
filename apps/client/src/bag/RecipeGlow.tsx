// Recipe-ready visual: per-cell dashed pulsing outline (rarity-keyed) +
// combine button anchored to the cluster bounding box. Glow renders at
// zIndex 5; combine button at zIndex 10 above the glow.

import { BAG_COLS, BAG_ROWS, ITEMS, RARITY, type BagItem } from '../data.local'
import type { RecipeMatch } from '../run/recipes'
import { cellPx, combineAnchorPosition, glowCellsForMatches } from './layout'

interface RecipeGlowProps {
  bag: BagItem[]
  matches: RecipeMatch[]
  onCombine: (m: RecipeMatch) => void
}

export function RecipeGlow({ bag, matches, onCombine }: RecipeGlowProps) {
  const W = BAG_COLS * cellPx
  const H = BAG_ROWS * cellPx
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
              x={x * cellPx + 3}
              y={y * cellPx + 3}
              width={cellPx - 6}
              height={cellPx - 6}
              rx="6"
              style={{ stroke: RARITY[rarity].color }}
            />
          )
        })}
      </svg>

      {matches.map((m, i) => {
        const anchor = combineAnchorPosition(m.uids, bag)
        if (!anchor) return null
        return (
          <button
            key={`${m.recipe.id}:${i}`}
            onClick={() => onCombine(m)}
            className="absolute combine-pop label-cap ease-snap"
            style={{
              left: anchor.cx,
              top: anchor.cy,
              transform: anchor.transform,
              background: '#F59E0B',
              color: '#0B0F1A',
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.12em',
              border: '2px solid #FCD34D',
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
