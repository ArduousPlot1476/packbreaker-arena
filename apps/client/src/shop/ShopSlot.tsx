// Single shop slot. Renders a SOLD placeholder when the slot has no item;
// otherwise renders the buyable item card. As of commit 6 the card is a
// useDraggable — pickup happens by drag-and-drop into the bag, replacing
// the prototype's click-to-grab pattern. Drag is disabled when the
// player can't afford or combat is in progress.

import { useCallback, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { RARITY } from '@packbreaker/ui-kit';
import { ITEMS } from '../run/content';
import { ItemInfoPopover } from '../items/ItemInfoPopover';
import { useItemInfoTrigger } from '../items/useItemInfoTrigger';
import type { ShopSlot as ShopSlotData } from '../run/types';
import type { DraggableData } from '../bag/types';
import { CoinGlyph, ICONS } from '../icons/icons';

interface ShopSlotProps {
  slot: ShopSlotData;
  gold: number;
  busy: boolean;
  /**
   * Card width. Default 110 matches the desktop ShopPanel column. Mobile
   * ShopTab passes a wider value (or '100%') so slots fill the larger
   * mobile grid column.
   */
  cardWidth?: number | string;
  /**
   * Opt in to the tap/click item-info popover (CF 57). Defaults to `false`
   * (fail-closed): a component reused without opting in gets no popover. The
   * popover is intentionally allowed even when the slot is unaffordable
   * (inspect-before-buy); the SOLD placeholder never gets one.
   */
  enableInfoPopover?: boolean;
}

export function ShopSlot({
  slot,
  gold,
  busy,
  cardWidth = 110,
  enableInfoPopover = false,
}: ShopSlotProps) {
  // All hooks are called unconditionally, before the SOLD early return.
  // Gate the popover off during combat (busy), mirroring the bag's `!disabled`
  // gate — otherwise a shop popover could open + focus-trap behind CombatOverlay
  // (Codex Phase 2.5 F3). Affordability is a SEPARATE gate (below): an
  // unaffordable-but-not-busy slot stays inspectable.
  const infoEnabled = enableInfoPopover && slot.itemId != null && !busy;
  const info = useItemInfoTrigger(infoEnabled);
  const nodeRef = useRef<HTMLDivElement | null>(null);
  // slot.cost is sim's effective (ruleset-aware) price — the value sim.buyItem
  // actually charges — so the displayed price and affordability gate match what
  // gets deducted (B1, CF 34 / M1.5e PR 1). Was def.cost (raw item cost).
  const affordable = slot.itemId != null && gold >= slot.cost && !busy;
  const data: DraggableData = { kind: 'shop', uid: slot.uid };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `shop:${slot.uid}`,
    data,
    disabled: !affordable,
  });
  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      nodeRef.current = node;
    },
    [setNodeRef],
  );

  if (!slot.itemId) {
    return (
      <div
        style={{
          width: cardWidth,
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
  const Icon = ICONS[def.id] ?? ICONS['copper-coin'];

  return (
    <>
      <div
        ref={setRefs}
        {...attributes}
        {...listeners}
        {...info.handlers}
        // When the info popover is operable the control is NOT disabled, even if
        // it's un-draggable because unaffordable — otherwise dnd-kit's
        // aria-disabled="true" (from disabled:!affordable) would announce this
        // still-operable inspect trigger as disabled and hide the
        // inspect-before-buy path from AT users (Codex Phase 2.5 F4). During
        // combat infoEnabled is false, so dnd's aria-disabled passes through.
        aria-disabled={infoEnabled ? undefined : attributes['aria-disabled']}
        className={
          infoEnabled ? 'ease-snap text-left relative focus-ring' : 'ease-snap text-left relative'
        }
        style={{
        width: cardWidth,
        padding: 8,
        borderRadius: 6,
        background: 'var(--surface)',
        border: '1px solid var(--border-default)',
        opacity: isDragging ? 0.45 : affordable ? 1 : 0.55,
        cursor: affordable ? (isDragging ? 'grabbing' : 'grab') : 'not-allowed',
        // 120ms snappy ease per visual-direction.md § 7. Was 140ms in M1.3.1.
        transition: 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1), background 120ms, opacity 120ms',
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
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--coin-fill)' }}>{slot.cost}</span>
        </div>
      </div>
      </div>
      {enableInfoPopover && (
        <ItemInfoPopover
          itemId={slot.itemId}
          open={info.open}
          onClose={info.close}
          anchorRef={nodeRef}
        />
      )}
    </>
  );
}
