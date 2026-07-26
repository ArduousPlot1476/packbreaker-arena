// Builds a round-1 LocalSaveV1 save whose bag exercises ALL THREE rungs of the
// recipe ladder at once, so one screenshot can evidence the whole ladder:
//
//   READY — iron-sword (1×2 V at col 0) + iron-dagger (1×1 at col 1, row 0).
//           The dagger is edge-adjacent to the sword's top cell, so
//           r-steel-sword ("Forge Steel") satisfies multiset AND connectivity.
//   HELD  — healing-herb ×2 placed far apart (3,0) and (5,3). The multiset for
//           r-healing-salve ("Salve Brewing") is satisfied; connectivity is NOT.
//           This is the rung desktop was previously blind to.
//   KNOWN — the remaining 10 recipes, inputs not owned.
//
// Deliberately NO seed search: the ladder is a bag-state surface and does not
// depend on the ghost, so the seed is pinned for reproducibility.
//
// Mode 'held' drops the READY cluster and keeps ONLY the separated herb pair.
// That is the state the definition of done singles out: a player holding two
// Simple-recipe commons must see HELD and an instruction naming adjacency
// BEFORE ever placing them together — and it is also the only state in which
// the bag footer's remedy line (which the READY branch outranks) is visible.
//
//   node --import tsx mkSave.mts <outPath> [repoRoot] [mode]
import { writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'

const REPO_ROOT = process.argv[3] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (p: string) => import(pathToFileURL(resolve(REPO_ROOT, p)).href)
const outPath = process.argv[2] ?? 'save.json'

const sim = await load('packages/sim/src/index.ts')
const content = await load('packages/content/src/index.ts')
const { createRun } = sim
const { ClassId, ContractId, RelicId, SimSeed, PlacementId, ItemId } = content

const ctrl = createRun({
  seed: SimSeed(1),
  classId: ClassId('marauder'),
  contractId: ContractId('neutral'),
  startingRelicId: RelicId('razors-edge'),
})
const snap = ctrl.getState()

const mode = process.argv[4] ?? 'all'

const readyCluster = [
  // READY cluster — sword occupies (col 0, rows 0-1); dagger at (col 1, row 0)
  // shares an edge with the sword's top cell.
  { placementId: PlacementId('probe-sword'), itemId: ItemId('iron-sword'), anchor: { col: 0, row: 0 }, rotation: 0 },
  { placementId: PlacementId('probe-dagger'), itemId: ItemId('iron-dagger'), anchor: { col: 1, row: 0 }, rotation: 0 },
]
const heldPair = [
  // HELD pair — same multiset, deliberately non-contiguous (opposite corners).
  { placementId: PlacementId('probe-herb-a'), itemId: ItemId('healing-herb'), anchor: { col: 3, row: 0 }, rotation: 0 },
  { placementId: PlacementId('probe-herb-b'), itemId: ItemId('healing-herb'), anchor: { col: 5, row: 3 }, rotation: 0 },
]
const placements = mode === 'held' ? heldPair : [...readyCluster, ...heldPair]

const serialized = {
  ...snap,
  bag: { ...snap.bag, placements },
  rngState: ctrl.getRngState(),
  bornFromRecipe: ctrl.getRecipeBornPlacementIds(),
}
const save = {
  schemaVersion: 1,
  trophies: 0,
  dailyStreak: 0,
  lastDailyAttempted: null,
  tutorialCompleted: true,
  telemetryAnonId: 'recipe-ladder-visual-probe',
  inProgressRun: serialized,
}
writeFileSync(outPath, JSON.stringify(save))
console.log(`mode=${mode} bag=${placements.length} items -> ${outPath}`)
console.log(
  mode === 'held'
    ? '  expect: 0 READY, 1 HELD (Salve Brewing), 11 KNOWN; footer shows the remedy line'
    : '  expect: 1 READY (Forge Steel), 1 HELD (Salve Brewing), 10 KNOWN',
)
