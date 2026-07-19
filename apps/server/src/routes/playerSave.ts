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
//   400 — invalid_body. Includes a body carrying `dailyStreak` or the retired
//         `trophies` field (.strict() rejects unknown keys — both are
//         server-owned, never client-settable). NOTE (CF-68 PR-A, PA9): the old
//         "`lastDailyAttempted` must be server-today" 400 is REMOVED — that
//         field is accepted-and-unread (PA1 / PA8), so a stale daily identity
//         fails the match in the store and the push SUCCEEDS (PA6), never 400s.
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
import { buildDailyContract } from '../contract/daily.js'
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

// CF-68 PR-A (PA7 / TT1): `deriveDailyStreak` + `previousDay` RELOCATED into
// db/playerSaveStore.ts — the streak is now derived INSIDE the store's
// transaction from server-verified daily participation, not in the route. The
// route no longer computes the streak, reads a prior save row for it, or reads
// the client's daily-attempt claim. See decision-log.md 2026-07-18 § "CF-68 PR-A
// test-topology dispositions RATIFIED" (TT1).

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
    // CF-68 PR-A: re-derive the server's daily identity for today (PA4 / PA10) and
    // FORWARD the request's daily-identity claim + this ground truth to the store,
    // which does the equality check inside the transaction. `lastDailyAttempted` is
    // DELIBERATELY not destructured — the schema accepts it (PA1 / PA8) but it is
    // READ NOWHERE; the streak is server-derived from participation.
    const serverDaily = buildDailyContract(now)
    const { runId, round, roundOutcome, dailyContractId, dailyDate } = parsed.data

    // PA9 (ratified — do NOT restore): the old server-date gate that 400'd a
    // `lastDailyAttempted !== serverToday` is GONE. It bounded a TRUSTED field;
    // that field is no longer read, so the gate could only 400 an honest client
    // carrying a stale date (a tab left open past midnight). A stale daily identity
    // now simply fails the match in the store and the round push SUCCEEDS (PA6).
    // See decision-log.md 2026-07-18 § "CF-68 PR-A dispositions AMENDED …" (PA9)
    // and § "CF-68 PR-A test-topology dispositions RATIFIED" (TT3).

    try {
      const account = await accounts.findByClerkUserId(userId)
      if (account === null) {
        return reply.status(404).send({ error: 'account_not_linked' })
      }

      // Delta trust-model (CF-77) + daily participation (CF-68 PR-A). The store
      // computes the trophy delta AND — on a verified daily-identity match — writes
      // participation and DERIVES the streak, all under one row lock (PA3–PA7). The
      // route no longer derives the streak or reads a prior row for it.
      const saved = await saves.applyRoundResult({
        accountId: account.id,
        runId,
        round,
        roundOutcome,
        dailyContractId: dailyContractId ?? null,
        dailyDate: dailyDate ?? null,
        serverToday,
        serverDailyContractId: serverDaily.contractId,
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
