import type {
  CellData,
  ContainerPlacementData,
  EntityData,
  GamePackage,
  MapData,
  ObjectData,
  ObjectPlacementData,
  SimulationProcessDefinitionData,
  SimulationWorkstationData,
  SimulationTraceProfileData,
  SkillData,
} from "../schema/game";
import type {
  MapDelta,
  PlaySave,
  SimulationEnvironmentFieldRecord,
  SimulationEconomyStockRecord,
  SimulationNpcTaskRecord,
  SimulationProcessRecord,
  SimulationRegionalStateRecord,
  SimulationSurfaceLayerRecord,
} from "../schema/save";
import {
  doorPlacementKey,
  isBuildingDoorPlacement,
  isDoorPlacementOpen,
  isDoorPlacementUnlocked,
} from "../utils/doorPlacement";
import { entityPlacementStateKey } from "../utils/entityState";
import { getEnemyXpReward, grantExperienceToSave } from "../utils/leveling";
import {
  applyPlacementDeltas,
  isPushableObject,
  placementHasCollision,
  placementOriginKey,
} from "../utils/objectFootprint";
import { getJamEngineVisualHeight } from "../utils/legacyJamCompatibility";
import { EventBus } from "./events";
import {
  FINE_PER_MACRO,
  fineCoordKey,
} from "./gridCoordinates";
import { isFineExpandedPackage } from "./fineWorld";
import {
  appendKernelFactsToSave,
  createKernelFactsFromEngineEvents,
} from "./kernel";
import {
  compactNpcTaskHistory,
  compactSimulationProcessHistory,
  recordSimulationCondition,
  resolveObjectManipulationAffordance,
} from "./simulation";
import {
  CombatAttackOutcome,
  CombatPartyFollowerRef,
  CombatSessionUpdateOptions,
  CombatSessionUpdateOutcome,
  CombatTurnAdvanceOutcome,
  ContainerItemRef,
  ContainerRef,
  DialogueChoiceOutcome,
  KeywordDialogueOutcome,
  DoorRef,
  DroppedItemRef,
  Engine,
  EnemyTurnOutcome,
  EnvironmentCellRef,
  GridEntity,
  GroundItemRef,
  InteractiveGridWorld,
  MapTransitionRef,
  MechanicalSoundMetadata,
  NpcTaskAdvanceOutcome,
  PushableObjectRef,
  QuestObjectiveCompletion,
  registerCoreCommands,
  SimulationProcessOutcome,
  SimulationProcessStartOptions,
  SimulationSemanticAdapterOutcome,
  ShopTransactionOutcome,
  SkillCastHit,
  SkillCastOutcome,
  SurfaceLayerRef,
  TriggerRef,
  ValidationResult,
} from "./pipeline";
import {
  isActorUsingStealthStance,
  movementNoiseLoudness,
  resolveMovementHearingSettings,
} from "./hearingStealth";
import { hashSeed, RngStreams } from "./rng";
import {
  buildConditionContext,
  getAvailableShopStock,
  resolveDialogueChoice,
  resolveEnding,
} from "./story";
import {
  discoverDocumentDialogueTopics,
  discoverItemDialogueTopics,
  discoverMapDialogueTopics,
  resolveKeywordDialogueResponse,
  selectKeywordDialogueTopic,
  type DialogueTopicRef,
} from "./keywordDialogue";
import { applyStatus, statModifiers, type StatusInstance } from "./statuses";
import {
  alderamonticoImpulseHasEffect,
  applyAlderamonticoImpulseToSave,
  dispatchAlderamonticoAttendNode,
  entityEmotionalSeed,
  resolveAlderamonticoBehavior,
  type AlderamonticoAttendNode,
  type AlderamonticoAttendNodeDispatchOptions,
  type AlderamonticoAttendNodeResult,
  type AlderamonticoEmotionalImpulse,
} from "./alderamonticoState";
import {
  decideEntityAction,
  recordEntityBehaviorDecision,
  type BehaviorCommitmentRecord,
} from "./behaviorArbiter";
import {
  recordArtifactPickup,
  recordGlassHarvest,
} from "./fractureCrawlLegacy";

export const PLAYER_ENTITY_ID = "player";

export interface V1GridWorldOptions {
  gamePackage: GamePackage;
  save: PlaySave;
  mapId?: string;
  masterSeed?: number;
}

export interface V1ActionCostOptions {
  energyCost?: number;
  clockMinutes?: number;
  // Reserved for authored/systemic dispatch. Player-facing calls leave this
  // false so the stance remains a real engine rule rather than only a UI lock.
  bypassPlayerStealth?: boolean;
}

export interface V1MoveDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
  dx: number;
  dy: number;
  allowDoorwayAssist?: boolean;
}

export interface V1WaitDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
}

export interface V1StateDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
}

export interface V1SetSwitchDispatchOptions extends V1StateDispatchOptions {
  switchId: string;
  value?: boolean;
}

export interface V1SetQuestDispatchOptions extends V1StateDispatchOptions {
  questId: string;
  state: string;
}

export interface V1ItemGrantDispatchOptions extends V1StateDispatchOptions {
  itemId: string;
  count?: number;
}

export interface V1CurrencyDispatchOptions extends V1StateDispatchOptions {
  amount: number;
}

export interface V1FactionRepDispatchOptions extends V1StateDispatchOptions {
  factionId: string;
  amount: number;
}

export interface V1DocumentDispatchOptions extends V1StateDispatchOptions {
  documentId: string;
}

export interface V1SkillDispatchOptions extends V1StateDispatchOptions {
  skillId: string;
}

export interface V1QuestObjectiveDispatchOptions extends V1StateDispatchOptions {
  objectiveId: string;
  targetId?: string;
  objectiveType?: string;
}

export interface V1PositionDispatchOptions extends V1StateDispatchOptions {
  cell: [number, number];
  facing?: [number, number];
}

export interface V1TeleportDispatchOptions extends V1PositionDispatchOptions {
  mapId?: string;
}

export interface V1EntityPositionDispatchOptions extends V1PositionDispatchOptions {
  entityId: string;
}

export interface V1PlayerSpriteDispatchOptions extends V1StateDispatchOptions {
  spriteId?: string;
}

export interface V1HealPlayerDispatchOptions extends V1StateDispatchOptions {
  amount: number;
}

export interface V1PartyMemberDispatchOptions extends V1StateDispatchOptions {
  entityId: string;
}

export interface V1ClockDispatchOptions extends V1StateDispatchOptions {
  minutes: number;
}

export interface V1ModifyPlayerStatsDispatchOptions extends V1StateDispatchOptions {
  stats: Record<string, number>;
}

export interface V1SetEntityHiddenDispatchOptions extends V1StateDispatchOptions {
  entityId: string;
  hidden?: boolean;
}

export interface V1BarkDispatchOptions extends V1StateDispatchOptions {
  barkId: string;
  clockMinutes?: number;
}

export interface V1GameEndDispatchOptions extends V1StateDispatchOptions {
  endingId?: string;
  title?: string;
}

export interface V1ChooseDialogueOptionDispatchOptions extends V1StateDispatchOptions {
  dialogueId: string;
  nodeId: string;
  optionIndex: number;
}

export interface V1SelectDialogueTopicDispatchOptions extends V1StateDispatchOptions {
  dialogueId: string;
  topic?: DialogueTopicRef | null;
  participantKey?: string;
  shownItemId?: string;
  entryNodeId?: string;
  countAsk?: boolean;
}

export interface V1ShopBuyDispatchOptions extends V1StateDispatchOptions {
  shopId: string;
  stockIndex: number;
}

export interface V1ShopSellDispatchOptions extends V1StateDispatchOptions {
  shopId?: string;
  itemId: string;
  count?: number;
}

export interface V1MeleeAttackDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId: string;
  targetId: string;
}

export interface V1CastSkillDispatchOptions extends V1GridWorldOptions {
  actorId: string;
  skillId: string;
  targetCells: [number, number][];
}

export interface V1CombatSessionDispatchOptions extends V1GridWorldOptions {
  threatRadius?: number;
  chaseRadius?: number;
  partyFollowers?: CombatPartyFollowerRef[];
  forceEnd?: boolean;
  requireAlert?: boolean;
}

export interface V1CombatTurnDispatchOptions extends V1GridWorldOptions {
  actorId?: string;
  advanceTurn?: boolean;
  movementSteps?: number;
  allowAttack?: boolean;
}

export interface V1EnemyPulseDispatchOptions extends V1GridWorldOptions {
  actorIds: string[];
  movementSteps?: number;
  allowAttack?: boolean;
}

export interface V1SkillTargetOptions extends V1GridWorldOptions {
  actorId: string;
  skillId: string;
  targetCell: [number, number];
}

export interface V1SkillTargetResult extends ValidationResult {
  cells: [number, number][];
}

export interface V1NearbyHostilesOptions extends V1GridWorldOptions {
  radius: number;
}

export interface V1CombatantSnapshot {
  id: string;
  entityId?: string;
  name: string;
  kind: "player" | "party" | "entity";
  cell: [number, number];
  facing?: [number, number];
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  speed: number;
  skills: string[];
  dist?: number;
}

export interface V1ChangeMapDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
  targetMapId: string;
  targetSpawnId?: string;
  facing?: [number, number];
  exitId?: string;
}

export interface V1TriggerDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
  triggerId: string;
}

export interface V1ContainerDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
  containerId: string;
}

export interface V1ContainerItemDispatchOptions extends V1ContainerDispatchOptions {
  entryIndex: number;
}

export interface V1ContainerStowDispatchOptions extends V1ContainerDispatchOptions {
  itemId: string;
  count?: number;
}

export interface V1DropItemDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
  itemId: string;
  count?: number;
  cell: [number, number];
}

export interface V1DecaySurfacesDispatchOptions extends V1GridWorldOptions {
  actorId?: string;
  ticks: number;
}

export interface V1AdvanceEnvironmentDispatchOptions extends V1GridWorldOptions {
  actorId?: string;
  ticks: number;
}

export interface V1EmitSoundDispatchOptions extends V1GridWorldOptions {
  actorId?: string;
  cell: [number, number];
  loudness: number;
  tag?: string;
  materialTag?: string;
  sourceCategory?: string;
  sourceEntityId?: string;
  sourceFactionId?: string;
  ownerId?: string;
  sourceAction?: string;
  revealsIdentity?: boolean;
  durationTicks?: number;
  tags?: string[];
  compactPropagation?: boolean;
}

export interface V1AdvanceNpcTasksDispatchOptions extends V1GridWorldOptions {
  actorId?: string;
  ticks: number;
}

export interface V1StartProcessDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
  processId?: string;
  processType?: string;
  cell: [number, number];
  workstationId?: string;
  shopId?: string;
  actorIds?: string[];
  requiredTicks?: number;
  inputItems?: { item_id: string; count: number }[];
  outputItems?: { item_id: string; count: number }[];
  wasteItems?: { item_id: string; count: number }[];
  emits?: SimulationProcessStartOptions["emits"];
}

export interface V1AdvanceProcessesDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
  ticks: number;
}

export interface V1InterruptProcessDispatchOptions extends V1GridWorldOptions {
  actorId?: string;
  processId: string;
  reason?: string;
}

export interface V1AdvanceSimulationRegionsDispatchOptions extends V1GridWorldOptions {
  actorId?: string;
  ticks: number;
}

export interface V1AdaptSimulationSemanticsDispatchOptions extends V1GridWorldOptions {
  actorId?: string;
  mapId?: string;
}

export interface V1AttendNodeDispatchOptions
  extends V1GridWorldOptions,
    AlderamonticoAttendNodeDispatchOptions {
  node: AlderamonticoAttendNode;
}

export type V1AttendNodeDispatchResult = AlderamonticoAttendNodeResult;

const coordKey = fineCoordKey;
const cloneCell = (cell: [number, number]): [number, number] => [cell[0], cell[1]];

const cloneSaveForRuntime = (save: PlaySave): PlaySave => ({
  ...save,
  player: {
    ...save.player,
    cell: cloneCell(save.player.cell),
    facing: cloneCell(save.player.facing),
  },
  playerStats: { ...save.playerStats },
  flags: { ...(save.flags || {}) },
  variables: save.variables ? { ...save.variables } : undefined,
  relationships: save.relationships ? { ...save.relationships } : undefined,
  quests: { ...(save.quests || {}) },
  inventory: [...(save.inventory || [])],
  chemistry: save.chemistry ? structuredClone(save.chemistry) : undefined,
  chemistry_runs: save.chemistry_runs ? structuredClone(save.chemistry_runs) : undefined,
  chemistry_active: save.chemistry_active ? structuredClone(save.chemistry_active) : undefined,
  entity_states: { ...(save.entity_states || {}) },
  party_members: [...(save.party_members || [])],
  map_deltas: { ...(save.map_deltas || {}) },
  faction_rep: { ...(save.faction_rep || {}) },
  read_documents: [...(save.read_documents || [])],
  dialogue_memory: save.dialogue_memory ? structuredClone(save.dialogue_memory) : undefined,
  world_state_layers: save.world_state_layers
    ? structuredClone(save.world_state_layers)
    : undefined,
  intercessor_campaign: save.intercessor_campaign
    ? structuredClone(save.intercessor_campaign)
    : undefined,
  fracture_crawl_campaign: save.fracture_crawl_campaign
    ? structuredClone(save.fracture_crawl_campaign)
    : undefined,
  explored_cells: save.explored_cells
    ? Object.fromEntries(
        Object.entries(save.explored_cells).map(([mapId, cells]) => [mapId, [...cells]]),
      )
    : undefined,
  bark_cooldowns: save.bark_cooldowns ? { ...save.bark_cooldowns } : undefined,
  game_end: save.game_end ? { ...save.game_end } : undefined,
  actor_statuses: save.actor_statuses
    ? Object.fromEntries(
        Object.entries(save.actor_statuses).map(([actorId, statuses]) => [
          actorId,
          statuses.map((status) => ({ ...status })),
        ]),
      )
    : undefined,
  actor_physical_states: save.actor_physical_states
    ? structuredClone(save.actor_physical_states)
    : undefined,
  actor_emotional_states: save.actor_emotional_states
    ? structuredClone(save.actor_emotional_states)
    : undefined,
  alderamontico_state: save.alderamontico_state
    ? structuredClone(save.alderamontico_state)
    : undefined,
  world_facts: save.world_facts ? structuredClone(save.world_facts) : undefined,
  simulation_economy: save.simulation_economy ? structuredClone(save.simulation_economy) : undefined,
  simulation_regions: save.simulation_regions ? structuredClone(save.simulation_regions) : undefined,
  immersive_scheduler: save.immersive_scheduler ? structuredClone(save.immersive_scheduler) : undefined,
  immersive_tile_layers: save.immersive_tile_layers ? structuredClone(save.immersive_tile_layers) : undefined,
  combat_queue: [...(save.combat_queue || [])],
});

type RuntimeSaveSnapshotMode = "deep" | "exploration_player_move";

// Exploration movement is the hottest command in Play: one dispatch happens
// for every fine-grid step. That path only replaces player, playerStats, flags,
// map_deltas, and (when facts are emitted) world_facts immutably. Fork those
// owned branches while sharing the large chemistry/simulation/memory subtrees
// that movement only reads. Combat and every other command retain the complete
// defensive clone above.
const forkExplorationPlayerMoveSave = (save: PlaySave): PlaySave => ({
  ...save,
  player: {
    ...save.player,
    cell: cloneCell(save.player.cell),
    facing: cloneCell(save.player.facing),
  },
  playerStats: { ...save.playerStats },
  flags: { ...(save.flags || {}) },
  map_deltas: { ...(save.map_deltas || {}) },
  entity_states: { ...(save.entity_states || {}) },
  world_facts: save.world_facts ? [...save.world_facts] : undefined,
});

const stepFacing = (fromX: number, fromY: number, toX: number, toY: number): [number, number] => [
  Math.sign(toX - fromX),
  Math.sign(toY - fromY),
];

const COMBAT_CRIT_CHANCE = 0.1;
const COMBAT_CRIT_MULT = 1.5;
const COMBAT_ALERT_CHASE_RADIUS_MACRO = 14;
const activeCellIndexCache = new WeakMap<MapData, Map<string, CellData>>();
const objectDefinitionIndexCache = new WeakMap<GamePackage, Map<string, ObjectData>>();

type CombatActorRuntime = {
  id: string;
  kind: "player" | "party" | "entity";
  entityId?: string;
  name: string;
  cell: [number, number];
  facing?: [number, number];
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  attack: number;
  defense: number;
  speed: number;
  statuses?: StatusInstance[];
  entityDef?: EntityData;
};

type CurrentObjectPlacement = {
  key: string;
  placement: ObjectPlacementData;
  object: ObjectData | undefined;
};

export class V1GridWorld implements InteractiveGridWorld {
  tick: number;
  rng: RngStreams;
  events = new EventBus();

  private save: PlaySave;
  private activeMap: MapData;
  private objectById: Map<string, ObjectData>;
  private topCellByCoord = new Map<string, CellData>();
  private currentPlacementCache?: {
    moved: MapDelta["moved_objects"];
    removed: MapDelta["removed_objects"];
    carried: MapDelta["carried_objects"];
    placements: CurrentObjectPlacement[];
  };

  constructor(
    private options: V1GridWorldOptions,
    private snapshotMode: RuntimeSaveSnapshotMode = "deep",
  ) {
    this.save =
      snapshotMode === "exploration_player_move"
        ? forkExplorationPlayerMoveSave(options.save)
        : cloneSaveForRuntime(options.save);
    this.activeMap = this.resolveMap(options.mapId || this.save.current_map_id);
    const cachedObjects = objectDefinitionIndexCache.get(options.gamePackage);
    this.objectById =
      cachedObjects ||
      new Map(options.gamePackage.object_library.map((object) => [object.id, object]));
    if (!cachedObjects) objectDefinitionIndexCache.set(options.gamePackage, this.objectById);
    this.tick = this.save.clock_minutes ?? 0;
    this.rng = new RngStreams(
      options.masterSeed ??
        hashSeed(
          options.gamePackage.metadata.version,
          this.save.current_map_id,
          this.save.clock_minutes ?? 0,
        ),
    );
    this.indexCells();
  }

  get map(): MapData {
    return this.activeMap;
  }

  private get spatialRatio(): number {
    return isFineExpandedPackage(this.options.gamePackage) ? FINE_PER_MACRO : 1;
  }

  private get spatialHalfExtent(): number {
    return Math.floor((this.spatialRatio - 1) / 2);
  }

  private scaleMacroDistanceToFine(distance: number): number {
    return distance * this.spatialRatio;
  }

  private actorFootprintCells(center: [number, number]): [number, number][] {
    const cells: [number, number][] = [];
    const half = this.spatialHalfExtent;
    for (let dx = -half; dx <= half; dx += 1) {
      for (let dy = -half; dy <= half; dy += 1) cells.push([center[0] + dx, center[1] + dy]);
    }
    return cells;
  }

  private placementFootprint(
    placement: Pick<ObjectPlacementData, "cell">,
    object: ObjectData | undefined,
  ): [number, number][] {
    const half = this.spatialHalfExtent;
    const ratio = this.spatialRatio;
    const authoredFootprint = object?.collision?.footprint?.length
      ? object.collision.footprint
      : ([[0, 0]] as [number, number][]);
    const cells: [number, number][] = [];
    for (const [rx, ry] of authoredFootprint) {
      const centerX = placement.cell[0] + rx * ratio;
      const centerY = placement.cell[1] + ry * ratio;
      for (let dx = -half; dx <= half; dx += 1) {
        for (let dy = -half; dy <= half; dy += 1) cells.push([centerX + dx, centerY + dy]);
      }
    }
    return cells;
  }

  private sameMacroCoord(a: [number, number], b: [number, number]): boolean {
    const ratio = this.spatialRatio;
    return Math.floor(a[0] / ratio) === Math.floor(b[0] / ratio) &&
      Math.floor(a[1] / ratio) === Math.floor(b[1] / ratio);
  }

  private footprintContainsCell(center: [number, number], cell: [number, number]): boolean {
    const half = this.spatialHalfExtent;
    return Math.abs(cell[0] - center[0]) <= half && Math.abs(cell[1] - center[1]) <= half;
  }

  private footprintsOverlap(a: [number, number], b: [number, number]): boolean {
    const ratio = this.spatialRatio;
    return Math.abs(a[0] - b[0]) < ratio && Math.abs(a[1] - b[1]) < ratio;
  }

  private areAdjacentMacro(a: [number, number], b: [number, number]): boolean {
    const ratio = this.spatialRatio;
    const chebyshev = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    return chebyshev <= ratio;
  }

  getSave(): PlaySave {
    return cloneSaveForRuntime(this.save);
  }

  // Dispatchers consume an owned result snapshot. The public getSave() API
  // remains fully defensive; only the one-shot exploration movement world uses
  // this copy-on-write fork to avoid deep-cloning the complete run a second time.
  getDispatchSave(): PlaySave {
    return this.snapshotMode === "exploration_player_move"
      ? forkExplorationPlayerMoveSave(this.save)
      : this.getSave();
  }

  getMapDelta(): MapDelta | undefined {
    return this.save.map_deltas?.[this.activeMap.id];
  }

  private getMapDeltaFor(mapId: string): MapDelta | undefined {
    return this.save.map_deltas?.[mapId];
  }

  isWalkable(x: number, y: number): boolean {
    const target = this.getActiveCell(x, y);
    if (!target || !target.walkable) return false;
    if (this.cellObjectBlocks(target)) return false;
    if (this.placementBlocks(x, y)) return false;
    if (this.containerBlocks(x, y)) return false;
    return true;
  }

  // Movement legality for a footprint actor: every fine cell of the
  // FINE_PER_MACRO² footprint centered on (x,y) must be present, walkable,
  // within the height step, and clear of objects/containers; no other actor's
  // footprint may overlap the destination.
  canMoveEntity(id: string, x: number, y: number) {
    const entity = this.getEntity(id);
    if (!entity) return { ok: false, reason: "actor not found" };
    const current = this.getActiveCell(entity.x, entity.y);
    for (const [fx, fy] of this.actorFootprintCells([x, y])) {
      const target = this.getActiveCell(fx, fy);
      if (!target) return { ok: false, reason: "missing cell" };
      if (!target.walkable) return { ok: false, reason: "blocked" };
      if (getJamEngineVisualHeight(target) - getJamEngineVisualHeight(current) > 1) {
        return { ok: false, reason: "height blocked" };
      }
      if (this.cellObjectBlocks(target)) return { ok: false, reason: "blocked" };
      if (this.placementBlocks(fx, fy)) return { ok: false, reason: "blocked" };
      if (this.containerBlocks(fx, fy)) return { ok: false, reason: "blocked" };
    }
    const occupant = this.getEntityOverlapping(x, y, id);
    if (occupant) return { ok: false, reason: "occupied" };
    return { ok: true };
  }

  getDoorwayAlignmentStep(
    id: string,
    dx: number,
    dy: number,
  ): [number, number] | undefined {
    if (
      this.spatialRatio <= 1 ||
      (dx === 0 && dy === 0) ||
      Math.abs(dx) > 1 ||
      Math.abs(dy) > 1
    )
      return undefined;
    const entity = this.getEntity(id);
    if (!entity) return undefined;

    const delta = this.getMapDelta();
    const openDoors = (this.activeMap.custom_object_placements || []).filter((placement) =>
      isDoorPlacementOpen(delta, placement),
    );
    const captureDistance = this.spatialRatio * 2;
    const requestedIsDiagonal = dx !== 0 && dy !== 0;
    const forwardDirections: [number, number][] = requestedIsDiagonal
      ? [[dx, 0], [0, dy]]
      : [[dx, dy]];
    const candidates: Array<{
      distance: number;
      step: [number, number];
      authoredDoor: boolean;
      directionOrder: number;
    }> = [];

    const inspectLane = (
      center: [number, number],
      forward: [number, number],
    ): { authoredDoor: boolean; narrowPassage: boolean } | undefined => {
      const destination: [number, number] = [center[0] + forward[0], center[1] + forward[1]];
      if (!this.canMoveEntity(id, destination[0], destination[1]).ok) return undefined;
      const perpendicular: [number, number] = [-forward[1], forward[0]];
      const authoredDoor = openDoors.some((door) => {
        const forwardDistance =
          forward[0] !== 0
            ? (door.cell[0] - center[0]) * forward[0]
            : (door.cell[1] - center[1]) * forward[1];
        const lateralDistance =
          forward[0] !== 0
            ? door.cell[1] - center[1]
            : door.cell[0] - center[0];
        return (
          forwardDistance > 0 &&
          forwardDistance <= this.spatialRatio &&
          Math.abs(lateralDistance) <= this.spatialHalfExtent
        );
      });

      // Plain wall gaps and map exits do not carry door metadata. Recognize
      // them by their geometry: the forward lane fits the actor exactly and
      // has blocking frame cells immediately outside both footprint edges.
      const leading: [number, number] = [
        destination[0] + forward[0] * this.spatialHalfExtent,
        destination[1] + forward[1] * this.spatialHalfExtent,
      ];
      const frameDistance = this.spatialHalfExtent + 1;
      const frameA: [number, number] = [
        leading[0] + perpendicular[0] * frameDistance,
        leading[1] + perpendicular[1] * frameDistance,
      ];
      const frameB: [number, number] = [
        leading[0] - perpendicular[0] * frameDistance,
        leading[1] - perpendicular[1] * frameDistance,
      ];
      return {
        authoredDoor,
        narrowPassage:
          !this.isWalkable(frameA[0], frameA[1]) && !this.isWalkable(frameB[0], frameB[1]),
      };
    };

    forwardDirections.forEach((forward, directionOrder) => {
      const perpendicular: [number, number] = [-forward[1], forward[0]];
      const directLane = inspectLane([entity.x, entity.y], forward);
      if (requestedIsDiagonal && directLane && (directLane.authoredDoor || directLane.narrowPassage)) {
        candidates.push({
          distance: 0,
          step: forward,
          authoredDoor: directLane.authoredDoor,
          directionOrder,
        });
      }

      for (const sign of [-1, 1] as const) {
        const firstAlignmentStep: [number, number] = [
          perpendicular[0] * sign,
          perpendicular[1] * sign,
        ];
        if (
          requestedIsDiagonal &&
          firstAlignmentStep[0] * dx + firstAlignmentStep[1] * dy <= 0
        )
          continue;

        for (let distance = 1; distance <= captureDistance; distance += 1) {
          const shifted: [number, number] = [
            entity.x + perpendicular[0] * sign * distance,
            entity.y + perpendicular[1] * sign * distance,
          ];
          if (!this.canMoveEntity(id, shifted[0], shifted[1]).ok) break;

          const lane = inspectLane(shifted, forward);
          if (!lane || (!lane.authoredDoor && !lane.narrowPassage)) continue;
          candidates.push({
            distance,
            step: firstAlignmentStep,
            authoredDoor: lane.authoredDoor,
            directionOrder,
          });
        }
      }
    });

    candidates.sort(
      (a, b) =>
        a.distance - b.distance ||
        Number(b.authoredDoor) - Number(a.authoredDoor) ||
        a.directionOrder - b.directionOrder ||
        a.step[0] - b.step[0] ||
        a.step[1] - b.step[1],
    );
    return candidates[0]?.step;
  }

  getEntity(id: string): GridEntity | undefined {
    if (id === PLAYER_ENTITY_ID) {
      return {
        id,
        x: this.save.player.cell[0],
        y: this.save.player.cell[1],
        facing: cloneCell(this.save.player.facing),
        kind: "player",
      };
    }

    const directState = this.save.entity_states?.[id];
    if (directState?.cell && !directState.dead && !directState.hidden) {
      return {
        id,
        x: directState.cell[0],
        y: directState.cell[1],
        facing: directState.facing,
        kind: "entity_state",
      };
    }

    for (let index = 0; index < (this.activeMap.entity_placements || []).length; index += 1) {
      const placement = this.activeMap.entity_placements[index];
      const key = entityPlacementStateKey(this.activeMap.id, placement, index);
      if (key !== id) continue;
      const state = this.save.entity_states?.[key] || {};
      if (state.dead || state.hidden) return undefined;
      const cell = state.cell || placement.cell;
      return {
        id,
        x: cell[0],
        y: cell[1],
        facing: state.facing || placement.facing,
        entityId: placement.entity_id,
        placementIndex: index,
        kind: "map_placement",
      };
    }

    return undefined;
  }

