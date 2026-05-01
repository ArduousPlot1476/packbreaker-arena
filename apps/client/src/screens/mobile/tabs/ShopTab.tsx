// Mobile [Shop] tab content. 5 shop slots in a 2-col grid + REROLL
// header + SellZone footer. Continue CTA is the always-visible
// full-width bar handled by MobileContinueCTA (commit 6), not a
// per-tab element.
//
// Per Trey's decision-7 ratification: REROLL lives in the [Shop] tab
// header. User can tap Continue from any tab without first switching
// to [Shop].

import type { RunState, ShopSlot as ShopSlotData } from '../../../data.local';
import { CoinGlyph } from '../../../icons/icons';
import { SellZone } from '../../../shop/SellZone';
import { ShopSlot } from '../../../shop/ShopSlot';

interface ShopTabProps {
  state: RunState;
  shop: ShopSlotData[];
  onReroll: () => void;
  busy: boolean;
}

export function ShopTab({ state, shop, onReroll, busy }: ShopTabProps) {
  const rerollCost = state.rerollCount + 1;
  const canReroll = state.gold >= rerollCost && !busy;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: 12,
        overflow: 'auto',
        background: 'var(--bg-deep)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <div className="label-cap" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            SHOP
          </div>
          <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            R{state.rerollCount} REROLLS
          </div>
        </div>
        <button
          type="button"
          onClick={onReroll}
          disabled={!canReroll}
          className="ease-snap hover-lift label-cap flex items-center justify-center gap-2"
          style={{
            minHeight: 44,
            padding: '8px 14px',
            borderRadius: 6,
            background: canReroll ? 'var(--surface-elev)' : 'var(--surface)',
            border: '1px solid var(--border-default)',
            color: canReroll ? 'var(--text-primary)' : 'var(--text-muted)',
            cursor: canReroll ? 'pointer' : 'not-allowed',
            fontSize: 11,
            fontWeight: 600,
            touchAction: 'manipulation',
          }}
        >
          <span>REROLL</span>
          <span
            className="tnum flex items-center gap-1"
            style={{ color: canReroll ? 'var(--coin-fill)' : 'var(--text-muted)' }}
          >
            <span style={{ width: 12, height: 12, display: 'inline-block' }}>
              <CoinGlyph />
            </span>
            {rerollCost}
          </span>
        </button>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}
      >
        {shop.map((s) => (
          <ShopSlot key={s.uid} slot={s} gold={state.gold} busy={busy} cardWidth="100%" />
        ))}
      </div>

      <SellZone />
    </div>
  );
}
