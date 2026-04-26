# Packbreaker Arena — Game Design Document (v0)

> Source of truth for mechanics, systems, content surfaces, and UI flow. Pillars and anti-goals live in `concept-brief.md`. Numbers in this doc are the starting line; `balance-bible.md` owns final tuning.

---

## 1. Run anatomy

A **run** is a single 12–20 minute session.

- **Run length**: 10 standard rounds + 1 boss round = **11 rounds**.
- **Lives**: 3 hearts. Lose a heart on a round loss. Run ends at 0 hearts or after the boss.
- **Pacing target**: median round resolution (shop → arrange → combat → reward) under 90 seconds.
- **Outcome states**: `won` (defeated boss), `eliminated` (0 hearts), `abandoned` (left mid-run, telemetered separately).
- **Rewards on win**: trophy delta, run completion contributes to daily contract progress.

### Run-level inputs picked at start
- **Class** (1 of 2 in M1).
- **Starter relic** (1 of 3 offered, class-filtered).
- **Active contract** (daily seed if available, otherwise neutral).

---

## 2. Round flow

Every round runs the same loop:

1. **Pre-round** (auto, ~1s): opponent ghost selected, intent hint surfaced (left rail).
2. **Shop & arrange** (player-paced, soft target ≤ 60s): buy, sell, reroll, drag/drop, rotate, craft.
3. **Combat** (auto, 8–20s simulated, accelerated playback): deterministic battle. No player input.
4. **Resolution** (player-paced, soft target ≤ 10s): rewards, heart change, "view opponent build" optional, continue.

Shop and arrange are a **single phase** — no separate "lock in" step. Player presses **Continue** to start combat.

### Round-level economy
- **Base income**: 4 gold per round, +1 every 3 rounds.
- **Win bonus**: +1 gold.
- **Reroll cost**: starts at 1, increments per reroll within a round, resets next round.
- **Sell value**: 50% of purchase cost (rounded down).
- **Carry-over**: gold persists between rounds. Items in bag persist. Items in shop do not.

---

## 3. Bag system

The bag is the puzzle. Every interaction in the game funnels through it.

### Grid
- **Default shape**: 6 wide × 4 tall = 24 cells (M1 baseline).
- **Class variation** (post-M1): one class may use a non-rectangular shape (e.g., 5×5 with corner cutouts). M1 = both classes use the default rectangle.
- **Coordinates**: `(col, row)`, `(0,0)` top-left.

### Item shapes
- **1×1** (most common, Commons).
- **1×2 / 2×1** (mid-rarity).
- **2×2** (high-rarity power items).
- **L-shape, T-shape** (rare, recipe outputs).
- All shapes obey the bag boundary. No overlap allowed.

### Rotation
- 4 rotational states (0°, 90°, 180°, 270°).
- Rotation hotkey: `R` desktop, dedicated rotate button mobile.
- Rotation does **not** change item behavior — only fit. (M1 simplification. M3 may introduce directional items.)

### Adjacency
- **Default model**: 4-neighbor orthogonal (cells sharing an edge).
- Adjacency triggers are item-specific: an item with `on_adjacent: weapon` activates when any cell of a weapon item touches any cell of this item.
- Diagonal adjacency exists as a **tag** on specific items (rare), not the default.

### Visual affordances
- Valid drop: green outline.
- Invalid drop: red outline + shake.
- Recipe-ready (item arrangement matches a recipe): pulsing gold glow on participating cells.
- Active during combat: cell flashes on trigger.

---

## 4. Shop & economy

### Shop layout
- **5 item slots** per round (M1 baseline).
- Items rerolled per round (full refresh between rounds).
- Reroll button: refreshes all 5 slots. Increasing cost within a round.
- Frozen items: **not in M1**. Move to M3 if telemetry shows hoarding behavior.

