# Packbreaker Arena — Balance Bible (v0)

> Numerical source of truth for items, recipes, classes, relics, status effects, and economy. Schemas live in `content-schemas.ts`. Mechanics live in `gdd.md`. Numbers in this doc are **starting numbers** — every value here is a hypothesis until M1 telemetry says otherwise.
>
> Authoring rule: any change to numbers in this doc that affects a shipped item must come with a `decision-log.md` entry citing the telemetry that justified the move. No silent retunes.

---

## 1. Tuning principles

### Power budget
Every item has an abstract **power budget** scaled by rarity:

| Rarity | Budget | Approx. damage-equivalent per 12s combat |
|---|---|---|
| Common | 1.0 | ~6 damage |
| Uncommon | 1.6 | ~10 damage |
| Rare | 2.4 | ~14 damage |
| Epic | 3.5 | ~21 damage |
| Legendary | 5.0 | ~30 damage |

"Damage-equivalent" is the conversion currency. 1 HP healed ≈ 1 HP of damage prevented ≈ 1 unit of damage dealt. Status effects, buffs, and gold income convert via expected-value reasoning documented inline below. Items that exceed their budget by ≥30% are nerf candidates; items below their budget by ≥30% are buff candidates. Cell-size matters — a 2×2 item budgets ~1.6× a 1×1 of the same rarity (occupying 4× the cells but sharing the action economy).

### Pick-rate guardrails (from `concept-brief.md` § Success metrics)
- No item under 2% pick rate in valid contexts.
- No item over 35% pick rate.
- A run with telemetry showing a single dominant build above 25% across all sessions is a balance emergency.

### Integer math
All sim-facing numbers are integers. Percentages use basis points where possible (10000 = 100%). Effect modifiers like "+10%" resolve via `Math.floor((base * 110) / 100)`. No floats in the sim. (See `tech-architecture.md` § 4.1.)

### Status interaction order
At each tick, in order: (1) `on_round_start` triggers fire (tick 0 only), (2) `on_cooldown` triggers fire when their internal counter elapses, (3) damage events resolve and emit `on_hit` / `on_taken_damage` reactions, (4) status ticks resolve (burn, poison), (5) `on_low_health` triggers fire if threshold crossed this tick, (6) cleanup. Documented authoritatively in `packages/sim/src/iteration.ts` once written.

---

## 2. Combat constants

| Constant | Value | Notes |
|---|---|---|
| Base player HP | 30 | Modified by armor `passiveStats.maxHpBonus` |
| Base ghost HP | 30 | Same scaling |
| Boss HP | 50 | Special case, see § 15 |
| Tick rate | 10 / sec | From `content-schemas.ts` `TICKS_PER_SECOND` |
| Combat hard cap | 600 ticks (60s) | From `MAX_COMBAT_TICKS`. Drawn combats credit no winner. |
| Cooldown range | 20–80 ticks | Faster than 20 reads as spam; slower than 80 wastes the window |
| Player base damage | 0 | All damage comes from items unless modified by class/relic |

Combat ends at: (a) one combatant reaches 0 HP, (b) tick cap reached. Ties at tick cap = draw, both sides take a heart loss. Never expected in M1 telemetry; if drawn combats exceed 1% of all combats, balance bug.

---

## 3. Economy curves

### Round-by-round gold income (neutral contract)

| Round | Base income | Cumulative income (no win bonus) |
|---|---|---|
| 1 | 4 | 4 |
| 2 | 4 | 8 |
| 3 | 4 | 12 |
| 4 | 5 | 17 |
| 5 | 5 | 22 |
| 6 | 5 | 27 |
| 7 | 6 | 33 |
| 8 | 6 | 39 |
| 9 | 6 | 45 |
| 10 | 7 | 52 |
| 11 (boss) | 7 | 59 |

Win bonus: +1g per round won. A perfect run nets 70g over 11 rounds.

### Reroll cost
- Round-internal: starts at 1g, +1g per reroll within the round, resets next round.
- Soft cap implicit: 4 rerolls in a single round costs 1+2+3+4 = 10g, exceeds round income.

### Sell value
- 50% of purchase cost (`sellRecoveryBp: 5000`), rounded down.
- Common (3g) → 1g recovery
- Uncommon (5g) → 2g
- Rare (7g) → 3g
- Epic (9g) → 4g
- Legendary (12g) → 6g

