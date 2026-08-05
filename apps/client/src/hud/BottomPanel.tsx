// Bottom panel: combat log summary line. Reads the most recent
// RunHistoryEntry from runState.history so the desktop summary tracks
// real combat outcomes (matched to the mobile [Log] tab's full list).
//
// M1.3.4a (commit 5 — Trey screenshot review): replaces the prototype's
// hardcoded "R3 · won vs ghost (Marauder) ·…" string that survived
// data.local dissolution by being literal-baked into the JSX. Empty
// state ("0 ROUNDS") shows on a fresh run before any combat resolves.
//
// Class label derives from round parity (mirrors combat/ghost.ts and
// the mobile LogTab); re-source from server-side ghost record in M2.
//
// The EXPAND affordance and last-round damage chart remain deferred. The
// non-functional "EXPAND ↑" label was REMOVED (2026-08-04): it carried
// `cursor: pointer` and no onClick, so it invited a click that did nothing —
// a lie in permanent chrome, and the kind of thing a first-time player reads
// as "this game is broken". Deferred work should be absent, not fake.

import type { RunState } from '../run/types';

interface BottomPanelProps {
  state: RunState;
}

function opponentClassLabel(round: number): string {
  return round % 2 === 1 ? 'Marauder' : 'Tinker';
}

export function BottomPanel({ state }: BottomPanelProps) {
  const last = state.history.length > 0 ? state.history[state.history.length - 1]! : null;
  return (
    <div
      className="flex items-center justify-between"
      style={{
        height: 32,
        padding: '0 18px',
        background: 'var(--bg-mid)',
        borderTop: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          LOG
        </span>
        {last ? (
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            R{last.round} · {last.outcome === 'win' ? 'won' : 'lost'} vs ghost (
            {opponentClassLabel(last.round)}) · {last.damageDealt} dmg dealt ·{' '}
            {last.damageTaken} dmg taken
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            0 ROUNDS · awaiting first combat
          </span>
        )}
      </div>
    </div>
  );
}
