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
import { ClassId, RelicId, SimSeed } from '@packbreaker/content';
import { adaptStrategy, POLICY_NAMES } from './policies.ts';
import { runOne, type RunRecord } from './realplay.ts';
import { aggregate, formatReport, formatDiff, type Report } from './report.ts';

interface Args {
  seeds: number;
  policies: string[];
  out: string | null;
  baseline: string | null;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const i = argv.indexOf(flag);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1]! : null;
  };
  const seeds = Number(get('--seeds') ?? 100);
  if (!Number.isInteger(seeds) || seeds < 1) throw new Error('--seeds must be a positive integer');
  const policiesRaw = get('--policies');
  const policies = policiesRaw === null ? [...POLICY_NAMES] : policiesRaw.split(',');
  for (const p of policies) {
    if (!POLICY_NAMES.includes(p as never)) {
      throw new Error(`unknown policy "${p}" — known: ${POLICY_NAMES.join(', ')}`);
    }
  }
  return { seeds, policies, out: get('--out'), baseline: get('--baseline') };
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
          }),
        );
      }
    }
  }

  const report = aggregate(runs, {
    gitSha: gitSha(),
    seeds: args.seeds,
    policies: args.policies,
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
