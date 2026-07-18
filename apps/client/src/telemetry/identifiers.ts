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

// Module-scoped fallback memo (Phase 2.5 round 2 / Codex P1). Stable
// across repeated getOrCreateSessionId calls within a storage-denied
// session — without this, every call regenerates a fresh uuid and
// telemetry events from the same tab visit get attributed to
// different "sessions." Reset by ESM reload (test isolation via
// __resetFallbackForTests below).
let _fallbackSessionId: string | null = null;

/** Reads `globalThis.sessionStorage` under try/catch. Property access
 *  on the global itself throws SecurityError in Safari private-mode /
 *  opaque-origin / sandboxed-iframe with blocked-storage contexts —
 *  `typeof sessionStorage !== 'undefined'` only guards against absent
 *  globals, NOT against the property-read throw. Mirrors
 *  storage.ts:51-63 getDefaultStorage (Catch 19 lineage). */
function getDefaultSessionStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  try {
    const g = globalThis as { sessionStorage?: Storage };
    return g.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Returns the current tab's sessionId. Generates+persists on first
 *  call per tab via sessionStorage. Tests pass a custom Storage to
 *  inspect/seed; production uses the default sessionStorage.
 *
 *  Throw-safety contract (Phase 2.5 round 2 / Catch 21 lineage):
 *  NEVER throws. Every storage access — the global property read AND
 *  getItem/setItem — is wrapped. On any throw, returns the module-
 *  memoized fallback uuid so the caller (useRun mount) cannot crash
 *  on opaque-origin / blocked-storage contexts. */
export function getOrCreateSessionId(storage?: Storage): string {
  const store = storage ?? getDefaultSessionStorage();
  if (store === null) {
    return getOrInitFallback();
  }
  try {
    const existing = store.getItem(SESSION_STORAGE_KEY);
    if (existing !== null && existing.length > 0) return existing;
    const fresh = generateUuid();
    store.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // getItem/setItem failed mid-flow (Safari private mode after the
    // property read succeeded, quota exceeded, etc.). Degrade to the
    // memoized fallback so repeated calls in the same session stay
    // attributed to one sessionId.
    return getOrInitFallback();
  }
}

function getOrInitFallback(): string {
  if (_fallbackSessionId === null) {
    _fallbackSessionId = generateUuid();
  }
  return _fallbackSessionId;
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

/** Mints a fresh opaque per-run PUSH id (uuid v4) for CF-77 Phase 2 PR2's
 *  Delta-model player-save PUT. Reuses the same crypto.randomUUID primitive as
 *  the telemetry ids (test-env-safe), under a run-scoped name because the value
 *  is persisted into SerializedRunState.pushRunId and used as the SERVER
 *  idempotency key (applied_round_results) — NOT a telemetry identifier. */
export function mintPushRunId(): string {
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

/** Test-only: reset the module-memoized fallback uuid so each test
 *  starts with a fresh memo. Never call in production. */
export function __resetFallbackForTests(): void {
  _fallbackSessionId = null;
}
