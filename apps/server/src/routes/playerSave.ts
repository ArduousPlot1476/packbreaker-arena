// GET/PUT /v1/player/save (M2.1 PR3).
//
// Meta-progression sync. Per decision-log.md 2026-07-14 § "M2.1 PR3 PHASE 1
// RATIFIED", tech-architecture.md § 6.2's `GET/POST /v1/run/save` is RENAMED
// here: the old name was actively wrong for this surface — `inProgressRun`
// is device-local by ratification, so nothing "run"-shaped is stored
// server-side. This route stores meta-progression only.
//
// TRUST MODEL — DELTA (CF-77 Phase 2 PR1). The PUT no longer accepts a trophy
// value. The client reports one completed round (runId / round / roundOutcome)
// and the SERVER computes the trophy delta via trophyDeltaFor, applied under a
// round-ordering guard in db/playerSaveStore.ts applyRoundResult. See
// decision-log.md 2026-07-17 § "CF-77 Phase 1 RATIFIED".
//
// PR1 is SERVER-ONLY and deliberately breaks the wire contract in the interim:
// the client caller (usePlayerSavePush) still sends the old {trophies, …} body
// until CF-77 Phase 2 PR2 wires the producer + mints the per-run uuid, so
// between this merge and PR2 a client PUT 400s on the new .strict() shape.
// Same plumbing-ahead-of-caller shape as CF-75/76 (decision-log.md 2026-07-16
// § "CF-75 + CF-76 Phase 1 RATIFIED").
//
// Status map (mirrors routes/account.ts):
//   200 — GET: the save (defaults for an account that has never written).
//         PUT: the persisted row.
//   400 — invalid_body. Includes a body carrying `dailyStreak` (.strict()
//         rejects it — the field is server-derived, never client-settable)
//         and any `lastDailyAttempted` that is not the current server date
//         (see the streak-inflation note below).
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
 *  today.
 *
 *  ⚠ CF-76 — THIS IS BOUNDED, **NOT** CHEAT-RESISTANT. Read before "hardening"
 *  it. The ratification (and § 7.2, since corrected) called this
 *  cheat-resistant; that was overstated, and Codex round 4 (PR \#45) showed
 *  why: `nextLastDailyAttempted` is CLIENT-SUPPLIED, so a caller can assert
 *  "I attempted today" without attempting anything and mint one increment per
 *  server day. The route's server-date gate CAPS that exposure at +1/day
 *  (pre-gate it was unbounded — alternating stale/today writes ran a streak
 *  2→3→4→5→6 within one day), but a cap is not immunity.
 *
 *  Real cheat-resistance needs SERVER-SIDE EVIDENCE of participation (a
 *  verified daily-completion event), which does not exist yet — the client
 *  does not even fetch /v1/contract/daily (CF-68). Deferred to CF-76, sibling
 *  to CF-77's trophy trust-model. The trophy leg has since been resolved (Delta,
 *  CF-77 Phase 2); the daily leg's evidence mechanism is still open — whoever
 *  wires CF-68's client fetch must land the server-side participation evidence
 *  in the same PR (CF-68 AMENDED). Shipping a naive "PUT today's date" caller
 *  activates a known gap rather than discovering one.
 *
 *  The null case is not covered by the ratified sentence and is resolved
 *  here: a save with no recorded attempt has no streak (0). Without this,
 *  PR3's own zero-push (`lastDailyAttempted: null`) would write a streak of
 *  1 while storing null — an incoherent row. This is the ONLY path PR3
 *  actually exercises; the +1/unchanged branches are dormant until a
 *  producer is wired.
 *
 *  The stale-date case IS now resolved (Codex round 2, P1): the route rejects
 *  any non-null value that is not `serverToday` with a 400, so a stale date is
 *  never persisted and the "+1 from yesterday" branch cannot be re-armed. The
 *  guard below is defence in depth for a caller that skips the route gate —
 *  the exploit's damage came from PERSISTING the stale date, so the route is
 *  the load-bearing half, but a derivation that silently trusts a stale claim
 *  is exactly the assumption class Rule 4 exists for.
 */
export function deriveDailyStreak(input: {
  prevLastDailyAttempted: string | null
  prevDailyStreak: number
  nextLastDailyAttempted: string | null
  serverToday: string
}): number {
  // No attempt recorded ⇒ no streak. PR3's live path.
  if (input.nextLastDailyAttempted === null) return 0
  // Defence in depth: an attempt that is not TODAY is not a real attempt.
  // Unreachable through the route (400), so never advance a streak on it.
  if (input.nextLastDailyAttempted !== input.serverToday) {
    return input.prevDailyStreak
  }
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
    const { runId, round, roundOutcome, lastDailyAttempted } = parsed.data

    // A non-null attempt MUST be the current server date. You can only attempt
    // the daily *now*, so "I attempted on date X" is only meaningful for
    // X = today; a future date is not a real attempt and a past date is a
    // claim about a day that has already closed.
    //
    // THIS IS THE FIX FOR THE STREAK-INFLATION EXPLOIT (Codex round 2, P1).
    // Previously only FUTURE dates were rejected, so a client could persist a
    // STALE date and re-arm the "+1 from yesterday" branch on demand:
    //   PUT 07-14 (stored: 07-14) → PUT 07-15 (prev=07-14=yesterday ⇒ +1)
    //   PUT 07-14 (prev=07-15=today ⇒ streak kept, but 07-14 is RE-STORED)
    //   PUT 07-15 (prev=07-14=yesterday ⇒ +1 again) …
    // Proven to run 2→3→4→5→6 on a single server day. The regression of the
    // STORED date is what re-arms the branch, so the fix is to refuse to
    // persist a stale date at all — not merely to leave the streak unchanged.
    // With this gate the stored date can only ever be a date that WAS today
    // when it was written, so it can never regress within a server day.
    if (lastDailyAttempted !== null && lastDailyAttempted !== serverToday) {
      return reply.status(400).send({
        error: 'invalid_body',
        issues: [
          {
            path: ['lastDailyAttempted'],
            message: `lastDailyAttempted must be the current server date (${serverToday}) or null`,
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

      // Delta trust-model (CF-77 Phase 2): hand the completed round to the
      // store, which computes the trophy delta via trophyDeltaFor and applies
      // it under the round-ordering guard (row-locked, Form ①). `dailyStreak`
      // is the server-derived value above; the store writes it unconditionally.
      // Returns the row with the new ABSOLUTE trophy total for the response.
      const saved = await saves.applyRoundResult({
        accountId: account.id,
        runId,
        round,
        roundOutcome,
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
