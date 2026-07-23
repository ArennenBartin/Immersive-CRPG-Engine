import type { GamePackage, MapData } from "../schema/game";
import type {
  DungeonGenerationResult,
  DungeonRecipeDef,
  EmbeddedDungeon,
} from "./types";
import { INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID } from "./presets/institutionalRuin";

export const SINGLE_MAP_QUALITY_RECIPE_ID = INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID;

export interface DungeonQualityMetrics {
  mapCount: number;
  roomCount: number;
  edgeCount: number;
  doorCount: number;
  nonOpenEdgeCount: number;
  gateCount: number;
  secretCount: number;
  exitCount: number;
  transitionCount: number;
  lanternCount: number;
  lanternDistanceFromSpawn: number | null;
  entranceToCulminationPathLength: number | null;
  maximumCorridorLength: number;
  maximumCorridorTurns: number;
  loopLength: number;
  silhouetteVariety: number;
  minimumLandmarkSeparation: number | null;
  estimatedFineCellCount: number;
  actorCount: number;
  initialActiveChemistryCellCount: number;
}

export interface DungeonQualityCheck {
  code: string;
  label: string;
  passed: boolean;
  actual: string;
  expected: string;
}

export interface DungeonQualityReport {
  recipeId: string;
  thresholdsEnforced: boolean;
  ready: boolean;
  metrics: DungeonQualityMetrics;
  checks: DungeonQualityCheck[];
}

type Coord = readonly [number, number];

const asCoord = (cell: readonly unknown[]): Coord => [Number(cell[0]), Number(cell[1])];
const cellKey = (cell: Coord) => `${cell[0]}:${cell[1]}`;
const manhattan = (left: Coord, right: Coord) =>
  Math.abs(left[0] - right[0]) + Math.abs(left[1] - right[1]);

const CARDINAL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

interface PathMeasurement {
  length: number;
  turns: number;
}

const nearestAllowedCell = (
  requested: Coord,
  allowed: ReadonlyMap<string, Coord>,
): Coord | undefined => [...allowed.values()].sort((left, right) =>
  manhattan(left, requested) - manhattan(right, requested) ||
  left[1] - right[1] || left[0] - right[0])[0];

const shortestPath = (
  allowedCells: readonly Coord[],
  requestedStart: Coord,
  requestedGoal: Coord,
): PathMeasurement | undefined => {
  const allowed = new Map(allowedCells.map((cell) => [cellKey(cell), cell]));
  if (!allowed.size) return undefined;
  const start = allowed.get(cellKey(requestedStart)) ?? nearestAllowedCell(requestedStart, allowed);
  const goal = allowed.get(cellKey(requestedGoal)) ?? nearestAllowedCell(requestedGoal, allowed);
  if (!start || !goal) return undefined;
  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  const queue: string[] = [startKey];
  const previous = new Map<string, { key: string; direction: number }>();
  const reached = new Set<string>([startKey]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const currentKey = queue[cursor];
    if (currentKey === goalKey) break;
    const current = allowed.get(currentKey)!;
    CARDINAL_DIRECTIONS.forEach(([dx, dz], direction) => {
      const nextKey = cellKey([current[0] + dx, current[1] + dz]);
      if (!allowed.has(nextKey) || reached.has(nextKey)) return;
      reached.add(nextKey);
      previous.set(nextKey, { key: currentKey, direction });
      queue.push(nextKey);
    });
  }
  if (!reached.has(goalKey)) return undefined;
  const directions: number[] = [];
  let currentKey = goalKey;
  while (currentKey !== startKey) {
    const step = previous.get(currentKey);
    if (!step) return undefined;
    directions.push(step.direction);
    currentKey = step.key;
  }
  directions.reverse();
  let turns = 0;
  for (let index = 1; index < directions.length; index += 1) {
    if (directions[index] !== directions[index - 1]) turns += 1;
  }
  return { length: directions.length, turns };
};

const roomCenter = (
  embedded: EmbeddedDungeon,
  nodeId: string,
): readonly [number, number] | undefined => {
  const room = embedded.rooms.find((candidate) => candidate.nodeId === nodeId);
  return room
    ? [room.bounds.x + Math.floor(room.bounds.width / 2), room.bounds.z + Math.floor(room.bounds.depth / 2)]
    : undefined;
};

const mapForNode = (
  embedded: EmbeddedDungeon,
  nodeId: string,
  maps: readonly MapData[],
) => {
  const mapId = embedded.rooms.find((room) => room.nodeId === nodeId)?.mapId;
  return maps.find((map) => map.id === mapId);
};