  // An actor whose FOOTPRINT covers the fine cell (x,y). This is the right
  // test for "is something standing here" — actors are FINE_PER_MACRO² blocks,
  // not points.
  getEntityAt(x: number, y: number): GridEntity | undefined {
    const player = this.getEntity(PLAYER_ENTITY_ID);
    if (player && this.footprintContainsCell([player.x, player.y], [x, y])) return player;

    for (const partyId of this.save.party_members || []) {
      const partyMember = this.getEntity(partyId);
      if (partyMember && this.footprintContainsCell([partyMember.x, partyMember.y], [x, y]))
        return partyMember;
    }

    for (let index = 0; index < (this.activeMap.entity_placements || []).length; index += 1) {
      const placement = this.activeMap.entity_placements[index];
      if ((this.save.party_members || []).includes(placement.entity_id)) continue;
      const key = entityPlacementStateKey(this.activeMap.id, placement, index);
      const entity = this.getEntity(key);
      if (entity && this.footprintContainsCell([entity.x, entity.y], [x, y])) return entity;
    }

    return undefined;
  }

  // An actor whose footprint would OVERLAP a footprint centered at (x,y),
  // excluding the moving actor itself. Movement/occupancy checks use this.
  getEntityOverlapping(x: number, y: number, excludeId?: string): GridEntity | undefined {
    const player = this.getEntity(PLAYER_ENTITY_ID);
    if (
      player &&
      excludeId !== PLAYER_ENTITY_ID &&
      this.footprintsOverlap([player.x, player.y], [x, y])
    )
      return player;

    for (const partyId of this.save.party_members || []) {
      if (partyId === excludeId) continue;
      const partyMember = this.getEntity(partyId);
      if (partyMember && this.footprintsOverlap([partyMember.x, partyMember.y], [x, y]))
        return partyMember;
    }

    for (let index = 0; index < (this.activeMap.entity_placements || []).length; index += 1) {
      const placement = this.activeMap.entity_placements[index];
      if ((this.save.party_members || []).includes(placement.entity_id)) continue;
      const key = entityPlacementStateKey(this.activeMap.id, placement, index);
      if (key === excludeId) continue;
      const entity = this.getEntity(key);
      if (entity && this.footprintsOverlap([entity.x, entity.y], [x, y])) return entity;
    }

    return undefined;
  }

  moveEntity(id: string, x: number, y: number): void {
    const entity = this.getEntity(id);
    if (!entity) return;
    const to: [number, number] = [x, y];
    const facing = stepFacing(entity.x, entity.y, x, y);

    if (id === PLAYER_ENTITY_ID) {
      this.save = {
        ...this.save,
        player: {
          ...this.save.player,
          cell: [x, y],
          facing,
        },
      };
      this.recordMovementSurfaceTransfer(id, to);
      const surface = this.getActiveCell(x, y)?.terrain || "default";
      const stealth = isActorUsingStealthStance(this.save, id);
      this.emitSoundAt(
        to,
        this.scaleMacroDistanceToFine(
          movementNoiseLoudness(this.options.gamePackage, this.save, id, surface),
        ),
        "footstep",
        id,
        surface,
        {
          sourceCategory: stealth ? "movement_stealth" : "movement_normal",
          sourceEntityId: id,
          sourceAction: "movement",
          revealsIdentity: false,
          tags: ["movement", stealth ? "stealth" : "walking", surface],
          compactPropagation: true,
        },
      );
      return;
    }

    this.save = {
      ...this.save,
      entity_states: {
        ...(this.save.entity_states || {}),
        [id]: {
          ...((this.save.entity_states || {})[id] || {}),
          cell: [x, y],
          facing,
        },
      },
    };
    this.recordMovementSurfaceTransfer(id, to);
    const surface = this.getActiveCell(x, y)?.terrain || "default";
    const stealth = isActorUsingStealthStance(this.save, id);
    this.emitSoundAt(
      to,
      this.scaleMacroDistanceToFine(
        movementNoiseLoudness(this.options.gamePackage, this.save, id, surface),
      ),
      "footstep",
      id,
      surface,
      {
        sourceCategory: stealth ? "movement_stealth" : "movement_normal",
        sourceEntityId: id,
        sourceAction: "movement",
        revealsIdentity: false,
        tags: ["movement", stealth ? "stealth" : "walking", surface],
        compactPropagation: true,
      },
    );
  }

  // ── Interactive capabilities (ground items + doors) ──
  getGroundItemAt(x: number, y: number): GroundItemRef | undefined {
    // Item pickup is a macro-tile interaction: an item sits at its tile's
    // center fine cell and is reachable from anywhere in that tile.
    const delta = this.getMapDelta();
    const taken = new Set(delta?.taken_items || []);
    for (const placement of this.activeMap.item_placements || []) {
      if (taken.has(placement.id)) continue;
      if (this.sameMacroCoord([placement.cell[0], placement.cell[1]], [x, y])) {
        return { id: placement.id, itemId: placement.item_id, count: placement.count ?? 1, dropped: false };
      }
    }
    for (const dropped of delta?.dropped_items || []) {
      if (this.sameMacroCoord([dropped.cell[0], dropped.cell[1]], [x, y])) {
        return { id: dropped.id, itemId: dropped.item_id, count: dropped.count, dropped: true };
      }
    }
    return undefined;
  }

  takeGroundItem(item: GroundItemRef): void {
    this.giveItem(item.itemId, item.count);
    if (item.dropped) {
      this.updateMapDelta((delta) => ({
        ...delta,
        dropped_items: (delta.dropped_items || []).filter((d) => d.id !== item.id),
      }));
    } else {
      this.updateMapDelta((delta) => ({
        ...delta,
        taken_items: [...(delta.taken_items || []), item.id],
      }));
    }
    this.emitSoundAt(
      this.save.player.cell,
      this.scaleMacroDistanceToFine(0.75),
      "item_pickup",
      PLAYER_ENTITY_ID,
      "soft",
      {
        sourceCategory: "interaction",
        sourceAction: "pickup",
        revealsIdentity: false,
        tags: ["item", "interaction"],
        compactPropagation: true,
      },
    );
  }

  canDropItemAt(itemId: string, count: number, cell: [number, number]): ValidationResult {
    if (!this.hasItem(itemId, count)) return { ok: false, reason: "missing item" };
    const target = this.getActiveCell(cell[0], cell[1]);
    if (!target || !target.walkable) return { ok: false, reason: "no space" };
    if (this.cellObjectBlocks(target)) return { ok: false, reason: "no space" };
    if (this.containerBlocks(cell[0], cell[1])) return { ok: false, reason: "no space" };
    if (this.placementBlocks(cell[0], cell[1])) return { ok: false, reason: "no space" };
    if (this.getGroundItemAt(cell[0], cell[1])) return { ok: false, reason: "occupied" };
    if (this.getEntityAt(cell[0], cell[1])) return { ok: false, reason: "occupied" };
    return { ok: true };
  }

  dropItemAt(itemId: string, count: number, cell: [number, number]): DroppedItemRef {
    this.removeItem(itemId, count);
    const dropped: DroppedItemRef = {
      id: `drop_${this.tick}_${itemId}_${cell[0]}_${cell[1]}_${(this.getMapDelta()?.dropped_items || []).length}`,
      itemId,
      count,
      cell: cloneCell(cell),
    };
    this.updateMapDelta((delta) => ({
      ...delta,
      dropped_items: [
        ...(delta.dropped_items || []),
        { id: dropped.id, item_id: itemId, cell: cloneCell(cell), count },
      ],
    }));
    this.emitSoundAt(
      cell,
      this.scaleMacroDistanceToFine(1.25),
      "item_drop",
      PLAYER_ENTITY_ID,
      "solid",
      {
        sourceCategory: "impact",
        sourceAction: "drop",
        revealsIdentity: false,
        tags: ["item", "impact"],
        compactPropagation: true,
      },
    );
    return dropped;
  }

  getClosedDoorAt(x: number, y: number): DoorRef | undefined {
    const delta = this.getMapDelta();
    for (const placement of this.activeMap.custom_object_placements || []) {
      if (!isBuildingDoorPlacement(placement)) continue;
      if (isDoorPlacementOpen(delta, placement)) continue;
      const object = this.objectById.get(placement.object_id);
      const onCell =
        (placement.cell[0] === x && placement.cell[1] === y) ||
        (object ? this.placementFootprint(placement, object).some(([px, py]) => px === x && py === y) : false);
      if (onCell) {
        const unlocked = isDoorPlacementUnlocked(delta, placement);
        return {
          key: doorPlacementKey(placement),
          displayName: object?.display_name,
          cell: [placement.cell[0], placement.cell[1]],
          locked: !unlocked,
          keyItemId: placement.key_item_id,
          consumeKey: Boolean(placement.consume_key),
        };
      }
    }
    return undefined;
  }

  getOpenDoorAt(x: number, y: number): DoorRef | undefined {
    const delta = this.getMapDelta();
    for (const placement of this.activeMap.custom_object_placements || []) {
      if (!isBuildingDoorPlacement(placement)) continue;
      if (!isDoorPlacementOpen(delta, placement)) continue;
      const object = this.objectById.get(placement.object_id);
      const onCell =
        (placement.cell[0] === x && placement.cell[1] === y) ||
        (object ? this.placementFootprint(placement, object).some(([px, py]) => px === x && py === y) : false);
      if (onCell) {
        return {
          key: doorPlacementKey(placement),
          displayName: object?.display_name,
          cell: [placement.cell[0], placement.cell[1]],
          locked: false,
          keyItemId: placement.key_item_id,
          consumeKey: Boolean(placement.consume_key),
        };
      }
    }
    return undefined;
  }

  openDoor(door: DoorRef): void {
    this.updateMapDelta((delta) => {
      const opened = delta.opened_doors || [];
      const unlocked = delta.unlocked_doors || [];
      return recordSimulationCondition(
        {
          ...delta,
          opened_doors: opened.includes(door.key) ? opened : [...opened, door.key],
          unlocked_doors:
            door.locked && !unlocked.includes(door.key) ? [...unlocked, door.key] : unlocked,
        },
        {
          target_kind: "door",
          target_id: door.key,
          state: "worn",
          integrity: 0.98,
          condition_tags: ["opened"],
          cell: door.cell,
          last_action: "open",
          updated_at_tick: this.tick,
        },
      );
    });
    if (door.locked && door.consumeKey && door.keyItemId) {
      this.removeItem(door.keyItemId, 1);
    }
    this.emitSoundAt(door.cell, 3, "door_open", PLAYER_ENTITY_ID, "wood");
  }

  closeDoor(door: DoorRef): void {
    this.updateMapDelta((delta) =>
      recordSimulationCondition(
        {
          ...delta,
          opened_doors: (delta.opened_doors || []).filter((openedDoor) => openedDoor !== door.key),
        },
        {
          target_kind: "door",
          target_id: door.key,
          state: "worn",
          integrity: 0.99,
          condition_tags: ["closed"],
          cell: door.cell,
          last_action: "close",
          updated_at_tick: this.tick,
        },
      ),
    );
    this.emitSoundAt(door.cell, 3, "door_close", PLAYER_ENTITY_ID, "wood");
  }

  getMapTransition(
    targetMapId: string,
    targetSpawnId?: string,
    facingOverride?: [number, number],
    exitId?: string,
  ): MapTransitionRef | undefined {
    const targetMap = this.options.gamePackage.maps.find((candidate) => candidate.id === targetMapId);
    if (!targetMap) return undefined;
    const spawn =
      (targetSpawnId ? targetMap.spawns.find((candidate) => candidate.id === targetSpawnId) : undefined) ||
      targetMap.spawns[0];
    const cell = cloneCell((spawn?.cell as [number, number] | undefined) || [0, 0]);
    const facing = cloneCell(facingOverride || (spawn?.facing as [number, number] | undefined) || [0, -1]);
    return {
      fromMapId: this.save.current_map_id,
      toMapId: targetMap.id,
      targetSpawnId: spawn?.id,
      exitId,
      cell,
      facing,
    };
  }

  changeMap(transition: MapTransitionRef): void {
    this.save = discoverMapDialogueTopics(this.options.gamePackage, {
      ...this.save,
      current_map_id: transition.toMapId,
      player: {
        ...this.save.player,
        cell: cloneCell(transition.cell),
        facing: cloneCell(transition.facing),
      },
    }, transition.toMapId);
    this.activeMap = this.resolveMap(transition.toMapId);
    this.currentPlacementCache = undefined;
    this.indexCells();
  }

  getTrigger(triggerId: string): TriggerRef | undefined {
    const trigger = (this.activeMap.triggers || []).find((candidate) => candidate.id === triggerId);
    if (!trigger) return undefined;
    return {
      id: trigger.id,
      type: trigger.type,
      cutsceneId: trigger.cutscene_id,
      once: Boolean(trigger.once),
      cell: trigger.cell ? cloneCell(trigger.cell as [number, number]) : undefined,
    };
  }

  hasTriggerFired(trigger: TriggerRef): boolean {
    return Boolean(this.save.flags?.[`trig_run_${trigger.id}`]);
  }

  fireTrigger(trigger: TriggerRef): void {
    if (!trigger.once) return;
    this.save = {
      ...this.save,
      flags: {
        ...(this.save.flags || {}),
        [`trig_run_${trigger.id}`]: true,
      },
    };
  }

  getContainer(containerId: string): ContainerRef | undefined {
    const container = this.getContainerPlacement(containerId);
    if (!container) return undefined;
    const state = this.getContainerRuntimeState(container);
    const object = this.objectById.get(container.object_id);
    return {
      id: container.id,
      displayName: container.display_name || object?.display_name,
      locked: state.locked,
      opened: state.opened,
      keyItemId: container.key_item_id,
      consumeKey: Boolean(container.consume_key),
      cell: cloneCell(container.cell as [number, number]),
    };
  }

  hasItem(itemId: string, count = 1): boolean {
    return (this.save.inventory || []).some((entry) => entry.id === itemId && entry.count >= count);
  }

  unlockContainer(container: ContainerRef): void {
    this.updateContainerState(container.id, { locked: false });
    this.updateMapDelta((delta) =>
      recordSimulationCondition(delta, {
        target_kind: "container",
        target_id: container.id,
        state: "worn",
        integrity: 0.99,
        condition_tags: ["unlocked"],
        cell: container.cell,
        last_action: "unlock",
        updated_at_tick: this.tick,
      }),
    );
    if (container.consumeKey && container.keyItemId) {
      this.removeItem(container.keyItemId, 1);
    }
  }

  openContainer(container: ContainerRef): void {
    this.updateContainerState(container.id, { opened: true });
    this.updateMapDelta((delta) =>
      recordSimulationCondition(delta, {
        target_kind: "container",
        target_id: container.id,
        state: "worn",
        integrity: 0.98,
        condition_tags: ["opened"],
        cell: container.cell,
        last_action: "open",
        updated_at_tick: this.tick,
      }),
    );
    this.emitSoundAt(
      container.cell,
      this.scaleMacroDistanceToFine(1.5),
      "container_open",
      PLAYER_ENTITY_ID,
      "wood",
      {
        sourceCategory: "interaction",
        sourceAction: "open_container",
        revealsIdentity: false,
        tags: ["container", "interaction"],
        compactPropagation: true,
      },
    );
  }

  searchContainer(container: ContainerRef): void {
    this.updateContainerState(container.id, { opened: true });
    this.updateMapDelta((delta) =>
      recordSimulationCondition(delta, {
        target_kind: "container",
        target_id: container.id,
        state: "worn",
        integrity: 0.97,
        condition_tags: ["searched"],
        cell: container.cell,
        last_action: "search",
        updated_at_tick: this.tick,
      }),
    );
  }

  getContainerItem(containerId: string, entryIndex: number): ContainerItemRef | undefined {
    return this.getContainerItems(containerId)[entryIndex];
  }

  getContainerItems(containerId: string): ContainerItemRef[] {
    const container = this.getContainerPlacement(containerId);
    if (!container) return [];
    const state = this.getContainerRuntimeState(container);
    return state.items.map((entry, entryIndex) => ({
      containerId,
      itemId: entry.item_id,
      count: entry.count,
      entryIndex,
    }));
  }

  takeContainerItem(container: ContainerRef, entryIndex: number): void {
    const placement = this.getContainerPlacement(container.id);
    if (!placement) return;
    const state = this.getContainerRuntimeState(placement);
    const entry = state.items[entryIndex];
    if (!entry) return;
    this.giveItem(entry.item_id, entry.count);
    this.updateContainerState(container.id, {
      items: state.items.filter((_, index) => index !== entryIndex),
    });
  }

  takeAllFromContainer(container: ContainerRef): void {
    const placement = this.getContainerPlacement(container.id);
    if (!placement) return;
    const state = this.getContainerRuntimeState(placement);
    for (const entry of state.items) {
      this.giveItem(entry.item_id, entry.count);
    }
    this.updateContainerState(container.id, { items: [] });
  }

  stowItemInContainer(container: ContainerRef, itemId: string, count = 1): void {
    const placement = this.getContainerPlacement(container.id);
    if (!placement) return;
    const amount = Math.max(1, Math.floor(count));
    this.removeItem(itemId, amount);
    const state = this.getContainerRuntimeState(placement);
    const existingIndex = state.items.findIndex((entry) => entry.item_id === itemId);
    const items =
      existingIndex >= 0
        ? state.items.map((entry, index) =>
            index === existingIndex ? { ...entry, count: entry.count + amount } : entry,
          )
        : [...state.items, { item_id: itemId, count: amount }];
    this.updateContainerState(container.id, { items });
  }

  giveItem(itemId: string, count: number): void {
    const inventory = (this.save.inventory || []).map((entry) => ({ ...entry }));
    const existing = inventory.find((entry) => entry.id === itemId);
    if (existing) existing.count += count;
    else inventory.push({ id: itemId, count });
    this.save = discoverItemDialogueTopics(this.options.gamePackage, { ...this.save, inventory }, itemId);
  }

  removeItem(itemId: string, count: number): void {
    const inventory = (this.save.inventory || [])
      .map((entry) =>
        entry.id === itemId
          ? { ...entry, count: Math.max(0, entry.count - count) }
          : { ...entry },
      )
      .filter((entry) => entry.count > 0);
    this.save = { ...this.save, inventory };
  }

  setFlag(switchId: string, value: boolean): void {
    this.save = { ...this.save, flags: { ...(this.save.flags || {}), [switchId]: value } };
  }

  setQuestState(questId: string, state: string): void {
    this.save = { ...this.save, quests: { ...(this.save.quests || {}), [questId]: state } };
  }

  addMoney(amount: number): void {
    this.save = { ...this.save, money: Math.max(0, (this.save.money || 0) + Math.trunc(amount)) };
  }

  adjustFactionRep(factionId: string, delta: number): void {
    const current = Number((this.save.faction_rep || {})[factionId] || 0);
    this.save = {
      ...this.save,
      faction_rep: { ...(this.save.faction_rep || {}), [factionId]: current + Math.trunc(delta) },
    };
  }

  markDocumentRead(documentId: string): void {
    const read = this.save.read_documents || [];
    const withRead = read.includes(documentId)
      ? this.save
      : { ...this.save, read_documents: [...read, documentId] };
    this.save = discoverDocumentDialogueTopics(this.options.gamePackage, withRead, documentId);
  }

  learnSkill(skillId: string): void {
    const known = this.save.known_skills || [];
    if (known.includes(skillId)) return;
    this.save = { ...this.save, known_skills: [...known, skillId] };
  }

  completeQuestObjective(objectiveId: string, targetId?: string, objectiveType?: string): void {
    const flags = { ...(this.save.flags || {}), [`obj_done_${objectiveId}`]: true };
    if (targetId) {
      flags[`done_${targetId}`] = true;
      if (objectiveType === "talk") flags[`talked_${targetId}`] = true;
    }
    this.save = { ...this.save, flags };
  }

  setPlayerPosition(cell: [number, number], facing?: [number, number]): void {
    this.save = {
      ...this.save,
      player: {
        ...this.save.player,
        cell: cloneCell(cell),
        facing: cloneCell(facing || this.save.player.facing),
      },
    };
  }

  teleportPlayer(mapId: string | undefined, cell: [number, number], facing?: [number, number]): void {
    const nextMapId = mapId || this.save.current_map_id;
    const nextMap = this.options.gamePackage.maps.find((candidate) => candidate.id === nextMapId);
    if (!nextMap) return;
    this.save = {
      ...this.save,
      current_map_id: nextMapId,
      player: {
        ...this.save.player,
        cell: cloneCell(cell),
        facing: cloneCell(facing || this.save.player.facing),
      },
    };
    this.activeMap = nextMap;
    this.currentPlacementCache = undefined;
    this.indexCells();
  }

  setEntityPosition(entityId: string, cell: [number, number], facing?: [number, number]): void {
    const key = this.resolveEntityStateKey(entityId);
    this.save = {
      ...this.save,
      entity_states: {
        ...(this.save.entity_states || {}),
        [key]: {
          ...((this.save.entity_states || {})[key] || {}),
          cell: cloneCell(cell),
          ...(facing ? { facing: cloneCell(facing) } : {}),
        },
      },
    };
  }

  setPlayerSprite(spriteId?: string): void {
    this.save = {
      ...this.save,
      player: {
        ...this.save.player,
        sprite_id: spriteId,
      },
    };
  }

  healPlayer(amount: number): void {
    const hp = Math.max(
      0,
      Math.min(this.save.playerStats.max_hp, this.save.playerStats.hp + Math.max(0, Math.trunc(amount))),
    );
    this.save = {
      ...this.save,
      playerStats: { ...this.save.playerStats, hp },
    };
  }

  restoreParty(): void {
    const entityStates = { ...(this.save.entity_states || {}) };
    for (const partyId of this.save.party_members || []) {
      const entity = this.options.gamePackage.entities.find((candidate) => candidate.id === partyId);
      if (!entity) continue;
      entityStates[partyId] = {
        ...(entityStates[partyId] || {}),
        hp: entity.max_hp ?? 1,
        mp: entity.max_mp ?? 0,
        dead: false,
      };
    }
    this.save = {
      ...this.save,
      playerStats: {
        ...this.save.playerStats,
        hp: this.save.playerStats.max_hp,
        mp: this.save.playerStats.max_mp,
        energy: 1000,
      },
      entity_states: entityStates,
    };
  }

  addPartyMember(entityId: string): void {
    const party = this.save.party_members || [];
    if (party.includes(entityId)) return;
    this.save = { ...this.save, party_members: [...party, entityId] };
  }

  removePartyMember(entityId: string): void {
    this.save = {
      ...this.save,
      party_members: (this.save.party_members || []).filter((id) => id !== entityId),
    };
  }

  advanceClock(minutes: number): void {
    this.save = {
      ...this.save,
      clock_minutes: Math.max(0, (this.save.clock_minutes || 0) + Math.trunc(minutes)),
    };
    this.tick = this.save.clock_minutes || 0;
  }

  modifyPlayerStats(stats: Record<string, number>): void {
    const nextStats = { ...this.save.playerStats } as Record<string, number>;
    for (const [key, delta] of Object.entries(stats)) {
      nextStats[key] = (nextStats[key] ?? 0) + delta;
    }
    nextStats.max_hp = Math.max(1, nextStats.max_hp ?? 1);
    nextStats.max_mp = Math.max(0, nextStats.max_mp ?? 0);
    nextStats.attack = Math.max(0, nextStats.attack ?? 0);
    nextStats.defense = Math.max(0, nextStats.defense ?? 0);
    nextStats.speed = Math.max(1, nextStats.speed ?? 1);
    if (stats.max_hp) {
      nextStats.hp = Math.max(1, Math.min(nextStats.max_hp, (nextStats.hp ?? 1) + Math.max(0, stats.max_hp)));
    } else {
      nextStats.hp = Math.min(nextStats.max_hp, nextStats.hp ?? nextStats.max_hp);
    }
    if (stats.max_mp) {
      nextStats.mp = Math.max(0, Math.min(nextStats.max_mp, (nextStats.mp ?? 0) + Math.max(0, stats.max_mp)));
    } else {
      nextStats.mp = Math.min(nextStats.max_mp, nextStats.mp ?? nextStats.max_mp);
    }
    this.save = {
      ...this.save,
      playerStats: nextStats as PlaySave["playerStats"],
    };
  }

  setEntityHidden(entityId: string, hidden: boolean): void {
    const key = this.resolveEntityStateKey(entityId);
    this.save = {
      ...this.save,
      entity_states: {
        ...(this.save.entity_states || {}),
        [key]: {
          ...((this.save.entity_states || {})[key] || {}),
          hidden,
        },
      },
    };
  }

  recordBarkPlayed(barkId: string, clockMinutes?: number): void {
    const minute = clockMinutes ?? this.save.clock_minutes ?? this.tick ?? 0;
    this.save = {
      ...this.save,
      bark_cooldowns: {
        ...(this.save.bark_cooldowns || {}),
        [barkId]: minute,
      },
    };
  }

  endGame(endingId?: string, title?: string): void {
    const fallbackTitle =
      title ||
      (typeof this.options.gamePackage.settings?.end_title === "string"
        ? this.options.gamePackage.settings.end_title
        : "The End");
    const ending = resolveEnding(this.options.gamePackage.endings, endingId, fallbackTitle);
    const flags = {
      ...(this.save.flags || {}),
      game_ended: true,
      ...(ending.endingId ? { [`ending_${ending.endingId}`]: true } : {}),
    };
    this.save = {
      ...this.save,
      flags,
      game_end: {
        ending_id: ending.endingId,
        title: ending.title,
        reached_at_clock_minutes: this.save.clock_minutes ?? this.tick ?? 0,
      },
    };
  }

  canChooseDialogueOption(dialogueId: string, nodeId: string, optionIndex: number): ValidationResult {
    const dialogue = this.options.gamePackage.dialogue.find((candidate) => candidate.id === dialogueId);
    if (!dialogue) return { ok: false, reason: "no dialogue" };
    const resolution = resolveDialogueChoice(
      dialogue,
      nodeId,
      optionIndex,
      buildConditionContext(this.save),
    );
    return resolution ? { ok: true } : { ok: false, reason: "no option" };
  }

  chooseDialogueOption(dialogueId: string, nodeId: string, optionIndex: number): DialogueChoiceOutcome {
    const dialogue = this.options.gamePackage.dialogue.find((candidate) => candidate.id === dialogueId)!;
    const resolution = resolveDialogueChoice(
      dialogue,
      nodeId,
      optionIndex,
      buildConditionContext(this.save),
    )!;
    const effects: DialogueChoiceOutcome["effects"] = [];
    for (const effect of resolution.effects) {
      if (effect.type === "set_switch") {
        this.setFlag(effect.switchId, effect.value);
        effects.push({
          type: "set_switch",
          switchId: effect.switchId,
          value: effect.value,
        });
      } else if (effect.type === "set_quest") {
        this.setQuestState(effect.questId, effect.state);
        effects.push({
          type: "set_quest",
          questId: effect.questId,
          state: effect.state,
        });
      }
    }
    return {
      dialogueId: resolution.dialogueId,
      nodeId: resolution.nodeId,
      optionIndex: resolution.optionIndex,
      optionText: resolution.optionText,
      nextNodeId: resolution.nextNodeId,
      endsDialogue: resolution.endsDialogue,
      triggerCutsceneId: resolution.triggerCutsceneId,
      effects,
    };
  }

  canSelectDialogueTopic(
    dialogueId: string,
    topicKind: "static" | "dynamic" | "opening",
    topicId: string | undefined,
    participantKey: string | undefined,
    shownItemId: string | undefined,
    entryNodeId: string | undefined,
  ): ValidationResult {
    const topic: DialogueTopicRef | null = topicKind === "opening"
      ? null
      : topicKind === "dynamic"
        ? { kind: "dynamic", dynamicTopicId: topicId || "" }
        : { kind: "static", topicId: topicId || "" };
    const resolution = resolveKeywordDialogueResponse({
      gamePackage: this.options.gamePackage,
      save: this.save,
      dialogueId,
      topic,
      participantKey,
      shownItemId,
      entryNodeId,
    });
    if (resolution) return { ok: true };
    if (topic?.kind === "static" && topic.topicId === "action:goodbye") return { ok: true };
    return { ok: false, reason: "no keyword response" };
  }

