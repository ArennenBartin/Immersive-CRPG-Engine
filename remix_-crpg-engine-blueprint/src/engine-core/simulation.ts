import type {
  CellData,
  ContainerPlacementData,
  GamePackage,
  ItemData,
  MapData,
  ObjectData,
  ObjectPlacementData,
  SimulationAuthoredProfileData,
} from "../schema/game";
import type {
  MapDelta,
  PlaySave,
  SimulationConditionRecord,
  SimulationEnvironmentFieldRecord,
  SimulationSurfaceLayerRecord,
} from "../schema/save";
import { doorPlacementKey, isBuildingDoorPlacement, isDoorPlacementOpen } from "../utils/doorPlacement";
import { entityPlacementStateKey } from "../utils/entityState";
import {
  getMacroPlacementFootprint,
  getPlacementFootprint,
  placementHasCollision,
  placementOriginKey,
} from "../utils/objectFootprint";
import { placementBlocksFogLineOfSight } from "../utils/fogOfWar";
import { coordKey } from "./gridCoordinates";
import { isFineExpandedPackage } from "./fineWorld";

export type SimulationSurfaceKind = Exclude<CellData["surface_tag"], "none">;
export type SimulationOccupantKind =
  | "base_blocker"
  | "container"
  | "door"
  | "object"
  | "entity"
  | "item";

export interface SimulationSurfaceState {
  kind: SimulationSurfaceKind | "hazard" | "infection" | string;
  amount: number;
  age_ticks: number;
  source: "cell.surface_tag" | "cell.hazard" | "cell.infection" | "delta.surface_layer";
  tag?: string;
  trace_actor_id?: string;
  trace_action?: string;
  residue_kind?: string;
  transfer_from_cell?: [number, number];
  cleaned_by_actor_id?: string;
  cleaned_at_tick?: number;
  cleaning_difficulty?: number;
  visibility?: number;
  scent?: number;
  slipperiness?: number;
  trace_potential?: number;
}

export interface SimulationEnvironmentFieldState {
  kind: string;
  intensity: number;
  age_ticks: number;
  source: "authored" | "runtime" | "propagation";
  tag?: string;
  actor_id?: string;
  action?: string;
  origin_cell?: [number, number];
  radius?: number;
  color?: string;
  frequency_tag?: string;
  material_tag?: string;
  occlusion?: number;
  visibility_modifier?: number;
  damage_per_tick?: number;
}

export interface SimulationManipulationAffordance {
  mass_kg: number;
  bulk: number;
  awkwardness: number;
  push_difficulty: number;
  push_energy_cost: number;
  carry_size: "hand" | "armful" | "oversized" | "immovable";
  solo_pushable: boolean;
  requires_cooperation: boolean;
}

export interface SimulationCellState {
  map_id: string;
  cell: [number, number];
  active: boolean;
  walkable: boolean;
  blocks_los: boolean;
  height: number;
  visual_height: number;
  terrain?: string;
  surface_tag: CellData["surface_tag"];
  hazard?: string;
  infection?: string;
  material_id?: string;
  condition: SimulationConditionRecord;
  surfaces: SimulationSurfaceState[];
  environment: SimulationEnvironmentFieldState[];
  occupants: {
    kind: SimulationOccupantKind;
    id: string;
    label?: string;
    blocks_movement?: boolean;
    blocks_los?: boolean;
    material_id?: string;
    condition?: SimulationConditionRecord;
    manipulation?: SimulationManipulationAffordance;
  }[];
  npc_tasks: {
    id: string;
    actor_id: string;
    task_type: string;
    source_kind: string;
    priority: number;
  }[];
  simulation_processes: {
    id: string;
    process_type: string;
    state: string;
    progress_ticks: number;
    required_ticks: number;
  }[];
  blocks_movement: boolean;
  blocks_vision: boolean;
}

export interface SimulationDebugOverlayCell {
  cell: [number, number];
  value: number | string | boolean;
  label: string;
}

export interface SimulationDebugOverlay {
  id: string;
  label: string;
  count: number;
  cells: SimulationDebugOverlayCell[];
}

export interface SimulationMapSnapshot {
  map_id: string;
  map_label: string;
  resolution: "exact_cells";
  generated_at_tick: number;
  source: {
    save_map_id?: string;
    delta_applied: boolean;
  };
  cells: SimulationCellState[];
  overlays: SimulationDebugOverlay[];
  totals: {
    active_cells: number;
    surface_cells: number;
    hazard_cells: number;
    infection_cells: number;
    blocked_cells: number;
    los_blocking_cells: number;
    object_footprint_cells: number;
    container_cells: number;
    item_cells: number;
    condition_records: number;
    material_profiles: number;
    movable_objects: number;
    cooperative_objects: number;
    max_push_energy_cost: number;
    trace_cells: number;
    surface_layers: number;
    residue_cells: number;
    cleaned_trace_cells: number;
    fire_cells: number;
    smoke_cells: number;
    light_cells: number;
    sound_cells: number;
    environment_fields: number;
    max_light_intensity: number;
    max_sound_intensity: number;
    npc_tasks: number;
    simulation_processes: number;
    regional_aggregates: number;
    exact_regions: number;
    nearby_regions: number;
    aggregate_regions: number;
    dormant_regions: number;
    semantic_observations: number;
    semantic_evidence_links: number;
  };
}

