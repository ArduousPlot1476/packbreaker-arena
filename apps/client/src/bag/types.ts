// Drag state shared between BagBoard, DraggableItem, RunScreen, and the
// shop ShopPanel. Encapsulates a pickup-from-bag or pickup-from-shop
// transient drag.

import type { ItemId } from '../data.local'

export interface DragState {
  itemId: ItemId
  rot: number
  x: number
  y: number
  offX: number
  offY: number
  fromBagUid?: string
  fromShopUid?: string
  cost?: number
}