### Item availability
- Pool filtered by current round (rarity gates open over time).
- **Round 1–3**: Common only.
- **Round 4–6**: Common + Uncommon.
- **Round 7–9**: + Rare.
- **Round 10**: + Epic.
- **Boss reward**: guaranteed Epic or Legendary choice (1 of 3).
- Class-specific items appear at boosted weight in their owner's pool.

### Economy targets
- A "fair" run lets the player buy ~2 items per round on average.
- A reroll-heavy round costs the player one purchase.
- Selling a 1×1 Common for 50% provides ~1.5 gold round-1.

(All numbers ratified in `balance-bible.md` § Economy curves.)

---

## 5. Items

### Item record (canonical fields, see `content-schemas.ts`)
- `id`, `name`, `rarity`, `class_affinity` (nullable), `shape`, `tags[]`, `cost`, `triggers[]`, `effects[]`, `art_id`.

### Triggers (M1 set)
- `on_round_start` — fires once at combat start.
- `on_cooldown` — fires every X seconds during combat.
- `on_hit` — fires when this item or owner deals damage.
- `on_taken_damage` — fires when owner takes damage.
- `on_adjacent_trigger` — fires when an adjacent item triggers.
- `on_low_health` — fires once when owner drops below 50% HP.

### Effect primitives (M1 set)
- `damage(n)`, `heal(n)`, `apply_status(burn|poison|stun, stacks, duration)`, `add_gold(n)` (out-of-combat only), `buff_adjacent(stat, n)`, `summon_temp_item(id)`.

### Rarity bands
| Rarity | Pool weight | Cost | Power budget |
|---|---|---|---|
| Common | 60% | 3g | 1.0 |
| Uncommon | 25% | 5g | 1.6 |
| Rare | 10% | 7g | 2.4 |
| Epic | 4% | 9g | 3.5 |
| Legendary | 1% | 12g | 5.0 |

Power budget is the abstract per-item value used in `balance-bible.md` to score builds.

### M1 content target: ~45 items
- **20 Common** (broad, role-defining basics — sword, shield, bag of coins, herb).
- **12 Uncommon** (mild synergies — flame sword, healing herb).
- **8 Rare** (named effects — recipe ingredients, trigger chains).
- **4 Epic** (build-defining — class capstones).
- **1 Legendary** (boss-only reward, M1 placeholder).

---

## 6. Recipes

A **recipe** is a recognized arrangement of 2–3 items that produces a stronger item, replacing the input cells with the output item.

### Recipe model
- **Trigger**: arrangement detection (specific items in a specific relative configuration).
- **Optional shape requirement**: some recipes care about which item is "on top" or "to the left of" another (use sparingly in M1).
- **Result**: input items removed, output item placed in the input footprint.
- **Manual confirmation**: M1 shows recipe-ready glow, requires player click on a "Combine" button on the glowing cluster. (No silent auto-combine — readability first.)

### M1 content target: 12 recipes
- 6 simple (2 Commons → 1 Uncommon).
- 4 mid (1 Uncommon + 1 Common → 1 Rare).
- 2 capstone (3 specific Rares → 1 Epic, class-flavored).

---

## 7. Status effects

M1 ships **3 status effects**. Stacking and decay rules are status-specific.

| Status | Effect | Stacking | Decay |
|---|---|---|---|
| Burn | Lose 1 HP per second per stack | Stacks add | -1 stack per 2s |
| Poison | Lose stacks-equal HP at end of each combat tick (1s ticks) | Stacks add | Persists full combat |
| Stun | Skip next `on_cooldown` trigger | Boolean (not stacked) | Single-use |

Status visualization: small icon over the affected combatant's portrait with stack count.

---

## 8. Classes

M1 ships **2 classes**. Working names — finalize in `balance-bible.md`.

### Tinker (synergy / recipe-focused)
- **Passive**: First recipe each round costs 0 gold action; recipe outputs gain +10% effect.
- **Affinity items**: Crafting tools, gizmos, alchemy.
- **Starter relics**: bias toward extra reroll, recipe scouting, item discount.

