// Builds round-1 LocalSaveV1 saves with an INJECTED bag, and searches seeds for
// the specific round-1 ghost shapes the CF-93 LEG 1 visual probe needs.
//   argv[2] = mode: 'ramp' | 'tied'
//   argv[3] = out path
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const REPO_ROOT = process.argv[4] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (p: string) => import(pathToFileURL(resolve(REPO_ROOT, p)).href)

const mode = process.argv[2] ?? 'ramp'
const outPath = process.argv[3] ?? 'save.json'

const sim = await load('packages/sim/src/index.ts')
const content = await load('packages/content/src/index.ts')
const ghostMod = await load('apps/client/src/combat/ghost.ts')
const { createRun } = sim
const { ITEMS, ClassId, ContractId, RelicId, SimSeed, PlacementId, ItemId } = content
const reg = ITEMS as Record<string, any>
const hasDmg = (id: string) =>
  (reg[id]?.triggers ?? []).some((t: any) => (t.effects ?? []).some((e: any) => e.type === 'damage'))

// --- seed search: round-1 ghost with / without a damage item -----------------
const makeGhost = ghostMod.makeGhostForRound
// makeGhostForRound(baseSeed, round, bagDimensions) — dimensions come from the
// ruleset, so take them from a real run rather than guessing.
const probeCtrl = createRun({
  seed: SimSeed(1),
  classId: ClassId('marauder'),
  contractId: ContractId('neutral'),
  startingRelicId: RelicId('razors-edge'),
})
const BAG_DIMS = probeCtrl.getState().ruleset.bagDimensions
console.log('bagDimensions from ruleset:', JSON.stringify(BAG_DIMS))
let chosenSeed = -1
let ghostDesc = ''
for (let s = 1; s <= 4000; s++) {
  let g
  try { g = makeGhost(s, 1, BAG_DIMS) } catch { continue }
  const ids: string[] = (g?.combatant?.bag?.placements ?? []).map((p: any) => String(p.itemId))
  if (ids.length === 0) continue
  const anyDmg = ids.some(hasDmg)
  if (mode === 'tied' && !anyDmg) { chosenSeed = s; ghostDesc = ids.join(','); break }
  // BOTH modes need a ZERO-DAMAGE ghost: with a damage ghost the combat ends on
  // an item KO around tick 300-400 and never reaches the ramp. 'ramp' differs only
  // in the PLAYER bag (knife burst 9 -> ghost 21, neither can finish -> ramp wins it).
  if (mode === 'ramp' && !anyDmg) { chosenSeed = s; ghostDesc = ids.join(','); break }
}
if (chosenSeed < 0) { console.error('no seed found for mode', mode); process.exit(1) }

// --- build the run at round 1, then inject the bag ---------------------------
const ctrl = createRun({
  seed: SimSeed(chosenSeed),
  classId: ClassId('marauder'),
  contractId: ContractId('neutral'),
  startingRelicId: RelicId('razors-edge'),
})
const snap = ctrl.getState()

// mode 'ramp' → one low-damage common (throwing-knife: round-start 8 dmg burst,
//   +1 marauder = 9, which is what Trey's live rounds 1-3 showed).
// mode 'tied' → EMPTY bag: zero damage both sides, HP stays level, the ramp
//   drains equally and the combat is the forced full-HP tie at tick 509.
const placements = mode === 'ramp'
  ? [{ placementId: PlacementId('probe-0'), itemId: ItemId('throwing-knife'), anchor: { col: 0, row: 0 }, rotation: 0 }]
  : []

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
  telemetryAnonId: 'leg1-visual-probe',
  inProgressRun: serialized,
}
writeFileSync(outPath, JSON.stringify(save))
console.log(`mode=${mode} seed=${chosenSeed} ghost=[${ghostDesc}] ghostHasDamage=${mode === 'ramp'}`)
console.log(`  round=${serialized.currentRound} phase=${serialized.phase ?? '(n/a)'} bagItems=${placements.length} -> ${outPath}`)

