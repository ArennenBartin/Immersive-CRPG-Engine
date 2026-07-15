import type { GamePackage, MapData, ObjectData, ObjectPlacementData } from "../schema/game";
import type {
  ActorPhysicalStateRecord,
  ImmersiveSchedulerStateRecord,
  ImmersiveTileLayerRecord,
  MapDelta,
  PlaySave,
  PlaySaveWorldFact,
  SimulationConditionRecord,
  SimulationEnvironmentFieldRecord,
  SimulationNpcTaskRecord,
  SimulationSurfaceLayerRecord,
} from "../schema/save";
import {
  createSimulationSnapshotFromV1,
  resolveObjectManipulationAffordance,
  type SimulationCellState,
  type SimulationMapSnapshot,
} from "./simulation";
import { applyStatus } from "./statuses";
import { entityPlacementStateKey } from "../utils/entityState";
import { isPushableObject, placementHasCollision, placementOriginKey } from "../utils/objectFootprint";
import {
  FINE_CARDINAL_DIRECTIONS,
  FINE_PER_MACRO,
  coordKey,
  parseFineCoordKey,
} from "./gridCoordinates";
import { isFineExpandedPackage } from "./fineWorld";
import {
  createImmersiveIlluminationSnapshotFromV1,
  queryImmersiveIlluminationAtCell,
  queryImmersiveVisualAcquisition,
  type ImmersiveIlluminationSnapshot,
  type ImmersiveVisualAcquisitionResult,
} from "./visibility";

export const IMMERSIVE_STANDARD_ACTION_ENERGY = 1000;
export const IMMERSIVE_SEGMENTS_PER_TURN = 10;
export const IMMERSIVE_ENERGY_PER_SPEED_PER_SEGMENT = 10;
export const IMMERSIVE_AMBIENT_TEMPERATURE = 25;

export const IMMERSIVE_REACTION_RULES: ImmersiveReactionRuleDefinition[] = [
  {
    id: "water_extinguishes_fire_to_steam",
    priority: 10,
    inputs: ["water", "fire"],
    outputs: ["steam", "doused"],
  },
  {
    id: "fire_melts_ice_to_water",
    priority: 15,
    inputs: ["ice", "fire"],
    outputs: ["water", "steam", "melted"],
  },
  {
    id: "cold_freezes_water",
    priority: 20,
    inputs: ["water", "cold"],
    outputs: ["ice", "frozen"],
    status_effects: [{ status_id: "slow", duration: 2, magnitude: 1 }],
  },
  {
    id: "fire_ignites_oil",
    priority: 30,
    inputs: ["oil", "fire"],
    outputs: ["spreading_fire", "smoke"],
    status_effects: [{ status_id: "burn", duration: 2, magnitude: 2 }],
  },
  {
    id: "electricity_conducts_water",
    priority: 30,
    inputs: ["electricity", "water"],
    outputs: ["conductive_electricity"],
    status_effects: [{ status_id: "stun", duration: 1, magnitude: 1 }],
  },
  {
    id: "electricity_chains_through_wet_cell",
    priority: 31,
    inputs: ["conductive_electricity", "wet_cell"],
    outputs: ["conductive_electricity"],
    status_effects: [{ status_id: "stun", duration: 1, magnitude: 1 }],
  },
  {
    id: "fire_spreads_to_flammable_neighbor",
    priority: 35,
    inputs: ["fire", "flammable_neighbor"],
    outputs: ["spreading_fire", "smoke"],
    status_effects: [{ status_id: "burn", duration: 2, magnitude: 1 }],
  },
  {
    id: "fire_vaporizes_poison",
    priority: 40,
    inputs: ["poison", "fire"],
    outputs: ["poison_gas", "toxic_smoke"],
    status_effects: [{ status_id: "poison", duration: 3, magnitude: 2 }],
  },
  {
    id: "smoke_diffuses_to_neighbor",
    priority: 45,
    inputs: ["smoke", "open_neighbor"],
    outputs: ["smoke"],
  },
  {
    id: "poison_gas_diffuses_to_neighbor",
    priority: 46,
    inputs: ["poison_gas", "open_neighbor"],
    outputs: ["poison_gas"],
    status_effects: [{ status_id: "poison", duration: 3, magnitude: 1 }],
  },
  {
    id: "acid_corroded_material",
    priority: 50,
    inputs: ["acid", "material"],
    outputs: ["corrosion", "acid_fumes"],
    status_effects: [{ status_id: "weaken", duration: 2, magnitude: 1 }],
  },
];

export interface ImmersiveLiquidLayerState {
  kind: string;
  volume: number;
  temperature: number;
  slipperiness: number;
}

export interface ImmersiveGasLayerState {
  kind: string;
  density: number;
  visibility_modifier: number;
}

export interface ImmersiveTileLayerCellState {
  map_id: string;
  cell: [number, number];
  material_id?: string;
  terrain?: string;
  temperature: number;
  ambient_temperature: number;
  liquid?: ImmersiveLiquidLayerState;
  gas?: ImmersiveGasLayerState;
  light: number;
  sound: number;
  occlusion: number;
  blocks_movement: boolean;
  blocks_vision: boolean;
  surface_kinds: string[];
  environment_kinds: string[];
}

export interface ImmersiveTileLayerSnapshot {
  map_id: string;
  generated_at_tick: number;
  cells: ImmersiveTileLayerCellState[];
  totals: {
    temperature_cells: number;
    liquid_cells: number;
    gas_cells: number;
    lit_cells: number;
    sound_cells: number;
    occluding_cells: number;
    max_temperature: number;
    min_temperature: number;
  };
}

export interface ImmersiveSchedulerEvent {
  type: "EndAction" | "EndSegment" | "EndTurn";
  tick: number;
  segment: number;
  turn: number;
  actor_id?: string;
  action_type?: string;
  energy_cost?: number;
}

export interface ImmersiveSchedulerAdvanceResult {
  ok: boolean;
  reason?: string;
  scheduler: ImmersiveSchedulerStateRecord;
  events: ImmersiveSchedulerEvent[];
}

export interface ImmersiveStage2Snapshot {
  map_id: string;
  generated_at_tick: number;
  tile_layers: ImmersiveTileLayerSnapshot;
  scheduler: ImmersiveSchedulerStateRecord;
}

export interface ImmersiveStage2SaveAdvanceResult {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  snapshot: ImmersiveStage2Snapshot;
  events: ImmersiveSchedulerEvent[];
}

export interface ImmersiveReactionRecord {
  rule_id: string;
  priority: number;
  cell: [number, number];
  consumed: string[];
  produced: string[];
  tick: number;
}

export interface ImmersiveReactionRuleDefinition {
  id: string;
  priority: number;
  inputs: string[];
  outputs: string[];
  status_effects?: { status_id: string; duration: number; magnitude: number }[];
}

export interface ImmersiveReactionStatusApplication {
  actor_id: string;
  status_id: string;
  duration: number;
  magnitude: number;
  cell: [number, number];
  rule_id: string;
}

export interface ImmersiveReactionResolveResult {
  snapshot: ImmersiveStage2Snapshot;
  reactions: ImmersiveReactionRecord[];
}

export interface ImmersiveReactionSaveResult extends ImmersiveReactionResolveResult {
  save: PlaySave;
  world_facts: PlaySaveWorldFact[];
  environment_fields: SimulationEnvironmentFieldRecord[];
  surface_layers: SimulationSurfaceLayerRecord[];
  condition_records: SimulationConditionRecord[];
  status_applications: ImmersiveReactionStatusApplication[];
}

export type ImmersiveAlertnessState = "oblivious" | "suspicious" | "searching" | "combat";

export type ImmersiveDetectionCause =
  | "direct_sight"
  | "carried_light_exposure"
  | "heard"
  | "light_sensitivity"
  | "glass_sensitivity"
  | "environmental_danger"
  | "ally_alert";

export interface ImmersivePerceptionStimulus {
  kind: "light" | "sound" | "fire" | "smoke" | "danger_gas" | "visible_player";
  cell: [number, number];
  intensity: number;
  radius: number;
  tag?: string;
  tags?: string[];
  tick?: number;
  source_id?: string;
  source_actor_id?: string;
  source_action?: string;
  owner_id?: string;
  mobility?: "fixed" | "carried" | "placed" | "thrown" | "environmental";
}

export interface ImmersivePerceptionAlertRecord {
  actor_id: string;
  entity_id: string;
  cell: [number, number];
  alertness: ImmersiveAlertnessState;
  score: number;
  stimulus: ImmersivePerceptionStimulus;
  target_cell: [number, number];
  sensory_profile_id?: string;
  sense_id?: string;
  cause?: ImmersiveDetectionCause;
  evidence_tick?: number;
  tracks_live_target?: boolean;
  target_actor_id?: string;
}

export interface ImmersiveStage4PerceptionSnapshot {
  map_id: string;
  generated_at_tick: number;
  stimuli: ImmersivePerceptionStimulus[];
  alerts: ImmersivePerceptionAlertRecord[];
  totals: {
    stimuli: number;
    alerted_actors: number;
    suspicious: number;
    searching: number;
    combat: number;
  };
}

export interface ImmersiveStage4PerceptionAdvanceResult {
  save: PlaySave;
  snapshot: ImmersiveStage4PerceptionSnapshot;
  world_facts: PlaySaveWorldFact[];
  npc_tasks: SimulationNpcTaskRecord[];
  decayed_alerts: ImmersivePerceptionAlertRecord[];
  scheduler_events: ImmersiveSchedulerEvent[];
}

export type ImmersiveGlobalVerbKind =
  | "push"
  | "pull"
  | "throw"
  | "drop"
  | "stack"
  | "climb"
  | "burn"
  | "douse"
  | "freeze"
  | "break"
  | "hack"
  | "wet"
  | "electrify"
  | "foam"
  | "mimic";

export const IMMERSIVE_GLOBAL_VERBS = [
  "push",
  "pull",
  "throw",
  "drop",
  "stack",
  "climb",
  "burn",
  "douse",
  "freeze",
  "break",
  "hack",
  "wet",
  "electrify",
  "foam",
  "mimic",
] as const satisfies readonly ImmersiveGlobalVerbKind[];

export interface ImmersiveGlobalVerbOptions {
  verb: ImmersiveGlobalVerbKind;
  cell: [number, number];
  mapId?: string;
  actorId?: string;
  targetId?: string;
  targetCell?: [number, number];
  direction?: [number, number];
  distance?: number;
  itemId?: string;
  count?: number;
  intensity?: number;
}

export interface ImmersiveGlobalVerbResult {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  verb: ImmersiveGlobalVerbOptions;
  world_facts: PlaySaveWorldFact[];
  environment_fields: SimulationEnvironmentFieldRecord[];
  surface_layers: SimulationSurfaceLayerRecord[];
  condition_records: SimulationConditionRecord[];
  reactions: ImmersiveReactionRecord[];
}

export interface ImmersiveCombatForcedMovementOptions {
  mapId?: string;
  actorId?: string;
  targetActorId: string;
  direction: [number, number];
  distance?: number;
  energyCost?: number;
  segments?: number;
}

export interface ImmersiveCombatForcedMovementResult {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  actor_id: string;
  target_actor_id: string;
  from?: [number, number];
  to?: [number, number];
  path: [number, number][];
  hazard_damage: number;
  hazard_sources: string[];
  reactions: ImmersiveReactionRecord[];
  status_applications: ImmersiveReactionStatusApplication[];
  overwatch_triggers: ImmersiveCombatOverwatchTrigger[];
  world_facts: PlaySaveWorldFact[];
  scheduler_events: ImmersiveSchedulerEvent[];
}

export type ImmersiveCombatTeam = "player" | "ally" | "hostile" | "neutral";
export type ImmersiveCombatCoverStrength = "half" | "full";

export interface ImmersiveCombatActorSnapshot {
  actor_id: string;
  entity_id?: string;
  team: ImmersiveCombatTeam;
  cell: [number, number];
  facing: [number, number];
  hp: number;
  max_hp: number;
  height: number;
  statuses: { id: string; remaining: number; magnitude: number }[];
  overwatch: boolean;
}

export interface ImmersiveCombatCoverEdge {
  cell: [number, number];
  direction: [number, number];
  strength: ImmersiveCombatCoverStrength;
  source_kind: "terrain" | "object" | "container";
  source_id: string;
}

export interface ImmersiveCombatOverwatchZone {
  actor_id: string;
  origin_cell: [number, number];
  radius: number;
  cells: [number, number][];
}

export interface ImmersiveCombatIntentRecord {
  actor_id: string;
  action_type: "melee_attack" | "ranged_attack" | "advance" | "overwatch";
  target_actor_id?: string;
  target_cells: [number, number][];
  estimated_damage: number;
  priority: number;
}

export interface ImmersiveStage6TacticalSnapshot {
  map_id: string;
  generated_at_tick: number;
  actors: ImmersiveCombatActorSnapshot[];
  cover_edges: ImmersiveCombatCoverEdge[];
  overwatch_zones: ImmersiveCombatOverwatchZone[];
  intents: ImmersiveCombatIntentRecord[];
  totals: {
    actors: number;
    cover_edges: number;
    overwatch_zones: number;
    telegraphed_intents: number;
  };
}

export interface ImmersiveCombatOverwatchTrigger {
  actor_id: string;
  target_actor_id: string;
  cell: [number, number];
  damage: number;
}

export interface ImmersiveCombatAttackOptions {
  mapId?: string;
  actorId?: string;
  targetActorId: string;
  baseDamage?: number;
  range?: number;
  energyCost?: number;
}

export interface ImmersiveCombatAttackResult {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  actor_id: string;
  target_actor_id: string;
  damage: number;
  mitigated_damage: number;
  cover?: ImmersiveCombatCoverEdge;
  flanked: boolean;
  height_delta: number;
  facing_bonus: number;
  height_bonus: number;
  cover_reduction: number;
  defeated: boolean;
  world_facts: PlaySaveWorldFact[];
  scheduler_events: ImmersiveSchedulerEvent[];
}

export interface ImmersiveSpatialInventoryItem {
  item_id: string;
  display_name: string;
  count: number;
  weight_per_item_kg: number;
  total_weight_kg: number;
  bulk_per_item: number;
  slots_per_item: number;
  total_slots: number;
  shape: [number, number][];
  placed_cells: [number, number][];
  overflow_slots: number;
  world_object_instance_id: string;
}

export interface ImmersiveSpatialInventorySnapshot {
  actor_id: string;
  grid_size: [number, number];
  capacity_slots: number;
  used_slots: number;
  overflow_slots: number;
  total_weight_kg: number;
  max_carry_weight_kg: number;
  overweight_kg: number;
  ap_penalty: number;
  effective_standard_action_energy: number;
  items: ImmersiveSpatialInventoryItem[];
  world_object_refs: {
    instance_id: string;
    item_id: string;
    holder_id: string;
    count: number;
    total_weight_kg: number;
    total_slots: number;
  }[];
}

export interface ImmersiveSpatialInventoryOptions {
  actorId?: string;
  gridSize?: [number, number];
  maxCarryWeightKg?: number;
}

export interface ImmersiveWorldPassiveCheckDefinition {
  id: string;
  stat: "level" | "hp_percent" | "money" | "inventory_weight" | "faction_rep" | "flag";
  difficulty: number;
  modifier?: number;
  factionId?: string;
  flagId?: string;
  denial?: boolean;
}

export interface ImmersiveWorldStateEvaluationOptions extends ImmersiveSpatialInventoryOptions {
  mapId?: string;
  cell?: [number, number];
  regionFactions?: Record<string, string>;
  reputationThreshold?: number;
  passiveChecks?: ImmersiveWorldPassiveCheckDefinition[];
}

export interface ImmersiveWorldStateGateResult {
  id: string;
  kind: "region_reputation" | "survival" | "passive_check" | "inventory_load";
  passed: boolean;
  severity: "info" | "warning" | "deny";
  reason: string;
  score?: number;
  difficulty?: number;
}

export interface ImmersiveWorldConsequenceRecord {
  id: string;
  kind: "region_denied" | "survival_crisis" | "passive_denial" | "inventory_overflow";
  flag_id: string;
  irreversible: boolean;
  reason: string;
}

export interface ImmersiveWorldStateEvaluation {
  map_id: string;
  region_id: string;
  cell: [number, number];
  generated_at_tick: number;
  permitted: boolean;
  gates: ImmersiveWorldStateGateResult[];
  denials: ImmersiveWorldStateGateResult[];
  consequences: ImmersiveWorldConsequenceRecord[];
  inventory: ImmersiveSpatialInventorySnapshot;
  survival: {
    hunger: number;
    thirst: number;
    fatigue: number;
    exposure: number;
  };
}

export interface ImmersiveWorldStateAdvanceOptions extends ImmersiveWorldStateEvaluationOptions {
  survivalDelta?: {
    hunger?: number;
    thirst?: number;
    fatigue?: number;
    exposure?: number;
  };
}

