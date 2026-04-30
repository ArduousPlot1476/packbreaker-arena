// App — composes the entire run screen.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BAG_COLS,
  BAG_ROWS,
  cellsOf,
  dimsOf,
  INITIAL,
  ITEMS,
  SEED_BAG,
  SEED_SHOP,
  type BagItem,
  type Cell,
  type ItemId,
  type RunState,
  type ShopSlot,
} from './data.local';
import { CoinGlyph, GhostGlyph, HeartGlyph, ICONS, RelicLoop, TinkerGlyph } from './icons';
import { ItemIcon, RarityFrame, ShopCard } from './parts';
import { CombatOverlay } from './combat';
import { detectRecipes, type RecipeMatch } from './run/recipes';
import { BagBoard } from './bag/BagBoard';
import { cellPx, placementValid } from './bag/layout';
import type { DragState } from './bag/types';

const CELL = cellPx;

function TopBar({ state }: { state: RunState }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ height: 48, padding: '0 20px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-mid)' }}
    >
      <div className="flex items-center gap-6">
        <div className="heading-tight" style={{ fontSize: 14, letterSpacing: '0.06em' }}>
          PACKBREAKER<span style={{ color: 'var(--text-muted)' }}> · ARENA</span>
        </div>
        <div className="flex items-center gap-2 tnum">
          <div style={{ width: 18, height: 18 }}>
            <CoinGlyph />
          </div>
          <span className="heading-tight" style={{ fontSize: 18, color: 'var(--coin-fill)' }}>
            {state.gold}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: state.maxHearts }).map((_, i) => (
            <div key={i} style={{ width: 18, height: 18 }}>
              <HeartGlyph filled={i < state.hearts} />
            </div>
          ))}
        </div>
        <div className="tnum" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          ROUND <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{state.round}</span>
          <span style={{ color: 'var(--text-muted)' }}> / {state.totalRounds}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="label-cap" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          CONTRACT
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{state.contractName}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>·</span>
          <span style={{ marginLeft: 8 }}>{state.contractText}</span>
        </span>
        <div className="tnum" style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 12 }}>
          ◆ <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{state.trophy}</span>
        </div>
      </div>
    </div>
  );
}

function OpponentSilhouettes() {
  const Sword = ICONS['iron-sword'];
  const Shield = ICONS['wooden-shield'];
  return (
    <div className="flex gap-2">
      <div style={{ width: 32, height: 32, background: 'var(--bg-deep)', borderRadius: 4, padding: 4 }}>
        <div style={{ filter: 'brightness(0) invert(0.6)' }}>
          <Sword />
        </div>
      </div>
      <div style={{ width: 32, height: 32, background: 'var(--bg-deep)', borderRadius: 4, padding: 4 }}>
        <div style={{ filter: 'brightness(0) invert(0.6)' }}>
          <Shield />
        </div>
      </div>
    </div>
  );
}

function LeftRail() {
  return (
    <div
      className="flex flex-col"
      style={{
        width: 180,
        background: 'var(--bg-mid)',
        borderRight: '1px solid var(--border-default)',
        padding: 14,
        gap: 14,
      }}
    >
      <div>
        <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
          CLASS
        </div>
        <div
          className="flex items-center gap-2"
          style={{ background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid var(--border-default)' }}
        >
          <div style={{ width: 26, height: 26 }}>
            <TinkerGlyph />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Tinker</div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>+10% recipe potency</div>
          </div>
        </div>
      </div>

      <div>
        <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
          RELICS
        </div>
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center gap-2"
            style={{ background: 'var(--surface)', padding: 8, borderRadius: 6, border: '1px solid #3B82F6' }}
          >
            <div style={{ width: 22, height: 22 }}>
              <RelicLoop />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Apprentice's Loop</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>+1 reroll / round</div>
            </div>
          </div>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{ height: 38, borderRadius: 6, border: '1px dashed var(--border-default)', background: 'transparent' }}
            >
              <span className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                EMPTY
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
          OPPONENT INTENT
        </div>
        <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div style={{ width: 28, height: 28 }}>
              <GhostGlyph />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Ghost</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Round 4 · ±1 trophy</div>
            </div>
          </div>
          <div className="label-cap" style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 4 }}>
            SILHOUETTES
          </div>
          <OpponentSilhouettes />
        </div>
      </div>
    </div>
  );
}

