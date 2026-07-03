// Shared test helpers (M1.5c PR 2 / CF 49).
//
// - makeFakeSink(): a network-free TelemetrySink recording every
//   capture() + shutdown(), injected via createApp({ posthog }).
// - allVariantPayloads(): one FULL canonical payload per TelemetryEvent
//   variant (all 20). "Full" is load-bearing — the dropped-property
//   runtime gate relies on .strict() rejecting a payload that carries a
//   field the schema (wrongly) dropped, so every property must be
//   present here.

import type { TelemetrySink } from '../posthog/client.js'

export interface CapturedCall {
  distinctId: string
  event: string
  properties: Record<string, unknown>
  timestamp?: Date
}

export interface FakeSink {
  sink: TelemetrySink
  captures: CapturedCall[]
  shutdownCount: () => number
}

/** A TelemetrySink that records calls in memory — no network, no timers. */
export function makeFakeSink(): FakeSink {
  const captures: CapturedCall[] = []
  let shutdowns = 0
  const sink: TelemetrySink = {
    capture(message) {
      captures.push(message)
    },
    async shutdown() {
      shutdowns += 1
    },
  }
  return { sink, captures, shutdownCount: () => shutdowns }
}

// Stable wire-shape fixtures. tsClient is a valid ISO 8601 string (the
// client always re-stamps via toISOString at emit; emit.ts:162).
export const TS_CLIENT = '2026-05-23T18:00:00.000Z'
export const SESSION_ID = 'sess-abc'

function base(): { tsClient: string; sessionId: string } {
  return { tsClient: TS_CLIENT, sessionId: SESSION_ID }
}

/** One full canonical payload per variant (20 total), as wire JSON. */
export function allVariantPayloads(): Array<Record<string, unknown>> {
  return [
    { ...base(), name: 'run_start', runId: 'run-1', classId: 'tinker', contractId: 'neutral', seed: 12345, startingRelicId: 'iron_will', entryMode: 'class_select' },
    { ...base(), name: 'run_end', runId: 'run-1', outcome: 'abandoned', roundReached: 5, heartsRemaining: 2 },
    { ...base(), name: 'round_start', runId: 'run-1', round: 3, hearts: 3, gold: 10, itemsInBag: 6 },
    { ...base(), name: 'round_end', runId: 'run-1', round: 3, outcome: 'win', damageDealt: 40, damageTaken: 12 },
    { ...base(), name: 'shop_purchase', runId: 'run-1', round: 3, itemId: 'short_sword', cost: 3 },
    { ...base(), name: 'shop_sell', runId: 'run-1', round: 3, itemId: 'short_sword', recovered: 1 },
    { ...base(), name: 'shop_reroll', runId: 'run-1', round: 3, cost: 1, rerollIndex: 2 },
    { ...base(), name: 'item_placed', runId: 'run-1', itemId: 'short_sword', placementId: 'pl-1', anchor: { col: 0, row: 0 }, rotation: 0 },
    { ...base(), name: 'item_rotated', runId: 'run-1', placementId: 'pl-1', newRotation: 90 },
    { ...base(), name: 'item_moved', runId: 'run-1', placementId: 'pl-1', newAnchor: { col: 1, row: 2 } },
    { ...base(), name: 'recipe_completed', runId: 'run-1', recipeId: 'sharpen', round: 4 },
    { ...base(), name: 'relic_granted', runId: 'run-1', slot: 'mid', relicId: 'razors_edge', round: 6 },
    { ...base(), name: 'combat_start', runId: 'run-1', round: 3, opponentGhostId: null },
    { ...base(), name: 'combat_end', runId: 'run-1', round: 3, outcome: 'player_win', endedAtTick: 120, damageDealt: 40, damageTaken: 12 },
    { ...base(), name: 'tutorial_step_reached', stepId: 'tut_class_select' },
    { ...base(), name: 'tutorial_completed' },
    { ...base(), name: 'tutorial_abandoned', stepId: 'tut_round_1_arrange' },
    { ...base(), name: 'daily_contract_started', contractId: 'daily_2026_05_23', date: '2026-05-23' },
    { ...base(), name: 'daily_contract_completed', contractId: 'daily_2026_05_23', date: '2026-05-23', outcome: 'won' },
    { ...base(), name: 'error_boundary_caught', errorMessage: 'boom', componentStack: 'at <App>' },
  ]
}

/** A client-default-transport-shaped batch (anonId + clientVersion +
 *  events). Default events are a representative mix. */
export function makeBatch(
  events: Array<Record<string, unknown>>,
  overrides: { anonId?: string; clientVersion?: string } = {},
): Record<string, unknown> {
  return {
    anonId: overrides.anonId ?? 'anon-xyz',
    clientVersion: overrides.clientVersion ?? 'm1.5c-pr1',
    events,
  }
}