export interface ImmersiveWorldStateAdvanceResult {
  save: PlaySave;
  evaluation: ImmersiveWorldStateEvaluation;
  world_facts: PlaySaveWorldFact[];
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const cloneCell = (cell: [number, number]): [number, number] => [cell[0], cell[1]];

const cellKey = coordKey;

const orthogonalNeighborCells = (cell: [number, number]): [number, number][] => [
  ...FINE_CARDINAL_DIRECTIONS.map(([dx, dz]) => [cell[0] + dx, cell[1] + dz] as [number, number]),
];

const cloneTileLayerCell = (cell: ImmersiveTileLayerCellState): ImmersiveTileLayerCellState => ({
  ...cell,
  cell: cloneCell(cell.cell),
  liquid: cell.liquid ? { ...cell.liquid } : undefined,
  gas: cell.gas ? { ...cell.gas } : undefined,
  surface_kinds: [...cell.surface_kinds],
  environment_kinds: [...cell.environment_kinds],
});

const tileLayerTotals = (cells: ImmersiveTileLayerCellState[]): ImmersiveTileLayerSnapshot["totals"] => {
  const temperatures = cells.map((cell) => cell.temperature);
  return {
    temperature_cells: cells.filter((cell) => cell.temperature !== cell.ambient_temperature).length,
    liquid_cells: cells.filter((cell) => Boolean(cell.liquid)).length,
    gas_cells: cells.filter((cell) => Boolean(cell.gas)).length,
    lit_cells: cells.filter((cell) => cell.light > 0).length,
    sound_cells: cells.filter((cell) => cell.sound > 0).length,
    occluding_cells: cells.filter((cell) => cell.occlusion > 0).length,
    max_temperature: temperatures.length ? Math.max(...temperatures) : IMMERSIVE_AMBIENT_TEMPERATURE,
    min_temperature: temperatures.length ? Math.min(...temperatures) : IMMERSIVE_AMBIENT_TEMPERATURE,
  };
};

const isLiquidSurface = (kind: string) =>
  kind === "water" || kind === "oil" || kind === "blood" || kind === "poison" || kind === "acid";

const liquidSlipperiness = (kind: string) => {
  if (kind === "oil") return 0.8;
  if (kind === "acid") return 0.15;
  if (kind === "blood" || kind === "poison") return 0.35;
  if (kind === "water") return 0.2;
  return 0;
};

const temperatureForCell = (cell: SimulationCellState): number => {
  const fire = cell.environment.filter((field) => field.kind === "fire");
  if (fire.length) return 350 + fire.reduce((max, field) => Math.max(max, field.intensity), 0) * 250;
  if (cell.surface_tag === "firehazard" || cell.hazard?.toLowerCase().includes("ember")) return 350;
  if (cell.condition.state === "burned") return 320;
  if (cell.condition.state === "frozen" || cell.surface_tag === "ice") return 0;
  if (cell.condition.state === "wet" || cell.surfaces.some((surface) => surface.kind === "water")) return 20;
  return IMMERSIVE_AMBIENT_TEMPERATURE;
};

export const relaxTemperatureTowardAmbient = (
  temperature: number,
  ambient = IMMERSIVE_AMBIENT_TEMPERATURE,
  ticks = 1,
): number => {
  let next = temperature;
  for (let i = 0; i < Math.max(0, Math.floor(ticks)); i += 1) {
    const diff = next - ambient;
    if (Math.abs(diff) <= 0.001) return ambient;
    const step = Math.max(Math.abs(diff) / 50, 5);
    next = Math.abs(diff) <= step ? ambient : next - Math.sign(diff) * step;
  }
  return Number(next.toFixed(4));
};

const tileLayerCellFromSimulation = (cell: SimulationCellState): ImmersiveTileLayerCellState => {
  const liquidSurface = cell.surfaces.find((surface) => isLiquidSurface(surface.kind));
  const smoke = cell.environment.find((field) => field.kind === "smoke");
  const light = cell.environment
    .filter((field) => field.kind === "light")
    .reduce((max, field) => Math.max(max, field.intensity), 0);
  const sound = cell.environment
    .filter((field) => field.kind === "sound")
    .reduce((max, field) => Math.max(max, field.intensity), 0);
  const fireLight = cell.environment
    .filter((field) => field.kind === "fire")
    .reduce((max, field) => Math.max(max, field.intensity), 0);
  return {
    map_id: cell.map_id,
    cell: cloneCell(cell.cell),
    material_id: cell.material_id,
    terrain: cell.terrain,
    temperature: temperatureForCell(cell),
    ambient_temperature: IMMERSIVE_AMBIENT_TEMPERATURE,
    liquid: liquidSurface
      ? {
          kind: liquidSurface.kind,
          volume: Math.max(0, liquidSurface.amount),
          temperature: liquidSurface.kind === "water" ? 20 : temperatureForCell(cell),
          slipperiness: liquidSurface.slipperiness ?? liquidSlipperiness(liquidSurface.kind),
        }
      : undefined,
    gas: smoke
      ? {
          kind: smoke.kind,
          density: clamp(smoke.intensity, 0, 1),
          visibility_modifier: smoke.visibility_modifier ?? -0.25,
        }
      : undefined,
    light: Math.max(light, fireLight),
    sound,
    occlusion: cell.blocks_vision ? 1 : Math.max(0, Math.abs(smoke?.visibility_modifier || 0)),
    blocks_movement: cell.blocks_movement,
    blocks_vision: cell.blocks_vision,
    surface_kinds: cell.surfaces.map((surface) => surface.kind),
    environment_kinds: cell.environment.map((field) => field.kind),
  };
};

export const createImmersiveTileLayerSnapshot = (
  simulation: SimulationMapSnapshot,
  savedLayers: Record<string, ImmersiveTileLayerRecord> = {},
): ImmersiveTileLayerSnapshot => {
  const cells = simulation.cells.map((cell) => {
    const base = tileLayerCellFromSimulation(cell);
    const saved = savedLayers[cellKey(base.cell)];
    return saved
      ? {
          ...base,
          ...saved,
          cell: cloneCell(saved.cell),
          liquid: saved.liquid ? { ...saved.liquid } : undefined,
          gas: saved.gas ? { ...saved.gas } : undefined,
          surface_kinds: [...(saved.surface_kinds || base.surface_kinds)],
          environment_kinds: [...(saved.environment_kinds || base.environment_kinds)],
        }
      : base;
  });
  return {
    map_id: simulation.map_id,
    generated_at_tick: simulation.generated_at_tick,
    cells,
    totals: tileLayerTotals(cells),
  };
};

const tileLayerRecordFromCell = (
  cell: ImmersiveTileLayerCellState,
  tick: number,
): ImmersiveTileLayerRecord => ({
  cell: cloneCell(cell.cell),
  material_id: cell.material_id,
  terrain: cell.terrain,
  temperature: cell.temperature,
  ambient_temperature: cell.ambient_temperature,
  liquid: cell.liquid ? { ...cell.liquid } : undefined,
  gas: cell.gas ? { ...cell.gas } : undefined,
  light: cell.light,
  sound: cell.sound,
  occlusion: cell.occlusion,
  blocks_movement: cell.blocks_movement,
  blocks_vision: cell.blocks_vision,
  surface_kinds: [...cell.surface_kinds],
  environment_kinds: [...cell.environment_kinds],
  updated_at_tick: tick,
});

const isDynamicTileLayerCell = (cell: ImmersiveTileLayerCellState): boolean =>
  cell.temperature !== cell.ambient_temperature ||
  Boolean(cell.liquid) ||
  Boolean(cell.gas) ||
  cell.light > 0 ||
  cell.sound > 0 ||
  cell.occlusion > 0;

export const createImmersiveTileLayerRecords = (
  snapshot: ImmersiveTileLayerSnapshot,
): Record<string, ImmersiveTileLayerRecord> =>
  Object.fromEntries(
    snapshot.cells
      .filter(isDynamicTileLayerCell)
      .map((cell) => [cellKey(cell.cell), tileLayerRecordFromCell(cell, snapshot.generated_at_tick)]),
  );

export const writeImmersiveTileLayerSnapshotToSave = (
  save: PlaySave,
  snapshot: ImmersiveTileLayerSnapshot,
): PlaySave => ({
  ...save,
  immersive_tile_layers: {
    ...(save.immersive_tile_layers || {}),
    [snapshot.map_id]: createImmersiveTileLayerRecords(snapshot),
  },
});

const clearImmersiveTileLayerCellsFromSave = (
  save: PlaySave,
  mapId: string,
  cells: [number, number][],
): PlaySave => {
  const layersForMap = save.immersive_tile_layers?.[mapId];
  if (!layersForMap) return save;
  const nextLayersForMap = { ...layersForMap };
  cells.forEach((cell) => {
    delete nextLayersForMap[cellKey(cell)];
  });
  return {
    ...save,
    immersive_tile_layers: {
      ...(save.immersive_tile_layers || {}),
      [mapId]: nextLayersForMap,
    },
  };
};

const cloneScheduler = (scheduler: ImmersiveSchedulerStateRecord): ImmersiveSchedulerStateRecord => ({
  tick: Math.max(0, Math.floor(scheduler.tick || 0)),
  segment: Math.max(0, Math.floor(scheduler.segment || 0)),
  turn: Math.max(0, Math.floor(scheduler.turn || 0)),
  actors: [...(scheduler.actors || [])].map((actor) => ({
    ...actor,
    speed: Math.max(0, Number(actor.speed || 0)),
    energy: Math.max(0, Math.floor(actor.energy || 0)),
  })),
});

export const createImmersiveSchedulerStateFromV1 = (
  gamePackage: GamePackage,
  save: PlaySave,
): ImmersiveSchedulerStateRecord => {
  if (save.immersive_scheduler) return cloneScheduler(save.immersive_scheduler);
  const map = gamePackage.maps.find((candidate) => candidate.id === save.current_map_id) || gamePackage.maps[0];
  const runtimeEntities = new Map<string, string | undefined>();
  const placedEntityIds = new Set<string>();
  (map?.entity_placements || []).forEach((placement, index) => {
    runtimeEntities.set(entityPlacementStateKey(map.id, placement, index), placement.entity_id);
    placedEntityIds.add(placement.entity_id);
  });
  (save.party_members || []).forEach((entityId) => {
    if (!placedEntityIds.has(entityId)) runtimeEntities.set(entityId, entityId);
  });
  Object.keys(save.entity_states || {}).forEach((actorId) => {
    // A definition-keyed state is the compatibility fallback for a placed
    // actor. Do not schedule it as a second copy of that placement.
    if (!runtimeEntities.has(actorId) && !placedEntityIds.has(actorId)) {
      runtimeEntities.set(
        actorId,
        gamePackage.entities.some((candidate) => candidate.id === actorId) ? actorId : undefined,
      );
    }
  });
  const actors = [
    {
      id: "player",
      actor_kind: "player",
      speed: Math.max(1, save.playerStats.speed || 10),
      energy: Math.max(0, Math.floor(save.playerStats.energy || 0)),
    },
    ...[...runtimeEntities.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([id, entityId]) => {
      const entity = gamePackage.entities.find((candidate) => candidate.id === entityId);
      const state = save.entity_states?.[id] || (entityId ? save.entity_states?.[entityId] : undefined) || {};
      if (state.hidden) return [];
      return [{
        id,
        actor_kind: entity?.is_npc ? "npc" : "party",
        speed: Math.max(1, Number(state.speed || entity?.speed || 10)),
        energy: Math.max(0, Math.floor(Number(state.energy || 0))),
      }];
    }),
  ];
  return {
    tick: Math.max(0, Math.floor(save.clock_minutes || 0)),
    segment: 0,
    turn: 0,
    actors,
  };
};

export const advanceImmersiveScheduler = (
  scheduler: ImmersiveSchedulerStateRecord,
  options: {
    segments?: number;
    action?: { actor_id: string; action_type: string; energy_cost?: number };
  } = {},
): ImmersiveSchedulerAdvanceResult => {
  let next = cloneScheduler(scheduler);
  const events: ImmersiveSchedulerEvent[] = [];
  if (options.action) {
    const actor = next.actors.find((candidate) => candidate.id === options.action?.actor_id);
    const cost = Math.max(0, Math.floor(options.action.energy_cost ?? IMMERSIVE_STANDARD_ACTION_ENERGY));
    if (!actor) return { ok: false, reason: "unknown actor", scheduler: next, events };
    if (actor.energy < cost) return { ok: false, reason: "insufficient energy", scheduler: next, events };
    actor.energy -= cost;
    events.push({
      type: "EndAction",
      tick: next.tick,
      segment: next.segment,
      turn: next.turn,
      actor_id: actor.id,
      action_type: options.action.action_type,
      energy_cost: cost,
    });
  }

  const segments = Math.max(0, Math.floor(options.segments || 0));
  for (let i = 0; i < segments; i += 1) {
    next = {
      ...next,
      tick: next.tick + 1,
      segment: next.segment + 1,
      actors: next.actors.map((actor) => ({
        ...actor,
        energy: actor.energy + Math.max(0, Math.floor(actor.speed * IMMERSIVE_ENERGY_PER_SPEED_PER_SEGMENT)),
      })),
    };
    events.push({ type: "EndSegment", tick: next.tick, segment: next.segment, turn: next.turn });
    if (next.segment % IMMERSIVE_SEGMENTS_PER_TURN === 0) {
      next = { ...next, turn: next.turn + 1 };
      events.push({ type: "EndTurn", tick: next.tick, segment: next.segment, turn: next.turn });
    }
  }

  return { ok: true, scheduler: next, events };
};

export const advanceImmersiveTileLayerSnapshot = (
  snapshot: ImmersiveTileLayerSnapshot,
  ticks: number,
): ImmersiveTileLayerSnapshot => {
  const cells = snapshot.cells.map((cell) => ({
    ...cell,
    temperature: relaxTemperatureTowardAmbient(cell.temperature, cell.ambient_temperature, ticks),
    liquid: cell.liquid
      ? {
          ...cell.liquid,
          temperature: relaxTemperatureTowardAmbient(cell.liquid.temperature, cell.ambient_temperature, ticks),
        }
      : undefined,
  }));
  return {
    ...snapshot,
    cells,
    totals: tileLayerTotals(cells),
  };
};

export const createImmersiveStage2SnapshotFromV1 = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id || gamePackage.metadata.start_map_id,
): ImmersiveStage2Snapshot => {
  const simulation = createSimulationSnapshotFromV1(gamePackage, save, mapId);
  return {
    map_id: simulation.map_id,
    generated_at_tick: simulation.generated_at_tick,
    tile_layers: createImmersiveTileLayerSnapshot(simulation, save.immersive_tile_layers?.[simulation.map_id] || {}),
    scheduler: createImmersiveSchedulerStateFromV1(gamePackage, save),
  };
};

export const advanceImmersiveStage2Snapshot = (
  snapshot: ImmersiveStage2Snapshot,
  options: Parameters<typeof advanceImmersiveScheduler>[1] = {},
): { snapshot: ImmersiveStage2Snapshot; events: ImmersiveSchedulerEvent[]; ok: boolean; reason?: string } => {
  const scheduler = advanceImmersiveScheduler(snapshot.scheduler, options);
  return {
    ok: scheduler.ok,
    reason: scheduler.reason,
    events: scheduler.events,
    snapshot: {
      ...snapshot,
      generated_at_tick: scheduler.scheduler.tick,
      scheduler: scheduler.scheduler,
      tile_layers: advanceImmersiveTileLayerSnapshot(snapshot.tile_layers, options.segments || 0),
    },
  };
};

export const advanceImmersiveStage2Save = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: Parameters<typeof advanceImmersiveScheduler>[1] & { mapId?: string } = {},
): ImmersiveStage2SaveAdvanceResult => {
  const snapshot = createImmersiveStage2SnapshotFromV1(gamePackage, save, options.mapId);
  const advanced = advanceImmersiveStage2Snapshot(snapshot, options);
  if (!advanced.ok) {
    return { ok: false, reason: advanced.reason, save, snapshot: advanced.snapshot, events: advanced.events };
  }
  const playerActor = advanced.snapshot.scheduler.actors.find((actor) => actor.id === "player");
  const activeMap = gamePackage.maps.find(
    (candidate) => candidate.id === (options.mapId || save.current_map_id),
  );
  const entityIdByStateKey = new Map<string, string>();
  (activeMap?.entity_placements || []).forEach((placement, index) => {
    entityIdByStateKey.set(
      entityPlacementStateKey(activeMap!.id, placement, index),
      placement.entity_id,
    );
  });
  const entityEnergy = Object.fromEntries(
    advanced.snapshot.scheduler.actors
      .filter((actor) => actor.id !== "player")
      .map((actor) => [actor.id, actor.energy]),
  );
  const nextSave = writeImmersiveTileLayerSnapshotToSave({
    ...save,
    clock_minutes: advanced.snapshot.scheduler.tick,
    playerStats: {
      ...save.playerStats,
      energy: playerActor ? playerActor.energy : save.playerStats.energy,
    },
    entity_states: {
      ...(save.entity_states || {}),
      ...Object.fromEntries(
        Object.entries(entityEnergy).map(([id, energy]) => [
          id,
          {
            ...(save.entity_states?.[id] ||
              save.entity_states?.[entityIdByStateKey.get(id) || ""] ||
              {}),
            energy,
          },
        ]),
      ),
    },
    immersive_scheduler: advanced.snapshot.scheduler,
  }, advanced.snapshot.tile_layers);
  return { ok: true, save: nextSave, snapshot: advanced.snapshot, events: advanced.events };
};

const hasEnvironment = (cell: ImmersiveTileLayerCellState, kind: string) =>
  cell.environment_kinds.includes(kind);

const hasFire = (cell: ImmersiveTileLayerCellState) =>
  hasEnvironment(cell, "fire") || cell.temperature >= 350;

const hasElectricity = (cell: ImmersiveTileLayerCellState) =>
  hasEnvironment(cell, "electricity") || hasEnvironment(cell, "shock") || hasEnvironment(cell, "conductive_electricity");

const hasCold = (cell: ImmersiveTileLayerCellState) =>
  hasEnvironment(cell, "cold") || hasEnvironment(cell, "freeze") || hasEnvironment(cell, "frost") || cell.temperature <= 0;

const hasIce = (cell: ImmersiveTileLayerCellState) =>
  cell.surface_kinds.some((kind) => kind === "ice" || kind === "frozen");

const isWetCell = (cell: ImmersiveTileLayerCellState) =>
  cell.liquid?.kind === "water" || cell.surface_kinds.some((kind) => kind === "water" || kind === "doused");

const isFlammableCell = (cell: ImmersiveTileLayerCellState) =>
  cell.liquid?.kind === "oil" ||
  cell.surface_kinds.some((kind) => kind === "oil" || kind === "firehazard") ||
  cell.material_id === "sim_mat_wood" ||
  cell.material_id === "sim_mat_cloth";

const withEnvironmentKind = (cell: ImmersiveTileLayerCellState, kind: string): ImmersiveTileLayerCellState => ({
  ...cell,
  environment_kinds: cell.environment_kinds.includes(kind) ? cell.environment_kinds : [...cell.environment_kinds, kind],
});

const withoutEnvironmentKinds = (
  cell: ImmersiveTileLayerCellState,
  kinds: string[],
): ImmersiveTileLayerCellState => ({
  ...cell,
  environment_kinds: cell.environment_kinds.filter((kind) => !kinds.includes(kind)),
});

const withoutSurfaceKinds = (
  cell: ImmersiveTileLayerCellState,
  kinds: string[],
): ImmersiveTileLayerCellState => ({
  ...cell,
  surface_kinds: cell.surface_kinds.filter((kind) => !kinds.includes(kind)),
});

const withSurfaceKind = (cell: ImmersiveTileLayerCellState, kind: string): ImmersiveTileLayerCellState => ({
  ...cell,
  surface_kinds: cell.surface_kinds.includes(kind) ? cell.surface_kinds : [...cell.surface_kinds, kind],
});

const withGas = (
  cell: ImmersiveTileLayerCellState,
  gas: ImmersiveGasLayerState,
): ImmersiveTileLayerCellState => {
  const density = Math.max(cell.gas?.density || 0, gas.density);
  return {
    ...cell,
    gas: { ...gas, density },
    occlusion: Math.max(cell.occlusion, Math.abs(gas.visibility_modifier) * density),
  };
};

const reactionRule = (id: string) =>
  IMMERSIVE_REACTION_RULES.find((rule) => rule.id === id);

const priorityForRule = (id: string, fallback: number) =>
  reactionRule(id)?.priority ?? fallback;

const reactionRecord = (
  rule_id: string,
  priority: number,
  cell: ImmersiveTileLayerCellState,
  consumed: string[],
  produced: string[],
  tick: number,
): ImmersiveReactionRecord => ({
  rule_id,
  priority,
  cell: cloneCell(cell.cell),
  consumed,
  produced,
  tick,
});

const applyPropagationReactions = (
  cells: ImmersiveTileLayerCellState[],
  reactions: ImmersiveReactionRecord[],
  tick: number,
): ImmersiveTileLayerCellState[] => {
  const byKey = new Map(cells.map((cell) => [cellKey(cell.cell), cloneTileLayerCell(cell)]));
  const sortedSources = [...byKey.values()].sort((a, b) => a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1]);

  sortedSources.forEach((source) => {
    if (!hasFire(source)) return;
    orthogonalNeighborCells(source.cell).forEach((neighborCell) => {
      const key = cellKey(neighborCell);
      const neighbor = byKey.get(key);
      if (!neighbor || hasFire(neighbor) || !isFlammableCell(neighbor)) return;
      reactions.push(reactionRecord(
        "fire_spreads_to_flammable_neighbor",
        priorityForRule("fire_spreads_to_flammable_neighbor", 35),
        neighbor,
        ["fire", neighbor.liquid?.kind || neighbor.material_id || "flammable_neighbor"],
        ["spreading_fire", "smoke"],
        tick,
      ));
      byKey.set(key, withEnvironmentKind(withGas({
        ...neighbor,
        temperature: Math.max(neighbor.temperature, 420),
        light: Math.max(neighbor.light, 0.7),
        sound: Math.max(neighbor.sound, 0.2),
      }, { kind: "smoke", density: Math.max(neighbor.gas?.density || 0, 0.35), visibility_modifier: -0.2 }), "fire"));
    });
  });

  sortedSources.forEach((source) => {
    if (!isWetCell(source) || !hasElectricity(source)) return;
    orthogonalNeighborCells(source.cell).forEach((neighborCell) => {
      const key = cellKey(neighborCell);
      const neighbor = byKey.get(key);
      if (!neighbor || !isWetCell(neighbor) || hasElectricity(neighbor)) return;
      reactions.push(reactionRecord(
        "electricity_chains_through_wet_cell",
        priorityForRule("electricity_chains_through_wet_cell", 31),
        neighbor,
        ["conductive_electricity", "wet_cell"],
        ["conductive_electricity"],
        tick,
      ));
      byKey.set(key, withEnvironmentKind({
        ...neighbor,
        light: Math.max(neighbor.light, 0.28),
        sound: Math.max(neighbor.sound, 0.2),
      }, "conductive_electricity"));
    });
  });

  sortedSources.forEach((source) => {
    if (!source.gas || source.gas.density < 0.45 || source.blocks_vision) return;
    const gasKind = source.gas.kind;
    const ruleId =
      gasKind === "poison_gas"
        ? "poison_gas_diffuses_to_neighbor"
        : gasKind === "smoke" || gasKind === "steam"
          ? "smoke_diffuses_to_neighbor"
          : undefined;
    if (!ruleId) return;
    orthogonalNeighborCells(source.cell).forEach((neighborCell) => {
      const key = cellKey(neighborCell);
      const neighbor = byKey.get(key);
      if (!neighbor || neighbor.blocks_vision || (neighbor.gas?.density || 0) >= source.gas!.density * 0.75) return;
      const density = Number((source.gas!.density * 0.55).toFixed(4));
      reactions.push(reactionRecord(
        ruleId,
        priorityForRule(ruleId, gasKind === "poison_gas" ? 46 : 45),
        neighbor,
        [gasKind, "open_neighbor"],
        [gasKind],
        tick,
      ));
      byKey.set(key, withGas(neighbor, {
        kind: gasKind,
        density,
        visibility_modifier: source.gas!.visibility_modifier,
      }));
    });
  });

  return [...byKey.values()].sort((a, b) => a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1]);
};

export const resolveImmersiveReactions = (
  snapshot: ImmersiveStage2Snapshot,
): ImmersiveReactionResolveResult => {
  const reactions: ImmersiveReactionRecord[] = [];
  const cells = snapshot.tile_layers.cells
    .slice()
    .sort((a, b) => a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1])
    .map((cell) => {
      let next = cloneTileLayerCell(cell);

      if (hasIce(next) && hasFire(next)) {
        reactions.push(reactionRecord("fire_melts_ice_to_water", priorityForRule("fire_melts_ice_to_water", 15), next, ["ice", "fire"], ["water", "steam", "melted"], snapshot.generated_at_tick));
        next = withSurfaceKind(withEnvironmentKind(withGas(withoutSurfaceKinds(withoutEnvironmentKinds({
          ...next,
          temperature: 35,
          liquid: {
            kind: "water",
            volume: Math.max(next.liquid?.volume || 0, 0.55),
            temperature: 35,
            slipperiness: 0.22,
          },
          light: 0,
          sound: Math.max(next.sound, 0.12),
          occlusion: Math.max(next.occlusion, 0.25),
        }, ["fire", "light", "cold", "freeze", "frost"]), ["ice", "frozen"]), {
          kind: "steam",
          density: Math.max(next.gas?.density || 0, 0.45),
          visibility_modifier: -0.24,
        }), "steam"), "doused");
      } else if (next.liquid?.kind === "water" && hasFire(next)) {
        reactions.push(reactionRecord("water_extinguishes_fire_to_steam", priorityForRule("water_extinguishes_fire_to_steam", 10), next, ["water", "fire"], ["steam"], snapshot.generated_at_tick));
        next = withEnvironmentKind(withoutEnvironmentKinds({
          ...next,
          temperature: 95,
          liquid: { ...next.liquid, volume: Math.max(0, next.liquid.volume - 0.35), temperature: 95 },
          gas: { kind: "steam", density: Math.max(next.gas?.density || 0, 0.65), visibility_modifier: -0.3 },
          light: 0,
          occlusion: Math.max(next.occlusion, 0.3),
        }, ["fire", "light"]), "steam");
      } else if (next.liquid?.kind === "water" && hasCold(next)) {
        reactions.push(reactionRecord("cold_freezes_water", priorityForRule("cold_freezes_water", 20), next, ["water", "cold"], ["ice", "frozen"], snapshot.generated_at_tick));
        next = withSurfaceKind(withoutSurfaceKinds(withoutEnvironmentKinds({
          ...next,
          temperature: 0,
          liquid: undefined,
          gas: next.gas ? { ...next.gas } : undefined,
          occlusion: next.occlusion,
        }, ["cold", "freeze", "frost"]), ["water", "doused"]), "ice");
      } else if (next.liquid?.kind === "oil" && hasFire(next)) {
        reactions.push(reactionRecord("fire_ignites_oil", priorityForRule("fire_ignites_oil", 30), next, ["oil", "fire"], ["spreading_fire", "smoke"], snapshot.generated_at_tick));
        next = withEnvironmentKind({
          ...next,
          temperature: Math.max(next.temperature, 500),
          liquid: { ...next.liquid, volume: Math.max(0, next.liquid.volume - 0.25), temperature: 500 },
          gas: { kind: "smoke", density: Math.max(next.gas?.density || 0, 0.45), visibility_modifier: -0.25 },
          light: Math.max(next.light, 0.85),
          occlusion: Math.max(next.occlusion, 0.25),
        }, "fire");
        next = withEnvironmentKind(next, "smoke");
      } else if (next.liquid?.kind === "poison" && hasFire(next)) {
        reactions.push(reactionRecord("fire_vaporizes_poison", priorityForRule("fire_vaporizes_poison", 40), next, ["poison", "fire"], ["poison_gas", "toxic_smoke"], snapshot.generated_at_tick));
        next = withEnvironmentKind({
          ...next,
          temperature: Math.max(next.temperature, 420),
          liquid: { ...next.liquid, volume: Math.max(0, next.liquid.volume - 0.5), temperature: 420 },
          gas: { kind: "poison_gas", density: Math.max(next.gas?.density || 0, 0.75), visibility_modifier: -0.35 },
          light: Math.max(next.light, 0.45),
          occlusion: Math.max(next.occlusion, 0.35),
        }, "poison_gas");
        next = withEnvironmentKind(next, "smoke");
      } else if (next.liquid?.kind === "acid") {
        reactions.push(reactionRecord("acid_corroded_material", priorityForRule("acid_corroded_material", 50), next, ["acid", next.material_id || "material"], ["corrosion", "acid_fumes"], snapshot.generated_at_tick));
        next = withSurfaceKind(withEnvironmentKind({
          ...next,
          liquid: { ...next.liquid, volume: Math.max(0, next.liquid.volume - 0.15) },
          gas: { kind: "acid_fumes", density: Math.max(next.gas?.density || 0, 0.35), visibility_modifier: -0.1 },
          occlusion: Math.max(next.occlusion, 0.1),
        }, "acid_fumes"), "corrosion");
      }

      if (next.liquid?.kind === "water" && hasElectricity(next)) {
        reactions.push(reactionRecord("electricity_conducts_water", priorityForRule("electricity_conducts_water", 30), next, ["electricity", "water"], ["conductive_electricity"], snapshot.generated_at_tick));
        next = withEnvironmentKind({
          ...next,
          light: Math.max(next.light, 0.35),
          sound: Math.max(next.sound, 0.25),
        }, "conductive_electricity");
      }

      return next;
    });
  const propagatedCells = applyPropagationReactions(cells, reactions, snapshot.generated_at_tick);

  return {
    reactions,
    snapshot: {
      ...snapshot,
      tile_layers: {
        ...snapshot.tile_layers,
        cells: propagatedCells,
        totals: tileLayerTotals(propagatedCells),
      },
    },
  };
};

