// Aggregation + text report.
//
// Two rules the output enforces on itself, because getting them wrong is how a
// harness number ends up in a decision it shouldn't have informed:
//
//   [EXACT]           Facts about the game. Win/draw rates, endReason mix,
//                     combat length, playback seconds, empty rounds. These
//                     depend on content and sim, not on how the bot plays.
//
//   [POLICY-RELATIVE] Facts about the BOT. Item pick rate above all. `greedy`
//                     buys the first affordable slot; `hoarder` buys max rarity.
//                     balance-bible section 16's 2%/35% thresholds are defined
//                     against PLAYER telemetry and must never be read against
//                     these. What the bot IS authoritative on is reachability —
//                     an item never offered, or never affordable when offered —
//                     and the DELTA under a fixed policy across two revisions.

import type { RunRecord } from './realplay.ts';

export interface Report {
  readonly meta: {
    readonly gitSha: string;
    readonly seeds: number;
    readonly policies: ReadonlyArray<string>;
    readonly runs: number;
    /** Ruleset knobs this report was swept with. Part of the population's
     *  identity: two reports run under different rules are not comparable, and
     *  formatDiff refuses rather than producing a plausible-looking delta. */
    readonly overrides: Readonly<Record<string, number>>;
    readonly label: string | null;
    readonly elapsedMs: number;
  };
  readonly perRound: ReadonlyArray<RoundAgg>;
  readonly overall: {
    readonly combats: number;
    readonly drawRatePct: number;
    readonly inertRatePct: number;
    readonly drawsInertPct: number;
    readonly endReasons: Readonly<Record<string, number>>;
    readonly medianRoundsReached: number;
    readonly outcomes: Readonly<Record<string, number>>;
    readonly meanPlaybackSecPerRun: number;
    readonly meanEmptyRoundsPerRun: number;
    readonly classWinRatePct: Readonly<Record<string, number>>;
    readonly recipesCompletedPerRun: number;
  };
  /** POLICY-RELATIVE. Reachability + differential only. */
  readonly itemReach: ReadonlyArray<{
    readonly itemId: string;
    readonly offered: number;
    readonly purchased: number;
    readonly purchaseRatePct: number;
  }>;
}

export interface RoundAgg {
  readonly round: number;
  readonly combats: number;
  readonly winPct: number;
  readonly drawPct: number;
  readonly lossPct: number;
  readonly medianTicks: number;
  readonly meanPlaybackSec: number;
  readonly meanLiveOffers: number;
  readonly emptyRoundPct: number;
  /** Items the bot actually bought this round, and gold it was still holding at
   *  combat. Together these say whether a gold change reached the bag at all —
   *  raising income does nothing if the policy never spends it. */
  readonly meanPurchases: number;
  readonly meanGoldHeld: number;
  readonly meanBagCells: number;
  /** Combats where NEITHER side dealt a single point of item damage. The cause
   *  of the draw band, not a restatement of it. */
  readonly inertPct: number;
  /** Of the draws in this round, how many were inert stalls. Separates "nobody
   *  could kill anybody" from "the ramp erased a real lead" — two different
   *  problems needing two different fixes. */
  readonly drawsInertPct: number;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2);
}

const pct = (n: number, d: number): number => (d === 0 ? 0 : Math.round((n / d) * 1000) / 10);

/** A round that presented at most one affordable-and-placeable offer and no
 *  ready recipe. The player spent time and made no decision. This is the pacing
 *  instrument — no telemetry, no calibration, no wall clock. */
function isEmptyRound(r: { liveOffers: number; readyRecipes: number }): boolean {
  return r.liveOffers <= 1 && r.readyRecipes === 0;
}

