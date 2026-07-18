import type { GamePackage } from "../schema/game";
import type { PlaySave, SimulationEnvironmentFieldRecord } from "../schema/save";
import { entityPlacementStateKey } from "../utils/entityState";
import { placementOriginKey } from "../utils/objectFootprint";
import {
  FINE_PER_MACRO,
  coordKey,
  fineCoordKey,
  parseFineCoordKey,
} from "./gridCoordinates";
import { isFineExpandedPackage } from "./fineWorld";
import {
  createSimulationSnapshotFromV1,
  type SimulationCellState,
  type SimulationMapSnapshot,
} from "./simulation";

export type ImmersiveLightMobility = "fixed" | "portable" | "throwable" | "runtime";
export type ImmersiveLightSourceKind =
  | "authored_object"
  | "moved_object"
  | "carried_object"
  | "authored_item"
  | "dropped_item"
  | "carried_item"
  | "environment_field"
  | "fire_field";

export interface ImmersiveResolvedLightSource {
  id: string;
  definition_key?: string;
  map_id: string;
  source_kind: ImmersiveLightSourceKind;
  cell: [number, number];
  intensity: number;
  radius: number;
  color?: string;
  mobility: ImmersiveLightMobility;
  persistent: boolean;
  active: true;
  duration_ticks?: number;
  created_at_tick?: number;
  expires_at_tick?: number;
  owner_actor_id?: string;
  carrier_actor_id?: string;
  stimulus_tags: string[];
  exposes_carrier: boolean;
  extinguishable: boolean;
}

export interface ImmersiveIlluminationContribution {
  source_id: string;
  value: number;
  distance: number;
  transmission: number;
}

export interface ImmersiveIlluminationCell {
  cell: [number, number];
  value: number;
  ambient: number;
  source_ids: string[];
  strongest_source_id?: string;
  contributions: ImmersiveIlluminationContribution[];
}

export interface ImmersiveIlluminationSnapshot {
  map_id: string;
  generated_at_tick: number;
  ambient_light: number;
  sources: ImmersiveResolvedLightSource[];
  cells: ImmersiveIlluminationCell[];
  totals: {
    sources: number;
    illuminated_cells: number;
    max_illumination: number;
  };
}

export interface ImmersiveViewerVisibilityOptions {
  viewer_cell?: [number, number];
  max_range?: number;
  minimum_light?: number;
  sensed_cells?: [number, number][];
}

export interface ImmersiveViewerVisibilitySnapshot {
  map_id: string;
  generated_at_tick: number;
  viewer_cell: [number, number];
  max_range: number;
  minimum_light: number;
  discovered: [number, number][];
  /**
   * Cells inside the viewer's present geometric line of sight, independent of
   * illumination. This is presentation-only support for expedition memory:
   * darkness may show remembered architecture here without granting current
   * actor, item, or hazard perception.
   */
  line_of_sight?: [number, number][];
  /** Static-world cells that satisfy physical sight without actor acquisition scoring. */
  terrain_visible: [number, number][];
  currently_visible: [number, number][];
  illuminated: [number, number][];
  sensed: [number, number][];
  illumination: ImmersiveIlluminationSnapshot;
}

export type ImmersiveVisualAcquisitionCause =
  | "none"
  | "direct_sight"
  | "carried_light_exposure";

export interface ImmersiveVisualAcquisitionQuery {
  map_id?: string;
  observer_cell: [number, number];
  target_cell: [number, number];
  target_actor_id?: string;
  max_range?: number;
  minimum_light?: number;
}

export interface ImmersiveVisualAcquisitionResult {
  map_id: string;
  observer_cell: [number, number];
  target_cell: [number, number];
  acquired: boolean;
  score: number;
  cause: ImmersiveVisualAcquisitionCause;
  distance: number;
  max_range: number;
  illumination: number;
  minimum_light: number;
  line_of_sight: boolean;
  smoke_transmission: number;
  exposing_source_ids: string[];
}

interface LightSourceProfile {
  intensity: number;
  radius: number;
  duration_ticks?: number;
  color?: string;
  active_by_default: boolean;
  extinguishable: boolean;
  mobility: Exclude<ImmersiveLightMobility, "runtime">;
  persistent: boolean;
  stimulus_tags: string[];
  exposes_carrier: boolean;
  owner_actor_id?: string;
}

interface LightLineAnalysis {
  line_of_sight: boolean;
  smoke_transmission: number;
  light_transmission: number;
}

interface PreparedVisionCell {
  active: boolean;
  structural_block: boolean;
  smoke_opacity: number;
  light_smoke_opacity: number;
}

type PreparedVisionMap = Map<string, PreparedVisionCell>;
type LightLineCache = Map<string, LightLineAnalysis>;

