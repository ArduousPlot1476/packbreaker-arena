// Relic/reward offer modal (graybox per M1 kill list). Renders the mid or
// boss offer cards when the run controller is in the eligible window.
// Phase 2b shipped mid-only; Phase 2d added the boss-relic branch. CF-67
// (Phase 2) adds a second boss option: the fixed Legendary reward item
// world-forged-heart, rendered as an item card alongside the boss relic.
//
// Card click → grantSelectedRelic(slot, relicId) (relic leg) OR
// grantSelectedItem(itemId) (CF-67 item leg) → sim grant + advancePhase +
// sync_from_sim. The next render sees the taken reward (relics.boss for the
// relic, bossRewardItemId for the item), pendingRelicOffer reads null, and the
// modal unmounts naturally. Selection is exclusive: exactly one card's onClick
// fires per interaction, and the offer closes on the first pick.

import { ITEMS, RELICS, type ItemId, type RelicId } from '@packbreaker/content'
import { ICONS } from '../icons/icons'
import { useRunContext } from './RunContext'

export function RelicOfferModal() {
  const { pendingRelicOffer, grantSelectedRelic, grantSelectedItem } = useRunContext()
  if (pendingRelicOffer === null) return null
  const { slot, cards } = pendingRelicOffer
  // CF-67: the boss offer can now carry a relic + the Legendary item, so it's a
  // "reward" pick, not strictly a relic pick. Mid stays relic-only.
  const title = slot === 'mid' ? 'Choose a mid relic' : 'Choose a boss reward'
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
          {title}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {cards.map((card) =>
            card.kind === 'relic' ? (
              <RelicCard
                key={`relic-${String(card.relicId)}`}
                relicId={card.relicId}
                onClick={() => grantSelectedRelic(slot, card.relicId)}
              />
            ) : (
              <ItemCard
                key={`item-${String(card.itemId)}`}
                itemId={card.itemId}
                onClick={() => grantSelectedItem(card.itemId)}
              />
            ),
          )}
        </div>
      </div>
    </div>
  )
}

const CARD_STYLE = {
  background: 'var(--bg-card, #2a2a2a)',
  color: 'inherit',
  padding: 12,
  border: '1px solid var(--border, #444)',
  borderRadius: 4,
  textAlign: 'left' as const,
  minWidth: 180,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 6,
}

function RelicCard({ relicId, onClick }: { relicId: RelicId; onClick: () => void }) {
  const relic = RELICS[relicId]
  return (
    <button
      type="button"
      data-testid={`relic-offer-card-${String(relicId)}`}
      onClick={onClick}
      style={CARD_STYLE}
    >
      <div style={{ fontWeight: 'bold' }}>{relic.name}</div>
      <div style={{ fontSize: 13, opacity: 0.85 }}>{relic.description}</div>
    </button>
  )
}

// CF-67: boss reward item card (world-forged-heart iconned, batch 5). Same
// button contract + test-id pattern as RelicCard so "N cards render" / exclusive-
// selection assertions target both kinds uniformly.
function ItemCard({ itemId, onClick }: { itemId: ItemId; onClick: () => void }) {
  const item = ITEMS[itemId]
  const Icon = ICONS[itemId] ?? ICONS['copper-coin']
  return (
    <button
      type="button"
      data-testid={`relic-offer-card-${String(itemId)}`}
      onClick={onClick}
      style={CARD_STYLE}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden
          style={{ width: 24, height: 24, display: 'inline-flex', flex: '0 0 auto' }}
        >
          <Icon />
        </span>
        <div style={{ fontWeight: 'bold' }}>{item?.name ?? String(itemId)}</div>
      </div>
      <div style={{ fontSize: 13, opacity: 0.85 }}>Legendary reward</div>
    </button>
  )
}
