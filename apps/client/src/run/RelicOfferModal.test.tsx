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

  it('renders 1 card for a boss offer (forward-compat shape; boss detection path lands in PR 3 part 2)', () => {
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
})