interface VisualAcquisitionContext {
  simulation: SimulationMapSnapshot;
  illumination: ImmersiveIlluminationSnapshot;
  visionByKey: PreparedVisionMap;
  lineCache: LightLineCache;
  illuminationByKey: Map<string, ImmersiveIlluminationCell>;
  sourceById: Map<string, ImmersiveResolvedLightSource>;
}

const DEFAULT_AMBIENT_LIGHT = 0.08;
const DEFAULT_MINIMUM_LIGHT = 0.06;
const DEFAULT_VISUAL_RANGE_MACRO = 8;
const MIN_CONTRIBUTION = 0.001;
// Smoke is strong visual cover, not an opaque wall. Preserve its full optical
// depth for actor acquisition while letting physical light diffuse through at
// a much softer rate. This keeps lit terrain readable without revealing actors
// concealed by the same field.
const SMOKE_LIGHT_OPTICAL_DEPTH_SCALE = 0.12;

const clamp01 = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const round4 = (value: number) => Number(value.toFixed(4));

const asCell = (cell: readonly unknown[] | undefined): [number, number] => [
  Number(cell?.[0] || 0),
  Number(cell?.[1] || 0),
];

const sameCell = (a: readonly number[], b: readonly number[]) =>
  a[0] === b[0] && a[1] === b[1];

const cellSort = (a: readonly number[], b: readonly number[]) =>
  a[0] - b[0] || a[1] - b[1];

const uniqueStrings = (values: Array<string | undefined>) =>
  [...new Set(values.filter((value): value is string => Boolean(value)))].sort();

const spatialRatio = (gamePackage: GamePackage) =>
  isFineExpandedPackage(gamePackage) ? FINE_PER_MACRO : 1;

const currentTick = (save: PlaySave) => Math.max(0, Math.floor(save.clock_minutes || 0));

const validMobility = (value: unknown): value is Exclude<ImmersiveLightMobility, "runtime"> =>
  value === "fixed" || value === "portable" || value === "throwable";

const inferredLightProfile = (
  definition: Record<string, unknown>,
  defaultMobility: Exclude<ImmersiveLightMobility, "runtime">,
  defaultExposesCarrier: boolean,
): LightSourceProfile | undefined => {
  const raw = definition.light_source as Record<string, unknown> | undefined;
  const tags = Array.isArray(definition.tags)
    ? definition.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const terms = [definition.id, definition.display_name, ...tags]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const inferred =
    tags.includes("light_source") ||
    tags.includes("light") ||
    /(?:^|[_\s-])(lamp|lantern|torch|brazier|candle)(?:$|[_\s-])/.test(terms);
  if (!raw && !inferred) return undefined;

  const intensity = clamp01(Number(raw?.intensity ?? 0.75));
  const radiusValue = Number(raw?.radius ?? 6);
  const durationValue = Number(raw?.duration_ticks);
  const mobility = validMobility(raw?.mobility) ? raw.mobility : defaultMobility;
  const stimulusTags = Array.isArray(raw?.stimulus_tags)
    ? raw.stimulus_tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  return {
    intensity,
    radius: Math.max(0, Number.isFinite(radiusValue) ? radiusValue : 6),
    duration_ticks:
      Number.isFinite(durationValue) && durationValue > 0
        ? Math.max(1, Math.floor(durationValue))
        : undefined,
    color: typeof raw?.color === "string" ? raw.color : "#facc15",
    active_by_default: raw?.active_by_default !== false,
    extinguishable: raw?.extinguishable !== false,
    mobility,
    persistent: typeof raw?.persistent === "boolean" ? raw.persistent : raw?.duration_ticks === undefined,
    stimulus_tags: uniqueStrings(["light", ...stimulusTags]),
    exposes_carrier:
      typeof raw?.exposes_carrier === "boolean"
        ? raw.exposes_carrier
        : defaultExposesCarrier,
    owner_actor_id: typeof raw?.owner_actor_id === "string" ? raw.owner_actor_id : undefined,
  };
};

const lightStateOverrides = (save: PlaySave): Record<string, boolean> => {
  const value = save.flags?.immersive_light_states;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
  );
};

const sourceActive = (
  overrides: Record<string, boolean>,
  sourceId: string,
  definitionKey: string | undefined,
  activeByDefault: boolean,
  tick: number,
  expiresAtTick?: number,
) => {
  if (expiresAtTick !== undefined && expiresAtTick <= tick) return false;
  const sourceOverride = overrides[sourceId];
  if (typeof sourceOverride === "boolean") return sourceOverride;
  if (definitionKey) {
    const definitionOverride = overrides[definitionKey];
    if (typeof definitionOverride === "boolean") return definitionOverride;
  }
  return activeByDefault;
};

const tickFromDroppedId = (id: string): number | undefined => {
  const match = /^drop(?:_verb)?_(\d+)_/.exec(id);
  if (!match) return undefined;
  const tick = Number(match[1]);
  return Number.isFinite(tick) ? tick : undefined;
};

