// Single shop slot. Renders a SOLD placeholder when the slot has no item;
// otherwise renders the buyable item card. As of commit 6 the card is a
// useDraggable — pickup happens by drag-and-drop into the bag, replacing
// the prototype's click-to-grab pattern. Drag is disabled when the
// player can't afford or combat is in progress.

import { useDraggable } from '@dnd-kit/core';
import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { ITEMS, RARITY, type ShopSlot as ShopSlotData } from '../data.local';
import type { DraggableData } from '../bag/types';
import { CoinGlyph, ICONS } from '../icons/icons';

interface ShopSlotProps {
  slot: ShopSlotData;
  gold: number;
  busy: boolean;
}

export function ShopSlot({ slot, gold, busy }: ShopSlotProps) {
  if (!slot.itemId) {
    return (
      <div
        style={{
          height: 120,
          borderRadius: 6,
          border: '1px dashed var(--border-default)',
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          SOLD
        </span>
      </div>
    );
  }
  const def = ITEMS[slot.itemId];
  const r = RARITY[def.rarity];
  const affordable = gold >= def.cost && !busy;
  const cardWidth = 110;
  const Icon = ICONS[def.id] ?? ICONS['copper-coin'];

  const data: DraggableData = { kind: 'shop', uid: slot.uid };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `shop:${slot.uid}`,
    data,
    disabled: !affordable,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="ease-snap text-left relative"
      style={{
        width: cardWidth,
        padding: 8,
        borderRadius: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border-default)',
        opacity: isDragging ? 0.45 : affordable ? 1 : 0.55,
        cursor: affordable ? (isDragging ? 'grabbing' : 'grab') : 'not-allowed',
        transition: 'transform 140ms cubic-bezier(0.16, 1, 0.3, 1), background 140ms, opacity 120ms',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div className="flex items-center justify-center mb-2">
        <RarityFrame rarity={def.rarity} w={def.w} h={def.h} size={42}>
          <ItemIcon>
            <Icon />
          </ItemIcon>
        </RarityFrame>
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.15 }}>
          {def.name}
        </div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="label-cap tnum" style={{ fontSize: 9, color: r.color }}>
          <span style={{ marginRight: 3 }}>{r.gem}</span>
          {r.label}
        </div>
        <div className="flex items-center gap-1 tnum">
          <div style={{ width: 12, height: 12 }}>
            <CoinGlyph />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--coin-fill)' }}>{def.cost}</span>
        </div>
      </div>
    </div>
  );
}