const cellKey = coordKey;

const placementFootprintForPackage = (
  gamePackage: GamePackage,
  placement: ObjectPlacementData,
  object: ObjectData | undefined,
): [number, number][] =>
  isFineExpandedPackage(gamePackage)
    ? getPlacementFootprint(placement, object)
    : getMacroPlacementFootprint(placement, object);

const asCell = (cell: readonly unknown[]): [number, number] => [
  Number(cell[0] || 0),
  Number(cell[1] || 0),
];

const currentTick = (save?: PlaySave) => Math.max(0, Math.floor(save?.clock_minutes || 0));

export type SimulationConditionTargetKind = SimulationConditionRecord["target_kind"];

export const simulationCellTargetId = (mapId: string, cell: [number, number]) =>
  `cell:${mapId}:${cell[0]}:${cell[1]}`;

const clampIntegrity = (value: number | undefined) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 1));

const clamp01 = (value: number | undefined) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? Number(value) : 0));

const positiveNumber = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;

export const recordSimulationCondition = (
  delta: MapDelta,
  record: Omit<SimulationConditionRecord, "updated_at_tick"> & { updated_at_tick?: number },
): MapDelta => ({
  ...delta,
  simulation_conditions: {
    ...(delta.simulation_conditions || {}),
    [record.target_id]: {
      ...record,
      integrity: clampIntegrity(record.integrity),
      updated_at_tick: record.updated_at_tick ?? 0,
    },
  },
});

const materialIdFromTerms = (terms: string[]) => {
  const joined = terms.join(" ").toLowerCase();
  if (/\b(glass|crystal|window)\b/.test(joined)) return "sim_mat_glass";
  if (/\b(iron|steel|metal|bronze|key|weapon|armor|anvil)\b/.test(joined)) return "sim_mat_metal";
  if (/\b(cloth|fabric|banner|carpet|robe|paper|book|scroll)\b/.test(joined)) return "sim_mat_cloth";
  if (/\b(soil|dirt|mud|earth|moss|grass|plant|root)\b/.test(joined)) return "sim_mat_soil";
  if (/\b(wood|timber|crate|barrel|door|chest|shelf|table)\b/.test(joined)) return "sim_mat_wood";
  if (/\b(stone|rock|wall|tile|floor|masonry|pillar|ruin|ice)\b/.test(joined)) return "sim_mat_stone";
  return undefined;
};

const inferCellMaterialId = (cell: CellData): string =>
  cell.simulation?.material_id ||
  materialIdFromTerms([
    cell.terrain || "",
    cell.surface_tag || "",
    cell.tag || "",
    cell.object_id || "",
    cell.hazard || "",
    cell.infection || "",
  ]) ||
  "sim_mat_stone";

const inferObjectMaterialId = (object: ObjectData | undefined): string =>
  object?.simulation?.material_id ||
  materialIdFromTerms([
    object?.id || "",
    object?.display_name || "",
    object?.category || "",
    ...(object?.tags || []),
    ...(object?.materials || []),
  ]) ||
  (object?.category === "prop" ? "sim_mat_wood" : "sim_mat_stone");

const inferContainerMaterialId = (
  container: ContainerPlacementData,
  object: ObjectData | undefined,
): string =>
  container.simulation?.material_id || inferObjectMaterialId(object);

const inferItemMaterialId = (item: ItemData | undefined): string =>
  item?.simulation?.material_id ||
  materialIdFromTerms([item?.id || "", item?.display_name || "", item?.category || ""]) ||
  (item?.category === "weapon" || item?.category === "armor" || item?.category === "key"
    ? "sim_mat_metal"
    : "sim_mat_cloth");

const defaultConditionState = (
  target_kind: SimulationConditionTargetKind,
  target_id: string,
  material_id: string | undefined,
  authored: SimulationAuthoredProfileData | undefined,
  cell: [number, number] | undefined,
  tick: number,
): SimulationConditionRecord => ({
  target_kind,
  target_id,
  material_id,
  state: authored?.condition || "intact",
  integrity: clampIntegrity(authored?.integrity),
  condition_tags: authored?.condition_tags || [],
  cell,
  updated_at_tick: tick,
});