### Marauder (aggression / stats-focused)
- **Passive**: +1 base attack damage; gold gained on round win is +2.
- **Affinity items**: Weapons, armor, raw-stat trinkets.
- **Starter relics**: bias toward damage multipliers, on-hit triggers, lifesteal.

Both classes share the default 6×4 bag in M1. Differentiation is item pool weighting + passive + relics.

---

## 9. Relics

A **relic** is a passive run-long modifier. Three slots:

- **Starter relic**: chosen at run start, class-filtered.
- **Mid-run relic**: awarded after round 5 (1 of 3 choice).
- **Boss relic**: awarded for defeating the boss — bragging rights only in M1, persists into ladder cosmetics in M2.

Relics never occupy bag cells. They sit on the left rail.

### M1 content target: 12 relics (6 per class).

---

## 10. Contracts

A **contract** is a ruleset modifier that applies to a specific run.

### Daily contract (M1)
- One per day, server-seeded.
- Examples: "Shop has 6 slots; items cost +1 gold." / "Adjacent triggers fire twice; reroll cost doubled."
- Daily leaderboard: best trophy result on today's contract.
- Runs without daily participation use the **neutral contract** (vanilla rules).

### Run-level contract objectives
Each run has a soft objective surfaced at start (e.g., "Win using only Uncommon-or-better items," "Complete a recipe before round 4"). Optional. Completing grants bonus gold or a free reroll.

---

## 11. Ghost battles

The opponent every round is a **ghost** — a snapshot of another player's bag at that round number.

### Ghost record
- `bag_snapshot` (item placements, rotations).
- `class`, `relics`, `hearts_remaining`.
- `seed` (RNG seed for combat determinism).
- `recorded_round`, `trophy_at_record`, `submitted_at`.

### Matchmaking (M1)
- Match on: same `recorded_round`, ±1 trophy band.
- **Bot fallback**: if pool empty, generate a procedural ghost from a parameterized template (round-appropriate item count, valid arrangement). Critical for early-population days.

### Submission
- Every completed round submits the player's bag as a potential ghost.
- Storage: latest N ghosts per round per trophy band, FIFO eviction. (Specific N decided in `tech-architecture.md`.)

---

## 12. Replay

Every round produces a **replay log**: deterministic event stream sufficient to reconstruct combat from `(initial_state, seed)`.

- Replay is rendered the same way live combat is — same simulation package, same playback layer.
- Used for: post-round "view opponent build," daily contract leaderboard top-replays (M2), share-link replays (M2).
- M1 only renders replays inside the run. No external sharing.

---

## 13. Meta progression

M1 keeps meta minimal — the run is the product.

- **Trophies**: persist across runs. Win → +trophies (scaled by round reached). Lose → -trophies (small). Used for matchmaking bands and M2 rank cosmetics.
- **Account-level XP**: not in M1. Reconsider M2.
- **Unlocks**: all M1 items and classes available from day 1. No item unlock progression.
- **Daily streak**: number of consecutive days a daily contract was attempted. Cosmetic flair only.

---

## 14. UI flow & screens

### Screen inventory (M1)
1. **Title** → New Run / Continue / Daily / Settings.
2. **Class select** → 2 cards, brief passive blurb, "next."
3. **Starter relic select** → 3 cards, "begin."
4. **Run screen** (the bag board — 95% of player time).
5. **Round resolution overlay** → win/loss banner, rewards, "next."
6. **Run-end summary** → trophies delta, build snapshot, "share replay" (placeholder M1), "new run."
7. **Daily contract panel** (modal from title).

