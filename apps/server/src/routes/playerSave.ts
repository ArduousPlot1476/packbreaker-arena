// GET/PUT /v1/player/save (M2.1 PR3).
//
// Meta-progression sync. Per decision-log.md 2026-07-14 § "M2.1 PR3 PHASE 1
// RATIFIED", tech-architecture.md § 6.2's `GET/POST /v1/run/save` is RENAMED
// here: the old name was actively wrong for this surface — `inProgressRun`
// is device-local by ratification, so nothing "run"-shaped is stored
// server-side. This route stores meta-progression only.
//
// SCOPE (Option A, plumbing-only): PR3 knowingly syncs ZEROS. No producers
// are wired, so the client always pushes `{ trophies: 0,
// lastDailyAttempted: null }`. That is the point — it lands the pipe so a
// later PR can wire the taps, and it keeps the auth/persistence seam honest
// rather than pretending values exist.
//
// Status map (mirrors routes/account.ts):
//   200 — GET: the save (defaults for an account that has never written).
//         PUT: the persisted row.
//   400 — invalid_body. Includes a body carrying `dailyStreak` (.strict()
//         rejects it — the field is server-derived, never client-settable)
//         and a future `lastDailyAttempted` (see below).
//   401 — no authenticated user (requireAuth preHandler).
//   404 — account_not_linked: authenticated, but no accounts row. The
//         client re-fires PR2's link flow. RATIFIED OVER AUTO-CREATE — it
//         keeps PR2's /v1/account/link as the SOLE account-creating
//         authority rather than duplicating that authority here.
//   503 — db_unavailable: store null (env-unset) OR a transient store throw
//         → retryable (R6 precedent, routes/account.ts round 6).
//
// A linked account with no save row is 200-with-defaults, NOT 404: 404 is
// reserved for account_not_linked, and a fresh account legitimately has
// zeros (they are the table defaults). Distinguishing them matters — the
// client's remedy for 404 (re-link) would be wrong for "no save yet".

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../clerk/requireAuth.js'
import type { AccountStore } from '../db/accountStore.js'
import type { PlayerSaveStore } from '../db/playerSaveStore.js'
import { parsePlayerSaveWrite } from '../validation/playerSave.js'

/** The wire shape of a save. `dailyStreak` is READ-only to the client:
 *  returned here, rejected in a PUT body. */
interface PlayerSaveResponse {
  trophies: number
  dailyStreak: number
  lastDailyAttempted: string | null
}

/** Defaults for a linked account that has never written a save. Mirrors the
 *  table's column defaults (db/schema.ts) — kept in sync deliberately, so a
 *  never-written account and a zero-written one are indistinguishable to
 *  the client, which is correct: both mean "no progression yet". */
const EMPTY_SAVE: PlayerSaveResponse = {
  trophies: 0,
  dailyStreak: 0,
  lastDailyAttempted: null,
}

/** UTC calendar date (YYYY-MM-DD) — matches contract/daily.ts's convention
 *  (`now().toISOString().slice(0, 10)`), so both date-bearing surfaces
 *  agree on what "today" means rather than each inventing a timezone. */
function isoDay(now: () => Date): string {
  return now().toISOString().slice(0, 10)
}

/** The calendar day before `iso` (UTC). */
function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** Server-derived daily streak — NEVER read from the request body.
 *
 *  Ratified rule (decision-log.md 2026-07-14 § "M2.1 PR3 PHASE 1 RATIFIED"):
 *  "always server-derived from lastDailyAttempted + the current server date
 *  (yesterday → +1; today → unchanged; else → reset to 1)". Anchored on what
 *  the server ALREADY knew (`prevLastDailyAttempted`) relative to its OWN
 *  today — never on a client-supplied date — which is what makes it
 *  cheat-resistant.
 *
 *  The null case is not covered by the ratified sentence and is resolved
 *  here: a save with no recorded attempt has no streak (0). Without this,
 *  PR3's own zero-push (`lastDailyAttempted: null`) would write a streak of
 *  1 while storing null — an incoherent row. This is the ONLY path PR3
 *  actually exercises; the +1/unchanged branches are dormant until a
 *  producer is wired. Flagged as a Phase-2 quirk: the ratified sentence is
 *  silent on null and on a client PUTting a stale (non-today) date.
 */
