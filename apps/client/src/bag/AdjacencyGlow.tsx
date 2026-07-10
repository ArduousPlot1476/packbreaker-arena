// Adjacency-synergy visual (CF 60): a quiet teal dashed outline on every bag
// cell of an item currently in a live adjacency-synergy relationship (both the
// reactor and the item that provokes it). Sibling to RecipeGlow, rendered one
// z-index BELOW it (zIndex 4 vs RecipeGlow's 5) so the gold recipe cue always
// wins overlaps. Static — no marching/pulse; motion stays reserved for the
// recipe glow (gdd.md § UI feedback / § onboarding).
//
// The teal is a graybox placeholder (Tailwind teal-300 = #5eead4 @ 0.55);
// palette consolidation into the .glow-* rgba derivatives rides CF 20.
//
// strokeWidth / strokeDasharray / fill live in `.adjacency-glow rect`
// (index.css), mirroring how `.recipe-glow rect` is defined; only the stroke
// colour is set inline (as RecipeGlow sets its rarity stroke inline).

import type { BagItem } from '../run/types'
import type { AdjacencySynergy } from '../run/adjacency'
import { useCellSize } from './CellSize'
import { BAG_COLS, BAG_ROWS, cellsOf } from './layout'

const ADJACENCY_GLOW_COLOR = 'rgba(94, 234, 212, 0.55)'

interface AdjacencyGlowProps {
  bag: BagItem[]
  synergies: AdjacencySynergy[]
}

export function AdjacencyGlow({ bag, synergies }: AdjacencyGlowProps) {
  const cellSize = useCellSize()
  const W = BAG_COLS * cellSize
  const H = BAG_ROWS * cellSize

  // Union of every cell of every uid appearing as reactor or provoker.
  const uids = new Set<string>()
  for (const s of synergies) {
    uids.add(s.reactorUid)
    uids.add(s.provokerUid)
  }
  const cellKeys = new Set<string>()
  for (const b of bag) {
    if (!uids.has(b.uid)) continue
    for (const [x, y] of cellsOf(b)) cellKeys.add(`${x},${y}`)
  }

  return (
    <svg
      width={W}
      height={H}
      className="absolute inset-0 pointer-events-none adjacency-glow"
      style={{ zIndex: 4 }}
      data-testid="adjacency-glow"
    >
      {[...cellKeys].map((k) => {
        const [x, y] = k.split(',').map(Number)
        return (
          <rect
            key={k}
            data-cell={k}
            x={x * cellSize + 3}
            y={y * cellSize + 3}
            width={cellSize - 6}
            height={cellSize - 6}
            rx="6"
            style={{ stroke: ADJACENCY_GLOW_COLOR }}
          />
        )
      })}
    </svg>
  )
}
