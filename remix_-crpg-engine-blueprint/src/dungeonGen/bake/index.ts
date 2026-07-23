import { buildMap, type IdentifiedEntityPlacement, type IdentifiedMapExit, type IdentifiedObjectPlacement } from "../../generation-facing/mapContract";
import { DeterministicIdAllocator, generatedIdNamespace } from "../../generation-facing/deterministicIds";
import type {
  CellData,
  ContainerPlacementData,
  MapData,
  TriggerData,
  WorldItemPlacementData,
} from "../../schema/game";
import type { DungeonDiagnostic, DungeonRecipeDef, DungeonThemeProfileDef } from "../types";
import { dungeonDiagnostic, failedStage, successfulStage, type DungeonStageOutput } from "../diagnostics";
import type { DungeonSpatialResult } from "../embedding";
import { compareMacroCells, macroCellKey, centeredMacroBounds, macroCellInBounds, type MacroCell } from "../embedding/gridSearch";
import { dungeonPrimarySpawnCell, type DungeonPopulationResult } from "../population";

export interface DungeonBakeInput {
  recipe: DungeonRecipeDef;
  spatial: DungeonSpatialResult;
  population: DungeonPopulationResult;
  theme: DungeonThemeProfileDef;
  contentLibraryHash: string;
  generatedAt: string;
  attemptIndex: number;
  canonicalResultHash?: string;
  shouldCancel?: () => boolean;
}

export interface DungeonBakeResult {
  maps: MapData[];
  primarySpawnIds: Record<string, string>;
  objectiveCells: Record<string, MacroCell>;
}

