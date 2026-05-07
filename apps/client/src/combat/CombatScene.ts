// Single Phaser scene for combat playback. Replaces the M1.3.4a DOM
// Portrait + HP-bar tree with one canvas-rendered surface; same input
// (CombatResult.events) and same tick cadence (TICKS_PER_SECOND = 10),
// so behavioral parity with the DOM playback is structural, not a
// coincidence.
//
// Architecture per tech-architecture.md § 2:
//   - One scene, no scene routing.
//   - Transparent canvas; bag stays visible behind the combat overlay
//     per visual-direction.md § 1 (60%-of-smaller-dim floor).
//   - Asset preload runs in this scene's preload(), which fires only
//     after the combat chunk lazy-loads. Title-screen / pre-combat
//     parse cost: zero Phaser, zero textures.
//
// Visual register per visual-direction.md § 7:
//   - Geometric particles only (squares, lines, plus signs); no
//     organic splat / smoke.
//   - Snappy exponential ease — locked bezier `cubic-bezier(0.16, 1,
//     0.3, 1)` is approximated by Phaser's stock `Quartic.Out`. Byte-
//     exact bezier match is M2 polish if a designer flags it.
//   - Tabular numerals on every numeric floater (font-feature-settings
//     'tnum'). Numeric jitter during pop-in is failure.
//   - Inter typography only; document.fonts.ready blocks scene start
//     so the first floater never falls back to system font.
//
// HP arithmetic remains sim-authoritative (closing-log ratification
// from M1.3.4a step 8): the scene reads `remainingHp` / `newHp`
// directly from each event payload — no client-side subtraction.

import Phaser from 'phaser';
import type { CombatEvent, EntityRef } from '@packbreaker/content';
import type { BagLayout } from '../bag/layout';
import { resolveEventAnchors } from './eventAnchorResolver';
import { advanceCombatTickClock, findNextEventTick } from './tickAdvancer';

// ─────────────────────────────────────────────────────────────────────
// Palette — locked per visual-direction.md § 3 + semantic extensions.
// Phaser takes RGB ints, not CSS strings; convert once here.
// ─────────────────────────────────────────────────────────────────────
const PALETTE = {
  bgMid: 0x131826,
  surface: 0x1c2333,
  surfaceElev: 0x232c40,
  borderDefault: 0x2d3854,
  textPrimary: 0xf0f4fa,
  textSecondary: 0x94a3b8,
  accent: 0x3b82f6,
  rarityUncommon: 0x22c55e,
  rarityLegendary: 0xf59e0b, // burn / status_tick floater color
  lifeRed: 0xef4444, // damage floater + HP bar fill
  lifeStroke: 0xf87171,
} as const;

const PALETTE_HEX = {
  textPrimary: '#F0F4FA',
  textSecondary: '#94A3B8',
  rarityUncommon: '#22C55E',
  rarityLegendary: '#F59E0B',
  lifeRed: '#EF4444',
} as const;

// ─────────────────────────────────────────────────────────────────────
// Tick + timing constants. MS_PER_TICK matches the sim's emission
// cadence (1 tick = 100ms wall-clock at TICKS_PER_SECOND = 10).
// FLOATER_LIFETIME_MS matches the M1.3.4a DOM playback so total combat
// wall time is unchanged across the render swap.
// ─────────────────────────────────────────────────────────────────────
const FLOATER_LIFETIME_MS = 600;
const FLOATER_RISE_PX = 64;
const PARTICLE_LIFETIME_MS = 500;
const STATUS_PULSE_MS = 280;
const COMBAT_END_SETTLE_MS = 480;
const SHAKE_DURATION_MS = 220;
const SHAKE_INTENSITY = 0.005;

/** Wall-clock gap (in ticks) between events that triggers silent
 *  fast-forward in update(). M1 starting value; tune via telemetry once
 *  the tick-cap-draw rate dashboard from telemetry-plan.md § 4 Goal 4
 *  surfaces. 8 ticks × 100ms/tick = 800ms — long enough that visual
 *  pause feels intentional, short enough that 60s-tick-cap combats
 *  compress to a watchable handful of seconds.
 *
 *  Tunable; not a magic number. Sourced + applied at update() entry. */
