import {
  MapDataSchema,
  type CellData,
  type GamePackage,
  type MapData,
  type ObjectData,
  type ObjectPlacementData,
} from "../schema/game";
import { isBuildingDoorPlacement } from "../utils/doorPlacement";
import {
  getMacroPlacementFootprint,
  placementHasCollision,
} from "../utils/objectFootprint";

/**
 * Pure, generation-facing validation for the ordinary authored MapData
 * contract. This module deliberately has no React, Zustand, save-store, or
 * generator dependency: hand-authored maps and future generated maps pass
 * through exactly the same checks.
 */

export type GridCoordinate = [number, number];
export type ValidationSeverity = "error" | "warning" | "info";

/** Public compatibility list. Codes are append-only within validator v1. */
export const MAP_VALIDATION_ISSUE_CODES = [
  "MAP_SCHEMA_INVALID",
  "MAP_DIMENSIONS_INVALID",
  "MAP_NON_FINITE_NUMBER",
  "CELL_COORDINATE_INVALID",
  "CELL_COORDINATE_DUPLICATE",
  "CELL_OUT_OF_BOUNDS",
  "CELL_HEIGHT_INVALID",
  "STACKED_WALKABLE_COLLISION",
  "PLACEMENT_COORDINATE_INVALID",
  "PLACEMENT_ID_DUPLICATE",
  "SPAWN_MISSING",
  "SPAWN_OUT_OF_BOUNDS",
  "SPAWN_FOOTPRINT_INVALID",
  "SPAWN_UNREACHABLE",
  "OBJECT_PLACEMENT_OUT_OF_BOUNDS",
  "OBJECT_REFERENCE_MISSING",
  "OBJECT_FOOTPRINT_OVERLAP",
  "BLUEPRINT_REFERENCE_MISSING",
  "DIALOGUE_REFERENCE_MISSING",
  "ENTITY_PLACEMENT_OUT_OF_BOUNDS",
  "ENTITY_REFERENCE_MISSING",
  "ENTITY_FOOTPRINT_INVALID",
  "ENTITY_FOOTPRINT_OVERLAP",
  "SCHEDULE_CELL_OUT_OF_BOUNDS",
  "ITEM_PLACEMENT_OUT_OF_BOUNDS",
  "ITEM_REFERENCE_MISSING",
  "CONTAINER_PLACEMENT_OUT_OF_BOUNDS",
  "CONTAINER_INACCESSIBLE",
  "LOCK_KEY_MISSING",
  "LOCK_UNSUPPORTED_OBJECT",
  "PROGRESSION_KEY_BEHIND_LOCK",
  "PROGRESSION_KEY_UNAVAILABLE",
  "PROGRESSION_REQUIRED_TARGET_BLOCKED",
  "TRIGGER_CELL_REQUIRED",
  "TRIGGER_OUT_OF_BOUNDS",
  "TRIGGER_UNREACHABLE",
  "CUTSCENE_REFERENCE_MISSING",
  "EXIT_OUT_OF_BOUNDS",
  "EXIT_TARGET_MAP_MISSING",
  "EXIT_TARGET_SPAWN_MISSING",
  "EXIT_TARGET_SPAWN_INVALID",
  "EXIT_UNREACHABLE",
  "REQUIRED_EXIT_MISSING",
  "REQUIRED_CELL_UNREACHABLE",
  "REQUIRED_REGION_UNREACHABLE",
  "DOOR_CELL_INVALID",
  "DOOR_FACING_INVALID",
  "DOOR_APPROACH_BLOCKED",
  "INTERACTABLE_INACCESSIBLE",
  "ELEVATION_TRANSITION_ILLEGAL",
  "CONNECTOR_ENDPOINT_MISSING",
  "CONNECTOR_ENDPOINT_AMBIGUOUS",
  "CONNECTOR_ENDPOINT_BLOCKED",
  "STAIR_LANDING_BLOCKED",
  "RETURN_ROUTE_MISSING",
  "HAZARD_SAFE_START_VIOLATION",
  "HAZARD_CRITICAL_ROUTE_LETHAL",
  "HAZARD_REQUIRED_KEY_AT_RISK",
] as const;

export type MapValidationIssueCode =
  | (typeof MAP_VALIDATION_ISSUE_CODES)[number]
  | `PERFORMANCE_${string}_${"SOFT" | "HARD"}_LIMIT`;

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  mapId: string;
  cells?: GridCoordinate[];
  placementIds?: string[];
  suggestedFix?: string;
}

export interface RegionReachability {
  regionId: string;
  totalCells: number;
  traversableCells: number;
  reachableCells: number;
  reachable: boolean;
}

export interface ReachabilitySummary {
  primarySpawnId?: string;
  traversableCells: number;
  reachableCells: number;
  unreachableCells: number;
  connectedComponents: number;
  regions: RegionReachability[];
}

export interface ProgressionAcquisition {
  itemId: string;
  sourcePlacementId: string;
}

export interface ProgressionSummary {
  lockedContainers: number;
  lockedDoors: number;
  unlockedContainerIds: string[];
  unlockedDoorIds: string[];
  blockedContainerIds: string[];
  blockedDoorIds: string[];
  availableItemIds: string[];
  acquisitionOrder: ProgressionAcquisition[];
}

export interface MapValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  metrics: Record<string, number>;
  reachableRegions: ReachabilitySummary;
  progression?: ProgressionSummary;
}

export interface PerformanceBudget {
  soft: number;
  hard: number;
}

export interface MapPerformanceBudgets {
  macroCells: PerformanceBudget;
  fineCells: PerformanceBudget;
  rooms: PerformanceBudget;
  entityPlacements: PerformanceBudget;
  objectPlacements: PerformanceBudget;
  activeChemistrySeedCells: PerformanceBudget;
  persistentTriggersAndExits: PerformanceBudget;
  animatedGifActors: PerformanceBudget;
  estimatedSerializedMapBytes: PerformanceBudget;
}

export const DEFAULT_DUNGEON_MAP_BUDGETS: MapPerformanceBudgets = {
  macroCells: { soft: 20_000, hard: 65_536 },
  fineCells: { soft: 180_000, hard: 65_536 * 9 },
  rooms: { soft: 24, hard: 40 },
  entityPlacements: { soft: 80, hard: 160 },
  objectPlacements: { soft: 600, hard: 1_200 },
  activeChemistrySeedCells: { soft: 250, hard: 1_000 },
  persistentTriggersAndExits: { soft: 100, hard: 250 },
  animatedGifActors: { soft: 12, hard: 24 },
  estimatedSerializedMapBytes: { soft: 2 * 1024 * 1024, hard: 8 * 1024 * 1024 },
};

type ValidationPackageContext = Pick<
  GamePackage,
  | "maps"
  | "object_library"
  | "object_blueprints"
  | "entities"
  | "items"
  | "dialogue"
  | "cutscenes"
  | "sprite_library"
>;

export interface RequiredMapCell {
  id: string;
  cell: GridCoordinate;
  /** Interactions may be activated from the target cell or a cardinal neighbor. */
  interaction?: boolean;
}

export interface MapValidationOptions {
  package?: ValidationPackageContext;
  primarySpawnId?: string;
  requiredCells?: RequiredMapCell[];
  requiredRegionIds?: string[];
  requiredExitIds?: string[];
  returnRouteRequired?: boolean;
  initialItemIds?: string[];
  safeStartRadius?: number;
  lethalHazardTags?: string[];
  budgets?: Partial<MapPerformanceBudgets>;
}

type IssueInput = Omit<ValidationIssue, "mapId">;

interface NavigationModel {
  topByCoordinate: Map<string, CellData>;
  baseTraversable: Set<string>;
  traversable: Set<string>;
  strictSpawnCells: Set<string>;
  objectById: Map<string, ObjectData>;
  directedNeighbors: (coordinate: GridCoordinate, allowed?: Set<string>) => GridCoordinate[];
}

