/**
 * content-schemas.ts — Packbreaker Arena (v0.1)
 *
 * Single source of truth for domain types. In the actual monorepo this file
 * is split across packages — see § 0 below for package allocation.
 *
 * Conventions:
 *  - All sim-facing data is `readonly`. Mutation lives in the run controller, not the sim.
 *  - All IDs are branded strings — no string/string confusion at call sites.
 *  - All polymorphic data uses discriminated unions on `type`.
 *  - Defaults are constants at the bottom of the file. Game rules consume them by value.
 *  - Numbers are integers unless explicitly noted. The sim does not use floats. (See tech-architecture.md § 4.1.)
 *
 * Cross-references:
 *  - gdd.md           — mechanics, screen flow, content targets
 *  - tech-architecture.md — sim contract, monorepo layout
 *  - balance-bible.md — actual item/recipe/relic data, power budget bounds
 *  - telemetry-plan.md — full event taxonomy
 *
 * Changelog
 *  v0.4 (2026-04-29) — M1.2.4 recipeBonusPct routing.
 *   - Added optional `recipeBornPlacementIds` to Combatant (§ 11) — the run
 *     controller materializes this list at combat start from placements that
 *     originated via combineRecipe(). Sim reads it in resolveEffect to apply
 *     the source side's recipeBonusPct (class.passive + summed
 *     RelicModifiers.recipeBonusPct) multiplicatively before flat additions
 *     (buffs, bonusBaseDamage). Damage / heal / apply_status all honor it.
 *     Locked per decision-log.md entry (M1.2.4 pre-flight, ratified locked
 *     answer 15). Fixture impact: zero — all M1.2.3b fixtures have undefined
 *     recipeBornPlacementIds (deserializes to empty), no bonus applied,
 *     events byte-identical.
 *  v0.3 (2026-04-28) — M1.2.3a schema patch.
 *   - Added 'buff_remove' variant to CombatEvent (§ 11) for replay-log
 *     legibility when a buff_apply's durationTicks elapses (e.g., a
 *     buff_adjacent expiring mid-combat). Carries the same target /
 *     stat / amount as the matching buff_apply so replay readers can
 *     pair apply / remove without lookup tables. Locked per
 *     decision-log.md entry e48bac9 (M1.2.3 ratified answers).
 *  v0.2 (2026-04-26) — M1.1.1 + M1.2.2 patches.
 *   - Added matchTags to Effect.buff_adjacent (§ 3) so the adjacency filter
 *     decouples from the host trigger's filter. Preserves existing
 *     matchTags-omitted behavior (apply to all adjacents).
 *   - Added bonusGoldOnWin to RelicModifiers (§ 6). Conqueror's Crown
 *     ships +3g per round won (balance-bible.md § 13); additive on top of
 *     the class passive's bonusGoldOnWin so Marauder + Crown = +5g/win.
 *   - Updated § 0 allocation comment to document the realized M1.1
 *     architecture (shared ← content, GhostBuild lives in content).
 *   - Added IsoTimestamp and IsoDate value constructors (§ 17) for
 *     symmetry with the other branded ID constructors. Cleanup, not a
 *     spec change.
 *   - M1.2.2: Added 'stun_consumed' variant to CombatEvent (§ 11) for the
 *     per-side pendingStun-consumed-at-cooldown event the sim emits when
 *     a stun cancels a cooldown trigger.
 *  v0.1 (2026-04-27)
 *   - Added PassiveStats (§ 3) for non-sim modifiers (max HP, gold per round, base damage).
 *     Run controller folds these in before calling simulateCombat. Sim contract unaffected.
 *   - Added optional maxTriggersPerCombat to every Trigger variant (§ 3).
 *     Single-use items (Bandage) and capped items (Bread) need this.
 *   - Extended ContractMutator 'boss_only' (§ 8) with hpOverride, damageBonus, lifestealPctBonus.
 *     Forge Tyrant boss in balance-bible.md § 15 needs these.
 *   - Added error_boundary_caught telemetry event (§ 15) per telemetry-plan.md § 9
 *     M1 promotion (cheap, high crash-visibility signal).
 *  v0   (2026-04-25) — initial schema lock.
 */