  selectDialogueTopic(
    dialogueId: string,
    topicKind: "static" | "dynamic" | "opening",
    topicId: string | undefined,
    participantKey: string | undefined,
    shownItemId: string | undefined,
    entryNodeId: string | undefined,
    countAsk: boolean,
  ): KeywordDialogueOutcome {
    const topic: DialogueTopicRef | null = topicKind === "opening"
      ? null
      : topicKind === "dynamic"
        ? { kind: "dynamic", dynamicTopicId: topicId || "" }
        : { kind: "static", topicId: topicId || "" };
    const selected = selectKeywordDialogueTopic({
      gamePackage: this.options.gamePackage,
      save: this.save,
      dialogueId,
      topic,
      participantKey,
      shownItemId,
      entryNodeId,
      countAsk,
    });
    this.save = selected.save;
    return {
      dialogueId,
      responseId: selected.response?.id,
      responseText: selected.response?.text,
      topicKey: selected.topicKey,
      triggerCutsceneId: selected.triggerCutsceneId,
      endsDialogue: selected.endConversation,
      effectsApplied: selected.effectsApplied,
      localTopicIds: selected.localTopicIds,
      localDynamicTopicIds: selected.localDynamicTopicIds,
      newlyDiscoveredTopicIds: selected.newlyDiscoveredTopicIds,
      newlyDiscoveredDynamicTopicIds: selected.newlyDiscoveredDynamicTopicIds,
    };
  }

  canBuyShopItem(shopId: string, stockIndex: number): ValidationResult {
    const stock = this.getShopStockEntry(shopId, stockIndex);
    if (!stock) return { ok: false, reason: "no stock" };
    if (!this.options.gamePackage.items.some((item) => item.id === stock.item.item_id)) {
      return { ok: false, reason: "unknown item" };
    }
    const economyStock = this.getSimulationShopStock(shopId, stock.item.item_id);
    if (economyStock && economyStock.stock <= 0) return { ok: false, reason: "out of stock" };
    if ((this.save.money || 0) < stock.price) return { ok: false, reason: "not enough money" };
    return { ok: true };
  }

  buyShopItem(shopId: string, stockIndex: number): ShopTransactionOutcome {
    const stock = this.getShopStockEntry(shopId, stockIndex)!;
    const item = this.options.gamePackage.items.find((candidate) => candidate.id === stock.item.item_id);
    this.addMoney(-stock.price);
    this.giveItem(stock.item.item_id, 1);
    this.adjustSimulationShopStock(shopId, stock.item.item_id, -1, 0, 0);
    return {
      shopId,
      itemId: stock.item.item_id,
      itemName: item?.display_name,
      count: 1,
      unitPrice: stock.price,
      totalPrice: stock.price,
      money: this.save.money || 0,
      stockIndex,
      mode: "buy",
    };
  }

  canSellInventoryItem(shopId: string | undefined, itemId: string, count: number): ValidationResult {
    if (!this.hasItem(itemId, count)) return { ok: false, reason: "missing item" };
    if (!this.options.gamePackage.items.some((item) => item.id === itemId)) {
      return { ok: false, reason: "unknown item" };
    }
    const price = this.getSellPrice(shopId, itemId);
    if (price <= 0) return { ok: false, reason: "no value" };
    return { ok: true };
  }

  sellInventoryItem(shopId: string | undefined, itemId: string, count: number): ShopTransactionOutcome {
    const unitPrice = this.getSellPrice(shopId, itemId);
    const amount = Math.max(1, Math.floor(count));
    const item = this.options.gamePackage.items.find((candidate) => candidate.id === itemId);
    this.removeItem(itemId, amount);
    this.addMoney(unitPrice * amount);
    if (shopId) this.adjustSimulationShopStock(shopId, itemId, amount, 0, 0);
    return {
      shopId,
      itemId,
      itemName: item?.display_name,
      count: amount,
      unitPrice,
      totalPrice: unitPrice * amount,
      money: this.save.money || 0,
      mode: "sell",
    };
  }

  canMeleeAttack(actorId: string, targetId: string) {
    if (isActorUsingStealthStance(this.save, actorId)) {
      return { ok: false, reason: "stealth stance" };
    }
    const actor = this.getCombatActor(actorId);
    if (!actor) return { ok: false, reason: "actor not found" };
    const target = this.getCombatActor(targetId);
    if (!target) return { ok: false, reason: "target not found" };
    if (actor.id === target.id) return { ok: false, reason: "self target" };
    // Melee reach: footprints within one macro tile of each other (§5.1) —
    // never raw fine manhattan === 1.
    if (!this.areAdjacentMacro(actor.cell, target.cell)) return { ok: false, reason: "out of range" };
    return { ok: true };
  }

  resolveMeleeAttack(actorId: string, targetId: string): CombatAttackOutcome {
    const actor = this.getCombatActor(actorId)!;
    const target = this.getCombatActor(targetId)!;
    this.setActorFacing(actor, stepFacing(actor.cell[0], actor.cell[1], target.cell[0], target.cell[1]));
    const actorMods = statModifiers(actor.statuses);
    const targetMods = statModifiers(target.statuses);
    const roll = this.rollMeleeDamage(
      Math.max(0, actor.attack + actorMods.attack),
      Math.max(0, target.defense + targetMods.defense),
    );
    const firstHit = this.damageActor(target, roll.dmg);
    this.emitSoundAt(target.cell, 4, "combat_melee", actor.id, "metal");
    if (actor.kind !== "entity") {
      this.markHostileCombatAlert(target, actor.cell);
    }
    const assists: NonNullable<CombatAttackOutcome["assists"]> = [];
    const objectiveCompletions = [...firstHit.objectiveCompletions];
    const experience: CombatAttackOutcome["experience"] | undefined = firstHit.experience;
    let finalHp = firstHit.hp;
    let finalDead = firstHit.dead;

    if (!finalDead && actor.id === PLAYER_ENTITY_ID && !this.save.in_combat && target.kind === "entity") {
      for (const partyId of this.save.party_members || []) {
        const follower = this.getCombatActor(partyId);
        if (!follower) continue;
        if (!this.areAdjacentMacro(follower.cell, target.cell)) continue;
        const updatedTarget = this.getCombatActor(target.id);
        if (!updatedTarget) break;
        const assistRoll = this.rollMeleeDamage(follower.attack, Math.max(0, updatedTarget.defense + statModifiers(updatedTarget.statuses).defense));
        const assistHit = this.damageActor(updatedTarget, assistRoll.dmg);
        assists.push({
          actorId: follower.id,
          actorName: follower.name,
          damage: assistRoll.dmg,
          crit: assistRoll.crit,
        });
        finalHp = assistHit.hp;
        finalDead = assistHit.dead;
        objectiveCompletions.push(...assistHit.objectiveCompletions);
        if (assistHit.dead) break;
      }
    }

    return {
      attackerId: actor.id,
      attackerName: actor.name,
      targetId: target.id,
      targetName: target.name,
      targetCell: target.cell,
      damage: roll.dmg,
      crit: roll.crit,
      targetHp: finalHp,
      targetDead: finalDead,
      targetKind: target.kind,
      assists,
      experience,
      objectiveCompletions,
    };
  }

  canCastSkill(actorId: string, skillId: string, targetCells: [number, number][]) {
    if (isActorUsingStealthStance(this.save, actorId)) {
      return { ok: false, reason: "stealth stance" };
    }
    const actor = this.getCombatActor(actorId);
    if (!actor) return { ok: false, reason: "actor not found" };
    const skill = this.getSkill(skillId);
    if (!skill) return { ok: false, reason: "skill not found" };
    if (targetCells.length === 0) return { ok: false, reason: "no target" };
    if (!this.actorKnowsSkill(actor, skillId)) return { ok: false, reason: "skill not known" };
    if (actor.mp < (skill.mp_cost || 0)) return { ok: false, reason: "missing mp" };
    if (actor.kind === "player" && !this.save.in_combat && (this.save.playerStats.energy || 0) < (skill.ap_cost || 0)) {
      return { ok: false, reason: "missing energy" };
    }
    return { ok: true };
  }

  resolveSkillCast(actorId: string, skillId: string, targetCells: [number, number][]): SkillCastOutcome {
    const actor = this.getCombatActor(actorId)!;
    const skill = this.getSkill(skillId)!;
    this.spendSkillResources(actor, skill);
    this.emitSoundAt(actor.cell, 5, `combat_skill:${skill.id}`, actor.id, skill.element || "magic");
    const hits: SkillCastHit[] = [];
    const experience: NonNullable<SkillCastOutcome["experience"]> = [];
    const objectiveCompletions: QuestObjectiveCompletion[] = [];

    const targets = this.getCombatActorsInCells(targetCells);
    for (const target of targets) {
      let current = this.getCombatActor(target.id);
      if (!current) continue;
      for (const payload of skill.payloads || []) {
        if (!current) break;
        if (payload.type === "damage" && payload.value) {
          const actorMods = statModifiers(actor.statuses);
          const targetMods = statModifiers(current.statuses);
          const roll = this.rollSkillDamage(
            payload.value,
            Math.max(0, actor.attack + actorMods.attack),
            Math.max(0, current.defense + targetMods.defense),
          );
          const hit = this.damageActor(current, roll.dmg);
          if (actor.kind !== "entity") {
            this.markHostileCombatAlert(current, actor.cell);
          }
          hits.push({
            targetId: current.id,
            targetName: current.name,
            targetKind: current.kind,
            cell: current.cell,
            payloadType: "damage",
            amount: roll.dmg,
            crit: roll.crit,
            targetHp: hit.hp,
            targetDead: hit.dead,
          });
          if (hit.experience) experience.push(hit.experience);
          objectiveCompletions.push(...hit.objectiveCompletions);
          current = this.getCombatActor(current.id);
          if (hit.dead) break;
        } else if (payload.type === "heal" && payload.value) {
          const nextHp = Math.min(current.maxHp, Math.max(0, current.hp) + payload.value);
          this.writeCombatActor(current, { hp: nextHp, dead: false });
          hits.push({
            targetId: current.id,
            targetName: current.name,
            targetKind: current.kind,
            cell: current.cell,
            payloadType: "heal",
            amount: payload.value,
            targetHp: nextHp,
            targetDead: false,
          });
          current = this.getCombatActor(current.id);
        } else if (payload.type === "status" && payload.status_effect) {
          const statuses = applyStatus(current.statuses, payload.status_effect, {
            magnitude: payload.value ?? 1,
          });
          this.writeCombatActor(current, { statuses });
          hits.push({
            targetId: current.id,
            targetName: current.name,
            targetKind: current.kind,
            cell: current.cell,
            payloadType: "status",
            statusId: payload.status_effect,
            amount: payload.value ?? 1,
            targetHp: current.hp,
            targetDead: current.hp <= 0,
          });
          current = this.getCombatActor(current.id);
        }
      }

      // Emotional-layer impulse: a verb is an operator on axes. Apply after the
      // physical payloads (and only to a still-living target) so a lethal blow
      // doesn't also push a corpse's mood. Behavior falls out of the new axes.
      if (alderamonticoImpulseHasEffect(skill.emotional_impulse)) {
        const living = this.getCombatActor(target.id);
        if (living) {
          const seedAxes = entityEmotionalSeed(this.options.gamePackage, living.entityId);
          this.save = applyAlderamonticoImpulseToSave(
            this.save,
            living.id,
            skill.emotional_impulse as AlderamonticoEmotionalImpulse,
            { tick: this.tick, seedAxes },
          );
          hits.push({
            targetId: living.id,
            targetName: living.name,
            targetKind: living.kind,
            cell: living.cell,
            payloadType: "emotional",
            emotionalImpulse: skill.emotional_impulse,
            emotionalBehavior: resolveAlderamonticoBehavior(this.save, living.id, seedAxes),
          });
        }
      }
    }

    return {
      casterId: actor.id,
      casterName: actor.name,
      skillId: skill.id,
      skillName: skill.display_name,
      targetCells,
      hits,
      mpCost: skill.mp_cost || 0,
      energyCost: actor.kind === "player" && !this.save.in_combat ? skill.ap_cost || 0 : 0,
      experience,
      objectiveCompletions,
    };
  }

  getCombatantSnapshot(actorId: string): V1CombatantSnapshot | undefined {
    const actor = this.getCombatActor(actorId);
    return actor ? this.snapshotCombatActor(actor) : undefined;
  }

  getControlledCombatant(): V1CombatantSnapshot | undefined {
    if (!this.save.in_combat) return this.getCombatantSnapshot(PLAYER_ENTITY_ID);
    const activeTurn = this.save.active_turn_id || PLAYER_ENTITY_ID;
    if (activeTurn === PLAYER_ENTITY_ID || (this.save.party_members || []).includes(activeTurn)) {
      return this.getCombatantSnapshot(activeTurn);
    }
    return undefined;
  }

  getNearbyHostiles(radius: number, requireAlert = false): V1CombatantSnapshot[] {
    const player = this.getCombatActor(PLAYER_ENTITY_ID);
    if (!player) return [];
    const results: V1CombatantSnapshot[] = [];
    for (let index = 0; index < (this.activeMap.entity_placements || []).length; index += 1) {
      const placement = this.activeMap.entity_placements[index];
      if ((this.save.party_members || []).includes(placement.entity_id)) continue;
      const entityDef = this.options.gamePackage.entities.find((entity) => entity.id === placement.entity_id);
      if (!entityDef || entityDef.is_npc) continue;
      const key = entityPlacementStateKey(this.activeMap.id, placement, index);
      const actor = this.getCombatActor(key);
      if (!actor) continue;
      const dist = this.manhattan(player.cell, actor.cell);
      const combatAlerted = this.isHostileCombatAlert(key);
      if (requireAlert && !combatAlerted) continue;
      if (
        dist > radius &&
        !(combatAlerted && dist <= Math.max(radius, this.scaleMacroDistanceToFine(COMBAT_ALERT_CHASE_RADIUS_MACRO)))
      )
        continue;
      results.push(this.snapshotCombatActor(actor, dist));
    }
    return results.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
  }

  getSkillTargetCells(actorId: string, skillId: string, targetCell: [number, number]): V1SkillTargetResult {
    const actor = this.getCombatActor(actorId);
    if (!actor) return { ok: false, reason: "actor not found", cells: [] };
    const skill = this.getSkill(skillId);
    if (!skill) return { ok: false, reason: "skill not found", cells: [] };
    const dist = this.manhattan(actor.cell, targetCell);
    if (dist > (skill.range || 0)) return { ok: false, reason: "out of range", cells: [] };
    return { ok: true, cells: this.computeSkillTargetCells(actor.cell, skill, targetCell) };
  }

  getSkillRangeCells(actorId: string, skillId: string): [number, number][] {
    const actor = this.getCombatActor(actorId);
    const skill = this.getSkill(skillId);
    if (!actor || !skill) return [];
    const cells: [number, number][] = [];
    for (let dx = -(skill.range || 0); dx <= (skill.range || 0); dx += 1) {
      for (let dy = -(skill.range || 0); dy <= (skill.range || 0); dy += 1) {
        if (Math.abs(dx) + Math.abs(dy) > (skill.range || 0)) continue;
        cells.push([actor.cell[0] + dx, actor.cell[1] + dy]);
      }
    }
    return cells;
  }

  updateCombatSession(options: CombatSessionUpdateOptions): CombatSessionUpdateOutcome {
    // Radii are macro-authored; callers pass fine values (utils/combat.ts
    // scales its exports). Defaults scale here for parity.
    const threatRadius = options.threatRadius ?? this.scaleMacroDistanceToFine(6);
    const chaseRadius = options.chaseRadius ?? this.scaleMacroDistanceToFine(8);
    if ((this.save.playerStats.hp ?? 0) <= 0) return { status: "unchanged" };
    if (options.forceEnd && this.save.in_combat) return this.endCombatSession();

    if (!this.save.in_combat) {
      const hostiles = this.getNearbyHostiles(threatRadius, Boolean(options.requireAlert));
      if (hostiles.length === 0) return { status: "unchanged" };
      hostiles.forEach((hostile) => {
        const actor = this.getCombatActor(hostile.id);
        if (actor) this.markHostileCombatAlert(actor, this.save.player.cell);
      });
      this.positionPartyForCombat(options.partyFollowers || []);
      const queue = this.buildInitiativeQueue();
      this.save = {
        ...this.save,
        in_combat: true,
        combat_queue: queue,
        active_turn_id: queue[0] || PLAYER_ENTITY_ID,
        combat_xp_pool: 0,
      };
      return {
        status: "started",
        queue,
        hostiles: hostiles.map((hostile) => hostile.id),
      };
    }

    // Old saves may still contain hostile initiative entries. Combat control
    // now belongs only to the player side; normalize the queue whenever the
    // live session is evaluated.
    const alliedQueue = this.buildInitiativeQueue();
    const alliedTurn = alliedQueue.includes(this.save.active_turn_id || "")
      ? this.save.active_turn_id
      : alliedQueue[0] || PLAYER_ENTITY_ID;
    this.save = {
      ...this.save,
      combat_queue: alliedQueue,
      active_turn_id: alliedTurn,
    };

    const hostiles = this.getNearbyHostiles(chaseRadius, Boolean(options.requireAlert));
    if (hostiles.length === 0) return this.endCombatSession();

    const queue = this.save.combat_queue || [];
    const newcomers = hostiles
      .map((hostile) => hostile.id)
      .filter((actorId) => !this.isHostileCombatAlert(actorId));
    if (newcomers.length === 0) return { status: "unchanged" };
    hostiles.forEach((hostile) => {
      const actor = this.getCombatActor(hostile.id);
      if (actor) this.markHostileCombatAlert(actor, this.save.player.cell);
    });
    return { status: "reinforced", queue, newcomers };
  }

  advanceCombatTurn(): CombatTurnAdvanceOutcome {
    const previousTurnId = this.save.active_turn_id ?? null;
    if (!this.save.in_combat) return { previousTurnId, activeTurnId: previousTurnId };
    const queue = this.buildInitiativeQueue();
    if (
      queue.length !== (this.save.combat_queue || []).length ||
      queue.some((actorId, index) => actorId !== this.save.combat_queue?.[index])
    ) {
      this.save = { ...this.save, combat_queue: queue };
    }
    if (queue.length === 0) {
      this.save = { ...this.save, active_turn_id: PLAYER_ENTITY_ID };
      return { previousTurnId, activeTurnId: PLAYER_ENTITY_ID };
    }
    const currentIndex = Math.max(0, queue.indexOf(previousTurnId || ""));
    for (let step = 1; step <= queue.length; step += 1) {
      const candidate = queue[(currentIndex + step) % queue.length];
      if (this.isCombatActorAlive(candidate)) {
        this.save = { ...this.save, active_turn_id: candidate };
        return { previousTurnId, activeTurnId: candidate };
      }
    }
    this.save = { ...this.save, active_turn_id: PLAYER_ENTITY_ID };
    return { previousTurnId, activeTurnId: PLAYER_ENTITY_ID };
  }

  canResolveEnemyTurn(actorId = this.save.active_turn_id || ""): ValidationResult {
    if (!this.save.in_combat) return { ok: false, reason: "not in combat" };
    if (!actorId) return { ok: false, reason: "no active turn" };
    if (actorId === PLAYER_ENTITY_ID || (this.save.party_members || []).includes(actorId)) {
      return { ok: false, reason: "not enemy turn" };
    }
    const actor = this.getCombatActor(actorId);
    return actor?.kind === "entity" ? { ok: true } : { ok: false, reason: "missing enemy" };
  }

  resolveEnemyTurn(
    actorId = this.save.active_turn_id || "",
    advanceTurn = true,
    movementSteps = this.spatialRatio,
    allowAttack = true,
  ): EnemyTurnOutcome {
    const nextTurn = () =>
      advanceTurn ? this.advanceCombatTurn().activeTurnId : this.save.active_turn_id ?? null;
    const actor = this.getCombatActor(actorId);
    if (!actor || actor.kind !== "entity") {
      return { kind: "skip", actorId, nextTurnId: nextTurn(), reason: "missing enemy" };
    }

    const opponents = this.getOpponentsFor(actor);
    if (opponents.length === 0) {
      return {
        kind: "skip",
        actorId: actor.id,
        actorName: actor.name,
        nextTurnId: nextTurn(),
        reason: "no target",
      };
    }

    opponents.sort((a, b) => this.manhattan(actor.cell, a.cell) - this.manhattan(actor.cell, b.cell));
    const target = opponents[0];
    const adjacent = this.areAdjacentMacro(actor.cell, target.cell);
    const behavior = resolveAlderamonticoBehavior(
      this.save,
      actor.id,
      entityEmotionalSeed(this.options.gamePackage, actor.entityId),
    );
    const actorState = this.save.entity_states?.[actor.id] || {};
    const stimulusKind = actorState.last_stimulus?.kind as string | undefined;
    const stimulusCell = actorState.last_stimulus?.cell as [number, number] | undefined;
    const decision = decideEntityAction(
      {
        id: actor.id,
        name: actor.name,
        cell: actor.cell,
        hp: actor.hp,
        max_hp: actor.maxHp,
        dead: actorState.dead,
        hidden: actorState.hidden,
        frozen: Boolean(actorState.frozen || actorState.frozen_latched),
        integrity: actorState.integrity,
        statuses: actor.statuses,
        physical: this.save.actor_physical_states?.[actor.id],
        emotional_behavior: behavior,
        commitment: actorState.behavior_commitment as BehaviorCommitmentRecord | undefined,
      },
      {
        tick: this.tick,
        threat: { actor_id: target.id, cell: target.cell, adjacent },
        lethal_hazard:
          stimulusCell && (stimulusKind === "fire" || stimulusKind === "danger_gas")
            ? { kind: stimulusKind, cell: stimulusCell }
            : undefined,
      },
      "combat",
    );
    this.save = {
      ...this.save,
      entity_states: {
        ...(this.save.entity_states || {}),
        [actor.id]: recordEntityBehaviorDecision(actorState, decision),
      },
    };

    if (decision.action === "skip" || decision.action === "hold") {
      return {
        kind: "skip",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        nextTurnId: nextTurn(),
        reason: decision.action === "hold" ? "defending" : decision.reason,
      };
    }

    if (decision.action === "flee") {
      // Callers can resolve a visible fine-step pulse or a complete legacy
      // macro action. Play Mode uses one step so actors never teleport across
      // the subdivided grid between renders.
      const fleeOrigin = cloneCell(actor.cell);
      let fleeStep: [number, number] | undefined;
      for (let stepIndex = 0; stepIndex < Math.max(1, movementSteps); stepIndex += 1) {
        const next = this.findFleeStep(actor.id, decision.source_cell || target.cell);
        if (!next) break;
        this.moveEntity(actor.id, next[0], next[1]);
        fleeStep = next;
      }
      if (fleeStep) {
        const fromCell = fleeOrigin;
        return {
          kind: "move",
          actorId: actor.id,
          actorName: actor.name,
          targetId: target.id,
          fromCell,
          toCell: fleeStep,
          nextTurnId: nextTurn(),
          reason: "flee",
        };
      }
      return {
        kind: "skip",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        nextTurnId: nextTurn(),
        reason: "flee_blocked",
      };
    }

    if (adjacent && !allowAttack) {
      return {
        kind: "skip",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        nextTurnId: nextTurn(),
        reason: "holding_range",
      };
    }

    if (adjacent) {
      const attack = this.resolveMeleeAttack(actor.id, target.id);
      return {
        kind: "attack",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        attack,
        objectiveCompletions: attack.objectiveCompletions,
        nextTurnId: nextTurn(),
      };
    }

    // Stop as soon as the requested visible movement budget is spent or melee
    // reach is achieved.
    const chaseOrigin = cloneCell(actor.cell);
    let lastStep: [number, number] | undefined;
    for (let stepIndex = 0; stepIndex < Math.max(1, movementSteps); stepIndex += 1) {
      const mover = this.getCombatActor(actor.id);
      if (!mover) break;
      if (this.areAdjacentMacro(mover.cell, target.cell)) break;
      const step = this.findStepToward(mover, target.cell);
      if (!step) break;
      this.moveEntity(actor.id, step[0], step[1]);
      lastStep = step;
    }
    if (lastStep) {
      return {
        kind: "move",
        actorId: actor.id,
        actorName: actor.name,
        targetId: target.id,
        fromCell: chaseOrigin,
        toCell: lastStep,
        nextTurnId: nextTurn(),
      };
    }

    return {
      kind: "skip",
      actorId: actor.id,
      actorName: actor.name,
      targetId: target.id,
      nextTurnId: nextTurn(),
      reason: "blocked",
    };
  }

  resolveOpportunityAttacks(actorId: string, fromCell: [number, number], toCell: [number, number]): CombatAttackOutcome[] {
    if (!this.save.in_combat) return [];
    const mover = this.getCombatActor(actorId);
    if (!mover) return [];
    const reactors = this.getOpponentsFor(mover);
    const outcomes: CombatAttackOutcome[] = [];
    for (const reactor of reactors) {
      if (!this.areAdjacentMacro(reactor.cell, fromCell)) continue;
      if (this.areAdjacentMacro(reactor.cell, toCell)) continue;
      if (!this.getCombatActor(actorId)) break;
      const validation = this.canMeleeAttack(reactor.id, actorId);
      if (!validation.ok) continue;
      outcomes.push(this.resolveMeleeAttack(reactor.id, actorId));
      const updatedMover = this.getCombatActor(actorId);
      if (!updatedMover || updatedMover.hp <= 0) break;
    }
    return outcomes;
  }

  applyActionCost(actorId: string, costs: V1ActionCostOptions = {}): void {
    const energyCost = Math.max(0, Math.floor(costs.energyCost ?? 0));
    const clockMinutes = Math.max(0, Math.floor(costs.clockMinutes ?? 0));
    if (energyCost <= 0 && clockMinutes <= 0) return;

    let nextSave = this.save;
    if (energyCost > 0) {
      if (actorId === PLAYER_ENTITY_ID) {
        nextSave = {
          ...nextSave,
          playerStats: {
            ...nextSave.playerStats,
            energy: Math.max(0, (nextSave.playerStats.energy || 0) - energyCost),
          },
        };
      } else {
        const currentState = nextSave.entity_states?.[actorId] || {};
        nextSave = {
          ...nextSave,
          entity_states: {
            ...(nextSave.entity_states || {}),
            [actorId]: {
              ...currentState,
              energy: Math.max(0, Number(currentState.energy || 0) - energyCost),
            },
          },
        };
      }
    }

    if (clockMinutes > 0) {
      nextSave = {
        ...nextSave,
        clock_minutes: (nextSave.clock_minutes || 0) + clockMinutes,
      };
      this.tick = nextSave.clock_minutes || this.tick;
    }

    this.save = nextSave;
    this.events.emit("resource_spent", this.tick, {
      actorIds: [actorId],
      payload: {
        energy: energyCost,
        clock_minutes: clockMinutes,
      },
    });
  }

  private manhattan(a: [number, number], b: [number, number]): number {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  }

  private snapshotCombatActor(actor: CombatActorRuntime, dist?: number): V1CombatantSnapshot {
    return {
      id: actor.id,
      entityId: actor.entityId,
      name: actor.name,
      kind: actor.kind,
      cell: cloneCell(actor.cell),
      facing: actor.facing ? cloneCell(actor.facing) : undefined,
      hp: actor.hp,
      maxHp: actor.maxHp,
      mp: actor.mp,
      maxMp: actor.maxMp,
      attack: actor.attack,
      defense: actor.defense,
      speed: actor.speed,
      skills: actor.kind === "player" ? [...(this.save.known_skills || [])] : [...(actor.entityDef?.skills || [])],
      dist,
    };
  }