### Item costs by rarity (default ruleset)

| Rarity | Cost | Sell |
|---|---|---|
| Common | 3g | 1g |
| Uncommon | 5g | 2g |
| Rare | 7g | 3g |
| Epic | 9g | 4g |
| Legendary | 12g | 6g |

Class-affinity items appear in their owner's pool at **+50% pool weight** (multiplier on the rarity's base weight). Cost is unchanged.

---

## 4. Status effect numbers

| Status | Effect per tick | Stacking | Decay | Cap | Notes |
|---|---|---|---|---|---|
| Burn | 1 dmg per stack per second (every 10 ticks) | Stacks add | -1 stack per 20 ticks (2s) | 10 stacks | Can't crit. Bypasses `on_taken_damage` triggers. |
| Poison | 1 dmg per stack per second (every 10 ticks) | Stacks add | None — persists full combat | 10 stacks | Same damage as burn but persists. Ignores armor heals. |
| Stun | Skip next `on_cooldown` trigger | Boolean (not stacked) | Single-use; consumed when next cooldown would fire | n/a | One stun = one missed cooldown. |

Burn vs poison balance: burn front-loads damage and decays, poison back-loads and persists. A single 5-stack of burn deals 5,4,4,3,3,2,2,1,1 ≈ 25 damage over its lifetime (per-second damage with the spec-pinned tick order: status_ticks at phase 4 fires before cleanup at phase 6, so the first decay lands at the 20th cleanup post-application). A 5-stack of poison deals 5/sec for the rest of combat — at 10 seconds remaining = 50 damage. Poison is stronger in long combats; burn is stronger in burst openers.

---

## 5. Classes

### Tinker
- `id: 'tinker'`
- Affinity tags: `tool`, `gem`, `consumable`
- Passive (interpreted by run controller and sim):
  - `firstRecipeFreeAction: true` — first recipe combine each round costs no action (placeholder mechanic — recipes are free in M1 anyway, but reserved as a content lever)
  - `recipeBonusPct: 10` — recipe outputs gain +10% effect (damage, heal, status stacks; `Math.floor(base * 110 / 100)`)
- Starter relics drawn from: `apprentices-loop`, `pocket-forge`, `merchants-mark`

### Marauder
- `id: 'marauder'`
- Affinity tags: `weapon`, `armor`, `metal`
- Passive:
  - `bonusBaseDamage: 1` — every `damage` effect from any item this class owns gains +1
  - `bonusGoldOnWin: 2` — round-win bonus is 3g instead of the default 1g
- Starter relics drawn from: `razors-edge`, `bloodfont`, `iron-will`

Both classes use the default 6×4 bag. The differentiation is passive + relic pool + item affinity weighting.

---

## 6. Items — Commons (20)

Format: `id` Name — shape · tags · cost · trigger summary · *intent*

**Weapons (6)**
- `iron-sword` Iron Sword — 1×2 V · `weapon, metal` · 3g · `on_cooldown(50): damage(4, opp)` · *Anchor item. Vanilla baseline. ~10 DPC.*
- `iron-dagger` Iron Dagger — 1×1 · `weapon, metal` · 3g · `on_cooldown(30): damage(2, opp)` · *Fast and small. Best with on_hit synergies.*
- `wooden-club` Wooden Club — 1×2 V · `weapon` · 3g · `on_cooldown(60): damage(5, opp)` · *Slow, heavy single hits.*
- `hand-axe` Hand Axe — 1×1 · `weapon, metal` · 3g · `on_cooldown(40): damage(3, opp)` · *Mid-cost, mid-tempo. The most "average" weapon.*
- `iron-mace` Iron Mace — 2×1 H · `weapon, metal` · 3g · `on_cooldown(50): damage(2, opp), apply_status(stun, 1 stack, opp)` · *Damage is anemic; the stun is the value. Cell-expensive, requires planning.*
- `throwing-knife` Throwing Knife — 1×1 · `weapon, metal` · 3g · `on_round_start: damage(8, opp)` · *Burst opener. Does nothing after tick 0.*

