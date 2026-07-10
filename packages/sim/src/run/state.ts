// state.ts — RunController class wrapping the round/run state machine. Owns
// the run's Rng, the effective ruleset, the bag, the shop, recipe-origin
// tracking (for the M1.2.4 recipeBonusPct routing per locked answer 15), and
// the round-by-round phase transitions.
//
// Phases (locked answer 13 — combineRecipe in 'arranging' only):
//   - arranging   buy/sell/reroll/place/move/rotate/combine. Free bag ops.
//   - combat      simulateCombat runs synchronously. Bag is read-only.
//   - resolution  combat resolved; rewards credited (hearts, win-bonus gold,
//                 history entry). Bag is read-only.
//   - ended       run terminated ('won' / 'eliminated' / 'abandoned').
//                 All mutating methods throw.
//
// Telemetry: the run controller emits TelemetryEvents through the optional
// onTelemetryEvent callback. The sim never imports telemetry — events flow IN
// to the controller, never out via import. tsClient / sessionId are populated
// from CreateRunInput defaults; the M1.5 client wrapper enriches before
// shipping to PostHog.

import {
  BASE_COMBATANT_HP,
  CONTRACTS,
  ITEMS,
  IsoTimestamp,
  type IsoDate,
  RECIPES,
  RELICS,
  RunId,
  type BagPlacement,
  type BagState,
  type CellCoord,
  type ClassId,
  type CombatEvent,
  type CombatInput,
  type CombatOutcome,
  type CombatResult,
  type Combatant,
  type Contract,
  type ContractId,
  type ContractMutator,
  type GhostBuild,
  type GhostId,
  type Item,
  type ItemId,
  type PlacementId,
  type Recipe,
  type RecipeId,
  type RelicId,
  type RelicSlots,
  type RoundNumber,
  type RoundOutcome,
  type Ruleset,
  type RunHistoryEntry,
  type RunOutcome,
  type RunState,
  type SerializedRunState,
  type SimSeed,
  type Rotation,
  type TelemetryEvent,
} from '@packbreaker/content';
import { simulateCombat } from '../combat';
import { canonicalCells } from '../iteration';
import { createRng, type Rng } from '../rng';
import {
  composeRuleset,
  baseIncomeForRound,
  type DerivedModifiers,
} from './ruleset';
import {
  detectRecipes as detectRecipesPure,
  type RecipeMatch,
} from './recipes';
import {
  computeRerollCost,
  effectiveItemCost,
  generateShop,
  sellValueOf,
} from './shop';

export type RunPhase = 'arranging' | 'combat' | 'resolution' | 'ended';

/** Input shape for `RunController.applyCombatOutcome`. Carries the
 *  post-simulateCombat data needed to record a combat outcome into run-state
 *  (hearts decrement on loss, history append, phase → 'resolution', combat_end
 *  + round_end telemetry emit). The 'apply_combat_outcome' action variant in
 *  RunControllerAction carries this same shape.
 *
 *  Used by two paths:
 *    1. Internal — RunController.runCombatInternal calls this immediately
 *       after `simulateCombat`. Pre-PR-1, the post-simulateCombat block was
 *       inlined; extracted into a method as of schema v0.6 / M1.5a PR 1 so
 *       client-side callers can record an externally-computed combat outcome
 *       without re-running combat.
 *    2. External — client-side combat-bridge path. Client runs simulateCombat
 *       through its own lazy-boundary-aware bridge, then dispatches
 *       'apply_combat_outcome' to the run controller carrying the outcome
 *       fields. Avoids importing state.ts → combat.ts subgraph into main
 *       chunk (resolves M1.5a §2a lazy-boundary risk).
 *
 *  opponentGhostId nullability matches RunHistoryEntry.opponentGhostId
 *  (GhostId | null). opponentClassId is optional in the input; `?? null`
 *  normalization writes the history entry's opponentClassId field. */
export interface ApplyCombatOutcomeInput {
  readonly outcome: CombatOutcome;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly endedAtTick: number;
  readonly opponentGhostId: GhostId | null;
  readonly opponentClassId: ClassId | null;
}

export interface CreateRunInput {
  readonly seed: SimSeed;
  readonly classId: ClassId;
  readonly contractId: ContractId;
  readonly startingRelicId: RelicId;
  /** Optional starting wall-clock timestamp. Sim has no clock — defaults to a
   *  fixed sentinel; the M1.5 client overrides with Date.now().toISOString()
   *  before persisting / shipping telemetry. */
  readonly startedAt?: IsoTimestamp;
  /** Optional telemetry session id. Defaults to ''. M1.5 client provides. */
  readonly sessionId?: string;
  /** Test-injection escape hatch — overrides ITEMS for sim-internal lookups
   *  (combat.ts, recipes.ts, shop.ts). Defaults to ITEMS. */
  readonly itemsRegistry?: Readonly<Record<ItemId, Item>>;
  /** Test-injection escape hatch — overrides RECIPES for combine detection.
   *  Defaults to RECIPES. */
  readonly recipesRegistry?: ReadonlyArray<Recipe>;
  /** Optional callback for telemetry events. Sim never imports telemetry —
   *  the M1.5 client wires PostHog through this. */
  readonly onTelemetryEvent?: (event: TelemetryEvent) => void;
  /** Optional telemetry entry-mode tag for the run_start payload. The client
   *  stamps 'class_select' (fresh class-select) or 'replay_same_class' (Play
   *  Again). Optional here so restoreRun / sim tests can omit it; the fresh-run
   *  emit defaults to DEFAULT_ENTRY_MODE. CF 55 (M1.5d PR 2). */
  readonly entryMode?: 'class_select' | 'replay_same_class';
}

