# Changelog

One line per merge. Newest at top. What changed, why, and anything to watch.

This replaces the per-merge essays that used to land in `decision-log.md`. That file stays
in the repo as history — it is a genuine record of how the sim, the schemas, and the
determinism corpus came to be the way they are, and it is worth reading when you need to
know *why* something is shaped a certain way. It is no longer appended to.

Format: `- **YYYY-MM-DD** — <what shipped>. <why, in a sentence>. <watch-out, if any>`

---

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
