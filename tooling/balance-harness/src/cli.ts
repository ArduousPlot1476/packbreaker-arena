// Balance harness entry point.
//
//   pnpm balance -- --seeds 200
//   pnpm balance -- --seeds 500 --policies greedy,hoarder --out reports/x.json
//   pnpm balance -- --baseline reports/before.json --out reports/after.json
//
// Reports carry their own provenance (git sha, seed grid, policy set) so a diff
// refuses to compare populations that aren't comparable.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { ClassId, DEFAULT_RULESET, RelicId, SimSeed, type Ruleset } from '@packbreaker/content';
import { adaptStrategy, POLICY_NAMES } from './policies.ts';
import { runOne, type BossOverride, type RunRecord } from './realplay.ts';
import { aggregate, formatReport, formatDiff, type Report } from './report.ts';

interface Args {
  seeds: number;
  policies: string[];
  out: string | null;
  baseline: string | null;
  /** Ruleset field overrides, applied on top of DEFAULT_RULESET. Sweep knobs —
   *  they let a grid ask "what if hearts were 5" without editing
   *  packages/content, which the determinism corpus is pinned to.
   *
   *  Typed as numbers rather than Partial<Ruleset> because every exposed flag
   *  maps to a numeric field; `bagDimensions` and `mutators` are deliberately
   *  not sweepable from the CLI. */
  overrides: Record<string, number>;
  /** Round-11 boss numbers. Same idea as `overrides`, different target: these
   *  are the forge-tyrant-boss `boss_only` mutator fields, not the ruleset. */
  bossOverrides: Record<string, number>;
  label: string | null;
}

/** CLI flag → DEFAULT_RULESET field. Only the economy knobs the sweep needs are
 *  exposed; `bossRound` is deliberately absent because it has zero sim consumers
 *  (the boss round is a literal 11 in three places), so a flag for it would be a
 *  control that silently does nothing. */
const RULESET_FLAGS = {
  '--hearts': 'startingHearts',
  '--gold': 'baseGoldPerRound',
  '--gold-step': 'goldStepRounds',
  '--gold-step-amount': 'goldStepAmount',
  '--shop': 'shopSize',
  '--reroll-start': 'rerollCostStart',
  '--win-bonus': 'winBonusGold',
} as const satisfies Record<string, keyof Ruleset>;

/** CLI flag → forge-tyrant-boss `boss_only` mutator field.
 *
 *  The boss is the one balance surface with ZERO fixture cost — all 224 .jsonl
 *  fixtures create their run under contractId "neutral", so these three fields
 *  are never exercised by the corpus. Sweeping them here and landing them in
 *  packages/content/src/contracts.ts cost the same: nothing. */
const BOSS_FLAGS = {
  '--boss-hp': 'hpOverride',
  '--boss-damage': 'damageBonus',
  '--boss-lifesteal': 'lifestealPctBonus',
} as const satisfies Record<string, keyof BossOverride>;

