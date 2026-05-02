// Mobile run-screen orchestrator (390×844 vertical per gdd.md § 14
// + decision-log 2026-04-27 second-style-frame ratification).
// Stacked layout: top bar → bag (compact) → tab content → tab bar.
// Continue CTA full-width bar at the bottom edge lands in commit 6.
//
// CellSizeProvider value=52 ensures the shared bag/ components render
// at mobile cell size without forking. @dnd-kit DndContext at this
// level still uses PointerSensor only (covers mouse + falls back to
// pointer-style touch); TouchSensor + tap-tap rotate land in commit 7.

import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { dimsOf } from '../../bag/layout';
import { ITEMS } from '../../run/content';
import type { ItemId } from '../../run/types';
import { BagBoard } from '../../bag/BagBoard';
import { CellSizeProvider } from '../../bag/CellSize';
import { LazyCombatOverlay } from '../../combat/LazyCombatOverlay';
import { ICONS } from '../../icons/icons';
import { MobileTopBar } from '../../hud/mobile/MobileTopBar';
import { useRunContext } from '../../run/RunContext';
import { MobileContinueCTA } from './MobileContinueCTA';
import { MobileTabBar, type MobileTab } from './MobileTabBar';
import { CraftingTab } from './tabs/CraftingTab';
import { LogTab } from './tabs/LogTab';
import { RelicsTab } from './tabs/RelicsTab';
import { ShopTab } from './tabs/ShopTab';

const MOBILE_CELL_SIZE = 52;

function DragPreview({ itemId, rot }: { itemId: ItemId; rot: number }) {
  const def = ITEMS[itemId];
  const dims = dimsOf(itemId, rot);
  const Icon = ICONS[itemId] ?? ICONS['copper-coin'];
  return (
    <div
      style={{
        width: dims.w * MOBILE_CELL_SIZE - 4,
        height: dims.h * MOBILE_CELL_SIZE - 4,
        opacity: 0.92,
        filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.55))',
      }}
    >
      <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={MOBILE_CELL_SIZE - 4}>
        <ItemIcon rot={rot}>
          <Icon />
        </ItemIcon>
      </RarityFrame>
    </div>
  );
}

export function MobileRunScreen() {
  const {
    state,
    recipes,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    onReroll,
    onCombine,
    onContinue,
    onCombatDone,
  } = useRunContext();

  const [activeTab, setActiveTab] = useState<MobileTab>('shop');

  // Mobile sensor stack (M1.3.3 commit 7):
  //   - PointerSensor handles mouse + non-touch pointer fallback (e.g.
  //     stylus on touch devices that don't fire pure touch events).
  //   - TouchSensor handles native touch with a 200ms long-press
  //     activation per gdd.md § 14 mobile drag mechanics. Tolerance 5px
  //     allows the finger to wobble slightly during the hold without
  //     cancelling the press.
  // Tap-tap rotate (second finger taps anywhere while drag is active)
  // is handled in useRun's window-level touchstart listener; @dnd-kit
  // doesn't manage non-drag gestures.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  return (
    <CellSizeProvider value={MOBILE_CELL_SIZE}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className="flex flex-col"
          style={{
            width: '100%',
            minHeight: '100vh',
            maxWidth: 480,
            margin: '0 auto',
            background: 'var(--bg-deep)',
            position: 'relative',
          }}
        >
          <MobileTopBar state={state.state} />
          <div
            className="flex items-center justify-center"
            style={{ background: 'var(--bg-deep)', padding: '8px 0' }}
          >
            <BagBoard
              bag={state.bag}
              drag={state.drag}
              hover={state.hover}
              dimmed={state.combatActive}
              recipeMatches={recipes}
              onCombine={onCombine}
              compact
            />
          </div>
          {activeTab === 'shop' && (
            <ShopTab
              state={state.state}
              shop={state.shop}
              onReroll={onReroll}
              busy={state.combatActive}
            />
          )}
          {activeTab === 'crafting' && <CraftingTab recipes={recipes} onCombine={onCombine} />}
          {activeTab === 'relics' && <RelicsTab state={state.state} />}
          {activeTab === 'log' && <LogTab state={state.state} />}
          <MobileTabBar active={activeTab} onTabChange={setActiveTab} />
          <MobileContinueCTA onContinue={onContinue} busy={state.combatActive} />
          {state.combatActive && (
            <LazyCombatOverlay active={state.combatActive} onDone={onCombatDone} />
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {state.drag ? <DragPreview itemId={state.drag.itemId} rot={state.drag.rot} /> : null}
        </DragOverlay>
      </DndContext>
    </CellSizeProvider>
  );
}
