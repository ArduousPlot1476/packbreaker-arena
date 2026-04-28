#!/usr/bin/env node
// Diff guard: content-schemas.ts (canonical design doc) and
// packages/content/src/schemas.ts (in-package port) MUST be byte-identical.
// They drift in M1.3 if at all (per decision-log.md M1.1.1 closure).
// Wired into `pnpm turbo lint` via the //#check-schemas-sync task in turbo.json.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const A = path.join(REPO_ROOT, 'content-schemas.ts');
const B = path.join(REPO_ROOT, 'packages', 'content', 'src', 'schemas.ts');

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (err) {
    process.stderr.write(`check-schemas-sync: cannot read ${p}: ${err.message}\n`);
    process.exit(2);
  }
}

const a = read(A);
const b = read(B);

if (a === b) {
  process.stdout.write('check-schemas-sync: OK (content-schemas.ts and packages/content/src/schemas.ts byte-identical)\n');
  process.exit(0);
}

// Find the first differing line for a useful error message.
const aLines = a.split('\n');
const bLines = b.split('\n');
const max = Math.max(aLines.length, bLines.length);
let firstDiff = -1;
for (let i = 0; i < max; i++) {
  if (aLines[i] !== bLines[i]) {
    firstDiff = i + 1;
    break;
  }
}

process.stderr.write(
  `check-schemas-sync: FAIL\n` +
    `  content-schemas.ts (canonical):       ${aLines.length} lines\n` +
    `  packages/content/src/schemas.ts (port): ${bLines.length} lines\n` +
    `  first diff at line ${firstDiff}:\n` +
    `    canonical: ${JSON.stringify(aLines[firstDiff - 1] ?? '<EOF>')}\n` +
    `    port:      ${JSON.stringify(bLines[firstDiff - 1] ?? '<EOF>')}\n` +
    `\n` +
    `Resolution: edit one file, then \`cp content-schemas.ts packages/content/src/schemas.ts\`\n` +
    `(canonical → port). Both files must stay in sync until M1.3 evaluates consolidation.\n`,
);
process.exit(1);
