// Right-side shop panel: 5 slots + reroll button + sell zone + Continue CTA.
// (Formerly RightRail in the App.tsx prototype monolith.)

import { type RunState, type ShopSlot as ShopSlotData } from '../data.local';
import type { DragState } from '../bag/types';
import { ShopSlot } from './ShopSlot';

interface ShopPanelProps {
  state: RunState;
  shop: ShopSlotData[];
  onBuy: (uid: string) => void;
  onReroll: () => void;
  onSellDropZone: () => void;
  drag: DragState | null;
  sellHover: boolean;
  setSellHover: (b: boolean) => void;
  onContinue: () => void;
  busy: boolean;
}

export function ShopPanel({
  state,
  shop,
  onBuy,
  onReroll,
  onSellDropZone,
  drag,
  sellHover,
  setSellHover,
  onContinue,
  busy,
}: ShopPanelProps) {
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
            <ShopSlot
              key={s.uid}
              slot={s}
              gold={state.gold}
              onBuy={() => onBuy(s.uid)}
              busy={busy}
            />
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

      <div
        onPointerEnter={() => drag && setSellHover(true)}
        onPointerLeave={() => setSellHover(false)}
        onPointerUp={() => {
          if (drag) onSellDropZone();
        }}
        className="ease-snap"
        style={{
          padding: 12,
          borderRadius: 6,
          background: sellHover ? 'rgba(239,68,68,0.16)' : 'var(--surface)',
          border: `2px dashed ${sellHover ? '#EF4444' : 'var(--border-default)'}`,
          textAlign: 'center',
        }}
      >
        <div
          className="label-cap"
          style={{ fontSize: 10, color: sellHover ? '#F87171' : 'var(--text-secondary)' }}
        >
          SELL · 50% RECOVERY
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          drop a bag item here
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={busy}
        className="ease-snap label-cap"
        style={{
          marginTop: 'auto',
          width: '100%',
          padding: '14px 16px',
          borderRadius: 6,
          background: busy ? 'var(--surface)' : '#3B82F6',
          color: '#FFFFFF',
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
