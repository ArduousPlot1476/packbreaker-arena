// Mobile [Relics] tab content per Trey's decision-2 ratification:
// class passive header card + 3 relic slots. Mirrors the desktop
// LeftRail's CLASS + RELICS blocks (less the OPPONENT INTENT block,
// which moved to the top bar per decision-1).
//
// M1.5b PR 1 Phase 2.5b (playtest catch on 17bd494): reads class
// glyph + passive description + all 3 relic slots from authoritative
// state. Pre-fix the tab only read state.className for the class
// name; everything else was a hardcoded Tinker / Apprentice's Loop /
// EMPTY / EMPTY prototype snapshot. See LeftRail.tsx for the same
// fix on the desktop branch.

import { CLASSES, RELICS } from '@packbreaker/content';
import type { Relic } from '@packbreaker/content';
import type { RunState } from '../../../run/types';
import {
  ClassMark,
  GenericRelicGlyph,
  RelicGlyph,
} from '../../class-select/atoms';

interface RelicsTabProps {
  state: RunState;
}

function FilledRelicSlot({
  relic,
  glyphKind,
}: {
  relic: Relic;
  glyphKind: 'named' | 'generic';
}) {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        background: 'var(--surface)',
        padding: 10,
        borderRadius: 6,
        border: '1px solid var(--accent)',
      }}
    >
      <div style={{ width: 26, height: 26 }}>
        {glyphKind === 'named' ? (
          <RelicGlyph id={String(relic.id)} size={26} />
        ) : (
          <GenericRelicGlyph size={26} />
        )}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {relic.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
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
        minHeight: 48,
        borderRadius: 6,
        border: '1px dashed var(--border-default)',
        background: 'transparent',
      }}
    >
      <span className="label-cap" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        EMPTY
      </span>
    </div>
  );
}

export function RelicsTab({ state }: RelicsTabProps) {
  const classId = state.classId;
  const clazz = CLASSES[classId]!;
  const starter = state.relics.starter ? RELICS[state.relics.starter]! : null;
  const mid = state.relics.mid ? RELICS[state.relics.mid]! : null;
  const boss = state.relics.boss ? RELICS[state.relics.boss]! : null;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: 12,
        overflow: 'auto',
        background: 'var(--bg-deep)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div
          className="label-cap"
          style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}
        >
          CLASS
        </div>
        <div
          className="flex items-center gap-3"
          style={{
            background: 'var(--surface)',
            padding: 12,
            borderRadius: 6,
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ width: 30, height: 30 }}>
            <ClassMark kind={classId} size={30} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {state.className}
            </div>
            <div
              style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}
            >
              {clazz.passive.description}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div
          className="label-cap"
          style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}
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
    </div>
  );
}
