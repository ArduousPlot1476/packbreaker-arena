// Top-level run-screen orchestrator. Owns layout (top bar, rails, bag,
// shop, bottom panel + combat overlay) and consumes useRun for state +
// handlers.

import { dimsOf, ITEMS } from '../data.local';
import { BagBoard } from '../bag/BagBoard';
import { cellPx } from '../bag/layout';
import type { DragState } from '../bag/types';
import { CombatOverlay } from '../combat/CombatOverlay';
import { TopBar } from '../hud/TopBar';
import { LeftRail } from '../hud/LeftRail';
import { BottomPanel } from '../hud/BottomPanel';
import { ShopPanel } from '../shop/ShopPanel';
import { RarityFrame } from '../ui-kit-overrides/RarityFrame';
import { ItemIcon } from '../ui-kit-overrides/ItemIcon';
import { useRun } from '../run/useRun';

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
        width: dims.w * cellPx - 4,
        height: dims.h * cellPx - 4,
        zIndex: 200,
        opacity: 0.92,
        filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.55))',
      }}
    >
      <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={cellPx - 4}>
        <ItemIcon itemId={drag.itemId} rot={drag.rot} />
      </RarityFrame>
    </div>
  );
}

export function RunScreen() {
  const {
    state,
    recipes,
    onPickUpBag,
    onBuyShop,
    onDropBag,
    onSellDropZone,
    onReroll,
    onCombine,
    onContinue,
    onCombatDone,
    setHover,
    setSellHover,
  } = useRun();

  return (
    <div
      className="flex flex-col"
      style={{ width: 1280, height: 720, margin: '0 auto', position: 'relative' }}
    >
      <TopBar state={state.state} />
      <div className="flex flex-1 relative" style={{ minHeight: 0 }}>
        <LeftRail />
        <div
          className="flex-1 flex items-center justify-center relative"
          style={{ background: 'var(--bg-deep)' }}
        >
          <BagBoard
            bag={state.bag}
            drag={state.drag}
            hover={state.hover}
            setHover={setHover}
            onDrop={onDropBag}
            onPickUp={onPickUpBag}
            dimmed={state.combatActive}
            recipeMatches={recipes}
            onCombine={onCombine}
          />
        </div>
        <ShopPanel
          state={state.state}
          shop={state.shop}
          onBuy={onBuyShop}
          onReroll={onReroll}
          onSellDropZone={onSellDropZone}
          drag={state.drag}
          sellHover={state.sellHover}
          setSellHover={setSellHover}
          onContinue={onContinue}
          busy={state.combatActive}
        />
        {state.combatActive && (
          <CombatOverlay active={state.combatActive} onDone={onCombatDone} />
        )}
      </div>
      <BottomPanel />
      <DragGhost drag={state.drag} />
    </div>
  );
}