const DIRECTIONS: GridCoordinate[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const coordinateKey = (x: number, z: number) => `${x}:${z}`;
const cellCoordinate = (cell: Pick<CellData, "x" | "z">): GridCoordinate => [cell.x, cell.z];

const centeredBounds = (map: Pick<MapData, "width" | "height">) => {
  const minX = -Math.floor(map.width / 2);
  const minZ = -Math.floor(map.height / 2);
  return {
    minX,
    minZ,
    maxX: minX + map.width - 1,
    maxZ: minZ + map.height - 1,
  };
};

const isCoordinateInBounds = (
  map: Pick<MapData, "width" | "height">,
  coordinate: readonly unknown[],
) => {
  const x = coordinate[0];
  const z = coordinate[1];
  if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const bounds = centeredBounds(map);
  return (
    x >= bounds.minX &&
    x <= bounds.maxX &&
    z >= bounds.minZ &&
    z <= bounds.maxZ
  );
};

const isLegalCoordinate = (coordinate: readonly unknown[]) =>
  coordinate.length >= 2 &&
  coordinate.slice(0, 2).every(
    (value) => typeof value === "number" && Number.isFinite(value) && Number.isInteger(value),
  );

const objectPlacementId = (placement: ObjectPlacementData) =>
  placement.id || `object:${placement.object_id}@${placement.cell[0]},${placement.cell[1]}:${placement.facing[0]},${placement.facing[1]}`;

const derivedExitId = (exit: MapData["exits"][number]) =>
  exit.id || `exit:${exit.cell[0]},${exit.cell[1]}->${exit.target_map_id}#${exit.target_spawn_id || "default"}`;

const emptyReachability = (): ReachabilitySummary => ({
  traversableCells: 0,
  reachableCells: 0,
  unreachableCells: 0,
  connectedComponents: 0,
  regions: [],
});

const jsonByteLength = (value: unknown) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
};

const stableIssueSort = (a: ValidationIssue, b: ValidationIssue) => {
  const severityOrder: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };
  return (
    severityOrder[a.severity] - severityOrder[b.severity] ||
    a.code.localeCompare(b.code) ||
    JSON.stringify(a.cells || []).localeCompare(JSON.stringify(b.cells || [])) ||
    JSON.stringify(a.placementIds || []).localeCompare(JSON.stringify(b.placementIds || [])) ||
    a.message.localeCompare(b.message)
  );
};

const walkFrom = (
  navigation: NavigationModel,
  start: GridCoordinate | undefined,
  allowed = navigation.traversable,
) => {
  const reached = new Set<string>();
  if (!start) return reached;
  const startKey = coordinateKey(start[0], start[1]);
  if (!allowed.has(startKey)) return reached;
  reached.add(startKey);
  const queue: GridCoordinate[] = [start];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    for (const next of navigation.directedNeighbors(current, allowed)) {
      const key = coordinateKey(next[0], next[1]);
      if (reached.has(key)) continue;
      reached.add(key);
      queue.push(next);
    }
  }
  return reached;
};

const activationReachable = (
  reached: Set<string>,
  coordinate: GridCoordinate,
  interaction = false,
) => {
  if (reached.has(coordinateKey(coordinate[0], coordinate[1]))) return true;
  if (!interaction) return false;
  return DIRECTIONS.some(([dx, dz]) => reached.has(coordinateKey(coordinate[0] + dx, coordinate[1] + dz)));
};

const topCellIndex = (map: MapData) => {
  const index = new Map<string, CellData>();
  for (const cell of map.cells) {
    if (!cell.active) continue;
    const key = coordinateKey(cell.x, cell.z);
    const existing = index.get(key);
    if (
      !existing ||
      (cell.walkable && !existing.walkable) ||
      (cell.walkable === existing.walkable && (cell.y || 0) < (existing.y || 0))
    ) {
      index.set(key, cell);
    }
  }
  return index;
};

const buildNavigation = (
  map: MapData,
  packageContext?: ValidationPackageContext,
): NavigationModel => {
  const objectById = new Map((packageContext?.object_library || []).map((object) => [object.id, object]));
  const topByCoordinate = topCellIndex(map);
  const baseTraversable = new Set<string>();
  for (const [key, cell] of topByCoordinate) {
    if (!cell.active || !cell.walkable) continue;
    const embeddedObject = cell.object_id ? objectById.get(cell.object_id) : undefined;
    if (embeddedObject && embeddedObject.collision.profile !== "none") continue;
    baseTraversable.add(key);
  }

  const traversable = new Set(baseTraversable);
  const strictSpawnCells = new Set(baseTraversable);
  for (const placement of map.custom_object_placements || []) {
    const object = objectById.get(placement.object_id);
    if (!placementHasCollision(placement, object)) continue;
    const footprint = getMacroPlacementFootprint(placement, object);
    for (const [x, z] of footprint) strictSpawnCells.delete(coordinateKey(x, z));
    // Closed doors are actionable traversal gates. Treat them as open for the
    // connectivity graph, but not as legal spawn cells.
    if (isBuildingDoorPlacement(placement)) continue;
    for (const [x, z] of footprint) traversable.delete(coordinateKey(x, z));
  }
  for (const container of map.container_placements || []) {
    const key = coordinateKey(container.cell[0], container.cell[1]);
    traversable.delete(key);
    strictSpawnCells.delete(key);
  }

  const portals = new Map<string, GridCoordinate[]>();
  for (const cell of topByCoordinate.values()) {
    if (!cell.portal_id) continue;
    const endpoints = portals.get(cell.portal_id) || [];
    endpoints.push([cell.x, cell.z]);
    portals.set(cell.portal_id, endpoints);
  }

  const directedNeighbors = (coordinate: GridCoordinate, allowed = traversable) => {
    const current = topByCoordinate.get(coordinateKey(coordinate[0], coordinate[1]));
    if (!current) return [];
    const result: GridCoordinate[] = [];
    for (const [dx, dz] of DIRECTIONS) {
      const next: GridCoordinate = [coordinate[0] + dx, coordinate[1] + dz];
      if (!allowed.has(coordinateKey(next[0], next[1]))) continue;
      const target = topByCoordinate.get(coordinateKey(next[0], next[1]));
      if (!target) continue;
      // This mirrors the active runtime rule: upward movement greater than one
      // visual-height unit is blocked; downward movement is legal.
      if (target.visual_height - current.visual_height > 1) continue;
      result.push(next);
    }
    if (current.portal_id) {
      for (const endpoint of portals.get(current.portal_id) || []) {
        if (endpoint[0] === coordinate[0] && endpoint[1] === coordinate[1]) continue;
        if (allowed.has(coordinateKey(endpoint[0], endpoint[1]))) result.push(endpoint);
      }
    }
    return result;
  };

  return {
    topByCoordinate,
    baseTraversable,
    traversable,
    strictSpawnCells,
    objectById,
    directedNeighbors,
  };
};

const countComponents = (navigation: NavigationModel) => {
  const remaining = new Set(navigation.traversable);
  let components = 0;
  while (remaining.size > 0) {
    components += 1;
    const first = remaining.values().next().value as string;
    const [x, z] = first.split(":").map(Number);
    const component = new Set<string>([first]);
    const queue: GridCoordinate[] = [[x, z]];
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      // Components are weak connectivity summaries: a steep edge remains one
      // physical component even if it is traversable only in the downward
      // direction. Portal edges are already symmetric in directedNeighbors.
      const neighbors = [
        ...DIRECTIONS.map(([dx, dz]) => [current[0] + dx, current[1] + dz] as GridCoordinate),
        ...navigation.directedNeighbors(current),
      ];
      for (const next of neighbors) {
        const key = coordinateKey(next[0], next[1]);
        if (!navigation.traversable.has(key) || component.has(key)) continue;
        component.add(key);
        queue.push(next);
      }
    }
    for (const key of component) remaining.delete(key);
  }
  return components;
};

const isStairCell = (cell: CellData) =>
  /(?:stair|steps|ladder|ramp|slope)/i.test(
    [cell.terrain, cell.tag, cell.object_id].filter(Boolean).join(" "),
  );