// ─────────────────────────────────────────────────────────────────────────────
// § 0 — PACKAGE ALLOCATION GUIDE
// ─────────────────────────────────────────────────────────────────────────────
// In the monorepo (tech-architecture.md § 3), this file's contents distribute as:
//
//   packages/content        → §§ 1–8   (item, recipe, class, relic, contract, status,
//                                        passive stats — content-authored, sim never reads passiveStats)
//                          → §§ 12–15  (canonical: ghost, save, API DTOs, telemetry events)
//   packages/sim            → §§ 9–11  (bag state, run state, combat)
//   packages/shared         → §§ 12–15 (re-exports for ergonomics; consumers
//                                        import shared/{ghost,save,telemetry/events,api})
//
// `sim` may import from `content` BUT must not read `Item.passiveStats` — that field
// is for the run controller only. Lint rule: `no-restricted-syntax` blocks `passiveStats`
// access inside `packages/sim/**`.
//
// `shared` imports branded types and structural primitives from `content` (ItemId, RunId,
// RoundNumber, BagState, RunState, CellCoord, Rotation). `content` imports nothing.
// Direction is unidirectional (shared ← content). `GhostBuild` lives in `packages/content`;
// `packages/shared/src/ghost.ts` re-exports it for ergonomics. Lint rules enforce the direction.
// `client` and `server` import from all three.


// ─────────────────────────────────────────────────────────────────────────────
// § 1 — COMMON PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

/** Branded primitive helper. */
export type Brand<T, B extends string> = T & { readonly __brand: B }

/** ID brands. Compile-time safety against mixing IDs across categories. */
export type ItemId      = Brand<string, 'ItemId'>
export type RecipeId    = Brand<string, 'RecipeId'>
export type RelicId     = Brand<string, 'RelicId'>
export type ContractId  = Brand<string, 'ContractId'>
export type ClassId     = Brand<string, 'ClassId'>
export type GhostId     = Brand<string, 'GhostId'>
export type RunId       = Brand<string, 'RunId'>
export type PlacementId = Brand<string, 'PlacementId'> // stable per-item-instance in a bag

/** 32-bit seed value. Consumed by mulberry32 in packages/sim/src/rng.ts. */
export type SimSeed = Brand<number, 'SimSeed'>

/** ISO 8601 timestamp string. Metadata only — never read inside the sim. */
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>

/** ISO date string (YYYY-MM-DD). Used for daily contracts. */
export type IsoDate = Brand<string, 'IsoDate'>

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** Open-vocabulary tags. Used for adjacency matching, recipe inputs, class affinity. */
export type ItemTag =
  | 'weapon' | 'armor' | 'consumable' | 'gem' | 'tool' | 'plant'
  | 'metal' | 'fire' | 'ice' | 'poison' | 'gold' | 'food'
  // Extensible — never branch on string literals outside content data.

/** Round number, 1-indexed, max 11 in M1 (10 standard + 1 boss). */
export type RoundNumber = number


// ─────────────────────────────────────────────────────────────────────────────
// § 2 — GEOMETRY
// ─────────────────────────────────────────────────────────────────────────────

export interface BagDimensions {
  readonly width: number  // M1 default: 6
  readonly height: number // M1 default: 4
}

/** Cell coordinate in bag space. (0,0) = top-left. */
export interface CellCoord {
  readonly col: number
  readonly row: number
}

/** Quarter-turns. Item behavior does not change with rotation in M1 (gdd.md § 3). */
export type Rotation = 0 | 90 | 180 | 270

/**
 * An item's footprint, expressed as cells relative to its anchor (0,0).
 * The anchor is always the cell at the bounding-box top-left when at Rotation 0.
 *
 * Example — 1×2 vertical sword: [{col:0,row:0}, {col:0,row:1}]
 * Example — 2×2 square shield:   [{col:0,row:0}, {col:1,row:0}, {col:0,row:1}, {col:1,row:1}]
 * Example — L-tromino:           [{col:0,row:0}, {col:0,row:1}, {col:1,row:1}]
 */
export type ItemShape = ReadonlyArray<CellCoord>


// ─────────────────────────────────────────────────────────────────────────────
// § 3 — ITEM SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/** Selector for the target of an effect during combat. */
export type TargetSelector =
  | 'self'             // the source item's owner (player or ghost)
  | 'opponent'         // the other side
  | 'self_random_item' // randomly chosen item on source's side
  | 'opp_random_item'  // randomly chosen item on opposite side

export type StatusType = 'burn' | 'poison' | 'stun'

export type BuffableStat = 'damage' | 'cooldown_pct' | 'trigger_chance_pct'

