# Packbreaker Arena — Visual Direction

> **Locked: Gridline.** Tournament-grade clarity, vector-flat icons, signal-color rarity, dark navy UI shell, Inter typography. Selected from a three-direction shortlist (Sketchwork / Inkwell / Gridline) on pillar fit (readable in one screen, mobile 390-wide viable) and production economics (lowest M1 placeholder cost, lowest live-ops content cost). Selection rationale: see `decision-log.md` 2026-04-26.
>
> This document is the visual source of truth for all UI mockups, icon work, and `packages/ui-kit` tokens.

---

## 1. Shared rules

Pillars from `concept-brief.md` apply: **readable in one screen**, **mastery from synergy not fidelity**, **mobile vertical viable at 390-wide**. Anti-goals: 3D, custom art pipelines before systems are validated, final art before graybox playtests.

These rules hold across every screen and asset:

- **Bag is always center-stage.** The bag never shrinks below 60% of the screen's smaller dimension.
- **Rarity is dual-coded.** Frame color AND a corner gem shape (`◆` Common / `■` Uncommon / `▲` Rare / `★` Epic / `✦` Legendary). Color-blind safety is non-negotiable. (`gdd.md` § 14.)
- **Recipe-ready glow visible without hover.** Pulsing outline on participating cells. Static screenshot must communicate "this is a recipe."
- **Mobile target: 390-wide vertical.** Anything that requires hover, dense tooltips, or fine pointer precision fails this test.
- **Item shape distinction.** A 1×1, 1×2, 2×2, and L-shape must be instantly distinguishable in silhouette at thumbnail size.
- **Tabular numerals everywhere numbers are displayed.** Gold, HP, damage, cooldown ticks. No jitter.
- **No 3D, no shaders beyond simple alpha + tint + blur.** Performance budget in `tech-architecture.md` § 10.
- **Vector-flat only.** No painterly per-icon hand-rendering until M3 (and only if a content artist is on payroll).

---

## 2. Pitch

Tournament-grade clarity. Vector-flat icons with strong silhouettes, signal-color rarity, dark UI shell with high-contrast typography. Reads like Hearthstone's UI met Linear's design system at a Dota tournament.

References: *Hearthstone* (UI chrome restraint, rarity language), *Balatro* (texture-on-flat warmth — borrow lightly), *Marvel Snap* (rarity-as-spectacle, dialed way down), *Inkbound* (clarity-first 2D), *Linear / Vercel* (UI shell typography and density), *Polytopia* (icon silhouette discipline).

---

## 3. Palette (locked)

| Role | Hex | Notes |
|---|---|---|
| `bg-deep` | `#0B0F1A` | Deep navy-black, root background |
| `bg-mid` | `#131826` | Side rails background |
| `surface` | `#1C2333` | Item slots, shop cards, bag cells |
| `surface-elev` | `#232C40` | Modals, focused/hovered UI |
| `border-default` | `#2D3854` | 1px cell and card borders |
| `text-primary` | `#F0F4FA` | Body text, primary numerals |
| `text-secondary` | `#94A3B8` | Labels, secondary info |
| `text-muted` | `#64748B` | Disabled state, placeholder copy |
| `accent` | `#3B82F6` | Primary CTA, electric blue |
| `rarity-common` | `#94A3B8` | Slate |
| `rarity-uncommon` | `#22C55E` | Signal green |
| `rarity-rare` | `#3B82F6` | Signal blue |
| `rarity-epic` | `#A855F7` | Signal purple |
| `rarity-legendary` | `#F59E0B` | Signal amber |

Pure white, pure black, and bright neon shades are forbidden.

### Semantic UI extensions

Some HUD elements have universal color referents that override the rarity palette. These are the only approved extensions:

- `life-red` `#EF4444` (fill) / `#F87171` (stroke) — hearts and damage indicators only.
- `coin-gold` `#F59E0B` (fill) / `#FCD34D` (stroke) — gold currency glyphs only. Note: `#F59E0B` is also the rarity-legendary frame color. The two contexts must never collide on the same surface — a Legendary item card never shows a coin glyph in its frame.

No other extensions without a `decision-log.md` entry.

---

## 4. Typography (locked)

- **Font family**: Inter, loaded from Google Fonts. Use weights 400, 500, 600, 700.
- **Tabular numerals required** on every numeric display: gold, hearts (if numeric), round counter, item costs, reroll cost. Use `font-feature-settings: "tnum"`.
- **Display headings**: Inter 700, slight negative letter-spacing (-0.01em).
- **Body**: Inter 500.
- **Small labels**: Inter 600, uppercase, +0.05em letter-spacing.

---

## 5. Iconography

- Vector flat with subtle gradient depth (one stop, not painterly).
- Strong silhouette test: every icon must read at 32×32 in monochrome.
- 1.5px stroke language. Filled body, line accents.
- Color encodes rarity and tag (fire items warm undertones, ice items cool). Color is informational, not decorative.
- 64×64 source resolution. Scales clean to 32 and 128 without rebuilding.

### Body color rule

