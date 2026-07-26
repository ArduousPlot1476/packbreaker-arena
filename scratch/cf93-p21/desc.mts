import { pathToFileURL } from 'node:url'
const REPO = 'c:/Users/trobbins/OneDrive - Alevio/Documents/packbreaker-arena'
const load = (p: string) => import(pathToFileURL(`${REPO}/${p}`).href)
const { ITEMS } = await load('packages/content/src/index.ts')
const { describeItem } = await load('apps/client/src/items/describeItem.ts')
for (const id of ['buckler','iron-sword','throwing-knife','copper-coin','apple']) {
  console.log(id.padEnd(16), JSON.stringify(describeItem((ITEMS as any)[id])))
}