const actorCell = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  actorId: string | undefined,
): [number, number] | undefined => {
  if (!actorId || actorId === "player") return asCell(save.player.cell);
  const direct = save.entity_states?.[actorId]?.cell;
  if (direct) return asCell(direct);
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  for (let index = 0; index < (map?.entity_placements || []).length; index += 1) {
    const placement = map!.entity_placements[index];
    const key = entityPlacementStateKey(mapId, placement, index);
    if (actorId !== key && actorId !== placement.entity_id) continue;
    return asCell(save.entity_states?.[key]?.cell || placement.cell);
  }
  return undefined;
};

const profileSource = ({
  gamePackage,
  save,
  mapId,
  sourceId,
  definitionKey,
  sourceKind,
  cell,
  profile,
  createdAtTick,
  carrierActorId,
}: {
  gamePackage: GamePackage;
  save: PlaySave;
  mapId: string;
  sourceId: string;
  definitionKey: string;
  sourceKind: ImmersiveLightSourceKind;
  cell: [number, number];
  profile: LightSourceProfile;
  createdAtTick?: number;
  carrierActorId?: string;
}): ImmersiveResolvedLightSource | undefined => {
  const tick = currentTick(save);
  const expiresAtTick =
    profile.duration_ticks !== undefined
      ? (createdAtTick || 0) + profile.duration_ticks
      : undefined;
  if (
    !sourceActive(
      lightStateOverrides(save),
      sourceId,
      definitionKey,
      profile.active_by_default,
      tick,
      expiresAtTick,
    ) ||
    profile.intensity <= 0
  ) {
    return undefined;
  }
  return {
    id: sourceId,
    definition_key: definitionKey,
    map_id: mapId,
    source_kind: sourceKind,
    cell: asCell(cell),
    intensity: profile.intensity,
    radius: round4(profile.radius * spatialRatio(gamePackage)),
    color: profile.color,
    mobility: profile.mobility,
    persistent: profile.persistent,
    active: true,
    duration_ticks: profile.duration_ticks,
    created_at_tick: createdAtTick,
    expires_at_tick: expiresAtTick,
    owner_actor_id: profile.owner_actor_id,
    carrier_actor_id: carrierActorId,
    stimulus_tags: [...profile.stimulus_tags],
    exposes_carrier: Boolean(carrierActorId && profile.exposes_carrier),
    extinguishable: profile.extinguishable,
  };
};

const environmentSource = (
  save: PlaySave,
  mapId: string,
  fieldCell: [number, number],
  field: SimulationEnvironmentFieldRecord,
): ImmersiveResolvedLightSource | undefined => {
  if (field.kind !== "light" && field.kind !== "fire") return undefined;
  const tick = currentTick(save);
  const sourceId = `light:field:${field.id}`;
  const definitionKey = `field:${field.id}`;
  const overrides = lightStateOverrides(save);
  if (
    field.intensity <= 0 ||
    (field.expires_at_tick !== undefined && field.expires_at_tick <= tick) ||
    !sourceActive(overrides, sourceId, definitionKey, true, tick, field.expires_at_tick)
  ) {
    return undefined;
  }
  const cell = asCell(field.origin_cell || fieldCell);
  const tag = field.frequency_tag || field.tag || field.kind;
  const fieldRadius = Number(field.radius);
  const illuminationRadius = Number.isFinite(fieldRadius) ? fieldRadius : 6;
  const exposesCarrier =
    Boolean(field.actor_id) &&
    /carried|held|lamp|lantern|torch/.test(`${field.tag || ""} ${field.action || ""}`.toLowerCase());
  return {
    id: sourceId,
    definition_key: definitionKey,
    map_id: mapId,
    source_kind: field.kind === "fire" ? "fire_field" : "environment_field",
    cell,
    intensity: clamp01(field.intensity),
    // Fire's authored radius remains its hazard/damage footprint. Only the
    // resolved illumination source receives the larger firelight floor.
    radius: field.kind === "fire"
      ? Math.max(6, illuminationRadius)
      : Math.max(0, illuminationRadius),
    color: field.color || (field.kind === "fire" ? "#fb6a22" : "#facc15"),
    mobility: "runtime",
    persistent: field.expires_at_tick === undefined,
    active: true,
    created_at_tick: field.created_at_tick,
    expires_at_tick: field.expires_at_tick,
    owner_actor_id: field.actor_id,
    carrier_actor_id: exposesCarrier ? field.actor_id : undefined,
    stimulus_tags: uniqueStrings(["light", field.kind, tag]),
    exposes_carrier: exposesCarrier,
    extinguishable: true,
  };
};