export interface RunController {
  getState(): RunState;
  getPhase(): RunPhase;
  /** Returns the Mulberry32 rng cursor at its current position. Used by
   *  M1.5b PR 3 / 5b.3a's save path to capture the rng state into
   *  SerializedRunState.rngState; the rng can be reconstructed on
   *  restoreRun() to the same cursor position. Production client/sim
   *  split uses state.seed for combat seeding (constant) and client-side
   *  shop regeneration, so rngState is not load-bearing for the
   *  production replay path; sim's internal runCombatInternal IS
   *  load-bearing (tests/replay fixtures). Forward-compat insurance per
   *  Phase 1 ratification A4-minimal. */
  getRngState(): number;
  /** Returns the placement ids currently flagged recipe-born (the sim's
   *  internal bornFromRecipe Set as an array). Used by the save path to
   *  persist bornFromRecipe onto SerializedRunState so recipeBonusPct
   *  survives save→restore (CF 43). Mirrors getRngState()'s save-surface. */
  getRecipeBornPlacementIds(): ReadonlyArray<PlacementId>;
  /** Sim-authoritative player combat starting HP: BASE_COMBATANT_HP plus the
   *  sum of passiveStats.maxHpBonus over current bag placements — the same
   *  derivation runCombatInternal uses. Exposed so the client combat-input
   *  builder reads this value rather than recomputing or hardcoding it
   *  (tech-architecture.md § 4.5 Rule 2). */
  getPlayerStartingHp(): number;
  advancePhase(): void;
  buyItem(slotIndex: number): void;
  sellItem(placementId: PlacementId): void;
  placeItem(itemId: ItemId, anchor: CellCoord, rotation: Rotation): PlacementId;
  moveItem(placementId: PlacementId, anchor: CellCoord, rotation: Rotation): void;
  rotateItem(placementId: PlacementId, rotation: Rotation): void;
  rerollShop(): void;
  /** STOPGAP — shop-generation RNG basis (client shopSeedFor vs sim this.rng)
   *  is an open follow-on CF, opened at this PR's close. This method exists
   *  only until that resolves.
   *
   *  Overwrites the current shop's slots with client-supplied items (the
   *  shopSeedFor set actually shown to the player) AFTER the authoritative
   *  rerollShop/advancePhase call has already consumed this.rng. A pure slot
   *  overwrite: consumes no rng, leaves purchased/rerollsThisRound intact.
   *  Arranging-phase only. (M1.5e PR 1 / B2 Option 1.) */
  overrideShopSlots(slots: ReadonlyArray<ItemId>): void;
  detectRecipes(): ReadonlyArray<RecipeMatch>;
  /** Returns the anchor + first-fitting rotation for a recipe match's output,
   *  or null if no rotation fits at the inputs' top-left footprint with input
   *  cells treated as freed. Single source of truth for "would this combine
   *  succeed" — `combineRecipe` calls this before any mutation, and external
   *  callers (test harnesses, future UI gating) should call it to predict
   *  combine viability without attempting + catching. */
  findCombineRotation(match: RecipeMatch): { rotation: Rotation; anchor: CellCoord } | null;
  /** Combine a ready recipe. When `inputPlacementIds` names the exact input
   *  placements the caller selected (the client passes the specific match the
   *  player clicked), sim consumes THOSE items; omitted → the recipeId-only
   *  "first fitting candidate" behavior (M1.5e PR 1 Codex round 1, Finding 2). */
  combineRecipe(recipeId: RecipeId, inputPlacementIds?: ReadonlyArray<PlacementId>): void;
  /** Grants a mid- or boss-tier relic to the run's RelicSlots and recomposes
   *  the effective ruleset. Phase gating per gdd.md § 9:
   *    - 'mid' is legal only in arranging phase of round 6+.
   *    - 'boss' is legal only in resolution phase after a round-11 player_win.
   *  Throws on already-occupied slots, slot/relic-tier mismatches, unknown
   *  relicIds, or out-of-window phases. The new ruleset takes effect for ALL
   *  subsequent shop generations and combats; the CURRENT round's shop is NOT
   *  regenerated. Fires `relic_granted` telemetry on success only. */
  grantRelic(slot: 'mid' | 'boss', relicId: RelicId): void;
  /** Transitions phase 'arranging' → 'combat' without running combat.
   *  Counterpart to applyCombatOutcome for the client-driven combat path:
   *  client invokes enterCombatPhase, side-runs simulateCombat externally,
   *  dispatches apply_combat_outcome with the result.
   *
   *  Requires phase === 'arranging'; throws otherwise. */
  enterCombatPhase(): void;
  /** Records a combat outcome into run-state without running simulateCombat.
   *  Authoritative post-combat state mutator — decrements hearts on loss,
   *  credits winBonusGold + derived.bonusGoldOnWin on win, appends a
   *  RunHistoryEntry (with opponentClassId normalized via ?? null), transitions
   *  phase to 'resolution', and emits combat_end + round_end telemetry.
   *
   *  Extracted from runCombatInternal in schema v0.6 / M1.5a PR 1 to support
   *  the client-side combat-bridge path (caller runs simulateCombat externally
   *  + dispatches 'apply_combat_outcome'). § 4.5 R2 binding — this is the
   *  single authoritative post-combat state mutator; no consumer-side
   *  recomputation of hearts/history/phase. Requires phase === 'combat'
   *  (runCombatInternal's call site transitions arranging → combat before
   *  invoking simulateCombat; external callers establish the same
   *  precondition by invoking the `enterCombatPhase` action (added at
   *  M1.5a PR 2 Phase 2a, commit 00abda3) before the client-side
   *  simulateCombat call, OR by invoking start_combat first and using
   *  this method only for the post-simulateCombat path).
   *
   *  No re-entrancy guarantees on direct invocation paths beyond what
   *  start_combat already provides. */
  applyCombatOutcome(input: ApplyCombatOutcomeInput): void;
  startCombat(ghost: Combatant): CombatResult;
  /** Runs combat against a `GhostBuild` from `@packbreaker/content`. The
   *  controller derives the ghost's `Combatant` (passiveStats-summed startingHp,
   *  pass-through relics + classId + bag) and applies any `boss_only` contract
   *  mutator on this run's contract: `hpOverride` REPLACES startingHp;
   *  `damageBonus` and `lifestealPctBonus` flow through `simulateCombat`'s
   *  options.mutators to the ghost's `SideStats`. Player side is unaffected. */
  startCombatFromGhostBuild(ghost: GhostBuild): CombatResult;
  getEvents(): ReadonlyArray<CombatEvent>;
}

const DEFAULT_STARTED_AT = IsoTimestamp('2025-01-01T00:00:00.000Z');
const DEFAULT_SESSION_ID = '';
// CF 55 (M1.5d PR 2): run_start.entryMode default when the caller omits it
// (restoreRun never emits run_start; sim tests default to a fresh entry).
const DEFAULT_ENTRY_MODE = 'class_select' as const;

interface MutableShopState {
  slots: ItemId[];
  purchased: number[];
  rerollsThisRound: number;
}

interface MutableBagState {
  dimensions: { width: number; height: number };
  placements: BagPlacement[];
}

class RunControllerImpl implements RunController {
  private phase: RunPhase = 'arranging';
  private readonly rng: Rng;
  private readonly items: Readonly<Record<ItemId, Item>>;
  private readonly recipes: ReadonlyArray<Recipe>;
  private readonly contract: Contract;
  // effectiveRuleset and derived are recomputed on every grantRelic call
  // (M1.2.6 — new mid/boss relics fold into the run's modifiers immediately).
  // Initial composition still happens in the constructor; subsequent calls
  // come from grantRelic.
  private effectiveRuleset: Ruleset;
  private derived: DerivedModifiers;
  private readonly classId: ClassId;
  private readonly startedAt: IsoTimestamp;
  private readonly sessionId: string;
  private readonly seed: SimSeed;
  private readonly contractId: ContractId;
  private readonly runId: ReturnType<typeof RunId>;
  private readonly onTelemetryEvent: ((event: TelemetryEvent) => void) | undefined;

