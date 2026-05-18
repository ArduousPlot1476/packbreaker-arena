// Run-end overlay (graybox per M1 kill list). Renders when
// isRunEnded === true (sim's outcome !== 'in_progress'). Shows
// outcome label + round reached + hearts remaining. Trophy is NOT
// displayed here — Q13/LA 32 trophy is client-authoritative state
// that lives outside Phase 2b; 5b.2 wires resolution-side trophy
// summary.
//
// 'Return to menu' is a no-op placeholder; 5b.2 wires real
// navigation.

import { useRunContext } from './RunContext'

const OUTCOME_LABELS = {
  won: 'Victory',
  eliminated: 'Defeat',
  abandoned: 'Run abandoned',
} as const

export function RunEndOverlay() {
  const { state, isRunEnded } = useRunContext()
  if (!isRunEnded) return null
  const outcome = state.state.outcome
  const label =
    outcome === 'won' || outcome === 'eliminated' || outcome === 'abandoned'
      ? OUTCOME_LABELS[outcome]
      : 'Run ended'
  return (
    <div
      data-testid="run-end-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
      }}
    >
      <div
        style={{
          background: 'var(--bg-deep, #1a1a1a)',
          color: 'var(--text-primary, #fff)',
          padding: 24,
          borderRadius: 8,
          minWidth: 280,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <div data-testid="run-end-outcome" style={{ fontWeight: 'bold', fontSize: 20 }}>
          {label}
        </div>
        <div data-testid="run-end-round">Round reached: {state.state.round}</div>
        <div data-testid="run-end-hearts">Hearts remaining: {state.state.hearts}</div>
        <button
          type="button"
          data-testid="run-end-return-button"
          onClick={() => {
            // Phase 2b placeholder; 5b.2 wires real navigation.
          }}
          style={{
            marginTop: 8,
            background: 'var(--bg-card, #2a2a2a)',
            color: 'inherit',
            padding: '8px 16px',
            border: '1px solid var(--border, #444)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Return to menu
        </button>
      </div>
    </div>
  )
}