**Armor (4)** — modeled via heals + low-HP triggers; see § 17 for `passiveStats.maxHpBonus` schema gap.
- `wooden-shield` Wooden Shield — 1×1 · `armor` · 3g · `on_taken_damage: heal(2, self)` · *Bleed regen. Strong vs many small hits.*
- `buckler` Buckler — 1×1 · `armor, metal` · 3g · `passiveStats.maxHpBonus: 5` · *Flat HP. Reliable.*
- `leather-vest` Leather Vest — 1×2 V · `armor` · 3g · `on_cooldown(60): heal(2, self)` · *Sustained regen. Cell-expensive trade for stability.*
- `iron-cap` Iron Cap — 1×1 · `armor, metal` · 3g · `on_low_health: heal(10, self)` · *Once-per-combat panic button at 50% HP.*

**Consumables (4)**
- `healing-herb` Healing Herb — 1×1 · `plant, consumable` · 3g · `on_cooldown(80): heal(3, self)` · *Anchor item. Sustained micro-regen. Recipe input.*
- `apple` Apple — 1×1 · `food, consumable` · 3g · `on_round_start: heal(5, self) + heal(5, self)` (fires twice — once at start, once mid-combat via cooldown) — *correction:* `on_round_start: heal(5, self), on_cooldown(60): heal(2, self)` · *Front-loaded heal, then small regen.*
- `bread` Bread — 1×1 · `food, consumable` · 3g · `on_taken_damage: heal(1, self)` (cap 5 triggers per combat — see § 17 cap question) · *Cheap durability against many small hits.*
- `mana-potion` Mana Potion — 1×1 · `consumable` · 3g · `on_round_start: buff_adjacent(cooldown_pct, -15, all adjacents, full combat)` · *Adjacency catalyst. Speeds up neighbors by 15%.*

**Gold (3)** — passive income, see § 17 schema gap.
- `copper-coin` Copper Coin — 1×1 · `gold` · 3g · `passiveStats.goldPerRound: 1` · *Buy 3, get 3g/round. Pays back in 3 rounds.*
- `coin-pouch` Coin Pouch — 1×2 V · `gold` · 3g · `passiveStats.goldPerRound: 2` · *Cell-expensive but better gold rate.*
- `lucky-penny` Lucky Penny — 1×1 · `gold` · 3g · `on_round_start: add_gold(2)` · *Recipe input. Provides per-round gold via combat-start trigger.*

**Synergy / utility (3)**
- `whetstone` Whetstone — 1×1 · `tool, metal` · 3g · `on_adjacent_trigger(matchTags: [weapon]): buff_adjacent(damage, +1, weapon adjacents only, full combat)` · *Tinker-favored. Each adjacent weapon gets +1 dmg. Synergy seed.*
- `spark-stone` Spark Stone — 1×1 · `tool, fire` · 3g · `on_adjacent_trigger(matchTags: [weapon]): apply_status(burn, 1 stack, opp)` · *Ignites adjacent weapons. Recipe input.*
- `bandage` Bandage — 1×1 · `consumable` · 3g · `on_low_health: heal(8, self)` (consumed — single use per combat) · *Higher-threshold panic heal than Iron Cap.*

---

## 7. Items — Uncommons (12)

**Weapons (4)**
- `steel-sword` Steel Sword — 1×2 V · `weapon, metal` · 5g · `on_cooldown(50): damage(6, opp)` · *Recipe output of 2× Iron Sword. ~14 DPC.*
- `war-axe` War Axe — 1×1 · `weapon, metal` · 5g · `on_cooldown(40): damage(5, opp)` · *Marauder lean. Consistent damage-per-cell.*
- `crossbow` Crossbow — 1×2 H · `weapon` · 5g · `on_cooldown(70): damage(8, opp)` · *Slow, hard-hitting. Wants cooldown reduction.*
- `spear` Spear — 1×2 V · `weapon, metal` · 5g · `on_round_start: damage(4, opp), on_cooldown(60): damage(4, opp)` · *Hits twice per combat plus an opener.*

**Armor (2)**
- `iron-shield` Iron Shield — 1×1 · `armor, metal` · 5g · `passiveStats.maxHpBonus: 8, on_taken_damage: heal(1, self)` · *Recipe output of 2× Wooden Shield.*
- `chainmail` Chainmail — 1×2 V · `armor, metal` · 5g · `passiveStats.maxHpBonus: 12` · *Cell-expensive flat HP.*