  // AoE shapes are AUTHORED in macro tiles and rasterized to fine cells here
  // (§5.2): each macro shape cell becomes its full FINE_PER_MACRO² fine block.
  // A "block" skill (3×3 macro) therefore covers 9×9 fine cells at ratio 3.
  // skill.range arrives already fine-scaled from the fineWorld expansion.
  private computeSkillTargetCells(
    actorCell: [number, number],
    skill: SkillData,
    targetCell: [number, number],
  ): [number, number][] {
    const [cx, cy] = actorCell;
    const [tx, ty] = targetCell;
    const cells: [number, number][] = [];
    const seen = new Set<string>();
    const pushBlock = (centerX: number, centerY: number) => {
      const half = this.spatialHalfExtent;
      for (let dx = -half; dx <= half; dx += 1) {
        for (let dy = -half; dy <= half; dy += 1) {
          const key = `${centerX + dx}:${centerY + dy}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cells.push([centerX + dx, centerY + dy]);
        }
      }
    };
    // Macro shape cells expand around the targeted fine cell.
    const pushMacroOffset = (ox: number, oy: number) =>
      pushBlock(tx + ox * this.spatialRatio, ty + oy * this.spatialRatio);

    if (skill.targeting === "single") {
      pushBlock(tx, ty);
    } else if (skill.targeting === "cross") {
      pushMacroOffset(0, 0);
      pushMacroOffset(-1, 0);
      pushMacroOffset(1, 0);
      pushMacroOffset(0, -1);
      pushMacroOffset(0, 1);
    } else if (skill.targeting === "block") {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          pushMacroOffset(dx, dy);
        }
      }
    } else if (skill.targeting === "line") {
      const dx = Math.sign(tx - cx);
      const dy = Math.sign(ty - cy);
      if (dx === 0 && dy === 0) return [];
      // A macro-authored line is one macro tile wide: expand each fine step
      // perpendicular to the line's direction.
      const half = this.spatialHalfExtent;
      for (let i = 1; i <= (skill.range || 1); i += 1) {
        for (let width = -half; width <= half; width += 1) {
          const key = dx !== 0 ? `${cx + dx * i}:${cy + width}` : `${cx + width}:${cy + dy * i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          cells.push(dx !== 0 ? [cx + dx * i, cy + width] : [cx + width, cy + dy * i]);
        }
      }
    } else if (skill.targeting === "cone") {
      const dx = Math.sign(tx - cx);
      const dy = Math.sign(ty - cy);
      if (dx === 0 && dy === 0) return [];
      // The fine-resolved cone widens per fine step, which reproduces the
      // authored macro cone's proportions at any ratio.
      if (Math.abs(dx) > Math.abs(dy)) {
        for (let i = 1; i <= (skill.range || 1); i += 1) {
          for (let width = -i; width <= i; width += 1) cells.push([cx + dx * i, cy + width]);
        }
      } else {
        for (let i = 1; i <= (skill.range || 1); i += 1) {
          for (let width = -i; width <= i; width += 1) cells.push([cx + width, cy + dy * i]);
        }
      }
    }
    return cells;
  }

  private positionPartyForCombat(followers: CombatPartyFollowerRef[]): void {
    const followerById = new Map(followers.map((follower) => [follower.entityId, follower]));
    const entityStates = { ...(this.save.entity_states || {}) };
    for (const partyId of this.save.party_members || []) {
      const entityDef = this.options.gamePackage.entities.find((entity) => entity.id === partyId);
      if (!entityDef) continue;
      const state = entityStates[partyId] || {};
      const follower = followerById.get(partyId);
      entityStates[partyId] = {
        ...state,
        cell: cloneCell((state.cell as [number, number] | undefined) || follower?.cell || this.save.player.cell),
        facing: (state.facing as [number, number] | undefined) || cloneCell(this.save.player.facing),
        hp: state.hp ?? entityDef.max_hp ?? 1,
        mp: state.mp ?? entityDef.max_mp ?? 0,
        dead: false,
      };
    }
    this.save = { ...this.save, entity_states: entityStates };
  }

  private buildInitiativeQueue(): string[] {
    const members: { id: string; speed: number; order: number }[] = [];
    let order = 0;
    if ((this.save.playerStats.hp ?? 0) > 0) {
      members.push({ id: PLAYER_ENTITY_ID, speed: this.save.playerStats.speed ?? 10, order: order++ });
    }
    for (const partyId of this.save.party_members || []) {
      const actor = this.getCombatActor(partyId);
      if (!actor) continue;
      members.push({ id: partyId, speed: actor.speed, order: order++ });
    }
    return members
      .sort((a, b) => b.speed - a.speed || a.order - b.order)
      .map((member) => member.id);
  }

  private endCombatSession(): CombatSessionUpdateOutcome {
    const entityStates = { ...(this.save.entity_states || {}) };
    for (const partyId of this.save.party_members || []) {
      const state = entityStates[partyId];
      if (!state) continue;
      const { cell: _cell, ...rest } = state;
      entityStates[partyId] = {
        ...rest,
        dead: false,
        hp: Math.max(1, state.hp ?? 1),
      };
    }

    const xpPool = Math.max(0, Math.floor(this.save.combat_xp_pool || 0));
    let nextSave: PlaySave = {
      ...this.save,
      in_combat: false,
      combat_queue: [],
      active_turn_id: PLAYER_ENTITY_ID,
      entity_states: entityStates,
      combat_xp_pool: 0,
    };
    let experience: CombatAttackOutcome["experience"] | undefined;
    if (xpPool > 0) {
      const granted = grantExperienceToSave(nextSave, xpPool);
      nextSave = { ...granted.save, combat_xp_pool: 0 };
      experience = {
        awarded: granted.result.awarded,
        level: granted.result.level,
        levelUps: granted.result.levelUps,
        pendingLevelUps: granted.result.pendingLevelUps,
        queued: false,
      };
    }
    this.save = nextSave;
    return { status: "ended", experience };
  }

  private isCombatActorAlive(actorId: string): boolean {
    if (actorId === PLAYER_ENTITY_ID) return (this.save.playerStats.hp ?? 0) > 0;
    return Boolean(this.getCombatActor(actorId));
  }

  private getOpponentsFor(actor: CombatActorRuntime): CombatActorRuntime[] {
    if (actor.kind === "entity") {
      const opponents: CombatActorRuntime[] = [];
      const player = this.getCombatActor(PLAYER_ENTITY_ID);
      if (player) opponents.push(player);
      for (const partyId of this.save.party_members || []) {
        const party = this.getCombatActor(partyId);
        if (party) opponents.push(party);
      }
      return opponents;
    }

    const opponents: CombatActorRuntime[] = [];
    for (let index = 0; index < (this.activeMap.entity_placements || []).length; index += 1) {
      const placement = this.activeMap.entity_placements[index];
      if ((this.save.party_members || []).includes(placement.entity_id)) continue;
      const entityDef = this.options.gamePackage.entities.find((entity) => entity.id === placement.entity_id);
      if (!entityDef || entityDef.is_npc) continue;
      const enemy = this.getCombatActor(entityPlacementStateKey(this.activeMap.id, placement, index));
      if (enemy) opponents.push(enemy);
    }
    return opponents;
  }

  private findBoundedPathStep(
    actorId: string,
    startCell: [number, number],
    isGoal: (cell: [number, number]) => boolean,
    targetCell: [number, number],
    maxMacroDistance = 9,
  ): [number, number] | undefined {
    const maxDepth = this.scaleMacroDistanceToFine(maxMacroDistance);
    const maxExpansions = Math.max(300, maxDepth * maxDepth);
    const queue: { cell: [number, number]; firstStep?: [number, number]; depth: number }[] = [
      { cell: startCell, depth: 0 },
    ];
    const visited = new Set([coordKey(startCell[0], startCell[1])]);
    let head = 0;
    let expansions = 0;
    while (head < queue.length && expansions++ < maxExpansions) {
      const current = queue[head++]!;
      if (current.depth > 0 && isGoal(current.cell)) return current.firstStep;
      if (current.depth >= maxDepth) continue;
      const moves: [number, number][] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ].sort(
        (a, b) =>
          Math.abs(current.cell[0] + a[0] - targetCell[0]) +
          Math.abs(current.cell[1] + a[1] - targetCell[1]) -
          (Math.abs(current.cell[0] + b[0] - targetCell[0]) +
            Math.abs(current.cell[1] + b[1] - targetCell[1])),
      ) as [number, number][];
      for (const [mx, my] of moves) {
        const next: [number, number] = [current.cell[0] + mx, current.cell[1] + my];
        const key = coordKey(next[0], next[1]);
        if (visited.has(key)) continue;
        visited.add(key);
        if (!this.canMoveEntity(actorId, next[0], next[1]).ok) continue;
        queue.push({
          cell: next,
          firstStep: current.firstStep || next,
          depth: current.depth + 1,
        });
      }
    }
    return undefined;
  }

  private findStepToward(actor: CombatActorRuntime, targetCell: [number, number]): [number, number] | undefined {
    const dx = Math.sign(targetCell[0] - actor.cell[0]);
    const dy = Math.sign(targetCell[1] - actor.cell[1]);
    const directOrder: [number, number][] =
      Math.abs(targetCell[0] - actor.cell[0]) >= Math.abs(targetCell[1] - actor.cell[1])
        ? [[dx, 0], [0, dy]]
        : [[0, dy], [dx, 0]];
    // Open pursuit lanes are overwhelmingly common and need no graph search.
    // Try the distance-reducing cardinal steps first; only invoke bounded BFS
    // when terrain or another footprint blocks both direct approaches.
    for (const [mx, my] of directOrder) {
      if (mx === 0 && my === 0) continue;
      const next: [number, number] = [actor.cell[0] + mx, actor.cell[1] + my];
      if (this.canMoveEntity(actor.id, next[0], next[1]).ok) return next;
    }
    return this.findBoundedPathStep(
      actor.id,
      actor.cell,
      (cell) => this.areAdjacentMacro(cell, targetCell),
      targetCell,
    );
  }

  private rollMeleeDamage(attack: number, defense: number) {
    const base = Math.max(1, attack - defense);
    const crit = this.rng.stream("combat").next() < COMBAT_CRIT_CHANCE;
    return { dmg: crit ? Math.max(1, Math.round(base * COMBAT_CRIT_MULT)) : base, crit };
  }

  private rollSkillDamage(payloadValue: number, attack: number, defense: number) {
    const base = Math.max(1, payloadValue + Math.floor(attack / 2) - defense);
    const crit = this.rng.stream("combat").next() < COMBAT_CRIT_CHANCE;
    return { dmg: crit ? Math.max(1, Math.round(base * COMBAT_CRIT_MULT)) : base, crit };
  }

  private getSkill(skillId: string): SkillData | undefined {
    return this.options.gamePackage.abilities.find((skill) => skill.id === skillId);
  }

  private actorKnowsSkill(actor: CombatActorRuntime, skillId: string): boolean {
    if (actor.kind === "player") return (this.save.known_skills || []).includes(skillId);
    return (actor.entityDef?.skills || []).includes(skillId);
  }

  private getCombatActor(actorId: string): CombatActorRuntime | undefined {
    if (actorId === PLAYER_ENTITY_ID) {
      if ((this.save.playerStats.hp ?? 0) <= 0) return undefined;
      return {
        id: PLAYER_ENTITY_ID,
        kind: "player",
        name: "You",
        cell: cloneCell(this.save.player.cell),
        facing: cloneCell(this.save.player.facing),
        hp: this.save.playerStats.hp,
        maxHp: this.save.playerStats.max_hp,
        mp: this.save.playerStats.mp ?? 0,
        maxMp: this.save.playerStats.max_mp ?? 0,
        attack: this.save.playerStats.attack,
        defense: this.save.playerStats.defense,
        speed: this.save.playerStats.speed ?? 10,
        statuses: this.save.actor_statuses?.[PLAYER_ENTITY_ID],
      };
    }

    if ((this.save.party_members || []).includes(actorId)) {
      const entityDef = this.options.gamePackage.entities.find((entity) => entity.id === actorId);
      if (!entityDef) return undefined;
      const state = (this.save.entity_states || {})[actorId] || {};
      const hp = state.hp ?? entityDef.max_hp ?? 1;
      if (state.dead || hp <= 0) return undefined;
      return {
        id: actorId,
        kind: "party",
        entityId: entityDef.id,
        name: entityDef.display_name,
        cell: cloneCell((state.cell as [number, number] | undefined) || this.save.player.cell),
        facing: (state.facing as [number, number] | undefined) || [0, 1],
        hp,
        maxHp: entityDef.max_hp ?? 1,
        mp: state.mp ?? entityDef.max_mp ?? 0,
        maxMp: entityDef.max_mp ?? 0,
        attack: entityDef.attack ?? 2,
        defense: entityDef.defense ?? 0,
        speed: entityDef.speed ?? 10,
        statuses: state.statuses,
        entityDef,
      };
    }

    for (let index = 0; index < (this.activeMap.entity_placements || []).length; index += 1) {
      const placement = this.activeMap.entity_placements[index];
      const key = entityPlacementStateKey(this.activeMap.id, placement, index);
      if (key !== actorId) continue;
      const entityDef = this.options.gamePackage.entities.find((entity) => entity.id === placement.entity_id);
      if (!entityDef) return undefined;
      const state = (this.save.entity_states || {})[key] || {};
      const hp = state.hp ?? entityDef.max_hp ?? 1;
      if (state.dead || state.hidden || hp <= 0) return undefined;
      return {
        id: key,
        kind: "entity",
        entityId: entityDef.id,
        name: entityDef.display_name,
        cell: cloneCell((state.cell as [number, number] | undefined) || (placement.cell as [number, number])),
        facing: (state.facing || placement.facing) as [number, number] | undefined,
        hp,
        maxHp: entityDef.max_hp ?? 1,
        mp: state.mp ?? entityDef.max_mp ?? 0,
        maxMp: entityDef.max_mp ?? 0,
        attack: entityDef.attack ?? 2,
        defense: entityDef.defense ?? 0,
        speed: entityDef.speed ?? 10,
        statuses: state.statuses,
        entityDef,
      };
    }

    return undefined;
  }

  private getCombatActorsInCells(targetCells: [number, number][]): CombatActorRuntime[] {
    const targetKeys = new Set(targetCells.map((cell) => coordKey(cell[0], cell[1])));
    const actors: CombatActorRuntime[] = [];
    const player = this.getCombatActor(PLAYER_ENTITY_ID);
    if (player && targetKeys.has(coordKey(player.cell[0], player.cell[1]))) actors.push(player);

    for (const partyId of this.save.party_members || []) {
      const party = this.getCombatActor(partyId);
      if (party && targetKeys.has(coordKey(party.cell[0], party.cell[1]))) actors.push(party);
    }

    for (let index = 0; index < (this.activeMap.entity_placements || []).length; index += 1) {
      const placement = this.activeMap.entity_placements[index];
      if ((this.save.party_members || []).includes(placement.entity_id)) continue;
      const key = entityPlacementStateKey(this.activeMap.id, placement, index);
      const actor = this.getCombatActor(key);
      if (actor && targetKeys.has(coordKey(actor.cell[0], actor.cell[1]))) actors.push(actor);
    }

    return actors;
  }

  private setActorFacing(actor: CombatActorRuntime, facing: [number, number]): void {
    this.writeCombatActor(actor, { facing });
  }

  private isHostileCombatAlert(actorId: string): boolean {
    const state = this.save.entity_states?.[actorId];
    return state?.alertness === "combat" && Number(state.alert_score || 0) >= 0.45;
  }

  private markHostileCombatAlert(actor: CombatActorRuntime, stimulusCell: [number, number]): void {
    if (actor.kind !== "entity" || actor.entityDef?.is_npc) return;
    const currentState = this.save.entity_states?.[actor.id] || {};
    this.save = {
      ...this.save,
      entity_states: {
        ...(this.save.entity_states || {}),
        [actor.id]: {
          ...currentState,
          cell: currentState.cell || cloneCell(actor.cell),
          facing: currentState.facing || actor.facing,
          alertness: "combat",
          alert_score: Math.max(1, Number(currentState.alert_score || 0)),
          last_stimulus: {
            kind: "visible_player",
            cell: cloneCell(stimulusCell),
            tick: this.tick,
          },
          investigation_target_cell: cloneCell(stimulusCell),
        },
      },
    };
  }

  private writeCombatActor(
    actor: CombatActorRuntime,
    updates: {
      hp?: number;
      mp?: number;
      statuses?: StatusInstance[];
      dead?: boolean;
      facing?: [number, number];
    },
  ): void {
    if (actor.kind === "player") {
      let nextSave = this.save;
      if (updates.hp !== undefined || updates.mp !== undefined) {
        nextSave = {
          ...nextSave,
          playerStats: {
            ...nextSave.playerStats,
            hp: updates.hp !== undefined ? Math.max(0, Math.min(nextSave.playerStats.max_hp, updates.hp)) : nextSave.playerStats.hp,
            mp: updates.mp !== undefined ? Math.max(0, Math.min(nextSave.playerStats.max_mp, updates.mp)) : nextSave.playerStats.mp,
          },
        };
      }
      if (updates.statuses !== undefined) {
        nextSave = {
          ...nextSave,
          actor_statuses: {
            ...(nextSave.actor_statuses || {}),
            [PLAYER_ENTITY_ID]: updates.statuses,
          },
        };
      }
      if (updates.facing) {
        nextSave = {
          ...nextSave,
          player: { ...nextSave.player, facing: cloneCell(updates.facing) },
        };
      }
      this.save = nextSave;
      return;
    }

    const currentState = (this.save.entity_states || {})[actor.id] || {};
    this.save = {
      ...this.save,
      entity_states: {
        ...(this.save.entity_states || {}),
        [actor.id]: {
          ...currentState,
          ...(updates.hp !== undefined ? { hp: Math.max(0, Math.min(actor.maxHp, updates.hp)) } : {}),
          ...(updates.mp !== undefined ? { mp: Math.max(0, Math.min(actor.maxMp, updates.mp)) } : {}),
          ...(updates.statuses !== undefined ? { statuses: updates.statuses } : {}),
          ...(updates.dead !== undefined ? { dead: updates.dead } : {}),
          ...(updates.facing ? { facing: cloneCell(updates.facing) } : {}),
          cell: currentState.cell || actor.cell,
        },
      },
    };
  }

  private damageActor(actor: CombatActorRuntime, damage: number): {
    hp: number;
    dead: boolean;
    experience?: CombatAttackOutcome["experience"];
    objectiveCompletions: QuestObjectiveCompletion[];
  } {
    const hp = Math.max(0, actor.hp - Math.max(0, Math.floor(damage)));
    const dead = hp <= 0;
    this.writeCombatActor(actor, { hp, dead: actor.kind === "player" ? undefined : dead });
    let experience: CombatAttackOutcome["experience"] | undefined;
    let objectiveCompletions: QuestObjectiveCompletion[] = [];
    if (dead && actor.kind === "entity" && actor.entityDef && !actor.entityDef.is_npc) {
      experience = this.awardDefeatExperience(actor.entityDef);
      objectiveCompletions = this.completeQuestObjectivesForTarget("kill", actor.entityDef.id);
    }
    return { hp, dead, experience, objectiveCompletions };
  }

  private spendSkillResources(actor: CombatActorRuntime, skill: SkillData): void {
    const mpCost = Math.max(0, Math.floor(skill.mp_cost || 0));
    const energyCost = actor.kind === "player" && !this.save.in_combat ? Math.max(0, Math.floor(skill.ap_cost || 0)) : 0;
    if (actor.kind === "player") {
      this.save = {
        ...this.save,
        playerStats: {
          ...this.save.playerStats,
          mp: Math.max(0, (this.save.playerStats.mp || 0) - mpCost),
          energy: Math.max(0, (this.save.playerStats.energy || 0) - energyCost),
        },
      };
      return;
    }
    this.writeCombatActor(actor, { mp: actor.mp - mpCost });
  }

  private awardDefeatExperience(entity: EntityData): CombatAttackOutcome["experience"] | undefined {
    const awarded = getEnemyXpReward(entity);
    if (awarded <= 0) return undefined;
    if (this.save.in_combat) {
      this.save = {
        ...this.save,
        combat_xp_pool: Math.max(0, Math.floor(this.save.combat_xp_pool || 0)) + awarded,
      };
      return { awarded, queued: true };
    }
    const granted = grantExperienceToSave(this.save, awarded);
    this.save = granted.save;
    return {
      awarded,
      level: granted.result.level,
      levelUps: granted.result.levelUps,
      pendingLevelUps: granted.result.pendingLevelUps,
      queued: false,
    };
  }

  private completeQuestObjectivesForTarget(objectiveType: string, targetId: string): QuestObjectiveCompletion[] {
    const completions: QuestObjectiveCompletion[] = [];
    for (const quest of this.options.gamePackage.quests || []) {
      for (const objective of quest.objectives || []) {
        if (objective.type !== objectiveType || objective.target_id !== targetId) continue;
        if (this.save.flags?.[`obj_done_${objective.id}`]) continue;
        this.completeQuestObjective(objective.id, objective.target_id, objective.type);
        completions.push({
          objectiveId: objective.id,
          objectiveType: objective.type,
          targetId: objective.target_id,
        });
      }
    }
    return completions;
  }

  private updateMapDelta(update: (delta: MapDelta) => MapDelta): void {
    const mapId = this.activeMap.id;
    this.updateMapDeltaFor(mapId, update);
  }

  private updateMapDeltaFor(mapId: string, update: (delta: MapDelta) => MapDelta): void {
    const deltas = { ...(this.save.map_deltas || {}) };
    deltas[mapId] = update(deltas[mapId] || {});
    this.save = { ...this.save, map_deltas: deltas };
  }

  private surfaceLayerKey(cell: [number, number]): string {
    return `${cell[0]}:${cell[1]}`;
  }

  private surfaceTraceProfile(
    cell: CellData | undefined,
    kind: string,
  ): Required<SimulationTraceProfileData> {
    const authored = cell?.simulation?.trace_profile;
    const residueKind = authored?.residue_kind || kind;
    const tracePotentialByKind: Record<string, number> = {
      blood: 0.9,
      oil: 0.85,
      poison: 0.75,
      mud: 0.7,
      water: 0.55,
      ice: 0.35,
      footprint: 0.35,
    };
    return {
      residue_kind: residueKind,
      trace_potential: authored?.trace_potential ?? tracePotentialByKind[kind] ?? 0.45,
      visibility: authored?.visibility ?? (kind === "water" ? 0.25 : 0.55),
      scent: authored?.scent ?? (kind === "blood" || kind === "poison" ? 0.6 : 0.05),
      slipperiness: authored?.slipperiness ?? (kind === "oil" || kind === "ice" ? 0.75 : 0.1),
      cleaning_difficulty: authored?.cleaning_difficulty ?? (kind === "oil" || kind === "blood" ? 1.2 : 0.8),
      decay_ticks: authored?.decay_ticks ?? (kind === "blood" || kind === "oil" ? 240 : 120),
      decay_per_tick: authored?.decay_per_tick ?? (kind === "blood" || kind === "oil" ? 0.0018 : 0.003),
      transfer_kinds: authored?.transfer_kinds || ["footprint"],
    };
  }

  private activeSurfaceLayersAt(cell: [number, number]): SimulationSurfaceLayerRecord[] {
    const tick = this.tick;
    return (this.getMapDelta()?.surface_layers?.[this.surfaceLayerKey(cell)] || []).filter(
      (layer) => !layer.expires_at_tick || layer.expires_at_tick > tick,
    );
  }

  private recordSurfaceTrace(
    actorId: string,
    cell: [number, number],
    kind: string,
    action: string,
    options: Partial<SimulationSurfaceLayerRecord> = {},
  ): void {
    this.updateMapDelta((delta) => {
      const key = this.surfaceLayerKey(cell);
      const current = delta.surface_layers?.[key] || [];
      const amount = Math.max(0, Math.min(1, options.amount ?? 0.35));
      const decayTicks = Math.max(1, Math.floor((options.expires_at_tick ?? this.tick + 120) - this.tick));
      return {
        ...delta,
        surface_layers: {
          ...(delta.surface_layers || {}),
          [key]: [
            ...current.slice(-7),
            {
              id: `trace_${this.tick}_${actorId}_${cell[0]}_${cell[1]}_${options.trace_sequence || current.length}`,
              kind,
              amount,
              age_ticks: 0,
              source: "trace",
              tag: options.tag || kind,
              trace_actor_id: actorId,
              trace_action: action,
              residue_kind: options.residue_kind || kind,
              transfer_from_cell: options.transfer_from_cell,
              transferred_from_layer_id: options.transferred_from_layer_id,
              cleaned_by_actor_id: options.cleaned_by_actor_id,
              cleaned_at_tick: options.cleaned_at_tick,
              cleaning_difficulty: options.cleaning_difficulty,
              visibility: options.visibility,
              scent: options.scent,
              slipperiness: options.slipperiness,
              trace_potential: options.trace_potential,
              trace_sequence: options.trace_sequence,
              decay_per_tick: options.decay_per_tick,
              created_at_tick: this.tick,
              expires_at_tick: options.expires_at_tick ?? this.tick + decayTicks,
            },
          ],
        },
      };
    });
  }

  private recordMovementSurfaceTransfer(actorId: string, cell: [number, number]): void {
    const targetCell = this.getActiveCell(cell[0], cell[1]);
    const baseProfile = this.surfaceTraceProfile(targetCell, "footprint");
    // emitSoundAt commits this same next sequence immediately after the
    // movement trace. Pairing the records lets the save retain a bounded,
    // recent mechanical trail even when fine-grid walking does not advance the
    // world clock.
    const traceSequence =
      Math.max(0, Number(this.save.flags?.immersive_sound_sequence || 0)) + 1;
    this.recordSurfaceTrace(actorId, cell, "footprint", "move", {
      amount: baseProfile.trace_potential,
      residue_kind: baseProfile.residue_kind,
      visibility: baseProfile.visibility,
      scent: baseProfile.scent,
      slipperiness: baseProfile.slipperiness,
      trace_potential: baseProfile.trace_potential,
      trace_sequence: traceSequence,
      cleaning_difficulty: baseProfile.cleaning_difficulty,
      decay_per_tick: baseProfile.decay_per_tick,
      expires_at_tick: this.tick + baseProfile.decay_ticks,
    });

    const authoredSurface = targetCell?.surface_tag && targetCell.surface_tag !== "none" ? targetCell.surface_tag : undefined;
    if (authoredSurface) {
      const profile = this.surfaceTraceProfile(targetCell, authoredSurface);
      if (profile.transfer_kinds.includes("footprint") && profile.trace_potential > 0) {
        this.recordSurfaceTrace(actorId, cell, `${authoredSurface}_footprint`, "residue_transfer", {
          amount: Math.min(0.9, profile.trace_potential),
          residue_kind: authoredSurface,
          transfer_from_cell: cloneCell(cell),
          visibility: profile.visibility,
          scent: profile.scent,
          slipperiness: profile.slipperiness,
          trace_potential: profile.trace_potential,
          trace_sequence: traceSequence,
          cleaning_difficulty: profile.cleaning_difficulty,
          decay_per_tick: profile.decay_per_tick,
          expires_at_tick: this.tick + profile.decay_ticks,
        });
      }
    }

    this.activeSurfaceLayersAt(cell)
      .filter((layer) => layer.source !== "trace" || (layer.trace_potential || 0) > 0.5)
      .slice(-2)
      .forEach((layer) => {
        const profile = this.surfaceTraceProfile(targetCell, layer.residue_kind || layer.kind);
        const amount = Math.min(0.9, Math.max(0.1, layer.amount * (layer.trace_potential ?? profile.trace_potential) * 0.6));
        this.recordSurfaceTrace(actorId, cell, `${layer.residue_kind || layer.kind}_footprint`, "residue_transfer", {
          amount,
          residue_kind: layer.residue_kind || layer.kind,
          transfer_from_cell: cloneCell(cell),
          transferred_from_layer_id: layer.id,
          visibility: layer.visibility ?? profile.visibility,
          scent: layer.scent ?? profile.scent,
          slipperiness: layer.slipperiness ?? profile.slipperiness,
          trace_potential: layer.trace_potential ?? profile.trace_potential,
          trace_sequence: traceSequence,
          cleaning_difficulty: layer.cleaning_difficulty ?? profile.cleaning_difficulty,
          decay_per_tick: layer.decay_per_tick ?? profile.decay_per_tick,
          expires_at_tick: this.tick + profile.decay_ticks,
        });
      });
  }

