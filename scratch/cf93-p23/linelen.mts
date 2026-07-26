// READ-ONLY: describeItem line-1 length census across all 45 shipped items.
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
// Repo root derived from THIS script's location (scratch/<dir>/<file>.mts), so
// the probe runs from any checkout, not just the authoring machine (Codex round 1).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (p: string) => import(pathToFileURL(resolve(REPO, p)).href)
const { ITEMS } = await load('packages/content/src/index.ts')
const { describeItem } = await load('apps/client/src/items/describeItem.ts')
const reg = ITEMS as Record<string, any>
const rows = Object.keys(reg).sort().map((id) => {
  const lines = describeItem(reg[id]) as string[]
  return { id, rarity: reg[id].rarity, first: lines[0]!, n: lines.length }
})
const lens = rows.map((r) => r.first.length).sort((a, b) => a - b)
const pct = (p: number) => lens[Math.min(lens.length - 1, Math.floor((lens.length - 1) * p))]
console.log(`items=${rows.length}  line1 chars: min=${lens[0]} median=${pct(0.5)} p75=${pct(0.75)} p90=${pct(0.9)} max=${lens[lens.length - 1]}`)
console.log(`items whose line1 <= 20 chars: ${lens.filter((l) => l <= 20).length}/45`)
console.log(`items whose line1 <= 24 chars: ${lens.filter((l) => l <= 24).length}/45`)
console.log(`items whose line1 <= 28 chars: ${lens.filter((l) => l <= 28).length}/45`)
console.log(`items whose line1 <= 32 chars: ${lens.filter((l) => l <= 32).length}/45`)
console.log('\n--- COMMONS ONLY (the round-1 gate, CF-93 LEG 1 population) ---')
for (const r of rows.filter((r) => r.rarity === 'common'))
  console.log(String(r.first.length).padStart(3), r.id.padEnd(16), JSON.stringify(r.first))
console.log('\n--- 5 LONGEST line1 across all rarities ---')
for (const r of [...rows].sort((a, b) => b.first.length - a.first.length).slice(0, 5))
  console.log(String(r.first.length).padStart(3), r.id.padEnd(24), JSON.stringify(r.first))
console.log('\nlongest ITEM NAME (existing card line, fontSize 11):',
  Math.max(...Object.values(reg).map((v: any) => v.name.length)),
  JSON.stringify(Object.values(reg).map((v: any) => v.name).sort((a: string, b: string) => b.length - a.length)[0]))