function DragGhost({ drag }: { drag: DragState | null }) {
  if (!drag) return null;
  const def = ITEMS[drag.itemId];
  const dims = dimsOf(drag.itemId, drag.rot);
  return (
    <div
      className="fixed pointer-events-none"
      style={{
        left: drag.x - drag.offX,
        top: drag.y - drag.offY,
        width: dims.w * CELL - 4,
        height: dims.h * CELL - 4,
        zIndex: 200,
        opacity: 0.92,
        filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.55))',
      }}
    >
      <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={CELL - 4}>
        <ItemIcon itemId={drag.itemId} rot={drag.rot} />
      </RarityFrame>
    </div>
  );
}

interface RightRailProps {
  state: RunState;
  shop: ShopSlot[];
  onBuy: (uid: string) => void;
  onReroll: () => void;
  onSellDropZone: () => void;
  drag: DragState | null;
  sellHover: boolean;
  setSellHover: (b: boolean) => void;
  onContinue: () => void;
  busy: boolean;
}

function RightRail({ state, shop, onBuy, onReroll, onSellDropZone, drag, sellHover, setSellHover, onContinue, busy }: RightRailProps) {
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
            <ShopSlotView key={s.uid} slot={s} state={state} onBuy={() => onBuy(s.uid)} busy={busy} />
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
        <div className="label-cap" style={{ fontSize: 10, color: sellHover ? '#F87171' : 'var(--text-secondary)' }}>
          SELL · 50% RECOVERY
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>drop a bag item here</div>
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

function ShopSlotView({ slot, state, onBuy, busy }: { slot: ShopSlot; state: RunState; onBuy: () => void; busy: boolean }) {
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
  return <ShopCard item={slot} sold={false} gold={state.gold} onBuy={onBuy} busy={busy} />;
}

function BottomLog() {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        height: 32,
        padding: '0 18px',
        background: 'var(--bg-mid)',
        borderTop: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          LOG
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          R3 · won vs ghost (Marauder) · 6 dmg dealt · 3 dmg taken
        </span>
      </div>
      <span className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer' }}>
        EXPAND ↑
      </span>
    </div>
  );
}

const REROLL_POOL: ItemId[] = [
  'iron-sword',
  'iron-dagger',
  'wooden-shield',
  'healing-herb',
  'spark-stone',
  'whetstone',
  'apple',
  'copper-coin',
  'healing-salve',
  'fire-oil',
];

