-- ============================================================================
-- Packbreaker Arena — LEG 1 population query (HogQL / PostHog)
--
-- ⚠⚠ STATUS: NEVER EXECUTED. THIS QUERY HAS NOT BEEN VALIDATED AGAINST DATA. ⚠⚠
--   It was authored from the canonical event schemas (cited below), NOT by
--   running it and checking the output. Nobody has yet confirmed that it
--   reproduces the LEG 1 BEFORE figures at decision-log.md 2026-07-26
--   § "CF-93 LEG 1 CLOSED ON MERGE …".
--
--   It could not be run at authoring time: the PostHog query API needs a
--   personal API key (phx_…, scope query:read) AND a numeric PROJECT_ID, and
--   NEITHER exists in this repo or environment. What exists is
--   POSTHOG_PROJECT_KEY (phc_…) — the INGESTION key posthog-node uses for
--   capture() (apps/server/src/posthog/client.ts:61), which cannot read.
--
--   FIRST RUNNER: reproduce the six figures (blocks 1–6) against build
--   '0.0.1+3853228' and record the result. If every figure reproduces, delete
--   this banner and say so in the decision-log entry that cites it. If ANY
--   figure misses, STOP — that is a canon correction touching the round-11
--   "TARGET MISSED" ruling and its Wilson interval, and it needs a ruling
--   before the query is adjusted. Do not tune the query to fit the numbers.
--
-- WHY THIS FILE EXISTS
--   Rule 38: any figure entering decision-log.md needs a TRACKED artifact
--   sufficient to reproduce it. Chat prose, gitignored dirs and session
--   scratchpads do NOT count. Before this file, every PostHog figure in canon
--   was a REPRODUCTION transcribed by hand — decision-log.md 2026-07-26
--   § "CF-93 LEG 1 CLOSED ON MERGE …" states so itself ("The raw table is
--   REPRODUCED in the requesting prompt, not primary"), and the same shape is
--   recorded at 2026-07-25 § "CF-93 ROUND-1 PER-CLASS MATRIX RECORDED …".
--   This file is the reproduction path. It is the artifact, not a copy of one.
--
-- KEYED ON BUILD, NOT ON TIME — THIS IS THE POINT
--   A timestamp-bounded query over this dataset is NOT idempotent: CDP visual-
--   probe runs emit run_start→run_end into the LIVE dataset, so the same window
--   returned 85 rows and later 87 (CF-96 symptom (i)). `clientVersion` is fanned
--   onto every event at ingest from the batch envelope
--   (apps/server/src/posthog/forward.ts:37), so a build-keyed query returns the
--   same population every time it is run. Never re-introduce a date filter as
--   the primary bound.
--
-- ⚠ THE PROBE EXCLUSION IS A CONVENTION, NOT A MECHANISM
--   Probe runs self-identify only because their save fixture sets a distinctive
--   telemetryAnonId, which becomes distinct_id at ingest (forward.ts:33):
--     scratch/cf93-p25/mkSave.mts:81           → 'leg1-visual-probe'
--     scratch/cf95-recipe-ladder/mkSave.mts:70 → 'recipe-ladder-visual-probe'
--   NOTHING ENFORCES THIS. There is no probe-mode / test-mode / environment
--   discriminator anywhere in the telemetry path — verified by `git grep -n -E
--   "NODE_ENV|import\.meta\.env|MODE|isProbe|probeMode|testMode|synthetic"` over
--   apps/client/src/telemetry, apps/server/src/routes/telemetry.ts,
--   apps/server/src/posthog, apps/server/src/validation/telemetryBatch.ts,
--   apps/server/src/env.ts → zero matches. A probe authored by someone who does
--   not know this convention lands in the population INDISTINGUISHABLE from
--   real play. Treat block 0 as a tripwire, not a guarantee.
--
-- HOW TO RUN — path A, PostHog UI (this is the supported path)
--   1. Open PostHog → your project → "SQL" (Product analytics → SQL editor).
--        host: see POSTHOG_HOST (apps/server/.env.example → https://us.i.posthog.com)
--   2. Set the population in the EDIT ME block below.
--   3. The editor runs ONE statement at a time. Select a single numbered block
--      (0–7) and press Run. Do not paste the whole file and press Run once.
--   4. Record each block's output into the decision-log entry that cites it.
--
-- HOW TO RUN — path B, HTTP API (credentials are NOT in this repo)
--     POST  $POSTHOG_HOST/api/projects/<PROJECT_ID>/query/
--     -H    "Authorization: Bearer <PERSONAL_API_KEY>"   # phx_…, scope query:read
--     -H    "Content-Type: application/json"
--     -d    '{"query":{"kind":"HogQLQuery","query":"<one block, single line>"}}'
--   ⚠ See the STATUS banner: path B is currently UNAVAILABLE to automation
--     because neither a phx_ key nor a PROJECT_ID is stored anywhere here.
--
-- PROPERTY REFERENCE (canonical shapes, packages/content/src/schemas.ts)
--   combat_end  :1039-1051 → runId, round, outcome, endedAtTick, damageDealt,
--                            damageTaken, endReason?     (endReason OPTIONAL —
--                            pre-CF-84 clients omit it; :1050)
--   run_start   :928-936   → runId, classId, contractId, seed, startingRelicId,
--                            entryMode
--   run_end     :937-943   → runId, outcome, roundReached, heartsRemaining
--   every event            + clientVersion, tsServer, tsClient, sessionId
--                            (clientVersion + tsServer injected at forward.ts:37)
--
--   ENUM LITERALS — use these exactly, do not invent:
--     CombatOutcome :721 = 'player_win' | 'ghost_win' | 'draw'
--     EndReason     :733 = 'ko' | 'ramp_ko' | 'timeout'
--     RunOutcome    :534 = 'in_progress' | 'won' | 'eliminated' | 'abandoned'
--     RoundOutcome  :507 = 'win' | 'loss'
--   NOTE combat_end.outcome is a CombatOutcome, NOT win/loss. These blocks
--   report the RAW breakdown and never bake in a collapse — "heart-costing"
--   (loss OR draw) and "win rate" are different collapses of the same rows and
--   canon uses both. Derive the collapse you want from block 3/4 output.
--
--   toInt()/toFloat() are applied to numeric properties because JSON-stored
--   properties can surface as strings; comparing a string to a number silently
--   returns no rows. If a block returns 0 where you expect rows, check this
--   first — it is the most likely authoring error in an unvalidated query.
-- ============================================================================


-- ─── EDIT ME ────────────────────────────────────────────────────────────────
-- Both literals below are repeated verbatim in every block so each block is
-- independently runnable (the UI runs one statement at a time). Keep in sync.
--
--   BUILD SET : ('0.0.1+3853228')            ← the LEG 1 BEFORE population
--   PROBE IDS : ('leg1-visual-probe', 'recipe-ladder-visual-probe')
--
-- ⚠ The BEFORE build set is ASSUMED to be the single value above, taken from
--   decision-log.md 2026-07-26 § "CF-93 LEG 1 CLOSED ON MERGE …". It has NOT
--   been derived from the data. The pooled round-11 figure (8/11) crosses
--   sessions and may cross builds. RUN BLOCK 0 FIRST and replace this set with
--   what the data actually shows.
--
-- To scope the AFTER population, replace the build set with the AFTER stamp(s).
-- Use a SET, not a single value: a play session that spans a rebuild produces
-- more than one stamp, and block 0 is what tells you.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 0. WHICH BUILDS EXIST, AND WHAT DID PROBES CONTRIBUTE ───────────────────
-- RUN THIS FIRST. It derives the clientVersion set from the data instead of
-- assuming one, and shows probe contamination per build so the exclusion in
-- blocks 1–7 can be shown to have bitten (or to have been unnecessary).
SELECT
  properties.clientVersion                                                    AS build,
  count(DISTINCT properties.runId)                                            AS runs_all,
  countIf(distinct_id IN ('leg1-visual-probe', 'recipe-ladder-visual-probe')) AS probe_events,
  count()                                                                     AS events_all,
  min(timestamp)                                                              AS first_seen,
  max(timestamp)                                                              AS last_seen
FROM events
WHERE event IN ('run_start', 'run_end', 'combat_end')
GROUP BY build
ORDER BY first_seen ASC


-- ── 1. RUN COUNT ────────────────────────────────────────────────────────────
-- canon claims: 8
SELECT count(DISTINCT properties.runId) AS runs
FROM events
WHERE event = 'run_start'
  AND properties.clientVersion IN ('0.0.1+3853228')
  AND distinct_id NOT IN ('leg1-visual-probe', 'recipe-ladder-visual-probe')


-- ── 2. COMBAT COUNT (raw vs de-duplicated) ──────────────────────────────────
-- canon claims: 85
-- The two columns MUST agree. If they do not, the population contains repeated
-- (runId, round) rows — the exact signature that turned 85 into 87. Report both
-- numbers; never silently take the distinct one.
SELECT
  count()                                              AS combats_raw,
  count(DISTINCT (properties.runId, properties.round)) AS combats_distinct
FROM events
WHERE event = 'combat_end'
  AND properties.clientVersion IN ('0.0.1+3853228')
  AND distinct_id NOT IN ('leg1-visual-probe', 'recipe-ladder-visual-probe')


-- ── 3. ROUND 11 — RAW OUTCOME BREAKDOWN ─────────────────────────────────────
-- canon claims: pooled 8/11 player wins (72.7%), Wilson [43.4%, 90.3%]
SELECT
  properties.outcome AS outcome,          -- 'player_win' | 'ghost_win' | 'draw'
  count()            AS n
FROM events
WHERE event = 'combat_end'
  AND toInt(properties.round) = 11
  AND properties.clientVersion IN ('0.0.1+3853228')
  AND distinct_id NOT IN ('leg1-visual-probe', 'recipe-ladder-visual-probe')
GROUP BY outcome
ORDER BY n DESC


-- ── 4. ROUNDS 4–10 — RAW OUTCOME BREAKDOWN ──────────────────────────────────
-- canon claims: 51/54 (94.4%)
SELECT
  properties.outcome AS outcome,
  count()            AS n
FROM events
WHERE event = 'combat_end'
  AND toInt(properties.round) BETWEEN 4 AND 10
  AND properties.clientVersion IN ('0.0.1+3853228')
  AND distinct_id NOT IN ('leg1-visual-probe', 'recipe-ladder-visual-probe')
GROUP BY outcome
ORDER BY n DESC


-- ── 5. DRAWS (all rounds) ───────────────────────────────────────────────────
-- canon claims: 3 of 85 (3.5%). balance-bible.md § 2 target: <1% of combats.
SELECT
  count()                          AS draws,
  count(DISTINCT properties.runId) AS runs_with_a_draw
FROM events
WHERE event = 'combat_end'
  AND properties.outcome = 'draw'
  AND properties.clientVersion IN ('0.0.1+3853228')
  AND distinct_id NOT IN ('leg1-visual-probe', 'recipe-ladder-visual-probe')


-- ── 6. ramp_ko AT EXACTLY TICK 500 ──────────────────────────────────────────
-- canon claims: 6 of 13
-- CF-88's premise: these are the combats whose true cause is undeterminable by
-- construction — the ramp tick and an item kill coincide.
SELECT
  countIf(toInt(properties.endedAtTick) = 500) AS ramp_ko_at_500,
  count()                                      AS ramp_ko_total
FROM events
WHERE event = 'combat_end'
  AND properties.endReason = 'ramp_ko'
  AND properties.clientVersion IN ('0.0.1+3853228')
  AND distinct_id NOT IN ('leg1-visual-probe', 'recipe-ladder-visual-probe')


-- ── 7. ROW-LEVEL DUMP (for re-derivation and audit) ─────────────────────────
-- Everything §§ 3–9 of the LEG 1 entry rests on, one row per combat. Export
-- this alongside any entry that cites a derived figure, so a later reader can
-- recompute rather than trust.
SELECT
  properties.runId              AS runId,
  toInt(properties.round)       AS round,
  properties.outcome            AS outcome,
  properties.endReason          AS endReason,
  toInt(properties.endedAtTick) AS endedAtTick,
  toInt(properties.damageDealt) AS damageDealt,
  toInt(properties.damageTaken) AS damageTaken,
  properties.clientVersion      AS build,
  distinct_id                   AS distinctId,
  timestamp                     AS ts
FROM events
WHERE event = 'combat_end'
  AND properties.clientVersion IN ('0.0.1+3853228')
  AND distinct_id NOT IN ('leg1-visual-probe', 'recipe-ladder-visual-probe')
ORDER BY runId ASC, round ASC
