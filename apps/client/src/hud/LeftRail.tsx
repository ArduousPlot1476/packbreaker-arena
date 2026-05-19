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

import { CLASSES, RELICS } from '@packbreaker/content';
import type { Relic } from '@packbreaker/content';
import { useRunContext } from '../run/RunContext';
import {
  ClassMark,
  GenericRelicGlyph,
  RelicGlyph,
} from '../screens/class-select/atoms';
import { GhostGlyph, ICONS } from '../icons/icons';

function OpponentSilhouettes() {
  const Sword = ICONS['iron-sword'];
  const Shield = ICONS['wooden-shield'];
  return (
    <div className="flex gap-2">
      <div
        style={{ width: 32, height: 32, background: 'var(--bg-deep)', borderRadius: 4, padding: 4 }}
      >
        <div style={{ filter: 'brightness(0) invert(0.6)' }}>
          <Sword />
        </div>
      </div>
      <div
        style={{ width: 32, height: 32, background: 'var(--bg-deep)', borderRadius: 4, padding: 4 }}
      >
        <div style={{ filter: 'brightness(0) invert(0.6)' }}>
          <Shield />
        </div>
      </div>
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
            <div style={{ fontSize: 12, fontWeight: 600 }}>{clazz.displayName}</div>
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
              <div style={{ fontSize: 11, fontWeight: 600 }}>Ghost</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Round 4 · ±1 trophy</div>
            </div>
          </div>
          <div
            className="label-cap"
            style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 4 }}
          >
            SILHOUETTES
          </div>
          <OpponentSilhouettes />
        </div>
      </div>
    </div>
  );
}