**Consumables (3)**
- `healing-salve` Healing Salve — 1×1 · `plant, consumable` · 5g · `on_taken_damage: heal(3, self), on_low_health: heal(8, self)` · *Recipe output of 2× Healing Herb. Reactive heal.*
- `stamina-tonic` Stamina Tonic — 1×1 · `consumable` · 5g · `on_round_start: buff_adjacent(cooldown_pct, -25, full combat)` · *Recipe output of Apple + Bread. Stronger Mana Potion.*
- `fire-oil` Fire Oil — 1×1 · `consumable, fire` · 5g · `on_adjacent_trigger(matchTags: [weapon]): apply_status(burn, 2 stacks, opp)` · *Recipe output of Spark Stone + Whetstone. Ignites adjacent weapons harder.*

**Status (2)** — Tinker-favored
- `poison-vial` Poison Vial — 1×1 · `consumable, poison, gem` · 5g · `on_cooldown(50): apply_status(poison, 1 stack, opp)` · *Slow burn (literally). Wants long combats.*
- `frost-shard` Frost Shard — 1×1 · `gem, ice` · 5g · `on_cooldown(60): apply_status(stun, 1 stack, opp)` · *Repeating stuns. Tempo-control.*

**Gold (1)**
- `treasure-sack` Treasure Sack — 2×1 H · `gold` · 5g · `passiveStats.goldPerRound: 4` · *Recipe output of Copper Coin + Lucky Penny. Best gold-per-cell at Uncommon.*

---

## 8. Items — Rares (8)

**Weapons (3)**
- `greatsword` Greatsword — 2×2 · `weapon, metal` · 7g · `on_cooldown(60): damage(12, opp)` · *Recipe output of Steel Sword + Iron Mace. The big-stick option. Cell-expensive but high DPC.*
- `warhammer` Warhammer — 2×1 H · `weapon, metal` · 7g · `on_cooldown(70): damage(8, opp), apply_status(stun, 1 stack, opp)` · *Damage + stun. Marauder anchor option.*
- `ember-brand` Ember Brand — 2×1 H · `weapon, metal, fire` · 7g · `on_cooldown(50): damage(6, opp), apply_status(burn, 2 stacks, opp)` · *Anchor item. Recipe output of Fire Oil + Iron Sword. Damage + burn, mid-tempo.*

**Armor (1)**
- `tower-shield` Tower Shield — 2×2 · `armor, metal` · 7g · `passiveStats.maxHpBonus: 18, on_taken_damage: heal(2, self)` · *Recipe output of Iron Shield + Iron Cap. Wall.*

**Synergy (2)** — Tinker-favored
- `forge-anvil` Forge Anvil — 2×2 · `tool, metal` · 7g · `on_adjacent_trigger(matchTags: [weapon]): buff_adjacent(damage, +2, weapon adjacents only, full combat)` · *Massive weapon buff. Wants 3+ adjacent weapons.*
- `rune-pedestal` Rune Pedestal — 1×1 · `tool, gem` · 7g · `on_adjacent_trigger(matchTags: [gem, consumable]): buff_adjacent(trigger_chance_pct, +20, full combat)` · *Procs adjacent procs harder.*

**Status (1)** — Tinker-favored
- `venom-flask` Venom Flask — 1×1 · `consumable, poison` · 7g · `on_cooldown(40): apply_status(poison, 2 stacks, opp)` · *Recipe output of Poison Vial + Throwing Knife. Doubles poison rate.*

**Lifesteal (1)** — Marauder-favored
- `vampire-fang` Vampire Fang — 1×1 · `weapon` · 7g · `on_hit: heal(2, self)` · *Heals 2 HP every time owner deals damage. Pairs with anything that hits often.*

---

## 9. Items — Epics (4)

**Marauder Epics (2)**
- `berserkers-greataxe` Berserker's Greataxe — 2×2 · `weapon, metal` · 9g · `on_cooldown(50): damage(14, opp), on_low_health: buff_adjacent(damage, +3, weapon adjacents, full combat)` · *Recipe capstone (Greatsword + Warhammer + Vampire Fang). Wins races. Triggers a damage spike when owner gets low.*
- `bloodmoon-plate` Bloodmoon Plate — 2×2 · `armor, metal` · 9g · `passiveStats.maxHpBonus: 25, on_taken_damage: damage(3, opp)` · *Shop-only Epic. Heavy armor + retaliation.*

