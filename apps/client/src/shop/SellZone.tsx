// Sell drop zone — useDroppable target that lights up when a bag item
// is dragged over. Extracted from ShopPanel.tsx in M1.3.3 commit 5 for
// shared use between desktop ShopPanel and mobile ShopTab.

import { useDroppable } from '@dnd-kit/core';
import type { DroppableData } from '../bag/types';

export function SellZone() {
  const data: DroppableData = { kind: 'sell' };
  const { setNodeRef, isOver } = useDroppable({ id: 'sell-zone', data });
  return (
    <div
      ref={setNodeRef}
      className="ease-snap"
      style={{
        padding: 12,
        borderRadius: 6,
        background: isOver ? 'rgba(239,68,68,0.16)' : 'var(--surface)',
        border: `2px dashed ${isOver ? 'var(--life-red)' : 'var(--border-default)'}`,
        textAlign: 'center',
      }}
    >
      <div
        className="label-cap"
        style={{ fontSize: 10, color: isOver ? 'var(--life-stroke)' : 'var(--text-secondary)' }}
      >
        SELL · 50% RECOVERY
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
        drop a bag item here
      </div>
    </div>
  );
}
