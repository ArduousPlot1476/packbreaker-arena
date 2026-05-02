// Drag state shared between BagBoard, ShopSlot, RunScreen. With @dnd-kit
// (commit 6 onward) DragOverlay handles cursor-tracking positioning, so
// x/y/offX/offY fields from the prototype's pointer-event drag are no
// longer needed.

import type { ItemId } from '../run/types';

export interface DragState {
  itemId: ItemId;
  rot: number;
  fromBagUid?: string;
  fromShopUid?: string;
  cost?: number;
}

// Discriminated union for @dnd-kit's `data` payload on draggables and
// droppables. Keeps the handlers in useRun type-safe.
export type DraggableData =
  | { kind: 'bag'; uid: string; itemId: ItemId; rot: number }
  | { kind: 'shop'; uid: string };

export type DroppableData =
  | { kind: 'cell'; col: number; row: number }
  | { kind: 'sell' };
