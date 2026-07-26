// READ-ONLY census for the CF-93 legibility/matrix entry. Writes nothing.
import { pathToFileURL } from 'node:url'
const REPO = 'c:/Users/trobbins/OneDrive - Alevio/Documents/packbreaker-arena'
const load = (p: string) => import(pathToFileURL(`${REPO}/${p}`).href)
const { ITEMS } = await load('packages/content/src/index.ts')
const reg = ITEMS as Record<string, any>
const k = Object.keys(reg)
console.log('ITEMS total =', k.length)
const c = k.filter((i) => reg[i].rarity === 'common').sort()
console.log('commons =', c.length)
console.log('commons with classAffinity != null =',
  c.filter((i) => reg[i].classAffinity !== null).map((i) => `${i}:${reg[i].classAffinity}`).join(', ') || '(none)')
console.log('commons with maxHpBonus > 0 =',
  c.filter((i) => (reg[i].passiveStats?.maxHpBonus ?? 0) > 0).map((i) => `${i}:+${reg[i].passiveStats.maxHpBonus}`).join(', ') || '(none)')
console.log('ANY-rarity items with classAffinity != null =',
  k.filter((i) => reg[i].classAffinity !== null).sort().map((i) => `${i}(${reg[i].rarity}):${reg[i].classAffinity}`).join(', ') || '(none)')
const clientContent = await load('apps/client/src/run/content.ts')
console.log('client ITEMS (adaptItem) count =', Object.keys(clientContent.ITEMS).length)
console.log('client SHOP_OFFER_ITEMS count =', Object.keys(clientContent.SHOP_OFFER_ITEMS).length)
console.log('adaptItem blurb non-empty count =',
  Object.values(clientContent.ITEMS as Record<string, any>).filter((v) => v.blurb !== '').length)
