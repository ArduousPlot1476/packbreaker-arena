// Unit tests for RelicOfferModal. Mocks useRunContext to drive the rendered
// state directly — RunContext integration is covered in RunContext.test.tsx;
// this file isolates the modal's render-when-non-null + click-dispatch shape.
//
// Covers the mid + boss relic legs and (CF-67) the boss Legendary item leg:
// heterogeneous OfferCard rendering and exclusive dispatch (a click fires
// exactly one grant, for exactly the card clicked).

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import type { ItemId, RelicId } from '@packbreaker/content'
import type { OfferCard } from './useRun'
import { RelicOfferModal } from './RelicOfferModal'

type MockContext = {
  pendingRelicOffer:
    | { readonly slot: 'mid' | 'boss'; readonly cards: ReadonlyArray<OfferCard> }
    | null
  grantSelectedRelic: (slot: 'mid' | 'boss', relicId: RelicId) => void
  grantSelectedItem: (itemId: ItemId) => void
}

let mockContext: MockContext = {
  pendingRelicOffer: null,
  grantSelectedRelic: vi.fn(),
  grantSelectedItem: vi.fn(),
}

vi.mock('./RunContext', () => ({
  useRunContext: () => mockContext,
}))

const relicCard = (relicId: string): OfferCard => ({
  kind: 'relic',
  relicId: relicId as RelicId,
})
const itemCard = (itemId: string): OfferCard => ({
  kind: 'item',
  itemId: itemId as ItemId,
})

describe('RelicOfferModal', () => {
  beforeEach(() => {
    mockContext = {
      pendingRelicOffer: null,
      grantSelectedRelic: vi.fn(),
      grantSelectedItem: vi.fn(),
    }
  })

  it('renders nothing when pendingRelicOffer is null', () => {
    const { queryByTestId } = render(<RelicOfferModal />)
    expect(queryByTestId('relic-offer-modal')).toBeNull()
  })

  it('renders 2 cards for a mid offer (M1 Tinker mid pool)', () => {
    mockContext = {
      ...mockContext,
      pendingRelicOffer: {
        slot: 'mid',
        cards: [relicCard('resonant-anchor'), relicCard('catalyst')],
      },
    }
    const { getByTestId, getAllByTestId } = render(<RelicOfferModal />)
    expect(getByTestId('relic-offer-modal')).toBeInTheDocument()
    expect(getByTestId('relic-offer-title').textContent).toBe('Choose a mid relic')
    expect(getAllByTestId(/^relic-offer-card-/)).toHaveLength(2)
  })

  it('clicking a mid relic card dispatches grantSelectedRelic with (slot, relicId)', () => {
    const grant = vi.fn()
    mockContext = {
      ...mockContext,
      pendingRelicOffer: {
        slot: 'mid',
        cards: [relicCard('resonant-anchor'), relicCard('catalyst')],
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
      ...mockContext,
      pendingRelicOffer: { slot: 'mid', cards: [relicCard('resonant-anchor')] },
    }
    const { getByText } = render(<RelicOfferModal />)
    expect(getByText('Resonant Anchor')).toBeInTheDocument()
    expect(getByText('+1 shop slot.')).toBeInTheDocument()
  })

  // ─── CF-67: boss reward offer (boss relic + Legendary item) ──────

  it('boss offer renders BOTH the boss relic and the world-forged-heart item card, titled "Choose a boss reward"', () => {
    mockContext = {
      ...mockContext,
      pendingRelicOffer: {
        slot: 'boss',
        cards: [relicCard('conquerors-crown'), itemCard('world-forged-heart')],
      },
    }
    const { getByTestId, getByText, getAllByTestId } = render(<RelicOfferModal />)
    expect(getByTestId('relic-offer-title').textContent).toBe('Choose a boss reward')
    expect(getAllByTestId(/^relic-offer-card-/)).toHaveLength(2)
    // relic card (name from RELICS)
    expect(getByText("Conqueror's Crown")).toBeInTheDocument()
    // item card (name from ITEMS)
    expect(getByTestId('relic-offer-card-world-forged-heart')).toBeInTheDocument()
    expect(getByText('World-Forged Heart')).toBeInTheDocument()
  })

  it('clicking the item card dispatches grantSelectedItem(itemId) ONLY — exclusive selection', () => {
    const grantRelic = vi.fn()
    const grantItem = vi.fn()
    mockContext = {
      ...mockContext,
      pendingRelicOffer: {
        slot: 'boss',
        cards: [relicCard('conquerors-crown'), itemCard('world-forged-heart')],
      },
      grantSelectedRelic: grantRelic,
      grantSelectedItem: grantItem,
    }
    const { getByTestId } = render(<RelicOfferModal />)
    fireEvent.click(getByTestId('relic-offer-card-world-forged-heart'))
    expect(grantItem).toHaveBeenCalledOnce()
    expect(grantItem).toHaveBeenCalledWith('world-forged-heart')
    expect(grantRelic).not.toHaveBeenCalled()
  })

  it('clicking the relic card in a 2-card boss offer dispatches grantSelectedRelic ONLY — exclusive selection', () => {
    const grantRelic = vi.fn()
    const grantItem = vi.fn()
    mockContext = {
      ...mockContext,
      pendingRelicOffer: {
        slot: 'boss',
        cards: [relicCard('conquerors-crown'), itemCard('world-forged-heart')],
      },
      grantSelectedRelic: grantRelic,
      grantSelectedItem: grantItem,
    }
    const { getByTestId } = render(<RelicOfferModal />)
    fireEvent.click(getByTestId('relic-offer-card-conquerors-crown'))
    expect(grantRelic).toHaveBeenCalledOnce()
    expect(grantRelic).toHaveBeenCalledWith('boss', 'conquerors-crown')
    expect(grantItem).not.toHaveBeenCalled()
  })

  // ─── Marauder integration smoke (OfferCard shape) ────────────────

  it('F.4 Marauder mid offer renders berserkers-pendant + crimson-pact (balance-bible.md § 13)', () => {
    mockContext = {
      ...mockContext,
      pendingRelicOffer: {
        slot: 'mid',
        cards: [relicCard('berserkers-pendant'), relicCard('crimson-pact')],
      },
    }
    const { getByTestId, getByText, getAllByTestId } = render(<RelicOfferModal />)
    expect(getByTestId('relic-offer-title').textContent).toBe('Choose a mid relic')
    expect(getAllByTestId(/^relic-offer-card-/)).toHaveLength(2)
    expect(getByText("Berserker's Pendant")).toBeInTheDocument()
    expect(getByText('Crimson Pact')).toBeInTheDocument()
  })
})