const DEAD_TIME_THRESHOLD_TICKS = 8;
/** Lead-in (in ticks) retained before the next event when
 *  fast-forwarding so the event has windup. 2 ticks = 200ms gives the
 *  HP bar tween + portrait pulse just enough lead time to feel
 *  intentional rather than abrupt. M1 starting value; tune later. */
const LEAD_IN_TICKS = 2;

// ─────────────────────────────────────────────────────────────────────
// Portrait hit-flash tunables (M1.4b2.2). § 4.5 R2 named consts —
// visual register per visual-direction.md § 7: short snappy window
// with additive blend so the underlying portrait stays readable during
// the flash. Smaller + shorter than spawnKoFlash (which is the terminal
// KO event); larger movement than pulsePortrait (which is subtle
// status-apply feedback). M1 starting values; tune via design review
// or playtest if needed.
// ─────────────────────────────────────────────────────────────────────
const PORTRAIT_FLASH_DURATION_MS = 150;
const PORTRAIT_FLASH_INITIAL_ALPHA = 0.45;
const PORTRAIT_FLASH_SIZE_PX = 180; // matches portrait body width/height in makePortrait
const PORTRAIT_FLASH_SCALE_END = 1.08;

// ─────────────────────────────────────────────────────────────────────
// Canvas-relative portrait positions, layered into BagLayout via
// canvas-rect projection in CombatOverlay (M1.4a). Exported so the
// orchestrator computes screen-space portrait anchors against the
// SAME ratios CombatScene renders against — § 4.5 R2 single-source
// hygiene. M1.3.4b architectural rule 2 (named scene tunables) set the
// precedent; spatial constants don't get the "tunable per telemetry"
// tag but the export-and-name-it discipline is the same.
// ─────────────────────────────────────────────────────────────────────
export const PORTRAIT_X_RATIO_PLAYER = 0.25;
export const PORTRAIT_X_RATIO_GHOST = 0.75;
export const PORTRAIT_Y_RATIO = 0.5;

// ─────────────────────────────────────────────────────────────────────
// Texture keys generated programmatically in preload(). One palette of
// geometric particles drawn via Graphics → generateTexture so combat
// can scatter them without per-frame draw calls.
// ─────────────────────────────────────────────────────────────────────
const TEX = {
  squareDmg: 'cs-square-dmg',
  squareHeal: 'cs-square-heal',
  squareStatus: 'cs-square-status',
  plusHeal: 'cs-plus-heal',
  lineHit: 'cs-line-hit',
} as const;

export interface CombatSceneInitData {
  events: ReadonlyArray<CombatEvent>;
  endedAtTick: number;
  initialPlayerHp: number;
  initialGhostHp: number;
  ticksPerSecond: number;
  ghostClassLabel: string;
  playerClassLabel: string;
  /** Item + portrait anchors in screen-space, computed by the
   *  orchestrator at combat-phase entry. Stored on the scene at M1.4a;
   *  consumed by M1.4b's item-anchored VFX via combat/anchorResolution.ts. */
  bagLayout: BagLayout;
  onCombatEnd: () => void;
}

interface PortraitRefs {
  body: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  hpLabel: Phaser.GameObjects.Text;
  classLabel: Phaser.GameObjects.Text;
  burnPip: Phaser.GameObjects.Container | null;
  centerX: number;
  centerY: number;
}

export class CombatScene extends Phaser.Scene {
  static readonly KEY = 'CombatScene';

  // NOTE: named `combatEvents` (not `events`) because Phaser.Scene
  // declares `events: EventEmitter` as a reserved instance member.
  private combatEvents: ReadonlyArray<CombatEvent> = [];
  private endedAtTick = 0;
  private msPerTick = 100;
  private initialPlayerHp = 30;
  private initialGhostHp = 30;
  private ghostClassLabel = 'Marauder';
  private playerClassLabel = 'Tinker';
  // Stored read-only from init(); consumed by M1.4b's item-anchored
  // VFX via combat/anchorResolution.ts. M1.4a writes but does not read.
  private bagLayout!: BagLayout;
  private onCombatEnd: () => void = () => {};

  private currentTick = 0;
  private elapsedMs = 0;
  private nextEventIdx = 0;
  private resolved = false;
  private resolvedAt = 0;
  private skipped = false;

