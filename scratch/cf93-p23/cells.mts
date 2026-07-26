// Nails two matrix cells the entry cites: (1) buckler's 6 losses are exactly the
// 6 damage-bearing ghosts; (2) the 15-draw vs 14-draw split among the 13 zeros.
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
// Repo root derived from THIS script's location (scratch/<dir>/<file>.mts), so
// the probe runs from any checkout, not just the authoring machine (Codex round 1).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (p: string) => import(pathToFileURL(resolve(REPO, p)).href)
const { ITEMS, BASE_COMBATANT_HP } = await load('packages/content/src/index.ts')
const { simulateCombat } = await load('packages/sim/src/combat.ts')
const reg = ITEMS as Record<string, any>
const commons = Object.keys(reg).filter((i) => reg[i].rarity === 'common').sort()
const hasDmg = (id: string) =>
  (reg[id].triggers ?? []).some((t: any) => (t.effects ?? []).some((e: any) => e.type === 'damage'))
const DIMS = { cols: 5, rows: 5 }
const mk = (ids: string[], classId: string, hp: number) => ({
  bag: { dimensions: DIMS, placements: ids.map((itemId, i) => ({ placementId: `p${i}`, itemId, anchor: { col: 0, row: i * 2 }, rotation: 0 })) },
  relics: { starter: null, mid: null, boss: null }, classId, startingHp: hp,
})
const php = (ids: string[]) => ids.reduce((h, id) => h + (reg[id].passiveStats?.maxHpBonus ?? 0), BASE_COMBATANT_HP)
const fight = (p: string, g: string, cls: string) =>
  simulateCombat({ seed: 12345, player: mk([p], cls, php([p])), ghost: mk([g], 'marauder', BASE_COMBATANT_HP) }, { items: ITEMS })

console.log('damage-bearing commons (n=' + commons.filter(hasDmg).length + '):', commons.filter(hasDmg).join(', '))
const bl = commons.filter((g) => fight('buckler', g, 'tinker').outcome !== 'player_win')
console.log('buckler NON-wins (n=' + bl.length + '):', bl.join(', '))
console.log('buckler non-wins === damage set:', JSON.stringify(bl) === JSON.stringify(commons.filter(hasDmg)))
console.log('buckler solo vs inert:', (() => { const r = fight('buckler', 'copper-coin', 'tinker'); return `${r.endedAtTick}/${r.endReason}/${r.outcome} finalHp ${r.finalHp.player}/${r.finalHp.ghost}` })())

console.log('\n-- the 13 zero-win items: which ghost separates 15-draw from 14-draw? --')
for (const p of ['apple', 'copper-coin']) {
  const row = commons.map((g) => `${g}=${fight(p, g, 'tinker').outcome.replace('player_win', 'W').replace('ghost_win', 'L').replace('draw', 'D')}`)
  console.log(p.padEnd(12), row.filter((c) => c.endsWith('D') || c.endsWith('L')).join(' '))
}
