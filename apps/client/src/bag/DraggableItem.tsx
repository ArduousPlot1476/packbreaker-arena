// Bag item view. CF 57 structural split: the outer <div> is the pure dnd-kit
// drag node (pointer/touch listeners + transform only — no popover/interactive
// ARIA), and, when the info popover is enabled, an inner <button> is the single
// interactive element that owns the inspect popover (name, aria-haspopup,
// keyboard, focus). dnd-kit's `attributes` (role="button"/tabIndex/
// aria-roledescription/aria-describedby) are intentionally NOT spread: they exist
// for KeyboardSensor dragging, which this app does not configure (PointerSensor
// /TouchSensor only), and spreading them would nest role="button" around the
// inner button. A pointerdown on the inner button still bubbles to the outer
// drag listeners, so dragging works from anywhere on the item.

import { useEffect, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { ICONS } from '../icons/icons';
import { ITEMS } from '../run/content';
import { ItemInfoPopover } from '../items/ItemInfoPopover';
import { INSPECT_TRIGGER_STYLE, useItemInfoTrigger } from '../items/useItemInfoTrigger';
import type { RevealRow } from '../run/adjacencyReveal';
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
   * to set it silently gets NO inspect button rather than leaking the
   * player-only inspector onto the opponent's bag.
   */
  enableInfoPopover?: boolean;
  /**
   * Adjacency reveal rows for this item (CF-89 PR-A), forwarded to
   * ItemInfoPopover. Omitted (the default, and every ungated mount) = the
   * popover renders its plain CF 57 shape.
   */
  adjacencyRows?: ReadonlyArray<RevealRow>;
  /** Popover presentation; the mobile run screen threads 'sheet'. */
  revealPresentation?: 'anchored' | 'sheet';
  /**
   * Open/close notifications for the inspect popover, keyed by this item's
   * uid — BagBoard uses it to render affected-cell chips for the OPEN reveal
   * (reveal-on-intent). Absent on ungated mounts.
   */
  onInfoOpenChange?: (uid: string, open: boolean) => void;
}

export function DraggableItem({
  item,
  disabled = false,
  enableInfoPopover = false,
  adjacencyRows,
  revealPresentation,
  onInfoOpenChange,
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
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: `bag:${item.uid}`,
    data,
    disabled,
  });

  // Inspect is available while the bag isn't disabled (combat dims + disables it).
  const infoEnabled = enableInfoPopover && !disabled;
  const info = useItemInfoTrigger(infoEnabled);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Chip coordination (CF-89 PR-A): report open/close so BagBoard can render
  // affected-cell chips for the open reveal. Cleanup signals close on unmount
  // (e.g. the item is sold/combined while its popover is up).
  const infoOpen = info.open;
  useEffect(() => {
    if (!onInfoOpenChange) return;
    onInfoOpenChange(item.uid, infoOpen);
    return () => {
      if (infoOpen) onInfoOpenChange(item.uid, false);
    };
  }, [infoOpen, item.uid, onInfoOpenChange]);

  const visual = (
    <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={cellSize - 4}>
      <ItemIcon rot={item.rot}>
        <Icon />
      </ItemIcon>
    </RarityFrame>
  );

  return (
    <>
      <div
        ref={setNodeRef}
        {...listeners}
        className="absolute ease-snap"
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
        {enableInfoPopover ? (
          <button
            ref={triggerRef}
            type="button"
            {...info.handlers}
            aria-label={def.name}
            // Out of the tab order (but still programmatically focusable for
            // focus-return) while the popover is disabled during combat.
            tabIndex={infoEnabled ? undefined : -1}
            className="focus-ring"
            style={INSPECT_TRIGGER_STYLE}
          >
            {visual}
          </button>
        ) : (
          visual
        )}
      </div>
      {enableInfoPopover && (
        <ItemInfoPopover
          itemId={item.itemId}
          open={info.open}
          onClose={info.close}
          anchorRef={triggerRef}
          adjacencyRows={adjacencyRows}
          presentation={revealPresentation}
        />
      )}
    </>
  );
}