**Tinker Epics (2)**
- `master-alchemists-kit` Master Alchemist's Kit — 2×2 · `tool, gem, consumable` · 9g · `on_round_start: apply_status(poison, 3 stacks, opp), on_adjacent_trigger(matchTags: [consumable, gem]): buff_adjacent(trigger_chance_pct, +30, full combat)` · *Recipe capstone (Forge Anvil + Rune Pedestal + Venom Flask). Tinker's late-game build target.*
- `resonance-crystal` Resonance Crystal — 1×1 · `gem` · 9g · `on_adjacent_trigger(matchTags: any): buff_adjacent(damage, +1, all adjacents, full combat) + buff_adjacent(cooldown_pct, -10, all adjacents, full combat)` · *Shop-only Epic. Tiny but buffs everything around it. Best in dense Tinker bags.*

---

## 10. Items — Legendary (1)

- `world-forged-heart` World-Forged Heart — 1×1 · `gem` · 12g · `passiveStats.maxHpBonus: 15, on_low_health: damage(15, opp)` · *Boss reward only in M1. Effectively +15 max HP and a nuke when you get low. Build-defining.*

---

## 11. Recipes (12)

Format: `id` Name — inputs → output · rotationLocked? · *intent*

**Simple (6) — 2 Commons → 1 Uncommon**
- `r-steel-sword` Forge Steel — Iron Sword + Iron Dagger → Steel Sword · false · *Weapon ladder.*
- `r-healing-salve` Salve Brewing — Healing Herb + Healing Herb → Healing Salve · false · *Anchor recipe — used in style frame's recipe glow demo.*
- `r-iron-shield` Reinforce — Wooden Shield + Wooden Shield → Iron Shield · false · *Armor ladder.*
- `r-stamina-tonic` Sustenance — Apple + Bread → Stamina Tonic · false · *Consumable ladder.*
- `r-fire-oil` Ignition — Spark Stone + Whetstone → Fire Oil · false · *Status ladder.*
- `r-treasure-sack` Hoard — Copper Coin + Lucky Penny → Treasure Sack · false · *Economy ladder.*

**Mid (4) — 1 Uncommon + 1 Common → 1 Rare**
- `r-greatsword` Heavy Forging — Steel Sword + Iron Mace → Greatsword · false · *Marauder weapon path.*
- `r-tower-shield` Wall Forging — Iron Shield + Iron Cap → Tower Shield · false · *Tank path.*
- `r-ember-brand` Imbue Flame — Fire Oil + Iron Sword → Ember Brand · false · *Anchor item recipe. Status weapon path.*
- `r-venom-flask` Distillation — Poison Vial + Throwing Knife → Venom Flask · false · *Tinker status path.*

**Capstone (2) — 3 Rares → 1 Epic, class-flavored**
- `r-berserkers-greataxe` Crimson Fury — Greatsword + Warhammer + Vampire Fang → Berserker's Greataxe · false · *Marauder build target.*
- `r-master-alchemists-kit` Master's Touch — Forge Anvil + Rune Pedestal + Venom Flask → Master Alchemist's Kit · false · *Tinker build target.*

All M1 recipes are `rotationLocked: false`. Directional recipes are an M3 lever. (See `gdd.md` § 6.)

---

## 12. Relics — Tinker (6)

Format: `id` Name — slot · `RelicModifiers` · *intent*

- `apprentices-loop` Apprentice's Loop — starter · `extraRerollsPerRound: 1` · *Cheap shop scouting. Stacks with high reroll counts.*
- `pocket-forge` Pocket Forge — starter · `recipeBonusPct: 15` · *Stacks with class passive (10 + 15 = 25% recipe bonus).*
- `merchants-mark` Merchant's Mark — starter · `itemCostDelta: -1` · *3g items become 2g. Scales hardest in early rounds.*
- `resonant-anchor` Resonant Anchor — mid · `extraShopSlots: 1` · *6 shop slots instead of 5. More choice per reroll.*
- `catalyst` Catalyst — mid · `recipeBonusPct: 30` · *Stacks again — Catalyst + Pocket Forge + class passive = 55% recipe bonus.*
- `worldforge-seed` Worldforge Seed — boss · `bonusStartingGold: 6, recipeBonusPct: 10` · *Boss-only. Cosmetic flair in M1; persists into M2 ladder.*

---

## 13. Relics — Marauder (6)

