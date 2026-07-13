// Daily contract generator (M2 PR1).
//
// tech-architecture.md § 6.1 specs "a tiny in-memory daily contract
// registry seeded at deploy." No dynamic contract generator exists in the
// content package (the client has always run the neutral contract), so
// this builds the M2 daily response from the single authored daily
// contract — CONTRACTS['daily-placeholder'], the only isDaily entry —
// plus a date-stable seed. roadmap.md caps M2 at ONE daily contract type,
// so a fixed contract + per-day seed is the whole surface.
//
// The seed is derived deterministically from the ISO date (FNV-1a → 32-bit
// unsigned) so every client hitting the endpoint on the same UTC day runs
// the same board — the precondition for a shared daily leaderboard
// (gdd.md § 10). The clock is injectable so tests assert a fixed date/seed.

import {
  CONTRACTS,
  ContractId,
  IsoDate,
  SimSeed,
  type DailyContractResponse,
} from '@packbreaker/content'

/** The sole authored daily contract (isDaily: true). */
const DAILY_CONTRACT_ID = ContractId('daily-placeholder')

/** FNV-1a 32-bit hash of the ISO date → a stable mulberry32-domain seed.
 *  Integer math only (Math.imul for the 32-bit multiply); result is an
 *  unsigned 32-bit int, matching SimSeed's domain. */
export function seedForDate(isoDate: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < isoDate.length; i += 1) {
    hash ^= isoDate.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Builds today's daily contract response. `now` is injectable so tests
 *  assert a deterministic date + seed. */
export function buildDailyContract(
  now: () => Date = () => new Date(),
): DailyContractResponse {
  const isoDate = now().toISOString().slice(0, 10)
  return {
    date: IsoDate(isoDate),
    contractId: DAILY_CONTRACT_ID,
    contract: CONTRACTS[DAILY_CONTRACT_ID],
    seed: SimSeed(seedForDate(isoDate)),
  }
}