export const resolveImmersiveLightSources = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id || gamePackage.metadata.start_map_id,
): ImmersiveResolvedLightSource[] => {
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  if (!map) return [];
  const delta = save.map_deltas?.[mapId];
  const removed = new Set(delta?.removed_objects || []);
  const carriedObjectKeys = new Set(Object.keys(delta?.carried_objects || {}));
  const objectById = new Map(gamePackage.object_library.map((definition) => [definition.id, definition]));
  const itemById = new Map(gamePackage.items.map((definition) => [definition.id, definition]));
  const sources: ImmersiveResolvedLightSource[] = [];

  (map.custom_object_placements || []).forEach((authored) => {
    const placementKey = placementOriginKey(authored);
    if (removed.has(placementKey) || carriedObjectKeys.has(placementKey)) return;
    const definition = objectById.get(authored.object_id);
    if (!definition) return;
    const profile = inferredLightProfile(definition as unknown as Record<string, unknown>, "fixed", false);
    if (!profile) return;
    const moved = delta?.moved_objects?.[placementKey];
    const source = profileSource({
      gamePackage,
      save,
      mapId,
      sourceId: `light:object:${placementKey}`,
      definitionKey: `object:${definition.id}`,
      sourceKind: moved ? "moved_object" : "authored_object",
      cell: asCell(moved?.cell || authored.cell),
      profile,
    });
    if (source) sources.push(source);
  });

  Object.entries(delta?.carried_objects || {}).forEach(([placementKey, carried]) => {
    const authored = (map.custom_object_placements || []).find(
      (placement) => placementOriginKey(placement) === placementKey,
    );
    const definition = objectById.get(carried.object_id || authored?.object_id || "");
    if (!definition) return;
    const profile = inferredLightProfile(definition as unknown as Record<string, unknown>, "portable", true);
    if (!profile) return;
    const carrierActorId = carried.actor_ids?.[0] || "player";
    const source = profileSource({
      gamePackage,
      save,
      mapId,
      sourceId: `light:carried-object:${placementKey}`,
      definitionKey: `object:${definition.id}`,
      sourceKind: "carried_object",
      cell: actorCell(gamePackage, save, mapId, carrierActorId) || asCell(carried.cell),
      profile,
      carrierActorId,
    });
    if (source) sources.push(source);
  });

  const takenItems = new Set(delta?.taken_items || []);
  (map.item_placements || []).forEach((placement) => {
    if (takenItems.has(placement.id)) return;
    const definition = itemById.get(placement.item_id);
    if (!definition) return;
    const profile = inferredLightProfile(definition as unknown as Record<string, unknown>, "portable", true);
    if (!profile) return;
    const source = profileSource({
      gamePackage,
      save,
      mapId,
      sourceId: `light:item:${placement.id}`,
      definitionKey: `item:${definition.id}`,
      sourceKind: "authored_item",
      cell: asCell(placement.cell),
      profile,
    });
    if (source) sources.push(source);
  });

  (delta?.dropped_items || []).forEach((drop) => {
    const definition = itemById.get(drop.item_id);
    if (!definition) return;
    const profile = inferredLightProfile(definition as unknown as Record<string, unknown>, "portable", true);
    if (!profile) return;
    const source = profileSource({
      gamePackage,
      save,
      mapId,
      sourceId: `light:drop:${drop.id}`,
      definitionKey: `item:${definition.id}`,
      sourceKind: "dropped_item",
      cell: asCell(drop.cell),
      profile,
      createdAtTick: tickFromDroppedId(drop.id),
    });
    if (source) sources.push(source);
  });

  (save.inventory || []).forEach((stack) => {
    if (stack.count <= 0) return;
    const definition = itemById.get(stack.id);
    if (!definition) return;
    const profile = inferredLightProfile(definition as unknown as Record<string, unknown>, "portable", true);
    if (!profile || profile.mobility === "fixed") return;
    const source = profileSource({
      gamePackage,
      save,
      mapId,
      sourceId: `light:carried:player:${definition.id}`,
      definitionKey: `item:${definition.id}`,
      sourceKind: "carried_item",
      cell: asCell(save.player.cell),
      profile,
      carrierActorId: "player",
    });
    if (source) sources.push(source);
  });

  Object.entries(delta?.environment_fields || {}).forEach(([key, fields]) => {
    const fieldCell = asCell(parseFineCoordKey(key));
    fields.forEach((field) => {
      // The legacy fire path already writes a complete radial set of
      // propagation cells. The authoritative solver expands the origin field
      // itself, so counting those cached copies as independent sources would
      // multiply one flame many times.
      if (field.kind === "light" && field.source === "propagation") return;
      const source = environmentSource(save, mapId, fieldCell, field);
      if (source) sources.push(source);
    });
  });

  return sources.sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      cellSort(left.cell, right.cell),
  );
};

const smokeOpacity = (cell: SimulationCellState | undefined) => {
  if (!cell) return 1;
  const opacity = cell.environment
    .filter((field) =>
      field.kind === "smoke" ||
      field.kind === "steam" ||
      field.kind === "poison_gas" ||
      field.kind === "acid_fumes",
    )
    .reduce((strongest, field) => {
      const modifier = Math.abs(Number(field.visibility_modifier || 0));
      const occlusion = Math.abs(Number(field.occlusion || 0));
      const densityWeight = Math.max(0.45, modifier + occlusion);
      return Math.max(strongest, clamp01(field.intensity) * clamp01(densityWeight));
    }, 0);
  return clamp01(opacity);
};