- `razors-edge` Razor's Edge — starter · `bonusBaseDamage: 2` · *Stacks with class passive (1 + 2 = +3 to all damage effects).*
- `bloodfont` Bloodfont — starter · `lifestealPct: 20` · *20% of damage dealt heals owner.*
- `iron-will` Iron Will — starter · `bonusHearts: 1` · *4 hearts instead of 3. Eats a heart for safety.*
- `berserkers-pendant` Berserker's Pendant — mid · `bonusBaseDamage: 3` · *Stacks. Razor + Pendant + passive = +6 damage on every effect.*
- `crimson-pact` Crimson Pact — mid · `lifestealPct: 35` · *Stacks. Bloodfont + Pact = 55% lifesteal.*
- `conquerors-crown` Conqueror's Crown — boss · `bonusBaseDamage: 4, bonusGoldOnWin: 3` · *Boss-only.*

Relic stacking is additive across `RelicModifiers` flat fields. The run controller computes the effective ruleset at run start.

---

## 14. Affinity weighting

- Items with `classAffinity === currentRun.classId` appear in shop pools at **+50% rarity-band weight**.
- Items with `classAffinity === null` (neutral) appear at **base rarity-band weight**.
- Items with `classAffinity === otherClass` appear at **−25% rarity-band weight** (still possible — no class is locked out of any item).

Shop pool weights for a Tinker player at Round 7 (Common + Uncommon + Rare gates open):

| Rarity | Base | Tinker affinity | Marauder affinity | Neutral |
|---|---|---|---|---|
| Common | 60 | 90 | 45 | 60 |
| Uncommon | 25 | 37.5 → 38 | 18.75 → 19 | 25 |
| Rare | 10 | 15 | 7.5 → 8 | 10 |