  private environmentFieldKey(cell: [number, number]): string {
    return `${cell[0]}:${cell[1]}`;
  }

  private activeEnvironmentFieldsAt(cell: [number, number]): SimulationEnvironmentFieldRecord[] {
    const tick = this.tick;
    return (this.getMapDelta()?.environment_fields?.[this.environmentFieldKey(cell)] || []).filter(
      (field) => !field.expires_at_tick || field.expires_at_tick > tick,
    );
  }

  private appendEnvironmentField(cell: [number, number], field: Omit<SimulationEnvironmentFieldRecord, "id" | "created_at_tick" | "age_ticks">): void {
    this.updateMapDelta((delta) => {
      const key = this.environmentFieldKey(cell);
      const current = delta.environment_fields?.[key] || [];
      return {
        ...delta,
        environment_fields: {
          ...(delta.environment_fields || {}),
          [key]: [
            ...current.slice(-9),
            {
              ...field,
              id: `env_${field.kind}_${this.tick}_${cell[0]}_${cell[1]}_${current.length}`,
              age_ticks: 0,
              created_at_tick: this.tick,
            },
          ],
        },
      };
    });
  }

  private materialFlammabilityForCell(cell: CellData | undefined): number {
    if (!cell) return 0;
    if (cell.surface_tag === "oil" || cell.surface_tag === "firehazard") return 1;
    if (cell.surface_tag === "blood" || cell.surface_tag === "poison") return 0.25;
    const materialId = cell.simulation?.material_id || (cell.terrain?.includes("wood") ? "sim_mat_wood" : undefined);
    const material = this.options.gamePackage.simulation_materials.find((candidate) => candidate.id === materialId);
    return material?.flammability ?? 0.1;
  }

  private lightIntensityForCell(cell: CellData | undefined): number {
    if (!cell) return 0;
    const terms = [cell.tag || "", cell.object_id || "", cell.hazard || "", cell.surface_tag || ""].join(" ").toLowerCase();
    if (cell.surface_tag === "firehazard" || /torch|lamp|lantern|brazier|candle|light/.test(terms)) return 0.75;
    return 0;
  }

  private npcTaskCandidates(origin: [number, number], radius: number): { actorId: string; cell: [number, number] }[] {
    const out: { actorId: string; cell: [number, number] }[] = [];
    for (let index = 0; index < (this.activeMap.entity_placements || []).length; index += 1) {
      const placement = this.activeMap.entity_placements[index];
      const entity = this.options.gamePackage.entities.find((candidate) => candidate.id === placement.entity_id);
      if (!entity?.is_npc) continue;
      const key = entityPlacementStateKey(this.activeMap.id, placement, index);
      const state = this.save.entity_states?.[key] || this.save.entity_states?.[placement.entity_id] || {};
      if (state.dead || state.hidden) continue;
      const cell = (state.cell || placement.cell) as [number, number];
      const distance = Math.abs(cell[0] - origin[0]) + Math.abs(cell[1] - origin[1]);
      if (distance <= radius) out.push({ actorId: key, cell: cloneCell(cell) });
    }
    return out;
  }

  private queueNpcTasksForDisturbance(
    sourceKind: SimulationNpcTaskRecord["source_kind"],
    origin: [number, number],
    target: [number, number],
    priority: number,
    radius: number,
  ): number {
    const candidates = this.npcTaskCandidates(origin, radius);
    if (!candidates.length) return 0;
    let added = 0;
    this.updateMapDelta((delta) => {
      const existing = delta.npc_tasks || [];
      const next = [...existing];
      for (const candidate of candidates) {
        const duplicate = next.some(
          (task) =>
            task.actor_id === candidate.actorId &&
            task.task_type === "investigate" &&
            task.state !== "done" &&
            task.target_cell[0] === target[0] &&
            task.target_cell[1] === target[1],
        );
        if (duplicate) continue;
        next.push({
          id: `task_investigate_${this.tick}_${candidate.actorId}_${target[0]}_${target[1]}_${next.length}`,
          actor_id: candidate.actorId,
          task_type: sourceKind === "fire" ? "report" : "investigate",
          source_kind: sourceKind,
          target_cell: cloneCell(target),
          origin_cell: cloneCell(origin),
          priority,
          state: "queued",
          created_at_tick: this.tick,
          expires_at_tick: this.tick + 180,
        });
        added += 1;
      }
      return { ...delta, npc_tasks: compactNpcTaskHistory(next) };
    });
    return added;
  }

  private appendSimulationWorldFact(
    actionType: string,
    detail: {
      actorId?: string;
      targetId?: string;
      cells?: [number, number][];
      mapId?: string;
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
      consequences?: Record<string, unknown>;
    },
  ): void {
    const facts = [
      ...(this.save.world_facts || []),
      {
        id: `fact_${actionType}_${this.tick}_${this.save.world_facts?.length || 0}`,
        tick: this.tick,
        map_id: detail.mapId || this.activeMap.id,
        cells: detail.cells,
        actor_id: detail.actorId,
        target_id: detail.targetId,
        action_type: actionType,
        previous_state: detail.previousState,
        new_state: detail.newState,
        direct_consequences: detail.consequences,
      },
    ].slice(-500);
    this.save = { ...this.save, world_facts: facts };
  }

  private interactionRangeForTask(task: SimulationNpcTaskRecord): number {
    // One macro tile of reach regardless of task type (authored in macro).
    void task;
    return this.scaleMacroDistanceToFine(1);
  }

  private findNpcTaskStepToward(actorId: string, target: [number, number]): [number, number] | undefined {
    const actor = this.getEntity(actorId);
    if (!actor) return undefined;
    const searched = this.findBoundedPathStep(
      actorId,
      [actor.x, actor.y],
      (cell) => Math.abs(cell[0] - target[0]) + Math.abs(cell[1] - target[1]) <= this.scaleMacroDistanceToFine(1),
      target,
    );
    if (searched) return searched;
    const candidates: [number, number][] = [];
    const dx = Math.sign(target[0] - actor.x);
    const dy = Math.sign(target[1] - actor.y);
    if (Math.abs(target[0] - actor.x) >= Math.abs(target[1] - actor.y)) {
      if (dx) candidates.push([actor.x + dx, actor.y]);
      if (dy) candidates.push([actor.x, actor.y + dy]);
    } else {
      if (dy) candidates.push([actor.x, actor.y + dy]);
      if (dx) candidates.push([actor.x + dx, actor.y]);
    }
    for (const cell of candidates) {
      if (this.canMoveEntity(actorId, cell[0], cell[1]).ok) return cell;
    }
    return undefined;
  }

  private nextInvestigationSearchTarget(
    task: SimulationNpcTaskRecord,
  ): { target: [number, number]; step: number } | undefined {
    if (task.task_type !== "investigate") return undefined;
    const step = Math.max(0, Math.floor(task.search_step || 0));
    const steps = Math.max(0, Math.floor(task.search_steps || 0));
    if (step >= steps) return undefined;
    const origin = task.search_origin_cell || task.target_cell || task.origin_cell!;
    const distance = this.scaleMacroDistanceToFine(1);
    const offsets: [number, number][] = [
      [distance, 0],
      [0, distance],
      [-distance, 0],
      [0, -distance],
      [distance, distance],
      [-distance, distance],
      [-distance, -distance],
      [distance, -distance],
    ];
    for (let offsetIndex = 0; offsetIndex < offsets.length; offsetIndex += 1) {
      const offset = offsets[(step + offsetIndex) % offsets.length];
      const candidate: [number, number] = [
        origin[0] + offset[0],
        origin[1] + offset[1],
      ];
      const cell = this.getActiveCell(candidate[0], candidate[1]);
      if (
        cell?.walkable &&
        !this.cellObjectBlocks(cell) &&
        !this.containerBlocks(candidate[0], candidate[1]) &&
        !this.placementBlocks(candidate[0], candidate[1])
      ) {
        return { target: candidate, step: step + 1 };
      }
    }
    return { target: cloneCell(origin), step: step + 1 };
  }

  private findFleeStep(actorId: string, danger: [number, number]): [number, number] | undefined {
    const actor = this.getEntity(actorId);
    if (!actor) return undefined;
    const candidates = [
      [actor.x + 1, actor.y],
      [actor.x - 1, actor.y],
      [actor.x, actor.y + 1],
      [actor.x, actor.y - 1],
    ] as [number, number][];
    return candidates
      .filter((cell) => this.canMoveEntity(actorId, cell[0], cell[1]).ok)
      .sort((a, b) => {
        const da = Math.abs(a[0] - danger[0]) + Math.abs(a[1] - danger[1]);
        const db = Math.abs(b[0] - danger[0]) + Math.abs(b[1] - danger[1]);
        return db - da || a[0] - b[0] || a[1] - b[1];
      })[0];
  }

  private getContainerAtCell(cell: [number, number]): ContainerRef | undefined {
    const placement = (this.activeMap.container_placements || []).find(
      (container) => container.cell[0] === cell[0] && container.cell[1] === cell[1],
    );
    return placement ? this.getContainer(placement.id) : undefined;
  }

  private restockContainerAtCell(actorId: string, cell: [number, number]): number {
    const container = this.getContainerAtCell(cell);
    if (!container) return 0;
    const placement = this.getContainerPlacement(container.id);
    if (!placement) return 0;
    const state = this.getContainerRuntimeState(placement);
    const authored = placement.items[0];
    const fallbackItem = authored?.item_id || this.options.gamePackage.items[0]?.id;
    if (!fallbackItem) return 0;
    const desired = Math.max(1, authored?.count || 1);
    const existingIndex = state.items.findIndex((entry) => entry.item_id === fallbackItem);
    const current = existingIndex >= 0 ? state.items[existingIndex].count : 0;
    if (current >= desired) return 0;
    const items =
      existingIndex >= 0
        ? state.items.map((entry, index) =>
            index === existingIndex ? { ...entry, count: desired } : entry,
          )
        : [...state.items, { item_id: fallbackItem, count: desired }];
    this.updateContainerState(container.id, { items, opened: state.opened, locked: state.locked });
    this.appendSimulationWorldFact("npc_container_restocked", {
      actorId,
      targetId: container.id,
      cells: [cell],
      consequences: { item_id: fallbackItem, count: desired - current },
    });
    return desired - current;
  }

  private completeNpcTask(task: SimulationNpcTaskRecord): { result: string; cleaned?: number; repaired?: number; restocked?: number; reports?: number; memory?: number; failed?: boolean } {
    const cell = cloneCell(task.target_cell);
    if (task.task_type === "cleanup") {
      const surface = this.getSurfaceLayersAt(cell[0], cell[1]);
      if (!surface) return { result: "no_surface", failed: true };
      const cleaned = this.cleanSurface(surface, task.actor_id).removed;
      return { result: "cleaned_surface", cleaned, memory: 1 };
    }
    if (task.task_type === "repair") {
      this.updateMapDelta((delta) =>
        recordSimulationCondition(delta, {
          target_kind: "cell",
          target_id: `cell:${this.activeMap.id}:${cell[0]}:${cell[1]}`,
          state: "repaired",
          integrity: 1,
          condition_tags: ["npc_repaired"],
          cell,
          last_action: "npc_repair",
          updated_at_tick: this.tick,
        }),
      );
      this.appendSimulationWorldFact("npc_repaired_cell", {
        actorId: task.actor_id,
        targetId: `cell:${this.activeMap.id}:${cell[0]}:${cell[1]}`,
        cells: [cell],
      });
      return { result: "repaired_cell", repaired: 1, memory: 1 };
    }
    if (task.task_type === "restock") {
      const restocked = this.restockContainerAtCell(task.actor_id, cell);
      return restocked > 0
        ? { result: "restocked_container", restocked, memory: 1 }
        : { result: "nothing_to_restock", failed: true };
    }
    if (task.task_type === "report") {
      this.appendSimulationWorldFact("npc_reported_disturbance", {
        actorId: task.actor_id,
        targetId: task.source_kind,
        cells: [cell],
        consequences: { task_id: task.id, source_kind: task.source_kind },
      });
      return { result: "reported_disturbance", reports: 1, memory: 1 };
    }
    if (task.task_type === "investigate") {
      this.appendSimulationWorldFact("npc_investigated_disturbance", {
        actorId: task.actor_id,
        targetId: task.source_kind,
        cells: [cell],
        consequences: { task_id: task.id, source_kind: task.source_kind },
      });
      return { result: "investigated_disturbance", memory: 1 };
    }
    if (task.task_type === "flee") {
      this.appendSimulationWorldFact("npc_fled_danger", {
        actorId: task.actor_id,
        targetId: task.source_kind,
        cells: [cell],
        consequences: { task_id: task.id },
      });
      return { result: "fled_danger", memory: 1 };
    }
    this.appendSimulationWorldFact("npc_task_completed", {
      actorId: task.actor_id,
      targetId: task.task_type,
      cells: [cell],
      consequences: { task_id: task.id },
    });
    return { result: "completed_task", memory: 1 };
  }

  advanceNpcTasks(ticks: number): NpcTaskAdvanceOutcome {
    const elapsed = Math.max(1, Math.floor(ticks));
    const nextTick = this.tick + elapsed;
    const delta = this.getMapDelta() || {};
    const tasks = [...(delta.npc_tasks || [])];
    const outcome: NpcTaskAdvanceOutcome = {
      // Schedules are stateless tier-5 arbiter inputs in normal Play Mode.
      // npc_tasks now owns only authored/systemic reactive work.
      queued: 0,
      activated: 0,
      moved: 0,
      completed: 0,
      failed: 0,
      cleaned: 0,
      repaired: 0,
      restocked: 0,
      reports: 0,
      memory_records: 0,
    };
    const actedActors = new Set<string>();

    const nextTasks = tasks.map((task) => {
      if (task.state === "done" || task.state === "failed") return task;
      if (actedActors.has(task.actor_id)) return task;
      const actor = this.getEntity(task.actor_id);
      if (!actor) {
        outcome.failed += 1;
        actedActors.add(task.actor_id);
        return { ...task, state: "failed" as const, result: "actor_missing", updated_at_tick: nextTick, completed_at_tick: nextTick };
      }
      if (task.expires_at_tick && task.expires_at_tick <= nextTick) {
        outcome.failed += 1;
        actedActors.add(task.actor_id);
        return { ...task, state: "failed" as const, result: "expired", updated_at_tick: nextTick, completed_at_tick: nextTick };
      }

      const activeTask = task.state === "queued"
        ? { ...task, state: "active" as const, updated_at_tick: nextTick }
        : { ...task, updated_at_tick: nextTick };
      if (task.state === "queued") outcome.activated += 1;

      const target = activeTask.target_cell;
      const distance = Math.abs(actor.x - target[0]) + Math.abs(actor.y - target[1]);
      const range = this.interactionRangeForTask(activeTask);
      if (distance > range) {
        const step = activeTask.task_type === "flee"
          ? this.findFleeStep(activeTask.actor_id, activeTask.origin_cell || activeTask.target_cell)
          : this.findNpcTaskStepToward(activeTask.actor_id, target);
        if (step) {
          this.moveEntity(activeTask.actor_id, step[0], step[1]);
          outcome.moved += 1;
          actedActors.add(activeTask.actor_id);
          return {
            ...activeTask,
            progress_ticks: (activeTask.progress_ticks || 0) + elapsed,
            last_cell: cloneCell(step),
          };
        }
        outcome.failed += 1;
        actedActors.add(activeTask.actor_id);
        return { ...activeTask, state: "failed" as const, result: "path_blocked", completed_at_tick: nextTick };
      }

      const searchTarget = this.nextInvestigationSearchTarget(activeTask);
      if (searchTarget) {
        actedActors.add(activeTask.actor_id);
        return {
          ...activeTask,
          target_cell: searchTarget.target,
          search_origin_cell:
            activeTask.search_origin_cell ||
            cloneCell(activeTask.target_cell),
          search_step: searchTarget.step,
          progress_ticks: (activeTask.progress_ticks || 0) + elapsed,
          result: "searching_local_area",
        };
      }

      const completed = this.completeNpcTask(activeTask);
      if (completed.failed) {
        outcome.failed += 1;
      } else {
        outcome.completed += 1;
      }
      outcome.cleaned += completed.cleaned || 0;
      outcome.repaired += completed.repaired || 0;
      outcome.restocked += completed.restocked || 0;
      outcome.reports += completed.reports || 0;
      outcome.memory_records += completed.memory || 0;
      actedActors.add(activeTask.actor_id);
      return {
        ...activeTask,
        state: completed.failed ? "failed" as const : "done" as const,
        progress_ticks: (activeTask.progress_ticks || 0) + elapsed,
        result: completed.result,
        completed_at_tick: nextTick,
      };
    });

    this.updateMapDelta((current) => ({
      ...current,
      npc_tasks: compactNpcTaskHistory(nextTasks),
    }));
    return outcome;
  }

  private hasInventoryStacks(stacks: { item_id: string; count: number }[] = []): boolean {
    return stacks.every((stack) => this.hasItem(stack.item_id, stack.count));
  }

  private consumeInventoryStacks(stacks: { item_id: string; count: number }[] = []): void {
    for (const stack of stacks) this.removeItem(stack.item_id, stack.count);
  }

  private appendProducedDrop(cell: [number, number], itemId: string, count: number, source: string): void {
    this.updateMapDelta((delta) => ({
      ...delta,
      dropped_items: [
        ...(delta.dropped_items || []),
        {
          id: `drop_process_${this.tick}_${source}_${itemId}_${delta.dropped_items?.length || 0}`,
          item_id: itemId,
          cell: cloneCell(cell),
          count,
        },
      ],
    }));
  }

  private simulationStockKey(shopId: string, itemId: string): string {
    return `${shopId}:${itemId}`;
  }

  private getSimulationShopStock(shopId: string, itemId: string): SimulationEconomyStockRecord | undefined {
    return this.save.simulation_economy?.shop_stock?.[this.simulationStockKey(shopId, itemId)];
  }

  private adjustSimulationShopStock(
    shopId: string,
    itemId: string,
    delta: number,
    shortageThreshold = 1,
    shortagePriceDelta = 0,
  ): SimulationEconomyStockRecord {
    const key = this.simulationStockKey(shopId, itemId);
    const previous = this.save.simulation_economy?.shop_stock?.[key];
    const stock = Math.max(0, (previous?.stock || 0) + delta);
    const threshold = shortageThreshold || previous?.shortage_threshold || 1;
    const priceDelta = shortagePriceDelta || previous?.price_delta_when_short || previous?.price_modifier || 0;
    const shortage = stock < threshold;
    const record: SimulationEconomyStockRecord = {
      shop_id: shopId,
      item_id: itemId,
      produced: (previous?.produced || 0) + Math.max(0, delta),
      consumed: (previous?.consumed || 0) + Math.max(0, -delta),
      stock,
      shortage,
      shortage_threshold: threshold,
      price_modifier: shortage ? priceDelta : 0,
      price_delta_when_short: priceDelta,
      updated_at_tick: this.tick,
    };
    this.save = {
      ...this.save,
      simulation_economy: {
        ...(this.save.simulation_economy || {}),
        shop_stock: {
          ...(this.save.simulation_economy?.shop_stock || {}),
          [key]: record,
        },
      },
    };
    return record;
  }

  private getProcessDefinition(options: SimulationProcessStartOptions): SimulationProcessDefinitionData | undefined {
    return (this.options.gamePackage.simulation_processes || []).find(
      (definition) =>
        (options.processId && definition.id === options.processId) ||
        (!options.processId && options.processType && definition.process_type === options.processType),
    );
  }

  private getWorkstation(workstationId: string | undefined): SimulationWorkstationData | undefined {
    if (!workstationId) return undefined;
    return (this.options.gamePackage.simulation_workstations || []).find((station) => station.id === workstationId);
  }

  private materializeProcessOptions(options: SimulationProcessStartOptions): SimulationProcessStartOptions & {
    definition?: SimulationProcessDefinitionData;
    stockItemId?: string;
  } {
    const definition = this.getProcessDefinition(options);
    return {
      processId: options.processId || definition?.id,
      processType: options.processType || definition?.process_type || "crafting",
      cell: cloneCell(options.cell),
      workstationId: options.workstationId || definition?.workstation_id,
      shopId: options.shopId || definition?.economy?.shop_id,
      actorIds: options.actorIds?.length ? [...options.actorIds] : undefined,
      requiredTicks: options.requiredTicks || definition?.required_ticks || 1,
      inputItems: options.inputItems?.length ? options.inputItems : definition?.input_items || [],
      outputItems: options.outputItems?.length ? options.outputItems : definition?.output_items || [],
      wasteItems: options.wasteItems?.length ? options.wasteItems : definition?.waste_items || [],
      emits: options.emits || definition?.emits,
      definition,
      stockItemId: definition?.economy?.stock_item_id || definition?.output_items?.[0]?.item_id,
    };
  }

  private activeProcessRecords(): SimulationProcessRecord[] {
    return (this.getMapDelta()?.simulation_processes || []).filter(
      (process) => process.state === "active" || process.state === "queued",
    );
  }

  canStartSimulationProcess(options: SimulationProcessStartOptions): ValidationResult {
    const materialized = this.materializeProcessOptions(options);
    if (!materialized.processType) return { ok: false, reason: "no process" };
    if (!this.getActiveCell(materialized.cell[0], materialized.cell[1])) return { ok: false, reason: "no cell" };
    if (!Number.isFinite(materialized.requiredTicks) || materialized.requiredTicks <= 0) {
      return { ok: false, reason: "bad ticks" };
    }
    const workstation = this.getWorkstation(materialized.workstationId);
    if (materialized.workstationId && !workstation) return { ok: false, reason: "no workstation" };
    if (workstation) {
      if (workstation.map_id !== this.activeMap.id) return { ok: false, reason: "wrong map" };
      if (workstation.cell[0] !== materialized.cell[0] || workstation.cell[1] !== materialized.cell[1]) {
        return { ok: false, reason: "wrong workstation cell" };
      }
      if (materialized.processId && workstation.process_ids.length && !workstation.process_ids.includes(materialized.processId)) {
        return { ok: false, reason: "unsupported workstation process" };
      }
    }
    const active = this.activeProcessRecords();
    if (materialized.workstationId && active.some((process) => process.workstation_id === materialized.workstationId)) {
      return { ok: false, reason: "workstation occupied" };
    }
    const actorIds = new Set(materialized.actorIds || []);
    if (actorIds.size && active.some((process) => (process.actor_ids || []).some((actorId) => actorIds.has(actorId)))) {
      return { ok: false, reason: "actor occupied" };
    }
    if (!this.hasInventoryStacks(materialized.inputItems || [])) return { ok: false, reason: "missing input" };
    return { ok: true };
  }

  startSimulationProcess(options: SimulationProcessStartOptions): SimulationProcessOutcome {
    const materialized = this.materializeProcessOptions(options);
    this.consumeInventoryStacks(materialized.inputItems || []);
    const processSequence = Math.max(
      Number(this.save.flags?.simulation_process_sequence || 0),
      this.getMapDelta()?.simulation_processes?.length || 0,
    ) + 1;
    this.save = {
      ...this.save,
      flags: {
        ...(this.save.flags || {}),
        simulation_process_sequence: processSequence,
      },
    };
    let processId = "";
    this.updateMapDelta((delta) => {
      const current = delta.simulation_processes || [];
      processId = `proc_${materialized.processType}_${this.tick}_${processSequence}`;
      const record: SimulationProcessRecord = {
        id: processId,
        process_def_id: materialized.processId,
        process_type: materialized.processType,
        workstation_id: materialized.workstationId,
        shop_id: materialized.shopId,
        stock_item_id: materialized.stockItemId,
        actor_ids: materialized.actorIds?.length ? [...materialized.actorIds] : undefined,
        cell: cloneCell(materialized.cell),
        state: "active",
        progress_ticks: 0,
        required_ticks: Math.max(1, Math.floor(materialized.requiredTicks)),
        input_items: materialized.inputItems?.map((entry) => ({ ...entry })),
        output_items: materialized.outputItems?.map((entry) => ({ ...entry })),
        waste_items: materialized.wasteItems?.map((entry) => ({ ...entry })),
        emits: materialized.emits ? { ...materialized.emits } : undefined,
        created_at_tick: this.tick,
        updated_at_tick: this.tick,
      };
      return {
        ...delta,
        simulation_processes: compactSimulationProcessHistory([
          ...current,
          record,
        ]),
      };
    });
    this.appendSimulationWorldFact("simulation_process_started", {
      actorId: materialized.actorIds?.[0],
      targetId: processId,
      cells: [materialized.cell],
      consequences: {
        process_def_id: materialized.processId,
        process_type: materialized.processType,
        input_items: materialized.inputItems || [],
        output_items: materialized.outputItems || [],
      },
    });
    return { started: processId, activated: 1, advanced: 0, completed: 0, failed: 0, outputs: 0, waste: 0, emissions: 0, interrupted: 0, economy_updates: 0 };
  }

  advanceSimulationProcesses(ticks: number): SimulationProcessOutcome {
    const elapsed = Math.max(1, Math.floor(ticks));
    const nextTick = this.tick + elapsed;
    const delta = this.getMapDelta() || {};
    const outcome: SimulationProcessOutcome = {
      activated: 0,
      advanced: 0,
      completed: 0,
      failed: 0,
      outputs: 0,
      waste: 0,
      emissions: 0,
      interrupted: 0,
      economy_updates: 0,
    };
    const nextProcesses = (delta.simulation_processes || []).map((process) => {
      if (process.state === "complete" || process.state === "failed") return process;
      const definition = (this.options.gamePackage.simulation_processes || []).find(
        (candidate) => candidate.id === process.process_def_id,
      );
      if (definition?.failure?.interrupted_by_actor_missing && (process.actor_ids || []).some((actorId) => !this.getEntity(actorId))) {
        outcome.failed += 1;
        outcome.interrupted += 1;
        this.appendSimulationWorldFact("simulation_process_failed", {
          actorId: process.actor_ids?.[0],
          targetId: process.id,
          cells: [process.cell],
          consequences: { reason: "actor_missing", process_type: process.process_type },
        });
        return { ...process, state: "failed" as const, result: "actor_missing", updated_at_tick: nextTick, completed_at_tick: nextTick };
      }
      if (definition?.failure?.interrupted_by_fire && this.activeEnvironmentFieldsAt(process.cell).some((field) => field.kind === "fire")) {
        outcome.failed += 1;
        outcome.interrupted += 1;
        this.appendSimulationWorldFact("simulation_process_failed", {
          actorId: process.actor_ids?.[0],
          targetId: process.id,
          cells: [process.cell],
          consequences: { reason: "fire_interruption", process_type: process.process_type },
        });
        return { ...process, state: "failed" as const, result: "fire_interruption", updated_at_tick: nextTick, completed_at_tick: nextTick };
      }
      const active = process.state === "queued"
        ? { ...process, state: "active" as const, updated_at_tick: nextTick }
        : { ...process, updated_at_tick: nextTick };
      if (process.state === "queued") outcome.activated += 1;
      const progress = Math.min(active.required_ticks, (active.progress_ticks || 0) + elapsed);
      outcome.advanced += 1;
      if (progress < active.required_ticks) return { ...active, progress_ticks: progress };

      for (const stack of active.output_items || []) {
        this.appendProducedDrop(active.cell, stack.item_id, stack.count, active.id);
        outcome.outputs += stack.count;
      }
      for (const stack of active.waste_items || []) {
        this.appendProducedDrop(active.cell, stack.item_id, stack.count, `${active.id}_waste`);
        outcome.waste += stack.count;
      }
      if (active.emits?.sound) {
        this.emitSoundAt(active.cell, active.emits.sound, active.process_type, active.actor_ids?.[0], "metal");
        outcome.emissions += 1;
      }
      if (active.emits?.heat) {
        this.appendEnvironmentField(active.cell, {
          kind: "heat",
          intensity: Math.max(0.05, Math.min(1, active.emits.heat)),
          source: "runtime",
          tag: active.process_type,
          actor_id: active.actor_ids?.[0],
          action: "process_heat",
          origin_cell: cloneCell(active.cell),
          decay_per_tick: 0.04,
          expires_at_tick: nextTick + 60,
        });
        outcome.emissions += 1;
      }
      const shopId = active.shop_id || definition?.economy?.shop_id;
      const stockItemId = active.stock_item_id || definition?.economy?.stock_item_id || active.output_items?.[0]?.item_id;
      if (shopId && stockItemId) {
        const producedCount =
          definition?.economy?.stock_delta ||
          (active.output_items || [])
            .filter((stack) => stack.item_id === stockItemId)
            .reduce((sum, stack) => sum + stack.count, 0);
        this.adjustSimulationShopStock(
          shopId,
          stockItemId,
          producedCount,
          definition?.economy?.shortage_threshold ?? 1,
          definition?.economy?.price_delta_when_short ?? 0,
        );
        outcome.economy_updates += 1;
      }
      this.appendSimulationWorldFact("simulation_process_completed", {
        actorId: active.actor_ids?.[0],
        targetId: active.id,
        cells: [active.cell],
        consequences: {
          process_type: active.process_type,
          output_items: active.output_items || [],
          waste_items: active.waste_items || [],
        },
      });
      outcome.completed += 1;
      return {
        ...active,
        state: "complete" as const,
        progress_ticks: progress,
        completed_at_tick: nextTick,
        result: "completed_process",
      };
    });
    this.updateMapDelta((current) => ({ ...current, simulation_processes: nextProcesses }));
    return outcome;
  }