const resolveCondition = (
  delta: MapDelta | undefined,
  target_kind: SimulationConditionTargetKind,
  target_id: string,
  material_id: string | undefined,
  authored: SimulationAuthoredProfileData | undefined,
  cell: [number, number] | undefined,
  tick: number,
): SimulationConditionRecord => {
  const saved = delta?.simulation_conditions?.[target_id];
  if (!saved) return defaultConditionState(target_kind, target_id, material_id, authored, cell, tick);
  return {
    ...saved,
    target_kind,
    target_id,
    material_id: saved.material_id || material_id,
    integrity: clampIntegrity(saved.integrity),
    condition_tags: saved.condition_tags || [],
    cell: saved.cell || cell,
  };
};

const isChangedCondition = (condition: SimulationConditionRecord | undefined) =>
  Boolean(
    condition &&
      (condition.state !== "intact" ||
        condition.integrity < 1 ||
        condition.last_action ||
        (condition.condition_tags || []).length > 0),
  );

export const resolveObjectManipulationAffordance = (
  object: ObjectData | undefined,
): SimulationManipulationAffordance => {
  const sim = object?.simulation;
  const footprintSize = Math.max(1, object?.collision?.footprint?.length || 1);
  const mass_kg = positiveNumber(
    sim?.mass_kg,
    object?.category === "structure" ? 220 : object?.category === "container" ? 55 : object?.category === "prop" ? 30 : 5,
  );
  const bulk = positiveNumber(sim?.bulk, Math.max(1, footprintSize * (object?.bounds?.[0] || 1) * (object?.bounds?.[2] || 1)));
  const awkwardness = clamp01(sim?.awkwardness ?? (bulk > 2 ? 0.4 : 0.15));
  const push_difficulty = positiveNumber(
    sim?.push_difficulty,
    Math.max(1, Math.ceil(mass_kg / 18 + bulk * 0.75 + awkwardness * 3)),
  );
  const carry_size = sim?.carry_size || (mass_kg > 120 ? "immovable" : mass_kg > 20 || bulk > 1.5 ? "oversized" : "hand");
  const requires_cooperation = Boolean(sim?.requires_cooperation || carry_size === "immovable" || mass_kg > 180);
  const push_energy_cost = Math.max(100, Math.round(push_difficulty * 100));
  return {
    mass_kg,
    bulk,
    awkwardness,
    push_difficulty,
    push_energy_cost,
    carry_size,
    solo_pushable: !requires_cooperation,
    requires_cooperation,
  };
};

const surfaceLayerKey = (cell: [number, number]) => `${cell[0]}:${cell[1]}`;
const environmentFieldKey = surfaceLayerKey;

const normalizeSurfaceLayer = (
  layer: SimulationSurfaceLayerRecord,
  tick: number,
): SimulationSurfaceState => ({
  kind: layer.kind,
  amount: layer.amount,
  age_ticks: Math.max(layer.age_ticks || 0, tick - layer.created_at_tick),
  source: "delta.surface_layer",
  tag: layer.tag || layer.kind,
  trace_actor_id: layer.trace_actor_id,
  trace_action: layer.trace_action,
  residue_kind: layer.residue_kind,
  transfer_from_cell: layer.transfer_from_cell,
  cleaned_by_actor_id: layer.cleaned_by_actor_id,
  cleaned_at_tick: layer.cleaned_at_tick,
  cleaning_difficulty: layer.cleaning_difficulty,
  visibility: layer.visibility,
  scent: layer.scent,
  slipperiness: layer.slipperiness,
  trace_potential: layer.trace_potential,
});

const createSurfaceStates = (
  cell: CellData,
  delta: MapDelta | undefined,
  tick: number,
): SimulationSurfaceState[] => {
  const surfaces: SimulationSurfaceState[] = [];
  if (cell.surface_tag && cell.surface_tag !== "none") {
    surfaces.push({
      kind: cell.surface_tag,
      amount: 1,
      age_ticks: 0,
      source: "cell.surface_tag",
    });
  }
  if (cell.hazard) {
    surfaces.push({
      kind: "hazard",
      amount: 1,
      age_ticks: 0,
      source: "cell.hazard",
      tag: cell.hazard,
    });
  }
  if (cell.infection) {
    surfaces.push({
      kind: "infection",
      amount: 1,
      age_ticks: 0,
      source: "cell.infection",
      tag: cell.infection,
    });
  }
  const layers = delta?.surface_layers?.[surfaceLayerKey([cell.x, cell.z])] || [];
  surfaces.push(...layers.map((layer) => normalizeSurfaceLayer(layer, tick)));
  return surfaces;
};

