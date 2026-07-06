// Bag item view + useDraggable handle. Drag activation, pointercancel,
// and window-blur cleanup are owned by @dnd-kit's PointerSensor; the
// DndContext at the RunScreen level dispatches into the run reducer.

import { useCallback, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { ICONS } from '../icons/icons';
import { ITEMS } from '../run/content';
import { ItemInfoPopover } from '../items/ItemInfoPopover';
import { useItemInfoTrigger } from '../items/useItemInfoTrigger';
import type { BagItem } from '../run/types';
import { useCellSize } from './CellSize';
import { dimsOf } from './layout';
import type { DraggableData } from './types';

interface DraggableItemProps {
  item: BagItem;
  disabled?: boolean;
  /**
   * Opt in to the tap/click item-info popover (CF 57). Defaults to `false`
   * (fail-closed): a future reuse of this component for opponent items — e.g.
   * the unbuilt post-combat "view opponent build" (gdd.md § 14) — that forgets
   * to set it silently gets NO popover rather than leaking the player-only
   * inspector onto the opponent's bag.
   */
  enableInfoPopover?: boolean;
}

export function DraggableItem({
  item,
  disabled = false,
  enableInfoPopover = false,
}: DraggableItemProps) {
  const cellSize = useCellSize();
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

  // Suppress the popover while the bag is disabled (combat active — the bag is
  // dimmed and the CombatOverlay owns the screen).
  const infoEnabled = enableInfoPopover && !disabled;
  const info = useItemInfoTrigger(infoEnabled);
  // Merge @dnd-kit's node ref with our own so the popover can anchor to (and
  // return focus to) the same element the drag handle uses.
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      nodeRef.current = node;
    },
    [setNodeRef],
  );

  return (
    <>
      <div
        ref={setRefs}
        {...attributes}
        {...listeners}
        {...info.handlers}
        // Bag items are icon-only, so give the popover trigger an accessible
        // name (shop slots already render the name as text). Codex Phase 2.5 F2.
        aria-label={enableInfoPopover ? def.name : undefined}
        className={infoEnabled ? 'absolute ease-snap focus-ring' : 'absolute ease-snap'}
        style={{
          left: item.col * cellSize + 2,
          top: item.row * cellSize + 2,
          width: dims.w * cellSize - 4,
          height: dims.h * cellSize - 4,
          opacity: isDragging ? 0.25 : 1,
          cursor: disabled ? 'default' : isDragging ? 'grabbing' : 'grab',
          // 120ms drop-settle per visual-direction.md § 7 ("placement
          // settles in 120ms"). Was 160ms in the M0/M1.3.1 prototype.
          transition:
            'left 120ms cubic-bezier(0.16, 1, 0.3, 1), top 120ms cubic-bezier(0.16, 1, 0.3, 1), opacity 120ms',
          touchAction: 'none',
        }}
      >
        <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={cellSize - 4}>
          <ItemIcon rot={item.rot}>
            <Icon />
          </ItemIcon>
        </RarityFrame>
      </div>
      {enableInfoPopover && (
        <ItemInfoPopover
          itemId={item.itemId}
          open={info.open}
          onClose={info.close}
          anchorRef={nodeRef}
        />
      )}
    </>
  );
}