/** Flags that take no value. Everything else in KNOWN_FLAGS consumes the next
 *  argv entry. */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--seeds',
  '--policies',
  '--out',
  '--baseline',
  '--label',
  ...Object.keys(RULESET_FLAGS),
  ...Object.keys(BOSS_FLAGS),
]);

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
  };

  // UNKNOWN FLAGS ARE A HARD ERROR, and this is not pedantry. The parser is an
  // indexOf scan, so an unrecognised flag used to be silently ignored — and the
  // single most likely typo, `--policy resolver-first` (singular), quietly ran
  // ALL SIX policies and produced a number that looked like the player model and
  // was not. A balance harness that answers a question you did not ask is worse
  // than one that refuses.
  const values = new Set<string>();
  for (const flag of VALUE_FLAGS) {
    const i = argv.indexOf(flag);
    if (i >= 0 && i + 1 < argv.length) values.add(String(i + 1));
  }
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    // `pnpm run sim -- --seeds 60` forwards a bare `--` separator.
    if (tok === '--' || !tok.startsWith('--')) continue;
    if (values.has(String(i))) continue; // it's a VALUE, not a flag
    if (VALUE_FLAGS.has(tok)) continue;
    throw new Error(
      `unknown flag "${tok}" — known: ${[...VALUE_FLAGS].sort().join(', ')}`,
    );
  }

  const seeds = Number(get('--seeds') ?? 100);
  if (!Number.isInteger(seeds) || seeds < 1) throw new Error('--seeds must be a positive integer');
  const policiesRaw = get('--policies');
  const policies = policiesRaw === null ? [...POLICY_NAMES] : policiesRaw.split(',');
  for (const p of policies) {
    if (!POLICY_NAMES.includes(p as never)) {
      throw new Error(`unknown policy "${p}" — known: ${POLICY_NAMES.join(', ')}`);
    }
  }
  const overrides: Record<string, number> = {};
  for (const [flag, field] of Object.entries(RULESET_FLAGS)) {
    const raw = get(flag);
    if (raw === null) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} must be a non-negative integer`);
    overrides[field] = n;
  }
  const bossOverrides: Record<string, number> = {};
  for (const [flag, field] of Object.entries(BOSS_FLAGS)) {
    const raw = get(flag);
    if (raw === null) continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${flag} must be a non-negative integer`);
    bossOverrides[field] = n;
  }

  return {
    seeds,
    policies,
    out: get('--out'),
    baseline: get('--baseline'),
    overrides,
    bossOverrides,
    label: get('--label'),
  };
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

/** Both classes, and one starter relic each. Held fixed across a sweep so the
 *  only thing a diff varies is the change under test. */
const CLASSES: ReadonlyArray<{ classId: ClassId; relic: RelicId }> = [
  { classId: ClassId('tinker'), relic: RelicId('apprentices-loop') },
  { classId: ClassId('marauder'), relic: RelicId('razors-edge') },
];

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.baseline !== null && args.out !== null) {
    const before = JSON.parse(readFileSync(args.baseline, 'utf-8')) as Report;
    const after = JSON.parse(readFileSync(args.out, 'utf-8')) as Report;
    console.log(formatDiff(before, after));
    return;
  }

  // Undefined when no flag was passed, so the default path is byte-identical to
  // not having the feature — the override never reaches createRun at all.
  const hasOverrides = Object.keys(args.overrides).length > 0;
  const rulesetOverride: Ruleset | undefined = hasOverrides
    ? { ...DEFAULT_RULESET, ...args.overrides }
    : undefined;
  const bossOverride: BossOverride | undefined =
    Object.keys(args.bossOverrides).length > 0 ? args.bossOverrides : undefined;

  const runs: RunRecord[] = [];
  const t0 = Date.now();
  for (const policyName of args.policies) {
    for (const { classId, relic } of CLASSES) {
      for (let i = 0; i < args.seeds; i++) {
        // Deterministic seed grid: the same --seeds N always produces the same
        // population, so two reports are comparable by construction.
        const seed = SimSeed((i * 2654435761 + 1) >>> 0);
        runs.push(
          runOne({
            seed,
            classId,
            startingRelicId: relic,
            policy: adaptStrategy(policyName as never, seed),
            rulesetOverride,
            bossOverride,
          }),
        );
      }
    }
  }

  const report = aggregate(runs, {
    gitSha: gitSha(),
    seeds: args.seeds,
    policies: args.policies,
    // Recorded so a later diff can refuse to compare a swept report against a
    // baseline run under different rules — otherwise the delta silently mixes
    // "the change I made" with "the knobs I forgot I'd set". Boss knobs are
    // namespaced into the same map so formatDiff's guard covers them for free.
    overrides: {
      ...args.overrides,
      ...Object.fromEntries(
        Object.entries(args.bossOverrides).map(([k, v]) => [`boss.${k}`, v]),
      ),
    },
    label: args.label,
    elapsedMs: Date.now() - t0,
  });

  console.log(formatReport(report));

  if (args.out !== null) {
    const path = resolve(args.out);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(report, null, 2));
    console.log(`\nwrote ${path}`);
  }
}

main();
