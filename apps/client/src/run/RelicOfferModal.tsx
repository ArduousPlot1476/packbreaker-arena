// Relic offer modal (graybox per M1 kill list). Renders mid or boss
// relic offer cards when the run controller is in the eligible window.
// Phase 2b ships mid-only (2 cards per class — Tinker:
// resonant-anchor + catalyst; Marauder: berserkers-pendant +
// crimson-pact). Boss surfacing carved out to PR 3 part 2 because
// surfacing it requires restructuring onCombatDone's atomic
// applyCombatOutcome → advancePhase to expose the resolution-phase gap
// where sim's grant_relic boss gate is legal.
//
// Card click → grantSelectedRelic(slot, relicId) → sim.grantRelic +
// sync_from_sim. The next render sees state.relics.mid populated and
// pendingRelicOffer reads null, so the modal unmounts naturally.

import { RELICS, type RelicId } from '@packbreaker/content'
import { useRunContext } from './RunContext'

export function RelicOfferModal() {
  const { pendingRelicOffer, grantSelectedRelic } = useRunContext()
  if (pendingRelicOffer === null) return null
  const { slot, cards } = pendingRelicOffer
  return (
    <div
      data-testid="relic-offer-modal"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: 'var(--bg-deep, #1a1a1a)',
          color: 'var(--text-primary, #fff)',
          padding: 24,
          borderRadius: 8,
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div data-testid="relic-offer-title" style={{ fontWeight: 'bold' }}>
          {slot === 'mid' ? 'Choose a mid relic' : 'Choose a boss relic'}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {cards.map((relicId) => (
            <RelicCard
              key={relicId}
              relicId={relicId}
              onClick={() => grantSelectedRelic(slot, relicId)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function RelicCard({ relicId, onClick }: { relicId: RelicId; onClick: () => void }) {
  const relic = RELICS[relicId]
  return (
    <button
      type="button"
      data-testid={`relic-offer-card-${String(relicId)}`}
      onClick={onClick}
      style={{
        background: 'var(--bg-card, #2a2a2a)',
        color: 'inherit',
        padding: 12,
        border: '1px solid var(--border, #444)',
        borderRadius: 4,
        textAlign: 'left',
        minWidth: 180,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontWeight: 'bold' }}>{relic.name}</div>
      <div style={{ fontSize: 13, opacity: 0.85 }}>{relic.description}</div>
    </button>
  )
}