  // Mutable state
  private hearts: number;
  private gold: number;
  private trophy = 0;
  private currentRound: RoundNumber = 1;
  private bag: MutableBagState;
  private shop: MutableShopState;
  private relics: RelicSlots;
  private history: RunHistoryEntry[] = [];
  private outcome: RunOutcome = 'in_progress';

  // Internal-only run state (NOT serialized in RunState).
  private readonly pendingItems: ItemId[] = [];
  // Recipe-born placement ids (added on combineRecipe output; pruned on sell /
  // combine-input consumption). Serialized onto SerializedRunState via
  // getRecipeBornPlacementIds and rehydrated in the restore branch so
  // recipeBonusPct survives save→restore (CF 43 closed). Affected content:
  // Tinker passive / Pocket Forge / Catalyst / Worldforge Seed.
  private readonly bornFromRecipe: Set<PlacementId> = new Set();
  private nextPlacementCounter = 0;
  private lastCombatResult: CombatResult | null = null;

  constructor(input: CreateRunInput, restoreFrom?: SerializedRunState) {
    const contract = CONTRACTS[input.contractId];
    if (!contract) throw new Error(`Unknown contractId: ${String(input.contractId)}`);
    this.contract = contract;
    this.contractId = input.contractId;
    this.classId = input.classId;
    this.seed = input.seed;
    this.items = input.itemsRegistry ?? ITEMS;
    this.recipes = input.recipesRegistry ?? RECIPES;
    this.startedAt = input.startedAt ?? DEFAULT_STARTED_AT;
    this.sessionId = input.sessionId ?? DEFAULT_SESSION_ID;
    this.onTelemetryEvent = input.onTelemetryEvent;
    this.runId = RunId(`run-${String(input.seed)}`);

    const startingRelic = RELICS[input.startingRelicId];
    if (!startingRelic) {
      throw new Error(`Unknown startingRelicId: ${String(input.startingRelicId)}`);
    }

    // Relic slots: fresh run starts with starter only; restore takes all
    // three slots from the serialized snapshot.
    this.relics = restoreFrom
      ? { ...restoreFrom.relics }
      : {
          starter: input.startingRelicId,
          mid: null,
          boss: null,
        };

    // Compose effective ruleset from the relic set (which differs by path
    // — restore composes against all granted relics; fresh against starter
    // alone). grantRelic recomposes at runtime; this is the initial pass.
    const composed = composeRuleset(contract, input.classId, this.relics);
    this.effectiveRuleset = composed.ruleset;
    this.derived = composed.derived;

    if (restoreFrom) {
      // Restore mutable sim-authoritative state from the serialized snapshot
      // (Phase 1 ratification A4-minimal / B2′ persistence-time reconciliation).
      this.hearts = restoreFrom.hearts;
      this.currentRound = restoreFrom.currentRound;
      this.history = restoreFrom.history.slice();
      this.outcome = restoreFrom.outcome;
      // Quiescent-save invariant: save fires at arranging-entry or terminal.
      // Restored phase derives directly from outcome.
      this.phase = restoreFrom.outcome === 'in_progress' ? 'arranging' : 'ended';

      // Client-owned fields restored onto sim as non-authoritative mirrors
      // per Phase 1 ("match live invariant"): sim's gold is consumed only as
      // a delta source by onCombatDone's before/after observation, so the
      // absolute value need not match the client's authoritative gold.
      // Storing serialized.gold keeps the values aligned at the moment of
      // restore; subsequent buys/sells live client-side per Q2 Amendment A
      // and sim's gold drifts as usual. Sim's bag stays empty (client owns
      // bag per Q2 Amendment A); sim's placeItem is never called by client
      // code in M1.5a/b. CF 34 closure would re-evaluate (and amend B-F3 /
      // E-F9 per Phase 2.5h meta-audit carry-forwards).
      this.gold = restoreFrom.gold;
      // Trophy restore-mirror (parallel to gold above): sim owns trophy
      // (CF 34 / M1.5e PR 1), seeded from the client-authored snapshot.
      this.trophy = restoreFrom.trophy;
      // CF 43: rehydrate recipe-born membership so recipeBonusPct applies to
      // these placements after restore. Populate the (empty) Set in place —
      // the field is readonly. `?? []` is the effective empty-array default for
      // pre-fix saves: the field is optional and the client load boundary
      // validates without transforming, so a legacy snapshot arrives here with
      // bornFromRecipe absent (undefined) — treat that as empty (prior behavior).
      for (const id of restoreFrom.bornFromRecipe ?? []) this.bornFromRecipe.add(id);
      // B-F3 (M1.5e PR 1 Codex round 1): sim is now the bag authority, so
      // hydrate the saved placements instead of forcing empty. The data is
      // already serialized (schemas.ts § 13). Pre-flip this was empty because
      // the client owned the bag (Amendment A); post-flip an empty sim bag here
      // is projected onto the client by the first sync_from_sim after restore,
      // wiping every item (Codex P1 on the RunController restore path).
      this.bag = {
        dimensions: this.effectiveRuleset.bagDimensions,
        placements: restoreFrom.bag.placements.map((p) => ({ ...p })),
      };
      // E-F9: initialize the placement-id counter past the highest restored id
      // so newly-minted ids (buyItem→placeItem, combine output) can't collide
      // with restored placements. Ids are `p-${n}` (nextPlacementId); parse the
      // numeric suffix, take max+1. Non-`p-` ids (older saves) parse to NaN and
      // are skipped — they can't collide with the fresh `p-${n}` sequence.
      this.nextPlacementCounter = restoreFrom.bag.placements.reduce((mx, p) => {
        const s = String(p.placementId);
        const n = Number(s.slice(2));
        return s.startsWith('p-') && Number.isFinite(n) && n + 1 > mx ? n + 1 : mx;
      }, 0);

      // Restore shop VERBATIM from the serialized snapshot. Phase 2.5h
      // (Catch 23 / Class B) fix: prior path regenerated shop via
      // this.makeShop(currentRound) AFTER seeding rng, which (a) consumed
      // rng post-seed and so violated the terminal-RNG-seed invariant
      // (cursor drift by one makeShop worth of RNG consumption per
      // save→load cycle) and (b) produced a sim-side shop that did not
      // match serialized.shop. Verbatim restore makes the seeded rng
      // cursor terminal in this branch and pins sim's shop to the
      // client-authoritative shape persisted at save time (save-side
      // sourcing fix in apps/client/src/run/useRun.ts persists client's
      // shop into serialized.shop). Save→load→save is now byte-stable
      // under zero player action (C-F1 / C-F2 idempotence falls out).
      this.shop = {
        slots: restoreFrom.shop.slots.slice(),
        purchased: restoreFrom.shop.purchased.slice(),
        rerollsThisRound: restoreFrom.shop.rerollsThisRound,
      };

      // Restore rng cursor to its saved position. TERMINAL: no rng
      // consumption follows this line in the restore branch (verified at
      // Phase 2.5h Step 0 #2; makeShop was the sole post-seed consumer
      // and is removed above). SimSeed brand is just `number` at
      // runtime; the cast satisfies createRng's signature without
      // changing the bit pattern.
      this.rng = createRng(restoreFrom.rngState as SimSeed);

      // No run_start / daily_contract_started / round_start telemetry on
      // restore — the run already started on the original session; restoring
      // is not a new run.
    } else {
      this.hearts = this.effectiveRuleset.startingHearts;
      this.gold = composed.bonusStartingGold + baseIncomeForRound(1, this.effectiveRuleset);
      this.bag = {
        dimensions: this.effectiveRuleset.bagDimensions,
        placements: [],
      };

      this.rng = createRng(input.seed);
      this.shop = this.makeShop(1);

      // Telemetry: run_start (always), daily_contract_started (if isDaily).
      // CF 41 closure (M1.5c PR 1): startingRelicId added to the payload.
      // input.startingRelicId is the validated relic at this.relics.starter
      // (state.ts:285); plumbed through from client beginRun → createRun.
      // CF 55 (M1.5d PR 2): entryMode tags the entry path (class-select vs
      // Play Again). Optional on input; defaults to DEFAULT_ENTRY_MODE when
      // the caller omits it (sim tests). Restore never reaches this branch.
      this.emit({
        tsClient: this.startedAt,
        sessionId: this.sessionId,
        name: 'run_start',
        runId: this.runId,
        classId: input.classId,
        contractId: input.contractId,
        seed: input.seed,
        startingRelicId: input.startingRelicId,
        entryMode: input.entryMode ?? DEFAULT_ENTRY_MODE,
      });
      if (contract.isDaily) {
        this.emit({
          tsClient: this.startedAt,
          sessionId: this.sessionId,
          name: 'daily_contract_started',
          contractId: input.contractId,
          // Sim has no calendar; reuse startedAt's date prefix when available,
          // else a sentinel. M1.5 client supplies the real IsoDate.
          date: this.dateFromTimestamp(this.startedAt),
        });
      }
      this.emitRoundStart();
    }
  }