/**
 * Passive stats — applied by the run controller BEFORE calling simulateCombat.
 * Sim never reads this field. Used for max HP, gold per round, and future
 * base damage modifiers that the sim shouldn't have to interpret.
 *
 * Composition rule: per-side, sum all `passiveStats` values across all placed items.
 * Per-side player aggregation:
 *   maxHpBonus     → added to Combatant.startingHp
 *   bonusBaseDamage → added to every damage Effect produced by ANY item this side owns
 *   goldPerRound   → credited to player gold AFTER round combat resolves, BEFORE next shop generates
 *
 * Ghost passives apply to ghost; player passives apply to player. No cross-side leakage.
 */
export interface PassiveStats {
  readonly maxHpBonus?: number       // adds to combatant.startingHp at combat start
  readonly bonusBaseDamage?: number  // adds to all damage effects from this owner's items
  readonly goldPerRound?: number     // credited at round-end, before next shop
}

/** Effect primitives. Discriminated by `type`. (gdd.md § 5) */
export type Effect =
  | {
      readonly type: 'damage'
      readonly amount: number
      readonly target: TargetSelector
    }
  | {
      readonly type: 'heal'
      readonly amount: number
      readonly target: TargetSelector
    }
  | {
      readonly type: 'apply_status'
      readonly status: StatusType
      readonly stacks: number
      readonly durationTicks?: number // omit for poison (full combat) and stun (single-use)
      readonly target: TargetSelector
    }
  | {
      readonly type: 'add_gold'
      readonly amount: number
      // Out-of-combat only. Resolved by run controller, not sim.
      // Prefer `passiveStats.goldPerRound` for steady income; reserve `add_gold` for
      // conditional gold rewards (e.g., quest-style triggers in future content).
    }
  | {
      readonly type: 'buff_adjacent'
      readonly stat: BuffableStat
      readonly amount: number
      readonly durationTicks?: number // omit for full-combat duration
      /** Optional adjacency filter. If omitted or empty, applies to all adjacent items.
       *  When present, only adjacent items carrying at least one of these tags receive
       *  the buff. Decoupled from the host trigger's matchTags so a non-on_adjacent_trigger
       *  trigger can still target a tag-filtered subset. (Sim: read effect.matchTags ?? []
       *  and treat empty as "all adjacents".) */
      readonly matchTags?: ReadonlyArray<ItemTag>
    }
  | {
      readonly type: 'summon_temp_item'
      readonly itemId: ItemId
      readonly durationTicks: number
    }

/**
 * Trigger primitives. Each carries the effects to fire.
 *
 * `maxTriggersPerCombat` (optional, all variants): caps how many times the trigger
 * fires within a single combat. Omit for unlimited (default). Use 1 for single-use
 * items (Bandage), small N for capped items (Bread). Sim resets the per-trigger
 * counter at combat start.
 *
 * (gdd.md § 5)
 */
export type Trigger =
  | {
      readonly type: 'on_round_start'
      readonly effects: ReadonlyArray<Effect>
      readonly maxTriggersPerCombat?: number
    }
  | {
      readonly type: 'on_cooldown'
      readonly cooldownTicks: number // 10 ticks = 1 simulated second
      readonly effects: ReadonlyArray<Effect>
      readonly maxTriggersPerCombat?: number
    }
  | {
      readonly type: 'on_hit'
      readonly effects: ReadonlyArray<Effect>
      readonly maxTriggersPerCombat?: number
    }
  | {
      readonly type: 'on_taken_damage'
      readonly effects: ReadonlyArray<Effect>
      readonly maxTriggersPerCombat?: number
    }
  | {
      readonly type: 'on_adjacent_trigger'
      readonly matchTags?: ReadonlyArray<ItemTag>
      readonly effects: ReadonlyArray<Effect>
      readonly maxTriggersPerCombat?: number
    }
  | {
      readonly type: 'on_low_health'
      readonly thresholdPct: number // integer percentage, e.g. 50
      readonly effects: ReadonlyArray<Effect>
      readonly maxTriggersPerCombat?: number
    }

/** A canonical item definition. Static, content-authored, immutable. */
export interface Item {
  readonly id: ItemId
  readonly name: string
  readonly rarity: Rarity
  readonly classAffinity: ClassId | null // null = neutral, available to all classes
  readonly shape: ItemShape
  readonly tags: ReadonlyArray<ItemTag>
  readonly cost: number // gold cost in shop. Validated against rarity band in balance-bible.md.
  readonly triggers: ReadonlyArray<Trigger>
  /**
   * Optional non-sim modifiers applied by the run controller before combat begins.
   * Sim must not read this. See PassiveStats above for composition rules.
   */
  readonly passiveStats?: PassiveStats
  readonly artId: string // asset key — points into the atlas. Not the item id.
}


