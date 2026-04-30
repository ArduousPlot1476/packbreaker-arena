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
import { CombatOverlay } from './combat';
import { detectRecipes, type RecipeMatch } from './run/recipes';
import { BagBoard } from './bag/BagBoard';
import { cellPx, placementValid } from './bag/layout';
import type { DragState } from './bag/types';
import { TopBar } from './hud/TopBar';
import { LeftRail } from './hud/LeftRail';
import { BottomPanel } from './hud/BottomPanel';
import { ShopPanel } from './shop/ShopPanel';
import { RarityFrame } from './ui-kit-overrides/RarityFrame';
import { ItemIcon } from './ui-kit-overrides/ItemIcon';

const CELL = cellPx;

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
        <ShopPanel
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
      <BottomPanel />
      <DragGhost drag={drag} />
    </div>
  );
}