  // ─── Public surface ──────────────────────────────────────────────────

  getState(): RunState {
    return {
      runId: this.runId,
      seed: this.seed,
      classId: this.classId,
      contractId: this.contractId,
      // Effective ruleset (post-composeRuleset: contract base + class
      // passives + relic modifiers). Phase 2.5ii / Codex P2 #2 fix: prior
      // alias `this.contract.ruleset` leaked the BASE ruleset, so
      // resonant-anchor's shopSize+1 modifier never reached client
      // consumers reading state.state.ruleset.shopSize. snapshot.shop
      // already uses effective via makeShop, so the snapshot is now
      // internally consistent. Base ruleset remains accessible via
      // contractId → CONTRACTS lookup if any consumer needs it.
      ruleset: this.effectiveRuleset,
      derived: {
        extraRerollsPerRound: this.derived.extraRerollsPerRound,
        itemCostDelta: this.derived.itemCostDelta,
        bonusGoldOnWin: this.derived.bonusGoldOnWin,
      },
      startedAt: this.startedAt,
      hearts: this.hearts,
      gold: this.gold,
      currentRound: this.currentRound,
      bag: { dimensions: this.bag.dimensions, placements: this.bag.placements.slice() },
      relics: { ...this.relics },
      shop: {
        slots: this.shop.slots.slice(),
        purchased: this.shop.purchased.slice(),
        rerollsThisRound: this.shop.rerollsThisRound,
      },
      rerollCount: this.shop.rerollsThisRound,
      trophy: this.trophy,
      trophiesAtStart: 0, // M2 concern.
      history: this.history.slice(),
      outcome: this.outcome,
    };
  }

  getPhase(): RunPhase {
    return this.phase;
  }

  getRngState(): number {
    return this.rng.state;
  }

  getRecipeBornPlacementIds(): ReadonlyArray<PlacementId> {
    return [...this.bornFromRecipe];
  }

  getPlayerStartingHp(): number {
    return this.computePlayerStartingHp();
  }

  advancePhase(): void {
    if (this.phase === 'arranging' || this.phase === 'combat') {
      throw new Error(
        `advancePhase: invalid in '${this.phase}' phase (only 'resolution' and 'ended' are valid sources, and 'ended' is terminal)`,
      );
    }
    if (this.phase === 'ended') {
      throw new Error('advancePhase: run is ended; all transitions are terminal');
    }
    // resolution → arranging (next round) OR ended.
    const lastOutcome = this.lastCombatOutcomeForRound();
    if (this.shouldEndRun(lastOutcome)) {
      this.endRun(lastOutcome === 'win' ? 'won' : 'eliminated');
      return;
    }

    this.currentRound = (this.currentRound + 1) as RoundNumber;
    this.gold += baseIncomeForRound(this.currentRound, this.effectiveRuleset);
    // CF 59: item-driven gold income (goldPerRound passives + on_round_start
    // add_gold effects), credited after combat resolves and before the next
    // shop generates — included in the emitRoundStart() gold below.
    this.gold += computeItemGoldIncome(this.bag, this.items);
    this.shop = this.makeShop(this.currentRound);
    this.phase = 'arranging';
    this.lastCombatResult = null;
    this.emitRoundStart();
  }

