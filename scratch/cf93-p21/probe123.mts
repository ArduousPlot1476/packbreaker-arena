// HANDOFF 2026-07-25-21 — probes 1/2/3. READ-ONLY: loads production modules by
// absolute file URL, writes nothing. scratch/ is gitignored (.gitignore:15).

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
const { simulateCombat } = combat
const { generateShop } = simShop
const { createRng } = simRng
const { applyPct } = simMath
const { SHOP_OFFER_ITEMS } = clientContent

type AnyItem = {
  rarity: string
  classAffinity: string | null
  triggers?: { effects?: { type: string }[] }[]
  passiveStats?: Record<string, number>
}
const reg = ITEMS as Record<string, AnyItem>
const commons = Object.keys(reg).filter((id) => reg[id]!.rarity === 'common').sort()
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary']
const gateIdx = RARITY_ORDER.indexOf(RARITY_GATE_BY_ROUND[0])
const hasDamage = (it: AnyItem) =>
  (it.triggers ?? []).some((t) => (t.effects ?? []).some((e) => e.type === 'damage'))

const DIMS = { cols: 5, rows: 5 }
const mk = (ids: string[], classId: string, startingHp: number) => ({
  bag: {
    dimensions: DIMS,
    placements: ids.map((itemId, i) => ({
      placementId: `p${i}`, itemId, anchor: { col: 0, row: i * 2 }, rotation: 0,
    })),
  },
  relics: { starter: null, mid: null, boss: null },
  classId,
  startingHp,
})
const playerHp = (ids: string[]) =>
  ids.reduce((h, id) => h + (reg[id]!.passiveStats?.maxHpBonus ?? 0), BASE_COMBATANT_HP)
// ghost.ts derivation: BASE + floor((round-1)/2)*2, does NOT sum maxHpBonus
const GHOST_HP_R1 = BASE_COMBATANT_HP + Math.max(0, Math.floor((1 - 1) / 2)) * 2
const INERT = 'copper-coin' // triggers:[], goldPerRound only — cannot move HP

const fight = (pIds: string[], gId: string, cls: string, seed: number) =>
  simulateCombat(
    { seed, player: mk(pIds, cls, playerHp(pIds)), ghost: mk([gId], 'marauder', GHOST_HP_R1) },
    { items: ITEMS },
  )

console.log('##### PROBE 1 — per-class 20x20 matrices #####')
console.log(`ghost round-1: classId='marauder' (ghost.ts parity, odd round), startingHp=${GHOST_HP_R1}, 1 item uniform over ${commons.length} commons`)

const resolverSets: Record<string, string[]> = {}
for (const seed of [12345, 987654321]) {
  for (const cls of ['tinker', 'marauder']) {
    console.log(`\n===== seed=${seed}  PLAYER CLASS = ${cls.toUpperCase()} =====`)
    console.log('player item'.padEnd(16), 'dmg'.padEnd(4), 'pHP'.padEnd(4), 'WIN'.padEnd(4), 'DRAW'.padEnd(5), 'LOSS'.padEnd(5), 'win%')
    const winners: string[] = []
    for (const pid of commons) {
      let w = 0, d = 0, l = 0
      for (const gid of commons) {
        const o = fight([pid], gid, cls, seed).outcome
        if (o === 'player_win') w++; else if (o === 'draw') d++; else l++
      }
      if (w > 0) winners.push(pid)
      console.log(pid.padEnd(16), (hasDamage(reg[pid]!) ? 'YES' : '-').padEnd(4),
        String(playerHp([pid])).padEnd(4), String(w).padEnd(4), String(d).padEnd(5), String(l).padEnd(5),
        `${((w / commons.length) * 100).toFixed(0)}%`)
    }
    console.log(`  WIN-BASED resolver set (${winners.length}): ${winners.join(', ')}`)
    if (seed === 12345) resolverSets[cls] = winners
  }
}

console.log('\n##### PROBE 1b — Item 4 reconciliation: solo vs INERT ghost, ko tick + endReason #####')
console.log('Item 4 claims: iron-sword 400->300, iron-dagger 450->300, wooden-club 360->300, hand-axe 400->320')
console.log('item'.padEnd(16), 'tinker(tick/endReason/out)'.padEnd(34), 'marauder(tick/endReason/out)')
for (const id of ['iron-sword', 'iron-dagger', 'wooden-club', 'hand-axe', 'iron-mace', 'throwing-knife', 'buckler']) {
  const t = fight([id], INERT, 'tinker', 12345)
  const m = fight([id], INERT, 'marauder', 12345)
  console.log(id.padEnd(16),
    `${t.endedAtTick}/${t.endReason}/${t.outcome}`.padEnd(34),
    `${m.endedAtTick}/${m.endReason}/${m.outcome}`)
}