  interruptSimulationProcess(processId: string, reason = "interrupted"): SimulationProcessOutcome {
    let interrupted = 0;
    this.updateMapDelta((delta) => ({
      ...delta,
      simulation_processes: (delta.simulation_processes || []).map((process) => {
        if (process.id !== processId || process.state === "complete" || process.state === "failed") return process;
        interrupted += 1;
        this.appendSimulationWorldFact("simulation_process_failed", {
          actorId: process.actor_ids?.[0],
          targetId: process.id,
          cells: [process.cell],
          consequences: { reason, process_type: process.process_type },
        });
        return {
          ...process,
          state: "failed",
          result: reason,
          updated_at_tick: this.tick,
          completed_at_tick: this.tick,
        };
      }),
    }));
    return {
      activated: 0,
      advanced: 0,
      completed: 0,
      failed: interrupted,
      outputs: 0,
      waste: 0,
      emissions: 0,
      interrupted,
      economy_updates: 0,
    };
  }

  private regionalEffectiveTicks(resolution: SimulationRegionalStateRecord["resolution"], elapsed: number): number {
    if (resolution === "nearby") return elapsed;
    if (resolution === "aggregate") return Math.max(1, Math.floor(elapsed / 2));
    if (resolution === "dormant") return Math.max(0, Math.floor(elapsed / 8));
    return elapsed;
  }

  private mapCellByKey(map: MapData): Map<string, CellData> {
    return new Map((map.cells || []).map((cell) => [`${cell.x}:${cell.z}`, cell]));
  }

  private regionCellsForMap(map: MapData): Map<string, CellData[]> {
    const regions = new Map<string, CellData[]>();
    for (const cell of map.cells || []) {
      const regionId = cell.region_id || cell.room_id || "map";
      regions.set(regionId, [...(regions.get(regionId) || []), cell]);
    }
    return regions;
  }

  private advanceRegionalEnvironmentFields(
    map: MapData,
    delta: MapDelta,
    resolution: SimulationRegionalStateRecord["resolution"],
    effectiveTicks: number,
    nextTick: number,
  ): { delta: MapDelta; aged: number; removed: number; spread: number } {
    if (effectiveTicks <= 0) return { delta, aged: 0, removed: 0, spread: 0 };
    const cellByKey = this.mapCellByKey(map);
    let aged = 0;
    let removed = 0;
    let spread = 0;
    const nextFields = Object.entries(delta.environment_fields || {}).reduce<Record<string, SimulationEnvironmentFieldRecord[]>>(
      (acc, [key, fields]) => {
        const kept = fields
          .map((field) => {
            const baseDecay = field.decay_per_tick ?? (field.kind === "sound" ? 0.25 : field.kind === "smoke" ? 0.02 : 0.005);
            const tierDecay = resolution === "aggregate" ? baseDecay * 0.6 : resolution === "dormant" ? baseDecay * 0.25 : baseDecay;
            return {
              ...field,
              age_ticks: Math.max(field.age_ticks || 0, nextTick - field.created_at_tick),
              intensity: Math.max(0, field.intensity - tierDecay * effectiveTicks),
            };
          })
          .filter((field) => {
            const keep = field.intensity > 0.03 && (!field.expires_at_tick || field.expires_at_tick > nextTick);
            if (keep) aged += 1;
            else removed += 1;
            return keep;
          });
        if (kept.length) acc[key] = kept;
        return acc;
      },
      {},
    );

    if (resolution === "nearby") {
      for (const [key, fields] of Object.entries(nextFields)) {
        const fire = fields.find((field) => field.kind === "fire");
        if (!fire) continue;
        const [x, y] = key.split(":").map(Number);
        for (const target of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
          const targetKey = `${target[0]}:${target[1]}`;
          const targetCell = cellByKey.get(targetKey);
          if (!targetCell || (nextFields[targetKey] || []).some((field) => field.kind === "fire")) continue;
          if (this.materialFlammabilityForCell(targetCell) < 0.7) continue;
          nextFields[targetKey] = [
            ...(nextFields[targetKey] || []),
            {
              id: `env_regional_fire_${nextTick}_${target[0]}_${target[1]}`,
              kind: "fire",
              intensity: Math.max(0.25, fire.intensity * 0.65),
              age_ticks: 0,
              source: "propagation",
              tag: "regional_fire_spread",
              actor_id: fire.actor_id,
              action: "regional_fire_spread",
              origin_cell: [x, y],
              radius: 1,
              damage_per_tick: fire.damage_per_tick,
              decay_per_tick: 0.01,
              created_at_tick: nextTick,
              expires_at_tick: nextTick + 120,
            },
          ];
          spread += 1;
        }
      }
    }

    return { delta: { ...delta, environment_fields: nextFields }, aged, removed, spread };
  }

  private advanceRegionalProcesses(
    mapId: string,
    delta: MapDelta,
    resolution: SimulationRegionalStateRecord["resolution"],
    effectiveTicks: number,
    nextTick: number,
  ): { delta: MapDelta; advanced: number; completed: number; outputs: number; waste: number; economy: number } {
    if (effectiveTicks <= 0) return { delta, advanced: 0, completed: 0, outputs: 0, waste: 0, economy: 0 };
    let advanced = 0;
    let completed = 0;
    let outputs = 0;
    let waste = 0;
    let economy = 0;
    const droppedItems = [...(delta.dropped_items || [])];
    const nextProcesses = (delta.simulation_processes || []).map((process) => {
      if (process.state === "complete" || process.state === "failed") return process;
      const active = process.state === "queued"
        ? { ...process, state: "active" as const, updated_at_tick: nextTick }
        : { ...process, updated_at_tick: nextTick };
      const progress = Math.min(active.required_ticks, (active.progress_ticks || 0) + effectiveTicks);
      advanced += 1;
      if (progress < active.required_ticks) return { ...active, progress_ticks: progress };

      const definition = (this.options.gamePackage.simulation_processes || []).find(
        (candidate) => candidate.id === active.process_def_id,
      );
      for (const stack of active.output_items || []) {
        droppedItems.push({
          id: `drop_process_${nextTick}_${active.id}_${stack.item_id}_${droppedItems.length}`,
          item_id: stack.item_id,
          cell: cloneCell(active.cell),
          count: stack.count,
        });
        outputs += stack.count;
      }
      for (const stack of active.waste_items || []) {
        droppedItems.push({
          id: `drop_process_${nextTick}_${active.id}_waste_${stack.item_id}_${droppedItems.length}`,
          item_id: stack.item_id,
          cell: cloneCell(active.cell),
          count: stack.count,
        });
        waste += stack.count;
      }
      const shopId = active.shop_id || definition?.economy?.shop_id;
      const stockItemId = active.stock_item_id || definition?.economy?.stock_item_id || active.output_items?.[0]?.item_id;
      if (shopId && stockItemId) {
        const producedCount =
          definition?.economy?.stock_delta ||
          (active.output_items || [])
            .filter((stack) => stack.item_id === stockItemId)
            .reduce((sum, stack) => sum + stack.count, 0);
        this.adjustSimulationShopStock(
          shopId,
          stockItemId,
          producedCount,
          definition?.economy?.shortage_threshold ?? 1,
          definition?.economy?.price_delta_when_short ?? 0,
        );
        economy += 1;
      }
      this.appendSimulationWorldFact("simulation_process_completed", {
        actorId: active.actor_ids?.[0],
        targetId: active.id,
        mapId,
        cells: [active.cell],
        consequences: {
          process_type: active.process_type,
          resolution,
          output_items: active.output_items || [],
          waste_items: active.waste_items || [],
        },
      });
      completed += 1;
      return {
        ...active,
        state: "complete" as const,
        progress_ticks: progress,
        completed_at_tick: nextTick,
        result: `completed_${resolution}_regional_process`,
      };
    });
    return { delta: { ...delta, dropped_items: droppedItems, simulation_processes: nextProcesses }, advanced, completed, outputs, waste, economy };
  }

  private advanceRegionalNpcTasks(
    mapId: string,
    delta: MapDelta,
    resolution: SimulationRegionalStateRecord["resolution"],
    effectiveTicks: number,
    nextTick: number,
  ): { delta: MapDelta; advanced: number; completed: number; cleaned: number; repaired: number; restocked: number } {
    if (effectiveTicks <= 0) return { delta, advanced: 0, completed: 0, cleaned: 0, repaired: 0, restocked: 0 };
    let advanced = 0;
    let completed = 0;
    let cleaned = 0;
    let repaired = 0;
    let restocked = 0;
    const completionTicks = resolution === "nearby" ? 2 : 6;
    let nextSurfaceLayers = { ...(delta.surface_layers || {}) };
    let nextConditions = { ...(delta.simulation_conditions || {}) };
    const nextTasks = (delta.npc_tasks || []).map((task) => {
      if (task.state === "done" || task.state === "failed") return task;
      const progress = (task.progress_ticks || 0) + effectiveTicks;
      advanced += 1;
      if (task.expires_at_tick && task.expires_at_tick <= nextTick) {
        return { ...task, state: "failed" as const, result: "expired", progress_ticks: progress, updated_at_tick: nextTick, completed_at_tick: nextTick };
      }
      if (progress < completionTicks) {
        return {
          ...task,
          state: task.state === "queued" ? "active" as const : task.state,
          progress_ticks: progress,
          updated_at_tick: nextTick,
        };
      }
      const key = `${task.target_cell[0]}:${task.target_cell[1]}`;
      if (task.task_type === "cleanup" && nextSurfaceLayers[key]?.length) {
        delete nextSurfaceLayers[key];
        cleaned += 1;
      }
      if (task.task_type === "repair") {
        const targetId = `cell:${mapId}:${task.target_cell[0]}:${task.target_cell[1]}`;
        nextConditions = {
          ...nextConditions,
          [targetId]: {
            target_kind: "cell",
            target_id: targetId,
            state: "repaired",
            integrity: 1,
            condition_tags: ["regional_repair"],
            cell: cloneCell(task.target_cell),
            last_action: "regional_repair",
            updated_at_tick: nextTick,
          },
        };
        repaired += 1;
      }
      if (task.task_type === "restock") restocked += 1;
      this.appendSimulationWorldFact("npc_task_completed", {
        actorId: task.actor_id,
        targetId: task.task_type,
        mapId,
        cells: [task.target_cell],
        consequences: { task_id: task.id, resolution, source_kind: task.source_kind },
      });
      completed += 1;
      return {
        ...task,
        state: "done" as const,
        progress_ticks: progress,
        result: `completed_${resolution}_regional_task`,
        updated_at_tick: nextTick,
        completed_at_tick: nextTick,
      };
    });
    return {
      delta: { ...delta, surface_layers: nextSurfaceLayers, simulation_conditions: nextConditions, npc_tasks: nextTasks },
      advanced,
      completed,
      cleaned,
      repaired,
      restocked,
    };
  }

  private reconcileRegionalFields(
    mapId: string,
    delta: MapDelta,
    regionId: string,
    cells: CellData[],
    previous: SimulationRegionalStateRecord | undefined,
    resolution: SimulationRegionalStateRecord["resolution"],
    nextTick: number,
  ): { delta: MapDelta; reconciled: number } {
    if (!previous || previous.resolution === resolution || (resolution !== "exact" && resolution !== "nearby")) {
      return { delta, reconciled: 0 };
    }
    if (previous.resolution !== "aggregate" && previous.resolution !== "dormant") {
      return { delta, reconciled: 0 };
    }
    const anchor = cells[0];
    if (!anchor) return { delta, reconciled: 0 };
    const key = `${anchor.x}:${anchor.z}`;
    const fields = [...(delta.environment_fields?.[key] || [])];
    const additions: SimulationEnvironmentFieldRecord[] = [];
    const maybeAdd = (kind: "fire" | "smoke" | "sound", intensity: number) => {
      if (intensity <= 0.03 || fields.some((field) => field.kind === kind)) return;
      additions.push({
        id: `env_reconciled_${kind}_${nextTick}_${mapId}_${regionId}`,
        kind,
        intensity: Math.min(1, intensity),
        age_ticks: 0,
        source: "runtime",
        tag: "regional_reconciliation",
        action: "regional_reconciliation",
        origin_cell: [anchor.x, anchor.z],
        radius: kind === "sound" ? 4 : 1,
        visibility_modifier: kind === "smoke" ? -0.2 : undefined,
        decay_per_tick: kind === "sound" ? 0.2 : kind === "smoke" ? 0.02 : 0.01,
        created_at_tick: nextTick,
        expires_at_tick: nextTick + (kind === "sound" ? 12 : 80),
      });
    };
    maybeAdd("fire", previous.fire_intensity);
    maybeAdd("smoke", previous.smoke_intensity);
    maybeAdd("sound", previous.sound_intensity);
    if (!additions.length) return { delta, reconciled: 0 };
    return {
      delta: {
        ...delta,
        environment_fields: {
          ...(delta.environment_fields || {}),
          [key]: [...fields, ...additions],
        },
      },
      reconciled: additions.length,
    };
  }

  advanceSimulationRegions(ticks: number): SimulationProcessOutcome {
    const elapsed = Math.max(1, Math.floor(ticks));
    const nextTick = this.tick + elapsed;
    const currentMap = this.options.gamePackage.maps.find((map) => map.id === this.save.current_map_id) || this.activeMap;
    const nearbyMapIds = new Set((currentMap.exits || []).map((exit) => exit.target_map_id));
    const records: Record<string, SimulationRegionalStateRecord> = {};
    const totals = {
      processesAdvanced: 0,
      processesCompleted: 0,
      outputs: 0,
      waste: 0,
      economy: 0,
      tasksAdvanced: 0,
      tasksCompleted: 0,
      fieldsAged: 0,
      fieldsRemoved: 0,
      fieldsSpread: 0,
      reconciledFields: 0,
    };

    for (const map of this.options.gamePackage.maps || []) {
      let delta = this.getMapDeltaFor(map.id) || {};
      const activeProcesses = (delta.simulation_processes || []).filter(
        (process) => process.state === "active" || process.state === "queued",
      );
      const queuedTasks = (delta.npc_tasks || []).filter(
        (task) => task.state === "active" || task.state === "queued",
      );
      const fields = Object.values(delta.environment_fields || {}).flat();
      const hasActivity = activeProcesses.length > 0 || queuedTasks.length > 0 || fields.length > 0;
      const resolution: SimulationRegionalStateRecord["resolution"] =
        map.id === this.save.current_map_id
          ? "exact"
          : nearbyMapIds.has(map.id)
            ? "nearby"
            : hasActivity
              ? "aggregate"
              : "dormant";

      const effectiveTicks = this.regionalEffectiveTicks(resolution, elapsed);
      if (map.id !== this.save.current_map_id && effectiveTicks > 0) {
        const environment = this.advanceRegionalEnvironmentFields(map, delta, resolution, effectiveTicks, nextTick);
        delta = environment.delta;
        totals.fieldsAged += environment.aged;
        totals.fieldsRemoved += environment.removed;
        totals.fieldsSpread += environment.spread;
        const processes = this.advanceRegionalProcesses(map.id, delta, resolution, effectiveTicks, nextTick);
        delta = processes.delta;
        totals.processesAdvanced += processes.advanced;
        totals.processesCompleted += processes.completed;
        totals.outputs += processes.outputs;
        totals.waste += processes.waste;
        totals.economy += processes.economy;
        const tasks = this.advanceRegionalNpcTasks(map.id, delta, resolution, effectiveTicks, nextTick);
        delta = tasks.delta;
        totals.tasksAdvanced += tasks.advanced;
        totals.tasksCompleted += tasks.completed;
      }

      const regions = this.regionCellsForMap(map);
      for (const [regionId, cells] of regions) {
        const id = `${map.id}:${regionId}`;
        const previous = this.save.simulation_regions?.[id];
        const reconciled = this.reconcileRegionalFields(map.id, delta, regionId, cells, previous, resolution, nextTick);
        delta = reconciled.delta;
        totals.reconciledFields += reconciled.reconciled;
        const regionKeys = new Set(cells.map((cell) => `${cell.x}:${cell.z}`));
        const regionFields = Object.entries(delta.environment_fields || {})
          .filter(([key]) => regionKeys.has(key))
          .flatMap(([, fieldList]) => fieldList);
        const regionProcesses = (delta.simulation_processes || [])
          .filter((process) => (process.state === "active" || process.state === "queued") && regionKeys.has(`${process.cell[0]}:${process.cell[1]}`));
        const regionTasks = (delta.npc_tasks || [])
          .filter((task) => (task.state === "active" || task.state === "queued") && regionKeys.has(`${task.target_cell[0]}:${task.target_cell[1]}`));
        records[id] = {
          id,
          map_id: map.id,
          region_id: regionId,
          resolution,
          cell_count: cells.length,
          active_processes: regionProcesses.length,
          queued_tasks: regionTasks.length,
          environment_fields: regionFields.length,
          fire_intensity: regionFields.filter((field) => field.kind === "fire").reduce((sum, field) => sum + field.intensity, 0),
          smoke_intensity: regionFields.filter((field) => field.kind === "smoke").reduce((sum, field) => sum + field.intensity, 0),
          sound_intensity: regionFields.filter((field) => field.kind === "sound").reduce((sum, field) => sum + field.intensity, 0),
          tier_tick_rate: resolution === "aggregate" ? 0.5 : resolution === "dormant" ? 0.125 : 1,
          advanced_ticks: effectiveTicks,
          completed_processes: totals.processesCompleted,
          completed_tasks: totals.tasksCompleted,
          reconciled_fields: reconciled.reconciled,
          last_promoted_tick: previous?.resolution !== resolution && (resolution === "exact" || resolution === "nearby")
            ? nextTick
            : previous?.last_promoted_tick,
          last_demoted_tick: previous?.resolution !== resolution && (resolution === "aggregate" || resolution === "dormant")
            ? nextTick
            : previous?.last_demoted_tick,
          reconciled_at_tick: reconciled.reconciled > 0 ? nextTick : previous?.reconciled_at_tick,
          updated_at_tick: nextTick,
        };
      }
      this.updateMapDeltaFor(map.id, () => delta);
    }

    this.save = {
      ...this.save,
      simulation_regions: {
        ...(this.save.simulation_regions || {}),
        ...records,
      },
    };
    this.appendSimulationWorldFact("simulation_regions_advanced", {
      consequences: { ticks: elapsed, regions_updated: Object.keys(records).length, ...totals },
    });
    return {
      activated: 0,
      advanced: totals.processesAdvanced + totals.tasksAdvanced + totals.fieldsAged,
      completed: totals.processesCompleted + totals.tasksCompleted,
      failed: 0,
      outputs: totals.outputs,
      waste: totals.waste,
      emissions: totals.fieldsSpread + totals.reconciledFields,
      interrupted: 0,
      economy_updates: totals.economy,
      regions_updated: Object.keys(records).length,
    };
  }

  adaptSimulationSemantics(mapId?: string, actorId = PLAYER_ENTITY_ID): SimulationSemanticAdapterOutcome {
    return {
      map_id: mapId || this.save.current_map_id,
      sources_scanned: 0,
      observations_created: 0,
      claims_created: 0,
      evidence_links_created: 0,
      skipped_existing: 0,
    };
  }

  private applyEnvironmentDamage(fieldsByCell: Record<string, SimulationEnvironmentFieldRecord[]>): number {
    let damaged = 0;
    const applyBurn = (actorId: string, damage: number) => {
      if (actorId === PLAYER_ENTITY_ID) {
        const hp = Math.max(0, (this.save.playerStats.hp || 0) - damage);
        this.save = {
          ...this.save,
          playerStats: { ...this.save.playerStats, hp },
          actor_statuses: {
            ...(this.save.actor_statuses || {}),
            [PLAYER_ENTITY_ID]: applyStatus(this.save.actor_statuses?.[PLAYER_ENTITY_ID], "burn", {
              duration: 2,
              magnitude: Math.max(1, Math.ceil(damage / 2)),
            }),
          },
        };
        damaged += 1;
        return;
      }
      const actor = this.getCombatActor(actorId);
      if (!actor || actor.kind === "player") return;
      const currentState = (this.save.entity_states || {})[actor.id] || {};
      const hp = Math.max(0, actor.hp - damage);
      this.save = {
        ...this.save,
        entity_states: {
          ...(this.save.entity_states || {}),
          [actor.id]: {
            ...currentState,
            hp,
            dead: hp <= 0,
            statuses: applyStatus(currentState.statuses, "burn", {
              duration: 2,
              magnitude: Math.max(1, Math.ceil(damage / 2)),
            }),
          },
        },
      };
      damaged += 1;
    };

    Object.entries(fieldsByCell).forEach(([key, fields]) => {
      const fire = fields.find((field) => field.kind === "fire");
      if (!fire) return;
      const [x, y] = key.split(":").map(Number);
      const damage = Math.max(1, Math.round((fire.damage_per_tick || 5) * Math.max(0.25, fire.intensity)));
      const occupant = this.getEntityAt(x, y);
      if (occupant) applyBurn(occupant.id, damage);
    });
    return damaged;
  }

