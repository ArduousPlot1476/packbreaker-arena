// Adjacency mechanism mark — the shop card's binary "this item cares about
// its neighbours" flag (CF-95b).
//
// SHAPE: a von Neumann neighbourhood — a centre cell plus four ORTHOGONAL
// arms. It is not decorative; it depicts the relation itself, which is
// edge-adjacency (packages/sim adjacency is orthogonal edge-sharing, never
// diagonal). Deliberately NOT one of the five rarity gem shapes
// (◆ common / ■ uncommon / ▲ rare / ★ epic / ✦ legendary, RarityGem.tsx):
// all five are CONVEX, and this is the only mark on the card with four
// concave corner notches, so the silhouettes cannot converge at small size.
// Per the visual-direction.md § 11.1 silhouette rule, the notches are the
// discriminating mass — they are cut deep (3.5 of 12 units) so they survive
// the binding 8px render.
//
// COLOR: the consumer sets it via `color`; this renders `currentColor`, the
// same contract as RarityGem. RarityFrame passes var(--text-primary).
//
// ⚠ CHANNEL SEPARATION — the reason this is achromatic. The card already
// carries TWO rarity signals (the SVG gem, and the text glyph at
// ShopSlot.tsx:105). A third chromatic corner mark would read as a third
// rarity signal. So RARITY OWNS HUE and adjacency owns shape + position +
// absence of hue. That also makes the mark greyscale-safe by construction
// rather than by luck: remove all color and it is still the only concave
// glyph on the card.
//
// 12×12 viewBox matching RarityGem so both corner marks share one geometry
// contract and one sizing rule.

export function AdjacencyMark() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="100%"
      height="100%"
      fill="currentColor"
      aria-label="adjacency"
    >
      {/* Plus / von Neumann neighbourhood. Arm width 5 units, corner notches
          3.5 units square — at the 8px binding size a notch is ~2.3px, which
          is what keeps this from silhouetting as ■ (uncommon). */}
      <path d="M3.5 0.5 H8.5 V3.5 H11.5 V8.5 H8.5 V11.5 H3.5 V8.5 H0.5 V3.5 H3.5 Z" />
    </svg>
  );
}