const isLethalCell = (cell: CellData, extraTags: readonly string[]) => {
  const terms = [
    cell.hazard,
    cell.infection,
    cell.tag,
    cell.terrain,
    cell.surface_tag,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (extraTags.some((tag) => terms.includes(tag.toLowerCase()))) return true;
  if (cell.surface_tag === "firehazard") return true;
  if (/\b(?:lethal|lava|collapse|acid|toxic|miasma|poison gas|electrified|electric)\b/i.test(terms)) return true;
  return cell.surface_tag === "water" && /electr|charged|shock/i.test(terms);
};

const inspectNonFiniteNumbers = (
  value: unknown,
  path: string,
  visit: (path: string, value: number) => void,
) => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) visit(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectNonFiniteNumbers(entry, `${path}[${index}]`, visit));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      inspectNonFiniteNumbers(entry, path ? `${path}.${key}` : key, visit);
    }
  }
};

const metricBudgetCodes: Record<keyof MapPerformanceBudgets, string> = {
  macroCells: "MACRO_CELLS",
  fineCells: "FINE_CELLS",
  rooms: "ROOMS",
  entityPlacements: "ENTITY_PLACEMENTS",
  objectPlacements: "OBJECT_PLACEMENTS",
  activeChemistrySeedCells: "ACTIVE_CHEMISTRY_SEED_CELLS",
  persistentTriggersAndExits: "PERSISTENT_TRIGGERS_EXITS",
  animatedGifActors: "ANIMATED_GIF_ACTORS",
  estimatedSerializedMapBytes: "SERIALIZED_MAP_BYTES",
};

const mergeBudgets = (overrides?: Partial<MapPerformanceBudgets>): MapPerformanceBudgets => {
  const result = { ...DEFAULT_DUNGEON_MAP_BUDGETS };
  for (const key of Object.keys(DEFAULT_DUNGEON_MAP_BUDGETS) as (keyof MapPerformanceBudgets)[]) {
    if (overrides?.[key]) result[key] = { ...DEFAULT_DUNGEON_MAP_BUDGETS[key], ...overrides[key] };
  }
  return result;
};

