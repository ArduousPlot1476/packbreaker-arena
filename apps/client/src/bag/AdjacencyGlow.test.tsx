// AdjacencyGlow smoke test: one glow rect per bag cell of every item in a
// synergy; nothing when there are no synergies; below RecipeGlow (zIndex 4).

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { BagItem, ItemId } from '../run/types'
import type { AdjacencySynergy } from '../run/adjacency'
import { AdjacencyGlow } from './AdjacencyGlow'

const SWORD: BagItem = { uid: 'sword', itemId: 'iron-sword' as ItemId, col: 0, row: 0, rot: 0 } // 1×2 V → 2 cells
const WHET: BagItem = { uid: 'whet', itemId: 'whetstone' as ItemId, col: 1, row: 0, rot: 0 } // 1×1 → 1 cell
const SYNERGY: AdjacencySynergy = { sourceUid: 'whet', targetUid: 'sword', kind: 'reaction' }

describe('AdjacencyGlow', () => {
  it('renders a rect for every cell of both items in a synergy', () => {
    const { container } = render(<AdjacencyGlow bag={[SWORD, WHET]} synergies={[SYNERGY]} />)
    const svg = container.querySelector('svg.adjacency-glow')
    expect(svg).not.toBeNull()
    // sword (2 cells) + whetstone (1 cell) = 3 rects
    expect(svg!.querySelectorAll('rect')).toHaveLength(3)
  })

  it('renders no rects when there are no synergies', () => {
    const { container } = render(<AdjacencyGlow bag={[WHET]} synergies={[]} />)
    expect(container.querySelectorAll('rect')).toHaveLength(0)
  })

  it('sits below RecipeGlow (zIndex 4, so the gold recipe cue wins overlaps)', () => {
    const { container } = render(<AdjacencyGlow bag={[SWORD, WHET]} synergies={[SYNERGY]} />)
    const svg = container.querySelector('svg.adjacency-glow') as SVGElement
    expect(svg.style.zIndex).toBe('4')
  })
})
