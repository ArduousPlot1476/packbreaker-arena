import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
// Repo root derived from THIS script's location (scratch/<dir>/<file>.mts), so
// the probe runs from any checkout, not just the authoring machine (Codex round 1).
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (p: string) => import(pathToFileURL(resolve(REPO, p)).href)
const { ITEMS } = await load('packages/content/src/index.ts')
const { describeItem } = await load('apps/client/src/items/describeItem.ts')
for (const id of ['buckler','iron-sword','throwing-knife','copper-coin','apple']) {
  console.log(id.padEnd(16), JSON.stringify(describeItem((ITEMS as any)[id])))
}