const measureEntranceToCulmination = (
  result: DungeonGenerationResult,
): number | null => {
  if (!result.graph || !result.embedded) return null;
  const entranceMap = mapForNode(result.embedded, result.graph.entranceNodeId, result.maps);
  const objectiveMap = mapForNode(result.embedded, result.graph.objectiveNodeId, result.maps);
  if (!entranceMap || entranceMap.id !== objectiveMap?.id) return null;
  const entranceCenter = roomCenter(result.embedded, result.graph.entranceNodeId);
  const objectiveCenter = roomCenter(result.embedded, result.graph.objectiveNodeId);
  const start = entranceMap.spawns[0]?.cell ? asCoord(entranceMap.spawns[0].cell) : entranceCenter;
  if (!start || !objectiveCenter) return null;
  const path = shortestPath(
    entranceMap.cells.filter((cell) => cell.walkable).map((cell): Coord => [cell.x, cell.z]),
    start,
    objectiveCenter,
  );
  return path?.length ?? null;
};

const measureCorridors = (
  result: DungeonGenerationResult,
): { maximumLength: number; maximumTurns: number; loopLength: number } => {
  if (!result.graph || !result.embedded) return { maximumLength: 0, maximumTurns: 0, loopLength: 0 };
  const edges = new Map(result.graph.edges.map((edge) => [edge.id, edge]));
  let maximumLength = 0;
  let maximumTurns = 0;
  let loopLength = 0;
  for (const corridor of result.embedded.corridors) {
    const edge = edges.get(corridor.edgeId);
    if (!edge) continue;
    const from = roomCenter(result.embedded, edge.fromNodeId);
    const to = roomCenter(result.embedded, edge.toNodeId);
    if (!from || !to) continue;
    const path = shortestPath(corridor.cells, from, to);
    if (!path) continue;
    maximumLength = Math.max(maximumLength, path.length);
    maximumTurns = Math.max(maximumTurns, path.turns);
    if (edge.tags.includes("loop")) loopLength = Math.max(loopLength, path.length);
  }
  return { maximumLength, maximumTurns, loopLength };
};

const measureLandmarks = (
  gamePackage: GamePackage,
  result: DungeonGenerationResult,
): number | null => {
  const points = result.maps.flatMap((map) => (map.generation_sockets ?? [])
    .filter((socket) => socket.kind === "landmark")
    .map((socket) => ({ mapId: map.id, cell: asCoord(socket.cell) })));
  if (points.length < 2 && result.graph && result.embedded) {
    points.length = 0;
    const landmarkArchetypes = new Set(gamePackage.dungeon_room_archetypes
      .filter((archetype) => archetype.tags.includes("landmark"))
      .map((archetype) => archetype.id));
    for (const node of result.graph.nodes.filter((candidate) =>
      candidate.tags.includes("landmark") || landmarkArchetypes.has(candidate.archetypeId))) {
      const room = result.embedded.rooms.find((candidate) => candidate.nodeId === node.id);
      const center = roomCenter(result.embedded, node.id);
      if (room && center) points.push({ mapId: room.mapId, cell: center });
    }
  }
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      if (points[left].mapId !== points[right].mapId) continue;
      minimum = Math.min(minimum, manhattan(points[left].cell, points[right].cell));
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
};

const startingLightItemId = (recipe: DungeonRecipeDef) =>
  (recipe.population as DungeonRecipeDef["population"] & { startingLightItemId?: string }).startingLightItemId;

const measureLanterns = (
  recipe: DungeonRecipeDef,
  gamePackage: GamePackage,
  maps: readonly MapData[],
): { count: number; distance: number | null } => {
  const requiredId = startingLightItemId(recipe);
  const qualifyingItems = new Set(gamePackage.items.filter((item) =>
    item.light_source?.active_by_default &&
    item.light_source.mobility !== "fixed" &&
    (!requiredId || item.id === requiredId)).map((item) => item.id));
  const placements = maps.flatMap((map) => map.item_placements
    .filter((placement) => qualifyingItems.has(placement.item_id))
    .map((placement) => ({ map, placement })));
  let distance = Number.POSITIVE_INFINITY;
  placements.forEach(({ map, placement }) => {
    map.spawns.forEach((spawn) => {
      distance = Math.min(distance, manhattan(asCoord(spawn.cell), asCoord(placement.cell)));
    });
  });
  return {
    count: placements.length,
    distance: Number.isFinite(distance) ? distance : null,
  };
};

const measureDoorPlacements = (
  recipe: DungeonRecipeDef,
  gamePackage: GamePackage,
  maps: readonly MapData[],
) => {
  const themeDoorId = gamePackage.dungeon_themes.find((theme) => theme.id === recipe.themeId)
    ?.architecture.doorObjectId;
  const doorObjectIds = new Set(gamePackage.object_library.filter((object) =>
    object.tags.includes("door") || object.id === themeDoorId).map((object) => object.id));
  if (themeDoorId) doorObjectIds.add(themeDoorId);
  return maps.reduce((count, map) => count + map.custom_object_placements.filter((placement) =>
    doorObjectIds.has(placement.object_id)).length, 0);
};

const check = (
  code: string,
  label: string,
  passed: boolean,
  actual: string | number,
  expected: string,
): DungeonQualityCheck => ({ code, label, passed, actual: String(actual), expected });

