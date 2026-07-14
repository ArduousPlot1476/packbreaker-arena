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
import { loadLocal, loadRaw, saveLocal } from '../persistence';
import { resolveAnonId } from './identifiers';

export function ensureAnonIdPersisted(): void {
  const existing = loadLocal();
  if (existing !== null && existing.telemetryAnonId.length > 0) return;

  // loadLocal() rejects the WHOLE save when ANY field fails validation
  // (e.g. a stale/future inProgressRun after a content-schema change — a
  // live-ops-real trigger, not just corruption). A valid top-level
  // telemetryAnonId would then be discarded here and a fresh id generated,
  // silently forking the pre-account device identity this PR exists to
  // preserve (Codex round 5). When loadLocal() is null, salvage the anonId
  // directly from the raw pre-migration blob — a narrow top-level field read,
  // NOT a re-validation of the (legitimately invalid) rest.
  const persistedAnonId =
    existing?.telemetryAnonId ?? salvageRawTelemetryAnonId();

  const anonId = resolveAnonId(persistedAnonId);
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

/** Extracts a non-empty top-level `telemetryAnonId` from the raw
 *  (parsed-but-unmigrated) save, or undefined when the blob is absent, not
 *  an object, or the field is missing/blank/non-string. Used ONLY to
 *  preserve an existing device id when the full LocalSaveV1 fails validation
 *  — deliberately does not inspect any other field. */
function salvageRawTelemetryAnonId(): string | undefined {
  const raw = loadRaw();
  if (typeof raw !== 'object' || raw === null) return undefined;
  const candidate = (raw as Record<string, unknown>).telemetryAnonId;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : undefined;
}