export function aggregate(runs: RunRecord[], meta: Omit<Report['meta'], 'runs'>): Report {
  const maxRound = 11;
  const perRound: RoundAgg[] = [];

  for (let round = 1; round <= maxRound; round++) {
    const rs = runs.flatMap((run) => run.rounds.filter((r) => r.round === round));
    if (rs.length === 0) continue;
    const draws = rs.filter((r) => r.outcome === 'draw');
    perRound.push({
      round,
      combats: rs.length,
      winPct: pct(rs.filter((r) => r.outcome === 'player_win').length, rs.length),
      drawPct: pct(draws.length, rs.length),
      lossPct: pct(rs.filter((r) => r.outcome === 'ghost_win').length, rs.length),
      inertPct: pct(rs.filter((r) => r.bothSidesInert).length, rs.length),
      drawsInertPct: pct(draws.filter((r) => r.bothSidesInert).length, draws.length),
      medianTicks: median(rs.map((r) => r.endedAtTick)),
      meanPlaybackSec:
        Math.round((rs.reduce((a, r) => a + r.playbackMs, 0) / rs.length / 1000) * 10) / 10,
      meanLiveOffers:
        Math.round((rs.reduce((a, r) => a + r.liveOffers, 0) / rs.length) * 10) / 10,
      emptyRoundPct: pct(rs.filter(isEmptyRound).length, rs.length),
      meanPurchases:
        Math.round(
          (rs.reduce(
            (a, r) => a + Object.values(r.purchasesByRarity).reduce((x, y) => x + y, 0),
            0,
          ) /
            rs.length) *
            100,
        ) / 100,
      meanGoldHeld:
        Math.round((rs.reduce((a, r) => a + r.goldHeldAtCombat, 0) / rs.length) * 10) / 10,
      meanBagCells:
        Math.round((rs.reduce((a, r) => a + r.bagCellsUsed, 0) / rs.length) * 10) / 10,
    });
  }

  const allRounds = runs.flatMap((r) => r.rounds);
  const allDraws = allRounds.filter((r) => r.outcome === 'draw');
  const endReasons: Record<string, number> = {};
  for (const r of allRounds) endReasons[r.endReason] = (endReasons[r.endReason] ?? 0) + 1;
  const outcomes: Record<string, number> = {};
  for (const r of runs) outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;

  const classWinRatePct: Record<string, number> = {};
  for (const cls of new Set(runs.map((r) => r.classId))) {
    const rs = runs.filter((r) => r.classId === cls).flatMap((r) => r.rounds);
    classWinRatePct[cls] = pct(rs.filter((r) => r.outcome === 'player_win').length, rs.length);
  }

  const offered: Record<string, number> = {};
  const purchased: Record<string, number> = {};
  for (const run of runs) {
    for (const id of run.itemsOffered) offered[id] = (offered[id] ?? 0) + 1;
    for (const id of run.itemsPurchased) purchased[id] = (purchased[id] ?? 0) + 1;
  }
  const itemReach = Object.keys(offered)
    .concat(Object.keys(purchased).filter((k) => offered[k] === undefined))
    .map((itemId) => ({
      itemId,
      offered: offered[itemId] ?? 0,
      purchased: purchased[itemId] ?? 0,
      purchaseRatePct: pct(purchased[itemId] ?? 0, offered[itemId] ?? 0),
    }))
    .sort((a, b) => a.purchaseRatePct - b.purchaseRatePct);

  return {
    meta: { ...meta, runs: runs.length },
    perRound,
    overall: {
      combats: allRounds.length,
      drawRatePct: pct(allDraws.length, allRounds.length),
      inertRatePct: pct(allRounds.filter((r) => r.bothSidesInert).length, allRounds.length),
      drawsInertPct: pct(allDraws.filter((r) => r.bothSidesInert).length, allDraws.length),
      endReasons,
      medianRoundsReached: median(runs.map((r) => r.roundsReached)),
      outcomes,
      meanPlaybackSecPerRun:
        Math.round(
          (runs.reduce((a, r) => a + r.rounds.reduce((x, y) => x + y.playbackMs, 0), 0) /
            Math.max(1, runs.length) /
            1000) *
            10,
        ) / 10,
      meanEmptyRoundsPerRun:
        Math.round(
          (runs.reduce((a, r) => a + r.rounds.filter(isEmptyRound).length, 0) /
            Math.max(1, runs.length)) *
            10,
        ) / 10,
      classWinRatePct,
      recipesCompletedPerRun:
        Math.round(
          (runs.reduce((a, r) => a + r.recipesCompleted.length, 0) / Math.max(1, runs.length)) * 100,
        ) / 100,
    },
    itemReach,
  };
}

