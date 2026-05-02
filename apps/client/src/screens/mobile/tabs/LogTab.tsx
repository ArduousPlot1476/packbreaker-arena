// Mobile [Log] tab content per Trey's decision-5 ratification:
// vertical stack of round entries. Last-round damage chart deferred
// on both desktop and mobile per the closing-entry note ("revisit
// when telemetry surfaces a need").
//
// M1.3.3 graybox: round history is mocked (sim integration in M1.3.4
// will provide real per-round results). Static placeholder entries
// scaled to current round number.

import type { RunState } from '../../../run/types';

interface LogTabProps {
  state: RunState;
}

interface MockRoundEntry {
  round: number;
  outcome: 'won' | 'lost';
  opponentClass: 'Tinker' | 'Marauder';
  damageDealt: number;
  damageTaken: number;
}

function mockHistory(currentRound: number): MockRoundEntry[] {
  const entries: MockRoundEntry[] = [
    { round: 1, outcome: 'won', opponentClass: 'Marauder', damageDealt: 5, damageTaken: 2 },
    { round: 2, outcome: 'lost', opponentClass: 'Tinker', damageDealt: 4, damageTaken: 5 },
    { round: 3, outcome: 'won', opponentClass: 'Marauder', damageDealt: 6, damageTaken: 3 },
  ];
  return entries.filter((e) => e.round < currentRound);
}

export function LogTab({ state }: LogTabProps) {
  const history = mockHistory(state.round);
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
        gap: 8,
      }}
    >
      <div className="flex items-baseline gap-2">
        <div className="label-cap" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          LOG
        </div>
        <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {history.length} ROUND{history.length === 1 ? '' : 'S'}
        </div>
      </div>

      {history.length === 0 ? (
        <div
          className="flex items-center justify-center"
          style={{
            padding: '32px 12px',
            border: '1px dashed var(--border-default)',
            borderRadius: 6,
            background: 'var(--surface)',
          }}
        >
          <div className="label-cap" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            NO ROUNDS YET
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {history.map((e) => (
            <div
              key={e.round}
              className="flex items-center gap-2"
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                background: 'var(--surface)',
                border: '1px solid var(--border-default)',
              }}
            >
              <span
                className="label-cap tnum"
                style={{ fontSize: 10, color: 'var(--text-secondary)', minWidth: 24 }}
              >
                R{e.round}
              </span>
              <span
                className="label-cap"
                style={{
                  fontSize: 10,
                  color: e.outcome === 'won' ? 'var(--r-uncommon)' : 'var(--life-stroke)',
                  minWidth: 36,
                }}
              >
                {e.outcome.toUpperCase()}
              </span>
              <span
                style={{ fontSize: 11, color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}
              >
                vs ghost ({e.opponentClass})
              </span>
              <span
                className="tnum"
                style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{e.damageDealt}</span>
                {' / '}
                <span style={{ color: 'var(--life-stroke)' }}>{e.damageTaken}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
