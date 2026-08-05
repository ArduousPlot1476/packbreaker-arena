// Relic/reward offer modal. Renders the mid or boss offer cards when the run
// controller is in the eligible window. Phase 2b shipped mid-only; Phase 2d
// added the boss-relic branch. CF-67 (Phase 2) adds a second boss option: the
// fixed Legendary reward item world-forged-heart, rendered as an item card
// alongside the boss relic.
//
// Card click → grantSelectedRelic(slot, relicId) (relic leg) OR
// grantSelectedItem(itemId) (CF-67 item leg) → sim grant + advancePhase +
// sync_from_sim. The next render sees the taken reward (relics.boss for the
// relic, bossRewardItemId for the item), pendingRelicOffer reads null, and the
// modal unmounts naturally. Selection is exclusive: exactly one card's onClick
// fires per interaction, and the offer closes on the first pick.
//
// Visual system (2026-08-04): this used to render outside the locked palette —
// `var(--bg-card, #2a2a2a)`, `var(--border, #444)`, `var(--text-primary, #fff)`.
// Two of those three custom properties DO NOT EXIST, so every one fell through
// to its neutral-grey fallback and the modal painted charcoal while the rest of
// the game is navy. It now uses real tokens: surface-elev for the modal per
// visual-direction.md § 3 ("Modals, focused/hovered UI"), surface for the cards,
// and the bg-deep scrim + 2px blur that CombatOverlay already establishes.
//
// The item card carries its rarity (frame color + gem) because the Legendary
// reward reading as Legendary is the entire point of the moment. Relics have no
// rarity in the schema (content-schemas.ts § 6), so relic cards are neutral by
// construction rather than by omission.

import { ITEMS, RELICS, type ItemId, type RelicId } from '@packbreaker/content'
import { RarityGem, cssVar, rgba, type RarityKey } from '@packbreaker/ui-kit'
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
        background: rgba('bgDeep', 0.78),
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        style={{
          background: cssVar('surfaceElev'),
          color: cssVar('textPrimary'),
          padding: 24,
          borderRadius: 10,
          border: `1px solid ${cssVar('borderDefault')}`,
          boxShadow: `0 20px 60px ${rgba('bgDeep', 0.6)}`,
          maxWidth: 480,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Slot label above the title: the player is filling a specific rail
            slot, and the left rail shows it as EMPTY until they do. */}
        <div
          className="label-cap"
          style={{ fontSize: 11, color: cssVar('textSecondary') }}
        >
          {slot === 'mid' ? 'Mid relic' : 'Boss reward'}
        </div>
        <div
          data-testid="relic-offer-title"
          className="heading-tight"
          style={{ fontSize: 22, fontWeight: 700 }}
        >
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

/** Shared card shell. `accent` tints the left edge — the only place rarity is
 *  allowed to speak on this surface, so a neutral relic card and a Legendary
 *  item card are distinguishable without either shouting. */
function cardStyle(accent: string) {
  return {
    background: cssVar('surface'),
    color: 'inherit',
    padding: 12,
    border: `1px solid ${cssVar('borderDefault')}`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: 6,
    textAlign: 'left' as const,
    minWidth: 180,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    font: 'inherit',
  }
}

function RelicCard({ relicId, onClick }: { relicId: RelicId; onClick: () => void }) {
  const relic = RELICS[relicId]
  return (
    <button
      type="button"
      data-testid={`relic-offer-card-${String(relicId)}`}
      onClick={onClick}
      className="hover-lift focus-ring ease-snap"
      style={cardStyle(cssVar('accent'))}
    >
      <div style={{ fontWeight: 600, fontSize: 15 }}>{relic.name}</div>
      <div style={{ fontSize: 13, color: cssVar('textSecondary') }}>{relic.description}</div>
    </button>
  )
}

// CF-67: boss reward item card (world-forged-heart iconned, batch 5). Same
// button contract + test-id pattern as RelicCard so "N cards render" / exclusive-
// selection assertions target both kinds uniformly.
function ItemCard({ itemId, onClick }: { itemId: ItemId; onClick: () => void }) {
  const item = ITEMS[itemId]
  const Icon = ICONS[itemId] ?? ICONS['copper-coin']
  const rarity = (item?.rarity ?? 'legendary') as RarityKey
  return (
    <button
      type="button"
      data-testid={`relic-offer-card-${String(itemId)}`}
      onClick={onClick}
      className="hover-lift focus-ring ease-snap"
      style={cardStyle(`var(--r-${rarity})`)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden
          style={{ width: 24, height: 24, display: 'inline-flex', flex: '0 0 auto' }}
        >
          <Icon />
        </span>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{item?.name ?? String(itemId)}</div>
      </div>
      {/* Rarity is dual-coded — color AND gem shape — per visual-direction.md
          § 1. Color-blind safety is non-negotiable, so the word and the gem
          both carry it and neither is load-bearing alone. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: cssVar('textSecondary'),
        }}
      >
        {/* RarityGem renders at 100%/100% — the parent owns the box. */}
        <span
          aria-hidden
          style={{
            color: `var(--r-${rarity})`,
            width: 10,
            height: 10,
            display: 'inline-flex',
            flex: '0 0 auto',
          }}
        >
          <RarityGem rarity={rarity} />
        </span>
        <span>Legendary reward</span>
      </div>
    </button>
  )
}