### Run screen layout — desktop (1280×720 baseline)
- **Top bar** (48px): gold • hearts • round X/11 • contract objective text.
- **Left rail** (180px): class passive icon, relic slots (1–3), opponent intent panel.
- **Center** (flexible, ≥720×480 for the bag area): bag grid, dominates.
- **Right rail** (260px): shop (5 slots), reroll button, sell zone, "Continue" CTA when ready.
- **Bottom panel** (collapsible, default collapsed): combat log, last-round damage chart.

### Run screen layout — mobile (390 wide vertical)
- **Top bar** (compact): gold • hearts • round.
- **Bag**: always visible. Center, full-width.
- **Bottom tabs**: [Shop] [Crafting] [Relics] [Log]. Default tab = Shop.
- **Continue CTA**: floating bottom-right.
- **Drag mechanics**: long-press to pick up; tap-tap to rotate while dragging.

### Critical readability rules
- Rarity is communicated by **frame color AND a corner gem shape** (color-blind safety).
- Recipe-ready glow must be visible without hovering.
- Opponent intent shows the opponent's apparent class and 1–2 marquee item silhouettes — never their full bag pre-combat.

---

## 15. Onboarding

Target: first won round in ≤ 4 minutes for new accounts (`concept-brief.md` § Success metrics).

### Tutorial run (mandatory once per account)
- Pre-built starter bag with 3 items already placed.
- Scripted ghost opponent designed to lose to that bag.
- Scripted shop in round 2 with one obvious purchase (a known synergy with starting items).
- Scripted recipe in round 3 (adjacent placement triggers the glow, click-to-combine).
- Tutorial ends after round 3. Player kicked into a normal run with full controls.

### Skip after first
"Skip tutorial" surfaces on subsequent New Run flows, off by default for the first run.

---

## 16. Telemetry hooks (cross-ref)

Full event taxonomy lives in `telemetry-plan.md`. The GDD requires the following surfaces emit events:

- Run lifecycle: `run_start`, `run_end` (with outcome, round_reached, seed).
- Round lifecycle: `round_start`, `round_end` (with hearts, gold, items_count).
- Shop: `shop_purchase`, `shop_sell`, `shop_reroll`.
- Bag: `item_placed`, `item_rotated`, `item_moved`, `recipe_completed`.
- Combat: `combat_start`, `combat_end` (with damage_dealt, damage_taken, win/loss).
- Onboarding: `tutorial_step_reached` (with step_id), `tutorial_completed`, `tutorial_abandoned`.
- Daily: `daily_contract_started`, `daily_contract_completed`.

---

## 17. Open questions (need resolution before content build)

1. **Bag grid size**: locked at 6×4 = 24 for M1, or test 5×4 = 20 for tighter early decisions? *(Affects ~all balance numbers.)*
2. **Item shape distribution**: should ≥50% of M1 items be 1×1 for clarity, or push to ~40% with more multi-cell items for spatial puzzling? *(Affects bag tension feel.)*
3. **Manual vs. auto recipe combine**: M1 spec says manual click. Worth testing auto in graybox? *(Affects readability vs. flow.)*
4. **Class names**: "Tinker" and "Marauder" are placeholders. Final names + theme to be set in `visual-direction.md`.
5. **Tutorial — mandatory or skippable on first run**: spec says mandatory once. Trey gut-check?
6. **Boss mechanics**: M1 spec says "1 boss" without elaboration. Proposing a fixed scripted ghost (named build) vs. a procedural elite (modified rules). Pick one.
7. **Reroll cost curve**: start at 1, +1 per reroll within round? Or start at 2, flat? *(Balance lever.)*
8. **Heart count**: 3 standard. Should hard-mode contracts reduce to 2? *(Defer to M3.)*

---

## 18. Out of scope for this document

These belong elsewhere — do not specify here:
- Specific item names, costs, effect numbers → `balance-bible.md`.
- TypeScript types and field names → `content-schemas.ts`.
- Renderer choice, monorepo layout, sim contract → `tech-architecture.md`.
- Visual style, palette, motion → `visual-direction.md`.
- Event property schemas → `telemetry-plan.md`.
