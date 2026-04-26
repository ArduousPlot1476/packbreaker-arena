// Single source of truth — telemetry-plan.md § 3 owns the meaning.
//
// Verbatim port of content-schemas.ts § 15 TelemetryEvent discriminated union.
// Branded ID + struct types come from @packbreaker/content (M1.1 deviation —
// see decision-log.md). Direction is shared ← content only; never the inverse.

import type {
  CellCoord,
  ClassId,
  CombatOutcome,
  ContractId,
  GhostId,
  IsoDate,
  IsoTimestamp,
  ItemId,
  PlacementId,
  RecipeId,
  RoundNumber,
  RoundOutcome,
  Rotation,
  RunId,
  RunOutcome,
  SimSeed,
} from '@packbreaker/content';

interface TelemetryBase {
  readonly tsClient: IsoTimestamp;
  readonly sessionId: string;
}

export type TelemetryEvent =
  // Run lifecycle
  | (TelemetryBase & {
      readonly name: 'run_start';
      readonly runId: RunId;
      readonly classId: ClassId;
      readonly contractId: ContractId;
      readonly seed: SimSeed;
    })
  | (TelemetryBase & {
      readonly name: 'run_end';
      readonly runId: RunId;
      readonly outcome: RunOutcome;
      readonly roundReached: RoundNumber;
      readonly heartsRemaining: number;
    })

  // Round lifecycle
  | (TelemetryBase & {
      readonly name: 'round_start';
      readonly runId: RunId;
      readonly round: RoundNumber;
      readonly hearts: number;
      readonly gold: number;
      readonly itemsInBag: number;
    })
  | (TelemetryBase & {
      readonly name: 'round_end';
      readonly runId: RunId;
      readonly round: RoundNumber;
      readonly outcome: RoundOutcome;
      readonly damageDealt: number;
      readonly damageTaken: number;
    })

  // Shop
  | (TelemetryBase & {
      readonly name: 'shop_purchase';
      readonly runId: RunId;
      readonly round: RoundNumber;
      readonly itemId: ItemId;
      readonly cost: number;
    })
  | (TelemetryBase & {
      readonly name: 'shop_sell';
      readonly runId: RunId;
      readonly round: RoundNumber;
      readonly itemId: ItemId;
      readonly recovered: number;
    })
  | (TelemetryBase & {
      readonly name: 'shop_reroll';
      readonly runId: RunId;
      readonly round: RoundNumber;
      readonly cost: number;
      readonly rerollIndex: number;
    })

  // Bag
  | (TelemetryBase & {
      readonly name: 'item_placed';
      readonly runId: RunId;
      readonly itemId: ItemId;
      readonly placementId: PlacementId;
      readonly anchor: CellCoord;
      readonly rotation: Rotation;
    })
  | (TelemetryBase & {
      readonly name: 'item_rotated';
      readonly runId: RunId;
      readonly placementId: PlacementId;
      readonly newRotation: Rotation;
    })
  | (TelemetryBase & {
      readonly name: 'item_moved';
      readonly runId: RunId;
      readonly placementId: PlacementId;
      readonly newAnchor: CellCoord;
    })
  | (TelemetryBase & {
      readonly name: 'recipe_completed';
      readonly runId: RunId;
      readonly recipeId: RecipeId;
      readonly round: RoundNumber;
    })

  // Combat
  | (TelemetryBase & {
      readonly name: 'combat_start';
      readonly runId: RunId;
      readonly round: RoundNumber;
      readonly opponentGhostId: GhostId | null;
    })
  | (TelemetryBase & {
      readonly name: 'combat_end';
      readonly runId: RunId;
      readonly round: RoundNumber;
      readonly outcome: CombatOutcome;
      readonly endedAtTick: number;
      readonly damageDealt: number;
      readonly damageTaken: number;
    })

  // Onboarding
  | (TelemetryBase & {
      readonly name: 'tutorial_step_reached';
      readonly stepId: string;
    })
  | (TelemetryBase & { readonly name: 'tutorial_completed' })
  | (TelemetryBase & { readonly name: 'tutorial_abandoned'; readonly stepId: string })

  // Daily
  | (TelemetryBase & {
      readonly name: 'daily_contract_started';
      readonly contractId: ContractId;
      readonly date: IsoDate;
    })
  | (TelemetryBase & {
      readonly name: 'daily_contract_completed';
      readonly contractId: ContractId;
      readonly date: IsoDate;
      readonly outcome: RunOutcome;
    })

  // Crash visibility (added 2026-04-27 per telemetry-plan.md § 9 recommendation)
  | (TelemetryBase & {
      readonly name: 'error_boundary_caught';
      readonly errorMessage: string;
      readonly componentStack: string;
    });

export type TelemetryEventName = TelemetryEvent['name'];
