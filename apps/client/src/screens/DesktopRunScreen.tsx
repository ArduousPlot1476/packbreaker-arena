// Desktop run-screen orchestrator (1280×720 baseline per gdd.md § 14).
// Owns the @dnd-kit DndContext + DragOverlay and the desktop page
// layout (top bar, left rail, bag center, shop right rail, bottom
// panel, combat overlay). Consumes run state via useRunContext()
// (lifted into <RunProvider> at the dispatcher level in M1.3.3
// commit 10 to survive viewport-switch remounts — Codex P1 fix).

import { DndContext, DragOverlay, PointerSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { BagBoard } from '../bag/BagBoard';
import { cellPx, dimsOf } from '../bag/layout';
import { ITEMS } from '../run/content';
import type { ItemId } from '../run/types';
import { CombatOverlay } from '../combat/CombatOverlay';
import { ICONS } from '../icons/icons';
import { TopBar } from '../hud/TopBar';
import { LeftRail } from '../hud/LeftRail';
import { BottomPanel } from '../hud/BottomPanel';
import { ShopPanel } from '../shop/ShopPanel';
import { useRunContext } from '../run/RunContext';

function DragPreview({ itemId, rot }: { itemId: ItemId; rot: number }) {
  const def = ITEMS[itemId];
  const dims = dimsOf(itemId, rot);
  const Icon = ICONS[itemId] ?? ICONS['copper-coin'];
  return (
    <div
      style={{
        width: dims.w * cellPx - 4,
        height: dims.h * cellPx - 4,
        opacity: 0.92,
        filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.55))',
      }}
    >
      <RarityFrame rarity={def.rarity} w={dims.w} h={dims.h} size={cellPx - 4}>
        <ItemIcon rot={rot}>
          <Icon />
        </ItemIcon>
      </RarityFrame>
    </div>
  );
}

export function DesktopRunScreen() {
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

  // 4px activation distance distinguishes click from drag (matches the
  // prototype's intent — quick clicks shouldn't accidentally start a drag).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  return (
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
              dimmed={state.combatActive}
              recipeMatches={recipes}
              onCombine={onCombine}
            />
          </div>
          <ShopPanel
            state={state.state}
            shop={state.shop}
            onReroll={onReroll}
            onContinue={onContinue}
            busy={state.combatActive}
          />
          {state.combatActive && (
            <CombatOverlay active={state.combatActive} onDone={onCombatDone} />
          )}
        </div>
        <BottomPanel />
      </div>
      <DragOverlay dropAnimation={null}>
        {state.drag ? <DragPreview itemId={state.drag.itemId} rot={state.drag.rot} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
