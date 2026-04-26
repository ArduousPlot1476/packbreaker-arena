// Parts — small reusable bits: RarityFrame, ItemTile, ShopCard.
// Body color rule: never use a different rarity's frame color for the body.

import type { ReactNode } from 'react';
import { ITEMS, RARITY, type ItemId, type RarityKey, type ShopSlot } from './data';
import { CoinGlyph, ICONS } from './icons';

export const cellPx = 88; // bag cell size — gives a 6*88 = 528 wide, 4*88 = 352 tall content area

interface RarityFrameProps {
  rarity: RarityKey;
  children: ReactNode;
  w?: number;
  h?: number;
  size?: number;
  dim?: boolean;
}

export function RarityFrame({ rarity, children, w = 1, h = 1, size = cellPx, dim = false }: RarityFrameProps) {
  const r = RARITY[rarity];
  const totalW = w * size;
  const totalH = h * size;
  return (
    <div
      className="relative ease-snap"
      style={{
        width: totalW,
        height: totalH,
        border: `2px solid ${r.color}`,
        borderRadius: 6,
        background: 'var(--surface)',
        boxShadow: `inset 0 0 14px ${r.color}22`,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div
        className="absolute tnum no-select"
        style={{
          top: 2,
          right: 4,
          fontSize: 12,
          lineHeight: 1,
          color: r.color,
          fontWeight: 700,
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}
      >
        {r.gem}
      </div>
      <div className="absolute inset-0" style={{ padding: 6 }}>
        {children}
      </div>
    </div>
  );
}

interface ItemIconProps {
  itemId: ItemId;
  rot?: number;
  scale?: number;
}

export function ItemIcon({ itemId, rot = 0, scale = 1 }: ItemIconProps) {
  const Icon = ICONS[itemId] ?? ICONS['copper-coin'];
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        transform: `rotate(${rot}deg) scale(${scale})`,
        transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <Icon />
    </div>
  );
}

interface ShopCardProps {
  item: ShopSlot;
  sold?: boolean;
  gold: number;
  onBuy: () => void;
  busy: boolean;
}

export function ShopCard({ item, sold = false, gold, onBuy, busy }: ShopCardProps) {
  if (!item.itemId) return null;
  const def = ITEMS[item.itemId];
  const r = RARITY[def.rarity];
  const affordable = gold >= def.cost && !sold && !busy;
  const cardWidth = 110;

  return (
    <button
      type="button"
      disabled={!affordable}
      onClick={onBuy}
      className="ease-snap text-left relative"
      style={{
        width: cardWidth,
        padding: 8,
        borderRadius: 6,
        background: sold ? 'transparent' : 'var(--surface)',
        border: `1px solid ${sold ? 'transparent' : 'var(--border-default)'}`,
        opacity: sold ? 0.25 : affordable ? 1 : 0.55,
        cursor: affordable ? 'pointer' : 'not-allowed',
        transition: 'transform 140ms cubic-bezier(0.16, 1, 0.3, 1), background 140ms',
      }}
      onMouseEnter={(e) => {
        if (affordable) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-elev)';
      }}
      onMouseLeave={(e) => {
        if (affordable) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)';
      }}
    >
      {sold && (
        <div className="absolute inset-0 flex items-center justify-center label-cap" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          SOLD
        </div>
      )}
      {!sold && (
        <>
          <div className="flex items-center justify-center mb-2">
            <RarityFrame rarity={def.rarity} w={def.w} h={def.h} size={42}>
              <ItemIcon itemId={def.id} />
            </RarityFrame>
          </div>
          <div className="flex items-baseline justify-between gap-1">
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.15 }}>{def.name}</div>
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
        </>
      )}
    </button>
  );
}
