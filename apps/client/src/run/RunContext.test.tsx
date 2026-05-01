// Regression test for the M1.3.3 commit-10 Codex P1 fix.
//
// The bug: prior to lifting useRun into <RunProvider>, both
// DesktopRunScreen and MobileRunScreen called useRun() independently.
// When the viewport crossed 768px (rotation, window resize), the
// dispatcher unmounted one orchestrator and mounted the other —
// destroying the leaving orchestrator's useReducer state. Bag, shop,
// gold, hearts, round all reset on viewport switch.
//
// The fix: <RunProvider> owns useRun() and stays mounted across the
// dispatcher's child swap. Both orchestrators consume via
// useRunContext().
//
// This test asserts the architectural property directly: state
// changes made via useRunContext persist when the provider's child
// subtree is swapped (the unit-test analog of a viewport-driven
// orchestrator swap).

import { describe, expect, it } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { RunProvider, useRunContext } from './RunContext';

function GoldDisplay({ testId }: { testId: string }) {
  const { state, onReroll } = useRunContext();
  return (
    <div data-testid={testId}>
      <span data-testid={`${testId}-gold`}>{state.state.gold}</span>
      <span data-testid={`${testId}-reroll-count`}>{state.state.rerollCount}</span>
      <button data-testid={`${testId}-reroll`} type="button" onClick={onReroll}>
        reroll
      </button>
    </div>
  );
}

function Wrapper({ child }: { child: 'A' | 'B' }) {
  return (
    <RunProvider>
      {child === 'A' ? <GoldDisplay testId="a" /> : <GoldDisplay testId="b" />}
    </RunProvider>
  );
}

describe('RunProvider — state preservation across child swap (Codex P1 regression)', () => {
  it('preserves state when the provider child subtree swaps', () => {
    const { rerender, getByTestId, queryByTestId } = render(<Wrapper child="A" />);

    // Initial state — gold = 8, rerollCount = 0 (INITIAL_CLIENT_STATE).
    expect(getByTestId('a-gold').textContent).toBe('8');
    expect(getByTestId('a-reroll-count').textContent).toBe('0');

    // Mutate state via reroll: cost = rerollCount + 1 = 1, so gold
    // decrements by 1 and rerollCount increments to 1.
    act(() => {
      fireEvent.click(getByTestId('a-reroll'));
    });
    expect(getByTestId('a-gold').textContent).toBe('7');
    expect(getByTestId('a-reroll-count').textContent).toBe('1');

    // Swap children — analog of dispatcher swapping Desktop ↔ Mobile
    // on viewport crossing 768px. The provider above stays mounted,
    // so its useReducer state should survive.
    rerender(<Wrapper child="B" />);

    // The leaving child is unmounted; the new child mounts and reads
    // the preserved context value.
    expect(queryByTestId('a')).toBeNull();
    expect(getByTestId('b-gold').textContent).toBe('7');
    expect(getByTestId('b-reroll-count').textContent).toBe('1');

    // Mutate again from the new child — the same reducer instance
    // continues to advance the state.
    act(() => {
      fireEvent.click(getByTestId('b-reroll'));
    });
    // Second reroll: cost = 2, gold 7 → 5, rerollCount 1 → 2.
    expect(getByTestId('b-gold').textContent).toBe('5');
    expect(getByTestId('b-reroll-count').textContent).toBe('2');
  });

  it('throws a clear error when useRunContext is called outside <RunProvider>', () => {
    function OrphanConsumer() {
      useRunContext();
      return null;
    }
    // Suppress React's expected-error console output for this throw.
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => render(<OrphanConsumer />)).toThrow(
        'useRunContext must be called inside <RunProvider>',
      );
    } finally {
      console.error = originalError;
    }
  });
});
