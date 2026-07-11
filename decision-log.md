# Decision Log

Append-only. Newest at top. Format: `YYYY-MM-DD — [decision]. [Rationale or source.]`

---

## 2026-07-11 — CF 58 CLOSED (trigger_chance_pct echo proc + dedicated chanceRng stream; PR \#34, merge e0a056d)

**CF 58 CLOSED** — trigger_chance_pct, a hard sim no-op since M1.2.3b, is now a real echo proc (summed active buff amount, capped 100, = % chance a trigger's effects resolve twice). Activates Rune Pedestal + Master Alchemist's Kit.

Design (Phase-1-ratified 2026-07-10, §§ A + B): § A effects-only echo in fireTrigger (no cascade / no recordFire double-count / no re-roll; second item_trigger event); § B dedicated per-combat chanceRng, CHANCE_RNG_OFFSET = 32749 (combat.ts:153), draw-only-when-needed so it never touches the main cursor.

Ratified offset correction: draft's 13 × 65521 = 851,773 collided with the shop-round-13 / ghost-round-6 lattice; corrected to prime 32749 (below both 65521/65519 strides, disjoint by construction — mirrors relicOffer.ts:8-11).

Citation corrections (folded, no separate Catch): combatSeed at packages/sim/src/run/state.ts:1039 (not state.ts:1022-1030); items under packages/content/src/items.ts.

Ratified corpus deviation — surgical terminal-only re-baseline, not full regeneration: CF 58 changes the replay terminal of exactly 8 fixtures (003/004/014/015/021/039-greedy, 207/208-relic-collector). Full generate-fixtures was ratified against (it re-bakes all 224 and drifts ~41 files vs the frozen corpus independent of CF 58 — see CF 64). Each of the 8 had its action stream replayed through the CF 58 sim and only its terminal line rewritten (header + actions byte-identical; per-file diff = 1 line), extending the README surgical re-baseline precedent. combats/*.json (12) + 6 scenario .json byte-identical.

**Catch 56 (Category B — process-artifact-vs-execution):** PLAN-cf58-trigger-chance.md's Step 4 gate ("if a file outside the 21 diverges → leak → HALT") conflated the harness-divergence check (replay of committed actions → 8 files ⊆ 21) with full-regeneration blast radius (generate-fixtures re-bakes all 224, ~41-file frozen-corpus drift). Surfaced when generate-fixtures produced a 43-file diff including no-item fixtures (e.g. 000-greedy). Resolved by the surgical terminal-only re-baseline (this entry) + CF 64 for the drift.

Rule 18 axes: (1) isolation — 8 divergent, zero outside the item set (harness + discarded spike); (2) corpus scope — git diff = exactly 8 .jsonl (1 line each) + README; (3) determinism — 224/224 byte-stable x2; (4) full gate 25/25; (5) sim unit tests (buff_apply/100%-echo/cap/dedupe/inert); (6) client popovers + flipped tests; (7) Rule 17 — chanceRng not serialized, combat never mid-flight at save.

CF 64 OPENED (NEW): frozen-corpus regeneration-reproducibility drift. generate-fixtures re-bakes ~41 of the 224 .jsonl vs the frozen corpus, independent of CF 58 (pre-CF58 control reproduces it; generator deterministic + Node-version-invariant — Node 18 == Node 22 output). Replay-determinism (the harness) still holds 224/224 — accumulated re-bake drift since the M1.2.5/M1.2.6 freeze, not a determinism break. Backlog / non-blocking; its own future ratified full regeneration.

Codex round(s): round 1 CLEAN — "Codex Review: Didn't find any major issues. You're on a roll." (landed as top-level issue comment id 4946372467's response 4946432072, reviewed commit 58aaa91139 = branch tip, not stale). Zero P1/P2 findings; ceiling never tripped (0/3); no meta-audit run.

**Counter: 56 / 19 / 8 / 31 / 39** (catches / rules / patterns / drifts / open-CFs). Delta from tip 55/19/8/31/39 (decision-log.md 2026-07-10 § "CF 58 Phase 1 (design) RATIFIED"): +1 catch (Catch 56, Category B — process-artifact-vs-execution: PLAN-cf58-trigger-chance.md's Step 4 gate conflated harness-divergence-check with full-regeneration blast radius; see CF 64); open-CFs net 0 (CF 58 closed −1, CF 64 opened +1); no new rule/pattern/drift.

Merge: PR \#34, --no-ff, merge e0a056d — recorded post-merge.

## 2026-07-10 — CF 58 Phase 1 (design) RATIFIED — trigger_chance_pct echo mechanism + dedicated RNG stream

Phase 1 ground-truth verification (3 parallel read-only Explore agents + firsthand grep on the
Rule 5 item count, the 21-file fixture union, and the two central anchors) confirmed
PLAN-cf58-trigger-chance.md's structural model against live main — no-op site, buff
push/dedupe/emit, sumActiveBuffs, fireTrigger insertion point, single-stream RNG,
draw-only-when-needed precedent, both items/amounts, BuffableStat membership — with two citation
corrections (combatSeed at packages/sim/src/run/state.ts:1039, not state.ts:1022-1030; item paths
under packages/content/src/items.ts) and one material design correction.

**Stride offset corrected.** The draft's CHANCE_RNG_OFFSET = 13 × 65521 = 851,773 lands exactly on
the existing shop-round-13 / ghost-round-6 lattice values — inert today only because the offset
applies to the independently-drawn combat seed, not the run base seed, but a latent collision risk
should combat seeding ever move sim-side (schemas.ts:744, CF 34). Corrected to CHANCE_RNG_OFFSET =
32749 — a prime below both existing stride primes (65521, 65519), which by construction can never
equal a positive multiple of either stride under any future seed-derivation refactor. Documented
with the same disjointness rationale as relicOffer.ts:8-11.

**Empirical spike (throwaway, discarded) confirmed §B's isolation claim**: full sim suite 249/249
baseline → 8 failed / 241 passed with the corrected-offset spike in place → identical 8-file
divergence on a second run (byte-stable) → 249/249 restored post-revert (git diff empty; combat.ts
byte-for-byte back at HEAD 7d558cd). All 8 divergent .jsonl fixtures (003-greedy-1003,
004-greedy-1004, 014-greedy-1014, 015-greedy-1015, 021-greedy-1021, 039-greedy-1039,
207-relic-collector-2007, 208-relic-collector-2008) are a strict subset of the grep-verified
21-file union (the other 13 hold an item but never place it adjacent to a firing match, so the
mechanism never activates); both combats/*.json (12) and the 6 scenario fixtures stayed
byte-identical throughout. No file outside the 21 diverged — no main-cursor leak.

Rule 17: clean, no persistence-boundary change (per-combat chanceRng is not serialized; combat is
provably never mid-flight at save — synchronous simulateCombat inside one no-await controller call;
saves fire only at arranging-entry + terminal).

**Ratified**: §§ A (effects-only echo, no cascade/no recordFire double-count/no chained re-roll)
and B (dedicated combat-scoped RNG stream, corrected offset 32749) as the CF 58 design. Citation
corrections and the stride fix fold into CF 58's eventual closing entry — no separate Catch
(unratified-plan review findings don't get their own entry per standing convention).

**Next**: branch cf58-trigger-chance off current main, implement §§ A+B, flip pinning tests, run
the ratified corpus-regeneration protocol (224-file .jsonl regen under this justification, both
.json corpora untouched), Codex cycle, Trey's --no-ff merge. Closing entry held until the real
merge SHA exists (CF 59 sequencing fix, decision-log.md 2026-07-09 § "CF 59 merge SHA recorded").

**Counter: 55 / 19 / 8 / 31 / 39** (catches / rules / patterns / drifts / open-CFs) — UNCHANGED
from the tip 55/19/8/31/39 (decision-log.md 2026-07-10 § "CF 60 CLOSED …"). No Catch/Rule/Pattern/
Drift; CF 58 remains OPEN — this is a Phase-1 design ratification, not a close (closing entry held
until the implementation merge SHA exists).

## 2026-07-10 — CF 60 CLOSED (adjacency-trigger visual signal: arranging teal glow + combat burst; PR 33, merge dee67ee)

**CF 60 CLOSED** — the on_adjacent_trigger mechanic, invisible board-wide (7 of 45
items build on it), now has two additive client-only visual signals. (1) Arranging: a
new pure detector (run/adjacency.ts detectAdjacencySynergies) surfaces every live
(reactor, provoker) pair, drawn by an AdjacencyGlow SVG overlay — a quiet teal dashed
outline on both items, sibling to RecipeGlow at zIndex 4 (one below RecipeGlow's 5 so
the gold recipe cue stays dominant), static (motion reserved for the recipe glow).
(2) Combat: on_adjacent_trigger item_trigger events render a denser teal burst,
distinct from the generic red activation burst. Client-only; zero sim/schema/fixture
change.

**Design contract:** the detector mirrors the sim ground truth exactly
(packages/sim/src/combat.ts) — 4-dir edge adjacency (:157-159); fireAdjacentReactions
(:558-589) tests the PROVOKER's tags against the REACTOR's on_adjacent_trigger
matchTags, empty/absent = match-all (:576-581); only TOP-LEVEL fires provoke (no
cascade, :540-543). CF 60 opened 2026-07-06 § "CF 57 CLOSED…".

**Two pre-merge findings folded in — no new Catch** (pre-merge review catches take no
ordinal, same treatment as CF 54's @types/node false-green + turbo-cache P2):
1. Plan Step-1 data-source correction — the detector reads canonical getItem from
   @packbreaker/content, not the client-narrowed run/content ITEMS (ItemDef strips
   `triggers`, so it cannot drive the detector). Phase-1-missed.
2. Adversarial-review-caught detector bug — canProvoke tested "any
   non-on_adjacent_trigger trigger" as a provoker, but the sim fires adjacent reactions
   only from top-level fires (isTopLevel=true), whose set is exactly {on_round_start,
   on_low_health, on_cooldown}; on_hit / on_taken_damage fire only as reactions
   (fireDamageReactions isTopLevel=false, :454) and never provoke. Would have falsely
   glowed e.g. Vampire Fang (on_hit-only) or Wooden Shield (on_taken_damage-only)
   beside a match-all reactor. Fixed to positive membership; +2 regression tests.
   Latent for today's iconned shop pool but wrong for the canonical registry the
   detector mirrors.

**Ratified deviation from plan Step 5:** the plan added an optional tint param to
spawnParticleBurstAt to colour the burst teal. Phaser's tint multiplies, and tinting
the saturated-red TEX.lineHit (0xef4444) rendered muddy brown (confirmed in playtest),
not teal. Superseded by a dedicated pre-coloured teal texture (TEX.lineHitTeal +
PALETTE.adjacencyTeal 0x5eead4), rendered untinted — matches the codebase's per-colour
texture pattern; tint param dropped as unneeded (trivial re-add).

**Test deltas:** client +9 detector unit tests (run/adjacency.test.ts: happy pair,
tag-mismatch, no-trigger neighbour, diagonal, reactor-only pair, rotation, match-all,
+2 reaction-only-provoker regressions) + 3 component tests (AdjacencyGlow.test.tsx).
Suite totals: client 520/15-skip, sim 514/1-skip, content 31. RecipeGlow + its tests
unmodified. No fixture re-baseline; no schema/sim/content change.

**Rule 18 — verified axes (enumerated; unlisted = unchecked):**
1. Detector semantics vs combat.ts — 4-dir edge adjacency (cells not anchors, via
   bag/layout cellsOf); matchTags direction + empty=match-all; top-level provoker set
   (post-fix); no-cascade. Adversarially reviewed.
2. Trigger data source — canonical getItem (has triggers); client ItemDef strips them
   (would silently yield 0 synergies).
3. Determinism / fixtures — 0 diffs across packages/sim/test/fixtures; client-render-
   only, reads the EXISTING item_trigger `trigger` field — no CombatEvent schema change
   (a provokedBy field would have byte-shifted the corpus; explicitly not added).
4. Recipe-glow dominance — AdjacencyGlow zIndex 4 < RecipeGlow 5; static vs animated;
   RecipeGlow + tests unmodified (asserted).
5. Both viewports — one AdjacencyGlow mount in BagBoard (shared by Desktop + Mobile);
   synergies memoized locally on bag, not lifted to parents.
6. Combat differentiation — branch on the existing ev.trigger discriminator; no scene→
   bag lookup; dedicated teal texture (post-fix) reads clean.
7. Scope — exactly 7 client files changed vs main (git-confirmed); no sim/content/
   schema/fixture file touched.
8. Gate — client typecheck/lint/test/build green; sim + content regression-clean.
9. Rule 19 rendered output — states 1–3 screenshot-confirmed; state 4 live-observation-
   confirmed (burst too small/brief for a reliable full-page capture; documented as
   direct visual confirmation). First pass rendered muddy (pre-texture-fix); post-fix
   reads clean teal.

**Codex round(s):** round 1 CLEAN — "Codex Review: Didn't find any major issues.
Bravo." Zero P1/P2 findings. Clean pass landed as a top-level issue comment (id
4937319845), reviewed commit a580b92 = current tip, not stale. Ceiling never tripped
(0/4); no meta-audit run.

**Playtest/palette note:** the teal (teal-300, 0x5eead4 / rgba(94,234,212,0.55)) is a
graybox placeholder; palette consolidation rides CF 20.

**Counter: 55 / 19 / 8 / 31 / 39** (catches / rules / patterns / drifts / open-CFs).
Delta from the tip 55/19/8/31/40 (decision-log.md 2026-07-09 § "CF 59 CLOSED …"):
open-CFs −1 (CF 60 closed). Catches / rules / patterns / drifts unchanged — the two
folded findings were pre-merge review catches and take no Catch number.

## 2026-07-09 — CF 59 merge SHA recorded: 9445a9b (supersedes placeholder in CF 59 CLOSED entry below)

Merge commit `9445a9b659…fed1b` (`--no-ff`, parents `95894f0` + `1311b15`), merged via GitHub PR \#32. Confirmed independently via local git and GitHub API (`merged: true`, `state: closed`, `merged_at: 2026-07-10T00:39:37Z`). Supersedes the `<SHA-on-merge>` placeholder left in the CF 59 CLOSED entry appended earlier this session (`95894f0`). No counter change — informational append only.

## 2026-07-09 — CF 59 CLOSED (item-driven gold economy wired: add_gold + goldPerRound; PR 32, merge pending Trey's --no-ff)

**CF 59 CLOSED** — M1.2.4's item-driven gold-credit system, dead since it shipped, now has exactly
one consumer. Two mechanisms, one site: a run-controller helper `computeItemGoldIncome(bag, items)`
(sibling to `computeStartingHpFromBag` in `packages/sim/src/run/state.ts`) sums
`passiveStats.goldPerRound` plus `on_round_start` `add_gold` effects across the current bag
placements; `advancePhase` credits it in one line — after base income, before `makeShop`, before
`emitRoundStart` (so `round_start.gold` telemetry includes it). Activates the 4 previously-inert
gold items: Lucky Penny (add_gold 2), Copper Coin (1), Coin Pouch (2), Treasure Sack (4).

**Design contract (Phase-1-ratified, verified verbatim against source this session):**
- `gdd.md` line 118 — `add_gold(n)` is out-of-combat only; the `combat.ts` combat-resolver no-op is
  CORRECT and permanent (not a bug to fix). Confirmed unchanged.
- `balance-bible.md` § 17 — "the run controller reads `passiveStats`… `goldPerRound` is summed per
  round-end and credited to the player's gold pool… the sim never sees `passiveStats`. Determinism
  contract preserved."
- `content-schemas.ts` line 204 — goldPerRound "credited to player gold AFTER round combat resolves,
  BEFORE next shop generates."

**Zero fixture churn — confirmed by an actual gate run, not predicted.** 0 diffs across the 230-file
determinism corpus (224 `.jsonl` determinism fixtures + 6 `.json` run-scenario fixtures); the full
243-file `packages/sim/test/fixtures/` directory (the 230 plus 12 combat `.json` + 1
rng-sequences.json) is likewise byte-unchanged (`git diff --name-only main..HEAD -- …/fixtures` = 0).
This corrected the plan's original Phase-1 premise: 65 of the 224 `.jsonl` fixtures DO `place_item` a
gold item into the player bag (110 placements), so `computeItemGoldIncome` returns non-zero in dozens
of replayed rounds — that is correct, not a bug. Stability holds because (a) the `.jsonl` replay
terminal snapshot is `{outcome, roundsReached, finalHearts, perRoundCombatEvents}` — gold is never
compared; (b) higher gold can never invalidate a recorded action (gold only floor-gates purchases
downward); (c) the credit line consumes no RNG, so `makeShop` sees an identical RNG state. The 6
`.json` scenarios carry gold items only in `shop.slots` (never placed).

**Test deltas:** sim +5 income tests in `run.test.ts` (+1 copper, +2 lucky-penny [trigger-scan arm],
+6 pouch+sack stack, +0 shop-only [placements-only], round_start telemetry carries the credit —
determinism-safe bags via `restoreRun`, guaranteed-loss combat so no win-bonus contaminates the
delta); content +1 invariant in `items.test.ts` (every `add_gold` sits under `on_round_start`
registry-wide); client `describeItem.test.ts` flipped (4 gold items now render real copy; Rune
Pedestal is now the sole tag-fallback). Suite totals: sim 514/1-skip, content 31, client 508/15-skip.
No fixture re-baseline; no schema change; `combat.ts` / `ruleset.ts` / `useRun.ts` untouched.

**Rule 18 — verified axes (enumerated; unlisted = unchecked):**
1. Helper arithmetic — goldPerRound + on_round_start add_gold summed over `placements` (not cells);
   integer-only; `?.goldPerRound`/`e.amount` guarded (no NaN/undefined path).
2. Credit-site placement — after baseIncome, before makeShop, before emitRoundStart (telemetry
   captures it); one line, `advancePhase` only.
3. Boss round (11) — `shouldEndRun → endRun → return` short-circuits BEFORE the credit line; no
   post-run payout, no next-shop to precede.
4. Constructor / round-1 — no item credit (empty bag precedes first shop); restore re-enters via
   `advancePhase` only → no double-credit.
5. Double-count — repo-wide `goldPerRound` grep found zero existing gold-crediting reader; this is
   the first and only credit path.
6. add_gold trigger-scope — credited only from `on_round_start`; content invariant test enforces it
   registry-wide so future content can't silently attach it elsewhere.
7. Determinism / fixtures — zero churn (230 corpus + 243 directory), empirically; terminal snapshot
   gold-free; credit RNG-free.
8. ESLint fence — the `passiveStats` read in the new helper did NOT trip the sim-wide lint
   restriction (relaxed for `packages/sim/src/run/**`); lint green.
9. Client copy — add_gold + goldPerRound rendered; bonusBaseDamage still omitted (no consumer);
   header/doc comments updated; describeItem tests flipped.
10. Scope — exactly 5 files changed vs main (git-confirmed); combat.ts / schemas / fixtures /
    ruleset.ts / useRun.ts untouched.
11. Gate — lint / typecheck / test / build green across sim, content, client; schema-sync
    byte-identical.
12. Adversarial review — 4-lens (correctness / determinism / test-adequacy / plan-conformance)
    returned zero findings.

**Codex round(s):** round 1 CLEAN — "Codex Review: Didn't find any major issues." Zero P1/P2
findings. Clean pass landed as a top-level issue comment (reviews endpoint empty), per Catch 54;
reviewed commit `1311b152e5` = current tip. 4-finding ceiling never tripped (0/4); no meta-audit
run. Trigger note: this repo's token-created PRs do NOT auto-review on open — round 1 fired only
after an explicit top-level `@codex review` comment (PR 31 precedent), not on PR creation, logged as
Catch 55; codex-cycle's trigger step corrected accordingly.

**Playtest note (per CF 59's opening text):** the low-D2-pick-rate expectation on these four gold
items is now lifted — after this ships, pick-rate on gold items becomes real signal, not an artifact
of them being inert.

**Counter: 55 / 19 / 8 / 31 / 40** (catches / rules / patterns / drifts / open-CFs). Delta from the
tip 55/19/8/31/41 (decision-log.md 2026-07-09 § "Catch 55 …"): open-CFs −1 (CF 59 closed). Catches /
rules / patterns / drifts unchanged.

## 2026-07-09 — Catch 55 (codex-cycle auto-review assumption: PAT-created PRs need an explicit @codex review trigger)

**Catch 55 (NEW — process-tooling defect in a project skill; caught by real Codex behavior
contradicting the skill's own assertion).** `codex-cycle` asserted that creating a PR auto-fires
Codex's first review ("Creating the PR is what fires Codex's automatic first review"; frontmatter:
the initial review "fire[s] without a manual trigger"). CF 59's PR 32 — created via the fine-grained
PAT — falsified it: the PR sat 17 min silent on open, both surfaces empty (0 reviews, 0 issue
comments), no auto-review queued. Round 1 fired only after an explicit top-level `@codex review`
comment, landing ~4.5 min later as the usual clean-pass issue comment. PR 31 showed the same shape
(its Codex review came ~6 min after a manual `@codex review`, never on open). Codex's own response
lists "Open a pull request for review" as a trigger, but that does not fire for the API/PAT-created
path this skill uses. Corrected in `.claude/skills/codex-cycle/SKILL.md` (commit `637eeed`): opening
paragraph, "Opening the PR" entry, Step 1, and the frontmatter description now state review is never
automatic on the PAT path — post an explicit `@codex review` immediately after every PR open
(round 1) and after every later push; Step 2 polling / stale-SHA guard (Catch 54) left untouched.
Codified at first instance per master-dev's bend-now ratification (shape generic, discipline
low-burden, predictable surface across the rest of the playtest-readiness batch). Logged as a Catch
only — **no new Rule**: the correction lives in the skill file itself, so a Rule ordinal would merely
restate it (same disposition as Catch 54).

**Counter: 55 / 19 / 8 / 31 / 41** (catches / rules / patterns / drifts / open-CFs). Delta from the
tip 54/19/8/31/41 (decision-log.md 2026-07-09 § "CF 54 CLOSED …"): catches +1 (Catch 55). Rules /
patterns / drifts / open-CFs unchanged.

## 2026-07-09 — CF 54 CLOSED (telemetry clientVersion derived from build metadata); PR 31 merged 86357f3

`apps/client` telemetry `clientVersion` was a hand-edited literal `'m1.5c-pr1'`
(stale several merges), so every emitted event mis-tagged its deploy in the D1/D2
PostHog dashboards. Now derived at build time as `<pkg.version>+<short git SHA>`
(tech-architecture.md § 8.3 M1 scheme), e.g. `0.0.1+faa4ae1`, with a
`0.0.0+unstamped` fallback under non-Vite runners. Merge commit `86357f3`
(--no-ff, GitHub "Merge pull request" from `cf54-client-version`, parents
`a91fa3c` + `6fc7410`), code commits `faa4ae1` (derivation) + `6fc7410`
(turbo-cache fix). PR 31 merged + closed.

**CF 54 CLOSED — core deliverable.** Opened 2026-05-23 § "M1.5c PR 2 CLOSED …" →
"CF 54 OPENED (NEW) — derive clientVersion from build/package version". The Vite
`define` injects `__CLIENT_VERSION__` (computed in `vite.config.ts` from
`package.json` version + `git rev-parse --short HEAD`, git-absent → `local`);
`emit.ts` reads it through a `typeof` guard so the module stays loadable under any
non-Vite runner. Production `useRun` never overrides, so the constant always
reaches the wire. Value-only change: no schema edit, schema-sync trivially green;
determinism corpora byte-stable (`git diff` on `packages/sim/test/fixtures/`
empty — client-only). New default-path emit test asserts a real stamp and, by
mutation (define removed → fallback), provably fails on the `0.0.0+unstamped`
sentinel (`AssertionError: expected '0.0.0+unstamped' not to be '0.0.0+unstamped'`).

**Two review-caught findings folded in — no new Catch numbers.** Both were caught
before merge (one pre-ratification, one during normal PR review); per the
established session ruling, pre-merge review catches take no Catch ordinal.
- **Phase-1 (pre-ratification): `@types/node` false-green.** `vite.config.ts`'s new
  `node:` imports are typechecked (via `tsconfig.node.json`), but `apps/client`
  didn't declare `@types/node` — it compiled locally only via an ambient home-dir
  `@types/node` leak and would have failed `tsc -b` on a clean CI checkout. Fix =
  add `@types/node ^20.17.0` to `apps/client` + `"types": []` on
  `tsconfig.app.json` (scopes Node ambient globals out of the `src`/DOM app
  compilation so they can't shadow `URL`/`fetch`/`setTimeout`). Expanded scope from
  the plan's 4 files to 7 (incl. `pnpm-lock.yaml`).
- **Codex round-1 (normal PR review): turbo build-cache stale-SHA (P2).** The
  `build` task cached `apps/client dist/**` under a hash excluding the git SHA, so a
  commit advancing HEAD without touching client inputs could cache-hit and ship an
  older stamp — defeating the deploy-slice goal for warm-cache local builds. Fixed
  `6fc7410`: `"@packbreaker/client#build": { "cache": false }`. Behaviorally
  verified — baseline `turbo run build --filter=@packbreaker/client` twice → run 2
  `>>> FULL TURBO` (stale-SHA cache-hit); after the change run 2 re-executes
  (`0 cached, 1 total`, fresh build time) and `--dry-run` reports the task cache
  local:false / remote:false. CI already builds fresh, so no CI behavior change.

**PostHog filter-continuity changeover (expected, not a data gap).** Dashboard
filters on `clientVersion = 'm1.5c-pr1'` stop matching events emitted after this
ships — deploy-slicing becoming real is the point, not a telemetry regression.
Noted so the changeover isn't misread.

**Codex-cycle tally.** Round 1 (commit `faa4ae1`): 1× P2 (turbo-cache, above),
fixed. Round 2 (commit `6fc7410`): CLEAN — "Codex Review: Didn't find any major
issues. Swish!", reviewed commit `6fc74107d5` (matches branch tip). Ceiling never
tripped (1/4); no meta-audit. CI green per-step — Install / Lint / Typecheck /
Test / Build all `success` on both `faa4ae1` (Actions run 29038989824) and
`6fc7410` (run 29042197965); the clean-checkout Typecheck step is the authoritative
gate the ambient `@types/node` leak could not stand in for locally. (PR-thread
hygiene: 👍 + "addressed in 6fc7410" reply landed; the review thread's collapse is a
manual browser action — the fine-grained PAT cannot run `resolveReviewThread`.)

**Counter: 54 / 19 / 8 / 31 / 41** (catches / rules / patterns / drifts /
open-CFs). Delta from the tip 54/19/8/31/42 (decision-log.md 2026-07-08 § "CF 63
CLOSED … CF 42 CLOSED …"): open-CFs −1 (CF 54 closed). Catches / rules / patterns /
drifts unchanged — the two folded-in findings were pre-merge review catches and
take no Catch number per the session ruling.

## 2026-07-08 — CF 63 CLOSED (live recipe-bonus threading) + CF 42 CLOSED (latent startingHp hardening); Catch 54 (codex-cycle clean-pass polling gap); combat-parity merge 3594eb1

Client combat-input parity merged: `CombatOverlay.buildCombatInput` now reads the
sim-authoritative player `startingHp` and `recipeBornPlacementIds` from
`RunController.getPlayerStartingHp()` + the existing `getRecipeBornPlacementIds()`
at combat-entry, replacing the hardcoded `startingHp: 30` and the omitted field.
Merge commit `3594eb1` (--no-ff, trailer-free), branch `client-combat-input-parity`
off main `36dd14c`, code commit `dced52e`. PR 30 merged + closed.

**CF 63 CLOSED — live bug fixed.** Opened 2026-07-08 § "Combat-parity Phase 1
ratified …" (the recipe-threading remainder de-numbered at the 2026-07-05 CF 43
close, renumbered CF 63 there). Genuinely live: the reachable iconned recipes
(`r-steel-sword`, `r-fire-oil`, `r-ember-brand`, `r-healing-salve`) mint
recipe-born outputs whose Tinker `recipeBonusPct` (+10% class passive, plus Pocket
Forge / Catalyst if held) was silently dropped in the combat the player watches.
Now threaded.

**CF 42 CLOSED — latent hardening (NOT a live no-op).** Opened 2026-05-19 §
"M1.5b PR 1 Phase 2.5b interlude" (commit 17bd494); reclassified LATENT at
2026-07-08 § "Supersession: CF 42 reclassified LATENT …" (commit `36dd14c`). The
`startingHp: 30` hardcode was correct for every *reachable* client build (two-part
reachability below); this fix future-proofs it so it cannot silently become wrong
when reachability opens. Framed as latent hardening — deliberately not a joint
"items were dead" narrative with CF 63.

**Two-part reachability (refinement of CF 42's disposition; no new CF).** A
`maxHpBonus` item is reachable in client combat only if BOTH conditions hold, and
both fail today:
1. **Iconned into the client shop/ghost pool.** `SHOP_POOL_ITEMS` is built from
   the 12 `ICONNED_ITEM_IDS` (`apps/client/src/run/content.ts`); none of the six
   `maxHpBonus` items (`buckler`, `iron-shield`, `chainmail`, `tower-shield`,
   `bloodmoon-plate`, `world-forged-heart`) are iconned, and `ICONNED_RECIPES`
   excludes `r-iron-shield` / `r-tower-shield`.
2. **Present in the registry the client combat path resolves against.** `runCombat`
   hardcodes `simulateCombat(input, { items: SHOP_POOL_ITEMS })`
   (`apps/client/src/combat/sim-bridge.combat.ts`) — the client resolver throws
   `canonicalCells: unknown itemId` on any non-iconned item, so a `maxHpBonus` item
   could not be simulated even if it reached the bag.
They open independently: condition 1 when icon-art expansion lands the full
45-item set (post-M1.3.4b); condition 2 if the client combat registry ever widens
beyond `SHOP_POOL_ITEMS`. Surfaced during Phase 2 — the e2e test hit condition 2
directly (iron-shield could not traverse `runCombat`), which is why CF 42's e2e
case asserts at the `CombatInput` boundary rather than through real combat.

**Design + verification.** `getPlayerStartingHp()` delegates to the existing
private `computePlayerStartingHp()` — behavior-neutral; Rule 7 barrel sweep a
verified no-op (`RunController` already exported from both barrels). Ghost HP keeps
its own round-scaling formula (intentional asymmetry, comment added; ghost is
M2-placeholder scaffolding, not a player-HP mirror). New `combatParity.e2e.test.ts`
(2 cases): CF 63 driven through the real `buildCombatInput → runCombat →
simulateCombat` with an iconned recipe-born `steel-sword`; CF 42 asserted at the
`CombatInput` boundary with `iron-shield` (per condition 2). Gate:
`turbo lint typecheck test build --force` 25/25 green (sim 509 pass / 1 skip;
client 507 pass / 15 skip, +2; content 30; ui-kit 34; server 67); determinism
corpus byte-stable (`git diff` on `packages/sim/test/fixtures/` empty — the getter
only delegates to an existing private read, no RNG / mutation, not invoked during
replay); CI green on `dced52e`. Change surface 4 files (the Phase-1 plan's 5-file
prediction over-counted `CombatOverlay.test.tsx`, which has no direct
`buildCombatInput` call site and needed no edit).

**Codex-cycle: round 1 CLEAN.** 0 findings, ceiling never tripped, no meta-audit.
Codex's clean verdict — "Codex Review: Didn't find any major issues. Swish!",
reviewed commit `dced52e` (matches branch tip) — landed as a top-level ISSUE
comment while the reviews endpoint stayed empty.

**Catch 54 (NEW — process-tooling defect in a project skill; caught by real Codex
behavior contradicting the skill's own assertion).** `codex-cycle` Step 2 asserted
Codex's response is always a PR review and instructed the poller NOT to check
`/issues/{pr}/comments` ("that endpoint only ever shows the human-posted
trigger"). PR 30's clean pass falsified that: the zero-finding verdict landed as an
issue comment, reviews endpoint empty — a poller following the old Step 2 would
have reported a false timeout and missed the pass. Corrected in
`.claude/skills/codex-cycle/SKILL.md` Step 2 (commit `5cb5bff`): poll BOTH surfaces
every round (reviews for finding-bearing reviews, issue comments for the same bot's
clean-pass verdict) + a stale-SHA guard. Per master-dev ratification, logged as a
Catch only — **no new Rule**: the correction lives in the skill file itself, so a
Rule ordinal would merely restate it.

**Counter: 54 / 19 / 8 / 31 / 42** (catches / rules / patterns / drifts /
open-CFs). Delta from the tip 53/19/8/31/44 (decision-log.md 2026-07-08 §
"Supersession: CF 42 reclassified LATENT …"): catches +1 (Catch 54), open-CFs −2
(CF 63 + CF 42 closed on the combat-parity merge). Rules / patterns / drifts
unchanged.

## 2026-07-08 — Supersession: CF 42 reclassified LATENT (maxHpBonus items shipped 2026-04-26 + unreachable in client content); corrects the 55f4dcb combat-parity ratification framing; Drift 31

Corrects two factual errors in decision-log.md 2026-07-08 § "Combat-parity Phase 1
ratified: CF 42 confirmed open … Drift 30" (commit `55f4dcb`), surfaced by the
git-blame + client-reachability check run ahead of Phase 2 (the check that
entry's own hand-off mandated). The technical fix and the CF-numbering (CF 42 +
CF 63) are unchanged; only CF 42's severity framing and the ship-date claim are
corrected.

**Error 1 — ship date.** `55f4dcb` states the six `maxHpBonus` items "have since
shipped … the auto-close trigger fired with no re-check," implying they landed
after CF 42 opened (2026-05-19). Git contradicts this:
`git log -S 'maxHpBonus' -- packages/content/src/items.ts` returns a single
commit, `583bd7a` (**2026-04-26**, the initial M1.1 content drop — the same
commit that introduced `buckler`). The items predate CF 42's opening by three
weeks; CF 42's disposition premise ("No M1 item ships `passiveStats.maxHpBonus`")
was **false when written**, not a trigger that fired later.

**Error 2 — live vs latent.** `55f4dcb` frames CF 42's `startingHp: 30` hardcode
as a live no-op in watched combat. It is not reachable: `apps/client/src/run/content.ts`
builds `SHOP_POOL_ITEMS` (the client shop + ghost pool) from the 12
`ICONNED_ITEM_IDS` only — none carry `maxHpBonus` — and `ICONNED_RECIPES`
excludes `r-iron-shield`/`r-tower-shield` (the recipes whose outputs carry it);
the starting bag is empty. So no `maxHpBonus` item can enter a player (or ghost)
bag in real client gameplay, and the hardcode is correct for every reachable
build.

**CF 42 reclassified: LATENT, not live. Stays OPEN.** Its reactivation condition
is properly read as "a `maxHpBonus` item becomes *reachable* (iconned)" — not
"exists in the content registry" — and that has never fired (the `content.ts`
header notes the iconned `SHOP_POOL_ITEMS` filter drops only when the full
45-item icon set lands, post-M1.3.4b). CF 42 is not closed here; it closes on the
combat-parity code merge as a latent-hardening fix.

**CF 63 unaffected — confirmed live.** The reachable iconned recipes
(`r-steel-sword`, `r-fire-oil`, `r-ember-brand`, `r-healing-salve`) mint
recipe-born outputs whose Tinker `recipeBonusPct` (+10% class passive, plus Pocket
Forge / Catalyst if held) is dropped by the omitted `recipeBornPlacementIds`.
This is the batch's genuine live bug; the combat-parity fix still closes it.

**Bearing on the auto-close-trigger HELD call (`55f4dcb`):** unchanged, if
anything reinforced — CF 42 remains the single clean instance of the "latent bug
reactivated by content, no checker" shape; this correction only refines that its
trigger is *reachability*, not registry-presence, and that it has not yet fired.
Still HELD, no rule ordinal.

**Drift 31 (Topic 2, master-dev; caught POST-landing).** The "shipped since /
trigger fired" claim originated as an unverified master-dev assertion (prior chat
turns) and was propagated by Claude Code into the committed + pushed entry
`55f4dcb` without a git-blame. Same grounding-caught-master-dev-claim mechanism as
Drift 28 (decision-log.md 2026-07-05 § "Drift 28 … trailer-status claim corrected
before commit") and Drift 30 (decision-log.md 2026-07-08 § "Combat-parity Phase 1
ratified") — but distinct from both in that it **landed in a committed, pushed log
entry before being caught**, whereas 28 and 30 were each caught pre-landing at the
grounding gate. Caught here by the git-blame + reachability check the same
combat-parity hand-off mandated, ahead of Phase 2 rather than at the code close.

**Counter: 53 / 19 / 8 / 31 / 44** (catches / rules / patterns / drifts /
open-CFs). Delta from the tip 53/19/8/30/44 (decision-log.md 2026-07-08 §
"Combat-parity Phase 1 ratified"): drifts +1 (Drift 31). No catch / rule /
pattern; no CF opened or closed — CF 42 is reclassified (latent) but stays open,
CF 63 stays open; both close on the combat-parity code merge.

## 2026-07-08 — Combat-parity Phase 1 ratified: CF 42 confirmed open, recipe-threading remainder renumbered CF 63, auto-close-trigger rule HELD, two design calls locked; Drift 30

Phase 1 ratification for the combat-parity plan (client combat-input parity),
the first item in the playtest-readiness sequence, ahead of a separate Phase 2
hand-off. No code this entry; no CF closed. Investigation confirmed the client's
production combat (`CombatOverlay.buildCombatInput`) hardcodes `startingHp: 30`
and omits `recipeBornPlacementIds`, so shipped `maxHpBonus` items and the Tinker
`recipeBonusPct` line no-op in the combat the player actually watches.

**CF 42 — confirmed still open (not a fresh find).** Opened M1.5b PR 1
Phase 2.5, commit 17bd494; verbatim disposition recorded at decision-log.md
2026-05-19 § "M1.5b PR 1 Phase 2.5b interlude": "CF 42 (open, M1.5b PR 1
Phase 2.5): `buildCombatInput.startingHp: 30` hardcode. No M1 item ships
`passiveStats.maxHpBonus` so the value is correct for every M1 build;
auto-closes when the first `maxHpBonus` item ships." Six `maxHpBonus` items have
since shipped (`packages/content/src/items.ts`); the auto-close trigger fired
with no re-check. Grep of the log confirms no "CF 42 CLOSED" entry — open at
tip. CF 42 stays open here; it closes on the combat-parity code merge, not this
ratification.

**CF 43 — the number is CLOSED; recipe-threading remainder renumbered CF 63.**
Per decision-log.md 2026-07-05 § "CF 43 CLOSED (bornFromRecipe persisted across
save/restore; standalone backlog item, Catch 44 + Rule 17 codified)" (merge
bbc9505), CF 43 was re-scoped to persistence and closed, open-CFs −1. That same
entry de-numbered the combat-threading remainder verbatim: "No client-combat
threading (CombatOverlay.tsx:118-119 recipe-bonus omission remains a separate,
still-open, lower-priority follow-on — not reopened, not renumbered, tracked
informally, no CF assigned pending future prioritization)." Prioritization has
now arrived, so the remainder is assigned a fresh number rather than re-closing
the already-closed CF 43:

**CF 63 (OPENED)** — client-combat recipe-bonus threading.
`CombatOverlay.buildCombatInput` omits `recipeBornPlacementIds`, so Tinker's
class passive `recipeBonusPct` + Pocket Forge + Catalyst + Worldforge Seed
no-op in client-side combat. Spun off (de-numbered) at the 2026-07-05 CF 43
close; renumbered here. Closes on the combat-parity code merge. Number walked
from canon: highest existing CF was 62 (decision-log.md 2026-07-06 § "CF 62
(OPENED) + Catch 53"); grep confirms no CF 63+ present at tip.

**Auto-close-trigger rule — HELD, not codified.** The proposal to codify now
(bending the second-instance convention) does not survive log re-derivation:
only CF 42 exhibits the "latent bug reactivated silently by an unrelated content
drop, with no checker" shape. CF 43's trigger was milestone-reconsider and
functioned as designed (reconsidered at M1.5e, persistence half closed). CF 44's
auto-close trigger (decision-log.md 2026-05-19 § "M1.5b PR 1 closed" CF
dispositions: "named glyphs land for all mid + boss relics across both classes")
is gated on deliberate glyph-art work for six already-shipped relics — no
silent-reactivation mode, and it has not failed. One confirmed instance → HELD
candidate, no rule ordinal assigned. The low-burden antidote (grep
decision-log.md for auto-close-trigger CFs against `packages/content/` on every
content drop) is adopted as informal practice immediately, independent of rule
codification; codify on a genuine second instance (M2's content surface makes
one likely).

**Drift 30 (Topic 2, master-dev; caught pre-landing).** Master-dev asserted
CF 43 as closeable "by number" and CF 43/44 as parallel already-failed instances
of CF 42's auto-close pattern, carrying their original/assumed dispositions
rather than re-deriving from the log. Both facets share one root: CF 43 was
closed and de-numbered 2026-07-05 (so it cannot be re-closed by number, and its
tracking functioned rather than failing silently), and CF 44 is glyph-art-gated
with no silent-reactivation failure. Corrected before this entry landed. Same
shape as Drift 28 / Drift 29 (master-dev claim contradicting canon, caught at
the grounding gate pre-landing). Counted as one drift — single root
(disposition not re-derived from the log), two surfaced facets.

**Design calls ratified (counter-neutral — design decisions, not
catch/rule/pattern).**
1. Sim-exported starting-HP getter. Add `RunController.getPlayerStartingHp()`
   delegating to the existing `computePlayerStartingHp()` (`BASE_COMBATANT_HP` +
   Σ `passiveStats.maxHpBonus` over bag placements); the client reads it and
   never recomputes passiveStats, per tech-architecture.md § 4.5 Rule 2.
   `recipeBornPlacementIds` needs no new getter — `getRecipeBornPlacementIds()`
   already exists (shipped at the CF 43 persistence close). Rejected: exporting
   `computeStartingHpFromBag` for client-side recomputation (Rule 2 violation;
   duplicates the passiveStats read outside the `packages/sim/src/run/**`
   ESLint fence).
2. Ghost HP keeps its own derivation. `makeGhostForRound` retains its
   round-scaling formula (`BASE_COMBATANT_HP + max(0, floor((round-1)/2))*2`);
   no `maxHpBonus` summing. It is deliberate M2-placeholder scaffolding ("must
   remain easy to delete"), not a player-HP mirror. Player and ghost use
   different HP derivations by design — recorded so the asymmetry is not later
   mis-caught as an inconsistency.

**Counter: 53 / 19 / 8 / 30 / 44** (catches / rules / patterns / drifts /
open-CFs). Delta from the tip 53/19/8/29/43 (decision-log.md 2026-07-08 §
"Three process skills adopted under .claude/skills/"): drifts +1 (Drift 30),
open-CFs +1 (CF 63 opened). Catches / rules / patterns unchanged — the two
design ratifications are counter-neutral, the auto-close-trigger rule is HELD
not codified, and no CF is closed (CF 42 + CF 63 both close on the combat-parity
code merge).

## 2026-07-08 — Three process skills adopted under .claude/skills/ (decision-log-close, handoff-verify, codex-cycle); process tooling, no counter movement

Three project-scoped, model-invoked skills committed directly to main and
pushed to origin, encoding disciplines that had recurred as process failures
this project — decision-log counter drift, unverified claims relayed across the
master-dev-chat / Cursor boundary, and Codex endpoint / thread-reply mistakes:

- **decision-log-close** (commit ebfade1; sole write grant — Read, Edit, Grep,
  git diff) — the append procedure for this log: tip-read counter walk-forward,
  newest-at-top insertion-only, decision-day dating, `\#N` escaping, CF-closure
  and codification gates, insertion-only diff proof. This entry is its first
  live exercise.
- **handoff-verify** (commit 7234dfb; read-only) — pre-paste / pre-act
  checkpoint for artifacts crossing the master-dev-chat / Cursor boundary; runs
  the five claim-check categories against the live repo and halts on mismatch.
  Explicitly NOT for appends to this log — that is decision-log-close's job.
- **codex-cycle** (commit 3ac8dab; read-only) — Codex trigger / poll / ceiling
  loop after a remediation push: top-level `@codex review` comment only, poll
  the pulls-reviews endpoint (not issues-comments), gate the 4-finding ceiling,
  hand the tally back to decision-log-close.

All three are model-invoked only — no hook / CI / webhook wiring yet
(deliberate: prove out before automating). Committed directly to main as
tooling, consistent with the same session's other docs/tooling commits; zero
runtime or game code touched.

**Push confirmed against the live repo:** origin/main advanced 21e150b..3ac8dab
(fast-forward, 5 commits — a52c2c9 and 4f21b99, both already logged, plus the
three skills ebfade1 / 7234dfb / 3ac8dab; `a52c2c9^` resolves to 21e150b
"Catch 52 closing-log" and `git rev-list --count 21e150b..3ac8dab` = 5).
`git rev-parse origin/main` = 3ac8dabcbbe3df84108f6eaf6ba0434218beabae, equal to
local HEAD; `git rev-list --left-right --count origin/main...main` = 0 ahead /
0 behind (fully synced).

**Counter: 53 / 19 / 8 / 29 / 43** (catches / rules / patterns / drifts /
open-CFs). Delta from the tip 53/19/8/29/43 (decision-log.md 2026-07-07 § "M1
dashboard exit-gate CLOSED"): none across all five — process tooling only, zero
catch / rule / pattern / drift / CF impact. This entry documents skill adoption
only; the same-day dashboard and CF 58/59 closures (decision-log.md 2026-07-08
§ "CF 58 / CF 59 Phase-1 evidence-gathering CLOSED") are already logged and not
restated here.

## 2026-07-08 — CF 58 / CF 59 Phase-1 evidence-gathering CLOSED; CF 58 flagged for its own dedicated Phase 1 (RNG/determinism-corpus collision)

**Evidence base for both CFs is now ratifiable** (verbatim opening text +
content-side citations verified against the live repo, not the earlier
adversarial-pass preview):

- CF 58 (trigger_chance_pct) — verbatim per decision-log.md 2026-07-06 §
  CF 57 CLOSED, L254: chance-roll mechanism deferred at M1.2.3a to M1.2.5,
  closed without implementation. Hard sim no-op at combat.ts:699
  (`if (effect.stat === 'trigger_chance_pct') continue;`). Two items
  reference it: Rune Pedestal (rune-pedestal, rare, items.ts:544/554) and
  Master Alchemist's Kit (master-alchemists-kit, epic, items.ts:618/632).
- CF 59 (gold economy) — verbatim per decision-log.md 2026-07-06 § CF 57
  CLOSED, L256: item-driven gold-credit system never wired to a consumer
  since M1.2.4. One root cause (add_gold no-op at combat.ts:682-684,
  deferred to a run controller with zero add_gold handling; goldPerRound
  has no consumer — run controller only sums maxHpBonus), two mechanisms,
  4 of 45 items affected: Lucky Penny (add_gold, items.ts:252/259), Copper
  Coin, Coin Pouch, Treasure Sack (goldPerRound, items.ts:232/239,
  242/249, 456/463).
- Display-leak symptom on these same items (describeItem advertising
  ungranted rewards) was already fixed under Catch 46/47 (CF 57). CF 58/59
  track the underlying mechanism gap, not the display bug.

**Design-cost split, ratified:** CF 58's fix requires injecting a new RNG
draw into live combat resolution — collides with the 224-fixture
determinism corpus (trajectory-immutable, DO-NOT-REGENERATE per
`[[project_sim_determinism]]`). Any Phase 1 for CF 58 must resolve
RNG-stream ordering before implementation is safe. CF 59 is
run-controller/out-of-combat only, touching solely the re-baselineable
`.json` scenario corpus — materially lower risk.

**Scoping decision:** split the track. CF 59 proceeds to its own Phase 1
design pass (gold-crediting consumer point, round-start timing vs. the
flat baseIncomeForRound formula). CF 58 is held for a dedicated Phase 1
addressing RNG-ordering specifically — same treatment as CF 56; two
backlog items now carry the "own Phase 1" flag, not one.

**Not yet done:** actual design contracts for either CF. This entry closes
evidence-gathering only.

## 2026-07-07 — M1 dashboard exit-gate CLOSED — D1/D2 built in PostHog; 4 defects caught by rendered-tile screenshots after config review false-passed 12/12; Rule 19 minted; counter 53/19/8/29/43

**Config review is not render verification (Rule 19 origin).** The D1/D2 build
was audited across seven passes. The three initial passes were config-review
only and reported a false 12/12 PASS. Direct dashboard screenshots then caught
defects config inspection could not see — query-config correctness and render
correctness are separate axes.

**Defects (all caught via rendered-tile screenshot, none by config review;
three of four were also dropped at least once from a text-only status update
before capture):**
- **Card #10 (Win Rate by Starter Relic)** — missing from D2 outright on first
  audit. A since-superseded chat message describing the fix was briefly treated
  as verification without a live check; corrected before logging (no fix logged
  as shipped off a chat description alone) and re-confirmed via direct screenshot.
- **Cards #1 / #5 / #12 (Run Completion Rate, Tick-Cap Draw Rate, Boss Win
  Rate)** — query config correct, but display format set to `percentage_scaled`
  on top of an already-scaled `A/B*100` formula, double-converting (rendered
  7,500%–10,000% instead of 0–100%). Fixed by switching `aggregationAxisFormat`
  off `percentage_scaled` on all three; formulas unchanged. Confirmed via post-fix
  rendered axis ranges (0–80, 0–30, 100 respectively).
- **Card #8 (Recipe Completion Rate)** — Trends formula with a breakdown shared
  across asymmetric-property series (`recipe_completed` carries `recipeId`;
  `run_end` does not), corrupting the per-recipe denominator and silently
  rendering 0% on every row incl. None. Rebuilt as SQL insight `jACFyB57` with a
  fixed total-`run_end` denominator; old insight `8HvNaoKJ` removed from D2. State
  omitted from two intermediate status reports before screenshot confirmation.

**Rule 19 (NEW) — verify rendered/executed output directly.** Config inspection
or a written status report alone is insufficient to call any artifact verified;
a live capture of the rendered/executed output is required. Artifact-general, not
PostHog-scoped. Lineage: the "recap audit screenshot/source confusion" drift
(2026-05-19 § M1.5b PR 1 closed) and the Catch 52/53 mechanism — presence in the
config/codebase is not evidence of correct rendered/production output.

**Not counted.** These four defects stay outside the catch taxonomy on an
independently-verifiable boundary: catches 48–53 are all defects in
Claude-Code-authored, git-tracked code/infra, whose remedies are code changes
carried through the PR / Codex / git pipeline (the env-wiring trio and the
dev-proxy fix via branch→PR→Codex→merge cycles; Catch 53's `combat_start`
dead-emit-path deferred to M2 as a client-code fix). The four dashboard defects
touched none of that path — found and fixed via direct PostHog UI edits,
verified by chat-mediated screenshot review, with no Claude Code, PR, Codex, or
git artifact anywhere in their discovery, fix, or verification. They are
dashboard-configuration defects, not code defects; no catch increment.
(Supporting canonical anchor: telemetry-plan.md § 6 — "Three dashboards. Built
in PostHog." The "PostHog UI, not code" shorthand for this boundary traces to
this session's own task-scoping prompt, NOT a canonical decision-log or
telemetry-plan line — noted so a future reader can't mistake it for ratified
doctrine.) Two process slips (the fix briefly treated as verified off a chat
description; the two status reports dropping Card #8's state) did not originate
from master-dev-chat's own assertions — both were master-dev-chat catching
another actor's mid-session framing, same-turn, before either reached the log;
no Topic-2 drift increment per the pre-propagation self-catch exclusion.

**Watch-items (not defects, not actionable now).** Tick-Cap Draw Rate ~28% vs
<1% target; sample size across both dashboards is smoke-test scale (2–3 runs),
not playtest scale. Both re-evaluate at the Trey+3-tester × 5-run playtest.

**Counter: 53 / 19 / 8 / 29 / 43** (catches / rules / patterns / drifts /
open-CFs). Delta from the live tip 53/18/8/29/43 (2026-07-07 § "Catch 52
CLOSED" — header quoted verbatim; the "CLOSED" is non-taxonomic and flagged in
place, not propagated as doctrine nor silently scrubbed: catches log once with
an incremental number and carry no open/close lifecycle — only CFs open and
close): +1 rule (Rule 19); catches / patterns / drifts / open-CFs unchanged. M1
dashboard exit-gate item CLOSED on corrected state; remaining M1 gate is the
Trey+3-tester × 5-run PostHog playtest.

## 2026-07-07 — Catch 52 CLOSED — Vite dev-proxy IPv4 fix (dev telemetry no longer silently dropped at ::1; PR \#29, branch client-dev-proxy-ipv4 off main, branch commit a797655, merge c3ba521)

**Catch 52 (C2, framework-internal / dev-harness defect; caught via
real-gameplay verification, not Codex, not CI).** The client telemetry transport
POSTs the relative path /v1/telemetry/batch; Vite's dev server proxies /v1 to
the Fastify server. The proxy target was `http://localhost:4000`, which on
Node 17+ (default verbatim DNS resolution order) resolves to IPv6 `::1` first —
but the server binds IPv4 `0.0.0.0` only. Every batch hit
`ECONNREFUSED ::1:4000` at the proxy; the client's throw-safe transport
(Catch 21 lineage) swallowed the error, so telemetry was silently dropped in
dev on Windows — zero events reached the server across a full play session (the
same session whose one landed run surfaced Catch 53). Fixed: proxy target →
`http://127.0.0.1:4000` (forces IPv4 to match the server bind) plus an
explanatory comment. Dev-only — production is same-origin with no proxy, so
the real telemetry code is untouched. Rejected alternative: making the server
dual-stack on `::` — the narrower dev-only proxy fix is correct; no reason to
change the server's listen host for a dev-harness quirk.

**Why it matters + how it was caught.** A dev-harness bug that unit tests and
same-origin prod both miss: any tester running `pnpm dev` on Windows would have
silently produced zero telemetry, zeroing the playtest data. Surfaced during
the M1 exit-gate real-gameplay client-emission check — before the fix the Vite
log showed `ECONNREFUSED ::1:4000` every ~30s (one per client flush, buffer
non-empty). After the fix, real-gameplay batches return 204 and land in PostHog
Activity under a real device anonId (8/8 batches, 78 events across
run/round/combat/shop/item/recipe/relic — the same data whose 13x combat_end /
0x combat_start asymmetry surfaced Catch 53). Same catching mechanism as
Catch 53: production reachability is only proven by driving the real path, not
by unit tests or schema/emit-site presence.

**Counter: 53 / 18 / 8 / 29 / 43** (catches / rules / patterns / drifts /
open-CFs) — unchanged from the 2026-07-06 § CF 62 + Catch 53 entry, which
pre-counted Catch 52. Both catches were surfaced by the same real-gameplay
verification this session; the doc-only Catch 53 landed first and its running
total already included this one, so this closing entry carries no delta — it
documents Catch 52's disposition (branch commit a797655, merge c3ba521; Codex
clean on a797655, CI install/lint/typecheck/test/build green).

## 2026-07-06 — CF 62 (OPENED) + Catch 53 — combat_start telemetry dead-emit-path (M2 deferral; surfaced by real-gameplay verification)

**CF 62 (NEW) — combat_start telemetry event never emitted in real client
gameplay.** Client drives combat via applyCombatOutcome (useRun.ts:853), which
emits combat_end + round_end but never combat_start. The event is only emitted
from the sim's startCombat() (state.ts:1032), a path the production client
never calls — confirmed via a full grep of client run code (zero production
hits for startCombat/combat_start). Its one unique field, opponentGhostId, is
null even in the sim-internal path — carries no information until M2 ghost
battles ship, the actual consumer this field exists for. → M2, alongside
ghost-battle wiring. Not an M1 blocker: D1/D2 dashboards only read combat_end,
confirmed clean for their scope (2026-07-05 property audit).

**Catch 53 (NEW — telemetry dead-emit-path defect; caught via real-gameplay
verification, not Codex, not the D1/D2 property audit; descriptive label
only, held for second instance).** combat_start is schema'd, sim-implemented,
and telemetry-plan.md documents it as real — but it silently never fires in
production. Surfaced by the 13x combat_end / 0x combat_start asymmetry during
this session's real-gameplay PostHog Activity check (the same check that
caught Catch 52's dev-proxy bug). The D1/D2 property audit was correctly
"clean" for its scope — it validates schema-to-emit mapping in the abstract,
not production call-path reachability. Distinct catching mechanism worth
naming: emit-site presence in the codebase is not evidence of production
reachability. No new taxonomy class minted — doesn't cleanly fit
A/B/C1/C2/D — held for second instance.

**Counter: 53 / 18 / 8 / 29 / 43** (catches / rules / patterns / drifts /
open-CFs). Delta from the live tip 51/18/8/29/42 (2026-07-06 § telemetry
env-wiring trio CLOSED): +2 catches (Catch 52 — the Vite dev-proxy IPv4 fix,
formalized concurrently via a branch->PR->Codex->merge cycle, its own
closing-log entry to follow; Catch 53 — this entry), +1 open-CF (CF 62).
Rules / patterns / drifts unchanged. Both catches were surfaced by the same
real-gameplay client-emission verification this session; the doc-only Catch 53
lands first, so its running total necessarily accounts for the concurrently-
assigned Catch 52 (a total introducing Catch 53 cannot read 52). Catch 52's
closing entry, when it lands post-merge, leaves the counter unchanged.

## 2026-07-06 — Catch 48 + Catch 49 + Catch 50 + Catch 51 + telemetry env-wiring trio committed (PostHog env-loading; PR \#28, branch telemetry-env-wiring off main, branch commit 2851ad9, merge badab8a)

apps/server had no env-loading layer — POSTHOG_PROJECT_KEY had nowhere to be
read from at boot. Wired via Node's --env-file-if-exists passthrough
(^20.19.0 || >=22.9.0 — see Catch 49 + Catch 50 for how this range was
reached), forwarded by tsx, zero new dependency. Trio: apps/server/package.json
(dev script loads .env + engines.node range), apps/server/.env.example
(committed template), .gitignore (.env stays untracked — the real key lives
only in the local untracked .env; hunk also covers .claude/settings.local.json,
an unrelated pre-existing local-tooling ignore accepted as a trivial ride-along,
not split out). Decoupled from CF 57 (already merged/closed 2c720cf): own
branch, single amended commit 2851ad9.

**Catch 48 (tooling/CLI-arg-order defect; caught at Rule 8 Step 1 inspection;
descriptive label only, not a formalized taxonomy class — none of A/B/C1/C2/D
fit, held for second instance).** Draft dev script read tsx's env flag before
the `watch` subcommand, which tsx requires as its first positional token;
crashed at boot with `ERR_MODULE_NOT_FOUND: ...\apps\server\watch`. Corrected
to `tsx watch --env-file-if-exists=.env src/index.ts` before ever shipping.

**Catch 49 (C2, framework-internal architecture gap; Codex external-review
catch per Rule 4).** Commit message + first log draft asserted "Node 20.6+"
for --env-file-if-exists — wrong; v20.6.0 added only throw-on-missing
--env-file, the if-exists variant landed in v22.9.0 and was backported to
v20.19.0 (nodejs/node PR 53060). Root package.json declares >=18.18.0,
.nvmrc pins major 20 only — neither enforced the real floor. CI unaffected
(no CI step invokes the dev script carrying the flag). Fixed: engines.node
pinned on apps/server/package.json only (root untouched, intentionally broad).
First instance of "asserted a tool's version-compatibility claim without
checking the authoritative changelog" — held for second instance.

**Catch 50 (NEW — C2, Codex external-review catch per Rule 4; related to but
distinct from Catch 49, not its second instance).** Catch 49's fix
(>=20.19.0) corrected the floor fact but not the range: Node 21.x
(odd-numbered, never LTS, EOL'd mid-2024 — before the backport existed) and
22.0.0-22.8.x (predate the flag's introduction on the 22.x line) both satisfy
>=20.19.0 while lacking the flag entirely. Corrected to the disjunctive
^20.19.0 || >=22.9.0 ([20.19.0, 21.0.0) ∪ [22.9.0, ∞) — excludes the
flagless gap exactly). Distinct failure shape from Catch 49: 49 was a wrong
fact from not checking the changelog; this is a correctly-sourced fact encoded
into an incomplete range. Held for its own second instance before codifying a
range-completeness rule — not conflated with Catch 49's verify-before-asserting
antidote, which addresses a different mechanism. 2nd Codex finding this PR,
well under the 4-finding ceiling.

**Catch 51 (NEW — master-dev pre-merge/pre-append review catch; Rule 10
Category 4 application, broadened scope).** Proposed --no-ff merge commit
(title + body) used a bare `(#28)` and a bare `Closes #28` — identical
failure shape already caught once as Drift 25 (2026-05-23 § M1.5c PR 2
CLOSED: master-dev's #N-in-merge-message exception, corrected to branch-style
then). Caught at master-dev pre-merge ratification before the hard-to-reverse
merge landed. Corrected to branch-style: title references the branch
(telemetry-env-wiring), not `(#28)`; `Closes #28` dropped entirely —
unnecessary as well as rule-violating, since GitHub auto-detects the merge
from pushed commit history and closes the PR without the keyword, as already
observed on every prior PR in this project (PR \#21, \#22, \#23, \#27). The
same pre-append review sweep caught the identical defect leaking into this
decision-log draft itself, in three more places: the entry title's bare
`PR #28`, Catch 49's cross-repo reference (ambiguous within this repo's
autolink scope — rephrased from `Node PR #53060` to `nodejs/node PR 53060`),
and this paragraph's own first-draft quoting of the offending merge-message
text (now code-spanned rather than left as live bare references). Ten bare-#N
instances total found and corrected across the merge message and this entry
before either landed.

**Rule 10 Category 4 broadened again (uncounted — fold-in, not a new rule).**
Previously scoped to "PR bodies," then to "PR bodies and merge commit
messages" mid-sweep. The same review pass found the identical defect in
decision-log.md prose too — broadened one more step: Category 4 now reads
"bare-#N auto-link scan in PR bodies, merge commit messages, and
decision-log.md entries — check before every append, not just before every
PR/merge."

**Scope.** Server-side env-loading + flag-order + runtime-floor range only.
Client-emission leg (browser instrumentation, buffer/flush timing) unconfirmed
— next exit-gate step, not this commit. No CF closed or opened — env-loading
was untracked infra discovered during the M1 exit-gate PostHog build.

**Counter: 51 / 18 / 8 / 29 / 42** (catches / rules / patterns / drifts /
open-CFs). Delta from the live tip 47/18/8/29/42 (2026-07-06 § CF 57 CLOSED):
+4 catches (48, 49, 50, 51 — the bare-#N cleanup folds into 51, not a fifth
catch, since it's the same review pass catching the same defect class in more
places, not a new discovery). Rules unchanged — Rule 4 + Rule 8 applied,
Rule 10 Category 4 broadened twice this entry (amended, not newly coined).
Patterns / drifts / open-CFs unchanged.

## 2026-07-06 — CF 57 CLOSED — Item-info popover, merge 2c720cf (PR 27, main a7d1ce5 → 2c720cf)

Description text derived structurally from each Item's triggers/effects/passiveStats at render time (Option B) — zero schema changes, zero hand-authored copy, git diff on content-schemas.ts/packages/content/** confirmed empty at merge.

Five mechanics correctly omitted as sim no-ops rather than described as designed: trigger_chance_pct, summon_temp_item, add_gold, goldPerRound, bonusBaseDamage. Two of these (add_gold, goldPerRound) were caught only via external Codex review after Step-0 incorrectly trusted a schema/code comment over a verified runtime consumer — same gap, twice, on one PR (Rule 5 territory: content-side evidence over inference, reinforced not re-codified).

9 Codex review rounds surfaced a converging root cause: the item-trigger element carried three orthogonal roles (dnd drag node, popover trigger, affordability-state carrier), producing a combinatorial parade of findings at each pairwise intersection rather than a fixed bug count. Resolved via structural decomposition (separate drag-only outer element + labeled inner popover-trigger button) rather than continued reactive patching — 4 of the round's findings became structurally impossible by construction, not merely re-tested-and-passing.

Rule 18 codified this session: any claim that a pass/audit is "comprehensive," "locked," or "final" must enumerate the specific axes it checked; unlisted axes are unchecked, not assumed clean. Triggered by three instances on this one PR (master-dev's file-list enumeration vs. actual git status; the add_gold/goldPerRound comment-trusted-over-verified-consumer repeat; the 2.5g meta-audit's "locked, no further findings possible" claim that covered only effect-consumers and missed a11y-naming + busy-gating entirely).

Candidate Pattern, not yet ratified (holding for a second instance per standing convention): an interactive element accumulating 3+ orthogonal responsibilities predicts combinatorial review findings, not a fixed bug count.

Opens: CF 58, CF 59, CF 60, CF 61 (below). Closes: CF 57.

**Counter: 47 / 18 / 8 / 29 / 42** (catches / rules / patterns / drifts / open-CFs). Delta from the live tip 45 / 17 / 8 / 28 / 38 (2026-07-05 § Catch 45): +2 catches (Catch 46 — describeItem shipped Lucky Penny's add_gold as an ungranted "+2 gold"; Catch 47 — same for goldPerRound on Copper Coin / Coin Pouch / Treasure Sack; both miscoded, shipped, caught by Codex review), +1 rule (Rule 18), +1 drift (Drift 29 — master-dev's CF 57 input file-list omitted the three call-site opt-ins; caught pre-staging, nothing miscoded → drift-not-catch per the Drift 28 precedent). Two corrections applied to the drafted delta: (1) open-CFs is **+4 → 42**, NOT the drafted −1+4 → 41 — CF 57 was never in the live open count (grep-confirmed absent from decision-log.md; the 38 predates its assignment), so its close is counter-neutral; (2) the file-list gap is Drift 29, not the drafted third catch. Patterns unchanged — the 3-orthogonal-responsibilities shape is logged as a candidate, held for a second instance.

The four CFs opened by this close:

**CF 58 (OPENED)** — trigger_chance_pct's chance-roll mechanism deferred at M1.2.3a to M1.2.5; M1.2.5 closed without implementing it. Rune Pedestal / Master Alchemist's Kit's proc-buff remains a hard sim no-op.

**CF 59 (OPENED)** — M1.2.4's item-driven gold-credit system never wired to any consumer. Affects add_gold (Lucky Penny) and goldPerRound (Copper Coin, Coin Pouch, Treasure Sack) — one root cause, two mechanisms, 4 of 45 items functionally inert in shipped combat. Real M1 playtest implication: expect and accept low D2 pick-rate on these four until this ships — that's correct signal, not noise.

**CF 60 (OPENED)** — No visual signal exists for generic adjacency-trigger participation (on_adjacent_trigger). Confirmed universal and structural via combat.ts:542-543 — every top-level trigger fires adjacent reactions regardless of whether its own effects are real or omitted. Only formal named recipes get a visible cue (the glow); this class of item interaction is invisible board-wide.

**CF 61 (OPENED)** — No keyboard-operable drag-and-drop exists anywhere in the bag system — PointerSensor/TouchSensor configured, no KeyboardSensor. Pre-existing, app-wide, predates CF 57; surfaced when CF 57's structural split correctly removed ARIA (aria-roledescription/aria-describedby) that had been falsely describing a keyboard-drag capability that never worked. Real WCAG 2.1.1 gap, correctly out of M1 scope, flagged for M2's accessibility pass.

## 2026-07-05 — Catch 45 (Class D — co-drift): telemetry-plan.md D2 "Boss win rate" spec referenced a non-existent CombatOutcome value

Pre-dashboard property audit (commissioned before manual D1/D2 PostHog build) found telemetry-plan.md § 6 D2's "Boss win rate" card specified as `outcome=won` filtering `combat_end`, but combat_end.outcome is typed CombatOutcome ('player_win' | 'ghost_win' | 'draw', content-schemas.ts:692) — 'won' only exists on RunOutcome (run_end's outcome field, content-schemas.ts:526). Built literally, the card would silently return 0%/empty — no error, indistinguishable from a genuinely low boss win rate. Emit site and schema are both correct; only the dashboard-spec literal was wrong. Same non-propagating-co-authored-surface shape as Class D (Catch 11): the dashboard spec and the CombatOutcome enum drifted apart, neither propagated to the other. Caught by Claude Code's commissioned audit before any PostHog dashboard was built on the wrong filter. Fixed same commit: `outcome=won` → `outcome=player_win`.

Adjacent doc-completeness gap (uncounted, non-blocking): § 3's combat_end event catalog omitted `round` from its enumerated properties despite it being emitted (state.ts:959) and required by D2's `round==11` boss-card filter. Property ships fine; catalog was just incomplete. Fixed same commit.

D1 confirmed fully clear — no property gaps, safe to build now. D2 clear on every other card; boss win rate now correct post-fix.

Counter: 45 / 17 / 8 / 28 / 38. Delta: +1 catch (Catch 45, Class D).

## 2026-07-05 — Drift 28 (master-dev, git-log-grounding-caught): trailer-status claim corrected before commit

Master-dev's prior instruction asserted no branch-hygiene convention requires a Co-Authored-By trailer on docs commits, claiming bbc9505/8249b3a/d04a8ed/9e1a3e9 were "all confirmed trailer-free." Git log contradicts this: bbc9505 and 285e7c3 (merge commits) are trailer-free; 9e1a3e9, 8249b3a, d04a8ed, and 47c2ea2 (docs/fix commits) all carry the trailer. The claim generalized a single verified data point (bbc9505's merge-commit status) onto two commits with no reported trailer data at all. Caught by Claude Code's git-log check before any commit landed — same shape as Drift 27 (master-dev proposal contradicting canon, caught at the grounding gate pre-landing). Convention retained going forward: non-merge commits carry the trailer, merges don't. This commit follows it.

Counter: 44 / 17 / 8 / 28 / 38. Delta: drifts 27 → 28. No catch — nothing was miscoded; the error was master-dev's own unverified claim, caught pre-landing.

## 2026-07-05 — telemetry-plan.md § 4 Goal 1 amended: median run length split into two D1 metrics

"Median run length" was ambiguous between roadmap.md's M1 exit-gate criterion (wall-clock, 12–20 min) and telemetry-plan.md's existing lethality diagnostic (rounds reached, 8–11 rounds). Split into two distinct D1 cards: wall-clock minutes is the M1 exit-gate number; rounds reached remains a balance/boss-calibration diagnostic, not a session-length proxy. Both derive from data already shipping (run_start/run_end + tsClient, CF 35/CF 49) — no new telemetry, no code. Docs-only.

## 2026-07-05 — CF 43 CLOSED (bornFromRecipe persisted across save/restore; standalone backlog item, Catch 44 + Rule 17 codified)

CF 43 (standalone-OPEN since M1.5e milestone-close, decision-log.md 2026-07-05 § M1.5e MILESTONE CLOSED) closed via PR #26, merge commit `bbc9505`, branch cf43-bornfromrecipe-persistence off main 8249b3a. Single commit 47c2ea2 (9 files, +161/−15) + this docs-close.

**What shipped.** New getRecipeBornPlacementIds(): ReadonlyArray<PlacementId> on RunController (mirrors getRngState()). Optional bornFromRecipe?: readonly PlacementId[] added to SerializedRunState + Zod schema (content-schemas.ts + byte-synced packages/content/src/schemas.ts). restoreRun materializes restoreFrom.bornFromRecipe ?? [] at the consumption site. Save-site wiring at useRun.ts. Both stale "PR 2 deferred" gap comments refreshed (state.ts:280-286, content-schemas.ts + mirror). 4 new tests (2 sim: restoreRun.test.ts membership round-trip + backward-compat tolerance; 2 client: persistence.test.ts positive round-trip + backward-compat non-discard).

**Step 0 deviations from initial plan (both ratified pre-implementation):**
- **Getter required.** Original plan assumed direct [...this.bornFromRecipe] at the save site; bornFromRecipe is sim-private and the save site is client-side (useRun.ts). Resolved with the getter above.
- **Permissive over required.** rngState/rerollCount/trophy precedent uses required Zod fields (missing → hard-reject, in-progress run discarded). Mirroring that for bornFromRecipe would newly discard every pre-fix save, which today loads fine and only loses the recipe bonus — strictly more destructive, violates additive-only. Resolved: optional field, default materialized at consumption, not at the schema boundary.

**Catch 44 (NEW, Class C2 — framework-internal architecture gap).** Implementation surfaced a second deviation beyond Step 0's two: the load boundary (validateLocalSaveV1/loadLocal) validates via safeParse(x).success as a boolean type-guard and returns the original raw object, not Zod's transformed .data. Any field's .default()/.transform() is computed and discarded at this boundary — schema-level defaults are inert here. Caught by the sim round-trip test throwing on for...of undefined when the originally-planned .default([]) shipped without a consumption-site fallback. Shipped fix: .optional() at the schema (not .default([])), ?? [] materialized in restoreRun at the point of use. Catches 43 → 44.

**Rule 17 (NEW) — Zod-boundary transform materialization.** Any schema field consumed through a validate-as-typeguard boundary (a safeParse(x).success check whose caller reuses the original raw object, not .data) must have its default/transform explicitly materialized at the point of consumption, not relied upon at the schema level. Applies to CF 45 (slot-uid preservation) and CF 46 (forward-version save handling) — both cross this same boundary. Rules 16 → 17.

**CF disposition.** CF 43 CLOSED. No client-combat threading (CombatOverlay.tsx:118-119 recipe-bonus omission remains a separate, still-open, lower-priority follow-on — not reopened, not renumbered, tracked informally, no CF assigned pending future prioritization). No CF 36/37/56 work touched.

**Verification.** pnpm turbo lint test build --force: 19/19 tasks, schema-sync gate green. Test counts: content 30, ui-kit 27, server 67, sim 509+1 skipped, client 461+15 skipped (+4 vs pre-CF43: 2 sim, 2 client). Fixture corpora (6 .json scenario, 224 .jsonl determinism) untouched — field lands on SerializedRunState only, not RunState/getState(). Codex round 1: clean, no findings.

**Counter: 44 / 17 / 8 / 27 / 38** (catches / rules / patterns / drifts / open-CFs). Delta from pre-close (43/16/8/27/39): +1 catch (Catch 44, C2), +1 rule (Rule 17), open-CFs −1 (CF 43 closed). Patterns / drifts unchanged.

## 2026-07-05 — M1.5e MILESTONE CLOSED

CF 34 (gold/rerollCount/bag/shop/trophy sim-authority migration) was M1.5e's sole mandate, closed at merge commit 285e7c3 (§ "M1.5e PR 1 CLOSED" above). No PR 2 opened under M1.5e — CF 36 (separable, deferred), CF 37 (amended, remainder parked), CF 43 (standalone follow-up), and CF 56 (new, own future Phase 1) all resolved to independent backlog status rather than M1.5e scope. M1.5e is CLOSED.

## 2026-07-05 — M1.5e PR 1 CLOSED — CF 34 sim-authority migration (gold/rerollCount/bag/shop/trophy)

Sim is now sole writer for gold, rerollCount, bag, shop-state, and trophy, across both live mutation and restore. Merged --no-ff at merge commit `285e7c3`; branch m1.5e-pr1-authority-flip deleted local + remote. Codex: 2 rounds, round 1 found 2 findings (both P1/P2, both fixed), round 2 clean (0 findings) — well under the 4-finding ceiling, ordinary reactive cycle.

**Dispositions ratified this milestone:**
- **B1 (cost correction).** Sim's ruleset-aware effectiveItemCost/sellValueOf replaces client flat math. Price-shown == price-charged verified live with an itemCostDelta relic held (Merchant's Mark, -1).
- **B2 (shop RNG divergence).** Shop generation stays client-side (shopSeedFor); shop STATE moved to sim via overrideShopSlots (stopgap — rerollShop/makeShop still consume the live rng cursor for 224-fixture stability, output discarded). CF 56 opened to track the real generation-RNG-basis reconciliation as its own future Phase 1.
- **Persistence boundary.** trophiesAtStart stub, SerializedRunState, validate.ts, and the save composer stayed untouched through PR 1 proper — held for a dedicated follow-up (see CF 43 below).
- **Bag uid scheme.** BagItem.uid = sim placementId. Sim is sole identity minter, no client-side generation, no mapping layer.
- **CF 37 — amended, not closed.** Registry threaded sim-side (r-iron-shield leak fixed), combine execution moved sim-side. Client detectRecipes/scoutRecipes kept as read-only UI helpers reading the same iconned registry sim now uses — can no longer diverge from sim's combine decisions, so the live-bug risk CF 37 existed to close is gone. Full retirement needs a recipe-UI reshape; deferred, no urgency.

**Codex round 1 forced a scope amendment.** Finding 1 (P1, RunController.ts:166): restoreRun left sim's bag empty while applySimSnapshot had just become authoritative for every sync (reroll/buy/sell/combine) — meaning any restored run that took any action would silently lose its entire bag. This was B-F3 + E-F9, originally deferred to a second PR under the ratified 2-PR split. The split's own Phase 1 investigation had explicitly flagged these gaps as "harmless today because the client never calls sim's mutation methods" — a conditional statement whose condition PR 1 was built to remove. Master-dev ratified the split without checking whether the interim state (PR 1 merged, PR 2 not yet) was itself safe to actually use. It wasn't. Pulled B-F3 + E-F9 forward into PR 1 to close the gap; verified live (bag survives restore → reroll, pre-fix it didn't).

**Watch (mechanism callout, not codified — first instance).** Ratifying a multi-PR split on a shared-authority migration without verifying the *interim* state between merges is non-regressive is a distinct failure shape from this project's existing disposition-drift-watch (which is about restating stale text). Named here for a second-instance check: before ratifying any future N-PR split on a single CF, explicitly ask "is the state after PR 1 alone, before PR N lands, safe for the primary real-world use case?" — not just "is each PR's own scope internally coherent." Log + watch; codify on second instance per standing convention.

Finding 2 (P2, useRun.ts:499): combineRecipe ignored the specific match's placement ids the UI passed, letting sim consume whichever candidate it detected first if multiple matches were ready — could remove different items than what the player clicked. Fixed: combineRecipe(recipeId, inputPlacementIds?) — additive, backward compatible; onCombine threads the selected match's exact uids. Client-wiring test added (mocks the sim boundary, asserts onCombine forwards the right uids) — closes the coverage gap the sim-only regression test left open, same "sim correctness ≠ client correctness" shape as B1.

**CF 34 CLOSED.** All five fields are sim-sole-authoritative across live mutation and restore. The original PR 2 scope (B-F3 + E-F9) is now fully absorbed into PR 1 — CF 34 has no remaining work.

**CF 43 remains OPEN, now standalone** — no longer tied to CF 34's closure. Once sim's bag is genuinely restore-populated (post this PR), a recipe-born placement (Tinker passive, Pocket Forge, Catalyst, Worldforge Seed) surviving restore silently loses its recipeBonusPct — bornFromRecipe isn't serialized. Bag contents themselves are correct; this is a stat-under-application gap, not data loss. Small, additive schema fix (bornFromRecipe: PlacementId[] on SerializedRunState). Graybox-acceptable in the same sense CF 38 was — narrow blast radius, already fully specified.

**Test counts / verification:** Client suite 459 passed / 15 skipped across 33 files (incl. priceParity.test.ts + the onCombine client-wiring test); sim suite 507 passed / 1 skipped across 16 files (incl. the B-F3/E-F9 restore-hydration test + the explicit-ids combineRecipe test); server 67, content 30, ui-kit 27. Full-workspace `turbo lint typecheck test --force` gate green at 23/23 tasks, N=3 cold during PR work; suite re-run green at this close (10/10 turbo test tasks, exit 0). 224 `.jsonl` determinism corpus byte-stable — determinism harness 231/231 each run.

Counter: 43 / 16 / 8 / 27 / 39 (catches / rules / patterns / drifts / open-CFs). Delta from pre-close (43/16/8/27/40): open-CFs −1 (CF 34 closed). No catch/rule/pattern/drift — both Codex findings were ordinary implementation bugs in this PR's own new code, not master-dev process failures; the interim-state-safety gap is logged as an uncounted watch per the first-instance convention.

## 2026-07-05 — M1.5e PR 1 CLOSED (client authority flip — sim sole writer for gold/rerollCount/bag/shop/trophy; CF 37 registry threaded; CF 56 opened)

The live-mutation authority flip landed on branch `m1.5e-pr1-authority-flip`. Sim is now the sole writer of gold / rerollCount / bag / shop-state / trophy (Q2 Amendment A unwound). Client buy/sell/reroll/place/move/combine dispatch sim actions (`buyItem`+`placeItem` / `sellItem` / `rerollShop` / `moveItem` / `combineRecipe`); `applySimSnapshot` derives bag/shop/gold/rerollCount/trophy from the sim snapshot (`init_from_sim` + `sync_from_sim` collapsed to one path); the `drop_bag`/`sell_drop`/`reroll`/`combine` reducer arms + `placeCombineOutput` + the α (client reroll try/catch + gold gate) and β (combat-done gold-capture-delta) dispositions are deleted. `combat_done` reduced to a UI-only overlay-lower.

**Foundation (committed earlier this branch):** sim `RunState` gained `rerollCount` (projection of `shop.rerollsThisRound`) + real `trophy` accumulation (+18/win in `applyCombatOutcome`, restore-mirror parallel to gold); `trophiesAtStart:0` stub retained (removal is PR 2). Schema mirrors byte-identical; 6 `.json` scenario fixtures re-baselined (trophy=18×wins); 224 `.jsonl` determinism corpus byte-stable.

**Ratified dispositions recorded (this session's amendments to the 2026-07-04 § "M1.5e Phase 1 RATIFIED" scope):**
- **B1 — cost correction landed.** Sim's ruleset-aware `effectiveItemCost`/`sellValueOf` replaces the client's flat raw-cost math. Client `ShopSlot` now carries `cost` = `effectiveItemCost` (computed once in `simShopToClientShop`), so displayed price == charged price. Regression-locked by `priceParity.test.ts` (Merchant's Mark `itemCostDelta:-1`: a drive of `sim.buyItem` asserts the gold delta equals the displayed cost and is 1g below raw) — the bug class unit tests structurally miss otherwise.
- **B2 Option 1 — shop generation stays client-side; shop state migrates.** `rerollShop`/`makeShop` still run + consume `this.rng` exactly as before (output discarded — required for 224-fixture byte-stability); the client then calls the net-new `RunController.overrideShopSlots(slots)` (arranging-only, no rng) with its `shopSeedFor` items after each `createRun`/`rerollShop`/`advancePhase`. `overrideShopSlots` carries a STOPGAP comment pointing at the follow-on CF below.
- **Persistence boundary — minimal-touch.** `trophiesAtStart` stub, `SerializedRunState`, `validate.ts`, and the save composer are UNTOUCHED (PR 2). `restore_from_save` keeps sourcing bag from the persisted snapshot `s` (sim bag still force-emptied on restore, B-F3 unresolved) while shop/gold/rerollCount/trophy come from the controller snapshot (which mirrors `s` in production). Trophy restore-mirror (one line, parallel to the existing gold mirror) added to avoid a trophy-loss-on-restore regression — a value mirror, not the structural B-F3/E-F9 work.
- **Bag uid — sim sole identity minter.** `BagItem.uid = String(placementId)` throughout; no client uid generation, no uid↔placementId map (`simBagToClientBag`).

**CF 37 — divergence resolved, full retirement deferred (AMENDED, not closed).** The iconned recipe registry is threaded into `createRun`/`restoreRun` via the existing `recipesRegistry?` hatch (new `ICONNED_RECIPES` content-typed export), so sim's combine detection now matches the client's iconned set — the r-iron-shield leak can no longer fire. Combine EXECUTION is sim-authoritative (`sim.combineRecipe`). **Residual:** the client `detectRecipes`/`scoutRecipes` are NOT retired — sim exposes `detectRecipes` but NO `scoutRecipes` equivalent, and retiring the client detectors would require reshaping the recipe UI (out of scope: "no UI redesign"). They remain as now-aligned read-only UI-hint helpers (no authority; combine executes sim-side). Full retirement + a sim `scoutRecipes` API is a clean follow-on. `placeCombineOutput` IS deleted.

**CF 56 OPENED (NEW) — shop-generation RNG-basis reconciliation.** The client generates shops from a deterministic `shopSeedFor(seed, round, rerollCount)` (combat-independent); sim's own `rerollShop`/`makeShop` consume the live `this.rng` cursor — different schemes yield different shop contents. B2 Option 1's `overrideShopSlots` is the STOPGAP that keeps production shops on `shopSeedFor` while shop STATE migrates to sim. CF 56 tracks the real reconciliation (cursor-coupled vs round+reroll-keyed generation): its own Phase 1 investigation, NOT folded into M1.5e PR 2. Number walked from canon (highest prior CF was CF 55 at 2026-07-03 § "M1.5d PR 2 CLOSED"). Origin: the `overrideShopSlots` STOPGAP comment (`packages/sim/src/run/state.ts`).

**Incidental robustness (same-branch).** `simShopToClientShop` degrades to `cost:0` for an item not in the current shop pool (only reachable on a cross-version restore with a dropped item) rather than crashing on the undefined cost lookup — surfaced by a restore-test fixture, fixed inline.

**Gate.** Full-workspace `pnpm turbo lint typecheck test --force` green — **23/23 tasks, N=3 cold runs**. **224 `.jsonl` determinism fixtures byte-stable** (harness 231 tests pass each run). Client suite 33 files (incl. the new `priceParity.test.ts`); reducer tests for the deleted arms retired, restore/sync/α tests rewritten to the sim-authoritative partition.

**Visual playtest (required this PR, completed).** Drove the live app via CDP: Tinker + Merchant's Mark → run screen. **B1 confirmed visually** — Iron Sword shows 2g (raw 3 − 1 relic = the effective price sim charges). **Buy** (drag shop→bag): gold 4→2 (charged the effective 2g), item placed in bag ("1 ITEM PLACED"), bought slot shows SOLD. **Reroll**: gold →(−1), shop regenerated (overrideShopSlots), R0→R1, reroll cost 1g→2g. **Full combat round**: Continue→combat→resolution (DEFEAT, hearts 2/3, gold/trophy +0 — sim `applyCombatOutcome` on a loss). Bag visible throughout; rarity legible without hover. Sell/combine were not separately drag-driven headlessly (dnd-kit + CDP) but follow the identical proven sim-routing pattern (buy) and are unit-test-covered.

**Out of scope / untouched (per ratification):** `enterCombatPhase`/`onContinue` (CF 36, separable); restore logic / B-F3 / E-F9 / `bornFromRecipe` serialization / `SerializedRunState` schema / `validate.ts` / save composer (PR 2); the shop-generation RNG basis itself (CF 56).

**Counter: 43 / 16 / 8 / 27 / 40** (catches / rules / patterns / drifts / open-CFs). Delta from the 2026-07-04 Phase-1-ratification line (43/16/8/27/39): open-CFs **+1** (CF 56 opened); no catch / rule / pattern / drift (feature work). CF 34 stays OPEN (milestone — PR 2 completes the restore/persistence half); CF 37 AMENDED (divergence resolved, retirement residual); CF 43 restore-half is PR 2.

**Merge:** pending master-dev review — branch `m1.5e-pr1-authority-flip` ready to merge `--no-ff` to main; merge SHA + PR number to be recorded on merge. Codex review not yet run.

## 2026-07-04 — M1.5e Phase 1 RATIFIED (CF 34 sim-authority migration: gold/rerollCount/bag/shop/trophy)

Read-only investigation (8-reader + 6-adversarial-verifier pass, 0 refutations) ratified in full. Dispositions:

**Trophy — IN (5-field CF 34 closure).** Corrects the mislabel at Catch 42. Trophy migrates alongside gold/rerollCount/bag/shop; sim must ADD real trophy-accumulation logic (currently a dead trophiesAtStart: 0 stub, state.ts:438) rather than extend existing tracking.

**CF 36 (enterCombatPhase consolidation) — OUT, separable.** Single call site (useRun.ts:430), zero data-authority coupling to the migration surfaces. Opportunistic client-refactor cleanup only, no critical-path dependency. Corrects Catch 43's "multiple call sites" premise.

**CF 37 (recipesRegistry sim-default vs client-filter) — IN, rides PR 1.** Combine detection moves sim-side with the bag by necessity. Concrete live-bug evidence: sim's unfiltered default registry would newly match r-iron-shield (wooden-shield ×2 → un-iconned iron-shield, recipes.ts:43) once client-side detectRecipes is retired. Fix: thread the client's iconned-filtered recipe list into createRun/restoreRun via the existing recipesRegistry? hatch (state.ts:128), symmetric with the already-threaded itemsRegistry. Retire client detectRecipes/scoutRecipes/placeCombineOutput once threaded.

**CF 43 (bornFromRecipe restore) — IN (restore-persistence half), rides PR 2.** Content-grep confirms 4 live sources exercise recipeBonusPct today (Tinker class passive classes.ts:15, Pocket Forge relics.ts:41, Catalyst relics.ts:62, Worldforge Seed relics.ts:69) — one more than the original CF 43 entry named (omitted Worldforge Seed; corrected in place, clerical, disposition unchanged). Currently a total no-op; CF 34 changes that — once sim's bag restores real placements, a recipe-born item can survive restore while silently losing its bonus. Fix: additive bornFromRecipe: PlacementId[] on SerializedRunState. Full client-combat-threading closure remains an optional follow-on beyond M1.5e.

**sellItem coupling — re-confirmed, unchanged.** Gold+bag remain atomically coupled on both sim (state.ts:508-532) and client (RunController.ts:355-374) sides. Gold-first stays refuted.

**Restore/persistence lifetime walk — 3 gaps, all mid-run-restore-only, all harmless today (client never drives sim mutation methods):** B-F3 (sim restore forces bag placements: [] instead of reading restoreFrom.bag.placements, state.ts:327-330); E-F9 (nextPlacementCounter never serialized/re-derived, uid-collision risk post-restore); CF 43 (above). Save shape itself round-trips gold/rerollCount/bag/shop correctly — all three gaps are restore-logic bugs, not schema gaps.

**PR split, sized from findings:**
- **PR 1 — live-mutation authority flip (+ trophy, + CF 37).** Route buy/sell/reroll/place/move/rotate/combine through sim actions; extend applySimSnapshot/sync_from_sim to consume sim gold/bag/shop/trophy; add rerollCount + real trophy-accumulation to sim RunState; thread iconned recipesRegistry; delete client parallel reducer arms + α/β dispositions. Bisect seam if Codex flags size: CF 37 as PR 1b.
- **PR 2 — restore/persistence authority.** B-F3 + E-F9 + CF 43 schema add. Additive schema bump → 6 .json scenario-corpus re-baseline; 224 .jsonl determinism corpus unaffected.
- **CF 36** rides along only if PR 1 independently touches the useRun sim-dispatch callback family; otherwise deferred indefinitely.

Clerical corrections (in place, no new entries): CF 37's stale path citation (apps/client/src/content.ts:L79-87 → apps/client/src/run/content.ts:79, post-M1.3.4a move); CF 37's state.ts:257 recipesRegistry-default citation; CF 43's content list (add Worldforge Seed relics.ts:69).

Counter: **43 / 16 / 8 / 27 / 39**. Delta from post-Catch-41 baseline (41/15/8/27/39): catches +2, rules +1. Open-CFs unchanged — scope ratified, nothing closed until PR merge.

## 2026-07-04 — Rule 16 LANDED (disposition-text propagation — second instance of the M1.5a disposition-drift watch)

Catch 42's trophy mislabel is the second instance of the mechanism first logged as watched-not-codified at decision-log.md 2026-05-15 § "M1.5a PR 2 closed" § "Disposition-drift watch" ("log + watch; codify as Rule 10 category 6 or new rule on second instance"). Codifying per that standing instruction.

> **Rule 16 — disposition-text propagation.** Any prompt or entry restating an authority/scope disposition from an earlier milestone must cite the most recent Locked Answer or ratification on that surface, not the original pre-correction entry. A CF's carry-forward shorthand (e.g., a field list) must be checked against the CF's original full definition before being repeated — shorthand erosion that silently drops a field is the same failure shape as an outright authority flip.

Rules 15 → 16.

## 2026-07-04 — Catch 43 CONFIRMED (assert-from-prose — CF 36 "multiple call sites" premise false)

The M1.5e Phase 1 prompt repeated CF 36's canonical decision-log description verbatim ("multiple call sites in useRun.ts") without re-deriving it from shipped code per Rule 6. False: simRun.enterCombatPhase() has exactly one client call site (useRun.ts:430, inside the single onContinue handler at :425-432); git log -S 'enterCombatPhase' -- useRun.ts shows one introducing commit (f6ccd5b, M1.5a Phase 2b-2) — 0→1, never multiplied. The original CF 36 entry conflated this single call site with three other sim-dispatch call sites the same commit introduced together. This is the CF 36 entry's own long-standing inaccuracy, carried into the M1.5e prompt unverified. Caught by Claude Code's Step 0 re-derivation — same mechanism as Catch 42, distinct surface.

Catches 42 → 43.

## 2026-07-04 — Catch 42 CONFIRMED (assert-from-prose — trophy authority mislabeled sim-owned in M1.5e Phase 1 prompt)

The M1.5e Phase 1 prompt's Context stated "sim currently owns ... trophy," scoping CF 34 to 4 fields. False on two counts: (1) trophy is client-authoritative — RunController.ts:437-438/:456, schemas.ts:741-742/:763 (SerializedRunState-only field; sim has only a dead trophiesAtStart: 0 stub at state.ts:438 that applySimSnapshot never copies); (2) this exact mislabel already happened once and was corrected — decision-log.md 2026-05-15 § "M1.5a PR 2 closed" Locked Answer 32 settled trophy client-owned, and that entry's "Disposition-drift watch" names the original 2026-05-13 Q2 Amendment A wording as the error's source. CF 34's own opening definition has always scoped trophy in. Master-dev cited the pre-correction wording instead of LA 32 when authoring the M1.5e Context, three milestones later. Caught by Claude Code's Step 0 re-derivation, independently flagged by all 8 mapper agents — 0 refutations.

Catches 41 → 42.

## 2026-07-04 — Catch 41 CONFIRMED (assert-from-prose — false in-section MITM cross-reference)

The M1.5e housekeeping prompt's Step 3 instructed documenting the schannel TLS revocation-check quirk as "plausibly the same corporate MITM proxy already noted in this section [tech-architecture.md § 8] for npm installs." § 8 contains no such note — the corporate-cert TLS precedent (--config.strict-ssl=false workaround) is documented in decision-log.md's 5b.3a Phase 2.5j entries, not § 8. Same assert-from-prose shape as Catch 37/39/40 — an unverified claim about canonical document content, this time authored by master-dev in a prompt rather than carried from a prior instance. Caught by Claude Code's Step 3 grep before any text was written to a canonical file, validating Rule 8's halt-and-surface authority on a plumbing-only-framed prompt. The underlying MITM-proxy hypothesis is real and retained, correctly cited to decision-log.md rather than invented as an in-section § 8 claim.

Lands against the current running counter (post-Catch-40: 40/15/8/27/39): catches 40 → 41.

## 2026-07-04 — Catch 40 CONFIRMED (assert-from-prose — false M1.5e Phase 1/2 ratification claim)

M1.5e opened with prior-instance-carried context asserting a completed CF 34 Phase 1 + Phase 2 ratification that does not exist anywhere in canon. Same shape as Catch 37 (CF 53 trigger-size) and Catch 39 (M1.5d restart coverage claim) — a claim about canonical state made without grounding, caught before it reached a prompt. Confirmed by direct grep + an independent refutation-attempt pass against the full decision-log.md: "M1.5e" occurs exactly twice (2026-07-03 forward-pointer, 2026-05-26 spin-out header), neither a ratification; zero M1.5e PRs exist in the log; no Phase 1 or Phase 2 ratification for CF 34/M1.5e exists anywhere in canon. Refutation attempt failed — absence confirmed.

Lands against the pre-CF-55-close baseline: catches 39 → 40. Independent of CF 55's own close (open-CFs 40 → 39, dc4ade1). Combined running counter: 40 / 15 / 8 / 27 / 39.

## 2026-07-04 — GitHub API reachability note corrected (schannel TLS revocation-check quirk, not a sandbox network block)

The standing note that "the sandbox blocks outbound HTTPS to api.github.com" is corrected. Isolated probe (`curl -sS -o /dev/null -w '%{http_code}' https://api.github.com`) returns curl exit 35 (CURLE_SSL_CONNECT_ERROR) / http_code 000 — traced to Windows schannel failing a CRL/OCSP revocation check during the TLS handshake, not a blocked connection. `curl --ssl-no-revoke` to the same URL returns 200, confirming DNS/socket/trust-chain are fine and isolating the fault to revocation checking specifically — plausibly the same corporate MITM TLS proxy already documented for npm installs. Existing git-based push/PR/Codex-comment operations are unaffected by this (not independently isolated this pass) and continue via the established git-credential-token path. PR workflow (browser-link + manual paste, no `gh` automation) is UNCHANGED — this correction is diagnostic only, not authorization for Claude Code to self-serve merge/CI steps.

## 2026-07-03 — M1.5d PR 2 CLOSED + **M1.5d MILESTONE CLOSED** (CF 55 — entry-mode telemetry on run_start)

`entryMode` entry-mode telemetry landed. `run_start` now carries `entryMode: 'class_select' | 'replay_same_class'`, threaded `CreateRunInput.entryMode` → sim emit, so funnel analysis segments fresh class-select runs from Play-Again (same class) restarts. Merged `--no-ff` as PR #24 at merge commit `701d833`; branch `m1.5d-pr2-cf55-entry-mode-telemetry` deleted local + remote. Codex clean (0 findings, reviewed `9bfac9b`); gate 23/23 (full-workspace `turbo lint typecheck test --force`).

**With CF 55 (this PR) closing on top of M1.5d PR 1 (Play Again, `70b2ff7`), the M1.5d run-end / restart UX milestone is CLOSED.** M1.5d had exactly two PRs — PR 1 (Play-Again fast-path) + PR 2 (entry-mode telemetry). CF 48 (RunEndScreen a11y) was never M1.5d scope; it stays → M2.

**Change surfaces (4).** Followed the CF 41 (`startingRelicId`, M1.5c PR 1) precedent PLUS two extensions Phase 1 surfaced and ratification approved:

1. **Schema** — `run_start` gains `entryMode`, byte-identical across `content-schemas.ts` + `packages/content/src/schemas.ts` (`check-schemas-sync` green). Required on the event (always emitted concretely).
2. **Sim** — `CreateRunInput.entryMode` is **optional** so `restoreRun`'s own `CreateRunInput` literal stays untouched — restore never emits `run_start`. The fresh-run emit threads `input.entryMode ?? DEFAULT_ENTRY_MODE` (`'class_select'`), mirroring how `startedAt`/`sessionId` default.
3. **Server** — `entryMode: z.enum(['class_select','replay_same_class'])` added to the `.strict()` `runStart` validator member. **This surface did NOT exist at CF 41** (the Zod validator was CF 49 / M1.5c PR 2). Field-add, not variant-add: the `discriminatedUnion` stays at **20 variants**; citation comment `809-948 → 809-949`.
4. **Client** — **path-dependent stamping** (the substantive divergence from CF 41, whose `startingRelicId` was path-invariant): `PendingRunInput` gains a required `entryMode`; the two entry paths diverge at `setPendingRunInput` (`beginRun` stamps `'class_select'`, `replaySameClass` stamps `'replay_same_class'`) and converge at the single `createRun` call, which threads `pendingRunInput.entryMode`. `beginRun`'s param narrowed to `Omit<PendingRunInput,'entryMode'>` so `ClassSelectScreen.onConfirm` + every existing test stub stay unchanged.

**Step-0 finds (halt-gate clean).** The prompt's "3 hardcoded run_start literals" was accurate for literals needing an `entryMode` add to pass `.strict()` (`helpers.ts:53`, `telemetry.route.test.ts:40`, `emit.test.ts:32`); the Step-0 sweep surfaced a **4th `run_start` assertion site** — `packages/sim/test/run.test.ts` — that did NOT need updating (asserts a single field) and became the home for the new sim tests. `entryMode` added to the deliberately-invalid "missing seed → reject" test (`telemetry.route.test.ts:127`) to isolate its intended rejection cause (the "+1"). 6 `.json` scenario fixtures surgically re-baselined (single `entryMode: "class_select"` line each, the sim default); **224 `.jsonl` determinism corpus untouched** per `runs/README.md` § additive-telemetry-field re-baseline.

**Tests.** +2 sim tests (`run_start` default → `class_select`; explicit → `replay_same_class`) + a new client both-paths telemetry test (`EntryModeTelemetry.test.tsx`) that runs the REAL sim, mocks only the telemetry transport, and asserts each entry path's genuinely-emitted `run_start.entryMode` (fresh mount → `class_select`; `replaySameClass` fired directly post-mount → `replay_same_class`). Suites: sim 505, server 67, client 463.

**Codex cycle.** 1 review round, **0 findings, 0 self-catches — closed UNDER ceiling (reactive 0/4)**; ties M1.5c PR 2 as the simplest cycle of M1.5.

**CF 55 CLOSED** — entry-mode telemetry on `run_start`. No new CF opened.

**Counter: 39 / 15 / 8 / 27 / 39** (catches / rules / patterns / drifts / open-CFs). Delta from the M1.5d PR 1-close line (39/15/8/27/40): open-CFs **−1** (CF 55 CLOSED); no catch / rule / pattern / drift. CF 55 was the sole open-CF delta.

**Merge-message format** mirrors the M1.5d PR 1 precedent (`Merge M1.5d PR N — <title> (#N)`, un-flagged at PR-1 close) rather than the M1.5c-era branch-style — chosen for same-milestone consistency. Flag if branch-style was intended.

**Next: M1.5e** — sim-authority migration (CF 34), the queued dedicated sub-milestone (gold / reroll / bag / shop authority into the sim; `sellItem` bag-coupling). M1 (parent, graybox) stays OPEN — M1.5e plus the M1 exit gates (item pick-rate dashboard, Trey + 3-tester × 5-crash-free-run playtest, 12–20 min median) remain.

## 2026-05-28 — M1.5d PR 1 CLOSED — "Play Again (same class)" run-end fast-path

`replaySameClass` "Play Again (same class)" run-end fast-path landed. Client-only (5 files, all `apps/client/`); no CF delta; Codex clean (no findings); gate 23/23 (full-workspace `turbo lint typecheck test --force`). Merged `--no-ff` as PR #23 at merge commit `70b2ff7`.

RunEndScreen gains a primary **PLAY AGAIN** CTA (restart with the same class + starter relic, bypassing class select via a pre-seeded `pendingRunInput`) + a muted **"Choose new class"** secondary (→ `resetRun`); uniform across won / eliminated / abandoned. The mechanism is `resetRun`-equivalent on every lifetime-bearing container (Rule-6 walk clean — run-singleton, telemetryAnonId, sessionId, simRun, run seed); the sole divergence is the `pendingRunInput` payload (pre-seeded vs nulled), which crosses no lifetime invariant. `run_start` emit untouched (entry-mode telemetry stays **CF 55**); no RunEndScreen a11y change (**CF 48 → M2**); terminal-origin integration (RunEndFlow F.1/F.5/F.6) stays `it.skip`'d (inherited debt, not un-skipped).

**Counter: 39 / 15 / 8 / 27 / 40** (catches / rules / patterns / drifts / open-CFs) — **unchanged**. Feature work: no CF closed/opened, no catch / rule / pattern / drift. The two conventions below are uncounted (rules counter does not move).

**Date convention (uncounted — codified).** Decision-log entries are dated by decision-day (when the decision was made in master-dev review), not commit-day. Commit metadata stamps the landing day separately. When the two diverge, the entry header reflects decision-day; commit metadata reflects landing-day. *First live test:* this CLOSED entry is dated **2026-05-28** — the merge-ratification day read from merge commit `70b2ff7`'s timestamp — not the staged 2026-05-26 carry-forward. (Retroactively, the 2026-05-26 § entries below are consistent: decisions made 2026-05-26, landed by a later commit.)

**Edit convention (uncounted — codified).** Clerical errors in historical entries (typos, wrong dates, raw line-pin → date-citation conversion) are edited in place. Substantive supersessions (decision updates, convention changes, scope shifts) land as new entries with an explicit supersession reference; historical wording is preserved for the audit trail.

## 2026-05-26 — M1.5d Phase-1 canon reconciliation: Catch 39 CONFIRMED; env-reservation + relay conventions broadened; CF 55 opened (entry-mode telemetry); counter 39/15/8/27/40

Docs-only reconciliation of canon to the M1.5d PR 1 ("Play Again, same class") Phase-1 decisions + the Phase-1 closing amendment. No behavior change, no code touched. Lands the catch confirmation, two convention updates, the new CF, and the running-counter update; the three M1.5d scope-trail entries follow below.

**Catch 39 CONFIRMED (C1 — Phase-1 coverage claim without content-side evidence; Rule-5 failure mode applied to test coverage).** The M1.5d Phase-1 investigation asserted the restart round-trip was "not test-locked" — a coverage claim made without first reading the test files. Refuted in the same chat by Claude Code's self-refutation grounding turn: the reset round-trip IS locked (`apps/client/src/run/RunContext.test.tsx:1247-1331`, the `resetRun two-axis reset` block — `rerollCount`→0 after a full reset→re-resolve cycle) and the anonId lifetime invariant IS locked (`apps/client/src/persistence/persistence.test.ts:182-205`, "clearLocal preserves device-scoped fields"). Same assert-from-prose shape as Catch 37 (Rule 5 / Step-0 framing-refutation), here applied to a test-coverage claim rather than shipped-code state. Caught pre-commit by the grounding pass before any design rode on it. Catches 38 → 39.

**Env-reservation convention update (uncounted; supersedes the integer-pinned reservation in this log's 2026-05-26 § "Rule 15 LANDED").** Drop the integer pin from the env predicate-vs-name candidate. The prior wording reserved it as a specific catch number ("Catch 38" at 528725a → "Catch 39" at 4c31e84); with Catch 39 now taken by C1 it would shuffle again to "Catch 40" — three integer shuffles across consecutive counted catches (38 → 39 → 40), a smell. New canonical wording: **"env predicate-vs-name candidate pending codification — receives next available integer at codification time"** (no integer pin). Uncounted convention, not a numbered rule; the 4c31e84 "Catch 39 reserved" wording is superseded by this forward note (historical entry left intact per append-only).

**Relay convention broadened (uncounted; broadens the "Rule-coinage relay" process note in this log's 2026-05-26 § "Rule 15 LANDED").** The prior form covered rule coinage only. Broadened to: *"Any ratified instruction — rule coinage, DoD amendment, scope directive, etc. — is relayed as its own explicit instruction, never as a rider on an AskUserQuestion answer (riders drop)."* Root cause that earned the broadening: the M1.5d Phase-1 amendment instruction ("fold both DoD items into a brief Phase 1 amendment") was bundled as a rider on the CTA-layout AskUserQuestion answer; only the selection label ("Replay primary, New Class secondary") propagated to execution, and the rider dropped — the exact shape the original convention named, now generalized beyond rule coinage.

**CF 55 OPENED (NEW) — entry-mode telemetry.** Entry-mode telemetry: add `entryMode: 'class_select' | 'replay_same_class'` to `run_start`, threaded via `CreateRunInput.entryMode` → sim emit; per CF 41 precedent (M1.5c PR 1 startingRelicId pattern); requires schema add (content-schemas.ts + packages/content/src/schemas.ts mirror), server-validator 20-variant-union update, 6-fixture corpus re-baseline. Spec'd in M1.5d Play-Again Phase 1 amendment; deferred to preserve PR 1 client-only scope. (Number CF 55 — walked from canon; highest prior CF was CF 54 at 2026-05-23 § "M1.5c PR 2 CLOSED".)

**Open-CF reconciliation → 40.** Running open-CF count: 40 (the canonical enumeration at 2026-05-23 § "M1.5c PR 2 CLOSED") − CF 53 (closed 2026-05-23 § "CF 53 CLOSED") + CF 55 (this entry) = **40 open**. CF 55 enumerated above.

**Running counter after this commit: 39 / 15 / 8 / 27 / 40** (catches / rules / patterns / drifts / open-CFs). Delta from the prior running line (38/15/8/27/39): catches **+1** (Catch 39, C1 confirmed), open-CFs **+1** (CF 55 opened); rules / patterns / drifts unchanged. Env predicate-vs-name candidate now integer-unpinned (uncounted, no slot held).

## 2026-05-26 — M1.5d re-pivot to run-end UX (Play Again, same class); CF 34 spun out as M1.5e — authority migration

Gold-first refuted by Step-0 separability check (sellItem bag-coupled); gated-and-fired, uncounted. Rationale: no cheap CF 34 entry; large-coupled migration deserves dedicated milestone; play-again is on-theme bounded opener.

## 2026-05-26 — M1.5d PR 1 re-scope — restart confirmed healthy + ~80% locked (Catch 39); first PR pivots to CF 34 sim-authority migration

Fresh-state assertions fold in as migration characterization net; de-fragilize lands in sim by construction; terminal-path un-skip = separate harness debt. Milestone weight re-centered on CF 34 + run-end deferred debt.

## 2026-05-26 — M1.5d PR 1 scope — restart state-reset contract; CF 34 → PR 2; CF 43/36 off-spine

Rationale: on-spine + Step-0 Rule-6 run-singleton hazard. Reset contract = fresh-state-per-lifetime, authority-agnostic. (Original Phase 1 scope — superseded but part of the trail.)

## 2026-05-26 — Rule 15 LANDED (ratified the Drift-28 turn, dropped from 528725a via relay gap); Catch 38 (B-class) + env reservation → Catch 39

Lands an **already-ratified rule** that was absent from the artifact — not a new ratification. Rule 15 (drift-vs-clerical boundary) was coined in the Drift-28 ruling turn (the message that selected "keep at 27, label = fix"), which carried the full rule paragraph, the line "Committed counter: 37 / 15 / 8 / 27 / 39 — rules 14 → 15 for Rule 15," and "fold Rule 15 into the same commit." **Relay gap:** the coinage rode in alongside the AskUserQuestion selection and did not propagate to Claude Code as a discrete instruction, so 528725a committed the drift / catch / label items but not the rule. `git show 528725a` + full-file grep confirmed the absence; the close-out rules-count halt (handoff said 14, ratification said 15) is what caught it.

**Rule 15 (drift-vs-clerical boundary).** A grounding-gate-caught miss counts — in the appropriate counted class (Topic-2 drift or catch) — when it is directional/substantive: it would have mis-directed work or dropped ratified content (e.g., a next-target leg contradicting canon → drift; a ratified rule absent from the artifact → catch). A purely clerical slip corrected at the same gate (a propagated label or date — would have mis-labeled, not mis-directed) is ratified as a fix, not counted. The gate firing determines harmlessness, not whether the miss counts; the count turns on whether the miss, had it landed, would have mis-directed work or dropped ratified content vs merely mislabeled it.

**Catch 38 (B-class — ratified-rule-vs-commit).** A ratified rule (Rule 15) was missing from the committed artifact, and verification nearly discarded it as "never ratified" — which would have opened M1.5d on a baseline short one rule with the boundary uncodified. That is a substantive loss of ratified content, not a mislabel → it counts (Rule 15, first application). Caught by the close-out rules-count halt. Number forced by coherence: 37 counted + this = **Catch 38**.

**Env candidate reservation: Catch 38 → Catch 39.** The M1.5c-PR2 env predicate-vs-name candidate, reserved as "Catch 38" at the 528725a bookkeeping entry, moves to **Catch 39** — a counted catch (38) now occupies that slot, and an uncounted reservation takes the next free number. Same coherence applied (inverted) at the CF-53 Catch 37/38 reconciliation: a number can't be held-and-skipped while it stays uncounted. The 528725a reservation line is superseded.

**Rule 15's first application classified both of this turn's items:** the rule-drop as substantive → counted (Catch 38); the 5/23→5/26 header mis-date (below) as clerical → uncounted. It earned its number on first use.

**Date-header fix (clerical, uncounted).** The next-target-selection and Drift-27-bookkeeping entry headers were authored/committed today (2026-05-26, per 528725a commit metadata) but mis-dated 2026-05-23 by matching the adjacent genuinely-5/23 close entries. Corrected to **2026-05-26**. Internal citations to § "M1.5c PR 2 CLOSED" stay 2026-05-23 (that close was real on 5/23); the CF 53 CLOSED + M1.5c PR2 CLOSED entry headers stay 5/23.

**Process note (no second rule this turn).** Rule coinage bundled as a rider on an AskUserQuestion selection is drop-prone — the selection relays, the rider doesn't. Going forward a rule coinage is relayed as its own explicit instruction, not attached to a decision answer; Claude Code flags any instruction that looks like a rider.

**Running counter after this commit: 38 / 15 / 8 / 27 / 39** (catches / rules / patterns / drifts / open-CFs). Delta from the prior running line (37/14/8/27/39): catches **+1** (Catch 38, B-class), rules **+1** (Rule 15 landed); patterns / drifts / open-CFs unchanged. Env candidate reservation now Catch 39 (uncounted).

## 2026-05-26 — M1.5c next-target selection (post-CF-53): **M1.5d open** (run-end / restart surfaces)

Next target: **M1.5d open** — per the M1.5c-close plan (this log, 2026-05-23 § "M1.5c PR 2 CLOSED": "M1.5d opens in a fresh chat… CF 34 / CF 36 / CF 43 flagged for M1.5d reconsideration"; M1.5d scope named as run-end / restart surfaces).

Two corrections to the proposing frame, recorded so the selection traces to canon, not prior prose:

- **CF 14 is LANDED, not a close-out candidate.** Closed 2026-05-17 at M1.5a PR 3 Phase 2c (ruleset-modifier reroll-cost authority regression test in `apps/client/src/shop/ShopController.test.ts`); absent from the 40-CF open enumeration (walk runs CF 13 → 16, skipping closed 14/15). The "[CF 14 close-out]" bracket option was moot.
- **"M2 open" was not the next target.** The canonical M1.5c-close entry slates M1.5d next; selecting M2 would skip it.

Scope status: the **abandon-run flow** is feature-complete post-CF-53 (de-reddening / popover+sheet / desktop two-step + mobile one-step / `abandon_run` action chain / `run_end{outcome:'abandoned'}` telemetry shipped + test-locked at 5b.3b; CF 53 closed its last genuine delta — the viewport-conditional ⋯ trigger size, 40 desktop / 36 mobile). This does NOT make run-lifecycle feature-complete: **CF 48** (RunEndScreen + modal-equivalent a11y) remains open → M2, and M1.5d takes up run-end / restart surfaces. **Label fix ratified — M1.5b → M1.5c:** the proposing frame carried "M1.5b" in from the resume handoff without checking it against canon; the milestone just closed is M1.5c (CF 53 / abandon-run is M1.5c-era, 5b.3b lineage), with M1.5d slated next (M1.5b closed 2026-05-21; M1.5c closed 2026-05-23). This selection/planning entry is itself counter-neutral (no catch / rule / drift / CF delta); the Drift 27 + counter touch it surfaced are recorded separately in the bookkeeping entry below.

## 2026-05-26 — Counter bookkeeping (folded into the M1.5c next-target docs commit): Drift 27 + Catch 37/38 reconciliation

Counter-affecting line items from this turn, kept separate from the counter-neutral selection entry above.

**Drift 27 (master-dev, grounding-gate-caught).** The next-target proposal offered the leg "M2 open", which contradicted canon's slated M1.5d (this log, § "M1.5c PR 2 CLOSED": "M1.5d opens in a fresh chat…"). Surfaced by Claude Code's log-read grounding pass before it landed. Counted by symmetry with the catch counter — prevention events count: a Codex catch increments though (by definition) it caught the bug pre-ship, and a master-dev drift caught at the grounding gate is the same shape (the gate firing is what kept it harmless, not grounds to null it). Same this-chat "mine" category as the M1.5c drifts. Topic-2 drifts **26 → 27**.

**Catch 37 / 38 reconciliation (counter-neutral; resolves the collision flagged at CF 53-close).** The +1 catch counted at CF 53-close (catches 36 → 37) is the **CF 53 assert-from-prose / Step-0 framing-refutation catch = Catch 37**. The PR-2-close env predicate-vs-name candidate — tentatively labeled "Catch 37 candidate" at § "M1.5c PR 2 CLOSED", HELD/uncounted — is **re-reserved as Catch 38**, pending master-dev codification; its earlier "37" label is superseded. Catch total unchanged at 37.

Running counter after this commit: **37 / 14 / 8 / 27 / 39** (catches / rules / patterns / drifts / open-CFs). Delta from the CF-53-close line (37/14/8/26/39): Topic-2 drifts **+1** (Drift 27); all other fields unchanged.

## 2026-05-23 — CF 53 CLOSED (abandon-run ⋯ trigger size → viewport-conditional 40×40 desktop / 36×36 mobile; M1.5c follow-on micro-PR)

CF 53 closed (PR #22, branch m1.5c-cf53-trigger-size, +36/−2, turbo 17/17 + CI green, Codex clean/no findings). ⋯ trigger now viewport-conditional 40×40 desktop / 36×36 mobile via existing useViewport() branch in AbandonRunMenu.tsx; new per-viewport size test (suite 34→36); #DC2626 guard intact. No pre-existing size assertion existed — prompt's assumed assertion was unfounded; new test added, DoD met identically. Second assert-from-prose instance this CF → board-ratification shipped-state gate extended: code/test state cited in a scoping prompt must trace to verified code, not prior prose. Branched off current main (a4561c2 + 3 doc-only commits, zero code delta). Episode: a board was ratified and CF carried for 6 abandon-flow surfaces when 5 were already shipped/locked; only the trigger size was genuine.

### Counters (running line — deltas applied to the M1.5c PR-2-close baseline)

CF-53-close totals: **37/14/8/26/39** (catches / rules / patterns / drifts / open-CFs). Deltas from the PR-2-close baseline (36/13/8/25/40): **+1 catch** (A-family, Step 0 framing-refutation — the scoping prompt asserted a trigger-size test that did not exist), **+1 rule** (board-ratification shipped-state gate — code/test state cited in a scoping prompt must trace to verified code, not prior prose), **+1 Topic-2 drift** (board ratified + CF carried for 6 abandon-flow surfaces when 5 were already shipped/locked), **Open CFs −1** (CF 53 closed). Patterns unchanged.

## 2026-05-23 — M1.5c PR 2 CLOSED + **M1.5c MILESTONE CLOSED** (server `/v1/telemetry/batch` endpoint; CF 49 closure; 1-Codex-P2 cycle under-ceiling)

### Framing

PR \#21 (`m1.5c-pr2-telemetry-server`) merged into `main` via `--no-ff` at merge commit `a4561c293fd2c7ae6fd4cd9b1d54d92d45d1a16d` on 2026-05-23. Branches deleted local + remote (`-d` clean — no merge-state drift). 7 atomic branch commits (5 implementation + 1 test + 1 Phase-2.5 fix) off main `c18dd72` (the M1.5c PR 1 CLOSE docs commit; one ahead of the merge `fb42abe` named in PR 1's own pre-flag — `c18dd72` is the correct base because it includes the PR 1 closing-log entry).

M1.5c PR 2 lands the **server half** of the telemetry pipeline per `tech-architecture.md` § 6.3/6.4 (Fastify 4.x, Zod at the server consumer, Pino) + § 12 (server forwards to PostHog). CF 49 CLOSED: bootstraps `apps/server` from an 8-line `export {}` stub into a bootable Fastify app exposing `POST /v1/telemetry/batch` — Zod-validated against the verbatim 20-variant `TelemetryEvent` union, forwarding each event to PostHog (posthog-node), with graceful buffer-drain on shutdown; plus the Vite dev proxy (`/v1` → `:4000`).

**With CF 35 (PR 1, client half) + CF 49 (PR 2, server half), the M1.5c telemetry milestone is CLOSED.**

### Branch + commit topology

Verified via `git log --oneline a4561c2^1..a4561c2^2`. 7 commits:

| SHA | Step | Scope |
|---|---|---|
| `24ba645` | Step 1 — deps | chore(server): fastify ^4.28.1 + zod ^4.4.3 + pino ^9 (aligned to fastify 4.29 internal major) + posthog-node ^4.2 + tsx/vitest (dev); `--config.strict-ssl=false` install (5b.3a Phase 2.5j corporate-cert precedent); no turbo.json change (generic tasks pick up new scripts) |
| `531cf2b` | Step 2 — app factory | feat(server): env.ts (`readEnv` pure reader) + posthog/client.ts (`TelemetrySink` DI seam; real PostHog client satisfies it structurally) + app.ts `createApp({posthog})` (testable seam, bodyLimit 256 KiB, onClose drain) + index.ts thin listen + SIGTERM/SIGINT → app.close() |
| `49b8d70` | Step 3 — validator | feat(server): validation/telemetryBatch.ts — `z.discriminatedUnion('name', […20 verbatim variants…])`; lenient `z.string().min(1)` on branded IDs/timestamps, strict structure (`.strict()`, `events.min(1)`, `anonId.min(1)`); 4-layer completeness net (see below) |
| `a0e5971` | Step 4 — route+forward | feat(server): routes/telemetry.ts (204/400/413/500) + posthog/forward.ts (`distinctId←anonId`, `event←name`, `properties←(event−name)+clientVersion+tsServer`, `timestamp←tsClient`); app.ts route wiring |
| `cd07304` | tests | test(server): 50-test suite (route inject + literal enumeration + env matrix); each completeness layer proven load-bearing (fails on a break, reverts clean). +1 (500 forward-failure) added at pre-push coverage check via stash→reset→amend→cherry-pick (interactive rebase blocked in harness) — tests kept one atomic commit |
| `079337f` | Step 5 — Vite proxy | feat(client): isolated apps/client commit — `server.proxy { '/v1': 'http://localhost:4000' }` (§ 8.1; never landed pre-server) |
| `bd398ca` | Phase 2.5 r1 | fix(server): readEnv strict PORT (`/^\d+$/` + 1..65535 range) + LOG_LEVEL pino-set validation (Codex P2); +17 env tests |

(Eighth slot is merge commit `a4561c2`; this docs commit pending.)

### 4-layer validator completeness net (CF 49 core)

Hand-authored 20-variant union under lenient `z.string()` (brand erased to plain string in `z.infer`). No single layer suffices; each was empirically proven to FAIL on a break then reverted clean:

1. **`assertNever(name)` over `TelemetryEventName`** — compile gate on variant-NAME completeness (a 21st canonical variant → `TS2345 not assignable to never`).
2. **`TelemetryEvent satisfies Inferred` (ONE direction)** — compile gate on extra/renamed properties + extra variant members. Reverse direction intentionally omitted: lenient `z.string()` widens `RunId→string`, so `Inferred satisfies Canonical` false-fails on every brand (no `Equals<>`, per ratification). `events` array `.readonly()` so inferred `readonly E[]` matches canonical `ReadonlyArray` (readonly arrays not assignable to mutable — the satisfies needs the match).
3. **`.strict()` + per-variant full-payload round-trip tests** — runtime gate on DROPPED properties (a dropped field becomes an unknown key on the full payload → strict rejects → 400 → test fails).
4. **Literal-enumeration tests** — runtime gate on narrowed literal unions (invisible to layers 1-2 across the brand boundary); every member of RunOutcome/RoundOutcome/CombatOutcome/relic-slot/Rotation accepted + one cross-contaminant non-member rejected.

### Phase trajectory

Phase 1 (read-only design report; 7 open questions ratified with amendments; Rule 6 lifetime-walk drafted) → Step 0 (verbatim verification; surfaced + resolved the Phase-1-report-internal "17-vs-20" variant miscount — verbatim union declared sole authoring spec) → Phase 2 (5-step implementation, CF 49) → pre-push coverage check (+1 forward-failure 500 test) → Phase 2.5 r1 (Codex P2 — env never-throws contract) → Codex round 2 CLEAN. **1 Codex P2 round + 0 self-catches; closed UNDER ceiling (reactive 1/4).** Simplest Codex cycle of M1.5 (cf. PR 1's 3-P1 cycle).

### Phase 2.5 r1 (Codex P2 — env never-throws contract)

Codex P2: `readEnv`'s PORT validation (`Number.isInteger(parseInt(x)) && >0`) crashed `app.listen()` on out-of-range (`70000`) / trailing-garbage (`'70000abc'` → parseInt 70000) inputs, violating env.ts's documented "never throws / falls back to defaults" contract. Step-0 grep swept the FULL env-read surface (the defect class is generic — any unvalidated value reaching a throwing boot consumer):

- **PORT → `app.listen()`** (throws "port should be >= 0 and < 65536"): fixed — strict `/^\d+$/` (via `Number`, not `parseInt`) + `1..65535` range → `DEFAULT_PORT` on any failure.
- **LOG_LEVEL → pino** (throws "default level:&lt;x&gt; must be included in custom levels" — bootstrap pino AND Fastify's logger): fixed — validate against pino's set `{trace,debug,info,warn,error,fatal,silent}` → `DEFAULT_LOG_LEVEL` on unknown. (Second instance of the same defect class; anticipated.)
- **POSTHOG_PROJECT_KEY / POSTHOG_HOST → posthog-node**: assessed SAFE — the SDK ctor does not validate at construction and swallows flush failures (no boot throw); empty-string fallback sufficient. Left as-is.

+17 env tests (suite 6→23); server suite 50→67. `readEnv` stays pure + non-throwing. Codex round 2 clean.

### Codex dispositions that never fired (carried context, NOT findings)

Surfaced and dispositioned during review without producing a P-finding — recorded so they aren't re-litigated:

- **CORS** — non-issue: same-origin in prod; dev via Vite proxy (`/v1` → `:4000`), so the browser sees same-origin. No CORS headers needed.
- **Partial-enqueue on mid-batch forward throw** — accepted loss: `forwardBatch` loops `capture()`; a throw mid-loop 500s with some events already enqueued. Acceptable for graybox (client swallows the 500; the 204-acknowledges-enqueue-not-delivery semantics already documented). No transactional batching.
- **400 body shape** — `{error, issues}` (Zod issues) deemed sufficient; client swallows the body regardless. No schema'd error envelope.
- **Proxy runtime** — Vite dev proxy is dev-only config; prod is same-origin. No runtime proxy component shipped.

### Candidate catch — HELD (not counted)

The Codex P2 env fix is a **predicate-vs-name instance** (Rule 1 lineage): `parsedPort > 0` was a PROXY for "valid TCP port the listener accepts," admitting out-of-range + trailing-garbage that the named invariant ("never throws / valid config") excludes. Same shape as the affordability/event-content proxies in `tech-architecture.md` § 4.5. **HELD as a candidate (Catch 37 candidate), NOT incremented** — deferred to master-dev for whether to codify (mirrors the PR 1 "fixture-lock predicate" 1st-instance HELD convention). If codified, it would also be a 2nd-instance reinforcement that "valid-input predicates" must encode the consumer's actual acceptance domain, not a positivity proxy.

### Topic 2 drifts (+1 — Drift 25)

**Drift 25** — master-dev asserted a #N-in-merge-message exception contradicting the codified bare-#N rule + PR-1 branch-style merge format; surfaced by Claude Code's pre-merge halt, corrected to branch-style before landing. (The Phase-1-report 17-vs-20 miscount is NOT counted — report-internal, Step-0-caught, per the first walk's correct exclusion.)

Same this-chat "mine" category as Drift 23/24 (PR 1's "+2 — both mine"). Attribution lineage, recorded so it does not get re-mangled a third time: the original PR-2-close walk OMITTED this drift; the first correction commit (`5bb9f34`) raised the count to 25 but MIS-SUBSTITUTED the 17-vs-20 miscount into the Drift 25 slot; this commit restores the correct attribution (the merge-message exception). The total was 25 from the first correction onward — this is a label fix, not a recount.

### Counters (log-walked totals; deltas match)

Re-enumerated by walking `decision-log.md` forward from the M1.5c PR 1-close baseline through this entry's deltas.

| Counter | M1.5c PR 1-close baseline | M1.5c PR 2 deltas | M1.5c PR 2-close total |
|---|---:|---:|---:|
| Predicate-vs-name catches codified | 36 | 0 (Catch 37 candidate HELD, not counted) | **36** |
| Going-forward rules codified | 13 | 0 (env fix is Rule 1 lineage, no new rule) | **13** |
| Architectural patterns codified | 8 | 0 | **8** |
| Master-dev chat drifts (Topic 2) | 24 | +1 (Drift 25 — master-dev #N-in-merge-message exception vs the codified bare-#N rule; surfaced by pre-merge halt, corrected to branch-style. NOT the 17-vs-20 — that's report-internal / Step-0-caught / excluded) | **25** |
| Open CFs (enumerated below — canonical) | 40 | −1 closed (CF 49) + 1 opened (CF 54) | **40** |
| 4-finding ceiling state | n/a | 1 Codex P2 + 0 self-catches; round-2 clean → closed under-ceiling (reactive 1/4) | — |

PR-2-close totals: **36/13/8/25/40**. Deltas from the PR-1-close baseline (36/13/8/24/40): Topic-2 drifts **+1** (Drift 25, corrected disposition), Open CFs net 0 (−CF 49 / +CF 54); Catches / Rules / Patterns unchanged.

### CF closures + openings

- **CF 49 CLOSED** — server `/v1/telemetry/batch` endpoint. Fastify app bootstrapped; Zod `TelemetryBatchRequest` validation (20-variant union, 4-layer completeness net); PostHog forward via posthog-node (`distinctId←anonId`, `properties` + `tsServer` ingest stamp per telemetry-plan.md § 8); onClose buffer drain (Rule 6 lifetime walk — 204 acknowledges enqueue not delivery; hard-crash loss accepted for graybox); status map 204/400/413/500; Vite dev proxy. Env hardened to the never-throws contract (Phase 2.5 r1).
- **CF 54 OPENED (NEW)** — derive `clientVersion` from build/package version. `apps/client/src/telemetry/emit.ts` `CLIENT_VERSION` is the hand-edited literal `'m1.5c-pr1'` (never bumped for PR 2); the server forwards it as a PostHog property, so every post-PR-2 event silently mis-tags its deploy as `'m1.5c-pr1'` in PostHog dashboards. Derive from `package.json` version / build metadata so deploy-slicing is accurate. Low-priority (graybox; single-version analytics tolerable now). → **M2 or follow-up micro-PR.** (Number assigned from the enumeration walk; not asserted.)

### Open CF enumeration (one bullet per CF, no consolidation — canon rule)

Walked from the M1.5c PR 1 CLOSED enumeration (40), applying this PR's −1 closure + 1 opening.

**M1.4-era (21 open, unchanged):**

- CF 2 — Real character art in portraits → M2.
- CF 3 — Real particle sprite sheets → post-M1.
- CF 4b — `recipe_combine` event VFX (sim-emission-blocked) → M2 content sweep.
- CF 5 — Music + SFX integration → post-M2.
- CF 6 — Custom cubic-bezier easing function → M2 if designer flags.
- CF 7 — BitmapText / pre-rasterized font atlas → post-M1 if floater spawn rate saturates.
- CF 8 — `>>` fast-forward indicator visual styling → M2 polish.
- CF 9 — Telemetry event for "fast-forward triggered" → if `telemetry-plan.md` § 4 surfaces need.
- CF 10 — Configurable per-user playback speed → M2+.
- CF 11 — SKIP scene-level direct unit test coverage precedent → revisit if SKIP regresses.
- CF 12 — Combat chunk Vite build non-determinism (~0.75 kB raw drift) → tracked.
- CF 13 — Generation-side ghost-loadout filter → M2 ghost storage rework.
- CF 16 — Server-side ghost record → M2.
- CF 17 — Auto-rearrange hint affordance → M3.
- CF 18 — Per-round trophy schedule + contract modifiers + win-streak multipliers → M2.
- CF 19 — `RarityGem` for shop rarity dot → carries from M1.3.2.
- CF 20 — `apps/client/src/index.css` `.glow-*` rgba palette derivatives → carries.
- CF 22 — State-driven bag dimensions through pure helpers → M2.
- CF 23 — Real-device drag-state screenshot capture → still carried.
- CF 24 — Player portrait dying-state visual feedback → M2.
- CF 30 — Particle-count consts promotion (§ 4.5 R2 spirit-extension sweep) → M2 telemetry-driven tuning.

**M1.5a-era (6 open, unchanged):**

- CF 32 — Expand mid/boss relic content to 3+ per class per slot → M1.6+ content fill or M2 polish.
- CF 33 — Sim `state.ts` combat-coupling refactor for cleaner lazy-boundary → M2 architectural cleanup.
- CF 34 — Gold/rerollCount/bag/shop authority migration to sim — AMENDED 5b.3b Phase 2.5h. → reconsider at M1.5d.
- CF 36 — `enterCombatPhase` consolidation surface → opportunistic M1.5d client refactor.
- CF 37 — `recipesRegistry` sim-default vs client-filter divergence → revisit alongside CF 34.
- CF 38 — Resolution panel reward display sync (gold + trophy axes) → M2 polish.

**M1.5b PR 1-era (4 open, unchanged):**

- CF 40 — `contractName` + `contractText` hardcoded literals at `createInitialState` → M2 contract system or first non-neutral contract.
- CF 42 — `buildCombatInput.startingHp: 30` Rule 6 violation → first M1 item with `maxHpBonus` ships.
- CF 43 — `buildCombatInput.recipeBornPlacementIds` omission (Tinker recipe-bonus no-op) — AMENDED 5b.3b Phase 2.5h. → reconsider at M1.5d.
- CF 44 — Mid + boss relic named glyphs (6 placeholder diamonds) → M2 visual polish.

**M1.5b PR 3 / 5b.3a-era (3 open, unchanged):**

- CF 45 — Client placement-id minting non-deterministic — AMENDED 5b.3b Phase 2.5h. → M2 `/v1/replay/validate`.
- CF 46 — Forward-version save clobber on downgrade. → schema-bump territory, M2 likely.
- CF 47 — Zod main-chunk bundle delta (+19.65 kB gz / +24%). → M2 mobile-perf pass.

**M1.5b PR 3 / 5b.3b-era (1 open, unchanged):**

- CF 48 — `RunEndScreen` + modal-equivalent a11y (no auto-focus on terminal-outcome mount; siblings not `inert` when modal-equivalent open). → M2 polish.

**M1.5c PR 1-era (4 open; CF 49 CLOSED this PR):**

- CF 50 — 4 schema-only telemetry variants (`error_boundary_caught`, `tutorial_step_reached`/`_completed`/`_abandoned`) have no emit site (the server validator ACCEPTS all of them; only emit sites are missing). → **M2** (tutorial M1.5d/M2; error-boundary M2 polish).
- CF 51 — Tighten `validate.ts` (and the server validator's `anonId`, which uses `z.string().min(1)`) → `.uuid()` after the backfill window. → **M2.**
- CF 52 — Architectural split: separate device-profile envelope from run-save envelope (two-lifetime → two-storage-keys). → **M2.**
- CF 53 — Abandon dialog v3 visual polish pass (de-reddened treatment). → **next-seam micro-PR** (see pre-flags).

M1.5c PR 1-era closures this PR: **CF 49** (server endpoint + PostHog forward).

**M1.5c PR 2-era (1 OPENED this PR):**

- **CF 54 NEW** — derive `clientVersion` from build/package version (currently the hand-edited literal `'m1.5c-pr1'`, forwarded as a PostHog property → silently mis-tags deploys). → **M2 or follow-up micro-PR.**

**ENUMERATED TOTAL: 40 open CFs.** Walks: 21 + 6 + 4 + 3 + 1 + 4 + 1 = 40. ✓

### M1.5c MILESTONE CLOSED

CF 35 (PR 1, client emit chokepoint + identifiers + wiring) + CF 49 (PR 2, server endpoint + PostHog forward) together complete the M1 telemetry pipeline per `telemetry-plan.md` + `tech-architecture.md` § 12. Client batches → `POST /v1/telemetry/batch` → Zod-validated → PostHog forward. **M1.5c is CLOSED.**

### Post-M1.5c pre-flags (next seam)

- **CF 53 — abandon-board work (next-seam micro-PR).** Overflow affordance + run-actions container + de-reddened confirm dialog, both viewports. **Restyle-vs-feature scope is PENDING a Step-0 delta-vs-5b.3b-shipped read** — Phase 1 must diff the v3-ratified treatment against what 5b.3b actually shipped before sizing. Branch off the new main tip (`a4561c2`).
- **M1.5d opens in a fresh chat** with a state-dump-on-resume handoff per the milestone-phase convention. CF 34 / CF 36 / CF 43 flagged for M1.5d reconsideration.
- **Rule 6 amendment** remains in force: every M1.5d Step 0 walks lifetime classes × runtime operations for any multi-lifetime container touched.

---

## 2026-05-23 — M1.5c PR 1 CLOSED (telemetry client wiring; CF 35 + CF 41 closures; 3-Codex-P1 cycle closed under-ceiling)

### Framing

PR \#20 (`m1.5c-pr1-telemetry-client`) merged into `main` via `--no-ff` at merge commit `fb42abe7a19201d4f341aa752d59a9d09eb5ed65` on 2026-05-23T18:39:39Z. Branches deleted local + remote. 12 atomic branch commits (7 implementation + 4 Phase-2.5 fixes + 1 docs) off main `f16d1b6` (the M1.5b CLOSE merge tip).

M1.5c PR 1 lands the **client half** of the telemetry pipeline per `tech-architecture.md` § 12 (L350-353) Option B (server-mediated) ratified at Phase 1. CF 35 closure surface end-to-end on the client side; CF 41 closure schema-side + sim-emit. PostHog server-forward via `/v1/telemetry/batch` is CF 49 → M1.5c PR 2 (not this close).

### Branch + commit topology

Verified via `git log --oneline f16d1b6..d0f6a77` (branch tip pre-merge). 12 commits:

| SHA | Phase | Scope |
|---|---|---|
| `dd5ab09` | Step 1 — schema | feat(schemas): run_start +startingRelicId (CF 41 closure); byte-identical mirror; check-schemas-sync OK |
| `cf53963` | Step 2 — sim emit | feat(sim): thread `input.startingRelicId` into run_start emit; +1 sim test; 6 .json scenario fixtures surgically re-baselined (single-field additive diff each; .jsonl corpus byte-stable) |
| `d848dd2` | Step 3 — emit.ts | feat(telemetry): `apps/client/src/telemetry/emit.ts` client chokepoint — factory + module-singleton; enrichment (re-stamp tsClient + override sessionId); batched flush on (interval / pagehide / shutdown); injectable transport (default: throw-safe POST /v1/telemetry/batch with keepalive); Pattern \#7 OUT-only invariant |
| `330aeeb` | Step 4 — identifiers | feat(telemetry): `apps/client/src/telemetry/identifiers.ts` — `getOrCreateSessionId` (sessionStorage `pba.telemetry.sessionId`, per-tab) + `resolveAnonId` (LocalSaveV1-backed, lazy generate) |
| `f65b091` | Step 5 — wiring | feat(run): lazy useState for sessionId + anonId; mount-once `initTelemetry`; both `onTelemetryEvent` stubs → `telemetryCapture`; abandon dispatcher emits `run_end{outcome:'abandoned'}` via `stateRef` (mirrors `dragRef` pattern); save composer telemetryAnonId stateful |
| `54540d6` | Step 6 — tests | test(telemetry): +13 emit.ts + +10 identifiers + +3 wiring; captured-array transport pattern; no-network anywhere |
| `4e07088` | Step 7 — docs | docs(telemetry): plan § 3 run_start + § 8 identifier provenance + transport subsection; fixture README "additive-field re-baseline" precedent |
| `dc015f7` | Phase 2.5 r1 | fix(telemetry): keepalive ⊆ pagehide + byte-size flush trigger (Codex P1 r1) — FlushReason discriminator; `BYTE_SIZE_FLUSH_THRESHOLD = 32 * 1024`; new pagehide listener; +8 tests |
| `0b8986f` | Phase 2.5 r2 | fix(telemetry): sessionStorage property-read under try + memoized fallback (Codex P1 r2) — mirrors `storage.ts:51-63` `getDefaultStorage`; `_fallbackSessionId` module memo; +4 tests, 1 existing flipped to memo contract |
| `d0f6a77` | Phase 2.5g | fix(persistence): clearLocal preserves device-scoped envelope; nulls only inProgressRun (Codex P1 r3 / meta-audit) — `load → mutate → write`; latent siblings inherit; +4 new tests, 4 re-baselined |

(Twelfth slot is the merge commit `fb42abe`, this docs commit pending.)

### Phase trajectory

Phase 1 (read-only Step 0 investigation; Q1-Q7 evidence + Step 0(c) anonId scope) → Phase 2 (5-step implementation; CF 35 + CF 41 closures) → Phase 2.5 round 1 (Codex P1 keepalive cap + invisible data loss) → Phase 2.5 round 2 (Codex P1 sessionStorage property-read outside try) → Phase 2.5g meta-audit (Codex P1 round 3 — clearLocal envelope-wipe / anonId fragmentation; preemptive meta-audit at round 3 / **bent from the 4-finding ceiling** because the third P1 was structural rather than tactical) → Codex round 4 CLEAN. **3 Codex P1 rounds + 1 preventive self-catch; closed under-ceiling.** 3rd meta-audit-adjacent cycle of M1.5 (after 5b.3a Phase 2.5g and 5b.3b Phase 2.5-meta).

### Codifications (catches)

- **Catch 33 (Class C2)** — `fetch keepalive` cap × throw-safe-swallow = invisible data loss. Codex P1 round 1. `defaultFetchTransport` set `keepalive:true` on every batch; the 64 KiB browser-spec body cap silently dropped large/bursty batches via the (correct) throw-safe swallow. Insight: when a transport flag has a spec-defined cap AND failure mode is silent-by-design, scope the flag to only the path that needs it. Fix: `FlushReason` discriminator; `keepalive ⊆ 'pagehide'` only; live paths (interval / terminal) use normal fetch; byte-size flush trigger at half the cap so the page-dying batch stays under the limit.
- **Catch 34 (Class C2)** — direct Web Storage property access outside try/catch. Codex P1 round 2. `typeof sessionStorage !== 'undefined' ? sessionStorage : null` ternary evaluates the property dereference BEFORE entering the try block; opaque-origin / sandboxed-iframe / blocked-storage contexts throw `SecurityError` on the dereference itself (not on the getItem/setItem method calls). `typeof` guards undefined globals; it does NOT guard against property-access throws. Existing `storage.ts:51-63` `getDefaultStorage` was the established pattern (Catch 19 lineage); the new identifiers.ts code didn't apply it. Fix: mirror the pattern. Module-memoized fallback uuid for stable storage-denied sessions (one tab visit = one sessionId regardless of storage availability).
- **Catch 35 (Class A — preventive self-catch; not Codex)** — `crypto.randomUUID()` throws in non-secure contexts (HTTP non-localhost). `typeof crypto.randomUUID === 'function'` is true even when the call would throw — the function exists but requires a secure context. Surface: `identifiers.ts § generateUuid`. Same self-catch class as 5b.3b meta-audit A.2 (focus trap incompletion surfaced by our own sweep, not Codex). Recommended for count by master-dev preemptively after Phase 2.5g. Fix status: NOT shipped this PR (latent risk in non-secure contexts; M1 ships on HTTPS so live impact deferred). No CF opened — taxonomy-only entry; CF would be opened if a real surface needed it.
- **Catch 36 (Class C2 / Pattern \#7 lineage)** — schema-shape proxy ≠ runtime-operation lifetime invariant. Codex P1 round 3 + meta-audit ratification. `LocalSaveV1` encodes two lifetime classes in its SHAPE (device-scoped envelope fields + run-scoped `inProgressRun`); the runtime OPERATION (`removeItem(SAVE_STORAGE_KEY)`) is single-lifetime and collapses both into one wipe. Confirming the schema's lifetime distinction is NOT confirming the lifetime invariant under operations. Step 0(c) ratified the proxy ("device-scoped on a device-scoped envelope") without tracing `clearLocal`'s operation against each class — this round's Topic 2 drift. Fix: `clearLocal` reimplemented as `load → mutate → write`, preserving the envelope and nulling only `inProgressRun`. Latent siblings (`trophies`, `dailyStreak`, `lastDailyAttempted`, `tutorialCompleted`) inherit the preserve semantic for free.

### Rules

- **Rule 6 AMENDED (codified now)** — Step 0 surface verification extends to tracing each lifecycle operation against every lifetime class a multi-lifetime container encodes; field-presence ≠ lifetime-durability. Amendment, not a new rule — rule count UNCHANGED at 13. The amendment directly addresses the Catch 36 / Topic-2-drift-24 mechanism: Step 0(c) had confirmed the schema field is on the device-scoped envelope but had not walked `clearLocal` against that claim. Future Step 0s on multi-lifetime containers must enumerate the lifetime classes AND trace each runtime op (`save`, `load`, `clear`, `migrate`) against each class.

### Patterns

- **Pattern \#7 sub-instance recorded** (schema-shape ≠ runtime-lifetime, the Catch 36 mechanism). Under Pattern \#7's "test/audit asserts proxy not invariant" family. Distinct sub-instance from the semantic variant codified at 5b.3a Phase 2.5j-fix; logged as additional instance evidence. **NOT promoted to Pattern \#8 — pattern count UNCHANGED at 8.**
- **Pattern \#7 self-correction instance** — the sessionId fallback-uuid memoization fix flipped an existing test's assertion from `id2 !== id` (mechanism — "regenerate per call") to `id2 === id` (invariant — "single session, one sessionId"). Instance evidence; not counted.

### Topic 2 drifts (+2 — both mine)

- **Drift 23 (closing-time precedent)** — Phase 1 prompt asserted "no fixture impact" for the sim emit change without grounding against the `.json` scenario fixtures that snapshot `expectedTelemetryEvents` deep-equal. The `.jsonl` corpus (terminal-state-only) was correctly identified as byte-stable; the `.json` corpus (telemetry-payload snapshot) was not considered. Surfaced as a halt-and-surface on the first fixture-suite run. Master-dev ratified Path A (surgical re-baseline) — the closing entry's "additive-telemetry-field re-baseline" precedent codification followed.
- **Drift 24 (Step 0(c) wrong ratification)** — confirmed the schema-shape proxy ("device-scoped envelope field") and ratified the "device-scoped, durable" conclusion without walking `clearLocal` against the envelope-shape claim. Codex P1 round 3 surfaced the gap. The proxy was the shape; the invariant was operation-class behavior; Rule 6 amendment now requires the operation-vs-lifetime walk in Step 0.

### 4-finding ceiling state

3 Codex P1s (rounds 1 / 2 / 3) + 1 preventive self-catch (Catch 35). Meta-audit (Phase 2.5g) done PREEMPTIVELY at round 3 — **bent from the 4-finding ceiling** because round 3's P1 was structural (multi-lifetime envelope architecture) rather than tactical (which is what the 4-finding ceiling rule is designed for — patch-loops on the same surface). Round 4 CLEAN. **Closed UNDER ceiling.** Cycle counts as the 3rd meta-audit-adjacent cycle of M1.5 (after 5b.3a Phase 2.5g comprehensive Class A enumeration and 5b.3b Phase 2.5-meta a11y sweep).

### CF closures + openings

- **CF 35 CLOSED** — `onTelemetryEvent` client-pipeline wire-up. emit.ts chokepoint live; both `useRun` `onTelemetryEvent` stubs (createRun + restoreRun paths) routed through `telemetryCapture`; abandon `run_end` TODO at `useRun.ts:480-485` (5b.3b carry) wired through the same capture pipeline; sessionId + anonId enrichment per Phase 1 ratification; batched flush per Phase 2.5 r1; throw-safe transport. **Server-forward to PostHog is CF 49** (NOT this close — M1.5c PR 2).
- **CF 41 CLOSED** — `run_start` telemetry payload `startingRelicId` omission. Schema bump byte-synced (`content-schemas.ts` + `packages/content/src/schemas.ts`); sim emit threads `input.startingRelicId`; 6 `.json` scenario fixtures additively re-baselined (single-field diff per fixture; `.jsonl` byte-stable). Pre-PR-1 disposition was "folds into CF 35"; in-fact landed standalone alongside CF 35 here.
- **CF 49 OPENED (NEW)** — server `/v1/telemetry/batch` endpoint + PostHog forward. Client transport defaults to `fetch` POST `/v1/telemetry/batch` (throw-safe; pre-endpoint state = silent 404 no-op). PR 2 lands server endpoint, request validation (Zod `TelemetryBatchRequest`), PostHog forward + clientVersion auth header, retries / batching policy. → **M1.5c PR 2.**
- **CF 50 OPENED (NEW)** — 4 schema-only telemetry variants have no emit site: `error_boundary_caught` (needs React error boundary; none exists), `tutorial_step_reached` / `tutorial_completed` / `tutorial_abandoned` (needs tutorial system; none exists). Schema variants ratified at M1.4b2.3 + later; wire when those subsystems ship. → **M2** (tutorial M1.5d / M2; error-boundary M2 polish).
- **CF 51 OPENED (NEW)** — tighten `validate.ts` `telemetryAnonId: z.string()` → `z.string().uuid()` post-backfill-window. Today's validator accepts `''` so legacy v1 saves with the empty-string telemetryAnonId stub load cleanly; once enough sessions have completed a first quiescent save (anonId generated + persisted), the stricter validator can land without forcing migration. → **M2.**
- **CF 52 OPENED (NEW)** — separate device-profile envelope from run-save envelope (two-lifetime architectural split). Today the lifetime distinction is encoded in shape only (`inProgressRun: SerializedRunState | null` field inside `LocalSaveV1`); `clearLocal` now preserves device fields via load-mutate-write (Catch 36 closure). Architectural cleanup would split into two storage keys (`pba.device.v1` for device-scoped + `pba.run.v1` for run-scoped) — eliminates the multi-lifetime container entirely and removes the Step-0 amendment burden going forward. → **M2.**
- **CF 53 OPENED (NEW)** — abandon dialog v3 de-reddened treatment (Claude Design v3, verifier-clean — neutral ghost Abandon + auto-focused accent Cancel + explicit-loss copy, no \#DC2626). Ratified at 5b.3b Phase 1 but the in-prod styling could still benefit from one more visual polish pass. → standalone micro-PR or M1.6 ride-along.

### HELD (not counted)

- **Fixture-lock predicate clarification (1st instance)** — the fixture-suite README at `packages/sim/test/fixtures/runs/README.md` now distinguishes trajectory-determinism lock (immutable) from output-schema additivity (re-baselineable). 1st instance held; codify on second-instance per the standing convention.

### Counters (log-walked totals; deltas match)

Re-enumerated by walking `decision-log.md` forward from the 5b.3b-close baseline through this entry's deltas.

| Counter | 5b.3b-close baseline | M1.5c PR 1 deltas | M1.5c PR 1-close total |
|---|---:|---:|---:|
| Predicate-vs-name catches codified | 32 | +4 (Catch 33 / 34 / 35 / 36) | **36** |
| Going-forward rules codified | 13 | 0 (Rule 6 AMENDED, no count change) | **13** |
| Architectural patterns codified | 8 | 0 (Pattern \#7 sub-instance recorded; not promoted) | **8** |
| Master-dev chat drifts (Topic 2) | 22 | +2 (Drift 23 fixture-impact assertion + Drift 24 Step 0(c) device-durable wrong ratification) | **24** |
| Open CFs (enumerated below — canonical) | 37 | -2 closed (CF 35, CF 41) + 5 opened (CF 49 / 50 / 51 / 52 / 53) | **40** |
| 4-finding ceiling state | n/a | 3 Codex P1s + 1 preventive; meta-audit preemptively at 3 (bent from 4); round-4 clean → closed under-ceiling | — |

No tally drift vs the working baseline (32/13/8/22/37) — matches the M1.5b PR 3 / 5b.3b CLOSED entry's final-counter table exactly.

### Open CF enumeration (one bullet per CF, no consolidation — canon rule)

Walked from the 5b.3b CLOSED enumeration (36 + CF 48 = 37 baseline), applying this PR's -2 closures + 5 openings.

**M1.4-era (21 open, unchanged from 5b.3a CLOSED):**

- CF 2 — Real character art in portraits → M2.
- CF 3 — Real particle sprite sheets → post-M1.
- CF 4b — `recipe_combine` event VFX (sim-emission-blocked) → M2 content sweep.
- CF 5 — Music + SFX integration → post-M2.
- CF 6 — Custom cubic-bezier easing function → M2 if designer flags.
- CF 7 — BitmapText / pre-rasterized font atlas → post-M1 if floater spawn rate saturates.
- CF 8 — `>>` fast-forward indicator visual styling → M2 polish.
- CF 9 — Telemetry event for "fast-forward triggered" → if `telemetry-plan.md` § 4 surfaces need.
- CF 10 — Configurable per-user playback speed → M2+.
- CF 11 — SKIP scene-level direct unit test coverage precedent → revisit if SKIP regresses.
- CF 12 — Combat chunk Vite build non-determinism (~0.75 kB raw drift) → tracked.
- CF 13 — Generation-side ghost-loadout filter → M2 ghost storage rework.
- CF 16 — Server-side ghost record → M2.
- CF 17 — Auto-rearrange hint affordance → M3.
- CF 18 — Per-round trophy schedule + contract modifiers + win-streak multipliers → M2.
- CF 19 — `RarityGem` for shop rarity dot → carries from M1.3.2.
- CF 20 — `apps/client/src/index.css` `.glow-*` rgba palette derivatives → carries.
- CF 22 — State-driven bag dimensions through pure helpers → M2.
- CF 23 — Real-device drag-state screenshot capture → still carried.
- CF 24 — Player portrait dying-state visual feedback → M2.
- CF 30 — Particle-count consts promotion (§ 4.5 R2 spirit-extension sweep) → M2 telemetry-driven tuning.

**M1.5a-era (6 open; CF 35 CLOSED this PR):**

- CF 32 — Expand mid/boss relic content to 3+ per class per slot → M1.6+ content fill or M2 polish.
- CF 33 — Sim `state.ts` combat-coupling refactor for cleaner lazy-boundary → M2 architectural cleanup.
- CF 34 — Gold/rerollCount/bag/shop authority migration to sim — AMENDED Phase 2.5h (B-F3 + E-F9). → 5b.3b-or-beyond carry; reconsider scope at M1.5c PR 2 / M1.5d.
- CF 36 — `enterCombatPhase` consolidation surface → opportunistic M1.5b/M1.5c client refactor.
- CF 37 — `recipesRegistry` sim-default vs client-filter divergence → revisit alongside CF 34.
- CF 38 — Resolution panel reward display sync (gold + trophy axes) → M2 polish.

M1.5a-era closures this PR: **CF 35** (telemetry pipeline wire-up; client half landed; server-forward = CF 49).

**M1.5b PR 1-era (4 open; CF 41 CLOSED this PR):**

- CF 40 — `contractName` + `contractText` hardcoded literals at `createInitialState` → M2 contract system or first non-neutral contract.
- CF 42 — `buildCombatInput.startingHp: 30` Rule 6 violation → first M1 item with `maxHpBonus` ships.
- CF 43 — `buildCombatInput.recipeBornPlacementIds` omission (Tinker recipe-bonus no-op) — AMENDED Phase 2.5h (E-F6). → 5b.3b-or-beyond carry; reconsider at M1.5c PR 2 / M1.5d.
- CF 44 — Mid + boss relic named glyphs (6 placeholder diamonds) → M2 visual polish.

M1.5b PR 1-era closures this PR: **CF 41** (run_start startingRelicId schema + emit).

**M1.5b PR 3 / 5b.3a-era (3 open, unchanged):**

- CF 45 — Client placement-id minting non-deterministic — AMENDED Phase 2.5h (B-F4). → M2 `/v1/replay/validate`.
- CF 46 — Forward-version save clobber on downgrade. → schema-bump territory, M2 likely.
- CF 47 — Zod main-chunk bundle delta (+19.65 kB gz / +24%). → M2 mobile-perf pass.

**M1.5b PR 3 / 5b.3b-era (1 open, unchanged):**

- CF 48 — `RunEndScreen` + modal-equivalent a11y (no auto-focus on terminal-outcome mount; siblings not `inert` when modal-equivalent open). → M2 polish.

**M1.5c PR 1-era (5 OPENED this PR):**

- **CF 49 NEW** — Server `/v1/telemetry/batch` endpoint + PostHog forward. Client transport defaults to throw-safe POST; pre-endpoint = silent 404 no-op. Endpoint lands request validation (Zod `TelemetryBatchRequest`), PostHog forward + clientVersion header, retries/batching policy. → **M1.5c PR 2.**
- **CF 50 NEW** — 4 schema-only telemetry variants (`error_boundary_caught`, `tutorial_step_reached`, `tutorial_completed`, `tutorial_abandoned`) have no emit site. Wire when those subsystems ship. → **M2** (tutorial M1.5d/M2; error-boundary M2 polish).
- **CF 51 NEW** — Tighten `validate.ts` `telemetryAnonId: z.string()` → `.uuid()` after the backfill window (enough sessions have generated + persisted a real uuid). → **M2.**
- **CF 52 NEW** — Architectural split: separate device-profile envelope from run-save envelope (two-lifetime → two-storage-keys). Eliminates the multi-lifetime container entirely; removes the Rule 6 amendment's Step-0 walk burden for this surface going forward. → **M2.**
- **CF 53 NEW** — Abandon dialog v3 visual polish pass (de-reddened treatment ratified at 5b.3b Phase 1; one more polish pass on the in-prod styling). → standalone micro-PR or M1.6 ride-along.

**ENUMERATED TOTAL: 40 open CFs.** Walks: 21 + 6 + 4 + 3 + 1 + 5 = 40. ✓

### Post-M1.5c-PR-1 pre-flags (M1.5c PR 2 + close)

- **M1.5c PR 2 — server `/v1/telemetry/batch` endpoint** (CF 49). Zod request validation; PostHog forward; rate-limit / batching policy; integration test against the client's default transport. Branch off `fb42abe`.
- **CF 35 + CF 49 together close the M1.5c telemetry milestone.** M1.5c-CLOSE pends CF 49 landing.
- **Rule 6 amendment application** is immediate: every M1.5c PR 2 + M1.5d Step 0 walks lifetime classes × runtime operations for any multi-lifetime container touched (server's PostHog forward state, M1.5d's run-end / restart surfaces, etc.).
- **CF 53 micro-PR window:** if a polish pass fits, slot before M1.5c PR 2 ratification.

---

## 2026-05-21 — M1.5b PR 3 / 5b.3b CLOSED (abandon-run UI; client-side outcome flip; Codex 4-finding ceiling tripped → meta-audit → terminal clean)

### Framing

5b.3b ships the abandon-run UI surface — first concrete client-side trigger for `outcome === 'abandoned'`. Dedicated `abandon_run` reducer arm (outcome flip, 7 RunEndScreen fields preserved); `abandonRun` dispatcher (`clearLocal()` + dispatch, simRun PRESERVED); save-on-quiescent guarded to clear on all terminal outcomes; ⋯ overflow trigger + confirm dialog (desktop) / bottom-sheet (mobile) per locked v3; full keyboard/focus/ARIA contract. Closes M1.5b PR 3. (M1.5b-milestone-close pends the CF 35 telemetry-milestone scope question — see Carry-forwards.)

### Branch + commit topology

Branch: `m1.5b-pr3-5b.3b-abandon-run` off main `4a704ac` (5b.3a-close baseline). 16 atomic branch commits from `git log --oneline 4a704ac..HEAD`:

| SHA | Phase | Scope |
|---|---|---|
| `29077fb` | Preamble | docs(decision-log): opening — \#DC2626 destructive-accent REJECTED (SETTLED) + abandon_run client-side flip (PROVISIONAL) |
| `58fd4b4` | Phase 1 | docs(decision-log): halt-gate RATIFIED (provisional → settled) |
| `b2c2442` | Phase 2 Step 1 | feat(run): abandon_run reducer arm — client-side outcome flip preserving 7 RunEndScreen fields |
| `ea24987` | Phase 2 Step 2 | feat(run): abandonRun hook callback + supersede L447-448 comment; simRun preserved |
| `439ba25` | Phase 2 Step 3 | feat(run): AbandonRunMenu overflow trigger + confirm dialog + bottom-sheet (v3 locked) |
| `bfaa352` | Phase 2 Step 4 | feat(hud): wire AbandonRunMenu into TopBar (post-trophy + hairline divider) + MobileTopBar (right-cluster wrap) |
| `8c72948` | Phase 2 Step 5 | test(run): abandon full-flow integration + 4-state visual-playtest DOM capture |
| `8e93e1f` | Phase 2.5 r1 | fix(run): gate save-on-quiescent on client outcome (Codex P1 resurrection) |
| `5387582` | Phase 2.5 r1 | fix(run): AbandonRunMenu sheet minHeight `max(35vh, 295px)` floor (Codex P2) |
| `7b26d31` | Phase 2.5 r1 | test(run): no-resurrection + natural-terminal + sheet-floor regressions |
| `10daaab` | Phase 2.5 r2 | fix(run): viewport-conditional aria-haspopup / aria-controls / aria-expanded + ids (Codex P2) |
| `e221b6c` | Phase 2.5 r2 | test(run): aria contract per viewport + bump lazy-boundary timeout (round-2 mitigation) |
| `ad366e4` | Phase 2.5 meta | fix(run): A.1 remove global Enter handler + A.2 complete focus trap (bidirectional + menu) + A.3 scrim aria-hidden |
| `e6bdedd` | Phase 2.5 meta | feat(run): A.4 focus-visible CSS rule on trigger + confirm buttons |
| `3f65b6f` | Phase 2.5 meta | docs(run): C.1 abandon_run combatActive-inert inline note |
| `46cfbac` | Phase 2.5 meta | test(client): D surgical timeout — revert global, per-call `{ timeout: 3000 }` on 10 lazy-RunEndScreen waits |

`--no-ff` merge commit on main pending (Step 2 of this entry's authoring prompt).

### Phase trajectory

Phase 1 halt-gate (RATIFIED clean; `abandon_run` supersedes the PR 2 "reset_run-reused-as-abandon" phrasing) → Phase 2 (5-step impl) → Phase 2.5 round 1 (Codex P1 resurrection + P2 sheet floor) → Phase 2.5 round 2 (Codex P2 aria-haspopup) → Codex round 3 (P2 Enter) = 4th finding → 4-finding ceiling tripped → comprehensive pre-merge meta-audit (enumerate-ratify-batch, READ-ONLY enumeration then atomic-commit batch fix) → Codex round 4 CLEAN ("Didn't find any major issues 🎉").

### Codifications

- **Catch 27 (Class C2)** — client-flip-outcome vs sim-authoritative-serializer divergence defeating clearLocal. Fix: save-on-quiescent gates on client `state.state.outcome !== 'in_progress'` → `clearLocal()` + bail. Closes the P1 resurrection mechanism.
- **Catch 28 (Class A)** — adjacent-comment-vs-implementation inversion: mobile sheet `min(35vh, 295px)` where the touch-target comment intended a floor (`min()` picks the SMALLER value). Fix: `max(35vh, 295px)`.
- **Catch 29 (Class A)** — advertised-vs-actual: `aria-haspopup="dialog"` on a desktop trigger whose IMMEDIATE popup is `role="menu"` (the dialog is the menu's onward chain, not the trigger's direct popup). Fix: viewport-conditional via `useViewport`.
- **Catch 30 (Class A)** — global window Enter handler defeats native focused-button activation; Tab-to-Abandon-then-Enter cancels instead of confirming. Fix: remove the handler; auto-focused Cancel preserves "Enter on open = Cancel" structurally.
- **Catch 31 (meta-audit SELF-CATCH)** — incomplete focus trap (Cancel+Tab AND Confirm+Shift+Tab both escape natively to elements behind the scrim; no Tab trap in menu state at all). Surfaced by the meta-audit sweep, NOT Codex — validation that the meta-audit preempts what would have been Codex finding 5 / 6. Fix: bidirectional wrap in confirm state + Tab handler moved out of confirm-only branch so menu-state trap also fires.
- **Catch 32 (Class C2 / test-env, 2nd instance — CODIFIED)** — `findByTestId` waits on a `React.lazy` boundary flake under concurrent vitest pool contention. First instance: PR 2 F.3 latent-flake (`decision-log.md` 2026-05-19 § M1.5b PR 2 closing log "F.3 latent-flake; antidote candidate logged"). Antidote applied: per-call `{ timeout: 3000 }` at the 10 lazy-wait sites + global `asyncUtilTimeout` reverted to TL default (surgical, not blunt mask).
- **Pattern 8 (NEW codified — ordinal 8 of codified patterns)** — interactive-overlay a11y contract gaps surface reactively one-at-a-time when not holistically audited at design/build time. (Three of four Codex findings this PR were AbandonRunMenu a11y, surfaced across three reactive rounds; the meta-audit catalog found Catch 31 + scrim aria + focus-visible in one sweep.) **Numbering note:** the candidate label space is separate from the codified ordinal space. Held candidates #8 (M1.5b PR 1 — master-dev factual-claim source-verify) and #9 (M1.5b PR 2 — skip-with-replacement-invariant) remain held; the new codified Pattern 8 is interactive-overlay-a11y, unrelated to either candidate slot. Renumbering held candidates is out of scope.
- **Rule 12 (NEW)** — any new interactive / overlay component (modal, sheet, menu, popover, tooltip with focusable content, etc.) carries a full keyboard + focus + ARIA contract audit as a Phase 2 DoD item — covering: trigger ARIA per immediate-popup role/state, focus trap in both directions, auto-focus on mount, focus return on every close path (cancel/scrim/Esc/confirm), Enter/Space activation per focused element (no global key hijacks), Esc cancels, scrim `aria-hidden`, focus-visible indicator on all focusable elements. Antidote to Pattern 8.
- **Rule 13 (NEW)** — close-gate test runs include N≥3 full-workspace runs under COLD turbo cache (`--force`), not just isolation passes or warm-cache runs. Antidote to Catch 32 / F.3 lineage — single-file and warm-cache passes hide the lazy-boundary timing class. The `--concurrency=1` clause stays as the happy-dom OOM mitigation (additive, not substitutive).
- **Topic 2 drift +2** —
  - **Drift 21 (Phase 1 sequencing — already recorded in `decision-log.md` 2026-05-21 § 5b.3b Phase 1 halt-gate RATIFIED):** Phase 1 prompt referenced an un-landed decision-log entry as already-on-branch; halt-and-surface caught it. Corrected by re-issued prompt's preamble fold.
  - **Drift 22 (closing-time):** Phase 1 ratification over-asserted clearLocal-on-abandon sufficiency without tracing the save-on-quiescent re-fire on the `state.state.outcome` dep — the re-fire wrote a stale in_progress save over the clearLocal, surfaced reactively as Codex P1. The trace was structurally available at Phase 1 (the effect's deps were already shipped) but wasn't walked.

### HELD candidates (not codified)

- **Going-forward candidate** "trace effects that re-fire on the state a clear/persist hook precedes" — 1st instance (Drift 22 mechanism). Codify on second instance. Would have caught Catch 27 at Phase 1.
- **Going-forward candidate** "assert-invariant-not-mechanism" test rewrites — 2 instances this PR ("exactly once" clearLocal call-count → no-resurrection end-state invariant; "Enter triggers Cancel" call-count → focused-button-activation behavior invariant). Second-instance watch — codify on next-PR instance per the standing two-distinct-PRs convention.

### Carry-forwards

- **CF 48 OPENED (NEW)** — `RunEndScreen` + modal-equivalent a11y: no auto-focus on terminal-outcome mount (focus falls to `document.body` after any abandon/win/eliminate, all three outcomes); siblings not `inert` when modal-equivalent open. The completed Phase 2.5-meta focus trap + `aria-modal="true"` mitigate but don't fully discharge. → M2 polish. (A.5 + A.6 from the meta-audit catalog, bundled.)
- **CF 35 OPEN (unchanged scope question)** — `onTelemetryEvent` client-pipeline wire-up. Abandon `run_end` emit rides dormant: comment-only `TODO(CF 35)` at the `abandonRun` dispatcher (`useRun.ts:480-485`) carrying the `{outcome:'abandoned', roundReached:state.state.round, heartsRemaining:state.state.hearts}` payload shape per `telemetry-plan.md:54-57`. **M1.5b-milestone-close scope question:** confirm whether the CF 35 telemetry milestone is in-M1.5b (→ M1.5b not yet closed; PR 3 is the second-to-last) or re-scoped (→ update CF 35 tag and close M1.5b at this PR's merge). Resolve at next scoping.
- **CF 34 / 43 / 45 / 46 / 47 untouched** — abandon DISCARDS, does not restore. No restore-side work pulled in.

### Counters (log-walked totals; deltas match)

Re-enumerated by walking `decision-log.md` forward from the 5b.3a-close baseline (Catches 26 / Rules 11 / Patterns codified 7 / Topic-2 drifts 20 / Open CFs 36) through the on-disk 5b.3b Phase 1 ratification entry (drifts +1 → 21) and this closing entry's deltas. No baseline discrepancies.

| Counter | 5b.3a-close baseline | 5b.3b deltas (this PR) | 5b.3b-close total |
|---|---:|---:|---:|
| Predicate-vs-name catches codified | 26 | +6 (Catch 27 / 28 / 29 / 30 / 31 / 32) | **32** |
| Going-forward rules codified | 11 | +2 (Rule 12 / Rule 13) | **13** |
| Architectural patterns codified | 7 | +1 (Pattern 8 — interactive-overlay-a11y; ordinal 8) | **8** |
| Master-dev chat drifts (Topic 2) | 20 | +2 (Drift 21 Phase 1 sequencing + Drift 22 closing-time clearLocal over-assert) | **22** |
| Open CFs (canonical enumeration) | 36 | +1 (CF 48 opens; no closures) | **37** |
| 4-finding ceiling state | n/a | tripped 4/4 → meta-audit → terminal clean (cycle complete) | — |

**4-finding ceiling cycle (canonical record):** 2nd meta-audit cycle of the project; first was 5b.3a Phase 2.5g (Class A persistence-validator enumeration). 5b.3b's cycle: 4 reactive Codex findings (P1 resurrection / P2 sheet floor / P2 aria-haspopup / P2 Enter) tripped the ceiling → READ-ONLY enumeration sweep cataloged A.1–A.6 + B + C.1 + D → atomic-commit batch landed A.1/A.2/A.3 + A.4 + C.1 + D (A.5/A.6 → CF 48) → Codex round 4 clean. Validates the ceiling-rule's predictive power for the second time.

### Post-5b.3b-close pre-flags (M1.5b PR 4 + close)

- **CF 35 telemetry milestone scope question** is the gating decision for whether M1.5b closes at PR 3 merge or extends to a PR 4. Address at next scoping fresh chat.
- **Pattern 8 / Rule 12 application** lands at the next interactive/overlay surface introduced (likely M2 polish or M2 content surfaces).
- **Rule 13 application** is immediate: all close-gates from here forward run N≥3 cold under `--force --concurrency=1`.

---

## 2026-05-21 — M1.5b PR 3 / 5b.3b Phase 1 architectural halt-gate RATIFIED (provisional → settled)

Step 0 (read-only, branch 29077fb) returned zero contradictions. All three pivots RATIFY against shipped code.

abandon_run arm — RATIFIED. Supersession confirmed verbatim: reset_run returns INITIAL_CLIENT_STATE → createInitialState('tinker') which sets outcome:'in_progress' and wipes all 8 fields RunEndScreen reads (RunController.ts:473-474/:93/:107-109). Dispatching reset_run as abandon routes RunProvider to ClassSelectScreen (simRun===null && pendingRunInput===null, RunContext.tsx:70-75), never RunEndScreen ABANDONED. Dedicated abandon_run arm required: sets outcome:'abandoned' while PRESERVING the other 7 display fields (NO createInitialState). Gate keys off outcome !== 'in_progress' (single boolean via mirrorsSimShouldEndRun, runEnd.ts:22-24; useRun.ts:436) — no separate client flag. Superseded comment at useRun.ts:447-448 corrected in Phase 2.

simRun-preservation contract — abandonRun callback does clearLocal() + dispatch abandon_run ONLY; it must NOT setSimRun(null)/setPendingRunInput(null) (that is resetRun's contract, whose destination is ClassSelect). Abandon's destination is RunEndScreen ABANDONED, which requires simRun !== null to pass RunProvider's first block.

clearLocal-on-abandon — RATIFIED. Dispatcher wrapper calls clearLocal() BEFORE dispatch, mirroring resetRun (useRun.ts:456). clearLocal idempotent/safe-on-missing-save (missing-adapter no-op + try/catch + spec-idempotent removeItem; storage.ts:108-117; tests persistence.test.ts:956/970/991). Prevents reload-resurrection between abandon-confirm and RunEndScreen mount.

telemetry — RATIFIED dormant, REFINED shape. Open-item-1 ("real stubbed onTelemetryEvent call-site") refined by Step 0 item 6: abandon never reaches sim under the client-side-flip lean, so no sim onTelemetryEvent path exists to stub. A real stub = net-new prop-threaded client plumbing, zero runtime, that CF 35's unified pipeline would have to reconcile. Refined disposition: comment-only TODO(CF 35) at the abandon dispatcher carrying run_end{outcome:'abandoned', roundReached:state.state.round, heartsRemaining:state.state.hearts} (telemetry-plan.md:54-57). Lower surface, lower future cost. "Defer shape to Step 0" worked as designed.

Mobile layout (Phase 2 structural choice) — RATIFIED. MobileTopBar uses justify-between with two children (left cluster + OpponentSilhouette, MobileTopBar.tsx:53-89). ⋯ trigger wraps with OpponentSilhouette in a new right-side flex cluster so justify-between doesn't separate them — consistent with v3 "past the ghost+sword+shield cluster." Desktop: ⋯ as new sibling after the trophy display in the right cluster (TopBar.tsx:55-56) with the v3 hairline divider so it never reads as a stat.

Counters: no new catches/rules/patterns this gate (clean). Topic 2 drift +1 (→21) for the prior-turn sequencing error (Phase 1 prompt referenced a decision-log entry as already-landed on an uncut branch; corrected by folding the docs preamble into the re-issued prompt). CF 35 stays open (dormant emit). No CF closures. Final snapshot at PR close.

---

## 2026-05-21 — M1.5b PR 3 / 5b.3b open: #DC2626 destructive-accent REJECTED (SETTLED)

Abandon confirm dialog uses a neutral low-emphasis ghost button (border-default #2D3854 / text-secondary #94A3B8, hover → text-primary #F0F4FA), NOT a #DC2626 danger color. Destructive weight is carried structurally — auto-focused accent Cancel ("Keep playing", filled #3B82F6, Enter-triggers) + explicit-loss copy ("Your bag, relics, trophies, and contract progress will be lost.") — not by a new color token. Per visual-direction.md § 3 (only life-red + coin-gold approved; "No other extensions without a decision-log.md entry") + 2026-04-26 precedent (rejected third semantic extension; victory CTA → accent blue). No new token added. Claude Design v3 verifier-clean; design pass closed.

---

## 2026-05-21 — M1.5b PR 3 / 5b.3b: abandon_run client-side flip (PROVISIONAL → ratify at Phase 1 gate)

Lean: outcome === 'abandoned' flips CLIENT-SIDE via a DEDICATED abandon_run reducer arm — not sim abandonRun(), not reset_run overloaded with an outcome param. RunProvider's terminal-outcome gate (outcome !== 'in_progress') routes to the already-specced RunEndScreen ABANDONED variant (do NOT rebuild). abandon_run must (a) preserve terminal display state for the summary and (b) invoke the 5b.3a clearLocal so a reload cannot resurrect the run.

SUPERSESSION FLAG: this revises the imprecise PR 2 Phase 1 disposition ("reset_run reused as abandon handler", 2026-05-19). reset_run returns createInitialState() — it resets outcome to in_progress (routes to ClassSelectScreen, not ABANDONED) and destroys the state the summary reads. reset_run is the new-run/restart handler; abandon needs its own arm. Phase 1 gate to confirm against shipped reducer + RunProvider code; halt if refuted.

OUT (stay deferred — abandon DISCARDS, doesn't restore): CF 34, CF 43, CF 45. Telemetry: CF 35 pipeline open/unwired; abandon run-end emit call-site rides dormant per telemetry-plan.md until CF 35 lands (confirm disposition at gate).

---

## 2026-05-21 — M1.5b PR 3 / 5b.3a CLOSED (LocalSaveV1 persistence core; Class A closed structurally via Zod schema-derived validator; 5b.3b abandon-run remains for M1.5b PR 3 / M1.5b close)

### Framing

**5b.3a closes this entry.** PR \#18 (`m1.5b-pr3-localsave-v1`) merged into `main` via `--no-ff` at merge commit `5ce6175cee5b435402d564b617619bce9e64d216` on 2026-05-21T23:39:41Z. The LocalSaveV1 persistence core ships — schema authored as `SerializedRunState`, sim `getRngState` + `restoreRun` + `RestoreRunOptions` exposed, real `startedAt` timestamp, client persistence layer + migration scaffold, save-on-quiescent + load-on-mount + clearLocal-on-reset wiring, schema-derived structural validator (Zod), three-layer safety (schema + dual-`satisfies` + restoreRun try/catch), verbatim-shop restore (Phase 2.5h Catch 23), terminal RNG seeding, cross-version restore field-divergence fix (Phase 2.5j-fix Catch 26), relic-slot semantic validation (Phase 2.5j-fix Codex finding B).

**5b.3a is NOT the M1.5b PR 3 / M1.5b close.** 5b.3b — the abandon-run UI surface (first concrete client-side trigger for `outcome === 'abandoned'`) — remains. 5b.3b closes M1.5b PR 3 + M1.5b. Branch off `5ce6175` for 5b.3b.

### Branch + commit topology

- Branch: `m1.5b-pr3-localsave-v1` off main `49f7437` (post-M1.5b-PR-2-merge baseline).
- Final branch tip: `86b626f` (28 atomic branch commits).
- `--no-ff` merge commit: `5ce6175cee5b435402d564b617619bce9e64d216` on `main`.
- GitHub: PR \#18 closed, merged. (Bare hashes escaped per Rule 10 — "PR \#18".)

### Phase trajectory (28 branch commits)

Phase 1 (design + ratification) → Phase 2 (7-commit implementation body) → master-dev pre-push gate (Catch 19 remediation `d4fd27c`) → Codex P1+P2 round 1 (Phase 2.5 — Catch 20 race + Catch 21 throw-safety) → Phase 2.5g meta-audit (4/4 ceiling tripped → comprehensive Class A enumeration close) → Phase 2.5h (Catch 22 version-only-validation + Catch 23 non-terminal-seed-via-mis-sourced-save + CF 46 NEW + Pattern \#7 2nd-instance accumulation) → Phase 2.5i (Catch 24 Class A residual + Rule 11 NEW + Pattern \#7 codified at 3rd instance) → Phase 2.5j (Zod schema-derived validator + Catch 25 Class A batch structural close + Rule 11 AMENDED to schema-derived + Pattern \#7 4th instance + tech-arch § 6.3/6.4 amendment) → **Phase 2.5j-fix TERMINAL reactive round** (Catch 26 cross-version restore field divergence + Rule 11 clarified [structural ≠ semantic completeness] + Pattern \#7 5th instance — first SEMANTIC variant; sub-pattern codified UNDER Pattern \#7, NOT promoted to Pattern \#8 + CF 47 NEW bundle-size deferred → Codex CLEAN → master-dev merge authorization).

### Class A / 4-finding ceiling cycle (canonical record)

The 4-finding ceiling tripped at Phase 2.5g → meta-audit comprehensive Class A enumeration → Phase 2.5h delivered structural fixes (Catch 22 + 23) → Codex round 2 surfaced finding 5 → Phase 2.5i remediated (Catch 24 + Rule 11) → Codex round 3 surfaced findings 6 / 7 / 8 (same Pattern \#7 enumeration-fragility class) → Phase 2.5j structural close via Zod (Catch 25 + Rule 11 AMENDED) → Codex terminal round surfaced findings A / B (different classes, neither Class A) → Phase 2.5j-fix closed both → Codex CLEAN. **Cycle complete.** The structural fix (Zod schema-derived validator + dual-`satisfies` bracket) makes Pattern \#7 structural variant unrecurrable on this surface by construction. Pattern \#7 semantic-variant sub-pattern codified at Phase 2.5j-fix: when a registry-typed field carries per-field semantic constraints beyond type + registry membership (slot, classAffinity, tier, etc.), each constraint needs an explicit `.refine` clause; dual-`satisfies` does not prove semantic completeness.

### Final counter snapshot

| Counter | Pre-5b.3a (post-M1.5b-PR-2-close) | Post-5b.3a |
|---|---:|---:|
| Predicate-vs-name catches codified | 18 | **26** (+8 net: Catch 19 types-only-package-runtime-leak; +20 P1 race; +21 P2 throw-safety; +22 version-only-validation; +23 non-terminal-seed-via-mis-sourced-save; +24 Class A residual; +25 Class A batch structural close; +26 cross-version restore field divergence) |
| Going-forward rules codified | 10 | **11** (+1: Rule 11 complete-contract structural validation, codified Phase 2.5i, AMENDED Phase 2.5j to schema-derived, CLARIFIED Phase 2.5j-fix structural ≠ semantic completeness) |
| Architectural patterns codified | 6 | **7** (+1: Pattern \#7 test/audit-asserts-proxy-not-invariant, codified at Phase 2.5i 3rd instance per `decision-log.md` 2026-05-21 § Phase 2.5i § Pattern \#7 — 3rd instance (codified). Phase 2.5j-fix added semantic-variant SUB-PATTERN under Pattern \#7; not promoted to Pattern \#8 this round.) |
| Master-dev chat drifts (Topic 2) | 20 | **20** (unchanged this PR) |
| 4-finding ceiling state | 0/4 | tripped → meta-audit → terminal-round-closed-clean (cycle complete) |
| Open CFs (enumerated below — canonical) | 30 | **36** |

**Tally-drift lesson (recorded as one-line discipline note, not a new rule):** the running CF counter "32" carried into this turn drifted from the true enumeration "36" — a proxy-vs-invariant instance applied to counter-keeping itself. Enumeration is canonical; the count is a derived quantity. Re-enumerate the CF list at each handoff rather than carrying a bare count forward — codify on second-instance per Rule 11's structural-over-procedural antidote (the proxy that drifted here was the count itself).

### Open CF enumeration (one bullet per CF, no consolidation — canon rule)

Grep of decision-log for explicit closure entries on CF 2 / CF 3 / CF 5 / CF 11: **zero matches**. All four remain open per canon — no implicit retirement. Enumeration walked forward from M1.4 close (26 carry-forwards) through every subsequent open / close entry; total 36 confirmed.

**M1.4-era (21 open) — from M1.4-close enumeration minus subsequent explicit closures:**

- CF 2 — Real character art in portraits → M2.
- CF 3 — Real particle sprite sheets → post-M1.
- CF 4b — `recipe_combine` event VFX (sim-emission-blocked) → M2 content sweep when sim emits the event. (CF 4a `item_trigger` closed M1.4b2.3.)
- CF 5 — Music + SFX integration → post-M2.
- CF 6 — Custom cubic-bezier easing function → M2 if designer flags.
- CF 7 — BitmapText / pre-rasterized font atlas → post-M1 if floater spawn rate saturates Phaser glyph cache.
- CF 8 — `>>` fast-forward indicator visual styling → M2 polish.
- CF 9 — Telemetry event for "fast-forward triggered" → if `telemetry-plan.md` § 4 surfaces need.
- CF 10 — Configurable per-user playback speed → M2+.
- CF 11 — SKIP scene-level direct unit test coverage precedent → revisit if SKIP regresses.
- CF 12 — Combat chunk Vite build non-determinism (~0.75 kB raw drift) → tracked.
- CF 13 — Generation-side ghost-loadout filter → M2 ghost storage rework.
- CF 16 — Server-side ghost record → M2.
- CF 17 — Auto-rearrange hint affordance → M3.
- CF 18 — Per-round trophy schedule + contract modifiers + win-streak multipliers → M2.
- CF 19 — `RarityGem` for shop rarity dot → carries from M1.3.2.
- CF 20 — `apps/client/src/index.css` `.glow-*` rgba palette derivatives → carries.
- CF 22 — State-driven bag dimensions through pure helpers → M2.
- CF 23 — Real-device drag-state screenshot capture → still carried.
- CF 24 — Player portrait dying-state visual feedback (M1.4b2.2 partial closure — damage portrait hit-flash landed; progressive HP-curve tint still absent) → M2.
- CF 30 — Particle-count consts promotion (§ 4.5 R2 spirit-extension sweep) → M2 telemetry-driven tuning.

M1.4-era explicit closures since M1.4 close: CF 14 (M1.5a PR 3 Phase 2c), CF 15 (M1.5a PR 1 Phase 2), CF 21 (M1.5b PR 2), CF 27 (M1.5 retro), CF 31 (2026-05-07).

**M1.5a-era (7 open):**

- CF 32 — Expand mid/boss relic content to 3+ per class per slot for consistent 1-of-3 UI pattern → M1.6+ content fill or M2 polish.
- CF 33 — Sim `state.ts` combat-coupling refactor for cleaner lazy-boundary → M2 architectural cleanup.
- CF 34 — Gold/rerollCount/bag/shop authority migration to sim — **AMENDED Phase 2.5h:** closure must re-handle (a) sim restore bag-empty initialization at `state.ts:319-322` (B-F3 — currently forced empty; restore must read `restoreFrom.bag.placements` when sim regains bag authority); (b) `nextPlacementCounter` reset at `state.ts:258` (E-F9 — currently defaults to 0; must initialize past the highest saved placementId to avoid uid collision). → 5b.3b or beyond.
- CF 35 — `onTelemetryEvent` client-pipeline wire-up (~16 telemetry event types) → M1.5b telemetry milestone.
- CF 36 — `enterCombatPhase` consolidation surface (multiple call sites in `useRun.ts`) → opportunistic M1.5b client refactor.
- CF 37 — `recipesRegistry` sim-default vs client-filter divergence → revisit alongside CF 34 if combine detection moves sim-side.
- CF 38 — Resolution panel reward display sync (gold + trophy axes) → M2 polish.

M1.5a-era explicit closures since M1.5a: CF 39 (M1.5b PR 1 Phase 2 D close).

**M1.5b PR 1-era (5 open):**

- CF 40 — `contractName` + `contractText` hardcoded literals at `createInitialState` → M2 contract system or first non-neutral contract.
- CF 41 — `run_start` telemetry payload `startingRelicId` omission → folds into CF 35 scope at M1.5b telemetry milestone.
- CF 42 — `buildCombatInput.startingHp: 30` Rule 6 violation (no current `passiveStats.maxHpBonus` items) → first M1 item with `maxHpBonus` ships.
- CF 43 — `buildCombatInput.recipeBornPlacementIds` omission (Tinker class passive + Pocket Forge + Catalyst + Worldforge Seed silently no-op in client-side combat) — **AMENDED Phase 2.5h:** restore loses sim's `bornFromRecipe` Set mid-round (E-F6); Set isn't JSON-roundtrippable; closure must persist + restore the membership (likely as `bornFromRecipe: PlacementId[]` array in `SerializedRunState`, schema-bump territory). → 5b.3b.
- CF 44 — Mid + boss relic named glyphs (6 placeholder diamonds: `resonant-anchor`, `catalyst`, `worldforge-seed`, `berserkers-pendant`, `crimson-pact`, `conquerors-crown`) → M2 visual polish.

**M1.5b PR 3 / 5b.3a-era (3 open):**

- CF 45 — Client placement-id minting non-deterministic (`b${Date.now()+Math.random()}` at `useRun.ts:56-58`) — **AMENDED Phase 2.5h:** adjacent finding B-F4 — client reducer arm mints fresh shop-slot uids on restore (`s${currentRound}-${rerollsThisRound}-${i}`) rather than preserving from saved payload; `SerializedRunState` doesn't include slot uids; closure should consider bundling slot-uid preservation into the same authority pass. → M2 `/v1/replay/validate`.
- CF 46 — Forward-version save clobber on downgrade. `apps/client/src/persistence/migrations/index.ts` returns null for `schemaVersion === N>1`; fresh-run path runs; next quiescent save overwrites forward-version payload irreversibly. Mitigation options at closure: (a) backup under `pba.v2.save.preserved`; (b) refuse to write until user explicit-abandon; (c) version-tagged migration chain with explicit downgrade-failure UX. → schema-bump territory, M2 likely.
- **CF 47 NEW this round (Phase 2.5j-fix)** — Zod main-chunk bundle delta. Phase 2.5j Zod rewrite added +71.71 kB raw / +19.65 kB gzip to the main chunk (+27% / +24%). Accepted at Phase 2.5j as the cost of Class A structural closure. Long-term: main chunk shouldn't carry the full Zod runtime. Alternatives at closure: code-split `validate.ts` into the load-on-mount dynamic-import boundary; switch to a smaller schema lib (Valibot ~2 kB, ArkType ~10 kB gz); hand-rolled schema generator from TS types at build time (e.g. typia, ts-runtime, zod-from-ts). → M2 mobile-perf pass OR first user-visible TTFI complaint attributable to validator chunk.

**ENUMERATED TOTAL: 36 open CFs.** This count is canonical; supersedes the running-counter "32" carried forward from prior closing entries.

### M1.5b PR 3 / M1.5b post-5b.3a pre-flags

- **5b.3b — abandon-run UI surface.** First concrete client-side trigger for `outcome === 'abandoned'`. Closes M1.5b PR 3 + M1.5b. Branch off `5ce6175`.
- **Orphan `.gitignore` chore** — unstaged `.gitignore` modification from Phase 2.5 `1fd5424` (pattern presumably adds the `vite.config.ts.timestamp-*.mjs` ignore that paired with the orphan-tempfile deletion that turn). Pick up at 5b.3b ride-along or independent chore commit.
- **Dev-env CA-cert hardening** — Phase 2.5j installed Zod via `pnpm add --config.strict-ssl=false` workaround for the corporate-cert TLS chain issue on `registry.npmjs.org`. Out of scope for 5b.3a; revisit independently.
- **CF 47 optimization** — Zod bundle-size optimization deferred to M2 mobile-perf pass; tracked as CF 47 in the enumeration above.

---

## 2026-05-21 — M1.5b PR 3 / 5b.3a Phase 2.5j-fix (Catch 26; CF 47 NEW; Rule 11 clarified — TERMINAL reactive round)

Codex re-review of `2337c7c` (Phase 2.5j Zod rewrite tip) returned
two findings — **neither Class A**. Pattern 7 structural close
(Phase 2.5j) held: no validator-enumeration regression. The two
findings are different classes entirely:

- **Finding A** (P1, useRun.ts:102): cross-version restore field
  divergence. Restore reducer dispatched raw snapshot;
  applySimSnapshot assigned ruleset/derived from persisted-time
  composition; sim's restoreRun recomposed them via composeRuleset
  from current registries → client.state.ruleset diverged from
  simRun's effectiveRuleset across version bumps / hot-fixes →
  wrong reroll cost / shop gen.
- **Finding B** (P2, validate.ts:155): relic-slot semantic
  validation gap. Schema checked relic id ∈ RELICS but not that
  RELICS[id].slot matched the field's expected slot. A boss-tier
  relic in the starter slot would pass; composeRuleset folds boss
  modifiers in → progression bypass.

**TERMINAL reactive round** by master-dev ratification — finding
count this PR reaches 10 / reactive budget long-spent. Both
findings fixed this turn; on a clean self-check, re-Codex once
more; on clean → merge; on a finding tied to the A/B changes →
fix only Class A / manifest-now P1, else CF-and-ship.

### Step 0 confirms (verified pre-implementation)

(a) Dispatch site: `apps/client/src/run/useRun.ts:169` dispatches
    raw `snapshot`. Restore reducer arm at
    `apps/client/src/run/RunController.ts:478-498` calls
    `applySimSnapshot(state, s, true)` at L479; applySimSnapshot
    at L181-200 assigns `ruleset: snapshot.ruleset` /
    `derived: snapshot.derived` / `maxHearts:
    snapshot.ruleset.startingHearts` at L189-192 — all raw from
    persisted snapshot. ✓ Finding A surface confirmed.
(b) `packages/sim/src/run/state.ts:293-295` calls
    `composeRuleset(contract, input.classId, this.relics)`,
    storing `this.effectiveRuleset` + `this.derived` — recomposed
    from current registries. `controller.getState()` at L391-425
    returns `ruleset: this.effectiveRuleset` + `derived: { ... }`
    (the recomposed values). ✓ Recomposition confirmed.
(c) Field partition for restore (Step 0 enumeration):
    | Source | Fields |
    |---|---|
    | controller.getState() (sim-authoritative, recomposed) | ruleset, derived; downstream-derived maxHearts (ruleset.startingHearts) + className (CLASSES[classId]) |
    | controller.getState() (sim-verbatim — equal to snapshot) | runId, seed, classId, contractId, startedAt, hearts, currentRound, relics, outcome, history |
    | snapshot (client-authoritative per Q2 Amendment A) | bag.placements, shop.slots — sim's are non-authoritative mirrors |
    | snapshot (SerializedRunState-only, NOT in RunState) | rngState (sim-internal rng cursor), rerollCount, trophy |
    | snapshot.gold via includeGold (Amendment A; sim mirrors snapshot.gold on restore — equivalent) | gold |

    **No ambiguity.** Inspection-only halt authority not exercised.

### Catch 26 (NEW — cross-version restore field divergence; NOT Class A; NOT CF 34)

**Class diagnosis.** Not Class A (no throw — silent semantic
desync). Not CF 34 (Q2 Amendment A authority model isn't changing;
ruleset/derived ARE sim-owned today; the bug is that the reducer
read the persisted shadow instead of sim's current truth). Not CF
46 (CF 46 is about forward-version-save backup-on-downgrade; this
is about same-or-later-version load where the recomposed values
drift from the persisted ones). Genuinely new class.

**Fix.** Extend `restore_from_save` RunAction with a
`controllerSnapshot: SimRunState` field. useRun's load-on-mount
dispatch passes `controller.getState()` alongside the persisted
`snapshot`. Reducer arm reads sim-authoritative fields (ruleset,
derived, maxHearts, className) from controllerSnapshot through
applySimSnapshot; client-authoritative (bag, shop) + SerializedRun
State-only (rerollCount, trophy) continue to come from snapshot.

**Regression guard verified.** The Catch 23 cursor-preservation
invariant (restored.getRngState() === snapshot.rngState) is
unaffected: rngState lives sim-internal (not in RunState, not in
controller.getState()), the constructor's restoreFrom branch
seeds `this.rng = createRng(restoreFrom.rngState)` terminally
(state.ts:326), and the reducer doesn't touch rngState. Phase
2.5h verbatim-shop also unaffected: shop continues to come from
snapshot.shop.slots in the reducer arm. D-F5 save-on-quiescent
timing untouched — Catch 26 only changes the restore-side
hydration, not save-fire timing.

### Codex finding B (P2, schema strictness)

**Fix.** Three `.refine` clauses on RelicSlotsSchema — one per
non-null slot field — asserting `RELICS[id].slot ===
expected_slot`. Mis-slotted save → safeParse fails → fresh fallback.

### Rule 11 clarification (NOT amendment — refinement)

Rule 11 codified at 2.5i and amended at 2.5j defined STRUCTURAL
completeness (every field present with the right primitive type +
nested-object shape + registry membership for id-typed fields).
Finding B reveals a class beyond structural: SEMANTIC completeness
— the field MAY be the right type and id may be a registry member,
but the value carries semantic constraints beyond type (a relic id
in the `starter` field must reference a relic whose `.slot ===
'starter'`).

**Clarification (added 2026-05-21 / Phase 2.5j-fix):** Rule 11's
structural completeness CLOSES the Pattern 7 STRUCTURAL VARIANT
(hand-rolled per-field-presence validators missing surfaces).
Pattern 7 SEMANTIC variant — schema accepts structurally valid
but semantically wrong payloads — remains possible and must be
caught via `.refine` clauses encoding the semantic constraints.
The compile-time dual-`satisfies` bracket does NOT prove semantic
completeness; semantic refinements are case-by-case and must be
audited per-field.

Pattern 7 instance taxonomy now:
- Instances 1-3 (M1.5a PR 3, Phase 2.5g, Phase 2.5i): structural
  enumeration gaps in hand-rolled validators → closed by Catch 25
  / Rule 11 / Zod.
- Instance 4 (Phase 2.5j discipline-only fix insufficient): closed
  by Phase 2.5j Zod structural fix.
- **Instance 5 (Phase 2.5j-fix / Finding B): first SEMANTIC
  variant.** Schema validated structure + registry membership;
  missed the per-field semantic constraint (RELICS[id].slot ===
  field name). Codified as a SUB-PATTERN: when a registry-typed
  field has additional per-field semantic constraints (slot,
  classAffinity, tier, etc.), add `.refine` for each constraint.

### CF 47 NEW

**Surface.** Phase 2.5j Zod rewrite added +71.71 kB raw / +19.65
kB gzip to the main chunk (+27% / +24%). The bundle delta was
explicitly accepted at Phase 2.5j as the cost of structural
Class A closure. Long-term, the main chunk shouldn't carry the
full Zod runtime — alternatives include:
- Code-splitting validate.ts into the load-on-mount dynamic-import
  boundary (alongside `import('@packbreaker/sim')`).
- Switching to a smaller schema lib (Valibot ~2 kB, ArkType
  ~10 kB gz) once the Pattern 7 closure is battle-tested.
- Hand-rolled schema generator that derives runtime checks from
  TS types at build time (e.g. typia, ts-runtime, zod-from-ts).

**Disposition.** DEFERRED to M2 / future optimization. CF 47
trigger: M2 mobile-perf pass OR first user-visible TTFI complaint
attributable to the validator chunk.

### Cross-version desync test — pins the INVARIANT (Pattern 7 discipline)

The new test in `apps/client/src/run/RunController.test.ts`
intentionally DIVERGES the snapshot.ruleset/derived from the
controllerSnapshot.ruleset/derived (simulating restoreRun's
composeRuleset producing different values from the persisted
composition). Asserts the reducer output reads from controllerSnapshot:
- `state.ruleset.startingHearts === 5` (controller's recomposed,
  NOT snapshot's stale 3).
- `state.maxHearts === 5` (derived from controller.ruleset).
- `state.derived.extraRerollsPerRound === 2` (NOT snapshot's 99).

Plus a companion test diverging bag/shop on controllerSnapshot to
prove client-authoritative fields IGNORE controller and pull from
snapshot. This is the INVARIANT (sim-authoritative ← controller;
client-owned ← snapshot), not a round-trip equality proxy.

### Findings 9 / 10 dispositions

(Bare hash escaped per Rule 10.)

- **Codex finding A / 9** (P1, Catch 26 — cross-version restore
  field divergence). **Closed** via the controllerSnapshot
  hydration fix above.
- **Codex finding B / 10** (P2, mis-slotted relic). **Closed** via
  the three RelicSlotsSchema `.refine` clauses.

Finding count this PR: 10 since the 4/4 ceiling tripped. Reactive
budget remains spent. Master-dev marked this round TERMINAL.

### Counter updates

| Counter | Pre-2.5j-fix | Post-2.5j-fix |
|---|---:|---:|
| Catches codified | 25 | **26** (+Catch 26 cross-version restore field divergence) |
| Rules codified | 11 | **11** (Rule 11 CLARIFIED, not added — structural completeness ≠ semantic completeness) |
| Pattern 7 instances | 4 | **5** (5th instance: first SEMANTIC variant — sub-pattern codified) |
| Tracked CFs | 31 | **32** (+CF 47 bundle-size optimization) |
| 4-finding ceiling | 4/4 closed via meta-audit (Phase 2.5g) | unchanged — terminal reactive round; finding count 10/10 since ceiling, all incomplete-fix or different-class |

### Branch state at Phase 2.5j-fix close

Branch `m1.5b-pr3-localsave-v1` off main `49f7437`. 28 atomic
branch commits (25 pre-2.5j-fix + 3 this turn: `c7c1f14` +
`984b544` + this docs commit).

| SHA | Sub-phase | Scope |
|---|---|---|
| `c7c1f14` | 2.5j-fix commit 1 — Finding A | RunAction.restore_from_save extended with `controllerSnapshot: SimRunState`; useRun dispatch passes `controller.getState()`; reducer arm uses controllerSnapshot for applySimSnapshot. +2 cross-version invariant tests in RunController.test.ts (pin sim-authoritative ← controller AND client-owned ← snapshot). Helper `controllerSnapshotFrom(s: SerializedRunState): SimRunState` for existing tests. |
| `984b544` | 2.5j-fix commit 2 — Finding B | RelicSlotsSchema three `.refine` clauses (starter/mid/boss slot-compatibility). +7 unit-level slot-validity tests; +1 e2e mount-fallback test (worldforge-seed boss-tier relic in starter slot rejects + fresh-fallback). |
| this entry | 2.5j-fix commit 3 — docs | Catch 26 + Rule 11 clarification + Pattern 7 5th instance (first semantic variant; sub-pattern codified) + CF 47 (Zod bundle-size deferred to M2). |

Closing tally / final counter snapshot defers to merge.

---

## 2026-05-21 — M1.5b PR 3 / 5b.3a Phase 2.5j (schema-derived validator — Catch 25; Rule 11 amended)

Codex re-review of `5a2dfd4` (post-Phase-2.5i) returned **three more
P1 findings** on the same Class A surface — bag.placements[].itemId
not ITEMS-checked, shop.slots[] not ITEMS-checked, history validated
as array only (not per-element). Findings 6 / 7 / 8 since the
4-finding ceiling tripped at Phase 2.5g; Pattern 7
(test/audit-asserts-proxy-not-invariant) materialized for the third
time within this PR. The discipline alone — Rule 11 codified mid-PR
at Phase 2.5i — did not prevent the next iteration from instantiating
the same enumeration-fragility failure.

**Root cause:** hand-rolled per-field validators are structurally
enumeration-dependent by construction. Each iteration of Phase
2.5h → 2.5i traded one set of forgotten surfaces for another:
2.5h missed registry membership; 2.5i closed CLASSES/CONTRACTS/
RELICS but missed ITEMS + history element shape. The fix had to
be structural, not procedural.

**Master-dev decision (reversal):** Zod is now a client-persistence
dep (was: server-side only per tech-arch § 6.3 pre-amendment). The
evidence — three same-PR Codex rounds finding the same family of
gaps in successively-expanded hand-rolled validators — justifies
pulling Zod forward.

### Step 0 confirms (verified pre-implementation)

1. **Canonical type locations.** `SerializedRunState` at
   `packages/content/src/schemas.ts:760` + `LocalSaveV1` at L767;
   re-exported types-only via `@packbreaker/shared/save/index.ts`.
   Byte-synced root mirror at `content-schemas.ts`. ✓
2. **validate.ts internals + call site.** `validateLocalSaveV1` at
   `apps/client/src/persistence/validate.ts` (a `parsed is
   LocalSaveV1` type predicate post-Phase-2.5i); called from
   `apps/client/src/persistence/migrations/index.ts:34` after
   `schemaVersion === 1` routing. ✓
3. **useRun load-on-mount restoreRun try/catch placement.** Present
   at `apps/client/src/run/useRun.ts:151-167` (the Phase 2.5h
   addition); wraps the `restoreRun(snapshot, ...)` call inside the
   dynamic-import `.then` callback. Dev-only `console.warn` on
   throw; `simRun` stays null → fresh-fallback. **Preserved
   unchanged in this remediation** per spec — schema is the
   structural close, try/catch is the defense-in-depth belt for
   Catch 22 surfaces A4/A5 (restoreRun's own contract throws on
   `CONTRACTS[id]` / `RELICS[id]` lookups, kept for any future
   client/sim registry divergence). ✓

No framing refutation. Inspection-only halt authority not exercised.

### Catch 25 (NEW, Class A batch — structural close)

**Three Codex findings, single root cause.** Same Class A family as
Catch 22 (`schemaVersion`-only validation) and Catch 24 (validator-
validates-subset). The remediation pattern that broke down:

| Phase | Validator | Gap exposed by Codex |
|---|---|---|
| 2.5h | Validates outcome/relics.starter/history-is-array/bag.placements-shape/shop.slots-are-strings | Misses registry membership on classId/contractId/relics; misses ruleset / derived shape entirely → Codex P1 round 2 |
| 2.5i | + Ruleset/DerivedModifiers shape + CLASSES/CONTRACTS/RELICS registry membership | Misses ITEMS registry on bag/shop itemIds; misses history element shape → Codex P1 findings 6/7/8 |
| **2.5j** | **Zod schema-derived; dual-`satisfies` proves bidirectional structural equivalence to canonical types; ITEMS membership baked in** | **Structurally complete; no further enumeration gap possible without schema-vs-canonical compile-time mismatch.** |

### Three layers of safety (Phase 2.5j shipped state)

1. **Schema-derived validator** (`apps/client/src/persistence/validate.ts`).
   Zod `LocalSaveV1Schema` + nested `SerializedRunStateSchema` /
   `RulesetSchema` / `DerivedModifiersSchema` / `BagStateSchema` /
   `ShopStateSchema` / `RelicSlotsSchema` / `RunHistoryEntrySchema`
   / `ContractMutatorSchema` (discriminated union on `.type`).
   Five id-field registry refinements baked in via
   `z.custom<BrandedId>(predicate)`:
   - `classId` ∈ `CLASSES`
   - `contractId` ∈ `CONTRACTS`
   - `relics.{starter,mid,boss}` ∈ `RELICS` (starter non-null via refine)
   - `bag.placements[].itemId` ∈ `ITEMS`  (closes Codex 6)
   - `shop.slots[].itemId` ∈ `ITEMS`  (closes Codex 7)
   - `history` element fully validated  (closes Codex 8)
2. **Dual-`satisfies` type-enforced completeness.** Four `satisfies`
   clauses at module bottom prove bidirectional structural equivalence
   between the schema's `z.infer` and the canonical types:
   - `InferredSerializedRunState satisfies SerializedRunState`
   - `SerializedRunState satisfies InferredSerializedRunState`
   - `InferredLocalSaveV1 satisfies LocalSaveV1`
   - `LocalSaveV1 satisfies InferredLocalSaveV1`
   **Sanity-check (mandatory; performed and reverted):** removing
   `hearts: z.number()` from `SerializedRunStateSchema` causes TS
   code 1360 to fire on both `_canonicalSatisfiesInferredSRS` and
   `_canonicalSatisfiesInferredLSV1` clauses with the verbatim
   error `"Property 'hearts' is missing in type ... but required in
   type 'SerializedRunState'"`. Field restored; assertion is
   load-bearing for the type checker, not decorative.
3. **useRun restoreRun try/catch** (unchanged from Phase 2.5h).
   Documented defense-in-depth for restoreRun's own contract throws
   on `CONTRACTS[id]` / `RELICS[id]` lookups if client/sim registries
   ever diverge, and for any future deref the schema doesn't
   structurally express (currently: none — the schema is complete).

### Rule 11 AMENDED

**Pre-amendment (Phase 2.5i codification):** "A load/deserialization
boundary validator must validate the COMPLETE persisted contract —
every field's presence + type, full structural validity of nested
objects, and registry membership for id-typed fields. Deref-safety
must be STRUCTURAL, never enumeration-dependent."

**Post-amendment (Phase 2.5j):** "**Large persisted contracts MUST
use a schema-derived validator (Zod or equivalent). Completeness
must be type-enforced via dual-`satisfies` on the schema's `z.infer`
vs the canonical type — not enumeration-dependent.** Hand-rolled
per-field validators are admissible only for trivially-small
single-field contracts; larger surfaces must derive the validator
from a schema and prove bidirectional structural equivalence at
compile time. The discipline 'validate the full contract' is not
sufficient on its own — when applied to a hand-rolled validator
across iteration cycles, it has been empirically observed to drift
into enumeration-as-proxy (Pattern 7) within the same PR."

### Pattern 7 recurrence within this PR — process learning

| Instance | Surface | Phase |
|---|---|---|
| 1 (M1.5a PR 3 — pre-PR-3) | Test asserted field-roundtrip, not cursor-preservation | M1.5a PR 3 close |
| 2 (Phase 2.5g) | Drift-as-expected test mask | Caught at Phase 2.5g meta-audit |
| **3 (Phase 2.5i)** | Meta-audit ITSELF asserted enumeration (subset of dispatch tree) instead of structural invariant | Codified at Phase 2.5i; sub-rule "audits cover the full dispatch tree" |
| **4 (Phase 2.5j)** | **Hand-rolled validator iteration ALSO asserted enumeration even after Phase 2.5i's discipline fix** | This entry: discipline alone insufficient → structural fix supersedes |

**Codification:** When the same pattern has recurred 3+ times within
a single PR despite discipline-level fixes, the next remediation
must change the structure (mechanism / abstraction / dep), not the
discipline (audit scope / rule wording / process tightening). The
structural fix at Phase 2.5j (Zod) makes Pattern 7 unrecurrable on
this surface — by construction, a passing schema means the
inferred type equals the canonical type, which means no
enumeration gap is possible.

### Findings 6 / 7 / 8 dispositions

(Bare hash escaped per Rule 10 — "finding 6 / 7 / 8" rather than
"finding \#6 / \#7 / \#8".)

- **Codex finding 6** (P1, validate.ts:62, isValidPlacement) —
  `bag.placements[].itemId` was string-only. Throw site:
  [DraggableItem.tsx:55](apps/client/src/bag/DraggableItem.tsx#L55)
  `def.rarity` after `ITEMS[item.itemId]`. **Closed:** Zod
  `BagPlacementSchema.itemId` is `ItemIdSchema` (z.custom with
  `Object.prototype.hasOwnProperty.call(ITEMS, v)`).
- **Codex finding 7** (P1, validate.ts:214, shop slots) —
  `shop.slots[]` was string-only. Throw site:
  [ShopSlot.tsx:49](apps/client/src/shop/ShopSlot.tsx#L49) `def.rarity`
  after `ITEMS[slot.itemId]`. **Closed:** Zod
  `ShopStateSchema.slots = z.array(ItemIdSchema).readonly()`.
- **Codex finding 8** (P1, validate.ts:195, history array-only) —
  `history` was `isArr` only, no element validation. Throw site:
  [useRun.ts:397-398](apps/client/src/run/useRun.ts#L397-L398) —
  `last !== undefined && last.round === 11` (`!== undefined` lets
  null through; `null.round` throws). **Closed:** Zod
  `RunHistoryEntrySchema` validates each element's `round / outcome
  / damageDealt / damageTaken / goldEarnedThisRound / opponentGhostId
  / opponentClassId` fields.

### Tests (commit `02fdf9c`)

**Unit-level** (`persistence.test.ts`, +8 tests):
bag.placements[].itemId not in ITEMS rejected; known itemId accepted.
shop.slots[] unknown id rejected; populated with known items
accepted. history: [null] rejected; element missing round rejected;
element with invalid outcome ('draw') rejected; fully-valid element
accepted.

**End-to-end** (`RunContext.test.tsx`, +4 tests):
Each of the three Codex finding surfaces gets a mount-fallback test
(bag itemId, shop slot id, history: [null]). Plus a history-missing-
round mount test. Helper `makeCorruptV1Save` extended with
`bagPlacements / shopSlots / history` overrides so each new surface
is a one-line test body. All prior 93 persistence + RunContext tests
remain green (behavioral parity with the schema validator confirmed
pre-commit).

### Tech-arch amendment (§ 6.3 / § 6.4)

Zod scope extended from "server-side request validation" to "server-
side request validation + client-side persistence validation". Same
TS-canonical + Zod-schema pattern on both sides:
`packages/content/src/schemas.ts` is canonical for both API DTO
shapes and persistence shapes; Zod schemas live alongside their
consumers (`packages/shared/src/api/` for server, `apps/client/src/
persistence/` for client). Committed in this turn.

### Counter updates

| Counter | Pre-2.5j | Post-2.5j |
|---|---:|---:|
| Catches codified | 24 | **25** (+Catch 25 Class A batch structural close) |
| Rules codified | 11 | **11** (Rule 11 AMENDED, not added) |
| Pattern 7 instances | 3 | **4** (4th instance: same-PR discipline-only fix insufficient) |
| Tracked CFs | 31 | unchanged |
| 4-finding ceiling | 4/4 closed via meta-audit (Phase 2.5g) | unchanged — findings 5/6/7/8 are incomplete-fix remediation, reactive budget remains spent |

### Branch state at Phase 2.5j close

Branch `m1.5b-pr3-localsave-v1` off main `49f7437`. 25 atomic
branch commits (21 pre-2.5j + 4 this turn: `2ce1759` + `96e325d` +
`02fdf9c` + this docs commit).

| SHA | Sub-phase | Scope |
|---|---|---|
| `2ce1759` | 2.5j commit 1 — dep | `pnpm add zod ^4.4.3` to `apps/client`. (Installed via `pnpm add --config.strict-ssl=false` workaround for the Windows + corporate-cert chain TLS issue on `registry.npmjs.org`. Lockfile + package.json delta only; no source.) |
| `96e325d` | 2.5j commit 2 — schema swap | `validate.ts` rewritten: Zod schemas for `LocalSaveV1` / `SerializedRunState` + 7 nested types; 4-clause dual-`satisfies` bracket; `validateLocalSaveV1` is `safeParse(...).success` (preserved as `parsed is LocalSaveV1` predicate). Caller `migrations/index.ts` unchanged. useRun try/catch unchanged. |
| `02fdf9c` | 2.5j commit 3 — tests | +8 unit-level persistence + +4 e2e RunContext mount-fallback tests covering the three Codex finding surfaces. Helper `makeCorruptV1Save` extended. All prior 93 persistence + RunContext tests stay green. |
| this entry | 2.5j commit 4 — docs | Catch 25 + Rule 11 amendment + Pattern 7 4th instance + Codex finding 6/7/8 dispositions. Tech-arch § 6.3 / § 6.4 amendment (Zod now also client-side). |

### Codex engagement note (folded forward)

Codex bot posts via `/pulls/{n}/reviews` with `state=COMMENTED`
(NOT `/issues/{n}/comments`). Line-level findings live under
`/pulls/{n}/reviews/{review_id}/comments`. The Phase 2.5h
post-trigger poll watched the wrong endpoint and falsely reported
a 15-min timeout; Codex had actually responded in ~10 min. Phase
2.5i poll switched to `/pulls/{n}/reviews` and confirmed the
~5-10 min response window. Phase 2.5j poll: same endpoint.

Closing tally / final counter snapshot defers to merge.

---

## 2026-05-21 — M1.5b PR 3 / 5b.3a Phase 2.5i (Codex finding #5; Catch 24)

Codex re-review of `91fe6f3` (post-Phase-2.5h) returned 1 P1 finding
on the load-boundary validator: `isValidSerializedRunState` checked
`classId/contractId/startedAt` as strings only, never validated
`ruleset`/`derived` shape, and never checked `classId ∈ CLASSES`. A
corrupt `schemaVersion: 1` payload could then pass `loadLocal()` and
throw inside `applySimSnapshot` ([RunController.ts:192-193](apps/client/src/run/RunController.ts#L192-L193))
at `snapshot.ruleset.startingHearts` or
`CLASSES[snapshot.classId]!.displayName` — bypassing the intended
fresh-run fallback (the throw landed in React's reducer dispatch,
not inside useRun's restoreRun try/catch).

**Diagnosis.** Catch 22's resolution was incomplete because the
Phase 2.5g meta-audit's A8 enumeration covered the restore-call-tree
+ reducer bag/shop arms but missed `applySimSnapshot` upstream in
the same `restore_from_save` dispatch. Validator validated a
**field-subset** (the surfaces the meta-audit enumerated), not the
**complete contract**.

**Finding #5 since the ceiling tripped.** Reactive budget remains
spent; this is incomplete-fix remediation, not a new reactive cycle.
Catch 24 completes the class started by Catch 22.

### Step 0 — complete enumeration (the sweep the meta-audit should have done)

Every deref / registry lookup reachable on the client-side load
dispatch tree (sim-side derefs covered by useRun's restoreRun
try/catch; noted but not in this validator's scope):

**A. `restore_from_save` reducer arm** ([RunController.ts:460-499](apps/client/src/run/RunController.ts#L460-L499)):
- `s.bag.placements.map(p => ... p.anchor.col / p.anchor.row ...)` — A8 (covered by Phase 2.5h `isValidPlacement`).
- `s.shop.slots.map((itemId, i) => ...)` — A8 (covered by `isStr` on each slot).
- `s.currentRound`, `s.shop.rerollsThisRound` (uid template) — covered by `isNum`.
- `s.rerollCount`, `s.trophy` — covered by `isNum`.

**B. `applySimSnapshot`** ([RunController.ts:181-200](apps/client/src/run/RunController.ts#L181-L200)) — **THE GAP THE META-AUDIT MISSED**:
- `snapshot.runId` (L185), `snapshot.seed` (L186), `snapshot.contractId` (L188), `snapshot.relics` (L195), `snapshot.outcome` (L196), `snapshot.gold` (L198), `snapshot.currentRound` (L194), `snapshot.hearts` (L191) — pure assignments, safe if present.
- `snapshot.ruleset` (L189), `snapshot.derived` (L190) — assigned by reference; downstream consumers deref.
- **`snapshot.ruleset.startingHearts` (L192)** — DEREF on ruleset. **Codex P1 surface A8a.**
- **`CLASSES[snapshot.classId]!.displayName` (L193)** — REGISTRY LOOKUP + non-null assertion. **Codex P1 surface A8b.**
- `snapshot.history.slice()` (L197) — array method. Covered by `isArr`.

**C. Downstream consumers of the restored client state** (any place that reads `state.state.X` post-restore):
- `state.state.ruleset.bagDimensions` — [CombatOverlay.tsx:157,170,272](apps/client/src/combat/CombatOverlay.tsx#L157), [CombatOverlay.tsx:96-97](apps/client/src/combat/CombatOverlay.tsx#L96-L97), [useRun.ts:335](apps/client/src/run/useRun.ts#L335).
- `state.state.ruleset.rerollCostStart` / `rerollCostIncrement` — [ShopPanel.tsx:27-28](apps/client/src/shop/ShopPanel.tsx#L27-L28), [ShopTab.tsx:30-31](apps/client/src/screens/mobile/tabs/ShopTab.tsx#L30-L31), [useRun.ts:302-303](apps/client/src/run/useRun.ts#L302-L303), [RunController.ts:363-364](apps/client/src/run/RunController.ts#L363-L364).
- `state.state.ruleset.startingHearts` — propagated as `maxHearts` ([RunController.ts:192](apps/client/src/run/RunController.ts#L192)).
- `state.state.derived.extraRerollsPerRound` — [ShopPanel.tsx:29](apps/client/src/shop/ShopPanel.tsx#L29), [ShopTab.tsx:32](apps/client/src/screens/mobile/tabs/ShopTab.tsx#L32), [useRun.ts:306](apps/client/src/run/useRun.ts#L306), [RunController.ts:365](apps/client/src/run/RunController.ts#L365).
- `CLASSES[state.state.classId]!` — [LeftRail.tsx:104](apps/client/src/hud/LeftRail.tsx#L104), [RelicsTab.tsx:82](apps/client/src/screens/mobile/tabs/RelicsTab.tsx#L82).
- `RELICS[state.state.relics.starter]!` / `mid` / `boss` — [LeftRail.tsx:106-108](apps/client/src/hud/LeftRail.tsx#L106-L108), [RelicsTab.tsx:83-85](apps/client/src/screens/mobile/tabs/RelicsTab.tsx#L83-L85). (`RunEndScreen.tsx:187-191` is optional-chained; safe.)
- `CONTRACTS[...]` — no current client-side consumer (sim-side only, behind useRun try/catch).

**D. Sim-side restoreRun derefs** (NOTE: covered by [useRun.ts try/catch](apps/client/src/run/useRun.ts#L150-L160) — out of validator scope):
- `serialized.relics.starter` ([state.ts:1180](packages/sim/src/run/state.ts#L1180)).
- `{ ...restoreFrom.relics }` ([state.ts:283](packages/sim/src/run/state.ts#L283)).
- `restoreFrom.history.slice()` ([state.ts:302](packages/sim/src/run/state.ts#L302)).
- `CONTRACTS[input.contractId]` ([state.ts:262](packages/sim/src/run/state.ts#L262)).
- `RELICS[input.startingRelicId]` ([state.ts:275](packages/sim/src/run/state.ts#L275)).

### Completeness proof — every enumerated deref/lookup → validator guard

| Surface | Deref / lookup | Validator guard |
|---|---|---|
| A8 reducer bag map | `p.anchor.col / p.anchor.row / p.placementId / p.itemId / p.rotation` | `isValidPlacement(p)` for each `p` in `bag.placements` |
| A8 reducer shop map | `itemId` (cast as ItemId) | `isStr(slot)` for each `slot` in `shop.slots` |
| A8a applySimSnapshot | `snapshot.ruleset.startingHearts` | `isValidRuleset(x.ruleset)` — checks `startingHearts` numeric + 11 other Ruleset levers + bagDimensions structure + mutators array |
| A8b applySimSnapshot | `CLASSES[snapshot.classId]!.displayName` | `isKnownClassId(x.classId)` — `Object.hasOwnProperty.call(CLASSES, id)` |
| A8c applySimSnapshot | `snapshot.history.slice()` | `isArr(x.history)` |
| C ShopPanel/ShopTab | `state.ruleset.rerollCostStart`, `rerollCostIncrement` | `isValidRuleset(x.ruleset)` — covers both fields as numeric |
| C ShopPanel/ShopTab/useRun/reducer | `state.derived.extraRerollsPerRound` | `isValidDerived(x.derived)` — covers all 3 DerivedModifiers fields |
| C CombatOverlay | `state.ruleset.bagDimensions.{width,height}` | `isValidRuleset` validates `bagDimensions` shape including both axes |
| C LeftRail/RelicsTab | `CLASSES[state.classId]!` | `isKnownClassId(x.classId)` |
| C LeftRail/RelicsTab | `RELICS[state.relics.starter / mid / boss]!` | `isKnownRelicId(x.relics.starter)` required; `isKnownRelicId(x.relics.mid)` if non-null; `isKnownRelicId(x.relics.boss)` if non-null |
| (future) CONTRACTS lookup | `CONTRACTS[state.contractId]` | `isKnownContractId(x.contractId)` — added per Rule 11 even though no current client consumer (deref-safety structural, not enumeration-dependent) |
| D sim restoreRun | sim-side derefs | `isValidSerializedRunState` covers the same structural surfaces (relics, history, etc.); sim's `CONTRACTS[id]` + `RELICS[id]` throws also covered by useRun try/catch as a defense-in-depth belt |

**Every enumerated deref/lookup maps to a guard.** No flagged gaps.
Mutator nested optional fields (`boss_only.hpOverride/damageBonus/lifestealPctBonus`) are NOT validated; they're consumed only by sim's combat path (covered by useRun's try/catch) and no client-side surface derefs them. If a future client consumer reads them, it should either optional-chain or the validator should be extended — flagged here so the next M2/CF closure that grows mutator usage knows to extend.

### Fix (commit `caa3282`)

Expanded `isValidSerializedRunState` per Rule 11. New helpers:
- `isValidRuleset` — 12 scalar numeric levers + bagDimensions structural + mutators array of valid ContractMutator entries.
- `isValidDerived` — all 3 fields finite numerics.
- `isValidMutator` — `.type` ∈ `{adjacent_double, recipe_discount, no_rerolls, boss_only}`.
- `isKnownClassId` / `isKnownContractId` / `isKnownRelicId` — registry membership via `Object.prototype.hasOwnProperty.call`.

Validator stays a `parsed is LocalSaveV1` type predicate. No cast
regression. Caller in `migrations/index.ts` unchanged.

### Tests (commit `2f2201d`)

**Unit-level** (`apps/client/src/persistence/persistence.test.ts`, +16 tests):
- Registry membership: unknown classId / contractId / starter / mid / boss relic ids → `loadLocal` returns null.
- Ruleset shape: undefined / non-object / missing startingHearts / missing bagDimensions / bagDimensions missing width / mutators not-array / mutators containing unknown type → null. Positive: valid `boss_only` mutator accepted.
- DerivedModifiers shape: undefined / missing extraRerollsPerRound / bonusGoldOnWin as string → null.

**End-to-end** (`apps/client/src/run/RunContext.test.tsx`, +8 tests):
8 mount-fallback flavors covering each new corrupt-surface variant
(unknown classId, unknown contractId, missing ruleset, non-object
ruleset, missing derived, invalid starter/mid/boss relic ids).
Each asserts fresh Tinker mounts via the ClassSelectScreen mock,
no `console.error`, no `[useRun] restoreRun` warn (validator
rejected upstream of the try/catch). Factored helpers
`makeCorruptV1Save` + `assertFreshTinkerMountsCleanly` for
single-test-body brevity per surface.

### Rule 11 (NEW, codified)

> A load/deserialization boundary validator must validate the
> COMPLETE persisted contract — every field's presence + type, full
> structural validity of nested objects, and registry membership for
> id-typed fields. Deref-safety must be STRUCTURAL (any consumer is
> safe on a validated payload), never dependent on enumerating known
> consumers.

Reason: enumeration-dependent validators leak gaps whenever (a) the
audit's enumeration is incomplete, or (b) a new consumer is added
that derefs a previously-unvalidated field. Both pathways materialized
between Phase 2.5g (enumeration incomplete → missed `applySimSnapshot`)
and Phase 2.5i (Codex found the gap). Structural validation removes
both failure modes.

### Pattern #7 — 3rd instance (codified)

Pattern #7: "Tests / audits asserting proxies rather than invariants."
- Instance 1 (M1.5a PR 3): a test asserted field-roundtrip instead of cursor-preservation.
- Instance 2 (Phase 2.5g): drift-as-expected test (`restoreRun.test.ts:174-192` pre-fix) codified the drift as the invariant — masked the cursor-drift bug.
- **Instance 3 (Phase 2.5i, NEW)**: the Phase 2.5g meta-audit ITSELF asserted a proxy (enumerated A8 surfaces in the reducer arm's bag/shop calls) rather than the full invariant (every deref site in the entire load dispatch tree, including upstream calls like `applySimSnapshot`). The audit's enumeration was the proxy; the invariant was "no consumer in the load dispatch tree throws on a validated payload."

**Codification.** Audit scope must cover the FULL DISPATCH TREE
reachable from the load entry point, not just the topmost call site.
Audits that enumerate only direct call-site derefs leak upstream-call
deref gaps. Pair with Rule 11: even a complete audit isn't sufficient
on its own — the validator must be structural so new consumers stay
safe by construction, not by re-running the audit.

### Catch 24 (NEW, Class A residual)

| Catch | Class | Description |
|---|---|---|
| 22 | A | Version-only validation passes schemaVersion-N-with-garbage downstream (Phase 2.5h). |
| **24** | A residual | Validator validates a field-subset, not the complete contract. Codex finding #5 caught two upstream surfaces (`snapshot.ruleset.startingHearts`, `CLASSES[snapshot.classId]!.displayName`) that the Phase 2.5g meta-audit's A8 enumeration missed because it scoped to direct reducer-arm `.map` calls only. |

Catch 22's resolution was **incomplete**; Catch 24 **completes** the
class via Rule 11's structural-validation discipline.

### Counter updates

| Counter | Pre-2.5i | Post-2.5i |
|---|---:|---:|
| Catches codified | 23 | **24** (+Catch 24 Class A residual) |
| Rules codified | 10 (last: Rule 10 verbatim-evidence at decision-log meta) | **11** (+Rule 11 complete-contract structural validation) |
| Pattern #7 instances | 2 | **3** (3rd instance — audit-enumeration-as-proxy) |
| Open CFs | 31 | unchanged (no CF impact) |
| 4-finding ceiling | 4/4 (closed via Phase 2.5g meta-audit) | unchanged — finding #5 is incomplete-fix remediation (reactive budget remains spent); not a new reactive cycle |

### Branch state at Phase 2.5i close

Branch `m1.5b-pr3-localsave-v1` off main `49f7437`. 21 atomic branch
commits (17 pre-2.5i + 3 this turn: `caa3282` + `2f2201d` + this
docs commit). Plus the D-F5 follow-up `3e1a13d` between Phase 2.5h
and Phase 2.5i, and the predicate refactor `91fe6f3` (which was the
tip Codex reviewed).

| SHA | Sub-phase | Scope |
|---|---|---|
| `caa3282` | Phase 2.5i commit 1 — validator expansion | `isValidRuleset` + `isValidDerived` + registry-membership checks (`isKnownClassId/ContractId/RelicId`) folded into `isValidSerializedRunState`. Validator stays a type predicate. |
| `2f2201d` | Phase 2.5i commit 2 — tests | +16 unit-level persistence tests (registry membership × 5, Ruleset shape × 8, DerivedModifiers shape × 3). +8 e2e RunContext mount-fallback tests, one per new surface. |
| this entry | Phase 2.5i commit 3 — docs | Catch 24 + Rule 11 + Pattern #7 3rd instance. Counters 23→24 / 10→11. |

### Codex engagement note (lesson, uncodified)

Phase 2.5h's post-trigger poll watched `/issues/{n}/comments` and
reported timeout at 15 min. Codex actually responded ~10 min after
the trigger as a PR REVIEW (`/pulls/{n}/reviews` with
`state=COMMENTED`), not as an issue comment. The bot account is
`chatgpt-codex-connector[bot]`. Line-level findings live under
`/pulls/{n}/reviews/{review_id}/comments`. Future Codex polls
should hit the reviews endpoint; the issue-comments endpoint sees
only the human-posted `@codex review` triggers, not Codex's
responses. Folding into the project's Codex-engagement notes.

Closing tally / final counter snapshot defers to merge.

---

## 2026-05-20 — M1.5b PR 3 / 5b.3a Phase 2.5h (meta-audit remediation)

Codex re-review of `a3b3c0d2` (round 2) returned a 4th + 5th finding on
the persistence load/restore surface — both confirmed by master-dev as
instances of two distinct failure classes (load-on-mount throw-safety;
restore fidelity / RNG discipline). 4-finding ceiling tripped → reactive
iteration halted; a comprehensive read-only meta-audit (Phase 2.5g, tip
`a35c6cb`) enumerated **24 findings → 3 code roots**, of which 4 were the
Codex-confirmed instances and 20 were net-new (same two classes plus
Class D test-fidelity masks + Class E general items, mostly latent /
documented / out-of-scope).

This Phase 2.5h pass implements the ratified consolidated remediation:
single bundled fix across the 3 code roots + test overhaul + docs. No
reactive iteration; no @codex re-trigger.

### Step 0 confirms (verified pre-implementation)

1. **ShopSlot[] → ShopState lossless at arranging-entry quiescent moments.**
   Verified: at every save trigger that fires at arranging-entry
   (initial-mount + round-change + restored-mount), client `state.shop`
   slots have non-null `itemId` (combat_done regenerates fresh shop on
   round advance; initial mount uses generateInitialShop; restored mount
   reads non-null slots guaranteed by the prior save). `purchased: []`
   and `rerollsThisRound: state.state.rerollCount` (0 at quiescent).
   **Terminal-outcome saves** may carry leftover null slots if the
   player bought from shop in the final round (combat_done leaves
   state.shop unchanged on runEnded). Those terminal saves are
   load-filtered by `outcome !== 'in_progress'`; if they somehow
   round-trip, the validator catches and falls back to fresh-run.
2. **makeShop was the SOLE post-seed RNG consumer in restoreRun's
   restore branch.** Verified at `state.ts:297-339` — L326 seeds rng,
   L335 (pre-fix) called makeShop, and all other lines were pure
   assignments / array slice / telemetry comments.
3. **No sim-internal consumer reads `this.shop` after restore before
   the client reducer arm overrides.** Production read of
   `simRun.getState().shop` is only in useRun's save effect, which
   this remediation redirects to read client's `state.shop`. The only
   other reader is the existing test `RunContext.test.tsx:231,246`,
   asserting init_from_sim's shop sync — unaffected by the restore-
   path change.

### Catch 22 (NEW, Class A — load-on-mount throw-safety)

**Surface (round-2 P1 + 7 additional enumerated vectors).** The
migration dispatcher routed by `schemaVersion === 1` alone and cast
the parsed payload to `LocalSaveV1` with zero structural validation.
Any payload that happened to carry schemaVersion=1 then threw
downstream at one of 8 enumerated deref points:

| # | Surface | Throw |
|---|---|---|
| A1 | `migrations/index.ts:22-23` | The cast itself — root cause; no runtime guarantee. |
| A2 | `useRun.ts:125-126` | `saved.inProgressRun === null` check missed `undefined` inProgressRun. |
| A3 | `state.ts:1180` | `serialized.relics.starter === null` deref — Codex-confirmed instance. |
| A4 | `state.ts:262-263` | `CONTRACTS[input.contractId]` lookup throw on unknown id. |
| A5 | `state.ts:275-278` | `RELICS[input.startingRelicId]` lookup throw on unknown id. |
| A6 | `state.ts:283` | `{ ...restoreFrom.relics }` spread on undefined relics. |
| A7 | `state.ts:302` | `restoreFrom.history.slice()` on non-array. |
| A8 | `RunController.ts:482-491` | Reducer arm `s.bag.placements.map(... p.anchor.col ...)` / `s.shop.slots.map(...)` on undefined sub-shape. |

The throws lived inside a Promise callback (useRun's dynamic-import
`.then`), surfacing as console unhandled-rejections rather than React
crashes — `simRun` stayed null and the fresh-run UI mounted, but with
a dirtied console. This is why CI passed despite Class A being
present.

**Fix (commit `bfd4079`).** Hand-rolled load-boundary shape validator
in `apps/client/src/persistence/validate.ts` validating LocalSaveV1 +
SerializedRunState to the depth that guarantees the load+restore path
cannot throw: schemaVersion=1; inProgressRun null OR fully-structured
SerializedRunState (outcome ∈ RunOutcome; relics.starter non-null;
relics.mid/boss string|null; history array; bag.placements array of
valid placements with anchor.col/row numeric, rotation numeric, ids
string; shop slots/purchased arrays + rerollsThisRound numeric; all
numerics finite via `Number.isFinite`; all branded identifiers
present). Wired through `migrate()` after the existing schemaVersion
routing. Covers A1-A3, A6-A8 + the A2 undefined gap.

useRun's load-on-mount effect wraps restoreRun in `try/catch` with a
dev-only `console.warn` — covers A4-A5 (restoreRun's own contract
throws for content-registry gaps) and any residual deref the
validator doesn't yet catch. Either failure mode lands at the
fresh-run path (`simRun` stays null → ClassSelectScreen mounts).
restoreRun's contract throws are preserved as documented behavior.

**Zod note.** Tech-architecture.md § 6.3 plans Zod as a server-side
dep, but Zod is NOT installed in any workspace `package.json`
(verified via `grep -Ri "zod" --include="package.json"`). Adding Zod
was out of scope for 5b.3a; the hand-rolled validator is the
in-scope solution. M2 may revisit if Zod lands for the server's
request-validation surface.

### Catch 23 (NEW, Class B — restore fidelity / non-terminal RNG seed)

**Root cause (round-2 P2 + 3 additional Class B vectors).** Two
coupled bugs in the restore branch:

1. **Non-terminal RNG seed.** `state.ts:326` seeded rng via
   `createRng(restoreFrom.rngState)` but L335 then called
   `this.shop = this.makeShop(this.currentRound)`, which consumed N
   rng nexts post-seed. Cursor drift by one makeShop's worth per
   save→load cycle.
2. **Non-verbatim shop restore.** The same makeShop call regenerated
   sim's shop instead of trusting `restoreFrom.shop`. The
   pre-remediation comment justified this as "sim's shop diverged
   from client's mid-round (rerolls aren't fully mirrored
   sim-side)" — true for the existing authority split, but the price
   paid was cursor drift and a sim-side shop that didn't match the
   persisted shop.

The deeper root: the **save** side sourced `serialized.shop` from
`simSnap.shop` (sim-authoritative read) rather than from client's
authoritative `state.shop`, deviating from the Phase 1 ratification
call C field-sourcing table. Because sim's shop diverged from
client's mid-round under Q2 Amendment A, the persisted shop was
already wrong by the time restore tried to use it — hence the
regeneration patch on the restore side. Fixing the save-side
sourcing makes the restore-side regeneration unnecessary; combined,
both fixes restore the verbatim-restore + terminal-seed contract.

**Fix (commits `3049ea5` + `9a8052d`).** Two coordinated changes:

- **Sim** (`packages/sim/src/run/state.ts`): restore branch now
  copies `restoreFrom.shop` verbatim (slots/purchased/rerollsThisRound
  via `.slice()` to mutable arrays); `createRng(restoreFrom.rngState)`
  is the terminal RNG-relevant op in the branch. `this.makeShop(...)`
  removed.
- **Client** (`apps/client/src/run/sim-bridge.ts` +
  `apps/client/src/run/useRun.ts`): new `clientShopToSimShop` helper
  (mirrors `clientBagToSimBag`) maps `ShopSlot[]` → `ShopState`. Save
  effect now writes `shop: clientShopToSimShop(state.shop,
  state.state.rerollCount)` to the persisted payload alongside the
  existing gold + bag client-sourced overrides.

**Falls out — C-F1 / C-F2 idempotence.** Save→load→save under zero
player action is now byte-stable. Pre-fix: each idle reload advanced
the persisted rngState by `M` (one makeShop's RNG consumption);
shop drifted in lockstep. Post-fix: verbatim-restore + terminal-seed
means restored cursor == saved cursor, and sim's shop == saved shop.

### Class D test-fidelity (encoded under Catches 22/23)

The audit found two tests that asserted proxies rather than the real
invariants — these are the source of why CI passed despite the bugs
being present:

- **D-F1 (drift-as-expected mask).** `restoreRun.test.ts:174-192`
  asserted that two restores produce identical rng cursors. True under
  any deterministic transformation including the buggy drift. The
  test's comment block explicitly documented makeShop's post-seed
  advancement as the expected invariant. **Pattern #7 second
  instance** (tests asserting proxies, not invariants). Codified
  earlier at M1.5a PR 3 close.
- **D-F2 (untested garbage-payload).** The persistence corruption-
  tolerance section tested four well-known corruption families (absent
  key, malformed JSON, unknown schemaVersion, non-object) but never
  `{schemaVersion: 1, ...arbitrary-garbage}` — exactly the
  schemaVersion=1-cast-without-validation surface.

**Test overhaul (commit `2d50b4e`).**

- `restoreRun.test.ts`: flipped the determinism test to assert
  `restored.getRngState() === snapshot.rngState` (cursor-preservation
  invariant); kept the two-restores-identical test as a regression
  sentinel; removed the misleading drift-as-expected comment block;
  added a new describe block for verbatim-shop slots/purchased/
  rerollsThisRound + save→load→save idempotence.
- `persistence.test.ts`: new describe block "load-boundary shape
  validator" — 13 corrupt-payload cases covering A2 (undefined
  inProgressRun) + A3/A6/A7/A8 vectors (undefined relics, null
  relics.starter, undefined history, undefined bag, bag.placements
  not-array, placement missing anchor, undefined shop, shop.slots
  not-array, shop.slots containing null, invalid outcome string,
  non-numeric hearts, NaN rngState) + 2 positive cases asserting
  validator doesn't over-reject.
- `RunContext.test.tsx`: new describe block "corrupt-payload mount
  fallback" — 2 end-to-end tests asserting fresh Tinker mounts
  cleanly (no console.error, no restoreRun warn) under
  schemaVersion=1+missing-relics and shop.slots-with-null corrupt
  payloads.

D-F5 (save-on-quiescent timing) was already covered by the existing
`RunProvider — save-on-quiescent timing` test (mid-round reroll
doesn't change saved bytes; initial mount fires).

### 20 net-new meta-audit findings — disposition

Of the 24 findings enumerated in Phase 2.5g, 4 were the Codex-
confirmed instances of Classes A and B and the test-fidelity masks.
The remaining 20 are dispositioned here:

- **Class A vectors A2 / A4 / A5 / A6 / A7 / A8 (6 NEW)** — all closed
  by the validator + try/catch fix.
- **Class B vectors B-F3 (sim bag empty on restore) / B-F4 (client
  shop slot uid fresh-mint)** — DEFERRED. B-F3 amends CF 34's carry-
  forward (CF 34 must re-handle bag emptiness on restore when sim
  regains bag authority). B-F4 amends CF 45's carry-forward (CF 45
  client placement-id minting non-deterministic — same family).
- **Class C C-F1 / C-F2 (idempotence)** — closed by Catch 23 root fix
  (no separate code change needed).
- **Class D D-F1 / D-F2 / D-F3 / D-F4 / D-F6 (test-fidelity)** —
  closed by the test overhaul. D-F5 was already covered.
- **Class E** — 10 general items:
  - E-F1 (migration identity stub by-reference) — current behavior
    asserted by existing test, no change.
  - E-F2 (downgrade clobbers forward-version save) — NEW CF 46
    opened, deferred to schema-bump.
  - E-F3 (epoch guard interaction with corrupt-payload throw) —
    explains pre-fix CI passing; closed structurally by Catch 22.
  - E-F4 (partial-write recovery) — already covered by Catch 21's
    storage-layer try/catch (JSON.parse-fail → null fallback).
  - E-F5 (clearLocal in resetRun) — already throw-safe (Catch 21).
  - E-F6 (bornFromRecipe Set restoration gap) — DEFERRED, amends
    CF 43's carry-forward.
  - E-F7 (rerollCount + trophy authority) — verbatim-restored;
    confirmed correct.
  - E-F8 (telemetry not re-emitted on restore) — documented behavior,
    CF 35 scope.
  - E-F9 (`nextPlacementCounter` reset on restore) — DEFERRED, amends
    CF 34's carry-forward (same as B-F3).
  - E-F10 (`lastCombatResult` reset on restore) — documented behavior,
    no change.

### CF 46 (NEW)

**Surface.** `apps/client/src/persistence/migrations/index.ts` —
`schemaVersion === N>1` returns null. On a forward-version save (user
downgrades client), the migration returns null → the user sees a
fresh-run path. The next quiescent save **overwrites** the forward-
version payload with the older v1 shape, irreversibly losing the
forward-version state.

**Disposition.** DEFERRED to schema-bump (M2 likely). Mitigation
options when CF 46 closes: (a) back up the forward-version payload
under a versioned key (`pba.v2.save.preserved`) before overwriting;
(b) refuse to write any save until the user explicitly chooses to
abandon the forward-version save; (c) version-tagged migration
chain with explicit downgrade-failure UX. Picking the right option
depends on M2's cloud-save semantics — not enough information yet
to lock the decision.

### CF amendments

- **CF 34** (sim/client authority migration — bag) — AMENDED. Closure
  must re-handle (a) sim restore bag-empty initialization at
  `state.ts:319-322` (B-F3 — currently forced empty; restore must
  read from `restoreFrom.bag.placements` when sim regains bag
  authority); (b) `nextPlacementCounter` reset at `state.ts:258`
  (E-F9 — currently defaults to 0; must initialize past the highest
  saved placementId to avoid uid collision).
- **CF 43** (recipe-bonus tracking client mirror) — AMENDED. Restore
  loses sim's `bornFromRecipe` Set mid-round (E-F6). Set isn't
  JSON-roundtrippable; closure must persist + restore the membership
  (likely as `bornFromRecipe: PlacementId[]` array in
  SerializedRunState, schema-bump territory).
- **CF 45** (non-deterministic client placement-id minting) —
  AMENDED. Adjacent finding B-F4: client reducer arm mints fresh
  shop-slot uids on restore (``s${currentRound}-${rerollsThisRound}-${i}``)
  rather than preserving uids from the saved payload. SerializedRunState
  doesn't currently include slot uids; CF 45's closure should consider
  bundling slot-uid preservation into the same authority pass.

### Pattern + catch + rule codification

- **Catch 22** (NEW, Class C2): "version-only validation passes
  schemaVersion-N-with-garbage downstream where it throws on field
  access — version presence is NOT shape validation." Antidote: at
  load boundaries with versioned envelopes, the migration dispatcher
  MUST be paired with a per-version structural validator; the
  shape-cast must follow the validator, not precede it.
- **Catch 23** (NEW, Class C2): "restore that regenerates a
  bifurcated-authority field via post-seed RNG consumption violates
  both verbatim-restore and terminal-seed invariants. Root: save was
  sourcing the field from the wrong authority side; restore-side
  regeneration was patching the symptom." Antidote: when authority
  is bifurcated per Phase 1 field-sourcing table, BOTH save and
  restore must source the field from the documented owner; restore-
  side regeneration is a smell that points back at save-side
  sourcing.
- **Process learning** (uncodified, second-instance watch): the
  4-finding ceiling meta-audit rule surfaced same-class instances
  that reactive Codex loops miss. Round 1's P1+P2 fixed two
  surface-level findings, but the underlying class structure (Class A
  throw-safety; Class B restore fidelity) wasn't enumerated. Round 2
  surfaced two more instances; without the ceiling rule, the loop
  would have continued indefinitely. Pattern candidate: "After 2+
  rounds of reactive findings, halt and run a class-enumeration
  audit." Hold pending second-instance trigger.
- **Phase 1 learning** (uncodified): A4-minimal under-pinned the
  restore semantics. The Phase 1 ratification document specified
  "verbatim restore of sim-authoritative fields" but did not state
  "rngState seed is terminal" or "shop is restored verbatim from
  serialized.shop." The implementation followed letter-of-Phase-1 but
  not spirit; meta-audit surfaced the gap. Pattern candidate:
  "When Phase 1 ratifies a contract, the invariants enforcing the
  contract must be explicitly listed alongside the contract — not
  left as implementation detail." Hold pending second-instance.

### Counter updates

| Counter | Pre-2.5h | Post-2.5h |
|---|---:|---:|
| Predicate-vs-name catches codified | 21 | **23** (+Catch 22 version-only-validation; +Catch 23 non-terminal-seed-via-mis-sourced-save) |
| 4-finding ceiling | 2/4 | **4/4 → meta-audit closed** (no reactive iteration; comprehensive sweep complete) |
| Open CFs | 30 | **31** (+CF 46 downgrade clobbers forward-version save) |
| Class D test masks codified (Pattern #7) | 1 (D-F1 from M1.5a PR 3) | **2** (D-F1 second instance; reinforces Pattern #7) |

### Branch state at Phase 2.5h close

Branch `m1.5b-pr3-localsave-v1` off main `49f7437`. 17 atomic branch
commits (12 pre-2.5h + 5 this turn: `bfd4079` + `3049ea5` + `9a8052d`
+ `2d50b4e` + this docs commit).

| SHA | Sub-phase | Scope |
|---|---|---|
| `bfd4079` | Phase 2.5h commit 1 — validator + try/catch | Shape validator (apps/client/src/persistence/validate.ts) + migrate() wiring + useRun load-effect try/catch. Covers Catch 22 surfaces A1-A3, A6-A8 + A2 undefined gap; restoreRun contract throws (A4-A5) covered by try/catch. |
| `3049ea5` | Phase 2.5h commit 2 — sim verbatim shop + terminal seed | restoreRun's restore branch now copies restoreFrom.shop verbatim (slots/purchased/rerollsThisRound); `createRng(restoreFrom.rngState)` is the terminal RNG op in the branch. makeShop call removed. Catch 23 root fix. |
| `9a8052d` | Phase 2.5h commit 3 — save-side client shop sourcing | clientShopToSimShop helper in sim-bridge.ts; useRun save effect writes `shop: clientShopToSimShop(...)` alongside existing gold + bag client overrides. Restores Phase 1 call C field-sourcing. Catch 23 save-side fix. |
| `2d50b4e` | Phase 2.5h commit 4 — test overhaul | Sim cursor-preservation + verbatim-shop + idempotence; persistence 13 corrupt-payload + 2 positive validator tests; RunContext 2 end-to-end mount fallback tests. Class D test-fidelity masks corrected. |
| this entry | Phase 2.5h commit 5 — docs | docs(decision-log): Catch 22/23 + CF 46 + CF 34/43/45 amendments + 20 net-new findings dispositioned. |

Closing tally / final counter snapshot defers to merge.

---

## 2026-05-20 — M1.5b PR 3 / 5b.3a Phase 2.5 — Codex P1+P2 (Catch 20+21)

Codex review of `a5f6149` returned two findings — both confirmed by
master-dev and fixed in this interlude. 4-finding ceiling at 2/4
(reactive). Pipeline triple-green; ready for Codex re-request once
master-dev confirms.

### P1 — load-on-mount restore race (Catch 20)

**Surface.** `useRun.ts` load-on-mount useEffect (~lines 107-129
pre-fix) carried an inline race-guard comment claiming protection
against "user may have begun a fresh class-select pick while the
dynamic import was resolving" — but the actual code only checked an
unmount-cancellation flag. The two async paths (restore's
`import('@packbreaker/sim').then(restoreRun)` and createRun's
`.then(createRun)`) share the same cached module promise but have no
explicit synchronization. A structural race: if a fresh run is
initiated during restore's import window, the restore's resolve
callback unconditionally calls setSimRun + dispatch(restore_from_save),
clobbering the fresh run's setSimRun(controller) + dispatch(
init_from_sim).

**Comment-vs-code discrepancy.** The Codex finding caught the
documentation lying about the implementation — the comment
described an invariant that the code did NOT enforce. Logged
separately from the architectural race itself; both close together.

**Fix (commit `1fd5424`).** Monotonic epoch ref (lean Option A per
the prompt) shared between the two async paths:

- `restoreEpochRef = useRef(0)` declared at the useRun top-level.
- Restore useEffect captures `myEpoch = restoreEpochRef.current` at
  effect-start (synchronously, before the dynamic-import).
- createRun useEffect synchronously bumps `restoreEpochRef.current +=
  1` BEFORE its dynamic-import, even though the import resolution is
  async — the ref bump is visible to restore's resolve closure by the
  time it would run.
- Restore's resolve callback compares `restoreEpochRef.current !==
  myEpoch` and bails before setSimRun + dispatch if a fresh run was
  initiated. Fresh run's init_from_sim dispatch survives intact.

State-check guard alternative (simRun !== null read via useRef
mirror) rejected as heavier than the epoch ref. False race-guard
comment replaced with an accurate description of the implemented
guard; cross-reference at the restoreEpochRef declaration documents
the synchronous handshake.

**Test (RunContext.test.tsx).** Pre-populate localStorage with a v1
Marauder save → mount RunProvider with the auto-fire ClassSelectScreen
stub configured to fire Tinker + apprentices-loop. Both async paths
race; assert final state is the fresh Tinker run (classId='tinker',
relics.starter='apprentices-loop', round=1) NOT the restored Marauder
save (classId='marauder', round=5).

### P2 — storage access + read/write throw-safety (Catch 21)

**Surface.** `apps/client/src/persistence/storage.ts` (pre-fix):

```
function getDefaultStorage(): SaveStorageAdapter | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { localStorage?: SaveStorageAdapter };
  return g.localStorage ?? null;   // ← can throw SecurityError
}

export function loadRaw(storage?): unknown {
  const adapter = storage ?? getDefaultStorage();
  if (!adapter) return null;
  const raw = adapter.getItem(SAVE_STORAGE_KEY);  // ← can throw
  ...
}

export function save(payload, storage?): void {
  const adapter = storage ?? getDefaultStorage();
  if (!adapter) return;
  adapter.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));  // ← QuotaExceededError
}

export function clearSave(storage?): void {
  const adapter = storage ?? getDefaultStorage();
  if (!adapter) return;
  adapter.removeItem(SAVE_STORAGE_KEY);  // ← can throw
}
```

The `typeof globalThis === 'undefined'` check guards against
undefined globalThis but NOT against the property access throwing.
In Safari private-browsing / opaque-origin / blocked-storage
contexts, reading `globalThis.localStorage` itself raises
SecurityError. Plus `getItem`/`setItem`/`removeItem` can throw at
runtime under QuotaExceededError / mid-session storage block. Net
result: a single throw propagates through loadLocal → useRun's
load-on-mount useEffect and breaks the mount path, violating the
no-op fallback contract under exactly the conditions where it was
supposed to engage.

**Fix (commit `5263d0f`).** Wrap every browser-storage touchpoint
in try/catch with a null/no-op fallback:

- getDefaultStorage: try/catch around the property read; null on
  throw (same as the SSR / no-localStorage branch).
- save(): try/catch around adapter.setItem; silent no-op on throw.
- loadRaw(): try/catch around adapter.getItem; null on throw,
  treating the failure same as "no save present" → fresh-run path.
- clearSave(): try/catch around adapter.removeItem; silent no-op
  on throw.

Doc comment expanded with the explicit runtime conditions that
trigger throws (Safari private-browsing, opaque origins,
QuotaExceededError, blocked storage).

**Tests (persistence.test.ts).** Five new throw-safety cases:

1. loadLocal returns null when adapter.getItem throws.
2. saveLocal is silent no-op when adapter.setItem throws (e.g.
   QuotaExceededError).
3. clearLocal is silent no-op when adapter.removeItem throws.
4. Full mount path (save → load → clear) survives a fully-throwing
   adapter without propagation.
5. `globalThis.localStorage` access itself throwing — simulated via
   `Object.defineProperty` with a getter throwing SecurityError —
   is caught by getDefaultStorage's defensive try/catch; loadLocal,
   saveLocal, clearLocal all no-op without propagation.

### Counter updates

| Counter | Pre-2.5 | Post-2.5 |
|---|---:|---:|
| Predicate-vs-name catches codified | 19 | **21** (+Catch 20 P1 race; +Catch 21 P2 throw-safety) |
| 4-finding ceiling | 0/4 | **2/4** (reactive) |
| Open CFs | 30 (CF 34, CF 35, CF 37, CF 38, CF 42, CF 43, CF 45 + 23 earlier) | unchanged |

Catch 20 + 21 both Class C2 (architectural / structural concerns vs.
isolated logic bugs). Antidote candidates held pending second-instance
triggers — no codification this turn.

### Branch state at Phase 2.5 close

Branch `m1.5b-pr3-localsave-v1` off main `49f7437`. 10 atomic branch
commits (7 original + d4fd27c layering fix + 1fd5424 P1 + 5263d0f
P2) + 2 docs commits (a5f6149 + this entry).

| SHA | Sub-phase | Scope |
|---|---|---|
| `1fd5424` | Phase 2.5 P1 — race guard | Monotonic restoreEpochRef in useRun; restore's resolve callback bails on epoch mismatch; createRun useEffect synchronously bumps before its dynamic-import. False race-guard comment corrected. +1 regression test (race interleave with auto-fire stub). |
| `5263d0f` | Phase 2.5 P2 — throw-safety | try/catch wrapping for getDefaultStorage property read + adapter.getItem/setItem/removeItem in storage.ts. +5 throw-safety tests (3 method-level + 1 full-path + 1 globalThis-getter-throws). |
| this entry | Phase 2.5 docs | docs(decision-log): 5b.3a Phase 2.5 — Codex P1+P2 (Catch 20+21). |

### Working-tree note (orphaned cleanup ride-along)

Commit `1fd5424` incidentally landed the previously-orphaned
`apps/client/vite.config.ts.timestamp-*.mjs` deletion (a Vite-
generated tempfile that had been staged-for-deletion in the index
since before this conversation started). The deletion was already
staged when I added the P1 fix files; `git commit -m` picked up the
full index. Net effect: a stale tempfile no longer tracked in git
history — harmless, arguably correct. The matching `.gitignore`
modification (which presumably adds the pattern) remains in the
working tree unstaged.

Closing tally / final counter snapshot defers to merge.

---

## 2026-05-20 — M1.5b PR 3 / 5b.3a pre-push gate clearance (LocalSaveV1 persistence core)

5b.3a's 7-commit body of work (LocalSaveV1 schema authored as
SerializedRunState; sim getRngState + restoreRun + RestoreRunOptions;
real startedAt timestamp; client persistence layer + migration scaffold;
save-on-quiescent + load-on-mount + clearLocal-on-reset wiring;
round-trip + post-load-combat + migration + quiescent-timing test
coverage) cleared the master-dev pre-push gate matrix with one
remediation (item D layering fix).

### Pre-push gate results

| Item | Disposition |
|---|---|
| **A** tech-architecture.md § 7.1 amendment | NO-OP — already amended in Commit 1 (4200be6); SerializedRunState authored, `inProgressRun: SerializedRunState \| null` (readonly, non-optional, nullable), path comment points at `packages/content/src/schemas.ts § 13` + `packages/shared/src/save/index.ts` |
| **B** LocalSaveV1.inProgressRun = SerializedRunState \| null end-to-end | CONFIRMED — both content-schemas.ts § 13 and packages/content/src/schemas.ts § 13 byte-identical; save/load round-trips snapshot through LocalSaveV1.inProgressRun; `pnpm check-schemas-sync: OK` |
| **C** sim barrel exports restoreRun + RestoreRunOptions + RunController | CONFIRMED — both Rule 7 barrels (`packages/sim/src/run/index.ts` + `packages/sim/src/index.ts`) export restoreRun + RestoreRunOptions; getRngState is an instance method on the barrel-exported RunController interface (no separate top-level export needed) |
| **D** packages/shared layering | **REMEDIATED — Catch 19 + Commit d4fd27c**. Master-dev grep surfaced runtime `globalThis.localStorage` access inside `packages/shared/src/save/storage.ts:32-36`. Shared package must stay types-only since apps/server imports it. Storage runtime relocated to `apps/client/src/persistence/storage.ts` (Option 1 ratified); `packages/shared/src/save/index.ts` reverts to pure types-only re-exports; `packages/shared/src/save/storage.ts` deleted. Post-fix `git grep "localStorage\|window.\|globalThis." packages/shared/` returns exactly one hit — a comment line inside `shared/save/index.ts` describing the new layering invariant — zero runtime hits. |
| **E** quiescent-save granularity | PASS — saves fire only at arranging-entry + terminal (useEffect deps `[simRun, state.state.round, state.state.outcome]`); no design-level loss surface. Purchases are atomic in `drop_bag` (debit gold + append bag + null shop slot all in one reducer arm); `state.drag` is a transient UI ghost with no shop/gold mutation. Round-boundary granularity loses at most one round's purchases on crash mid-shopping — the clean tradeoff. |
| **F** test concurrency config | REPORTED (no change) — `turbo.json` has no `concurrency` setting (defaults to N=cores); `vite.config.ts` files have no `testTimeout` / `pool` overrides; per-package `test` script is bare `vitest run`. The 5b.3a triple-green pipeline pass required `--concurrency=1` to avoid a V8 zone OOM under stacked happy-dom + vitest concurrency. Logged as CI-watch — if CI exhibits the same OOM post-push, a follow-up CF tracks pinning concurrency in turbo.json or vitest's pool config. |

### Catch 19 (NEW)

**Catch 19 (C2 — types-only-package-runtime-leak).** `packages/shared/src/save/storage.ts` (Commit `f08b339`) introduced runtime `globalThis.localStorage` access into the types-only cross-boundary shared package (Node server imports it). SSR-defensive but architecturally wrong. Caught at master-dev pre-push layering gate (Rule 8 inspection), not Codex. Fix: storage runtime moved to `apps/client/src/persistence/storage.ts`; `shared/save` reverted to types-only. **Antidote candidate (held):** lint / dependency-cruiser guard forbidding platform-global access in `packages/shared` — second-instance trigger.

Catch counter: 18 → 19 at 5b.3a pre-push.

### CF dispositions

- **CF 34** (gold/rerollCount/bag/shop authority migration to sim) — carried forward; explicitly deferred per Phase 1 B2′ ratification (persistence-time reconciliation; live-mutation authority stays client-parallel). Revisit at 5b.3b or beyond.
- **CF 35** (onTelemetryEvent wiring) — unchanged; still stubbed.
- **CF 43** (Tinker recipeBornPlacementIds threading) — unchanged; decoupled from 5b.3a's persistence path per Phase 1 (Set\<PlacementId\> doesn't round-trip JSON; restoreRun yields empty Set matching fresh-controller shape).
- **CF 45 (NEW, latent)** — Client placement-id minting uses `b${Date.now()+Math.random()}` (useRun.ts:56-58), non-deterministic state flowing into CombatInput.bag → replay ItemRefs. M1-safe: persisted verbatim across save/load; no cross-client replay until M2 /v1/replay/validate. Revisit M2. Not a 5b.3a defect.

### Branch state at pre-push

Branch `m1.5b-pr3-localsave-v1` off main `49f7437` (post-M1.5b PR 2 merge baseline). 7 atomic branch commits + this docs commit + (next) closing/counter entry at merge.

| SHA | Sub-phase | Scope |
|---|---|---|
| `4200be6` | Commit 1 — SCHEMA | Authored `SerializedRunState extends RunState { rngState; rerollCount; trophy }` in content-schemas.ts § 13 + byte-synced packages/content/src/schemas.ts; amended tech-arch § 7.1 (phantom SerializedRunState → real type; path comment fixed); re-exported through @packbreaker/shared. |
| `5336d19` | Commit 2 — SIM API | `getRngState(): number` method on RunController + `restoreRun(serialized, options?): RunController` factory + `RestoreRunOptions` type. Optional `restoreFrom` parameter on RunControllerImpl constructor branches the init flow (no run_start telemetry on restore; rng restored via `createRng(restoreFrom.rngState as SimSeed)`; relics recomposed against all 3 slots; sim's bag stays empty per Q2 Amendment A live invariant). Rule 7 barrel sweep both sub-barrel + root barrel. |
| `54c2a15` | Commit 3 — STARTEDAT FIX | `new Date().toISOString() as IsoTimestamp` injected at the createRun call site in useRun.ts; sim's `'2025-01-01T00:00:00.000Z'` sentinel default no longer reached in production. |
| `f08b339` | Commit 4 — SAVE/LOAD primitives | Shared-package `storage.ts` with save/loadRaw/clearSave + SaveStorageAdapter; `pba.v1.save` localStorage key; SSR-defensive (silent no-op when globalThis.localStorage undefined). Migration scaffold at apps/client/src/persistence/migrations/ (v1 identity stub + dispatcher). Client composer (saveLocal/loadLocal/clearLocal) wraps shared primitives + migration. ⚠ This commit introduced Catch 19's layering bug — remediated in d4fd27c. |
| `9e265b8` | Commit 5 — WIRING | useRun load-on-mount useEffect (dynamic-import restoreRun if v1 in-progress save present); save-on-quiescent useEffect (deps narrowed to `[simRun, round, outcome]`); clearLocal in resetRun; new `restore_from_save` reducer arm (snapshot.bag → BagItem[] inverse impedance, snapshot.shop → ShopSlot[] mirror of init_from_sim shape, rerollCount + trophy lifted). Test setup adds `localStorage.clear()` in afterEach. |
| `5175662` | Commit 6 — TESTS | Round-trip + post-load-combat coverage at `packages/sim/test/restoreRun.test.ts` (+12 sim tests). Save/loadLocal round-trip + migration dispatcher + corruption tolerance at `apps/client/src/persistence/persistence.test.ts` (+15 client tests). restore_from_save reducer arm at `apps/client/src/run/RunController.test.ts` (+4 client tests). Quiescent-save timing integration at `apps/client/src/run/RunContext.test.tsx` (+1 client test). |
| `d4fd27c` | Catch 19 — LAYERING FIX | Storage runtime relocated `packages/shared/src/save/storage.ts` → `apps/client/src/persistence/storage.ts`. shared/save/index.ts reverted to types-only re-export. SaveStorageAdapter type moved with the runtime (no server consumer). Importers rewired (persistence/index.ts + persistence.test.ts). Migration index.ts comment updated. Zero runtime localStorage/window/globalThis in packages/shared post-fix. |
| this entry | Item G docs | docs(decision-log): 5b.3a pre-push gate clearance + CF 45 + Catch 19. |

### Closing / counter entry

Defers to merge per the project closing-log convention (pattern + counter updates land at PR close, not at intermediate push). Catch 19 is recorded inline above; CF 45 opens; CF 34 carries; counters update at merge.

---

## 2026-05-19 — M1.5b PR 2 closed (RunEndScreen + reset_run + CF 21 summary-side close)

### Branch + commit topology

Branch: `m1.5b-pr2-run-end-summary` off main `f9dc60e` (post-PR-2-scope docs commit + β hot-fix baseline e2d6c9f). 6 atomic branch commits + 1 docs-on-main commit (this entry) + 1 `--no-ff` merge commit.

| SHA | Sub-phase | Scope |
|---|---|---|
| `8f81889` | Phase 1 docs ratification | docs(decision-log): M1.5b PR 2 Claude Design pass ratified. |
| `6752cbb` | Step 1 — reducer arm | `reset_run` action variant + reducer case returning `createInitialState()`; 2 unit tests. |
| `de826a2` | Step 2 — hook callback | `resetRun` callback in useRun: dispatches reset_run + nulls simRun useRef + nulls pendingRunInput. Two-axis reset. 2 integration tests in RunContext.test.tsx. |
| `e8c1c4a` | Step 3 — component | `apps/client/src/screens/RunEndScreen.tsx` single responsive component with `.mobile` modifier via useViewport() per Q(d).ii. 8 ratified fields per Q(b). Lazy-loaded per ClassSelectScreen precedent. New chunk RunEndScreen-*.js 8.31 kB raw / 2.63 kB gz. |
| `95c77fe` | Step 4 — RunProvider gate + RunEndOverlay deletion | RunProvider extended with third branch: simRun!==null && isRunEnded → RunEndScreen (inside RunContext.Provider). RunEndOverlay mount sites removed from DesktopRunScreen + MobileRunScreen. RunEndOverlay.tsx deleted; runEnd.ts + runEnd.test.ts preserved. 14 handler-guard tests skipped + 1 architectural-invariant replacement test. Main chunk −870 B from inlined-component removal offsetting lazy-import declaration. |
| `bab104c` | Step 5 — tests | RunEndFlow.test.tsx (4 active + 1 skip; F.1 covered by component tests with stronger isolation) + RunEndScreen.test.tsx (17 tests). |
| this entry | Closing log docs | docs(decision-log): M1.5b PR 2 close. |
| merge commit | Merge | `--no-ff` merge of m1.5b-pr2-run-end-summary into main. Auto-closes PR #17 server-side. |

### What landed (load-bearing surface summary)

- **RunEndScreen at `apps/client/src/screens/RunEndScreen.tsx`** — single responsive component, lazy-loaded, mounts inside RunContext.Provider when sim's `outcome !== 'in_progress'`. Renders 8 ratified data fields with shape+fill differentiation across VICTORY / DEFEAT / RUN ABANDONED outcome states. HeartGlyph SVG component reused verbatim from in-run HUD (NOT Unicode — clarification 5 honored at Step 0 verification).
- **reset_run action arm + resetRun hook callback** — two-axis reset (reducer state via createInitialState + simRun useRef disposal + pendingRunInput=null). LocalSaveV1 at 5b.3 reuses arm as the abandon-current-run handler per Phase 1 Q(c).i.
- **RunProvider third-branch gate** — pre-run (ClassSelectScreen) / in-run (children) / post-run (RunEndScreen). RunEndScreen mounts inside RunContext.Provider so it consumes useRunContext directly for 8 fields (no prop-drilling; only onRestart is a prop).
- **RunEndOverlay.tsx deleted** per Q(h).i. `runEnd.ts` mirrorsSimShouldEndRun helper + runEnd.test.ts preserved (load-bearing).
- **Handler-guard defense-in-depth** — useRun's "if outcome !== 'in_progress' return" handler guards remain in code as defense-in-depth; structurally unreachable through normal mounting paths post-RunProvider-swap. 14 tests skipped with inline documentation; 1 architectural-invariant replacement test confirms terminal-state children don't render.

### Pattern + catch + rule codification

**Catch 18 (NEW, Rule 6 amended instance).** β prompt named vitest's `testTimeout` / `expect.poll.timeout` as Option B surface for the F.3 hot-fix; correct API was @testing-library/react's `configure({ asyncUtilTimeout })`. Subshape "test-library API vs test-runner API conflation" — distinct from Catches 11–15 (sim/client type drifts; testing-library API surface is a new axis). Caught at Step 0 surface verification of the β hot-fix prompt. Codified per Rule 6 amended's active scope (instances increment normally post-amendment); subshape itself first-instance, held for second-instance subshape codification.

**Pattern candidate #9 (NEW, held first-instance).** Architectural-skip-with-replacement-invariant: when a refactor renders existing unit tests architecturally unreachable through normal React mounting paths, skip-with-inline-documentation + replacement architectural-invariant test at higher abstraction preserves coverage. Evidence: Step 4 RunProvider swap unmounted in-run children on terminal state, rendering 14 handler-guard click-no-op tests structurally unreachable. Resolved inline by Claude Code with 14 skips + 1 architectural-invariant test (proving terminal-state children don't render is strictly stronger than 14 individual click-no-op proofs). LocalSaveV1 (5b.3) is plausible second-instance trigger if further RunProvider restructuring renders more tests infeasible.

**Catch candidate (held first-instance).** Latent-test-infra-flake-surfaced-by-next-PR-Phase-1-counter-rebaseline. F.3 Marauder ClassSelectFlow.test.tsx flake (latent in PR 1, surfaced by PR 2 Phase 1 Section 0.5 counter rebaseline against PR 1's 255/255 client baseline). Antidote candidate: "close-time test runs include N≥3 full-workspace runs under cold cache, not just isolation passes." Held for second-instance codification; if a second latent-flake surfaces at the next PR's Phase 1 counter rebaseline, codify both the catch shape and the antidote at that time.

**Topic 2 candidates (held first-instance each).**
- (a) Master-dev chat prompt references unverified upstream UI state ("above" referencing an Other-paste that didn't land in tool inputs). Surfaced by Claude Code's halt-when-foundation-missing discipline (Rule 8 working as intended; no damage).
- (b) Phase 2 prompt did not enumerate existing tests assuming the pre-refactor mounting pattern; Step 4 refactor surfaced 14 test-coverage implications inline. Going-forward consideration: Phase 2 prompts for refactor-bearing PRs Step 0 should enumerate pre-refactor architectural-assumption tests for skip-or-replace decisions.

Both held for second-instance codification.

### CF dispositions

- **CF 21 summary-side closes (Step 4)** — RunEndScreen replaces RunEndOverlay; full summary surface ships. Detection-side closed at M1.5a PR 3 Phase 2b (`mirrorsSimShouldEndRun`); summary-side closes here. CF 21 fully resolved.
- **CF 35 (onTelemetryEvent wiring)** — deferred per Q(e); no new TelemetryEvent variants this PR. Stays open for the M1.5b telemetry milestone.
- **CF 38 (resolution-panel reward display)** — parked for M2 polish per 2026-05-19 docs commit.
- **CF 42 / 43 / 44** — held (unchanged from PR-open).

### Counters at PR 2 close

| Counter | Pre-PR-2 | Post-PR-2 |
|---|---|---|
| Architectural patterns codified | 6 | 6 |
| Pattern candidates held | 2 (#7, #8) | 3 (#7, #8, +architectural-skip-with-replacement-invariant) |
| Predicate-vs-name catches codified | 17 | 18 (+Catch 18 β-prompt API conflation under Rule 6 amended) |
| Catch candidates held | 0 | 1 (F.3 latent-flake; antidote candidate logged) |
| Locked answers | 32 | 32 |
| Going-forward rules | 8 | 8 |
| Master-dev chat drifts (Topic 2) | 20 | 20 (2 first-instance candidates held: "above" UI-ref + Phase 2 prompt completeness gap) |
| Open carry-forwards | 31 | 30 (CF 21 closes) |
| 4-finding ceiling | 0/4 | 0/4 (Codex clean first-pass) |

### Codex review summary

PR #17 Codex review (single pass, fresh top-level `@codex review` comment per convention): clean. "Didn't find any major issues. Swish!" No P0/P1/P2 findings. 4-finding ceiling not approached. No Phase 2.5 interlude required. Cleanest Codex pass of any M1.5 PR to date.

### Process learnings (uncodified, logged for second-instance watch)

- **Design-board-placeholder-vs-in-run-HUD-reality reconciliation.** Design board used Unicode placeholder ♥/♡ for hearts; Step 0 inspection of in-run HUD revealed HeartGlyph SVG component; Phase 2 implementation reused the SVG component verbatim per clarification 5. Design board → production reality divergence handled cleanly at Step 0; no master-dev round-trip needed. Pattern candidate first-instance; hold for second.
- **Skip-with-inline-documentation discipline.** Preserves test code as a record of the prior contract while preventing CI red-lines from architecturally infeasible cases. Distinct from test deletion (which loses the documentation value). Pairs with replacement architectural-invariant tests at higher abstraction (Pattern candidate #9 tracks the recurring shape).
- **Unexpected −870 B main chunk shrink.** RunEndOverlay.tsx (~1.2 kB raw inlined into the main chunk via DesktopRunScreen + MobileRunScreen direct imports) was deleted; the lazy-import declaration for RunEndScreen added ~330 B; net −870 B. M2 polish may revisit other in-run-but-rarely-used components (CombatOverlay at 1.5 MB is the prime candidate, but already lazy-loaded; other smaller candidates worth surveying).
- **ABANDONED outcome not visually playtested at this PR.** No client UI path exists for `outcome === 'abandoned'` (no `abandon_run` action arm). Component test (RunEndScreen.test.tsx) + integration test (RunEndFlow.test.tsx F.3) cover the rendering. First visual playtest of ABANDONED waits for 5b.3's abandon-run UI surface.

### M1.5b PR 3 fresh-chat pre-flags

5b.3 — LocalSaveV1 persistence — opens next. Branch off main at the M1.5b PR 2 merge commit.

Scope per PR 4 / 5b queue carry-context pre-flags (2026-05-17 § M1.5a PR 3 closed) + take-1 D amendment + this PR's resetRun precedent:

- **LocalSaveV1 schema implementation** at `packages/shared/src/save.ts` per `tech-architecture.md` § 7.1 (already declared; no schema changes expected this PR).
- **Persistence boundaries** — save on phase transitions (arranging→combat, combat→resolution, resolution→arranging next round, terminal outcome). Migration scaffolding at `apps/client/src/persistence/migrations/`.
- **Re-opens take-1 D shop-generation ownership review** per take-1 D amendment ("revisit shop generation ownership at 5b.3 if LocalSaveV1 reveals need"). Phase 1 design pass required.
- **CF 34** (gold/rerollCount/bag/shop authority migration) — likely in scope or surfaces as design contradiction. Phase 1 disposition.
- **CF 37** (recipesRegistry sim-default vs client-filter divergence) — revisit alongside CF 34 if combine detection moves sim-side.
- **CF 43** (Tinker recipeBornPlacementIds threading) — strong ride-along candidate per pre-PR-2 fresh-chat handoff. Decide at Phase 1.
- **abandon-run UI path** — first concrete client-side trigger for `outcome === 'abandoned'`. resetRun arm (this PR) is the reducer-side foundation; a UI surface (settings menu? pause menu?) wires user intent to the dispatcher. First visual playtest of ABANDONED outcome lands here.

Phase 1 architectural halt-gate (read-only Step 0) on the LocalSaveV1 + persistence surfaces. Likely 5b.3a (LocalSaveV1 + persistence scaffolding) / 5b.3b (CF 34/37 authority migration) split given full-stack scope.

Fresh master-dev chat at 5b.3 open. Handoff includes counter snapshot + CF disposition table + take-1 D shop-gen review re-open flag.

---

## 2026-05-19 — M1.5b PR 2 Claude Design pass ratified

HTML design board satisfies 10/10 DoD + 8/8 ratified field coverage.
WCAG AA verified on three outcome accents (gold #f5b942 ~10.4:1,
crimson #e85c5c ~5.0:1, slate #8a9bb0 ~6.7:1 against #1a1a1a).
Semantic separability without color confirmed via glyph + weight +
italic + copy differentiation. Shape/fill breadcrumb differentiation
(W tint+solid / L hatched+solid / untouched dashed+dot).

Q(d) final disposition — single responsive component with .mobile
modifier class via useViewport(). Diverges from ClassSelectScreen
separate-component pattern; justified by structurally identical
content across viewports.

Six Phase 2 clarifications: (1) relic tier labels drop round suffix
for graybox; (2) sub-copy derived from (outcome, round); (3)
toLocaleString() for gold + trophy; (4) annotation layer is design-
board only, not production; (5) heart pip rendering matches in-run
HUD convention (Step 0 verify); (6) mobile text-overflow:ellipsis +
real-string integration test fixtures.

Two held concerns (log only): gold-on-gold tension on VICTORY
outcome+CTA (M2 polish revisits); mobile vertical stack height tight
margin (real-string testing is validation gate).

Master-dev drift counter unchanged. Catches counter unchanged (still
17 at PR-2-open).

---

## 2026-05-19 — M1.5b PR 2 Phase 1 ratified

Halt-gate: F.3 Marauder ClassSelectFlow.test.tsx flake (latent in PR 1,
surfaced by Phase 1 counter-rebaseline against PR 1 closing-log
baseline 255/255 client tests). Triage: environmental — isolation
passes 2/2 in 260ms; full-workspace concurrent contention straddles
waitFor default 1000ms under cold lazy-import resolution. Resolution
option β (pre-Phase-2 narrow hot-fix on main, separate commit from
PR 2 branch).

Catch candidate: latent-test-infra-flake-surfaced-by-next-PR-Phase-1-
counter-rebaseline (C2 family lineage). First instance. Held for
second-instance codification per convention; antidote candidate
"close-time test runs include N≥3 full-workspace runs under cold
cache, not just isolation passes." Counter 17 catches unchanged
(catch not codified at first instance).

Q-set dispositions (Phase 2 / Claude Design binding):
(a) full-screen RunEndScreen, mirrors ClassSelectScreen pattern.
(b) outcome + class + round reached + final hearts + 3-relic loadout
    + per-round W/L breadcrumb + final gold + final trophy value.
(c) new run via class-select re-entry; reset_run reducer arm +
    simRun useRef disposal at hook level + pendingRunInput=null.
    Two-axis reset; LocalSaveV1 (5b.3) reuses arm as abandon handler.
(d) shared content panel locked; outer wrapper shape (viewport-
    branched per ClassSelectScreen precedent vs single responsive)
    deferred to Claude Design pass.
(e) defer all PR 2 telemetry to CF 35; no new TelemetryEvent
    variants.
(f) show final trophy value (NOT delta); delta UX rebalanced at M2
    per-round trophy schedule.
(g) integration (RunEndFlow.test.tsx) + component
    (RunEndScreen.test.tsx); F.3/F.5 split precedent.
(h) replace RunEndOverlay.tsx entirely; preserve runEnd.test.ts
    (mirrorsSimShouldEndRun); migrate data-testid anchors where
    assertion semantic matches.

CF 21 summary-side close lands at PR 2 merge.
Master-dev drift counter unchanged (no chat-side drift this turn).

---

## 2026-05-19 — M1.5b PR 2 scoped to 5b.2 (run-end summary surface) only

Fresh-chat handoff proposed bundling 5b.2 (run-end summary surface) and 5b.3 (LocalSaveV1 persistence) into a single "2a/2b" branch. Rejected on two grounds:

1. **Codex-surface size.** 5b.2 is a presentation-only HUD overlay; 5b.3 introduces a persistence layer (localStorage write path, schema versioning, hydrate-on-mount, corruption handling). Bundling doubles the review surface and the failure modes overlap awkwardly (a 5b.3 hydrate bug masquerades as a 5b.2 render bug, etc.).
2. **CF entanglement lives in 5b.3, not 5b.2.** CF 34 (run-end telemetry payload), CF 37 (post-run navigation), and the take-1 D re-open (final-screen relic-list rendering) all land in 5b.3's persistence + post-run flow, not in 5b.2's summary surface. Bundling would force these to ride a "summary" PR where they don't belong.

**Decisions:**

- **M1.5b PR 2 scope:** 5b.2 only — run-end summary surface (post-final-combat overlay; class + relics + final HP + heart history + adventure tile breadcrumb). No persistence, no post-run navigation, no telemetry payload.
- **M1.5b PR 3 scope:** 5b.3 only — LocalSaveV1 persistence + CF 34 + CF 37 + take-1 D re-open close.
- **CF 43** (Tinker class passive + Pocket Forge + Catalyst silently no-op in client-side combat, opened Phase 2.5 of PR 1 at `17bd494`): held for **either a separate narrow PR or 5b.3 ride-along**, whichever lands first by Phase-1 design pass. Not bundled into 5b.2.
- **CF 14 reference in handoff struck as stale.** Handoff cited CF 14 as live; CF 14 closed at M1.5a PR 3 Phase 2c on 2026-05-17. No 5b.2 / 5b.3 work touches it.
- **CF 38 disposition:** parked for M2 polish. Phase 2.5i halt-gate matrix (three structural axes × three UX axes) costs a full Phase-1 design pass to resolve, and the trophy axis only becomes meaningful when M2's per-round trophy schedule lands. Graybox is acceptable today. Not bundled into PR 2 or PR 3.

**Branch cut:** `m1.5b-pr2-run-end-summary` off `96e0c1e` (post-PR-1-merge main tip), pending this docs commit landing first.

---

## 2026-05-19 — Merge-workflow "fall back to GitHub" framing sharpened

Refinement of the merge-conflict discipline, not a new rule. Original framing was "if local merge gets hairy, fall back to GitHub web UI for conflict resolution." That framing is too broad — it conflates two structurally different failure modes.

**Sharpened trigger condition for GitHub fallback:** external-work divergence on main, i.e., a **semantic conflict against unfamiliar code** introduced upstream that requires reading + understanding context outside the current branch's diff. GitHub's PR-review surface (file tree, hunk-level context, blame, expandable surrounding code) is the right tool for that diagnostic load.

**NOT a GitHub-fallback case:** predictable **structural conflicts from same-anchor inserts into append-only artifacts** (`decision-log.md`, `telemetry-plan.md`, future append-only logs). When two commits each insert a new entry at the documented top anchor, the conflict is mechanical (both entries belong, in chronological order) and the intent is unambiguous (both authors meant to land their entry above the prior top). Inline resolution at the terminal is correct here — GitHub fallback wastes time on a one-keystroke decision.

**Surfaced by M1.5b PR 1 merge.** Docs commit `474a5d1` (PR 1 closing log) and branch commit `0000000` (Phase 2.5b LeftRail + RelicsTab fix) each inserted at `decision-log.md`'s top anchor against `d2e4d00`. The `--no-ff` merge produced a textbook same-anchor conflict; resolved locally in seconds with both entries preserved in chronological order (PR 1 close on top, Phase 2.5b row inside the PR 1 close table referencing `0000000`).

**Codification status:** logged as discipline refinement, not promoted to a standing rule. Burden is low, shape is narrow (append-only docs only), and the second-instance convention holds — codify on the next occurrence if it recurs.

---

## 2026-05-19 — Stale branch cleanup (`m1.5a-pr3-relics-and-runend`)

Local + remote branch `m1.5a-pr3-relics-and-runend` deleted. Commits remain reachable via merge commit `d3f2409`'s second parent (M1.5a PR 3 merge, 2026-05-17). Workspace branches at PR 2 cut: `main` + `origin/main` only.

Land this docs commit on main, then cut `m1.5b-pr2-run-end-summary` off `96e0c1e`.

---

## 2026-05-19 — M1.5b PR 1 closed (class-select + starter-relic screen + CF 39 close + 5 CF carry-forwards + M1_PROTOTYPE_CLASS retired)

### Branch + commit topology

Branch: `m1.5b-pr1-class-select-and-starter-relic` off main `d2e4d00` (post-M1.5a-PR-3-close baseline). Nine branch commits + `--no-ff` merge commit TBD. Tip: `000000061c85e1f72db9c59fb90658b8b1a7c8d9` (display prefix `0000000` is real, not a paste error — the SHA happens to start with seven zeros).

| SHA prefix | Phase / Implementation | Scope |
|---|---|---|
| `90ab6e8` | Phase 2 — A | docs(visual-direction): scope bag-60% rule to in-run screens; pre-run screens exempt (Finding C original). |
| `5f4c584` | Phase 2 — C-gate | feat(run): gate createRun on class+starter selection via `pendingRunInput`; `beginRun` setter exposed; `M1_PROTOTYPE_CLASS` import removed from `useRun.ts`. |
| `2cbea85` | Phase 2 — D | refactor(run): retire `M1_PROTOTYPE_CLASS`; `createInitialState(classId)` signature; `applySimSnapshot` adds `maxHearts` (snapshot.ruleset.startingHearts) + `className` (CLASSES[classId].displayName); reroll arm reads `state.state.classId`. CF 39 + Finding A original close here. |
| `68169bf` | Phase 2 — E | fix(combat): `CombatOverlay` reads `playerClassLabel: ctx.state.state.className`; `M1_PROTOTYPE_CLASS_LABEL` retired. Finding B original close here. |
| `dcabd7a` | Phase 2 — B | feat(screens): `ClassSelectScreen` dispatcher + `DesktopClassSelectScreen` + `MobileClassSelectScreen` (lazy) + shared atoms (`ClassCard`, `RelicCard`, `BeginRunBtn`, `Pips`, `PanelShell`, `ClassMark` portraits, `RelicGlyph` for 6 starter relics, text atoms). Ported byte-for-byte-in-semantics from M1.5b PR 1 Claude Design board. `RunContext.tsx` mounts `<ClassSelectScreen onConfirm={value.beginRun} />` when both `simRun === null` AND `pendingRunInput === null`. Includes `tooling/scripts/extract-design-board.cjs` helper used to extract the board's bundler-encoded React source. |
| `d12bda1` | Phase 2 — F | test(client): F.1 + F.2 applySimSnapshot CF 39 + Finding A regressions (RunController.test.ts); F.3 ClassSelect → init_from_sim integration smoke (ClassSelectFlow.test.tsx NEW); F.4 Marauder RelicOfferModal mid + boss cases (RelicOfferModal.test.tsx augmented); F.5 ClassSelectScreen dispatcher unit tests (ClassSelectScreen.test.tsx NEW). Existing fixtures repointed via `vi.mock` stub to `ClassSelectScreen` auto-firing `beginRun(tinker, apprentices-loop)` on first effect. |
| `ea2a4b0` | Phase 2 — bundle-delta correction | perf(run): lazy-load `ClassSelectScreen` via `React.lazy + Suspense` from `RunContext.tsx`. Static import pushed main-chunk delta to +5.79% (over budget); lazy boundary restores +0.18%. `ClassSelectScreen-*.js` becomes a dedicated 14.6 kB chunk; mobile lazy chunk nests under it. Test fixtures repointed to wait for consumer markers (not fallback-absence) since the lazy boundary adds a render cycle. |
| `17bd494` | Phase 2.5 | fix(combat): `buildCombatInput` sources `classId` + `relics` from sim-authoritative `state.classId` / `state.relics`. Codex P1 finding on PR 16 (`ea2a4b0`): pre-fix the function hardcoded `'tinker'` + `emptyRelicSlots()`, so Marauder runs played as Tinker in combat and starter-relic combat effects (Razor's Edge, Bloodfont, Iron Will, etc.) silently no-opped. Two adjacent hardcodes documented + deferred: **CF 42** (startingHp: 30 Rule 6 violation, auto-close on first item with `passiveStats.maxHpBonus`) and **CF 43** (`recipeBornPlacementIds` omission, Tinker class passive + Pocket Forge + Catalyst silently no-op in client-side combat). Test parameterizes `ClassSelectScreen` stub via `mocks.classSelectInput` (vi.hoisted) for Marauder + Razor's Edge propagation regression. **Bonus catch**: `mocks.runCombat.mockClear()` added in `beforeEach` after the new test was initially asserting on Case A's leftover Tinker call (vitest mock.calls accumulates by default). |
| `0000000` | Phase 2.5b | fix(hud): `LeftRail` + `RelicsTab` read class/relics from authoritative state. Visual playtest on PR 16 commit `17bd494` revealed a P0: selecting Marauder + Iron Will + clicking Begin Run landed on a run-screen rail rendering "CLASS: Tinker / +10% recipe potency / Apprentice's Loop / EMPTY / EMPTY". Step 2.5b.0 diagnostic confirmed the state-write chain is correct end-to-end (F.3 + F.5 + Phase 2.5 propagation tests pass on state assertions). The bug is purely display-side decoupling: `LeftRail.tsx` was fully static (zero `useRunContext` reads), `RelicsTab.tsx` read only `state.className`. Fix wires both surfaces to authoritative state through CLASSES + RELICS content registries. New `GenericRelicGlyph` placeholder in `atoms.tsx` for mid/boss relics pending **CF 44** (named-glyph rollout, defer to M2 visual polish). Integration coverage added: `LeftRail.test.tsx` (NEW, 5 tests) + `RelicsTab.test.tsx` (rebaselined + 3 new), closing the gap that let prior tests pass while LeftRail lied. |

### What landed (load-bearing surface summary)

- **Class-select / starter-relic screen** at `apps/client/src/screens/ClassSelectScreen.tsx` + `DesktopClassSelectScreen.tsx` + `mobile/MobileClassSelectScreen.tsx`. Two-stage inline-reveal: class pick → starter pick. Selected affordance: 2px accent ring + soft glow + 2px lift + ✓ badge. Desktop stage 2 persists selected class as left-column context card with OR-SWITCH dim unselected class below (0.42 opacity, 66% scale). Mobile stage 2 replaces OR-SWITCH with slim sticky context header + CHANGE button. Selection recap dropped per Q3 disposition (b). Lazy-loaded from `RunContext.tsx` (per Phase 2 bundle-delta correction).
- **`pendingRunInput` gate** at `useRun.ts`. Sim's `createRun` no longer fires on mount; fires only after the player commits via `beginRun` setter, which `ClassSelectScreen` calls via `onConfirm` prop. `M1_PROTOTYPE_CLASS` + `M1_PROTOTYPE_CLASS_LABEL` retired.
- **`applySimSnapshot` field expansion** at `RunController.ts`. Writes `maxHearts: snapshot.ruleset.startingHearts` + `className: CLASSES[snapshot.classId].displayName` on every init/sync. CF 39 + Finding A original close here (both fields were client-owned-derived placeholders; sim-authoritative now). JSDoc amendment removes `className` + `maxHearts` from the untouched-fields list.
- **`createInitialState(classId)` signature**. Was parameterless under M1.5a's `M1_PROTOTYPE_CLASS` hardcode; takes the player-chosen classId. `INITIAL_CLIENT_STATE` uses a `'tinker'` sentinel that is never observed at runtime (RunProvider gates rendering on simRun).
- **`buildCombatInput` sourcing** at `CombatOverlay.tsx`. `classId` + `relics` read from `state.classId` / `state.relics` (Phase 2.5 fix on Codex P1). CF 42 + CF 43 carry-forwards documented inline.
- **HUD display wiring** at `LeftRail.tsx` + `RelicsTab.tsx`. Read class + 3 relic slots from authoritative state via CLASSES + RELICS registries. `GenericRelicGlyph` placeholder for mid + boss relics pending CF 44 named-glyph rollout.
- **`visual-direction.md § 1` amendment** scoping the bag-60% rule to in-run screens (Finding C original close).
- **F.1–F.5 + Phase 2.5 propagation + Phase 2.5b display tests** at `RunController.test.ts` (F.1 + F.2), `ClassSelectFlow.test.tsx` (F.3, NEW), `RelicOfferModal.test.tsx` (F.4), `ClassSelectScreen.test.tsx` (F.5, NEW), `CombatOverlay.test.tsx` (Phase 2.5 buildCombatInput propagation), `LeftRail.test.tsx` (Phase 2.5b, NEW), `RelicsTab.test.tsx` (Phase 2.5b rebaseline + augmentation).
- **`tooling/scripts/extract-design-board.cjs`** helper retained in-tree — one-shot extractor that decoded the design board's base64+gzip bundler manifest into the JSX source the port was authored against. Reusable for future design-board imports.

### Pipeline + schemas (final, verbatim)

```
$ pnpm turbo lint test build --force
...
@packbreaker/client:test:  Test Files  24 passed (24)
@packbreaker/client:test:       Tests  255 passed (255)
@packbreaker/client:test:    Start at  13:15:17
@packbreaker/client:test:    Duration  24.17s

 Tasks:    19 successful, 19 total
Cached:    0 cached, 19 total
  Time:    41.193s
```

```
$ pnpm check-schemas-sync
> packbreaker-arena@0.0.1 check-schemas-sync C:\Users\trobbins\OneDrive - Alevio\Documents\packbreaker-arena
> node tooling/scripts/check-schemas-sync.cjs

check-schemas-sync: OK (content-schemas.ts and packages/content/src/schemas.ts byte-identical)
```

Test counts: **232 (PR baseline at `d2e4d00`) → 247 (post-Phase-2.5 `17bd494`) → 255 (post-Phase-2.5b `0000000`)**. Net **+23 client tests**. Sim test count **unchanged** (no sim-side changes).

### Bundle deltas

#### Table A — vs `main d2e4d00` (PR open baseline)

| Chunk | `d2e4d00` | `0000000` | Δ B | Δ % |
|---|---:|---:|---:|---:|
| **main (`index-*.js`)** | 251,326 | 261,615 | **+10,289** | **+4.09% ✅** |
| sim chunk (`index-*.js`) | 17,113 | 17,123 | +10 | +0.06% |
| `CombatOverlay-*.js` | 1,498,650 | 1,498,705 | +55 | +0.004% |
| `MobileRunScreen-*.js` | 14,135 | 14,565 | +430 | +3.04% |
| `combat-*.js` | 10,611 | 10,613 | +2 | +0.02% |
| `index-*.css` | 10,648 | 11,015 | +367 | +3.45% |
| **NEW** `ClassSelectScreen-*.js` | — | 4,613 | new chunk (lazy) | — |
| **NEW** `MobileClassSelectScreen-*.js` | — | 3,643 | new chunk (lazy) | — |

Main chunk +4.09% — **under the +5% PR budget**. The +10,289 B on main reflects the `atoms.tsx` hoist after Phase 2.5b: atoms is shared between `LeftRail` (eager in main) + lazy `ClassSelectScreen`, so Vite hoists it into main. The lazy `ClassSelectScreen-*.js` chunk correspondingly shrinks (from a hypothetical 14.6 kB if atoms were inside it, down to 4.6 kB after the hoist).

#### Table B — vs `ea2a4b0` (Phase 2 close)

| Chunk | `ea2a4b0` | `0000000` | Δ B |
|---|---:|---:|---:|
| main | 251,769 | 261,615 | +9,846 |
| sim chunk | 17,115 | 17,123 | +8 |
| CombatOverlay | 1,498,683 | 1,498,705 | +22 |
| MobileRunScreen | 14,135 | 14,565 | +430 |
| ClassSelectScreen | 14,609 | 4,613 | −9,996 |
| MobileClassSelectScreen | 3,687 | 3,643 | −44 |
| combat | 10,611 | 10,613 | +2 |
| index.css | 11,015 | 11,015 | 0 |

Net dist delta over Phase 2.5 + Phase 2.5b combined: **+268 B**. Main grew because of the atoms hoist; ClassSelectScreen chunk shrank correspondingly.

#### Table C — vs `17bd494` (Phase 2.5 close)

| Chunk | `17bd494` | `0000000` | Δ B |
|---|---:|---:|---:|
| main | 251,760 | 261,615 | +9,855 |
| sim chunk | 17,114 | 17,123 | +9 |
| CombatOverlay | 1,498,705 | 1,498,705 | 0 |
| MobileRunScreen | 14,135 | 14,565 | +430 |
| ClassSelectScreen | 14,609 | 4,613 | −9,996 |
| MobileClassSelectScreen | 3,687 | 3,643 | −44 |
| combat | 10,611 | 10,613 | +2 |
| index.css | 11,015 | 11,015 | 0 |

Phase 2.5b alone: +256 B net. The atoms hoist into main accounts for the ~10 kB main growth offset by the ~10 kB ClassSelectScreen shrink.

### Codex review outcome

- **Initial review on `ea2a4b0`** (post Phase 2 implementation): **1 P1 finding** — "Apply selected class and relics to combat input." `buildCombatInput` at `apps/client/src/combat/CombatOverlay.tsx:~100-103` hardcoded `classId: 'tinker'` + `emptyRelicSlots()`. Marauder runs played as Tinker; all relic combat effects no-opped. **Finding count: 1/4 ceiling.**
- **Re-review on `0000000`** (post Phase 2.5b, requested via fresh top-level PR comment with `@codex review` per Rule 4 re-engagement discipline): **"Didn't find any major issues."** Finding count stays 1/4. No comprehensive pre-merge meta-audit triggered.

### Visual playtest manifest

| ID | Capture | Status |
|---|---|---|
| (a) | Desktop class-select stage 1 (Marauder + Tinker cards visible, CTA disabled) | ✅ pass |
| (b) | Desktop class-select stage 2 (Marauder selected, Iron Will highlighted) — recap bottom-left absent per disposition (b) | ✅ pass |
| (c) | Mobile class-select stage 1 (stacked Tinker + Marauder cards) | ✅ pass |
| (d) | Mobile class-select stage 2 (Marauder + Iron Will, sticky context header + CHANGE button) | ✅ pass |
| (e) | Post-Begin-Run TopBar under Marauder + Iron Will → 4 heart glyphs visible (CF 39) | ✅ pass |
| (f) | Post-Begin-Run RoundResolution under Marauder + Iron Will → "4/4" not "4/3" (CF 39) | ✅ pass |
| (g) | Mid-run CombatOverlay portrait label reads "Marauder" not "Tinker" (Finding B original) | ✅ pass |
| (h) | Mobile CHANGE affordance functional verification (stage 2 → stage 1 → reselect → stage 2 with new class) | ✅ pass |
| Phase 2.5 (f)-re-capture | Marauder + Razor's Edge combat damage reflects +1 base passive + +2 bonus stacking | ✅ pass |
| Phase 2.5b ClassSelect | Marauder + Iron Will selection round-trip | ✅ pass |
| Phase 2.5b R1 LeftRail | "Marauder" + Marauder passive + "Iron Will" + "+1 heart." + mid/boss EMPTY slots | ✅ pass |
| Phase 2.5b R6 mid-relic offer | Berserker's Pendant + Crimson Pact modal (Marauder pool) | ✅ pass |
| Phase 2.5b R6 post-choice | chosen mid relic appears in LeftRail mid slot with name + description + generic placeholder glyph | ✅ pass (CF 44 placeholder rendering as expected) |
| Phase 2.5b R11 boss-relic offer | Conqueror's Crown modal | ✅ pass |
| Phase 2.5b R11 Victory | Run resolution with 3 relic slots populated (Iron Will / Berserker's Pendant / Conqueror's Crown) | ✅ pass |

### Pattern + catch + rule codification

- **No new patterns codified.** Two pattern candidates registered for second-instance codification:
  - **Pattern candidate #7** — audit / wider-sweep scope must extend to ALL data-flow surfaces affecting the bug's outputs, not just surfaces matching the hypothesized bug shape. Evidence (this PR): 3 Topic 2 drifts of audit-scope shape — Step 0 grep-pattern missed the `classId: 'tinker'` literal in S0v.* (Phase 2 caught it in Phase 2.5 instead), Phase 2.5 wider-sweep limited to input-builder shape but missed display-layer state-reads, Phase 2.5b initial framing hypothesized "state.classId is effectively 'tinker'" when in fact state-write was correct and the bug was on the read side. Single-PR clustering; codify on second occurrence across a different milestone.
  - **Pattern candidate #8** — master-dev factual claims (especially numeric) in framing or acceptance criteria must be source-verified against the codebase before being written. Evidence (this PR): 1 Topic 2 drift — Phase 2.5b DoD #8 wrote "Starting hearts = 5 (4 base + 1 from Iron Will)" when `DEFAULT_RULESET.startingHearts = 3` and iron-will adds 1 → actual = 4 not 5. Single instance; codify on second occurrence.
- **No new catches codified.** One catch candidate registered:
  - **Catch candidate — display-decoupling (C-class)** — HUD components that hardcode prototype defaults instead of reading authoritative state. Symptom: UI lies about state; combat math may be correct while the rail tells the player the wrong story. Detection antidote: integration tests must render the display component AND assert visible text matches state, not just assert state itself. Evidence (this PR): `LeftRail.tsx` fully static + `RelicsTab.tsx` partially wired post-prototype, surviving F.3 / F.5 integration tests because those assert on `state.*` and `runCombat.mock.calls`, not on rendered DOM. Single instance; codify on second occurrence.
- **No new rules codified.** One rule candidate registered:
  - **Rule candidate — vitest `mock.calls` accumulates across tests by default**; call `mockClear()` in `beforeEach` (or before render in the specific test) when asserting on call indices/contents. Evidence (this PR): Phase 2.5 propagation test initially asserted on Case A's leftover Tinker call before `mockClear` was added in `beforeEach`. Single instance; codify on second occurrence.

### Findings A/B/C dispositions

Two parallel A/B/C labellings emerged across this PR — both are documented for traceability.

**Phase 1 original Findings A/B/C (entered PR scope at Phase 1 framing):**
- **Finding A (original)** — `className` derivation; commit `2cbea85` (Phase 2 D), `applySimSnapshot` writes `CLASSES[snapshot.classId].displayName`. **Closed.**
- **Finding B (original)** — `CombatOverlay` portrait label hardcoded to `'Tinker'`; commit `68169bf` (Phase 2 E), reads `ctx.state.state.className`. **Closed.**
- **Finding C (original)** — `visual-direction.md § 1` bag-60% rule applied universally instead of in-run-only; commit `90ab6e8` (Phase 2 A), single-line scoping amendment. **Closed.**

**Post-Phase-2 Findings A/B/C (entered PR scope post-implementation):**
- **Finding A (post-Phase-2; Codex P1 on PR 16 `ea2a4b0`)** — `buildCombatInput` classId + relics hardcoded; commit `17bd494` (Phase 2.5), reads `state.classId` / `state.relics`. **Closed.**
- **Finding B (post-Phase-2; playtest catch on `17bd494`)** — `LeftRail.tsx` fully static, `RelicsTab.tsx` partially wired; commit `0000000` (Phase 2.5b), both surfaces wired to authoritative state. **Closed.**
- **Finding C (post-Phase-2; master-dev-only)** — Phase 2.5b framing's "Starting hearts = 5 (4 base + 1)" numeric drift vs `DEFAULT_RULESET.startingHearts = 3`. **Master-dev annotation only**; no code impact (actual hearts under Marauder + Iron Will = 4, matches F.1 regression assertion). Surfaces as Pattern candidate #8 evidence.

### CF dispositions across PR

- **CF 39 closed** (M1.5a PR 3 open; M1.5b PR 1 Phase 2 D close) — `applySimSnapshot` writes `maxHearts: snapshot.ruleset.startingHearts` so the field tracks sim-authoritative effective ruleset. Resolves the iron-will Marauder fingerprint (TopBar/MobileTopBar render 4 hearts under +1 bonusHearts; RoundResolution displays 4/4 not 4/3). Closure commit: `2cbea85`. Regression test: F.1 at `RunController.test.ts § applySimSnapshot CF 39 + Finding A regressions`.
- **CF 40 opened (NEW)** — `contractName` + `contractText` hardcoded literals at `createInitialState`. Currently the only contract is `neutral` so the hardcode matches. Defer to M2 contract system (when the second contract ships, `createInitialState` reads from `CONTRACTS[contractId].displayName` + `description`). Auto-close trigger: M2 contract system or first non-neutral contract. **Severity**: cosmetic / placeholder.
- **CF 41 opened (NEW)** — `run_start` telemetry payload reconciliation re. `startingRelicId`. The sim's emit site (`packages/sim/src/run/state.ts § run_start`) writes `{ runId, classId, contractId, seed }` per `telemetry-plan.md § 3 Run lifecycle`. The plan's § 1 *prose* implies starter-relic-choice is captured (`run_start` fires "when the player commits to a run after class + relic select"), but `startingRelicId` is not actually in the payload. Folds into CF 35 scope at the M1.5b telemetry milestone (sim-side schema extension required to add the field). Auto-close trigger: CF 35 closes.
- **CF 42 opened (NEW)** — `buildCombatInput.startingHp: 30` Rule 6 violation. `BASE_COMBATANT_HP = 30` and no M1 item ships `passiveStats.maxHpBonus`, so the hardcode matches the derivation rule on `schemas.ts § Combatant` comment for every M1 build. Auto-close trigger: first M1 item with `maxHpBonus` ships → replace with a client-side analog of sim's `computeStartingHpFromBag`. **Severity**: latent — Rule 6 violation with zero current impact. Inline comment in `buildCombatInput` documents the deferral.
- **CF 43 opened (NEW)** — `buildCombatInput.recipeBornPlacementIds` omission. Sim's internal `bornFromRecipe` set is unreachable from the client tier; client's `clientRunReducer` combine arm does not track which placement-ids were minted by `combineRecipe`. Tinker's `class.passive.recipeBonusPct: 10` + recipeBonusPct relics (Pocket Forge `+15%`, Catalyst `+30%`) silently no-op in client-side combat. Pre-existing bug from M1.3.4a's `M1_PROTOTYPE` wiring (predates this PR). Defer to M1.5b PR 2 / LocalSaveV1 — fix requires new client-side state (`bornFromRecipe: Set<PlacementId>` on `ClientRunState`, enrich `combine` reducer arm to record output placement-ids, thread into `buildCombatInput`). **Severity**: bug — combat math currently undervalues recipe-output damage / healing for Tinker class + Pocket Forge / Catalyst builds. Inline comment in `buildCombatInput` documents the deferral.
- **CF 44 opened (NEW)** — Mid + boss relic named glyphs. Six relics across Marauder + Tinker mid/boss pools (`resonant-anchor`, `catalyst`, `worldforge-seed`, `berserkers-pendant`, `crimson-pact`, `conquerors-crown`) currently render with the `GenericRelicGlyph` placeholder (diamond + dot) in `LeftRail` + `RelicsTab`. Functional display is correct (name + description from `RELICS[id]`); the glyph is the only cosmetic gap. Defer to M2 visual polish or earlier asset cycle. Auto-close trigger: named glyphs land for all 6 mid + boss relics (likely as additions to `atoms.tsx § RelicGlyph` switch). **Severity**: cosmetic-only.
- **`M1_PROTOTYPE_CLASS` + `M1_PROTOTYPE_CLASS_LABEL` retired.** Both constants deleted at commits `2cbea85` + `68169bf`. No remaining production references; test fixtures use explicit `'tinker' as ClassId` / `'marauder' as ClassId` casts.

### Counters at PR close

| Counter | Pre-PR-1 (post-M1.5a-PR-3) | Post-PR-1 |
|---|---|---|
| Open CFs | 29 | 33 (CF 39 closed; CFs 40, 41, 42, 43, 44 opened; net +4) |
| Architectural patterns | 6 | 6 (Pattern candidates #7 + #8 held for second instance) |
| Predicate-vs-name catches | 17 | 17 (display-decoupling catch candidate held for second instance) |
| Locked answers | 32 | 32 |
| Going-forward rules | 8 | 8 (vitest mockClear rule candidate held for second instance) |
| Master-dev chat drifts (Topic 2 counter) | 15 | 20 (+5 this PR: S0v.6 telemetry payload contract, Step 0 grep-pattern incompleteness, recap audit screenshot/source confusion, Phase 2.5 wider-sweep scope limit, Phase 2.5b heart-math numeric fact-check) |

### Coupling notes for future-self

- `apps/client/src/screens/class-select/atoms.tsx` exports primitives consumed by both class-select chrome and run-screen chrome (`LeftRail` / `RelicsTab`). The class-select-screen module became the canonical class + starter-relic glyph source. If future PRs want to break this coupling (e.g., move glyphs to `icons/icons.tsx` or a dedicated `class-relic-icons/` module), the work is mechanical.
- `tooling/scripts/extract-design-board.cjs` retained as a reusable extractor for future Claude Design board imports. One-shot for this PR.
- Pre-existing unused exports in `apps/client/src/icons/icons.tsx`: `TinkerGlyph` + `RelicLoop` are no longer referenced (LeftRail + RelicsTab moved to atoms-sourced glyphs). Cleanup is optional; not load-bearing.

---

## 2026-05-19 — M1.5b PR 1 Phase 2.5b interlude: LeftRail + RelicsTab read class/relics from authoritative state (playtest catch on 17bd494)

Visual playtest on PR 16 commit `17bd494` (Phase 2.5 buildCombatInput fix) surfaced a P0: selecting Marauder + Iron Will on `ClassSelectScreen` and clicking Begin Run landed on a run-screen rail rendering "CLASS: Tinker / +10% recipe potency / Apprentice's Loop / EMPTY / EMPTY". Diagnostic at Step 2.5b.0 verified the state-write chain (ClassSelectScreen → useRun.beginRun → sim.createRun → applySimSnapshot) is correct end-to-end — F.3 + F.5 integration tests assert `state.classId === 'marauder'` and pass. The bug is purely **display-side decoupling**: `apps/client/src/hud/LeftRail.tsx` is fully static (no `useRunContext`, no state reads at all), and `apps/client/src/screens/mobile/tabs/RelicsTab.tsx` reads only `state.className` (everything else hardcoded). Marauder-only `berserkers-pendant` + `crimson-pact` appearing in the round-6 mid-relic modal confirmed `state.classId === 'marauder'` at runtime, ruling out the framing's "state seeded as Tinker" hypothesis.

Fix: wire both surfaces to authoritative state. LeftRail + RelicsTab now read `state.classId` → `CLASSES[classId].displayName` + `CLASSES[classId].passive.description` for the class card; `state.relics.starter / .mid / .boss` → `RELICS[id].name` + `.description` for each slot. Slots resolve to `EmptyRelicSlot` (existing dashed-border placeholder) when their relic id is null. Class portraits use `ClassMark` (from `apps/client/src/screens/class-select/atoms.tsx`, covers both classes). Starter relics use `RelicGlyph` (covers all 6 starter relic ids). Mid + boss relics use a new `GenericRelicGlyph` (diamond + dot, 1.5px-stroke vector-flat in atoms.tsx) pending named-glyph rollout — see CF 44 below.

**Why the prior tests didn't catch it**: F.3 + F.5 + Phase 2.5 propagation tests assert on `state.*` and `runCombat.mock.calls[0]`. No test rendered LeftRail / RelicsTab and asserted the visible text matched state. New integration coverage at `apps/client/src/hud/LeftRail.test.tsx` (NEW, 5 tests) + augmented `apps/client/src/screens/mobile/tabs/RelicsTab.test.tsx` (rebaselined existing 2 tests + 4 new) drives the display surface across Marauder/Iron Will, Tinker/Apprentice's Loop, mid-granted, boss-granted, and all-slots-empty fixtures.

### CF dispositions

- **CF 44 (NEW)** — Mid/boss relic named glyphs. Six relics across Marauder + Tinker mid/boss pools (`resonant-anchor`, `catalyst`, `worldforge-seed`, `berserkers-pendant`, `crimson-pact`, `conquerors-crown`) currently render with a generic diamond-and-dot placeholder in LeftRail + RelicsTab. Functional display is correct (name + description from `RELICS[id]`); the glyph is the only cosmetic gap. Defer to M2 visual polish pass or earlier asset cycle. **Auto-close trigger**: named glyphs land for all mid + boss relics across both classes (likely as additions to `screens/class-select/atoms.tsx` `RelicGlyph` switch, or as a sibling icon module). **Severity**: cosmetic-only; functional display works with placeholder.

### What stays open

- **CF 42** (open, M1.5b PR 1 Phase 2.5): `buildCombatInput.startingHp: 30` hardcode. No M1 item ships `passiveStats.maxHpBonus` so the value is correct for every M1 build; auto-closes when the first `maxHpBonus` item ships.
- **CF 43** (open, M1.5b PR 1 Phase 2.5): `buildCombatInput` omits `recipeBornPlacementIds`. Tinker class passive `recipeBonusPct` + Pocket Forge + Catalyst silently no-op in client-side combat pending client-side `bornFromRecipe` tracking. Defer to M1.5b PR 2 / LocalSaveV1.

### Coverage gap codification (deferred to PR close)

The class-of-bug — "state-write chain correct, display reads defaults" — has now surfaced once (Phase 2.5b). The full Rule 5/6-style codification is deferred to the M1.5b PR 1 closing log; the Phase 2.5b open here documents the instance for future-self.

---

## 2026-05-17 — M1.5a PR 3 closed (relic offers + run-end detection + CF 14 regression test)

### Branch + commit topology

Branch: `m1.5a-pr3-relics-and-runend` off main `92159f9` (post-PR-2 close baseline). Six branch commits + `--no-ff` merge commit `d3f2409` (two-parent topology: 92159f9 + a45f746).

| SHA | Sub-phase | Scope |
|---|---|---|
| `b569f65` | Phase 2a — sim-side generators | `generateMidRelicOffer` + `generateBossRelicOffer` + `RELIC_OFFER_STRIDE = 65519` in `packages/sim/src/run/relicOffer.ts`. Slot multipliers `MID = 1` / `BOSS = 2` (locked answer 15 sub-decision under §6e Q6). Pure: `(seed, classId) → ReadonlyArray<RelicId>`. Sim test count 474+1 → 487+1 (+13). Rule 7 barrel sweep on commit (sim/run/index.ts + sim/src/index.ts). |
| `edd668e` | Phase 2b — client wire + mid offer + run-end | `pendingRelicOffer` useMemo in `apps/client/src/run/useRun.ts` (slot literal forward-compat `'mid' \| 'boss'`; mid branch shipped, boss carved to Phase 2d per Catch 12 resolution); `grantSelectedRelic` useCallback; `mirrorsSimShouldEndRun` helper in `apps/client/src/run/runEnd.ts` (structural narrow `{ outcome: RunOutcome }`); `RelicOfferModal` + `RunEndOverlay` components; +7 RunContext.test.tsx integration cases; +1 RelicOfferModal.test.tsx forward-compat boss-render test. Client test count 210 → 226 (+16). Bundle main +3.43 KB raw / +0.89 KB gz vs Phase 2a; CombatOverlay byte-identical. **Catch 12 (NEW, Class A)** surfaced via Rule 6 + Rule 8 halt-gate; closed structurally by scope cut. **CF 21 detection-side closes.** |
| `1c810ed` | Phase 2c — CF 14 regression test | `apps/client/src/shop/ShopController.test.ts`: Case A Apprentice's Loop chain + non-default Ruleset levers (`rerollCostStart = 5`, `rerollCostIncrement = 2`); Case B default sanity. Client test count 226 → 228 (+2). **Catch 13 (NEW, Class A)** surfaced via Rule 6 Step 0 — prompt premise "ShopController reads `extraRerollsPerRound`" contradicted shipped consumer chain (RunController + useRun + ShopPanel + ShopTab); `rerollCostDelta` premise drift (RelicModifiers, not DerivedModifiers). Closed structurally by Phase 2c scope clarification + Case A redesign. **CF 14 closes.** |
| `fed341d` | Phase 2d — boss offer + onCombatDone defer | Phase 1 take-1 + take-2 halt-gates ratified Q1-Q7 design. Unified `pendingRelicOffer` useMemo extended with boss-precedence branch (Phase 2b mid body byte-identical per Pattern 5; deps extended with `state.state.relics.boss` + `state.state.history.length` witness — `getState()` returns `this.history.slice()` so the array reference is unstable; `.length` is primitive and content-stable per sim's append-only invariant). Inline three-line defer predicate in `onCombatDone` (mirrors useMemo boss gate); phase-conditional `simRun.advancePhase()` resume in `grantSelectedRelic` via `simRun.getPhase() === 'resolution'` (NOT `getState().phase` per Catch 15 closure). +4 RunContext.test.tsx integration cases; self-contained per-test setup (existing `driveSyncWithSnapshot` helper doesn't expose advancePhase spy handles; extending would force signature change at 7 call sites; Phase 2.5d `setupTerminalState` precedent at RunContext.test.tsx:649). RelicOfferModal.test.tsx 3rd test comment polish. Class D zero-delta axes verified: `RunContext.tsx` + `RunController.ts` + `RelicOfferModal.tsx` (component) untouched. Client test count 228 → 232 (+4). Bundle main +0.59 KB raw / +0.15 KB gz vs Phase 2b; CombatOverlay byte-identical. **Catch 14 (NEW, Class A)** + **Catch 15 (NEW, Class A)** surfaced at Phase 1 take-1 + take-2 respectively; closed structurally via amended Q1/Q1.b dispositions. |
| `f446fc5` | Phase 2.5i — Codex P2 #1 (barrel lazy boundary) | Codex automated review on PR #15 (Phase 2d HEAD) surfaced P2: static barrel import of `generateMidRelicOffer` + `generateBossRelicOffer` from `@packbreaker/sim` coupled `useRun`'s main-chunk membership to the root barrel's tree-shake behavior — structurally regressible against future barrel composition changes. **Catch 16 (NEW, Bucket C2 — Rule 4 instance).** Fix: Path B workspace-source subpath `@packbreaker/sim/src/run/relicOffer` (1-line import change + 9-line explanatory comment). Path A (exports field addition) rejected on cost grounds (~5-8 line cross-package contract vs 1-line). Bundle envelope post-fix: all 5 chunks byte-identical raw including content hashes — reveals barrel tree-shake was already effective in practice; fix is pure structural hygiene removing the regressibility surface without altering current runtime behavior. relicOffer.ts transitive imports verified clean at Step 0 (only `@packbreaker/content` types + `../rng`; zero `state.ts` coupling). |
| `a45f746` | Phase 2.5ii — Codex P2 #2 (effective ruleset flowthrough) | Codex re-review of f446fc5 surfaced P2 #2: `RunController.getState().ruleset` aliased `this.contract.ruleset` (base) instead of `this.effectiveRuleset` (composed post-grantRelic). Client shop regenerator (`combat_done` arm) + reroll arm read `state.state.ruleset.shopSize` → resonant-anchor's `shopSize + 1` modifier silently lost (recorded in `relics.mid` but no extra shop slot). Snapshot's `shop` field was already effective (`makeShop` uses `effectiveRuleset` internally), so the snapshot was internally inconsistent. **Catch 17 (NEW, Bucket C2 lineage extension to sim-API contract surfaces — Rule 4 instance).** Fix: Option A 1-line sim change at `state.ts:320` `ruleset: this.contract.ruleset` → `ruleset: this.effectiveRuleset` + 8-line explanatory comment. Zero client changes; zero test updates needed (Step 0 audit found zero class-(a) tests pinning on base ruleset semantics). Determinism fixtures byte-stable (action variants serialize pure inputs; no snapshot in stream). Options B' (client consumes snapshot.shop) and D (extend DerivedModifiers with shopSize) rejected per halt-gate Step 1 — B' tangles take-1 D scope; D reintroduces dual-declaration drift surface that DerivedModifiers' v0.6 canonical-declaration migration closed. Iron-will (Marauder starter, `bonusHearts + 1`) surfaced as Rule 5 expansion second instance per halt-gate S0.9; fingerprint conclusion (b) — Marauder unreachable at HEAD (`M1_PROTOTYPE_CLASS = 'tinker'`), bug latent. **CF 39 opens.** Bundle envelope: all 5 chunks byte-identical raw; main gz shrank by 10 bytes (minified field-name compression noise); CombatOverlay byte-identical raw + gz. |
| `d3f2409` | Merge | `--no-ff` merge of m1.5a-pr3-relics-and-runend into main. Two-parent topology (92159f9 + a45f746). Auto-closes PR #15 server-side. |

### What landed (load-bearing surface summary)

- **Sim-side relic offer generators** at `packages/sim/src/run/relicOffer.ts`: pure, deterministic, content-pool-filtered by class eligibility. Slot multipliers MID = 1, BOSS = 2 × `RELIC_OFFER_STRIDE = 65519`. Re-exported through both sim package barrels per Rule 7.
- **Unified client offer detection** via `pendingRelicOffer` useMemo with boss-precedence (round-11 win + boss slot empty gate before round-6+ mid gate). Recomputes on dep change; no useEffect mount-side hook required. Phase 2b's forward-compat slot literal type was the foundation Phase 2d extended without restructure.
- **onCombatDone hard defer** on round-11 win + boss slot empty branch. Sim's `outcome` stays `'in_progress'` through the boss-claim window. Inline three-line predicate mirrors useMemo boss gate.
- **grantSelectedRelic phase-conditional resume**: calls `simRun.advancePhase()` when post-grant `simRun.getPhase() === 'resolution'` (boss-claim resume; mid grant skips). Uses `getPhase()` controller method, not the non-existent `getState().phase` snapshot field.
- **Client run-end detection** via `mirrorsSimShouldEndRun(state)` helper at `runEnd.ts`. Structural-narrow predicate `state.outcome !== 'in_progress'`. Drives `RunEndOverlay` render-gate.
- **Mutual exclusion** between offer modal and run-end overlay: modal renders iff `outcome === 'in_progress'`; overlay renders iff `outcome !== 'in_progress'`. Hard defer keeps outcome at `'in_progress'` through the claim window; no both-render state.
- **Sim API contract correction (Phase 2.5ii)**: `RunController.getState().ruleset` aliases `this.effectiveRuleset` (composed). All four downstream client consumers of `state.state.ruleset` (combat_done generateShop, reroll arm generateShop, useRun.onReroll computeRerollCost, ShopPanel/ShopTab affordability) pick up effective values automatically. Base contract ruleset accessible via `contractId → CONTRACTS` lookup if any consumer needs it.
- **CF 14 regression test** at `apps/client/src/shop/ShopController.test.ts`: Apprentice's Loop chain + non-default Ruleset levers stress-tested.

### Pattern + catch + rule codification

- **No new patterns** in PR 3. Pattern candidate #8 (workspace-source subpath imports for fine-grained boundary control against barrel composition fragility) held for second-instance per standing convention; Phase 2.5i Path B is the first instance, M1.4b1 Phase 2.5 cache-replay precedent shape doesn't match. Watch in M2 for any new main-chunk file importing sim/content/ui-kit at static-link tier.
- **Catches 12–17 (NEW)** — 6 new predicate-vs-name catches across PR 3. Lineage:
  - Catch 12 (Class A) — Phase 2b boss-grant phase gate scope cut. Closed structurally by scope cut (mid + run-end ship; boss carves to Phase 2d).
  - Catch 13 (Class A) — Phase 2c CF 14 consumer chain + derived-vs-source field drift. Closed structurally by Case A redesign.
  - Catch 14 (Class A) — Phase 2d Phase 1 take-1 ClientRunState tier extrapolation. Closed structurally via amended Q1 useMemo disposition.
  - Catch 15 (Class A) — Phase 2d Phase 1 take-2 `getState().phase` field-presence drift. Non-halting; closed structurally via Phase 2 prompt input checklist + implementation.
  - Catch 16 (Bucket C2 — Rule 4 instance) — Phase 2.5i barrel lazy-boundary regressibility. Closed structurally via Path B workspace-source subpath.
  - Catch 17 (Bucket C2 lineage extension — Rule 4 instance) — Phase 2.5ii §4.5 R2 authority binding violation in sim-API contract surface (snapshot.ruleset alias). Closed structurally via Option A. Bucket C2 scope expanded to cover sim-API contract surfaces in addition to framework-internal architecture.
- **No new rules.** Rule 5 + Rule 6 amendments codified below.

### Amendments codified at PR 3 close

**Rule 5 amendment** (second-instance threshold met).

> **Going-forward rule #5 (amended at M1.5a PR 3 close).** Phase 1 investigations claiming content-scope facts OR architectural-tier scope claims about which surfaces stay client-parallel / sim-authoritative / etc., require content-side evidence: at minimum one targeted grep of `packages/content/` enumerating which content (relics, items, contracts) mutates the surface in question. Schema-side evidence alone is insufficient — schema permits a superset of what content exercises.

Instances:
- #1 (original, M1.4b2.3 § Phase 1 §2 BuffableStat case, 2026-05-07; pre-M1.5 retro Topic 4 ratification 2026-05-08).
- #2 (M1.5a Phase 1 design take-1 D ratification 2026-05-11): "Bag + shop mutations stay client-parallel for 5a" claim without enumerating ruleset-modifying relics. Phase 2.5ii halt-gate S0.9 (2026-05-17) surfaced resonant-anchor (Tinker mid, `shopSize + 1`) + iron-will (Marauder starter, `bonusHearts + 1`) independently of the Codex finding's named case, confirming the same content-grep discipline applies to architectural-tier scope claims.

**Rule 6 amendment** (5-instance fatigue threshold; codification convention bent at 5-instance rather than typical second-instance, mirroring Phase 2.5 interlude escalation precedent).

> **Going-forward rule #6 (amended at M1.5a PR 3 close).** Phase 2 prompt premises with type signatures, field presence on a named type, consumer file location for a named symbol, or value-space membership must be re-derived from shipped state in Step 0 surface verification; ratified dispositions in resume instructions must not be silently reverted in implementation.

M1.5a instances: Catch 11 (PR 2 close, Class D framing), Catch 12 (PR 3 Phase 2b, Class A), Catch 13 (PR 3 Phase 2c, Class A), Catch 14 (PR 3 Phase 2d Phase 1 take-1, Class A), Catch 15 (PR 3 Phase 2d Phase 1 take-2, Class A). Coverage extended from original type-signature drift framing (PR 1 codification) to field-presence + structural-flow + consumer-file-location + derived-vs-source-field + tier-extrapolation drifts.

**Take-1 D scope amendment** (clarifies architectural authority boundary).

> **Take-1 D (amended at M1.5a PR 3 close, surfaced by Catch 17).** Original (2026-05-11): "Bag + shop mutations stay client-parallel for 5a (revisit at 5b.3 if LocalSaveV1 reveals need)." Amended: "Bag + shop mutations (purchases, drags, rerolls dispatched via client reducer arms) stay client-parallel for 5a; the RULESET INPUT to client shop generation is sim-authoritative (`snapshot.ruleset` is the effective ruleset post-relic composition per Phase 2.5ii); revisit shop generation ownership at 5b.3 if LocalSaveV1 reveals need."

### CF dispositions across PR 3

- **CF 14 closed (Phase 2c)** — ruleset-modifier reroll cost authority regression test landed in `ShopController.test.ts` with Apprentice's Loop + non-default Ruleset levers.
- **CF 21 detection-side closed (Phase 2b)** — `mirrorsSimShouldEndRun` helper landed at `apps/client/src/run/runEnd.ts`. Summary-side carries to 5b.2 (CF stays open with detection-side-resolved annotation).
- **CF 39 (NEW)** — maxHearts re-sync from sim's effective ruleset. `state.maxHearts` set from `DEFAULT_RULESET.startingHearts` in `createInitialState` at module-load singleton (RunController.ts INITIAL_CLIENT_STATE); `applySimSnapshot` field list (RunController.ts:174-191) omits `maxHearts` → never re-synced. Iron-will (Marauder starter, `bonusHearts + 1`) canonical trigger; Marauder unreachable at M1.5a HEAD (`M1_PROTOTYPE_CLASS = 'tinker'` hardcoded constant per Phase 2.5ii Step 3 S3.1) makes the bug latent. Fix shape: 1-line addition `maxHearts: snapshot.ruleset.startingHearts` to `applySimSnapshot`. Visible-bug fingerprint under Marauder + iron-will: TopBar/MobileTopBar render 3 filled hearts (length: maxHearts=3, all filled since i < hearts=4); RoundResolution displays `4/3`. Disposition: 5b.1 alongside class-select UI. Surfaced by Phase 2.5ii Step 3 fingerprint conclusion (b). Rule 5 expansion second-instance evidence.

### Counters at PR 3 close

| Counter | Pre-PR-3 | Post-PR-3 |
|---|---|---|
| Architectural patterns | 6 | 6 |
| Predicate-vs-name catches | 13 | 17 |
| Locked answers | 32 | 32 |
| Going-forward rules | 8 | 8 (Rule 5 + Rule 6 amendments; no new) |
| Master-dev chat drifts (Topic 2 counter) | 12 | 15 |
| Open carry-forwards | 28 | 29 |

### Codex external review summary

PR #15 received 2 P2 findings cumulative across 3 review passes:
- **Review 1** (fed341d, Phase 2d HEAD): 1 P2 — barrel lazy-boundary regressibility. Closed structurally via Phase 2.5i.
- **Review 2** (f446fc5, Phase 2.5i HEAD; re-requested via top-level `@codex review` comment): 1 P2 — snapshot.ruleset effective-ruleset flowthrough. Closed structurally via Phase 2.5ii.
- **Review 3** (a45f746, Phase 2.5ii HEAD; re-requested via top-level `@codex review` comment): clean ("Didn't find any major issues. Hooray!").

Rule 4 catch checkpoint satisfied. Catches 16 + 17 caught by Codex per Rule 4 framing. 4-finding ceiling: 2/4 cumulative — standing agreement (4th finding → comprehensive pre-merge meta-audit) not triggered. Codex re-engagement pattern via top-level `@codex review` comment (NOT thread reply) continues to work; PR 2 close precedent confirmed.

### Process learnings (uncodified; logged for second-instance watch)

- **Pattern candidate #8** — workspace-source subpath imports for fine-grained boundary control against barrel composition fragility. Single instance (Phase 2.5i Path B). Codification convention is second-instance; hold + watch in M2.
- **Rule candidate #9** — static imports from a workspace package's root barrel are forbidden in main-chunk-load-path files where the barrel transitively re-exports lazy-boundary surfaces; use workspace-source subpath. Single instance (Phase 2.5i). Same M2 watch.
- **Latent semantic shift in strategies.ts** (Phase 2.5ii Step 0 S0.3): `state.ruleset.rerollCostStart` reads will silently switch from base to effective semantics when the first `rerollCostDelta`-shipping relic ships post-M1. Correct semantic direction (strategies simulate player behavior; players perceive effective costs). No action now; log for future-content review.
- **Master-dev Rule 10 category 2 drift** (Phase 2d Phase 2 prompt): specified "23/23 tasks" with command `lint test build` (era-mixed; 19 is correct count for that command). Drift #15. Category 2 (quantitative-baseline transposition across command specs) is first instance of THIS specific shape; watch for second instance before extending Rule 10's category list.
- **Self-contained per-test setup precedent** (Phase 2d Step 4): when existing test helper doesn't expose required spy handles AND extending it would force signature change at multiple call sites, self-contained per-test setup with shared boilerplate is the lower-overhead path. Phase 2.5d `setupTerminalState` precedent referenced. Watch for second instance before codifying.

### PR 4 / 5b queue carry-context pre-flags

- **5b.1** (class-select + starter relic): exposes Marauder runtime-reachability, triggering iron-will visible-bug fingerprint. Fix CF 39 by extending `applySimSnapshot` field list with `maxHearts: snapshot.ruleset.startingHearts`. Verify TopBar / MobileTopBar / RoundResolution render correctly under Marauder + iron-will. Optional integration test: `state.state.maxHearts === snapshot.ruleset.startingHearts` post-sync. Closes CF 39.
- **5b.2** (run-end summary surface): CF 21 summary-side closure. Build the run-end summary screen consuming sim's `history` + `outcome`.
- **5b.3** (LocalSaveV1 persistence): CF 38 closure. Persist run state across reloads. Likely re-opens take-1 D shop-generation ownership review per amendment text ("revisit shop generation ownership at 5b.3 if LocalSaveV1 reveals need").
- **Rule 6 amended scope inheritance**: all subsequent Phase 2 prompts re-derive type signatures + field presence + consumer location + value-space membership from shipped state in Step 0.
- **Rule 5 amended scope inheritance**: all Phase 1 design halt-gates with architectural-tier scope claims (client-parallel, sim-authoritative, etc.) include content-grep evidence enumerating relics/items/contracts mutating the surface.
- **4-finding ceiling watch** remains for PR 4 onward.

### Verification (final state, post-Phase-2.5ii a45f746)

```
pnpm turbo lint test build --force
Tasks:    19 successful, 19 total
Cached:    0 cached, 19 total
Time:    41.201s

pnpm check-schemas-sync
check-schemas-sync: OK (content-schemas.ts and packages/content/src/schemas.ts byte-identical)
```

Test counts at PR 3 close: sim 487 + 1 skipped; client 232 (was 210 pre-PR-3; +22 across Phase 2b +16 / Phase 2c +2 / Phase 2d +4); ui-kit 27; content 30. Workspace files: 39.

Determinism: 224 .jsonl + 6 .json fixtures replay byte-stable across the full branch (Phase 2.5ii Step 0 S0.4 confirmed action variants are pure inputs; snapshots not serialized in the action stream).

Bundle envelope (cumulative 92159f9 → a45f746): main +4.02 KB raw / +1.04 KB gz (Phase 2a sim-side only, no main delta; Phase 2b +3.43 KB / +0.89 KB; Phase 2c no client surface; Phase 2d +0.59 KB / +0.15 KB; Phase 2.5i + 2.5ii byte-identical raw on main, with Phase 2.5ii main gz -10 bytes from minified field-name compression noise). CombatOverlay byte-identical across all 6 commits (lazy boundary preserved per PR 1 §2a A.1 resolution). CombatOverlay hash variance: `CombatOverlay-DMzGMH_0.js` at Phase 2d → `CombatOverlay-B-ESmU8_.js` at Phase 2.5ii — hash changed because Phase 2.5ii's source change re-emitted the artifact, but raw + gz sizes byte-identical and chunk-graph composition unchanged.

---

## 2026-05-15 § M1.5a PR 2 closed

Merge commit `574d74b956ef89c7ffac6d5e333c1772cda8d473` on `main`. PR #14 closed (8-commit feature branch + merge). M1.5a PR 2 ships the client sim RunController integration foundation (Phase 2a + 2b-1 + 2b-2 + 4 reactive Phase 2.5 sub-phases + 1 halt-in-inspection sub-phase). Codex Finding 5 deferred to CF 38.

### Phase chain

| Commit | Phase | Summary |
|---|---|---|
| 574d74b | merge | --no-ff merge into main (PR #14 close) |
| 8eba201 | 2.5h | Codex Finding 4 fix — trophy client-authoritative restore |
| 10de04e | 2.5f | Codex Finding 3 fix — explicit `SHOP_POOL_ITEMS` on `createRun` + `simulateCombat` |
| 7cacdac | 2.5d | Codex Finding 2 fix — terminal-outcome handler guards |
| baafab6 | 2.5b | Codex Finding 1 fix — init bootstrap shop overwrite |
| f6ccd5b | 2b-2 | active sim routing cutover |
| cb2ae0f | 2b-1 | sim instance + sync infrastructure |
| 00abda3 | 2a | `enter_combat_phase` action + `opponentClassId` tighten (5 construction sites swept) |
| 7b03672 | 1 | design halt-gate ratified (docs, pre-branch on local main) |
| 5b56539 | — | BASE (PR 1 closing log) |

Phase 2.5g: comprehensive pre-merge meta-audit per standing agreement (4th in-PR Codex finding); no commit (audit findings folded into Phase 2.5h). Phase 2.5i: halt-in-inspection sub-phase on Codex Finding 5; no commit (three structural resolution paths × three UX semantic directions entangled; surface refused plumbing-only character; deferred to CF 38).

### What landed (cross-references to Phase 1 dispositions)

Phase 1 design halt-gate Q1–Q7 ratifications at `decision-log.md 2026-05-13 § M1.5a PR 2 Phase 1 design halt-gate ratified` (commit 7b03672, on main pre-branch). Implementation map:

- **Q1** (enter_combat_phase action) → Phase 2a: action ID added to `packages/sim/src/run/actions.ts`; `RunController.enterCombatPhase()` method added; phase transition delegated to sim per ratification
- **Q2 Amendment A** (sync_from_sim bifurcated authority) → Phase 2b-1/2: client-authoritative fields (gold / rerollCount / bag / shop) on ignore-list in `applySync()`; sim-authoritative fields (hearts / history / derived / relics / outcome / etc.) flow through. **Load-bearing disposition; whole PR turned on this.**
- **Q3** (dynamic-import createRun via @packbreaker/sim root barrel) → Phase 2b-1: Suspense boundary in RunProvider; MobileFallback-pattern fallback. Bundle split surfaces in `combat-deferred` chunk
- **Q4** (bag/shop client→sim mirror deferred to 5b) → out of PR 2 scope; CF 34
- **Q5** (trust sim invariants; no try/catch around simRun dispatches) → Phase 2b-2 α exception ratified: `rerollShop` insufficient-gold try/catch on client side (sim throws; client preserves trophy floor). Sim-side untouched
- **Q6** (onTelemetryEvent stubbed) → stub-only in PR 2; CF 35
- **Q7** (`ApplyCombatOutcomeInput.opponentClassId` required-nullable) → Phase 2a Step 0: 5 construction sites swept; type tightened

α + β (Phase 2b-2): α = client-side `rerollShop` try/catch (above). β = combat-done gold capture-delta — sim-side authority via before/after observation of `state.gold` across `simulateCombat` call, captured into `goldDelta` per `packages/sim/src/run/state.ts:363`. Phase 2.5h reaffirmed trophy is α-shape (client-side preservation; sim has no `trophiesAtStart` field).

### Codex iteration recap

5 findings total over PR 2:

| Finding | Severity | Closed by | Pattern |
|---|---|---|---|
| 1 | P2 | Phase 2.5b | init bootstrap shop overwrite (reducer arm missing) |
| 2 | P2 | Phase 2.5d | terminal-outcome handler guards (RunOutcome literal: actual is `'won'`, Codex wrote `'completed'` — architectural intent preserved, symbol wrong) |
| 3 | P2 | Phase 2.5f | content-equality test missed pool-validity orthogonal divergence (Codex invented helper names — `BASE_POOL_ITEMS` / `filterDocumented` / `applyClientLanguageDocLayer` — actual chain: `ICONNED_ITEM_IDS` → `ICONNED_SET` → `SHOP_POOL_ITEMS`) |
| 4 | P2 | Phase 2.5h | trophy stuck-at-zero (triggered standing-agreement comprehensive Phase 2.5g audit) |
| 5 | P2 | **deferred to CF 38** | resolution panel reward display sync (Class D co-drift, see below) |

3 reactive iterations were tolerable; the 4th (Phase 2.5h) triggered the comprehensive Phase 2.5g pre-merge meta-audit per standing agreement. The 5th finding (Codex Finding 5) was a new pattern shape (Class D co-drift on UI display axis, not Phase-1-extrapolation chain) — didn't bite the same-pattern-iteration ceiling, but surfaced a Phase 2.5g audit-scope hole (covered field-authority dimension; missed display-mutation-source-currency dimension). Codified as audit-pattern sharpening for future 4th-finding triggers (see Catch 11 below).

Codex symbol-invention pattern noted across Findings 2 + 3: architectural intent correct, specific symbol names invented. Two-incident pattern; not codified (audit discipline handles it; specifics-accuracy variable enough that pattern won't sharpen at codification cost).

### Locked answers

**Locked answer 31 — init bootstrap (init_from_sim) overwrite semantics.** `init_from_sim` may overwrite client-authoritative fields when no player action has occurred. Bootstrap surface: gold (includeGold=true) + shop (Phase 2.5b reducer arm). Distinct from `sync_from_sim` semantics (Amendment A ignore-list intact). Counter 30 → 31.

**Locked answer 32 — trophy authority disposition (M1.5a).** Trophy is client-owned for M1.5a per Q13 lean-confirm at `decision-log.md 2026-05-11 § M1.5a Phase 1 design take-2 ratification §6e`. Phase 2.5g Capture 7 verified: sim has no `this.trophiesAtStart` field at all — class field block at `packages/sim/src/run/state.ts:L233–241` omits it; `getState()` returns hardcoded 0 with `// M2 concern.` comment; none of `applyCombatOutcome` / `advancePhase` / `endRun` mutates it. Trophy authority migration is CF 34 / M1.5b scope (sim must ADD the field, not extend stubbed tracking). Counter 31 → 32.

### Pattern / catch / rule codification

**Catch 11 — Class D co-drift (NEW bucket).** Regression test or display surface co-authored with implementation; one fix didn't propagate the other. Doesn't fit A/B/C1/C2 cleanly — those are all extrapolation-failure shapes (Phase 1 spec didn't extend to all surfaces); Class D is non-propagating-change shape across co-authored surfaces. 4 instances within PR 2:

1. Codex Finding 3 — content-equality test missing pool-validity orthogonal divergence
2. Phase 2.5h `RunContext.test.tsx:292` directly asserting drifted impl `trophy=50` sync behavior (regression test co-authored with the very impl drift it should have caught)
3. Codex Finding 5 — `CombatOverlay` reward display vs. PR 2 β `goldDelta` mutation source migration
4. Latent — `apps/client/src/combat/CombatOverlay.tsx:258` trophy display hardcoded `+18` matching Phase 2.5h reducer-side `+18` by coincidence; M2 trophy schedule surfaces same shape on trophy axis

Counter 10 → 11. Counter label "Predicate-vs-name catches" now subsumes a non-predicate-vs-name class — flagged for footnote at this entry; rename to "Investigation-failure catches" (or similar) deferred until a second non-predicate-vs-name class lands.

**Rule 8 — Plumbing-fix prompt structure (NEW).** Prompts framed as plumbing-only / mechanical-fix include a Step 1 inspection phase that precedes any mutation, with explicit halt-and-surface authority on any inspection finding that refutes the plumbing-only framing. Phase 2.5i precedent: structural resolution paths (three) + UX semantic ambiguity (three reward-vs-income directions) surfaced at Step 1 inspection; halt fired; zero code mutation. First-instance codification per bend-second-instance-convention criteria (failure shape structurally generic; discipline low-burden; upcoming milestones have predictable plumbing-style surface). Counter 7 → 8.

**Rule 10 — emergent category 5 (Step 1 verbatim-diff discipline).** Folded into existing Rule 10 (pre-paste verification, master-developer chat) as fifth category: Step 1 reports include verbatim diff bytes / tool output, not structural summary. Reviewer scans Step 1 verbatim output presence before ratification. Two-instance precedent within Phase 2.5b/d/f (Phase 2.5f demonstrated self-correction). Folded rather than forked; same shape as the existing emergent category 5 line in carry-context.

Rule 10 categories after fold:
1. CF closure-claim text vs decision-log
2. Quantitative baselines vs latest closing entry
3. Summary arithmetic vs current enumeration
4. Bare-#N auto-link scan in PR bodies
5. **Verbatim output presence vs structural summary in Step 1 reports** (folded here)

Patterns held: Pattern 7 (module-WeakMap dev-state) remains one-instance; second-instance convention holds. No new pattern codified at PR 2 close. Counter 6 → 6.

### Disposition-drift watch (mechanism callout, not codified)

First instance within M1.5a: `decision-log.md 2026-05-13 § M1.5a PR 2 Phase 1 design halt-gate ratified` Q2 Amendment A overwrite list listed trophy as sim-authoritative, contradicting `decision-log.md 2026-05-11 § M1.5a Phase 1 design take-2 ratification §6e` Q13 lean-confirm (client-owned trophy for 5a). PR 2 implementation followed the 2026-05-13 drift, not the 2026-05-11 lean-confirm; drift surfaced only at Phase 2.5g Capture 7 + Phase 2.5h investigation.

**Mechanism:** closing-entry-disposition-text drifted from prior-Phase-1-lean-confirm at write-time; Rule 10's 4 (now 5) pre-paste verification categories don't cover closing-entry-disposition vs prior-Phase-1-lean-confirm cross-check. Future closing entries should be authored with cross-check awareness on dispositions that span multiple Phase 1 design entries. Log + watch; codify as Rule 10 category 6 or new rule on second instance.

### Carry-forwards opened during PR 2

**CF 34** — Authority migration of client-authoritative fields (gold / rerollCount / bag / shop / trophy) to sim-side. Scope: M1.5b or LocalSaveV1. Opened at Phase 1 Q2 Amendment A ratification.

**CF 35** — `onTelemetryEvent` client-pipeline wire-up. Scope: M1.5b. Opened at Phase 1 Q6 ratification.

**CF 36** — `enterCombatPhase` consolidation surface (multiple call sites in `useRun.ts` post-Phase-2b-2). Scope: opportunistic during M1.5b client refactor. Opened during Phase 2b-2 inspection.

**CF 37** — `recipesRegistry` sim-default vs client-filter divergence. `createRun.recipesRegistry` defaults to canonical RECIPES at sim controller constructor (`packages/sim/src/run/state.ts:277`); client uses its own filtered RECIPES from `apps/client/src/run/content.ts:79` for combine detection. Latent divergence — not load-bearing currently (client owns combine detection). Revisit at M1.5b alongside CF 34 if combine detection moves sim-side.

**CF 38** — Resolution panel reward display sync with post-PR-2 mutation sources (gold + trophy axes). `apps/client/src/combat/CombatOverlay.tsx:255-258` locally computes reward values from M1.3.4a-era pre-PR-2 assumptions. PR 2's β gold-capture-delta migration shifted mutation source to sim's captured `goldDelta` (including winBonus + `derived.bonusGoldOnWin` + `baseIncomeForRound(round+1)`) per `packages/sim/src/run/state.ts:363`. Display emits `isWin ? winBonusGold : 0`; result: TopBar gold jumps by full `goldDelta`, panel announces only winBonus. Trophy display at same site emits `isWin ? 18 : 0` matching Phase 2.5h reducer-side `+18` by coincidence (both M0-placeholder per `decision-log.md 2026-05-02 § M1.3.4a ratification 5`); M2 per-round trophy schedule surfaces same Class D co-drift on trophy axis. Surfaced by Codex Finding 5 on PR #14 commit 8eba201; Phase 2.5i inspection halted on three structural resolution paths each violating a load-bearing invariant (β disposition / NEXT-click commit semantic / resolution UX shape) × three valid UX directions for reward-vs-income semantic (display-authoritative / TopBar-authoritative / split-row panel) entangled with structural call. Disposition target: M1.5b or M2 polish. Graybox-acceptable. Counter 29 → 30 open CFs.

### Counter delta

| Counter | Pre-PR-2 | Post-PR-2 |
|---|---|---|
| Architectural patterns | 6 | 6 |
| Investigation-failure catches (formerly "predicate-vs-name") | 10 | **11** (Catch 11 — Class D co-drift) |
| Locked answers | 30 | **32** (LA 31 init bootstrap; LA 32 trophy client-authoritative for M1.5a) |
| Going-forward rules | 7 | **8** (Rule 8 — plumbing-fix prompt structure); Rule 10 folded category 5 (no counter change) |
| Open carry-forwards | 25 | **30** (CF 34/35/36/37/38) |
| Master-dev chat drifts (Topic 2) | 8 | **11** (Phase 2.5g spec-over-specification + Phase 3 BASE-equality drift + roadmap.md CF-tracking-surface assumption surfaced by Step 1e Rule 8 halt on this docs commit; closing-entry-disposition drift logged as mechanism callout, not counted) |

### Verification artifacts

**Test counts at merge (HEAD 574d74b):**
- Client: 210 (was 190 pre-PR-2; +20 net)
- Sim: 474 passed + 1 skipped (was 471+1; +3 from Phase 2a)
- Workspace: ~684/+ across 19 files
- Turbo pipeline 19/19 green

Trajectory:

| Phase | Client | Sim |
|---|---|---|
| Pre-PR-2 | 190 | 471+1 |
| 2a | 190 | 474+1 (+3) |
| 2b-1/2 | 196 | 474+1 |
| 2.5b | 197 | 474+1 |
| 2.5d | 206 | 474+1 |
| 2.5f | 207 | 474+1 |
| 2.5h | 210 | 474+1 |
| 2.5i | 210 | 474+1 (halt — no delta) |

**Bundle baselines at HEAD 574d74b** (Phase 2.5f → 2.5h byte-identical CombatOverlay confirms sim-untouched in 2.5h):
- main: 247.18 → 247.27 KB / 77.33 → 77.36 KB gz (+0.09 / +0.03 from Phase 2.5f)
- CombatOverlay: 1498.62 KB / 346.16 KB gz (byte-identical to Phase 2.5f)
- combat-deferred: 10.61 KB / 3.52 KB gz (unchanged)
- MobileRunScreen: 14.09 KB / 3.52 KB gz (unchanged)
- index small: 17.01 KB / 5.23 KB gz (unchanged)
- CSS: 10.65 KB / 3.09 KB gz (unchanged)

Sub-KB delta from Phase 2.5h JSDoc + reducer-arm logic only.

**Merge execution clean.** Step 0 verification: HEAD 8eba201, branch m1.5a-client-integration, clean tree, push parity, merge-base = origin/main BASE (5b56539). Step 1 BASE-equality drift surfaced cleanly per halt-gate discipline: local main was 1 commit ahead of origin/main (7b03672 Phase 1 docs commit landed direct on local main pre-branch-cut, per docs-commit-on-main repo convention); merge-base equality is the actual invariant, not literal HEAD equality; no halt. Step 2 merge --no-ff: ort strategy, 18 files, +1107/-169, zero conflicts. Step 3 push: `5b56539..574d74b main -> main` (single push published both docs commit and merge commit). Step 4: branch tip 8eba201 fully reachable from origin/main (`git log origin/main..8eba201` empty); PR auto-close fires server-side. Step 5: feature branch deleted local + remote. Step 6: clean.

### Not in PR 2 (explicit non-scope)

- LocalSaveV1 persistence (CF 14 / M1.5b)
- Run-end detection client-side (M1.5a PR 3)
- Mid/boss relic offer generators + grant dispatch (M1.5a PR 3)
- onTelemetryEvent client-pipeline wire-up (CF 35 / M1.5b)
- bag/shop client → sim mirror (CF 34 / M1.5b)
- Class-select screen wire-through (M1.5a PR 3)
- Resolution panel reward display sync (CF 38)
- Stale-doc JSDoc on `state.ts:161-179` `applyCombatOutcome` interface (bundled into this docs commit)

### Process learnings (uncodified, log only)

**Step 0 spec-tightening.** Phase 3 merge prompt's Step 1 expected literal HEAD == BASE post-pull; reality had local main 1 commit ahead of origin/main due to Phase 1 docs commit on local main pre-branch-cut. Claude Code's halt-gate discipline surfaced the discrepancy transparently and proceeded after invariant verification (merge-base equality is the actual guard). Future merge specs phrase as "local main is ancestor of or equal to origin/main" rather than literal equality. Log + carry; not a new pattern.

**5th-finding-ceiling nuance.** Standing agreement on 4th-finding-triggers-comprehensive-audit ceiling was framed around same-pattern reactive iteration. 5th finding on a different-pattern axis (Class D co-drift on UI display, vs Phase-1-extrapolation chain 1–4) doesn't bite the same-pattern ceiling but does trigger audit-scope-hole reflection. Codified in Catch 11 commentary; not a new rule.

**`setupTerminalState` test primitive.** Lives at `apps/client/src/run/RunContext.test.tsx:L553` (correction from earlier carry-context which cited L513). Introduced at Phase 2.5d for terminal-outcome handler guards; reusable for future test authors needing terminal-outcome state drives.

**roadmap.md CF tracking-surface assumption (3rd master-dev drift this PR).** Original docs-commit prompt's Step 3 plan assumed roadmap.md contained a CF count line + enumeration block. Step 1e inspection refuted: roadmap.md is the M0-era milestone-prose doc with no CF tracking surface; CF tracking lives entirely in decision-log.md per project convention. Rule 8 halt fired cleanly on the inspection-vs-assumption mismatch. Resolution: roadmap.md edit dropped from this commit; commit covers decision-log.md + state.ts only. Going-forward consideration: Rule 10 category 6 candidate — "file-edit-scope assertions in prompts cross-checked against current file structure (light grep or sample-read) before prompt drafting." Held at first-instance per second-instance convention; codify if second instance lands. Recursive note: this drift surfaced on the very commit codifying Rule 8 + Rule 10 cat 5; Rule 8 + Rule 10's existing categories did not prevent it but Rule 8's halt-gate caught it post-prompt.

### M1.5a PR 3 fresh-chat pre-flags

After this docs commit lands, fresh master-developer chat for PR 3 scoping. Scope per take-2 ratification:
- 5a.1 — relic state surfacing (mid/boss offer generators + grant dispatch)
- 5a.2 — client-side run-end detection mirroring sim's shipped semantic
- 5a.3 — CF 14 regression test

Closes CF 14 + CF 21 (detection-side). Branches off main at 574d74b. Effort: ~3–4 days to M1.5a close. Phase 1 design already locked at chat level (take-2 §6e); no new milestone-level design pass needed; PR-level Phase 2 prompt suffices.

---

## 2026-05-13 — M1.5a PR 2 Phase 1 design halt-gate ratified

Phase 1 read-only investigation (HEAD 5b56539) returned clean against PR 1 surface (verified: ApplyCombatOutcomeInput at state.ts:102-109, RunState.derived + DerivedModifiers at schemas.ts:537-566, RunHistoryEntry at schemas.ts:509-517, apply_combat_outcome action variant at actions.ts:29-67, barrel re-exports at packages/sim/src/{run,}/index.ts, requirePhase('combat','applyCombatOutcome') at state.ts:713). Master-dev chat ratifies Q1–Q7 dispositions for PR 2 Phase 2 implementation.

Q1 — phase transition path: option (a). New `enter_combat_phase` action variant + `RunController.enterCombatPhase(): void` method. `requirePhase('arranging', 'enterCombatPhase')` as first executable statement; JSDoc precondition encoding. Test helper `setControllerPhaseToCombat` at run.test.ts:79-97 deletes; 4 invocations across 3 tests (L1319, L1351, L1385, L1388 — byte-equivalence test invokes the helper twice on two distinct controllers) migrate to `ctrl.enterCombatPhase()` or action-dispatch. New `describe('enter_combat_phase', ...)` block with 3 regression cases (arranging→success, combat→throw, resolution→throw) + parallel action-dispatch case in the byte-equivalence test. Catch 10 lineage explicit. Rule 7 barrel sweep is a no-op pass (method extends existing `RunController` interface; action variant extends existing `RunControllerAction` union; no new public types added).

Q2 — sync_from_sim payload: full sim RunState snapshot via `simRun.getState()` (single-snapshot granularity, take-2 locked). Sim-authoritative on sync (reducer overwrites client): `runId`, `seed`, `classId`, `contractId`, `ruleset`, `derived`, `hearts`, `currentRound` (→client.round), `trophiesAtStart` (→client.trophy), `history`, `relics`, `outcome`. Client-authoritative for M1.5a (reducer IGNORES sim value on sync): `gold`, `rerollCount`, `bag`, `shop`. AMENDMENT from Phase 1 report's "gold sim-authoritative" recommendation — PR 2's narrow routing scope (only reroll + apply_combat_outcome route to sim, NOT buy/sell) means sim's gold diverges from client mid-round by `sum(buy_costs) − sum(sell_proceeds)`; overwriting would lose in-round shop transactions. Gold migration to sim-authoritative deferred to 5b/LocalSaveV1 alongside buy/sell mirror routing (CF 34). `startedAt` sim-authoritative but not surfaced in client (M2 carry).

ClientRunState type expansion: new fields `derived: DerivedModifiers`, `outcome: RunOutcome`, `relics: RelicSlots`, `runId: RunId`, `classId: ClassId`, `contractId: ContractId`. Overwrites of existing fields on sync: `ruleset`, `seed`, `hearts`, `round` (←currentRound), `trophy` (←trophiesAtStart), `history`. Preserved client-authoritative: `gold`, `rerollCount`, `maxHearts`, `totalRounds`, `className`, `contractName`, `contractText`.

Q3 — dynamic-import boundary: target = `@packbreaker/sim` root barrel (only `createRun` is deferred; existing static imports of `createRng` + `generateShop` stay — they don't transitively pull combat.ts; Vite chunk-splits cleanly today). Suspense boundary placement: RunProvider (apps/client/src/run/RunContext.tsx). Fallback: reuse `MobileFallback` affordance pattern from RunScreen.tsx (full-viewport `var(--bg-deep)` div). React-pattern choice (useEffect+null vs use()+thenable vs custom lazy hook) deferred to Phase 2 implementation — take-2's "one render of `simRun: null` before resolve" language admits useEffect+null. Sourcemap audit + bundle delta verification deferred to Phase 2.5 per take-2.

Q4 — bag/shop reducer mutation parallelism: option (c). No client→sim mirror for bag/shop in PR 2. Aligns with Q2 Amendment A. Migration to sim authority at 5b/LocalSaveV1 (CF 34).

Q5 — error handling: option (a). Trust sim invariants; no try/catch around `simRun` dispatches; React error boundary catches phase-guard throws. Phase 2 Step 0 verifies client reducer ordering satisfies sim's phase guards (reroll in arranging; enterCombatPhase before client-side simulateCombat; apply_combat_outcome after). Rule 8 codification candidate at PR 2 close if Codex flags ordering divergence.

Q6 — onTelemetryEvent: option (b). PR 2 `createRun` construction stubs `onTelemetryEvent: () => {}`. Real wire-up to client telemetry pipeline deferred to M1.5b (CF 35).

Q7 — opponentClassId optionality reconciliation: option (a). Tighten `ApplyCombatOutcomeInput.opponentClassId?: ClassId | null` to required-nullable `opponentClassId: ClassId | null` (matches RunHistoryEntry shape at schemas.ts:516). Phase 2 Step 0 sweeps all 5 ApplyCombatOutcomeInput construction sites: 1 production (state.ts:848-855 — `runCombatInternal`'s call to `this.applyCombatOutcome`, which already passes `opponentClassId: ghost.classId`) + 4 test fixtures (3 in the `applyCombatOutcome (M1.5a PR 1)` describe block at run.test.ts L1317-1396: Case A inline payload, Case B inline payload at L1361 which currently relies on `?? null` for the omitted field and gets explicit `opponentClassId: null` added, byte-equivalence `const payload: ApplyCombatOutcomeInput` literal; plus 1 in the phase-guard regression Test 5 at L1421-1440 inline payload). CombatOverlay `onDone` payload (apps/client/src/combat/CombatOverlay.tsx) extends with `opponentClassId` from context; `CombatDonePayload` interface at useRun.ts:20-25 adds the field. Sim's `?? null` normalization at state.ts:742 stays as defensive on the now-explicit `ClassId | null` input.

### Carry-forwards opened

- **CF 34 (NEW)** — Gold/rerollCount/bag/shop authority migration: client → sim at M1.5b/LocalSaveV1. Currently bifurcated post-PR-2 (sim owns hearts/history/derived/relics/outcome/ruleset/currentRound/trophy; client owns gold/bag/shop/rerollCount). Migration includes buy_item/sell_item client→sim mirror routing + sync_from_sim consuming gold field. Bag/shop authority migration timeline coupled to LocalSaveV1 persistence shape decisions.
- **CF 35 (NEW)** — onTelemetryEvent wire-up: M1.5b telemetry milestone wires sim's emit surface (~16 telemetry event types per CreateRunInput's onTelemetryEvent callback) to client's PostHog pipeline. PR 2 ships with `() => {}` stub. Sessionid + tsClient enrichment at client side per state.ts:18-19 design comment.

### Counters entering Phase 2

| Counter | Post-PR-1 close | Post-Phase-1 ratify |
|---|---|---|
| Architectural patterns | 6 | 6 |
| Predicate-vs-name catches | 10 | 10 |
| Locked answers | 30 | 30 |
| Going-forward rules | 7 | 7 |
| Master-dev chat drifts | 8 | 8 |
| Open carry-forwards | 25 | 27 |

### Phase 2 prompt carry-context

- **Evidence-quality refinements from Phase 1 investigation**: (1) reducer action union is `RunAction` (NOT `RunReducerAction`) at apps/client/src/run/RunController.ts:100-117; (2) test helper `setControllerPhaseToCombat` spans run.test.ts:79-97 (3-line body L95-97 + 16-line JSDoc L79-94), with 4 invocations across 3 tests.
- **Rule 6 + Rule 7 in force**: Phase 2 prompt's Step 0 surface verification must include type-signature-fidelity check against shipped types (Rule 6). Any new public types/functions added in PR 2 must include barrel-export parity sweep before Phase 2 commit (Rule 7) — though Q1 disposition produces no new public types, the discipline applies to sync_from_sim reducer action if any new public type is added.
- **Codex re-engagement on Phase 2.5 cycles**: if PR 2 incurs a Phase 2.5 interlude, expect Codex will NOT auto-re-review on subsequent push (PR 1 empirical finding). Plan to explicitly re-request via PR comment or UI gear icon after pushing the Phase 2.5 fix.
- **§ 4.5 R2 enactment**: PR 2 is the milestone where R2 ("no consumer-side recomputation of hearts/history/phase") materializes for the client. Hearts/history/derived now sim-authoritative on sync.
- **§ 4.5 R1 cross-axis halt-gate**: existing pattern applies — if Phase 2 surfaces a contradiction between Q1-Q7 dispositions and shipped sim/client shapes, halt at master-dev chat per Rule 6.

---

## 2026-05-13 — M1.5a PR 1 closed (sim API prep)

### Branch + commit topology

Branch: `m1.5a-sim-prep` off main `ec5c1f6` (post-docs-commit baseline; pre-M1.5 retro + § 4.5 R1 cross-axis amendment + take-1 + take-2 ratifications + gdd § 9 amendment all landed pre-PR-1).

| SHA | Sub-phase | Scope |
|---|---|---|
| (no commit) | Phase 1 (chat-level milestone-level design) | Take-1 + take-2 ratifications (decision-log.md 2026-05-12 § M1.5a Phase 1 design take-1 ratification + § M1.5a Phase 1 design take-2 ratification) — design for all 3 PRs locked at chat level. No prompt cycles needed at PR-level Phase 1 since milestone-level design covered scope. |
| (no commit) | Phase 2 Step 0 + pre-Step-3 halt | 5 Pattern 5 quirks Q1–Q5 surfaced + dispositioned at master-dev chat. Catch 9 codification trigger (opponentGhostId type-signature drift). Working tree zero-mutation at halt; ratification turn produced disposition deltas applied at Steps 1-9 of Phase 2. |
| `47cdf51` | Phase 2 (implementation) | applyCombatOutcome extracted from runCombatInternal lines 715-760 byte-identical; RunState.derived exposed (readonly); RunHistoryEntry.opponentClassId additive; DerivedModifiers canonicalized in content with sim re-exporting; 'apply_combat_outcome' action variant + applyAction dispatch; 4 new run.test.ts tests; v0.6 schema bump (changelog-header-only versioning; no SCHEMA_VERSION constant exists); 1 mechanical 6-line client touch in apps/client/src/run/RunController.ts (Bucket A schema-required surface; dissolves in PR 2). 224 .jsonl determinism fixtures byte-stable; 6 .json hand-authored fixtures regenerated (snapshot-only; action streams byte-identical). |
| `9ea5a2b` | Phase 2.5 (Codex P1 findings) | Codex automated review on PR 13 surfaced two P1 findings on Phase 2 HEAD: (1) ApplyCombatOutcomeInput not re-exported from sim barrels — Catch class C2 caught per Rule 4 — Rule 7 codified; (2) applyCombatOutcome lacked combat-phase guard despite documented predicate — Catch 10 codified (predicate-vs-name lineage extending 5-9). Phase 2.5 commit: barrel re-exports from packages/sim/src/{run/index.ts, index.ts}; this.requirePhase('combat', 'applyCombatOutcome') as first executable statement of method body; new Test 5 regression for the phase guard; Option A test-only helper setControllerPhaseToCombat at packages/sim/test/run.test.ts:79-96 (1-PR bridge to PR 2's public phase-transition path). Bundle byte-identical to Phase 2 (same chunk hashes). Phase 2.5 interlude precedent inherited from M1.4b2.3. |
| `5b67070` | Phase 3 merge | `--no-ff` merge of m1.5a-sim-prep into main. |

### What landed (load-bearing surface summary)

- `RunController.applyCombatOutcome(input: ApplyCombatOutcomeInput): void` — sim-authoritative post-combat state mutator. Byte-identical extraction from runCombatInternal lines 715-760 (telemetry emits included); Pattern 5 discipline held. § 4.5 R2 authority binding — single authoritative post-combat state mutator; no consumer-side recomputation of hearts/history/phase. Phase guard: requires phase === 'combat'; throws otherwise.
- `'apply_combat_outcome'` action variant in RunControllerAction union; applyAction dispatches to controller.applyCombatOutcome (pure dispatch).
- `RunState.derived: DerivedModifiers` (readonly snapshot exposure) for PR 2 sync_from_sim consumer reads.
- `RunHistoryEntry.opponentClassId: ClassId | null` — additive field; populated by applyCombatOutcome. CF 15 closes.
- `DerivedModifiers` canonical declaration in content-schemas.ts + packages/content/src/schemas.ts; packages/sim/src/run/ruleset.ts re-exports. Eliminates dual-declaration drift surface. check-schemas-sync gate covers content ↔ content byte-identity.
- Schema bump v0.5 → v0.6 (additive only, changelog-header entry only; no SCHEMA_VERSION constant exists — versioning is purely changelog comments per Q4 disposition).
- 5 new direct-action unit tests in packages/sim/test/run.test.ts (67 → 72 tests): non-null field passthrough, null normalization, direct-vs-action-dispatch byte equivalence, start_combat opponentClassId regression (CF 15), and phase-guard regression (Catch 10).
- Both sim package barrels re-export ApplyCombatOutcomeInput (Rule 7 first instance).
- 1-PR bridge: setControllerPhaseToCombat test helper; deletes at PR 2.

### Pattern + catch + rule codification

- **Pattern 6 unchanged** (no new pattern in PR 1).
- **Catch 9 (NEW)** — opponentGhostId type-signature drift between Phase 2 prompt's ApplyCombatOutcomeInput.opponentGhostId: string vs shipped RunHistoryEntry.opponentGhostId: GhostId | null. Caught at Phase 2 pre-Step-3 halt-gate by Step 0 surface verification + Pattern 5 extraction discipline. Closed structurally via Q1 disposition.
- **Catch 10 (NEW)** — applyCombatOutcome phase-guard predicate-vs-name. Interface JSDoc at state.ts:171 documented "Requires phase === 'combat'" since the method was authored at Phase 2; impl never enforced via requirePhase. Lineage extends Catches 5-9 (design-contract vs implementation-reality). Caught by Codex automated review at PR-time per Rule 4. Closed structurally via Phase 2.5 guard at state.ts:702+ (first executable statement of method body, mirroring state.ts:790 pattern).
- **Rule 6 (NEW)** — Phase 2 prompt premises with type signatures or specific values must be re-derived from shipped state in Step 0 surface verification scope; ratified dispositions encoded in resume instructions must not be silently reverted in implementation. Second-instance codification per standing convention. Instances:
  - #1 — take-1 §2/§3 task-language-vs-reframing-note self-contradiction (M1.5a Phase 1 design, 2026-05-11).
  - #2 — Phase 2 prompt's ApplyCombatOutcomeInput.opponentGhostId: string vs shipped RunHistoryEntry.opponentGhostId: GhostId | null (PR 1 Phase 2 pre-Step-3 halt, 2026-05-12).
  - #3 (reinforcing) — Phase 2 ratification's opponentClassId: ClassId | null (required-nullable) vs Phase 2 implementation's opponentClassId?: ClassId | null (optional) (PR 1 Phase 2 closing report drift; functionally neutral but procedurally documented).
- **Rule 7 (NEW)** — Barrel-export parity sweep on new public types/functions added to packages/*/src/<module>/...; verify re-export from <module>/index.ts AND packages/<package>/src/index.ts (package root barrel) before Phase 2 commit. First-instance codification per codification-bend convention: (a) failure shape structurally generic ✓ (any new public type addition); (b) discipline low-burden ✓ (single grep + 1-line edit per barrel); (c) predictable upcoming surface ✓ (PR 3 relicOffer.ts adds public functions requiring same sweep). Caught by Codex automated review at PR-time on Phase 2 commit (PR 13 finding 1); closed structurally via Phase 2.5 barrel additions to packages/sim/src/run/index.ts:4 and packages/sim/src/index.ts:68.

### Process learnings (uncodified; logged for second-instance watch)

- **Test-only TS private-cast helper pattern** (setControllerPhaseToCombat at packages/sim/test/run.test.ts): 1-PR bridge for transient phase invariants when no public-API path exists. PR 2 dissolves. Watch for second instance before codifying as a Pattern.
- **Predicate-vs-name design-contract-vs-impl divergence on new methods**: JSDoc-encoded preconditions need impl-side enforcement. Phase 2's Step 0 surface verification scope could include "for any new public method, search the JSDoc for documented preconditions and verify impl enforces them." Codification candidate at PR 2 close if a second instance fires.
- **Codex automated review re-engagement pattern on subsequent pushes within a PR**: empirically, Codex did NOT auto-re-review on the Phase 2.5 push to PR 13. Re-engagement required explicit re-request via PR comment trigger (Option 2 of master-dev chat's three-path framing; Option 1 UI re-request was attempted in parallel). Codex re-review on 9ea5a2b returned clean ("Didn't find any major issues. Hooray!"). Implication for Rule 4: when a PR has Phase 2.5 cycles, the structural response is not auto-reviewed by Codex; explicit re-request is required to satisfy the Rule 4 gate. Watch for second instance on PR 2/PR 3 before codifying as a Rule.

### CF dispositions

- **CF 15 closes (PR 1 Phase 2)** — opponentClassId on RunHistoryEntry.
- **CF 14** — queued PR 3 (regression test for ruleset-modifier reroll cost authority under non-default rulesets; tests UI affordability vs sim's computeRerollCost across reroll cycles).
- **CF 21 detection-side** — queued PR 3 (mirrorsSimShouldEndRun helper); summary-side stays open for 5b.2.
- **CF 30** — open (particle-count consts promotion; deferred to M2 telemetry-driven tuning).
- **CF 32** — open (mid/boss relic content expansion to 3+ per class for full 1-of-3 UI pattern; → M1.6+ or M2 polish).
- **CF 33** — open (sim state.ts combat-coupling refactor for cleaner lazy-boundary; → M2 architectural cleanup. M1.5a accepts implementation-side dynamic-import workaround in PR 2 scope).

### Counters at PR 1 close

| Counter | Pre-PR-1 | Post-PR-1 |
|---|---|---|
| Architectural patterns | 6 | 6 |
| Predicate-vs-name catches | 8 | 10 |
| Locked answers | 30 | 30 |
| Going-forward rules | 5 | 7 |
| Master-dev chat drifts (Topic 2 counter) | 6 | 8 |
| Open carry-forwards | 26 | 25 |

### Verification (Phase 2.5 final state, supersedes Phase 2 verification)

```
pnpm turbo lint test build --force
Tasks:    19 successful, 19 total
Cached:    0 cached, 19 total
Time:    52.184s

pnpm check-schemas-sync
check-schemas-sync: OK (content-schemas.ts and packages/content/src/schemas.ts byte-identical)
```

Sim test count: 467 → 470 (Phase 2 +3 + actions.test +1 from action variant dispatch) → 471 (Phase 2.5 +1 phase-guard regression). Wait — recount per Phase 2.5 verification output: "test/run.test.ts (72 tests)" + harness 231 + others = sim total 471 passed + 1 skipped. Workspace test count: 214 passed across 19 files. 224 .jsonl determinism fixtures (000-223) replay byte-stable across Phase 2 + Phase 2.5; 6 .json hand-authored fixtures regenerated at Phase 2 (snapshot-only, action streams byte-identical) and unchanged at Phase 2.5.

### Bundle delta

Combat chunk byte-identical to M1.4b2.3 Phase 2.5 close (1,509.65 KB raw / 349.67 KB gz; same hash CombatOverlay-BGbedATT.js across all of M1.4b2.3 Phase 2.5, M1.5a PR 1 Phase 2, and M1.5a PR 1 Phase 2.5). Main + mobile chunks also byte-identical across Phase 2 and Phase 2.5 (same hashes). Sim-side additive + sim-side fix; no client-render surface impact.

### Codex external review

PR 13 received 2 P1 findings on Phase 2 commit `47cdf51` (barrel re-export gap + phase-guard absence) → both resolved structurally via Phase 2.5 commit `9ea5a2b` → Codex re-review on `9ea5a2b` returned clean ("Didn't find any major issues. Hooray!") after explicit re-request via PR comment trigger.

Rule 4 (codified M1.4b2.3 retro) catch checkpoint satisfied. Catches 8 → 10 (Codex P1 catches both surfaced and closed within PR 1; Catch 10 specifically caught by Codex per Rule 4 framing).

### What's NOT in PR 1 (deferred to PR 2 / PR 3)

- Client integration foundation (useRun, sync_from_sim, dynamic-import boundary per A.1, EXTRA_REROLLS_PER_ROUND removal) — PR 2.
- Public phase-transition path for client-side combat (e.g., enter_combat_phase action) — PR 2 design scope; gates setControllerPhaseToCombat test-helper deletion.
- Relic offer generators (generateMidRelicOffer / generateBossRelicOffer in packages/sim/src/run/relicOffer.ts) — PR 3.
- Client-side run-end detection (mirrorsSimShouldEndRun helper) — PR 3.
- CF 14 regression test in apps/client/src/shop/ShopController.test.ts — PR 3.
- UI read-site updates (LeftRail.tsx, RelicsTab.tsx) — PR 3.
- Particle-count consts promotion (CF 30) — M2.

### PR 2 fresh-chat carry-context pre-flags

1. **Phase transition design**: PR 2's client combat_done routing through simRun.applyCombatOutcome(...) requires sim's phase = 'combat' at dispatch time. Today's sim has no public path to enter 'combat' without running internal combat (start_combat does both synchronously). PR 2 design options: (a) new minimal action `enter_combat_phase`; (b) start_combat with client-driven flag skipping internal simulateCombat; (c) other. Disposition at PR 2 Phase 1 design.
2. **Test helper migration**: PR 1 Phase 2.5 introduced setControllerPhaseToCombat at packages/sim/test/run.test.ts:79-96 as a 1-PR bridge. PR 2's public phase-transition path must include a migration step in its "done" criteria: update Tests 1+2+3 in run.test.ts to use the real path; delete the helper.
3. **Rule 6 + Rule 7 in force**: PR 2 Phase 2 prompt's Step 0 surface verification must include type-signature-fidelity check against shipped types (Rule 6). Any new public types/functions added in PR 2 must include barrel-export parity sweep before Phase 2 commit (Rule 7).
4. **opponentClassId optionality reconciliation**: Phase 2 implementation drifted to optional `opponentClassId?: ClassId | null` against ratification's required-nullable. PR 2's client passes real ClassId values; PR 3 may exercise both. If consistency matters for Codex review on PR 2/3, switch to required-nullable then; otherwise let it ride.
5. **Codex re-engagement on Phase 2.5 cycles**: if PR 2 incurs a Phase 2.5 interlude, expect Codex will NOT auto-re-review on subsequent push. Plan to explicitly re-request via PR comment (or UI gear icon) after pushing the Phase 2.5 fix.

### Next moves

1. PR 2 fresh chat opens with carry-context (similar pattern to PR 1 chat-open). Carry-context document compiled from this closing-log entry + roadmap.md current-state.
2. PR 2 Phase 1: design phase-transition path + sync_from_sim shape + Suspense boundary structure for dynamic-import deferral.
3. PR 2 Phase 2 prompt: built with Rule 6 + Rule 7 in force; Step 0 surface verification includes type-signature-fidelity + barrel-export parity check on any new public types.

---

## 2026-05-11 — M1.5a Phase 1 design take-2 ratification (3 new Bucket A surfaces resolved + 12 lean-confirms)

Take 2 cleared §1 fast-verify and §3/§4/§5 design proposals; halted in §2 on three new Bucket A surfaces emerging from the take-1 ratification triple against shipped sim state. Plus one Bucket C1 doc/content mismatch.

Bucket A surfaces resolved:

- A.1 lazy-boundary regression (§2a): sim's state.ts statically imports simulateCombat; main-chunk import of createRun would drag combat sim subgraph into main, regressing tech-architecture.md § 10 lazy-load. RESOLVED option 1 (dynamic-import deferral in useRun). Combat chunk shifts from first-combat to Begin-run-click load moment. Phase 2.5 sourcemap audit confirms post-implementation. CF 33 opens for M2 architectural cleanup via sim-side state.ts refactor (option 2 deferred).

- A.2 sim-state-advancement gap (§2c): the take-1 ratification triple (sim authoritative for run-state + combat continues through simulateCombat bridge + grantRelic phase gates hold) is jointly unsatisfiable against shipped grantRelic gates. RESOLVED option 2 (additive sim API). New method simRun.applyCombatOutcome(...) extracted from runCombatInternal:716-738 records combat outcome (hearts/history/phase/telemetry) without re-running combat. New 'apply_combat_outcome' action variant. CF 15 (opponentClassId on RunHistoryEntry) closes as ride-along.

- A.3 derived field exposure gap (§2d): sim's RunController.derived is private; CF 14 fix requires consumers read extraRerollsPerRound from derived, not Ruleset. RESOLVED: extend RunState with derived: DerivedModifiers (schema v0.6 additive). Client mirrors via sync_from_sim; EXTRA_REROLLS_PER_ROUND placeholder const removed from sim-bridge.ts.

Bucket C1 resolved:

- gdd.md § 9 mid-relic "1 of 3 choice" wording vs shipped 2-per-class content. Amend § 9 to "1 of N, N constrained by available class-eligible mid relics (currently 2; CF 32 expands)" + parallel boss-relic disposition note. Docs-only commit (this commit).

12 lean-confirms from §6e (Q1–Q11 + Q13): all locked as stated. Highlights: RunController via useRef in useRun (Q1); startingRelicId default starterRelicPool[0] (Q2); reroll routes through simRun.rerollShop (Q3); read-only after run-end via sim throws + try/catch wrap (Q4); relic-offer generators in own module relicOffer.ts (Q5); RELIC_OFFER_STRIDE = 65519 (Q6); sync_from_sim single full snapshot (Q9); single-emit relic_granted telemetry (Q10); ContractId('neutral') graybox default (Q11); client-owned trophy for 5a (Q13).

5a structural revision: three PRs.
- PR 1 (5a sim API prep): additive — applyCombatOutcome + apply_combat_outcome action + RunState.derived + RunHistoryEntry.opponentClassId. Closes CF 15.
- PR 2 (5a.0): client sim RunController integration foundation (dynamic-import + sync_from_sim + mutation-path replacement + EXTRA_REROLLS_PER_ROUND removal).
- PR 3 (5a.1 + 5a.2 + 5a.3): relic state surfacing + run-end detection + CF 14 regression test. Closes CF 14 + CF 21 (detection-side).

Each PR branches off clean main, --no-ff merge, Codex external review per rule 4. Phase 2.5 interludes per PR on Codex findings. Phase 3 polish + close at PR 3 merge.

M1.5a effort estimate revised: 7.5–8 days (was 5–6; +2 for sim API prep PR splitting + restructure overhead). M1.5 total: ~12.5–14 days.

CF 33 (NEW) — Sim state.ts combat-coupling refactor for cleaner lazy-boundary. Currently state.ts statically imports simulateCombat, forcing main-chunk importers to dynamic-defer. Option 2 (split run-state methods from combat-invoking methods, or constructor-inject simulateCombat) is the architecturally cleaner long-term shape. Deferred to M2 architectural cleanup or later when sim consumer count motivates the refactor. M1.5a accepts implementation-side dynamic-import workaround.

Phase 1 design considered complete at this ratification. Take-2 §2–§5 IS the design for each sub-phase; no further Phase 1 prompts. Phase 2 implementation prompts produced per PR.

Open CFs: 25 → 26.

---

## 2026-05-11 — M1.5a Phase 1 design halt-gate take-1 ratification (5 mismatches resolved)

Take 1 halted at §1.5. Five mismatches ratified:

- A: sim 'ended' RunPhase + RunOutcome shipped M1.2.4 (decision-log.md 2026-04-29 § M1.2.4 Run-state machine). §3 narrows to client-side detection mirroring shipped semantic.
- B: grantRelic phase gates shipped M1.2.6 (decision-log.md 2026-04-30 § M1.2.6 closed). §2 narrows to client-side phase awareness + sim.grantRelic dispatch; sim contract untouched.
- C: starter-relic is pre-createRun input via CreateRunInput.startingRelicId. §2 narrows to mid + boss beats; starter is 5b.1 deliverable.
- D: client has zero sim RunController integration today. M1.5a adopts option (2): minimal surfacing. Sim authoritative for run-state (hearts / gold / round / phase / relics / outcome / history); client reducer becomes cache mirror via sync_from_sim action. Bag + shop mutations stay client-parallel for 5a (revisit at 5b.3 if LocalSaveV1 reveals need). Migration toward option (1) (full sim authority) deferred to M2/M3.
- E: rule 5 content-side catch — relic counts 3 starter + 2 mid + 1 boss per class. 2-card mid offer + 1-card boss earned-presentation for M1 graybox. CF 32 opens.

5a re-scoped internally: 5a.0 sim RunController integration foundation; 5a.1 relic state surfacing (mid/boss offer generators + grant dispatch); 5a.2 client-side run-end detection (mirrors sim's shipped semantic); 5a.3 CF 14 regression test. Single Phase 1 design pass (take 2) covers all four. Phase 2 splits: 5a.0 own PR for Codex external review checkpoint (rule 4); 5a.1+5a.2+5a.3 second PR. Mirrors M1.4b b1→b2.x cadence.

M1.5a effort estimate revised: 5–6 days (was 3–4).

Topic 2 master-dev chat drift counter: 5 → 6. New drift shape: prompt premises vs shipped sim state. Rule 10's 4 categories don't cover; hold codification per second-instance convention; log + watch.

CF 32 (NEW) — Expand mid/boss relic content to 3+ per class per slot enabling consistent "pick 1 of 3" UI pattern across all three relic-grant beats. Current content: 3 starter / 2 mid / 1 boss per class (relics.ts grep verified). M1 graybox ships 2-card mid + 1-card boss as graceful degradation. → M1.6+ content fill or M2 polish.

Open CFs: 24 → 25.

---

## 2026-05-08 — Pre-M1.5 retrospective

Retro covering M1.4 → CF 31 process-level findings. Outputs: 2 new going-forward rules, 1 architecture amendment (CF 27 closure), 1 pattern deferral, 1 chat-drift practice reaffirmation.

### Topic 1 — catch lineage 5/6/7/8/9: three-bucket framing

Catch class splits into three buckets, not two:

- **Bucket A — change-site contradiction.** Both surfaces inside Phase 1 authoring scope. Halt-gate is the antidote, working as designed. Catches 5 (M1.4b1 § Phase 1) and 7 (M1.4b2.1 § Phase 1) precedent — ANCHOR_RULE table values vs. render path.
- **Bucket B — process-artifact-vs-execution.** Surfaces span infrastructure layers Phase 1 doesn't authoritatively own. Phase 2.5 interlude pattern is the antidote. Catch 6 (M1.4b1 § Phase 2.5) precedent — pipeline-green vs. cache-replay.
- **Bucket C — non-local context.** Splits further:
  - **C1 — content-side evidence gap.** Schema claim invalidated by content-side fact. Structurally catchable in Phase 1 with content-grep discipline. Catch 8 (M1.4b2.3 § Phase 1 §2) precedent. Antidote codified as rule #5 (Topic 4).
  - **C2 — framework-internal architecture gap.** Hard to catch in Phase 1 without expert framework knowledge. External review load-bearing. Catch 9 (CF 31 § PR review) precedent. Antidote codified as rule #4 (Topic 3).

Frame: Phase 1 halt-gate scope is contradiction-between-surfaces-Phase-1-authoritatively-owns. Don't over-extend halt-gate to attempt C2 coverage; route to rule #4 (external review) instead. C1 closes in Phase 1 via rule #5.

### Topic 3 — Codex external-review structuring: rule #4

Going-forward rule #4 codified. Convention met (second instance — catches 8, 9). Option (b)-reframed selected from a/b/c/d.

> **Going-forward rule #4.** External review (Codex on PR) is a load-bearing catch step for framework-internal architectural assumptions (catch class C2 per pre-M1.5 retro Topic 1). Phase 2.5 sub-phase is the structural response when external review surfaces a P2 finding pre-merge — three precedents: M1.4b1 § Phase 3, M1.4b2.3 § PR #11, CF 31 § PR #12. Halt-gate stays scoped to class A (change-site contradiction); do not over-extend halt-gate to attempt C2 coverage.

Codifies four things in one rule: (1) external review not optional — load-bearing; (2) catch class it covers (C2); (3) Phase 2.5 as structural response on P2 findings; (4) halt-gate scope discipline.

### Topic 6 — CF 27 closure via § 4.5 Rule 1 cross-axis amendment

CF 27 closed via tech-architecture.md § 4.5 Rule 1 cross-axis extension. Amendment scoped to catches 5/7 (bucket A per Topic 1); catch 6 documented under bucket B (Phase 2.5 caught), not inside Rule 1. Original CF cited 5/6/7 together; Topic 1's bucket structure refined the scope. Amendment text landed in tech-architecture.md § 4.5 Rule 1 — see that section for canonical content.

### Topic 4 — Axis B codification: rule #5

Going-forward rule #5 codified. Standing convention (codify-on-second-instance) bent at one instance.

> **Going-forward rule #5.** Phase 1 investigations claiming content-scope facts (e.g., "M1 content only emits X", "no item triggers on Y") require content-side evidence: at minimum one targeted grep of packages/content/ for the actual emission / trigger / value being scoped. Schema-side evidence alone (BuffableStat union check, enum membership) is insufficient — schema permits a superset of what content exercises. Catch 8 (M1.4b2.3 § Phase 1 §2) is precedent.

Convention bent on grounds of: (1) generic failure mode (any schema-vs-content scope claim has the shape); (2) low-burden discipline (single targeted grep); (3) M1.5 predictable surface (relic content, LocalSaveV1 schema-vs-state); (4) complement to rule #4 (rule #5 closes C1 in Phase 1, rule #4 closes C2 via external review).

### Topic 5 — Pattern #7 deferral

Pattern #7 (module-level WeakMap for byte-zero dev-state) deferred to second-instance per standing convention. Pattern shape is narrow (production-class-needs-dev-only-instance-state); literal `if (import.meta.env.DEV)` use-site discipline is potentially Vite-tree-shaking-specific and would be sharpened by second-instance comparison. CF 31 § Phase 2.5 closing-log + this entry are the canonical record until next instance.

Trigger: any M1.5 work surfacing production-class-with-dev-only-instance-state (debug overlay against existing scene/system, test-only state grafted onto production class, etc.) re-opens Topic 5 mid-milestone.

### Topic 2 — master-developer chat-side drift practice

Drift classification (5 instances across M1.4 → CF 31):

- **Shape A — coverage gap in rule #10's existing categories.** Drifts 1 (bundle baseline), 2 (CF arithmetic), 4 (PR body bare-#N).
- **Shape B — compose-and-violate within single artifact.** Drifts 3 (axis-A self-violation), 5 (sloppy instruction).

Reaffirmation: rule #10 (4 categories + enumeration-required) held as currently framed. Failure mode is operational, not structural. Phase 2.5 halt-gate acknowledged as load-bearing for Shape B (parallel to rule #4 for C2). No rule #10 reframing.

Trigger: 2+ similar-shape drifts in M1.5 mid-milestone re-opens Topic 2 for operational tightening.

### Closing tally

| Counter | Through CF 31 | After retro |
|---|---|---|
| Architectural patterns | 6 | 6 |
| Predicate-vs-name catches | 9 | 9 |
| Locked answers | 30 | 30 |
| Going-forward rules | 3 | 5 |
| Halt-gate exercises (M1.4) | 1 | 1 |
| Master-dev chat drifts | 5 | 5 |
| Open carry-forwards | 25 | 24 |

CF 27 closes via § 4.5 Rule 1 cross-axis amendment.

### Post-retro sequence

- M1.5 scoping in fresh chat (clean-context-for-forward-planning convention).
- M1.5 scope: relic state machinery + class-select screen + run-end detection + LocalSaveV1 persistence + Codex P1 ruleset regression test (CF 14). Likely 5a/5b split given full-stack scope.
- Rules #4 + #5 + § 4.5 Rule 1 amendment + this retro entry are the canonical baseline for M1.5 discipline.

---

## 2026-05-07 — CF 31 closed (dev-mode scene pause/step keybinding)

### Branch + commit topology

Branch `cf-31-dev-pause-step` off main `125cfe4` (clean — M1.4 close + post-merge stale branch cleanup baseline).

| SHA | Sub-phase | Scope |
|-----|-----------|-------|
| (no commit) | Phase 1 | Read-only investigation + design halt-gate. Five-section report covering tick architecture / existing input bindings / step-tick mechanism / feedback / bundle-zero verification plan. Six Q&A ratifications. Phase 2 tightening: literal-gated `if (import.meta.env.DEV)` at use sites for bulletproof DCE. |
| `be29d56` | Phase 2   | Implementation: module-level `DEV_PLAYBACK_STATE` WeakMap (byte-zero pattern) + literal-gated `create()` keybinding registration + literal-gated `update()` pause/step gate. Two files: `apps/client/src/combat/CombatScene.ts` (+59) + new `apps/client/src/vite-env.d.ts` (+6). |

### Implementation

Pause/resume on Space; step-tick on Right Arrow per Q1 ratification (jump to next event-bearing tick via existing `findNextEventTick` helper, NOT `currentTick + 1` — would bounce through dead-time intervals where nothing renders, defeating frame-perfect render isolation intent).

All state + handlers gated by literal `if (import.meta.env.DEV)` for guaranteed Vite/esbuild DCE. Module-level `DEV_PLAYBACK_STATE: WeakMap<CombatScene, DevPlaybackState> | null` holds dev state outside the class so production class has zero new instance properties — see byte-zero verification below.

`console.log` feedback on pause toggle + step request per Phase 1 §4 recommendation (dev-only; users never see this; line-line ordering against playback events at same level useful for diff against rendered frame).

Strict pause-gate on Right Arrow per Q4: only acts when `state.paused === true`. No auto-pause-and-step. Single-meaning per key.

New file `apps/client/src/vite-env.d.ts`: `/// <reference types="vite/client" />` so `import.meta.env.DEV` typechecks. No prior code in client referenced `import.meta.env`; the d.ts addition surfaces during Phase 2 build, mirrors existing `vitest.d.ts` triple-slash precedent in the same dir.

**Pattern #7 candidate (do NOT codify yet).** The "module-level WeakMap for byte-zero production gating of dev-only instance state on production classes" is a real pattern with broad applicability (future dev-mode debug overlays, test instrumentation, any instance-scoped dev tooling). One-instance data point. Per standing convention, codify on second instance. Pattern tally stays at 6 through CF 31 closure.

### Bundle audit (load-bearing)

Production bundle BYTE-IDENTICAL to `125cfe4` baseline (M1.4b2.3 close):
- main: **243.36 KB raw / 75.97 KB gz** — unchanged.
- combat: **1,509.65 KB raw / 349.67 KB gz** — unchanged.
- mobile: **14.07 KB raw / 3.51 KB gz** — unchanged.
- modules: **105** — unchanged.

Vite + esbuild DCE worked as designed: `import.meta.env.DEV` literal at use sites substituted with `false` at production build time → `if (false)` blocks folded → module-level `const DEV_PLAYBACK_STATE = false ? new WeakMap() : null` folded to `null` → unused declaration tree-shaken entirely. Confirms the `if (import.meta.env.DEV)` literal-gate pattern works as documented (Phase 2 tightening over Phase 1's `if (DEV_PLAYBACK_STATE)` truthy-check pattern; original would likely have produced byte-identical too, but literal-gate is the recommended shape going forward).

Dev bundle delta not directly measurable via `vite build --mode development` (DEV literal is tied to build command, not --mode flag; `vite build` always sets DEV to false). Source-inspection estimate: ~57 lines of dev-only code added (interface + WeakMap initialization + 2 keybinding handlers + update() gate + comments), minified to ~1-2 KB raw. Under the 5 KB raw halt-and-surface threshold per Q6.

### Test count delta

0 new tests; workspace **210 / 22** unchanged; sim **466 active + 1 manually-gated** unchanged. Per CF 11 + dev-only-tooling stance.

### CF 31 closed

Open count entering M1.5: **25 carry-forwards** (was 26 at M1.4 close; CF 31 closed). Specifically: CF 2/3/5–24 except closures + CF 4b + CF 27 + CF 30 (CF 31 dropped from open list).

### No new patterns / catches / rules / locked answers

- **Patterns**: 6 cumulative (no change). Pattern #7 candidate noted in Implementation section above.
- **Catches**: 9 cumulative (Catch 9 in CF 31 Phase 2.5; see Phase 2.5 subsection below).
- **Going-forward rules**: 3 cumulative (no change).
- **Locked answers**: 30 cumulative (no change).

### Visual playtest gate going forward

Future milestones use Space-pause + Right-Arrow-step for frame-isolated render verification. M1.4b2.3's diff-inspection-clearance precedent remains a one-time concession; CF 11's helper-level + visual-playtest catch hierarchy returns to standard form for M1.5+.

### Verification — Turbo pipeline (`--force`, no cache replay)

`pnpm turbo lint test build --force` (single chained invocation): **19 successful, 0 cached, 42.2s.** Schema-sync gate green.

### Phase 1 ratifications confirmed pre-Phase-2

- **Q1 step-tick semantic**: next event-bearing tick (matches frame-perfect render isolation intent; `currentTick + 1` would bounce through dead time).
- **Q2 module-level WeakMap pattern**: strict byte-zero confirmed (load-bearing). Class fields would leak two instance properties into production constructor.
- **Q3 keybindings**: Space (pause/resume) + Right Arrow (step) — standard media-player UX.
- **Q4 strict pause-gate on Right Arrow**: confirmed (no auto-pause-and-step).
- **Q5 closing-log timing**: fresh dated entry per append-only discipline. M1.4b2.3 closing entry stays frozen as historical record at `537b2f5`.
- **Q6 dev-build budget**: ≤5 KB raw soft cap; production byte-identity is load-bearing. Estimate well under cap.

### Phase 2 tightening (over Phase 1 design)

Direct literal `if (import.meta.env.DEV)` at use sites (not `if (DEV_PLAYBACK_STATE)` truthy-check on the WeakMap variable). Belt-and-suspenders for DCE: ensures Vite's documented constant-folding kicks in regardless of how aggressively esbuild propagates const-bindings. Module-level WeakMap pattern preserved (production gets `const DEV_PLAYBACK_STATE = null` — unused declaration tree-shaken). Net: bulletproof byte-zero, no semantic change from Phase 1's design.

### CF 31 Phase 2.5 — Codex P2 catch + tween-pause fix

#### Trigger

PR #12 Codex automated review (2026-05-07) flagged P2: dev-mode pause via `update()` early-return doesn't freeze Phaser tween manager (independent update loop); pressed Right Arrow while paused renders new event for one frame and tweens keep animating during supposed pause; frame-perfect inspection — CF 31's whole purpose — doesn't work as built.

#### Fix

Added `this.tweens.pauseAll()` / `this.tweens.resumeAll()` calls inside the existing `import.meta.env.DEV`-gated blocks. Space toggle now pauses/resumes tween manager alongside the paused flag. Step handler calls `tweens.pauseAll()` AFTER `flushEventsAtCurrentTick` to freeze newly-spawned tweens at their initial state (synchronous JS execution guarantees pauseAll runs before any frame renders).

#### Catch 9 (predicate-vs-name lineage)

Same class as catches 5/6/7/8. Predicate: "early-return from `update()` = scene paused." Name: scene's tween manager has its own update loop independent of `scene.update()`. Caught by Codex automated review at PR time; halt-gate + Phase 1 design verification didn't surface it.

#### Process learning

Second consecutive PR where Codex external review catches a real architectural bug post-implementation (Catch 8 in M1.4b2.3 PR; Catch 9 in CF 31 PR). External review with full-codebase context catches what change-site-scoped halt-gate misses. Pattern surfacing: external automated review is becoming a load-bearing catch mechanism. Worth examining in pre-M1.5 retro.

#### Verification

Bundle: production BYTE-IDENTICAL to `125cfe4` (load-bearing constraint preserved; tween calls added inside existing gates). Dev: combat chunk +~0.1 KB raw. Tests: 210/22 unchanged. Visual playtest: user confirmed tween freeze works on Space press; Right Arrow advances and immediately freezes; Space resumes; frame-perfect inspection now functional as designed.

---

## 2026-05-07 — M1.4b2.3 closed (net-new VFX surfaces + CF 1/4a/25 closure) + M1.4b2 closed + M1.4 closed

### Branch + commit topology

Branch: `m1.4b2.3-net-new-vfx` off main `5722839` (clean — 2026-05-07 pre-M1.4b2.3 ratification setup commit; docs-only, functionally identical to M1.4b2.2 baseline at `936e2339`).

| SHA       | Sub-phase | Scope |
|-----------|-----------|-------|
| (no commit) | Phase 1 | Read-only investigation + design halt-gate. Six-section report covering 12 tasks; eight Q&A ratifications; no premise mismatches surfaced. |
| `4a29152` | Phase 2   | Implementation: 4 new event-type render branches (item_trigger / buff_apply / buff_remove / stun_consumed) + status_apply floater migration + statAbbr helper + stale-comment cleanup + MEANINGFUL_EVENT_TYPES lockstep. Two files: `CombatScene.ts` (+76/-4) + `CombatOverlay.tsx` (+11/-3); 83 insertions / 11 deletions total. |

### Phase 1 ratifications

Eight questions ratified pre-implementation (Q4 ratified by 2026-05-07 setup commit `5722839`; remaining 7 ratified inline). Two prompt-rec overrides: Q3 (buff_remove → floater-only) and the implicit reconfirmation that no new tests/fixtures land per CF 11.

- **Q1 (CF 1 closure interpretation):** at-least-one-anchor-based-call satisfies CF 1 (heal precedent from M1.4b2.1 Q3). status_apply migration limited to floater; pulsePortrait + refreshBurnPip stay refs-based for portrait-internal manipulation.
- **Q2 (item_trigger render):** `spawnParticleBurstAt(source, TEX.lineHit, 2)`. Reuses unused TEX.lineHit; count=2 (vs damage/heal=5) for visual subordination; temporal stacking with co-tick damage/heal source flashes is intentional — reads as synergy chain.
- **Q3 (buff_remove render):** **OVERRIDE** of Phase 1 recommendation. Floater-only; NO particle burst. Rationale: TEX.squareStatus would conflate with status_tick; TEX.lineHit at textSecondary would conflate with item_trigger. Floater-only creates clean buff_apply/buff_remove asymmetry mirroring gain/loss semantics (apply has the burst; remove doesn't).
- **Q4 (M1.4 retro structure):** inline section nested in M1.4b2.3 closing entry; single closing-log commit. Confirmed by setup commit `5722839` entry text 2026-05-07.
- **Q5 (phasing):** single Phase 2 commit. No internal sub-phase split.
- **Q6 (floater labels):** `'+1 DMG'` / `'−1 DMG'` for buff_apply / buff_remove. statAbbr helper (M1: `'damage'` → `'DMG'`; defensive uppercase fallback for M2 stat expansion).
- **Q7 (particle counts):** inline counts per existing damage=5 / heal=5 / status_tick=3 style. NO const promotion. **CF 30 opened** (deferred — see Carry-forwards delta).
- **Q8 (comment cleanup):** stale comment at end of `playEventVisuals` replaced with `// All event types except recipe_combine consume resolveEventAnchors. // CF 4b open, sim-emission-blocked (recipe_combine not in CombatEvent union).`

### Phase 2 — surface changes

Two files: `apps/client/src/combat/CombatScene.ts` (+76/-4) + `apps/client/src/combat/CombatOverlay.tsx` (+11/-3). 83 insertions / 11 deletions total.

- **`CombatScene.ts`**: new module-level `statAbbr` helper (between PortraitRefs interface and CombatScene class declaration); status_apply branch migrated (floater anchor-based; pulsePortrait + refreshBurnPip stay refs-based per Q1); 4 new event branches inserted between status_tick and combat_end (item_trigger / buff_apply / buff_remove / stun_consumed in stale-comment listing order); end-of-`playEventVisuals` stale comment replaced per Q8.
- **`CombatOverlay.tsx`**: MEANINGFUL_EVENT_TYPES Set extended with 3 entries (`stun_consumed`, `buff_apply`, `buff_remove`); comment block (lines 62-67) restructured to drop "absent too" framing and document post-M1.4b2.3 coverage (8 of 10 CombatEvent['type'] members; combat_start/combat_end excluded as universal/uninformative for the predicate; CF 4b cited for recipe_combine's continued absence).

### Test count delta

**0 new tests.** Workspace **210 across 22 files** unchanged from M1.4b2.2 close baseline. Per Q5/CF 11 ratification: helper-level + fixture-reuse only; visual playtest is the catch mechanism for render-consumer dispatch bugs (with M1.4b2.3 diff-inspection precedent — see "M1.4b2.3 visual playtest gate" subsection below). Existing per-row resolution tests in `anchorResolution.test.ts` (lines 201-236 cover stun_consumed / buff_apply / buff_remove) and vampire-fang anchor fixture (M1.4b2.1, 11 item_trigger events with source byte-equality) cover the resolver layer.

Sim **466 active + 1 manually-gated** unchanged (no new sim fixtures; existing M1.2.3b-locked DO-NOT-REGENERATE fixtures suffice — burn-application + poison-persistence + stun-consumption + buff-duration-expiry + whetstone-redundant + on-hit-vampire-fang collectively cover all 5 target event types).

### Q2 temporal-stacking tradeoff

item_trigger renders a small particle burst (count=2) at the source anchor. For sim emission ordering where `item_trigger` precedes its effect-event at the same tick (e.g., iron-sword: tick T `item_trigger` at p1 → tick T `damage` from p1), both render in the same `playEventVisuals` flush at the same source anchor. Visual stack is intentional — reads as a synergy chain ("the item activated and then dealt damage"), reinforcing the mastery-from-synergy pillar. Count differential (2 vs 5) keeps item_trigger visually subordinate so it doesn't compete with the effect's own beat.

### Q3 buff_remove floater-only rationale

buff_remove renders only a floater (`'−1 DMG'` in textSecondary), no particle burst. Rejected primitives:
- **TEX.squareStatus** — visually conflates with status_tick (same texture, color, semantic register).
- **TEX.lineHit at textSecondary** — visually conflates with item_trigger (same texture, dim color).

Floater-only preserves a clean buff_apply/buff_remove **asymmetry** mirroring the gain/loss semantics: buff_apply has visible burst (the gain is felt); buff_remove has just the floater (the loss is passive, like an expired effect ticking off the timeline). Pattern transfers naturally if M2 introduces other buff durations.

### Architectural patterns codified through M1.4b2.3 (running list)

1–6 unchanged from M1.4b2.1 closing. **No new patterns in M1.4b2.3.**

### Predicate-vs-name catches (running tally — 8 through M1.4b2.3)

Catches 1–7 unchanged from prior closings. **Catch 8 added in M1.4b2.3 Phase 2.5** (Codex P2 review at PR time; buff label sign-prefix format vs signed `ev.amount`; closed structurally with `formatSignedAmount` helper). Phase 1 halt-gate cleared without surfacing premise mismatches; Catch 8 was caught at PR-time external review. See Phase 2.5 subsection below.

### Carry-forwards delta

**CLOSED:**
- **CF 1 (item-anchored VFX consumption)** — all 5 named event types (item_trigger, status_apply, stun_consumed, buff_apply, buff_remove) now consume `resolveEventAnchors` per Q1 closure criterion (at-least-one-anchor-based-call). Heal precedent (M1.4b2.1 Q3) cited explicitly: portrait-internal primitives (pulsePortrait, refreshBurnPip) staying refs-based satisfies the criterion when the event type's floater migrates anchor-based. Full coverage matrix: damage (M1.4b1+M1.4b2.2), heal (M1.4b2.1), status_apply (M1.4b2.3), status_tick (M1.4b1), item_trigger (M1.4b2.3), stun_consumed (M1.4b2.3), buff_apply (M1.4b2.3), buff_remove (M1.4b2.3); combat_start (unanchored; out of CF 1 scope) + combat_end (portrait mode; refs ≡ portraitAnchor by PORTRAIT_*_RATIO single-source; out of CF 1's 5-event-type scope).
- **CF 4** — split per 2026-05-07 ratification entry. **CF 4a (item_trigger) closes**; render block lands at `playEventVisuals` item_trigger branch. **CF 4b (recipe_combine) remains open**, sim-emission-blocked: recipe_combine not in `CombatEvent` union; deferred until M2 content sweep when sim emits the event. CF 4b inherits CF 4's documentation ancestry.
- **CF 25 (status / buff event VFX — `stun_consumed`, `buff_apply`, `buff_remove`)** — all 3 enumerated events render via `resolveEventAnchors`. Coverage complete.

**OPENED:**
- **CF 30 (NEW M1.4b2.3) — Particle-count consts promotion (§ 4.5 R2 spirit-extension sweep).** Status: deferred to M1.5 polish or M2 telemetry-driven tuning. Rationale: particle counts (damage=5, heal=5, status_tick=3, item_trigger=2, buff_apply=3) sit on R2's spirit boundary — R2's letter is fast-forward thresholds (M1.3.4b Locked Answer #22). Promoting mid-milestone exceeds .b2.3 scope; revisit when telemetry surfaces a tuning need or a designer flags visual-density issues.
- **CF 31 (NEW M1.4b2.3) — Dev-mode scene pause/step keybinding for visual playtest tooling.** Status: deferred to pre-M1.5 scoping (small ride-along commit, ~15-20 LOC). Rationale: real-time combat playback with no pause/step makes frame-perfect render-path isolation difficult during visual playtest gates. CF 11's visual-playtest catch mechanism degrades under this constraint. Scope: Phaser `scene.pause()`/`resume()` + keybindings (Space pause, Right Arrow step one tick); gated by `import.meta.env.DEV` (no production impact). Surfaced by M1.4b2.3 visual playtest attempt; see precedent subsection below.

**Audit verdicts (no CF created/closed):**
- Anchor fixture coverage — vampire-fang (M1.4b2.1) covers 11 item_trigger source byte-equality assertions; per-row resolution tests in `anchorResolution.test.ts` cover stun_consumed / buff_apply / buff_remove resolution. No new fixtures needed (per Q5/CF 11 stance).

### M1.4b2.3 visual playtest gate — diff-inspection clearance (precedent)

User attempted Scenario A frame capture; surfaced real-time-playback constraint (multiple events fire same-tick and stack visually at shared anchors; single-frame screenshots can't reliably isolate render paths). Single captured frame partially verified status_apply migration (BURN floater + burn pip at ghost portrait), damage target render, and source-side stack at item position consistent with item_trigger + damage co-tick spec.

Gate cleared on diff-inspection grounds for M1.4b2.3 specifically:

- **Q3 override** (buff_remove no particle burst) structurally guaranteed by diff — `spawnParticleBurstAt` not called in buff_remove branch (verified Phase 2 §1).
- **Q6 label format** (`+N DMG` / `−N DMG`) guaranteed by `statAbbr` helper diff (M1: `'damage'` → `'DMG'`; defensive uppercase fallback).
- **Helper-level anchor resolution** covered by `anchorResolution.test.ts` lines 201-236 per-row tests for stun_consumed / buff_apply / buff_remove.
- **Implementation surface** (~80 LOC across 2 files) reviewable in entirety by inspection.

One-time concession scoped to M1.4b2.3. Future milestones use dev-mode pause/step tooling per CF 31. CF 11's helper-level + fixture-reuse + visual-playtest catch hierarchy remains the standing rule; M1.4b2.3 sets the precedent that diff-inspection can substitute for visual playtest when implementation surface is small AND spec-divergence checks are diff-verifiable AND tooling gap blocks reliable visual capture.

### Verification — Turbo pipeline (all `--force`, no cache replay)

`pnpm turbo lint test build --force` (single chained invocation):
- **19 successful, 0 cached, 41.4s.**
- Schema-sync gate green.
- 0 test-count delta vs M1.4b2.2 close baseline.

### Bundle envelope (vs M1.4b2.2 `936e2339` baseline)

- main: **243.36 KB raw / 75.97 KB gz** — unchanged.
- combat chunk: **1,509.61 KB raw / 349.65 KB gz** — **+1.07 KB raw / +0.15 KB gz** vs M1.4b2.2. Source: 4 new render branches + statAbbr helper + comment expansion; combat-chunk-only. Sourcemap audit confirms Phaser stays in combat chunk exclusively (main + mobile byte-identical).
- mobile chunk: **14.07 KB raw / 3.51 KB gz** — unchanged.
- 105 modules — unchanged.

### Going-forward rules carried from M1.4b1+

All in effect, unchanged. **No new rules in M1.4b2.3.**

### Locked answers cumulative through M1.4b2.3

1–30 unchanged from M1.4b2.1 closing. **No new locked answers.**

---

### M1.4 milestone closure + retrospective (inline)

#### Milestone summary

**M1.4 closes here.** Comprises 5 sub-phase merges over 2026-05-05 → 2026-05-07:
- **M1.4a** (`148916e`, 2026-05-05) — BagLayout handshake foundation. `BagLayout` type + `computeBagLayout` + `ANCHOR_RULE` 10-row table + `resolveAnchor` pure helper + `PORTRAIT_*_RATIO` consts + 5-file `bagContainerRef` plumbing. Zero visual changes.
- **M1.4b1** (`fb24765`, 2026-05-06) — Visual-no-op refactor lift. damage + status_tick branches consume `resolveAnchor` via new `eventAnchorResolver.resolveEventTargetAnchor`; canvas-local translation through `this.scale.canvasBounds`. Heal descoped to M1.4b2.
- **M1.4b2.1** (`33db4cc`, 2026-05-06) — Heal anchor 'both' refactor + CF 26 + CF 28 closure. ANCHOR_RULE.heal flipped 'source' → 'both'; helper renamed → `resolveEventAnchors` with dual-axis return. New vampire-fang anchor fixture (43 events).
- **M1.4b2.2** (`936e2339`, 2026-05-06) — Portrait hit-flash + CF 29 closure. flashPortrait primitive + damage source-render parity. First M1.4 halt-gate exercise (CF 1 framing premise mismatch).
- **M1.4b2.3** (Phase 2 `4a29152`; merge SHA assigned at PR merge time, 2026-05-07) — Net-new VFX surfaces + CF 1/4a/25 closure + this milestone closure + retrospective.

#### Architectural patterns codified — 6 new in M1.4 (running total 6)

- **Pattern #1 (M1.4a):** audit-gate spirit-vs-letter.
- **Pattern #2 (M1.4a):** 10-row ANCHOR_RULE per-row test discipline.
- **Pattern #3 (M1.4a):** 5-file plumbing pattern for sibling-DOM ref handoff.
- **Pattern #4 (M1.4a):** PORTRAIT_*_RATIO consts pattern.
- **Pattern #5 (M1.4b1):** verbatim-mirror discipline for legacy-extraction scaffolding.
- **Pattern #6 (M1.4b2.1):** compute-via-production-helper-and-freeze fixture pattern.
- **No new patterns in M1.4b2.2 or M1.4b2.3.**

(All 6 patterns originate within M1.4; cumulative pre-M1.4 was 0. See §6 deviation note for attribution-correction history.)

#### Predicate-vs-name catches caught — 4 new in M1.4 (running total 8)

- **Catch 5 (M1.4b1 Phase 1):** ANCHOR_RULE.heal='source' design vs heal-at-target render. Closed structurally M1.4b2.1 (heal flipped to 'both' + source-side render added).
- **Catch 6 (M1.4b1 Phase 3 → Phase 2.5):** "pipeline green" predicate vs cache-replayed reality. Closed structurally Phase 2.5 + `--force` rule.
- **Catch 7 (M1.4b2.1 Phase 1):** ANCHOR_RULE.damage='both' table vs target-only render. Closed structurally M1.4b2.2 (CF 29 closure adds source-side damage render).
- **Catch 8 (M1.4b2.3 PR review — Codex automated review):** buff_apply / buff_remove label format hard-codes sign prefix; `ev.amount` can be negative under M1 BuffableStat schema (cooldown_pct emitters); produced malformed labels `'+-15 COOLDOWN_PCT'`. Closed structurally M1.4b2.3 Phase 2.5 (`formatSignedAmount` helper). See Phase 2.5 subsection below.
- **No new catches in M1.4b2.2; Catch 8 in M1.4b2.3 Phase 2.5.**

#### Going-forward rules codified — 3 new in M1.4

All originate M1.4b1 closing (`86d729e`, 2026-05-06):
- Closing-log metric framing anchors explicitly to milestone-total or vs-N-baseline.
- `--force` on verification runs (no cache-replay as proof-of-green for new work).
- Phase 2.5 interlude precedent (out-of-scope items shifting reproduction profile mid-milestone escalate to in-scope; sub-phase numbering accommodates).

#### Halt-gate exercises — 1 across M1.4

- **M1.4b2.2 Phase 1** — CF 1 framing premise mismatch (prompt deliverable framed CF 1 closing in .b2.2; CF text said .b2.3). Standing rule (`feedback_halt_when_inputs_missing.md`) operating as designed; no new pattern or rule codified. First concrete M1.4 trip; rule's continued utility logged.

#### CF dispositions across M1.4

- **CF 1 closed (M1.4b2.3)** — full event-type consumption coverage; heal precedent extended to status_apply.
- **CF 4 split (M1.4b2.3 pre-ratification, 2026-05-07 entry):**
  - **CF 4a closed (M1.4b2.3)** — item_trigger event VFX.
  - **CF 4b open** — recipe_combine event VFX; sim-emission-blocked (recipe_combine not in CombatEvent union); deferred until M2 content sweep.
- **CF 25 closed (M1.4b2.3)** — status/buff event VFX (stun_consumed + buff_apply + buff_remove all landed).
- **CF 26 closed (M1.4b2.1)** — source-side test discipline on 'both' promotion (vampire-fang fixture's per-event source byte-equality + per-row resolution test).
- **CF 27 deferred to M1.5 retro** — § 4.5 R1 cross-axis amendment (sharpened by catches 5/6/7; no `tech-architecture.md` amendment in M1.4 scope per 2026-05-07 ratification entry).
- **CF 28 closed (M1.4b2.1)** — player-branch fixture coverage gap (vampire-fang fixture covers player-branch dispatch on 12 events: 7 heal + 5 damage targeting player).
- **CF 29 closed (M1.4b2.2)** — damage source-render gap (catch 7 closure structural mechanism).
- **CF 30 opened (M1.4b2.3)** — particle-count consts promotion deferred per Q7 lock.
- **CF 31 opened (M1.4b2.3)** — dev-mode scene pause/step keybinding for visual playtest tooling; surfaced by M1.4b2.3 visual playtest attempt; deferred to pre-M1.5 ride-along.

#### Pillar-alignment retrospective

- **Readable in one screen.** Hierarchy enforced via primitive + count differentiation across event types: damage/heal use count=5 bursts (top-tier impact); status_tick uses count=3 (mid-tier); item_trigger uses count=2 (subordinate "the item fired" beat). Color-coding reinforces semantic register: red for damage; green for heal/buff_apply gain; legendary-amber for status; gray (textSecondary) for stun_consumed and buff_remove (negative/passive register). Floater-vs-particle vs portrait-flash differentiates event type at a glance.
- **Mastery from synergy.** Item-anchored VFX makes synergy chains visible. Vampire-fang at p2 flashes on its own item_trigger, then heal source-flash on the same anchor when the heal event fires same-tick — player sees "the fang activated, healed me." Iron-sword + spark-stone: iron-sword fires (item_trigger at p1), damages ghost (target floater at ghost portrait + source particles at p1), spark-stone reacts (item_trigger at p2), applies burn (target floater at ghost portrait). Visible chain.
- **Snappy.** All primitives ≤600ms (KO flash, terminal event); most ≤200ms — portrait hit-flash 150ms (M1.4b2.2), status pulse 140ms (M1.3.4b carryover), particle bursts 500ms PARTICLE_LIFETIME_MS, floaters 600ms FLOATER_LIFETIME_MS. Tunable consts at top of `CombatScene.ts` per § 4.5 R2.

#### Open carry-forwards entering M1.5 (enumerated, no consolidation)

  1. ~~CF 1 — item-anchored VFX consumption~~ (CLOSED M1.4b2.3).
  2. **Real character art in portraits** → M2.
  3. **Real particle sprite sheets** → post-M1.
  4. ~~CF 4 (split)~~: **CF 4a item_trigger** (CLOSED M1.4b2.3); **CF 4b recipe_combine** → open, sim-emission-blocked; deferred until M2 content sweep emits the event.
  5. **Music + SFX integration** → post-M2.
  6. **Custom cubic-bezier easing function** → M2 if designer flags.
  7. **BitmapText / pre-rasterized font atlas** → post-M1 if floater spawn rate saturates Phaser glyph cache.
  8. **`>>` fast-forward indicator visual styling** → M2 polish.
  9. **Telemetry event for "fast-forward triggered"** → if telemetry-plan.md § 4 surfaces need.
  10. **Configurable per-user playback speed** → M2+.
  11. **SKIP scene-level direct unit test coverage** → CF 11 precedent reaffirmed M1.4b2.2 / M1.4b2.3; revisit if SKIP regresses.
  12. **Combat chunk Vite build non-determinism** (~0.75 KB raw drift) → tracked.
  13. **Generation-side ghost-loadout filter** → M2 ghost storage rework.
  14. **Codex P1 regression test for UI-vs-reducer affordability under non-default rulesets** → M1.5.
  15. **`opponentClassId` on `RunHistoryEntry`** → M1.5.
  16. **Server-side ghost record** → M2.
  17. **Auto-rearrange hint affordance** → M3.
  18. **Per-round trophy schedule + contract modifiers + win-streak multipliers** → M2.
  19. **`RarityGem` for shop rarity dot** → carries from M1.3.2.
  20. **`apps/client/src/index.css` `.glow-*` rgba palette derivatives** → carries.
  21. **Run-end detection (hearts === 0 → eliminated screen)** → M1.5.
  22. **State-driven bag dimensions through pure helpers** → M2.
  23. **Real-device drag-state screenshot capture** → still carried.
  24. **Player portrait dying-state visual feedback** — M1.4b2.2 partial closure (damage portrait hit-flash); progressive HP-curve tint still absent.
  25. ~~CF 25~~ (CLOSED M1.4b2.3).
  26. ~~CF 26~~ (CLOSED M1.4b2.1).
  27. **Extend `tech-architecture.md` § 4.5 R1 framing for cross-axis case** → deferred to M1.5 retro; sharpened by M1.4b1 catches 5/6 + M1.4b2.1 catch 7.
  28. ~~CF 28~~ (CLOSED M1.4b2.1).
  29. ~~CF 29~~ (CLOSED M1.4b2.2).
  30. **CF 30 (NEW M1.4b2.3)** — Particle-count consts promotion (§ 4.5 R2 spirit-extension sweep). Deferred to M1.5 polish or M2 telemetry-driven tuning.
  31. **CF 31 (NEW M1.4b2.3)** — Dev-mode scene pause/step keybinding for visual playtest tooling. Pre-M1.5 ride-along commit, ~15-20 LOC, dev-only. Surfaced by M1.4b2.3 visual playtest attempt.

Open count entering M1.5: **26 carry-forwards** (CF 2/3/5–24 except closures + CF 4b + CF 27 + CF 30 + CF 31).

### M1.4b2.3 Phase 2.5 — Codex P2 catch + buff sign-handling fix

#### Trigger

PR #11 Codex automated review (2026-05-07) flagged P2: `buff_apply` / `buff_remove` label format hard-codes sign prefix; `ev.amount` can be negative under M1 BuffableStat schema; produces malformed labels like `'+-15 COOLDOWN_PCT'` (apply) / `'−-15 COOLDOWN_PCT'` (remove). Three M1 production items affected: **Mana Potion** (`packages/content/src/items.ts:218-230`, `cooldown_pct` -15), **Stamina Tonic** (`packages/content/src/items.ts:397-409`, `cooldown_pct` -25), **Resonance Crystal** (`packages/content/src/items.ts:637-652`, `cooldown_pct` -10).

#### Fix

New `formatSignedAmount` helper at module level in `CombatScene.ts`, alongside `statAbbr`:

```typescript
function formatSignedAmount(amount: number): string {
  return (amount >= 0 ? '+' : '−') + Math.abs(amount);
}
```

`buff_apply` branch uses `formatSignedAmount(ev.amount)`; `buff_remove` branch uses `formatSignedAmount(-ev.amount)` (inverse — buff lifted means the player loses the buff that was applied). U+2212 minus matches damage floater convention. Single source of truth for sign convention; mirrors `statAbbr` helper pattern.

#### Truth-table verification

- `buff_apply` +1 dmg → `+1 DMG`
- `buff_apply` −15 cdr → `−15 COOLDOWN_PCT`
- `buff_remove` +1 lifted → `−1 DMG`
- `buff_remove` −15 lifted → `+15 COOLDOWN_PCT`

#### Catch 8 (predicate-vs-name lineage)

Same class as catches 5/6/7. Predicate (hard-coded sign prefix in label format) didn't match data shape (signed `ev.amount`). Caught by Codex automated review at PR time; halt-gate + Phase 1 design-verification chain didn't surface it. Process learning: PR-time external review (automated or human) catches a class of bugs the internal halt-gate process can miss. The pre-paste-check + halt-gate + Phase 1 design verification chain is necessary but not sufficient; PR-time external review (Codex or human) catches the residual. Closes structurally with this Phase 2.5 commit.

#### Phase 1 §2 epistemic failure (two axes documented for process tightening)

**Axis A — line-citation drift.** Phase 1 §2 cited `decision-log.md:1116` for BuffableStat scope claim. Line 1116 today references unrelated content (boss-relic threshold asymmetry from M1.2.6 closing). Decision-log is newest-at-top append-only; line numbers shift on every append. **Going-forward discipline (effective 2026-05-07):** cite decision-log entries by date + section header (e.g., `decision-log.md 2026-04-30 § M1.2.6 boss-relic coverage residual gap`), NOT by raw line number. **First exercise within hours of codification:** at Phase 2.5 continuation prompt's Addition 2 substitution, the bundled-comment-fix sentence cited `CombatScene.ts:165-169` (raw line numbers, axis A violation; also off-by-7 since actual location is lines 158-162 — concrete instance of the predicted line-shift failure mode the rule was authored to prevent). Caught by Claude Code halt-gate; corrected to `CombatScene.ts § statAbbr docblock` pre-commit.

**Axis B — content-side evidence gap.** Phase 1 §2 asserted "M1 content uses 'damage' only (whetstone redundant fixture)" by verifying the `BuffableStat` schema union but NOT grepping `packages/content/` for actual emissions. Reality: `BuffableStat` schema is `'damage' | 'cooldown_pct' | 'trigger_chance_pct'` (`packages/content/src/schemas.ts:170`); `items.ts` emits all three. The "M1 only emits 'damage'" claim was a narrative invention not supported by the cited evidence. **Going-forward discipline candidate** (one-instance data point; codify on second instance per standing pattern): schema-vs-content claims require BOTH schema-side AND content-side evidence. One grep `schemas/`, one grep `content/`, before asserting scope. Bundled with this Phase 2.5 commit: statAbbr's docblock at CombatScene.ts § statAbbr docblock amended to reflect actual M1 scope (mapped 'damage' explicitly + defensive fallback for cooldown_pct / trigger_chance_pct), removing the factually-false 'M1: only 'damage' BuffableStat' framing.

#### Visual playtest gate

Maintained at diff-inspection clearance per CF 31 framing. Truth-table-verifiable change with no new render primitives or dispatch logic. Fix reuses the diff-inspection-clearance precedent established earlier in M1.4b2.3. No new event types; `formatSignedAmount` is a 2-line pure helper called only at the two updated label sites; truth-table covers all four sign × event-type combinations.

#### Verification

`pnpm turbo lint test build --force` (single chained invocation): **19 successful, 0 cached, 35.1s.** Workspace tests **210 across 22 files** unchanged; sim **466 active + 1 manually-gated** unchanged; **0 new tests** (per CF 11 stance + truth-table verification). Bundle delta vs `537b2f5` (M1.4b2.3 Phase 2 close): combat chunk **+0.04 KB raw / +0.02 KB gz** (1,509.61 → 1,509.65 raw; 349.65 → 349.67 gz); main + mobile unchanged; **105 modules unchanged** (`formatSignedAmount` inlined into existing CombatScene.ts module). CF count entering M1.5: **26 unchanged** (no CF changes from this fix; Catch 8 amends running tally only).

---

## 2026-05-07 — Pre-M1.4b2.3 ratification

Four pre-conditions locked before M1.4b2.3 Phase 2 fires; canonical record matches Phase 2's pre-state.

- **CF 4 split** into 4a (item_trigger; closes M1.4b2.3) + 4b (recipe_combine; remains open, sim-emission-blocked). Rationale: parallel render surfaces with distinct sim dependencies; cleaner than partial-CF lingering past M1.4.
- **M1.4 retro treatment**: inline section nested in M1.4b2.3 closing entry per Phase 1 § 5 outline; escalation to separate doc only if heavyweight material surfaces (M1.3.4 `5cadc15` precedent). M1.4 has no `tech-architecture.md` amendments in scope; CF 27 deferred to M1.5 retro.
- **Stale M1.1–M1.2.6 branches** cleared post-M1.4 close, pre-M1.5 scoping.
- **`project_milestone_state.md` retired as canonical reference.** Not present at repo root; never created. Function carried by `decision-log.md` closing entries + `roadmap.md` + manual state-dump-on-resume. Memory purged. Prompts retargeted to cite `decision-log.md` closing entries for CF text verification.

---

## 2026-05-06 — M1.4b2.2 closure (VFX layer audit + portrait hit-flash + CF 29 closure)

### Branch + commit topology

Branch: `m1.4b2.2-vfx-layer-hit-flash` off main `33db4cc` (clean — no setup commits required).

| SHA       | Sub-phase | Scope |
|-----------|-----------|-------|
| (no commit) | Phase 1 | Read-only investigation + design halt-gate; **CF 1 framing premise mismatch caught and surfaced** (prompt claimed CF 1 closes here; CF text says full event-type consumption is incomplete until M1.4b2.3 — ratified to track CF 1 → M1.4b2.3). Six-section halt-gate + six Q&A ratifications. |
| `46cf35b` | Phase 2   | Implementation: 4 `PORTRAIT_FLASH_*` named consts + `flashPortrait` private method + damage-block dual-axis consumption (source particles + target portrait flash). Single file: `apps/client/src/combat/CombatScene.ts`. |

### Phase 1 ratifications (chat-recorded; no commits)

Six questions ratified pre-implementation. Halt-gate fired once on premise mismatch (prompt-vs-CF-text); resolved at ratification turn without scope renegotiation.

- **Q1 (CF 1 closure timing).** **Premise mismatch caught.** Prompt deliverable claimed CF 1 closes in M1.4b2.2; CF 1 text in `project_milestone_state.md` describes progressive closure across M1.4a/.b1/.b2.1/.b2.2/.b2.3 contingent on full event-type render consumption. Ratified: CF 1 advances in M1.4b2.2 (damage source-render added — 1 of 5 remaining event types covered); CF 1 closes at M1.4b2.3 with item_trigger / status_apply / stun_consumed / buff_apply / buff_remove migration. No CF split into 1a/1b. **First halt-gate exercise across M1.4 phasing**; standing halt-when-premise-doesn't-match rule operating as intended (no new pattern, no new rule — pre-existing rule's first concrete test in M1.4).
- **Q2 (VFX layer Container scope).** Option (c) audit-closed. No Container introduced; scene root sufficient. Phaser scene root IS the implicit VFX layer; introducing a named Container would add API surface (parenting + container.add() in spawn helpers + setDepth strategy) without observable benefit. § 4.5 R3 minimal-architecture preference. YAGNI rationale: 2 item-anchored sprites today (heal source-flash post-M1.4b2.1; damage source-flash post-M1.4b2.2) + 1 more in M1.4b2.3 (item_trigger render); none require batch operations or z-ordering that motivate a Container. Revisit only if perf or z-order issue surfaces.
- **Q3 (portrait flash scope).** Option (i) damage-target-only red flash. Visual differentiation per pillar — damage = "impact felt" beat; heal = "passive reception" beat. Heal already at 3 visual events (M1.4b2.1 Q3 ratification: recipient floater + recipient particles + source flash); adding portrait flash would push heal to 4 events and pre-empt M1.4b2.1 Q3's design-review-on-subtraction caveat.
- **Q4 (portrait flash primitive).** Option B (overlay rect with alpha+scale tween, mutation-free overlay-and-destroy). Mirrors `spawnKoFlash`'s structural pattern with smaller + shorter values. § 4.5 R2 named consts from the start; do NOT inherit `spawnKoFlash`'s magic-number anti-pattern (200×200, 0.55 alpha, 600ms, 1.3 scale all inline at line 535-544).
- **Q5 (test surface).** Helper-level + fixture-reuse only. CF 11 precedent upheld (no direct CombatScene unit tests; `tickAdvancer.test.ts:14` documents the precedent). Visual playtest at .b2.2 close is the catch mechanism for render-consumer dispatch bugs. Vampire-fang fixture (M1.4b2.1) covers source-anchor RESOLUTION on damage events; render-side dispatch is 1-line consumer not test-warrant material per CF 11.
- **Q6 (tunable consts).** `PORTRAIT_FLASH_DURATION_MS = 150`, `PORTRAIT_FLASH_INITIAL_ALPHA = 0.45`, `PORTRAIT_FLASH_SIZE_PX = 180` (matches portrait body w/h), `PORTRAIT_FLASH_SCALE_END = 1.08`. § 4.5 R2-compliant from the start.

### Phase 2 — surface changes

Single file: `apps/client/src/combat/CombatScene.ts` (54 insertions / 4 deletions).

- **4 new tunable consts** at the top of the file alongside existing tick-timing consts (`FLOATER_LIFETIME_MS`, `PARTICLE_LIFETIME_MS`, etc.). Comment block documents § 4.5 R2 framing + visual register rationale + comparison to `spawnKoFlash` (terminal KO event, larger/longer) and `pulsePortrait` (subtle status pulse, smaller/yoyo).
- **New `flashPortrait(refs: PortraitRefs, color: number): void`** private method between `spawnKoFlash` and `pulsePortrait`. Color parameterized so future event types or Q3 (ii) reopen extends without primitive rewrites. Mutation-free overlay-and-destroy: `this.add.rectangle` + `setBlendMode(SCREEN)` + alpha+scale tween + `destroy()` onComplete. All four PORTRAIT_FLASH_* consts consumed.
- **Damage block in `playEventVisuals`** updated:
  - Comment header amended to call out M1.4b2.2 + CF 29 + Q3 (i) ratification + parameterized color rationale.
  - `if (anchors.target)` branch — adds `const refs = ev.target === 'player' ? this.playerRefs : this.ghostRefs` + `this.flashPortrait(refs, PALETTE.lifeRed)` after existing floater + particle burst.
  - **NEW `if (anchors.source)` branch** — `this.spawnParticleBurstAt(anchors.source.x, anchors.source.y, TEX.squareDmg, 5)`. Symmetric to heal's source-flash from M1.4b2.1; closes CF 29.

### Test count delta

**0 new tests.** Per Q5 ratification: helper-level + fixture-reuse stance preserves CF 11 precedent. Vampire-fang fixture (M1.4b2.1) already covers damage source-anchor RESOLUTION on 13 damage events (8 player→ghost + 5 ghost→player); render-side CONSUMPTION is 1-line dispatch, visually verified at playtest. Workspace test count: **210 across 22 files** (unchanged from M1.4b2.1 close — 183 client / 19 + 27 ui-kit / 3).

### Architectural patterns codified through M1.4b2.2 (running list)

1–6 unchanged from M1.4b2.1 closing. **No new patterns.** Halt-when-premise-doesn't-match was already standing rule; its first M1.4 trip is logged but not codified anew.

### Predicate-vs-name catches (running tally — 7 through M1.4b2.2)

Catches 1–7 unchanged from M1.4b2.1 closing. **No new catches in M1.4b2.2**; catch 7 (M1.4b2.1 — damage table-vs-render gap) closes structurally via this milestone's CF 29 closure, but the catch itself remains tallied as historical record.

### Carry-forwards delta

**CLOSED:**
- **CF 29 (damage source-render gap)** — `playEventVisuals` damage branch now consumes `anchors.source` symmetric to heal source-flash from M1.4b2.1; `spawnParticleBurstAt(anchors.source.x, anchors.source.y, TEX.squareDmg, 5)` gated on non-null. Catch 7 closes structurally (the table-vs-render asymmetry the catch named no longer exists for damage).

**ADVANCED (still open):**
- **CF 1 (item-anchored VFX consumption)** — damage source-render added; 1 of 5 remaining event types covered. CF 1 stays open; closes at M1.4b2.3 with item_trigger / status_apply / stun_consumed / buff_apply / buff_remove migration. Premise-mismatch correction logged here per Q1 ratification.

**OPENED:** none.

**Audit verdicts (no CF created/closed):**
- VFX-layer Container question (Q2) — option (c) audit-closed. Phaser scene root sufficient as implicit VFX layer; YAGNI rationale recorded. Revisit only if perf or z-order issue surfaces.

### Verification — Turbo pipeline (all `--force`, no cache replay)

`pnpm turbo lint test build --force` (single chained invocation):
- **19 successful, 0 cached, 45.2s.**
- Schema-sync gate green.
- 0 new tests; 0 test-count delta vs M1.4b2.1 close baseline.

### Bundle envelope (vs M1.4b2.1 `33db4cc` baseline)

- main: **243.36 KB raw / 75.97 KB gz** — unchanged.
- combat chunk: **1,508.54 KB raw / 349.50 KB gz** — **+0.42 KB raw / +0.09 KB gz** vs M1.4b2.1. Source: 4 PORTRAIT_FLASH_* consts + flashPortrait method + damage block additions; combat-chunk-only.
- mobile chunk: **14.07 KB raw / 3.51 KB gz** — unchanged.
- 105 modules — unchanged.

### Halt-gate exercise (M1.4b2.2 Phase 1)

First halt-gate exercise across M1.4 phasing. Premise mismatch caught: prompt deliverable framed CF 1 as a discrete "VFX layer" closing in M1.4b2.2; CF 1 text in `project_milestone_state.md` describes progressive consumption-coverage closing at M1.4b2.3. Standing rule (`feedback_halt_when_inputs_missing.md`) operated correctly — surfaced the gap rather than re-deriving silently. Resolution at ratification turn (no scope renegotiation): CF 1 → M1.4b2.3; CF 29 closes here; VFX layer Container question handled as one-off design call (option (c) audit-closed), not a CF closure. **No new pattern or rule codified** — this is the existing halt-gate rule operating as designed.

### Going-forward rules carried from M1.4b1+

All in effect, unchanged:
- Closing-log metric framing anchors explicitly to milestone-total or vs-N-baseline.
- `--force` on verification runs.
- Phase 2.5 interlude precedent (no Phase 2.5 needed in .b2.2; surface clean).

### Locked answers cumulative through M1.4b2.2

1–30 unchanged from M1.4b2.1 closing. **No new locked answers.**

---

## 2026-05-06 — M1.4b2.1 closure (heal anchor 'both' refactor + CF 26 / CF 28 closure)

### Branch + commit topology

Branch: `m1.4b2.1-heal-anchor-both` off main `3042ca7` (clean — heal-anchor design decision committed separately as `3042ca7` per branch-hygiene rule before Phase 2 began).

| SHA       | Sub-phase | Scope |
|-----------|-----------|-------|
| (no commit) | Phase 1 | Read-only investigation + design proposal — six-section halt-gate, ratification in chat |
| `9806cda` | Phase 2   | Implementation: ANCHOR_RULE.heal flip + helper rename to dual-axis + CombatScene heal-render refactor + vampire-fang anchor fixture |

### Phase 1 ratifications (chat-recorded; no commits)

Five questions ratified pre-implementation:
- **Q1 (helper signature):** Option A — `resolveEventTargetAnchor` → `resolveEventAnchors` returning `{ source: CanvasAnchor | null; target: CanvasAnchor | null }`. Single helper, dual-axis return; preferred over Option B (parallel helpers) for § 4.5 R2 single-source compliance.
- **Q2 (source-item flash primitive):** Reuse `spawnParticleBurstAt` with `TEX.plusHeal` at the resolved source anchor. No new VFX primitive in .b2.1; item-cell halo deferred to M1.4b2.2.
- **Q3 (recipient render):** Additive — keep existing target floater + target particles; ADD source flash. Three visual events per heal accepted; subtraction (if playtest flags muddiness) goes through design review separately.
- **Q4 (source-coord capture method):** Compute via production helper at fixture-creation time, freeze. Independent-oracle discipline lives in `anchorResolution.test.ts` per-row tests; vampire-fang fixture is a regression lock against drift in `resolveAnchor` or `resolveEventAnchors`.
- **Q5 (CF 28 closure scope):** Vampire-fang fixture closes CF 28. Damage source-render gap tracked separately as catch #7 (running tally) + new CF 29 (M1.4b2.2 work surface).

### Phase 2 — surface changes

- **`apps/client/src/combat/anchorResolution.ts`:** `ANCHOR_RULE.heal` flipped `'source'` → `'both'`. Inline table comment amended ("Heal row amended 2026-05-06"); intent column updated to "recipient +N floater + source-item flash (M1.4b2.1)". `resolveAnchor` core unchanged — heal already grouped with damage/status_apply at the case level, so dual-axis output is purely a data-driven flip.
- **`apps/client/src/combat/eventAnchorResolver.ts`:** Renamed `resolveEventTargetAnchor` → `resolveEventAnchors`. New return type `ResolvedCanvasAnchors = { source: CanvasAnchor | null; target: CanvasAnchor | null }` exported. Comment header updated to enumerate per-mode return shape.
- **`apps/client/src/combat/CombatScene.ts`:** Three call sites in `playEventVisuals`:
  - `damage` branch — renamed call + reads `.target` field. Source axis populated by helper but unconsumed by render (CF 29 — M1.4b2.2 portrait hit-flash work).
  - `heal` branch — refactored. Existing recipient-side render preserved verbatim (`spawnFloater(refs)` + `spawnParticleBurst(refs, TEX.plusHeal, 5)`). New source-side `spawnParticleBurstAt(anchors.source.x, anchors.source.y, TEX.plusHeal, 5)` gated on `anchors.source` non-null. Comment narrates the M1.4b2 lock (decision-log 2026-05-06) + Q3 additive ratification.
  - `status_tick` branch — renamed call + reads `.target` field.
- **`apps/client/src/combat/anchorResolution.test.ts`:** Per-row test heal assertion flipped `'source'` → `'both'` (description includes "decision-log 2026-05-06" reference). Resolution test heal payload assertion updated from `{ source: PLAYER_ITEM_B }` → `{ source: PLAYER_ITEM_B, target: PLAYER_PORTRAIT }`. Independent-oracle discipline preserved — coords are hand-coded test constants.
- **`apps/client/src/combat/eventAnchorResolver.test.ts`:** Two describe blocks. Burn-application block re-targeted to `resolveEventAnchors` reading `.target` field (M1.4b1 surface preserved). New vampire-fang block adds count-match + 43 per-event source+target byte-equality tests + 1 source-axis translation invariant test (45 net new tests).
- **`apps/client/src/combat/test/fixtures/anchors/on-hit-vampire-fang.json` (NEW):** 43-event dual-axis frozen fixture. Coords computed via `resolveEventAnchors` against synthesized `BagLayout` in test (player.itemAnchors at p1=(100,200), p2=(200,200); ghost.itemAnchors at g1=(1080,200); portraits at canonical 1280×720 ratios). `$comment` documents the regression-lock framing per Q4.

### Test count delta (vs M1.4b1 close baseline)

138 → 183 (+45 net). All 45 from `eventAnchorResolver.test.ts` vampire-fang block: 1 count-match + 43 per-event byte-equality + 1 source-axis translation invariant. Burn-application block tests preserved at 26 (1 count + 23 in-scope per-event + 1 translation + 1 null-return) — assertions adapted to `.target` field reads, no scope change.

Sim test count unchanged: **466 active + 1 manually-gated** (`regenerate.test.ts`). On-hit-vampire-fang sim fixture is M1.2.3b-locked DO-NOT-REGENERATE; reused as-is.

### Architectural patterns codified through M1.4b2.1 (running list)

1–5 unchanged from M1.4b1 closing.
6. **(M1.4b2.1) Compute-via-production-helper-and-freeze fixture pattern.** When new VFX surface has no legacy-render oracle, fixture coords are computed via the production helper against a deterministic synthesized layout, then frozen. Independent-oracle discipline stays load-bearing via per-row helper tests with hand-coded coords. Pairs with Pattern #2.

### Predicate-vs-name catches (running tally — 6 → 7 over M1.4b2.1)

- Catches 1-6 unchanged from M1.4b1.
- **Catch 7 (M1.4b2.1 Phase 1):** `ANCHOR_RULE.damage='both'` table claim never validated against `playEventVisuals` damage-branch render — damage render today reads `.target` only, source-side render unconsumed. Caught when Phase 1 §1 surfaced the heal-decision rationale ("matches damage='both' pattern") could be misread as render-mirror; the table-vs-render gap is the same shape as catch 5 (design-vs-impl divergence) but on a different row. Sharpens CF 27. Render gap tracked under CF 29 (M1.4b2.2 portrait hit-flash); not addressed in .b2.1 per scope.

### Carry-forwards delta

**CLOSED:**
- **CF 26** (source-side test discipline on 'both' promotion) — closed by vampire-fang fixture's per-event source byte-equality assertions on heal events (7 events) + per-row resolution test in `anchorResolution.test.ts` asserting heal=`'both'` populates source from `itemAnchors`.
- **CF 28** (player-branch fixture coverage gap) — closed by vampire-fang fixture covering 7 heal events with `target='player'` + 5 damage events with `target='player'` + player-source items at p1/p2.

**OPENED:**
- **CF 29 (NEW M1.4b2.1) — Damage source-render gap.** `ANCHOR_RULE.damage='both'` but `playEventVisuals` damage branch consumes only the target anchor; source-side render unconsumed. M1.4b2.2 portrait hit-flash work consumes the source axis. Closes alongside that work. Catch 7 is the framing that surfaced this.

### Helper signature change — ratified in Phase 1, executed Phase 2

`resolveEventTargetAnchor(event, bagLayout, canvasBounds): CanvasAnchor | null`
→
`resolveEventAnchors(event, bagLayout, canvasBounds): ResolvedCanvasAnchors`

where `ResolvedCanvasAnchors = { source: CanvasAnchor | null; target: CanvasAnchor | null }`.

Two consumer sites in `CombatScene.ts` updated mechanically (damage, status_tick); third site (heal) is the new dual-axis consumer.

### Vampire-fang fixture — synthesized layout values

Frozen in `buildVampireFangLayout` at `eventAnchorResolver.test.ts`:
- `player.itemAnchors`: `p1 → (100, 200)`, `p2 → (200, 200)`
- `ghost.itemAnchors`: `g1 → (1080, 200)`
- `player.portraitAnchor`: `(canvasLeft + W * 0.25, canvasTop + H * 0.5)` = `(320, 360)` at canvas origin
- `ghost.portraitAnchor`: `(canvasLeft + W * 0.75, canvasTop + H * 0.5)` = `(960, 360)` at canvas origin

Round numbers chosen for deterministic test output + visual distinction; **NOT a mirror of `computeBagLayout`'s real output**. The fixture's value is regression detection on resolver/helper output drift, not on layout-computation parity.

### Verification — Turbo pipeline (all `--force`, no cache replay)

- `pnpm turbo test --force` → 10/10 successful, 0 cached, 30s.
- `pnpm turbo lint --force` → 7/7 successful, 0 cached, 7s. Schema-sync gate green.
- `pnpm turbo build --force` → 6/6 successful, 0 cached, 19s.
- **23 unique cache-bust tasks green.**

### Bundle envelope (vs M1.4a `148916e` baseline; M1.4b1 was visual-no-op)

- main: **243.36 KB raw / 75.97 KB gz** — unchanged.
- combat chunk: **1,508.12 KB raw / 349.41 KB gz** — +1.69 KB raw / +0.43 KB gz vs M1.4a. Source: dual-axis helper return type + heal source-flash render path + the new fixture import; combat-chunk-only.
- mobile chunk: **14.07 KB raw / 3.51 KB gz** — unchanged.
- 105 modules (M1.4a was 103; +2 from new fixture + interface declaration).

### Going-forward rules carried from M1.4b1+

All in effect:
- Closing-log metric framing anchors explicitly to milestone-total or vs-N-baseline.
- `--force` on verification runs.
- Phase 2.5 interlude precedent (no Phase 2.5 needed in .b2.1; surface clean).

### Locked answers cumulative through M1.4b2.1

1–29 unchanged from M1.4b1 closing.
30. **(M1.4b2.1) Compute-via-production-helper-and-freeze fixture pattern.** When new VFX surface has no legacy-render oracle to mirror, fixture coords are computed once via the production helper against a deterministic synthesized layout and frozen as regression-lock. Independent-oracle discipline lives in per-row helper tests with hand-coded coords; the fixture is the drift detector, not the design-truth oracle.

---

## 2026-05-06 — Heal anchor locked to 'both'

**Decision:** `ANCHOR_RULE.heal` moves from `'source'` (M1.4a-locked) to `'both'`. Heal events render a recipient-portrait floater + source-item flash, mirroring the damage=`'both'` convention.

**Rationale:**
1. Symmetry with damage=`'both'` — players already trained on the convention; heal doesn't introduce a separate pattern.
2. Pillar alignment — readable-in-one-screen + mastery-from-synergy both favor double-channel feedback over a single anchor.
3. Forcing-function for CF 26 — heal as the first `'both'` promotion lands source-side test discipline now, on a small well-understood asymmetry, rather than alongside three new event types when stun_consumed / buff_apply / buff_remove promote.

**Trade-off accepted:** ~1 day extra M1.4b2 surface vs single-anchor options; CF 26 and likely CF 28 activate in scope. Heal visual fingerprint risks reading as negative-damage; M1.4b2 design + playtest review responsible for confirming color/icon distinction holds.

**Activates in M1.4b2:**
- CF 26 (source-side test discipline becomes load-bearing for heal's `'both'` resolution).
- CF 28 (player-branch fixture coverage warranted once source/target asymmetry exists in the table) — likely.

**ANCHOR_RULE.heal table edit (deferred to M1.4b2 implementation):** `'source'` → `'both'`. Single-row update at `apps/client/src/combat/anchorResolution.ts`. Code edit not landed under this entry; this log entry locks the design intent. Implementation lands inside M1.4b2 alongside the heal-render refactor and the new source-side resolution test.

**Cross-reference:** § 4.5 R1 cross-axis test amendment (CF 27, deferred to M1.4b/M1.5 retro) — heal `'both'` promotion is the first concrete case the amendment will need to cover.

**M1.4b2 scoping unblocked.** Heal-anchor decision was the primary M1.4b2 gate; CF 28 (player-branch fixture coverage) remains as a secondary scoping question, now sharpened: with heal as a `'both'` promotion, source/target asymmetry will exist in the live ANCHOR_RULE for the first time, making a player-branch fixture more defensible than under any single-anchor heal option.

---

## 2026-05-06 — M1.4b1 closure (Phase 1 design + Phase 2 scaffold + Phase 2.5 flake hardening + Phase 3 refactor)

### Branch + commit topology

Branch: `m1.4b1-refactor-lift` (pre-merge, 4 sub-phases on top of M1.4a merge `148916e`).

| SHA       | Sub-phase | Scope |
|-----------|-----------|-------|
| (no commit) | Phase 1 | Read-only investigation + design proposal — scoping decisions ratified in chat |
| `a438b0a` | Phase 2   | `legacyAnchorFor` scaffold + `burn-application.json` frozen fixture + scaffold assertion test |
| `ac781c2` | Phase 2.5 | `RunScreen.test.tsx` `vi.mock` of lazy `MobileRunScreen` — closes Suspense + viewport-detect race surfaced at Phase 3 halt |
| `dc04b07` | Phase 3   | Production refactor: `eventAnchorResolver.ts` + test, `CombatScene.ts` damage/status_tick consume `resolveAnchor`, scaffolding deleted |

### Sub-phase ratifications

**Phase 1 (design, no commit) — locked:**
- Heal descoped from M1.4b1 (ANCHOR_RULE.heal='source' vs render-at-target divergence; deferred to M1.4b2 alongside heal-anchor decision).
- Fixture: `burn-application.json` (8 damage + 15 status_tick events; 23 in-scope anchors; mock canvas 1280×720 floats no-rounding).
- JSON shape: `{$comment, fixture, canvasWidth, canvasHeight, anchors: [{eventIndex, eventType, target}]}`. `source` field reserved for M1.4b2 (CF 26).
- Capture mechanism: `legacyAnchorFor` pure helper at `apps/client/src/combat/legacyAnchorDispatch.ts` (scaffolding-only, deleted Phase 3).
- Coord frame at fixture: canvas-local. Phase 3 translates screen-space → canvas-local at consumption.
- Verbatim-mirror discipline load-bearing (codified as architectural pattern below).

**Phase 2 (`a438b0a`) — outcomes:**
- Verbatim-mirror diff clean: helper byte-equivalent in spirit to `playEventVisuals` inline dispatch at `CombatScene.ts:336-353`.
- Sample fixture values verified at 1280×720: ghost target (960, 360), player target (320, 360).
- One-sided fixture: all 23 in-scope events target 'ghost'; player branch identical-by-construction. Byte-equality on ghost branch sufficient for Phase 3's visual-no-op assertion. Player-branch coverage gap noted (→ CF 28).
- `RunScreen.test.tsx` flake surfaced once on first parallel-mode run; Run 2 passed via turbo cache replay. This artifact later proved load-bearing (catch 6 + Phase 2.5).

**Phase 2.5 (`ac781c2`) — interlude:**
- Triggered by Phase 3 halt: `RunScreen.test.tsx` flake reproduction profile shifted from "occasional" (Phase 2: 1× across 2 runs) to deterministic (Phase 3 baseline: 4/4 consecutive parallel-mode failures, due to test-cache invalidation removing cache-replay opportunity).
- Original out-of-scope punt rationale deemed stale → escalated to in-scope (Phase 2.5 interlude precedent, codified below).
- Fix candidate 1 selected: `vi.mock` the lazy-loaded `MobileRunScreen` import at test-file scope. Resolves dynamic import synchronously; eliminates Suspense + viewport-detect race at structural level. Test target (RunScreen dispatcher logic) preserved; real-label coverage stays in `MobileTabBar.test.tsx`.
- Fix surface: 14 lines, single file. Rejection rationale captured for candidates 2-5.
- Verification: 5/5 cache-busted (`--force`) parallel-mode runs green; 0 cached, 25 total per run. Confirmed flake structurally closed, not symptom-masked.
- Phase 3 working-tree changes preserved sacrosanct throughout (explicit-paths staging discipline).

**Phase 3 (`dc04b07`) — refactor:**
- `playEventVisuals` damage + status_tick branches consume `resolveAnchor(ev, this.bagLayout)` + canvas-local translation via `this.scale.canvasBounds`.
- Heal branch byte-identical to pre-Phase-3 (deferred M1.4b2).
- Other branches (status_apply, combat_end, item_trigger) byte-identical to pre-Phase-3.
- New helper: `resolveEventTargetAnchor(event, bagLayout, canvasBounds): CanvasAnchor | null`. Signature deviations from prompt sketch ratified (see below).
- Scaffolding deleted: `legacyAnchorDispatch.ts` + `legacyAnchorDispatch.test.ts`.
- Visual-no-op verified: 26/26 focused (1 count-match + 23 per-event byte-equality + 1 translation-invariant + 1 null-target); 23 in-scope events resolve to fixture's frozen target coords ghost (960, 360), player (320, 360) at 1280×720.
- Post-commit 2/2 cache-busted runs green at new HEAD.

### Test count delta (vs Phase 2 baseline)

136 → 138 (+2 net). 24 scaffold tests deleted (`legacyAnchorDispatch.test.ts`); 26 production-helper tests added (`eventAnchorResolver.test.ts`). Framed explicitly "vs Phase 2 baseline" per going-forward closing-log metric rule.

### Helper signature — ratified deviations from prompt sketch

`resolveEventTargetAnchor(event: CombatEvent, bagLayout: BagLayout, canvasBounds: { left: number; top: number }): CanvasAnchor | null`

Three deviations, all ratified in chat at Phase 3 halt + committed in `dc04b07` body:

1. **Name** `resolveEventTargetAnchor` over `eventAnchorResolver` — descriptive (bridges `resolveAnchor`'s target output to canvas-local).
2. **Return** `CanvasAnchor | null` over forced non-null with target discriminator — null for non-target events; cleaner consumer-side guard pattern.
3. **Dropped `target: 'player' | 'ghost'`** field — no current consumer; M1.4b2 status_apply migration extends at point-of-need rather than speculative API surface now.

### Phaser canvas-bounds API access path locked

`this.scale.canvasBounds` (Phaser 3.90.0 `Phaser.Geom.Rectangle`, auto-updated on resize). Direct scene-level access; no additional plumbing required. M1.4a's 5-file `bagContainerRef` plumbing pattern stays scoped to BagLayout handshake — not extended.

### Architectural patterns codified through M1.4b1 (running list)

1. (M1.4a) Audit-gate spirit-vs-letter — const substitution allowed under "zero visual changes" if behavior is byte-identical.
2. (M1.4a) 10-row ANCHOR_RULE with per-row test discipline.
3. (M1.4a) 5-file plumbing pattern for sibling-DOM ref handoff.
4. (M1.4a) `PORTRAIT_*_RATIO` consts pattern.
5. **(M1.4b1 Phase 2) Verbatim-mirror discipline for legacy-extraction scaffolding.** When extracting a pure helper that mirrors existing inline logic for test purposes, the helper body must be byte-equivalent in spirit to the inline source (signature + call shape may differ; semantics + numeric output must not). Halt on quirks rather than silently fixing. Closing-pass diff between helper body and inline source is the load-bearing review item.

### Predicate-vs-name catches (running tally, 4 → 6 over M1.4b1)

- Catches 1-4 (M1.3.4 + M1.4a): all "internal artifact A doesn't match internal artifact B" within an implementation cycle.
- **Catch 5 (M1.4b1 Phase 1):** design-time predicate (ANCHOR_RULE.heal='source') was never validated against existing implementation (heal-at-target). Different shape — table internally consistent at M1.4a close; divergence only surfaced when consumption forced the comparison. Per-row table tests assert "table contains what we wrote" — they do NOT assert "implementation matches the table." Sharpens CF 27.
- **Catch 6 (M1.4b1 Phase 3 → Phase 2.5):** "pipeline green" predicate vs cache-replayed reality. Phase 2 effectively committed-through `RunScreen.test.tsx` flake via turbo cache replay; cache-replayed green satisfied surface predicate ("pipeline 25/25 green") but did not match canonical truth ("pipeline executed-and-green"). Phase 3 surfaced this at halt-gate when test-cache invalidation removed cache-replay opportunity. Closed structurally by Phase 2.5 + `--force` flag now load-bearing in verification runs.

### Going-forward rules (codified, applies M1.4b1+ closing logs)

- **Closing-log metric framing:** every metric line explicitly anchors to "milestone total" or "vs Phase N baseline" / "vs pre-commit halt" so the predicate matches the name.
- **`--force` on verification runs:** when verification is the load-bearing gate (post-flake-fix, post-refactor commits, pre-PR), use `--force` to ensure runs actually execute. Cache replay acceptable for routine work where prior-green is genuinely valid; not acceptable as proof-of-green for new work.
- **Phase 2.5 interlude precedent:** when an explicitly out-of-scope item shifts reproduction profile mid-milestone (e.g., flake → reliable failure), the original punt rationale is stale and the item escalates to in-scope. Smallest-fix interlude on the milestone branch is acceptable; sub-phase numbering accommodates (e.g., 2.5 between 2 and 3).

### CF 27 sharpening (deferred to M1.4b/M1.5 retro for full doc amendment)

Original framing: extend `tech-architecture.md` § 4.5 R1 for cross-axis case + design-vs-implementation cross-cutting test rule.

Sharpened framing as of M1.4b1: design-time invariants need cross-cutting tests against the implementation that's supposed to honor them, not just internal-consistency tests against the design itself. Per-row table tests assert "the table contains what we wrote" — they do NOT assert "the implementation matches the table." § 4.5 R1 amendment must explicitly call out the cross-axis design-vs-implementation case.

Deferral target unchanged. Carries to M1.4b retro or M1.5 retro.

### Open / pre-M1.4b2 gates

- **Heal-anchor decision** (target / source / both): blocks M1.4b2 scoping. Three framings, balance/UX call:
  - `'target'` (recipient): match existing render. Player feedback "you got +N HP". Loses item attribution.
  - `'source'` (item): M1.4a-locked. Player feedback "this item just healed". Loses portrait HP-change reinforcement.
  - `'both'`: floater at recipient + flash on source item. Richer feedback; matches damage='both' pattern.
- **Player-branch fixture coverage gap** (CF 28, new this milestone): 23 in-scope events all target 'ghost'. Player-branch logic identical-by-construction; coverage gap may warrant second fixture in M1.4b2 if CF 26's source-side discipline lands.

### Carry-forward status updates

- **CF 1** (item-anchored VFX foundation): foundational pieces in place via M1.4b1. Layer lands M1.4b2. *In flight, M1.4b2 next.*
- **CF 4** (item_trigger / recipe_combine event VFX): item_trigger queued M1.4b2; recipe_combine deferred until sim emits event. *Partial.*
- **CF 25** (status / buff event VFX): *Queued M1.4b2.*
- **CF 26** (source-side test discipline on 'both' promotion): *Queued M1.4b2.* May interact with second fixture for player-branch coverage.
- **CF 27** (§ 4.5 R1 amendment): *Deferred; framing sharpened by catches 5 + 6.*
- **CF 28 (NEW)** — player-branch fixture coverage: noted Phase 2 § 3, ratified Phase 3 close. *Open; M1.4b2 candidate.*
- **CLOSED:** pre-existing `RunScreen.test.tsx` flake. Was flagged for separate hardening pass; addressed structurally Phase 2.5 via `vi.mock`. *Status: CLOSED.*

### What's NOT in M1.4b1 (deferred / out of scope)

Heal-branch refactor (M1.4b2); new VFX types — portrait hit-flash, MEANINGFUL_EVENT_TYPES updates, item_trigger / status / buff event VFX (M1.4b2); recipe_combine VFX (deferred until sim emits); source-side 'both'-promotion test discipline (CF 26); § 4.5 R1 doc amendment (CF 27); player-branch fixture coverage (CF 28); M1.4b2 scoping (post heal-anchor decision); stale M1.1 / M1.2.x branch cleanup.

### Next moves (post-merge)

1. Closing-log commit (separate from refactor commits, halt-gate ratification before commit).
2. Push + browser PR + CI.
3. After CI green: `--no-ff` merge to main; delete `m1.4b1-refactor-lift` local + origin.
4. Heal-anchor decision (Trey's call: target / source / both).
5. M1.4b2 scoping (after heal-anchor decision is locked).

---

## 2026-05-05 — M1.4a: BagLayout handshake foundation closed

**Branch**: `m1.4a-baglayout` → main (pending --no-ff merge)
**Commit**: `f1a4f21` on `5cadc15` (M1.3.4 retro merge)
**Scope**: Foundation for item-anchored VFX. Zero visual changes; no VFX consumption (M1.4b's job).

### Delivered
- `BagLayout` type + `computeBagLayout` pure helper in the bag/layout module
- `ANCHOR_RULE` 10-row const map covering the full `CombatEvent` union: damage='both', heal='source', status_apply='target', status_tick='target', item_trigger='source', combat_end='portrait', combat_start='unanchored', stun_consumed='target', buff_apply='target', buff_remove='target'
- `resolveAnchor` pure helper with switch cases for all 9 non-unanchored event types; default branch is documented dead code (combat_start uses unanchored early-return)
- `PORTRAIT_X_RATIO_PLAYER` / `PORTRAIT_X_RATIO_GHOST` / `PORTRAIT_Y_RATIO` exported consts in CombatScene.ts; CombatOverlay measures canvas-container rect + applies ratios for screen-space portrait anchors
- `bagContainerRef` plumbed through 5 files (BagBoard → DesktopRunScreen / MobileRunScreen → LazyCombatOverlay → CombatOverlay), prop-drilling pattern matching existing `onCombatDone`

### Metrics
- Files: 11 changed, 696 insertions, 36 deletions; 2 new (`anchorResolution.ts` + `anchorResolution.test.ts`)
- Tests: workspace client 109 → 112 (+3)
- Combat chunk: 1,506.43 / 348.98 KB raw / gz (byte-identical to pre-commit halt)
- Mobile bundle: +0.05 KB raw / +0.02 KB gz (structural cost of bagContainerRef plumbing through MobileRunScreen.tsx; not a leak — see Ratification 3)
- Pipeline: 25/25 green at commit

### Ratifications (in-flight, all four resolved)

1. **Portrait DOM mismatch → Option (a)**. Post-M1.3.4b portraits are Phaser GameObjects; no DOM refs available. Resolution: 0.25 / 0.75 / 0.5 ratios promoted to `PORTRAIT_X_RATIO_PLAYER` / `PORTRAIT_X_RATIO_GHOST` / `PORTRAIT_Y_RATIO` consts in CombatScene.ts (alongside the `DEAD_TIME_THRESHOLD_TICKS` / `LEAD_IN_TICKS` pattern from M1.3.4b architectural rule 2). CombatOverlay measures canvas-container rect + applies ratios for screen-space portrait anchors. Const substitution at the original render lines is permitted under audit-gate spirit ("render output unchanged"); this is § 4.5 R2 single-source hygiene, not a violation.

2. **Bag DOM access → Option (i)**. BagBoard is sibling of CombatOverlay in the run-screen tree; no existing path. Resolution: bagContainerRef plumbed through 5 files. Pattern matches existing `onCombatDone` prop drilling. Considered-and-rejected: `document.querySelector` (fragile); RunContext-based publishing (rejected for explicit-data-flow readability).

3. **Mobile bundle envelope correction**. The original prompt's "zero delta" expectation was wrong because option (i) explicitly modifies MobileRunScreen.tsx. Observed +0.05 KB raw / +0.02 KB gz is the structural cost of the ratification, not a leak. `anchorResolution.ts` + BagLayout types confirmed combat-chunk-only via sourcemap audit ('unanchored' string-presence: 2 hits in `CombatOverlay-*.js`, 0 in main, 0 in mobile).

4. **§ 4.5 R1 trap caught at second ratification → Option B (close trap fully now)**. `ANCHOR_RULE.stun_consumed='target'` but `resolveAnchor`'s switch had no case for it — fell to default returning `{}`. Table named the intent; resolver returned wrong output. The "unanchored events return empty ResolvedAnchors" test asserted the defect with a name that no longer described what it tested. Resolution: switch cases for stun_consumed / buff_apply / buff_remove honor the table (lookup-then-fallback parallel to existing damage/heal/status_apply); "unanchored events" test reshaped to combat_start-only (renamed in place); 3 new resolution tests cover entity dispatch (stun_consumed), item direct-lookup (buff_apply), lookup-then-fallback end-to-end (buff_remove placement-absent).

### Architectural patterns codified (carry forward beyond M1.4a)

1. **Audit-gate spirit-vs-letter**. Const substitution at render-line literals is allowed under "zero visual changes" sub-phases when behavior is byte-identical. Spirit is "render output unchanged," not "source text unchanged." Pairs with § 4.5 R2 single-source hygiene.

2. **10-row ANCHOR_RULE with per-row test discipline**. Each event type's mode value gets its own test. Table changes surface as exactly one failing test per change. Direct § 4.5 R1 enforcement; predicate-vs-name traps die at the table edit.

3. **5-file plumbing pattern for sibling-DOM ref handoff**. When CombatOverlay needs DOM measurement of a sibling component, prop-drill the ref through the run-screen variant + lazy boundary. Idiomatic match to `onCombatDone`. Preferred over `document.querySelector` or RunContext-based publishing for explicit-data-flow readability.

4. **PORTRAIT_*_RATIO consts pattern**. When scene-internal positions need projection to screen-space, promote ratios to exported consts at the scene module. Prevents drift between scene-local rendering and screen-space anchor resolution. Pairs with § 4.5 R2.

### New carry-forwards

**CF 26** — Source-side test discipline on 'both' promotion. If M1.4b (or any future phase) promotes any of stun_consumed / buff_apply / buff_remove from 'target' to 'both' in ANCHOR_RULE, the matching source-side resolution test must land in the same change. The switch cases already handle 'both' via conditional mode checks, but no current test asserts source population for these three events. The same § 4.5 R1 trap could re-open on the source side if a table change isn't paired with a source-side test. Predicate-vs-name discipline applies symmetrically across mode dimensions.

**CF 27** — Extend `tech-architecture.md` § 4.5 R1 framing for cross-axis case. The two M1.4a R1 catches plus the M1.3.4 catches surface a previously-unnamed trap shape: **axis A is tested but axis B isn't, and axis B is one table-edit away from being live**. CF 26 is an instance of this shape. Defer the doc amendment to M1.4b or M1.5 retrospective rather than inline this milestone — pattern is well-evidenced from M1.3.4 / M1.4a but adding more cases from M1.4b will sharpen the rule's wording.

### Pattern signal

Four predicate-vs-name traps caught across M1.3.4 + M1.4a (M1.3.4: table-vs-skip-set, predicate-vs-net-state-delta; M1.4a: table-vs-resolver, test-name-vs-assertion). § 4.5 R3's closing-pass review discipline is load-bearing, not ceremonial. M1.5 relic state will multiply surfaces of this shape; the discipline must scale.

### Out of scope (explicitly NOT in M1.4a)
- VFX consumption layer (M1.4b)
- item_trigger / stun_consumed / buff_apply / buff_remove VFX wiring (M1.4b)
- Portrait hit-flash on portrait-target damage (M1.4b)
- Low-HP portrait tint (deferred to M2 portrait art pass)
- recipe_combine event VFX (deferred entirely — sim doesn't emit the event yet; revisit when it does)
- MEANINGFUL_EVENT_TYPES updates (M1.4b lockstep with VFX wiring)
- ANCHOR_RULE behavior changes (unchanged from first ratification)

### Trap status at close
- Predicate-vs-name (§ 4.5 R1) trap **closed** for stun_consumed / buff_apply / buff_remove
- Table ↔ resolver ↔ test names aligned across all 10 ANCHOR_RULE rows
- M1.4b's prompt only needs to add VFX consumption — anchor resolution already wired

---

## 2026-05-05 — M1.3.4 retrospective: predicate hygiene and authority-layer rules

Both Codex P1 catches in M1.3.4 (a-c8 reroll-cost UI authority; b-c7 zero-content event predicate) shared shape: a predicate or computation that looked correct but encoded the wrong invariant. Three principles ratified going forward, load-bearing for M1.5 relic state and any future ruleset-modifying systems:

1. Predicates encode the invariant they name, not a proxy that usually correlates. Verify every event a predicate excludes is genuinely irrelevant to the named intent, not merely zero in the proxy dimension.
2. Consumers do not reimplement sim-side arithmetic. Sim-computed values are read from sim-exported helpers or reducer-derived state, never recomputed consumer-side. Awkward export = sim API gap, not a license to recompute.
3. Closing-pass review explicitly sweeps predicate-vs-name correspondence and authority-layer correctness, especially on cleanup-pass commits where polish-looking code can hide invariant errors.

Codified as `tech-architecture.md § 4.5 — Authority and predicate hygiene`. Enforcement: prompt-time review (master-developer chat) flags predicate/authority surfaces during scoping; Claude Code halts-when-premise-doesn't-match on detected violations; closing-pass review treats violations as halt-gate findings fixed inline.

---

## 2026-05-04 — M1.3.4b closed (Phaser combat scene + silent-playback fix; second half of the M1.3.4 inflection split)

- **The render-layer swap lands; M1.3.4 closes.** The DOM Portrait + HP-bar tree dissolved out of `combat/CombatOverlay.tsx`; a Phaser scene (`combat/CombatScene.ts`) now owns combat playback against the already-sim-wired bag from M1.3.4a. No new sim integration. No new state surface. The combat chunk grows to absorb Phaser's runtime; main + mobile chunks essentially unchanged. One design-side fix added under halt-gate (silent-playback option 1 + option 2 combined). Trey-confirmed via screenshot review (mount, mid-tick damage burst, combat-end frame, RoundResolution handoff) plus a manual Chrome DevTools mid-tier mobile profile.

- **Phaser scene ratifications** (per `tech-architecture.md` § 2 + `visual-direction.md` § 7):
  1. **One scene only** (`CombatScene`, scene key `'CombatScene'`). Absolute-position canvas overlay parented into the React-owned `<div>`; transparent canvas; bag stays visible behind per `visual-direction.md` § 1 (60%-of-smaller-dim floor). Asset preload runs in `preload()` and only fires after the combat chunk lazy-loads — title-screen / pre-combat parse cost: zero Phaser, zero textures.
  2. **Floater typography:** `Phaser.GameObjects.Text` with `fontFamily: 'Inter, sans-serif'`, `fontFeatureSettings: 'tnum'`, `resolution: 2`, drop-shadow for legibility against the bag. Glyph cache covers repeat damage values without a bitmap atlas; no BitmapText pipeline (deferred — not justified at graybox scale; see carry-forward 7).
  3. **Easing:** stock `Phaser.Math.Easing.Quartic.Out` is the documented placeholder for the locked `cubic-bezier(0.16, 1, 0.3, 1)` from `visual-direction.md` § 7. Visually indistinguishable at the durations used (80ms HP-bar tween, 600ms floater rise, 280ms portrait pulse). Byte-exact bezier match deferred to M2 if a designer flags inconsistency (carry-forward 6).
  4. **SKIP button:** DOM-owned by React (lives in `CombatOverlay.tsx`'s harness, overlaid above the canvas). Keeps keyboard focus + screen-reader semantics intact; calls into `CombatScene.skipToEnd()` which drains all remaining events without playing visuals, snaps HP/state to final, and advances to `RoundResolution`.
  5. **Geometric particles only** (squares, lines, plus signs) drawn via `Graphics → generateTexture` once at preload, in palette colors (`PALETTE.lifeRed` / `PALETTE.rarityUncommon` / `PALETTE.rarityLegendary`). No organic VFX, no sprite atlases.
  6. **HP arithmetic stays sim-authoritative.** The scene reads `remainingHp` / `newHp` directly from each event's payload — never computes locally. Extends the M1.3.4a step-8 ratification ("UI affordability never reimplements game-rule arithmetic") to render-layer HP as well: the rule is now **UI consumes sim-authoritative HP**.

- **Halt-gate journey (full narrative).** Step 4's first-pass test scenario — a round-1 combat against an empty-bag player — appeared to FREEZE the scene for 60 seconds. A diagnostic instrumentation pass (5 log points across `CombatOverlay.tsx` + `CombatScene.ts`: phase transitions, scene-init events, tick-clock state, event flushes, accumulator math) returned conclusive evidence: the Phaser game loop was healthy, the accumulator math was correct, the tick rate was exactly 10/sec, and events were flushing on schedule. The "freeze" was **60 seconds of valid sparse playback** — the round-1 ghost (deterministic from `combat/ghost.ts`) had rolled a passive item (Apple, Healing Herb, Wooden Shield, or Copper Coin) producing 9 events that never moved HP. The combat ran to completion correctly; it just had no visible action. **Design gap, not bug.** The diagnostic logs were stripped as part of the halt-gate-fix commit.

- **Combined silent-playback fix (option 3 = option 1 + option 2).**
  - **Option 1 — silent fast-forward** in `CombatScene.update()`: when `nextEventTick - currentTick > DEAD_TIME_THRESHOLD_TICKS`, snap `currentTick = nextEventTick - LEAD_IN_TICKS`. Constants live at the top of `CombatScene.ts` with `// tunable per telemetry` comments:
    - `DEAD_TIME_THRESHOLD_TICKS = 8` (800ms at 100ms/tick — long enough that visual pause feels intentional, short enough that 60s-tick-cap combats compress to a watchable handful of seconds).
    - `LEAD_IN_TICKS = 2` (200ms preserved before next event so HP-bar tweens + portrait pulses get visible windup).
    - Tunable via `telemetry-plan.md` § 4 if tick-cap-draw rate or sparse-combat playback time surfaces a need.
  - **Option 2 — zero-content fast-skip** in `combat/CombatOverlay.tsx`: when the pre-mounted `CombatResult` has `damageDealt === 0 && damageTaken === 0 && result.outcome === 'draw'`, dispatch `combat_done` directly without ever mounting Phaser. Telemetry call sites (`combat_start`, `combat_end`) still fire on this path so the playback log stays consistent.
  - **Generation-side fix (filter `combat/ghost.ts` round-1 draws to active-effect items) explicitly NOT taken** — folds into M2's wholesale ghost storage rework where the procedural template gets replaced by per-(round, trophy_band) `GhostBuild` records (see carry-forward 13).

- **Test coverage ratifications.**
  - **Test extraction — option A (pure helper).** Tick-advance + auto-end logic extracted into `apps/client/src/combat/tickAdvancer.ts` (pure functions: `advanceCombatTickClock`, `findNextEventTick`; no Phaser dependency). `CombatScene.update()` calls into the helper. Mirrors `packages/sim`'s pure-function pattern. Tests target the helper directly under happy-dom; Phaser scene-level state (e.g., resolved-flag SKIP behavior) is covered transitively rather than directly. **Documented coverage gap:** scene-level SKIP unit-test absent — revisit if SKIP regresses; manual screenshot verification across two halt-gate passes confirms current SKIP behavior. The pure-helper-first pattern becomes a project rule (see architectural rules below).
  - **+13 client tests / +2 client files:** `combat/tickAdvancer.test.ts` (NEW, +12: auto-end exactly-once, fast-forward compression of the failed halt-gate's exact 600-tick fixture, `findNextEventTick` boundary cases), `combat/CombatOverlay.test.tsx` (NEW, +1: zero-content bypass — asserts no canvas testid, `createCombatGame` mock never invoked, DEFEAT/DEALT/TAKEN copy renders, `combat_done` dispatched with zero-content payload).

- **Halt-gate audit pack (post-fix).**
  - **Vitest:** 4 named cases all green (auto onCombatEnd, fast-forward compression vs the exact 600-tick fixture from the failed pass, zero-content bypass, exactly-once auto-fire). SKIP transitively covered via the helper's `reachedEnd` signal.
  - **Bundle audit:** main delta = 0 KB raw vs M1.3.4b post-fix baseline; combat chunk +0.75 KB raw / +0.30 KB gz on rebuild (likely Vite chunk-graph non-determinism on the Phaser bytecode — tracked, not blocking; if drift exceeds ~5 KB across multiple builds it becomes a real signal — carry-forward 12).
  - **Sourcemap audit:** `phaser` exclusively in `CombatOverlay-*.js` (1 source); main + mobile chunks 0 phaser sources. Combat-only sim subgraph (`combat.ts` / `status.ts` / `triggers.ts` / `iteration.ts`) still combat-chunk-only; main's sim imports remain `rng.ts` / `math.ts` / `run/shop.ts`. M1.3.4a's lazy-boundary integrity holds.
  - **60fps p95 manual profile** (Trey, Chrome DevTools, CPU 4× slowdown, iPhone 12 Pro emulation): scene held 60fps; a 12-16s busy region in the trace resolved to DevTools profiling overhead (728ms of 735ms = 99.1%), not real scene work.

- **Bundle delta (vs M1.3.4a close: main 243.10 KB raw / 75.86 KB gz; combat 22.19 KB raw / 7.50 KB gz; mobile 13.92 KB raw / 3.47 KB gz).**
  - **Main chunk:** 242.88 KB raw / 75.80 KB gz — Δ −0.22 KB raw (−0.09%) / −0.06 KB gz (−0.08%). DOM Portrait + HP-bar tree deletion offset the option-2 fast-skip wiring + DragOverlay rotation transform additions; net slightly lighter.
  - **Combat chunk:** 1,505.59 KB raw / 348.69 KB gz — Δ **+1,483.40 KB raw / +341.19 KB gz** (Phaser 3.90.0 cost predicted by `tech-architecture.md` § 10; chunk fetched on-demand at the Continue button press, so first-load for desktop pre-combat users is unaffected).
  - **Mobile chunk:** 14.02 KB raw / 3.49 KB gz — Δ +0.10 KB raw / +0.02 KB gz (DragOverlay rotation transform style additions in `MobileRunScreen.tsx`).
  - Modules: 99 → 103 (+4: CombatScene, tickAdvancer, tickAdvancer.test, CombatOverlay.test).

- **Test counts (with sim baseline correction — option B).**
  - **Workspace post-M1.3.4b: 107 across 20 files** (80 client / 17 files + 27 ui-kit / 3 files). Δ from M1.3.4a: +13 client tests / +2 client files. ui-kit unchanged.
  - **Sim: 466 active + 1 skipped (intentional) / 13 active files + 1 conditional.** The skipped test is the M1.2.5-step-4 fixture-regeneration entry point gated by `describe.runIf(npm_lifecycle_event === 'generate-fixtures')`; it has been part of the suite since 2026-04-30 and was implicit in the M1.3.4a "sim unchanged" shorthand. M1.3.4b introduced no sim-side test changes — the corrected baseline language is the only delta against M1.3.4a's report.
  - **Content: 30 active / 1 file. Unchanged.**
  - **Turbo pipeline: 25/25 tasks green.**

- **Files added** (`apps/client/src/`):
  - `combat/CombatScene.ts` (Phaser scene + `createCombatGame` factory)
  - `combat/tickAdvancer.ts` (pure helper — `advanceCombatTickClock`, `findNextEventTick`)
  - `combat/tickAdvancer.test.ts`
  - `combat/CombatOverlay.test.tsx`

- **Files deleted:** none at the file level. The M1.3.4a inline DOM Portrait + HP-bar function (`function Portrait` at the bottom of `CombatOverlay.tsx`) was removed during the CombatOverlay rewrite — the 3 character-art hex carry-forward sites lived inside that inline function and dissolve with it.

- **Files modified non-trivially:**
  - `apps/client/src/combat/CombatOverlay.tsx` — Phaser mount + lifecycle (mount on phase entry, `game.destroy(true)` on unmount, SKIP button wiring); option-2 zero-content fast-skip (`isZeroContent` check before `useState(phase)` initialization); DOM Portrait + HP-bar tree deleted.
  - `apps/client/src/screens/DesktopRunScreen.tsx` + `apps/client/src/screens/mobile/MobileRunScreen.tsx` — DragOverlay rotation polish (single-transform silhouette using un-rotated `def.w / def.h` + `transform: rotate(rot deg)` on the outer wrapper, see carry-forward closure 23a below).
  - `apps/client/package.json` — added `"phaser": "^3.80.0"` (resolves to 3.90.0 in `pnpm-lock.yaml`).
  - `pnpm-lock.yaml` — Phaser dependency tree.

- **Architectural rules introduced (project-wide carry-forward).**
  1. **UI consumes sim-authoritative HP.** Render layers — DOM or Phaser — never compute HP locally. Always read `remainingHp` / `newHp` from sim's events. Extends the M1.3.4a step-8 rule ("UI affordability never reimplements game-rule arithmetic") to render-layer HP.
  2. **Fast-forward thresholds are tunable consts, not magic numbers.** Any future scene-timing decisions (combat speed, post-event lead-in, etc.) live as named consts at the top of the consuming file with `// tunable per telemetry` comments. `DEAD_TIME_THRESHOLD_TICKS` + `LEAD_IN_TICKS` set the precedent.
  3. **Pure-helper-first for scene logic.** When scene logic is testable as pure math (tick clocks, event scheduling, etc.), extract to a helper. Scene-mock-based tests are a fallback, not a first choice. `tickAdvancer.ts` is the precedent.

### Carry-forwards

  1. **Item-anchored VFX + `BagLayout` handshake** → M1.4 (when `simulateCombat()` replaces canned combat per the M0 roadmap; `tech-architecture.md` § 2 named the handshake but it stays non-load-bearing through M1.3.4b).
  2. **Real character art in portraits** → M2 (placeholder geometric silhouettes carry through M1).
  3. **Real particle sprite sheets** → post-M1 (programmatic textures sufficient for graybox).
  4. **`item_trigger` / `recipe_combine` event VFX** → M1.4 (require item anchoring).
  5. **Music + SFX integration** → post-M2 per `visual-direction.md` § 8 anchor-only language.
  6. **Custom cubic-bezier easing function** → M2 if a designer flags `Quartic.Out` as off.
  7. **BitmapText / pre-rasterized font atlas** → post-M1 if floater spawn rate at high rounds saturates Phaser's glyph cache.
  8. **`>>` fast-forward indicator visual styling** → M2 polish (function works without it; styling is non-load-bearing).
  9. **Telemetry event for "fast-forward triggered"** → if `telemetry-plan.md` § 4 tick-cap draw rate dashboard surfaces a need.
  10. **Configurable per-user playback speed (1× / 2× / 4× toggle)** → M2+.
  11. **SKIP scene-level direct unit test coverage** → revisit if SKIP behavior regresses; helper-level + manual verification sufficient for graybox.
  12. **Combat chunk Vite build non-determinism** (~0.75 KB raw drift between rebuilds of identical tree) → tracked; flag if drift exceeds ~5 KB across multiple builds.
  13. **Generation-side ghost-loadout filter (option 5)** → M2 ghost storage rework wholesale.
  14. **Codex P1 regression test for UI-vs-reducer affordability under non-default rulesets** → M1.5 (carries from M1.3.4a; relic state machinery makes this load-bearing).
  15. **`opponentClassId` field on `RunHistoryEntry`** → M1.5 (carries from M1.3.4a).
  16. **Server-side ghost record (per-(round, trophy_band) `GhostBuild`)** → M2 (carries from M1.3.4a).
  17. **Auto-rearrange hint affordance over AVAILABLE WITH CURRENT ITEMS** → M3 hint-system work (carries from M1.3.4a).
  18. **Per-round trophy schedule + contract modifiers + win-streak multipliers** → M2 (carries from M1.3.4a).
  19. **`RarityGem` for shop rarity dot** → carries from M1.3.2.
  20. **`apps/client/src/index.css` `.glow-*` rgba palette derivatives** → carries from M1.3.2 / M1.3.3.
  21. **Run-end detection (hearts === 0 → eliminated screen)** → M1.5.
  22. **State-driven bag dimensions through pure helpers** → M2.
  23. **Real-device drag-state screenshot capture** → still carried (M1.3.4b's DragOverlay rotation polish landed code-only; visual capture deferred to next sub-phase or whenever real-device session organically surfaces).
  24. **Player portrait dying-state visual feedback** — M1.3.4b's probe confirmed there is **no** progressive HP-curve tint and **no** binary "took damage" flag on the portrait body; the only red signals are the (always-red) HP bar and the one-shot KO flash on `combat_end`. Filed as **acknowledged absence** for M1.4+ design polish (e.g., low-HP threshold tint, hit-flash pulse) if a graybox reviewer requests it. Not load-bearing for M1 graybox.

### Branch hygiene

2 implementation commits (`439ff73`, `8146692`) + 1 DragOverlay polish commit + 1 closing-log commit on `m1.3.4b-phaser-scene`, branched off main (`a2a31f2`). `--no-ff` merge to main once Trey confirms CI green on origin.

### Next

**M1.3.5+** — Trey scopes the next sub-phase split. The M0 milestone roadmap puts the remaining M1 work as:
- **M1.4** — finalize whatever wiring remains around `simulateCombat()` invocation (M1.3.4a's `combat/sim-bridge.combat.ts` already drives playback; M1.4 is mostly item-anchored VFX + the `BagLayout` handshake from carry-forward 1).
- **M1.5** — relic state machinery, class-select screen, run-end detection (hearts === 0 → eliminated), LocalSaveV1 persistence, the M1.3.4a Codex P1 non-default-ruleset regression test.
- **M1.6+** — boss round + content fill to 45 items / 12 recipes / 3 status / 1 boss.

### Codex P1 catch + zero-content predicate fix (commit 5)

- **Codex Review on PR #7 caught a P1 on the closing-pass tree:** the option-2 zero-content fast-skip predicate `damageDealt === 0 && damageTaken === 0 && outcome === 'draw'` matched not just the canonical empty-event stalemate (the M1.3.4b step-4 halt-gate fixture: round-1 empty bag + passive ghost item) but also any **active** combat that netted to zero HP delta on both sides — damage exactly offset by healing across the combat, mutual-burn stalemates, shield-wall stalemates. Those would have skipped Phaser playback entirely despite having real events the player needed to see.

- **Fix:** replaced the net-HP-delta check with an event-content-based predicate. New module-scope const `MEANINGFUL_EVENT_TYPES: ReadonlySet<CombatEvent['type']>` = `{ damage, heal, status_apply, status_tick, item_trigger }`; `hasNoMeaningfulEvents = !result.events.some(e => MEANINGFUL_EVENT_TYPES.has(e.type))`; `isZeroContent = result !== null && hasNoMeaningfulEvents && result.outcome === 'draw'`. The `outcome === 'draw'` guard stays — a non-draw with no meaningful events would be a sim bug worth surfacing rather than silently bypassing. `CombatOverlay.test.tsx` gains a regression case (Case B) for the offset-heal scenario alongside the preserved canonical-bypass case (Case A).

- **Set composition deviations from the original prompt** (documented inline at the const + recorded here for posterity):
  - **`recipe_combine` is intentionally absent** — it is not a member of the `CombatEvent` union (only listed in `combat/CombatScene.ts:337` as a future event type). Including it as a string literal would fail typecheck against `Set<CombatEvent['type']>`. The original prompt's set proposal included it; the fix had to drop it. If `recipe_combine` is added to the `CombatEvent` union in M2's content sweep, add it here too.
  - **`stun_consumed` / `buff_apply` / `buff_remove` are intentionally absent** — the scene currently renders no VFX for them (`combat/CombatScene.ts:337-339`), so mounting Phaser to play one of those alone would re-introduce a "scene appears frozen" version of the original M1.3.4b halt-gate. Add them here once their VFX lands (M1.4+ alongside the item-anchored VFX work from carry-forward 1).

- **Architectural rule reinforced + documented inline at the const block:** _UI fast-skip predicates check event CONTENT, not net-state deltas._ State deltas are derived; events are authoritative. Future skip / fast-forward decisions inherit this rule. Adds to the M1.3.4b architectural-rules set as rule **4**.

- **Updated stats:** workspace test count **108 across 20 files** (was 107/20 — +1 from the Case B regression test). Sim 466 active + 1 skipped intentional / 13 + 1 unchanged. Content 30 / 1 unchanged. Turbo pipeline 25/25 green. Bundle delta vs the M1.3.4b closing-log baseline at commit `04a335d`:
  - **main:** 242.88 / 75.81 KB gz — Δ 0 raw / +0.01 KB gz (chunk-graph noise per carry-forward 12; predicate logic lives in the combat chunk, not main).
  - **combat:** 1505.59 → 1505.70 KB raw (+0.11 KB) / 348.69 → 348.74 KB gz (+0.05 KB) — Set + comment block + predicate land in the combat chunk per the lazy-boundary discipline.
  - **mobile:** 14.02 / 3.49 KB gz — unchanged.

- **Sourcemap audit re-confirms post-hotfix chunk integrity unchanged.** No new sim modules cross the lazy boundary. `phaser` still combat-chunk-exclusive (1 source in `CombatOverlay-*.js`, 0 in main, 0 in `MobileRunScreen-*.js`); combat-only sim subgraph (`combat.ts` / `status.ts` / `triggers.ts` / `iteration.ts`) still combat-chunk-only; main's sim imports remain `rng.ts` / `math.ts` / `run/shop.ts`.

- **Updated branch hygiene:** 2 implementation commits (`439ff73`, `8146692`) + 1 DragOverlay polish commit (`9b88ab8`) + 1 closing-log commit (`04a335d`) + 1 P1 hotfix commit + 1 closing-log amendment commit on `m1.3.4b-phaser-scene`. Branch force-pushed (`--force-with-lease`) to origin after the hotfix lands so PR #7 re-runs CI against the corrected tree. `--no-ff` merge to main once Trey confirms CI re-run is green on origin.

---

## 2026-05-02 — M1.3.4a closed (sim wire-up + data.local dissolution; first half of the M1.3.4 inflection split)

- **The inflection point lands.** `data.local.ts` is gone; `packages/sim` integrates into the client through two lazy-boundary-aware bridge modules; the canned 4-second combat SCRIPT is replaced by deterministic playback of real `CombatResult` events; the mobile [Crafting] tab gains its scouted-recipes section. The game stops being a UI demo and starts being a deterministic real game. Trey-confirmed via screenshot review in chat (3 screenshots + re-screenshot pass after blocker fixes).

- **Phasing — M1.3.4a vs M1.3.4b.** The original M1.3.4 scope (sim integration + Phaser combat overlay) was **ratified split into halves in chat before the M1.3.4a prompt was issued.** M1.3.4a (this close) lands sim integration + dissolution + DOM combat playback, letting the sim path stand alone and ratify cleanly. M1.3.4b (next) replaces the DOM portraits / HP-bars with the Phaser combat scene against the already-sim-wired bag — purely a render-layer swap, no new state surfaces.

- **Sim integration ratifications:**
  1. **Single integration surface, split by lazy-boundary.** All client → `@packbreaker/sim` calls flow through one of two bridge modules: `apps/client/src/run/sim-bridge.ts` (shop + run-RNG, main-chunk consumers) and `apps/client/src/combat/sim-bridge.combat.ts` (combat resolver, combat-chunk consumer). Neither bridge imports the other; the split exists to keep `simulateCombat`'s static-import edge inside the lazy boundary. Direct sim imports from feature code are forbidden (one place per chunk to install adapters at the boundary).
  2. **`ItemId` broadens from the M0 narrow 12-slug union to the canonical content brand** (`Brand<string, 'ItemId'>` — re-exported from `@packbreaker/content` via `apps/client/src/run/types.ts`). Sim-generated shop slots can now be any of the 45 canonical items; the iconned-coherence constraint is preserved by filtering the **shop pool** at the bridge (`SHOP_POOL_ITEMS` = 12 iconned slugs), not the type. Drop the filter when icon-art expansion lands the full 45-item set (post-M1.3.4b per `visual-direction.md` § 14).
  3. **Reroll determinism.** `ShopController.generateShop` derives a per-(round, rerollCount) seed via `shopSeedFor(baseSeed, round, rerollCount)` with stride `SHOP_REROLL_STRIDE = 65521` (largest 16-bit prime). Reroll-counter sequences across adjacent rounds stay disjoint up to ~65k rerolls per round. Reroll cost flows through sim's `computeRerollCost(rerollsThisRound, rerollCostStart, rerollCostIncrement, extraRerollsPerRound)`; `extraRerollsPerRound` is hardcoded 0 until relic state machinery lands in M1.5.
  4. **Run-state factory pattern.** `INITIAL_CLIENT_STATE` was a static const in M0; M1.3.4a introduces `createInitialState()` because round-1 shop is sim-generated against a fresh wall-clock `SimSeed`. The companion module-const calls the factory once at import time so tests still observe a stable round-1 state without each test re-running the factory.
  5. **+18 trophy on win is an M0-placeholder value carried into M1.3.4a unchanged.** The real per-round trophy schedule (loss penalties, contract modifiers, win-streak multipliers) lands with M2 trophy-curve work. Until then, win → +18 / loss → +0 keeps the HUD's trophy counter incrementing predictably for screenshot review.

- **Data.local.ts dissolution — 5 distributed concerns:**
  - **Types** → `apps/client/src/run/types.ts` (`BagItem`, `ShopSlot`, `ItemDef`, `Recipe`, `RecipeMatch`, `RunState`; re-exports canonical `ItemId`).
  - **ITEMS / RECIPES adapter** → `apps/client/src/run/content.ts` (45 canonical items adapted to `ItemDef`; recipes filtered to the 4 whose I/O is fully iconned; `SHOP_POOL_ITEMS` = 12 iconned slugs for the sim shop pool).
  - **Layout helpers** (`cellsOf`, `dimsOf`) → `apps/client/src/bag/layout.ts`. `BAG_COLS` / `BAG_ROWS` derived from `DEFAULT_RULESET.bagDimensions` (state-driven dims through pure helpers is M2 work when contract mutators rewrite bag size).
  - **Initial-state seed** → `RunController.createInitialState()` (round 1 fresh start: empty bag, sim-generated shop, gold = ruleset.baseGoldPerRound = 4, hearts = 3, history = []).
  - **`RecipeMatch` type** → `run/types.ts` (moved from `run/recipes.ts` to break the `bag/layout` ⇄ `run/recipes` import cycle that arose when `cellsOf` moved).
  - `data.local.ts` + `data.local.test.ts` deleted; zero `data.local` imports remain.
  - **Intended player-facing divergence:** the prototype's `SEED_BAG` pre-placed mock items at "round 4" so the demo opened mid-run with a populated bag for visual review. Post-M1.3.4a runs start at round 1 with an empty bag (reflecting real game state — the player buys their first items from the round-1 shop). This is not a regression; it's the dissolution of a graybox crutch. The demo experience now matches the actual M1 game flow.

- **Lazy-load combat module per `tech-architecture.md` § 10.** Following the M1.3.3 mobile-chunk precedent, `combat/CombatOverlay.tsx` loads on first combat via `combat/LazyCombatOverlay.tsx` (`React.lazy` + `<Suspense fallback>` at the orchestrator level). The reducer doesn't import `combat/ghost.ts` (which would cross the lazy boundary) — `CombatOverlay` pre-computes `damageDealt` / `damageTaken` / `opponentGhostId` against `initialPlayerHp` / `initialGhostHp` − `result.finalHp`, then forwards a `CombatDonePayload` to `combat_done`.
  - **Lazy-boundary integrity:** Vite sourcemap audit confirms the combat-only sim subgraph (`combat.ts`, `status.ts`, `triggers.ts`) ships exclusively in the combat chunk. Main chunk's sim imports are limited to shop-side modules (`rng.ts`, `iteration.ts`, `math.ts`, `run/shop.ts`). Title-screen and pre-combat users do not parse combat code. Achieved via `sim-bridge.ts` (shop-side) + `sim-bridge.combat.ts` (combat-side) split — the static-import edge from `simulateCombat` originates only in modules the combat chunk consumes.

- **Combat playback (DOM, transitional).** `CombatOverlay` schedules at `TICKS_PER_SECOND = 10` (100ms / tick). For each tick step, damage / heal / status_tick / combat_end events at that tick materialize as floaters; HP bars derive from each event's `remainingHp` / `newHp` (sim's authoritative value) so displayed HP at `currentTick > endedAtTick` equals `result.finalHp` exactly. SKIP button (bottom-right of stage) snaps `currentTick` past `endedAtTick + 2` and advances directly to `<RoundResolution>`. Phaser combat scene replaces the DOM portraits + HP-bar layout in M1.3.4b.

- **Procedural ghost template (`combat/ghost.ts`).** Pure function; inputs `(baseSeed, round, bagDimensions)` → `GhostTemplate`. Class alternates by round parity (odd → marauder, even → tinker — deliberate affinity-mix so combat dynamics differ round-to-round). Item count scales 1 → 5 with round per `ITEM_COUNT_BY_ROUND`. Rarity-gate follows `RARITY_GATE_BY_ROUND`. Items drawn from `SHOP_POOL_ITEMS` so the build stays in the iconned subset. HP scales gently: `BASE_COMBATANT_HP + ⌊(round-1)/2⌋ × 2`. Reuses `shopSeedFor` with a sentinel reroll-offset `7 × 65521` so ghost seeds never collide with shop seeds at the same round. **Not** a port of `packages/sim/test/determinism/ghost-generator.ts` (test scaffolding, ratified do-not-import in production); fresh + simpler builder, intentionally narrow design surface, easy to delete when M2 ghost storage replaces it.

- **Round resolution + history flow.** `combat_done` action carries `result: CombatResult`, `opponentGhostId`, `damageDealt`, `damageTaken`. Reducer applies:
  - **Win:** +`ruleset.winBonusGold`, +18 trophy (M0-placeholder, see ratification 5), hearts unchanged.
  - **Loss:** +0 gold, +0 trophy, hearts −= 1 (clamped to 0).
  - **Draw:** treated as loss for hearts.
  - **Always:** append a canonical `RunHistoryEntry { round, outcome, damageDealt, damageTaken, goldEarnedThisRound, opponentGhostId }` to `runState.history`.
  - Run-end detection (hearts === 0 → eliminated screen) deferred to M1.5.

  `RoundResolution.tsx` consumes the new props (round, outcome, damageDealt, damageTaken, goldEarned, trophyEarned, hearts, maxHearts) — VICTORY / DEFEAT header, real +gold / +trophy values, real hearts/maxHearts, DEALT / TAKEN line. Loss path uses `--life-stroke` for the header colour to telegraph the heart cost. `LogTab` reads `runState.history` directly (mock removed). Desktop `BottomPanel` reads the most recent history entry (or `"0 ROUNDS · awaiting first combat"` empty state).

- **`scoutRecipes` + `[Crafting]` two-section ratification (closes M1.3.3 carry-forward 1 — option-A active recipes mirror was the M1.3.3 close; the §7.2 second section deferred to M1.3.4a).** `apps/client/src/run/recipes.ts` exports `scoutRecipes(bag) → Recipe[]` — multiset match over `bag.itemId`, no adjacency requirement. The mobile `[Crafting]` tab now renders two sections:
  - **READY TO CRAFT** — recipes whose inputs are 4-edge-adjacent (output of `detectRecipes`); each row is a tappable COMBINE target. Empty-state copy unchanged: "Place items adjacent to see combinations."
  - **AVAILABLE WITH CURRENT ITEMS** — recipes whose inputs are present but not yet adjacent (output of `scoutRecipes` minus the ready set so sections stay disjoint). Read-only preview with REARRANGE pill. Empty-state copy: "No recipes possible with current items." Section is **always rendered** even when empty (Trey screenshot review — hiding it made the §7.2 layout look unimplemented on a starting bag). Auto-rearrange affordance over this list is M3 hint-system work.

### Screenshot-review hotfixes + lazy-boundary correction

- **Commit 5 (screenshot review).** Trey's halt-gate screenshot review caught two blockers that step-1–4 missed:
  1. Desktop `BottomPanel` rendered a hardcoded "R3 · won vs ghost (Marauder) · 6 dmg dealt · 3 dmg taken" string regardless of run state. The literal survived data.local dissolution by being JSX-baked rather than living in `data.local.ts`. Fixed by reading `state.history[state.history.length - 1]` with an empty-state fallback ("0 ROUNDS · awaiting first combat").
  2. Mobile `CraftingTab` hid the AVAILABLE WITH CURRENT ITEMS section entirely when `scoutedRecipes` was empty — the common starting case (one Iron Dagger in bag → no scoutable recipes) made the §7.2 two-section layout invisible. Fixed by always rendering the section header + count with an empty-state row ("No recipes possible with current items.") when no scouted recipes match. Test rewritten to assert both sections' empty states render simultaneously.
  Verification ask 3 (HP reconciliation between mid-tick CombatOverlay and RoundResolution) reconciled by code walk: `playerHp` derives from each damage event's `remainingHp` (sim's authoritative value), advancing tick-by-tick; at `currentTick > endedAtTick` the displayed HP equals `result.finalHp.player`. Image 2's mid-tick "12/30" was a frozen frame from the playback (player took 18 of 30 total damage so far). No code change needed.

- **Commit 6 (lazy-boundary correction; closing-pass audit finding caught before the closing-log committed).** Step 2's lazy-load split shipped `CombatOverlay` JSX + `ghost.ts` + `RoundResolution` into the combat chunk but **left the entire sim runtime in main**. The original step-2 implementation imported `simulateCombat` statically from a `sim-bridge.ts` that was shared between main-chunk consumers (ShopController, RunController, ghost.ts) and the combat-chunk consumer (CombatOverlay). Vite's chunk-splitting heuristic hoisted the shared bridge to the common ancestor (main); the static-import edge for `simulateCombat` rode along with it, dragging the combat-only sim subgraph (`combat.ts` + `status.ts` + `triggers.ts`) into main. Sourcemap audit at the closing pass surfaced the violation: title-screen / pre-combat users were paying the full sim parse cost despite the `tech-architecture.md` § 10 invariant. Fix: split the bridge into `apps/client/src/run/sim-bridge.ts` (shop-side, no `simulateCombat` import) + `apps/client/src/combat/sim-bridge.combat.ts` (NEW, combat-side, imports `simulateCombat` and exports `runCombat`). Neither bridge imports the other. Post-split sourcemap audit confirms `combat.ts` / `status.ts` / `triggers.ts` ship exclusively in the combat chunk; main's sim imports are limited to `rng.ts` / `iteration.ts` / `math.ts` / `run/shop.ts`. This documentation pattern mirrors M1.3.3's Codex P1 hotfix sub-section: original close + post-close correction unified under one heading.

### Bundle delta

- **vs. M1.3.3 close** (244.93 KB raw / 75.65 KB gzipped main; 12.06 KB raw / 3.22 KB gzipped mobile chunk; 78 modules):
  - **Main chunk:** 243.02 KB raw / 75.84 KB gzipped — Δ −1.91 KB raw (−0.78%) / +0.19 KB gzipped (+0.25%). Within the ≤+5% gzipped target ✓ — sim's combat code moved OUT (combat-chunk-bound), and the bridge / content / types / ShopController / glue moved IN, netting roughly zero. **Desktop pre-combat users actually save raw bytes vs. M1.3.3 baseline.**
  - **Combat chunk (NEW, lazy):** 22.19 KB raw / 7.50 KB gzipped — additive, only loaded when the player presses Continue. Includes `CombatOverlay` + `ghost.ts` + `sim-bridge.combat.ts` + `RoundResolution` + sim's `combat.ts` + `status.ts` + `triggers.ts` + `iteration.ts`.
  - **Mobile chunk:** 13.85 KB raw / 3.44 KB gzipped — Δ +1.79 KB raw / +0.22 KB gzipped (absorbs the scouted-section JSX).
  - **CSS:** 10.05 KB / 2.97 KB gzipped — unchanged.
  - **Modules:** 78 → 99 (+21: sim-bridge + sim-bridge.combat + content + types + ShopController + ShopController.test + recipes.test + ghost + ghost.test + LazyCombatOverlay + various adjacent test/source pairs, split across 3 chunks — main + combat + mobile).
  - First-load cost for desktop pre-combat is **lower** than M1.3.3 close: combat chunk fetched on-demand at the Continue button press.

### Tests

- Workspace baseline at M1.3.3 close (per project convention: client + ui-kit, sim/content tests not folded into "workspace"): **75 across 15 files** (48 client / 12 files + 27 ui-kit / 3 files).
  - **Added (+24 tests across 3 new files + 2 expansions):** `recipes.test.ts` (NEW, +8 = 5 detectRecipes regression migrated from `data.local.test.ts` + 3 scoutRecipes); `ghost.test.ts` (NEW, +7); `ShopController.test.ts` (NEW, +5); `CraftingTab.test.tsx` (4 → 6, +2); `RunController.test.ts` (9 → 11, +2 covering combat_done loss path + 0-hearts clamp).
  - **Deleted (−5 tests across 1 file):** `data.local.test.ts` (5 detectRecipes regression tests; migrated into `recipes.test.ts` alongside the 3 new scoutRecipes tests).
  - **Net delta:** +19 tests / +3 files. **Workspace post-M1.3.4a: 94 across 18 files** (67 client / 15 files + 27 ui-kit / 3 files). Sim 466 tests / 13 files + content 30 tests / 1 file unchanged. Turbo pipeline 25/25 tasks green.

### Files added (`apps/client/src/`)

- `run/sim-bridge.ts` (shop-side bridge)
- `combat/sim-bridge.combat.ts` (combat-side bridge — NEW at step 6)
- `run/types.ts`
- `run/content.ts`
- `run/recipes.test.ts`
- `shop/ShopController.ts`
- `shop/ShopController.test.ts`
- `combat/ghost.ts`
- `combat/ghost.test.ts`
- `combat/LazyCombatOverlay.tsx`

### Files deleted

- `apps/client/src/data.local.ts`
- `apps/client/src/data.local.test.ts`

### Files modified non-trivially

`run/RunController.ts`, `run/useRun.ts`, `bag/layout.ts`, `run/recipes.ts`, `combat/CombatOverlay.tsx`, `screens/RoundResolution.tsx`, `screens/mobile/tabs/CraftingTab.tsx`, `screens/mobile/tabs/LogTab.tsx`, `hud/BottomPanel.tsx`, `screens/{DesktopRunScreen, mobile/MobileRunScreen}.tsx`, `icons/icons.tsx`, plus 15 other test/component files swept for new import homes.

### Documented carry-forwards

  1. **Phaser combat overlay → M1.3.4b** (replaces the DOM portraits/HP-bars with the Phaser scene). Combat chunk already lazy-split, so adding Phaser is purely additive to the combat chunk size.
  2. **Real-device drag-state screenshot capture** (carry-forward from M1.3.3) → still deferred; surfaces alongside M1.3.4b if Phaser scene work makes mobile real-device testing in-scope.
  3. **`combat/CombatOverlay.tsx` portrait character-art (3 hex sites)** → M1.3.4b (Phaser replacement supersedes; the carry-forward sites are now in the DOM Portrait component, easy to replace wholesale).
  4. **@dnd-kit `DragOverlay` rotation visual polish** → M1.3.4b or later (carry-forward from M1.3.2 / M1.3.3; not surfaced this sub-phase).
  5. **Run-end detection (hearts === 0 → eliminated)** → M1.5 (alongside class-select screen + relic state machinery + LocalSaveV1 persistence).
  6. **State-driven bag dimensions through pure helpers** → M2 (when contract mutators rewrite bag size; until then `BAG_COLS` / `BAG_ROWS` derived constants are sufficient).
  7a. **`opponentClassId` field on `RunHistoryEntry`** → M1.5 (replaces the round-parity class derivation in `LogTab` + `BottomPanel`; the field is local to the client-side history record, not server state, so it can land independently of M2 ghost storage).
  7b. **Server-side ghost record (per-(round, trophy_band) GhostBuild storage)** → M2 (replaces `combat/ghost.ts`'s procedural template entirely; the carry-forward language treats `combat/ghost.ts` as a placeholder explicitly designed to be deleted).
  8. **Auto-rearrange hint affordance over the AVAILABLE WITH CURRENT ITEMS section** → M3 (hint-system work).
  9. **Per-round trophy schedule + contract modifiers + win-streak multipliers** → M2 (closes the +18-placeholder ratification 5).
  10. **`RarityGem` for shop rarity dot** (carry-forward from M1.3.2; not surfaced this sub-phase).
  11. **`apps/client/src/index.css` `.glow-*` rgba palette derivatives** (carry-forward from M1.3.2 / M1.3.3).

### Branch hygiene

6 implementation commits + closing entry on `m1.3.4a-sim-wire-up`, branched off main (`0b07722`). `--no-ff` merge to main once Trey confirms CI green on origin.

### Next

**M1.3.4b** (Phaser combat scene). The DOM combat overlay shipped this sub-phase is the placeholder that proves the sim path; M1.3.4b is purely a render-layer swap (Phaser replaces the Portrait + HP-bar DOM tree). No new sim integration, no new state surface — the combat chunk's bytes grow to absorb Phaser, but the architectural shape is set.

### Codex P1 catch + reroll-cost authority fix (commit 8)

- **Codex Review on PR #6 caught a P1 on the closing-pass tree:** `ShopPanel.tsx` (and the mobile `ShopTab` equivalent) computed reroll affordability as `state.rerollCount + 1`, while the reducer charged via sim's `computeRerollCost(rerollsThisRound, rerollCostStart, rerollCostIncrement, extraRerollsPerRound)` per ratification 3. Default ruleset values (`rerollCostStart=1`, `rerollCostIncrement=1`, `EXTRA_REROLLS_PER_ROUND=0`) made the formulas incidentally agree. Divergence surfaces as soon as M1.5 lands relics with non-zero `extraRerollsPerRound`, or contract mutators modify the cost curve.

- **Fix:** hoisted the placeholder `EXTRA_REROLLS_PER_ROUND` const + a pass-through re-export of `computeRerollCost` into `run/sim-bridge.ts` so the reducer + `ShopPanel` + `ShopTab` share one authoritative source. `RunController` imports both from sim-bridge instead of `@packbreaker/sim` directly + a local const; `ShopPanel` + `ShopTab` replace the `+ 1` arithmetic with the same `computeRerollCost(...)` call. Test fixture comments updated (`ShopPanel.test.tsx`, `RunContext.test.tsx`); rendered values unchanged (cost is still 1 for default ruleset, so all assertions hold).

- **Architectural rule reinforced + documented inline at `run/sim-bridge.ts`:** _UI affordability state never reimplements game-rule arithmetic — it consumes the authoritative formula from sim._ Future shop-related ratifications inherit this rule. Sweep audit on `apps/client/src` for `rerollCount + 1` and other local affordability arithmetic returned zero remaining sites.

- **Sourcemap audit re-confirms post-fix chunk integrity unchanged.** `computeRerollCost` lives in `packages/sim/src/run/shop.ts` (already in main per the M1.3.4a step 6 split), so the re-export adds no combat-side sim modules to main. Combat chunk still owns `combat.ts` / `status.ts` / `triggers.ts` / `iteration.ts`; main's sim imports remain `rng.ts` / `math.ts` / `run/shop.ts`.

- **Updated stats:** test count **67 / 15 client files** unchanged (assertion values unchanged at default ruleset; only test comments updated); workspace total **94 / 18 files** unchanged. Main chunk **243.10 KB raw / 75.86 KB gzipped** (was 243.02 / 75.84 — Δ +0.08 KB raw / +0.02 KB gzipped from re-export glue). Mobile chunk 13.92 KB raw / 3.47 KB gzipped (Δ +0.07 / +0.03 KB from ShopTab call-site swap). Combat chunk 22.19 KB raw / 7.50 KB gzipped (unchanged). All bundle-delta budgets still satisfied (main +0.39% raw / +0.28% gzipped vs. M1.3.3 baseline). Modules 99 (was 99 — re-export glue lives inside an existing module).

- **Updated branch hygiene:** 8 implementation commits + closing-log amendment (commit 9) on `m1.3.4a-sim-wire-up` (commits 1–4 implementation + 5 screenshot-review hotfix + 6 lazy-boundary correction + 7 closing log + 8 Codex P1 hotfix + 9 = this closing-log amendment). Branch force-pushed to origin after the hotfix lands so the PR re-runs CI against the corrected tree.

---

## 2026-05-01 — M1.3.3 closed (mobile responsive 390-wide vertical layout)

- First sub-phase to target a viewport other than desktop. Layout reflows per `gdd.md` § 14 mobile spec; visual register from M1.3.2 carries forward unchanged across mobile (no mobile-specific palette extensions, no mobile-specific typography deviations, no mobile-specific easing curves). Trey-confirmed via 12-of-14 screenshot review in chat.

- **Layout audit ratifications:**
  1. **Opponent intent → top-bar element.** `GhostGlyph` 18px + two 20px monochrome silhouette swatches (sword + shield) inline. No explicit class label — the silhouette pair pattern implies the apparent class per `gdd.md` § 14 ("opponent intent shows the opponent's apparent class and 1–2 marquee item silhouettes — never their full bag pre-combat").
  2. **Class passive → `[Relics]` tab header card.** Tinker glyph + class name + "+10% recipe potency" passive text. Header card precedes the relic slots in the Relics tab.
  3. **Silhouettes → top-bar inline** (collapsed into Decision 1 — silhouettes ride with the opponent-intent block, not a separate top-bar item).
  4. **`[Crafting]` tab → active recipes mirror** (option A). Lists the recipes currently ready to combine, each row a tappable COMBINE target. Mirrors (does not replace) the COMBINE buttons anchored on the bag itself — provides an ergonomic backup for awkward combine-anchor positions. Empty state copy: "No recipes ready. Place items adjacent to see combinations." Recipe scouting (recipes-you-could-make-with-current-items) deferred to M1.3.4 with sim integration.
  5. **`[Log]` tab → vertical stack of round entries.** R1/R2/R3 line items with WON/LOST + damage summary (mock data until M1.3.4 sim integration provides real per-round results). **Last-round damage chart remains deferred on both desktop and mobile; revisit when telemetry surfaces a need.**
  6. **Tab-content layout → stacked** (option ii — bag upper, tab content lower). Bag must always be visible per visual-direction.md § 1 (60%-of-smaller-dim floor). Stack: top bar 44 + bag 240 (4 × 52px cells + 32px padding, BAG/items-placed header+footer rows hidden via `compact` prop) + tab content ~360 scrollable + tab bar 56 + Continue CTA 56 = 756 of 844 viewport.
  7. **Floating CTA → option C (full-width bar).** Closes `visual-direction.md` § 13 question 4. Always-visible regardless of active tab; reroll moves to `[Shop]` tab header (visible only when Shop is active). User can tap Continue from any tab without first switching back to Shop. Largest tap target (≈390 × 56 vs floating-pill ≈64 × 40); no dual-meaning confusion.
  8. **Breakpoint mechanism → JS viewport-detect at 768px** (`window.matchMedia('(max-width: 767px)')` + `useState` + `change` event listener in `apps/client/src/run/useViewport.ts`). Two orchestrators sharing primitives; only the active layout's component tree mounts at a time, which keeps @dnd-kit sensor config (PointerSensor on desktop, PointerSensor + TouchSensor on mobile) cleanly per-layout. Tablet/intermediate (768–1024) reads as desktop per `gdd.md` § 14. Breakpoint flicker mitigations (debounce, persist-last-active) deferred — revisit only if a user reports it.

- **Lazy-load mobile (commit 8.5) per option-B ratification on bundle-delta halt.** `MobileRunScreen` loaded on-demand via `React.lazy(() => import('./mobile/MobileRunScreen'))` + minimal `<Suspense fallback={<MobileFallback />}>` wrapper at the dispatcher level. Desktop branch stays default-synchronous. Per `tech-architecture.md` § 10's mid-tier-mobile parse-time budget, raw bytes matter as much as gzipped transmission — the mobile-only payload doesn't ship to desktop users. Sets the precedent for M1.3.4 Phaser code-splitting.

- **Viewport-meta fix (commit 8.6).** Trey's first-pass screenshot capture surfaced a real bug: M0's `<meta name="viewport" content="width=1280" />` graybox hack was forcing all browsers (including Chrome DevTools mobile emulation) to use a 1280-wide layout viewport, which made `matchMedia('(max-width: 767px)').matches` return false at 390-wide → useViewport returned 'desktop' → DesktopRunScreen rendered inside the 390-wide canvas. Fix: meta updated to `width=device-width, initial-scale=1`. The useViewport hook + dispatcher logic were correct as-is. The pre-M1.3.3 hack made graybox desktop viewable on phones for design review without responsive implementation; M1.3.3 makes mobile a real surface so the hack must go.

- **Mobile components added** (`apps/client/src/`):
  - `screens/mobile/MobileRunScreen.tsx` — orchestrator. Wraps `DndContext` + `<CellSizeProvider value={52}>` + stacked layout. Combines PointerSensor (mouse/stylus fallback) + TouchSensor (200ms long-press, 5px tolerance).
  - `screens/mobile/MobileTabBar.tsx` — 4-tab shell (Shop / Crafting / Relics / Log), default = Shop, active-tab indicator (2px accent border-top + heading-tight), tabs ≥ 44×56 touch targets.
  - `screens/mobile/tabs/{ShopTab,CraftingTab,RelicsTab,LogTab}.tsx` — tab content panels.
  - `screens/mobile/MobileContinueCTA.tsx` — full-width × 56px bottom bar Continue.
  - `hud/mobile/MobileTopBar.tsx` — compact 44px top bar with gold/hearts/round + opponent intent.
  - `bag/CellSize.tsx` — `CellSizeContext` (default 88) + `CellSizeProvider` + `useCellSize` hook. Mobile orchestrator wraps with `value={52}`. Pure pixel-math utilities in `bag/layout.ts` (combineAnchorPosition + helpers) parameterized by `cellSize` arg defaulting to the desktop constant.
  - `shop/SellZone.tsx` — extracted from `ShopPanel.tsx`'s inline subcomponent for shared use between desktop ShopPanel and mobile ShopTab.
  - `bag/BagBoard.tsx` — added `compact` prop (default false) hiding the BAG/items-placed header+footer rows so the mobile bag area fits 240px.
  - `shop/ShopSlot.tsx` — added `cardWidth` prop default 110 (desktop) so mobile ShopTab can pass `'100%'` and slots fill the wider mobile grid columns.

- `bag/`, `shop/`, `packages/ui-kit/` — shared between desktop and mobile, no fork. CellSize context drives the per-layout pixel scale.

- **Touch ergonomics:** @dnd-kit `TouchSensor` wired with 200ms `delay` + 5px `tolerance` activation. **Tap-tap rotate** during drag implemented via window-level `touchstart` listener in `useRun.ts`: while `dragRef.current` is non-null, a second concurrent touch (`touches.length >= 2`) fires `drag_rotate`. Same square-no-op gating as the R-key path. **Touch-target audit:** all interactive mobile elements ≥ 44×44 WCAG-AA floor (tab buttons ~95×56, REROLL minHeight 44, COMBINE rows minHeight 44, Continue CTA full-width × 56, ShopSlot cards ~159×140, bag cells 52×52). **Pinch-zoom + scroll lock during drag:** `touch-action: none` applied to the bag's inner board container so taps on empty cells and items both inhibit native pinch/scroll.

- **Recipe-glow halo legibility verified at 52px cell — confirmed readable.** Per-cell rect rendering retained at the smaller mobile scale; the failure mode the M0 spec named (internal seam fighting halo) does not surface. M0 deferred item 2 stays closed; perimeter-path revival NOT needed for mobile. Per Trey's screenshot ratification, shared edges between cluster cells read as part of dashed marching pattern, not as internal seams. Mobile cell size does not trigger the busy-read failure mode.

- **Visual register continuity:** zero mobile-specific palette extensions, zero mobile-specific typography deviations, zero mobile-specific easing curves. Inter weights 400/500/600/700 + tabular numerals + cubic-bezier(0.16, 1, 0.3, 1) all flow through unchanged. Desktop screenshots 13–14 confirm desktop did NOT regress at 1280×720 or at 1024×768 (intermediate width correctly routes to desktop layout).

- **12 of 14 screenshots delivered** (mobile 3–12 + desktop 13–14). Mobile screenshots 1 (mid-drag valid outline) and 2 (invalid drop shake) not captured due to a documented OS-tooling limitation: standard screenshot keystrokes release the drag mid-capture under Chrome DevTools mobile emulation, since the touch is held by the mouse pointer that the screenshot tool interrupts. Workarounds (touch event recording, video capture, real-device testing) add tooling complexity beyond M1.3.3 scope. Behavioral parity for drag affordances verified IMPLICITLY across screenshots 3–7 (drag-to-place, recipe detection, four-direction first-fit anchor, combine flow all functional). Skip framed as a tooling limitation, NOT a regression. Revisit at M1.3.4 if real-device testing becomes in-scope alongside Phaser combat overlay work.

- **Bundle delta vs. M1.3.2 close (242.15 KB JS / 9.94 KB CSS / 74.47 KB gzipped / 64 modules):**
  - **Desktop-only bundle:** 244.63 KB raw / 75.52 KB gzipped — Δ +2.48 KB raw (+1.02%) / +1.05 KB gzipped (+1.41%). Within ≤+5% on both axes ✓
  - **Mobile chunk (lazy):** 12.06 KB raw / 3.22 KB gzipped — additive, only loaded when viewport < 768px
  - **Total (mobile users):** 256.69 KB raw / 78.74 KB gzipped — first-load cost on mobile only, then cached
  - **CSS:** 10.05 KB (+0.11 KB / +1.11%) — within ≤+30% budget ✓
  - **Modules:** 64 → 77 (+13: 12 mobile-component files + 1 lazy-chunk runtime metadata, split across 2 chunks)
  - Pre-lazy single-chunk build was 255.00 KB / 76.35 KB gzipped (76 modules); the split adds ~1.7 KB raw / ~2.4 KB gzipped of code-splitting overhead but only mobile users pay it. **Desktop users save 10.37 KB raw / 0.83 KB gzipped vs the un-split build.**

- **Tests:** ui-kit 27 (unchanged); client **46** (was 31; +15 across 5 new test files: `screens/RunScreen.test.tsx` ×2 [desktop sync + lazy mobile via `waitFor`], `screens/mobile/MobileTabBar.test.tsx` ×4, `screens/mobile/MobileContinueCTA.test.tsx` ×3, `screens/mobile/tabs/CraftingTab.test.tsx` ×4, `screens/mobile/tabs/RelicsTab.test.tsx` ×2). Workspace total **73 across 14 test files**, all passing. Turbo pipeline 19/19 tasks green.

- **Documented carry-forwards** (most converging at M1.3.4):
  1. `shop/ShopController.ts` split → M1.3.4 (sim integration creates real shop action surfaces)
  2. `data.local.ts` full dissolution → M1.3.4
  3. `combat/CombatOverlay.tsx` portrait character-art (3 hex sites) → M1.3.4 (Phaser replacement)
  4. @dnd-kit `DragOverlay` rotation visual polish → M1.3.4 (non-blocking observation, carry-forward from M1.3.2)
  5. **Mobile drag-state screenshot capture** (touch + screenshot tool conflict under DevTools emulation) → M1.3.4 if real-device testing becomes in-scope
  6. `apps/client/src/index.css` `.glow-*` `rgba()` palette derivatives (5 entries) → M1.3.3+ if revisited (carry-forward from M1.3.2; not surfaced this sub-phase)
  7. **Viewport-meta side-effect:** `DesktopRunScreen` at fixed 1280px width may show horizontal scroll on desktop browser windows narrower than 1280 with the new responsive meta. Not visible at the 1024×768 verification capture; M1.3.4+ if it surfaces at narrower widths (desktop responsive layout would fix it).

- **Branch hygiene:** 9 implementation commits (3, 4, 5, 6, 7, 8, 8.5, 8.6) + closing entry on `m1.3.3-mobile-responsive`, branched off main (`0d9803b`). `--no-ff` merge to main once Trey confirms CI green on origin.

- **M1.3.4** (sim integration + Phaser combat overlay) is next. **This is the inflection point:** `data.local.ts` dissolves, `packages/sim` integrates into the client bundle (lazy-loaded alongside Phaser, following the M1.3.3 mobile-chunk precedent), canned 4-second combat replaced by deterministic playback of real combat events. The game stops being a UI demo and starts being a deterministic real game.

### Codex P1 catch + hotfix (commit 10)

- **Codex Review on PR #5 caught a P1 regression on the lazy-loaded dispatcher:** the cross-breakpoint orchestrator swap destroyed `useRun` state. Both `DesktopRunScreen` and `MobileRunScreen` independently called `useRun()`, so when the dispatcher swapped one for the other (rotation, window resize across 768px), the leaving orchestrator's `useReducer` state was destroyed and the new tree started from `INITIAL_CLIENT_STATE`. Bag, shop, gold, hearts, round all reset. Regressed M1.3.2's single-orchestrator behavior.

- **Hotfix:** lifted `useRun()` into a new `RunProvider` (option B from Trey's ratification — Context over prop drilling). `screens/RunScreen.tsx` now wraps its children in `<RunProvider>`; both orchestrators consume via `useRunContext()` instead of calling `useRun()` independently. The provider stays mounted across the dispatcher's child swap, so the underlying `useReducer` state persists across viewport switches.

- **New files:**
  - `apps/client/src/run/RunContext.tsx` — `RunContext` + `RunProvider` + `useRunContext` hook. Throws a clear error if consumed outside the provider.
  - `apps/client/src/run/RunContext.test.tsx` (+2 tests) — direct regression coverage. (1) "preserves state when the provider child subtree swaps" mutates state in child A (gold 8 → 7, rerollCount 0 → 1), swaps the provider's children to B, asserts B reads the preserved state, mutates again from B (gold 7 → 5, rerollCount 1 → 2). Unit-test analog of a viewport-driven orchestrator swap. (2) "throws a clear error when useRunContext is called outside `<RunProvider>`" — defensive invariant.

- **Architectural rule (project-wide, carry-forward to M1.3.4+):** _Lazy-loaded sub-tree dispatchers must own any state that should persist across the dispatch boundary. State below the dispatcher's swap point is destroyed on every swap._ Documented inline at `run/RunContext.tsx`. M1.3.4 Phaser will follow the same lazy-load pattern; any combat-scene state that should persist across mount/unmount cycles must live above the lazy boundary.

- **Updated stats:** test count **75 across 15 files** (was 73/14); main chunk **244.93 KB raw / 75.65 KB gzipped** (was 244.63 / 75.52 — +0.30 KB raw / +0.13 KB gzipped from `RunContext.tsx` + glue). All bundle-delta budgets still satisfied (desktop +1.15% raw / +1.58% gzipped vs M1.3.2 baseline). Mobile chunk unchanged at 12.06 KB / 3.22 KB. CSS unchanged at 10.07 KB. Modules 78 (was 77, +1 RunContext file).

- **Updated branch hygiene:** 11 implementation commits on `m1.3.3-mobile-responsive` (3, 4, 5, 6, 7, 8, 8.5, 8.6, 9 = original closing entry, 10 = Codex hotfix, 11 = this closing-log amendment). Branch force-pushed to origin after the hotfix lands so the PR re-runs CI against the corrected tree.

---

## 2026-05-01 — M1.3.2 closed (visual styling pass + ui-kit primitive promotion)

- Visual-direction.md compliance landed across `apps/client/src/`. First sub-phase where the game looks like the locked Gridline direction rather than the prototype skin. Behavioral parity vs. M1.3.1 preserved end-to-end (Trey-confirmed via 12-screenshot review in chat).

- **ui-kit promotion (M1.3.1 deviation 2 closed):** `RarityFrame` + `ItemIcon` promoted from `apps/client/src/ui-kit-overrides/` to `packages/ui-kit/`. Adds new `RarityGem` primitive (5 SVG corner-gem shapes ◆■▲★✦ via `currentColor`) — promoted as part of the rarity-frame visual treatment in commit 4. 27 tests in `packages/ui-kit/src/*.test.tsx` (12 RarityFrame + 9 RarityGem + 6 ItemIcon). `apps/client/src/ui-kit-overrides/` directory deleted entirely; the 3 import sites swept directly to `@packbreaker/ui-kit` (re-export shim approach rejected — single mechanical sweep keeps mid-styling-pass churn lower per Trey ratification at commit 1).

  - `ItemIcon` API changed from `itemId`-based lookup to children-based transform wrapper. The ICONS map is content-tied to apps/client and doesn't belong in ui-kit; consuming sites in apps/client now do their own `ICONS[itemId]` lookup at the call site and pass the result as children. Documented as an intentional API shift, not a "same component API" regression.
  - `packages/ui-kit/` test infrastructure: vitest@^2.1.8 + @testing-library/react + @testing-library/jest-dom + happy-dom + @vitejs/plugin-react + vite added as devDeps. Inline vitest config in `packages/ui-kit/vite.config.ts` (happy-dom env, setupFiles). package.json `test` script changed from echo-stub to `vitest run`. tsconfig excludes `*.test.ts(x)` from the `dist/` build output.

- **Color audit (post-pass: zero non-token UI chrome refs except documented combat character art):**

  | Bucket | Pre-M1.3.2 | Post-M1.3.2 |
  |---|---|---|
  | Inline-hex UI chrome | 26 | **3** (combat portrait character art only — `#1D4ED8`/`#334155`/`#475569` + `${hex}33` boxShadow alpha; documented inline as M1.3.4 Phaser replacement) |
  | Inline-hex item-icon ART (icons.tsx) | 78 | 78 (exempt per § 5 body-color rule, content-side identity colors) |
  | `:root` CSS-variable defs (index.css) | 18 | 18 (these ARE the canonical tokens) |
  | Tailwind arbitrary classes (`bg-[#xyz]` etc.) | 0 | 0 (never an issue) |
  | `var(--*)` references in source | (~50) | (~73, +23 swept) |
  | `#FFFFFF` violations of § 3 ("pure white forbidden") | 2 | **0** (CTA buttons NEXT ROUND + CONTINUE swept to `var(--text-primary)`) |

  Two semantic UI extensions (`life-red`, `coin-gold`) audited for canonical-context-only usage and confirmed compliant: `life-red` (hearts, damage indicator, invalid-drop affordance, sell-zone "destroy item" affordance — all within "hearts and damage" category); `coin-gold` (coin glyph, gold-amount displays, REROLL cost, COMBINE button border — within scope; the `#F59E0B` shared-hex with `rarity-legendary` never collides on the same surface per § 3). No third semantic extension attempted.

- **Typography:** Inter loaded from Google Fonts at `apps/client/index.html` (carry-over from M0; verified). Weights 400/500/600/700 applied per § 4. `apps/client/tailwind.config.js` `theme.fontFamily.sans` extended to `['Inter', 'system-ui', 'sans-serif']`. **Tabular numerals confirmed on 10 numeric-display locations** (audit fixed 2 missed sites in commit 2): `hud/TopBar.tsx` gold + hearts max-count grid + round/totalRounds + trophy; `bag/BagBoard.tsx` items-placed footer + recipes-ready footer; `shop/ShopPanel.tsx` REROLLS counter + REROLL cost; `shop/ShopSlot.tsx` item cost; `combat/CombatOverlay.tsx` damage numbers + burn-stack count; `screens/RoundResolution.tsx` gold/trophy/hearts ratios.

- **Rarity frame system:** 1px border in rarity color (was 2px in M1.3.1; matches "no heavy chrome" per § 6) + corner gem rendered as inline SVG (replaces Unicode-character rendering per task §3 + the M0 inline-SVG decision; 5 distinct shapes — Diamond / Square / Triangle / Star / Sparkle — via `RarityGem` component using `fill="currentColor"`) + soft inner glow scaled to rarity (was uniform inline alpha in M1.3.1). New per-rarity `glowAlpha` (hex 2-char) + `glowBlur` (px) fields on `RarityDef`: common 1A/10px (subtle) → uncommon 2D/13px → rare 38/16px → epic 47/19px → legendary 57/22px (prominent). Dual-coding silhouette discipline test #1 verified — the five gem shapes have distinct silhouette mass distributions (no two share more than ~30% overlap), color-blind safety preserved.

- **Body-color rule audit (12 items, all PASS):** documented inline at the top of `apps/client/src/icons/icons.tsx` as a frozen audit table. 4 items pass via material-identity matching their rarity register (iron-sword, iron-dagger, whetstone, steel-sword); 1 via material identity (wooden-shield, brown = wood); 1 via plant-identity matching own rarity (healing-salve); 6 via Option A identity-color exception (healing-herb, spark-stone, apple, copper-coin, ember-brand, fire-oil). Two notable surface-color overlaps that remain compliant in context: spark-stone + copper-coin body fills include `#F59E0B` (= rarity-legendary frame color) — identity rule (fire / gold currency) overrides + the surface-non-collision invariant (§ 3 — coin glyphs never appear inside a Legendary item frame) keeps them safe; steel-sword's `#94A3B8` gradient stop = rarity-common color but is metallic-base material identity, not signal-color body fill.

- **Recipe-glow evaluation (M0 deferred item 2 closed):** screenshot-driven decision in commit 7 ratified **halo**. **Per-cell rect rendering retained.** Evaluation on the post-styling-pass visual register (1px frame borders, 1.5s/cycle marching dash, rarity-keyed alpha pulse) showed unified halo legibility on both 2-cell and 3-cell clusters; the failure mode the M0 spec named (internal seam fighting halo) did not surface. Perimeter-path approach (~30 lines edge-traversal geometry per the M0 deferred item 2 spec) deferred indefinitely; revisit only if telemetry/playtest surfaces "busy" read in cluster shapes not exercised here (4+ cell clusters, L-shapes, T-shapes — none of which exist in M1 recipe content per `balance-bible.md` § 11). Closure rationale also annotated in `apps/client/src/bag/RecipeGlow.tsx` header for traceability.

- **Motion language (cubic-bezier(0.16, 1, 0.3, 1)):** drop-settle adjusted from 160ms → **120ms** in `bag/DraggableItem.tsx` (matches § 7 "placement settles in 120ms"). ShopSlot transform timing 140ms → 120ms for consistency. New `.hover-lift` CSS class (`filter: brightness(1.06)` on `:hover:not(:disabled)`, 120ms ease-snap transition, no rotation/scale) applied to the 4 CTA buttons: REROLL, CONTINUE, COMBINE → output, NEXT ROUND. Recipe glow 1.5s/cycle confirmed (`recipe-march` linear + `recipe-pulse` ease-in-out). Drag pickup remains instant (no transition delay; @dnd-kit owns pickup activation).

- **Partial data.local.ts dissolution:** `RARITY` palette + `RarityKey` enum + `RarityDef` interface moved from `apps/client/src/data.local.ts` to `packages/ui-kit/src/rarity.ts`. `data.local.ts` retains a re-export shim for back-compat with consumers that still import RARITY from there (full sweep deferred to M1.3.4 with the rest of `data.local.ts`'s dissolution). 3 of 22 M1.3.1-baseline import sites now resolve through `@packbreaker/ui-kit` directly (the consumers that import `RarityFrame`/`ItemIcon`/`RarityGem`); the remaining 19 (RARITY/RarityKey/ITEMS/SEED_*/types/helpers consumers) continue importing from `data.local`. Full dissolution still M1.3.4 with sim integration creating real shop/Ruleset surfaces.

- **12 screenshots delivered** (9 reproducing M1.3.1 set in new visual register + 3 new compliance shots). Behavioral parity preserved: drag valid/invalid affordances, R-key rotation, recipe detection, four-direction first-fit anchor logic, four-second canned combat, round-resolution overlay all work identically. Visual compliance confirmed: palette tokens consistent, Inter typography + tabular numerals visible in close-up, rarity frame system (1px border + SVG gem + scaled inner glow) renders dual-coded, body-color rule preserved on Healing Herb (plant green) vs. Whetstone (slate metal) shared-Common comparison.

- **Bundle delta vs. M1.3.1 close (240.51 KB JS / 9.89 KB CSS / 74.09 KB gzipped / 61 modules):**
  - JS: **242.15 KB** (+1.64 KB / **+0.68%**) — within ≤+5% budget ✓
  - CSS: **9.94 KB** (+0.05 KB / +0.51%) — within ≤+20% budget ✓
  - Gzipped JS: **74.47 KB** (+0.38 KB / +0.51%) — within ≤+5% budget ✓
  - Modules: 61 → **64** (+3: ui-kit's `RarityFrame`, `ItemIcon`, `RarityGem`)
  - ui-kit chunk produced: bundled into the main client chunk (workspace TS-source consumption — no separate chunk emitted; tree-shake confirmed by the small +1.64 KB delta against the M1.3.1 baseline that already included ui-kit-overrides versions of RarityFrame + ItemIcon).

- **Test counts:** ui-kit 27 (was 0 — pure addition, RarityFrame×12 + RarityGem×9 + ItemIcon×6); client 27 (unchanged). Workspace total **54 across 9 test files**. Turbo pipeline 19/19 tasks green.

- **Tooling note:** ui-kit's test environment is `happy-dom@^20` (matches `apps/client`'s convention from M1.3.1 commit 8). jsdom@29 still incompatible with the local Node 18 toolchain.

- **Documented non-blocking observation (deferred to M1.3.4):** @dnd-kit `DragOverlay` rotation rendering can show the dragged item at two positions simultaneously (origin + rotated target) with a "ghostly" silhouette during R-key rotation mid-drag. Behavioral parity vs. M1.3.1 holds (prototype had identical rendering). Visual polish on `DragOverlay` deferred to M1.3.4 alongside @dnd-kit visual styling pass + Phaser combat scene work.

- **Documented carry-forwards (all converging at M1.3.4):**
  1. `shop/ShopController.ts` split → M1.3.4 (sim integration creates real shop action surfaces)
  2. `data.local.ts` full dissolution → M1.3.4 (partial progress this sub-phase: RARITY + RarityKey + RarityDef in ui-kit; remainder pending sim integration)
  3. `combat/CombatOverlay.tsx` portrait character-art hex (3 sites) → M1.3.4 (Phaser combat scene replaces the placeholder portraits and their VFX palette)
  4. `apps/client/src/index.css` `.glow-*` classes (5 `rgba()` palette derivatives) → M1.3.3+ if revisited (currently dead code; `color-mix()` rewrite deferred)
  5. @dnd-kit `DragOverlay` rotation visual polish → M1.3.4 (per non-blocking observation above)

- **Branch hygiene:** 8 implementation commits + closing entry on `m1.3.2-visual-styling`, branched off main (`53fc2a5`). `--no-ff` merge to main once Trey confirms CI green on origin.

- **M1.3.3** (mobile responsive 390-wide vertical layout per `gdd.md` § 14) is next.

---

## 2026-04-30 — M1.3.1 closed (component scaffold + dnd-kit migration)

- Monolithic `apps/client/src/App.tsx` (893 lines pre-decomposition) restructured in place into `apps/client/src/` following `tech-architecture.md` § 5.1: `screens/`, `bag/`, `shop/`, `hud/`, `combat/`, `run/`, plus `icons/` and `ui-kit-overrides/` (both in § 5.1's canonical list). Component count: 14 (TopBar, LeftRail, BottomPanel, ShopPanel, ShopSlot, SellZone, BagBoard, BagCell, DraggableItem, RecipeGlow, CombatOverlay, RoundResolution, RunScreen, DragPreview). Largest production file: `hud/LeftRail.tsx` at 147 lines (under the ~200-line cap per DoD §2). `icons/icons.tsx` at 251 lines is icon-data, not a component.

- `@dnd-kit/core@^6.3.1` + `@dnd-kit/sortable@^10.0.0` installed at `apps/client/package.json`. `pnpm-lock.yaml` refreshed (+58 lines). First sub-phase to land @dnd-kit's bundle cost — was declared in the M1.3.1 prompt as "already installed but tree-shaken" but was actually never in any `package.json` until commit 2 of this branch. Replaces raw pointer-event drag from the M0 prototype: `DndContext` at `RunScreen` level with `PointerSensor` (4px activation distance) + `pointerWithin` collision detection. Each `BagCell` is `useDroppable`; each `DraggableItem` and `ShopSlot` is `useDraggable`. `DragOverlay` replaces the prototype's `DragGhost` (cursor-tracking is now @dnd-kit's responsibility — `DragState`'s `x/y/offX/offY` fields removed). Behavioral parity verified via 9 screenshots in chat (M0 DoD set reproduced + 3 combine-anchor cases). Pointercancel + window-blur drag cleanup carried forward, owned now by @dnd-kit's `PointerSensor` and routed through `onDragCancel` → `drag_cancel` reducer action; reducer-level test verifies the cleanup transition in `apps/client/src/run/RunController.test.ts`.

- Combine-button anchor upgraded from upper-right-with-top-fallback to four-direction first-fit (M0 deferred item 1 closed). Priority order: upper-right → upper-left → lower-right → lower-left. Collision-check button rect 44×24 (configurable via `COMBINE_BUTTON_W` / `_H` in `bag/layout.ts`); fails on off-grid extension OR overlap with non-cluster items. Degenerate case (all four collide) returns upper-right with `fallback: true` and accepts visual overlap. Unit tests in `apps/client/src/bag/layout.test.ts` cover null cluster + each direction winning + the dense-bag fallback (7 cases).

- Canned 4s combat sequence ported from `src/combat.tsx` into `combat/CombatOverlay.tsx`. `WinOverlay` extracted as `screens/RoundResolution.tsx` (round-end overlay with reward + Continue). Phaser scene scaffolding (`CombatScene.ts`, `effects/`) deferred to M1.3.4 with sim integration.

- State model shift: `useState`-per-slice → `useReducer` over a single `ClientRunState`. `run/RunController.ts` hosts pure reducer + `RunAction` union (12 action variants); `run/useRun.ts` wraps with `useReducer` + bound handlers + the residual window-keydown listener for `R`-key rotation (gated to non-square items per M0 ratification — squared items have rotation-invariant footprints). Same observable behavior; reducer transitions are explicit and unit-testable.

- M0 prototype monolith files deleted from `apps/client/src/`:
  - `App.tsx` (deleted as a re-export shim in commit 9)
  - `combat.tsx` (deleted as a re-export shim in commit 9)
  - `data.local.ts` + `data.local.test.ts` retained — see deviation #3 below.

  `main.tsx` cut over to render `RunScreen` directly in commit 5; `index.css` unchanged. Dev command unchanged: `pnpm --filter @packbreaker/client dev`. `CONTRIBUTING.md` no changes needed. `pnpm install --frozen-lockfile` + `pnpm turbo lint test build` green from clean state (19/19 turbo tasks pass).

- **Documented deviations** — three, all converging at M1.3.4 as the natural carving-up point:

  1. **`shop/ShopController.ts` split deferred to M1.3.4.** `tech-architecture.md` § 5.1 specifies a separate ShopController; without sim-driven shop generation there is no meaningful controller logic to host. Shop state lives in `run/RunController.ts` for M1.3.1 (`shop`, `pickup_shop` action, `reroll` action, `REROLL_POOL` deterministic-by-counter pool from the M0 prototype). **Revisit trigger:** M1.3.4 sim integration creates real shop action surfaces.

  2. **`packages/ui-kit/` primitive extraction deferred to M1.3.2.** Stub remains `export {};`. `RarityFrame` + `ItemIcon` live in `apps/client/src/ui-kit-overrides/` for M1.3.1 (the `ui-kit-overrides/` directory is in `tech-architecture.md` § 5.1's canonical list and signals "client-side primitives pending packages/ui-kit promotion"). **Revisit trigger:** M1.3.2 visual styling pass touches primitives for `visual-direction.md` compliance — promote at that point.

  3. **`apps/client/src/data.local.ts` retained as load-bearing client-side adapter.** Pre-deletion audit per Task §5 step 1 revealed 22 active import sites across the new component tree carrying five non-content concerns with no canonical home in `@packbreaker/content`:
     - UI tokens (`RarityKey` enum, `RARITY` palette)
     - Run-state seeds (`INITIAL`, `SEED_BAG`, `SEED_SHOP`)
     - Game-rules constants (`BAG_COLS`, `BAG_ROWS` — eventually flow from `DEFAULT_RULESET.bagDimensions` at M1.3.4)
     - Client-shape types (`BagItem`, `ShopSlot`, `RunState`, `Cell`, `ItemDef` — narrowed UI shapes, not canonical `Item`/`Recipe`)
     - Helpers (`dimsOf`, `cellsOf` — operate on client `BagItem`)

     `ITEMS` and `RECIPES` exports are thin adapters/filters over `@packbreaker/content`; no material content authority drift. Deletion deferred to M1.3.4 with sim integration. The `.local` infix remains accurate ("not the final form"); dissolution path is to distribute concerns at M1.3.4: client-shape types → `run/types.ts`, seeds → `RunController.ts`, UI tokens → `ui-kit-overrides/`, game-rules constants → flow from sim's `Ruleset`, content adapters → replaced by direct `@packbreaker/content` consumption. Updates the M1.3.1 prompt's Task §5 step 2 framing: `data.local.ts` removed from the commit-9 deletion list. Spec deviation ratified by Trey in chat. **Revisit trigger:** M1.3.4 sim integration.

- **Behavioral nuances** — split into two categories, do not lump:

  **Intended behavioral upgrades (M0 deferred items closing):**
  - Combine-anchor four-direction first-fit with priority order UR → UL → LR → LL replaces prototype's UR-with-top-fallback. Side effect: clusters touching the top edge now anchor at LR instead of the prototype's ad-hoc LL — this is the intended outcome of the priority order, not a regression.

  **Incidental @dnd-kit semantics differences (acceptable, documented):**
  - Shop slot pickup activation: 4px-move pointerdown (per @dnd-kit's `PointerSensor` default) replaces prototype's click-then-pointermove. Sub-perceptual on desktop mouse; end-to-end semantics identical.
  - Drag preview clears on pointer-leave-bag (per `onDragOver` semantics). Prototype's lingering preview was a coincidence of the raw pointer-event implementation, not a designed behavior. Stricter is better.

- **Tooling note:** `happy-dom@17` (not `jsdom`) for vitest's DOM environment in `apps/client`. Local toolchain is Node 18; `jsdom@29` dropped Node 18 support. `happy-dom@17` works on both Node 18 and 20. `vitest.config` block added inline in `apps/client/vite.config.ts` with `environment: 'happy-dom'` + `setupFiles: ['./test/setup.ts']` (registers `@testing-library/jest-dom/vitest` matchers + RTL `cleanup` afterEach). `apps/client/src/vitest.d.ts` triple-slash references `@testing-library/jest-dom` for typecheck-time matcher augmentation.

- **Bundle delta vs. M1.2.6 baseline (194.69 KB JS):**
  - Final: **240.51 KB raw / 74.09 KB gzipped** (61 modules)
  - Pre-@dnd-kit (post-commit-5): 196.73 KB raw / 59.73 KB gzipped (58 modules)
  - @dnd-kit's contribution: **+43.78 KB raw / +14.36 KB gzipped** (one-time install + import — first build to include it)
  - Adjusted delta excluding @dnd-kit: **+2.04 KB raw / +1.05%**
  - Within budget (≤+5% beyond @dnd-kit cost). ✓

- **Component-level tests added:** 22 new (15 in commit 8 + 7 in commit 7). Total client test count: **27** (was 5 at branch-start). Test files: `data.local.test.ts` (5, existing), `bag/layout.test.ts` (7, new), `run/RunController.test.ts` (9, new), `bag/RecipeGlow.test.tsx` (2, new), `bag/BagBoard.test.tsx` (2, new), `shop/ShopPanel.test.tsx` (2, new). RTL + `@testing-library/jest-dom` + happy-dom installed as devDependencies in apps/client.

- **M0 deferred items resolved in this sub-phase:** items 1 (combine-anchor four-direction first-fit), 3 (component split), 4 (@dnd-kit migration). Items 2 (recipe-glow perimeter path) and 5 (Phaser combat overlay) remain deferred to M1.3.2 and M1.3.4 respectively.

- **M1.3.2** (visual styling pass per `visual-direction.md`, including `packages/ui-kit/` primitive promotion + recipe-glow perimeter-path approach if it surfaces) is next.

- **Branch hygiene:** 10 implementation commits + closing entry on `m1.3.1-component-scaffold`, branched off main (`0ba754c`). `--no-ff` merge to main once Trey confirms CI green on origin.

---

## 2026-04-30 — M1.2.6 boss-relic coverage residual gap ratified

After the M1.2.6 ratified halt-and-surface protocol (50 retries per missing triple, weapon-priority strategy with RAZORS_EDGE starter for both classes + 4 rerolls/round), 3 of 4 (class × boss-relic) pairs remained at 0 organic firings across the 24 appended fixtures. The fourth pair (`marauder|worldforge-seed`) fired once. The relic-collector strategy achieved a ~12% round-11 win rate vs. FORGE_TYRANT (67 HP under neutral contract; bag carries greataxe + chainmail + bloodmoon-plate + warhammer + vampire-fang + iron-mace + apple + whetstone), insufficient for ≥2× coverage on each boss pair.

Ratified residual gap (encoded as `BOSS_RELIC_PAIR_EXCEPTIONS` in `packages/sim/test/determinism/generate.ts`):

```
BOSS_RELIC_PAIR_EXCEPTIONS = [
  'tinker|worldforge-seed',
  'marauder|conquerors-crown',
  'tinker|conquerors-crown',
];
```

`marauder|worldforge-seed` stays in the coverage check; its 1× firing satisfies the ≥1× organic threshold for non-excepted boss pairs. The exception list is a "permitted to be zero" set, not a "must be zero" set — if a future regen produces firings for any listed pair, coverage still passes.

**Threshold asymmetry**: mid-relic pairs require ≥2× organic firings each; boss-relic pairs require ≥1× organic OR membership in `BOSS_RELIC_PAIR_EXCEPTIONS`. Justified by boss-win-rate structural cap: boss-grant fires only after a round-11 player_win, structurally hard against FORGE_TYRANT. Mid-grant fires after surviving 5 rounds, reliably achievable. Mid pairs already meet ≥2× × 8/8.

**Path-coverage justification (locked text)**:

> grantRelic's code path is parameterized by slot + relicId, not by (slot, relicId, class) triple. Triples that fire exercise the same control flow as triples that don't.

The 9 of 12 triples that fire (8 mid + 1 boss) provide sim-contract path coverage of grantRelic + composeRuleset re-invocation + relic_granted telemetry; the 3 missing triples are content-coverage gaps, not sim-contract gaps.

**Revisit triggers** (encoded verbatim in the comment block on `BOSS_RELIC_PAIR_EXCEPTIONS`):

- **(a)** M1.5 client integration replaces scripted strategies with player input AND organic boss-win rate exceeds 30%.
- **(b)** Any code change to `combat.ts`, `RunController.startCombat`, `startCombatFromGhostBuild`, or the `boss_only` mutator path.

When trigger (b) fires (a future contributor modifies one of those files), they regenerate the M1.2.6 appended fixtures and verify the exception list hasn't grown. Trigger (a) is a M1.5 milestone gate — once player input replaces scripted strategies, organic boss-win rate becomes a meaningful balance signal rather than a strategy-tuning artifact.

---

## 2026-04-30 — M1.2.6 closed (grantRelic API + appended fixtures)

- `RunController.grantRelic(slot: 'mid' | 'boss', relicId: RelicId)` added for player-side mid/boss slot population, with phase gating per gdd.md § 9: 'mid' is legal only in arranging phase of round 6+; 'boss' is legal only in resolution phase after a round-11 player_win. Idempotent throw on already-occupied slots; ruleset recomposed via `composeRuleset` on grant (current round's shop NOT regenerated, new ruleset takes effect for ALL subsequent shop generations + combats per locked answer #4). 9 unit tests in `run.test.ts` cover the validation matrix end-to-end. TypeScript prevents 'starter' at compile; a runtime defensive check throws too.
- `grant_relic` action variant in `RunControllerAction` with `slot` + `relicId` fields. `applyAction` dispatches to `controller.grantRelic`. Pure dispatch — no validation; controller throws on illegal grants and applyAction propagates. One unit test in `actions.test.ts`.
- `relic_granted` TelemetryEvent variant added (schema v0.5, additive only). `RunId`, `slot`, `relicId`, `round`. `content-schemas.ts` and `packages/content/src/schemas.ts` byte-identical (check-schemas-sync gate). Wired through the existing `onTelemetryEvent` injection. `telemetry-plan.md` § 3 updated with KPI rationale.
- 24 appended fixtures (200–223) under `packages/sim/test/fixtures/runs/`, all replay byte-stable through the determinism harness. All-`relic-collector` strategy. 16 mid fixtures cover all 8 (class × mid-relic) pairs ≥2×. 8 boss fixtures: 1 (class × boss-relic) pair fires ≥1× organically; the remaining 3 pairs are accepted as documented coverage exceptions per the residual-gap entry above (2026-04-30 — M1.2.6 boss-relic coverage residual gap ratified). The threshold asymmetry (mid ≥2×, boss ≥1× or excepted) is intentional and encoded in `evaluateCoverage`.
- M1.2.5 fixtures (000–199) remain DO NOT REGENERATE. M1.2.6 ADDS, never modifies, the fixture corpus.
- Refactor: dropped `readonly` modifiers on `RunController.effectiveRuleset` and `.derived` (previously construction-only). The fields are now mutated by `grantRelic` to support re-composition; initial composition still happens in the constructor.
- **Total fixture count: 224.** Sim test count: 442 → 466 (+24 fixture replays + 0 new unit tests in this commit; the 9 grantRelic + 1 action-dispatch tests landed in steps 2 and 3). `pnpm turbo lint test` clean: 17/17.
- Closes the player-side relic-acquisition gap acknowledged in the M1.2.4 closing entry. M1.2 sim phase + acknowledged gaps fully closed; **M1.3** (bag UI rewrite + dnd-kit) is next.
- Branch hygiene: 6 implementation commits + closing entries on `m1.2.6-grant-relic`, branched off main (`825f3fb`). Ready for `--no-ff` merge after PR CI green.

---

## 2026-04-30 — M1.2.5.1 closed (CI workflow wiring)

- `.github/workflows/ci.yml` implements tech-architecture.md § 8.2's five-stage pipeline (install / lint / typecheck / test / build) on `ubuntu-latest` with Node 20.x and pnpm 9.x (pinned via `package.json`'s `packageManager: pnpm@9.15.0` field, auto-detected by `pnpm/action-setup@v4`). Triggers on `pull_request` and `push` to `main`. The 200-fixture determinism suite runs as part of stage 4 via the existing non-skippable `pnpm turbo test` path — no separate stage, same protection as unit tests.
- **Spec deviation flagged in the workflow header comment**: tech-architecture.md § 8.2 lists "sim determinism suite" as a separate stage 5 of a six-stage pipeline. M1.2.5.1 folds it into stage 4 (test) so the determinism suite is non-skippable by the same mechanism that protects unit tests, rather than by a parallel "don't skip me" convention. Folding is structurally tighter — there is no way to run `pnpm turbo test` and skip the determinism harness, since `harness.test.ts` matches the default vitest pattern.
- **First green run on PR #1** validated portability of the M1.2.5 fixture suite across CI runners — all 200 .jsonl fixtures replay byte-stable on `ubuntu-latest` with no byte-divergence between local and CI replays. Total pipeline runtime: **39s wall time**, well under the 5-minute halt-and-surface threshold. Closes the local-only-CI deviation that had accumulated since M1.2.1.
- **Branch protection rules to be configured by Trey via GitHub UI** after this workflow lands and produces consistent green runs. Out of M1.2.5.1 scope (workflow file only; repo settings are configured separately).
- M1.2.5.1 is the deferred sub-task flagged in M1.2.5's closing entry — landing it before M1.2.6 ensures the appended `grantRelic` fixtures gate-validate against a working pipeline from their first PR.

---

## 2026-04-30 — M1.2.5 closed (200-fixture determinism suite + boss mutator)

- M1.2.5 closed. 200 JSONL action-stream fixtures across 5 strategies (40/100/40/10/10 split — greedy/hoarder/recipe-chaser/reroll-burner/random-legal) under `packages/sim/test/fixtures/runs/`. Harness (`packages/sim/test/determinism/harness.test.ts`) re-runs each fixture and byte-compares per-round CombatEvent arrays. All 200 replay byte-stable. Sim test count: 232 → 432 (+200 fixture replays + 24 unit tests across 6 commits).
- **Coverage targets (per ratified spec):**
  - Boss round (round 11) reached ≥10×: **18** [OK].
  - Tick-cap draw (`endedAtTick === 600`, organic-only): **184** [OK].
  - All 12 recipes from balance-bible.md § 11 fire ≥1× each (target #3 narrowed from ≥3× per ratification — see entry below): **10 of 12** [OK with documented Capstone exception].
  - All 6 starter relics × both classes appear in starter slot ≥5× each (target #4 narrowed from "all 12 relics" per ratification — see entry below): **16–17 each** [OK].
  - Rotation 270° on a non-square item ≥1×: [OK]. Closes `iteration.ts:151` rotation-270 carry-forward.
- **Action stream API** ships in `packages/sim/src/run/actions.ts`: `RunControllerAction` discriminated union (one variant per state-mutating RunController method + a `'create_run'` header variant) and `applyAction(controller, action)` pure dispatcher. Exported from sim barrel. JSON round-trips losslessly — no Date/Map/Set/undefined fields.
- **Boss mutator path** ships: `RunController.startCombatFromGhostBuild(ghost: GhostBuild)` sibling to `startCombat(ghost: Combatant)`. `boss_only.hpOverride` REPLACES ghost startingHp; `damageBonus` and `lifestealPctBonus` flow through `simulateCombat`'s new `options.mutators` to the ghost's SideStats (player-side unaffected). Existing `startCombat` signature preserved — sim contract surface unchanged. Schema v0.4 unchanged (mutator fields were authored at schema time; M1.2.5 implements them).
- **Procedural ghost generator** lives in test scaffolding only (`test/determinism/ghost-generator.ts`). Per ratification option A: rng-driven, drawn from `ITEMS` weighted by `RARITY_GATE_BY_ROUND[round-1]`. Round 11 returns the canonical `FORGE_TYRANT` GhostBuild. Recorded inline in the `start_combat_from_ghost_build` action — replay does NOT regenerate. M1.5's bot-fallback ghost generator (gdd.md § 11) is a separate design problem and gets to start clean.
- **CI workflow wiring deferred** to a sub-task before M1.3 per `tech-architecture.md` § 8.2. Determinism suite runs locally via `pnpm turbo test:determinism` (turbo task added with cache key including `test/fixtures/runs/**`) and is non-skippable in default `pnpm test` because the harness file `harness.test.ts` matches the default vitest pattern.
- **Bundle delta zero** — test scaffolding doesn't ship.
- Branch hygiene: `m1.2.5-determinism-suite` branched off main (`6344250`), six implementation commits + closing entries. Ready for `--no-ff` merge.
- M1.2.5 closes the M1.2 sim phase pending M1.2.6 (mid/boss relic granting API + appended fixtures, before M1.3).

---

## 2026-04-30 — M1.2.5 boss mechanics consolidation

Three interlocking gaps surfaced during M1.2.5 recon, ratified as a bundle and resolved in scope:

1. **FORGE_TYRANT.relics.boss** set to `'conquerors-crown'` per balance-bible.md § 13 (Marauder boss relic). Was construction-time `null` since M1.1 — caught when M1.2.5 strategies tried to load FORGE_TYRANT for round 11. The relic's `bonusGoldOnWin: 3` is inert on a ghost (gold-on-win credits the player, no ghost-side gold pool); the value-bearing field is `bonusBaseDamage: 4`, which now stacks correctly with the boss aura at round 11. New `items.test.ts` assertion locks the boss-relic value.
2. **`RunController.startCombatFromGhostBuild(ghost: GhostBuild)`** added as a sibling to the existing `startCombat(ghost: Combatant)`. Handles GhostBuild → Combatant conversion (per-side passiveStats aggregation via the shared `computeStartingHpFromBag` helper, contract mutator application). `startCombat` signature preserved — sim contract surface unchanged. Existing M1.2.4 boss test (uses `startCombat` directly with a hand-built Combatant) continues to work.
3. **`ContractMutator['boss_only']` application** implemented inside `startCombatFromGhostBuild`'s flow. `hpOverride` REPLACES startingHp at ghost construction. `damageBonus` and `lifestealPctBonus` flow through `SimulateCombatOptions.mutators` (extended in `combat.ts`) to `applyBossMutatorsToGhost` which folds them into the ghost's `SideStats.bonusBaseDamage` and `SideStats.lifestealPct` respectively. Player side is unaffected. Closes a schema-vs-implementation gap that had been sitting since schema v0.1.

Five new tests in `run.test.ts` lock the bundle: `neutral` contract derives ghost startingHp from passiveStats; `forge-tyrant-boss` contract `hpOverride: 50` REPLACES the computed value (Buckler-bag ghost: 35 → 50); `damageBonus: 2` raises ghost damage events (5 → 7); `lifestealPctBonus: 15` produces ghost-side heal events; FORGE_TYRANT integration verifies `ghostHp: 50` under boss contract vs `67` (chainmail 12 + bloodmoon-plate 25 + 30 base) under neutral.

---

## 2026-04-30 — M1.2.5 surfaced M1.2.4 cleanup regression (combineRecipe rollback restoration)

The M1.2.4 closing entry's "state.ts:510 combineRecipe rollback — function uses try-then-commit ordering, no rollback needed; M3 content protection deferred" ratification was based on a **faulty invariant**: M1 recipes can have outputs strictly larger than inputs. `r-tower-shield` (2 cells → 4 cells), `r-greatsword` (geometry-dependent), and both Epic capstones (3 cells → 4 cells) all produce 2×2 outputs that won't fit at the inputs' top-left anchor when the bag has non-input items in the would-be-output cells. The deleted guard caused a `null` push into `bag.placements` on the first dense-bag layout exercising `r-tower-shield` via the M1.2.5 strategy harness.

**Fix:** restored the throw in `combineRecipe`. Refactored the rotation-fit logic into a public `RunController.findCombineRotation(match)` method — single source of truth shared between `combineRecipe` (for commit-time validation) and strategy-side `wouldCombineFit` (for action-emission filtering). Try-then-commit ordering preserved: throw fires from validation, never from commit. Bag is unchanged on failure.

Two new tests in `run.test.ts`:
- combineRecipe throws when output cannot fit at the inputs anchor; bag is unchanged (custom 2×2 output recipe with blocker forcing all rotations to collide).
- findCombineRotation returns the first fitting rotation; combineRecipe uses it (iron-sword rot=90 + iron-dagger + blocker layout where rot=0 collides but rot=90 fits).

The `state.ts:510` branch previously classified as M3-deferred under the M1.2.4 cleanup is now real-path-reachable under M1 content. M1.2.4 closing-entry classification is superseded.

Player UX semantics (combine-button gating at recipe-detection time vs. attempt-and-error) deferred to M1.5 client integration. Sim contract surface gains the `findCombineRotation` query method but keeps `combineRecipe` semantics-compatible (the throw was dormant under M1.2.4's punt; restoring it doesn't change behavior for recipes that fit).

---

## 2026-04-30 — M1.2.5 coverage target #3 revision (≥1× recipes + Capstone exception)

Replaced the original M1.2.5 coverage target #3 — *"all 12 recipes fire ≥3× each"* — with **"all 12 recipes fire ≥1× each"** per ratified rationale: determinism suites need path coverage, not frequency coverage. A recipe's code path that replays byte-stable once replays byte-stable always; multiplicity is content-coverage, not sim-contract coverage.

Authorized a bounded 1-day capstone-solver investment (NOT a full sixth strategy — an extension to `recipe-chaser` activating only when `seed % 12` targets one of `{r-tower-shield, r-berserkers-greataxe, r-master-alchemists-kit}`). Capstone-solver behaviors:
- **Defensive early game** (rounds 1–3): if bag is empty, buy any weapon/armor item even if off-plan.
- **Bottom-up planning**: leaf items first via `recipeChainInputs` (target inputs + producers' inputs, recursively).
- **Aggressive rerolls** (up to 10/round) while target/chain inputs are absent.
- **Anchor-aware placement**: chain inputs go top-left via `findCornerPlacement('top-left')`; non-chain items go bottom-right. The 2×2 output's anchor (minRow=0, minCol=0) finds free cells at (0,1)/(1,0)/(1,1) when chain inputs occupy the corner.
- **Plan-pure combines**: only target and chain recipes are combined. Off-chain combines fragment the bag and waste cells.

**Outcome — "1 or 2 of 3 fire ≥1×" branch of the halt-and-surface protocol:**
- `r-tower-shield`: 2 firings (was 0 before capstone-solver) — **MET**.
- `r-berserkers-greataxe`: 0 firings — documented exception.
- `r-master-alchemists-kit`: 0 firings — documented exception.

The two Capstones require 3 specific Rare items (round-7+ gate, ~5–7g each, 2×2 output) simultaneously in a single bag. Capstone-solver cannot organically produce them within the 1-day investment + 50-attempt retry budget. Per ratified justification text:

> combineRecipe's code path is parameterized by recipe content (inputs, output, rotation), not by recipeId. Recipes that fire exercise the same control flow as recipes that don't. Recipe-specific coverage is exhaustiveness, not determinism. The N-of-12 firings plus M1.2.4's unit-tested recipe-combine-bonus fixture provide path coverage; missing recipes are content-coverage gaps, not sim-contract gaps.

The exceptions are encoded in `evaluateCoverage` (in `test/determinism/generate.ts`) as `RECIPE_EXCEPTIONS = {r-berserkers-greataxe, r-master-alchemists-kit}` with a comment pointing to this decision. Future content-balance work (M2 telemetry might surface that these recipes are also rare in real play) may motivate a content lever or a synthesized fixture path; deferred for now.

---

## 2026-04-30 — combineRecipe multi-match selection bug fix (incidental to recipe-chaser)

Surfaced during M1.2.5 strategy-driven generation. `combineRecipe(recipeId)` previously used `matches.find((m) => m.recipeId === recipeId)` to pick the first match, but `detectRecipes()` can return multiple match variants per recipeId when the bag has duplicate inputs in different positions (e.g., two iron-swords + two iron-daggers each yielding a distinct r-steel-sword match). Strategies that pre-filter via `wouldCombineFit` could find a fitting variant `B`, but the controller's first-match `A` would not fit — combineRecipe threw despite the prior validation.

**Fix:** combineRecipe iterates ALL match candidates with the given recipeId (filtered by `m.recipeId === recipeId`, in canonical detectRecipes order) and picks the first one whose output actually fits via `findCombineRotation`. Throws only when NO variant fits, with a message naming how many variants were checked. Try-then-commit ordering preserved — the validation walk happens before any mutation.

Existing `combineRecipe` tests (the M1.2.5 step-2.5 fit-validation tests and the M1.2.4 happy-path tests) continue to pass — the new behavior is a strict generalization of the prior single-match path.

---

## 2026-04-30 — M1.2.5 coverage target #4 narrowing (starter relics only)

Replaced the original target #4 — *"both classes × all 12 relics ≥5× each"* — with **"all 6 starter relics × both classes appear in starter slot ≥5× each"** (12 pairs, ~16 fixtures each at 200 total). Mid- and boss-tier relic granting deferred to **M1.2.6**: `RunController` has no `grantRelic` API, `RelicSlots.mid/.boss` are construction-time null on the player side, and adding the API + telemetry + run-phase rules (gdd.md § 9 "awarded after round 5") is a sim contract surface change that shouldn't ride along with the determinism suite's first ratification.

M1.2.6 will append fixtures additively; the existing 200 stay locked under DO-NOT-REGENERATE. The `m1.2.6` work scope: sim API surface bump, action-stream variant for `grant_relic`, post-round-5 grant logic, fixture appendix exercising mid/boss relic effects through `composeRuleset` and `deriveSideStats`.

Boss-side relic equipping (FORGE_TYRANT.relics.boss = 'conquerors-crown', see "M1.2.5 boss mechanics consolidation" entry above) is content-defined and flows through the existing `composeRuleset` → `deriveSideStats` path — orthogonal to the player-side grantRelic deferral.

---

## 2026-04-29 — M1.2.4 coverage cleanup pass (closed)

- Closes the "Punted to M1.2.5 fixture authoring or a future cleanup pass" deviation flagged in the M1.2.4 closing entry below. 20 uncovered branches in `packages/sim/src/run/*` resolved on the same `m1.2.4-run-state` branch before merging to main.
- **6 real-path tests** added in `run.test.ts`:
  - `moveItem` to overlap with another placement throws (state.ts:377).
  - `rotateItem` to a rotation that goes off-grid throws (state.ts:404 — 1×2V at right edge column rotated 90 → 2×1H spills into col=6 of a 6-wide bag).
  - `placeItem` rejects row-axis OOB anchors (state.ts:651, paired with the existing col-axis test).
  - Buckler (+5 maxHpBonus) raises player startingHp from 30 to 35 (state.ts:690 — real-path smoke for `passiveStats.maxHpBonus` via 30-damage ghost vs 35-HP player landing remainingHp=5).
  - player-applied burn → status_tick events count toward damageDealt (state.ts:776 ghost branch in `computeDamageStats`).
  - ghost-applied burn → status_tick events count toward damageTaken (state.ts:776 player branch).
- **10 defensive guards deleted** as unreachable under type/registry/history contracts:
  - state.ts:286/315/469 — unknown-itemId / unknown-recipeId throws; registry contract guarantees lookups succeed when called from validated buyItem / sellItem / detectRecipes flows. Replaced with non-null assertions.
  - state.ts:485 — `Number.isFinite(minRow/minCol)` after the input-footprint loop; `match.inputPlacementIds` is non-empty per recipe contract so the loop body always runs.
  - state.ts:689 — `item?.passiveStats?.maxHpBonus`; bag.placements always have valid itemIds, narrowed to `item.passiveStats?`.
  - state.ts:697 — `last?.round === lastCombatRound ? last.outcome : null` history-tracking guard in `lastCombatOutcomeForRound`; function only called from advancePhase in resolution phase, so `history[history.length - 1]` is always defined and round-matched. The now-write-only `lastCombatRound` field removed.
  - shop.ts:84 — `weightedSelect` integer-arithmetic fallback; replaced with a documented `throw` so future contrived registries hard-crash rather than silently return a wrong item (folds in the surfaced :74 case below).
  - recipes.ts:75 — sort-comparator's `: 0` branch; recipe IDs are unique per registry contract so the comparator never returns 0. Simplified to `a.id < b.id ? -1 : 1`.
  - recipes.ts:122 — `if (!adj) continue` in BFS over the adjacency map; the map is populated for every placement in the same scope (line 53–67), so `adj` is always defined.
  - recipes.ts:137 — `seenKeys` dedup; `recurse(0, [])` generates each combination exactly once and recipe IDs are unique, so the dedup never fires. Both the `seenKeys` `Set` declaration and the `if (seenKeys.has(key)) continue` line removed.
- **4 surfaced cases ratified as deletes** (Trey's call on each, recorded here for posterity):
  - state.ts:510 combineRecipe rollback — function uses try-then-commit ordering, no rollback needed; M3 content protection deferred to that milestone. Function restructured: validate the output placement against an `excludeIds: ReadonlySet<PlacementId>` (replaces the prior single-id `excludeId` parameter on `isValidPlacement`; moveItem and rotateItem callers updated to wrap their excluded id in a fresh Set) BEFORE removing inputs, then commit atomically (filter inputs out, push output in).
  - state.ts:759 dateFromTimestamp short-string fallback — IsoTimestamp brand contract covers (timestamps are always ≥ 10 chars); replaced with bare `String(ts).slice(0, 10) as IsoDate`.
  - shop.ts:40 `RARITY_GATE_BY_ROUND[round - 1] ?? 'legendary'` — M1 ships only neutral contract (11 rounds = 11 gate entries), extended-maxRounds defense is M2/M3 problem. Replaced with non-null assertion.
  - shop.ts:74 weightedSelect zero-total — unreachable under M1 content registry; hard crash is correct failure mode for future contrived registries. Both the zero-total `if` block AND the integer-arithmetic fallback (the `:84` case) collapsed into a single documented `throw new Error('weightedSelect: empty pool or zero total weight')` at end of function.
- **Final run/* coverage: 99.49% line / 98.95% branch** (target ≥98% line / ≥97% branch). Per-file: state.ts 99.63/100 (uncovered: `getEvents()` body — public method, no test), shop.ts 97.7/95.23 (uncovered: the documented hard-crash throw + the `weight > 0` push branch which never gates under M1 content), recipes.ts 100/97.43 (uncovered: empty-recipe-inputs guard which the M1 registry never produces), replay/index/ruleset 100/100. combat.ts unchanged at 100% statements / 97.44% branches.
- **Test count: 207** (+6 from this pass; the closing entry's "192" understated — actual at `f4ef21f` was 201).
- **Bundle delta: zero**. Sim still not imported by client.
- Branch hygiene: cleanup commit on `m1.2.4-run-state`, then `--no-ff` merge to `main`. M1.2.4 closes for real; M1.2.5 (200-fixture determinism suite) opens next.

---

## 2026-04-29 — M1.2.4 Run-state machine + replayCombat (closed)

- Run controller landed at `packages/sim/src/run/`. Module split: `state.ts` (RunController class + phase machine), `ruleset.ts` (composeRuleset + baseIncomeForRound), `shop.ts` (generateShop + computeRerollCost + effectiveItemCost + sellValueOf), `recipes.ts` (sim-side detectRecipes mirroring the M0 BFS), `replay.ts` (replayCombat thin generator), `index.ts` (barrel). Public surface exported via `packages/sim/src/index.ts`.
- **Schema bumped to v0.4 (additive)** — added optional `recipeBornPlacementIds?: ReadonlyArray<PlacementId>` to `Combatant` (§ 11) in both `content-schemas.ts` and `packages/content/src/schemas.ts`. `pnpm check-schemas-sync` confirms files remain byte-identical. Pre-flight conflict (DoD step 9 said "no schema changes expected" while task § 4 step 8 invited a Combatant-field path) ratified during the recipeBonusPct routing halt: per-placement gate is the only path that doesn't break the M1.2.3b fixture suite. Confirmed zero fixture impact — all 12 combat fixtures have undefined `recipeBornPlacementIds`, no bonus applied, events byte-identical post-bump.
- Three new ratifications from the M1.2.4 pre-flight Q&A (locked answers 12–14):
  - **Q1 / locked answer 12** — Reroll cost soft cap is gold only. `RelicModifiers.extraRerollsPerRound` grants N free rerolls per round (consumed before paid rerolls). Apprentice's Loop = first reroll free; subsequent rerolls cost `rerollCostStart + (rerollsThisRound − extraRerollsPerRound) * rerollCostIncrement`. `rerollsThisRound` resets to 0 each round.
  - **Q2 / locked answer 13** — `combineRecipe` is allowed in `'arranging'` phase only. Combat / resolution phases are read-only on bag state (controller throws). Tinker's `firstRecipeFreeAction` is a M1 no-op since recipes are already free; deferred lever (sim-internal flag, no behavior).
  - **Q3 / locked answer 14** — `replayCombat()` is a thin generator wrapper around `simulateCombat`. Single-line implementation: `function* replayCombat(input, options) { yield* simulateCombat(input, options).events; }`. Same code path, byte-identical events. Public surface stable; "may become true streaming if profiling motivates it" is a future-only note.
- **Locked answer 15 (recipeBonusPct routing)** — class.passive.recipeBonusPct + summed `RelicModifiers.recipeBonusPct` materializes as `SideStats.recipeBonusPct` in combat.ts's `deriveSideStats`. The resolver's `resolveEffect` applies `applyPct(effect.amount, recipeBonusPct)` multiplicatively BEFORE flat additions (active buffs, bonusBaseDamage) when `source.placementId` is in the source side's `Combatant.recipeBornPlacementIds`. Damage / heal / apply_status all honor it. The run controller's `combineRecipe` adds the freshly-placed output's placementId to an internal `bornFromRecipe: Set<PlacementId>`; `startCombat` materializes it as `Combatant.recipeBornPlacementIds` when invoking `simulateCombat`. Deletion of a recipe-born placement (sellItem, or recipe-input consumption) drops the entry.
- **Code-discovered design refinements:**
  - **Pending-items inventory** between `buyItem` and `placeItem`. Spec didn't mandate this; the natural API split implies a staging area. Items bought but unplaced live in `private pendingItems: ItemId[]` on the controller; `placeItem(itemId, ...)` consumes by itemId match. Unexposed in `RunState` (sim-internal), persists across rounds.
  - **placementId scheme** is monotonic counter (`p-0`, `p-1`, ...) per controller instance. Deterministic, survives JSON round-trip. Reset on `createRun`, never reused after sells / recipe consumption.
  - **Boss-round resolution discipline** — locked answer at the run-controller level (bible § 18 lever 4 was open): at `currentRound === ruleset.maxRounds`, ANY combat termination ends the run. `player_win` → `'won'`, anything else (`ghost_win` / `'draw'`) → `'eliminated'` regardless of remaining hearts. Documented in code; flag this for re-ratification if M1.5 boss-fight UX surfaces a different desire.
  - **`itemsRegistry` semantics for RUN fixtures** — fixtures pass `customItems` as the COMPLETE shop / bag / recipe pool, no merge with ITEMS. This differs from combat fixtures (which merge to preserve combat input compatibility). Run fixtures need a small known item set so round 1's 4g income covers the action stream's purchases.
  - **ESLint config update** — added a `packages/sim/src/run/**` override that re-lists the broader sim restrictions (Math.random / Date.now / new Date) MINUS the Item.passiveStats restriction. The run controller IS the legitimate consumer of `passiveStats` per content-schemas.ts § 0 ("run-controller-only"); the broader sim rule is intended for combat code. Documented inline in `tooling/eslint-config/index.cjs`.
- **Telemetry:** the controller emits 12+ of the schema's telemetry events (run_start / run_end / round_start / round_end / shop_purchase / shop_sell / shop_reroll / item_placed / item_moved / item_rotated / recipe_completed / combat_start / combat_end, plus daily_contract_started / daily_contract_completed when isDaily). Sim never imports `@packbreaker/shared` (lint-enforced); telemetry events flow IN via the optional `onTelemetryEvent` callback. `tsClient` defaults to a fixed sentinel; `sessionId` defaults to `''`. M1.5 client wraps the callback to enrich both before shipping to PostHog.
- **Test count: 192** (was 148 at M1.2.3b, +44 — 33 run unit cases + 11 error-path / daily / coverage unit cases in `run.test.ts`, 6 byte-comparable fixtures in `run-fixtures.test.ts`, 2 recipeBonusPct heal+status branch cases in `combat.test.ts`).
- **Coverage:** combat.ts at 100% statements / 96.92% branches (no regression vs M1.2.3b's 100/96.59 — slight branch improvement from the M1.2.4 recipeBonusPct paths). All run/* files at 100% line EXCEPT state.ts (96.85%) and shop.ts (95.55%) — both above the spec's 95% line target. Branch coverage on run/* sits at 90.33% overall (state.ts 90.07%, shop.ts 86.95%, recipes.ts 90.69%) — UNDER the 95% branch target. **Deviation flagged:** the uncovered branches are mostly defensive guards and rare paths (telemetry-when-callback-undefined, defensive lazy-init guards, status_tick damage stat aggregation paths). Lifting to 95% requires contrived edge-case tests or restructuring to remove defensive guards. Punted to M1.2.5 fixture authoring or a future cleanup pass; no behavioral risk in the current shortfall.
- **Bundle delta vs. M1.2.3b: zero**. Sim still not imported by client. Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- **NO-OPs carried forward:** `trigger_chance_pct` buff (M1.2.3b deferral, no rune-pedestal chance roll yet) and `summon_temp_item` (no M1 content uses it). Both still inert in M1.2.4.
- Branch hygiene: `m1.2.4-run-state` branched off main (`cf25c6c`), three implementation commits (`47eb6d7` schema/recipeBonusPct routing, `f323b00` run-state machine + lint config, `9a48eb0` tests + fixtures). Ready for `--no-ff` merge to main after Trey's review.
- M1.2.5 (machine-generated 200-fixture determinism suite — uses M1.2.3b's 12 hand-authored combat fixtures as the seed corpus) closes M1.2. Then M1.3 (bag UI rewrite + dnd-kit) and M1.4 (combat playback overlay + Phaser) build on top.

---

## 2026-04-29 — M1.2.3b Combat resolver core (closed)

- `packages/sim/src/combat.ts` ships `simulateCombat(input, options?)`. Drives the canonical TICK_PHASES tick loop, owns one StatusState + one TriggerState per combatant, consumes `canonicalPlacements` / `resolveTarget` / `applyPct` / `applyBp`, emits the full `CombatEvent[]` replay log. ~800 lines including the effect resolver, adjacency precompute, and phase implementations.
- Six new ratifications from the M1.2.3b pre-flight Q&A (locked at start of milestone, applied throughout):
  - **Q1 / locked answer 6** — Adjacency = 4-directional edge adjacency. Mirrors `apps/client/src/run/recipes.ts` M0 BFS. Diagonals do not count. Codified in `computeAdjacents` and exercised by every fixture using `on_adjacent_trigger` or `buff_adjacent`.
  - **Q2 / locked answer 7** — `on_adjacent_trigger` fires REACTIVELY: every time a same-side adjacent item with matching tags has a top-level trigger fire, the on_adjacent_trigger fires too. Spark Stone's reactive burn-stacking works directly; Whetstone's buff applies on the first reactive fire (then de-dupes — see Q3).
  - **Q3 / locked answer 8** — Buff de-dupe by `(source ItemRef, target ItemRef, stat)` tuple. First application emits `buff_apply` and adds to the active list; subsequent reactive fires that would produce the same tuple are no-ops (no event, no list mutation, durationTicks NOT refreshed). Different sources to the same `(target, stat)` DO stack additively. Expired buffs CAN be re-applied. Verified by fixture #12 `whetstone-redundant.json`: Iron Sword fires three times → exactly ONE `buff_apply` event, all three damage events at base+1.
  - **Q4 / locked answer 9 + tech-architecture.md correction** — cooldown_pct formula is `applyPct(trigger.cooldownTicks, sumOfMatchingBuffAmounts)`. Buff amount passes through directly. Mana Potion's `amount: -15` on Iron Sword's 50-tick cooldown gives `applyPct(50, -15) = 42` ticks (speed-up, matching bible flavor). The original M1.2.3 spec line `applyPct(cooldownTicks, -appliedPct)` had an erroneous negation that produced a slowdown for negative buffs — corrected here. Tech-architecture.md should be updated to match in a future cleanup pass; flag this in M1.2.4 prompt drafting.
  - **Q5 / locked answer 10** — `simulateCombat(input, options?)` with `options.items?: Readonly<Record<ItemId, Item>>` defaulting to `ITEMS` from `@packbreaker/content`. Surface deviation from tech-architecture.md § 4.2 ratified for test ergonomics. Fixture #10 `buff-duration-expiry.json` injects a synthetic `test-buff-20` item via `customItems` to exercise the `buff_remove` event variant (no production item currently uses finite `durationTicks`).
  - **Q6 / locked answer 11** — Zero-amount damage events emit ALWAYS (even amount=0) for replay-log integrity, but suppress reactions when capped amount === 0. Heal events suppressed entirely when actual gain === 0. Asymmetric: damage carries info even at 0 (proves a hit landed); zero-gain heals don't. Fixture #9 `damage-cap.json` and one combat.test.ts unit case verify the damage path; full-HP Apple verifies the heal suppression.
- Code-discovered design refinements during implementation:
  - **Reaction damage events apply INLINE** (not queued at the back of `pendingDamage`), so reaction damage lands in `events[]` immediately after the parent top-level event. Initial draft queued everything FIFO, producing event order `[E1, E2, R1]` instead of the canonical `[E1, R1, E2]`. Refactored `resolveEffect` to call `applyDamage` directly when `isReaction=true`.
  - **Reactions fire BEFORE the originating trigger's effects** (Order B): `emit item_trigger → fireAdjacentReactions → apply effects → recordFire`. This way Whetstone's damage buff applies in time for the originating Iron Sword's damage event — first fire is buffed, matching bible flavor "Each adjacent weapon gets +1 dmg" (persistent feel, even though mechanism is reactive). Fixture #12 confirms.
  - **Removed dead defensive guards** (`if (!item) continue` etc.) from `runTriggerPhase` / `runCooldownPhase` / `fireDamageReactions` / `fireAdjacentReactions` / `buff_adjacent` / `computeAdjacents`. `canonicalCells` already throws on unknown itemId during `precomputeAdjacency` setup, making the in-loop guards unreachable. Removed for clarity and to hit branch-coverage target.
- **`trigger_chance_pct` buff: NO-OP** in M1.2.3b. Schema-supported but no chance-roll mechanism implemented yet. Rune Pedestal's chance buff is silently dropped from the replay log (its `on_adjacent_trigger` still emits `item_trigger`, but the `buff_adjacent` effect short-circuits before `buff_apply` emission). Defer to M1.2.5 when fixture authoring exposes the gap and we can lock the chance-roll contract.
- **`summon_temp_item` effect: NO-OP** in M1.2.3b. No M1 content uses it; defer to a future content lever. Emits no event.
- Status-tick damage skips both `on_hit` (no source — schema-mandatory) and `on_taken_damage` (locked: bible § 4 burn-bypass extended to all status_tick damage for consistency).
- Stun semantics confirmed end-to-end: `consumeStunIfPending` returns true → emit `stun_consumed` event, skip the trigger's effects, do NOT call `recordFire`. Cooldown accumulator keeps accumulating (next-tick ready). Fixture #4 `stun-consumption.json` verifies: ghost Iron Dagger fires at tick 30 (normal), then stun consumed at tick 60 with NO recordFire, then ghost dagger fires at tick 61 (one tick later, accumulator still elevated).
- **Test count: 148** (was 112 at M1.2.3a, +36 — 24 unit cases in `combat.test.ts` covering determinism / class-bonus / relic-stacking / lifesteal / burn-bypass / cap / threshold-boundary / zero-amount / buff-de-dupe / cooldown-pct-math / simultaneous-death / no-op effects / random-target / on-adjacent-filtering / Bread-cap, plus 12 byte-comparable fixture replays in `combat-fixtures.test.ts`).
- **Coverage: 100% statements / 96.59% branches / 100% functions / 100% lines on `combat.ts`**, exceeding the spec's 95% / 95% target. Sim package overall: 100% statements / 97.58% branches. Remaining branch shortfall is in `iteration.ts:151` (rotation-270 path deferred from M1.2.1 — same uncovered branch as M1.2.3a).
- **Bundle delta vs. M1.2.3a: zero**. Sim still not imported by client. Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- Branch hygiene: `m1.2.3b-resolver-core` branched off main (`dfab7b9`), two implementation commits (`daced93` combat.ts + unit tests, `823b9ec` fixtures + branch-coverage tests). Ready for `--no-ff` merge to main after Trey's review.
- M1.2.4 (run-state machine: round progression, shop generation, gold credits, `add_gold` resolution) and M1.2.5 (machine-generated 200-fixture determinism suite — uses M1.2.3b's hand-authored fixtures as the seed corpus) are next. M1.2.5 will revisit the `trigger_chance_pct` no-op once a chance-roll mechanism is needed.

---

## 2026-04-28 — M1.2.3a Combat resolver prep (closed)

- M1.2.3 split into 3a (this) and 3b (resolver core, separate prompt later) per CONTRIBUTING.md branch-hygiene preference. 3a lands additive schema work + M1.2.2 follow-ups + the TriggerState module so the resolver in 3b consumes settled foundations.
- Schema patch (additive, M1.2.3a, v0.3): added `buff_remove` variant to `CombatEvent` (§ 11) in both `content-schemas.ts` and `packages/content/src/schemas.ts`. Carries `tick`, `target: ItemRef` (the buffed item), `stat: BuffableStat`, `amount` — pairs with the matching `buff_apply` for replay-log readers without a lookup table. `pnpm check-schemas-sync` confirms files remain byte-identical. Locked per `e48bac9`.
- Three M1.2.2 follow-ups applied:
  - **`_side` parameter dropped** from `tickStatusDamage` in `packages/sim/src/status.ts`. `EntityRef` import removed. Six test call sites in `status.test.ts` updated. The resolver attributes damage by which `StatusState` instance it passes in.
  - **`status.ts` re-application doc note** added above `applyStatus`: "Re-application adds stacks; does NOT reset `burnRemainingTicks`." Game-feel rationale: re-application can't extend lifespan.
  - **`balance-bible.md` § 4 burn-prose amended** — sequence "5+5+4+4+3+..." replaced with "5,4,4,3,3,2,2,1,1" matching the spec-pinned tick order (status_ticks at phase 4 BEFORE cleanup at phase 6) which produces 25 total. Bible's "≈ 25 over its lifetime" was load-bearing; the sequence text was the writeup error.
- TriggerState module landed in `packages/sim/src/triggers.ts`. Surface mirrors `status.ts` exactly: pure verbs over a mutable struct, no classes, no environment access. Surface: `createTriggerState`, `accumulateCooldown` (no-op when entries empty), `shouldFire`, `recordFire`, `isFiringCapped`. Lazy entry creation on first access in the keyed verbs (`shouldFire` / `recordFire` / `isFiringCapped`) — `accumulateCooldown` only increments existing entries. A trigger that "becomes eligible" mid-combat (future `summon_temp_item`) starts at `cooldownAccumulator = 0` and accumulates only ticks observed AFTER its first access. Documented in module doc-block: the alternative (a global tick counter consulted on lazy-init) makes a trigger's eligibility a function of resolver call order, not resolver state, breaking determinism.
- Test count: 112 (was 89 at M1.2.2, +23 on triggers). Coverage: 100% statements / 99.1% branches across the sim package; `triggers.ts` at 100% all four metrics. The remaining branch shortfall is the same `iteration.ts:151` rotation-270 path deferred from M1.2.1, scheduled for M1.2.3b when fixture suite exercises rotated bag layouts.
- Bundle delta vs. M1.2.2: zero. Sim still not imported by client. Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- Deviation ratified: `triggers.ts` `accumulateCooldown` uses bare `Array.prototype.sort()` (ECMA262 default ToString + UTF-16 code-unit compare) over an internal `compareStrings` helper. Entry keys are unique by construction, so the helper's 3-way `a === b` branch would have been unreachable and blocked 100% branch coverage. Bare sort produces the same canonical order without the unreachable branch. `iteration.ts` retains its own `compareStrings` because it's a tiebreaker over potentially-equal placementIds in equal cells, where the unreachable branch is a real but unreached edge case worth keeping flagged.
- Branch hygiene: m1.2.3a-resolver-prep branched off main (b52d311), two commits (69b903f schema/follow-ups, 0a37034 triggers module). Ready for `--no-ff` merge to main.
- M1.2.3b (combat resolver core + hand-authored fixture suite) prompt drafts after this merge lands.

---

## 2026-04-28 — M1.2.2 review flags + bible amendment (ratified)

- M1.2.2 ratified for merge. Three follow-up items deferred from
  the review pass; tracked here so they don't go missing.
- **Flag 1 — `_side` parameter cleanup in `tickStatusDamage`.** The
  current API takes a `side: EntityRef` parameter the function never
  reads, named `_side` with a paired eslint-disable. The resolver
  attributes damage by which `StatusState` it passes in, not by a
  side label. Drop the parameter and the disable in M1.2.3 when the
  resolver becomes the first consumer. `cleanupStatus`'s `_currentTick`
  is kept — cleanup is conceptually time-aware and adding it back
  later would touch every call site.
- **Flag 2 — `balance-bible.md` § 4 burn-prose amendment.** The
  bible's sample sequence "5+5+4+4+3+..." is internally inconsistent
  (sums to 30, not the stated ~25). With the spec-pinned tick order
  (status_ticks at phase 4, cleanup at phase 6), a 5-stack burn
  produces 5,4,4,3,3,2,2,1,1,0 = 25. The "~25 total" is the
  load-bearing number; the sequence text is the writeup error.
  Amend § 4 prose to "5,4,4,3,3,2,2,1,1 ≈ 25 over its lifetime" or
  drop the sequence and keep "~25 damage over its lifetime." Folded
  into the M1.2.3 prompt as a docs-side task.
- **Flag 3 — burn re-application doc note in `status.ts`.** Current
  impl: `applyStatus` adds stacks but does NOT reset
  `burnRemainingTicks`. Burn at t=5 (5 stacks) followed by burn at
  t=15 (3 stacks) gives burn=8 with the decay clock still ticking
  from the first application. This is the right call for game feel
  (re-application doesn't extend lifespan), but undocumented. Add a
  one-liner to `status.ts` doc block in M1.2.3: "Re-application
  adds stacks; decay timer is not reset."
- M1.2.3 (combat resolver) locked answers, recorded here for the
  prompt:
  - Reaction firing order: single reaction round per top-level damage
    event, canonical placement order on each side. No cascade.
  - `buff_remove` event: add now as additive schema patch.
    Replay-log legibility for mid-combat buff expiry.
  - Damage cascade discipline: single-round, no cascade. Bloodmoon
    Plate's retaliation does NOT trigger Vampire Fang's `on_hit` on
    the boss side. Cascading is an M3 lever if a future item wants it.
  - Trigger state ownership: `TriggerState` struct, same shape as
    `StatusState`. Per-side mutable. Keys: (placementId, triggerIndex).
    Holds cooldownAccumulator, firedCount (gated by
    maxTriggersPerCombat), lowHealthFired boolean.
  - Damage cap / negative HP: floor inline at 0. CombatEvent.damage.amount
    = actual HP reduction (capped at current HP).
    remainingHp = max(0, hp − rawAmount).

---

## 2026-04-28 — M1.2.2 Status effects + status engine (closed)

- Branch hygiene reset: `m1.1-scaffold` merged to `main` as a `--no-ff` merge commit (`c9f555f`) carrying M1.1 + M1.1.1 + M1.2.1. New work branched as `m1.2.2-status-effects` from the merge commit. Per-milestone commits preserved underneath the merge. Going forward, each M1.x phase branches off `main` per CONTRIBUTING.md.
- Status engine landed in `packages/sim/src/status.ts`: `createStatusState`, `applyStatus`, `tickStatusDamage`, `cleanupStatus`, `consumeStunIfPending`. Pure-verb API mutating a single per-side `StatusState`; combat resolver (M1.2.3) owns one per combatant.
- Resolved four open questions from M1.2.1's report:
  - **Q1 (tick ordering)**: codified as `TICK_PHASES` const-asserted tuple in `iteration.ts` — `round_start`, `cooldowns`, `damage_resolution`, `status_ticks`, `low_health`, `cleanup`. Within `status_ticks`, player side resolves before ghost side. Within any phase, items iterate in `canonicalPlacements` order. Doc block added at the top of `iteration.ts`.
  - **Q2 (stack-cap overflow)**: silent cap at `STATUS_STACK_CAPS[type]`. No event for the overflow. `applyStatus(state, 'burn', 8)` on `burn=5` sets `burn=10`, drops the excess 3 stacks.
  - **Q3 (stun timing)**: per-side. `pendingStun` boolean on each combatant; `consumeStunIfPending` is the read-and-clear verb the resolver calls before any cooldown trigger fires on that side. When it returns true, the trigger's effects are skipped and a `stun_consumed` `CombatEvent` is emitted.
  - **Q4 (random target selection)**: `rng.next()` consumes at the moment of effect application via `resolveTarget`, never earlier. Empty filtered list returns null with zero rng consumption — the caller treats null as a no-op (no event).
- Schema patch (additive, M1.2.2): added `stun_consumed` variant to `CombatEvent` (§ 11) in both `content-schemas.ts` and `packages/content/src/schemas.ts`. Carries `tick`, `source: ItemRef` (the cooldown-skipped item), and `target: EntityRef` (the side whose `pendingStun` was consumed). `check-schemas-sync` confirms files remain byte-identical.
- Test count: 89 (was 55 at M1.2.1). New: 23 status cases + 7 `resolveTarget` cases + 2 `TICK_PHASES` cases + small extras. Coverage: 100% statements / 98.87% branches across the sim package; `status.ts` and `iteration.ts` both at 100% line coverage.
- Bundle delta vs. M1.2.1: zero (sim still not imported by client). Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- Burn-decay timing fixed at "−1 stack per 20 cleanup ticks", first decay at the 20th cleanup post-application. This produces the bible's stated "~25 total damage from a 5-stack burn" total: the per-tick damage sequence becomes 5,4,4,3,3,2,2,1,1,0 (sum 25). The bible's sample sequence "5+5+4+4+3+..." appears to be a casual writeup; the spec-pinned tick order (status_ticks at step 4 BEFORE cleanup at step 6) makes 25 the correct total. Flagged as a deviation in the M1.2.2 report.
- Lint trip note: the spec asked for a demo of `apply_status` bypassing `STATUS_STACK_CAPS` via a literal 10. Skipped — the cap test in `status.test.ts` ("caps silently at STATUS_STACK_CAPS.burn (= 10)") catches the regression at the test level, which is more reliable than a syntax lint for a content-driven constant.
- Open questions for M1.2.3 (combat resolver): (1) on_hit / on_taken_damage reaction firing order when multiple items react to the same damage event; (2) buff_apply event lifecycle (when does an expired buff emit a removal event, if any); (3) whether the resolver flushes `damage_resolution` reactions to a fixed point (cascade allowed?) or strictly a single round of reactions per damage event; (4) heap state for `lastFiredAt` per cooldown trigger — owned by resolver or by a sim-internal "TriggerState" struct.

---

## 2026-04-27 — M1.2.1 Sim package skeleton + RNG (closed)

- `packages/sim` populated with the canonical mulberry32 PRNG, deterministic-iteration helpers (canonicalPlacements / canonicalCells / stableSort), integer-math utilities (applyPct / applyBp / clamp / sumInts), and an `invariant()` assertion stub. No combat code, no status effects, no run-state machine — those land in M1.2.2 through M1.2.4.
- Mulberry32 implementation matches the locked tech-architecture.md § 4.1 reference (Math.imul + `>>> 0` normalizer + `t | 1` / `t | 61` chain + `/4294967296` division). Single 32-bit state, `seed | 0` coercion at construction. Class is private; `createRng(seed)` is the only public constructor. Surface: `next()`, `nextInt(min, max)`, `clone()`, read-only `state` getter.
- 55 tests pass: 16 RNG (determinism + distribution + cross-platform fixture), 12 iteration, 23 math, 3 invariant, 1 barrel smoke. Coverage 100% statements / 98.11% branches across all sim files.
- Cross-platform fixture lives at `packages/sim/test/fixtures/rng-sequences.json`: 5 seeds × first 32 `next()` values each, captured on Node v18.20.5 from a byte-equivalent reference impl. Future Node updates / browser ports must match this fixture exactly — divergence is a bug, not a regeneration trigger.
- All tech-architecture.md § 4.1 determinism rules enforced or honored: no `Math.random` (lint trip demonstrated and reverted), no `Date.now` / `new Date()`, no DOM globals, no Node built-ins, no `@packbreaker/shared`, no read of `Item.passiveStats` (existing M1.1 lint rules cover all of these). Math utilities reject float input with NaN to prevent silent rounding errors.
- Housekeeping (M1.2 preamble items from M1.1.1 closure):
  - content-schemas.ts § 0 allocation table updated to describe realized M1.1 architecture: §§ 12–15 are canonical in `packages/content`, with `packages/shared` re-exporting for ergonomics. Mirrored to `packages/content/src/schemas.ts` (still byte-identical).
  - New CI diff guard `tooling/scripts/check-schemas-sync.cjs` wired into turbo as a root-level `//#check-schemas-sync` task, on which `lint` depends. `pnpm turbo lint` now runs the diff first and fails fast if the canonical and in-package schemas drift. Drift demo: appended a comment to one file, ran `pnpm check-schemas-sync`, got a useful `first diff at line N` error message; reverted; OK again.
- Bundle delta vs. M1.1.1: zero (sim not yet imported by client). Bundle stays at 194.83 KB JS / 9.46 KB CSS.
- Branch hygiene note: M1.2.1 was authored on `m1.1-scaffold` rather than a fresh `m1.2.1-sim-rng` branch off `main` (per CONTRIBUTING.md branch convention). `m1.1-scaffold` accumulates M1.1 + M1.1.1 + M1.2.1; main still holds M0 baseline. Trey's call whether to merge `m1.1-scaffold` to main and reopen a clean M1.2.x branch, or keep accumulating until M1.2 closes.
- M1.2.2 deferred items: status effect tick logic + `STATUS_STACK_CAPS` enforcement; `invariants.ts` will pick up real assertions there (combat module is the first sim consumer with shape-contract obligations beyond what types capture); coverage target on `iteration.ts` branches stays at 95.45% — the uncovered branch is the rotation 90/270 swap inside `boundingBox` which has a guard test, but exhaustive 4-rotation coverage across all 4 shape sizes is M1.2.3 work when the combat module exercises rotated bag layouts.

---

## 2026-04-26

- M1.1 closed (Scaffold + content). Branch m1.1-scaffold; main = M0 baseline. Bundle 194.69 KB JS / 9.46 KB CSS / 35→43 modules (+7.5% raw / +5.0% gzip vs M0 — within tolerance, ITEMS map tree-shaking deferred to M1.3).
- M1.1.1 closed (schema patch + ops prep). Three additive schema changes (§ 0 wording for shared ← content direction, § 3 buff_adjacent.matchTags optional, § 6 RelicModifiers.bonusGoldOnWin optional). Six content updates downstream (Conqueror's Crown +3 win-gold; Whetstone, Forge Anvil, Rune Pedestal, Master Alchemist's Kit explicit matchTags on buff_adjacent). 29 content tests pass (24 existing + 5 new, parameterized matchTags inheritance check across 4 items for granular failure messages). Bundle delta +0.14 KB / +0.07% vs M1.1.
- Schema consolidation side-effect of M1.1.1: §§ 12–15 (GhostBuild, LocalSaveV1, server DTOs, TelemetryEvent) lifted into the canonical schemas.ts. packages/shared/{save,telemetry,api,ghost} now re-export from @packbreaker/content. Public API surface preserved. content-schemas.ts and packages/content/src/schemas.ts are byte-identical post-patch.
- IsoTimestamp + IsoDate value constructors added to § 17 (cleanup — was inconsistent with the other 9 of 11 branded ID types in v0.1).
- Earlier "recipe detection regression" was a stale Vite dev-server cache, not a code bug. Confirmed via fresh dev-server restart + hard browser refresh: Iron Sword + Iron Dagger → Steel Sword fires, COMBINE button renders. 5 vitest cases added in apps/client during M1.1.1-bugfix as permanent regression coverage. detectRecipes extracted from App.tsx to apps/client/src/run/recipes.ts (free pre-payment toward M1.3 split).
- Operational additions for M1.2+: pnpm clean script (rimraf-based, portable); CONTRIBUTING.md with cache-bust ritual, test commands, branch hygiene. Prevents future false-positive regression reports.
- Schema interpretations ratified during M1.1: on_low_health threshold = 50% across all five panic-heal triggers; maxTriggersPerCombat = 1 on all on_low_health triggers; classAffinity tagged conservatively (8 Tinker, 5 Marauder, 32 neutral); Forge Tyrant Apple shifted from (3,2) to (4,2) per balance-bible.md § 6 iron-mace 2×1 H footprint.
- Architectural deviation ratified: shared imports branded types and structural primitives from content. Direction is unidirectional (shared ← content). Lint rules enforce.
- Long-tail items deferred: ITEMS map tree-shaking (M1.3); passiveStats.bonusBaseDamage kept reserved with no current consumers; passiveStats lint rule may need narrowing if non-Item symbols ever conflict.

## 2026-04-26

- Resolved tech-architecture.md § 13 open decisions, M1 scope:
  - **Auth provider (M2):** Discord OAuth. Audience-fit (16-34 roguelite players), creator-loop fit (replay sharing in Discord servers), 2-hour implementation vs. 2-day magic-link build. Email magic-link deferred to M3 as a second option if M2 telemetry shows >15% drop-off at auth.
  - **Hosting (M2):** Vercel (client) + Fly.io (server) + Neon (Postgres) + Upstash (Redis). Fastify is not Workers-shaped; Postgres with jsonb fits the GhostBuild schema natively; all three providers are reversible. Cloudflare stack revisit if M3 sustained DAU > 10k.
  - **PostHog (M1+M2):** cloud, not self-hosted. M2 demo-gate event volume (~6k/month) sits 3 orders of magnitude under the free tier. Privacy posture is clean regardless. Revisit at M3 if events exceed 500k/month or compliance changes.
  - **Aseprite (M1+M2):** Trey-owned single seat. Source files belong to the repo, not the license. Revisit when art headcount > 1.
- All four decisions are reversible. Each has a named revisit trigger.
- M1 graybox to be executed in 5 phased sub-milestones (M1.1 scaffold + content / M1.2 sim / M1.3 bag UI rewrite + dnd-kit / M1.4 combat integration + Phaser / M1.5 tutorial + daily contract + telemetry + boss). Phased rather than mega-prompt to catch determinism contract drift before bag UI is built on top of it, dnd-kit integration shape before combat overlay assumes it, etc. Total ~20 working days at peer-review pace, slightly under the 4–6 week roadmap window.

## 2026-04-26

- Closed Run Screen prototype. Final verification pass complete.
- Verification A (rarity-keyed glow color): code-trace confirmed end-to-end. detectRecipes → glowCells rarity Map → inline `stroke: RARITY[rarity].color` at App.tsx:431, beating the CSS class default via specificity. Build clean with temp recipe; src/data.ts reverted. Screenshot skipped — trace is deterministic.
- Verification B (glow legibility at cluster edges): root cause was not grid-line clipping (my hypothesis) but items' own rarity-frame borders painting after the glow in DOM order, occluding outward-facing cell edges. Claude Code's audit caught it. Fix applied: `zIndex: 5` on the recipe-glow SVG (App.tsx:424-428). Two-line diff, build clean (+20 bytes). Combine buttons remain above at zIndex: 10; items drop below glow.
- Aesthetic caveat noted: dashed outline now paints over item rarity-frame borders on participating cells. Acceptable for prototype. If "busy" rather than "halo" in M1 graybox, replace per-cell rect rendering with a single perimeter `<path>` stroked once (~30 lines of edge-traversal geometry). Deferred to M1.
- M1 deferred items list: (1) combine-button anchor algorithm — four-direction first-fit replacing upper-right-with-top-fallback, surfaces when bags get dense; (2) recipe-glow perimeter-path approach if needed; (3) App.tsx (717 lines) split into apps/client/src/{screens,bag,shop,hud} per tech-architecture.md § 5.1; (4) @dnd-kit migration replacing raw pointer events; (5) real Phaser combat overlay replacing canned 4s sequence in src/combat.tsx.

## 2026-04-26

- Reviewed Run Screen prototype build (Claude Code port of the Claude Design artifact). Layout, palette, recipe-detection logic (multiset match + BFS connectivity over edge-adjacency), placement validation (O(1) occupied-cell map), and code structure pass review against `visual-direction.md` and `gdd.md` § 14. CSS variables carry the palette; Tailwind is layout-only — correct separation for token-driven UI. No `localStorage`, no fabricated mechanics, no library drift beyond dropping lucide-react in favor of inline SVG (acceptable: prototype already shipped its own icon system optimized for the silhouette discipline checklist).
- Identified five fix items for revision pass: (1) recipe-glow stroke must be data-driven from output rarity, currently hardcoded to `--r-uncommon` in `index.css`; (2) round-end victory button recolored from rarity-uncommon green to accent blue, matching run-screen Continue CTA — rejected adding a third semantic palette extension; (3) combine button anchor moves from cluster centroid to bounding-box upper-right (centroid overlaps neighboring items in tight bags); (4) `R` rotation gated/silenced for square items (1×1, 2×2) to prevent visual-rotation-as-bug perception; (5) drag cleanup on `pointercancel` + window `blur` to eliminate stuck-drag-ghost footgun. Single-file `App.tsx` (717 lines) deferred to M1 graybox refactor when Claude Code splits into `apps/client/src/{screens,bag,shop,hud}` per `tech-architecture.md` § 5.1.
- Six DoD screenshots and the three-anchor monochrome silhouette test still outstanding from the prototype build — Claude Code refused to fabricate (correctly; sandboxed code agent has no browser). Trey to capture during the revision pass: mid-drag valid outline, invalid drop shake, rotation in progress, recipe-ready glow, post-combine state, round 5 returned state, plus monochrome 32×32 renders of Iron Sword / Healing Herb / Ember Brand for `visual-direction.md` § 11.1 silhouette test.
- Resolved body-color rule tension via Option A: identity/tag colors (plant, fire, food, blood, gold) override the "body color ≠ another rarity's color" rule, with frame border + corner gem doing the rarity work. Updated `visual-direction.md` § 5 wording: "Body color must not collide with another rarity's frame color *unless the body color is the item's natural material or tag color (fire, ice, plant, food, gold, blood)*. The corner gem and frame border resolve any rarity ambiguity." No item recolors needed. Healing Herb green, Apple red, Spark Stone amber, Copper Coin gold all hold. Rejected Option B (recolor to sage/burgundy/burnt-orange) — the original rule was written to prevent unmotivated rarity collisions, not to ban natural identity colors, and demanding identity colors dodge rarity colors leaves no palette for plants, fire, food, or blood (most of the item set).
- Locked Run Screen UX prototype (Claude Design artifact, ported to Vite app at repo root). Validates run-screen layout, drag/drop ergonomics (raw pointer events, not @dnd-kit — preserved fidelity to design package, dnd-kit deferred to M1 graybox), recipe glow legibility, and shop loop tempo before Claude Code begins on `apps/client`. Single Vite app, not monorepo (M0 scope; Turborepo + package boundaries are M1 architecture work). Canned 4-second combat overlay in `src/combat.tsx`, not Phaser (combat overlay belongs to M1 packages/sim work). Discarded after M1 graybox lands. Stack: React 18 + Vite + Tailwind core utilities + inline SVG icons, no external libraries beyond what artifacts ship with.

## 2026-04-27

- Locked `telemetry-plan.md` v0. Four M1 goals: run completion, synergy depth, time-to-fun, determinism integrity. Three dashboards (Run Health / Item Meta / Onboarding Funnel). PostHog cloud for M1, revisit at M2. `error_boundary_caught` added to M1 event set for crash visibility.
- Established M1 alert thresholds: tick-cap draws > 1%, item pick-rate < 2% or > 35%, recipe completion 0% over 50 runs, class win-rate gap > 8pp, build win-rate > 60%. All inherit from `balance-bible.md` § 16.
- Locked second style frame (390×844 mobile vertical, Round 7). Gridline scales to mobile cleanly. Anchor icons identifiable at 52px cell + 24px mono swatch. Bag occupies 88% of horizontal dim. Mobile pillar validated.
- Floating CTA placement on mobile is unresolved — original spec (bottom: 72px) overlaps the reroll button. Three options (inline, swap-with-reroll, full-width-bar) deferred to M1 component design. Not blocking.
- Schema bumped to v0.1 (additive). `Item.passiveStats` added (`maxHpBonus` / `bonusBaseDamage` / `goldPerRound`) — applied by run controller, sim never reads. `Trigger.maxTriggersPerCombat` added — caps single-use and limited-use items. `ContractMutator['boss_only']` extended with `hpOverride` / `damageBonus` / `lifestealPctBonus` for Forge Tyrant.
- Locked status stack caps: burn 10, poison 10, stun 1 (boolean). Codified in `STATUS_STACK_CAPS` constant in `content-schemas.ts` § 16. `BASE_COMBATANT_HP = 30` also lifted into the schema as a named constant.
- Locked Forge Tyrant as M1 boss: scripted Marauder ghost, 50 HP, "Tyrant's Wrath" aura (+2 damage, +15% lifesteal). See `balance-bible.md` § 15.
- Visual direction v1.1: added semantic UI palette extensions (`life-red` `#EF4444` for hearts, `coin-gold` `#F59E0B` for gold glyph) and the body-color rule (frame ≠ body color, except self-rarity).
- Locked first style frame (1280×720 desktop, Round 7 mid-game) and the three anchor icons after one revision pass: Iron Sword, Healing Herb, Ember Brand. All six silhouette discipline tests pass on all three anchors. Established two principles: (1) "rarity = frame, tag = body+accents, body color ≠ a different rarity's color"; (2) two semantic UI palette extensions allowed (`life-red`, `coin-gold`) outside the rarity language.
- Locked balance bible v0. 45 items, 12 recipes, 12 relics, 2 classes (Tinker recipe-bonus +10%, Marauder +1 dmg / +2 win-gold), 3 status effects, Forge Tyrant boss. Power budget framework: damage-equivalent per 12s combat. Common 6, Uncommon 10, Rare 14, Epic 21, Legendary 30. Pick-rate guardrails 2%/35% inherit from `concept-brief.md`.

## 2026-04-26

- Locked visual direction: **Gridline**. Palette + Inter typography baked. Tabular numerals mandatory on numeric displays. See `visual-direction.md`.
- Anchor icon set locked: Iron Sword (Common 1×2), Healing Herb (Common 1×1), Ember Brand (Rare 2×1 with on-hit burn). System-anchor set for first style frame.
- Silhouette discipline checklist (6 tests) adopted as acceptance gate for all icon work.

## 2026-04-25

- Locked content schemas v0. Branded IDs across all entity types. Discriminated unions for `Trigger`, `Effect`, `CombatEvent`, `ContractMutator`. See `content-schemas.ts`.
- Sim integer math via basis points (`itemCostMultiplierBp`, `sellRecoveryBp`). Floats forbidden in sim inputs.
- Combat events carry inline `remainingHp` to prevent replay-vs-sim drift.
- `DEFAULT_RULESET` fixes M1 baseline: 6×4 bag, 11 rounds, 3 hearts, 5 shop slots, 4g base income +1g per 3 rounds.

## 2026-04-25

- Locked stack: TypeScript + pnpm + Turborepo monorepo. React 18 + Vite for client shell. Phaser 3 for combat overlay only. Fastify + Zod for server. Pure-TS deterministic sim package (mulberry32 RNG, 10 ticks/sec, integer math). See `tech-architecture.md`.
- Locked sim API: `simulateCombat` → `CombatResult` with full event log. Sim runs to completion before playback. Byte-identical events across platforms (CI fixture suite, 200+ combats).
- Locked monorepo layout: `apps/{client,server}`, `packages/{sim,content,shared,ui-kit}`. Sim forbidden from importing DOM, React, Phaser, `Date`, `Math.random`.
- Renderer split: React owns bag UI / shop / HUD. Phaser overlay owns combat playback only.

## 2026-04-25

- Locked run structure: 11 rounds (10 standard + 1 boss), 3 hearts, 24-cell bag (6×4), 5 shop slots. See `gdd.md`.
- M1 content targets: 45 items, 12 recipes, 12 relics, 2 classes, 3 status effects, 1 boss.
- Manual recipe combine via click in M1. Reconsider after graybox playtest.

## 2026-04-24

- Adopted Packbreaker Arena from 8-concept evaluation. Source: project PDF.
- Set M0–M3 milestone structure (durations: ~1wk / 4–6wk / 10–12wk / 18–24wk). See `roadmap.md`.
- Set M2 demo-gate metrics: D1 ≥ 35%, run completion ≥ 55%, median session ≥ 1.6 runs, time-to-first-fun ≤ 4 min.
