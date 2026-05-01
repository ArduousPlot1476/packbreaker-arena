// Bag item view + useDraggable handle. Drag activation, pointercancel,
// and window-blur cleanup are owned by @dnd-kit's PointerSensor; the
// DndContext at the RunScreen level dispatches into the run reducer.

import { useDraggable } from '@dnd-kit/core';
import { dimsOf, ITEMS, type BagItem } from '../data.local';
import { ItemIcon } from '../ui-kit-overrides/ItemIcon';
import { RarityFrame } from '../ui-kit-overrides/RarityFrame';
import { cellPx } from './layout';
import type { DraggableData } from './types';

interface DraggableItemProps {
  item: BagItem;
  disabled?: boolean;
}

export function DraggableItem({ item, disabled = false }: DraggableItemProps) {
  const def = ITEMS[item.itemId];
  const dims = dimsOf(item.itemId, item.rot);
  const data: DraggableData = {
    kind: 'bag',
    uid: item.uid,
    itemId: item.itemId,
    rot: item.rot,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `bag:${item.uid}`,
    data,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="absolute ease-snap"
      style={{
        left: item.col * cellPx + 2,
        top: item.row * cellPx + 2,
        width: dims.w * cellPx - 4,
        height: dims.h * cellPx - 4,
        opacity: isDragging ? 0.25 : 1,
        cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
        transition:
          'left 160ms cubic-bezier(0.16, 1, 0.3, 1), top 160ms cubic-bezier(0.16, 1, 0.3, 1), opacity 120ms',
        touchAction: 'none',
      }}
    >
      <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={cellPx - 4}>
        <ItemIcon itemId={item.itemId} rot={item.rot} />
      </RarityFrame>
    </div>
  );
}
