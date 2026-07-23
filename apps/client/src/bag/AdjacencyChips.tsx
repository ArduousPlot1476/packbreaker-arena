// Affected-cell chips (CF-89 PR-A): while an adjacency reveal is OPEN, each
// affected tile carries a small teal chip with its RESOLVED received totals —
// damage as "+N", cooldown as the signed percent (all shipped cooldown buffs
// are negative = faster). Reveal-on-intent only: BagBoard renders this overlay
// solely for the open reveal's class-1 affected set (computeChipEntries), so
// the always-on arranging surface stays glow-only. Chips are resolved-number
// surfaces — class-2 (conditional/probabilistic) sources yield none.
//
// Mounted AFTER the DraggableItem tiles inside BagBoard's grid, so chips paint
// on top of the tiles they annotate. pointer-events: none — never a drag or
// tap target. Teal is the established adjacency accent (AdjacencyGlow), not a
// new color; numbers are tabular (.tnum) per Gridline.

import type { ChipEntry } from '../run/adjacencyReveal'
import type { BagItem } from '../run/types'
import { useCellSize } from './CellSize'
import { cellsOf } from './layout'

const CHIP_TEAL = '#5eead4'

interface AdjacencyChipsProps {
  bag: BagItem[]
  entries: ChipEntry[]
}

function chipText(e: ChipEntry): string {
  const parts: string[] = []
  if (e.damage !== 0) parts.push(`+${e.damage}`)
  if (e.cooldownPct !== 0) parts.push(`${e.cooldownPct}%`)
  return parts.join(' · ')
}

export function AdjacencyChips({ bag, entries }: AdjacencyChipsProps) {
  const cellSize = useCellSize()
  if (entries.length === 0) return null

  const byUid = new Map(bag.map((b) => [b.uid, b]))

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 6 }}
      data-testid="adjacency-chips"
    >
      {entries.map((e) => {
        const item = byUid.get(e.uid)
        if (!item) return null // entry outlived the bag item (sold/combined)
        // Top-right corner of the item's cell bounding box.
        const cells = cellsOf(item)
        let maxCol = -Infinity
        let minRow = Infinity
        for (const [x, y] of cells) {
          if (x > maxCol) maxCol = x
          if (y < minRow) minRow = y
        }
        return (
          <div
            key={e.uid}
            data-testid="adjacency-chip"
            className="label-cap tnum"
            style={{
              position: 'absolute',
              left: (maxCol + 1) * cellSize - 3,
              top: minRow * cellSize + 3,
              transform: 'translateX(-100%)',
              fontSize: 9,
              lineHeight: '14px',
              padding: '0 4px',
              borderRadius: 4,
              background: 'var(--bg-mid)',
              border: `1px solid ${CHIP_TEAL}`,
              color: CHIP_TEAL,
              whiteSpace: 'nowrap',
            }}
          >
            {chipText(e)}
          </div>
        )
      })}
    </div>
  )
}