const structuralVisionBlock = (cell: SimulationCellState | undefined) =>
  Boolean(
    cell?.blocks_los ||
    cell?.occupants.some((occupant) => occupant.blocks_los),
  );

const prepareVisionMap = (
  simulation: SimulationMapSnapshot,
  ratio: number,
): PreparedVisionMap => {
  const opticalStepScale = 1 / Math.max(1, ratio);
  return new Map(
    simulation.cells.map((cell) => {
      const authoredOpacity = smokeOpacity(cell);
      // A macro-authored field expands into `ratio` consecutive fine samples.
      // Convert its optical depth to a per-fine-step value so crossing one
      // physical tile has the same transmission at either grid resolution.
      const scaledOpacity =
        authoredOpacity <= 0
          ? 0
          : 1 - Math.pow(1 - authoredOpacity, opticalStepScale);
      const scaledLightOpacity =
        authoredOpacity <= 0
          ? 0
          : 1 -
            Math.pow(
              1 - authoredOpacity,
              opticalStepScale * SMOKE_LIGHT_OPTICAL_DEPTH_SCALE,
            );
      return [
        coordKey(cell.cell),
        {
          active: Boolean(cell.active),
          structural_block: structuralVisionBlock(cell),
          smoke_opacity: clamp01(scaledOpacity),
          light_smoke_opacity: clamp01(scaledLightOpacity),
        },
      ];
    }),
  );
};

const AUTHORED_SMOKE_TERMS = /smoke|fog|mist|miasma|obscur/;

const applyAuthoredSmokeToSimulation = (
  gamePackage: GamePackage,
  mapId: string,
  simulation: SimulationMapSnapshot,
): SimulationMapSnapshot => {
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  if (!map) return simulation;
  const authoredSmoke = new Set(
    map.cells
      .filter((cell) =>
        AUTHORED_SMOKE_TERMS.test(
          `${cell.tag || ""} ${cell.hazard || ""} ${cell.terrain || ""}`.toLowerCase(),
        ),
      )
      .map((cell) => coordKey([cell.x, cell.z])),
  );
  if (authoredSmoke.size === 0) return simulation;
  return {
    ...simulation,
    cells: simulation.cells.map((cell) => {
      if (!authoredSmoke.has(coordKey(cell.cell))) return cell;
      if (cell.environment.some((field) => field.kind === "smoke")) return cell;
      return {
        ...cell,
        blocks_vision: true,
        environment: [
          ...cell.environment,
          {
            kind: "smoke",
            intensity: 0.75,
            age_ticks: 0,
            source: "authored" as const,
            tag: "authored_smoke",
            origin_cell: asCell(cell.cell),
            radius: 0,
            occlusion: 0.65,
            visibility_modifier: -0.65,
          },
        ],
      };
    }),
  };
};

const createVisibilitySimulation = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
) => applyAuthoredSmokeToSimulation(
  gamePackage,
  mapId,
  createSimulationSnapshotFromV1(gamePackage, save, mapId),
);

const analyzeLightLine = (
  visionByKey: PreparedVisionMap,
  from: [number, number],
  to: [number, number],
  cache?: LightLineCache,
): LightLineAnalysis => {
  const cacheKey = `${from[0]}:${from[1]}>${to[0]}:${to[1]}`;
  const cached = cache?.get(cacheKey);
  if (cached) return cached;

  let x = Math.round(from[0]);
  let z = Math.round(from[1]);
  const tx = Math.round(to[0]);
  const tz = Math.round(to[1]);
  const dx = Math.abs(tx - x);
  const dz = Math.abs(tz - z);
  const stepX = x < tx ? 1 : -1;
  const stepZ = z < tz ? 1 : -1;
  let error = dx - dz;
  let smokeTransmission = 1;
  let lightTransmission = 1;

  while (x !== tx || z !== tz) {
    const twice = error * 2;
    if (twice > -dz) {
      error -= dz;
      x += stepX;
    }
    if (twice < dx) {
      error += dx;
      z += stepZ;
    }

    const target = x === tx && z === tz;
    const state = visionByKey.get(fineCoordKey(x, z));
    if (!state?.active) {
      const blocked = {
        line_of_sight: false,
        smoke_transmission: 0,
        light_transmission: 0,
      };
      cache?.set(cacheKey, blocked);
      return blocked;
    }
    if (!target && state.structural_block) {
      const blocked = {
        line_of_sight: false,
        smoke_transmission: 0,
        light_transmission: 0,
      };
      cache?.set(cacheKey, blocked);
      return blocked;
    }
    smokeTransmission *= 1 - state.smoke_opacity;
    lightTransmission *= 1 - state.light_smoke_opacity;
  }

  const result = {
    line_of_sight: true,
    smoke_transmission: round4(clamp01(smokeTransmission)),
    light_transmission: round4(clamp01(lightTransmission)),
  };
  cache?.set(cacheKey, result);
  return result;
};

