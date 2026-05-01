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
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { dimsOf, ITEMS, type ItemId } from '../../data.local';
import { BagBoard } from '../../bag/BagBoard';
import { CellSizeProvider } from '../../bag/CellSize';
import { CombatOverlay } from '../../combat/CombatOverlay';
import { ICONS } from '../../icons/icons';
import { MobileTopBar } from '../../hud/mobile/MobileTopBar';
import { useRun } from '../../run/useRun';
import { MobileTabBar, type MobileTab } from './MobileTabBar';

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

function TabContentStub({ tab }: { tab: MobileTab }) {
  // M1.3.3 commit 4 shell. Real content panels (ShopTab, CraftingTab,
  // RelicsTab, LogTab) land in commit 5.
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: 16,
        overflow: 'auto',
        background: 'var(--bg-deep)',
      }}
    >
      <div
        className="label-cap"
        style={{
          fontSize: 10,
          color: 'var(--text-secondary)',
          letterSpacing: '0.18em',
          marginBottom: 8,
        }}
      >
        {tab.toUpperCase()}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Tab content lands in M1.3.3 commit 5.
      </div>
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
    onCombine,
    onCombatDone,
  } = useRun();

  const [activeTab, setActiveTab] = useState<MobileTab>('shop');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
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
          <TabContentStub tab={activeTab} />
          <MobileTabBar active={activeTab} onTabChange={setActiveTab} />
          {state.combatActive && (
            <CombatOverlay active={state.combatActive} onDone={onCombatDone} />
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {state.drag ? <DragPreview itemId={state.drag.itemId} rot={state.drag.rot} /> : null}
        </DragOverlay>
      </DndContext>
    </CellSizeProvider>
  );
}