console.log('\n--- iron-mace damage accounting vs INERT ghost (Item 4 claims 22 -> 33 "over the cap"=30) ---')
for (const cls of ['tinker', 'marauder']) {
  const r = fight(['iron-mace'], INERT, cls, 12345)
  const dmg = r.events.filter((e: any) => e.type === 'damage' && e.target === 'ghost')
  const pre500 = dmg.filter((e: any) => e.tick < 500)
  const sum = (a: any[]) => a.reduce((s, e) => s + e.amount, 0)
  console.log(`${cls.padEnd(9)} procs<500=${pre500.length} dmg<500=${sum(pre500)}  | allProcs=${dmg.length} dmgTotal=${sum(dmg)}  | perHit=${dmg[0]?.amount}  | ticks=${dmg.slice(0, 3).map((e: any) => e.tick).join(',')}...${dmg.slice(-1).map((e: any) => e.tick)}`)
}

console.log('\n##### PROBE 2 — throwing-knife: is PARTIAL damage worse than NONE? #####')
console.log('Controls per ghost item: throwing-knife (partial burst) vs copper-coin (zero dmg) vs EMPTY bag.')
const rank = (o: string) => (o === 'player_win' ? 2 : o === 'draw' ? 1 : 0)
for (const cls of ['tinker', 'marauder']) {
  console.log(`\n--- player class ${cls} ---`)
  console.log('ghost item'.padEnd(16), 'knife'.padEnd(11), 'coin(0dmg)'.padEnd(11), 'EMPTY'.padEnd(11), 'INVERSION?')
  const inversions: string[] = []
  for (const gid of commons) {
    const k = fight(['throwing-knife'], gid, cls, 12345)
    const c = fight([INERT], gid, cls, 12345)
    const e = fight([], gid, cls, 12345)
    const worse = rank(k.outcome) < Math.max(rank(c.outcome), rank(e.outcome))
    if (worse) inversions.push(gid)
    console.log(gid.padEnd(16), k.outcome.padEnd(11), c.outcome.padEnd(11), e.outcome.padEnd(11),
      worse ? '<<< YES — partial WORSE than none' : '')
  }
  console.log(`  INVERSIONS (${inversions.length}): ${inversions.join(', ') || '(none)'}`)
}

console.log('\n--- mechanism trace: throwing-knife vs apple (on_round_start heal 5), marauder ---')
{
  const r = fight(['throwing-knife'], 'apple', 'marauder', 12345)
  console.log(`outcome=${r.outcome} endReason=${r.endReason} tick=${r.endedAtTick} finalHp=${r.finalHp.player}/${r.finalHp.ghost}`)
  for (const e of r.events.filter((e: any) => e.tick <= 1)) console.log('   ', JSON.stringify(e))
}

console.log('\n##### PROBE 3 — P(zero resolver) per class, analytic + Monte Carlo #####')
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
const SHOP_SIZE = 5
// Item 5's SOLO-RESOLVER sets (pre-ramp ko vs inert ghost), derived in probe 1b
const soloSets: Record<string, string[]> = { tinker: [], marauder: [] }
for (const cls of ['tinker', 'marauder'])
  for (const id of commons)
    if (fight([id], INERT, cls, 12345).endReason === 'ko') soloSets[cls]!.push(id)

for (const [label, sets, ref] of [
  ['WIN-BASED (probe 1 — any win incl. ramp-decided)', resolverSets, null],
  ['SOLO-RESOLVER (pre-ramp `ko` — Item 5 basis)', soloSets, { tinker: 33.8, marauder: 23.2 }],
] as [string, Record<string, string[]>, Record<string, number> | null][]) {
  console.log(`\n=== ${label} ===`)
  for (const cls of ['tinker', 'marauder']) {
    const set = new Set(sets[cls]!)
    const pool = poolFor(cls)
    const total = pool.reduce((a, e) => a + e.weight, 0)
    const resW = pool.filter((e) => set.has(e.id)).reduce((a, e) => a + e.weight, 0)
    const analytic = Math.pow((total - resW) / total, SHOP_SIZE)
    const N = 200_000
    let zero = 0
    for (let s = 1; s <= N; s++) {
      const shop = generateShop(1, cls, SHOP_SIZE, createRng(s), SHOP_OFFER_ITEMS)
      if (!shop.slots.some((id: string) => set.has(id))) zero++
    }
    console.log(
      `[${cls}] set(${set.size})=${[...set].join(',')}\n` +
      `   poolPts=${total} resolverPts=${resW} nonResolverPts=${total - resW}\n` +
      `   ANALYTIC P(zero resolver in ${SHOP_SIZE} slots) = ${(analytic * 100).toFixed(3)}%\n` +
      `   MONTE CARLO n=${N} = ${zero} = ${((zero / N) * 100).toFixed(3)}%  (delta ${(((zero / N) - analytic) * 100).toFixed(3)} pt)` +
      (ref ? `\n   Item 5 floor = ${ref[cls]}%  -> ${Math.abs(analytic * 100 - ref[cls]!) < 0.1 ? 'REPRODUCES' : 'DOES NOT REPRODUCE'}` : ''),
    )
  }
}
