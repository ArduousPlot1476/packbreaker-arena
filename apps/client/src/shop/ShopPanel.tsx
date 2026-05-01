// Right-side shop panel: 5 slots + reroll button + sell zone + Continue
// CTA. As of commit 6, the sell zone is a @dnd-kit useDroppable; pickup
// from shop is via useDraggable on each ShopSlot. Buy/sell handlers are
// wired through the DndContext at the RunScreen level — this component
// no longer threads drag/sellHover state.

import { useDroppable } from '@dnd-kit/core';
import { type RunState, type ShopSlot as ShopSlotData } from '../data.local';
import type { DroppableData } from '../bag/types';
import { ShopSlot } from './ShopSlot';

interface ShopPanelProps {
  state: RunState;
  shop: ShopSlotData[];
  onReroll: () => void;
  onContinue: () => void;
  busy: boolean;
}

function SellZone() {
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

export function ShopPanel({ state, shop, onReroll, onContinue, busy }: ShopPanelProps) {
  const rerollCost = state.rerollCount + 1;
  const canReroll = state.gold >= rerollCost && !busy;

  return (
    <div
      className="flex flex-col"
      style={{
        width: 260,
        background: 'var(--bg-mid)',
        borderLeft: '1px solid var(--border-default)',
        padding: 14,
        gap: 14,
      }}
    >
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="label-cap" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            SHOP
          </div>
          <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            R{state.rerollCount} REROLLS
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {shop.map((s) => (
            <ShopSlot key={s.uid} slot={s} gold={state.gold} busy={busy} />
          ))}
        </div>
        <button
          onClick={onReroll}
          disabled={!canReroll}
          className="ease-snap label-cap mt-2 flex items-center justify-center gap-2"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 6,
            background: canReroll ? 'var(--surface-elev)' : 'var(--surface)',
            border: '1px solid var(--border-default)',
            color: canReroll ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: canReroll ? 'pointer' : 'not-allowed',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <span>REROLL</span>
          <span className="tnum" style={{ color: canReroll ? 'var(--coin-fill)' : 'var(--text-muted)' }}>
            {rerollCost}
            <span style={{ marginLeft: 2, fontSize: 9 }}>g</span>
          </span>
        </button>
      </div>

      <SellZone />

      <button
        onClick={onContinue}
        disabled={busy}
        className="ease-snap label-cap"
        style={{
          marginTop: 'auto',
          width: '100%',
          padding: '14px 16px',
          borderRadius: 6,
          background: busy ? 'var(--surface)' : 'var(--accent)',
          color: 'var(--text-primary)',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '0.1em',
          border: 'none',
          cursor: busy ? 'not-allowed' : 'pointer',
          boxShadow: busy ? 'none' : '0 6px 16px rgba(59,130,246,0.32)',
        }}
      >
        CONTINUE →
      </button>
    </div>
  );
}