  private propagateLight(origin: [number, number], intensity: number, radius: number, actorId?: string): number {
    let emitted = 0;
    const propagationRadius = Math.max(1, Math.floor(radius));
    const illuminationRadius = Math.max(6, propagationRadius);
    for (let dx = -propagationRadius; dx <= propagationRadius; dx += 1) {
      for (let dy = -propagationRadius; dy <= propagationRadius; dy += 1) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance > propagationRadius) continue;
        const cell: [number, number] = [origin[0] + dx, origin[1] + dy];
        if (!this.getActiveCell(cell[0], cell[1])) continue;
        const falloff = Math.max(0.05, intensity * (1 - distance / (propagationRadius + 1)));
        this.appendEnvironmentField(cell, {
          kind: "light",
          intensity: falloff,
          source: distance === 0 ? "runtime" : "propagation",
          tag: "firelight",
          actor_id: actorId,
          action: "fire_light",
          origin_cell: cloneCell(origin),
          radius: illuminationRadius,
          color: "#f59e0b",
          decay_per_tick: 0.08,
          expires_at_tick: this.tick + 24,
        });
        emitted += 1;
      }
    }
    return emitted;
  }

  getIgnitableCellAt(x: number, y: number): EnvironmentCellRef | undefined {
    const cell = this.getActiveCell(x, y);
    if (!cell) return undefined;
    if (this.activeEnvironmentFieldsAt([x, y]).some((field) => field.kind === "fire")) return undefined;
    return { cell: [x, y], fieldIds: [], kinds: [], count: 0 };
  }

  igniteCell(ref: EnvironmentCellRef, actorId = PLAYER_ENTITY_ID): { cell: [number, number]; intensity: number } {
    const cell = this.getActiveCell(ref.cell[0], ref.cell[1]);
    const flammability = this.materialFlammabilityForCell(cell);
    const intensity = Math.max(0.45, Math.min(1, 0.55 + flammability * 0.45));
    this.appendEnvironmentField(ref.cell, {
      kind: "fire",
      intensity,
      source: "runtime",
      tag: cell?.surface_tag === "oil" ? "oil_fire" : "open_flame",
      actor_id: actorId,
      action: "ignite",
      origin_cell: cloneCell(ref.cell),
      radius: 1,
      damage_per_tick: Math.round(5 + intensity * 10),
      decay_per_tick: 0.006,
      expires_at_tick: this.tick + 240,
    });
    this.appendEnvironmentField(ref.cell, {
      kind: "smoke",
      intensity: Math.max(0.2, intensity * 0.45),
      source: "runtime",
      tag: "fresh_smoke",
      actor_id: actorId,
      action: "ignite",
      origin_cell: cloneCell(ref.cell),
      radius: 1,
      visibility_modifier: -0.25,
      decay_per_tick: 0.012,
      expires_at_tick: this.tick + 90,
    });
    this.propagateLight(ref.cell, intensity, 3, actorId);
    this.updateMapDelta((delta) =>
      recordSimulationCondition(delta, {
        target_kind: "cell",
        target_id: `cell:${this.activeMap.id}:${ref.cell[0]}:${ref.cell[1]}`,
        material_id: cell?.simulation?.material_id,
        state: "burned",
        integrity: Math.max(0.6, 1 - intensity * 0.25),
        condition_tags: ["ignited", "active_fire"],
        cell: cloneCell(ref.cell),
        last_action: "ignite",
        updated_at_tick: this.tick,
      }),
    );
    return { cell: cloneCell(ref.cell), intensity };
  }

  getFireAt(x: number, y: number): EnvironmentCellRef | undefined {
    const fields = this.activeEnvironmentFieldsAt([x, y]).filter((field) => field.kind === "fire");
    if (!fields.length) return undefined;
    return {
      cell: [x, y],
      fieldIds: fields.map((field) => field.id),
      kinds: ["fire"],
      count: fields.length,
    };
  }

  extinguishFire(ref: EnvironmentCellRef, actorId = PLAYER_ENTITY_ID): { cell: [number, number]; removed: number } {
    const key = this.environmentFieldKey(ref.cell);
    let removed = 0;
    this.updateMapDelta((delta) => {
      const previous = delta.environment_fields?.[key] || [];
      const remaining = previous.filter((field) => {
        const remove = field.kind === "fire" && ref.fieldIds.includes(field.id);
        if (remove) removed += 1;
        return !remove;
      });
      return recordSimulationCondition(
        {
          ...delta,
          environment_fields: {
            ...(delta.environment_fields || {}),
            [key]: [
              ...remaining,
              {
                id: `env_smoke_extinguished_${this.tick}_${ref.cell[0]}_${ref.cell[1]}`,
                kind: "smoke",
                intensity: 0.35,
                age_ticks: 0,
                source: "runtime",
                tag: "doused_smoke",
                actor_id: actorId,
                action: "extinguish",
                origin_cell: cloneCell(ref.cell),
                visibility_modifier: -0.2,
                decay_per_tick: 0.02,
                created_at_tick: this.tick,
                expires_at_tick: this.tick + 60,
              },
            ],
          },
        },
        {
          target_kind: "cell",
          target_id: `cell:${this.activeMap.id}:${ref.cell[0]}:${ref.cell[1]}`,
          state: "wet",
          integrity: 0.95,
          condition_tags: ["extinguished", "smoky"],
          cell: cloneCell(ref.cell),
          last_action: "extinguish",
          updated_at_tick: this.tick,
        },
      );
    });
    return { cell: cloneCell(ref.cell), removed };
  }

  emitSoundAt(
    cell: [number, number],
    loudness: number,
    tag: string,
    actorId = PLAYER_ENTITY_ID,
    materialTag?: string,
    metadata: MechanicalSoundMetadata = {},
  ): { origin: [number, number]; cells: number; loudness: number; tag: string } {
    const tuning = resolveMovementHearingSettings(this.options.gamePackage);
    const soundSequence =
      Math.max(0, Number(this.save.flags?.immersive_sound_sequence || 0)) + 1;
    this.save = {
      ...this.save,
      flags: {
        ...(this.save.flags || {}),
        immersive_sound_sequence: soundSequence,
      },
    };
    const materialBoost = materialTag === "metal" || materialTag === "glass" ? 1.25 : materialTag === "cloth" ? 0.7 : 1;
    const effectiveLoudness = Math.max(1, loudness * materialBoost);
    const attenuation = Math.max(0.05, tuning.sound_attenuation_per_cell);
    const radius = Math.max(
      1,
      Math.min(
        this.scaleMacroDistanceToFine(12),
        Math.ceil(effectiveLoudness / attenuation),
      ),
    );
    const propagatedFields: Array<{
      cell: [number, number];
      field: Omit<SimulationEnvironmentFieldRecord, "id" | "created_at_tick" | "age_ticks">;
    }> = [];
    const propagationRadius = metadata.compactPropagation ? 0 : radius;
    for (let dx = -propagationRadius; dx <= propagationRadius; dx += 1) {
      for (let dy = -propagationRadius; dy <= propagationRadius; dy += 1) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance > radius) continue;
        const target: [number, number] = [cell[0] + dx, cell[1] + dy];
        const targetCell = this.getActiveCell(target[0], target[1]);
        if (!targetCell) continue;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        let occlusion = targetCell.terrain === "water" ? 0.1 : 0;
        for (let step = 1; step <= steps; step += 1) {
          const rayCell = this.getActiveCell(
            Math.round(cell[0] + (dx * step) / Math.max(1, steps)),
            Math.round(cell[1] + (dy * step) / Math.max(1, steps)),
          );
          if (!rayCell) {
            occlusion = 1;
            break;
          }
          if (
            rayCell.blocks_los ||
            this.cellObjectBlocks(rayCell) ||
            this.containerBlocks(rayCell.x, rayCell.z) ||
            this.placementBlocks(rayCell.x, rayCell.z)
          ) {
            occlusion += tuning.barrier_reduction;
          }
        }
        occlusion = Math.min(0.92, occlusion);
        const openIntensity =
          (effectiveLoudness - distance * attenuation) /
          Math.max(1, effectiveLoudness);
        const intensity = Math.max(0.02, openIntensity * (1 - occlusion));
        if (intensity <= 0.02) continue;
        propagatedFields.push({
          cell: target,
          field: {
            kind: "sound",
            intensity,
            source: distance === 0 ? "runtime" : "propagation",
            tag,
            actor_id: actorId,
            action: metadata.sourceAction || "emit_sound",
            origin_cell: cloneCell(cell),
            radius,
            frequency_tag: tag,
            material_tag: materialTag,
            occlusion,
            decay_per_tick: 0.25,
            expires_at_tick: this.tick + Math.max(1, metadata.durationTicks ?? 8),
            source_category: metadata.sourceCategory || tag,
            source_entity_id: metadata.sourceEntityId || actorId,
            source_faction_id: metadata.sourceFactionId,
            owner_id: metadata.ownerId,
            reveals_identity: metadata.revealsIdentity ?? false,
            duration_ticks: Math.max(1, metadata.durationTicks ?? 8),
            stimulus_tags: [...new Set([tag, materialTag, ...(metadata.tags || [])].filter(Boolean))] as string[],
            propagation_mode: metadata.compactPropagation ? "compact" : "expanded",
            stimulus_sequence: soundSequence,
          },
        });
      }
    }
    if (propagatedFields.length > 0) {
      // A sound pulse can touch dozens of cells. Applying each field through
      // `appendEnvironmentField` copied the complete map-delta and field index
      // once per cell. Build the identical capped records in one immutable
      // update instead; when several entries ever share a cell, reading back
      // from `environmentFields` preserves the original sequential semantics.
      this.updateMapDelta((delta) => {
        // Compact footsteps are transient evidence, but older saves retained
        // every visited origin forever. That made each later step scan and
        // serialize an ever-growing history. Prune expired sound and movement
        // pulses older than four macro steps as the next compact pulse is
        // committed. Non-sound fields and authored/scripted sound retain their
        // existing lifetime semantics.
        const oldestMovementSequence = Math.max(
          0,
          soundSequence - FINE_PER_MACRO * 4,
        );
        // Surface traces used clock ticks for expiry, but exploration walking
        // intentionally does not advance the clock. Before sequence-backed
        // pruning, a long walk therefore left one permanent save record per
        // fine cell and made every later immutable map-delta update slower.
        // Keep a generous 24-macro-tile recent trail for tracking gameplay.
        // Legacy movement traces have no sequence; preserve the newest 256 on
        // their first migration pass, while authored/cleaned layers are never
        // pruned here.
        const oldestTraceSequence = Math.max(
          0,
          soundSequence - FINE_PER_MACRO * 24,
        );
        const surfaceEntries = Object.entries(delta.surface_layers || {});
        const legacyMovementTraceIds = surfaceEntries
          .flatMap(([, layers]) => layers)
          .filter(
            (layer) =>
              layer.source === "trace" &&
              !layer.trace_sequence &&
              (layer.trace_action === "move" ||
                layer.trace_action === "residue_transfer"),
          )
          .slice(-256)
          .map((layer) => layer.id);
        const retainedLegacyMovementTraceIds = new Set(
          legacyMovementTraceIds,
        );
        const surfaceLayers = surfaceEntries.reduce<
          Record<string, SimulationSurfaceLayerRecord[]>
        >((result, [key, layers]) => {
          const retained = layers.filter((layer) => {
            if (
              layer.source !== "trace" ||
              (layer.trace_action !== "move" &&
                layer.trace_action !== "residue_transfer")
            )
              return true;
            const sequence = Number(layer.trace_sequence || 0);
            return sequence > 0
              ? sequence >= oldestTraceSequence
              : retainedLegacyMovementTraceIds.has(layer.id);
          });
          if (retained.length > 0) result[key] = retained;
          return result;
        }, {});
        const environmentFields = Object.entries(
          delta.environment_fields || {},
        ).reduce<Record<string, SimulationEnvironmentFieldRecord[]>>(
          (result, [key, fields]) => {
            const retained = fields.filter((field) => {
              if (field.kind !== "sound") return true;
              if (
                field.expires_at_tick !== undefined &&
                field.expires_at_tick <= this.tick
              ) {
                return false;
              }
              const isCompactMovement =
                field.propagation_mode === "compact" &&
                (field.tag === "footstep" ||
                  field.frequency_tag === "footstep" ||
                  field.source_category === "movement_normal" ||
                  field.source_category === "movement_stealth");
              return (
                !isCompactMovement ||
                Number(field.stimulus_sequence || 0) >=
                  oldestMovementSequence
              );
            });
            if (retained.length > 0) result[key] = retained;
            return result;
          },
          {},
        );
        propagatedFields.forEach(({ cell: target, field }) => {
          const key = this.environmentFieldKey(target);
          const current = environmentFields[key] || [];
          environmentFields[key] = [
            ...current.slice(-9),
            {
              ...field,
              id: metadata.compactPropagation
                ? `env_${field.kind}_${this.tick}_${target[0]}_${target[1]}_${current.length}_${soundSequence}`
                : `env_${field.kind}_${this.tick}_${target[0]}_${target[1]}_${current.length}`,
              age_ticks: 0,
              created_at_tick: this.tick,
            },
          ];
        });
        return {
          ...delta,
          surface_layers: surfaceLayers,
          environment_fields: environmentFields,
        };
      });
    }
    return {
      origin: cloneCell(cell),
      cells: propagatedFields.length,
      loudness: effectiveLoudness,
      tag,
    };
  }

  advanceEnvironmentFields(ticks: number): { aged: number; removed: number; spread: number; emitted: number; damaged: number } {
    const elapsed = Math.max(1, Math.floor(ticks));
    const nextTick = this.tick + elapsed;
    const delta = this.getMapDelta();
    const byCell = delta?.environment_fields || {};
    let aged = 0;
    let removed = 0;
    let spread = 0;
    let emitted = 0;
    let damaged = 0;
    const nextFields = Object.entries(byCell).reduce<Record<string, SimulationEnvironmentFieldRecord[]>>((acc, [key, fields]) => {
      const kept = fields
        .map((field) => {
          const decay = field.decay_per_tick ?? (field.kind === "sound" ? 0.25 : field.kind === "smoke" ? 0.02 : 0.005);
          return {
            ...field,
            age_ticks: Math.max(field.age_ticks || 0, nextTick - field.created_at_tick),
            intensity: Math.max(0, field.intensity - decay * elapsed),
          };
        })
        .filter((field) => {
          const keep = field.intensity > 0.03 && (!field.expires_at_tick || field.expires_at_tick > nextTick);
          if (keep) aged += 1;
          else removed += 1;
          return keep;
        });
      if (kept.length) acc[key] = kept;
      return acc;
    }, {});

    Object.entries(nextFields).forEach(([key, fields]) => {
      const fire = fields.find((field) => field.kind === "fire");
      if (!fire) return;
      const [x, y] = key.split(":").map(Number);
      const origin: [number, number] = [x, y];
      const smokeIntensity = Math.max(0.12, fire.intensity * 0.35);
      for (const target of [origin, [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        if (!this.getActiveCell(target[0], target[1])) continue;
        const targetKey = this.environmentFieldKey(target);
        nextFields[targetKey] = [
          ...(nextFields[targetKey] || []),
          {
            id: `env_smoke_${nextTick}_${origin[0]}_${origin[1]}_${target[0]}_${target[1]}`,
            kind: "smoke",
            intensity: target[0] === origin[0] && target[1] === origin[1] ? smokeIntensity : smokeIntensity * 0.7,
            age_ticks: 0,
            source: "propagation",
            tag: "fire_smoke",
            actor_id: fire.actor_id,
            action: "fire_spread",
            origin_cell: cloneCell(origin),
            radius: 1,
            visibility_modifier: -0.25,
            decay_per_tick: 0.018,
            created_at_tick: nextTick,
            expires_at_tick: nextTick + 80,
          },
        ];
        emitted += 1;
      }
      this.queueNpcTasksForDisturbance("fire", origin, origin, Math.max(0.75, fire.intensity), 8);
      const lightPropagationRadius = Math.max(2, Math.round((fire.radius || 2) + 1));
      const lightRadius = Math.max(6, lightPropagationRadius);
      for (let lx = -lightPropagationRadius; lx <= lightPropagationRadius; lx += 1) {
        for (let ly = -lightPropagationRadius; ly <= lightPropagationRadius; ly += 1) {
          const distance = Math.abs(lx) + Math.abs(ly);
          if (distance > lightPropagationRadius) continue;
          const target: [number, number] = [origin[0] + lx, origin[1] + ly];
          if (!this.getActiveCell(target[0], target[1])) continue;
          const targetKey = this.environmentFieldKey(target);
          nextFields[targetKey] = [
            ...(nextFields[targetKey] || []),
            {
              id: `env_light_${nextTick}_${origin[0]}_${origin[1]}_${target[0]}_${target[1]}`,
              kind: "light",
              intensity: Math.max(0.05, fire.intensity * (1 - distance / (lightPropagationRadius + 1))),
              age_ticks: 0,
              source: distance === 0 ? "runtime" : "propagation",
              tag: "firelight",
              actor_id: fire.actor_id,
              action: "fire_light",
              origin_cell: cloneCell(origin),
              radius: lightRadius,
              color: "#f59e0b",
              decay_per_tick: 0.08,
              created_at_tick: nextTick,
              expires_at_tick: nextTick + 24,
            },
          ];
          emitted += 1;
        }
      }

      for (const target of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        const targetCell = this.getActiveCell(target[0], target[1]);
        if (!targetCell) continue;
        const targetKey = this.environmentFieldKey(target);
        if ((nextFields[targetKey] || []).some((field) => field.kind === "fire")) continue;
        if (this.materialFlammabilityForCell(targetCell) < 0.7) continue;
        nextFields[targetKey] = [
          ...(nextFields[targetKey] || []),
          {
            id: `env_fire_spread_${nextTick}_${target[0]}_${target[1]}`,
            kind: "fire",
            intensity: Math.max(0.35, fire.intensity * 0.75),
            age_ticks: 0,
            source: "propagation",
            tag: "spread_fire",
            actor_id: fire.actor_id,
            action: "fire_spread",
            origin_cell: cloneCell(origin),
            radius: 1,
            damage_per_tick: fire.damage_per_tick,
            decay_per_tick: 0.008,
            created_at_tick: nextTick,
            expires_at_tick: nextTick + 180,
          },
        ];
        spread += 1;
      }
    });
    damaged = this.applyEnvironmentDamage(nextFields);

    this.updateMapDelta((current) => ({
      ...current,
      environment_fields: nextFields,
    }));
    return { aged, removed, spread, emitted, damaged };
  }

  private getContainerRuntimeState(container: ContainerPlacementData) {
    const state = this.getMapDelta()?.containers?.[container.id];
    return {
      items: state?.items ?? container.items.map((entry) => ({ ...entry })),
      locked: state?.locked ?? container.locked ?? false,
      opened: state?.opened ?? false,
    };
  }

  private getContainerPlacement(containerId: string): ContainerPlacementData | undefined {
    return (this.activeMap.container_placements || []).find((candidate) => candidate.id === containerId);
  }

  private updateContainerState(containerId: string, updates: NonNullable<MapDelta["containers"]>[string]): void {
    this.updateMapDelta((delta) => ({
      ...delta,
      containers: {
        ...(delta.containers || {}),
        [containerId]: {
          ...(delta.containers?.[containerId] || {}),
          ...updates,
        },
      },
    }));
  }

  private resolveEntityStateKey(entityId: string): string {
    if ((this.save.entity_states || {})[entityId]) return entityId;
    if ((this.save.party_members || []).includes(entityId)) return entityId;
    const placementIndex = (this.activeMap.entity_placements || []).findIndex(
      (placement) => placement.entity_id === entityId,
    );
    if (placementIndex >= 0) {
      return entityPlacementStateKey(
        this.activeMap.id,
        this.activeMap.entity_placements[placementIndex],
        placementIndex,
      );
    }
    return entityId;
  }

  private getShopStockEntry(shopId: string, stockIndex: number) {
    const shop = this.options.gamePackage.shops?.find((candidate) => candidate.id === shopId);
    if (!shop) return undefined;
    const stock = getAvailableShopStock(shop, buildConditionContext(this.save)).find(
      (entry) => entry.stockIndex === stockIndex,
    );
    if (!stock) return undefined;
    const economyStock = this.getSimulationShopStock(shopId, stock.item.item_id);
    return economyStock ? { ...stock, price: Math.max(1, stock.price + economyStock.price_modifier) } : stock;
  }

  private getSellPrice(shopId: string | undefined, itemId: string): number {
    const shop = shopId
      ? this.options.gamePackage.shops?.find((candidate) => candidate.id === shopId)
      : undefined;
    const matchingStock = shop
      ? getAvailableShopStock(shop, buildConditionContext(this.save)).filter(
          (entry) => entry.item.item_id === itemId,
        )
      : [];
    const referencePrice =
      matchingStock.length > 0
        ? Math.min(...matchingStock.map((entry) => entry.price))
        : 2;
    return Math.max(1, Math.floor(referencePrice / 2));
  }

  private resolveMap(mapId: string): MapData {
    const map = this.options.gamePackage.maps.find((candidate) => candidate.id === mapId);
    if (!map) throw new Error(`V1GridWorld: unknown map "${mapId}"`);
    return map;
  }

  private indexCells(): void {
    const cached = activeCellIndexCache.get(this.activeMap);
    if (cached) {
      this.topCellByCoord = cached;
      return;
    }
    this.topCellByCoord.clear();
    for (const cell of this.activeMap.cells || []) {
      if (!cell.active) continue;
      const key = coordKey(cell.x, cell.z);
      const existing = this.topCellByCoord.get(key);
      if (
        !existing ||
        (cell.walkable && !existing.walkable) ||
        (cell.walkable === existing.walkable && (cell.y || 0) < (existing.y || 0))
      ) {
        this.topCellByCoord.set(key, cell);
      }
    }
    activeCellIndexCache.set(this.activeMap, this.topCellByCoord);
  }

  private getActiveCell(x: number, y: number): CellData | undefined {
    return this.topCellByCoord.get(coordKey(x, y));
  }

  private cellObjectBlocks(cell: CellData): boolean {
    if (!cell.object_id) return false;
    const object = this.objectById.get(cell.object_id);
    return Boolean(object && object.collision?.profile !== "none");
  }

  // Authored placements with push/remove deltas applied, each tagged with its
  // stable authored origin key (so manipulation can address a moved object).
  private currentPlacements(): CurrentObjectPlacement[] {
    const delta = this.getMapDelta();
    const movedObjects = delta?.moved_objects;
    const removedObjects = delta?.removed_objects;
    const carriedObjects = delta?.carried_objects;
    const cached = this.currentPlacementCache;
    if (
      cached &&
      cached.moved === movedObjects &&
      cached.removed === removedObjects &&
      cached.carried === carriedObjects
    ) {
      return cached.placements;
    }
    const removed = new Set(removedObjects || []);
    const carried = new Set(Object.keys(carriedObjects || {}));
    const out: CurrentObjectPlacement[] = [];
    for (const authored of this.activeMap.custom_object_placements || []) {
      const key = placementOriginKey(authored);
      if (removed.has(key) || carried.has(key)) continue;
      const moved = delta?.moved_objects?.[key];
      const placement = moved ? { ...authored, cell: moved.cell, facing: moved.facing } : authored;
      out.push({ key, placement, object: this.objectById.get(authored.object_id) });
    }
    this.currentPlacementCache = {
      moved: movedObjects,
      removed: removedObjects,
      carried: carriedObjects,
      placements: out,
    };
    return out;
  }

  private placementBlocks(x: number, y: number, excludeKey?: string): boolean {
    return this.currentPlacements().some(({ key, placement, object }) => {
      if (excludeKey && key === excludeKey) return false;
      if (isBuildingDoorPlacement(placement) && isDoorPlacementOpen(this.getMapDelta(), placement)) {
        return false;
      }
      if (!placementHasCollision(placement, object)) return false;
      return this.placementFootprint(placement, object).some(([px, py]) => px === x && py === y);
    });
  }

  private containerBlocks(x: number, y: number): boolean {
    // A container occupies its whole macro tile on the fine grid (its
    // placement cell is the tile's center fine cell).
    return (this.activeMap.container_placements || []).some((container) =>
      this.sameMacroCoord([container.cell[0], container.cell[1]], [x, y]),
    );
  }

  private pushRefForPlacement(
    key: string,
    placement: ObjectPlacementData,
    object: ObjectData | undefined,
  ): PushableObjectRef {
    const affordance = resolveObjectManipulationAffordance(object);
    const materialTag = (
      object?.simulation?.material_id ||
      object?.chem_material_id ||
      "solid"
    ).replace(/^sim_mat_/, "");
    const macroSoundLoudness = Math.min(
      12,
      Math.max(3, Math.ceil(3 + affordance.mass_kg / 5)),
    );
    return {
      key,
      objectId: placement.object_id,
      displayName: object?.display_name,
      cell: [placement.cell[0], placement.cell[1]],
      facing: [placement.facing?.[0] ?? 0, placement.facing?.[1] ?? 1],
      massKg: affordance.mass_kg,
      bulk: affordance.bulk,
      awkwardness: affordance.awkwardness,
      pushDifficulty: affordance.push_difficulty,
      pushEnergyCost: affordance.push_energy_cost,
      requiresCooperation: affordance.requires_cooperation,
      soundLoudness: this.scaleMacroDistanceToFine(macroSoundLoudness),
      materialTag,
    };
  }

  // ── Kernel grid manipulation (K3): push ──
  getPushableObjectAt(x: number, y: number): PushableObjectRef | undefined {
    for (const { key, placement, object } of this.currentPlacements()) {
      if (!placementHasCollision(placement, object) || !isPushableObject(object)) continue;
      if (this.placementFootprint(placement, object).some(([px, py]) => px === x && py === y)) {
        return this.pushRefForPlacement(key, placement, object);
      }
    }
    return undefined;
  }

  getPushObjectEnergyCost(ref: PushableObjectRef): number {
    return Math.max(0, Math.floor(ref.pushEnergyCost || 0));
  }

  getManipulationEnergyCost(ref: PushableObjectRef, action: "push" | "pull" | "drag" | "carry"): number {
    const base = this.getPushObjectEnergyCost(ref);
    if (action === "drag") return Math.max(100, Math.round(base * 1.5));
    if (action === "carry") return Math.max(100, Math.round(base * 2));
    return base;
  }

  canPushObjectTo(ref: PushableObjectRef, dx: number, dy: number, actorIds: string[] = [PLAYER_ENTITY_ID]) {
    if (ref.requiresCooperation && actorIds.length < 2) return { ok: false, reason: "requires cooperation" };
    // The object occupies a footprint (its whole macro tile): every
    // newly-entered fine cell of the shifted footprint must be open.
    for (const [ox, oy] of this.actorFootprintCells([ref.cell[0] + dx, ref.cell[1] + dy])) {
      if (this.footprintContainsCell([ref.cell[0], ref.cell[1]], [ox, oy])) continue;
      const target = this.getActiveCell(ox, oy);
      if (!target || !target.walkable) return { ok: false, reason: "no space" };
      if (this.cellObjectBlocks(target)) return { ok: false, reason: "no space" };
      if (this.containerBlocks(ox, oy)) return { ok: false, reason: "no space" };
      if (this.placementBlocks(ox, oy, ref.key)) return { ok: false, reason: "no space" };
      if (this.getEntityAt(ox, oy)) return { ok: false, reason: "occupied" };
    }
    return { ok: true };
  }

  private moveManipulatedObject(
    ref: PushableObjectRef,
    dx: number,
    dy: number,
    action: "push" | "pull" | "drag",
  ): { from: [number, number]; to: [number, number] } {
    const to: [number, number] = [ref.cell[0] + dx, ref.cell[1] + dy];
    this.updateMapDelta((delta) =>
      recordSimulationCondition(
        {
          ...delta,
          moved_objects: { ...(delta.moved_objects || {}), [ref.key]: { cell: to, facing: ref.facing } },
        },
        {
          target_kind: "object",
          target_id: ref.key,
          state: "worn",
          integrity: 0.99,
          condition_tags: ["moved", `${action}ed`],
          cell: to,
          last_action: action,
          updated_at_tick: this.tick,
        },
      ),
    );
    return { from: cloneCell(ref.cell), to };
  }

  pushObject(ref: PushableObjectRef, dx: number, dy: number): { from: [number, number]; to: [number, number] } {
    return this.moveManipulatedObject(ref, dx, dy, "push");
  }

  pullObject(ref: PushableObjectRef, dx: number, dy: number): { from: [number, number]; to: [number, number] } {
    return this.moveManipulatedObject(ref, dx, dy, "pull");
  }

  dragObject(ref: PushableObjectRef, dx: number, dy: number): { from: [number, number]; to: [number, number] } {
    return this.moveManipulatedObject(ref, dx, dy, "drag");
  }

  canCarryObject(ref: PushableObjectRef, actorIds: string[] = [PLAYER_ENTITY_ID]) {
    if (ref.requiresCooperation && actorIds.length < 2) return { ok: false, reason: "requires cooperation" };
    if ((ref.massKg || 0) > 180 || ref.pushDifficulty === undefined) return { ok: false, reason: "too heavy" };
    return { ok: true };
  }

  carryObject(ref: PushableObjectRef, actorIds: string[]): { from: [number, number]; carriedBy: string[] } {
    const carriedBy = actorIds.length ? [...new Set(actorIds)] : [PLAYER_ENTITY_ID];
    this.updateMapDelta((delta) =>
      recordSimulationCondition(
        {
          ...delta,
          carried_objects: {
            ...(delta.carried_objects || {}),
            [ref.key]: {
              object_id: ref.objectId,
              actor_ids: carriedBy,
              cell: cloneCell(ref.cell),
              carry_size: (ref.requiresCooperation ? "oversized" : undefined),
            },
          },
        },
        {
          target_kind: "object",
          target_id: ref.key,
          state: "worn",
          integrity: 0.99,
          condition_tags: ["moved", "carried"],
          cell: ref.cell,
          last_action: "carry",
          updated_at_tick: this.tick,
        },
      ),
    );
    return { from: cloneCell(ref.cell), carriedBy };
  }

  getBreakableObjectAt(x: number, y: number): PushableObjectRef | undefined {
    for (const { key, placement, object } of this.currentPlacements()) {
      if (!placementHasCollision(placement, object)) continue;
      if (isBuildingDoorPlacement(placement)) continue;
      if (this.placementFootprint(placement, object).some(([px, py]) => px === x && py === y)) {
        return this.pushRefForPlacement(key, placement, object);
      }
    }
    return undefined;
  }

  breakObject(ref: PushableObjectRef): { cell: [number, number] } {
    this.updateMapDelta((delta) =>
      recordSimulationCondition(
        {
          ...delta,
          moved_objects: Object.fromEntries(
            Object.entries(delta.moved_objects || {}).filter(([key]) => key !== ref.key),
          ),
          removed_objects: [...new Set([...(delta.removed_objects || []), ref.key])],
        },
        {
          target_kind: "object",
          target_id: ref.key,
          state: "broken",
          integrity: 0,
          condition_tags: ["removed", "broken"],
          cell: ref.cell,
          last_action: "break",
          updated_at_tick: this.tick,
        },
      ),
    );
    return { cell: cloneCell(ref.cell) };
  }

  getSurfaceLayersAt(x: number, y: number): SurfaceLayerRef | undefined {
    const cell = this.getActiveCell(x, y);
    const key = this.surfaceLayerKey([x, y]);
    const layers = this.activeSurfaceLayersAt([x, y]);
    const authoredSurface = cell?.surface_tag && cell.surface_tag !== "none" ? cell.surface_tag : undefined;
    if (!layers.length && !authoredSurface) return undefined;
    return {
      cell: [x, y],
      layerIds: layers.map((layer) => layer.id),
      kinds: [...new Set([authoredSurface, ...layers.map((layer) => layer.residue_kind || layer.kind)].filter(Boolean) as string[])],
      count: layers.length + (authoredSurface ? 1 : 0),
    };
  }

  cleanSurface(ref: SurfaceLayerRef, actorId = PLAYER_ENTITY_ID): { cell: [number, number]; removed: number; kinds: string[] } {
    const key = this.surfaceLayerKey(ref.cell);
    const targetCell = this.getActiveCell(ref.cell[0], ref.cell[1]);
    const cleanedKinds = ref.kinds.length ? ref.kinds : ["surface"];
    const cleaningDifficulty = cleanedKinds.reduce((sum, kind) => {
      const profile = this.surfaceTraceProfile(targetCell, kind);
      return sum + profile.cleaning_difficulty;
    }, 0) / Math.max(1, cleanedKinds.length);
    const cleanedTrace: SimulationSurfaceLayerRecord = {
      id: `cleaned_${this.tick}_${actorId}_${ref.cell[0]}_${ref.cell[1]}`,
      kind: "cleaned_trace",
      tag: "cleaned_trace",
      amount: Math.min(1, 0.15 + cleaningDifficulty * 0.1),
      age_ticks: 0,
      source: "trace",
      trace_actor_id: actorId,
      trace_action: "clean",
      residue_kind: `cleaned:${cleanedKinds.join("+")}`,
      cleaned_by_actor_id: actorId,
      cleaned_at_tick: this.tick,
      cleaning_difficulty: cleaningDifficulty,
      visibility: 0.25,
      scent: 0.05,
      trace_potential: 0.65,
      decay_per_tick: 0.0015,
      created_at_tick: this.tick,
      expires_at_tick: this.tick + 360,
    };
    let removed = 0;
    this.updateMapDelta((delta) => {
      const previous = delta.surface_layers?.[key] || [];
      const remaining = previous.filter((layer) => {
        const keep = !ref.layerIds.includes(layer.id);
        if (!keep) removed += 1;
        return keep;
      });
      return recordSimulationCondition(
        {
          ...delta,
          surface_layers: {
            ...(delta.surface_layers || {}),
            [key]: [...remaining, cleanedTrace],
          },
        },
        {
          target_kind: "cell",
          target_id: `cell:${this.activeMap.id}:${ref.cell[0]}:${ref.cell[1]}`,
          material_id: targetCell?.simulation?.material_id,
          state: "stained",
          integrity: 0.98,
          condition_tags: ["cleaned", "trace_removed", ...cleanedKinds.map((kind) => `cleaned:${kind}`)],
          cell: cloneCell(ref.cell),
          last_action: "clean",
          updated_at_tick: this.tick,
        },
      );
    });
    return { cell: cloneCell(ref.cell), removed, kinds: cleanedKinds };
  }

  decaySurfaceLayers(ticks: number): { removed: number; aged: number } {
    const delta = this.getMapDelta();
    const layersByCell = delta?.surface_layers || {};
    let removed = 0;
    let aged = 0;
    const elapsed = Math.max(1, Math.floor(ticks));
    const nextTick = this.tick + elapsed;
    const decayedEntries = Object.entries(layersByCell).reduce<Record<string, SimulationSurfaceLayerRecord[]>>(
      (acc, [key, layers]) => {
        const nextLayers = layers
          .map((layer) => {
            const decay = layer.decay_per_tick ?? (layer.expires_at_tick ? 1 / Math.max(1, layer.expires_at_tick - layer.created_at_tick) : 0.003);
            return {
              ...layer,
              age_ticks: Math.max(layer.age_ticks || 0, nextTick - layer.created_at_tick),
              amount: Math.max(0, layer.amount - decay * elapsed),
            };
          })
          .filter((layer) => {
            const keep = layer.amount > 0.03 && (!layer.expires_at_tick || layer.expires_at_tick > nextTick);
            if (keep) aged += 1;
            else removed += 1;
            return keep;
          });
        if (nextLayers.length) acc[key] = nextLayers;
        return acc;
      },
      {},
    );
    this.updateMapDelta((current) => ({
      ...current,
      surface_layers: decayedEntries,
    }));
    return { removed, aged };
  }
}

export const createV1GridWorld = (options: V1GridWorldOptions): V1GridWorld =>
  new V1GridWorld(options);

const buildV1DispatchResult = (
  options: V1GridWorldOptions,
  world: V1GridWorld,
  eventStart: number,
  result: ReturnType<Engine["dispatch"]>,
) => {
  const events = [...world.events.getLog().slice(eventStart)];
  const afterSave = world.getDispatchSave();
  const kernelFacts = result.ok
    ? createKernelFactsFromEngineEvents({
        gamePackage: options.gamePackage,
        beforeSave: options.save,
        afterSave,
        events,
      })
    : [];
  const save = appendKernelFactsToSave(afterSave, kernelFacts);
  return { ...result, events, save, world, kernelFacts };
};

const isCampaignTrackedInventoryItem = (
  gamePackage: GamePackage,
  itemId: string,
) => {
  const item = gamePackage.items.find((candidate) => candidate.id === itemId);
  return Boolean(item?.artifact || item?.glass_resource);
};

const buildCampaignTrackedItemBlock = (
  options: V1GridWorldOptions,
  itemId: string,
) => {
  const world = createV1GridWorld(options);
  return buildV1DispatchResult(options, world, world.events.getLog().length, {
    ok: false,
    reason: `campaign-tracked item ${itemId} requires its lifecycle operation`,
    events: [],
  });
};

const v1StealthActionBlocked = (
  options: V1GridWorldOptions & V1ActionCostOptions,
  actorId: string,
) =>
  options.bypassPlayerStealth !== true &&
  isActorUsingStealthStance(options.save, actorId);

export const dispatchV1MoveEntity = (options: V1MoveDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const actorId = options.actorId || PLAYER_ENTITY_ID;
  const world = new V1GridWorld(
    options,
    actorId === PLAYER_ENTITY_ID && !options.save.in_combat
      ? "exploration_player_move"
      : "deep",
  );
  const before = world.events.getLog().length;
  let resolvedDelta: [number, number] = [options.dx, options.dy];
  let doorwayAssisted = false;
  let result = engine.dispatch(
    {
      type: "move_entity",
      actorId,
      params: { dx: options.dx, dy: options.dy },
    },
    world,
  );
  if (!result.ok && result.reason === "blocked" && options.allowDoorwayAssist) {
    const assist = world.getDoorwayAlignmentStep(actorId, options.dx, options.dy);
    if (assist) {
      const assistedResult = engine.dispatch(
        {
          type: "move_entity",
          actorId,
          params: { dx: assist[0], dy: assist[1] },
        },
        world,
      );
      if (assistedResult.ok) {
        result = assistedResult;
        resolvedDelta = assist;
        doorwayAssisted = true;
      }
    }
  }
  if (result.ok) {
    const stealthMovement = isActorUsingStealthStance(options.save, actorId);
    const speedMultiplier = resolveMovementHearingSettings(
      options.gamePackage,
    ).stealth_speed_multiplier;
    world.applyActionCost(
      actorId,
      stealthMovement && Number(options.energyCost || 0) > 0
        ? {
            ...options,
            energyCost: Math.ceil(
              Number(options.energyCost || 0) / Math.max(0.1, speedMultiplier),
            ),
          }
        : options,
    );
  }
  const dispatchResult = buildV1DispatchResult(options, world, before, result);
  if (doorwayAssisted && actorId === PLAYER_ENTITY_ID) {
    dispatchResult.save = {
      ...dispatchResult.save,
      player: {
        ...dispatchResult.save.player,
        facing: [options.dx, options.dy],
      },
    };
  }
  return { ...dispatchResult, doorwayAssisted, resolvedDelta };
};

// Pass a turn in place. Carries no movement, but spends the supplied action cost
// (energy and/or deterministic clock minutes) and emits `waited` + (when costed)
// `resource_spent`, so waiting advances the runtime the same way other verbs do.
export const dispatchV1Wait = (options: V1WaitDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "wait",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: {},
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1ChangeMap = (options: V1ChangeMapDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "change_map",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: {
        targetMapId: options.targetMapId,
        targetSpawnId: options.targetSpawnId,
        facing: options.facing,
        exitId: options.exitId,
      },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1FireTrigger = (options: V1TriggerDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "fire_trigger",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: {
        triggerId: options.triggerId,
      },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

const dispatchV1ContainerCommand = (
  type: string,
  options: V1ContainerDispatchOptions,
  params: Record<string, unknown> = {},
) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const actorId = options.actorId || PLAYER_ENTITY_ID;
  if (v1StealthActionBlocked(options, actorId)) {
    return buildV1DispatchResult(options, world, before, {
      ok: false,
      reason: "stealth stance",
      events: [],
    });
  }
  const stowedItemId = type === "stow_in_container" ? String(params.itemId || "") : "";
  if (
    stowedItemId &&
    isCampaignTrackedInventoryItem(options.gamePackage, stowedItemId)
  ) {
    return buildV1DispatchResult(options, world, before, {
      ok: false,
      reason: `campaign-tracked item ${stowedItemId} must remain with its carrier`,
      events: [],
    });
  }
  const takenItems =
    type === "take_from_container"
      ? [world.getContainerItem(options.containerId, Number(params.entryIndex) || 0)].filter(
          (entry): entry is ContainerItemRef => Boolean(entry),
        )
      : type === "take_all_from_container"
        ? world.getContainerItems(options.containerId)
        : [];
  const trackedContainerItem = takenItems.find((entry) =>
    isCampaignTrackedInventoryItem(options.gamePackage, entry.itemId),
  );
  if (trackedContainerItem) {
    return buildV1DispatchResult(options, world, before, {
      ok: false,
      reason: `campaign-tracked item ${trackedContainerItem.itemId} requires its lifecycle operation`,
      events: [],
    });
  }
  const result = engine.dispatch(
    {
      type,
      actorId,
      params: {
        containerId: options.containerId,
        ...params,
      },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1UnlockContainer = (options: V1ContainerDispatchOptions) =>
  dispatchV1ContainerCommand("unlock_container", options);

export const dispatchV1OpenContainer = (options: V1ContainerDispatchOptions) =>
  dispatchV1ContainerCommand("open_container", options);

export const dispatchV1SearchContainer = (options: V1ContainerDispatchOptions) =>
  dispatchV1ContainerCommand("search_container", options);

export const dispatchV1TakeFromContainer = (options: V1ContainerItemDispatchOptions) =>
  dispatchV1ContainerCommand("take_from_container", options, { entryIndex: options.entryIndex });

export const dispatchV1TakeAllFromContainer = (options: V1ContainerDispatchOptions) =>
  dispatchV1ContainerCommand("take_all_from_container", options);

export const dispatchV1StowInContainer = (options: V1ContainerStowDispatchOptions) =>
  dispatchV1ContainerCommand("stow_in_container", options, {
    itemId: options.itemId,
    count: options.count ?? 1,
  });

export interface V1CellDispatchOptions extends V1GridWorldOptions, V1ActionCostOptions {
  actorId?: string;
  x: number;
  y: number;
}

const dispatchV1CellCommand = (type: string, options: V1CellDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const actorId = options.actorId || PLAYER_ENTITY_ID;
  if (v1StealthActionBlocked(options, actorId)) {
    return buildV1DispatchResult(options, world, before, {
      ok: false,
      reason: "stealth stance",
      events: [],
    });
  }
  const result = engine.dispatch(
    {
      type,
      actorId,
      params: { x: options.x, y: options.y },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

// Pick up the ground item at cell (x,y): adds it to the save inventory and marks
// it taken/removes the drop, emitting an `item_acquired` event.
export const dispatchV1TakeItem = (options: V1CellDispatchOptions) =>
  {
    const engine = new Engine();
    registerCoreCommands(engine);
    const world = createV1GridWorld(options);
    const before = world.events.getLog().length;
    const actorId = options.actorId || PLAYER_ENTITY_ID;
    if (v1StealthActionBlocked(options, actorId)) {
      return buildV1DispatchResult(options, world, before, {
        ok: false,
        reason: "stealth stance",
        events: [],
      });
    }
    const groundItem = world.getGroundItemAt(options.x, options.y);
    const result = engine.dispatch(
      {
        type: "take_item",
        actorId,
        params: { x: options.x, y: options.y },
      },
      world,
    );
    if (result.ok) world.applyActionCost(actorId, options);
    const dispatched = buildV1DispatchResult(options, world, before, result);
    if (!result.ok || !groundItem || groundItem.dropped) return dispatched;

    const mapId = options.mapId || options.save.current_map_id;
    let lifecycleSave = recordArtifactPickup(options.gamePackage, dispatched.save, {
      mapId,
      placementId: groundItem.id,
      itemId: groundItem.itemId,
    }).save;
    lifecycleSave = recordGlassHarvest(options.gamePackage, lifecycleSave, {
      itemId: groundItem.itemId,
      itemCount: groundItem.count,
      sourceId: `${mapId}:${groundItem.id}`,
    }).save;
    return lifecycleSave === dispatched.save
      ? dispatched
      : { ...dispatched, save: lifecycleSave };
  };

export const dispatchV1DropItem = (options: V1DropItemDispatchOptions) => {
  if (isCampaignTrackedInventoryItem(options.gamePackage, options.itemId)) {
    return buildCampaignTrackedItemBlock(options, options.itemId);
  }
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const actorId = options.actorId || PLAYER_ENTITY_ID;
  if (v1StealthActionBlocked(options, actorId)) {
    return buildV1DispatchResult(options, world, before, {
      ok: false,
      reason: "stealth stance",
      events: [],
    });
  }
  const result = engine.dispatch(
    {
      type: "drop_item",
      actorId,
      params: { itemId: options.itemId, count: options.count ?? 1, cell: options.cell },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

// Open the closed door at cell (x,y): records it in opened_doors, emitting a
// `door_opened` event.
export const dispatchV1OpenDoor = (options: V1CellDispatchOptions) =>
  dispatchV1CellCommand("open_door", options);

export const dispatchV1CloseDoor = (options: V1CellDispatchOptions) =>
  dispatchV1CellCommand("close_door", options);

// K3 manipulation: push the movable object at cell (x,y) one cell in (dx,dy).
// Records the new position in the map delta and emits `object_pushed`.
export interface V1PushObjectDispatchOptions extends V1CellDispatchOptions {
  dx: number;
  dy: number;
  helperActorIds?: string[];
}
const dispatchV1ObjectManipulation = (
  type: "push_object" | "pull_object" | "drag_object" | "carry_object",
  options: V1PushObjectDispatchOptions,
) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const actorId = options.actorId || PLAYER_ENTITY_ID;
  if (v1StealthActionBlocked(options, actorId)) {
    return buildV1DispatchResult(options, world, before, {
      ok: false,
      reason: "stealth stance",
      events: [],
    });
  }
  const pushRef = world.getPushableObjectAt(options.x, options.y);
  const action = type === "carry_object" ? "carry" : type === "drag_object" ? "drag" : type === "pull_object" ? "pull" : "push";
  const computedEnergyCost = pushRef ? world.getManipulationEnergyCost(pushRef, action) : 0;
  const result = engine.dispatch(
    {
      type,
      actorId,
      params: {
        x: options.x,
        y: options.y,
        dx: options.dx,
        dy: options.dy,
        helperActorIds: options.helperActorIds,
      },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, {
      ...options,
      energyCost: options.energyCost ?? computedEnergyCost,
    });
  }
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1PushObject = (options: V1PushObjectDispatchOptions) =>
  dispatchV1ObjectManipulation("push_object", options);

export const dispatchV1PullObject = (options: V1PushObjectDispatchOptions) =>
  dispatchV1ObjectManipulation("pull_object", options);

export const dispatchV1DragObject = (options: V1PushObjectDispatchOptions) =>
  dispatchV1ObjectManipulation("drag_object", options);

export const dispatchV1CarryObject = (options: V1PushObjectDispatchOptions) =>
  dispatchV1ObjectManipulation("carry_object", options);

export const dispatchV1BreakObject = (options: V1CellDispatchOptions) =>
  dispatchV1CellCommand("break_object", options);

export const dispatchV1CleanSurface = (options: V1CellDispatchOptions) =>
  dispatchV1CellCommand("clean_surface", options);

export const dispatchV1DecaySurfaces = (options: V1DecaySurfacesDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "decay_surfaces",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: { ticks: options.ticks },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1IgniteFire = (options: V1CellDispatchOptions) =>
  dispatchV1CellCommand("ignite_fire", options);

export const dispatchV1ExtinguishFire = (options: V1CellDispatchOptions) =>
  dispatchV1CellCommand("extinguish_fire", options);

export const dispatchV1AdvanceEnvironment = (options: V1AdvanceEnvironmentDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "advance_environment",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: { ticks: options.ticks },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1EmitSound = (options: V1EmitSoundDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "emit_sound",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: {
        cell: options.cell,
        loudness: options.loudness,
        tag: options.tag || "sound",
        materialTag: options.materialTag,
        sourceCategory: options.sourceCategory,
        sourceEntityId: options.sourceEntityId,
        sourceFactionId: options.sourceFactionId,
        ownerId: options.ownerId,
        sourceAction: options.sourceAction,
        revealsIdentity: options.revealsIdentity,
        durationTicks: options.durationTicks,
        tags: options.tags,
        compactPropagation: options.compactPropagation,
      },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1AdvanceNpcTasks = (options: V1AdvanceNpcTasksDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "advance_npc_tasks",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: { ticks: options.ticks },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1StartProcess = (options: V1StartProcessDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "start_process",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: {
        processId: options.processId,
        processType: options.processType,
        cell: options.cell,
        workstationId: options.workstationId,
        shopId: options.shopId,
        actorIds: options.actorIds,
        requiredTicks: options.requiredTicks,
        inputItems: options.inputItems,
        outputItems: options.outputItems,
        wasteItems: options.wasteItems,
        emits: options.emits,
      },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1InterruptProcess = (options: V1InterruptProcessDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "interrupt_process",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: { processId: options.processId, reason: options.reason },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1AdvanceProcesses = (options: V1AdvanceProcessesDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "advance_processes",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: { ticks: options.ticks },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1AdvanceSimulationRegions = (options: V1AdvanceSimulationRegionsDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "advance_simulation_regions",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: { ticks: options.ticks },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1AdaptSimulationSemantics = (options: V1AdaptSimulationSemanticsDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "adapt_simulation_semantics",
      actorId: options.actorId || PLAYER_ENTITY_ID,
      params: { mapId: options.mapId },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

// ── State-mutation dispatchers (story / cutscene / dialogue effects) ──────────
// Each runs a pure save-mutation command through the pipeline against real
// save data, applies any action cost, and returns { ok, reason, events, save }.
const dispatchV1StateCommand = (
  type: string,
  options: V1StateDispatchOptions,
  params: Record<string, unknown>,
) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    { type, actorId: options.actorId || PLAYER_ENTITY_ID, params },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId || PLAYER_ENTITY_ID, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1SetSwitch = (options: V1SetSwitchDispatchOptions) =>
  dispatchV1StateCommand("set_switch", options, { switchId: options.switchId, value: options.value });

export const dispatchV1SetQuest = (options: V1SetQuestDispatchOptions) =>
  dispatchV1StateCommand("set_quest", options, { questId: options.questId, state: options.state });

export const dispatchV1GiveItem = (options: V1ItemGrantDispatchOptions) =>
  isCampaignTrackedInventoryItem(options.gamePackage, options.itemId)
    ? buildCampaignTrackedItemBlock(options, options.itemId)
    : dispatchV1StateCommand("give_item", options, {
        itemId: options.itemId,
        count: options.count ?? 1,
      });

export const dispatchV1RemoveItem = (options: V1ItemGrantDispatchOptions) =>
  isCampaignTrackedInventoryItem(options.gamePackage, options.itemId)
    ? buildCampaignTrackedItemBlock(options, options.itemId)
    : dispatchV1StateCommand("remove_item", options, {
        itemId: options.itemId,
        count: options.count ?? 1,
      });

export const dispatchV1GiveCurrency = (options: V1CurrencyDispatchOptions) =>
  dispatchV1StateCommand("give_currency", options, { amount: options.amount });

export const dispatchV1RemoveCurrency = (options: V1CurrencyDispatchOptions) =>
  dispatchV1StateCommand("remove_currency", options, { amount: options.amount });

export const dispatchV1AdjustFactionRep = (options: V1FactionRepDispatchOptions) =>
  dispatchV1StateCommand("adjust_faction_rep", options, { factionId: options.factionId, amount: options.amount });

export const dispatchV1ReadDocument = (options: V1DocumentDispatchOptions) =>
  dispatchV1StateCommand("read_document", options, { documentId: options.documentId });

export const dispatchV1LearnSkill = (options: V1SkillDispatchOptions) =>
  dispatchV1StateCommand("learn_skill", options, { skillId: options.skillId });

export const dispatchV1CompleteQuestObjective = (options: V1QuestObjectiveDispatchOptions) =>
  dispatchV1StateCommand("complete_quest_objective", options, {
    objectiveId: options.objectiveId,
    targetId: options.targetId,
    objectiveType: options.objectiveType,
  });

export const dispatchV1SetPlayerPosition = (options: V1PositionDispatchOptions) =>
  dispatchV1StateCommand("set_player_position", options, {
    cell: options.cell,
    facing: options.facing,
  });

export const dispatchV1TeleportPlayer = (options: V1TeleportDispatchOptions) =>
  dispatchV1StateCommand("teleport_player", options, {
    mapId: options.mapId,
    cell: options.cell,
    facing: options.facing,
  });

export const dispatchV1SetEntityPosition = (options: V1EntityPositionDispatchOptions) =>
  dispatchV1StateCommand("set_entity_position", options, {
    entityId: options.entityId,
    cell: options.cell,
    facing: options.facing,
  });

export const dispatchV1SetPlayerSprite = (options: V1PlayerSpriteDispatchOptions) =>
  dispatchV1StateCommand("set_player_sprite", options, {
    spriteId: options.spriteId,
  });

export const dispatchV1HealPlayer = (options: V1HealPlayerDispatchOptions) =>
  dispatchV1StateCommand("heal_player", options, { amount: options.amount });

export const dispatchV1RestoreParty = (options: V1StateDispatchOptions) =>
  dispatchV1StateCommand("restore_party", options, {});

export const dispatchV1AddPartyMember = (options: V1PartyMemberDispatchOptions) =>
  dispatchV1StateCommand("add_party_member", options, { entityId: options.entityId });

export const dispatchV1RemovePartyMember = (options: V1PartyMemberDispatchOptions) =>
  dispatchV1StateCommand("remove_party_member", options, { entityId: options.entityId });

export const dispatchV1AdvanceClock = (options: V1ClockDispatchOptions) =>
  dispatchV1StateCommand("advance_clock", options, { minutes: options.minutes });

export const dispatchV1ModifyPlayerStats = (options: V1ModifyPlayerStatsDispatchOptions) =>
  dispatchV1StateCommand("modify_player_stats", options, { stats: options.stats });

export const dispatchV1SetEntityHidden = (options: V1SetEntityHiddenDispatchOptions) =>
  dispatchV1StateCommand("set_entity_hidden", options, {
    entityId: options.entityId,
    hidden: options.hidden ?? true,
  });

export const dispatchV1RecordBark = (options: V1BarkDispatchOptions) =>
  dispatchV1StateCommand("record_bark", options, {
    barkId: options.barkId,
    clockMinutes: options.clockMinutes,
  });

export const dispatchV1GameEnd = (options: V1GameEndDispatchOptions) =>
  dispatchV1StateCommand("game_end", options, {
    endingId: options.endingId,
    title: options.title,
  });

export const dispatchV1AttendNode = (
  options: V1AttendNodeDispatchOptions,
): V1AttendNodeDispatchResult =>
  dispatchAlderamonticoAttendNode(options.save, options.node, options);

export const dispatchV1ChooseDialogueOption = (options: V1ChooseDialogueOptionDispatchOptions) => {
  const result = dispatchV1StateCommand("choose_dialogue_option", options, {
    dialogueId: options.dialogueId,
    nodeId: options.nodeId,
    optionIndex: options.optionIndex,
  });
  const outcome = result.events.find((event) => event.type === "dialogue_option_chosen")
    ?.payload as unknown as DialogueChoiceOutcome | undefined;
  return { ...result, outcome };
};

export const dispatchV1SelectDialogueTopic = (options: V1SelectDialogueTopicDispatchOptions) => {
  const topicKind = !options.topic
    ? "opening"
    : options.topic.kind;
  const topicId = !options.topic
    ? undefined
    : options.topic.kind === "dynamic"
      ? options.topic.dynamicTopicId
      : options.topic.topicId;
  const result = dispatchV1StateCommand("select_dialogue_topic", options, {
    dialogueId: options.dialogueId,
    topicKind,
    topicId,
    participantKey: options.participantKey,
    shownItemId: options.shownItemId,
    entryNodeId: options.entryNodeId,
    countAsk: options.countAsk ?? true,
  });
  const outcome = result.events.find((event) => event.type === "dialogue_topic_selected")
    ?.payload as unknown as KeywordDialogueOutcome | undefined;
  return { ...result, outcome };
};

export const dispatchV1BuyShopItem = (options: V1ShopBuyDispatchOptions) => {
  const stockedItemId = options.gamePackage.shops
    .find((shop) => shop.id === options.shopId)
    ?.items[options.stockIndex]?.item_id;
  if (
    stockedItemId &&
    isCampaignTrackedInventoryItem(options.gamePackage, stockedItemId)
  ) {
    return {
      ...buildCampaignTrackedItemBlock(options, stockedItemId),
      outcome: undefined as ShopTransactionOutcome | undefined,
    };
  }
  const result = dispatchV1StateCommand("buy_shop_item", options, {
    shopId: options.shopId,
    stockIndex: options.stockIndex,
  });
  const outcome = result.events.find((event) => event.type === "shop_item_bought")
    ?.payload as unknown as ShopTransactionOutcome | undefined;
  return { ...result, outcome };
};

export const dispatchV1SellInventoryItem = (options: V1ShopSellDispatchOptions) => {
  if (isCampaignTrackedInventoryItem(options.gamePackage, options.itemId)) {
    return {
      ...buildCampaignTrackedItemBlock(options, options.itemId),
      outcome: undefined as ShopTransactionOutcome | undefined,
    };
  }
  const result = dispatchV1StateCommand("sell_inventory_item", options, {
    shopId: options.shopId,
    itemId: options.itemId,
    count: options.count ?? 1,
  });
  const outcome = result.events.find((event) => event.type === "shop_item_sold")
    ?.payload as unknown as ShopTransactionOutcome | undefined;
  return { ...result, outcome };
};

export const dispatchV1MeleeAttack = (options: V1MeleeAttackDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "melee_attack",
      actorId: options.actorId,
      params: { targetId: options.targetId },
    },
    world,
  );
  if (result.ok) {
    world.applyActionCost(options.actorId, options);
  }
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1CastSkill = (options: V1CastSkillDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "cast_skill",
      actorId: options.actorId,
      params: { skillId: options.skillId, targetCells: options.targetCells },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1UpdateCombatSession = (options: V1CombatSessionDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "update_combat_session",
      actorId: PLAYER_ENTITY_ID,
      params: {
        threatRadius: options.threatRadius,
        chaseRadius: options.chaseRadius,
        partyFollowers: options.partyFollowers,
        forceEnd: options.forceEnd,
        requireAlert: options.requireAlert,
      },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1AdvanceCombatTurn = (options: V1CombatTurnDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "advance_combat_turn",
      actorId: options.save.active_turn_id || PLAYER_ENTITY_ID,
      params: {},
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

export const dispatchV1EnemyTurn = (options: V1CombatTurnDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  const result = engine.dispatch(
    {
      type: "enemy_turn",
      actorId: options.actorId || options.save.active_turn_id || undefined,
      params: {
        advanceTurn: options.advanceTurn !== false,
        movementSteps: options.movementSteps,
        allowAttack: options.allowAttack !== false,
      },
    },
    world,
  );
  return buildV1DispatchResult(options, world, before, result);
};

// Resolve a whole simultaneous hostile pulse against one shared runtime world.
// This avoids rebuilding the map index and cloning the complete save once per
// enemy in crowded encounters while preserving the ordinary command pipeline
// and one structured outcome event per actor.
export const dispatchV1EnemyPulse = (options: V1EnemyPulseDispatchOptions) => {
  const engine = new Engine();
  registerCoreCommands(engine);
  const world = createV1GridWorld(options);
  const before = world.events.getLog().length;
  let accepted = 0;
  let lastFailure: ReturnType<Engine["dispatch"]> | undefined;

  for (const actorId of [...new Set(options.actorIds)]) {
    const result = engine.dispatch(
      {
        type: "enemy_turn",
        actorId,
        params: {
          advanceTurn: false,
          movementSteps: options.movementSteps,
          allowAttack: options.allowAttack !== false,
        },
      },
      world,
    );
    if (result.ok) accepted += 1;
    else lastFailure = result;
  }

  const result: ReturnType<Engine["dispatch"]> =
    accepted > 0 || options.actorIds.length === 0
      ? { ok: true, events: [] }
      : lastFailure || { ok: false, reason: "no enemies resolved", events: [] };
  return buildV1DispatchResult(options, world, before, result);
};

export const getV1NearbyHostiles = (options: V1NearbyHostilesOptions): V1CombatantSnapshot[] =>
  createV1GridWorld(options).getNearbyHostiles(options.radius);

export const getV1ControlledCombatant = (options: V1GridWorldOptions): V1CombatantSnapshot | undefined =>
  createV1GridWorld(options).getControlledCombatant();

export const getV1CombatantSnapshot = (
  options: V1GridWorldOptions & { actorId: string },
): V1CombatantSnapshot | undefined =>
  createV1GridWorld(options).getCombatantSnapshot(options.actorId);

export const getV1SkillTargetCells = (options: V1SkillTargetOptions): V1SkillTargetResult =>
  createV1GridWorld(options).getSkillTargetCells(options.actorId, options.skillId, options.targetCell);

export const getV1SkillRangeCells = (options: Omit<V1SkillTargetOptions, "targetCell">): [number, number][] =>
  createV1GridWorld(options).getSkillRangeCells(options.actorId, options.skillId);

export const getV1DoorKey = doorPlacementKey;