// ─────────────────────────────────────────────────────────────────────────────
// § 4 — RECIPE SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Required input cell of a recipe arrangement.
 * Coordinates are relative to the arrangement's anchor cell (0,0).
 *
 * Detection: a recipe matches if there exists an in-bag placement of the listed
 * inputs whose relative cell offsets form this exact arrangement. If
 * `rotationLocked` is false, all four rotations of this arrangement match.
 */
export interface RecipeInputCell {
  readonly relativeCol: number
  readonly relativeRow: number
  readonly itemId: ItemId
}

export interface Recipe {
  readonly id: RecipeId
  readonly name: string
  readonly inputs: ReadonlyArray<RecipeInputCell> // 2–3 entries in M1
  readonly output: ItemId
  /**
   * If true, only this exact orientation matches. If false (default), all four
   * rotations of the input arrangement are matched. Used for directional
   * recipes (e.g., "shield must be left of sword").
   */
  readonly rotationLocked: boolean
}


// ─────────────────────────────────────────────────────────────────────────────
// § 5 — CLASS SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/** Class passive — runtime knobs interpreted by the run controller and sim. */
export interface ClassPassive {
  readonly description: string // for UI; never parsed
  readonly recipeBonusPct?: number       // e.g. Tinker: +10
  readonly firstRecipeFreeAction?: boolean
  readonly bonusBaseDamage?: number      // e.g. Marauder: +1
  readonly bonusGoldOnWin?: number       // e.g. Marauder: +2
}

export interface Class {
  readonly id: ClassId
  readonly displayName: string
  readonly passive: ClassPassive
  readonly affinityTags: ReadonlyArray<ItemTag>
  readonly starterRelicPool: ReadonlyArray<RelicId> // chosen from at run start
  readonly portraitArtId: string
}


// ─────────────────────────────────────────────────────────────────────────────
// § 6 — RELIC SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

export type RelicSlot = 'starter' | 'mid' | 'boss'

/**
 * Relic modifiers — flat fields the sim/run-controller multiplies/adds against
 * the active ruleset. Composable. Authoring stays declarative.
 */
export interface RelicModifiers {
  readonly extraRerollsPerRound?: number
  readonly rerollCostDelta?: number
  readonly itemCostDelta?: number
  readonly recipeBonusPct?: number
  readonly bonusBaseDamage?: number
  readonly lifestealPct?: number
  readonly bonusStartingGold?: number
  readonly extraShopSlots?: number
  readonly bonusHearts?: number
  readonly bonusGoldOnWin?: number  // additive on top of class passive bonusGoldOnWin (e.g. Marauder +2 + Conqueror's Crown +3 = +5)
}

export interface Relic {
  readonly id: RelicId
  readonly name: string
  readonly description: string
  readonly classAffinity: ClassId | null
  readonly slot: RelicSlot
  readonly modifiers: RelicModifiers
  readonly artId: string
}


// ─────────────────────────────────────────────────────────────────────────────
// § 7 — STATUS SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

/** Live status instance attached to an entity in combat. */
export interface ActiveStatus {
  readonly type: StatusType
  readonly stacks: number
  /** Remaining ticks. -1 = full-combat duration. 0 = expired (cleaned up next tick). */
  readonly remainingTicks: number
}


// ─────────────────────────────────────────────────────────────────────────────
// § 8 — CONTRACT & RULESET
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Ruleset is the active set of game-rule numbers for a run. Defaults below;
 * contracts and relics modify them at run start (and never during combat).
 */
export interface Ruleset {
  readonly bagDimensions: BagDimensions
  readonly maxRounds: number          // M1 default: 11
  readonly bossRound: number          // M1 default: 11
  readonly startingHearts: number     // M1 default: 3
  readonly shopSize: number           // M1 default: 5
  readonly baseGoldPerRound: number   // M1 default: 4
  readonly goldStepRounds: number     // M1 default: 3 — every N rounds, base gold increases
  readonly goldStepAmount: number     // M1 default: 1
  readonly rerollCostStart: number    // M1 default: 1
  readonly rerollCostIncrement: number // M1 default: 1
  readonly itemCostMultiplierBp: number // basis points (10000 = 1.0×). Integer math.
  readonly winBonusGold: number       // M1 default: 1
  readonly sellRecoveryBp: number     // basis points (5000 = 50%)
  readonly mutators: ReadonlyArray<ContractMutator>
}