export function deriveDailyStreak(input: {
  prevLastDailyAttempted: string | null
  prevDailyStreak: number
  nextLastDailyAttempted: string | null
  serverToday: string
}): number {
  // No attempt recorded ⇒ no streak. PR3's live path.
  if (input.nextLastDailyAttempted === null) return 0
  // Already counted today — a same-day re-PUT must not double-count.
  if (input.prevLastDailyAttempted === input.serverToday) {
    return input.prevDailyStreak
  }
  // Continued from yesterday.
  if (input.prevLastDailyAttempted === previousDay(input.serverToday)) {
    return input.prevDailyStreak + 1
  }
  // Never attempted, or a gap ⇒ restart at 1.
  return 1
}

export interface PlayerSaveRouteDeps {
  readonly accounts: AccountStore | null
  readonly saves: PlayerSaveStore | null
  /** Injectable clock — tests assert streak derivation deterministically.
   *  Mirrors buildDailyContract's `now` seam (contract/daily.ts). */
  readonly now?: () => Date
}

export function registerPlayerSaveRoutes(
  app: FastifyInstance,
  deps: PlayerSaveRouteDeps,
): void {
  const now = deps.now ?? (() => new Date())

  app.get('/v1/player/save', { preHandler: requireAuth }, async (request, reply) => {
    const { accounts, saves } = deps
    if (accounts === null || saves === null) {
      return reply.status(503).send({ error: 'db_unavailable' })
    }
    // requireAuth guarantees a user; re-read for type-narrowing.
    const userId = request.auth.userId
    if (userId === null) {
      return reply.status(401).send({ error: 'auth_required' })
    }

    try {
      const account = await accounts.findByClerkUserId(userId)
      if (account === null) {
        return reply.status(404).send({ error: 'account_not_linked' })
      }
      const save = await saves.findByAccountId(account.id)
      // Never written ⇒ defaults, not 404 (see header).
      if (save === null) return reply.status(200).send(EMPTY_SAVE)
      return reply.status(200).send(toResponse(save))
    } catch (err) {
      request.log.error({ err }, 'player save read failure')
      return reply.status(503).send({ error: 'db_unavailable' })
    }
  })

  app.put('/v1/player/save', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = parsePlayerSaveWrite(request.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'invalid_body', issues: parsed.error.issues })
    }
    const { accounts, saves } = deps
    if (accounts === null || saves === null) {
      return reply.status(503).send({ error: 'db_unavailable' })
    }
    const userId = request.auth.userId
    if (userId === null) {
      return reply.status(401).send({ error: 'auth_required' })
    }

    const serverToday = isoDay(now)
    const { trophies, lastDailyAttempted } = parsed.data

    // A future attempt date is not a real attempt — reject rather than let
    // it seed a streak. Cheap anti-cheat on the one client-settable date;
    // the streak itself is server-derived regardless.
    if (lastDailyAttempted !== null && lastDailyAttempted > serverToday) {
      return reply.status(400).send({
        error: 'invalid_body',
        issues: [
          {
            path: ['lastDailyAttempted'],
            message: 'lastDailyAttempted is in the future',
          },
        ],
      })
    }

    try {
      const account = await accounts.findByClerkUserId(userId)
      if (account === null) {
        return reply.status(404).send({ error: 'account_not_linked' })
      }

      const prev = await saves.findByAccountId(account.id)
      const dailyStreak = deriveDailyStreak({
        prevLastDailyAttempted: prev?.lastDailyAttempted ?? null,
        prevDailyStreak: prev?.dailyStreak ?? 0,
        nextLastDailyAttempted: lastDailyAttempted,
        serverToday,
      })

      // Upsert, not insert-then-update: a concurrent first write must not
      // 500 on the PK (R2 precedent).
      const saved = await saves.upsert({
        accountId: account.id,
        trophies,
        dailyStreak,
        lastDailyAttempted,
      })
      return reply.status(200).send(toResponse(saved))
    } catch (err) {
      request.log.error({ err }, 'player save write failure')
      return reply.status(503).send({ error: 'db_unavailable' })
    }
  })
}

function toResponse(save: {
  trophies: number
  dailyStreak: number
  lastDailyAttempted: string | null
}): PlayerSaveResponse {
  return {
    trophies: save.trophies,
    dailyStreak: save.dailyStreak,
    lastDailyAttempted: save.lastDailyAttempted,
  }
}