const normalizeEnvironmentField = (
  field: SimulationEnvironmentFieldRecord,
  tick: number,
): SimulationEnvironmentFieldState => ({
  kind: field.kind,
  intensity: Math.max(0, field.intensity),
  age_ticks: Math.max(field.age_ticks || 0, tick - field.created_at_tick),
  source: field.source,
  tag: field.tag || field.kind,
  actor_id: field.actor_id,
  action: field.action,
  origin_cell: field.origin_cell,
  radius: field.radius,
  color: field.color,
  frequency_tag: field.frequency_tag,
  material_tag: field.material_tag,
  occlusion: field.occlusion,
  visibility_modifier: field.visibility_modifier,
  damage_per_tick: field.damage_per_tick,
});

const createEnvironmentStates = (
  cell: CellData,
  delta: MapDelta | undefined,
  tick: number,
): SimulationEnvironmentFieldState[] => {
  const authoredLightTerms = [cell.tag || "", cell.object_id || "", cell.hazard || "", cell.surface_tag || ""].join(" ").toLowerCase();
  const authoredLight =
    cell.surface_tag === "firehazard" || /torch|lamp|lantern|brazier|candle|light/.test(authoredLightTerms)
      ? [{
          kind: "light",
          intensity: 0.65,
          age_ticks: 0,
          source: "authored" as const,
          tag: "authored_light",
          origin_cell: [cell.x, cell.z] as [number, number],
          radius: 6,
          color: "#facc15",
        }]
      : [];
  const authoredSmokeTerms = [cell.terrain || "", cell.tag || "", cell.hazard || "", cell.surface_tag || ""]
    .join(" ")
    .toLowerCase();
  const authoredSmoke = /smoke|mist|fog|miasma|obscur/.test(authoredSmokeTerms)
    ? [{
        kind: "smoke",
        intensity: 0.8,
        age_ticks: 0,
        source: "authored" as const,
        tag: cell.tag || cell.hazard || "authored_smoke",
        origin_cell: [cell.x, cell.z] as [number, number],
        radius: 0,
        occlusion: 0.65,
        visibility_modifier: -0.75,
      }]
    : [];
  const fields = delta?.environment_fields?.[environmentFieldKey([cell.x, cell.z])] || [];
  return [
    ...authoredLight,
    ...authoredSmoke,
    ...fields
    .filter((field) => field.intensity > 0 && (!field.expires_at_tick || field.expires_at_tick > tick))
    .map((field) => normalizeEnvironmentField(field, tick)),
  ];
};

const getMapDelta = (save: PlaySave | undefined, mapId: string): MapDelta | undefined =>
  save?.map_deltas?.[mapId];

const addOccupant = (
  byCell: Map<string, SimulationCellState>,
  cell: [number, number],
  occupant: SimulationCellState["occupants"][number],
) => {
  const target = byCell.get(cellKey(cell));
  if (!target) return;
  target.occupants.push(occupant);
  target.blocks_movement = target.blocks_movement || Boolean(occupant.blocks_movement);
  target.blocks_vision = target.blocks_vision || Boolean(occupant.blocks_los);
};