/**
 * Contract mutators modify game rules for a run. The 'boss_only' mutator is
 * applied by the run controller to a single round (the boss round) and may
 * override the boss combatant's HP and damage characteristics. Used by the
 * Forge Tyrant boss (balance-bible.md § 15).
 */
export type ContractMutator =
  | { readonly type: 'adjacent_double' }                                // adjacent triggers fire twice
  | { readonly type: 'recipe_discount'; readonly amount: number }
  | { readonly type: 'no_rerolls' }
  | {
      readonly type: 'boss_only'
      /** Override boss starting HP. If undefined, ghost uses default base HP. */
      readonly hpOverride?: number
      /** Flat damage bonus applied to every damage Effect from boss-side items. */
      readonly damageBonus?: number
      /** Lifesteal percentage applied to all damage dealt by boss. e.g. 15 = +15% heal-on-damage. */
      readonly lifestealPctBonus?: number
    }

export interface Contract {
  readonly id: ContractId
  readonly name: string
  readonly description: string
  readonly ruleset: Ruleset
  /** If true, this contract participates in the daily leaderboard. */
  readonly isDaily: boolean
}


// ─────────────────────────────────────────────────────────────────────────────
// § 9 — BAG STATE  (packages/sim)
// ─────────────────────────────────────────────────────────────────────────────

/** A single item's placement in the bag. */
export interface BagPlacement {
  readonly placementId: PlacementId // stable from drop until removal
  readonly itemId: ItemId
  readonly anchor: CellCoord        // top-left of bounding box at given rotation
  readonly rotation: Rotation
}

export interface BagState {
  readonly dimensions: BagDimensions
  readonly placements: ReadonlyArray<BagPlacement>
}


// ─────────────────────────────────────────────────────────────────────────────
// § 10 — RUN STATE  (packages/sim)
// ─────────────────────────────────────────────────────────────────────────────

export interface RelicSlots {
  readonly starter: RelicId | null
  readonly mid: RelicId | null
  readonly boss: RelicId | null
}

export type RoundOutcome = 'win' | 'loss'

export interface RunHistoryEntry {
  readonly round: RoundNumber
  readonly outcome: RoundOutcome
  readonly damageDealt: number
  readonly damageTaken: number
  readonly goldEarnedThisRound: number
  readonly opponentGhostId: GhostId | null
}

/** Snapshot of the shop at a given round. Regenerated each round. */
export interface ShopState {
  readonly slots: ReadonlyArray<ItemId>     // length === ruleset.shopSize
  readonly purchased: ReadonlyArray<number> // indices already bought this round
  readonly rerollsThisRound: number
}

export type RunOutcome = 'in_progress' | 'won' | 'eliminated' | 'abandoned'

export interface RunState {
  readonly runId: RunId
  readonly seed: SimSeed
  readonly classId: ClassId
  readonly contractId: ContractId
  readonly ruleset: Ruleset
  readonly startedAt: IsoTimestamp
  readonly hearts: number
  readonly gold: number
  readonly currentRound: RoundNumber
  readonly bag: BagState
  readonly relics: RelicSlots
  readonly shop: ShopState
  readonly trophiesAtStart: number
  readonly history: ReadonlyArray<RunHistoryEntry>
  readonly outcome: RunOutcome
}


// ─────────────────────────────────────────────────────────────────────────────
// § 11 — COMBAT (packages/sim)
// ─────────────────────────────────────────────────────────────────────────────

export type EntityRef = 'player' | 'ghost'

/** Stable reference to a placement during combat. Used by replay events. */
export interface ItemRef {
  readonly side: EntityRef
  readonly placementId: PlacementId
}

/**
 * Combatant snapshot at combat start. The sim never mutates these — it derives
 * a private mutable working state internally.
 *
 * `startingHp` is the FINAL value the sim sees. The run controller computes it as:
 *   baseHp (30 default) + sum(item.passiveStats.maxHpBonus for items on this side)
 *                       + relic-driven HP bonuses
 *                       + class-driven HP bonuses
 *                       + boss-mutator hpOverride (replaces, doesn't add)
 */
