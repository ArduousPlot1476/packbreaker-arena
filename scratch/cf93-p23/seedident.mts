// Mechanical proof that the two seeds produce IDENTICAL 20x20 matrices per class.
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
// Repo root derived from THIS script's location (scratch/<dir>/<file>.mts), so
// the probe runs from any checkout, not just the authoring machine (Codex round 1).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (p: string) => import(pathToFileURL(resolve(REPO, p)).href)
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
const matrix = (cls: string, seed: number) => {
  const rows: string[] = []
  for (const p of commons) {
    const cells = commons.map((g) =>
      simulateCombat({ seed, player: mk([p], cls, php([p])), ghost: mk([g], 'marauder', BASE_COMBATANT_HP) }, { items: ITEMS }).outcome)
    rows.push(`${p}|${cells.join(',')}`)
  }
  return rows.join('\n')
}
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
for (const cls of ['tinker', 'marauder']) {
  const a = matrix(cls, 12345)
  const b = matrix(cls, 987654321)
  console.log(`${cls.padEnd(9)} seed12345=${sha(a).slice(0, 16)}  seed987654321=${sha(b).slice(0, 16)}  IDENTICAL=${a === b}`)
}
const t = matrix('tinker', 12345), m = matrix('marauder', 12345)
console.log(`cross-class identical (control, expect false) = ${t === m}`)