An item's body fill must not equal a rarity color *other than its own*. A Common iron item can be slate-gray (matches `rarity-common`) because metallic gray is iron's natural material color and matches its rarity. A Common item cannot be signal-blue, because signal-blue is `rarity-rare`'s frame color and creates rarity language confusion at a glance. Tag color (fire = warm, ice = cool) is layered on top of body, never replacing it. Frame border carries rarity; body carries identity; accents carry tag.

---

## 6. UI surface treatment

- Cards have a 1px border in `border-default` color, no heavy chrome.
- Rarity communicated by frame border color + corner gem shape + a soft inner glow scaled to rarity.
- Buttons are filled rectangles with 4–6px corner radius. Hover lifts brightness ~6%, no rotation.
- Recipe-ready glow: animated dotted outline cycling through rarity-of-output color.

---

## 7. Motion language

- Snappy, exponential ease (cubic-bezier `0.16, 1, 0.3, 1`). Drag pickups feel instant; placement settles in 120ms.
- Recipe glow is geometric: rotating dashed outline, 1.5s/cycle.
- Combat uses geometric particles (squares, lines, plus signs), not organic splat.
- Status icons pulse on stack add — single beat, not continuous.

---

## 8. Sound character

Synth-lite. Clean clicks, soft thuds for placement, bright chime for rarity, low whoosh for combat strikes. Music: chill electronic with a beat. Streamable on Twitch.

(Anchor only. Full audio direction is post-M2.)

---

## 9. Mobile 390-wide

High contrast, vector scaling, strong silhouettes survive small renders. Dark mode is comfortable on mobile screens at most ambient light levels. Tabular numerals stay legible at 12pt.

The mobile layout is its own dedicated frame (`gdd.md` § 14). The visual system above is unchanged on mobile — only the layout reflows.

---

## 10. Anchor icon set

Three icons that anchor the entire icon system. Every subsequent icon inherits stroke weight, fill philosophy, internal detail level, and silhouette character from these three.

1. **Iron Sword** — 1×2 vertical weapon, Common.
2. **Healing Herb** — 1×1 consumable, Common.
3. **Ember Brand** — 2×1 horizontal weapon, Rare with on-hit burn.

These exercise weapon vs consumable, single-cell vs multi-cell, common vs rare frame, and one status-effect indicator (burn flame).

---

## 11. Silhouette discipline checklist

Every new hero icon must pass all six tests before shipping. Lesser items (placeholder fillers, minor consumables) only need tests 1–3.

1. **Monochrome 32×32 test.** Render as pure black on white at 32×32. Icon must remain identifiable with no color information.
2. **Pinprick test.** At 64×64 with heavy gaussian blur (or strong squint), the icon's identity must come through from silhouette mass alone.
3. **Sibling distinction test.** Side by side at 32×32 monochrome with peer icons in the same set, no two icons may share more than ~30% silhouette overlap.
4. **Weight match test.** Visual mass distribution must match item type. A herb that looks heavier than a sword fails this test.
5. **Frame redundancy test.** Strip the rarity frame and gem mentally. Common items should still feel "common" in their visual register — clean, restrained, no ornament. Rare and above can carry slightly more visual interest in silhouette to earn the tier.
6. **Hand-off test.** A second designer, given an existing set, must be able to design a new icon in the same system without ambiguity. Stroke weight, fill philosophy, internal detail level, and silhouette character must be tight enough that the system is reproducible.

---

## 12. What this unblocks

1. **Claude Design Prompt 1** (style frame): single 1280×720 mockup of the run screen at mid-game. *(Locked 2026-04-27.)*
2. **Claude Design Prompt 2** (mobile frame): same scene at 390-wide vertical layout. *(Locked 2026-04-27.)*
3. **Claude Design Prompt 3** (anchor icon set): three anchor icons rendered as a 64×64 set with rarity frames and corner gems.
4. **Claude Code Prompt** (UI kit scaffold): `packages/ui-kit` with locked palette as Tailwind tokens, Inter as font import, and primitives (Button, Card, RarityFrame, BagCell) ready for assembly.

---

## 13. Open questions

1. **Wordmark / logo design.** Visual direction is locked, but the game's wordmark is a separate exercise. Defer.
2. **Color-blind verification gem set.** Shapes proposed (`◆■▲★✦`) but may need to be redrawn as custom SVGs for visual consistency once the first style frame returns. Re-evaluate after Claude Design Prompt 1.
3. **Asset atlas tooling.** `tech-architecture.md` § 13 still flags this as open. Gridline being vector-flat pushes the answer toward SVG sprite + per-icon optimization rather than TexturePacker or Aseprite atlases. Confirm at first VFX work.
4. **Mobile floating CTA placement.** Spec attempted "16px above tab bar" but the tab content panel makes that overlap. Three candidate fixes (inline below reroll, swap-with-reroll based on round state, full-width bar replacing floating pill) deferred to M1 component design.

---

## 14. Out of scope

- Wordmark / logo design.
- Marketing key art.
- VFX system specifics beyond motion language above.
- Specific item iconography beyond the anchor set.
- Animation rigging or character art (no characters in M1; see `gdd.md` § 8).
- Music composition direction (sound character above is anchor-only).