  buyItem(slotIndex: number): void {
    this.requirePhase('arranging', 'buyItem');
    if (slotIndex < 0 || slotIndex >= this.shop.slots.length) {
      throw new Error(`buyItem: slotIndex ${slotIndex} out of range`);
    }
    if (this.shop.purchased.includes(slotIndex)) {
      throw new Error(`buyItem: slot ${slotIndex} already purchased this round`);
    }
    const itemId = this.shop.slots[slotIndex]!;
    const item = this.items[itemId]!;
    const cost = effectiveItemCost(
      item,
      this.derived.itemCostDelta,
      this.effectiveRuleset.itemCostMultiplierBp,
    );
    if (this.gold < cost) {
      throw new Error(`buyItem: insufficient gold (have ${this.gold}, need ${cost})`);
    }
    this.gold -= cost;
    this.shop.purchased.push(slotIndex);
    this.pendingItems.push(itemId);
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'shop_purchase',
      runId: this.runId,
      round: this.currentRound,
      itemId,
      cost,
    });
  }

  sellItem(placementId: PlacementId): void {
    this.requirePhase('arranging', 'sellItem');
    const idx = this.bag.placements.findIndex((p) => p.placementId === placementId);
    if (idx < 0) throw new Error(`sellItem: placement ${String(placementId)} not in bag`);
    const placement = this.bag.placements[idx]!;
    const item = this.items[placement.itemId]!;
    const recovered = sellValueOf(
      item,
      this.derived.itemCostDelta,
      this.effectiveRuleset.itemCostMultiplierBp,
      this.effectiveRuleset.sellRecoveryBp,
    );
    this.gold += recovered;
    this.bag.placements.splice(idx, 1);
    this.bornFromRecipe.delete(placementId);
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'shop_sell',
      runId: this.runId,
      round: this.currentRound,
      itemId: placement.itemId,
      recovered,
    });
  }

  placeItem(itemId: ItemId, anchor: CellCoord, rotation: Rotation): PlacementId {
    this.requirePhase('arranging', 'placeItem');
    const pendingIdx = this.pendingItems.indexOf(itemId);
    if (pendingIdx < 0) {
      throw new Error(
        `placeItem: itemId ${String(itemId)} is not in pending inventory (buy it first)`,
      );
    }
    const placementId = this.nextPlacementId();
    const candidate: BagPlacement = { placementId, itemId, anchor, rotation };
    if (!this.isValidPlacement(candidate)) {
      throw new Error(
        `placeItem: invalid placement at (${anchor.col},${anchor.row}) rot ${rotation}`,
      );
    }
    this.pendingItems.splice(pendingIdx, 1);
    this.bag.placements.push(candidate);
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'item_placed',
      runId: this.runId,
      itemId,
      placementId,
      anchor,
      rotation,
    });
    return placementId;
  }

  moveItem(placementId: PlacementId, anchor: CellCoord, rotation: Rotation): void {
    this.requirePhase('arranging', 'moveItem');
    const idx = this.bag.placements.findIndex((p) => p.placementId === placementId);
    if (idx < 0) throw new Error(`moveItem: placement ${String(placementId)} not in bag`);
    const existing = this.bag.placements[idx]!;
    const candidate: BagPlacement = {
      placementId,
      itemId: existing.itemId,
      anchor,
      rotation,
    };
    if (!this.isValidPlacement(candidate, new Set([placementId]))) {
      throw new Error(
        `moveItem: invalid placement at (${anchor.col},${anchor.row}) rot ${rotation}`,
      );
    }
    this.bag.placements[idx] = candidate;
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'item_moved',
      runId: this.runId,
      placementId,
      newAnchor: anchor,
    });
  }

  rotateItem(placementId: PlacementId, rotation: Rotation): void {
    this.requirePhase('arranging', 'rotateItem');
    const idx = this.bag.placements.findIndex((p) => p.placementId === placementId);
    if (idx < 0) throw new Error(`rotateItem: placement ${String(placementId)} not in bag`);
    const existing = this.bag.placements[idx]!;
    const candidate: BagPlacement = {
      placementId,
      itemId: existing.itemId,
      anchor: existing.anchor,
      rotation,
    };
    if (!this.isValidPlacement(candidate, new Set([placementId]))) {
      throw new Error(`rotateItem: rotation ${rotation} produces invalid layout`);
    }
    this.bag.placements[idx] = candidate;
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'item_rotated',
      runId: this.runId,
      placementId,
      newRotation: rotation,
    });
  }

  rerollShop(): void {
    this.requirePhase('arranging', 'rerollShop');
    const cost = computeRerollCost(
      this.shop.rerollsThisRound,
      this.effectiveRuleset.rerollCostStart,
      this.effectiveRuleset.rerollCostIncrement,
      this.derived.extraRerollsPerRound,
    );
    if (this.gold < cost) {
      throw new Error(
        `rerollShop: insufficient gold (have ${this.gold}, need ${cost})`,
      );
    }
    this.gold -= cost;
    this.shop.rerollsThisRound += 1;
    this.shop.purchased.length = 0;
    const fresh = generateShop(
      this.currentRound,
      this.classId,
      this.effectiveRuleset.shopSize,
      this.rng,
      this.items,
    );
    this.shop.slots = fresh.slots.slice();
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'shop_reroll',
      runId: this.runId,
      round: this.currentRound,
      cost,
      rerollIndex: this.shop.rerollsThisRound - 1,
    });
  }

  overrideShopSlots(slots: ReadonlyArray<ItemId>): void {
    // STOPGAP — shop-generation RNG basis (client shopSeedFor vs sim this.rng)
    // is an open follow-on CF, opened at this PR's close. This method exists
    // only until that resolves.
    this.requirePhase('arranging', 'overrideShopSlots');
    this.shop.slots = [...slots];
  }

  detectRecipes(): ReadonlyArray<RecipeMatch> {
    return detectRecipesPure(
      { dimensions: this.bag.dimensions, placements: this.bag.placements.slice() },
      this.recipes,
      this.items,
    );
  }

  findCombineRotation(
    match: RecipeMatch,
  ): { rotation: Rotation; anchor: CellCoord } | null {
    const recipe = this.recipes.find((r) => r.id === match.recipeId);
    if (!recipe) return null;

    // Compute top-left of input footprint (min row, min col across all input
    // cells). Returns null if any input is missing from the bag (stale match).
    let minRow = Infinity;
    let minCol = Infinity;
    for (const id of match.inputPlacementIds) {
      const p = this.bag.placements.find((q) => q.placementId === id);
      if (!p) return null;
      for (const cell of canonicalCells(p, this.items)) {
        if (cell.row < minRow) minRow = cell.row;
        if (cell.col < minCol) minCol = cell.col;
      }
    }
    if (!Number.isFinite(minRow) || !Number.isFinite(minCol)) return null;
    const anchor: CellCoord = { col: minCol, row: minRow };

    const inputIds = new Set(match.inputPlacementIds);
    const rotations: Rotation[] = [0, 90, 180, 270];
    for (const rotation of rotations) {
      const candidate: BagPlacement = {
        // placementId here is a placeholder used only by isValidPlacement's
        // exclusion logic; the real id is assigned in combineRecipe.
        placementId: 'cand-fit-check' as PlacementId,
        itemId: recipe.output,
        anchor,
        rotation,
      };
      if (this.isValidPlacement(candidate, inputIds)) {
        return { rotation, anchor };
      }
    }
    return null;
  }

  combineRecipe(recipeId: RecipeId, inputPlacementIds?: ReadonlyArray<PlacementId>): void {
    // Locked answer 13: combines arranging-only.
    this.requirePhase('arranging', 'combineRecipe');
    let candidates = this.detectRecipes().filter((m) => m.recipeId === recipeId);
    if (candidates.length === 0) {
      throw new Error(`combineRecipe: no match for recipeId ${String(recipeId)}`);
    }
    // Finding 2 (M1.5e PR 1 Codex round 1): when the caller names the exact
    // input placements the player selected, restrict to the matching candidate
    // so sim consumes THOSE items — not whichever cluster it detects first
    // (multiple ready matches for one recipe would otherwise disambiguate
    // arbitrarily). Omitted → unchanged "first fitting candidate" behavior
    // (backward-compatible for sim tests / determinism harness callers).
    if (inputPlacementIds !== undefined) {
      const want = new Set(inputPlacementIds.map((id) => String(id)));
      candidates = candidates.filter(
        (m) =>
          m.inputPlacementIds.length === want.size &&
          m.inputPlacementIds.every((id) => want.has(String(id))),
      );
      if (candidates.length === 0) {
        throw new Error(
          `combineRecipe: no ${String(recipeId)} match over the requested placements [${[...want].join(', ')}]`,
        );
      }
    }

    const recipe = this.recipes.find((r) => r.id === recipeId)!;
    // Try-then-commit: walk the match candidates in canonical order and
    // pick the first one whose output fits at its inputs' anchor. detectRecipes
    // can return multiple matches per recipeId when the bag has duplicate
    // inputs in different positions — picking the first FITTING one (rather
    // than the first one) means strategies that pre-filter via
    // wouldCombineFit on any specific match still see the controller commit
    // that combine. Throw fires in validation; nothing is rolled back because
    // nothing is committed unless validation passes.
    let chosenFit: { rotation: Rotation; anchor: CellCoord } | null = null;
    let chosenMatch: RecipeMatch | null = null;
    for (const candidate of candidates) {
      const fit = this.findCombineRotation(candidate);
      if (fit !== null) {
        chosenFit = fit;
        chosenMatch = candidate;
        break;
      }
    }
    if (chosenFit === null || chosenMatch === null) {
      throw new Error(
        `combineRecipe: cannot place output ${String(recipe.output)} — no rotation fits the freed footprint (checked ${candidates.length} match variant${candidates.length === 1 ? '' : 's'})`,
      );
    }

    // Commit phase.
    const inputIds = new Set(chosenMatch.inputPlacementIds);
    this.bag.placements = this.bag.placements.filter((p) => !inputIds.has(p.placementId));
    for (const id of inputIds) this.bornFromRecipe.delete(id);
    const outputPlacementId = this.nextPlacementId();
    this.bag.placements.push({
      placementId: outputPlacementId,
      itemId: recipe.output,
      anchor: chosenFit.anchor,
      rotation: chosenFit.rotation,
    });
    // Tinker's class.passive.recipeBonusPct + relic-driven recipe bonuses
    // apply to this placement at combat-start time. Track here; combat.ts
    // reads recipeBornPlacementIds via Combatant (locked answer 15).
    this.bornFromRecipe.add(outputPlacementId);

    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'recipe_completed',
      runId: this.runId,
      recipeId: recipe.id,
      round: this.currentRound,
    });
  }

  grantRelic(slot: 'mid' | 'boss', relicId: RelicId): void {
    // Defensive runtime check — TypeScript prevents 'starter' at compile time.
    if (slot !== 'mid' && slot !== 'boss') {
      throw new Error(
        `grantRelic: invalid slot '${String(slot)}' (must be 'mid' or 'boss'; 'starter' is not grantable post-creation)`,
      );
    }

    const relic = RELICS[relicId];
    if (!relic) {
      throw new Error(`grantRelic: unknown relicId '${String(relicId)}'`);
    }
    if (relic.slot !== slot) {
      throw new Error(
        `grantRelic: relic '${String(relicId)}' has slot '${relic.slot}', cannot grant to '${slot}' slot`,
      );
    }
    if (this.relics[slot] !== null) {
      throw new Error(
        `grantRelic: '${slot}' slot already occupied by '${String(this.relics[slot])}'`,
      );
    }

    if (slot === 'mid') {
      if (this.phase !== 'arranging' || this.currentRound < 6) {
        throw new Error(
          `grantRelic: 'mid' grant requires arranging phase of round 6+ (current: round ${this.currentRound}, phase '${this.phase}')`,
        );
      }
    } else {
      // slot === 'boss': resolution phase after a round-11 player_win.
      const last = this.history[this.history.length - 1];
      const lastOutcome = last?.outcome ?? null;
      const lastRound = last?.round ?? 0;
      if (this.phase !== 'resolution' || lastRound !== 11 || lastOutcome !== 'win') {
        throw new Error(
          `grantRelic: 'boss' grant requires resolution phase after a round-11 player_win (current: round ${this.currentRound}, phase '${this.phase}', last outcome '${lastOutcome}')`,
        );
      }
    }

    this.relics = { ...this.relics, [slot]: relicId };
    // Recompose: new mid/boss relic folds into derived modifiers + ruleset.
    // Current round's shop (already generated) is unchanged; the new ruleset
    // applies starting next round per locked answer #4.
    const composed = composeRuleset(this.contract, this.classId, this.relics);
    this.effectiveRuleset = composed.ruleset;
    this.derived = composed.derived;

    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'relic_granted',
      runId: this.runId,
      slot,
      relicId,
      round: this.currentRound,
    });
  }

  enterCombatPhase(): void {
    this.requirePhase('arranging', 'enterCombatPhase');
    this.phase = 'combat';
  }

  applyCombatOutcome(input: ApplyCombatOutcomeInput): void {
    // Phase guard (Codex P1 review finding on PR 13 / Phase 2.5 interlude):
    // applyCombatOutcome is legal only in 'combat' phase. The start_combat
    // path satisfies this via runCombatInternal's `this.phase = 'combat'` at
    // line 791 (pre-simulateCombat). The 'apply_combat_outcome' action
    // variant requires the dispatcher to first transition the controller
    // into 'combat' phase. Without this guard, dispatch from 'arranging' or
    // 'resolution' would corrupt run-state (duplicate history append,
    // erroneous reward credit/debit) on repeat invocations.
    this.requirePhase('combat', 'applyCombatOutcome');

    // Resolution-phase entry: credit win bonus, push history entry, decrement
    // hearts on loss. Phase transitions to 'resolution'.
    //
    // Pattern 5 verbatim-mirror discipline (M1.5a PR 1): body extracted
    // byte-identical-in-semantics from runCombatInternal's pre-PR-1 post-
    // simulateCombat block (lines 715-760 of the pre-PR-1 state.ts). The
    // start_combat path's call site passes input fields derived from the
    // CombatResult that simulateCombat just produced; the direct
    // 'apply_combat_outcome' action variant lets external callers (client
    // combat-bridge) supply the same inputs from their own simulateCombat
    // invocation.
    const roundOutcome: RoundOutcome = input.outcome === 'player_win' ? 'win' : 'loss';
    let goldEarnedThisRound = 0;
    if (roundOutcome === 'win') {
      goldEarnedThisRound =
        this.effectiveRuleset.winBonusGold + this.derived.bonusGoldOnWin;
      this.gold += goldEarnedThisRound;
      // Trophy accumulation (CF 34 / M1.5e PR 1): sim is now the authoritative
      // writer of run-cumulative trophy. +18/win is the M0 placeholder
      // (decision-log 2026-05-02 § M1.3.4a ratification 5); the M2 trophy-curve
      // owns the real schedule. Replaces the client accumulator this PR retires.
      this.trophy += 18;
    } else {
      this.hearts = Math.max(0, this.hearts - 1);
    }
    this.history.push({
      round: this.currentRound,
      outcome: roundOutcome,
      damageDealt: input.damageDealt,
      damageTaken: input.damageTaken,
      goldEarnedThisRound,
      opponentGhostId: input.opponentGhostId,
      opponentClassId: input.opponentClassId ?? null,
    });

    this.phase = 'resolution';

    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'combat_end',
      runId: this.runId,
      round: this.currentRound,
      outcome: input.outcome,
      endedAtTick: input.endedAtTick,
      damageDealt: input.damageDealt,
      damageTaken: input.damageTaken,
    });
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'round_end',
      runId: this.runId,
      round: this.currentRound,
      outcome: roundOutcome,
      damageDealt: input.damageDealt,
      damageTaken: input.damageTaken,
    });
  }

  startCombat(ghost: Combatant): CombatResult {
    return this.runCombatInternal(ghost, []);
  }

  startCombatFromGhostBuild(ghost: GhostBuild): CombatResult {
    const mutators = this.contract.ruleset.mutators;
    let startingHp = computeStartingHpFromBag(ghost.bag, this.items);
    // boss_only.hpOverride REPLACES startingHp (does not add).
    for (const m of mutators) {
      if (m.type === 'boss_only' && typeof m.hpOverride === 'number') {
        startingHp = m.hpOverride;
        break;
      }
    }
    const combatant: Combatant = {
      bag: {
        dimensions: ghost.bag.dimensions,
        placements: ghost.bag.placements.slice(),
      },
      relics: { ...ghost.relics },
      classId: ghost.classId,
      startingHp,
    };
    return this.runCombatInternal(combatant, mutators);
  }

  private runCombatInternal(
    ghost: Combatant,
    mutators: ReadonlyArray<ContractMutator>,
  ): CombatResult {
    this.requirePhase('arranging', 'startCombat');
    this.phase = 'combat';

    // Compose player Combatant. startingHp = BASE_COMBATANT_HP +
    // sum(item.passiveStats.maxHpBonus) — sim doesn't read passiveStats per
    // tech-architecture.md § 4.1 / lint rule, so we compute it here.
    const playerStartingHp = this.computePlayerStartingHp();
    const playerCombatant: Combatant = {
      bag: { dimensions: this.bag.dimensions, placements: this.bag.placements.slice() },
      relics: { ...this.relics },
      classId: this.classId,
      startingHp: playerStartingHp,
      recipeBornPlacementIds: [...this.bornFromRecipe],
    };

    // Combat consumes its own seed derived from the run RNG. One nextInt per
    // combat — keeps the run RNG advancing predictably even when combat takes
    // many rng.next() calls internally.
    const combatSeed = this.rng.nextInt(0, 0x7fffffff) as SimSeed;
    const combatInput: CombatInput = {
      seed: combatSeed,
      player: playerCombatant,
      ghost,
    };

    // Telemetry: combat_start (run-side) before sim runs.
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'combat_start',
      runId: this.runId,
      round: this.currentRound,
      opponentGhostId: null,
    });

    const result = simulateCombat(combatInput, { items: this.items, mutators });
    // Q2 disposition (M1.5a PR 1): lastCombatResult is sim-internal scratch
    // state read by getEvents(); kept on the start_combat path only.
    // applyCombatOutcome does NOT set this field — direct 'apply_combat_outcome'
    // callers are responsible for retaining the CombatResult on their own
    // side if they need the event stream post-call.
    this.lastCombatResult = result;

    // Compute damage stats from the events stream. Done HERE on the
    // start_combat path so applyCombatOutcome can take pre-computed damage
    // figures via input (avoids events dependency on the direct-action path).
    const { damageDealt, damageTaken } = computeDamageStats(result.events);

    this.applyCombatOutcome({
      outcome: result.outcome,
      damageDealt,
      damageTaken,
      endedAtTick: result.endedAtTick,
      opponentGhostId: null,
      opponentClassId: ghost.classId,
    });
    return result;
  }

  getEvents(): ReadonlyArray<CombatEvent> {
    return this.lastCombatResult?.events ?? [];
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private requirePhase(expected: RunPhase, op: string): void {
    if (this.phase !== expected) {
      throw new Error(
        `${op}: requires phase '${expected}' (current: '${this.phase}')`,
      );
    }
  }

  private nextPlacementId(): PlacementId {
    const id = `p-${this.nextPlacementCounter}` as PlacementId;
    this.nextPlacementCounter += 1;
    return id;
  }

  private isValidPlacement(
    candidate: BagPlacement,
    excludeIds?: ReadonlySet<PlacementId>,
  ): boolean {
    const cells = canonicalCells(candidate, this.items);
    const w = this.bag.dimensions.width;
    const h = this.bag.dimensions.height;
    for (const cell of cells) {
      if (cell.col < 0 || cell.col >= w) return false;
      if (cell.row < 0 || cell.row >= h) return false;
    }
    const occupied = new Set<string>();
    for (const p of this.bag.placements) {
      if (excludeIds?.has(p.placementId)) continue;
      for (const cell of canonicalCells(p, this.items)) {
        occupied.add(`${cell.row}:${cell.col}`);
      }
    }
    for (const cell of cells) {
      if (occupied.has(`${cell.row}:${cell.col}`)) return false;
    }
    return true;
  }

  private makeShop(round: RoundNumber): MutableShopState {
    const fresh = generateShop(
      round,
      this.classId,
      this.effectiveRuleset.shopSize,
      this.rng,
      this.items,
    );
    return {
      slots: fresh.slots.slice(),
      purchased: [],
      rerollsThisRound: 0,
    };
  }

  private computePlayerStartingHp(): number {
    return computeStartingHpFromBag(
      { dimensions: this.bag.dimensions, placements: this.bag.placements },
      this.items,
    );
  }

  private lastCombatOutcomeForRound(): RoundOutcome {
    return this.history[this.history.length - 1]!.outcome;
  }

  private shouldEndRun(lastOutcome: RoundOutcome | null): boolean {
    if (this.hearts <= 0) return true;
    if (this.currentRound >= this.effectiveRuleset.maxRounds) {
      // At the max round: any termination ends the run. Win → 'won', loss →
      // 'eliminated'. Open lever (bible § 18 Q4): boss-fight loss with hearts
      // remaining. Current call: still ends run.
      return true;
    }
    void lastOutcome;
    return false;
  }

  private endRun(outcome: RunOutcome): void {
    this.outcome = outcome;
    this.phase = 'ended';
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'run_end',
      runId: this.runId,
      outcome,
      roundReached: this.currentRound,
      heartsRemaining: this.hearts,
    });
    if (this.contract.isDaily) {
      this.emit({
        tsClient: this.startedAt,
        sessionId: this.sessionId,
        name: 'daily_contract_completed',
        contractId: this.contractId,
        date: this.dateFromTimestamp(this.startedAt),
        outcome,
      });
    }
  }

  private emitRoundStart(): void {
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'round_start',
      runId: this.runId,
      round: this.currentRound,
      hearts: this.hearts,
      gold: this.gold,
      itemsInBag: this.bag.placements.length,
    });
  }

  private emit(event: TelemetryEvent): void {
    if (!this.onTelemetryEvent) return;
    this.onTelemetryEvent(event);
  }

  private dateFromTimestamp(ts: IsoTimestamp): IsoDate {
    // ISO 8601 timestamp's date prefix (YYYY-MM-DD). Sim has no calendar;
    // M1.5 client overrides with the real date. IsoTimestamp brand contract
    // guarantees the string is at least 10 chars long.
    return String(ts).slice(0, 10) as IsoDate;
  }
}

