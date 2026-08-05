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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