const directions: readonly MacroCell[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const roomCenterCell = (spatial: DungeonSpatialResult, nodeId: string): MacroCell => {
  const walkable = spatial.roomGeometry[nodeId]?.cells.filter((entry) => entry.walkable).map((entry) => entry.cell) ?? [];
  if (!walkable.length) return [0, 0];
  const room = spatial.embedded.rooms.find((entry) => entry.nodeId === nodeId);
  const center: MacroCell = room
    ? [room.bounds.x + Math.floor(room.bounds.width / 2), room.bounds.z + Math.floor(room.bounds.depth / 2)]
    : walkable[0];
  return [...walkable].sort((left, right) =>
    Math.abs(left[0] - center[0]) + Math.abs(left[1] - center[1]) -
      (Math.abs(right[0] - center[0]) + Math.abs(right[1] - center[1])) || compareMacroCells(left, right))[0];
};

const baseCellsForFloor = (
  input: DungeonBakeInput,
  mapId: string,
): Map<string, CellData> => {
  const floor = input.spatial.embedded.maps.find((entry) => entry.mapId === mapId)!;
  const cells = new Map<string, CellData>();
  for (const geometry of Object.values(input.spatial.roomGeometry).filter((entry) => entry.mapId === mapId)) {
    for (const entry of geometry.cells) cells.set(macroCellKey(entry.cell), {
      x: entry.cell[0], y: 0, z: entry.cell[1], active: true, walkable: entry.walkable,
      blocks_los: !entry.walkable, height: entry.height, visual_height: entry.visualHeight,
      terrain: entry.terrain ?? (entry.walkable ? input.theme.architecture.floorTerrain : input.theme.architecture.wallTerrain),
      object_id: entry.objectId ?? (entry.walkable ? input.theme.architecture.floorObjectId : input.theme.architecture.wallObjectId),
      room_id: geometry.nodeId, tag: entry.tag, surface_tag: entry.surfaceTag,
    });
  }
  for (const corridor of input.spatial.embedded.corridors.filter((entry) => entry.mapId === mapId)) {
    for (const cell of corridor.cells) cells.set(macroCellKey(cell), {
      x: cell[0], y: 0, z: cell[1], active: true, walkable: true, blocks_los: false,
      height: 0, visual_height: 0, terrain: input.theme.architecture.floorTerrain,
      object_id: input.theme.architecture.floorObjectId, tag: "corridor", surface_tag: "none",
    });
  }
  const bounds = centeredMacroBounds(floor.width, floor.depth);
  const walkable = [...cells.values()].filter((cell) => cell.walkable).map((cell): MacroCell => [cell.x, cell.z]);
  for (const cell of walkable) for (const [dx, dz] of directions) {
    const boundary: MacroCell = [cell[0] + dx, cell[1] + dz];
    if (!macroCellInBounds(boundary, bounds) || cells.has(macroCellKey(boundary))) continue;
    cells.set(macroCellKey(boundary), {
      x: boundary[0], y: 0, z: boundary[1], active: true, walkable: false, blocks_los: true,
      height: 3, visual_height: 3.6, terrain: input.theme.architecture.wallTerrain,
      object_id: input.theme.architecture.wallObjectId, tag: "boundary", surface_tag: "none",
    });
  }
  for (const mutation of input.population.maps[mapId]?.cellMutations ?? []) {
    const key = macroCellKey(mutation.cell);
    const cell = cells.get(key);
    if (cell?.walkable) cells.set(key, {
      ...cell, surface_tag: mutation.surfaceTag ?? cell.surface_tag,
      hazard: mutation.hazard, initial_chemistry: mutation.initialChemistry,
    });
  }
  return cells;
};

const socketFacing = (input: DungeonBakeInput, edgeId: string, cell: MacroCell): MacroCell => {
  const edge = input.spatial.graph.edges.find((entry) => entry.id === edgeId);
  const room = edge ? input.spatial.embedded.rooms.find((entry) => entry.nodeId === edge.fromNodeId) : undefined;
  return room?.sockets.find((socket) => macroCellKey(socket.cell) === macroCellKey(cell))?.facing ?? [1, 0];
};

const chooseDoorCell = (
  input: DungeonBakeInput,
  edgeId: string,
  cells: ReadonlyMap<string, CellData>,
  used: Set<string>,
): { cell: MacroCell; facing: MacroCell } | undefined => {
  const sockets = input.spatial.edgeSockets[edgeId];
  if (!sockets) return undefined;
  const corridor = input.spatial.embedded.corridors.find((entry) => entry.edgeId === edgeId);
  const candidates = [sockets.from, sockets.to, ...(corridor?.cells ?? [])]
    .filter((cell, index, values) => values.findIndex((candidate) => macroCellKey(candidate) === macroCellKey(cell)) === index);
  for (const cell of candidates) {
    if (used.has(macroCellKey(cell)) || !cells.get(macroCellKey(cell))?.walkable) continue;
    const socketDirection = macroCellKey(cell) === macroCellKey(sockets.from)
      ? socketFacing(input, edgeId, sockets.from)
      : macroCellKey(cell) === macroCellKey(sockets.to)
        ? (input.spatial.embedded.rooms.find((room) => room.nodeId === input.spatial.graph.edges.find((edge) => edge.id === edgeId)?.toNodeId)
          ?.sockets.find((socket) => macroCellKey(socket.cell) === macroCellKey(sockets.to))?.facing ?? [1, 0])
        : undefined;
    const facings: MacroCell[] = socketDirection ? [socketDirection] : [[1, 0], [0, 1]];
    const facing = facings.find(([fx, fz]) =>
      cells.get(macroCellKey([cell[0] + fx, cell[1] + fz]))?.walkable &&
      cells.get(macroCellKey([cell[0] - fx, cell[1] - fz]))?.walkable);
    if (facing) {
      used.add(macroCellKey(cell));
      return { cell: [...cell], facing: [...facing] };
    }
  }
  return undefined;
};

const nearestFreeWalkable = (
  cells: ReadonlyMap<string, CellData>,
  requested: readonly number[],
  blocked: Set<string>,
): MacroCell | undefined => [...cells.values()]
  .filter((cell) => cell.walkable && !blocked.has(macroCellKey([cell.x, cell.z])))
  .map((cell): MacroCell => [cell.x, cell.z])
  .sort((left, right) =>
    Math.abs(left[0] - Number(requested[0])) + Math.abs(left[1] - Number(requested[1])) -
      (Math.abs(right[0] - Number(requested[0])) + Math.abs(right[1] - Number(requested[1]))) || compareMacroCells(left, right))[0];

const transitionArrivalCell = (
  input: DungeonBakeInput,
  transition: DungeonSpatialResult["embedded"]["transitions"][number],
): MacroCell => {
  const edge = input.spatial.graph.edges.find((candidate) => candidate.id === transition.edgeId);
  if (!edge) return [...transition.fromCell];
  const sourceNodeId = [edge.fromNodeId, edge.toNodeId].find((nodeId) =>
    input.spatial.embedded.rooms.find((room) => room.nodeId === nodeId)?.mapId === transition.fromMapId);
  return sourceNodeId ? roomCenterCell(input.spatial, sourceNodeId) : [...transition.fromCell];
};

export const bakeDungeonMaps = (
  input: DungeonBakeInput,
): DungeonStageOutput<DungeonBakeResult> => {
  if (input.shouldCancel?.()) return failedStage([dungeonDiagnostic(
    "fatal", "bake", "DNG_GENERATION_CANCELED", "Dungeon bake was canceled.",
  )]);
  const diagnostics: DungeonDiagnostic[] = [];
  if (input.recipe.architecture.connectionMode === "open_only") {
    const blockedConnections = input.spatial.graph.edges.filter((edge) =>
      edge.kind === "door" || edge.kind === "locked" || edge.kind === "secret");
    if (blockedConnections.length) diagnostics.push(dungeonDiagnostic(
      "fatal", "infrastructure", "DNG_OPEN_ONLY_CONNECTION_VIOLATION",
      `Open-only recipe ${input.recipe.id} produced ${blockedConnections.length} door, locked, or secret connection(s).`,
      { relatedIds: blockedConnections.map((edge) => edge.id) },
    ));
  }
  const allocators = new Map<string, DeterministicIdAllocator>();
  for (const floor of input.spatial.embedded.maps) {
    const existingEntityIds = (input.population.maps[floor.mapId]?.entities ?? []).flatMap((entry) => entry.id ? [entry.id] : []);
    allocators.set(floor.mapId, new DeterministicIdAllocator({ mapId: floor.mapId, reservedIds: existingEntityIds }));
  }
  const spawnIdsByTransition = new Map<string, string>();
  const primarySpawnIds: Record<string, string> = {};
  const spawnsByMap = new Map<string, MapData["spawns"]>();
  for (const floor of input.spatial.embedded.maps) {
    const allocator = allocators.get(floor.mapId)!;
    const spawns: MapData["spawns"] = [];
    const entrance = input.spatial.graph.nodes.find((node) => node.id === input.spatial.graph.entranceNodeId && node.floorHint === floor.floorIndex);
    if (entrance) {
      const id = allocator.semantic("spawn", "primary");
      primarySpawnIds[floor.mapId] = id;
      spawns.push({
        id,
        cell: dungeonPrimarySpawnCell(input.spatial, entrance.id) ?? roomCenterCell(input.spatial, entrance.id),
        facing: [0, 1],
      });
    }
    for (const transition of input.spatial.embedded.transitions.filter((entry) => entry.fromMapId === floor.mapId)) {
      const id = allocator.semantic("spawn", `transition-${transition.id}`);
      spawnIdsByTransition.set(transition.id, id);
      // The exit remains on the authored transition socket, while arrivals
      // land on a clear interior cell. A room socket may also host a normal
      // door/corridor edge, so spawning directly on it can place the player
      // inside a closed door and cause immediate bounce-back travel.
      spawns.push({ id, cell: transitionArrivalCell(input, transition), facing: [0, 1] });
    }
    if (!spawns.length) {
      const nodeId = floor.nodeIds[0];
      const id = allocator.semantic("spawn", "fallback");
      primarySpawnIds[floor.mapId] = id;
      spawns.push({ id, cell: roomCenterCell(input.spatial, nodeId), facing: [0, 1] });
    } else if (!primarySpawnIds[floor.mapId]) primarySpawnIds[floor.mapId] = spawns[0].id;
    spawnsByMap.set(floor.mapId, spawns);
  }

  const maps: MapData[] = [];
  const objectiveCells: Record<string, MacroCell> = {};
  for (const floor of input.spatial.embedded.maps) {
    const allocator = allocators.get(floor.mapId)!;
    const cells = baseCellsForFloor(input, floor.mapId);
    const population = input.population.maps[floor.mapId];
    // Spawns are infrastructure, not decoration candidates. In particular a
    // vertical landing socket is both a transition spawn and a plausible
    // same-floor door threshold; reserve every spawn before choosing doors so
    // a door cannot make its paired exit target an invalid spawn footprint.
    const blockingCells = new Set<string>([
      ...(spawnsByMap.get(floor.mapId) ?? []).map((spawn) =>
        macroCellKey([Number(spawn.cell[0]), Number(spawn.cell[1])])),
      ...input.spatial.embedded.transitions
        .filter((transition) => transition.fromMapId === floor.mapId)
        .map((transition) => macroCellKey(transition.fromCell)),
    ]);
    const objects: IdentifiedObjectPlacement[] = [];
    const sameFloorEdges = input.spatial.graph.edges.filter((edge) => {
      const from = input.spatial.graph.nodes.find((node) => node.id === edge.fromNodeId);
      const to = input.spatial.graph.nodes.find((node) => node.id === edge.toNodeId);
      return from?.floorHint === floor.floorIndex && to?.floorHint === floor.floorIndex && edge.kind !== "vertical";
    }).sort((left, right) => Number(right.kind === "locked") - Number(left.kind === "locked") || left.id.localeCompare(right.id));
    const doorEdges = input.recipe.architecture.connectionMode === "open_only"
      ? []
      : sameFloorEdges.filter((entry) => entry.kind !== "open");
    for (const edge of doorEdges) {
      const placement = chooseDoorCell(input, edge.id, cells, blockingCells);
      if (!placement) {
        diagnostics.push(dungeonDiagnostic(
          edge.kind === "locked" ? "fatal" : "warning", "infrastructure", "DNG_DOOR_THRESHOLD_UNAVAILABLE",
          `No two-sided walkable threshold can host the ${edge.kind} door for ${edge.id}.`,
          { mapId: floor.mapId, relatedIds: [edge.id] },
        ));
        continue;
      }
      const gate = edge.gateId ? input.spatial.graph.gates.find((entry) => entry.id === edge.gateId) : undefined;
      objects.push({
        id: allocator.semantic("door", edge.id), object_id: input.theme.architecture.doorObjectId,
        cell: placement.cell, facing: placement.facing,
        locked: edge.kind === "locked", key_item_id: gate?.requiredId, consume_key: gate?.consumeOnUse ?? false,
      });
    }
    // MapExit is the runtime travel contract, while this non-colliding object
    // gives the same cell an ordinary editable 3D landmark. It remains purely
    // presentational and therefore cannot invalidate the destination spawn.
    if (input.theme.architecture.stairObjectId) {
      for (const transition of input.spatial.embedded.transitions
        .filter((entry) => entry.fromMapId === floor.mapId)
        .sort((left, right) => left.id.localeCompare(right.id))) {
        objects.push({
          id: allocator.semantic("transition", transition.id),
          object_id: input.theme.architecture.stairObjectId,
          cell: [...transition.fromCell],
          facing: [0, 1],
          collision_mode: "none",
        });
      }
    }
    for (const intent of population?.objects ?? []) objects.push({
      ...intent, id: allocator.semantic("object", intent.semanticKey), semanticKey: undefined,
    } as IdentifiedObjectPlacement);

    const containers: ContainerPlacementData[] = [];
    for (const intent of population?.containers ?? []) {
      let cell: MacroCell = [Number(intent.cell[0]), Number(intent.cell[1])];
      if (blockingCells.has(macroCellKey(cell))) cell = nearestFreeWalkable(cells, cell, blockingCells) ?? cell;
      blockingCells.add(macroCellKey(cell));
      const { semanticKey, ...record } = intent;
      containers.push({ ...record, id: allocator.semantic("container", semanticKey), cell });
    }
    const entities: IdentifiedEntityPlacement[] = [];
    for (const intent of population?.entities ?? []) {
      let cell: MacroCell = [Number(intent.cell[0]), Number(intent.cell[1])];
      if (blockingCells.has(macroCellKey(cell))) cell = nearestFreeWalkable(cells, cell, blockingCells) ?? cell;
      blockingCells.add(macroCellKey(cell));
      const { semanticKey, ...record } = intent;
      entities.push({ ...record, id: record.id ?? allocator.semantic("narrative_entity", semanticKey ?? `${record.entity_id}-${cell.join("-")}`), cell });
    }
    const items: WorldItemPlacementData[] = (population?.items ?? []).map(({ semanticKey, ...intent }) => ({
      ...intent, id: allocator.semantic("item", semanticKey),
    }));
    const triggers: TriggerData[] = (population?.triggers ?? []).map(({ semanticKey, ...intent }) => ({
      ...intent, id: allocator.semantic("trigger", semanticKey),
    }));
    const exits: IdentifiedMapExit[] = input.spatial.embedded.transitions
      .filter((entry) => entry.fromMapId === floor.mapId)
      .map((transition) => ({
        id: allocator.semantic("exit", transition.id), cell: [...transition.fromCell],
        target_map_id: transition.toMapId,
        target_spawn_id: spawnIdsByTransition.get(transition.pairedTransitionId),
        facing: [0, 1], transition_id: transition.id,
        paired_exit_id: `${generatedIdNamespace(transition.toMapId)}:exit:${transition.pairedTransitionId.replace(/[^A-Za-z0-9._-]+/g, "_")}`,
        transition_kind: transition.kind,
      }));
    const objective = input.spatial.graph.nodes.find((node) => node.id === input.spatial.graph.objectiveNodeId && node.floorHint === floor.floorIndex);
    if (objective) objectiveCells[floor.mapId] = roomCenterCell(input.spatial, objective.id);
    try {
      maps.push(buildMap({
        id: floor.mapId,
        name: floor.displayName,
        bounds: { width: floor.width, height: floor.depth },
        cells: [...cells.values()],
        spawns: spawnsByMap.get(floor.mapId)!,
        placements: { objects, entities, items, containers },
        triggers,
        exits,
        metadata: {
          generatorId: input.recipe.generatorId,
          generatorVersion: input.recipe.generatorVersion,
          recipeId: input.recipe.id,
          recipeVersion: input.recipe.version,
          seed: input.recipe.seed,
          generatedAt: input.generatedAt,
          manuallyModified: false,
          stageSalts: input.recipe.stageSalts,
          contentLibraryHash: input.contentLibraryHash,
          canonicalResultHash: input.canonicalResultHash,
          bundleId: `${input.recipe.id}:${input.recipe.seed}`,
          floorIndex: floor.floorIndex,
          floorCount: input.spatial.embedded.maps.length,
          attemptIndex: input.attemptIndex,
        },
      }));
    } catch (error) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "bake", "DNG_MAP_BUILD_FAILED", error instanceof Error ? error.message : "Ordinary map build failed.",
        { mapId: floor.mapId },
      ));
    }
  }
  const metrics = {
    maps: maps.length,
    cells: maps.reduce((sum, map) => sum + map.cells.length, 0),
    objects: maps.reduce((sum, map) => sum + map.custom_object_placements.length, 0),
    entities: maps.reduce((sum, map) => sum + map.entity_placements.length, 0),
    items: maps.reduce((sum, map) => sum + map.item_placements.length, 0),
    containers: maps.reduce((sum, map) => sum + map.container_placements.length, 0),
  };
  return diagnostics.some((entry) => entry.severity === "fatal")
    ? failedStage(diagnostics, metrics)
    : successfulStage({ maps, primarySpawnIds, objectiveCells }, diagnostics, metrics);
};