export function App() {
  const [bag, setBag] = useState<BagItem[]>(SEED_BAG);
  const [shop, setShop] = useState<ShopSlot[]>(SEED_SHOP);
  const [state, setState] = useState<RunState>(INITIAL);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);
  const [sellHover, setSellHover] = useState(false);
  const [combatActive, setCombatActive] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const recipes = useMemo(() => detectRecipes(bag), [bag]);

  useEffect(() => {
    function move(e: PointerEvent) {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      const d = dragRef.current;
      if (!d) return;
      setDrag((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null));
    }
    function cancel() {
      if (dragRef.current) {
        setDrag(null);
        setHover(null);
        setSellHover(false);
      }
    }
    function key(e: KeyboardEvent) {
      if (e.key && e.key.toLowerCase() === 'r') {
        const d = dragRef.current;
        if (!d) return;
        // Square items have rotation-invariant footprints — R is a no-op.
        const def = ITEMS[d.itemId];
        if (def.w === def.h) return;
        setDrag((prev) => (prev ? { ...prev, rot: (prev.rot + 90) % 360 } : null));
      }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
    };
  }, []);

  function onPickUpBag(e: React.PointerEvent<HTMLDivElement>, item: BagItem) {
    if (combatActive) return;
    const target = e.currentTarget;
    const r = target.getBoundingClientRect();
    setDrag({
      itemId: item.itemId,
      rot: item.rot,
      x: e.clientX,
      y: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
      fromBagUid: item.uid,
    });
  }

  function onBuyShop(uid: string) {
    if (combatActive) return;
    const slot = shop.find((s) => s.uid === uid);
    if (!slot || !slot.itemId) return;
    const def = ITEMS[slot.itemId];
    if (state.gold < def.cost) return;
    const { x, y } = lastPointerRef.current;
    setDrag({
      itemId: slot.itemId,
      rot: 0,
      x,
      y,
      offX: CELL / 2,
      offY: CELL / 2,
      fromShopUid: uid,
      cost: def.cost,
    });
  }

  function onDropBag(col: number, row: number) {
    if (!drag) return;
    const ok = placementValid(bag, drag.itemId, col, row, drag.rot, drag.fromBagUid ?? null);
    if (!ok) {
      setDrag(null);
      setHover(null);
      return;
    }
    if (drag.fromBagUid) {
      const fromUid = drag.fromBagUid;
      setBag((b) => b.map((x) => (x.uid === fromUid ? { ...x, col, row, rot: drag.rot } : x)));
    } else if (drag.fromShopUid) {
      const fromShop = drag.fromShopUid;
      const cost = drag.cost ?? 0;
      const newUid = 'b' + Date.now().toString(36);
      setBag((b) => [...b, { uid: newUid, itemId: drag.itemId, col, row, rot: drag.rot }]);
      setShop((s) => s.map((slot) => (slot.uid === fromShop ? { ...slot, itemId: null } : slot)));
      setState((s) => ({ ...s, gold: s.gold - cost }));
    }
    setDrag(null);
    setHover(null);
  }

  function onSellDropZone() {
    if (!drag || !drag.fromBagUid) {
      setDrag(null);
      setSellHover(false);
      return;
    }
    const fromUid = drag.fromBagUid;
    const item = bag.find((b) => b.uid === fromUid);
    if (!item) {
      setDrag(null);
      setSellHover(false);
      return;
    }
    const def = ITEMS[item.itemId];
    const refund = Math.floor(def.cost * 0.5);
    setBag((b) => b.filter((x) => x.uid !== fromUid));
    setState((s) => ({ ...s, gold: s.gold + refund }));
    setDrag(null);
    setSellHover(false);
    setHover(null);
  }

  function onReroll() {
    const cost = state.rerollCount + 1;
    if (state.gold < cost) return;
    const newSlots: ShopSlot[] = SEED_SHOP.map((_s, i) => {
      const id = REROLL_POOL[(state.rerollCount * 2 + i + 3) % REROLL_POOL.length];
      return { uid: 's' + Date.now().toString(36) + i, itemId: id };
    });
    setShop(newSlots);
    setState((s) => ({ ...s, gold: s.gold - cost, rerollCount: s.rerollCount + 1 }));
  }

  function onCombine(match: RecipeMatch) {
    const inputs = match.uids
      .map((uid) => bag.find((b) => b.uid === uid))
      .filter((x): x is BagItem => Boolean(x));
    const cells = inputs.flatMap((b) => cellsOf(b));
    const minX = Math.min(...cells.map((c) => c[0]));
    const minY = Math.min(...cells.map((c) => c[1]));
    const outDef = ITEMS[match.recipe.output];
    const newBagBase = bag.filter((b) => !match.uids.includes(b.uid));
    let placed: { col: number; row: number; rot: number } | null = null;
    const tryCells: Cell[] = [[minX, minY], ...cells];
    for (const [tx, ty] of tryCells) {
      for (const rot of [0, 90, 180, 270]) {
        if (placementValid(newBagBase, outDef.id, tx, ty, rot, null)) {
          placed = { col: tx, row: ty, rot };
          break;
        }
      }
      if (placed) break;
    }
    if (!placed) {
      outer: for (let y = 0; y < BAG_ROWS; y++) {
        for (let x = 0; x < BAG_COLS; x++) {
          for (const rot of [0, 90, 180, 270]) {
            if (placementValid(newBagBase, outDef.id, x, y, rot, null)) {
              placed = { col: x, row: y, rot };
              break outer;
            }
          }
        }
      }
    }
    if (!placed) return;
    const newUid = 'b' + Date.now().toString(36);
    setBag([...newBagBase, { uid: newUid, itemId: outDef.id, ...placed }]);
  }

  function onContinue() {
    if (combatActive) return;
    setCombatActive(true);
  }

  function onCombatDone() {
    setCombatActive(false);
    setState((s) => ({ ...s, gold: s.gold + 1, trophy: s.trophy + 18, round: s.round + 1, rerollCount: 0 }));
  }

  return (
    <div className="flex flex-col" style={{ width: 1280, height: 720, margin: '0 auto', position: 'relative' }}>
      <TopBar state={state} />
      <div className="flex flex-1 relative" style={{ minHeight: 0 }}>
        <LeftRail />
        <div className="flex-1 flex items-center justify-center relative" style={{ background: 'var(--bg-deep)' }}>
          <BagBoard
            bag={bag}
            drag={drag}
            hover={hover}
            setHover={setHover}
            onDrop={onDropBag}
            onPickUp={onPickUpBag}
            dimmed={combatActive}
            recipeMatches={recipes}
            onCombine={onCombine}
          />
        </div>
        <RightRail
          state={state}
          shop={shop}
          onBuy={onBuyShop}
          onReroll={onReroll}
          onSellDropZone={onSellDropZone}
          drag={drag}
          sellHover={sellHover}
          setSellHover={setSellHover}
          onContinue={onContinue}
          busy={combatActive}
        />
        {combatActive && <CombatOverlay active={combatActive} onDone={onCombatDone} />}
      </div>
      <BottomLog />
      <DragGhost drag={drag} />
    </div>
  );
}
