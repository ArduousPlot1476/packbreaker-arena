// Device anon-id eager persistence (M2.1 PR2 — Codex round 1 P1 fix).
//
// The telemetry device anonId is resolved in-memory by useRun and only
// persisted at the first quiescent save (mid-run). That left a window: a
// first-time user who signs in on the class-select screen (before any run)
// had no persisted LocalSaveV1, so the account-link effect read a null
// anonId and never linked. Calling this once at app startup guarantees the
// anonId exists in storage before any consumer (telemetry OR account-link)
// reads it, and keeps both reading the SAME value. Idempotent — a no-op
// once an anonId is persisted, so it never clobbers an in-progress run.

import type { LocalSaveV1 } from '../persistence';
import { loadLocal, saveLocal } from '../persistence';
import { resolveAnonId } from './identifiers';

export function ensureAnonIdPersisted(): void {
  const existing = loadLocal();
  if (existing !== null && existing.telemetryAnonId.length > 0) return;

  const anonId = resolveAnonId(existing?.telemetryAnonId);
  const base: LocalSaveV1 = existing ?? {
    schemaVersion: 1,
    trophies: 0,
    dailyStreak: 0,
    lastDailyAttempted: null,
    tutorialCompleted: false,
    telemetryAnonId: anonId,
    inProgressRun: null,
  };
  saveLocal({ ...base, telemetryAnonId: anonId });
}
