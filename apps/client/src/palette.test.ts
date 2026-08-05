// Pins index.css's `:root` block to packages/ui-kit/src/palette.ts.
//
// The palette used to exist as three hand-synced copies (this stylesheet,
// ui-kit's RARITY record, and CombatScene's Phaser ints). The other two now
// derive from the module at import time, so they cannot drift by construction.
// CSS can't import TypeScript, so this file closes the last gap the only way
// that needs no build step: parse the real stylesheet and compare.
//
// Deliberately NOT a snapshot — a snapshot would happily record a drifted
// value the first time it ran. This asserts against the module.

// Read the stylesheet off disk, not through Vite. A `?raw` import goes through
// the CSS pipeline (Tailwind directives expand, declarations get rewritten), so
// what comes back is the compiled output, not the source this test is pinning.
// `import.meta.url` is not a file: URL under vitest, hence process.cwd() — the
// client package root, both for `vitest run` here and for the turbo test task.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSS_VAR, PALETTE, PALETTE_INT, hexToInt, rgba, type PaletteKey } from '@packbreaker/ui-kit';

const CSS_PATH = resolve(process.cwd(), 'src/index.css');
const css = readFileSync(CSS_PATH, 'utf-8');

/** Declarations inside the FIRST `:root { … }` block only. A later block would
 *  be a redefinition and is not what the app's tokens resolve to. */
function rootDeclarations(source: string): Map<string, string> {
  const open = source.indexOf(':root {');
  if (open === -1) throw new Error('index.css has no :root block');
  const close = source.indexOf('}', open);
  const body = source.slice(open + ':root {'.length, close);

  const out = new Map<string, string>();
  for (const line of body.split('\n')) {
    const m = /^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*;/.exec(line);
    if (m) out.set(m[1]!, m[2]!.toUpperCase());
  }
  return out;
}

const declared = rootDeclarations(css);
const keys = Object.keys(PALETTE) as PaletteKey[];

describe('locked palette — index.css is pinned to @packbreaker/ui-kit palette', () => {
  it('declares a :root custom property for every palette token', () => {
    const missing = keys.filter((k) => !declared.has(CSS_VAR[k]));
    expect(missing).toEqual([]);
  });

  it.each(keys)('--%s matches the module hex', (key) => {
    expect(declared.get(CSS_VAR[key])).toBe(PALETTE[key].toUpperCase());
  });

  it('declares no :root color token the module does not define', () => {
    const known = new Set(keys.map((k) => CSS_VAR[k]));
    const extra = [...declared.keys()].filter((v) => !known.has(v));
    expect(extra).toEqual([]);
  });
});

describe('locked palette — visual-direction.md § 3 constraints', () => {
  // "Pure white, pure black, and bright neon shades are forbidden."
  it.each(keys)('%s is neither pure white nor pure black', (key) => {
    const n = PALETTE_INT[key];
    expect(n).not.toBe(0x000000);
    expect(n).not.toBe(0xffffff);
  });

  it.each(keys)('%s is a well-formed 6-digit uppercase hex', (key) => {
    expect(PALETTE[key]).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe('no client source references an undeclared CSS custom property', () => {
  // This is the guard that would have caught the RunEndScreen defect directly.
  // That screen referenced `var(--bg-card, #2a2a2a)`, `var(--bg-card-2, #232323)`
  // and `var(--border, #444)` — three custom properties that DO NOT EXIST. Every
  // one silently fell through to its neutral-grey fallback, so the biggest screen
  // in the game rendered charcoal while the rest of the app rendered navy, and
  // nothing failed. A `var()` with a fallback cannot fail loudly at runtime; it
  // has to be caught here.

  // A hand-rolled walk rather than fs.globSync: globSync landed in Node 22 and
  // .nvmrc pins Node 20, which is also what CI runs — so globSync would
  // typecheck against @types/node here and then throw in CI.
  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, acc);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) acc.push(full);
    }
    return acc;
  }

  const files = walk(resolve(process.cwd(), 'src'));

  /** Comments discuss `var(--bg-card)` by name when documenting the bug that
   *  motivated this check, so scanning them would report the prose as an
   *  offender. Strip them first. */
  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  }

  /** Every `var(--name)` in a file. Template-interpolated names — `var(--r-${r})`
   *  — are skipped here (the trailing `${` gives them away) and covered by the
   *  rarity assertion below instead. */
  function referencedVars(source: string): string[] {
    const out: string[] = [];
    for (const m of stripComments(source).matchAll(/var\(\s*(--[a-zA-Z0-9-]+)(.?)/g)) {
      if (m[2] === '$') continue;
      out.push(m[1]!);
    }
    return out;
  }

  const declaredNames = new Set(declared.keys());

  function relative(file: string): string {
    const norm = file.replace(/\\/g, '/');
    const i = norm.lastIndexOf('/src/');
    return i === -1 ? norm : norm.slice(i + 1);
  }

  it('finds client source files to scan (guard against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('every referenced custom property is declared in index.css', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      for (const name of referencedVars(source)) {
        if (!declaredNames.has(name)) offenders.push(`${relative(file)}: ${name}`);
      }
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  it('the five interpolated --r-<rarity> names all resolve', () => {
    // `var(--r-${rarity})` is built at runtime from a RarityKey, so the static
    // scan above skips it. Assert the full set exists instead.
    for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
      expect(declaredNames.has(`--r-${r}`)).toBe(true);
    }
  });
});

describe('palette derivations', () => {
  it('hexToInt round-trips the Phaser form', () => {
    expect(hexToInt('#0B0F1A')).toBe(0x0b0f1a);
    expect(PALETTE_INT.accent).toBe(0x3b82f6);
  });

  it('rgba() emits the channel decomposition of the same hue', () => {
    // #EF4444 → 239, 68, 68
    expect(rgba('lifeRed', 0.5)).toBe('rgba(239, 68, 68, 0.5)');
  });
});