export interface Combatant {
  readonly bag: BagState
  readonly relics: RelicSlots
  readonly classId: ClassId
  readonly startingHp: number
  /**
   * Placements whose item originated via combineRecipe() in the run controller.
   * The sim reads this set in resolveEffect to apply the source side's
   * recipeBonusPct (class.passive.recipeBonusPct + summed
   * RelicModifiers.recipeBonusPct) to damage / heal / apply_status effects
   * coming from those placements. Multiplied BEFORE flat additions (buffs,
   * bonusBaseDamage). Undefined / empty = no recipe bonus on any placement.
   */
  readonly recipeBornPlacementIds?: ReadonlyArray<PlacementId>
}

export interface CombatInput {
  readonly seed: SimSeed
  readonly player: Combatant
  readonly ghost: Combatant
}

/** Discriminated combat event. The complete replay log. */
export type CombatEvent =
  | {
      readonly tick: number
      readonly type: 'combat_start'
      readonly playerHp: number
      readonly ghostHp: number
    }
  | {
      readonly tick: number
      readonly type: 'item_trigger'
      readonly source: ItemRef
      readonly trigger: Trigger['type']
    }
  | {
      readonly tick: number
      readonly type: 'damage'
      readonly source: ItemRef
      readonly target: EntityRef
      readonly amount: number
      readonly remainingHp: number
    }
  | {
      readonly tick: number
      readonly type: 'heal'
      readonly source: ItemRef
      readonly target: EntityRef
      readonly amount: number
      readonly newHp: number
    }
  | {
      readonly tick: number
      readonly type: 'status_apply'
      readonly source: ItemRef
      readonly target: EntityRef
      readonly status: StatusType
      readonly stacks: number
    }
  | {
      readonly tick: number
      readonly type: 'status_tick'
      readonly target: EntityRef
      readonly status: StatusType
      readonly damage: number
      readonly remainingHp: number
    }
  | {
      readonly tick: number
      readonly type: 'stun_consumed'
      readonly source: ItemRef       // the item whose cooldown was skipped
      readonly target: EntityRef      // the side whose pendingStun was consumed
    }
  | {
      readonly tick: number
      readonly type: 'buff_apply'
      readonly source: ItemRef
      readonly target: ItemRef
      readonly stat: BuffableStat
      readonly amount: number
    }
  | {
      readonly tick: number
      readonly type: 'buff_remove'
      readonly target: ItemRef       // the item whose buff expired
      readonly stat: BuffableStat    // which buff stat is being removed
      readonly amount: number        // the amount being removed (matches the original buff_apply)
    }
  | {
      readonly tick: number
      readonly type: 'combat_end'
      readonly outcome: CombatOutcome
      readonly finalHp: { readonly player: number; readonly ghost: number }
    }

export type CombatOutcome = 'player_win' | 'ghost_win' | 'draw'

export interface CombatResult {
  readonly events: ReadonlyArray<CombatEvent>
  readonly outcome: CombatOutcome
  readonly finalHp: { readonly player: number; readonly ghost: number }
  readonly endedAtTick: number
}


// ─────────────────────────────────────────────────────────────────────────────
// § 12 — GHOST  (packages/shared)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A submitted ghost build. Stored per-(round, trophy_band) on the server in M2+.
 * In M1 these come from a procedural template; the schema is forward-compatible.
 */
export interface GhostBuild {
  readonly id: GhostId
  readonly classId: ClassId
  readonly bag: BagState
  readonly relics: RelicSlots
  readonly recordedRound: RoundNumber
  readonly trophyAtRecord: number
  readonly seed: SimSeed
  readonly submittedAt: IsoTimestamp
  readonly source: 'player' | 'bot' // M1 ghosts are always 'bot'
}


// ─────────────────────────────────────────────────────────────────────────────
// § 13 — LOCAL SAVE  (packages/shared)
// ─────────────────────────────────────────────────────────────────────────────

/** Versioned. Migrations live in apps/client/src/persistence/migrations/. */
export interface LocalSaveV1 {
  readonly schemaVersion: 1
  readonly trophies: number
  readonly dailyStreak: number
  readonly lastDailyAttempted: IsoDate | null
  readonly tutorialCompleted: boolean
  readonly telemetryAnonId: string // uuid v4, generated on first run
  readonly inProgressRun: RunState | null
}

export type LocalSave = LocalSaveV1


// ─────────────────────────────────────────────────────────────────────────────
// § 14 — M1 SERVER DTOs  (packages/shared)
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyContractResponse {
  readonly date: IsoDate
  readonly contractId: ContractId
  readonly contract: Contract
  readonly seed: SimSeed
}

