// ensureAnonIdPersisted — eager device-anonId persistence (M2.1 PR2 P1 fix).

import { beforeEach, describe, expect, it } from 'vitest';
import { loadLocal } from '../persistence';
import { ensureAnonIdPersisted } from './ensureAnonId';

describe('ensureAnonIdPersisted', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists a telemetryAnonId when no save exists', () => {
    expect(loadLocal()).toBeNull();
    ensureAnonIdPersisted();
    const saved = loadLocal();
    expect(saved?.telemetryAnonId).toBeTruthy();
    expect(saved?.inProgressRun).toBeNull(); // minimal save — no run clobbered
  });

  it('is idempotent — leaves an existing anonId unchanged', () => {
    ensureAnonIdPersisted();
    const first = loadLocal()?.telemetryAnonId;
    expect(first).toBeTruthy();
    ensureAnonIdPersisted();
    expect(loadLocal()?.telemetryAnonId).toBe(first);
  });

  it('salvages a valid top-level anonId when the full save fails validation', () => {
    // A save whose inProgressRun is an invalid/future shape → loadLocal()
    // rejects the whole LocalSaveV1, but the top-level telemetryAnonId is
    // intact (the content-deploy scenario). Seed the raw storage key directly
    // (SAVE_STORAGE_KEY = 'pba.v1.save', storage.ts).
    localStorage.setItem(
      'pba.v1.save',
      JSON.stringify({
        schemaVersion: 1,
        trophies: 0,
        dailyStreak: 0,
        lastDailyAttempted: null,
        tutorialCompleted: false,
        telemetryAnonId: 'pre-account-id-123',
        inProgressRun: { bogus: 'future-shape' },
      }),
    );
    // Precondition: validation rejects the whole save.
    expect(loadLocal()).toBeNull();

    ensureAnonIdPersisted();

    // The pre-existing device id is preserved, NOT replaced by a fresh one.
    expect(loadLocal()?.telemetryAnonId).toBe('pre-account-id-123');
  });
});
