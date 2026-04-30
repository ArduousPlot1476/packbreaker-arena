// React hook wrapping clientRunReducer + window-listener effects (R-key
// rotate, pointercancel + window-blur drag cleanup). Provides bound
// handlers for child components.

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ITEMS, type BagItem } from '../data.local';
import {
  clientRunReducer,
  INITIAL_CLIENT_STATE,
  type ClientRunState,
} from './RunController';
import { detectRecipes, type RecipeMatch } from './recipes';

export function useRun() {
  const [state, dispatch] = useReducer(clientRunReducer, INITIAL_CLIENT_STATE);

  const recipes = useMemo(() => detectRecipes(state.bag), [state.bag]);

  const dragRef = useRef<ClientRunState['drag']>(null);
  dragRef.current = state.drag;
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    function move(e: PointerEvent) {
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (!dragRef.current) return;
      dispatch({ type: 'drag_move', x: e.clientX, y: e.clientY });
    }
    function cancel() {
      if (!dragRef.current) return;
      dispatch({ type: 'drag_cancel' });
    }
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

  const onPickUpBag = useCallback((e: ReactPointerEvent<HTMLDivElement>, item: BagItem) => {
    const target = e.currentTarget;
    const r = target.getBoundingClientRect();
    dispatch({
      type: 'pickup_bag',
      item,
      x: e.clientX,
      y: e.clientY,
      offX: e.clientX - r.left,
      offY: e.clientY - r.top,
    });
  }, []);

  const onBuyShop = useCallback((uid: string) => {
    const { x, y } = lastPointerRef.current;
    dispatch({ type: 'pickup_shop', uid, x, y });
  }, []);

  const onDropBag = useCallback((col: number, row: number) => {
    dispatch({ type: 'drop_bag', col, row, newUid: 'b' + Date.now().toString(36) });
  }, []);

  const onSellDropZone = useCallback(() => {
    dispatch({ type: 'sell_drop' });
  }, []);

  const onReroll = useCallback(() => {
    dispatch({ type: 'reroll', uidPrefix: 's' + Date.now().toString(36) });
  }, []);

  const onCombine = useCallback((match: RecipeMatch) => {
    dispatch({ type: 'combine', match, newUid: 'b' + Date.now().toString(36) });
  }, []);

  const onContinue = useCallback(() => {
    dispatch({ type: 'continue_to_combat' });
  }, []);

  const onCombatDone = useCallback(() => {
    dispatch({ type: 'combat_done' });
  }, []);

  const setHover = useCallback((hover: { col: number; row: number } | null) => {
    dispatch({ type: 'set_hover', hover });
  }, []);

  const setSellHover = useCallback((on: boolean) => {
    dispatch({ type: 'set_sell_hover', on });
  }, []);

  return {
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
  };
}