  private playerHp = 0;
  private ghostHp = 0;
  private burnStacks: Record<EntityRef, number> = { player: 0, ghost: 0 };

  private playerRefs!: PortraitRefs;
  private ghostRefs!: PortraitRefs;
  private headerLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: CombatScene.KEY });
  }

  init(data: CombatSceneInitData): void {
    this.combatEvents = data.events;
    this.endedAtTick = data.endedAtTick;
    this.msPerTick = Math.round(1000 / data.ticksPerSecond);
    this.initialPlayerHp = data.initialPlayerHp;
    this.initialGhostHp = data.initialGhostHp;
    this.ghostClassLabel = data.ghostClassLabel;
    this.playerClassLabel = data.playerClassLabel;
    this.bagLayout = data.bagLayout;
    void this.bagLayout; // M1.4a stores; M1.4b reads via combat/anchorResolution.ts
    this.onCombatEnd = data.onCombatEnd;

    this.currentTick = 0;
    this.elapsedMs = 0;
    this.nextEventIdx = 0;
    this.resolved = false;
    this.resolvedAt = 0;
    this.skipped = false;
    this.playerHp = data.initialPlayerHp;
    this.ghostHp = data.initialGhostHp;
    this.burnStacks = { player: 0, ghost: 0 };
  }

  preload(): void {
    // Programmatic textures — all geometric, all palette-compliant.
    // Drawn once; reused via this.add.image(x, y, TEX.X) per particle.
    this.makeSquareTexture(TEX.squareDmg, PALETTE.lifeRed);
    this.makeSquareTexture(TEX.squareHeal, PALETTE.rarityUncommon);
    this.makeSquareTexture(TEX.squareStatus, PALETTE.rarityLegendary);
    this.makePlusTexture(TEX.plusHeal, PALETTE.rarityUncommon);
    this.makeLineTexture(TEX.lineHit, PALETTE.lifeRed);
  }

  create(): void {
    const { width, height } = this.scale;
    this.playerRefs = this.makePortrait(width * PORTRAIT_X_RATIO_PLAYER, height * PORTRAIT_Y_RATIO, 'YOU', this.playerClassLabel, PALETTE.accent, this.initialPlayerHp);
    this.ghostRefs = this.makePortrait(width * PORTRAIT_X_RATIO_GHOST, height * PORTRAIT_Y_RATIO, 'GHOST', this.ghostClassLabel, PALETTE.textSecondary, this.initialGhostHp);

    this.headerLabel = this.add
      .text(width * 0.5, 32, '— COMBAT —', {
        fontFamily: 'Inter, sans-serif',
        fontStyle: '600',
        fontSize: '11px',
        color: PALETTE_HEX.textSecondary,
      })
      .setOrigin(0.5, 0);
    this.headerLabel.setLetterSpacing(4);
  }

  update(_time: number, delta: number): void {
    if (this.resolved) {
      // Accumulator briefly bumps post-skip as the resolved-settle
      // branch drains; cosmetic, not a leak.
      this.resolvedAt += delta;
      if (this.resolvedAt >= COMBAT_END_SETTLE_MS) {
        this.resolved = false; // gate against double-fire
        this.onCombatEnd();
      }
      return;
    }

    // Flush any pending events at currentTick before the helper decides
    // fast-forward. Catches combat_start at tick=0 on the very first
    // frame so a long gap to the first damage event doesn't snap past
    // it. Cheap when nothing pends — flushEventsAtCurrentTick's inner
    // loop iterates 0 times and skips syncHpBars.
    this.flushEventsAtCurrentTick();

    const nextEvTick = findNextEventTick(this.combatEvents, this.nextEventIdx);
    const result = advanceCombatTickClock({
      currentTick: this.currentTick,
      accumulator: this.elapsedMs,
      delta,
      msPerTick: this.msPerTick,
      endedAtTick: this.endedAtTick,
      nextEventTick: nextEvTick,
      deadTimeThresholdTicks: DEAD_TIME_THRESHOLD_TICKS,
      leadInTicks: LEAD_IN_TICKS,
    });

    // Apply each tick's events in order. flushEventsAtCurrentTick
    // reads this.currentTick + this.nextEventIdx, so step the field
    // per tick before flushing.
    for (const tick of result.ticksAdvanced) {
      this.currentTick = tick;
      this.flushEventsAtCurrentTick();
    }
    // Covers the fast-forward case (ticksAdvanced is empty;
    // result.newTick is the snap target).
    this.currentTick = result.newTick;
    this.elapsedMs = result.newAccumulator;

    if (result.reachedEnd && !this.resolved) {
      this.resolved = true;
      this.resolvedAt = 0;
    }
  }

  /** SKIP path — invoked by the React-owned DOM SKIP button. Drains all
   *  remaining events without playing visuals, snaps HP/state to final,
   *  and advances to RoundResolution. */
  public skipToEnd(): void {
    if (this.resolved || this.skipped) return;
    this.skipped = true;
    while (this.nextEventIdx < this.combatEvents.length) {
      const ev = this.combatEvents[this.nextEventIdx]!;
      this.applyEventState(ev);
      this.nextEventIdx += 1;
    }
    this.syncHpBars(false);
    this.resolved = true;
    this.resolvedAt = COMBAT_END_SETTLE_MS; // fire onCombatEnd next frame
  }

  // ─────────────────────────────────────────────────────────────────
  // Event playback
  // ─────────────────────────────────────────────────────────────────

  private flushEventsAtCurrentTick(): void {
    let flushed = 0;
    while (
      this.nextEventIdx < this.combatEvents.length &&
      this.combatEvents[this.nextEventIdx]!.tick <= this.currentTick
    ) {
      const ev = this.combatEvents[this.nextEventIdx]!;
      this.applyEventState(ev);
      this.playEventVisuals(ev);
      this.nextEventIdx += 1;
      flushed += 1;
    }
    // Skip the HP-bar tween when nothing flushed — update() now calls
    // this every frame to clear any pending events at currentTick
    // before the fast-forward decision (see update() entry comment).
    if (flushed > 0) this.syncHpBars(true);
  }

  /** Updates internal HP + status mirrors from the event's authoritative
   *  payload (no client-side arithmetic). Visuals derive from these
   *  mirrors and from the tween system. */
  private applyEventState(ev: CombatEvent): void {
    if (ev.type === 'damage') {
      if (ev.target === 'player') this.playerHp = ev.remainingHp;
      else this.ghostHp = ev.remainingHp;
    } else if (ev.type === 'heal') {
      if (ev.target === 'player') this.playerHp = ev.newHp;
      else this.ghostHp = ev.newHp;
    } else if (ev.type === 'status_tick') {
      if (ev.target === 'player') this.playerHp = ev.remainingHp;
      else this.ghostHp = ev.remainingHp;
    } else if (ev.type === 'status_apply') {
      if (ev.status === 'burn') {
        this.burnStacks[ev.target] = ev.stacks;
      }
    }
  }

  private playEventVisuals(ev: CombatEvent): void {
    if (ev.type === 'damage') {
      // M1.4b1 + M1.4b2.1 + M1.4b2.2: consume resolveEventAnchors.
      // Damage='both' populates source AND target. M1.4b2.2 closes
      // CF 29 by adding source-side particle burst (mirrors heal source-
      // flash from M1.4b2.1) AND adds portrait hit-flash on the target
      // side per Phase 1 Q3 (i): damage-target-only red flash. Heal
      // target stays unflashed — visual differentiation per pillar
      // (damage = "impact felt", heal = "passive reception"). flashPortrait
      // takes a color so future event types or Q3 (ii) reopen can extend
      // without primitive rewrites.
      const anchors = resolveEventAnchors(ev, this.bagLayout, this.scale.canvasBounds);
      if (anchors.target) {
        const refs = ev.target === 'player' ? this.playerRefs : this.ghostRefs;
        this.spawnFloaterAt(anchors.target.x, anchors.target.y, '−' + String(ev.amount), PALETTE_HEX.lifeRed);
        this.spawnParticleBurstAt(anchors.target.x, anchors.target.y, TEX.squareDmg, 5);
        this.flashPortrait(refs, PALETTE.lifeRed);
      }
      if (anchors.source) {
        this.spawnParticleBurstAt(anchors.source.x, anchors.source.y, TEX.squareDmg, 5);
      }
    } else if (ev.type === 'heal') {
      // M1.4b2.1: ANCHOR_RULE.heal flipped 'source' → 'both' per
      // decision-log 2026-05-06. Render is additive (Phase 1 Q3
      // ratification): recipient floater + recipient particles
      // (existing target-side render preserved) + source-item flash
      // (new). Source flash uses TEX.plusHeal at the resolved source
      // anchor — same primitive as the recipient burst per Q2 (no new
      // VFX in .b2.1; item-cell halo is M1.4b2.2 territory).
      const refs = ev.target === 'player' ? this.playerRefs : this.ghostRefs;
      this.spawnFloater(refs, '+' + String(ev.amount), PALETTE_HEX.rarityUncommon);
      this.spawnParticleBurst(refs, TEX.plusHeal, 5);
      const anchors = resolveEventAnchors(ev, this.bagLayout, this.scale.canvasBounds);
      if (anchors.source) {
        this.spawnParticleBurstAt(anchors.source.x, anchors.source.y, TEX.plusHeal, 5);
      }
    } else if (ev.type === 'status_apply') {
      // UNTOUCHED — status_apply migration is M1.4b2 territory
      // (uses pulsePortrait + refreshBurnPip which still need refs).
      const refs = ev.target === 'player' ? this.playerRefs : this.ghostRefs;
      const label = ev.status.toUpperCase() + ' ×' + String(ev.stacks);
      this.spawnFloater(refs, label, PALETTE_HEX.rarityLegendary, true);
      this.pulsePortrait(refs);
      this.refreshBurnPip(refs, this.burnStacks[ev.target]);
    } else if (ev.type === 'status_tick') {
      // M1.4b1 + M1.4b2.1: consume resolveEventAnchors.
      // ANCHOR_RULE.status_tick='target' guarantees a target anchor.
      const anchors = resolveEventAnchors(ev, this.bagLayout, this.scale.canvasBounds);
      if (anchors.target) {
        this.spawnFloaterAt(anchors.target.x, anchors.target.y, '−' + String(ev.damage), PALETTE_HEX.rarityLegendary, true);
        this.spawnParticleBurstAt(anchors.target.x, anchors.target.y, TEX.squareStatus, 3);
      }
    } else if (ev.type === 'combat_end') {
      this.cameras.main.shake(SHAKE_DURATION_MS, SHAKE_INTENSITY);
      const koSide: EntityRef = ev.outcome === 'player_win' ? 'ghost' : 'player';
      const refs = koSide === 'player' ? this.playerRefs : this.ghostRefs;
      this.spawnKoFlash(refs);
    }
    // item_trigger / recipe_combine / buff_apply / buff_remove /
    // stun_consumed: no scene-level VFX in M1.3.4b — those need item
    // anchoring, deferred to M1.4 with the BagLayout handshake.
  }

  // ─────────────────────────────────────────────────────────────────
  // Scene element factories
  // ─────────────────────────────────────────────────────────────────

  private makePortrait(
    cx: number,
    cy: number,
    label: string,
    cls: string,
    accent: number,
    hp: number,
  ): PortraitRefs {
    const w = 180;
    const h = 180;

    const body = this.add.rectangle(cx, cy, w, h, PALETTE.surface);
    const border = this.add.rectangle(cx, cy, w, h);
    border.setStrokeStyle(2, accent);
    border.setFillStyle(0x000000, 0);

    // Inner silhouette: head circle + body trapezoid. Geometric primitives
    // only — real character art replaces these in M2.
    const head = this.add.circle(cx, cy - 20, 18, accent === PALETTE.accent ? 0x1d4ed8 : 0x475569);
    head.setStrokeStyle(2, PALETTE.bgMid);
    void head; // visual only; no per-frame access needed
    const torso = this.add.rectangle(cx, cy + 30, 64, 36, accent === PALETTE.accent ? 0x1d4ed8 : 0x334155);
    torso.setStrokeStyle(2, PALETTE.bgMid);
    void torso;

    const classLabel = this.add
      .text(cx, cy - h / 2 - 18, label + ' · ' + cls.toUpperCase(), {
        fontFamily: 'Inter, sans-serif',
        fontStyle: '600',
        fontSize: '10px',
        color: PALETTE_HEX.textSecondary,
      })
      .setOrigin(0.5, 0);
    classLabel.setLetterSpacing(2);

    // HP bar: bg rect (track) + fill rect (current). Width tweens via
    // setSize — Phaser's stock RESIZE-friendly path.
    const barW = w * 0.9;
    const barH = 6;
    const barY = cy + h / 2 + 14;
    const hpBarBg = this.add.rectangle(cx, barY, barW, barH, 0x000000, 0.4);
    const hpBarFill = this.add.rectangle(cx - barW / 2, barY, barW, barH, PALETTE.lifeRed);
    hpBarFill.setOrigin(0, 0.5);

    const hpLabel = this.add
      .text(cx, barY + 14, hp + ' / ' + hp, {
        fontFamily: 'Inter, sans-serif',
        fontStyle: '700',
        fontSize: '11px',
        color: PALETTE_HEX.textPrimary,
        fontFeatureSettings: 'tnum',
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5, 0);

    return {
      body,
      border,
      hpBarBg,
      hpBarFill,
      hpLabel,
      classLabel,
      burnPip: null,
      centerX: cx,
      centerY: cy,
    };
  }

  private syncHpBars(animate: boolean): void {
    this.tweenHpBar(this.playerRefs, this.playerHp, this.initialPlayerHp, animate);
    this.tweenHpBar(this.ghostRefs, this.ghostHp, this.initialGhostHp, animate);
  }

  private tweenHpBar(refs: PortraitRefs, hp: number, maxHp: number, animate: boolean): void {
    const clamped = Math.max(0, hp);
    const targetW = Math.max(0, (clamped / maxHp) * (refs.hpBarBg.width));
    refs.hpLabel.setText(clamped + ' / ' + maxHp);
    if (!animate) {
      refs.hpBarFill.setSize(targetW, refs.hpBarFill.height);
      refs.hpBarFill.setDisplaySize(targetW, refs.hpBarFill.height);
      return;
    }
    this.tweens.add({
      targets: refs.hpBarFill,
      displayWidth: targetW,
      duration: 80,
      ease: Phaser.Math.Easing.Quartic.Out,
    });
  }

  private spawnFloaterAt(x: number, y: number, text: string, colorHex: string, small = false): void {
    const t = this.add
      .text(x, y - 20, text, {
        fontFamily: 'Inter, sans-serif',
        fontStyle: '700',
        fontSize: small ? '14px' : '20px',
        color: colorHex,
        fontFeatureSettings: 'tnum',
        resolution: 2,
        shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 6, fill: true },
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5, 0.5);

    this.tweens.add({
      targets: t,
      y: y - 20 - FLOATER_RISE_PX,
      alpha: 0,
      duration: FLOATER_LIFETIME_MS,
      ease: Phaser.Math.Easing.Quartic.Out,
      onComplete: () => t.destroy(),
    });
  }

  private spawnFloater(refs: PortraitRefs, text: string, colorHex: string, small = false): void {
    this.spawnFloaterAt(refs.centerX, refs.centerY, text, colorHex, small);
  }

  private spawnParticleBurstAt(centerX: number, centerY: number, textureKey: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const dist = 40 + Math.random() * 20;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const p = this.add.image(centerX, centerY, textureKey);
      p.setAlpha(0.95);
      this.tweens.add({
        targets: p,
        x: centerX + dx,
        y: centerY + dy,
        alpha: 0,
        angle: (Math.random() - 0.5) * 90,
        duration: PARTICLE_LIFETIME_MS,
        ease: Phaser.Math.Easing.Quartic.Out,
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnParticleBurst(refs: PortraitRefs, textureKey: string, count: number): void {
    this.spawnParticleBurstAt(refs.centerX, refs.centerY, textureKey, count);
  }

  private spawnKoFlash(refs: PortraitRefs): void {
    const flash = this.add.rectangle(refs.centerX, refs.centerY, 200, 200, PALETTE.lifeRed, 0.55);
    flash.setBlendMode(Phaser.BlendModes.SCREEN);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.3,
      duration: 600,
      ease: Phaser.Math.Easing.Quartic.Out,
      onComplete: () => flash.destroy(),
    });
  }

  /** Hit-flash overlay on a portrait. M1.4b2.2 primitive (Q4 Option B
   *  ratified): mutation-free overlay-and-destroy; mirrors spawnKoFlash's
   *  structure with smaller + shorter values via PORTRAIT_FLASH_* tunable
   *  consts (no magic numbers per § 4.5 R2). Color is parameterized so
   *  the same primitive can later cover heal-target (Q3 (ii) — currently
   *  scoped out per (i)) or new event types without rewrites. */
  private flashPortrait(refs: PortraitRefs, color: number): void {
    const flash = this.add.rectangle(
      refs.centerX,
      refs.centerY,
      PORTRAIT_FLASH_SIZE_PX,
      PORTRAIT_FLASH_SIZE_PX,
      color,
      PORTRAIT_FLASH_INITIAL_ALPHA,
    );
    flash.setBlendMode(Phaser.BlendModes.SCREEN);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: PORTRAIT_FLASH_SCALE_END,
      duration: PORTRAIT_FLASH_DURATION_MS,
      ease: Phaser.Math.Easing.Quartic.Out,
      onComplete: () => flash.destroy(),
    });
  }

  private pulsePortrait(refs: PortraitRefs): void {
    const orig = refs.border.scale;
    this.tweens.add({
      targets: refs.border,
      scale: orig * 1.06,
      duration: STATUS_PULSE_MS / 2,
      ease: Phaser.Math.Easing.Quartic.Out,
      yoyo: true,
    });
  }

  private refreshBurnPip(refs: PortraitRefs, stacks: number): void {
    if (refs.burnPip) {
      refs.burnPip.destroy(true);
      refs.burnPip = null;
    }
    if (stacks <= 0) return;
    const x = refs.centerX + 90 - 14;
    const y = refs.centerY - 90 + 14;
    const container = this.add.container(x, y);
    const bg = this.add.rectangle(0, 0, 28, 28, PALETTE.surfaceElev);
    bg.setStrokeStyle(2, PALETTE.rarityLegendary);
    const label = this.add
      .text(0, 0, String(stacks), {
        fontFamily: 'Inter, sans-serif',
        fontStyle: '700',
        fontSize: '12px',
        color: PALETTE_HEX.textPrimary,
        fontFeatureSettings: 'tnum',
      } as Phaser.Types.GameObjects.Text.TextStyle)
      .setOrigin(0.5, 0.5);
    container.add([bg, label]);
    refs.burnPip = container;
  }

  // ─────────────────────────────────────────────────────────────────
  // Programmatic textures — all geometric, all palette-only.
  // ─────────────────────────────────────────────────────────────────

  private makeSquareTexture(key: string, color: number): void {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(0, 0, 8, 8);
    g.generateTexture(key, 8, 8);
    g.destroy();
  }

  private makeLineTexture(key: string, color: number): void {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(0, 0, 14, 2);
    g.generateTexture(key, 14, 2);
    g.destroy();
  }

  private makePlusTexture(key: string, color: number): void {
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(4, 0, 2, 10);
    g.fillRect(0, 4, 10, 2);
    g.generateTexture(key, 10, 10);
    g.destroy();
  }
}

/** Builds a transparent-canvas Phaser.Game pinned to `parent`, registers
 *  CombatScene, and returns the game instance. Caller is responsible
 *  for `game.destroy(true)` on unmount.
 *
 *  Lazy-boundary discipline: this factory and CombatScene live in the
 *  combat chunk (only CombatOverlay imports CombatScene), so Phaser
 *  ships exclusively in the combat chunk per Vite chunk-splitting. */
export function createCombatGame(
  parent: HTMLDivElement,
  data: CombatSceneInitData,
): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: parent.clientWidth || 1,
    height: parent.clientHeight || 1,
    transparent: true,
    backgroundColor: 'rgba(0,0,0,0)',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    fps: { target: 60, smoothStep: true },
    scene: [CombatScene],
    // Phaser writes its banner to console.log on game start; silence it
    // (not informational for our app, takes runtime cycles).
    banner: false,
  });
  game.scene.start(CombatScene.KEY, data);
  return game;
}