export function formatReport(r: Report): string {
  const L: string[] = [];
  L.push(`BALANCE REPORT  ${r.meta.gitSha}${r.meta.label === null ? '' : `  [${r.meta.label}]`}`);
  L.push(
    `${r.meta.runs} runs · ${r.meta.seeds} seeds × 2 classes × ${r.meta.policies.length} policies · ${(r.meta.elapsedMs / 1000).toFixed(1)}s`,
  );
  L.push(`policies: ${r.meta.policies.join(', ')}`);
  const ov = Object.entries(r.meta.overrides ?? {});
  L.push(
    ov.length === 0
      ? 'ruleset:  SHIPPED (no overrides)'
      : `ruleset:  OVERRIDDEN — ${ov.map(([k, v]) => `${k}=${v}`).join(' ')}`,
  );
  L.push('');
  L.push('[EXACT] per round');
  L.push(
    '  rd   n     win%    draw%   loss%   inert%  medTick  playSec  bought  gold  cells  empty%',
  );
  for (const a of r.perRound) {
    L.push(
      `  ${String(a.round).padStart(2)}  ${String(a.combats).padStart(4)}  ` +
        `${a.winPct.toFixed(1).padStart(6)}  ${a.drawPct.toFixed(1).padStart(6)}  ` +
        `${a.lossPct.toFixed(1).padStart(6)}  ${a.inertPct.toFixed(1).padStart(6)}  ` +
        `${String(a.medianTicks).padStart(7)}  ` +
        `${a.meanPlaybackSec.toFixed(1).padStart(7)}  ${a.meanPurchases.toFixed(2).padStart(6)}  ` +
        `${a.meanGoldHeld.toFixed(1).padStart(4)}  ${a.meanBagCells.toFixed(1).padStart(5)}  ` +
        `${a.emptyRoundPct.toFixed(1).padStart(6)}`,
    );
  }
  L.push('  inert% = neither side dealt ANY item damage (ramp drain excluded)');
  L.push('  bought = items bought THIS round · gold = gold still held at combat');
  L.push('');
  L.push('[EXACT] overall');
  L.push(`  combats                 ${r.overall.combats}`);
  L.push(
    `  draw rate               ${r.overall.drawRatePct}%   (balance-bible section 2 guardrail: <1%)`,
  );
  L.push(
    `  inert combats           ${r.overall.inertRatePct}%   (neither side dealt any item damage)`,
  );
  L.push(
    `  ...of draws, inert      ${r.overall.drawsInertPct}%   (rest are the ramp erasing a real lead)`,
  );
  L.push(`  endReason               ${JSON.stringify(r.overall.endReasons)}`);
  L.push(`  median rounds reached   ${r.overall.medianRoundsReached} / 11`);
  L.push(`  run outcomes            ${JSON.stringify(r.overall.outcomes)}`);
  L.push(`  playback sec / run      ${r.overall.meanPlaybackSecPerRun}   (combat only, exact)`);
  L.push(
    `  EMPTY ROUNDS / run      ${r.overall.meanEmptyRoundsPerRun}   (<=1 live offer, no ready recipe)`,
  );
  L.push(`  recipes / run           ${r.overall.recipesCompletedPerRun}`);
  const gap = Object.values(r.overall.classWinRatePct);
  const gapPts = gap.length === 2 ? Math.abs(gap[0]! - gap[1]!).toFixed(1) : 'n/a';
  L.push(
    `  class win rate          ${JSON.stringify(r.overall.classWinRatePct)}  gap ${gapPts}pts (guardrail: <=8)`,
  );
  L.push('');
  L.push('[POLICY-RELATIVE] item reachability — lowest purchase rate first');
  L.push('  NOT comparable to balance-bible section 16 thresholds: those are');
  L.push('  defined against player telemetry. Read this for items NEVER OFFERED');
  L.push('  or never affordable, and for deltas under a fixed policy.');
  for (const it of r.itemReach.slice(0, 8)) {
    L.push(
      `  ${it.itemId.padEnd(24)} offered ${String(it.offered).padStart(5)}  bought ${String(it.purchased).padStart(5)}  ${it.purchaseRatePct.toFixed(1)}%`,
    );
  }
  const never = r.itemReach.filter((i) => i.offered === 0);
  if (never.length > 0) {
    L.push(`  NEVER OFFERED: ${never.map((i) => i.itemId).join(', ')}`);
  }
  return L.join('\n');
}

export function formatDiff(before: Report, after: Report): string {
  const L: string[] = [];
  L.push(`DIFF  ${before.meta.gitSha} -> ${after.meta.gitSha}`);
  const ovKey = (r: Report) =>
    Object.entries(r.meta.overrides ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
  if (
    before.meta.seeds !== after.meta.seeds ||
    before.meta.policies.join(',') !== after.meta.policies.join(',') ||
    ovKey(before) !== ovKey(after)
  ) {
    L.push('');
    L.push('REFUSING TO DIFF: the two reports were produced over different');
    L.push(`populations (seeds ${before.meta.seeds} vs ${after.meta.seeds},`);
    L.push(`policies ${before.meta.policies.join(',')} vs ${after.meta.policies.join(',')},`);
    L.push(`ruleset [${ovKey(before) || 'shipped'}] vs [${ovKey(after) || 'shipped'}]).`);
    L.push('A delta across different populations is not a measurement.');
    return L.join('\n');
  }
  L.push('  rd    win% before -> after     draw%          playSec');
  for (const a of after.perRound) {
    const b = before.perRound.find((x) => x.round === a.round);
    if (b === undefined) continue;
    const d = (x: number, y: number) => `${x.toFixed(1)} -> ${y.toFixed(1)} (${y - x >= 0 ? '+' : ''}${(y - x).toFixed(1)})`;
    L.push(
      `  ${String(a.round).padStart(2)}   ${d(b.winPct, a.winPct).padEnd(24)} ${d(b.drawPct, a.drawPct).padEnd(22)} ${d(b.meanPlaybackSec, a.meanPlaybackSec)}`,
    );
  }
  L.push('');
  L.push(
    `  draw rate   ${before.overall.drawRatePct}% -> ${after.overall.drawRatePct}%`,
  );
  L.push(
    `  empty rds   ${before.overall.meanEmptyRoundsPerRun} -> ${after.overall.meanEmptyRoundsPerRun}`,
  );
  L.push(
    `  med rounds  ${before.overall.medianRoundsReached} -> ${after.overall.medianRoundsReached}`,
  );
  return L.join('\n');
}