/** Sums maxHpBonus from `passiveStats` across a bag's placements on top of
 *  `BASE_COMBATANT_HP`. Shared between player and ghost-build conversion paths
 *  in the run controller — content-schemas.ts § 0 designates the run controller
 *  as the legitimate `passiveStats` consumer. The sim-wide lint rule against
 *  passiveStats access is relaxed for `packages/sim/src/run/**` in
 *  `tooling/eslint-config/index.cjs`. */
function computeStartingHpFromBag(
  bag: BagState,
  items: Readonly<Record<ItemId, Item>>,
): number {
  let hp = BASE_COMBATANT_HP;
  for (const p of bag.placements) {
    const item = items[p.itemId]!;
    const bonus = item.passiveStats?.maxHpBonus;
    if (bonus) hp += bonus;
  }
  return hp;
}

/** Item-driven gold income for one completed round (CF 59). Two mechanisms,
 *  one credit site (advancePhase):
 *    - passiveStats.goldPerRound, summed over bag placements
 *      (balance-bible.md § 17: "summed per round-end and credited to the
 *      player's gold pool");
 *    - add_gold effects on on_round_start triggers (gdd.md § effects:
 *      add_gold is out-of-combat only; the combat resolver no-op at
 *      combat.ts case 'add_gold' is intentional and permanent). on_round_start
 *      fires once per combat, so its out-of-combat credit is a flat sum.
 *  add_gold attached to any OTHER trigger type is NOT credited here — it
 *  would be probabilistic/combat-dependent, which this out-of-combat credit
 *  cannot represent. A content-side invariant test (packages/content/test/
 *  items.test.ts) enforces that no such item exists. Sibling to
 *  computeStartingHpFromBag — the run controller is content-schemas.ts § 0's
 *  legitimate passiveStats consumer (lint relaxed for packages/sim/src/run/**). */
