// Left rail: class passive icon + relic slots + opponent intent silhouettes.
//
// M1.5b PR 1 Phase 2.5b (playtest catch on 17bd494): reads class +
// relics from useRunContext authoritative state. Pre-fix the rail
// rendered a static "Tinker / +10% recipe potency / Apprentice's
// Loop / EMPTY / EMPTY" prototype snapshot regardless of the player's
// class-select picks or any granted mid/boss relic. The state-write
// chain (ClassSelectScreen → useRun.beginRun → sim.createRun →
// applySimSnapshot) was already correct; this surface just never
// read it.

import { useMemo } from 'react';
import { CLASSES, RELICS } from '@packbreaker/content';
import type { Relic } from '@packbreaker/content';
import { useRunContext } from '../run/RunContext';
import { trophyDeltaFor } from '../run/sim-bridge';
import { ghostIntentForRound } from '../combat/ghostIntent';
import type { ItemId } from '../run/types';
import {
  ClassMark,
  GenericRelicGlyph,
  RelicGlyph,
} from '../screens/class-select/atoms';
import { GhostGlyph, ICONS } from '../icons/icons';

/** CF-85 Surface 2a: REAL marquee silhouettes for the current round's
 *  ghost (was: hardcoded iron-sword + wooden-shield regardless of the
 *  actual build). Monochrome filter keeps them silhouettes — a hint of
 *  the headline threat, not a full-color pre-combat reveal (gdd.md §14
 *  caps this surface at 1–2 items, never the full bag). */
function OpponentSilhouettes({ itemIds }: { itemIds: ReadonlyArray<ItemId> }) {
  return (
    <div className="flex gap-2">
      {itemIds.map((id) => {
        const Icon = ICONS[id] ?? ICONS['copper-coin'];
        return (
          <div
            key={id}
            data-testid={`intent-silhouette-${id}`}
            style={{ width: 32, height: 32, background: 'var(--bg-deep)', borderRadius: 4, padding: 4 }}
          >
            <div style={{ filter: 'brightness(0) invert(0.6)' }}>
              <Icon />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Filled relic slot card. Used for any of the three relic slots when
 *  state.relics[slot] is non-null. The starter slot uses the named
 *  RelicGlyph (atoms.tsx covers all 6 starter relic IDs); mid / boss
 *  slots fall back to GenericRelicGlyph pending CF 44. */
function FilledRelicSlot({
  relic,
  glyphKind,
}: {
  relic: Relic;
  glyphKind: 'named' | 'generic';
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: 'var(--surface)',
        padding: 8,
        borderRadius: 6,
        border: '1px solid var(--accent)',
      }}
    >
      <div style={{ width: 22, height: 22 }}>
        {glyphKind === 'named' ? (
          <RelicGlyph id={String(relic.id)} size={22} />
        ) : (
          <GenericRelicGlyph size={22} />
        )}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600 }}>{relic.name}</div>
        <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
          {relic.description}
        </div>
      </div>
    </div>
  );
}

function EmptyRelicSlot() {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        height: 38,
        borderRadius: 6,
        border: '1px dashed var(--border-default)',
        background: 'transparent',
      }}
    >
      <span className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
        EMPTY
      </span>
    </div>
  );
}

export function LeftRail() {
  const { state } = useRunContext();
  const classId = state.state.classId;
  const clazz = CLASSES[classId]!;
  const relics = state.state.relics;
  const starter = relics.starter ? RELICS[relics.starter]! : null;
  const mid = relics.mid ? RELICS[relics.mid]! : null;
  const boss = relics.boss ? RELICS[relics.boss]! : null;

  // CF-85 Surface 2a: the REAL intent for the round being arranged
  // against — same pure (seed, round, dims) derivation the combat's
  // buildCombatInput makes, so the panel can never advertise a ghost the
  // fight won't produce. Memo keyed on exactly those inputs.
  const s = state.state;
  const intent = useMemo(
    () => ghostIntentForRound(s.seed, s.round, s.ruleset.bagDimensions),
    [s.seed, s.round, s.ruleset.bagDimensions],
  );
  // CF-85 Surface 3: real signed trophy deltas from the sim's SOLE award
  // derivation (CF-38/CF-72 antidote — replaces the hardcoded "±1").
  // Pre-combat read: trophy is the same input the sim will apply against.
  const winDelta = trophyDeltaFor('win', s.round, s.trophy);
  const lossDelta = trophyDeltaFor('loss', s.round, s.trophy);

  return (
    <div
      className="flex flex-col"
      style={{
        width: 180,
        background: 'var(--bg-mid)',
        borderRight: '1px solid var(--border-default)',
        padding: 14,
        gap: 14,
      }}
    >
      <div>
        <div
          className="label-cap"
          style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}
        >
          CLASS
        </div>
        <div
          className="flex items-center gap-2"
          style={{
            background: 'var(--surface)',
            padding: 8,
            borderRadius: 6,
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ width: 26, height: 26 }}>
            <ClassMark kind={classId} size={26} />
          </div>
          <div>
            {/* data-testid disambiguates from the CF-85 intent panel's
                ghost class, which can legitimately render the same
                class name (e.g. a Marauder player vs an odd-round
                Marauder ghost). */}
            <div data-testid="player-class" style={{ fontSize: 12, fontWeight: 600 }}>
              {clazz.displayName}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
              {clazz.passive.description}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div
          className="label-cap"
          style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}
        >
          RELICS
        </div>
        <div className="flex flex-col gap-2">
          {starter ? (
            <FilledRelicSlot relic={starter} glyphKind="named" />
          ) : (
            <EmptyRelicSlot />
          )}
          {mid ? (
            <FilledRelicSlot relic={mid} glyphKind="generic" />
          ) : (
            <EmptyRelicSlot />
          )}
          {boss ? (
            <FilledRelicSlot relic={boss} glyphKind="generic" />
          ) : (
            <EmptyRelicSlot />
          )}
        </div>
      </div>

      <div>
        <div
          className="label-cap"
          style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}
        >
          OPPONENT INTENT
        </div>
        <div
          style={{
            background: 'var(--surface)',
            padding: 10,
            borderRadius: 6,
            border: '1px solid var(--border-default)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div style={{ width: 28, height: 28 }}>
              <GhostGlyph />
            </div>
            <div>
              {/* CF-85 Surface 2a: real apparent class (gdd.md §14). */}
              <div style={{ fontSize: 11, fontWeight: 600 }}>
                Ghost · <span data-testid="intent-class">{intent.classLabel}</span>
              </div>
              {/* CF-85 Surface 3: real round + real SIGNED win/loss trophy
                  deltas via trophyDeltaFor (was the hardcoded
                  "Round 4 · ±1 trophy"). winDelta is strictly positive by
                  construction (CF-72 schedule) so the '+' is safe;
                  lossDelta carries its own sign (post-clamp actual). */}
              <div data-testid="intent-hint" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
                Round {s.round} · Win +{winDelta} · Loss {lossDelta}
              </div>
            </div>
          </div>
          <div
            data-testid="intent-contract"
            style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.3 }}
          >
            {s.contractName} — {s.contractText}
          </div>
          <div
            className="label-cap"
            style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 4 }}
          >
            SILHOUETTES
          </div>
          <OpponentSilhouettes itemIds={intent.marqueeItemIds} />
        </div>
      </div>
    </div>
  );
}
