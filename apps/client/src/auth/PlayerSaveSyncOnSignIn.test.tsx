// PlayerSaveSyncOnSignIn (M2.1 CF-75) — GET pull once per linked session,
// § 7.2 server-wins hydration, silent (no toast).

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useAccountLinkedMock,
  setHydratedMock,
  getPlayerSaveMock,
  hydrateMock,
  stableFetch,
} = vi.hoisted(() => ({
  useAccountLinkedMock: vi.fn(),
  setHydratedMock: vi.fn(),
  getPlayerSaveMock: vi.fn(),
  hydrateMock: vi.fn(),
  stableFetch: vi.fn(),
}));
vi.mock('./AccountLinkContext', () => ({
  useAccountLinked: () => useAccountLinkedMock(),
  useSetSyncHydrated: () => setHydratedMock,
}));
vi.mock('../api/useApiFetch', () => ({ useApiFetch: () => stableFetch }));
vi.mock('../api/playerSave', () => ({
  getPlayerSave: (...a: unknown[]) => getPlayerSaveMock(...a),
}));
vi.mock('../persistence', () => ({
  hydratePlayerSave: (...a: unknown[]) => hydrateMock(...a),
}));

import { PlayerSaveSyncOnSignIn } from './PlayerSaveSyncOnSignIn';

const SERVER_SAVE = { trophies: 3, dailyStreak: 1, lastDailyAttempted: null };

beforeEach(() => {
  useAccountLinkedMock.mockReset();
  setHydratedMock.mockReset();
  getPlayerSaveMock.mockReset();
  hydrateMock.mockReset();
  getPlayerSaveMock.mockResolvedValue(SERVER_SAVE);
});
afterEach(cleanup);

describe('PlayerSaveSyncOnSignIn', () => {
  it('does not GET while unlinked', () => {
    useAccountLinkedMock.mockReturnValue(false);
    render(<PlayerSaveSyncOnSignIn />);
    expect(getPlayerSaveMock).not.toHaveBeenCalled();
  });

  it('GETs once and hydrates server-wins when linked', async () => {
    useAccountLinkedMock.mockReturnValue(true);
    render(<PlayerSaveSyncOnSignIn />);
    await waitFor(() => expect(getPlayerSaveMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(hydrateMock).toHaveBeenCalledWith(SERVER_SAVE));
  });

  it('publishes hydrated=true after the pull settles on the SUCCESS path', async () => {
    useAccountLinkedMock.mockReturnValue(true);
    render(<PlayerSaveSyncOnSignIn />);
    await waitFor(() => expect(setHydratedMock).toHaveBeenCalledWith(true));
  });

  it('publishes hydrated=true even when the pull settles as a FAILURE (null)', async () => {
    getPlayerSaveMock.mockResolvedValue(null);
    useAccountLinkedMock.mockReturnValue(true);
    render(<PlayerSaveSyncOnSignIn />);
    await waitFor(() => expect(setHydratedMock).toHaveBeenCalledWith(true));
    expect(hydrateMock).not.toHaveBeenCalled();
  });

  it('resets hydrated=false while unlinked (re-serializes on re-link)', () => {
    useAccountLinkedMock.mockReturnValue(false);
    render(<PlayerSaveSyncOnSignIn />);
    expect(setHydratedMock).toHaveBeenCalledWith(false);
  });

  it('fires the GET only ONCE per linked session (stable across re-render)', async () => {
    useAccountLinkedMock.mockReturnValue(true);
    const { rerender } = render(<PlayerSaveSyncOnSignIn />);
    await waitFor(() => expect(getPlayerSaveMock).toHaveBeenCalledTimes(1));
    rerender(<PlayerSaveSyncOnSignIn />);
    rerender(<PlayerSaveSyncOnSignIn />);
    expect(getPlayerSaveMock).toHaveBeenCalledTimes(1);
  });

  it('does not hydrate when the GET returns null (nothing to pull)', async () => {
    getPlayerSaveMock.mockResolvedValue(null);
    useAccountLinkedMock.mockReturnValue(true);
    render(<PlayerSaveSyncOnSignIn />);
    await waitFor(() => expect(getPlayerSaveMock).toHaveBeenCalledTimes(1));
    // Let the resolved promise settle, then confirm no hydration.
    await new Promise((r) => setTimeout(r, 10));
    expect(hydrateMock).not.toHaveBeenCalled();
  });

  it('re-pulls after an unlink → re-link (ref reset on sign-out)', async () => {
    useAccountLinkedMock.mockReturnValue(true);
    const { rerender } = render(<PlayerSaveSyncOnSignIn />);
    await waitFor(() => expect(getPlayerSaveMock).toHaveBeenCalledTimes(1));

    useAccountLinkedMock.mockReturnValue(false);
    rerender(<PlayerSaveSyncOnSignIn />);

    useAccountLinkedMock.mockReturnValue(true);
    rerender(<PlayerSaveSyncOnSignIn />);
    await waitFor(() => expect(getPlayerSaveMock).toHaveBeenCalledTimes(2));
  });
});