const nextReactionFactId = (save: PlaySave, offset: number) =>
  `wfact:reaction:${String((save.world_facts?.length || 0) + offset + 1).padStart(6, "0")}`;

const environmentFieldsForReaction = (
  reaction: ImmersiveReactionRecord,
): SimulationEnvironmentFieldRecord[] => {
  const [x, y] = reaction.cell;
  const base = {
    age_ticks: 0,
    source: "runtime" as const,
    origin_cell: cloneCell(reaction.cell),
    created_at_tick: reaction.tick,
  };
  if (reaction.rule_id === "water_extinguishes_fire_to_steam" || reaction.rule_id === "fire_melts_ice_to_water") {
    return [{
      ...base,
      id: `env_reaction_steam_${reaction.tick}_${x}_${y}`,
      kind: "steam",
      intensity: reaction.rule_id === "fire_melts_ice_to_water" ? 0.45 : 0.65,
      tag: reaction.rule_id === "fire_melts_ice_to_water" ? "ice_melt_reaction" : "water_fire_reaction",
      action: reaction.rule_id,
      radius: 1,
      visibility_modifier: reaction.rule_id === "fire_melts_ice_to_water" ? -0.24 : -0.3,
      decay_per_tick: 0.03,
      expires_at_tick: reaction.tick + 40,
    }];
  }
  if (reaction.rule_id === "fire_ignites_oil" || reaction.rule_id === "fire_spreads_to_flammable_neighbor") {
    return [
      {
        ...base,
        id: `env_reaction_fire_${reaction.tick}_${x}_${y}`,
        kind: "fire",
        intensity: reaction.rule_id === "fire_ignites_oil" ? 0.9 : 0.65,
        tag: reaction.rule_id === "fire_ignites_oil" ? "oil_fire" : "spread_fire",
        action: reaction.rule_id,
        radius: reaction.rule_id === "fire_ignites_oil" ? 2 : 1,
        damage_per_tick: reaction.rule_id === "fire_ignites_oil" ? 2 : 1,
        decay_per_tick: 0.015,
        expires_at_tick: reaction.tick + (reaction.rule_id === "fire_ignites_oil" ? 100 : 70),
      },
      {
        ...base,
        id: `env_reaction_smoke_${reaction.tick}_${x}_${y}`,
        kind: "smoke",
        intensity: reaction.rule_id === "fire_ignites_oil" ? 0.45 : 0.32,
        tag: reaction.rule_id === "fire_ignites_oil" ? "oil_smoke" : "spread_smoke",
        action: reaction.rule_id,
        radius: reaction.rule_id === "fire_ignites_oil" ? 2 : 1,
        visibility_modifier: -0.22,
        decay_per_tick: 0.02,
        expires_at_tick: reaction.tick + (reaction.rule_id === "fire_ignites_oil" ? 80 : 60),
      },
    ];
  }
  if (reaction.rule_id === "fire_vaporizes_poison") {
    return [
      {
        ...base,
        id: `env_reaction_poison_gas_${reaction.tick}_${x}_${y}`,
        kind: "poison_gas",
        intensity: 0.75,
        tag: "toxic_vapor",
        action: reaction.rule_id,
        radius: 2,
        damage_per_tick: 2,
        visibility_modifier: -0.35,
        decay_per_tick: 0.025,
        expires_at_tick: reaction.tick + 90,
      },
      {
        ...base,
        id: `env_reaction_toxic_smoke_${reaction.tick}_${x}_${y}`,
        kind: "smoke",
        intensity: 0.35,
        tag: "toxic_smoke",
        action: reaction.rule_id,
        radius: 2,
        visibility_modifier: -0.2,
        decay_per_tick: 0.025,
        expires_at_tick: reaction.tick + 70,
      },
    ];
  }
  if (reaction.rule_id === "acid_corroded_material") {
    return [{
      ...base,
      id: `env_reaction_acid_fumes_${reaction.tick}_${x}_${y}`,
      kind: "acid_fumes",
      intensity: 0.35,
      tag: "acid_corrosion",
      action: reaction.rule_id,
      radius: 1,
      damage_per_tick: 1,
      visibility_modifier: -0.1,
      decay_per_tick: 0.03,
      expires_at_tick: reaction.tick + 60,
    }];
  }
  if (reaction.rule_id === "electricity_conducts_water" || reaction.rule_id === "electricity_chains_through_wet_cell") {
    return [{
      ...base,
      id: `env_reaction_electricity_${reaction.tick}_${x}_${y}`,
      kind: "electricity",
      intensity: reaction.rule_id === "electricity_conducts_water" ? 0.7 : 0.45,
      tag: reaction.rule_id === "electricity_conducts_water" ? "conductive_water" : "conductive_chain",
      action: reaction.rule_id,
      radius: 1,
      damage_per_tick: 1,
      decay_per_tick: 0.08,
      expires_at_tick: reaction.tick + 12,
    }];
  }
  if (reaction.rule_id === "smoke_diffuses_to_neighbor") {
    return [{
      ...base,
      id: `env_reaction_smoke_diffusion_${reaction.tick}_${x}_${y}`,
      kind: "smoke",
      intensity: 0.25,
      tag: "gas_diffusion",
      action: reaction.rule_id,
      radius: 1,
      visibility_modifier: -0.18,
      decay_per_tick: 0.03,
      expires_at_tick: reaction.tick + 50,
    }];
  }
  if (reaction.rule_id === "poison_gas_diffuses_to_neighbor") {
    return [{
      ...base,
      id: `env_reaction_poison_diffusion_${reaction.tick}_${x}_${y}`,
      kind: "poison_gas",
      intensity: 0.35,
      tag: "gas_diffusion",
      action: reaction.rule_id,
      radius: 1,
      damage_per_tick: 1,
      visibility_modifier: -0.25,
      decay_per_tick: 0.035,
      expires_at_tick: reaction.tick + 55,
    }];
  }
  return [];
};

const surfaceLayersForReaction = (
  reaction: ImmersiveReactionRecord,
): SimulationSurfaceLayerRecord[] => {
  if (reaction.rule_id === "water_extinguishes_fire_to_steam") {
    return [{
      id: `surface_reaction_doused_${reaction.tick}_${reaction.cell[0]}_${reaction.cell[1]}`,
      kind: "doused",
      amount: 0.35,
      age_ticks: 0,
      source: "runtime",
      tag: "steam_condensation",
      residue_kind: "water",
      slipperiness: 0.15,
      decay_per_tick: 0.02,
      created_at_tick: reaction.tick,
      expires_at_tick: reaction.tick + 60,
    }];
  }
  if (reaction.rule_id === "cold_freezes_water") {
    return [{
      id: `surface_reaction_ice_${reaction.tick}_${reaction.cell[0]}_${reaction.cell[1]}`,
      kind: "ice",
      amount: 0.8,
      age_ticks: 0,
      source: "runtime",
      tag: "frozen_water",
      residue_kind: "water",
      slipperiness: 0.75,
      decay_per_tick: 0.005,
      created_at_tick: reaction.tick,
      expires_at_tick: reaction.tick + 160,
    }];
  }
  if (reaction.rule_id === "fire_melts_ice_to_water") {
    return [{
      id: `surface_reaction_meltwater_${reaction.tick}_${reaction.cell[0]}_${reaction.cell[1]}`,
      kind: "water",
      amount: 0.55,
      age_ticks: 0,
      source: "runtime",
      tag: "meltwater",
      residue_kind: "water",
      slipperiness: 0.22,
      decay_per_tick: 0.02,
      created_at_tick: reaction.tick,
      expires_at_tick: reaction.tick + 80,
    }];
  }
  if (reaction.rule_id === "acid_corroded_material") {
    return [{
      id: `surface_reaction_corrosion_${reaction.tick}_${reaction.cell[0]}_${reaction.cell[1]}`,
      kind: "corrosion",
      amount: 0.35,
      age_ticks: 0,
      source: "runtime",
      tag: "acid_residue",
      residue_kind: "acid",
      cleaning_difficulty: 0.9,
      decay_per_tick: 0.01,
      created_at_tick: reaction.tick,
      expires_at_tick: reaction.tick + 120,
    }];
  }
  return [];
};

const conditionForReaction = (
  mapId: string,
  reaction: ImmersiveReactionRecord,
): SimulationConditionRecord | undefined => {
  const base = {
    target_kind: "cell" as const,
    target_id: `cell:${mapId}:${reaction.cell[0]}:${reaction.cell[1]}`,
    cell: cloneCell(reaction.cell),
    last_action: reaction.rule_id,
    updated_at_tick: reaction.tick,
  };
  if (reaction.rule_id === "fire_ignites_oil" || reaction.rule_id === "fire_spreads_to_flammable_neighbor") {
    return {
      ...base,
      state: "burned",
      integrity: reaction.rule_id === "fire_ignites_oil" ? 0.5 : 0.7,
      condition_tags: ["reaction", reaction.rule_id === "fire_ignites_oil" ? "oil_fire" : "fire_spread"],
    };
  }
  if (reaction.rule_id === "fire_vaporizes_poison") {
    return {
      ...base,
      state: "contaminated",
      integrity: 0.75,
      condition_tags: ["reaction", "poison_gas", "toxic"],
    };
  }
  if (reaction.rule_id === "cold_freezes_water") {
    return {
      ...base,
      state: "frozen",
      integrity: 0.9,
      condition_tags: ["reaction", "ice", "slippery"],
    };
  }
  if (reaction.rule_id === "fire_melts_ice_to_water") {
    return {
      ...base,
      state: "wet",
      integrity: 0.9,
      condition_tags: ["reaction", "meltwater", "steam"],
    };
  }
  if (reaction.rule_id === "acid_corroded_material") {
    return {
      ...base,
      state: "damaged",
      integrity: 0.65,
      condition_tags: ["reaction", "acid", "corrosion"],
    };
  }
  return undefined;
};

const sameCell = (a: readonly [number, number] | undefined, b: readonly [number, number]) =>
  !!a && a[0] === b[0] && a[1] === b[1];

const packageSpatialRatio = (gamePackage: GamePackage): number =>
  isFineExpandedPackage(gamePackage) ? FINE_PER_MACRO : 1;

const scaleMacroDistanceForPackage = (gamePackage: GamePackage, distance: number): number =>
  distance * packageSpatialRatio(gamePackage);

const sameMacroCoordForPackage = (
  gamePackage: GamePackage,
  a: [number, number],
  b: [number, number],
): boolean => {
  const ratio = packageSpatialRatio(gamePackage);
  return Math.floor(a[0] / ratio) === Math.floor(b[0] / ratio) &&
    Math.floor(a[1] / ratio) === Math.floor(b[1] / ratio);
};

const areAdjacentMacroForPackage = (
  gamePackage: GamePackage,
  a: [number, number],
  b: [number, number],
): boolean => {
  const ratio = packageSpatialRatio(gamePackage);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) <= ratio;
};

const placementFootprintForPackage = (
  gamePackage: GamePackage,
  placement: Pick<ObjectPlacementData, "cell">,
  object: ObjectData | undefined,
): [number, number][] => {
  const ratio = packageSpatialRatio(gamePackage);
  const half = Math.floor((ratio - 1) / 2);
  const authoredFootprint = object?.collision?.footprint?.length
    ? object.collision.footprint
    : ([[0, 0]] as [number, number][]);
  const cells: [number, number][] = [];
  for (const [rx, rz] of authoredFootprint) {
    const centerX = placement.cell[0] + rx * ratio;
    const centerZ = placement.cell[1] + rz * ratio;
    for (let dx = -half; dx <= half; dx += 1) {
      for (let dz = -half; dz <= half; dz += 1) cells.push([centerX + dx, centerZ + dz]);
    }
  }
  return cells;
};

const actorsAtCell = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  cell: [number, number],
): { actor_id: string; entity_id?: string }[] => {
  const actors: { actor_id: string; entity_id?: string }[] = [];
  if (save.current_map_id === mapId && sameCell(save.player.cell, cell)) {
    actors.push({ actor_id: "player" });
  }
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  (map?.entity_placements || []).forEach((placement, index) => {
    const key = entityPlacementStateKey(mapId, placement, index);
    const state = save.entity_states?.[key] || save.entity_states?.[placement.entity_id] || {};
    if (state.hidden || state.dead) return;
    const actorCell = (state.cell || placement.cell) as [number, number];
    if (sameCell(actorCell, cell)) actors.push({ actor_id: key, entity_id: placement.entity_id });
  });
  return actors;
};

const actorCellsForMap = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
): [number, number][] => {
  const cells: [number, number][] = [];
  if (save.current_map_id === mapId) cells.push(cloneCell(save.player.cell));
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  (map?.entity_placements || []).forEach((placement, index) => {
    const key = entityPlacementStateKey(mapId, placement, index);
    const state = save.entity_states?.[key] || save.entity_states?.[placement.entity_id] || {};
    if (state.hidden || state.dead) return;
    const cell = (state.cell || placement.cell) as [number, number];
    cells.push(cloneCell(cell));
  });
  return cells;
};

const REACTION_CONSUMED_ENVIRONMENT_KINDS: Record<string, string[]> = {
  water_extinguishes_fire_to_steam: ["fire", "light"],
  fire_melts_ice_to_water: ["fire", "light", "cold", "freeze", "frost"],
  cold_freezes_water: ["cold", "freeze", "frost"],
  fire_ignites_oil: ["fire"],
  fire_vaporizes_poison: ["fire"],
  electricity_conducts_water: ["electricity", "shock"],
  electricity_chains_through_wet_cell: ["electricity", "shock"],
};

const REACTION_CONSUMED_SURFACE_KINDS: Record<string, string[]> = {
  cold_freezes_water: ["water", "doused"],
  fire_melts_ice_to_water: ["ice", "frozen"],
  fire_ignites_oil: ["oil"],
  fire_vaporizes_poison: ["poison"],
  acid_corroded_material: ["acid"],
};

const filterCellRecord = <T,>(
  record: Record<string, T[]> | undefined,
  key: string,
  keep: (entry: T) => boolean,
): Record<string, T[]> | undefined => {
  if (!record?.[key]) return record;
  const next = { ...record };
  const kept = record[key].filter(keep);
  if (kept.length) next[key] = kept;
  else delete next[key];
  return Object.keys(next).length ? next : undefined;
};

const reactionKeepsEnvironmentField = (
  reaction: ImmersiveReactionRecord,
  field: SimulationEnvironmentFieldRecord,
) => {
  const consumed = REACTION_CONSUMED_ENVIRONMENT_KINDS[reaction.rule_id] || [];
  if (!consumed.length) return true;
  if (consumed.includes(field.kind)) return false;
  if (consumed.includes("light") && field.kind === "light" && field.tag === "global_verb_firelight") return false;
  return true;
};

const stripReactionConsumedDelta = (
  delta: MapDelta,
  key: string,
  reaction: ImmersiveReactionRecord,
): MapDelta => ({
  ...delta,
  environment_fields: filterCellRecord(
    delta.environment_fields,
    key,
    (field) => reactionKeepsEnvironmentField(reaction, field),
  ),
  surface_layers: filterCellRecord(
    delta.surface_layers,
    key,
    (surface) => !(REACTION_CONSUMED_SURFACE_KINDS[reaction.rule_id] || []).includes(surface.kind),
  ),
});

const physicalLabelsForState = (state: Omit<ActorPhysicalStateRecord, "labels">): string[] => {
  const labels: string[] = [];
  if (state.heat >= 0.65) labels.push("On Fire");
  else if (state.heat >= 0.3) labels.push("Hot");
  if (state.chill >= 0.65) labels.push("Freezing");
  else if (state.chill >= 0.3) labels.push("Chilled");
  if (state.wetness >= 0.55) labels.push("Soaked");
  else if (state.wetness >= 0.25) labels.push("Damp");
  if (state.charge >= 0.55) labels.push("Charged");
  if (state.coating >= 0.5) labels.push("Foamed");
  if (state.toxicity >= 0.5) labels.push("Toxic");
  return labels;
};

const actorPhysicalStateFromTile = (
  tile: ImmersiveTileLayerCellState,
  tick: number,
): ActorPhysicalStateRecord => {
  const fire = hasFire(tile);
  const cold = hasCold(tile) || hasIce(tile);
  const wet = isWetCell(tile);
  const foam = tile.surface_kinds.includes("foam");
  const electricity = hasElectricity(tile);
  const toxicGas =
    tile.gas?.kind === "poison_gas" ||
    tile.gas?.kind === "acid_fumes" ||
    tile.environment_kinds.includes("poison_gas") ||
    tile.environment_kinds.includes("acid_fumes");
  const steam = tile.gas?.kind === "steam" || tile.environment_kinds.includes("steam");
  const heat = fire
    ? 1
    : tile.temperature >= 120
      ? 0.75
      : tile.temperature >= 60 || steam
        ? 0.4
        : 0;
  const chill = cold
    ? 0.9
    : tile.temperature <= 5
      ? 0.65
      : tile.temperature <= 15
        ? 0.35
        : 0;
  const wetness = wet ? 0.85 : steam ? 0.25 : 0;
  const charge = electricity ? 0.9 : 0;
  const coating = foam ? 0.85 : 0;
  const toxicity = toxicGas ? 0.85 : 0;
  const temperature = fire
    ? 125
    : chill >= 0.65
      ? -5
      : heat >= 0.65
        ? 70
        : heat > 0
          ? 48
          : wetness > 0
            ? 30
            : 37;
  const state: Omit<ActorPhysicalStateRecord, "labels"> = {
    temperature,
    wetness,
    heat,
    chill,
    charge,
    coating,
    toxicity,
    updated_at_tick: tick,
    cell: cloneCell(tile.cell),
  };
  return {
    ...state,
    labels: physicalLabelsForState(state),
  };
};

const physicalStatusEffects = (
  state: ActorPhysicalStateRecord,
): { status_id: string; duration: number; magnitude: number }[] => {
  const effects: { status_id: string; duration: number; magnitude: number }[] = [];
  if (state.heat >= 0.65) effects.push({ status_id: "burn", duration: 2, magnitude: Math.max(1, Math.round(state.heat * 2)) });
  if (state.chill >= 0.65) effects.push({ status_id: "slow", duration: 2, magnitude: 1 });
  if (state.charge >= 0.65) effects.push({ status_id: "stun", duration: 1, magnitude: 1 });
  if (state.toxicity >= 0.5) effects.push({ status_id: "poison", duration: 3, magnitude: 1 });
  return effects;
};

const applyStatusToSaveActor = (
  save: PlaySave,
  actorId: string,
  statusId: string,
  duration: number,
  magnitude: number,
): PlaySave => {
  if (actorId === "player") {
    return {
      ...save,
      actor_statuses: {
        ...(save.actor_statuses || {}),
        player: applyStatus(save.actor_statuses?.player, statusId, { duration, magnitude }),
      },
    };
  }
  const entityState = { ...(save.entity_states?.[actorId] || {}) };
  return {
    ...save,
    entity_states: {
      ...(save.entity_states || {}),
      [actorId]: {
        ...entityState,
        statuses: applyStatus(entityState.statuses, statusId, { duration, magnitude }),
      },
    },
  };
};

const writeActorPhysicalState = (
  save: PlaySave,
  actorId: string,
  state: ActorPhysicalStateRecord,
): PlaySave => ({
  ...save,
  actor_physical_states: {
    ...(save.actor_physical_states || {}),
    [actorId]: {
      ...state,
      labels: [...state.labels],
      cell: state.cell ? cloneCell(state.cell) : undefined,
    },
  },
});

const applyPhysicalExposureForCells = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  snapshot: ImmersiveTileLayerSnapshot,
  cells: [number, number][],
): PlaySave => {
  const byCell = new Map(snapshot.cells.map((tile) => [cellKey(tile.cell), tile]));
  const uniqueCells = [...new Set(cells.map(cellKey))];
  let nextSave = save;
  uniqueCells.forEach((key) => {
    const tile = byCell.get(key);
    if (!tile) return;
    const state = actorPhysicalStateFromTile(tile, snapshot.generated_at_tick);
    actorsAtCell(gamePackage, nextSave, mapId, tile.cell).forEach((actor) => {
      nextSave = writeActorPhysicalState(nextSave, actor.actor_id, state);
      physicalStatusEffects(state).forEach((effect) => {
        nextSave = applyStatusToSaveActor(nextSave, actor.actor_id, effect.status_id, effect.duration, effect.magnitude);
      });
    });
  });
  return nextSave;
};

