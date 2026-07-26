// CF-93 LEG 1 / B4 — bound the presence-vs-last-blow misattribution class.
// Is "the ramp runs, then an ITEM lands the killing blow" reachable in shipped
// play? Enumerates the full round-1 common matrix per class and counts combats
// where the DERIVED cause says 'ramp' but the loser's final HP-reducing event
// was a damage/status_tick. READ-ONLY.
import { pathToFileURL } from 'node:url'
const REPO = 'c:/Users/trobbins/OneDrive - Alevio/Documents/packbreaker-arena'
const load = (p: string) => import(pathToFileURL(`${REPO}/${p}`).href)
const { ITEMS, BASE_COMBATANT_HP } = await load('packages/content/src/index.ts')
const { simulateCombat } = await load('packages/sim/src/combat.ts')
const reg = ITEMS as Record<string, any>
const commons = Object.keys(reg).filter((i) => reg[i].rarity === 'common').sort()
const DIMS = { cols: 5, rows: 5 }
const mk = (ids: string[], classId: string, hp: number) => ({
  bag: { dimensions: DIMS, placements: ids.map((itemId, i) => ({ placementId: `p${i}`, itemId, anchor: { col: 0, row: i * 2 }, rotation: 0 })) },
  relics: { starter: null, mid: null, boss: null }, classId, startingHp: hp,
})
const php = (ids: string[]) => ids.reduce((h, id) => h + (reg[id].passiveStats?.maxHpBonus ?? 0), BASE_COMBATANT_HP)

const losers = (o: string) => (o === 'player_win' ? ['ghost'] : o === 'ghost_win' ? ['player'] : ['player', 'ghost'])
const HP_CUTTING = new Set(['damage', 'status_tick', 'ramp_tick'])

let total = 0, rampDerived = 0, misattrib = 0
const examples: string[] = []
for (const cls of ['tinker', 'marauder']) {
  for (const p of commons) {
    for (const g of commons) {
      const r = simulateCombat(
        { seed: 12345, player: mk([p], cls, php([p])), ghost: mk([g], 'marauder', BASE_COMBATANT_HP) },
        { items: ITEMS },
      )
      total++
      const L = losers(r.outcome)
      const derived = r.events.some((e: any) => e.type === 'ramp_tick' && L.includes(e.target)) ? 'ramp' : 'items'
      if (derived !== 'ramp') continue
      rampDerived++
      // The loser's FINAL hp-reducing event. For a draw, check both losers and
      // flag if ANY of them was finished by an item.
      for (const side of L) {
        const cuts = r.events.filter((e: any) => HP_CUTTING.has(e.type) && e.target === side)
        const last = cuts[cuts.length - 1]
        if (last && last.type !== 'ramp_tick') {
          misattrib++
          if (examples.length < 6)
            examples.push(`${cls} player=${p} vs ghost=${g} → outcome=${r.outcome} tick=${r.endedAtTick} endReason=${r.endReason} · loser=${side} lastBlow=${last.type}@t${last.tick}`)
          break
        }
      }
    }
  }
}
console.log(`round-1 matchups enumerated (occurrences): ${total}  [2 classes x 20 x 20]`)
console.log(`derived cause == 'ramp'                   : ${rampDerived}`)
console.log(`  of those, loser's LAST BLOW was an ITEM : ${misattrib}`)
console.log(`MISATTRIBUTION CLASS REACHABLE AT ROUND 1 : ${misattrib > 0 ? 'YES' : 'NO'}`)
for (const e of examples) console.log('   e.g.', e)
