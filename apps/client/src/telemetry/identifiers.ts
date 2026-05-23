// M1.5c PR 1 — telemetry identifier resolution.
//
// Two identifiers carry through every TelemetryEvent (per
// schemas.ts:804-807 TelemetryBase + TelemetryBatchRequest.anonId):
//
//   sessionId — per-tab, generate-once via sessionStorage. One tab/
//               visit = one sessionId. Survives soft reloads (same
//               sessionStorage entry). Distinct tab = distinct
//               sessionId. Per Phase 1 Q6 option (i) ratification +
//               telemetry-plan.md L236.
//
//   anonId    — device-scoped, persisted in LocalSaveV1.telemetryAnonId
//               (schemas.ts:773). Resolved by useRun at mount: read the
//               persisted value via loadLocal(); if empty/absent,
//               generate via crypto.randomUUID() and let the next
//               quiescent save persist it (no schemaVersion bump, no
//               CF 46 interaction — within-version field init).
//
// crypto.randomUUID is a browser+Node-20 standard; module is
// happy-dom-safe (test environment provides crypto.randomUUID).

const SESSION_STORAGE_KEY = 'pba.telemetry.sessionId';

/** Returns the current tab's sessionId. Generates+persists on first
 *  call per tab via sessionStorage. Tests pass a custom Storage to
 *  inspect/seed; production uses the default sessionStorage. */
export function getOrCreateSessionId(storage?: Storage): string {
  const store =
    storage ??
    (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  if (store === null) {
    // SSR / no-storage environment: degraded uuid (won't persist
    // across calls). Acceptable — sessionStorage is always present in
    // happy-dom + real browsers.
    return generateUuid();
  }
  try {
    const existing = store.getItem(SESSION_STORAGE_KEY);
    if (existing !== null && existing.length > 0) return existing;
    const fresh = generateUuid();
    store.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Storage access denied (Safari private mode, quota error, etc.).
    // Degraded uuid; new uuid per call.
    return generateUuid();
  }
}

/** Resolves the cross-session anonId. Pure helper: returns the
 *  persisted value if non-empty, else a fresh uuid. Caller persists
 *  the result via the next quiescent save (useRun's save composer). */
export function resolveAnonId(persisted: string | null | undefined): string {
  if (persisted !== null && persisted !== undefined && persisted.length > 0) {
    return persisted;
  }
  return generateUuid();
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Degraded SSR/older-Node fallback. NOT RFC 4122 — only used when
  // crypto.randomUUID is unavailable (effectively never under modern
  // browsers + Node 20). Math.random + Date.now are fine here:
  // telemetry identifiers are CLIENT-tier and never feed sim state.
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 12);
  return `fallback-${ts}-${rand}`;
}

// Test-only key access for sessionStorage assertions.
export const __SESSION_STORAGE_KEY_FOR_TESTS = SESSION_STORAGE_KEY;