const statusEffectsForReaction = (
  reaction: ImmersiveReactionRecord,
): { status_id: string; duration: number; magnitude: number }[] =>
  reactionRule(reaction.rule_id)?.status_effects || [];

const applyReactionStatusesToSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  reaction: ImmersiveReactionRecord,
): { save: PlaySave; applications: ImmersiveReactionStatusApplication[] } => {
  const effects = statusEffectsForReaction(reaction);
  if (!effects.length) return { save, applications: [] };
  let nextSave = save;
  const applications: ImmersiveReactionStatusApplication[] = [];
  actorsAtCell(gamePackage, save, mapId, reaction.cell).forEach((actor) => {
    effects.forEach((effect) => {
      applications.push({
        actor_id: actor.actor_id,
        status_id: effect.status_id,
        duration: effect.duration,
        magnitude: effect.magnitude,
        cell: cloneCell(reaction.cell),
        rule_id: reaction.rule_id,
      });
      if (actor.actor_id === "player") {
        nextSave = {
          ...nextSave,
          actor_statuses: {
            ...(nextSave.actor_statuses || {}),
            player: applyStatus(nextSave.actor_statuses?.player, effect.status_id, {
              duration: effect.duration,
              magnitude: effect.magnitude,
            }),
          },
        };
        return;
      }
      const entityState = { ...(nextSave.entity_states?.[actor.actor_id] || {}) };
      nextSave = {
        ...nextSave,
        entity_states: {
          ...(nextSave.entity_states || {}),
          [actor.actor_id]: {
            ...entityState,
            statuses: applyStatus(entityState.statuses, effect.status_id, {
              duration: effect.duration,
              magnitude: effect.magnitude,
            }),
          },
        },
      };
    });
  });
  return { save: nextSave, applications };
};

export const advanceImmersiveReactionsForSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id || gamePackage.metadata.start_map_id,
): ImmersiveReactionSaveResult => {
  const initial = createImmersiveStage2SnapshotFromV1(gamePackage, save, mapId);
  const resolved = resolveImmersiveReactions(initial);
  let nextSave = writeImmersiveTileLayerSnapshotToSave(save, resolved.snapshot.tile_layers);
  const worldFacts: PlaySaveWorldFact[] = [];
  const environmentFields: SimulationEnvironmentFieldRecord[] = [];
  const surfaceLayers: SimulationSurfaceLayerRecord[] = [];
  const conditionRecords: SimulationConditionRecord[] = [];
  const statusApplications: ImmersiveReactionStatusApplication[] = [];

  resolved.reactions.forEach((reaction, index) => {
    const key = cellKey(reaction.cell);
    const delta = stripReactionConsumedDelta({ ...(nextSave.map_deltas?.[mapId] || {}) }, key, reaction);
    const fields = environmentFieldsForReaction(reaction);
    const surfaces = surfaceLayersForReaction(reaction);
    const condition = conditionForReaction(mapId, reaction);
    environmentFields.push(...fields);
    surfaceLayers.push(...surfaces);
    if (condition) conditionRecords.push(condition);
    nextSave = {
      ...nextSave,
      map_deltas: {
        ...(nextSave.map_deltas || {}),
        [mapId]: {
          ...delta,
          environment_fields: fields.length
            ? {
                ...(delta.environment_fields || {}),
                [key]: [...(delta.environment_fields?.[key] || []), ...fields],
              }
            : delta.environment_fields,
          surface_layers: surfaces.length
            ? {
                ...(delta.surface_layers || {}),
                [key]: [...(delta.surface_layers?.[key] || []), ...surfaces],
              }
            : delta.surface_layers,
          simulation_conditions: condition
            ? {
                ...(delta.simulation_conditions || {}),
                [condition.target_id]: condition,
              }
            : delta.simulation_conditions,
        },
      },
    };
    const statusResult = applyReactionStatusesToSave(gamePackage, nextSave, mapId, reaction);
    nextSave = statusResult.save;
    statusApplications.push(...statusResult.applications);
    worldFacts.push({
      id: nextReactionFactId(save, index),
      tick: reaction.tick,
      map_id: mapId,
      plane_id: "ground",
      cells: [cloneCell(reaction.cell)],
      action_type: "immersive_reaction_resolved",
      direct_consequences: {
        rule_id: reaction.rule_id,
        consumed: [...reaction.consumed],
        produced: [...reaction.produced],
        status_applications: statusResult.applications,
      },
    });
  });

  nextSave = {
    ...nextSave,
    world_facts: [...(nextSave.world_facts || []), ...worldFacts].slice(-250),
  };

  nextSave = applyPhysicalExposureForCells(
    gamePackage,
    nextSave,
    mapId,
    resolved.snapshot.tile_layers,
    [
      ...resolved.reactions.map((reaction) => reaction.cell),
      ...actorCellsForMap(gamePackage, nextSave, mapId),
    ],
  );

  return {
    save: nextSave,
    snapshot: resolved.snapshot,
    reactions: resolved.reactions,
    world_facts: worldFacts,
    environment_fields: environmentFields,
    surface_layers: surfaceLayers,
    condition_records: conditionRecords,
    status_applications: statusApplications,
  };
};

const perceptionStimuliFromStage2Snapshot = (
  gamePackage: GamePackage,
  snapshot: ImmersiveStage2Snapshot,
  save: PlaySave,
  illumination: ImmersiveIlluminationSnapshot,
): ImmersivePerceptionStimulus[] => {
  const stimuli: ImmersivePerceptionStimulus[] = [];
  const soundFieldCellKeys = new Set<string>();
  const dynamicSounds = new Map<
    string,
    {
      cell: [number, number];
      intensity: number;
      radius: number;
      tag: string;
      tags: string[];
      tick: number;
      source_id?: string;
      source_actor_id?: string;
      source_action?: string;
    }
  >();
  Object.entries(save.map_deltas?.[snapshot.map_id]?.environment_fields || {}).forEach(
    ([fieldCellKey, fields]) => {
      fields.forEach((field) => {
        if (field.kind !== "sound" || field.intensity <= 0.02) return;
        if (field.expires_at_tick !== undefined && field.expires_at_tick <= snapshot.generated_at_tick) return;
        soundFieldCellKeys.add(fieldCellKey);
        const parsedCell = parseFineCoordKey(fieldCellKey);
        const origin = cloneCell(field.origin_cell || [parsedCell[0], parsedCell[1]]);
        const tag = field.frequency_tag || field.tag || "sound";
        const groupKey = `${field.actor_id || "world"}:${origin[0]}:${origin[1]}:${tag}`;
        const existing = dynamicSounds.get(groupKey);
        dynamicSounds.set(groupKey, {
          cell: origin,
          intensity: Math.max(existing?.intensity || 0, field.intensity),
          radius: Math.max(existing?.radius || 0, field.radius || 1),
          tag,
          tags: [...new Set([...(existing?.tags || []), field.tag || "sound", field.frequency_tag || "sound", field.material_tag || ""])].filter(Boolean),
          tick: Math.max(existing?.tick || 0, field.created_at_tick || snapshot.generated_at_tick),
          source_id: existing?.source_id || field.id,
          source_actor_id: field.actor_id,
          source_action: field.action,
        });
      });
    },
  );
  dynamicSounds.forEach((sound) => {
    stimuli.push({
      kind: "sound",
      cell: cloneCell(sound.cell),
      intensity: Number(clamp(sound.intensity, 0, 1).toFixed(4)),
      radius: Math.max(1, Math.ceil(sound.radius)),
      tag: sound.tag,
      tags: sound.tags,
      tick: sound.tick,
      source_id: sound.source_id,
      source_actor_id: sound.source_actor_id,
      source_action: sound.source_action,
    });
  });
  illumination.sources.forEach((source) => {
    stimuli.push({
      kind: "light",
      cell: cloneCell(source.cell),
      intensity: source.intensity,
      radius: Math.max(0, Math.ceil(source.radius)),
      tag: source.stimulus_tags[0] || "light",
      tags: [...source.stimulus_tags],
      tick: source.created_at_tick ?? snapshot.generated_at_tick,
      source_id: source.id,
      source_actor_id: source.carrier_actor_id,
      owner_id: source.owner_actor_id,
      mobility:
        source.source_kind === "carried_item" || source.source_kind === "carried_object"
          ? "carried"
          : source.source_kind === "dropped_item"
            ? source.mobility === "throwable" ? "thrown" : "placed"
            : source.source_kind === "environment_field" || source.source_kind === "fire_field"
              ? "environmental"
              : "fixed",
    });
  });
  snapshot.tile_layers.cells.forEach((cell) => {
    if (cell.sound > 0.15 && !soundFieldCellKeys.has(cellKey(cell.cell))) {
      stimuli.push({
        kind: "sound",
        cell: cloneCell(cell.cell),
        intensity: Number(cell.sound.toFixed(4)),
        radius: scaleMacroDistanceForPackage(gamePackage, Math.max(2, Math.ceil(cell.sound * 7))),
        tag: "tile_sound",
        tags: ["sound", "tile_sound"],
        tick: snapshot.generated_at_tick,
      });
    }
    if (hasFire(cell)) {
      stimuli.push({
        kind: "fire",
        cell: cloneCell(cell.cell),
        intensity: clamp(cell.temperature / 600, 0.45, 1),
        radius: scaleMacroDistanceForPackage(gamePackage, 5),
        tag: "active_fire",
        tags: ["fire", "light", "active_fire"],
        tick: snapshot.generated_at_tick,
      });
    }
    if (cell.gas && cell.gas.density > 0.2) {
      const danger = cell.gas.kind === "poison_gas" || cell.gas.kind === "acid_fumes";
      stimuli.push({
        kind: danger ? "danger_gas" : "smoke",
        cell: cloneCell(cell.cell),
        intensity: clamp(cell.gas.density, 0, 1),
        radius: scaleMacroDistanceForPackage(gamePackage, danger ? 4 : 3),
        tag: cell.gas.kind,
        tags: [danger ? "danger_gas" : "smoke", cell.gas.kind],
        tick: snapshot.generated_at_tick,
      });
    }
  });

  const playerCell = save.current_map_id === snapshot.map_id ? save.player.cell : undefined;
  if (playerCell) {
    const playerLight = queryImmersiveIlluminationAtCell(illumination, playerCell);
    if (playerLight.value > 0.001) {
      const sourceById = new Map(illumination.sources.map((source) => [source.id, source]));
      const sourceTags = playerLight.source_ids.flatMap((sourceId) => sourceById.get(sourceId)?.stimulus_tags || []);
      stimuli.push({
        kind: "visible_player",
        cell: cloneCell(playerCell),
        intensity: playerLight.value,
        radius: scaleMacroDistanceForPackage(gamePackage, 8),
        tag: "player_visibility",
        tags: [...new Set(["player", "visible_player", ...sourceTags])],
        tick: snapshot.generated_at_tick,
        source_id: playerLight.strongest_source_id,
        source_actor_id: "player",
        mobility: playerLight.source_ids.some((sourceId) => sourceById.get(sourceId)?.carrier_actor_id === "player")
          ? "carried"
          : undefined,
      });
    }
  }
  return stimuli.sort((a, b) => a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1] || a.kind.localeCompare(b.kind));
};

const manhattan = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

const sign = (value: number) => (value === 0 ? 0 : value > 0 ? 1 : -1);

const normalizeFacing = (facing: [number, number] | undefined): [number, number] => {
  const x = sign(Number(facing?.[0] || 0));
  const y = sign(Number(facing?.[1] || 0));
  if (x === 0 && y === 0) return [0, -1];
  return [x, y];
};

const lineCellsBetween = (from: [number, number], to: [number, number]): [number, number][] => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps <= 1) return [];
  const cells: [number, number][] = [];
  for (let i = 1; i < steps; i += 1) {
    cells.push([
      Math.round(from[0] + (dx * i) / steps),
      Math.round(from[1] + (dy * i) / steps),
    ]);
  }
  return cells.filter((cell, index, all) => index === all.findIndex((candidate) => sameCell(candidate, cell)));
};

const hasTileLineOfSight = (
  cellsByKey: Map<string, ImmersiveTileLayerCellState>,
  from: [number, number],
  to: [number, number],
): boolean =>
  lineCellsBetween(from, to).every((cell) => {
    const tile = cellsByKey.get(cellKey(cell));
    return tile && !tile.blocks_vision && tile.occlusion < 0.85;
  });

const isInViewCone = (
  actorCell: [number, number],
  facing: [number, number],
  stimulusCell: [number, number],
): boolean => {
  const dist = manhattan(actorCell, stimulusCell);
  if (dist <= 1) return true;
  const dx = stimulusCell[0] - actorCell[0];
  const dy = stimulusCell[1] - actorCell[1];
  const dominant: [number, number] =
    Math.abs(dx) >= Math.abs(dy)
      ? [sign(dx), 0]
      : [0, sign(dy)];
  const normalizedFacing = normalizeFacing(facing);
  return normalizedFacing[0] === dominant[0] && normalizedFacing[1] === dominant[1];
};

interface RuntimeSensoryChannel {
  id: string;
  stimulus_kinds: ImmersivePerceptionStimulus["kind"][];
  stimulus_tags?: string[];
  range: number;
  threshold: number;
  sensitivity: number;
  requires_los: boolean;
  requires_view_cone: boolean;
  requires_illumination: boolean;
  tracks_live_target: boolean;
}

interface RuntimeSensoryProfile {
  id: string;
  channels: RuntimeSensoryChannel[];
  memory_ticks: number;
  search_ticks: number;
}

const DEFAULT_SENSORY_PROFILE: RuntimeSensoryProfile = {
  id: "standard",
  memory_ticks: 90,
  search_ticks: 90,
  channels: [
    {
      id: "ordinary_sight",
      stimulus_kinds: ["visible_player"],
      range: 8,
      threshold: 0.04,
      sensitivity: 1,
      requires_los: true,
      requires_view_cone: true,
      requires_illumination: true,
      tracks_live_target: true,
    },
    {
      id: "ordinary_hearing",
      stimulus_kinds: ["sound"],
      range: 8,
      threshold: 0.15,
      sensitivity: 1,
      requires_los: false,
      requires_view_cone: false,
      requires_illumination: false,
      tracks_live_target: false,
    },
    {
      id: "environmental_danger",
      stimulus_kinds: ["fire", "smoke", "danger_gas"],
      range: 6,
      threshold: 0.18,
      sensitivity: 1,
      requires_los: false,
      requires_view_cone: false,
      requires_illumination: false,
      tracks_live_target: false,
    },
  ],
};

const sensoryProfileForEntity = (
  entity: GamePackage["entities"][number] | undefined,
): RuntimeSensoryProfile => {
  const authored = entity?.sensory_profile;
  if (!authored?.channels?.length) {
    return {
      ...DEFAULT_SENSORY_PROFILE,
      channels: DEFAULT_SENSORY_PROFILE.channels.map((channel) => ({ ...channel, stimulus_kinds: [...channel.stimulus_kinds] })),
    };
  }
  return {
    id: authored.id || "custom",
    memory_ticks: Math.max(0, authored.memory_ticks ?? 90),
    search_ticks: Math.max(0, authored.search_ticks ?? 90),
    channels: authored.channels.map((channel) => ({
      id: channel.id,
      stimulus_kinds: [...channel.stimulus_kinds],
      stimulus_tags: channel.stimulus_tags ? [...channel.stimulus_tags] : undefined,
      range: Math.max(0, channel.range),
      threshold: clamp(channel.threshold, 0, 1),
      sensitivity: Math.max(0, channel.sensitivity),
      requires_los: channel.requires_los,
      requires_view_cone: channel.requires_view_cone,
      requires_illumination: channel.requires_illumination,
      tracks_live_target: channel.tracks_live_target,
    })),
  };
};

const stimulusTags = (stimulus: ImmersivePerceptionStimulus) =>
  new Set([stimulus.kind, stimulus.tag, ...(stimulus.tags || [])].filter((tag): tag is string => Boolean(tag)));

const channelAcceptsStimulus = (
  channel: RuntimeSensoryChannel,
  stimulus: ImmersivePerceptionStimulus,
) => {
  if (!channel.stimulus_kinds.includes(stimulus.kind)) return false;
  if (!channel.stimulus_tags?.length) return true;
  const tags = stimulusTags(stimulus);
  return channel.stimulus_tags.some((tag) => tags.has(tag));
};

const propagatedSoundIntensityAtActor = (
  save: PlaySave,
  mapId: string,
  stimulus: ImmersivePerceptionStimulus,
  actorCell: [number, number],
): number | undefined => {
  let result: number | undefined;
  Object.entries(save.map_deltas?.[mapId]?.environment_fields || {}).forEach(([key, fields]) => {
    if (!sameCell(parseFineCoordKey(key), actorCell)) return;
    fields.forEach((field) => {
      if (field.kind !== "sound") return;
      const origin = (field.origin_cell || parseFineCoordKey(key)) as [number, number];
      const tag = field.frequency_tag || field.tag || "sound";
      if (!sameCell(origin, stimulus.cell) || (stimulus.tag && tag !== stimulus.tag)) return;
      result = Math.max(result || 0, field.intensity);
    });
  });
  return result;
};

const scoreStimulusAtActor = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  stimulus: ImmersivePerceptionStimulus,
  channel: RuntimeSensoryChannel,
  actorCell: [number, number],
  actorFacing: [number, number],
  cellsByKey: Map<string, ImmersiveTileLayerCellState>,
): { score: number; acquisition?: ImmersiveVisualAcquisitionResult } => {
  if (!channelAcceptsStimulus(channel, stimulus)) return { score: 0 };
  const dist = manhattan(stimulus.cell, actorCell);
  const channelRange = scaleMacroDistanceForPackage(gamePackage, channel.range);
  const effectiveRange = Math.min(channelRange, stimulus.radius || channelRange);
  if (dist > effectiveRange) return { score: 0 };
  if (channel.requires_view_cone && !isInViewCone(actorCell, actorFacing, stimulus.cell)) {
    return { score: 0 };
  }
  let acquisition: ImmersiveVisualAcquisitionResult | undefined;
  if (channel.requires_los || channel.requires_illumination) {
    acquisition = queryImmersiveVisualAcquisition(gamePackage, save, {
      map_id: mapId,
      observer_cell: actorCell,
      target_cell: stimulus.cell,
      target_actor_id: stimulus.kind === "visible_player" ? "player" : undefined,
      max_range: channelRange,
      minimum_light: channel.requires_illumination ? 0.001 : 0,
    });
    if (!acquisition.acquired) return { score: 0, acquisition };
  } else if (channel.requires_los && !hasTileLineOfSight(cellsByKey, actorCell, stimulus.cell)) {
    return { score: 0 };
  }
  const falloff = 1 - dist / (effectiveRange + 1);
  const kindWeight =
    stimulus.kind === "sound" ? 0.9 :
    stimulus.kind === "visible_player" ? 1.1 :
    stimulus.kind === "fire" || stimulus.kind === "danger_gas" ? 1 :
    0.6;
  const propagatedSound = stimulus.kind === "sound"
    ? propagatedSoundIntensityAtActor(save, mapId, stimulus, actorCell)
    : undefined;
  const base = stimulus.kind === "visible_player" && acquisition
    ? acquisition.score
    : propagatedSound ?? stimulus.intensity * falloff;
  const score = Number(clamp(base * kindWeight * channel.sensitivity, 0, 1).toFixed(4));
  return { score: score >= channel.threshold ? score : 0, acquisition };
};

const alertnessFromScore = (
  score: number,
  stimulus: ImmersivePerceptionStimulus,
  hostile: boolean,
): ImmersiveAlertnessState => {
  // Seeing the player is hostile-only. Neutral NPCs still notice environmental
  // danger and disturbances so the behavior arbiter can route those signals to
  // flee/investigate actions without turning a shopkeeper into a player hunter.
  if (!hostile) {
    if (stimulus.kind === "visible_player" || stimulus.kind === "light") return "oblivious";
    if (stimulus.kind === "fire" || stimulus.kind === "danger_gas") return "searching";
    if (score >= 0.72) return "searching";
    if (score >= 0.28) return "suspicious";
    return "oblivious";
  }
  if (stimulus.kind === "visible_player") return "combat";
  if (score >= 0.55 || stimulus.kind === "fire" || stimulus.kind === "danger_gas") return "searching";
  if (score >= 0.28) return "suspicious";
  return "oblivious";
};

const detectionCause = (
  stimulus: ImmersivePerceptionStimulus,
  acquisition: ImmersiveVisualAcquisitionResult | undefined,
): ImmersiveDetectionCause => {
  if (stimulus.kind === "sound") return "heard";
  if (stimulus.kind === "visible_player") {
    return acquisition?.cause === "carried_light_exposure"
      ? "carried_light_exposure"
      : "direct_sight";
  }
  if (stimulus.kind === "light") {
    return stimulusTags(stimulus).has("glass") ? "glass_sensitivity" : "light_sensitivity";
  }
  return "environmental_danger";
};

