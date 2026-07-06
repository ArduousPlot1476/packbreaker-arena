// CF 57 — useItemInfoTrigger tests. The inspect trigger is a native <button>, so
// the hook provides only click + ARIA (Enter/Space come from the button itself);
// it must NOT also emit an onKeyDown (that would double-toggle). Also locks the
// no-auto-reopen-after-disable behavior (P2).

import type { MouseEvent } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useItemInfoTrigger } from './useItemInfoTrigger';

const clickEvent = () => ({}) as unknown as MouseEvent<HTMLElement>;

describe('useItemInfoTrigger', () => {
  it('disabled → no handlers, closed (fail-closed)', () => {
    const { result } = renderHook(() => useItemInfoTrigger(false));
    expect(result.current.open).toBe(false);
    expect(result.current.handlers).toEqual({});
  });

  it('enabled → click + ARIA only (no onKeyDown, no hover); keyboard is native to the button', () => {
    const { result } = renderHook(() => useItemInfoTrigger(true));
    const h = result.current.handlers;
    expect(typeof h.onClick).toBe('function');
    expect(h['aria-haspopup']).toBe('dialog');
    expect(h['aria-expanded']).toBe(false);
    expect('onKeyDown' in h).toBe(false);
    expect('onMouseEnter' in h).toBe(false);
    expect('onMouseLeave' in h).toBe(false);
  });

  it('onClick toggles open and reflects aria-expanded', () => {
    const { result } = renderHook(() => useItemInfoTrigger(true));
    act(() => result.current.handlers.onClick?.(clickEvent()));
    expect(result.current.open).toBe(true);
    expect(result.current.handlers['aria-expanded']).toBe(true);
    act(() => result.current.handlers.onClick?.(clickEvent()));
    expect(result.current.open).toBe(false);
  });

  it('close() closes', () => {
    const { result } = renderHook(() => useItemInfoTrigger(true));
    act(() => result.current.handlers.onClick?.(clickEvent()));
    expect(result.current.open).toBe(true);
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
  });

  it('P2: does NOT auto-reopen after disabled → re-enabled (combat start/end)', () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useItemInfoTrigger(enabled),
      { initialProps: { enabled: true } },
    );
    act(() => result.current.handlers.onClick?.(clickEvent()));
    expect(result.current.open).toBe(true);
    rerender({ enabled: false });
    expect(result.current.open).toBe(false);
    rerender({ enabled: true });
    expect(result.current.open).toBe(false);
  });
});