export const evaluateDungeonQuality = ({
  recipe,
  gamePackage,
  result,
}: {
  recipe: DungeonRecipeDef;
  gamePackage: GamePackage;
  result: DungeonGenerationResult;
}): DungeonQualityReport => {
  const corridor = measureCorridors(result);
  const lantern = measureLanterns(recipe, gamePackage, result.maps);
  const nonOpenEdgeCount = result.graph?.edges.filter((edge) => edge.kind !== "open").length ?? 0;
  const metrics: DungeonQualityMetrics = {
    mapCount: result.maps.length,
    roomCount: result.graph?.nodes.length ?? result.embedded?.rooms.length ?? 0,
    edgeCount: result.graph?.edges.length ?? 0,
    doorCount: measureDoorPlacements(recipe, gamePackage, result.maps),
    nonOpenEdgeCount,
    gateCount: result.graph?.gates.length ?? 0,
    secretCount: (result.graph?.nodes.filter((node) => node.secret).length ?? 0) +
      (result.graph?.edges.filter((edge) => edge.kind === "secret" || edge.tags.includes("secret")).length ?? 0),
    exitCount: result.maps.reduce((sum, map) => sum + map.exits.length, 0),
    transitionCount: result.embedded?.transitions.length ?? 0,
    lanternCount: lantern.count,
    lanternDistanceFromSpawn: lantern.distance,
    entranceToCulminationPathLength: measureEntranceToCulmination(result),
    maximumCorridorLength: corridor.maximumLength,
    maximumCorridorTurns: corridor.maximumTurns,
    loopLength: corridor.loopLength,
    silhouetteVariety: new Set((result.embedded?.rooms ?? []).map((room) =>
      room.templateId ? `template:${room.templateId}` : `builder:${room.builderId ?? "unknown"}`)).size,
    minimumLandmarkSeparation: measureLandmarks(gamePackage, result),
    estimatedFineCellCount: result.metrics.estimatedFineCellCount,
    actorCount: result.maps.reduce((sum, map) => sum + map.entity_placements.length, 0),
    initialActiveChemistryCellCount: result.maps.reduce((sum, map) =>
      sum + map.cells.filter((cell) => Boolean(cell.initial_chemistry)).length, 0),
  };
  const thresholdsEnforced = recipe.id === SINGLE_MAP_QUALITY_RECIPE_ID || (
    recipe.outputMode === "single_map" &&
    recipe.architecture.connectionMode === "open_only" &&
    recipe.architecture.layoutStyle === "directional_crawl"
  );
  const checks = thresholdsEnforced ? [
    check("DNG_QUALITY_MAP_COUNT", "One generated dungeon map", metrics.mapCount === 1, metrics.mapCount, "exactly 1"),
    check("DNG_QUALITY_OPEN_CONNECTIONS", "All graph connections are open", metrics.nonOpenEdgeCount === 0, metrics.nonOpenEdgeCount, "0 non-open edges"),
    check("DNG_QUALITY_GATE_COUNT", "No gates or locks", metrics.gateCount === 0, metrics.gateCount, "0"),
    check("DNG_QUALITY_SECRET_COUNT", "No secret topology", metrics.secretCount === 0, metrics.secretCount, "0"),
    check("DNG_QUALITY_DOOR_COUNT", "No physical doors", metrics.doorCount === 0, metrics.doorCount, "0"),
    check("DNG_QUALITY_VERTICAL_TRANSITIONS", "No vertical transitions", metrics.transitionCount === 0, metrics.transitionCount, "0"),
    check("DNG_QUALITY_STARTING_LANTERN", "One starting lantern", metrics.lanternCount === 1, metrics.lanternCount, "exactly 1"),
    check(
      "DNG_QUALITY_LANTERN_DISTANCE",
      "Lantern is beside the spawn",
      metrics.lanternDistanceFromSpawn !== null && metrics.lanternDistanceFromSpawn <= 2,
      metrics.lanternDistanceFromSpawn ?? "unreachable",
      "Manhattan distance ≤ 2",
    ),
    check(
      "DNG_QUALITY_CRITICAL_ROUTE",
      "Entrance-to-culmination route",
      metrics.entranceToCulminationPathLength !== null && metrics.entranceToCulminationPathLength >= 30,
      metrics.entranceToCulminationPathLength ?? "unreachable",
      "at least 30 macro steps",
    ),
    check("DNG_QUALITY_CORRIDOR_LENGTH", "Maximum corridor length", metrics.maximumCorridorLength <= 28, metrics.maximumCorridorLength, "≤ 28"),
    check("DNG_QUALITY_SILHOUETTES", "Room silhouette variety", metrics.silhouetteVariety >= 3, metrics.silhouetteVariety, "at least 3"),
    check("DNG_QUALITY_FINE_CELL_BUDGET", "Estimated fine-cell budget", metrics.estimatedFineCellCount <= 15_000, metrics.estimatedFineCellCount, "≤ 15,000"),
  ] : [];
  return {
    recipeId: recipe.id,
    thresholdsEnforced,
    ready: checks.every((entry) => entry.passed),
    metrics,
    checks,
  };
};
