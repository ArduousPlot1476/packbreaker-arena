# Changelog

One line per merge. Newest at top. What changed, why, and anything to watch.

This replaces the per-merge essays that used to land in `decision-log.md`. That file stays
in the repo as history — it is a genuine record of how the sim, the schemas, and the
determinism corpus came to be the way they are, and it is worth reading when you need to
know *why* something is shaped a certain way. It is no longer appended to.

Format: `- **YYYY-MM-DD** — <what shipped>. <why, in a sentence>. <watch-out, if any>`

---

- **2026-08-05** — Review meta-audit on the above. Four review findings, three of them in
  code written that day, tripped the finding ceiling; a read-only audit of the whole surface
  then found **eight more**. The instructive one: every corpus strategy's *buy* gate is
  rotation-0-only while its *placement* calls use all four rotations, so no policy ever
  bought an item that fits only rotated — **12 of 45 items are non-square** — while the
  repaired instrument correctly counted those as live offers, because a human can rotate.
  Also: the harness's own header table, whose whole job is to argue the corpus and real-play
  paths are different games, had **three of its six real-play rows stale** and was describing
  a third game that exists nowhere. *Watch:* taking every placeable offer measured **worse**,
  not better — round-11 win 33.6% → 31.9% — because cells are the binding late-game
  constraint and every correction pays the 50% sell recovery. The clause stays, since the
  instrument must not credit an offer no policy can take, but "competent" here means capable,
  not optimal.
- **2026-08-05** — Boss retuned 50/+2/+15% → **45/+1/+15%**. `balance-bible.md` §15 has
  asked for a ~30% first-attempt win rate since M0 and it had never been measured; measured,
  the shipped numbers gave **15.5%** against a competent player model and **8.9%** against a
  weaker one. Now **≈32%** and 18.5%, and runs that end in victory roughly double. *Watch:*
  the competent-model figure is a band, not a point — it moved 33.6 → 31.2 → 31.9 → 32.6
  across three player-model fixes during review, because a boss win rate is a property of the
  model as much as of the boss. Treat it as a floor and re-measure. **Zero
  fixture re-baseline, proved not assumed** — all 224 `.jsonl` run `contractId: "neutral"`,
  so the boss mutators are never exercised; determinism passed unchanged at 231/231 with no
  fixture file touched. *Watch:* the round-11 fight still ends at median tick ~60 against
  100–210 everywhere else — two seconds of playback for the climax. Boss HP does not move it
  (swept 40→100, `medianTicks` never left 60–61) because the median round-11 combat is the
  *player* dying, and the aura owns only 1 of the boss's +6 damage — `conquerors-crown` is
  +4 and is also a player reward, so that lever cuts both ways.
- **2026-08-05** — The harness's headline pacing metric was measuring the opposite of pacing.
  `EMPTY ROUNDS` sampled its inputs at Continue, *after* the player had spent, so buying
  three items scored a round empty and hoarding 39 gold scored it full of choice; it never
  checked placeability at all despite its docstring promising it; and it used raw `item.cost`
  instead of `effectiveItemCost`. Repaired, the same population inverts — rounds 1–6 read
  0.0% empty and rounds 9/10/11 read 50/79/91%. A new `sell-to-fit` policy supplies the one
  move `greedy` structurally cannot make (a full bag was an absorbing state: no buy →
  no sell → no buy). *Watch:* tuning the boss against the pre-repair 8.4% would have
  over-corrected by ~2×. Repair instruments before turning knobs. Tooling-only, zero diff
  outside `tooling/`.
