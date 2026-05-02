// React hook wrapping clientRunReducer. As of commit 6, drag/drop
// coordination is delegated to @dnd-kit — the bound onDragStart /
// onDragOver / onDragEnd / onDragCancel handlers translate
// dnd-kit events into reducer actions. The R-key rotation listener is
// the only window-level event handler that remains: dnd-kit doesn't
// manage non-drag keyboard concerns.

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type {
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import type { CombatResult } from '@packbreaker/content';
import { ITEMS } from './content';
import type { DraggableData, DroppableData } from '../bag/types';
import {
  clientRunReducer,
  INITIAL_CLIENT_STATE,
  type ClientRunState,
} from './RunController';
import { detectRecipes, type RecipeMatch } from './recipes';

function makeUid(prefix: 'b' | 's'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function useRun() {
  const [state, dispatch] = useReducer(clientRunReducer, INITIAL_CLIENT_STATE);

  const recipes = useMemo(() => detectRecipes(state.bag), [state.bag]);

  const dragRef = useRef<ClientRunState['drag']>(null);
  dragRef.current = state.drag;

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key && e.key.toLowerCase() === 'r') {
        const d = dragRef.current;
        if (!d) return;
        const def = ITEMS[d.itemId];
        // Square items have rotation-invariant footprints — R is a no-op
        // (M0 ratification, decision-log 2026-04-26).
        if (def.w === def.h) return;
        dispatch({ type: 'drag_rotate' });
      }
    }
    // Mobile tap-tap rotate (M1.3.3 commit 7): while a drag is active,
    // a second finger touching the screen rotates the held item. Same
    // square-no-op gating as the R-key path. The first finger remains
    // down holding the drag (TouchSensor activation); the second
    // touchstart fires once per new touch contact.
    function touchStart(e: TouchEvent) {
      if (e.touches.length < 2) return;
      const d = dragRef.current;
      if (!d) return;
      const def = ITEMS[d.itemId];
      if (def.w === def.h) return;
      dispatch({ type: 'drag_rotate' });
    }
    window.addEventListener('keydown', key);
    window.addEventListener('touchstart', touchStart);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('touchstart', touchStart);
    };
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DraggableData | undefined;
    if (!data) return;
    if (data.kind === 'bag') {
      dispatch({ type: 'pickup_bag', uid: data.uid, itemId: data.itemId, rot: data.rot });
    } else if (data.kind === 'shop') {
      dispatch({ type: 'pickup_shop', uid: data.uid });
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overData = event.over?.data.current as DroppableData | undefined;
    if (overData?.kind === 'cell') {
      dispatch({ type: 'set_hover', hover: { col: overData.col, row: overData.row } });
    } else {
      dispatch({ type: 'set_hover', hover: null });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const overData = event.over?.data.current as DroppableData | undefined;
    if (overData?.kind === 'cell') {
      dispatch({ type: 'drop_bag', col: overData.col, row: overData.row, newUid: makeUid('b') });
    } else if (overData?.kind === 'sell') {
      dispatch({ type: 'sell_drop' });
    } else {
      dispatch({ type: 'drag_cancel' });
    }
  }, []);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    dispatch({ type: 'drag_cancel' });
  }, []);

  const onReroll = useCallback(() => {
    // The reroll action carries no payload as of M1.3.4a — ShopController
    // generates the new shop using state.seed + round + rerollCount inside
    // the reducer, so makeUid for slot ids is no longer needed here.
    dispatch({ type: 'reroll' });
  }, []);

  const onCombine = useCallback((match: RecipeMatch) => {
    dispatch({ type: 'combine', match, newUid: makeUid('b') });
  }, []);

  const onContinue = useCallback(() => {
    dispatch({ type: 'continue_to_combat' });
  }, []);

  // The CombatResult is plumbed through to the reducer so the next-round
  // shop / hearts / history can consume real damage + outcome data.
  // M1.3.4a commit 2 wires the path; commit 3 consumes outcome + damage
  // for the heart-loss / history-entry side of the reducer.
  const onCombatDone = useCallback((result: CombatResult) => {
    dispatch({ type: 'combat_done', result });
  }, []);

  return {
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
  };
}