const illuminationFromSimulation = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId: string,
  simulation: SimulationMapSnapshot,
  sources: ImmersiveResolvedLightSource[],
  preparedVision?: PreparedVisionMap,
  sharedLineCache?: LightLineCache,
): ImmersiveIlluminationSnapshot => {
  const map = gamePackage.maps.find((candidate) => candidate.id === mapId);
  const authoredAmbient = Number((map as unknown as { ambient_light?: number } | undefined)?.ambient_light);
  const ambient = round4(
    clamp01(Number.isFinite(authoredAmbient) ? authoredAmbient : DEFAULT_AMBIENT_LIGHT),
  );
  const visionByKey =
    preparedVision || prepareVisionMap(simulation, spatialRatio(gamePackage));
  const lineCache = sharedLineCache || new Map<string, LightLineAnalysis>();
  const contributionsByCell = new Map<
    string,
    ImmersiveIlluminationContribution[]
  >();
  const activeCells = simulation.cells.filter((cell) => cell.active);
  const activeBounds = activeCells.reduce(
    (bounds, cell) => ({
      minX: Math.min(bounds.minX, cell.cell[0]),
      maxX: Math.max(bounds.maxX, cell.cell[0]),
      minZ: Math.min(bounds.minZ, cell.cell[1]),
      maxZ: Math.max(bounds.maxZ, cell.cell[1]),
    }),
    {
      minX: Infinity,
      maxX: -Infinity,
      minZ: Infinity,
      maxZ: -Infinity,
    },
  );

  // Iterate each source's bounded influence square. The previous cell-first
  // pass visited every map cell for every source and allocated an empty array
  // for nearly every out-of-range pair. Clamp authored radii to the active map
  // bounds as well: a very large but valid radius must not create a square
  // loop millions of cells wider than the map it can actually illuminate.
  sources.forEach((source) => {
    const sourceX = Number(source.cell[0]);
    const sourceZ = Number(source.cell[1]);
    const sourceRadius = Math.max(0, Number(source.radius));
    if (
      activeCells.length === 0 ||
      !Number.isFinite(sourceX) ||
      !Number.isFinite(sourceZ) ||
      !Number.isFinite(sourceRadius) ||
      !Number.isFinite(source.intensity)
    ) {
      return;
    }
    const minX = Math.max(
      activeBounds.minX,
      Math.ceil(sourceX - sourceRadius),
    );
    const maxX = Math.min(
      activeBounds.maxX,
      Math.floor(sourceX + sourceRadius),
    );
    const minZ = Math.max(
      activeBounds.minZ,
      Math.ceil(sourceZ - sourceRadius),
    );
    const maxZ = Math.min(
      activeBounds.maxZ,
      Math.floor(sourceZ + sourceRadius),
    );
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const key = fineCoordKey(x, z);
        if (!visionByKey.get(key)?.active) continue;
        const distance = Math.hypot(x - sourceX, z - sourceZ);
        if (distance > sourceRadius) continue;
        const line = analyzeLightLine(
          visionByKey,
          source.cell,
          [x, z],
          lineCache,
        );
        if (!line.line_of_sight || line.light_transmission <= 0) continue;
        const falloff =
          sourceRadius <= 0
            ? distance === 0
              ? 1
              : 0
            : Math.max(0, 1 - distance / (sourceRadius + 1));
        const value = source.intensity * falloff * line.light_transmission;
        if (value < MIN_CONTRIBUTION) continue;
        const contributions = contributionsByCell.get(key) || [];
        contributions.push({
          source_id: source.id,
          value: round4(value),
          distance: round4(distance),
          transmission: line.light_transmission,
        });
        contributionsByCell.set(key, contributions);
      }
    }
  });

  const cells = activeCells
    .map((cell): ImmersiveIlluminationCell => {
      const contributions = (
        contributionsByCell.get(coordKey(cell.cell)) || []
      ).sort(
        (left, right) =>
          right.value - left.value ||
          left.source_id.localeCompare(right.source_id),
      );
      const value = round4(clamp01(ambient + contributions.reduce((sum, entry) => sum + entry.value, 0)));
      return {
        cell: asCell(cell.cell),
        value,
        ambient,
        source_ids: contributions.map((entry) => entry.source_id),
        strongest_source_id: contributions[0]?.source_id,
        contributions,
      };
    })
    .sort((left, right) => cellSort(left.cell, right.cell));
  return {
    map_id: mapId,
    generated_at_tick: simulation.generated_at_tick,
    ambient_light: ambient,
    sources: sources.map((source) => ({ ...source, cell: asCell(source.cell), stimulus_tags: [...source.stimulus_tags] })),
    cells,
    totals: {
      sources: sources.length,
      illuminated_cells: cells.filter((cell) => cell.value > ambient + MIN_CONTRIBUTION).length,
      max_illumination: cells.length ? Math.max(...cells.map((cell) => cell.value)) : ambient,
    },
  };
};