export const createImmersivePerceptionSnapshotFromV1 = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id || gamePackage.metadata.start_map_id,
): ImmersiveStage4PerceptionSnapshot => {
  const stage2 = createImmersiveStage2SnapshotFromV1(gamePackage, save, mapId);
  const illumination = createImmersiveIlluminationSnapshotFromV1(gamePackage, save, mapId);
  const stimuli = perceptionStimuliFromStage2Snapshot(gamePackage, stage2, save, illumination);
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  const entityById = new Map(gamePackage.entities.map((entity) => [entity.id, entity]));
  const cellsByKey = new Map(stage2.tile_layers.cells.map((cell) => [cellKey(cell.cell), cell]));
  const alerts: ImmersivePerceptionAlertRecord[] = [];
  (map?.entity_placements || []).forEach((placement, index) => {
    if ((save.party_members || []).includes(placement.entity_id)) return;
    const key = entityPlacementStateKey(mapId, placement, index);
    const entity = entityById.get(placement.entity_id);
    const state = save.entity_states?.[key] || save.entity_states?.[placement.entity_id] || {};
    if (state.hidden || state.dead) return;
    const actorCell = (state.cell || placement.cell) as [number, number];
    const actorFacing = normalizeFacing((state.facing || placement.facing) as [number, number] | undefined);
    const hostile = !entity?.is_npc;
    const profile = sensoryProfileForEntity(entity);
    const scored = stimuli
      .filter(
        (stimulus) =>
          hostile ||
          (stimulus.kind !== "visible_player" &&
            stimulus.kind !== "light" &&
            !(
              stimulus.kind === "sound" &&
              stimulus.source_actor_id === "player" &&
              stimulus.tag === "footstep"
            )),
      )
      .flatMap((stimulus) =>
        profile.channels.map((channel) => {
          const result = scoreStimulusAtActor(
            gamePackage,
            save,
            mapId,
            stimulus,
            channel,
            actorCell,
            actorFacing,
            cellsByKey,
          );
          return { stimulus, channel, score: result.score, acquisition: result.acquisition };
        }),
      )
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.stimulus.cell[0] - b.stimulus.cell[0] || a.stimulus.cell[1] - b.stimulus.cell[1]);
    const best = scored[0];
    if (!best) return;
    const alertness = alertnessFromScore(best.score, best.stimulus, hostile);
    if (alertness === "oblivious") return;
    alerts.push({
      actor_id: key,
      entity_id: placement.entity_id,
      cell: cloneCell(actorCell),
      alertness,
      score: best.score,
      stimulus: { ...best.stimulus, cell: cloneCell(best.stimulus.cell) },
      target_cell: cloneCell(best.stimulus.cell),
      sensory_profile_id: profile.id,
      sense_id: best.channel.id,
      cause: detectionCause(best.stimulus, best.acquisition),
      evidence_tick: best.stimulus.tick ?? stage2.generated_at_tick,
      tracks_live_target: best.stimulus.kind === "visible_player" && best.channel.tracks_live_target,
      target_actor_id: best.stimulus.kind === "visible_player" ? "player" : undefined,
    });
  });
  return {
    map_id: mapId,
    generated_at_tick: stage2.generated_at_tick,
    stimuli,
    alerts,
    totals: {
      stimuli: stimuli.length,
      alerted_actors: alerts.length,
      suspicious: alerts.filter((alert) => alert.alertness === "suspicious").length,
      searching: alerts.filter((alert) => alert.alertness === "searching").length,
      combat: alerts.filter((alert) => alert.alertness === "combat").length,
    },
  };
};

const nextPerceptionFactId = (save: PlaySave, offset: number) =>
  `wfact:perception:${String((save.world_facts?.length || 0) + offset + 1).padStart(6, "0")}`;

const taskForPerceptionAlert = (
  alert: ImmersivePerceptionAlertRecord,
  tick: number,
  searchTicks = 90,
): SimulationNpcTaskRecord => ({
  id: `task_perception_${tick}_${alert.actor_id}_${alert.stimulus.kind}`,
  actor_id: alert.actor_id,
  task_type:
    alert.stimulus.kind === "fire" || alert.stimulus.kind === "danger_gas"
      ? "flee"
      : alert.alertness === "combat"
        ? "report"
        : "investigate",
  source_kind: alert.stimulus.kind,
  target_cell: cloneCell(alert.target_cell),
  origin_cell: cloneCell(alert.cell),
  priority: Math.max(1, Math.ceil(alert.score * 10)),
  state: "queued",
  created_at_tick: tick,
  updated_at_tick: tick,
  expires_at_tick: tick + Math.max(1, searchTicks),
});

export const advanceImmersivePerceptionForSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id || gamePackage.metadata.start_map_id,
  options: { segments?: number } = {},
): ImmersiveStage4PerceptionAdvanceResult => {
  let workingSave = save;
  let schedulerEvents: ImmersiveSchedulerEvent[] = [];
  const segments = Math.max(0, Math.floor(options.segments || 0));
  if (segments > 0) {
    const advanced = advanceImmersiveStage2Save(gamePackage, save, { mapId, segments });
    if (advanced.ok) {
      workingSave = advanced.save;
      schedulerEvents = advanced.events;
    }
  }
  const snapshot = createImmersivePerceptionSnapshotFromV1(gamePackage, workingSave, mapId);
  const delta = workingSave.map_deltas?.[mapId] || {};
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  const entityById = new Map(gamePackage.entities.map((entity) => [entity.id, entity]));
  const profileForAlert = (alert: ImmersivePerceptionAlertRecord) =>
    sensoryProfileForEntity(entityById.get(alert.entity_id));
  const freshNpcTaskCandidates = snapshot.alerts.map((alert) =>
    taskForPerceptionAlert(
      alert,
      snapshot.generated_at_tick,
      profileForAlert(alert).search_ticks,
    ),
  );
  const worldFacts: PlaySaveWorldFact[] = snapshot.alerts.map((alert, index) => ({
    id: nextPerceptionFactId(workingSave, index),
    tick: snapshot.generated_at_tick,
    map_id: mapId,
    plane_id: "ground",
    actor_id: alert.actor_id,
    cells: [cloneCell(alert.cell), cloneCell(alert.target_cell)],
    action_type: "immersive_perception_alert",
    direct_consequences: {
      alertness: alert.alertness,
      score: alert.score,
      stimulus_kind: alert.stimulus.kind,
      stimulus_cell: cloneCell(alert.stimulus.cell),
      sensory_profile_id: alert.sensory_profile_id,
      sense_id: alert.sense_id,
      detection_cause: alert.cause,
      evidence_tick: alert.evidence_tick,
      tracks_live_target: alert.tracks_live_target === true,
    },
  }));
  const alertedActorIds = new Set(snapshot.alerts.map((alert) => alert.actor_id));
  const decayedAlerts: ImmersivePerceptionAlertRecord[] = [];
  const lostContactAlerts: ImmersivePerceptionAlertRecord[] = [];
  const decayStep = Math.max(0.12, segments * 0.08);
  const decayedEntityStates = Object.fromEntries(
    (map?.entity_placements || []).flatMap((placement, index) => {
      const key = entityPlacementStateKey(mapId, placement, index);
      if (alertedActorIds.has(key)) return [];
      const state = workingSave.entity_states?.[key] || {};
      const previousAlertness = state.alertness as ImmersiveAlertnessState | undefined;
      const previousScore = Number(state.alert_score || 0);
      const memoryExpired = Number.isFinite(Number(state.perception_memory_expires_at_tick)) &&
        Number(state.perception_memory_expires_at_tick) <= snapshot.generated_at_tick;
      if (!previousAlertness || previousAlertness === "oblivious" || previousScore <= 0) {
        if (!state.perception_tracks_live_target && (!memoryExpired || !state.last_known_position)) return [];
        return [[key, {
          ...state,
          perception_tracks_live_target: false,
          target_actor_id: undefined,
          last_known_position: memoryExpired ? undefined : state.last_known_position,
          investigation_target_cell: memoryExpired ? undefined : state.investigation_target_cell,
        }]];
      }
      const profile = sensoryProfileForEntity(entityById.get(placement.entity_id));
      const searchExpired = Number.isFinite(Number(state.perception_search_expires_at_tick)) &&
        Number(state.perception_search_expires_at_tick) <= snapshot.generated_at_tick;
      const nextScore = searchExpired
        ? 0
        : Number(Math.max(0, previousScore - decayStep).toFixed(4));
      const nextAlertness: ImmersiveAlertnessState =
        nextScore >= 0.72 ? "searching" :
        nextScore >= 0.28 ? "suspicious" :
        "oblivious";
      const fallbackCell = (state.cell || placement.cell) as [number, number];
      const targetCell = (state.last_known_position || state.investigation_target_cell || state.last_stimulus?.cell || fallbackCell) as [number, number];
      const decayedAlert: ImmersivePerceptionAlertRecord = {
        actor_id: key,
        entity_id: placement.entity_id,
        cell: cloneCell(fallbackCell),
        alertness: nextAlertness,
        score: nextScore,
        stimulus: {
          kind: "sound",
          cell: cloneCell(targetCell),
          intensity: nextScore,
          radius: 0,
          tag: "alert_decay",
          tick: Number(state.last_evidence_tick || state.last_stimulus?.tick || snapshot.generated_at_tick),
        },
        target_cell: cloneCell(targetCell),
        sensory_profile_id: state.sensory_profile_id || profile.id,
        sense_id: state.last_sense_id,
        cause: state.last_detection_cause as ImmersiveDetectionCause | undefined,
        evidence_tick: Number(state.last_evidence_tick || state.last_stimulus?.tick || snapshot.generated_at_tick),
        tracks_live_target: false,
      };
      decayedAlerts.push(decayedAlert);
      if (state.perception_tracks_live_target && nextAlertness !== "oblivious") {
        lostContactAlerts.push(decayedAlert);
      }
      return [[key, {
        ...state,
        alertness: nextAlertness,
        alert_score: nextScore,
        alert_decay_tick: snapshot.generated_at_tick,
        perception_tracks_live_target: false,
        target_actor_id: undefined,
        last_known_position: memoryExpired ? undefined : cloneCell(targetCell),
        investigation_target_cell: nextAlertness === "oblivious" || memoryExpired ? undefined : cloneCell(targetCell),
      }]];
    }),
  );
  const decayFacts: PlaySaveWorldFact[] = decayedAlerts
    .filter((alert) => alert.alertness === "oblivious")
    .map((alert, index) => ({
      id: nextPerceptionFactId(workingSave, worldFacts.length + index),
      tick: snapshot.generated_at_tick,
      map_id: mapId,
      plane_id: "ground",
      actor_id: alert.actor_id,
      cells: [cloneCell(alert.cell)],
      action_type: "immersive_perception_gave_up",
      direct_consequences: {
        alertness: alert.alertness,
        score: alert.score,
      },
    }));
  const lostContactTaskCandidates = lostContactAlerts.map((alert) =>
    taskForPerceptionAlert(
      alert,
      snapshot.generated_at_tick,
      profileForAlert(alert).search_ticks,
    ),
  );
  const taskCandidates = [...freshNpcTaskCandidates, ...lostContactTaskCandidates];
  const candidateByActor = new Map(taskCandidates.map((candidate) => [candidate.actor_id, candidate]));
  const reconciledExistingTasks = (delta.npc_tasks || []).map((existing) => {
    if (!existing.id.startsWith("task_perception_")) return existing;
    if (existing.state === "done" || existing.state === "failed") return existing;
    const candidate = candidateByActor.get(existing.actor_id);
    if (!candidate) {
      if (existing.expires_at_tick !== undefined && existing.expires_at_tick <= snapshot.generated_at_tick) {
        return {
          ...existing,
          state: "failed" as const,
          result: "search_expired",
          updated_at_tick: snapshot.generated_at_tick,
          completed_at_tick: snapshot.generated_at_tick,
        };
      }
      return existing;
    }
    if (
      existing.task_type === candidate.task_type &&
      existing.source_kind === candidate.source_kind &&
      sameCell(existing.target_cell, candidate.target_cell)
    ) {
      candidateByActor.delete(existing.actor_id);
      return {
        ...existing,
        priority: Math.max(existing.priority, candidate.priority),
        expires_at_tick: candidate.expires_at_tick,
        updated_at_tick: snapshot.generated_at_tick,
      };
    }
    return {
      ...existing,
      state: "failed" as const,
      result: "superseded_by_new_evidence",
      updated_at_tick: snapshot.generated_at_tick,
      completed_at_tick: snapshot.generated_at_tick,
    };
  });
  const npcTasks = taskCandidates.filter((candidate) => candidateByActor.get(candidate.actor_id) === candidate);
  const hostileEntityIds = new Set(
    gamePackage.entities.filter((entity) => !entity.is_npc).map((entity) => entity.id),
  );
  const hostileAlerts = snapshot.alerts.filter((alert) => hostileEntityIds.has(alert.entity_id));
  const highestAlert = hostileAlerts
    .slice()
    .sort((a, b) => b.score - a.score)[0];
  const nextSave: PlaySave = {
    ...workingSave,
    entity_states: {
      ...(workingSave.entity_states || {}),
      ...decayedEntityStates,
      ...Object.fromEntries(snapshot.alerts.map((alert) => {
        const profile = profileForAlert(alert);
        const evidenceTick = alert.evidence_tick ?? alert.stimulus.tick ?? snapshot.generated_at_tick;
        return [alert.actor_id, {
          ...(workingSave.entity_states?.[alert.actor_id] || {}),
          alertness: alert.alertness,
          alert_score: alert.score,
          sensory_profile_id: alert.sensory_profile_id || profile.id,
          last_sense_id: alert.sense_id,
          last_detection_cause: alert.cause,
          last_evidence_tick: evidenceTick,
          perception_tracks_live_target: alert.tracks_live_target === true,
          target_actor_id: alert.tracks_live_target ? alert.target_actor_id : undefined,
          last_stimulus: {
            kind: alert.stimulus.kind,
            cell: cloneCell(alert.stimulus.cell),
            tick: evidenceTick,
            source_id: alert.stimulus.source_id,
            tags: alert.stimulus.tags ? [...alert.stimulus.tags] : undefined,
          },
          last_known_position: cloneCell(alert.target_cell),
          investigation_target_cell: cloneCell(alert.target_cell),
          perception_search_expires_at_tick: snapshot.generated_at_tick + Math.max(1, profile.search_ticks),
          perception_memory_expires_at_tick: snapshot.generated_at_tick + Math.max(1, profile.memory_ticks),
        }];
      })),
    },
    flags: {
      ...(workingSave.flags || {}),
      immersive_stealth_feedback: {
        tick: snapshot.generated_at_tick,
        highest_alertness: highestAlert?.alertness || "oblivious",
        visible_to_count: hostileAlerts.filter((alert) => alert.stimulus.kind === "visible_player").length,
        alerted_count: hostileAlerts.length,
        strongest_score: highestAlert?.score || 0,
        strongest_cause: highestAlert?.cause,
        strongest_sense_id: highestAlert?.sense_id,
        strongest_profile_id: highestAlert?.sensory_profile_id,
        strongest_evidence_cell: highestAlert ? cloneCell(highestAlert.target_cell) : undefined,
      },
    },
    map_deltas: {
      ...(workingSave.map_deltas || {}),
      [mapId]: {
        ...delta,
        npc_tasks: [...reconciledExistingTasks, ...npcTasks],
      },
    },
    world_facts: [...(workingSave.world_facts || []), ...worldFacts, ...decayFacts].slice(-250),
  };
  return {
    save: nextSave,
    snapshot,
    world_facts: [...worldFacts, ...decayFacts],
    npc_tasks: npcTasks,
    decayed_alerts: decayedAlerts,
    scheduler_events: schedulerEvents,
  };
};

interface ImmersiveObjectPlacementRef {
  key: string;
  placement: ObjectPlacementData;
  authored: ObjectPlacementData;
  object?: ObjectData;
}

const getImmersiveMap = (
  gamePackage: GamePackage,
  mapId: string,
): MapData | undefined =>
  gamePackage.maps.find((candidate) => candidate.id === mapId);

const getObjectById = (
  gamePackage: GamePackage,
  objectId: string,
): ObjectData | undefined =>
  gamePackage.object_library.find((object) => object.id === objectId);

const getActiveObjectPlacements = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
): ImmersiveObjectPlacementRef[] => {
  const map = getImmersiveMap(gamePackage, mapId);
  const delta = save.map_deltas?.[mapId];
  const removed = new Set(delta?.removed_objects || []);
  const carried = new Set(Object.keys(delta?.carried_objects || {}));
  return (map?.custom_object_placements || []).flatMap((authored) => {
    const key = placementOriginKey(authored);
    if (removed.has(key) || carried.has(key)) return [];
    const moved = delta?.moved_objects?.[key];
    const placement = moved ? { ...authored, cell: cloneCell(moved.cell), facing: cloneCell(moved.facing) } : authored;
    return [{ key, placement, authored, object: getObjectById(gamePackage, authored.object_id) }];
  });
};

const findObjectPlacementAt = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  cell: [number, number],
): ImmersiveObjectPlacementRef | undefined =>
  getActiveObjectPlacements(gamePackage, save, mapId).find(({ placement, object }) =>
    placementFootprintForPackage(gamePackage, placement, object).some((occupied) => sameCell(occupied, cell)),
  );

const findContainerAt = (
  gamePackage: GamePackage,
  mapId: string,
  cell: [number, number],
) => getImmersiveMap(gamePackage, mapId)?.container_placements.find((container) => sameCell(container.cell as [number, number], cell));

const hasBlockingObjectAt = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  cell: [number, number],
  excludeKey?: string,
): boolean =>
  getActiveObjectPlacements(gamePackage, save, mapId).some(({ key, placement, object }) => {
    if (excludeKey && key === excludeKey) return false;
    if (!placementHasCollision(placement, object)) return false;
    return placementFootprintForPackage(gamePackage, placement, object).some((occupied) => sameCell(occupied, cell));
  });

const isCellOpenForVerbPlacement = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  snapshot: ImmersiveStage2Snapshot,
  cell: [number, number],
  excludeKey?: string,
): boolean => {
  const tile = snapshot.tile_layers.cells.find((candidate) => sameCell(candidate.cell, cell));
  if (!tile || tile.blocks_movement) return false;
  if (hasBlockingObjectAt(gamePackage, save, mapId, cell, excludeKey)) return false;
  if (findContainerAt(gamePackage, mapId, cell)) return false;
  if (actorsAtCell(gamePackage, save, mapId, cell).length) return false;
  return true;
};

const destinationForVerb = (
  options: ImmersiveGlobalVerbOptions,
): [number, number] => {
  if (options.targetCell) return cloneCell(options.targetCell);
  const direction = normalizeFacing(options.direction);
  const distance = Math.max(1, Math.floor(options.distance ?? (options.verb === "throw" ? 2 : 1)));
  return [options.cell[0] + direction[0] * distance, options.cell[1] + direction[1] * distance];
};

const movedObjectCondition = (
  ref: ImmersiveObjectPlacementRef,
  verb: ImmersiveGlobalVerbOptions,
  to: [number, number],
  tick: number,
): SimulationConditionRecord => {
  const affordance = resolveObjectManipulationAffordance(ref.object);
  const impact = verb.verb === "throw" ? 0.12 : verb.verb === "stack" ? 0.03 : 0.01;
  return {
    target_kind: "object",
    target_id: ref.key,
    material_id: ref.object?.materials?.[0],
    state: verb.verb === "throw" ? "damaged" : "worn",
    integrity: clamp(1 - impact - affordance.awkwardness * 0.05, 0.05, 1),
    condition_tags: ["global_verb", verb.verb, "moved"],
    cell: cloneCell(to),
    last_action: `verb_${verb.verb}`,
    updated_at_tick: tick,
  };
};

const mergeMapDelta = (
  save: PlaySave,
  mapId: string,
  updater: (delta: MapDelta) => MapDelta,
): PlaySave => {
  const current = save.map_deltas?.[mapId] || {};
  return {
    ...save,
    map_deltas: {
      ...(save.map_deltas || {}),
      [mapId]: updater(current),
    },
  };
};

const applyObjectMoveVerb = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  snapshot: ImmersiveStage2Snapshot,
  options: ImmersiveGlobalVerbOptions,
  tick: number,
): { ok: boolean; reason?: string; save: PlaySave; condition?: SimulationConditionRecord; details?: Record<string, unknown> } => {
  const ref = findObjectPlacementAt(gamePackage, save, mapId, options.cell);
  if (!ref) return { ok: false, reason: "no object", save };
  if (!placementHasCollision(ref.placement, ref.object) || !isPushableObject(ref.object)) {
    return { ok: false, reason: "not movable", save };
  }
  const to = destinationForVerb(options);
  if (!isCellOpenForVerbPlacement(gamePackage, save, mapId, snapshot, to, ref.key)) {
    return { ok: false, reason: "no space", save };
  }
  const condition = movedObjectCondition(ref, options, to, tick);
  const nextSave = mergeMapDelta(save, mapId, (delta) => ({
    ...delta,
    moved_objects: {
      ...(delta.moved_objects || {}),
      [ref.key]: { cell: cloneCell(to), facing: cloneCell((ref.placement.facing || [0, 1]) as [number, number]) },
    },
    simulation_conditions: {
      ...(delta.simulation_conditions || {}),
      [condition.target_id]: condition,
    },
  }));
  return {
    ok: true,
    save: nextSave,
    condition,
    details: {
      object_key: ref.key,
      object_id: ref.placement.object_id,
      from: cloneCell(ref.placement.cell as [number, number]),
      to: cloneCell(to),
    },
  };
};

const applyDropVerb = (
  save: PlaySave,
  mapId: string,
  options: ImmersiveGlobalVerbOptions,
  tick: number,
): { ok: boolean; reason?: string; save: PlaySave; details?: Record<string, unknown> } => {
  const itemId = options.itemId || options.targetId;
  if (!itemId) return { ok: false, reason: "no item", save };
  const count = Math.max(1, Math.floor(options.count || 1));
  const stack = (save.inventory || []).find((item) => item.id === itemId);
  if (!stack || stack.count < count) return { ok: false, reason: "missing item", save };
  const dropped = {
    id: `drop_verb_${tick}_${itemId}_${options.cell[0]}_${options.cell[1]}`,
    item_id: itemId,
    cell: cloneCell(options.cell),
    count,
  };
  const nextInventory = (save.inventory || []).flatMap((item) => {
    if (item.id !== itemId) return [item];
    const remaining = item.count - count;
    return remaining > 0 ? [{ ...item, count: remaining }] : [];
  });
  const nextSave = mergeMapDelta({ ...save, inventory: nextInventory }, mapId, (delta) => ({
    ...delta,
    dropped_items: [...(delta.dropped_items || []), dropped],
  }));
  return { ok: true, save: nextSave, details: { item_id: itemId, count, dropped_id: dropped.id } };
};

const applyBreakVerb = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  options: ImmersiveGlobalVerbOptions,
  tick: number,
): { ok: boolean; reason?: string; save: PlaySave; condition?: SimulationConditionRecord; details?: Record<string, unknown> } => {
  const ref = findObjectPlacementAt(gamePackage, save, mapId, options.cell);
  if (!ref) return { ok: false, reason: "no object", save };
  const condition: SimulationConditionRecord = {
    target_kind: "object",
    target_id: ref.key,
    material_id: ref.object?.materials?.[0],
    state: "broken",
    integrity: 0,
    condition_tags: ["global_verb", "broken", "removed"],
    cell: cloneCell(ref.placement.cell as [number, number]),
    last_action: "verb_break",
    updated_at_tick: tick,
  };
  const nextSave = mergeMapDelta(save, mapId, (delta) => ({
    ...delta,
    moved_objects: Object.fromEntries(Object.entries(delta.moved_objects || {}).filter(([key]) => key !== ref.key)),
    removed_objects: [...new Set([...(delta.removed_objects || []), ref.key])],
    simulation_conditions: {
      ...(delta.simulation_conditions || {}),
      [condition.target_id]: condition,
    },
  }));
  return {
    ok: true,
    save: nextSave,
    condition,
    details: { object_key: ref.key, object_id: ref.placement.object_id, removed: true },
  };
};

