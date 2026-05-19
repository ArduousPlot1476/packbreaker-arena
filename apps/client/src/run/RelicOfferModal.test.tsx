// Unit tests for RelicOfferModal. Mocks useRunContext to drive the
// rendered state directly — RunContext integration is covered by the
// integration tests in RunContext.test.tsx; this file isolates the
// modal's render-when-non-null + click-dispatch shape.
//
// Phase 2b ships mid-only detection in useRun, but the modal renders
// either slot when pendingRelicOffer is non-null (forward-compat for
// PR 3 part 2 boss surfacing). The boss-render test is included here
// to lock the forward-compat shape; the boss detection path is left
// to PR 3 part 2.

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { RelicId } from '@packbreaker/content'
import { RelicOfferModal } from './RelicOfferModal'

type MockContext = {
  pendingRelicOffer:
    | { readonly slot: 'mid' | 'boss'; readonly cards: ReadonlyArray<RelicId> }
    | null
  grantSelectedRelic: (slot: 'mid' | 'boss', relicId: RelicId) => void
}

let mockContext: MockContext = {
  pendingRelicOffer: null,
  grantSelectedRelic: vi.fn(),
}

vi.mock('./RunContext', () => ({
  useRunContext: () => mockContext,
}))

describe('RelicOfferModal', () => {
  beforeEach(() => {
    mockContext = {
      pendingRelicOffer: null,
      grantSelectedRelic: vi.fn(),
    }
  })

  it('renders nothing when pendingRelicOffer is null', () => {
    const { queryByTestId } = render(<RelicOfferModal />)
    expect(queryByTestId('relic-offer-modal')).toBeNull()
  })

  it('renders 2 cards for a mid offer (M1 Tinker mid pool)', () => {
    mockContext = {
      pendingRelicOffer: {
        slot: 'mid',
        cards: ['resonant-anchor' as RelicId, 'catalyst' as RelicId],
      },
      grantSelectedRelic: vi.fn(),
    }
    const { getByTestId, getAllByTestId } = render(<RelicOfferModal />)
    expect(getByTestId('relic-offer-modal')).toBeInTheDocument()
    expect(getByTestId('relic-offer-title').textContent).toBe('Choose a mid relic')
    const cards = getAllByTestId(/^relic-offer-card-/)
    expect(cards).toHaveLength(2)
  })

  it('renders 1 card for a boss offer (boss detection path shipped at PR 3 Phase 2d)', () => {
    mockContext = {
      pendingRelicOffer: {
        slot: 'boss',
        cards: ['worldforge-seed' as RelicId],
      },
      grantSelectedRelic: vi.fn(),
    }
    const { getByTestId, getAllByTestId } = render(<RelicOfferModal />)
    expect(getByTestId('relic-offer-modal')).toBeInTheDocument()
    expect(getByTestId('relic-offer-title').textContent).toBe('Choose a boss relic')
    const cards = getAllByTestId(/^relic-offer-card-/)
    expect(cards).toHaveLength(1)
  })

  it('clicking a card dispatches grantSelectedRelic with (slot, relicId)', () => {
    const grant = vi.fn()
    mockContext = {
      pendingRelicOffer: {
        slot: 'mid',
        cards: ['resonant-anchor' as RelicId, 'catalyst' as RelicId],
      },
      grantSelectedRelic: grant,
    }
    const { getByTestId } = render(<RelicOfferModal />)
    fireEvent.click(getByTestId('relic-offer-card-catalyst'))
    expect(grant).toHaveBeenCalledOnce()
    expect(grant).toHaveBeenCalledWith('mid', 'catalyst')
  })

  it('renders the relic name + description from RELICS for each card', () => {
    mockContext = {
      pendingRelicOffer: {
        slot: 'mid',
        cards: ['resonant-anchor' as RelicId],
      },
      grantSelectedRelic: vi.fn(),
    }
    const { getByText } = render(<RelicOfferModal />)
    expect(getByText('Resonant Anchor')).toBeInTheDocument()
    expect(getByText('+1 shop slot.')).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────
  // M1.5b PR 1 F.4 — Marauder integration smoke. Both Marauder mid
  // candidates (berserkers-pendant + crimson-pact) and boss
  // (conquerors-crown) must render through the same modal surface
  // that previously only saw Tinker offers under M1_PROTOTYPE_CLASS.
  // ─────────────────────────────────────────────────────────────

  it('F.4 Marauder mid offer renders berserkers-pendant + crimson-pact (balance-bible.md § 13)', () => {
    mockContext = {
      pendingRelicOffer: {
        slot: 'mid',
        cards: ['berserkers-pendant' as RelicId, 'crimson-pact' as RelicId],
      },
      grantSelectedRelic: vi.fn(),
    }
    const { getByTestId, getByText, getAllByTestId } = render(<RelicOfferModal />)
    expect(getByTestId('relic-offer-title').textContent).toBe('Choose a mid relic')
    expect(getAllByTestId(/^relic-offer-card-/)).toHaveLength(2)
    expect(getByText("Berserker's Pendant")).toBeInTheDocument()
    expect(getByText('+3 base damage on every damage effect. Stacks.')).toBeInTheDocument()
    expect(getByText('Crimson Pact')).toBeInTheDocument()
    expect(getByText('+35% lifesteal. Stacks.')).toBeInTheDocument()
  })

  it('F.4 Marauder mid click → grantSelectedRelic("mid", "berserkers-pendant")', () => {
    const grant = vi.fn()
    mockContext = {
      pendingRelicOffer: {
        slot: 'mid',
        cards: ['berserkers-pendant' as RelicId, 'crimson-pact' as RelicId],
      },
      grantSelectedRelic: grant,
    }
    const { getByTestId } = render(<RelicOfferModal />)
    fireEvent.click(getByTestId('relic-offer-card-berserkers-pendant'))
    expect(grant).toHaveBeenCalledOnce()
    expect(grant).toHaveBeenCalledWith('mid', 'berserkers-pendant')
  })

  it('F.4 Marauder boss offer renders conquerors-crown (balance-bible.md § 13)', () => {
    mockContext = {
      pendingRelicOffer: {
        slot: 'boss',
        cards: ['conquerors-crown' as RelicId],
      },
      grantSelectedRelic: vi.fn(),
    }
    const { getByTestId, getByText, getAllByTestId } = render(<RelicOfferModal />)
    expect(getByTestId('relic-offer-title').textContent).toBe('Choose a boss relic')
    expect(getAllByTestId(/^relic-offer-card-/)).toHaveLength(1)
    expect(getByText("Conqueror's Crown")).toBeInTheDocument()
    expect(
      getByText('+4 base damage on every damage effect; +3g per round won.'),
    ).toBeInTheDocument()
  })

  it('F.4 Marauder boss click → grantSelectedRelic("boss", "conquerors-crown")', () => {
    const grant = vi.fn()
    mockContext = {
      pendingRelicOffer: {
        slot: 'boss',
        cards: ['conquerors-crown' as RelicId],
      },
      grantSelectedRelic: grant,
    }
    const { getByTestId } = render(<RelicOfferModal />)
    fireEvent.click(getByTestId('relic-offer-card-conquerors-crown'))
    expect(grant).toHaveBeenCalledOnce()
    expect(grant).toHaveBeenCalledWith('boss', 'conquerors-crown')
  })
})