export const createImmersiveIlluminationSnapshotFromV1 = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id || gamePackage.metadata.start_map_id,
): ImmersiveIlluminationSnapshot => {
  const simulation = createVisibilitySimulation(gamePackage, save, mapId);
  const sources = resolveImmersiveLightSources(gamePackage, save, mapId);
  return illuminationFromSimulation(gamePackage, save, mapId, simulation, sources);
};

export const queryImmersiveIlluminationAtCell = (
  snapshot: ImmersiveIlluminationSnapshot,
  cell: [number, number],
): ImmersiveIlluminationCell =>
  snapshot.cells.find((candidate) => sameCell(candidate.cell, cell)) || {
    cell: asCell(cell),
    value: snapshot.ambient_light,
    ambient: snapshot.ambient_light,
    source_ids: [],
    contributions: [],
  };

const acquisitionFromContext = (
  save: PlaySave,
  query: ImmersiveVisualAcquisitionQuery,
  context: VisualAcquisitionContext,
): ImmersiveVisualAcquisitionResult => {
  const {
    simulation,
    illumination,
    visionByKey,
    lineCache,
    illuminationByKey,
    sourceById,
  } = context;
  const distance = Math.hypot(
    query.target_cell[0] - query.observer_cell[0],
    query.target_cell[1] - query.observer_cell[1],
  );
  const maxRange = Math.max(0, Number(query.max_range ?? DEFAULT_VISUAL_RANGE_MACRO));
  const minimumLight = clamp01(Number(query.minimum_light ?? DEFAULT_MINIMUM_LIGHT));
  const line = analyzeLightLine(
    visionByKey,
    query.observer_cell,
    query.target_cell,
    lineCache,
  );
  const light = illuminationByKey.get(coordKey(query.target_cell)) || {
    cell: asCell(query.target_cell),
    value: illumination.ambient_light,
    ambient: illumination.ambient_light,
    source_ids: [],
    contributions: [],
  };
  const targetActorId = query.target_actor_id ||
    (sameCell(query.target_cell, save.player.cell) ? "player" : undefined);
  const exposingSourceIds = light.source_ids.filter((sourceId) => {
    const source = sourceById.get(sourceId);
    return Boolean(
      source?.exposes_carrier &&
      source.carrier_actor_id &&
      (!targetActorId || source.carrier_actor_id === targetActorId),
    );
  });
  const rangeFalloff = maxRange <= 0
    ? distance === 0 ? 1 : 0
    : Math.max(0, 1 - distance / (maxRange + 1));
  const score = round4(clamp01(light.value * rangeFalloff * line.smoke_transmission));
  const acquired =
    distance <= maxRange &&
    line.line_of_sight &&
    line.smoke_transmission > 0.1 &&
    light.value >= minimumLight &&
    score >= 0.04;
  return {
    map_id: query.map_id || simulation.map_id,
    observer_cell: asCell(query.observer_cell),
    target_cell: asCell(query.target_cell),
    acquired,
    score,
    cause: acquired
      ? exposingSourceIds.length > 0
        ? "carried_light_exposure"
        : "direct_sight"
      : "none",
    distance: round4(distance),
    max_range: maxRange,
    illumination: light.value,
    minimum_light: minimumLight,
    line_of_sight: line.line_of_sight,
    smoke_transmission: line.smoke_transmission,
    exposing_source_ids: exposingSourceIds,
  };
};

const createVisualAcquisitionContext = (
  simulation: SimulationMapSnapshot,
  illumination: ImmersiveIlluminationSnapshot,
  visionByKey: PreparedVisionMap,
  lineCache: LightLineCache,
): VisualAcquisitionContext => ({
  simulation,
  illumination,
  visionByKey,
  lineCache,
  illuminationByKey: new Map(
    illumination.cells.map((cell) => [coordKey(cell.cell), cell]),
  ),
  sourceById: new Map(
    illumination.sources.map((source) => [source.id, source]),
  ),
});

export const queryImmersiveVisualAcquisition = (
  gamePackage: GamePackage,
  save: PlaySave,
  query: ImmersiveVisualAcquisitionQuery,
): ImmersiveVisualAcquisitionResult => {
  const mapId = query.map_id || save.current_map_id || gamePackage.metadata.start_map_id;
  const simulation = createVisibilitySimulation(gamePackage, save, mapId);
  const sources = resolveImmersiveLightSources(gamePackage, save, mapId);
  const visionByKey = prepareVisionMap(simulation, spatialRatio(gamePackage));
  const lineCache = new Map<string, LightLineAnalysis>();
  const illumination = illuminationFromSimulation(
    gamePackage,
    save,
    mapId,
    simulation,
    sources,
    visionByKey,
    lineCache,
  );
  const context = createVisualAcquisitionContext(
    simulation,
    illumination,
    visionByKey,
    lineCache,
  );
  return acquisitionFromContext(
    save,
    {
      ...query,
      map_id: mapId,
      max_range: query.max_range ?? DEFAULT_VISUAL_RANGE_MACRO * spatialRatio(gamePackage),
    },
    context,
  );
};