function computeItemGoldIncome(
  bag: BagState,
  items: Readonly<Record<ItemId, Item>>,
): number {
  let gold = 0;
  for (const p of bag.placements) {
    const item = items[p.itemId]!;
    const perRound = item.passiveStats?.goldPerRound;
    if (perRound) gold += perRound;
    for (const t of item.triggers) {
      if (t.type !== 'on_round_start') continue;
      for (const e of t.effects) {
        if (e.type === 'add_gold') gold += e.amount;
      }
    }
  }
  return gold;
}

/** Computes per-side damage totals from a CombatResult.events stream. Used
 *  for round_end telemetry and the RunHistoryEntry damage fields. status_tick
 *  damage counts toward the side that took it, even though it has no source. */
function computeDamageStats(
  events: ReadonlyArray<CombatEvent>,
): { damageDealt: number; damageTaken: number } {
  let damageDealt = 0;
  let damageTaken = 0;
  for (const e of events) {
    if (e.type === 'damage') {
      if (e.target === 'ghost') damageDealt += e.amount;
      else damageTaken += e.amount;
    } else if (e.type === 'status_tick') {
      if (e.target === 'ghost') damageDealt += e.damage;
      else damageTaken += e.damage;
    }
  }
  return { damageDealt, damageTaken };
}