(Decimal weights round to nearest integer for the integer-math constraint. Total weight per slot is the sum of all eligible items' weights.)

---

## 15. Boss — Forge Tyrant (M1)

A fixed scripted ghost. Same `Combatant` shape as a normal ghost, but with overrides applied by the run controller.

### Identity
- `classId: 'marauder'`
- Display name: "Forge Tyrant"
- Bag: see below
- HP override: 50 (vs. 30 standard)

### Bag (6×4 grid)

| Cell | Item | Notes |
|---|---|---|
| (0,0)–(1,1) 2×2 | `berserkers-greataxe` | Centerpiece weapon |
| (2,0)–(2,1) 1×2 V | `chainmail` | HP buffer |
| (3,0)–(4,1) 2×2 | `bloodmoon-plate` | Heavy armor + retaliation |
| (5,0) 1×1 | `vampire-fang` | Lifesteal |
| (0,2)–(1,2) 2×1 H | `warhammer` | Stun pressure |
| (2,2) 1×1 | `iron-mace` | Extra stun |
| (3,2) 1×1 | `apple` | Heal regen |
| (5,2) 1×1 | `whetstone` | Buffs adjacent weapons |
| Rest | empty | |

### Aura (boss-only modifier, applied at combat start)
"Tyrant's Wrath" — +2 base damage to all of the boss's damage effects, +15% lifesteal globally on its bag. This is on top of the boss's relic and class passive.

### Difficulty target
- A player arriving at Round 11 with an "average" build (1 Epic, 1–2 Rares, mostly Uncommons, ~22 effective HP at start after armor) should win ~30% of boss combats on first attempt. Higher with synergy-heavy builds.
- A player who has ignored both armor and damage (incoherent build) should win <10%.
- A "perfect" player with a recipe-capstoned Epic and class-stacked relics should win 70%+.

### Reward
- Win: choose 1 of 3 from { `world-forged-heart` (Legendary), one random Epic, the boss relic for the player's class }.
- Lose: run ends with `outcome: 'eliminated'` if hearts hit 0 in the boss fight, or `outcome: 'won'` if the player declines the boss fight by reaching Round 11 with ≥1 heart but losing the boss combat itself — TBD. **See § 19 open lever.**

---

## 16. Pick-rate guardrails (telemetry-driven)

Collect daily and weekly across all M1 sessions. Triggers:

- **Item below 2% pick rate in valid contexts** (item is in shop, eligible by rarity gate, and was not picked over a session window): buff candidate. Investigate before tuning — sometimes the item is fine and the synergy partner is missing.
- **Item above 35% pick rate**: nerf candidate. Same investigation rule.
- **Build wins above 60% over 100+ instances**: balance emergency, see if a single item or relic combo dominates.
- **Recipe never completed across 50+ runs**: design failure, recipe is not legible or its inputs are unbuyable.
- **Class win-rate gap > 8 points**: rebalance the underperforming class's passive or relic pool.

These guardrails inform `decision-log.md` entries. Never tune a number without citing the telemetry that motivated it.

---

## 17. Schema gaps to address

The following items in this bible reference fields that don't yet exist on `Item`. Proposed schema addition:

```ts
// Proposed addition to content-schemas.ts § 3
export interface PassiveStats {
  readonly maxHpBonus?: number       // adds to combatant.startingHp at combat start
  readonly bonusBaseDamage?: number  // future: adds to all damage effects this item produces
  readonly goldPerRound?: number     // credited after each round, before next shop generates
}

// Item interface gains:
//   readonly passiveStats?: PassiveStats
```

The run controller reads `passiveStats` before calling `simulateCombat`:
- `maxHpBonus` is summed per side and added to `Combatant.startingHp`.
- `goldPerRound` is summed per round-end and credited to the player's gold pool.
- `bonusBaseDamage` is reserved for future use (deferred to M2 — currently no items use it; class/relic damage bonuses cover this need).

The sim never sees `passiveStats`. Determinism contract preserved.

**Also flagged**:
- **Per-combat trigger caps** — Bread's "max 5 triggers per combat" and Bandage's "single use" need a cap mechanism. Proposal: add `readonly maxTriggersPerCombat?: number` to each `Trigger` variant. Defaults to unlimited.
- **`on_adjacent_trigger` matchTags semantics** — when `matchTags` is omitted, "match any adjacent" is the intended behavior. Confirm in `packages/sim` impl.
- **Status stack caps** — burn and poison both cap at 10 stacks per § 4. The schema doesn't enforce caps; the sim does. Document in `packages/sim/src/status.ts`.
- **Boss HP and aura** — best modeled as a contract mutator (`type: 'boss_only'`) with HP and damage overrides. Existing `ContractMutator` union covers `boss_only` flag but not the override payload. Extend to `{ type: 'boss_only', hpOverride: number, damageBonus: number, lifestealPctBonus: number }`.

---

## 18. Open levers

These are tuning questions that can't be answered until M1 graybox runs:

1. **Base HP (30) vs (40)** — at 30 HP, a single Greatsword (12 dmg/hit, 60 cd) deals 24 dmg in 12s, which is most of a player's HP. May feel too lethal. Consider 40.
2. **Reroll cost curve** — `gdd.md` § 17 question 7. Currently start at 1, +1 per reroll. Alternative: start at 2, flat. Affects shop optimization tempo.
3. **Recipe `rotationLocked: false` always** — should we ship one or two `rotationLocked: true` recipes to test directional play? Defer to M2 unless a pre-M1 review changes our minds.
4. **Boss-fight loss handling** — losing the boss with hearts remaining: does the player get to retry the boss, or is the run over? Proposal: lose your last heart, run ends `outcome: 'eliminated'`, but still credits "reached round 11" progress for daily contracts. Alternative: boss is best-of-three. Decide before M1 graybox.
5. **Class-affinity pool weights (+50% / −25%)** — first numbers. May need to widen to make classes feel more distinct, or tighten if they feel too restrictive.
6. **Status stack caps (10)** — picked from gut. May cap lower (5) if poison stacks become the dominant build. Telemetry-driven.
7. **Vampire Fang lifesteal (`heal(2)` per `on_hit`)** — flat heal not scaled to damage dealt. Alternative: percentage-based lifesteal. Flat is easier to author, probably needs no change for M1.
8. **Boss reward set** — currently { Legendary, random Epic, class boss relic }. May want to also offer a "mega gold" choice for players who failed to find an Epic synergy.

---

## 19. Out of scope for this document

- Specific item art assets and animation behavior — see `visual-direction.md` and Claude Design prompts.
- Combat sim implementation details — `tech-architecture.md` § 4.
- Tutorial run scripted bag and ghost — covered in `gdd.md` § 15. The tutorial uses items from this bible but the choreography lives there.
- Daily contract authoring — one daily slot for M1 with hand-tuned mutators week-over-week. Authoring lives in a separate `contracts.ts` file (M2 doc).
- Cosmetic content (skins, frames, emotes) — M2.
