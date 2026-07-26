// Addendum: (a) Item 5's Marauder floor under a KILLS-BY-OWN-DAMAGE definition
// (iron-mace included) vs the endReason==='ko' label definition; (b) the
// throwing-knife heal-back mechanism trace. READ-ONLY.

import { pathToFileURL } from 'node:url'
const REPO = 'c:/Users/trobbins/OneDrive - Alevio/Documents/packbreaker-arena'
const load = (p: string) => import(pathToFileURL(`${REPO}/${p}`).href)

const content = await load('packages/content/src/index.ts')
const combat = await load('packages/sim/src/combat.ts')
const simShop = await load('packages/sim/src/run/shop.ts')
const simRng = await load('packages/sim/src/rng.ts')
const simMath = await load('packages/sim/src/math.ts')
const clientContent = await load('apps/client/src/run/content.ts')
const { ITEMS, BASE_COMBATANT_HP, RARITY_GATE_BY_ROUND, RARITY_POOL_WEIGHT } = content
const { simulateCombat, RAMP_START_TICK } = combat
const { generateShop } = simShop
const { createRng } = simRng
const { applyPct } = simMath
const { SHOP_OFFER_ITEMS } = clientContent

type AnyItem = { rarity: string; classAffinity: string | null; passiveStats?: Record<string, number> }
const reg = ITEMS as Record<string, AnyItem>
const commons = Object.keys(reg).filter((id) => reg[id]!.rarity === 'common').sort()
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary']
const gateIdx = RARITY_ORDER.indexOf(RARITY_GATE_BY_ROUND[0])
const DIMS = { cols: 5, rows: 5 }
const mk = (ids: string[], classId: string, hp: number) => ({
  bag: { dimensions: DIMS, placements: ids.map((itemId, i) => ({ placementId: `p${i}`, itemId, anchor: { col: 0, row: i * 2 }, rotation: 0 })) },
  relics: { starter: null, mid: null, boss: null }, classId, startingHp: hp,
})
const php = (ids: string[]) => ids.reduce((h, id) => h + (reg[id]!.passiveStats?.maxHpBonus ?? 0), BASE_COMBATANT_HP)
const fight = (p: string[], g: string, cls: string, seed = 12345) =>
  simulateCombat({ seed, player: mk(p, cls, php(p)), ghost: mk([g], 'marauder', BASE_COMBATANT_HP) }, { items: ITEMS })

console.log(`RAMP_START_TICK=${RAMP_START_TICK}`)
console.log('\n### (a) Two operationalizations of "solo-resolver" vs an INERT ghost ###')
const byLabel: Record<string, string[]> = { tinker: [], marauder: [] }
const byKill: Record<string, string[]> = { tinker: [], marauder: [] }
for (const cls of ['tinker', 'marauder']) {
  for (const id of commons) {
    const r = fight([id], 'copper-coin', cls)
    if (r.endReason === 'ko') byLabel[cls]!.push(id)
    // "kills by own damage": ghost reached 0 and the ramp never ran on it
    const ramped = r.events.some((e: any) => e.type === 'ramp_tick' && e.target === 'ghost')
    if (r.outcome === 'player_win' && !ramped) byKill[cls]!.push(id)
  }
  console.log(`[${cls}] endReason==='ko'        (${byLabel[cls]!.length}): ${byLabel[cls]!.join(', ')}`)
  console.log(`[${cls}] killed w/o ANY ghost ramp_tick (${byKill[cls]!.length}): ${byKill[cls]!.join(', ')}`)
}

function poolFor(classId: string) {
  const r = SHOP_OFFER_ITEMS as Record<string, AnyItem>
  const out: { id: string; weight: number }[] = []
  for (const id of Object.keys(r).sort()) {
    const it = r[id]!
    if (RARITY_ORDER.indexOf(it.rarity) > gateIdx) continue
    let w = RARITY_POOL_WEIGHT[it.rarity as keyof typeof RARITY_POOL_WEIGHT]
    if (it.classAffinity === classId) w = applyPct(w, 50)
    else if (it.classAffinity !== null) w = applyPct(w, -25)
    if (w > 0) out.push({ id, weight: w })
  }
  return out
}
console.log('\n### (a2) P(zero solo-resolver) under the KILLS-BY-OWN-DAMAGE set vs Item 5 ###')
const ITEM5: Record<string, number> = { tinker: 33.8, marauder: 23.2 }
for (const cls of ['tinker', 'marauder']) {
  const set = new Set(byKill[cls]!)
  const pool = poolFor(cls)
  const total = pool.reduce((a, e) => a + e.weight, 0)
  const resW = pool.filter((e) => set.has(e.id)).reduce((a, e) => a + e.weight, 0)
  const analytic = Math.pow((total - resW) / total, 5)
  const N = 200_000
  let zero = 0
  for (let s = 1; s <= N; s++) {
    const shop = generateShop(1, cls, 5, createRng(s), SHOP_OFFER_ITEMS)
    if (!shop.slots.some((id: string) => set.has(id))) zero++
  }
  console.log(`[${cls}] set(${set.size})=${[...set].join(',')}\n   poolPts=${total} resolverPts=${resW}` +
    `\n   ANALYTIC = ${(analytic * 100).toFixed(3)}%   MONTE CARLO n=${N} = ${((zero / N) * 100).toFixed(3)}%` +
    `\n   Item 5 = ${ITEM5[cls]}% -> ${Math.abs(analytic * 100 - ITEM5[cls]!) < 0.1 ? 'REPRODUCES' : 'DOES NOT REPRODUCE'}`)
}

console.log('\n### (b) throwing-knife vs the five HEALING ghosts — is the burst healed back? ###')
for (const g of ['apple', 'bandage', 'healing-herb', 'iron-cap', 'leather-vest', 'copper-coin']) {
  const r = fight(['throwing-knife'], g, 'marauder')
  const heals = r.events.filter((e: any) => e.type === 'heal' && e.target === 'ghost')
  const lastPre = [...r.events].filter((e: any) => e.tick < 500 && (e.type === 'heal' || e.type === 'damage') && e.target === 'ghost').pop()
  console.log(`ghost=${g.padEnd(13)} outcome=${String(r.outcome).padEnd(11)} tick=${String(r.endedAtTick).padEnd(4)}` +
    ` ghostHeals=${String(heals.length).padEnd(3)} healedTotal=${heals.reduce((s: number, e: any) => s + e.amount, 0)}` +
    ` ghostHpJustBeforeRamp=${(lastPre as any)?.newHp ?? (lastPre as any)?.remainingHp ?? 'n/a'}`)
}