export function createRun(input: CreateRunInput): RunController {
  return new RunControllerImpl(input);
}

/** Optional rehydration-side configuration. Restored runs don't need a fresh
 *  `seed` / `classId` / `contractId` / `startingRelicId` — those come from
 *  the serialized snapshot. The client passes `sessionId` + `onTelemetryEvent`
 *  to keep telemetry routing alive post-restore (run_start is NOT re-emitted;
 *  subsequent round_start / shop_* / combat_* / run_end events flow through
 *  the same callback). `itemsRegistry` + `recipesRegistry` are test-injection
 *  hatches, symmetric with CreateRunInput. */
export interface RestoreRunOptions {
  readonly sessionId?: string;
  readonly itemsRegistry?: Readonly<Record<ItemId, Item>>;
  readonly recipesRegistry?: ReadonlyArray<Recipe>;
  readonly onTelemetryEvent?: (event: TelemetryEvent) => void;
}

/** Rebuilds a live RunController from a SerializedRunState. Companion to
 *  createRun() for the M1.5b PR 3 / 5b.3a LocalSaveV1 path: client loads
 *  a persisted save and feeds it through restoreRun to get a controller
 *  whose getState() matches the serialized snapshot's RunState slice.
 *
 *  Quiescent-save invariant: the serialized snapshot was captured at
 *  arranging-entry (post-combat shop regen) or at terminal outcome.
 *  Restored phase derives from outcome: 'arranging' iff outcome ===
 *  'in_progress'; 'ended' otherwise. Other RunPhases ('combat',
 *  'resolution') are not representable in the save and not produced by
 *  this factory.
 *
 *  Sim-authoritative state restored: hearts, currentRound, history,
 *  outcome, relics, rng cursor (via SerializedRunState.rngState).
 *  effectiveRuleset + derived recomposed from the restored relic set
 *  (constructor recomposes when restoreFrom is present).
 *
 *  Sim-side gold / bag / shop are restored as "match live invariant"
 *  per Phase 1 ratification — see constructor body for the per-field
 *  rationale. Shop is restored VERBATIM from serialized.shop (Phase
 *  2.5h / Catch 23); the rngState seed is terminal in the restore
 *  branch. Client-owned authoritative gold / bag / shop / rerollCount
 *  / trophy land back on ClientRunState through the save/load wrapper,
 *  NOT through this factory.
 *
 *  Throws if serialized.relics.starter is null — every shipped save
 *  should have a non-null starter (set at class-select time per M1.5b
 *  PR 1); a null starter indicates corrupted save data. */
export function restoreRun(
  serialized: SerializedRunState,
  options?: RestoreRunOptions,
): RunController {
  if (serialized.relics.starter === null) {
    throw new Error('restoreRun: serialized.relics.starter is null; cannot rehydrate');
  }
  const input: CreateRunInput = {
    seed: serialized.seed,
    classId: serialized.classId,
    contractId: serialized.contractId,
    startingRelicId: serialized.relics.starter,
    startedAt: serialized.startedAt,
    sessionId: options?.sessionId,
    itemsRegistry: options?.itemsRegistry,
    recipesRegistry: options?.recipesRegistry,
    onTelemetryEvent: options?.onTelemetryEvent,
  };
  return new RunControllerImpl(input, serialized);
}