export function validateOrdinaryMap(
  mapInput: unknown,
  options: MapValidationOptions = {},
): MapValidationReport {
  const inferredMapId =
    mapInput && typeof mapInput === "object" && typeof (mapInput as { id?: unknown }).id === "string"
      ? (mapInput as { id: string }).id
      : "<unknown-map>";
  const issues: ValidationIssue[] = [];
  const issueKeys = new Set<string>();
  const addIssue = (issue: IssueInput) => {
    const complete = { ...issue, mapId: inferredMapId };
    const key = `${complete.code}|${JSON.stringify(complete.cells || [])}|${JSON.stringify(complete.placementIds || [])}|${complete.message}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push(complete);
  };

  inspectNonFiniteNumbers(mapInput, "map", (path) => {
    addIssue({
      severity: "error",
      code: "MAP_NON_FINITE_NUMBER",
      message: `${path} contains NaN or an infinite number.`,
      suggestedFix: "Replace it with a finite authored value before validation or persistence.",
    });
  });

  if (mapInput && typeof mapInput === "object") {
    const candidate = mapInput as { width?: unknown; height?: unknown };
    if (
      typeof candidate.width !== "number" ||
      typeof candidate.height !== "number" ||
      !Number.isInteger(candidate.width) ||
      !Number.isInteger(candidate.height) ||
      candidate.width <= 0 ||
      candidate.height <= 0
    ) {
      addIssue({
        severity: "error",
        code: "MAP_DIMENSIONS_INVALID",
        message: "Map width and height must be positive finite integers.",
        suggestedFix: "Use positive integer macro-grid dimensions.",
      });
    }
  }

  const parsed = MapDataSchema.safeParse(mapInput);
  if (!parsed.success) {
    for (const schemaIssue of parsed.error.issues) {
      addIssue({
        severity: "error",
        code: "MAP_SCHEMA_INVALID",
        message: `${schemaIssue.path.join(".") || "map"}: ${schemaIssue.message}`,
        suggestedFix: "Make the map conform to MapDataSchema before running gameplay validation.",
      });
    }
    issues.sort(stableIssueSort);
    return {
      valid: false,
      issues,
      metrics: {},
      reachableRegions: emptyReachability(),
    };
  }

  const map = parsed.data;
  const packageContext = options.package;
  const mapById = new Map((packageContext?.maps || []).map((candidate) => [candidate.id, candidate]));
  mapById.set(map.id, map);
  const objectIds = new Set((packageContext?.object_library || []).map((entry) => entry.id));
  const blueprintIds = new Set((packageContext?.object_blueprints || []).map((entry) => entry.id));
  const entityIds = new Set((packageContext?.entities || []).map((entry) => entry.id));
  const itemIds = new Set((packageContext?.items || []).map((entry) => entry.id));
  const dialogueIds = new Set((packageContext?.dialogue || []).map((entry) => entry.id));
  const cutsceneIds = new Set((packageContext?.cutscenes || []).map((entry) => entry.id));
  const navigation = buildNavigation(map, packageContext);

  const registerCoordinate = (
    coordinate: readonly unknown[],
    placementId: string,
    outOfBoundsCode: string,
  ) => {
    if (!isLegalCoordinate(coordinate)) {
      addIssue({
        severity: "error",
        code: "PLACEMENT_COORDINATE_INVALID",
        message: `${placementId} must use finite integer macro coordinates.`,
        placementIds: [placementId],
        suggestedFix: "Snap the placement to an integer macro cell.",
      });
      return;
    }
    if (!isCoordinateInBounds(map, coordinate)) {
      const x = Number(coordinate[0]);
      const z = Number(coordinate[1]);
      addIssue({
        severity: "error",
        code: outOfBoundsCode,
        message: `${placementId} is outside the declared ${map.width}x${map.height} bounds.`,
        cells: [[x, z]],
        placementIds: [placementId],
        suggestedFix: "Move the placement in bounds or resize the map.",
      });
    }
  };

  const placementIdOwners = new Map<string, string[]>();
  const registerPlacementId = (id: string, owner: string) => {
    const owners = placementIdOwners.get(id) || [];
    owners.push(owner);
    placementIdOwners.set(id, owners);
  };

  const exactCells = new Map<string, CellData[]>();
  const stackedWalkable = new Map<string, CellData[]>();
  for (const cell of map.cells) {
    const coordinate = [cell.x, cell.z] as GridCoordinate;
    const exactKey = `${cell.x}:${cell.y}:${cell.z}`;
    const exact = exactCells.get(exactKey) || [];
    exact.push(cell);
    exactCells.set(exactKey, exact);
    if (cell.active && cell.walkable) {
      const stackKey = coordinateKey(cell.x, cell.z);
      const stack = stackedWalkable.get(stackKey) || [];
      stack.push(cell);
      stackedWalkable.set(stackKey, stack);
    }
    if (!isLegalCoordinate(coordinate) || !Number.isFinite(cell.y)) {
      addIssue({
        severity: "error",
        code: "CELL_COORDINATE_INVALID",
        message: `Cell (${cell.x}, ${cell.y}, ${cell.z}) must use finite integer x/z coordinates and a finite y value.`,
        suggestedFix: "Snap x/z to the macro grid and use a finite elevation.",
      });
    } else if (!isCoordinateInBounds(map, coordinate)) {
      addIssue({
        severity: "error",
        code: "CELL_OUT_OF_BOUNDS",
        message: `Cell (${cell.x}, ${cell.z}) lies outside the declared map bounds.`,
        cells: [coordinate],
        suggestedFix: "Remove the cell, move it in bounds, or resize the map.",
      });
    }
    if (!Number.isFinite(cell.height) || !Number.isFinite(cell.visual_height) || cell.height < 0 || cell.visual_height < 0) {
      addIssue({
        severity: "error",
        code: "CELL_HEIGHT_INVALID",
        message: `Cell (${cell.x}, ${cell.z}) has an illegal height or visual_height.`,
        cells: Number.isFinite(cell.x) && Number.isFinite(cell.z) ? [coordinate] : undefined,
        suggestedFix: "Use finite non-negative height values.",
      });
    }
    if (cell.object_id && packageContext && !objectIds.has(cell.object_id)) {
      addIssue({
        severity: "error",
        code: "OBJECT_REFERENCE_MISSING",
        message: `Cell references missing object ${cell.object_id}.`,
        cells: [coordinate],
        suggestedFix: "Add the object definition or select an existing floor/wall object.",
      });
    }
  }

  for (const [key, cells] of exactCells) {
    if (cells.length <= 1) continue;
    addIssue({
      severity: "error",
      code: "CELL_COORDINATE_DUPLICATE",
      message: `${cells.length} cells occupy the exact coordinate ${key}.`,
      cells: [[cells[0].x, cells[0].z]],
      suggestedFix: "Keep only one authored cell at each x/y/z coordinate.",
    });
  }
  for (const cells of stackedWalkable.values()) {
    if (cells.length <= 1) continue;
    addIssue({
      severity: "error",
      code: "STACKED_WALKABLE_COLLISION",
      message: "Multiple active walkable cells share one x/z coordinate; the current runtime selects only one.",
      cells: [[cells[0].x, cells[0].z]],
      suggestedFix: "Represent separate floors as ordinary maps connected by exits, or make overhead cells non-walkable.",
    });
  }

  for (const spawn of map.spawns) {
    registerPlacementId(spawn.id, `spawn:${spawn.id}`);
    registerCoordinate(spawn.cell, spawn.id, "SPAWN_OUT_OF_BOUNDS");
  }
  for (const placement of map.custom_object_placements) {
    const placementId = objectPlacementId(placement);
    registerPlacementId(placementId, placementId);
    registerCoordinate(placement.cell, placementId, "OBJECT_PLACEMENT_OUT_OF_BOUNDS");
    if (packageContext && !objectIds.has(placement.object_id)) {
      addIssue({
        severity: "error",
        code: "OBJECT_REFERENCE_MISSING",
        message: `${placementId} references missing object ${placement.object_id}.`,
        placementIds: [placementId],
        suggestedFix: "Add the object definition or replace the placement reference.",
      });
    }
    if (placement.blueprint_id && packageContext && !blueprintIds.has(placement.blueprint_id)) {
      addIssue({
        severity: "error",
        code: "BLUEPRINT_REFERENCE_MISSING",
        message: `${placementId} references missing blueprint ${placement.blueprint_id}.`,
        placementIds: [placementId],
        suggestedFix: "Add the blueprint or clear blueprint_id.",
      });
    }
    if (placement.dialogue_id && packageContext && !dialogueIds.has(placement.dialogue_id)) {
      addIssue({
        severity: "error",
        code: "DIALOGUE_REFERENCE_MISSING",
        message: `${placementId} references missing dialogue ${placement.dialogue_id}.`,
        placementIds: [placementId],
        suggestedFix: "Add the dialogue or clear dialogue_id.",
      });
    }
    const isDoor = isBuildingDoorPlacement(placement);
    if (placement.locked && !isDoor) {
      addIssue({
        severity: "error",
        code: "LOCK_UNSUPPORTED_OBJECT",
        message: `${placementId} declares a lock, but the ordinary runtime only treats door placements as keyed object gates.`,
        placementIds: [placementId],
        suggestedFix: "Use a door object, use ContainerPlacement for a keyed container, or clear the lock fields.",
      });
    }
    if (isDoor && placement.locked && !placement.key_item_id) {
      addIssue({
        severity: "error",
        code: "LOCK_KEY_MISSING",
        message: `${placementId} is locked but declares no key_item_id.`,
        placementIds: [placementId],
        suggestedFix: "Assign an existing key item or make the door unlocked.",
      });
    }
    if (placement.key_item_id && packageContext && !itemIds.has(placement.key_item_id)) {
      addIssue({
        severity: "error",
        code: "ITEM_REFERENCE_MISSING",
        message: `${placementId} requires missing key item ${placement.key_item_id}.`,
        placementIds: [placementId],
        suggestedFix: "Add the key item definition or select an existing key.",
      });
    }
  }
  for (const placement of map.entity_placements) {
    // Generated maps may place several actors from the same entity definition.
    // Their stable placement IDs are the authored identity; legacy placements
    // without IDs retain the historical one-per-entity validation behavior.
    const placementId = placement.id ?? `entity:${placement.entity_id}`;
    registerPlacementId(placementId, placementId);
    registerCoordinate(placement.cell, placementId, "ENTITY_PLACEMENT_OUT_OF_BOUNDS");
    if (packageContext && !entityIds.has(placement.entity_id)) {
      addIssue({
        severity: "error",
        code: "ENTITY_REFERENCE_MISSING",
        message: `${placementId} references a missing entity definition.`,
        placementIds: [placementId],
        suggestedFix: "Add the entity definition or remove the placement.",
      });
    }
    for (const entry of placement.schedule || []) {
      registerCoordinate(entry.cell, `${placementId}:schedule@${entry.hour}`, "SCHEDULE_CELL_OUT_OF_BOUNDS");
    }
  }
  for (const placement of map.item_placements) {
    registerPlacementId(placement.id, `item:${placement.id}`);
    registerCoordinate(placement.cell, placement.id, "ITEM_PLACEMENT_OUT_OF_BOUNDS");
    if (packageContext && !itemIds.has(placement.item_id)) {
      addIssue({
        severity: "error",
        code: "ITEM_REFERENCE_MISSING",
        message: `${placement.id} references missing item ${placement.item_id}.`,
        placementIds: [placement.id],
        suggestedFix: "Add the item definition or replace item_id.",
      });
    }
  }
  for (const container of map.container_placements) {
    registerPlacementId(container.id, `container:${container.id}`);
    registerCoordinate(container.cell, container.id, "CONTAINER_PLACEMENT_OUT_OF_BOUNDS");
    if (packageContext && !objectIds.has(container.object_id)) {
      addIssue({
        severity: "error",
        code: "OBJECT_REFERENCE_MISSING",
        message: `${container.id} references missing object ${container.object_id}.`,
        placementIds: [container.id],
        suggestedFix: "Add the container object definition or replace object_id.",
      });
    }
    if (container.blueprint_id && packageContext && !blueprintIds.has(container.blueprint_id)) {
      addIssue({
        severity: "error",
        code: "BLUEPRINT_REFERENCE_MISSING",
        message: `${container.id} references missing blueprint ${container.blueprint_id}.`,
        placementIds: [container.id],
        suggestedFix: "Add the blueprint or clear blueprint_id.",
      });
    }
    if (container.locked && !container.key_item_id) {
      addIssue({
        severity: "error",
        code: "LOCK_KEY_MISSING",
        message: `${container.id} is locked but declares no key_item_id.`,
        placementIds: [container.id],
        suggestedFix: "Assign an existing key item or make the container unlocked.",
      });
    }
    if (container.key_item_id && packageContext && !itemIds.has(container.key_item_id)) {
      addIssue({
        severity: "error",
        code: "ITEM_REFERENCE_MISSING",
        message: `${container.id} requires missing key item ${container.key_item_id}.`,
        placementIds: [container.id],
        suggestedFix: "Add the key item definition or select an existing key.",
      });
    }
    for (const entry of container.items) {
      if (packageContext && !itemIds.has(entry.item_id)) {
        addIssue({
          severity: "error",
          code: "ITEM_REFERENCE_MISSING",
          message: `${container.id} contains missing item ${entry.item_id}.`,
          placementIds: [container.id],
          suggestedFix: "Add the item definition or remove the invalid stack.",
        });
      }
    }
  }
  for (const trigger of map.triggers) {
    registerPlacementId(trigger.id, `trigger:${trigger.id}`);
    if ((trigger.type === "step" || trigger.type === "interact") && !trigger.cell) {
      addIssue({
        severity: "error",
        code: "TRIGGER_CELL_REQUIRED",
        message: `${trigger.id} is a ${trigger.type} trigger without an activation cell.`,
        placementIds: [trigger.id],
        suggestedFix: "Assign an in-bounds activation cell.",
      });
    }
    if (trigger.cell) registerCoordinate(trigger.cell, trigger.id, "TRIGGER_OUT_OF_BOUNDS");
    if (packageContext && !cutsceneIds.has(trigger.cutscene_id)) {
      addIssue({
        severity: "error",
        code: "CUTSCENE_REFERENCE_MISSING",
        message: `${trigger.id} references missing cutscene ${trigger.cutscene_id}.`,
        placementIds: [trigger.id],
        suggestedFix: "Add the cutscene or replace cutscene_id.",
      });
    }
  }
  for (const exit of map.exits) {
    const exitId = derivedExitId(exit);
    registerPlacementId(exitId, `exit:${exitId}`);
    registerCoordinate(exit.cell, exitId, "EXIT_OUT_OF_BOUNDS");
    const targetMap = mapById.get(exit.target_map_id);
    if (!targetMap) {
      addIssue({
        severity: "error",
        code: "EXIT_TARGET_MAP_MISSING",
        message: `${exitId} targets missing map ${exit.target_map_id}.`,
        placementIds: [exitId],
        suggestedFix: "Select an existing target map or create it before placing the exit.",
      });
      continue;
    }
    const targetSpawn = exit.target_spawn_id
      ? targetMap.spawns.find((spawn) => spawn.id === exit.target_spawn_id)
      : targetMap.spawns[0];
    if (!targetSpawn) {
      addIssue({
        severity: "error",
        code: "EXIT_TARGET_SPAWN_MISSING",
        message: `${exitId} has no valid spawn on target map ${targetMap.id}.`,
        placementIds: [exitId],
        suggestedFix: "Add the referenced spawn or select an existing target spawn.",
      });
    } else if (packageContext) {
      const targetNavigation = buildNavigation(targetMap, packageContext);
      if (!targetNavigation.strictSpawnCells.has(coordinateKey(targetSpawn.cell[0], targetSpawn.cell[1]))) {
        addIssue({
          severity: "error",
          code: "EXIT_TARGET_SPAWN_INVALID",
          message: `${targetMap.id}#${targetSpawn.id} cannot safely place the player footprint.`,
          cells: [targetSpawn.cell as GridCoordinate],
          placementIds: [exitId, targetSpawn.id],
          suggestedFix: "Move the target spawn onto an active, walkable, unoccupied macro cell.",
        });
      }
    }
  }

  for (const [id, owners] of placementIdOwners) {
    if (owners.length <= 1) continue;
    addIssue({
      severity: "error",
      code: "PLACEMENT_ID_DUPLICATE",
      message: `Placement identity ${id} is used ${owners.length} times.`,
      placementIds: owners,
      suggestedFix: "Assign unique stable IDs (or unique object origin/facing keys) within the map.",
    });
  }

  const primarySpawn =
    (options.primarySpawnId
      ? map.spawns.find((spawn) => spawn.id === options.primarySpawnId)
      : undefined) || map.spawns[0];
  if (!primarySpawn) {
    addIssue({
      severity: "error",
      code: "SPAWN_MISSING",
      message: "Map has no player spawn.",
      suggestedFix: "Add at least one spawn on a traversable macro cell.",
    });
  }
  for (const spawn of map.spawns) {
    if (!navigation.strictSpawnCells.has(coordinateKey(spawn.cell[0], spawn.cell[1]))) {
      addIssue({
        severity: "error",
        code: "SPAWN_FOOTPRINT_INVALID",
        message: `${spawn.id} cannot hold the player's 3x3 fine-cell footprint.`,
        cells: [spawn.cell as GridCoordinate],
        placementIds: [spawn.id],
        suggestedFix: "Use an active, walkable, unoccupied authored macro cell.",
      });
    }
  }

  const reached = walkFrom(navigation, primarySpawn?.cell as GridCoordinate | undefined);
  if (primarySpawn && reached.size === 0) {
    addIssue({
      severity: "error",
      code: "SPAWN_UNREACHABLE",
      message: `${primarySpawn.id} cannot enter the traversable map graph.`,
      cells: [primarySpawn.cell as GridCoordinate],
      placementIds: [primarySpawn.id],
      suggestedFix: "Clear the spawn footprint and connect it to walkable cells.",
    });
  }

  const requiredExitIds = new Set(options.requiredExitIds || []);
  for (const exit of map.exits) {
    const exitId = derivedExitId(exit);
    const required = requiredExitIds.size === 0 || requiredExitIds.has(exitId);
    if (required && !activationReachable(reached, exit.cell as GridCoordinate)) {
      addIssue({
        severity: "error",
        code: "EXIT_UNREACHABLE",
        message: `${exitId} is unreachable from ${primarySpawn?.id || "the primary spawn"}.`,
        cells: [exit.cell as GridCoordinate],
        placementIds: [exitId],
        suggestedFix: "Connect the exit cell with legal-width, legal-elevation traversal.",
      });
    }
  }
  for (const requiredId of requiredExitIds) {
    if (!map.exits.some((exit) => derivedExitId(exit) === requiredId)) {
      addIssue({
        severity: "error",
        code: "REQUIRED_EXIT_MISSING",
        message: `Required exit ${requiredId} is not present on the map.`,
        placementIds: [requiredId],
        suggestedFix: "Create the required exit or update the validation recipe.",
      });
    }
  }

  for (const trigger of map.triggers) {
    if (!trigger.cell || trigger.type === "on_load" || trigger.type === "switch_change") continue;
    if (!activationReachable(reached, trigger.cell as GridCoordinate, trigger.type === "interact")) {
      addIssue({
        severity: "error",
        code: "TRIGGER_UNREACHABLE",
        message: `${trigger.id} has no reachable activation cell.`,
        cells: [trigger.cell as GridCoordinate],
        placementIds: [trigger.id],
        suggestedFix: "Move the trigger or open a legal approach route.",
      });
    }
  }
  for (const required of options.requiredCells || []) {
    if (!activationReachable(reached, required.cell, required.interaction)) {
      addIssue({
        severity: "error",
        code: "REQUIRED_CELL_UNREACHABLE",
        message: `Required objective ${required.id} is unreachable.`,
        cells: [required.cell],
        placementIds: [required.id],
        suggestedFix: "Connect the objective to the primary traversal component.",
      });
    }
  }

  // Entity footprint validation and overlap. Authored actor centers expand to
  // one 3x3 fine block, so distinct integer macro cells do not overlap.
  for (const placement of map.entity_placements) {
    const key = coordinateKey(placement.cell[0], placement.cell[1]);
    if (!navigation.strictSpawnCells.has(key)) {
      addIssue({
        severity: "error",
        code: "ENTITY_FOOTPRINT_INVALID",
        message: `entity:${placement.entity_id} occupies a blocked or missing footprint.`,
        cells: [placement.cell as GridCoordinate],
        placementIds: [`entity:${placement.entity_id}`],
        suggestedFix: "Place the actor on an active, walkable, unoccupied macro cell.",
      });
    }
  }
  for (let left = 0; left < map.entity_placements.length; left += 1) {
    for (let right = left + 1; right < map.entity_placements.length; right += 1) {
      const a = map.entity_placements[left];
      const b = map.entity_placements[right];
      if (Math.abs(a.cell[0] - b.cell[0]) < 1 && Math.abs(a.cell[1] - b.cell[1]) < 1) {
        addIssue({
          severity: "error",
          code: "ENTITY_FOOTPRINT_OVERLAP",
          message: `${a.entity_id} and ${b.entity_id} have overlapping 3x3 fine-cell footprints.`,
          cells: [a.cell as GridCoordinate, b.cell as GridCoordinate],
          placementIds: [`entity:${a.entity_id}`, `entity:${b.entity_id}`],
          suggestedFix: "Move actor centers to distinct authored macro cells.",
        });
      }
    }
  }

  // Illegal collision overlap among ordinary blocking placements.
  const blockingPlacements: { id: string; cells: Set<string> }[] = [];
  for (const placement of map.custom_object_placements) {
    const object = navigation.objectById.get(placement.object_id);
    if (!placementHasCollision(placement, object)) continue;
    blockingPlacements.push({
      id: objectPlacementId(placement),
      cells: new Set(getMacroPlacementFootprint(placement, object).map(([x, z]) => coordinateKey(x, z))),
    });
  }
  for (const container of map.container_placements) {
    blockingPlacements.push({ id: container.id, cells: new Set([coordinateKey(container.cell[0], container.cell[1])]) });
  }
  for (let left = 0; left < blockingPlacements.length; left += 1) {
    for (let right = left + 1; right < blockingPlacements.length; right += 1) {
      const a = blockingPlacements[left];
      const b = blockingPlacements[right];
      const overlaps = [...a.cells].filter((key) => b.cells.has(key));
      if (overlaps.length === 0) continue;
      addIssue({
        severity: "error",
        code: "OBJECT_FOOTPRINT_OVERLAP",
        message: `${a.id} and ${b.id} occupy the same blocking footprint.`,
        cells: overlaps.map((key) => key.split(":").map(Number) as GridCoordinate),
        placementIds: [a.id, b.id],
        suggestedFix: "Separate blocking placements or explicitly make one non-colliding.",
      });
    }
  }

  // Doors require a floor/opening and one legal approach cell on each face.
  for (const door of map.custom_object_placements.filter(isBuildingDoorPlacement)) {
    const doorId = objectPlacementId(door);
    const doorKey = coordinateKey(door.cell[0], door.cell[1]);
    if (!navigation.baseTraversable.has(doorKey)) {
      addIssue({
        severity: "error",
        code: "DOOR_CELL_INVALID",
        message: `${doorId} is not attached to a walkable opening.`,
        cells: [door.cell as GridCoordinate],
        placementIds: [doorId],
        suggestedFix: "Place the door on an active walkable floor opening.",
      });
    }
    const [fx, fz] = Math.abs(door.facing[0]) >= Math.abs(door.facing[1])
      ? [Math.sign(door.facing[0]), 0]
      : [0, Math.sign(door.facing[1])];
    if ((fx === 0 && fz === 0) || Math.abs(fx) + Math.abs(fz) !== 1) {
      addIssue({
        severity: "error",
        code: "DOOR_FACING_INVALID",
        message: `${doorId} needs a cardinal facing to determine its approach faces.`,
        placementIds: [doorId],
        suggestedFix: "Use [1,0], [-1,0], [0,1], or [0,-1].",
      });
      continue;
    }
    const approaches: GridCoordinate[] = [
      [door.cell[0] + fx, door.cell[1] + fz],
      [door.cell[0] - fx, door.cell[1] - fz],
    ];
    if (approaches.some(([x, z]) => !navigation.traversable.has(coordinateKey(x, z)))) {
      addIssue({
        severity: "error",
        code: "DOOR_APPROACH_BLOCKED",
        message: `${doorId} lacks legal clearance on both faces.`,
        cells: [door.cell as GridCoordinate, ...approaches],
        placementIds: [doorId],
        suggestedFix: "Clear one authored macro cell on each side of the door.",
      });
    }
  }

  for (const container of map.container_placements) {
    const anchor = navigation.topByCoordinate.get(coordinateKey(container.cell[0], container.cell[1]));
    const hasApproach = DIRECTIONS.some(([dx, dz]) =>
      reached.has(coordinateKey(container.cell[0] + dx, container.cell[1] + dz)),
    );
    if (!anchor?.active || !anchor.walkable || !hasApproach) {
      addIssue({
        severity: "error",
        code: "CONTAINER_INACCESSIBLE",
        message: `${container.id} has no reachable cardinal interaction cell.`,
        cells: [container.cell as GridCoordinate],
        placementIds: [container.id],
        suggestedFix: "Put the container on floor and leave at least one reachable adjacent cell.",
      });
    }
  }

  for (const placement of map.custom_object_placements.filter((entry) => Boolean(entry.dialogue_id))) {
    const placementId = objectPlacementId(placement);
    if (!activationReachable(reached, placement.cell as GridCoordinate, true)) {
      addIssue({
        severity: "error",
        code: "INTERACTABLE_INACCESSIBLE",
        message: `${placementId} has dialogue but no reachable interaction cell.`,
        cells: [placement.cell as GridCoordinate],
        placementIds: [placementId],
        suggestedFix: "Leave a reachable cardinal approach cell.",
      });
    }
  }

  // Elevation and connectors that the current ordinary schema can express.
  for (const cell of navigation.topByCoordinate.values()) {
    if (!cell.walkable || !cell.active) continue;
    for (const [dx, dz] of [[1, 0], [0, 1]] as GridCoordinate[]) {
      const neighbor = navigation.topByCoordinate.get(coordinateKey(cell.x + dx, cell.z + dz));
      if (!neighbor?.active || !neighbor.walkable) continue;
      if (Math.abs(neighbor.visual_height - cell.visual_height) <= 1) continue;
      if (isStairCell(cell) || isStairCell(neighbor) || cell.portal_id || neighbor.portal_id) continue;
      addIssue({
        severity: "error",
        code: "ELEVATION_TRANSITION_ILLEGAL",
        message: `Adjacent walkable cells differ by more than one visual-height unit without a connector.`,
        cells: [[cell.x, cell.z], [neighbor.x, neighbor.z]],
        suggestedFix: "Add legal stair/ramp increments, a matched portal, or block the edge.",
      });
    }
  }

  const portalEndpoints = new Map<string, CellData[]>();
  for (const cell of navigation.topByCoordinate.values()) {
    if (!cell.portal_id) continue;
    const entries = portalEndpoints.get(cell.portal_id) || [];
    entries.push(cell);
    portalEndpoints.set(cell.portal_id, entries);
  }
  for (const [portalId, endpoints] of portalEndpoints) {
    if (endpoints.length < 2) {
      addIssue({
        severity: "error",
        code: "CONNECTOR_ENDPOINT_MISSING",
        message: `Portal ${portalId} has only one endpoint.`,
        cells: endpoints.map(cellCoordinate),
        placementIds: [`portal:${portalId}`],
        suggestedFix: "Author exactly two active portal cells with the same portal_id.",
      });
    } else if (endpoints.length > 2) {
      addIssue({
        severity: "warning",
        code: "CONNECTOR_ENDPOINT_AMBIGUOUS",
        message: `Portal ${portalId} has ${endpoints.length} endpoints.`,
        cells: endpoints.map(cellCoordinate),
        placementIds: [`portal:${portalId}`],
        suggestedFix: "Split the connector into deterministic endpoint pairs.",
      });
    }
    if (endpoints.some((cell) => !navigation.traversable.has(coordinateKey(cell.x, cell.z)))) {
      addIssue({
        severity: "error",
        code: "CONNECTOR_ENDPOINT_BLOCKED",
        message: `Portal ${portalId} terminates on a blocked cell.`,
        cells: endpoints.map(cellCoordinate),
        placementIds: [`portal:${portalId}`],
        suggestedFix: "Clear every connector endpoint footprint.",
      });
    }
  }

  for (const stair of [...navigation.topByCoordinate.values()].filter(isStairCell)) {
    const neighbors = DIRECTIONS.filter(([dx, dz]) =>
      navigation.traversable.has(coordinateKey(stair.x + dx, stair.z + dz)),
    );
    if (!navigation.traversable.has(coordinateKey(stair.x, stair.z)) || neighbors.length < 2) {
      addIssue({
        severity: "error",
        code: "STAIR_LANDING_BLOCKED",
        message: `Stair at (${stair.x}, ${stair.z}) lacks a clear landing and continuation.`,
        cells: [[stair.x, stair.z]],
        suggestedFix: "Make the stair walkable and leave at least two traversable cardinal landing cells.",
      });
    }
  }

  if (options.returnRouteRequired && packageContext) {
    for (const exit of map.exits) {
      const targetMap = mapById.get(exit.target_map_id);
      if (!targetMap || targetMap.id === map.id) continue;
      const targetSpawn = exit.target_spawn_id
        ? targetMap.spawns.find((spawn) => spawn.id === exit.target_spawn_id)
        : targetMap.spawns[0];
      const targetNavigation = buildNavigation(targetMap, packageContext);
      const targetReached = walkFrom(targetNavigation, targetSpawn?.cell as GridCoordinate | undefined);
      const hasReturn = targetMap.exits.some(
        (candidate) =>
          candidate.target_map_id === map.id &&
          activationReachable(targetReached, candidate.cell as GridCoordinate),
      );
      if (!hasReturn) {
        addIssue({
          severity: "error",
          code: "RETURN_ROUTE_MISSING",
          message: `${derivedExitId(exit)} has no reachable return exit on ${targetMap.id}.`,
          placementIds: [derivedExitId(exit)],
          suggestedFix: "Add a reachable return exit or explicitly validate the route as one-way.",
        });
      }
    }
  }

  // Progression over the ordinary schema's keyed doors and containers. The
  // geometry report above assumes doors can eventually open; this pass proves
  // that keys are obtainable in an order that actually makes that true.
  const lockedDoors = map.custom_object_placements.filter(
    (placement) => isBuildingDoorPlacement(placement) && placement.locked,
  );
  const progressionAllowed = new Set(navigation.traversable);
  for (const door of lockedDoors) {
    const object = navigation.objectById.get(door.object_id);
    for (const [x, z] of getMacroPlacementFootprint(door, object)) {
      progressionAllowed.delete(coordinateKey(x, z));
    }
  }
  const availableItems = new Set(options.initialItemIds || []);
  const acquisitionOrder: ProgressionAcquisition[] = [];
  const acquire = (itemId: string, sourcePlacementId: string) => {
    if (availableItems.has(itemId)) return false;
    availableItems.add(itemId);
    acquisitionOrder.push({ itemId, sourcePlacementId });
    return true;
  };
  const unlockedContainers = new Set<string>();
  const unlockedDoors = new Set<string>();
  let progressionReached = walkFrom(
    navigation,
    primarySpawn?.cell as GridCoordinate | undefined,
    progressionAllowed,
  );
  let progressionChanged = true;
  while (progressionChanged) {
    progressionChanged = false;
    for (const item of map.item_placements) {
      if (activationReachable(progressionReached, item.cell as GridCoordinate)) {
        if (acquire(item.item_id, item.id)) progressionChanged = true;
      }
    }
    for (const container of map.container_placements) {
      if (unlockedContainers.has(container.id)) continue;
      const accessible = DIRECTIONS.some(([dx, dz]) =>
        progressionReached.has(coordinateKey(container.cell[0] + dx, container.cell[1] + dz)),
      );
      if (!accessible) continue;
      if (container.locked && (!container.key_item_id || !availableItems.has(container.key_item_id))) continue;
      unlockedContainers.add(container.id);
      progressionChanged = true;
      for (const item of container.items) {
        if (acquire(item.item_id, container.id)) progressionChanged = true;
      }
    }
    for (const door of lockedDoors) {
      const doorId = objectPlacementId(door);
      if (unlockedDoors.has(doorId)) continue;
      if (!door.key_item_id || !availableItems.has(door.key_item_id)) continue;
      unlockedDoors.add(doorId);
      const object = navigation.objectById.get(door.object_id);
      for (const [x, z] of getMacroPlacementFootprint(door, object)) {
        const key = coordinateKey(x, z);
        if (navigation.traversable.has(key)) progressionAllowed.add(key);
      }
      progressionChanged = true;
    }
    if (progressionChanged) {
      progressionReached = walkFrom(
        navigation,
        primarySpawn?.cell as GridCoordinate | undefined,
        progressionAllowed,
      );
    }
  }

  const blockedContainers = map.container_placements.filter(
    (container) => container.locked && !unlockedContainers.has(container.id),
  );
  const blockedDoors = lockedDoors.filter((door) => !unlockedDoors.has(objectPlacementId(door)));
  const keySourcesFor = (keyItemId: string) => {
    const sources = map.item_placements
      .filter((item) => item.item_id === keyItemId)
      .map((item) => ({
        id: item.id,
        behindGate:
          activationReachable(reached, item.cell as GridCoordinate) &&
          !activationReachable(progressionReached, item.cell as GridCoordinate),
      }));
    for (const candidate of map.container_placements) {
      if (candidate.items.some((entry) => entry.item_id === keyItemId)) {
        sources.push({
          id: candidate.id,
          behindGate: !unlockedContainers.has(candidate.id),
        });
      }
    }
    return sources;
  };
  const reportBlockedLock = (lockId: string, keyItemId: string, keyInsideSelf = false) => {
    const keySources = keySourcesFor(keyItemId);
    if (keyInsideSelf || keySources.some((source) => source.behindGate)) {
      addIssue({
        severity: "error",
        code: "PROGRESSION_KEY_BEHIND_LOCK",
        message: `${lockId} requires ${keyItemId}, but the key is behind this lock or another unavailable gate.`,
        placementIds: [lockId, ...keySources.map((source) => source.id)],
        suggestedFix: "Place at least one copy of the key in an earlier reachable source.",
      });
    } else if (!availableItems.has(keyItemId)) {
      addIssue({
        severity: "error",
        code: "PROGRESSION_KEY_UNAVAILABLE",
        message: `${lockId} requires ${keyItemId}, but no reachable progression source grants it.`,
        placementIds: [lockId, ...keySources.map((source) => source.id)],
        suggestedFix: "Put the key on the reachable critical path before the lock.",
      });
    }
  };
  for (const container of blockedContainers) {
    if (!container.key_item_id) continue;
    reportBlockedLock(
      container.id,
      container.key_item_id,
      container.items.some((entry) => entry.item_id === container.key_item_id),
    );
  }
  for (const door of blockedDoors) {
    if (!door.key_item_id) continue;
    reportBlockedLock(objectPlacementId(door), door.key_item_id);
  }

  for (const target of [
    ...map.exits
      .filter((exit) => requiredExitIds.size === 0 || requiredExitIds.has(derivedExitId(exit)))
      .map((exit) => ({ id: derivedExitId(exit), cell: exit.cell as GridCoordinate, interaction: false })),
    ...(options.requiredCells || []).map((required) => ({
      id: required.id,
      cell: required.cell,
      interaction: Boolean(required.interaction),
    })),
  ]) {
    if (
      activationReachable(reached, target.cell, target.interaction) &&
      !activationReachable(progressionReached, target.cell, target.interaction)
    ) {
      addIssue({
        severity: "error",
        code: "PROGRESSION_REQUIRED_TARGET_BLOCKED",
        message: `Required target ${target.id} remains blocked after all obtainable keys are applied.`,
        cells: [target.cell],
        placementIds: [target.id, ...blockedDoors.map(objectPlacementId), ...blockedContainers.map((entry) => entry.id)],
        suggestedFix: "Move required keys before their gates or provide another supported route.",
      });
    }
  }
  const progression: ProgressionSummary | undefined =
    lockedDoors.length > 0 || map.container_placements.some((entry) => entry.locked)
    ? {
        lockedContainers: map.container_placements.filter((entry) => entry.locked).length,
        lockedDoors: lockedDoors.length,
        unlockedContainerIds: [...unlockedContainers].sort(),
        unlockedDoorIds: [...unlockedDoors].sort(),
        blockedContainerIds: blockedContainers.map((entry) => entry.id).sort(),
        blockedDoorIds: blockedDoors.map(objectPlacementId).sort(),
        availableItemIds: [...availableItems].sort(),
        acquisitionOrder,
      }
    : undefined;

  // Safe-start and critical-route hazard checks.
  const lethalCells = new Set<string>();
  for (const cell of navigation.topByCoordinate.values()) {
    if (isLethalCell(cell, options.lethalHazardTags || [])) lethalCells.add(coordinateKey(cell.x, cell.z));
  }
  const safeStartRadius = Math.max(0, Math.floor(options.safeStartRadius ?? 0));
  if (primarySpawn) {
    const unsafeNearStart = [...lethalCells]
      .map((key) => key.split(":").map(Number) as GridCoordinate)
      .filter(([x, z]) => Math.abs(x - primarySpawn.cell[0]) + Math.abs(z - primarySpawn.cell[1]) <= safeStartRadius);
    if (unsafeNearStart.length > 0) {
      addIssue({
        severity: "error",
        code: "HAZARD_SAFE_START_VIOLATION",
        message: `${primarySpawn.id} begins inside the configured lethal-hazard safe radius.`,
        cells: [primarySpawn.cell as GridCoordinate, ...unsafeNearStart],
        placementIds: [primarySpawn.id],
        suggestedFix: "Move or delay the hazard, or move the spawn to a safe staging area.",
      });
    }
  }
  const safeAllowed = new Set([...navigation.traversable].filter((key) => !lethalCells.has(key)));
  const safeReached = walkFrom(navigation, primarySpawn?.cell as GridCoordinate | undefined, safeAllowed);
  const criticalTargets: { id: string; cell: GridCoordinate; interaction?: boolean }[] = [
    ...map.exits
      .filter((exit) => requiredExitIds.size === 0 || requiredExitIds.has(derivedExitId(exit)))
      .map((exit) => ({ id: derivedExitId(exit), cell: exit.cell as GridCoordinate })),
    ...(options.requiredCells || []),
  ];
  for (const target of criticalTargets) {
    if (
      activationReachable(reached, target.cell, target.interaction) &&
      !activationReachable(safeReached, target.cell, target.interaction)
    ) {
      addIssue({
        severity: "error",
        code: "HAZARD_CRITICAL_ROUTE_LETHAL",
        message: `Every route to required target ${target.id} crosses a guaranteed lethal hazard.`,
        cells: [target.cell, ...[...lethalCells].map((key) => key.split(":").map(Number) as GridCoordinate)],
        placementIds: [target.id],
        suggestedFix: "Provide a safe alternate route or authored counterplay before the hazard.",
      });
    }
  }
  const requiredKeys = new Set(
    map.container_placements.filter((entry) => entry.locked && entry.key_item_id).map((entry) => entry.key_item_id!),
  );
  for (const keyItemId of requiredKeys) {
    const safeSources = map.item_placements.filter(
      (item) => item.item_id === keyItemId && activationReachable(safeReached, item.cell as GridCoordinate),
    );
    if (safeSources.length === 0 && map.item_placements.some((item) => item.item_id === keyItemId)) {
      addIssue({
        severity: "error",
        code: "HAZARD_REQUIRED_KEY_AT_RISK",
        message: `Every ground source of required key ${keyItemId} is on an unsafe route.`,
        placementIds: map.item_placements.filter((item) => item.item_id === keyItemId).map((item) => item.id),
        suggestedFix: "Move one key source before the hazard or provide non-lethal counterplay.",
      });
    }
  }

  const regionIds = new Set<string>([
    ...(map.regions || []).map((region) => region.id),
    ...map.cells.map((cell) => cell.region_id).filter((id): id is string => Boolean(id)),
  ]);
  const regions: RegionReachability[] = [...regionIds]
    .sort()
    .map((regionId) => {
      const cells = [...navigation.topByCoordinate.values()].filter((cell) => cell.region_id === regionId);
      const traversableCells = cells.filter((cell) => navigation.traversable.has(coordinateKey(cell.x, cell.z)));
      const reachableCells = traversableCells.filter((cell) => reached.has(coordinateKey(cell.x, cell.z)));
      return {
        regionId,
        totalCells: cells.length,
        traversableCells: traversableCells.length,
        reachableCells: reachableCells.length,
        reachable: reachableCells.length > 0 && reachableCells.length === traversableCells.length,
      };
    });
  for (const requiredRegionId of options.requiredRegionIds || []) {
    const summary = regions.find((region) => region.regionId === requiredRegionId);
    if (!summary || summary.traversableCells === 0 || summary.reachableCells !== summary.traversableCells) {
      addIssue({
        severity: "error",
        code: "REQUIRED_REGION_UNREACHABLE",
        message: `Required region ${requiredRegionId} is missing or not wholly connected to the primary spawn.`,
        placementIds: [`region:${requiredRegionId}`],
        suggestedFix: "Connect every traversable cell in the required region to the primary component.",
      });
    }
  }

  const entityById = new Map((packageContext?.entities || []).map((entity) => [entity.id, entity]));
  const spriteById = new Map((packageContext?.sprite_library || []).map((sprite) => [sprite.id, sprite]));
  const animatedGifActors = map.entity_placements.filter((placement) => {
    const spriteId = entityById.get(placement.entity_id)?.sprite_id;
    const sprite = spriteId ? spriteById.get(spriteId) : undefined;
    return Boolean(sprite?.animated || /(?:\.gif(?:$|[?#])|data:image\/gif)/i.test(sprite?.data_url || ""));
  }).length;
  const roomIds = new Set(map.cells.map((cell) => cell.room_id).filter((id): id is string => Boolean(id)));
  const activeChemistrySeedCells = map.cells.filter(
    (cell) =>
      cell.surface_tag !== "none" ||
      Boolean(cell.hazard) ||
      Boolean(cell.infection) ||
      Boolean(cell.initial_chemistry) ||
      Boolean(cell.simulation?.condition_tags.length),
  ).length;
  const macroCells = map.width * map.height;
  const metrics: Record<string, number> = {
    macroCells,
    authoredCells: map.cells.length,
    activeCells: [...navigation.topByCoordinate.values()].filter((cell) => cell.active).length,
    fineCells: macroCells * 9,
    rooms: roomIds.size,
    entityPlacements: map.entity_placements.length,
    objectPlacements: map.custom_object_placements.length + map.container_placements.length,
    itemPlacements: map.item_placements.length,
    activeChemistrySeedCells,
    persistentTriggersAndExits: map.triggers.length + map.exits.length,
    animatedGifActors,
    estimatedSerializedMapBytes: jsonByteLength(map),
    traversableCells: navigation.traversable.size,
    reachableCells: reached.size,
    lethalHazardCells: lethalCells.size,
    lockedContainers: map.container_placements.filter((entry) => entry.locked).length,
    lockedDoors: lockedDoors.length,
  };

  const budgets = mergeBudgets(options.budgets);
  for (const metric of Object.keys(budgets) as (keyof MapPerformanceBudgets)[]) {
    const value = metrics[metric];
    const budget = budgets[metric];
    const codeBase = metricBudgetCodes[metric];
    if (value > budget.hard) {
      addIssue({
        severity: "error",
        code: `PERFORMANCE_${codeBase}_HARD_LIMIT`,
        message: `${metric} is ${value}, above the hard limit of ${budget.hard}.`,
        suggestedFix: "Reduce generated content or require an explicit reviewed budget override.",
      });
    } else if (value > budget.soft) {
      addIssue({
        severity: "warning",
        code: `PERFORMANCE_${codeBase}_SOFT_LIMIT`,
        message: `${metric} is ${value}, above the soft target of ${budget.soft}.`,
        suggestedFix: "Profile the map and reduce this metric where practical.",
      });
    }
  }

  const reachableRegions: ReachabilitySummary = {
    primarySpawnId: primarySpawn?.id,
    traversableCells: navigation.traversable.size,
    reachableCells: reached.size,
    unreachableCells: Math.max(0, navigation.traversable.size - reached.size),
    connectedComponents: countComponents(navigation),
    regions,
  };

  issues.sort(stableIssueSort);
  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    metrics,
    reachableRegions,
    progression,
  };
}

export const validationIssueCodes = (report: MapValidationReport) =>
  new Set(report.issues.map((issue) => issue.code));
