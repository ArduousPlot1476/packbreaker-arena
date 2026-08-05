// @packbreaker/ui-kit/palette — THE single source of truth for the locked
// palette (visual-direction.md § 3 + its approved semantic extensions).
//
// Before this module the palette existed as three hand-synced copies:
//   1. CSS custom properties in apps/client/src/index.css
//   2. string literals in packages/ui-kit/src/rarity.ts
//   3. Phaser RGB ints + hex strings in apps/client/src/combat/CombatScene.ts
// Nothing tied them together, so a palette edit had to be made in three places
// and a missed one drifted silently.
//
// Now: this file is canonical. rarity.ts and CombatScene.ts derive from it, and
// index.css's `:root` block is pinned to it by palette.test.ts — the CSS stays
// hand-written (no build step, no generated file to forget to regenerate) but
// cannot drift, because the test parses the real stylesheet and compares.
//
// visual-direction.md § 3 bans pure white, pure black, and bright neon. That is
// asserted here too (see assertions in palette.test.ts) so a future addition
// can't quietly violate it.

/** Canonical hex, uppercase, 6-digit. Keys are camelCase of the CSS var name. */
export const PALETTE = {
  // Shell
  bgDeep: '#0B0F1A',
  bgMid: '#131826',
  surface: '#1C2333',
  surfaceElev: '#232C40',
  borderDefault: '#2D3854',

  // Type
  textPrimary: '#F0F4FA',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',

  // Interaction
  accent: '#3B82F6',

  // Rarity (dual-coded with gem shape — see RarityGem)
  rCommon: '#94A3B8',
  rUncommon: '#22C55E',
  rRare: '#3B82F6',
  rEpic: '#A855F7',
  rLegendary: '#F59E0B',

  // Semantic extensions (visual-direction.md § 3 "Semantic UI extensions")
  lifeRed: '#EF4444',
  lifeStroke: '#F87171',
  coinFill: '#F59E0B',
  coinStroke: '#FCD34D',

  /** Adjacency-synergy cue (CF 60). Formerly an undocumented inline literal
   *  in AdjacencyGlow.tsx and CombatScene.ts described as a "teal-300 graybox".
   *  The hex is unchanged — this promotes it to a named token so it has one
   *  home, and is deliberately NOT a rarity hue: per the shop-card adjacency
   *  work, rarity owns hue while adjacency owns shape and position, so this
   *  cue must never collide with a rarity color. */
  adjacencyTeal: '#5EEAD4',
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** CSS custom-property name for each token. index.css declares exactly these. */
export const CSS_VAR: Readonly<Record<PaletteKey, string>> = {
  bgDeep: '--bg-deep',
  bgMid: '--bg-mid',
  surface: '--surface',
  surfaceElev: '--surface-elev',
  borderDefault: '--border-default',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  accent: '--accent',
  rCommon: '--r-common',
  rUncommon: '--r-uncommon',
  rRare: '--r-rare',
  rEpic: '--r-epic',
  rLegendary: '--r-legendary',
  lifeRed: '--life-red',
  lifeStroke: '--life-stroke',
  coinFill: '--coin-fill',
  coinStroke: '--coin-stroke',
  adjacencyTeal: '--adjacency-teal',
};

/** `var(--token)` reference, for inline styles in DOM-rendered components. */
export function cssVar(key: PaletteKey): string {
  return `var(${CSS_VAR[key]})`;
}

/** '#RRGGBB' → 0xRRGGBB. Phaser takes RGB ints, not CSS strings. */
export function hexToInt(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

/** Phaser-facing form. Derived, never hand-maintained. */
export const PALETTE_INT: Readonly<Record<PaletteKey, number>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(PALETTE) as PaletteKey[]).map((k) => [k, hexToInt(PALETTE[k])]),
  ) as Record<PaletteKey, number>,
);

/** `rgba(r, g, b, a)` for the places CSS needs alpha on a palette color
 *  (inner glows, scrims) without a second literal of the same hue. */
export function rgba(key: PaletteKey, alpha: number): string {
  const n = PALETTE_INT[key];
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
}
