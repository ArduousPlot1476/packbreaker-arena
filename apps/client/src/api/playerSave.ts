// Player-save cloud-sync caller (M2.1 CF-75).
//
// Wraps GET/PUT /v1/player/save — the first authenticated data caller the
// client wires (PR3 shipped the routes server-side with no caller). Mirrors
// postAccountLink's shape: takes the bound apiFetch (so the Clerk session
// token rides the Authorization header via useApiFetch), never throws, and
// returns a small typed result the caller can branch on. Types come from the
// canonical §14 DTOs in @packbreaker/content — no hand-rolled duplicates.
//
// Scope: GET/PUT mechanics only (URL, method, JSON body, never-throws). The PUT
// body is the Delta-model shape as of CF-77 Phase 2 (`PlayerSaveWriteRequest`:
// runId / round / roundOutcome / lastDailyAttempted); the server derives the
// trophy delta. `dailyStreak` stays READ-only (GET response), never written
// (the server .strict()-400s a body carrying it). NOTE: the client PUSH itself
// is disabled to a no-op until CF-77 Phase 2 PR2 wires the producer — see
// usePlayerSavePush.ts.

import type {
  PlayerSaveResponse,
  PlayerSaveWriteRequest,
} from '@packbreaker/shared';

type BoundApiFetch = (input: string, init?: RequestInit) => Promise<Response>;

const ROUTE = '/v1/player/save';

/** Minimal structural guard on a 200 body — the server is trusted, but a
 *  malformed 200 must not be written into LocalSaveV1. Returns null rather
 *  than hydrating garbage. */
function asPlayerSaveResponse(body: unknown): PlayerSaveResponse | null {
  if (body === null || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const lastDaily = b.lastDailyAttempted;
  if (
    typeof b.trophies !== 'number' ||
    typeof b.dailyStreak !== 'number' ||
    (lastDaily !== null && typeof lastDaily !== 'string')
  ) {
    return null;
  }
  return {
    trophies: b.trophies,
    dailyStreak: b.dailyStreak,
    lastDailyAttempted: lastDaily as PlayerSaveResponse['lastDailyAttempted'],
  };
}

/** GETs the authoritative server save. Returns the parsed save on a 200, or
 *  null on anything else (404 account_not_linked, 401, 503, network error, or
 *  a malformed body) — null means "nothing to hydrate," never throws. The
 *  caller applies § 7.2 server-wins by overwriting local with the returned
 *  values. */
export async function getPlayerSave(
  apiFetch: BoundApiFetch,
): Promise<PlayerSaveResponse | null> {
  let res: Response;
  try {
    res = await apiFetch(ROUTE, { method: 'GET' });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return asPlayerSaveResponse(await res.json());
  } catch {
    return null;
  }
}

/** PUTs the client's save (idempotent whole-resource replace). Returns true
 *  iff a 2xx was received; false on 4xx/5xx/network error. Never throws — a
 *  failed push is retried by the next quiescent save, so the caller does not
 *  need to react. */
export async function putPlayerSave(
  apiFetch: BoundApiFetch,
  body: PlayerSaveWriteRequest,
): Promise<boolean> {
  try {
    const res = await apiFetch(ROUTE, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
