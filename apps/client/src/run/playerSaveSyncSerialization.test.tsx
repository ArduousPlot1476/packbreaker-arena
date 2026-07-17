// Pull-before-push serialization (M2.1 CF-75, Codex round 1 P1).
//
// Integration across the two racing sites through the REAL AccountLinkContext:
// PlayerSaveSyncOnSignIn (GET → hydrated) and usePlayerSavePush (PUT, gated on
// linked && hydrated). Proves a quiescent-save PUT cannot fire while the
// initial GET is in flight, and DOES fire once the GET settles — on both the
// success and failure/error paths.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSaveV1 } from '@packbreaker/shared';

const { getPlayerSaveMock, putPlayerSaveMock, hydrateMock } = vi.hoisted(() => ({
  getPlayerSaveMock: vi.fn(),
  putPlayerSaveMock: vi.fn(),
  hydrateMock: vi.fn(),
}));
vi.mock('../api/playerSave', () => ({
  getPlayerSave: (...a: unknown[]) => getPlayerSaveMock(...a),
  putPlayerSave: (...a: unknown[]) => putPlayerSaveMock(...a),
}));
vi.mock('../persistence', () => ({
  hydratePlayerSave: (...a: unknown[]) => hydrateMock(...a),
}));

import { AccountLinkProvider, useSetAccountLinked } from '../auth/AccountLinkContext';
import { PlayerSaveSyncOnSignIn } from '../auth/PlayerSaveSyncOnSignIn';
import { usePlayerSavePush } from './usePlayerSavePush';

let pushFn: ((save: LocalSaveV1) => void) | undefined;

function Linker() {
  const setLinked = useSetAccountLinked();
  useEffect(() => {
    setLinked(true);
  }, [setLinked]);
  return null;
}
function Pusher() {
  pushFn = usePlayerSavePush();
  return null;
}
function harness() {
  return render(
    <AccountLinkProvider>
      <Linker />
      <PlayerSaveSyncOnSignIn />
      <Pusher />
    </AccountLinkProvider>,
  );
}
function save(trophies: number): LocalSaveV1 {
  return {
    schemaVersion: 1,
    trophies,
    dailyStreak: 0,
    lastDailyAttempted: null,
    tutorialCompleted: false,
    telemetryAnonId: 'x',
    inProgressRun: null,
  };
}

beforeEach(() => {
  getPlayerSaveMock.mockReset();
  putPlayerSaveMock.mockReset();
  putPlayerSaveMock.mockResolvedValue(true);
  hydrateMock.mockReset();
  pushFn = undefined;
});
afterEach(cleanup);

describe('player-save sync — pull-before-push serialization', () => {
  it('does not PUT while the initial GET is in flight, then PUTs after it settles (success)', async () => {
    let resolveGet!: (v: unknown) => void;
    getPlayerSaveMock.mockReturnValue(
      new Promise((r) => {
        resolveGet = r;
      }),
    );

    harness();
    await waitFor(() => expect(getPlayerSaveMock).toHaveBeenCalledTimes(1));

    // GET in flight (hydrated=false) → a quiescent push must NOT fire.
    act(() => pushFn!(save(5)));
    expect(putPlayerSaveMock).not.toHaveBeenCalled();

    // Settle the pull (success) → hydrated flips true.
    await act(async () => {
      resolveGet({ trophies: 9, dailyStreak: 0, lastDailyAttempted: null });
    });

    // Now the push is allowed.
    act(() => pushFn!(save(5)));
    await waitFor(() => expect(putPlayerSaveMock).toHaveBeenCalledTimes(1));
    expect(putPlayerSaveMock).toHaveBeenLastCalledWith(expect.anything(), {
      trophies: 5,
      lastDailyAttempted: null,
    });
  });

  it('unblocks the PUT once the initial GET settles as a FAILURE (null)', async () => {
    let resolveGet!: (v: unknown) => void;
    getPlayerSaveMock.mockReturnValue(
      new Promise((r) => {
        resolveGet = r;
      }),
    );

    harness();
    await waitFor(() => expect(getPlayerSaveMock).toHaveBeenCalledTimes(1));

    act(() => pushFn!(save(5)));
    expect(putPlayerSaveMock).not.toHaveBeenCalled();

    // Failure/error path: getPlayerSave returns null (404/401/503/network).
    await act(async () => {
      resolveGet(null);
    });

    act(() => pushFn!(save(5)));
    await waitFor(() => expect(putPlayerSaveMock).toHaveBeenCalledTimes(1));
    expect(hydrateMock).not.toHaveBeenCalled();
  });
});