const applyHackVerb = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  options: ImmersiveGlobalVerbOptions,
  tick: number,
): { ok: boolean; save: PlaySave; condition?: SimulationConditionRecord; details: Record<string, unknown> } => {
  const container = findContainerAt(gamePackage, mapId, options.cell);
  const ref = findObjectPlacementAt(gamePackage, save, mapId, options.cell);
  const targetId = container?.id || ref?.key || `cell:${mapId}:${options.cell[0]}:${options.cell[1]}`;
  const condition: SimulationConditionRecord = {
    target_kind: container ? "container" : ref ? "object" : "cell",
    target_id: targetId,
    material_id: ref?.object?.materials?.[0],
    state: "damaged",
    integrity: 0.85,
    condition_tags: ["global_verb", "hacked", "access_changed"],
    cell: cloneCell(options.cell),
    last_action: "verb_hack",
    updated_at_tick: tick,
  };
  let nextSave = mergeMapDelta(save, mapId, (delta) => ({
    ...delta,
    containers: container
      ? {
          ...(delta.containers || {}),
          [container.id]: {
            ...(delta.containers?.[container.id] || {}),
            locked: false,
            opened: true,
          },
        }
      : delta.containers,
    simulation_conditions: {
      ...(delta.simulation_conditions || {}),
      [condition.target_id]: condition,
    },
  }));
  nextSave = {
    ...nextSave,
    flags: {
      ...(nextSave.flags || {}),
      [`immersive_hacked_${targetId}`]: true,
    },
  };
  return {
    ok: true,
    save: nextSave,
    condition,
    details: { target_id: targetId, unlocked_container: container?.id },
  };
};

const applyMimicVerb = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  options: ImmersiveGlobalVerbOptions,
): { ok: boolean; reason?: string; save: PlaySave; details?: Record<string, unknown> } => {
  const ref = findObjectPlacementAt(gamePackage, save, mapId, options.cell);
  const objectId = options.targetId || ref?.placement.object_id;
  if (!objectId) return { ok: false, reason: "no mimic form", save };
  const actorId = options.actorId || "player";
  if (actorId === "player") {
    return {
      ok: true,
      save: {
        ...save,
        flags: {
          ...(save.flags || {}),
          immersive_mimic_form: objectId,
        },
      },
      details: { actor_id: actorId, mimic_object_id: objectId },
    };
  }
  return {
    ok: true,
    save: {
      ...save,
      entity_states: {
        ...(save.entity_states || {}),
        [actorId]: {
          ...(save.entity_states?.[actorId] || {}),
          mimic_object_id: objectId,
        },
      },
    },
    details: { actor_id: actorId, mimic_object_id: objectId },
  };
};

const applyGlobalVerbStructuralChanges = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  snapshot: ImmersiveStage2Snapshot,
  options: ImmersiveGlobalVerbOptions,
  tick: number,
): { ok: boolean; reason?: string; save: PlaySave; conditions: SimulationConditionRecord[]; details: Record<string, unknown> } => {
  if (options.verb === "push" || options.verb === "pull" || options.verb === "throw" || options.verb === "stack") {
    const moved = applyObjectMoveVerb(gamePackage, save, mapId, snapshot, options, tick);
    if (!moved.ok) return { ok: false, reason: moved.reason, save, conditions: [], details: {} };
    return {
      ok: true,
      save: moved.save,
      conditions: moved.condition ? [moved.condition] : [],
      details: moved.details || {},
    };
  }
  if (options.verb === "drop") {
    const dropped = applyDropVerb(save, mapId, options, tick);
    if (!dropped.ok) return { ok: false, reason: dropped.reason, save, conditions: [], details: {} };
    return { ok: true, save: dropped.save, conditions: [], details: dropped.details || {} };
  }
  if (options.verb === "break") {
    const broken = applyBreakVerb(gamePackage, save, mapId, options, tick);
    if (!broken.ok) return { ok: false, reason: broken.reason, save, conditions: [], details: {} };
    return {
      ok: true,
      save: broken.save,
      conditions: broken.condition ? [broken.condition] : [],
      details: broken.details || {},
    };
  }
  if (options.verb === "hack") {
    const hacked = applyHackVerb(gamePackage, save, mapId, options, tick);
    return {
      ok: true,
      save: hacked.save,
      conditions: hacked.condition ? [hacked.condition] : [],
      details: hacked.details,
    };
  }
  if (options.verb === "mimic") {
    const mimicked = applyMimicVerb(gamePackage, save, mapId, options);
    if (!mimicked.ok) return { ok: false, reason: mimicked.reason, save, conditions: [], details: {} };
    return { ok: true, save: mimicked.save, conditions: [], details: mimicked.details || {} };
  }
  return { ok: true, save, conditions: [], details: {} };
};

const nextVerbFactId = (save: PlaySave, offset: number) =>
  `wfact:verb:${String((save.world_facts?.length || 0) + offset + 1).padStart(6, "0")}`;

const globalVerbEffectCell = (verb: ImmersiveGlobalVerbOptions): [number, number] => {
  if (
    verb.targetCell &&
    (verb.verb === "push" || verb.verb === "pull" || verb.verb === "throw" || verb.verb === "stack")
  ) {
    return cloneCell(verb.targetCell);
  }
  return cloneCell(verb.cell);
};

const environmentFieldsForVerb = (
  verb: ImmersiveGlobalVerbOptions,
  tick: number,
): SimulationEnvironmentFieldRecord[] => {
  const effectCell = globalVerbEffectCell(verb);
  const [x, y] = effectCell;
  const actorId = verb.actorId || "player";
  const intensity = clamp(verb.intensity ?? 0.8, 0.1, 1);
  const base = {
    age_ticks: 0,
    source: "runtime" as const,
    actor_id: actorId,
    action: `verb_${verb.verb}`,
    origin_cell: effectCell,
    created_at_tick: tick,
  };
  if (verb.verb === "burn") {
    return [
      {
        ...base,
        id: `env_verb_fire_${tick}_${x}_${y}`,
        kind: "fire",
        intensity,
        tag: "global_verb_burn",
        radius: 1,
        damage_per_tick: Math.max(1, Math.round(intensity * 4)),
        decay_per_tick: 0.012,
        expires_at_tick: tick + 90,
      },
      {
        ...base,
        id: `env_verb_light_${tick}_${x}_${y}`,
        kind: "light",
        intensity: Math.max(0.35, intensity * 0.8),
        tag: "global_verb_firelight",
        radius: 6,
        color: "#f59e0b",
        decay_per_tick: 0.08,
        expires_at_tick: tick + 24,
      },
    ];
  }
  if (verb.verb === "freeze") {
    return [{
      ...base,
      id: `env_verb_cold_${tick}_${x}_${y}`,
      kind: "cold",
      intensity,
      tag: "global_verb_freeze",
      radius: 1,
      decay_per_tick: 0.08,
      expires_at_tick: tick + 24,
    }];
  }
  if (verb.verb === "electrify") {
    return [{
      ...base,
      id: `env_verb_electricity_${tick}_${x}_${y}`,
      kind: "electricity",
      intensity,
      tag: "global_verb_electrify",
      radius: 1,
      damage_per_tick: Math.max(1, Math.round(intensity * 2)),
      decay_per_tick: 0.08,
      expires_at_tick: tick + 12,
    }];
  }
  if (verb.verb === "foam") {
    return [
      {
        ...base,
        id: `env_verb_foam_occlusion_${tick}_${x}_${y}`,
        kind: "smoke",
        intensity: Math.max(0.35, intensity * 0.65),
        tag: "global_verb_foam_occlusion",
        radius: 1,
        visibility_modifier: -0.45,
        occlusion: 0.45,
        decay_per_tick: 0.025,
        expires_at_tick: tick + 90,
      },
      {
        ...base,
        id: `env_verb_foam_sound_${tick}_${x}_${y}`,
        kind: "sound",
        intensity: Math.max(0.15, intensity * 0.25),
        tag: "global_verb_foam_impact",
        radius: 2,
        frequency_tag: "muffled_impact",
        decay_per_tick: 0.15,
        expires_at_tick: tick + 8,
      },
    ];
  }
  if (
    verb.verb === "push" ||
    verb.verb === "pull" ||
    verb.verb === "throw" ||
    verb.verb === "drop" ||
    verb.verb === "stack" ||
    verb.verb === "break" ||
    verb.verb === "hack"
  ) {
    return [{
      ...base,
      id: `env_verb_sound_${verb.verb}_${tick}_${x}_${y}`,
      kind: "sound",
      intensity: verb.verb === "throw" || verb.verb === "break" ? Math.max(0.45, intensity) : Math.max(0.2, intensity * 0.45),
      tag: `global_verb_${verb.verb}_sound`,
      radius: verb.verb === "throw" || verb.verb === "break" ? 4 : 2,
      frequency_tag: verb.verb === "hack" ? "electronic" : "impact",
      decay_per_tick: 0.15,
      expires_at_tick: tick + 8,
    }];
  }
  return [];
};

const surfaceLayersForVerb = (
  verb: ImmersiveGlobalVerbOptions,
  tick: number,
): SimulationSurfaceLayerRecord[] => {
  const [x, y] = globalVerbEffectCell(verb);
  const actorId = verb.actorId || "player";
  const amount = clamp(verb.intensity ?? 0.75, 0.1, 1);
  if (verb.verb === "wet" || verb.verb === "douse") {
    return [{
      id: `surface_verb_${verb.verb}_${tick}_${x}_${y}`,
      kind: "water",
      amount,
      age_ticks: 0,
      source: "runtime",
      tag: verb.verb === "douse" ? "global_verb_douse" : "global_verb_wet",
      residue_kind: "water",
      cleaned_by_actor_id: actorId,
      slipperiness: 0.2,
      decay_per_tick: 0.02,
      created_at_tick: tick,
      expires_at_tick: tick + 80,
    }];
  }
  if (verb.verb === "foam") {
    return [
      {
        id: `surface_verb_foam_${tick}_${x}_${y}`,
        kind: "foam",
        amount,
        age_ticks: 0,
        source: "runtime",
        tag: "global_verb_foam_support",
        residue_kind: "foam",
        cleaned_by_actor_id: actorId,
        slipperiness: 0.05,
        trace_potential: 0.35,
        decay_per_tick: 0.01,
        created_at_tick: tick,
        expires_at_tick: tick + 180,
      },
      {
        id: `surface_verb_foam_water_${tick}_${x}_${y}`,
        kind: "water",
        amount: Math.max(0.2, amount * 0.35),
        age_ticks: 0,
        source: "runtime",
        tag: "global_verb_foam_douse",
        residue_kind: "water",
        cleaned_by_actor_id: actorId,
        slipperiness: 0.08,
        decay_per_tick: 0.02,
        created_at_tick: tick,
        expires_at_tick: tick + 70,
      },
    ];
  }
  if (verb.verb === "stack" || verb.verb === "climb") {
    return [{
      id: `surface_verb_support_${verb.verb}_${tick}_${x}_${y}`,
      kind: "climbable_support",
      amount,
      age_ticks: 0,
      source: "runtime",
      tag: `global_verb_${verb.verb}`,
      residue_kind: "support",
      trace_potential: 0.2,
      created_at_tick: tick,
    }];
  }
  return [];
};

const conditionForVerb = (
  mapId: string,
  verb: ImmersiveGlobalVerbOptions,
  tick: number,
): SimulationConditionRecord | undefined => {
  const effectCell = globalVerbEffectCell(verb);
  const base = {
    target_kind: "cell" as const,
    target_id: `cell:${mapId}:${effectCell[0]}:${effectCell[1]}`,
    cell: effectCell,
    last_action: `verb_${verb.verb}`,
    updated_at_tick: tick,
  };
  if (verb.verb === "wet" || verb.verb === "douse") {
    return { ...base, state: "wet", integrity: 0.95, condition_tags: ["global_verb", "wet"] };
  }
  if (verb.verb === "burn") {
    return { ...base, state: "burned", integrity: 0.75, condition_tags: ["global_verb", "burned"] };
  }
  if (verb.verb === "freeze") {
    return { ...base, state: "frozen", integrity: 0.9, condition_tags: ["global_verb", "cold"] };
  }
  if (verb.verb === "foam" || verb.verb === "stack" || verb.verb === "climb") {
    return {
      ...base,
      state: "reinforced",
      integrity: verb.verb === "foam" ? 0.85 : 0.95,
      condition_tags: ["global_verb", verb.verb, "traversal_support"],
    };
  }
  if (verb.verb === "break") {
    return { ...base, state: "broken", integrity: 0, condition_tags: ["global_verb", "broken"] };
  }
  if (verb.verb === "hack") {
    return { ...base, state: "damaged", integrity: 0.85, condition_tags: ["global_verb", "hacked"] };
  }
  return undefined;
};

export const applyImmersiveGlobalVerbToSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: ImmersiveGlobalVerbOptions,
): ImmersiveGlobalVerbResult => {
  const mapId = options.mapId || save.current_map_id || gamePackage.metadata.start_map_id;
  const snapshot = createImmersiveStage2SnapshotFromV1(gamePackage, save, mapId);
  if (!snapshot.tile_layers.cells.some((cell) => sameCell(cell.cell, options.cell))) {
    return {
      ok: false,
      reason: "unknown cell",
      save,
      verb: { ...options, mapId },
      world_facts: [],
      environment_fields: [],
      surface_layers: [],
      condition_records: [],
      reactions: [],
    };
  }
  const tick = snapshot.generated_at_tick;
  const effectCell = globalVerbEffectCell(options);
  const key = cellKey(effectCell);
  const fields = environmentFieldsForVerb(options, tick);
  const surfaces = surfaceLayersForVerb(options, tick);
  const condition = conditionForVerb(mapId, options, tick);
  const structural = applyGlobalVerbStructuralChanges(gamePackage, save, mapId, snapshot, options, tick);
  if (!structural.ok) {
    return {
      ok: false,
      reason: structural.reason,
      save,
      verb: { ...options, mapId },
      world_facts: [],
      environment_fields: [],
      surface_layers: [],
      condition_records: [],
      reactions: [],
    };
  }
  const structuralConditions = structural.conditions;
  const delta = structural.save.map_deltas?.[mapId] || {};
  let nextSave: PlaySave = {
    ...structural.save,
    map_deltas: {
      ...(structural.save.map_deltas || {}),
      [mapId]: {
        ...delta,
        environment_fields: fields.length
          ? {
              ...(delta.environment_fields || {}),
              [key]: [...(delta.environment_fields?.[key] || []), ...fields],
            }
          : delta.environment_fields,
        surface_layers: surfaces.length
          ? {
              ...(delta.surface_layers || {}),
              [key]: [...(delta.surface_layers?.[key] || []), ...surfaces],
            }
          : delta.surface_layers,
        simulation_conditions: condition
          ? {
              ...(delta.simulation_conditions || {}),
              [condition.target_id]: condition,
            }
          : delta.simulation_conditions,
      },
    },
  };
  const verbFact: PlaySaveWorldFact = {
    id: nextVerbFactId(save, 0),
    tick,
    map_id: mapId,
    plane_id: "ground",
    actor_id: options.actorId || "player",
    cells: sameCell(options.cell, effectCell) ? [cloneCell(options.cell)] : [cloneCell(options.cell), cloneCell(effectCell)],
    action_type: "immersive_global_verb_applied",
    direct_consequences: {
      verb: options.verb,
      effect_cell: cloneCell(effectCell),
      environment_fields: fields.map((field) => field.kind),
      surface_layers: surfaces.map((surface) => surface.kind),
      condition_state: condition?.state,
      structural_ok: structural.ok,
      structural_conditions: structuralConditions.map((entry) => ({
        target_kind: entry.target_kind,
        target_id: entry.target_id,
        state: entry.state,
        cell: entry.cell,
      })),
      details: structural.details,
    },
  };
  nextSave = {
    ...nextSave,
    world_facts: [...(nextSave.world_facts || []), verbFact].slice(-250),
  };
  nextSave = clearImmersiveTileLayerCellsFromSave(
    nextSave,
    mapId,
    [options.cell, effectCell, ...(options.targetCell ? [options.targetCell] : [])],
  );
  const reacted = advanceImmersiveReactionsForSave(gamePackage, nextSave, mapId);
  return {
    ok: true,
    save: reacted.save,
    verb: { ...options, mapId },
    world_facts: [verbFact, ...reacted.world_facts],
    environment_fields: [...fields, ...reacted.environment_fields],
    surface_layers: [...surfaces, ...reacted.surface_layers],
    condition_records: [...structuralConditions, ...(condition ? [condition] : []), ...reacted.condition_records],
    reactions: reacted.reactions,
  };
};

interface ImmersiveCombatActorRef {
  actor_id: string;
  entity_id?: string;
  state_key?: string;
  team: ImmersiveCombatTeam;
  cell: [number, number];
  facing: [number, number];
  hp: number;
  max_hp: number;
  height: number;
  statuses: { id: string; remaining: number; magnitude: number }[];
  overwatch: boolean;
  dead?: boolean;
}

const nextCombatFactId = (save: PlaySave, offset: number) =>
  `wfact:combat:${String((save.world_facts?.length || 0) + offset + 1).padStart(6, "0")}`;

const heightAtCell = (
  gamePackage: GamePackage,
  mapId: string,
  cell: [number, number],
): number =>
  getImmersiveMap(gamePackage, mapId)?.cells.find((candidate) => candidate.x === cell[0] && candidate.z === cell[1])?.height || 0;

const actorTeamsOpposed = (a: ImmersiveCombatTeam, b: ImmersiveCombatTeam): boolean =>
  (a === "hostile" && (b === "player" || b === "ally")) ||
  (b === "hostile" && (a === "player" || a === "ally"));

const resolveImmersiveCombatActor = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  actorId: string,
): ImmersiveCombatActorRef | undefined => {
  if (actorId === "player") {
    return {
      actor_id: "player",
      team: "player",
      cell: cloneCell(save.player.cell),
      facing: normalizeFacing(save.player.facing),
      hp: Math.max(0, Math.floor(save.playerStats.hp || 0)),
      max_hp: Math.max(1, Math.floor(save.playerStats.max_hp || save.playerStats.hp || 1)),
      height: heightAtCell(gamePackage, mapId, save.player.cell),
      statuses: [...(save.actor_statuses?.player || [])],
      overwatch: Boolean(save.flags?.immersive_overwatch_player),
      dead: (save.playerStats.hp || 0) <= 0,
    };
  }
  const map = getImmersiveMap(gamePackage, mapId);
  for (let index = 0; index < (map?.entity_placements || []).length; index += 1) {
    const placement = map!.entity_placements[index];
    const stateKey = entityPlacementStateKey(mapId, placement, index);
    if (actorId !== stateKey && actorId !== placement.entity_id) continue;
    const entity = gamePackage.entities.find((candidate) => candidate.id === placement.entity_id);
    const state = save.entity_states?.[stateKey] || save.entity_states?.[placement.entity_id] || {};
    const maxHp = Math.max(1, Math.floor(state.max_hp || entity?.max_hp || 10));
    const hp = Math.max(0, Math.floor(state.hp ?? maxHp));
    const cell = cloneCell((state.cell || placement.cell) as [number, number]);
    const team: ImmersiveCombatTeam = (save.party_members || []).includes(placement.entity_id)
      ? "ally"
      : entity?.is_npc
        ? "neutral"
        : "hostile";
    return {
      actor_id: stateKey,
      entity_id: placement.entity_id,
      state_key: stateKey,
      team,
      cell,
      facing: normalizeFacing((state.facing || placement.facing) as [number, number] | undefined),
      hp,
      max_hp: maxHp,
      height: heightAtCell(gamePackage, mapId, cell),
      statuses: [...(state.statuses || [])],
      overwatch: Boolean(state.overwatch),
      dead: Boolean(state.dead || hp <= 0),
    };
  }
  const state = save.entity_states?.[actorId];
  if (state?.cell) {
    const entity = gamePackage.entities.find((candidate) => candidate.id === actorId);
    const maxHp = Math.max(1, Math.floor(state.max_hp || entity?.max_hp || 10));
    const hp = Math.max(0, Math.floor(state.hp ?? maxHp));
    const cell = cloneCell(state.cell as [number, number]);
    return {
      actor_id: actorId,
      entity_id: entity?.id,
      state_key: actorId,
      team: entity?.is_npc ? "neutral" : "hostile",
      cell,
      facing: normalizeFacing(state.facing as [number, number] | undefined),
      hp,
      max_hp: maxHp,
      height: heightAtCell(gamePackage, mapId, cell),
      statuses: [...(state.statuses || [])],
      overwatch: Boolean(state.overwatch),
      dead: Boolean(state.dead || hp <= 0),
    };
  }
  return undefined;
};

const writeImmersiveCombatActorToSave = (
  save: PlaySave,
  actor: ImmersiveCombatActorRef,
  updates: { cell?: [number, number]; facing?: [number, number]; hp?: number; dead?: boolean },
): PlaySave => {
  if (actor.actor_id === "player") {
    return {
      ...save,
      player: {
        ...save.player,
        ...(updates.cell ? { cell: cloneCell(updates.cell) } : {}),
        ...(updates.facing ? { facing: cloneCell(updates.facing) } : {}),
      },
      playerStats: {
        ...save.playerStats,
        ...(updates.hp !== undefined ? { hp: clamp(Math.floor(updates.hp), 0, save.playerStats.max_hp || actor.max_hp) } : {}),
      },
    };
  }
  const key = actor.state_key || actor.actor_id;
  const state = save.entity_states?.[key] || {};
  const hp = updates.hp !== undefined ? clamp(Math.floor(updates.hp), 0, actor.max_hp) : undefined;
  return {
    ...save,
    entity_states: {
      ...(save.entity_states || {}),
      [key]: {
        ...state,
        ...(updates.cell ? { cell: cloneCell(updates.cell) } : {}),
        ...(updates.facing ? { facing: cloneCell(updates.facing) } : {}),
        ...(hp !== undefined ? { hp, dead: updates.dead ?? hp <= 0 } : updates.dead !== undefined ? { dead: updates.dead } : {}),
      },
    },
  };
};