export interface TelemetryBatchRequest {
  readonly anonId: string
  readonly clientVersion: string
  readonly events: ReadonlyArray<TelemetryEvent>
}


// ─────────────────────────────────────────────────────────────────────────────
// § 15 — TELEMETRY EVENT TYPES  (packages/shared)
// Event taxonomy is owned by telemetry-plan.md. Property shapes here are the
// structural minimum required by gdd.md § 16. Expand in telemetry-plan.md.
// ─────────────────────────────────────────────────────────────────────────────

interface TelemetryBase {
  readonly tsClient: IsoTimestamp
  readonly sessionId: string
}

export type TelemetryEvent =
  // Run lifecycle
  | (TelemetryBase & {
      readonly name: 'run_start'
      readonly runId: RunId
      readonly classId: ClassId
      readonly contractId: ContractId
      readonly seed: SimSeed
    })
  | (TelemetryBase & {
      readonly name: 'run_end'
      readonly runId: RunId
      readonly outcome: RunOutcome
      readonly roundReached: RoundNumber
      readonly heartsRemaining: number
    })

  // Round lifecycle
  | (TelemetryBase & {
      readonly name: 'round_start'
      readonly runId: RunId
      readonly round: RoundNumber
      readonly hearts: number
      readonly gold: number
      readonly itemsInBag: number
    })
  | (TelemetryBase & {
      readonly name: 'round_end'
      readonly runId: RunId
      readonly round: RoundNumber
      readonly outcome: RoundOutcome
      readonly damageDealt: number
      readonly damageTaken: number
    })

  // Shop
  | (TelemetryBase & {
      readonly name: 'shop_purchase'
      readonly runId: RunId
      readonly round: RoundNumber
      readonly itemId: ItemId
      readonly cost: number
    })
  | (TelemetryBase & {
      readonly name: 'shop_sell'
      readonly runId: RunId
      readonly round: RoundNumber
      readonly itemId: ItemId
      readonly recovered: number
    })
  | (TelemetryBase & {
      readonly name: 'shop_reroll'
      readonly runId: RunId
      readonly round: RoundNumber
      readonly cost: number
      readonly rerollIndex: number
    })

  // Bag
  | (TelemetryBase & {
      readonly name: 'item_placed'
      readonly runId: RunId
      readonly itemId: ItemId
      readonly placementId: PlacementId
      readonly anchor: CellCoord
      readonly rotation: Rotation
    })
  | (TelemetryBase & {
      readonly name: 'item_rotated'
      readonly runId: RunId
      readonly placementId: PlacementId
      readonly newRotation: Rotation
    })
  | (TelemetryBase & {
      readonly name: 'item_moved'
      readonly runId: RunId
      readonly placementId: PlacementId
      readonly newAnchor: CellCoord
    })
  | (TelemetryBase & {
      readonly name: 'recipe_completed'
      readonly runId: RunId
      readonly recipeId: RecipeId
      readonly round: RoundNumber
    })

  // Relics (M1.2.6, schema v0.5 — additive)
  | (TelemetryBase & {
      readonly name: 'relic_granted'
      readonly runId: RunId
      readonly slot: 'mid' | 'boss'
      readonly relicId: RelicId
      readonly round: RoundNumber
    })

  // Combat
  | (TelemetryBase & {
      readonly name: 'combat_start'
      readonly runId: RunId
      readonly round: RoundNumber
      readonly opponentGhostId: GhostId | null
    })
  | (TelemetryBase & {
      readonly name: 'combat_end'
      readonly runId: RunId
      readonly round: RoundNumber
      readonly outcome: CombatOutcome
      readonly endedAtTick: number
      readonly damageDealt: number
      readonly damageTaken: number
    })

  // Onboarding
  | (TelemetryBase & {
      readonly name: 'tutorial_step_reached'
      readonly stepId: string
    })
  | (TelemetryBase & { readonly name: 'tutorial_completed' })
  | (TelemetryBase & { readonly name: 'tutorial_abandoned'; readonly stepId: string })

  // Daily
  | (TelemetryBase & {
      readonly name: 'daily_contract_started'
      readonly contractId: ContractId
      readonly date: IsoDate
    })
  | (TelemetryBase & {
      readonly name: 'daily_contract_completed'
      readonly contractId: ContractId
      readonly date: IsoDate
      readonly outcome: RunOutcome
    })

  // Crash visibility (added 2026-04-27 per telemetry-plan.md § 9 recommendation)
  | (TelemetryBase & {
      readonly name: 'error_boundary_caught'
      readonly errorMessage: string
      readonly componentStack: string
    })

