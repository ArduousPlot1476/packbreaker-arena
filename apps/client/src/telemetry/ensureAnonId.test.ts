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
});
