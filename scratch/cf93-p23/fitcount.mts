import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
// Repo root derived from THIS script's location (scratch/<dir>/<file>.mts), so
// the probe runs from any checkout, not just the authoring machine (Codex round 1).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (p: string) => import(pathToFileURL(resolve(REPO, p)).href)
const { ITEMS } = await load('packages/content/src/index.ts')
const { describeItem } = await load('apps/client/src/items/describeItem.ts')
const reg = ITEMS as Record<string, any>
const all = Object.keys(reg).map((id) => (describeItem(reg[id]) as string[])[0]!.length)
const com = Object.keys(reg).filter((i) => reg[i].rarity === 'common')
  .map((id) => (describeItem(reg[id]) as string[])[0]!.length)
console.log('budget  all-45   commons-20')
for (const b of [17, 18, 20, 29, 32, 36])
  console.log(String(b).padStart(4) + 'ch   ' + String(all.filter((l) => l <= b).length).padStart(2) + '/45     ' +
    String(com.filter((l) => l <= b).length).padStart(2) + '/20')
