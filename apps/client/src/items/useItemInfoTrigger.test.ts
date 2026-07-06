// CF 57 Phase 2.5 — useItemInfoTrigger tests. Locks the post-Codex behavior:
// tap/keyboard only (no hover handlers, per P1) and no auto-reopen after the
// trigger is disabled then re-enabled (P2 regression — e.g. combat start/end).

import type { KeyboardEvent, MouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useItemInfoTrigger } from './useItemInfoTrigger';

const clickEvent = () => ({}) as unknown as MouseEvent<HTMLElement>;

describe('useItemInfoTrigger', () => {
  it('disabled → no handlers, closed (fail-closed)', () => {
    const { result } = renderHook(() => useItemInfoTrigger(false));
    expect(result.current.open).toBe(false);
    expect(result.current.handlers).toEqual({});
  });

  it('enabled → tap + keyboard handlers and ARIA, and NO hover handlers', () => {
    const { result } = renderHook(() => useItemInfoTrigger(true));
    const h = result.current.handlers;
    expect(typeof h.onClick).toBe('function');
    expect(typeof h.onKeyDown).toBe('function');
    expect(h['aria-haspopup']).toBe('dialog');
    expect(h['aria-expanded']).toBe(false);
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

  it('Enter/Space toggle via keyboard and preventDefault', () => {
    const { result } = renderHook(() => useItemInfoTrigger(true));
    const pd = vi.fn();
    const e = { key: 'Enter', preventDefault: pd } as unknown as KeyboardEvent<HTMLElement>;
    act(() => result.current.handlers.onKeyDown?.(e));
    expect(pd).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(true);
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
    // combat starts → disabled
    rerender({ enabled: false });
    expect(result.current.open).toBe(false);
    // combat ends → re-enabled: must stay closed until a fresh tap
    rerender({ enabled: true });
    expect(result.current.open).toBe(false);
  });
});