export type TelemetryEventName = TelemetryEvent['name']


// ─────────────────────────────────────────────────────────────────────────────
// § 16 — DEFAULTS & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Sim resolution: 10 ticks per simulated second. (tech-architecture.md § 4.1) */
export const TICKS_PER_SECOND = 10 as const

/** Hard limits on combat duration to prevent infinite loops. */
export const MAX_COMBAT_TICKS = 600 // 60 simulated seconds

/** Base HP for player and ghost. Modified by passiveStats.maxHpBonus and class/relic bonuses.
 *  Boss overrides via ContractMutator['boss_only'].hpOverride. */
export const BASE_COMBATANT_HP = 30

/** Status stack caps. Sim enforces these in packages/sim/src/status.ts. */
export const STATUS_STACK_CAPS: Readonly<Record<StatusType, number>> = {
  burn:   10,
  poison: 10,
  stun:    1, // boolean — at most one queued stun
}

/** Default ruleset baseline. Contracts and relics layer modifications on top. */
export const DEFAULT_RULESET: Ruleset = {
  bagDimensions:        { width: 6, height: 4 },
  maxRounds:            11,
  bossRound:            11,
  startingHearts:       3,
  shopSize:             5,
  baseGoldPerRound:     4,
  goldStepRounds:       3,
  goldStepAmount:       1,
  rerollCostStart:      1,
  rerollCostIncrement:  1,
  itemCostMultiplierBp: 10000,
  winBonusGold:         1,
  sellRecoveryBp:       5000,
  mutators:             [],
}

/** Rarity bands. Pool weights are integers summing to 100. (gdd.md § 5) */
export const RARITY_POOL_WEIGHT: Readonly<Record<Rarity, number>> = {
  common:    60,
  uncommon:  25,
  rare:      10,
  epic:       4,
  legendary:  1,
}

export const RARITY_DEFAULT_COST: Readonly<Record<Rarity, number>> = {
  common:     3,
  uncommon:   5,
  rare:       7,
  epic:       9,
  legendary: 12,
}

/** Power budget per rarity — used by balance-bible.md to score items. Float here
 *  is fine; this constant is design-time only and never enters the sim. */
export const RARITY_POWER_BUDGET: Readonly<Record<Rarity, number>> = {
  common:    1.0,
  uncommon:  1.6,
  rare:      2.4,
  epic:      3.5,
  legendary: 5.0,
}

/** Round → highest rarity available in the shop. (gdd.md § 4) */
export const RARITY_GATE_BY_ROUND: ReadonlyArray<Rarity> = [
  'common',    // round 1
  'common',    // round 2
  'common',    // round 3
  'uncommon',  // round 4
  'uncommon',  // round 5
  'uncommon',  // round 6
  'rare',      // round 7
  'rare',      // round 8
  'rare',      // round 9
  'epic',      // round 10
  'legendary', // round 11 (boss reward)
]


// ─────────────────────────────────────────────────────────────────────────────
// § 17 — TYPE GUARDS & UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export const isRarity = (v: unknown): v is Rarity =>
  v === 'common' || v === 'uncommon' || v === 'rare' || v === 'epic' || v === 'legendary'

export const isRunInProgress = (run: RunState): boolean =>
  run.outcome === 'in_progress'

export const isCombatTerminal = (e: CombatEvent): e is Extract<CombatEvent, { type: 'combat_end' }> =>
  e.type === 'combat_end'

/** Constructors for branded IDs. Centralized — never call `as ItemId` ad-hoc. */
export const ItemId       = (s: string): ItemId       => s as ItemId
export const RecipeId     = (s: string): RecipeId     => s as RecipeId
export const RelicId      = (s: string): RelicId      => s as RelicId
export const ContractId   = (s: string): ContractId   => s as ContractId
export const ClassId      = (s: string): ClassId      => s as ClassId
export const GhostId      = (s: string): GhostId      => s as GhostId
export const RunId        = (s: string): RunId        => s as RunId
export const PlacementId  = (s: string): PlacementId  => s as PlacementId
export const SimSeed      = (n: number): SimSeed      => n as SimSeed
export const IsoTimestamp = (s: string): IsoTimestamp => s as IsoTimestamp
export const IsoDate      = (s: string): IsoDate      => s as IsoDate