export const createImmersiveViewerVisibilityFromV1 = (
  gamePackage: GamePackage,
  save: PlaySave,
  mapId = save.current_map_id || gamePackage.metadata.start_map_id,
  options: ImmersiveViewerVisibilityOptions = {},
): ImmersiveViewerVisibilitySnapshot => {
  const simulation = createVisibilitySimulation(gamePackage, save, mapId);
  const sources = resolveImmersiveLightSources(gamePackage, save, mapId);
  const visionByKey = prepareVisionMap(simulation, spatialRatio(gamePackage));
  const lineCache = new Map<string, LightLineAnalysis>();
  const illumination = illuminationFromSimulation(
    gamePackage,
    save,
    mapId,
    simulation,
    sources,
    visionByKey,
    lineCache,
  );
  const context = createVisualAcquisitionContext(
    simulation,
    illumination,
    visionByKey,
    lineCache,
  );
  const viewerCell = asCell(options.viewer_cell || save.player.cell);
  const maxRange = Math.max(
    0,
    Number(options.max_range ?? DEFAULT_VISUAL_RANGE_MACRO * spatialRatio(gamePackage)),
  );
  const minimumLight = clamp01(Number(options.minimum_light ?? DEFAULT_MINIMUM_LIGHT));
  const visibilityCandidates = simulation.cells
    .filter((cell) => cell.active)
    .map((cell) => {
      const candidateCell = asCell(cell.cell);
      const isViewerCell = sameCell(candidateCell, viewerCell);
      const inRange =
        Math.hypot(
          candidateCell[0] - viewerCell[0],
          candidateCell[1] - viewerCell[1],
        ) <= maxRange;
      return {
        cell: candidateCell,
        isViewerCell,
        acquisition:
          !isViewerCell && inRange
            ? acquisitionFromContext(
                save,
                {
                  map_id: mapId,
                  observer_cell: viewerCell,
                  target_cell: candidateCell,
                  max_range: maxRange,
                  minimum_light: minimumLight,
                },
                context,
              )
            : null,
      };
    });
  const currentlyVisible = visibilityCandidates
    .filter(({ isViewerCell, acquisition }) => isViewerCell || acquisition?.acquired)
    .map(({ cell }) => asCell(cell))
    .sort(cellSort);
  const lineOfSight = visibilityCandidates
    .filter(({ isViewerCell, acquisition }) =>
      isViewerCell ||
      (
        acquisition !== null &&
        acquisition.distance <= maxRange &&
        acquisition.line_of_sight
      ),
    )
    .map(({ cell }) => asCell(cell))
    .sort(cellSort);
  const terrainVisible = visibilityCandidates
    .filter(({ isViewerCell, acquisition }) =>
      isViewerCell ||
      (
        acquisition !== null &&
        acquisition.distance <= maxRange &&
        acquisition.line_of_sight &&
        acquisition.illumination >= minimumLight
      ),
    )
    .map(({ cell }) => asCell(cell))
    .sort(cellSort);
  const illuminated = illumination.cells
    .filter((cell) => cell.value >= minimumLight)
    .map((cell) => asCell(cell.cell))
    .sort(cellSort);
  const sensed = [...new Map((options.sensed_cells || []).map((cell) => [coordKey(cell), asCell(cell)])).values()]
    .sort(cellSort);
  const discoveredByKey = new Map<string, [number, number]>();
  (save.explored_cells?.[mapId] || []).forEach((key) => {
    const parsed = parseFineCoordKey(key);
    if (!Number.isFinite(parsed[0]) || !Number.isFinite(parsed[1])) return;
    const cell = asCell(parsed);
    discoveredByKey.set(coordKey(cell), cell);
  });
  terrainVisible.forEach((cell) => discoveredByKey.set(coordKey(cell), asCell(cell)));
  currentlyVisible.forEach((cell) => discoveredByKey.set(coordKey(cell), asCell(cell)));
  return {
    map_id: mapId,
    generated_at_tick: simulation.generated_at_tick,
    viewer_cell: viewerCell,
    max_range: maxRange,
    minimum_light: minimumLight,
    discovered: [...discoveredByKey.values()].sort(cellSort),
    line_of_sight: lineOfSight,
    terrain_visible: terrainVisible,
    currently_visible: currentlyVisible,
    illuminated,
    sensed,
    illumination,
  };
};
