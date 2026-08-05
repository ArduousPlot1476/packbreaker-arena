# Changelog

One line per merge. Newest at top. What changed, why, and anything to watch.

This replaces the per-merge essays that used to land in `decision-log.md`. That file stays
in the repo as history — it is a genuine record of how the sim, the schemas, and the
determinism corpus came to be the way they are, and it is worth reading when you need to
know *why* something is shaped a certain way. It is no longer appended to.

Format: `- **YYYY-MM-DD** — <what shipped>. <why, in a sentence>. <watch-out, if any>`

---

- **2026-08-04** — Ghost item count lifted for rounds 4–10 (`[1,1,2,2,2,3,3,4,4,5,5]` →
  `[1,1,2,3,4,5,5,6,7,8,5]`). Those rounds measured 76 combats / 76 player wins / zero
  losses because the ghost hit a hard 5-item cap while the player is bounded only by the
  24-cell bag. Rounds 1–3 and the round-11 boss are unchanged. Client-only; zero diff under
  `packages/sim` and `packages/content`, so the determinism corpus is untouched. *Watch:*
  this was tuned by derivation, not measurement — re-verify against the balance harness
  once it exists.
