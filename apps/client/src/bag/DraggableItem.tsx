// Bag item view + drag handle. Currently uses raw pointer events;
// @dnd-kit useDraggable integration lands in commit 6.

import type { PointerEvent } from 'react'
import { dimsOf, ITEMS, type BagItem } from '../data.local'
import { ItemIcon } from '../ui-kit-overrides/ItemIcon'
import { RarityFrame } from '../ui-kit-overrides/RarityFrame'
import { cellPx } from './layout'
import type { DragState } from './types'

interface DraggableItemProps {
  item: BagItem
  drag: DragState | null
  onPickUp: (e: PointerEvent<HTMLDivElement>, item: BagItem) => void
}

export function DraggableItem({ item, drag, onPickUp }: DraggableItemProps) {
  const def = ITEMS[item.itemId]
  const dims = dimsOf(item.itemId, item.rot)
  const beingDragged = drag !== null && drag.fromBagUid === item.uid
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault()
        onPickUp(e, item)
      }}
      className="absolute ease-snap"
      style={{
        left: item.col * cellPx + 2,
        top: item.row * cellPx + 2,
        width: dims.w * cellPx - 4,
        height: dims.h * cellPx - 4,
        opacity: beingDragged ? 0.25 : 1,
        cursor: beingDragged ? 'grabbing' : 'grab',
        transition:
          'left 160ms cubic-bezier(0.16, 1, 0.3, 1), top 160ms cubic-bezier(0.16, 1, 0.3, 1), opacity 120ms',
        touchAction: 'none',
      }}
    >
      <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={cellPx - 4}>
        <ItemIcon itemId={item.itemId} rot={item.rot} />
      </RarityFrame>
    </div>
  )
}