export const createSimulationDebugOverlays = (
  cells: SimulationCellState[],
  deltaConditions: Record<string, SimulationConditionRecord> = {},
): SimulationDebugOverlay[] => {
  const makeOverlay = (
    id: string,
    label: string,
    entries: SimulationDebugOverlayCell[],
  ): SimulationDebugOverlay => ({
    id,
    label,
    count: entries.length,
    cells: entries,
  });

  const changedConditionCells = new Map<string, SimulationDebugOverlayCell>();
  cells.forEach((cell) => {
    const conditionLabels = [
      isChangedCondition(cell.condition)
        ? `cell ${cell.condition.state}${cell.condition.material_id ? `/${cell.condition.material_id}` : ""}`
        : undefined,
      ...cell.occupants
        .filter((occupant) => isChangedCondition(occupant.condition))
        .map((occupant) =>
          `${occupant.label || occupant.id} ${occupant.condition?.state || "changed"}${
            occupant.material_id ? `/${occupant.material_id}` : ""
          }`,
        ),
    ].filter(Boolean) as string[];
    if (conditionLabels.length) {
      changedConditionCells.set(cellKey(cell.cell), {
        cell: cell.cell,
        value: conditionLabels.length,
        label: conditionLabels.join(" / "),
      });
    }
  });
  Object.values(deltaConditions).forEach((condition) => {
    if (!isChangedCondition(condition) || !condition.cell) return;
    const key = cellKey(condition.cell);
    if (changedConditionCells.has(key)) return;
    changedConditionCells.set(key, {
      cell: condition.cell,
      value: condition.state,
      label: `${condition.target_kind} ${condition.state}${condition.last_action ? ` (${condition.last_action})` : ""}`,
    });
  });

  return [
    makeOverlay(
      "surfaces",
      "Surface Fields",
      cells
        .filter((cell) => cell.surfaces.length > 0)
        .map((cell) => ({
          cell: cell.cell,
          value: cell.surfaces.length,
          label: cell.surfaces.map((surface) => surface.tag || surface.kind).join(" / "),
        })),
    ),
    makeOverlay(
      "hazards",
      "Hazards",
      cells
        .filter((cell) => Boolean(cell.hazard))
        .map((cell) => ({ cell: cell.cell, value: cell.hazard || "", label: cell.hazard || "hazard" })),
    ),
    makeOverlay(
      "infection",
      "Infection",
      cells
        .filter((cell) => Boolean(cell.infection))
        .map((cell) => ({ cell: cell.cell, value: cell.infection || "", label: cell.infection || "infection" })),
    ),
    makeOverlay(
      "traces",
      "Traces",
      cells
        .filter((cell) => cell.surfaces.some((surface) => surface.source === "delta.surface_layer"))
        .map((cell) => ({
          cell: cell.cell,
          value: cell.surfaces.filter((surface) => surface.source === "delta.surface_layer").length,
          label: cell.surfaces
            .filter((surface) => surface.source === "delta.surface_layer")
            .map((surface) => `${surface.tag || surface.kind}${surface.trace_actor_id ? `/${surface.trace_actor_id}` : ""}`)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "residues",
      "Residue Transfers",
      cells
        .filter((cell) => cell.surfaces.some((surface) => Boolean(surface.residue_kind || surface.transfer_from_cell)))
        .map((cell) => ({
          cell: cell.cell,
          value: cell.surfaces.filter((surface) => Boolean(surface.residue_kind || surface.transfer_from_cell)).length,
          label: cell.surfaces
            .filter((surface) => Boolean(surface.residue_kind || surface.transfer_from_cell))
            .map((surface) => surface.residue_kind || surface.tag || surface.kind)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "cleaned_traces",
      "Cleaned Traces",
      cells
        .filter((cell) => cell.surfaces.some((surface) => Boolean(surface.cleaned_at_tick)))
        .map((cell) => ({
          cell: cell.cell,
          value: cell.surfaces.filter((surface) => Boolean(surface.cleaned_at_tick)).length,
          label: cell.surfaces
            .filter((surface) => Boolean(surface.cleaned_at_tick))
            .map((surface) => `${surface.residue_kind || surface.kind}${surface.cleaned_by_actor_id ? `/${surface.cleaned_by_actor_id}` : ""}`)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "fire",
      "Fire",
      cells
        .filter((cell) => cell.environment.some((field) => field.kind === "fire"))
        .map((cell) => ({
          cell: cell.cell,
          value: Math.max(...cell.environment.filter((field) => field.kind === "fire").map((field) => field.intensity)),
          label: cell.environment
            .filter((field) => field.kind === "fire")
            .map((field) => `${field.tag || "fire"} ${field.intensity.toFixed(2)}`)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "smoke",
      "Smoke",
      cells
        .filter((cell) => cell.environment.some((field) => field.kind === "smoke"))
        .map((cell) => ({
          cell: cell.cell,
          value: Math.max(...cell.environment.filter((field) => field.kind === "smoke").map((field) => field.intensity)),
          label: cell.environment
            .filter((field) => field.kind === "smoke")
            .map((field) => `${field.tag || "smoke"} ${field.intensity.toFixed(2)}`)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "light",
      "Light",
      cells
        .filter((cell) => cell.environment.some((field) => field.kind === "light"))
        .map((cell) => ({
          cell: cell.cell,
          value: Math.max(...cell.environment.filter((field) => field.kind === "light").map((field) => field.intensity)),
          label: cell.environment
            .filter((field) => field.kind === "light")
            .map((field) => `${field.tag || "light"} ${field.intensity.toFixed(2)}`)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "sound",
      "Sound",
      cells
        .filter((cell) => cell.environment.some((field) => field.kind === "sound"))
        .map((cell) => ({
          cell: cell.cell,
          value: Math.max(...cell.environment.filter((field) => field.kind === "sound").map((field) => field.intensity)),
          label: cell.environment
            .filter((field) => field.kind === "sound")
            .map((field) => `${field.frequency_tag || field.tag || "sound"} ${field.intensity.toFixed(2)}`)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "npc_tasks",
      "NPC Tasks",
      cells
        .filter((cell) => cell.npc_tasks.length > 0)
        .map((cell) => ({
          cell: cell.cell,
          value: cell.npc_tasks.length,
          label: cell.npc_tasks
            .map((task) => `${task.actor_id} ${task.task_type}/${task.source_kind}`)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "simulation_processes",
      "Processes",
      cells
        .filter((cell) => cell.simulation_processes.length > 0)
        .map((cell) => ({
          cell: cell.cell,
          value: cell.simulation_processes.length,
          label: cell.simulation_processes
            .map((process) => `${process.process_type} ${process.state} ${process.progress_ticks}/${process.required_ticks}`)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "collision",
      "Movement Blockers",
      cells
        .filter((cell) => cell.blocks_movement)
        .map((cell) => ({ cell: cell.cell, value: true, label: "blocks movement" })),
    ),
    makeOverlay(
      "line_of_sight",
      "LOS Blockers",
      cells
        .filter((cell) => cell.blocks_vision)
        .map((cell) => ({ cell: cell.cell, value: true, label: "blocks line of sight" })),
    ),
    makeOverlay(
      "objects",
      "Object Footprints",
      cells
        .filter((cell) => cell.occupants.some((occupant) => occupant.kind === "object" || occupant.kind === "door"))
        .map((cell) => ({
          cell: cell.cell,
          value: cell.occupants.filter((occupant) => occupant.kind === "object" || occupant.kind === "door").length,
          label: cell.occupants
            .filter((occupant) => occupant.kind === "object" || occupant.kind === "door")
            .map((occupant) => occupant.label || occupant.id)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "containers",
      "Containers",
      cells
        .filter((cell) => cell.occupants.some((occupant) => occupant.kind === "container"))
        .map((cell) => ({
          cell: cell.cell,
          value: cell.occupants.filter((occupant) => occupant.kind === "container").length,
          label: cell.occupants
            .filter((occupant) => occupant.kind === "container")
            .map((occupant) => occupant.label || occupant.id)
            .join(" / "),
        })),
    ),
    makeOverlay(
      "items",
      "Items",
      cells
        .filter((cell) => cell.occupants.some((occupant) => occupant.kind === "item"))
        .map((cell) => ({
          cell: cell.cell,
          value: cell.occupants.filter((occupant) => occupant.kind === "item").length,
          label: cell.occupants
            .filter((occupant) => occupant.kind === "item")
            .map((occupant) => occupant.label || occupant.id)
            .join(" / "),
        })),
    ),
    makeOverlay("conditions", "Changed Conditions", [...changedConditionCells.values()]),
  ];
};

export const createSimulationSnapshotFromV1 = (
  gamePackage: GamePackage,
  save?: PlaySave,
  mapId = save?.current_map_id || gamePackage.metadata.start_map_id,
): SimulationMapSnapshot => {
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId) || gamePackage.maps[0];
  if (!map) {
    return {
      map_id: mapId,
      map_label: mapId,
      resolution: "exact_cells",
      generated_at_tick: currentTick(save),
      source: { save_map_id: save?.current_map_id, delta_applied: false },
      cells: [],
      overlays: [],
      totals: {
        active_cells: 0,
        surface_cells: 0,
        hazard_cells: 0,
        infection_cells: 0,
        blocked_cells: 0,
        los_blocking_cells: 0,
        object_footprint_cells: 0,
        container_cells: 0,
        item_cells: 0,
        condition_records: 0,
        material_profiles: gamePackage.simulation_materials.length,
        movable_objects: 0,
        cooperative_objects: 0,
        max_push_energy_cost: 0,
        trace_cells: 0,
        surface_layers: 0,
        residue_cells: 0,
        cleaned_trace_cells: 0,
        fire_cells: 0,
        smoke_cells: 0,
        light_cells: 0,
        sound_cells: 0,
        environment_fields: 0,
        max_light_intensity: 0,
        max_sound_intensity: 0,
        npc_tasks: 0,
        simulation_processes: 0,
        regional_aggregates: 0,
        exact_regions: 0,
        nearby_regions: 0,
        aggregate_regions: 0,
        dormant_regions: 0,
        semantic_observations: 0,
        semantic_evidence_links: 0,
      },
    };
  }

  const delta = getMapDelta(save, map.id);
  const objectById = new Map(gamePackage.object_library.map((object) => [object.id, object]));
  const itemById = new Map(gamePackage.items.map((item) => [item.id, item]));
  const entityById = new Map(gamePackage.entities.map((entity) => [entity.id, entity]));
  const takenItems = new Set(delta?.taken_items || []);
  const tick = currentTick(save);
  const cells = map.cells.map((cell) => {
    const baseBlocksMovement = cell.active && !cell.walkable;
    const material_id = inferCellMaterialId(cell);
    const cellCoord: [number, number] = [cell.x, cell.z];
    const condition = resolveCondition(
      delta,
      "cell",
      simulationCellTargetId(map.id, cellCoord),
      material_id,
      cell.simulation,
      cellCoord,
      tick,
    );
    const environment = createEnvironmentStates(cell, delta, tick);
    const smokeVisionBlock = environment.some(
      (field) => field.kind === "smoke" && (field.visibility_modifier || 0) <= -0.2 && field.intensity >= 0.45,
    );
    const state: SimulationCellState = {
      map_id: map.id,
      cell: cellCoord,
      active: cell.active,
      walkable: cell.walkable,
      blocks_los: cell.blocks_los,
      height: cell.height,
      visual_height: cell.visual_height,
      terrain: cell.terrain,
      surface_tag: cell.surface_tag || "none",
      hazard: cell.hazard,
      infection: cell.infection,
      material_id,
      condition,
      surfaces: createSurfaceStates(cell, delta, tick),
      environment,
      occupants: baseBlocksMovement
        ? [{
            kind: "base_blocker",
            id: cell.object_id || "cell_blocker",
            label: cell.terrain || "blocked cell",
            blocks_movement: true,
            blocks_los: cell.blocks_los,
            material_id,
            condition,
          }]
        : [],
      blocks_movement: baseBlocksMovement,
      npc_tasks: [],
      simulation_processes: [],
      blocks_vision: cell.blocks_los || smokeVisionBlock,
    };
    return state;
  });
  const byCell = new Map(cells.map((cell) => [cellKey(cell.cell), cell]));

  (map.custom_object_placements || []).forEach((authored) => {
    const key = placementOriginKey(authored);
    if ((delta?.removed_objects || []).includes(key)) return;
    if (delta?.carried_objects?.[key]) return;
    const moved = delta?.moved_objects?.[key];
    const placement = moved ? { ...authored, cell: moved.cell, facing: moved.facing } : authored;
    const object = objectById.get(authored.object_id);
    const isDoor = isBuildingDoorPlacement(placement);
    const openDoor = isDoorPlacementOpen(delta, placement);
    const blocks = placementHasCollision(placement, object) && !(isDoor && openDoor);
    const blocksLineOfSight = placementBlocksFogLineOfSight(
      placement,
      object,
      delta,
    );
    const targetId = isDoor ? doorPlacementKey(authored) : key;
    const material_id = inferObjectMaterialId(object);
    const manipulation = resolveObjectManipulationAffordance(object);
    const condition = resolveCondition(
      delta,
      isDoor ? "door" : "object",
      targetId,
      material_id,
      object?.simulation,
      [placement.cell[0], placement.cell[1]],
      tick,
    );
    placementFootprintForPackage(gamePackage, placement, object).forEach((footprintCell) => {
      addOccupant(byCell, footprintCell, {
        kind: isDoor ? "door" : "object",
        id: targetId,
        label: object?.display_name || placement.object_id,
        blocks_movement: blocks,
        blocks_los: blocksLineOfSight,
        material_id,
        condition,
        manipulation,
      });
    });
  });

  (map.container_placements || []).forEach((container) => {
    const object = objectById.get(container.object_id);
    const material_id = inferContainerMaterialId(container, object);
    const manipulation = resolveObjectManipulationAffordance(object);
    const condition = resolveCondition(
      delta,
      "container",
      container.id,
      material_id,
      container.simulation,
      asCell(container.cell),
      tick,
    );
    addOccupant(byCell, asCell(container.cell), {
      kind: "container",
      id: container.id,
      label: container.display_name || container.id,
      blocks_movement: true,
      blocks_los: false,
      material_id,
      condition,
      manipulation,
    });
  });

  (map.item_placements || [])
    .filter((placement) => !takenItems.has(placement.id))
    .forEach((placement) => {
      const item = itemById.get(placement.item_id);
      const material_id = inferItemMaterialId(item);
      const condition = resolveCondition(
        delta,
        "item",
        placement.id,
        material_id,
        item?.simulation,
        asCell(placement.cell),
        tick,
      );
      addOccupant(byCell, asCell(placement.cell), {
        kind: "item",
        id: placement.id,
        label: item?.display_name || placement.item_id,
        blocks_movement: false,
        blocks_los: false,
        material_id,
        condition,
      });
    });

  (delta?.dropped_items || []).forEach((drop) => {
    const item = itemById.get(drop.item_id);
    const material_id = inferItemMaterialId(item);
    const condition = resolveCondition(
      delta,
      "item",
      drop.id,
      material_id,
      item?.simulation,
      drop.cell,
      tick,
    );
    addOccupant(byCell, drop.cell, {
      kind: "item",
      id: drop.id,
      label: item?.display_name || drop.item_id,
      blocks_movement: false,
      blocks_los: false,
      material_id,
      condition,
    });
  });

  (map.entity_placements || []).forEach((placement, index) => {
    const entity = entityById.get(placement.entity_id);
    const stateKey = entityPlacementStateKey(map.id, placement, index);
    const state = save?.entity_states?.[stateKey] || save?.entity_states?.[placement.entity_id];
    if (state?.hidden) return;
    addOccupant(byCell, asCell(placement.cell), {
      kind: "entity",
      id: stateKey,
      label: entity?.display_name || placement.entity_id,
      blocks_movement: true,
      blocks_los: false,
    });
  });

  (delta?.npc_tasks || [])
    .filter((task) => task.state !== "done" && (!task.expires_at_tick || task.expires_at_tick > tick))
    .forEach((task) => {
      const target = byCell.get(cellKey(task.target_cell));
      if (!target) return;
      target.npc_tasks.push({
        id: task.id,
        actor_id: task.actor_id,
        task_type: task.task_type,
        source_kind: task.source_kind,
        priority: task.priority,
      });
    });

  (delta?.simulation_processes || [])
    .filter((process) => process.state !== "complete" && process.state !== "failed")
    .forEach((process) => {
      const target = byCell.get(cellKey(process.cell));
      if (!target) return;
      target.simulation_processes.push({
        id: process.id,
        process_type: process.process_type,
        state: process.state,
        progress_ticks: process.progress_ticks,
        required_ticks: process.required_ticks,
      });
    });

  const overlays = createSimulationDebugOverlays(cells, delta?.simulation_conditions || {});
  const overlayCount = (id: string) => overlays.find((overlay) => overlay.id === id)?.count || 0;
  const manipulationAffordances = cells.flatMap((cell) =>
    cell.occupants.map((occupant) => occupant.manipulation).filter(Boolean) as SimulationManipulationAffordance[],
  );
  const environmentFields = cells.flatMap((cell) => cell.environment);
  const regionalRecords = Object.values(save?.simulation_regions || {}).filter((region) => region.map_id === map.id);
  return {
    map_id: map.id,
    map_label: map.display_name,
    resolution: "exact_cells",
    generated_at_tick: currentTick(save),
    source: {
      save_map_id: save?.current_map_id,
      delta_applied: Boolean(delta),
    },
    cells,
    overlays,
    totals: {
      active_cells: cells.filter((cell) => cell.active).length,
      surface_cells: overlayCount("surfaces"),
      hazard_cells: overlayCount("hazards"),
      infection_cells: overlayCount("infection"),
      blocked_cells: overlayCount("collision"),
      los_blocking_cells: overlayCount("line_of_sight"),
      object_footprint_cells: overlayCount("objects"),
      container_cells: overlayCount("containers"),
      item_cells: overlayCount("items"),
      condition_records: Object.keys(delta?.simulation_conditions || {}).length,
      material_profiles: gamePackage.simulation_materials.length,
      movable_objects: manipulationAffordances.filter((affordance) => affordance.solo_pushable).length,
      cooperative_objects: manipulationAffordances.filter((affordance) => affordance.requires_cooperation).length,
      max_push_energy_cost: manipulationAffordances.reduce(
        (max, affordance) => Math.max(max, affordance.push_energy_cost),
        0,
      ),
      trace_cells: overlayCount("traces"),
      surface_layers: Object.values(delta?.surface_layers || {}).reduce((sum, layers) => sum + layers.length, 0),
      residue_cells: overlayCount("residues"),
      cleaned_trace_cells: overlayCount("cleaned_traces"),
      fire_cells: overlayCount("fire"),
      smoke_cells: overlayCount("smoke"),
      light_cells: overlayCount("light"),
      sound_cells: overlayCount("sound"),
      environment_fields: Object.values(delta?.environment_fields || {}).reduce((sum, fields) => sum + fields.length, 0),
      max_light_intensity: environmentFields
        .filter((field) => field.kind === "light")
        .reduce((max, field) => Math.max(max, field.intensity), 0),
      max_sound_intensity: environmentFields
        .filter((field) => field.kind === "sound")
        .reduce((max, field) => Math.max(max, field.intensity), 0),
      npc_tasks: (delta?.npc_tasks || []).filter((task) => task.state !== "done").length,
      simulation_processes: (delta?.simulation_processes || []).filter(
        (process) => process.state !== "complete" && process.state !== "failed",
      ).length,
      regional_aggregates: regionalRecords.length,
      exact_regions: regionalRecords.filter((region) => region.resolution === "exact").length,
      nearby_regions: regionalRecords.filter((region) => region.resolution === "nearby").length,
      aggregate_regions: regionalRecords.filter((region) => region.resolution === "aggregate").length,
      dormant_regions: regionalRecords.filter((region) => region.resolution === "dormant").length,
      semantic_observations: 0,
      semantic_evidence_links: 0,
    },
  };
};

export const getSimulationMap = (
  gamePackage: GamePackage,
  save?: PlaySave,
  mapId?: string,
): MapData | undefined =>
  gamePackage.maps.find((candidate) => candidate.id === (mapId || save?.current_map_id || gamePackage.metadata.start_map_id)) ||
  gamePackage.maps[0];