const isCellOpenForForcedMovement = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  snapshot: ImmersiveStage2Snapshot,
  cell: [number, number],
  movingActorId: string,
): boolean => {
  const tile = snapshot.tile_layers.cells.find((candidate) => sameCell(candidate.cell, cell));
  if (!tile || tile.blocks_movement) return false;
  if (hasBlockingObjectAt(gamePackage, save, mapId, cell)) return false;
  if (findContainerAt(gamePackage, mapId, cell)) return false;
  return actorsAtCell(gamePackage, save, mapId, cell).every((actor) => actor.actor_id === movingActorId);
};

const forcedMovementPath = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  snapshot: ImmersiveStage2Snapshot,
  from: [number, number],
  direction: [number, number],
  distance: number,
  movingActorId: string,
): [number, number][] => {
  const path: [number, number][] = [];
  const dir = normalizeFacing(direction);
  let cursor = cloneCell(from);
  for (let step = 0; step < Math.max(1, Math.floor(distance)); step += 1) {
    const next: [number, number] = [cursor[0] + dir[0], cursor[1] + dir[1]];
    if (!isCellOpenForForcedMovement(gamePackage, save, mapId, snapshot, next, movingActorId)) break;
    path.push(next);
    cursor = next;
  }
  return path;
};

const tileHazardDamage = (
  tile: ImmersiveTileLayerCellState | undefined,
): { damage: number; sources: string[] } => {
  if (!tile) return { damage: 0, sources: [] };
  const sources: string[] = [];
  let damage = 0;
  if (tile.temperature >= 120 || tile.environment_kinds.includes("fire")) {
    sources.push("fire");
    damage += tile.temperature >= 250 ? 5 : 3;
  }
  if (tile.environment_kinds.includes("electricity") || tile.environment_kinds.includes("conductive_electricity")) {
    sources.push("electricity");
    damage += 3;
  }
  if (tile.gas?.kind === "poison_gas" || tile.environment_kinds.includes("poison_gas")) {
    sources.push("poison_gas");
    damage += 2;
  }
  if (tile.environment_kinds.includes("acid_fumes") || tile.surface_kinds.includes("acid")) {
    sources.push("acid");
    damage += 2;
  }
  if (tile.surface_kinds.includes("ice")) sources.push("ice");
  return { damage, sources: [...new Set(sources)] };
};

const primaryDirection = (from: [number, number], to: [number, number]): [number, number] => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return [sign(dx), 0];
  if (dy !== 0) return [0, sign(dy)];
  return [0, -1];
};

const combatActorsFromSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
): ImmersiveCombatActorRef[] => {
  const actors: ImmersiveCombatActorRef[] = [];
  if (save.current_map_id === mapId) {
    const player = resolveImmersiveCombatActor(gamePackage, save, mapId, "player");
    if (player && !player.dead) actors.push(player);
  }
  const map = getImmersiveMap(gamePackage, mapId);
  const seen = new Set(actors.map((actor) => actor.actor_id));
  (map?.entity_placements || []).forEach((placement, index) => {
    const key = entityPlacementStateKey(mapId, placement, index);
    const actor = resolveImmersiveCombatActor(gamePackage, save, mapId, key);
    if (actor && !actor.dead && !seen.has(actor.actor_id)) {
      seen.add(actor.actor_id);
      actors.push(actor);
    }
  });
  Object.keys(save.entity_states || {}).forEach((key) => {
    if (seen.has(key)) return;
    const actor = resolveImmersiveCombatActor(gamePackage, save, mapId, key);
    if (actor && !actor.dead && !seen.has(actor.actor_id)) {
      seen.add(actor.actor_id);
      actors.push(actor);
    }
  });
  return actors;
};

const combatActorSnapshot = (actor: ImmersiveCombatActorRef): ImmersiveCombatActorSnapshot => ({
  actor_id: actor.actor_id,
  entity_id: actor.entity_id,
  team: actor.team,
  cell: cloneCell(actor.cell),
  facing: cloneCell(actor.facing),
  hp: actor.hp,
  max_hp: actor.max_hp,
  height: actor.height,
  statuses: actor.statuses.map((status) => ({ ...status })),
  overwatch: actor.overwatch,
});

const coverStrengthForObject = (object: ObjectData | undefined): ImmersiveCombatCoverStrength =>
  object?.category === "structure" || object?.tags?.includes("wall") ? "full" : "half";

const coverEdgesForCell = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  cell: ImmersiveTileLayerCellState,
  cellsByKey: Map<string, ImmersiveTileLayerCellState>,
): ImmersiveCombatCoverEdge[] => {
  if (cell.blocks_movement) return [];
  const edges: ImmersiveCombatCoverEdge[] = [];
  orthogonalNeighborCells(cell.cell).forEach((neighbor) => {
    const direction = primaryDirection(cell.cell, neighbor);
    const objectRef = findObjectPlacementAt(gamePackage, save, mapId, neighbor);
    if (objectRef?.object && placementHasCollision(objectRef.placement, objectRef.object)) {
      edges.push({
        cell: cloneCell(cell.cell),
        direction,
        strength: coverStrengthForObject(objectRef.object),
        source_kind: "object",
        source_id: objectRef.key,
      });
      return;
    }
    const container = findContainerAt(gamePackage, mapId, neighbor);
    if (container) {
      edges.push({
        cell: cloneCell(cell.cell),
        direction,
        strength: "half",
        source_kind: "container",
        source_id: container.id,
      });
      return;
    }
    const neighborTile = cellsByKey.get(cellKey(neighbor));
    if (neighborTile?.blocks_movement || neighborTile?.blocks_vision) {
      edges.push({
        cell: cloneCell(cell.cell),
        direction,
        strength: neighborTile.blocks_vision ? "full" : "half",
        source_kind: "terrain",
        source_id: `cell:${mapId}:${neighbor[0]}:${neighbor[1]}`,
      });
    }
  });
  return edges;
};

const overwatchCellsForActor = (
  actor: ImmersiveCombatActorRef,
  snapshot: ImmersiveStage2Snapshot,
  radius = 4,
): [number, number][] => {
  const byKey = new Map(snapshot.tile_layers.cells.map((cell) => [cellKey(cell.cell), cell]));
  return snapshot.tile_layers.cells
    .filter((cell) =>
      !sameCell(cell.cell, actor.cell) &&
      !cell.blocks_movement &&
      manhattan(actor.cell, cell.cell) <= radius &&
      hasTileLineOfSight(byKey, actor.cell, cell.cell)
    )
    .map((cell) => cloneCell(cell.cell));
};

const nextStepToward = (
  from: [number, number],
  to: [number, number],
  snapshot: ImmersiveStage2Snapshot,
): [number, number] => {
  const candidates = orthogonalNeighborCells(from)
    .filter((cell) => snapshot.tile_layers.cells.some((tile) => sameCell(tile.cell, cell) && !tile.blocks_movement))
    .sort((a, b) => manhattan(a, to) - manhattan(b, to) || a[0] - b[0] || a[1] - b[1]);
  return candidates[0] ? cloneCell(candidates[0]) : cloneCell(from);
};

const closestOpposingActor = (
  actor: ImmersiveCombatActorRef,
  actors: ImmersiveCombatActorRef[],
): ImmersiveCombatActorRef | undefined =>
  actors
    .filter((candidate) => candidate.actor_id !== actor.actor_id && actorTeamsOpposed(actor.team, candidate.team))
    .sort((a, b) => manhattan(actor.cell, a.cell) - manhattan(actor.cell, b.cell) || a.actor_id.localeCompare(b.actor_id))[0];

const telegraphedIntentForActor = (
  gamePackage: GamePackage,
  actor: ImmersiveCombatActorRef,
  actors: ImmersiveCombatActorRef[],
  snapshot: ImmersiveStage2Snapshot,
): ImmersiveCombatIntentRecord | undefined => {
  if (actor.overwatch) {
    return {
      actor_id: actor.actor_id,
      action_type: "overwatch",
      target_cells: overwatchCellsForActor(actor, snapshot, scaleMacroDistanceForPackage(gamePackage, 4)),
      estimated_damage: 2,
      priority: 70,
    };
  }
  if (actor.team !== "hostile") return undefined;
  const target = closestOpposingActor(actor, actors);
  if (!target) return undefined;
  if (areAdjacentMacroForPackage(gamePackage, actor.cell, target.cell)) {
    return {
      actor_id: actor.actor_id,
      action_type: "melee_attack",
      target_actor_id: target.actor_id,
      target_cells: [cloneCell(target.cell)],
      estimated_damage: 4,
      priority: 100,
    };
  }
  return {
    actor_id: actor.actor_id,
    action_type: "advance",
    target_actor_id: target.actor_id,
    target_cells: [nextStepToward(actor.cell, target.cell, snapshot)],
    estimated_damage: 0,
    priority: 40,
  };
};

export const createImmersiveCombatTacticalSnapshotFromV1 = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id || gamePackage.metadata.start_map_id,
): ImmersiveStage6TacticalSnapshot => {
  const stage2 = createImmersiveStage2SnapshotFromV1(gamePackage, save, mapId);
  const actors = combatActorsFromSave(gamePackage, save, mapId);
  const cellsByKey = new Map(stage2.tile_layers.cells.map((cell) => [cellKey(cell.cell), cell]));
  const coverEdges = stage2.tile_layers.cells.flatMap((cell) =>
    coverEdgesForCell(gamePackage, save, mapId, cell, cellsByKey),
  );
  const overwatchZones = actors
    .filter((actor) => actor.overwatch)
    .map((actor) => ({
      actor_id: actor.actor_id,
      origin_cell: cloneCell(actor.cell),
      radius: scaleMacroDistanceForPackage(gamePackage, 4),
      cells: overwatchCellsForActor(actor, stage2, scaleMacroDistanceForPackage(gamePackage, 4)),
    }));
  const intents = actors.flatMap((actor) => {
    const intent = telegraphedIntentForActor(gamePackage, actor, actors, stage2);
    return intent ? [intent] : [];
  });
  return {
    map_id: stage2.map_id,
    generated_at_tick: stage2.generated_at_tick,
    actors: actors.map(combatActorSnapshot),
    cover_edges: coverEdges,
    overwatch_zones: overwatchZones,
    intents,
    totals: {
      actors: actors.length,
      cover_edges: coverEdges.length,
      overwatch_zones: overwatchZones.length,
      telegraphed_intents: intents.length,
    },
  };
};

const coverForAttack = (
  tactical: ImmersiveStage6TacticalSnapshot,
  attacker: ImmersiveCombatActorRef,
  target: ImmersiveCombatActorRef,
): ImmersiveCombatCoverEdge | undefined => {
  const incoming = primaryDirection(target.cell, attacker.cell);
  return tactical.cover_edges.find((edge) => sameCell(edge.cell, target.cell) && sameCell(edge.direction, incoming));
};

const isFlankingAttack = (
  attacker: ImmersiveCombatActorRef,
  target: ImmersiveCombatActorRef,
): boolean => {
  const incoming = primaryDirection(target.cell, attacker.cell);
  return incoming[0] * target.facing[0] + incoming[1] * target.facing[1] < 0;
};

const clearOverwatchState = (
  save: PlaySave,
  actor: ImmersiveCombatActorRef,
): PlaySave => {
  if (actor.actor_id === "player") {
    return { ...save, flags: { ...(save.flags || {}), immersive_overwatch_player: false } };
  }
  const key = actor.state_key || actor.actor_id;
  return {
    ...save,
    entity_states: {
      ...(save.entity_states || {}),
      [key]: {
        ...(save.entity_states?.[key] || {}),
        overwatch: false,
      },
    },
  };
};

const resolveImmersiveOverwatchTriggers = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  movingActor: ImmersiveCombatActorRef,
  path: [number, number][],
): { save: PlaySave; triggers: ImmersiveCombatOverwatchTrigger[]; world_facts: PlaySaveWorldFact[] } => {
  const tactical = createImmersiveCombatTacticalSnapshotFromV1(gamePackage, save, mapId);
  const validPath = path.filter(
    (cell): cell is [number, number] =>
      Array.isArray(cell) && Number.isFinite(cell[0]) && Number.isFinite(cell[1]),
  );
  const pathKeys = new Set(validPath.map(cellKey));
  let nextSave = save;
  const triggers: ImmersiveCombatOverwatchTrigger[] = [];
  const facts: PlaySaveWorldFact[] = [];
  tactical.overwatch_zones.forEach((zone) => {
    const triggerCell = zone.cells.find((cell) => pathKeys.has(cellKey(cell)));
    if (!triggerCell) return;
    const watcher = resolveImmersiveCombatActor(gamePackage, nextSave, mapId, zone.actor_id);
    const target = resolveImmersiveCombatActor(gamePackage, nextSave, mapId, movingActor.actor_id);
    if (!watcher || !target || !actorTeamsOpposed(watcher.team, target.team)) return;
    const damage = 2;
    const nextHp = Math.max(0, target.hp - damage);
    nextSave = writeImmersiveCombatActorToSave(nextSave, target, { hp: nextHp, dead: nextHp <= 0 });
    nextSave = clearOverwatchState(nextSave, watcher);
    const trigger: ImmersiveCombatOverwatchTrigger = {
      actor_id: watcher.actor_id,
      target_actor_id: target.actor_id,
      cell: cloneCell(triggerCell),
      damage,
    };
    triggers.push(trigger);
    facts.push({
      id: nextCombatFactId(save, facts.length),
      tick: tactical.generated_at_tick,
      map_id: mapId,
      plane_id: "ground",
      actor_id: watcher.actor_id,
      target_id: target.actor_id,
      cells: [cloneCell(triggerCell)],
      action_type: "immersive_combat_overwatch_triggered",
      direct_consequences: { damage },
    });
  });
  if (facts.length) {
    nextSave = {
      ...nextSave,
      world_facts: [...(nextSave.world_facts || []), ...facts].slice(-250),
    };
  }
  return { save: nextSave, triggers, world_facts: facts };
};

export interface ImmersivePlayerOverwatchResult {
  ok: boolean;
  reason?: string;
  save: PlaySave;
  zone_cells: [number, number][];
}

// Player-set overwatch: arm the reactive zone the tactical snapshot already
// understands (`flags.immersive_overwatch_player`). The first opposing actor
// that moves through a watched cell takes the reaction hit and disarms it.
export const applyImmersivePlayerOverwatchToSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: { mapId?: string } = {},
): ImmersivePlayerOverwatchResult => {
  const mapId = options.mapId || save.current_map_id || gamePackage.metadata.start_map_id;
  if ((save.playerStats.hp || 0) <= 0) {
    return { ok: false, reason: "player is down", save, zone_cells: [] };
  }
  if (save.flags?.immersive_overwatch_player) {
    return { ok: false, reason: "overwatch already set", save, zone_cells: [] };
  }
  let nextSave: PlaySave = {
    ...save,
    flags: { ...(save.flags || {}), immersive_overwatch_player: true },
  };
  const tactical = createImmersiveCombatTacticalSnapshotFromV1(gamePackage, nextSave, mapId);
  const zone = tactical.overwatch_zones.find((candidate) => candidate.actor_id === "player");
  const fact: PlaySaveWorldFact = {
    id: nextCombatFactId(nextSave, 0),
    tick: tactical.generated_at_tick,
    map_id: mapId,
    plane_id: "ground",
    actor_id: "player",
    cells: [cloneCell(nextSave.player.cell)],
    action_type: "immersive_combat_overwatch_set",
    direct_consequences: { watched_cells: zone?.cells.length || 0 },
  };
  nextSave = {
    ...nextSave,
    world_facts: [...(nextSave.world_facts || []), fact].slice(-250),
  };
  return {
    ok: true,
    save: nextSave,
    zone_cells: (zone?.cells || []).map(cloneCell),
  };
};

// Resolve overwatch reactions against an actor's ordinary movement path (the
// forced-movement resolver already does this internally; this exposes the same
// rule to regular moves, e.g. an enemy stepping through the player's zone).
export const applyImmersiveOverwatchToMovementSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: { mapId?: string; actorId: string; path: [number, number][] },
): { save: PlaySave; triggers: ImmersiveCombatOverwatchTrigger[] } => {
  const mapId = options.mapId || save.current_map_id || gamePackage.metadata.start_map_id;
  if (!options.path.length) return { save, triggers: [] };
  const mover = resolveImmersiveCombatActor(gamePackage, save, mapId, options.actorId);
  if (!mover || mover.dead) return { save, triggers: [] };
  const resolved = resolveImmersiveOverwatchTriggers(gamePackage, save, mapId, mover, options.path);
  return { save: resolved.save, triggers: resolved.triggers };
};

export const applyImmersiveCombatAttackToSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: ImmersiveCombatAttackOptions,
): ImmersiveCombatAttackResult => {
  const mapId = options.mapId || save.current_map_id || gamePackage.metadata.start_map_id;
  const actorId = options.actorId || "player";
  const schedulerAdvance = advanceImmersiveStage2Save(gamePackage, save, {
    mapId,
    action: {
      actor_id: actorId,
      action_type: "combat_attack",
      energy_cost: Math.max(0, Math.floor(options.energyCost ?? IMMERSIVE_STANDARD_ACTION_ENERGY)),
    },
  });
  if (!schedulerAdvance.ok) {
    return {
      ok: false,
      reason: schedulerAdvance.reason,
      save,
      actor_id: actorId,
      target_actor_id: options.targetActorId,
      damage: 0,
      mitigated_damage: 0,
      flanked: false,
      height_delta: 0,
      facing_bonus: 0,
      height_bonus: 0,
      cover_reduction: 0,
      defeated: false,
      world_facts: [],
      scheduler_events: schedulerAdvance.events,
    };
  }
  let workingSave = schedulerAdvance.save;
  const attacker = resolveImmersiveCombatActor(gamePackage, workingSave, mapId, actorId);
  const target = resolveImmersiveCombatActor(gamePackage, workingSave, mapId, options.targetActorId);
  if (!attacker || !target || target.dead) {
    return {
      ok: false,
      reason: "unknown target",
      save: workingSave,
      actor_id: actorId,
      target_actor_id: options.targetActorId,
      damage: 0,
      mitigated_damage: 0,
      flanked: false,
      height_delta: 0,
      facing_bonus: 0,
      height_bonus: 0,
      cover_reduction: 0,
      defeated: false,
      world_facts: [],
      scheduler_events: schedulerAdvance.events,
    };
  }
  const authoredRange = options.range || 6;
  const range = Math.max(1, Math.floor(scaleMacroDistanceForPackage(gamePackage, authoredRange)));
  const isMeleeAttack = authoredRange <= 1;
  const targetInRange = isMeleeAttack
    ? areAdjacentMacroForPackage(gamePackage, attacker.cell, target.cell)
    : manhattan(attacker.cell, target.cell) <= range;
  if (!targetInRange) {
    return {
      ok: false,
      reason: "out of range",
      save: workingSave,
      actor_id: attacker.actor_id,
      target_actor_id: target.actor_id,
      damage: 0,
      mitigated_damage: 0,
      flanked: false,
      height_delta: 0,
      facing_bonus: 0,
      height_bonus: 0,
      cover_reduction: 0,
      defeated: false,
      world_facts: [],
      scheduler_events: schedulerAdvance.events,
    };
  }
  const stage2 = createImmersiveStage2SnapshotFromV1(gamePackage, workingSave, mapId);
  const cellsByKey = new Map(stage2.tile_layers.cells.map((cell) => [cellKey(cell.cell), cell]));
  if (!isMeleeAttack && range > 1 && !hasTileLineOfSight(cellsByKey, attacker.cell, target.cell)) {
    return {
      ok: false,
      reason: "no line of sight",
      save: workingSave,
      actor_id: attacker.actor_id,
      target_actor_id: target.actor_id,
      damage: 0,
      mitigated_damage: 0,
      flanked: false,
      height_delta: 0,
      facing_bonus: 0,
      height_bonus: 0,
      cover_reduction: 0,
      defeated: false,
      world_facts: [],
      scheduler_events: schedulerAdvance.events,
    };
  }
  const tactical = createImmersiveCombatTacticalSnapshotFromV1(gamePackage, workingSave, mapId);
  const cover = coverForAttack(tactical, attacker, target);
  const flanked = isFlankingAttack(attacker, target);
  const heightDelta = attacker.height - target.height;
  const heightBonus = heightDelta > 0 ? 2 : heightDelta < 0 ? -1 : 0;
  const facingBonus = flanked ? 2 : 0;
  const coverReduction = cover && !flanked ? cover.strength === "full" ? 4 : 2 : 0;
  const baseDamage = Math.max(0, Math.floor(options.baseDamage ?? 5));
  const mitigatedDamage = Math.max(0, baseDamage + heightBonus + facingBonus - coverReduction);
  const nextHp = Math.max(0, target.hp - mitigatedDamage);
  workingSave = writeImmersiveCombatActorToSave(workingSave, target, { hp: nextHp, dead: nextHp <= 0 });
  const fact: PlaySaveWorldFact = {
    id: nextCombatFactId(workingSave, 0),
    tick: tactical.generated_at_tick,
    map_id: mapId,
    plane_id: "ground",
    actor_id: attacker.actor_id,
    target_id: target.actor_id,
    cells: [cloneCell(attacker.cell), cloneCell(target.cell)],
    action_type: "immersive_combat_attack_resolved",
    direct_consequences: {
      base_damage: baseDamage,
      damage: mitigatedDamage,
      cover_reduction: coverReduction,
      cover,
      flanked,
      height_delta: heightDelta,
      height_bonus: heightBonus,
      facing_bonus: facingBonus,
      defeated: nextHp <= 0,
    },
  };
  workingSave = {
    ...workingSave,
    world_facts: [...(workingSave.world_facts || []), fact].slice(-250),
  };
  return {
    ok: true,
    save: workingSave,
    actor_id: attacker.actor_id,
    target_actor_id: target.actor_id,
    damage: baseDamage,
    mitigated_damage: mitigatedDamage,
    cover,
    flanked,
    height_delta: heightDelta,
    facing_bonus: facingBonus,
    height_bonus: heightBonus,
    cover_reduction: coverReduction,
    defeated: nextHp <= 0,
    world_facts: [fact],
    scheduler_events: schedulerAdvance.events,
  };
};

export const applyImmersiveCombatForcedMovementToSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: ImmersiveCombatForcedMovementOptions,
): ImmersiveCombatForcedMovementResult => {
  const mapId = options.mapId || save.current_map_id || gamePackage.metadata.start_map_id;
  const actorId = options.actorId || "player";
  const schedulerAdvance = advanceImmersiveStage2Save(gamePackage, save, {
    mapId,
    action: {
      actor_id: actorId,
      action_type: "combat_forced_movement",
      energy_cost: Math.max(0, Math.floor(options.energyCost ?? IMMERSIVE_STANDARD_ACTION_ENERGY)),
    },
    segments: Math.max(0, Math.floor(options.segments || 0)),
  });
  if (!schedulerAdvance.ok) {
    return {
      ok: false,
      reason: schedulerAdvance.reason,
      save,
      actor_id: actorId,
      target_actor_id: options.targetActorId,
      path: [],
      hazard_damage: 0,
      hazard_sources: [],
      reactions: [],
      status_applications: [],
      overwatch_triggers: [],
      world_facts: [],
      scheduler_events: schedulerAdvance.events,
    };
  }
  let workingSave = schedulerAdvance.save;
  const target = resolveImmersiveCombatActor(gamePackage, workingSave, mapId, options.targetActorId);
  if (!target || target.dead) {
    return {
      ok: false,
      reason: "unknown target",
      save: workingSave,
      actor_id: actorId,
      target_actor_id: options.targetActorId,
      path: [],
      hazard_damage: 0,
      hazard_sources: [],
      reactions: [],
      status_applications: [],
      overwatch_triggers: [],
      world_facts: [],
      scheduler_events: schedulerAdvance.events,
    };
  }
  const snapshot = createImmersiveStage2SnapshotFromV1(gamePackage, workingSave, mapId);
  const distance = Math.max(1, Math.floor(options.distance || 1));
  const direction = normalizeFacing(options.direction);
  const path = forcedMovementPath(gamePackage, workingSave, mapId, snapshot, target.cell, direction, distance, target.actor_id);
  if (!path.length) {
    return {
      ok: false,
      reason: "blocked",
      save: workingSave,
      actor_id: actorId,
      target_actor_id: target.actor_id,
      from: cloneCell(target.cell),
      path: [],
      hazard_damage: 0,
      hazard_sources: [],
      reactions: [],
      status_applications: [],
      overwatch_triggers: [],
      world_facts: [],
      scheduler_events: schedulerAdvance.events,
    };
  }
  const to = path[path.length - 1];
  workingSave = writeImmersiveCombatActorToSave(workingSave, target, { cell: to, facing: direction });
  const reacted = advanceImmersiveReactionsForSave(gamePackage, workingSave, mapId);
  workingSave = reacted.save;
  const hazardSnapshot = createImmersiveStage2SnapshotFromV1(gamePackage, workingSave, mapId);
  const finalTile = hazardSnapshot.tile_layers.cells.find((cell) => sameCell(cell.cell, to));
  const hazard = tileHazardDamage(finalTile);
  let finalTarget = resolveImmersiveCombatActor(gamePackage, workingSave, mapId, target.actor_id) || target;
  if (hazard.damage > 0) {
    const nextHp = Math.max(0, finalTarget.hp - hazard.damage);
    workingSave = writeImmersiveCombatActorToSave(workingSave, finalTarget, { hp: nextHp, dead: nextHp <= 0 });
    finalTarget = { ...finalTarget, hp: nextHp, dead: nextHp <= 0 };
  }
  const overwatch = resolveImmersiveOverwatchTriggers(gamePackage, workingSave, mapId, finalTarget, path);
  workingSave = overwatch.save;
  finalTarget = resolveImmersiveCombatActor(gamePackage, workingSave, mapId, finalTarget.actor_id) || finalTarget;
  const forcedFact: PlaySaveWorldFact = {
    id: nextCombatFactId(workingSave, 0),
    tick: hazardSnapshot.generated_at_tick,
    map_id: mapId,
    plane_id: "ground",
    actor_id: actorId,
    target_id: finalTarget.actor_id,
    cells: [cloneCell(target.cell), ...path.map(cloneCell)],
    action_type: "immersive_combat_forced_movement",
    direct_consequences: {
      from: cloneCell(target.cell),
      to: cloneCell(to),
      distance: path.length,
      direction: cloneCell(direction),
      hazard_damage: hazard.damage,
      hazard_sources: hazard.sources,
      defeated: Boolean(finalTarget.dead),
      reactions: reacted.reactions.map((reaction) => reaction.rule_id),
      status_applications: reacted.status_applications,
      overwatch_triggers: overwatch.triggers,
    },
  };
  workingSave = {
    ...workingSave,
    world_facts: [...(workingSave.world_facts || []), forcedFact].slice(-250),
  };
  return {
    ok: true,
    save: workingSave,
    actor_id: actorId,
    target_actor_id: finalTarget.actor_id,
    from: cloneCell(target.cell),
    to: cloneCell(to),
    path,
    hazard_damage: hazard.damage,
    hazard_sources: hazard.sources,
    reactions: reacted.reactions,
    status_applications: reacted.status_applications,
    overwatch_triggers: overwatch.triggers,
    world_facts: [forcedFact, ...overwatch.world_facts, ...reacted.world_facts],
    scheduler_events: schedulerAdvance.events,
  };
};

const inventoryFactId = (save: PlaySave, offset: number) =>
  `wfact:worldstate:${String((save.world_facts?.length || 0) + offset + 1).padStart(6, "0")}`;

const inventoryItemWeight = (item: GamePackage["items"][number] | undefined): number => {
  if (item?.spatial?.weight_kg !== undefined) return Math.max(0, Number(item.spatial.weight_kg || 0));
  if (item?.simulation?.mass_kg !== undefined) return Math.max(0, Number(item.simulation.mass_kg || 0));
  if (item?.category === "weapon") return 3;
  if (item?.category === "armor") return 5;
  if (item?.category === "key") return 0.1;
  return 0.4;
};

const inventoryItemBulk = (item: GamePackage["items"][number] | undefined): number => {
  if (item?.spatial?.bulk !== undefined) return Math.max(0.1, Number(item.spatial.bulk || 0.1));
  if (item?.simulation?.bulk !== undefined) return Math.max(0.1, Number(item.simulation.bulk || 0.1));
  if (item?.category === "weapon") return 2;
  if (item?.category === "armor") return 3;
  if (item?.category === "key") return 0.2;
  return 0.5;
};

const itemShapeForSlots = (slots: number): [number, number][] => {
  const count = Math.max(1, Math.floor(slots));
  const width = count <= 2 ? count : count <= 4 ? 2 : 3;
  return Array.from({ length: count }, (_, index) => [index % width, Math.floor(index / width)] as [number, number]);
};

const normalizedItemShape = (
  item: GamePackage["items"][number] | undefined,
  fallbackSlots: number,
): [number, number][] => {
  const authored = item?.spatial?.shape || [];
  const raw = authored.length ? authored : itemShapeForSlots(fallbackSlots);
  const minX = Math.min(...raw.map((cell) => cell[0]));
  const minY = Math.min(...raw.map((cell) => cell[1]));
  const seen = new Set<string>();
  const cells: [number, number][] = [];
  raw.forEach((cell) => {
    const normalized: [number, number] = [Math.max(0, Math.floor(cell[0] - minX)), Math.max(0, Math.floor(cell[1] - minY))];
    const key = cellKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push(normalized);
  });
  return cells.length ? cells.sort((a, b) => a[1] - b[1] || a[0] - b[0]) : [[0, 0]];
};

const placeInventoryShapeStacks = (
  shape: [number, number][],
  count: number,
  gridSize: [number, number],
  occupied: Set<string>,
): { cells: [number, number][]; overflow: number } => {
  const capacity = Math.max(0, gridSize[0] * gridSize[1]);
  const cells: [number, number][] = [];
  let overflow = 0;
  for (let stack = 0; stack < Math.max(1, Math.floor(count)); stack += 1) {
    let placed: [number, number][] | undefined;
    for (let slot = 0; slot < capacity && !placed; slot += 1) {
      const origin: [number, number] = [slot % gridSize[0], Math.floor(slot / gridSize[0])];
      const candidate = shape.map((offset) => [origin[0] + offset[0], origin[1] + offset[1]] as [number, number]);
      if (candidate.some((cell) => cell[0] < 0 || cell[1] < 0 || cell[0] >= gridSize[0] || cell[1] >= gridSize[1])) continue;
      if (candidate.some((cell) => occupied.has(cellKey(cell)))) continue;
      placed = candidate;
    }
    if (!placed) {
      overflow += shape.length;
      continue;
    }
    placed.forEach((cell) => {
      occupied.add(cellKey(cell));
      cells.push(cell);
    });
  }
  return { cells, overflow };
};

export const createImmersiveSpatialInventorySnapshotFromSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: ImmersiveSpatialInventoryOptions = {},
): ImmersiveSpatialInventorySnapshot => {
  const actorId = options.actorId || "player";
  const gridSize = options.gridSize || [6, 4] as [number, number];
  const capacitySlots = Math.max(0, gridSize[0] * gridSize[1]);
  const itemById = new Map(gamePackage.items.map((item) => [item.id, item]));
  const occupied = new Set<string>();
  const items = (save.inventory || []).filter((entry) => entry.count > 0).map((entry) => {
    const item = itemById.get(entry.id);
    const count = Math.max(1, Math.floor(entry.count || 1));
    const weightPerItem = inventoryItemWeight(item);
    const bulkPerItem = inventoryItemBulk(item);
    const shape = normalizedItemShape(item, Math.max(1, Math.ceil(bulkPerItem)));
    const slotsPerItem = shape.length;
    const totalSlots = slotsPerItem * count;
    const placement = placeInventoryShapeStacks(shape, count, gridSize, occupied);
    const worldObjectId = `inventory:${actorId}:${entry.id}`;
    return {
      item_id: entry.id,
      display_name: item?.display_name || entry.id,
      count,
      weight_per_item_kg: Number(weightPerItem.toFixed(3)),
      total_weight_kg: Number((weightPerItem * count).toFixed(3)),
      bulk_per_item: Number(bulkPerItem.toFixed(3)),
      slots_per_item: slotsPerItem,
      total_slots: totalSlots,
      shape,
      placed_cells: placement.cells,
      overflow_slots: placement.overflow,
      world_object_instance_id: worldObjectId,
    } satisfies ImmersiveSpatialInventoryItem;
  });
  const totalWeight = items.reduce((sum, item) => sum + item.total_weight_kg, 0);
  const usedSlots = items.reduce((sum, item) => sum + item.total_slots, 0);
  const overflowSlots = Math.max(0, usedSlots - capacitySlots);
  const maxCarryWeight = options.maxCarryWeightKg ?? Math.max(10, 18 + (save.playerStats.attack || 0) * 2 + (save.playerStats.defense || 0));
  const overweight = Math.max(0, totalWeight - maxCarryWeight);
  const apPenalty = Math.ceil(overweight / 5) * 100 + Math.ceil(overflowSlots / 2) * 100;
  return {
    actor_id: actorId,
    grid_size: cloneCell(gridSize),
    capacity_slots: capacitySlots,
    used_slots: usedSlots,
    overflow_slots: overflowSlots,
    total_weight_kg: Number(totalWeight.toFixed(3)),
    max_carry_weight_kg: Number(maxCarryWeight.toFixed(3)),
    overweight_kg: Number(overweight.toFixed(3)),
    ap_penalty: apPenalty,
    effective_standard_action_energy: IMMERSIVE_STANDARD_ACTION_ENERGY + apPenalty,
    items,
    world_object_refs: items.map((item) => ({
      instance_id: item.world_object_instance_id,
      item_id: item.item_id,
      holder_id: `kholder:actor_inventory:${actorId}`,
      count: item.count,
      total_weight_kg: item.total_weight_kg,
      total_slots: item.total_slots,
    })),
  };
};

const currentWorldStateRegion = (
  gamePackage: GamePackage,
  mapId: string,
  cell: [number, number],
): string => {
  const map = getImmersiveMap(gamePackage, mapId);
  const mapCell = map?.cells.find((candidate) => candidate.x === cell[0] && candidate.z === cell[1]);
  return mapCell?.region_id || mapCell?.room_id || "map";
};

const worldStateRegionDefinition = (
  gamePackage: GamePackage,
  mapId: string,
  regionId: string,
) => getImmersiveMap(gamePackage, mapId)?.regions.find((region) => region.id === regionId);

const passiveCheckFromRegion = (
  check: NonNullable<ReturnType<typeof worldStateRegionDefinition>>["passive_checks"][number],
): ImmersiveWorldPassiveCheckDefinition => ({
  id: check.id,
  stat: check.stat,
  difficulty: check.difficulty,
  modifier: check.modifier,
  factionId: check.faction_id,
  flagId: check.flag_id,
  denial: check.denial,
});

const combineSurvivalDeltas = (
  regionDelta: NonNullable<ReturnType<typeof worldStateRegionDefinition>>["survival_delta"] | undefined,
  optionDelta: ImmersiveWorldStateAdvanceOptions["survivalDelta"] = {},
): NonNullable<ImmersiveWorldStateAdvanceOptions["survivalDelta"]> => ({
  hunger: Number(regionDelta?.hunger || 0) + Number(optionDelta.hunger || 0),
  thirst: Number(regionDelta?.thirst || 0) + Number(optionDelta.thirst || 0),
  fatigue: Number(regionDelta?.fatigue || 0) + Number(optionDelta.fatigue || 0),
  exposure: Number(regionDelta?.exposure || 0) + Number(optionDelta.exposure || 0),
});

const survivalFromSave = (
  save: PlaySave,
  delta: ImmersiveWorldStateAdvanceOptions["survivalDelta"] = {},
) => ({
  hunger: clamp(Number(save.flags?.survival_hunger || 0) + Number(delta.hunger || 0), 0, 999),
  thirst: clamp(Number(save.flags?.survival_thirst || 0) + Number(delta.thirst || 0), 0, 999),
  fatigue: clamp(Number(save.flags?.survival_fatigue || 0) + Number(delta.fatigue || 0), 0, 999),
  exposure: clamp(Number(save.flags?.survival_exposure || 0) + Number(delta.exposure || 0), 0, 999),
});

const scorePassiveCheck = (
  check: ImmersiveWorldPassiveCheckDefinition,
  save: PlaySave,
  inventory: ImmersiveSpatialInventorySnapshot,
): number => {
  let base = 0;
  if (check.stat === "level") base = Number(save.level || 1);
  if (check.stat === "hp_percent") base = Math.round(((save.playerStats.hp || 0) / Math.max(1, save.playerStats.max_hp || 1)) * 10);
  if (check.stat === "money") base = Math.floor((save.money || 0) / 10);
  if (check.stat === "inventory_weight") base = Math.max(0, Math.floor(inventory.max_carry_weight_kg - inventory.total_weight_kg));
  if (check.stat === "faction_rep") base = Number(save.faction_rep?.[check.factionId || ""] || 0);
  if (check.stat === "flag") base = save.flags?.[check.flagId || ""] ? 1 : 0;
  return base + Number(check.modifier || 0) + 6;
};

const consequencesForWorldState = (
  region: ReturnType<typeof worldStateRegionDefinition>,
  gates: ImmersiveWorldStateGateResult[],
): ImmersiveWorldConsequenceRecord[] => {
  const consequences: ImmersiveWorldConsequenceRecord[] = [];
  gates.forEach((gate) => {
    if (gate.passed) return;
    if (gate.kind === "region_reputation" && gate.severity === "deny") {
      const flag = region?.irreversible_denial_flag || `immersive_region_denied_${gate.id.split(":")[1] || "unknown"}`;
      consequences.push({
        id: `consequence:${flag}`,
        kind: "region_denied",
        flag_id: flag,
        irreversible: true,
        reason: gate.reason,
      });
    }
    if (gate.kind === "survival" && gate.severity === "deny") {
      const kind = gate.id.split(":")[1] || "survival";
      consequences.push({
        id: `consequence:survival:${kind}`,
        kind: "survival_crisis",
        flag_id: `immersive_survival_crisis_${kind}`,
        irreversible: true,
        reason: gate.reason,
      });
    }
    if (gate.kind === "passive_check" && gate.severity === "deny") {
      const checkId = gate.id.replace(/^passive:/, "");
      consequences.push({
        id: `consequence:passive:${checkId}`,
        kind: "passive_denial",
        flag_id: `immersive_passive_denial_${checkId}`,
        irreversible: true,
        reason: gate.reason,
      });
    }
    if (gate.kind === "inventory_load" && gate.severity === "deny") {
      consequences.push({
        id: "consequence:inventory_overflow",
        kind: "inventory_overflow",
        flag_id: "immersive_inventory_overflow_blocked",
        irreversible: false,
        reason: gate.reason,
      });
    }
  });
  return consequences;
};

export const evaluateImmersiveWorldStateForSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: ImmersiveWorldStateEvaluationOptions = {},
): ImmersiveWorldStateEvaluation => {
  const mapId = options.mapId || save.current_map_id || gamePackage.metadata.start_map_id;
  const cell = options.cell || save.player.cell;
  const regionId = currentWorldStateRegion(gamePackage, mapId, cell);
  const region = worldStateRegionDefinition(gamePackage, mapId, regionId);
  const inventory = createImmersiveSpatialInventorySnapshotFromSave(gamePackage, save, options);
  const survival = survivalFromSave(save);
  const regionFaction = options.regionFactions?.[regionId] || region?.faction_id || `region:${regionId}`;
  const reputation = Number(save.faction_rep?.[regionFaction] ?? save.faction_rep?.[regionId] ?? 0);
  const reputationThreshold = options.reputationThreshold ?? region?.reputation_threshold ?? -5;
  const gates: ImmersiveWorldStateGateResult[] = [
    {
      id: `region_reputation:${regionId}`,
      kind: "region_reputation",
      passed: Boolean(region?.neutral) || reputation >= reputationThreshold,
      severity: Boolean(region?.neutral) || reputation >= reputationThreshold ? "info" : "deny",
      reason: Boolean(region?.neutral)
        ? `Region ${regionId} is neutral ground.`
        : reputation >= reputationThreshold
        ? `Region ${regionId} permits passage.`
        : `Region ${regionId} denies passage at reputation ${reputation}.`,
      score: reputation,
      difficulty: reputationThreshold,
    },
  ];
  if (inventory.ap_penalty > 0) {
    gates.push({
      id: "inventory_load",
      kind: "inventory_load",
      passed: inventory.overflow_slots === 0,
      severity: inventory.overflow_slots > 0 ? "deny" : "warning",
      reason: inventory.overflow_slots > 0
        ? "Inventory load overflows the spatial grid."
        : `Inventory load adds ${inventory.ap_penalty} action energy.`,
      score: inventory.ap_penalty,
      difficulty: 0,
    });
  }
  ([
    ["hunger", survival.hunger],
    ["thirst", survival.thirst],
    ["fatigue", survival.fatigue],
    ["exposure", survival.exposure],
  ] as const).forEach(([kind, value]) => {
    if (value < 75) return;
    gates.push({
      id: `survival:${kind}`,
      kind: "survival",
      passed: value < 100,
      severity: value >= 100 ? "deny" : "warning",
      reason: value >= 100 ? `${kind} prevents safe passage.` : `${kind} is pressuring the player.`,
      score: value,
      difficulty: 100,
    });
  });
  const passiveChecks = [
    ...(region?.passive_checks || []).map(passiveCheckFromRegion),
    ...(options.passiveChecks || []),
  ];
  passiveChecks.forEach((check) => {
    const score = scorePassiveCheck(check, save, inventory);
    const passed = score >= check.difficulty;
    gates.push({
      id: `passive:${check.id}`,
      kind: "passive_check",
      passed,
      severity: passed ? "info" : check.denial ? "deny" : "warning",
      reason: passed ? `Passive check ${check.id} passed.` : `Passive check ${check.id} failed.`,
      score,
      difficulty: check.difficulty,
    });
  });
  const denials = gates.filter((gate) => !gate.passed && gate.severity === "deny");
  const consequences = consequencesForWorldState(region, gates);
  return {
    map_id: mapId,
    region_id: regionId,
    cell: cloneCell(cell),
    generated_at_tick: Math.max(0, Math.floor(save.clock_minutes || 0)),
    permitted: denials.length === 0,
    gates,
    denials,
    consequences,
    inventory,
    survival,
  };
};

export const advanceImmersiveWorldStateForSave = (
  gamePackage: GamePackage,
  save: PlaySave,
  options: ImmersiveWorldStateAdvanceOptions = {},
): ImmersiveWorldStateAdvanceResult => {
  const mapId = options.mapId || save.current_map_id || gamePackage.metadata.start_map_id;
  const cell = options.cell || save.player.cell;
  const regionId = currentWorldStateRegion(gamePackage, mapId, cell);
  const region = worldStateRegionDefinition(gamePackage, mapId, regionId);
  const survival = survivalFromSave(save, combineSurvivalDeltas(region?.survival_delta, options.survivalDelta));
  let workingSave: PlaySave = {
    ...save,
    flags: {
      ...(save.flags || {}),
      survival_hunger: survival.hunger,
      survival_thirst: survival.thirst,
      survival_fatigue: survival.fatigue,
      survival_exposure: survival.exposure,
    },
  };
  const evaluation = evaluateImmersiveWorldStateForSave(gamePackage, workingSave, options);
  const fact: PlaySaveWorldFact = {
    id: inventoryFactId(workingSave, 0),
    tick: evaluation.generated_at_tick,
    map_id: evaluation.map_id,
    plane_id: "ground",
    actor_id: options.actorId || "player",
    cells: [cloneCell(evaluation.cell)],
    action_type: "immersive_world_state_evaluated",
    direct_consequences: {
      region_id: evaluation.region_id,
      permitted: evaluation.permitted,
      denials: evaluation.denials.map((gate) => gate.id),
      consequences: evaluation.consequences.map((consequence) => consequence.flag_id),
      inventory_ap_penalty: evaluation.inventory.ap_penalty,
      survival: evaluation.survival,
    },
  };
  const consequenceFlags = Object.fromEntries(evaluation.consequences.map((consequence) => [consequence.flag_id, true]));
  workingSave = {
    ...workingSave,
    flags: {
      ...(workingSave.flags || {}),
      immersive_world_state_last_region: evaluation.region_id,
      immersive_world_state_permitted: evaluation.permitted,
      immersive_inventory_ap_penalty: evaluation.inventory.ap_penalty,
      ...consequenceFlags,
      ...(evaluation.permitted ? {} : { [`immersive_region_denied_${evaluation.region_id}`]: true }),
    },
    world_facts: [...(workingSave.world_facts || []), fact].slice(-250),
  };
  return { save: workingSave, evaluation, world_facts: [fact] };
};
