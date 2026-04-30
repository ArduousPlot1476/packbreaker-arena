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
  type CombatResult,
  type Combatant,
  type Contract,
  type ContractId,
  type ContractMutator,
  type GhostBuild,
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
}

export interface RunController {
  getState(): RunState;
  getPhase(): RunPhase;
  advancePhase(): void;
  buyItem(slotIndex: number): void;
  sellItem(placementId: PlacementId): void;
  placeItem(itemId: ItemId, anchor: CellCoord, rotation: Rotation): PlacementId;
  moveItem(placementId: PlacementId, anchor: CellCoord, rotation: Rotation): void;
  rotateItem(placementId: PlacementId, rotation: Rotation): void;
  rerollShop(): void;
  detectRecipes(): ReadonlyArray<RecipeMatch>;
  combineRecipe(recipeId: RecipeId): void;
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
  private readonly effectiveRuleset: Ruleset;
  private readonly derived: DerivedModifiers;
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
  private currentRound: RoundNumber = 1;
  private bag: MutableBagState;
  private shop: MutableShopState;
  private relics: RelicSlots;
  private history: RunHistoryEntry[] = [];
  private outcome: RunOutcome = 'in_progress';

  // Internal-only run state (NOT serialized in RunState).
  private readonly pendingItems: ItemId[] = [];
  private readonly bornFromRecipe: Set<PlacementId> = new Set();
  private nextPlacementCounter = 0;
  private lastCombatResult: CombatResult | null = null;

  constructor(input: CreateRunInput) {
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
    this.relics = {
      starter: input.startingRelicId,
      mid: null,
      boss: null,
    };

    const composed = composeRuleset(contract, input.classId, this.relics);
    this.effectiveRuleset = composed.ruleset;
    this.derived = composed.derived;

    this.hearts = this.effectiveRuleset.startingHearts;
    this.gold = composed.bonusStartingGold + baseIncomeForRound(1, this.effectiveRuleset);
    this.bag = {
      dimensions: this.effectiveRuleset.bagDimensions,
      placements: [],
    };

    this.rng = createRng(input.seed);
    this.shop = this.makeShop(1);

    // Telemetry: run_start (always), daily_contract_started (if isDaily).
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'run_start',
      runId: this.runId,
      classId: input.classId,
      contractId: input.contractId,
      seed: input.seed,
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

  // ─── Public surface ──────────────────────────────────────────────────

  getState(): RunState {
    return {
      runId: this.runId,
      seed: this.seed,
      classId: this.classId,
      contractId: this.contractId,
      ruleset: this.contract.ruleset,
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
      trophiesAtStart: 0, // M2 concern.
      history: this.history.slice(),
      outcome: this.outcome,
    };
  }

  getPhase(): RunPhase {
    return this.phase;
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

  detectRecipes(): ReadonlyArray<RecipeMatch> {
    return detectRecipesPure(
      { dimensions: this.bag.dimensions, placements: this.bag.placements.slice() },
      this.recipes,
      this.items,
    );
  }

  combineRecipe(recipeId: RecipeId): void {
    // Locked answer 13: combines arranging-only.
    this.requirePhase('arranging', 'combineRecipe');
    const matches = this.detectRecipes();
    const match = matches.find((m) => m.recipeId === recipeId);
    if (!match) throw new Error(`combineRecipe: no match for recipeId ${String(recipeId)}`);

    const recipe = this.recipes.find((r) => r.id === recipeId)!;
    const inputIds = new Set(match.inputPlacementIds);

    // Compute top-left of input footprint: min row, then min col across all
    // input cells. Anchor = (minCol, minRow); rotations 0 / 90 / 180 / 270.
    let minRow = Infinity;
    let minCol = Infinity;
    for (const id of match.inputPlacementIds) {
      const p = this.bag.placements.find((q) => q.placementId === id)!;
      for (const cell of canonicalCells(p, this.items)) {
        if (cell.row < minRow) minRow = cell.row;
        if (cell.col < minCol) minCol = cell.col;
      }
    }

    // Try-then-commit: find a valid output placement with input cells excluded
    // from the occupancy check, then atomically remove inputs and add output.
    // M1 invariant: every recipe's output fits in at least one rotation; M3
    // content protection (registry-time validation) is deferred.
    const outputPlacementId = this.nextPlacementId();
    const anchor: CellCoord = { col: minCol, row: minRow };
    const rotations: Rotation[] = [0, 90, 180, 270];
    let placed: BagPlacement | null = null;
    for (const rot of rotations) {
      const candidate: BagPlacement = {
        placementId: outputPlacementId,
        itemId: recipe.output,
        anchor,
        rotation: rot,
      };
      if (this.isValidPlacement(candidate, inputIds)) {
        placed = candidate;
        break;
      }
    }

    this.bag.placements = this.bag.placements.filter((p) => !inputIds.has(p.placementId));
    for (const id of inputIds) this.bornFromRecipe.delete(id);
    this.bag.placements.push(placed!);
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
    this.lastCombatResult = result;

    // Compute damage stats for telemetry / history.
    const { damageDealt, damageTaken } = computeDamageStats(result.events);

    // Resolution-phase entry: credit win bonus, push history entry, decrement
    // hearts on loss. Phase transitions to 'resolution'.
    const roundOutcome: RoundOutcome = result.outcome === 'player_win' ? 'win' : 'loss';
    let goldEarnedThisRound = 0;
    if (roundOutcome === 'win') {
      goldEarnedThisRound =
        this.effectiveRuleset.winBonusGold + this.derived.bonusGoldOnWin;
      this.gold += goldEarnedThisRound;
    } else {
      this.hearts = Math.max(0, this.hearts - 1);
    }
    this.history.push({
      round: this.currentRound,
      outcome: roundOutcome,
      damageDealt,
      damageTaken,
      goldEarnedThisRound,
      opponentGhostId: null,
    });

    this.phase = 'resolution';

    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'combat_end',
      runId: this.runId,
      round: this.currentRound,
      outcome: result.outcome,
      endedAtTick: result.endedAtTick,
      damageDealt,
      damageTaken,
    });
    this.emit({
      tsClient: this.startedAt,
      sessionId: this.sessionId,
      name: 'round_end',
      runId: this.runId,
      round: this.currentRound,
      outcome: roundOutcome,
      damageDealt,
      damageTaken,
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
