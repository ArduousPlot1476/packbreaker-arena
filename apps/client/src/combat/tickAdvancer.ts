// Pure tick-advance + fast-forward math for the Phaser combat scene.
//
// Extracted from CombatScene.ts (M1.3.4b step 4 halt-gate fix) so the
// tick clock and silent-fast-forward logic are testable without
// instantiating Phaser. The scene wraps these helpers; behavioral
// parity with sim outcomes (HP arithmetic, end-of-combat detection,
// event ordering) is enforced by the helper's return shape.
//
// Background — the failed M1.3.4b step 4 halt-gate:
// Round 1 with empty player bag + a passive ghost item produces a
// 600-tick / 60-wall-clock-second sparse combat. The diagnostic pass
// confirmed the scene was healthy — game loop, accumulator math, tick
// rate, event flush all working — but the combat was visually
// "frozen" because long gaps between events meant 60 seconds of HP
// bars not moving. Fix: fast-forward dead time to a small pre-event
// lead-in so each event still feels intentional, but absolute gaps
// compress.

import type { CombatEvent } from '@packbreaker/content';

export interface AdvanceTickInput {
  /** Current tick the scene is at, BEFORE this update step. */
  readonly currentTick: number;
  /** Accumulated wall-clock ms since the last tick fired. */
  readonly accumulator: number;
  /** Wall-clock ms elapsed since the last update() call. */
  readonly delta: number;
  /** Wall-clock ms per sim tick (1000 / TICKS_PER_SECOND = 100 in M1). */
  readonly msPerTick: number;
  /** result.endedAtTick from sim. Combat resolves at this tick. */
  readonly endedAtTick: number;
  /** First tick > currentTick at which an event fires; null if no more
   *  events. The scene computes this from its eventIdx pointer. */
  readonly nextEventTick: number | null;
  /** Wall-clock gap (in ticks) between currentTick and the next event
   *  that triggers fast-forward. Tunable starting value; tune via
   *  telemetry once tick-cap-draw rate dashboard exists. */
  readonly deadTimeThresholdTicks: number;
  /** Lead-in retained before the next event when fast-forwarding so
   *  the event has windup. */
  readonly leadInTicks: number;
}

export interface AdvanceTickResult {
  /** Tick the scene should be at after this update step. */
  readonly newTick: number;
  /** Carry-over accumulator for the next frame. */
  readonly newAccumulator: number;
  /** List of ticks that fired during this update, in order. The scene
   *  applies events at each tick before stepping to the next. Empty if
   *  this frame fast-forwarded (no events fired during the snap). */
  readonly ticksAdvanced: ReadonlyArray<number>;
  /** True iff this frame snap-jumped past dead time. The scene may use
   *  this for the optional `>>` indicator (deferred polish per
   *  M1.3.4b step 1). */
  readonly fastForwarded: boolean;
  /** True iff currentTick stepped past endedAtTick + 1 — the scene
   *  switches to the resolved/settle branch. */
  readonly reachedEnd: boolean;
}

/** Decides the next tick state given the current state + this frame's
 *  delta. Pure function; no scene access, no global state, no Phaser.
 *
 *  Two modes (mutually exclusive per call):
 *    1. Fast-forward — if the gap to the next event (or to endedAtTick
 *       if no more events) exceeds deadTimeThresholdTicks, snap
 *       currentTick to (target - leadInTicks) and reset accumulator.
 *       No tick events fire this frame (we know the gap is empty).
 *    2. Normal advance — accumulate delta into the accumulator and
 *       advance one tick at a time while accumulator >= msPerTick.
 *       Each crossed tick goes into ticksAdvanced. */
export function advanceCombatTickClock(input: AdvanceTickInput): AdvanceTickResult {
  const {
    currentTick,
    accumulator,
    delta,
    msPerTick,
    endedAtTick,
    nextEventTick,
    deadTimeThresholdTicks,
    leadInTicks,
  } = input;

  // Fast-forward path. Target is the next event tick, or endedAtTick if
  // we've already flushed every event. If currentTick is already within
  // leadInTicks of target, no snap (target - leadIn <= currentTick).
  const target = nextEventTick ?? endedAtTick;
  if (target - currentTick > deadTimeThresholdTicks) {
    const snapped = target - leadInTicks;
    return {
      newTick: snapped,
      newAccumulator: 0,
      ticksAdvanced: [],
      fastForwarded: true,
      reachedEnd: false,
    };
  }

  // Normal advance path. Accumulator math identical to the pre-fix
  // M1.3.4b update() loop — only the helper extraction is new.
  let newAccumulator = accumulator + delta;
  let newTick = currentTick;
  const ticksAdvanced: number[] = [];
  while (newAccumulator >= msPerTick && newTick <= endedAtTick + 1) {
    newAccumulator -= msPerTick;
    newTick += 1;
    ticksAdvanced.push(newTick);
  }

  return {
    newTick,
    newAccumulator,
    ticksAdvanced,
    fastForwarded: false,
    reachedEnd: newTick > endedAtTick + 1,
  };
}

/** Returns the tick of the first unflushed event (events[startIdx]),
 *  or null if no events remain. The caller (CombatScene.update) flushes
 *  events at the current tick BEFORE calling this, so the returned
 *  tick is guaranteed > currentTick. O(1). */
export function findNextEventTick(
  events: ReadonlyArray<CombatEvent>,
  startIdx: number,
): number | null {
  if (startIdx < events.length) {
    return events[startIdx]!.tick;
  }
  return null;
}
