// Pure unit test for deriveDailyStreak (CF-68 PR-A / TT1).
//
// deriveDailyStreak was RELOCATED here from routes/playerSave.ts (PA7) — the
// function BODY is byte-unchanged, but it had NO dedicated unit test: its only
// coverage was route-integration tests driving it via the client-supplied
// lastDailyAttempted, the exact path this PR removed (decision-log.md 2026-07-18
// § "CF-68 PR-A test-topology dispositions RATIFIED", TT1). This is that
// coverage, EXTRACTED: the five branches asserted directly against the pure
// function — including the two now-dead branches, LABELLED retained-dead.

import { describe, expect, it } from 'vitest'
import { deriveDailyStreak } from './playerSaveStore.js'

const TODAY = '2026-07-15'
const YESTERDAY = '2026-07-14'

describe('deriveDailyStreak (pure branch logic)', () => {
  it('yesterday → +1 (continued streak)', () => {
    expect(
      deriveDailyStreak({
        prevLastDailyAttempted: YESTERDAY,
        prevDailyStreak: 4,
        nextLastDailyAttempted: TODAY,
        serverToday: TODAY,
      }),
    ).toBe(5)
  })

  it('today → unchanged (a same-day re-derive must not double-count)', () => {
    expect(
      deriveDailyStreak({
        prevLastDailyAttempted: TODAY,
        prevDailyStreak: 4,
        nextLastDailyAttempted: TODAY,
        serverToday: TODAY,
      }),
    ).toBe(4)
  })

  it('gap → reset to 1', () => {
    expect(
      deriveDailyStreak({
        prevLastDailyAttempted: '2026-07-01',
        prevDailyStreak: 9,
        nextLastDailyAttempted: TODAY,
        serverToday: TODAY,
      }),
    ).toBe(1)
  })

  it('never attempted (prev null) → 1', () => {
    expect(
      deriveDailyStreak({
        prevLastDailyAttempted: null,
        prevDailyStreak: 0,
        nextLastDailyAttempted: TODAY,
        serverToday: TODAY,
      }),
    ).toBe(1)
  })

  // ── RETAINED-DEAD branches (PA3 / TT1 / CF-82) ──
  // Under PA3 the store calls deriveDailyStreak ONLY on a daily-identity MATCH,
  // which requires dailyDate === serverToday, so `nextLastDailyAttempted` is
  // ALWAYS a non-null value equal to `serverToday`. The two branches below are
  // therefore PRODUCTION-UNREACHABLE. They are retained (byte-unchanged body) and
  // asserted here so the logic stays covered — a future reader must NOT treat
  // branch 1 as a live "no attempt" path and wire a null into it. CF-82 may
  // revisit their removal (decision-log.md 2026-07-18 § "CF-68 PR-A test-topology
  // dispositions RATIFIED", TT1).
  it('RETAINED-DEAD (branch 1, PA3/CF-82): next-attempt null → 0', () => {
    expect(
      deriveDailyStreak({
        prevLastDailyAttempted: YESTERDAY,
        prevDailyStreak: 9,
        nextLastDailyAttempted: null,
        serverToday: TODAY,
      }),
    ).toBe(0)
  })

  it('RETAINED-DEAD (branch 2, PA3/CF-82): attempt !== serverToday → prev unchanged', () => {
    expect(
      deriveDailyStreak({
        prevLastDailyAttempted: YESTERDAY,
        prevDailyStreak: 7,
        nextLastDailyAttempted: '2026-07-16',
        serverToday: TODAY,
      }),
    ).toBe(7)
  })
})
