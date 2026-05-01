// Bag item view + useDraggable handle. Drag activation, pointercancel,
// and window-blur cleanup are owned by @dnd-kit's PointerSensor; the
// DndContext at the RunScreen level dispatches into the run reducer.

import { useDraggable } from '@dnd-kit/core';
import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { dimsOf, ITEMS, type BagItem } from '../data.local';
import { ICONS } from '../icons/icons';
import { cellPx } from './layout';
import type { DraggableData } from './types';

interface DraggableItemProps {
  item: BagItem;
  disabled?: boolean;
}

export function DraggableItem({ item, disabled = false }: DraggableItemProps) {
  const def = ITEMS[item.itemId];
  const dims = dimsOf(item.itemId, item.rot);
  const Icon = ICONS[item.itemId] ?? ICONS['copper-coin'];
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
        // 120ms drop-settle per visual-direction.md § 7 ("placement
        // settles in 120ms"). Was 160ms in the M0/M1.3.1 prototype.
        transition:
          'left 120ms cubic-bezier(0.16, 1, 0.3, 1), top 120ms cubic-bezier(0.16, 1, 0.3, 1), opacity 120ms',
        touchAction: 'none',
      }}
    >
      <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={cellPx - 4}>
        <ItemIcon rot={item.rot}>
          <Icon />
        </ItemIcon>
      </RarityFrame>
    </div>
  );
}