- **2026-08-05** — **Measured and deliberately left open**, so the next person doesn't
  rediscover them: (1) **draws 3.4–3.7% vs a <1% guardrail**, and *0% of them are inert* —
  every one is the sudden-death ramp erasing a real lead, since death tick is
  `499 + ceil(hp/3)` and same-bucket HP dies on the same tick. `RAMP_RATE` 3→2 is the only
  affordable constant change, lands ~2.5%, and still misses; rate 1 forces
  `RAMP_START_TICK` to 371, which collapses the resolver set from four Commons to one and
  guts the 2b-1 shop guarantee. The fix that *would* work is an HP tiebreak inside the death
  check — new sim behaviour, 200 `.jsonl` + 3 combat `.json` + all of `combat-ramp.test.ts`.
  (2) **Class gap 11.1 pts, and it is an ECONOMY gap, not a damage gap.** Marauder's
  `bonusGoldOnWin: 2` on a base `winBonusGold` of 1 is a 3× multiplier on win income; sweeping
  the base to 0/1/6 moves the gap monotonically to 12.9/10.4/4.8. It also *widens* to 13.3
  under competent play, because extra gold is worth more to someone who can spend it. Every
  lever costs a 224-fixture re-baseline, so it should be paid once, batched with the late-game
  economy work. (3) **Rounds 1–2 are unlosable** — 0 losses in 3,200 combats, round 2 at
  100.0% win. Recorded as a deliberate onboarding ramp (`concept-brief.md` wants first-won-round
  ≤4 min; Stage 5's tutorial wants a round a stranger wins), owned by Stage 5.
- **2026-08-05** — Early game fixed: it was *unresolvable*, not merely unbalanced. Rounds
  1–2 drew 50–60% of the time and **91% of all draws were combats where neither side dealt
  any damage** — only 4 of 20 Commons can win round 1. The shop and the early ghost now
  guarantee a resolver, the ghost curve tracks the player's bag fill, and ghost HP opens at
  20 instead of 30. Inert combats 27.2% → 0.2%; draws 22.3% → 2.4%; median run 3/11 → 10/11
  under the player-model policy. All client-side: **zero diff** under `packages/content` and
  the 224-fixture corpus. *Watch:* draws are 2–3% against a <1% guardrail, the boss sits at
  ~4% against a ~30% target, and the class gap widened 7.6 → 10.6 pts (weapon-dense combat
  amplifies Marauder's flat +1 while Tinker's recipe passive is near-dead at 0.5/run).
- **2026-08-05** — Balance harness gains the diagnostics that made the above findable:
  per-side damage + a `bothSidesInert` flag, purchases/gold/cells per round, a
  `--hearts`/`--gold`/`--shop` sweep via an additive `rulesetOverride` on `CreateRunInput`,
  and a `resolver-first` policy. *Watch:* the five corpus strategies buy by slot index and
  will walk past a weapon — they measure a bot declining to play. Report both.
- **2026-08-04** — Deploy config: `vercel.json` (client), `apps/server/Dockerfile` +
  `fly.toml` (server), and `DEPLOY.md`. The game has never been hosted. The client
  works without the server — Clerk is optional and telemetry failures are swallowed —
  so it can ship on its own as a complete playable game. *Watch:* nothing is deployed
  yet; this is config plus a runbook. The build must run inside a git checkout or
  `clientVersion` degrades to `local` and every session lands in one telemetry bucket.
- **2026-08-04** — Title screen, settings, and reduced-motion support. Closes the last
  unbuilt screen in `gdd.md` §14.1 (CF 69) — the app used to boot straight into class
  select. Settings ship reduced motion and combat playback speed (CF 10), stored under
  their own localStorage key so a save migration or server overwrite can never touch
  them. Removes the fake "EXPAND ↑" control from the bottom chrome.
- **2026-08-04** — Error boundary + branding. `error_boundary_caught` gets its first
  emit site since being typed in 2026-04-27 (CF 50). The fallback can discard a
  poisoned save, which is the difference between a bad run and a permanently bricked
  game. Adds `public/` (it did not exist): favicon, OG card, real page title.
- **2026-08-04** — Desktop frame scales to fit the viewport instead of sitting as a
  1280×720 island. Surfaced two coordinate-frame bugs invisible to the test suite:
  Phaser sized its world from the CSS-transformed rect (canvas 4× too large, ghost
  portrait off-screen), and the combat VFX handshake mixed screen and design space.
  *Watch:* both were found by driving real Chrome — happy-dom has no layout engine,
  so geometry assertions there are vacuously green.
- **2026-08-04** — Run-end and relic-offer screens moved back inside the design system.
  Both referenced CSS custom properties that don't exist (`--bg-card`, `--border`) and
  silently fell through to grey fallbacks, so they rendered charcoal while the rest of
  the game is navy. Adds a test that fails on any `var(--x)` not declared in
  `index.css` — it found a third instance immediately. Run-end now shows the final bag.
- **2026-08-04** — Palette collapsed to one source (`packages/ui-kit/src/palette.ts`).
  It previously existed as three hand-synced copies. `index.css` is pinned to it by a
  test, and the Tailwind token layer from `visual-direction.md` §12 finally exists.
- **2026-08-04** — Ghost item count lifted for rounds 4–10 (`[1,1,2,2,2,3,3,4,4,5,5]` →
  `[1,1,2,3,4,5,5,6,7,8,5]`). Those rounds measured 76 combats / 76 player wins / zero
  losses because the ghost hit a hard 5-item cap while the player is bounded only by the
  24-cell bag. Rounds 1–3 and the round-11 boss are unchanged. Client-only; zero diff under
  `packages/sim` and `packages/content`, so the determinism corpus is untouched. *Watch:*
  this was tuned by derivation, not measurement — re-verify against the balance harness
  once it exists.
