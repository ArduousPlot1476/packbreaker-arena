# LEG 1 AFTER — playtest capture sheet

**One row per COMBAT.** The BEFORE half's weakness was n=2 on the qualitative
side; per-run rows cannot fix that, per-combat rows can. Fill a row the moment a
combat resolves — not at end of run, and not from memory afterwards.

- **Build stamp**: read it once at session start and again if you rebuild
  mid-play. A rebuild mid-session splits the population; if it happens, note the
  row number where it changed. (`clientVersion` is per-batch, so every event in a
  flush carries one value — `apps/client/src/telemetry/emit.ts:199-203`.)
- **⚠ The stamp names a commit, not a behaviour.** It is derived at build time
  from `git rev-parse --short HEAD` (`apps/client/vite.config.ts:19`, consumed
  `:28`), so a build made before a docs-only commit carries a stamp two commits
  behind while the client tree is byte-identical. That is CF-96 symptom (ii).
  Record the stamp AND how you established it matches the tree you meant to play.
- **Scope**: these five columns are LEG 1's five shipped behaviours and nothing
  else. Do not add an inspect-rate column — `item_inspected` does not exist yet
  and is out of scope for this leg.

---

## Session header — fill once

| field | value |
|---|---|
| date | |
| build stamp (`0.0.1+<sha>`) | |
| how the stamp was established as the tree you meant | |
| rebuild mid-session? (row # if yes) | |

---

## Per-run — one row per run

| run # | round reached | outcome (`won` / `eliminated` / `abandoned`) | notes |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |

---

## Per-combat — the measurement

**Scale for B1–B5: `Y` = yes / worked · `N` = no / failed · `?` = unsure ·
`n/a` = did not arise this combat** (B1–B3 only arise when the ramp fires;
`n/a` is a real and expected answer, not a skipped cell).

| # | run | round | **B1** header read `— SUDDEN DEATH —`? | **B2** floater `−3 · SUDDEN DEATH` legible? | **B3** tiebreak direction unambiguous? | **B4** knew WHY it ended, without reasoning? | **B5** DRAIN's meaning clear beside DEALT/TAKEN? | notes |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |
| 6 | | | | | | | | |
| 7 | | | | | | | | |
| 8 | | | | | | | | |
| 9 | | | | | | | | |
| 10 | | | | | | | | |
| 11 | | | | | | | | |
| 12 | | | | | | | | |
| 13 | | | | | | | | |
| 14 | | | | | | | | |
| 15 | | | | | | | | |
| 16 | | | | | | | | |
| 17 | | | | | | | | |
| 18 | | | | | | | | |
| 19 | | | | | | | | |
| 20 | | | | | | | | |
| 21 | | | | | | | | |
| 22 | | | | | | | | |
| 23 | | | | | | | | |
| 24 | | | | | | | | |
| 25 | | | | | | | | |
| 26 | | | | | | | | |
| 27 | | | | | | | | |
| 28 | | | | | | | | |
| 29 | | | | | | | | |
| 30 | | | | | | | | |

*(extend as needed — ~85 combats matched the BEFORE population)*

---

## Column definitions — what each question actually asks

**B1 — scene header renamed.** On the first `ramp_tick` the combat scene header
becomes `— SUDDEN DEATH —` and reverts on the next combat. *Did you register the
change at the moment it happened?* Not "was it there when you looked for it" —
noticing only on inspection is `N`.

**B2 — ramp floater.** The floater reads `−3 · SUDDEN DEATH`. *Was it legible at
the speed it appeared?* Combat fast-forwards past dead time, so the ramp can
arrive within ~90ms of mount. Illegible-because-too-fast is `N`, not `n/a`.

**B3 — tiebreak direction / TIED.** During the ramp the tiebreak shows who is
ahead, with a distinct `TIED` state. *Was the direction unambiguous* — could you
say who was winning without working it out from the HP bars?

**B4 — resolution cause.** The round panel derives and names why the combat
ended. *Did you know WHY it ended without reasoning about it?* This is the one
most likely to be answered generously; if you reconstructed the cause from the
HP bars or the log, that is `N`.

**B5 — DRAIN.** DRAIN renders as a third quantity beside DEALT and TAKEN. *Was
its meaning clear* — did you know what it counted, and that it explains rather
than alters DEALT/TAKEN? DEALT/TAKEN deliberately EXCLUDE the ramp, so a
ramp-resolved draw honestly reads `DEALT 11 · TAKEN 0`; if that pairing read as
a bug rather than as an explanation, `N`.

---

## After the session

1. Run `leg1-population.sql` **block 0** against the AFTER build stamp — confirm
   the set is what you think it is before computing anything.
2. Run **block 2** — `combats_raw` and `combats_distinct` must agree. If they do
   not, probe contamination reached the population.
3. Compare this sheet's row count to block 2. A gap means combats resolved that
   were not captured, and the qualitative half is incomplete — say so rather than
   scaling the percentages up to cover it.

⚠ `leg1-population.sql` has **never been executed** and is unvalidated against
data — see its STATUS banner. Reproducing the six BEFORE figures is the gate that
retires that banner, and it has not run yet.
