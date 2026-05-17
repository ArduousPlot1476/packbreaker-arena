// Run-end detection helper. Pure mirror — outcome resolution lives in
// sim; client does not re-derive. Closes CF 21 detection-side.
// Resolution-side UX (post-run summary, trophy update, replay) stays open
// for 5b.2.
//
// Sim's RunState exposes `outcome` (RunOutcome literal) but NOT `phase`
// (RunPhase lives only on the RunController instance via getPhase(),
// not in the serialized RunState snapshot — verified against
// packages/content/src/schemas.ts § RunState at M1.5a PR 3 Phase 2b).
// Sim's endRun atomically sets phase='ended' alongside outcome !==
// 'in_progress', so reading outcome is semantically equivalent to
// reading phase === 'ended' but matches the field actually serialized.
//
// Structural parameter (not full RunState): both sim's RunState and the
// client's ClientRunState.state mirror have a `outcome: RunOutcome`
// field. Narrowing the param lets useRun call this against
// state.state.outcome directly (no simRun.getState() per render) and
// tests fixture in either shape.

import type { RunOutcome } from '@packbreaker/content'

export function mirrorsSimShouldEndRun(state: { readonly outcome: RunOutcome }): boolean {
  return state.outcome !== 'in_progress'
}
