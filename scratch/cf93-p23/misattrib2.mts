// CF-93 LEG 1 / B4 — does the misattribution class appear at LATER-round
// populations? Round 1 (1 item, commons, 30 HP) returned 0/523. This widens to
// multi-item bags, uncommon+rare gates, and higher HP. READ-ONLY.
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
// Repo root derived from THIS script's location (scratch/<dir>/<file>.mts), so
// the probe runs from any checkout, not just the authoring machine (Codex round 1).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (p: string) => import(pathToFileURL(resolve(REPO, p)).href)
const { ITEMS, BASE_COMBATANT_HP } = await load('packages/content/src/index.ts')
const { simulateCombat, RAMP_START_TICK } = await load('packages/sim/src/combat.ts')
const reg = ITEMS as Record<string, any>
const pool = Object.keys(reg)
  .filter((i) => ['common', 'uncommon', 'rare'].includes(reg[i].rarity))
  .sort()
const DIMS = { cols: 6, rows: 6 }
const mk = (ids: string[], classId: string, hp: number) => ({
  bag: { dimensions: DIMS, placements: ids.map((itemId, i) => ({ placementId: `p${i}`, itemId, anchor: { col: 0, row: i }, rotation: 0 })) },
  relics: { starter: null, mid: null, boss: null }, classId, startingHp: hp,
})
const losers = (o: string) => (o === 'player_win' ? ['ghost'] : o === 'ghost_win' ? ['player'] : ['player', 'ghost'])
const HP_CUTTING = new Set(['damage', 'status_tick', 'ramp_tick'])

console.log(`RAMP_START_TICK=${RAMP_START_TICK}  BASE_HP=${BASE_COMBATANT_HP}  pool=${pool.length} items`)
let total = 0, rampDerived = 0, misattrib = 0
const examples: string[] = []
// Deterministic sweep: rotate bags through the pool at several sizes and HPs.
for (const size of [2, 3, 4]) {
  for (const hp of [40, 55, 67]) {
    for (let a = 0; a < pool.length; a++) {
      for (const b of [a + 3, a + 7, a + 11]) {
        const pIds = Array.from({ length: size }, (_, k) => pool[(a + k * 5) % pool.length]!)
        const gIds = Array.from({ length: size }, (_, k) => pool[(b + k * 5) % pool.length]!)
        for (const cls of ['tinker', 'marauder']) {
          const r = simulateCombat(
            { seed: 12345, player: mk(pIds, cls, hp), ghost: mk(gIds, 'marauder', hp) },
            { items: ITEMS },
          )
          total++
          const L = losers(r.outcome)
          if (!r.events.some((e: any) => e.type === 'ramp_tick' && L.includes(e.target))) continue
          rampDerived++
          for (const side of L) {
            const cuts = r.events.filter((e: any) => HP_CUTTING.has(e.type) && e.target === side)
            const last = cuts[cuts.length - 1]
            if (last && last.type !== 'ramp_tick') {
              misattrib++
              if (examples.length < 5)
                examples.push(`${cls} hp=${hp} size=${size} | P[${pIds.join(',')}] vs G[${gIds.join(',')}] → ${r.outcome} t${r.endedAtTick} endReason=${r.endReason} · loser=${side} lastBlow=${last.type}@t${last.tick}`)
              break
            }
          }
        }
      }
    }
  }
}
console.log(`combats enumerated (occurrences)          : ${total}`)
console.log(`derived cause == 'ramp'                   : ${rampDerived}`)
console.log(`  of those, loser's LAST BLOW was an ITEM : ${misattrib}`)
console.log(`MISATTRIBUTION CLASS REACHABLE            : ${misattrib > 0 ? 'YES' : 'NO'}`)
if (rampDerived > 0) console.log(`rate within ramp-derived                  : ${((misattrib / rampDerived) * 100).toFixed(2)}%`)
for (const e of examples) console.log('   e.g.', e)
