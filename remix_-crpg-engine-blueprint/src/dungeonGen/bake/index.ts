import { buildMap, type IdentifiedEntityPlacement, type IdentifiedMapExit, type IdentifiedObjectPlacement } from "../../generation-facing/mapContract";
import { DeterministicIdAllocator, generatedIdNamespace } from "../../generation-facing/deterministicIds";
import type {
  CellData,
  ContainerPlacementData,
  MapData,
  TriggerData,
  WorldItemPlacementData,
} from "../../schema/game";
import { FINE_HALF_EXTENT, FINE_PER_MACRO } from "../../engine-core/gridCoordinates";
import { hashSeed } from "../../engine-core/rng";
import {
  BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS,
  backroomsLevelZeroDamaskThinWallObjectId,
  backroomsLevelZeroPartitionWallObjectId,
  backroomsLevelZeroThinWallObjectId,
  type BackroomsLevelZeroPartitionWallOrientation,
  type BackroomsLevelZeroPartitionWallStyle,
  type BackroomsLevelZeroWallFinish,
} from "../../schema/presets";
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

type FineCellOverride = NonNullable<MapData["fine_cell_overrides"]>[number];

interface BackroomsPartitionCandidate {
  roomId: string;
  cells: MacroCell[];
  direction: MacroCell;
  orientation: BackroomsLevelZeroPartitionWallOrientation;
  score: number;
}

const isBackroomsPartitionFloor = (
  cell: CellData | undefined,
  roomId: string,
) =>
  Boolean(
    cell?.walkable &&
      cell.room_id === roomId &&
      cell.tag !== "connection",
  );

const buildBackroomsPartitionCandidates = (
  input: DungeonBakeInput,
  mapId: string,
  cells: ReadonlyMap<string, CellData>,
  avoidCells: readonly MacroCell[],
): BackroomsPartitionCandidate[] => {
  const roomIds = [...new Set(
    [...cells.values()]
      .filter((cell) => isBackroomsPartitionFloor(cell, cell.room_id || ""))
      .map((cell) => cell.room_id)
      .filter((roomId): roomId is string => Boolean(roomId)),
  )].sort();
  const candidates: BackroomsPartitionCandidate[] = [];

  for (const roomId of roomIds) {
    const roomFloors = [...cells.values()]
      .filter((cell) => isBackroomsPartitionFloor(cell, roomId))
      .sort((left, right) =>
        compareMacroCells([left.x, left.z], [right.x, right.z]),
      );

    for (const start of roomFloors) {
      for (const direction of directions) {
        const [dx, dz] = direction;
        const anchor = cells.get(
          macroCellKey([start.x - dx, start.z - dz]),
        );
        if (anchor?.walkable !== false || anchor.blocks_los !== true) continue;

        const perpendicular: MacroCell = [-dz, dx];
        for (let length = 2; length <= 4; length += 1) {
          const run = Array.from(
            { length },
            (_, index): MacroCell => [
              start.x + dx * index,
              start.z + dz * index,
            ],
          );
          const forwardClearance: MacroCell[] = [
            [start.x + dx * length, start.z + dz * length],
            [start.x + dx * (length + 1), start.z + dz * (length + 1)],
          ];
          const longitudinal = [...run, ...forwardClearance];
          if (
            !longitudinal.every((cell) =>
              isBackroomsPartitionFloor(cells.get(macroCellKey(cell)), roomId),
            )
          ) {
            continue;
          }

          // A full macro lane stays open on both sides, and two clear cells
          // remain beyond the free end. A 3x3-footprint actor can therefore
          // circulate around the protrusion instead of treating it as a new
          // room-sealing divider.
          if (
            !longitudinal.every((cell) =>
              [-1, 1].every((side) => {
                const adjacent: MacroCell = [
                  cell[0] + perpendicular[0] * side,
                  cell[1] + perpendicular[1] * side,
                ];
                return isBackroomsPartitionFloor(
                  cells.get(macroCellKey(adjacent)),
                  roomId,
                );
              }),
            )
          ) {
            continue;
          }

          if (
            run.some((cell) =>
              avoidCells.some(
                (avoid) =>
                  Math.max(
                    Math.abs(cell[0] - avoid[0]),
                    Math.abs(cell[1] - avoid[1]),
                  ) <= 1,
              ),
            )
          ) {
            continue;
          }

          const orientation: BackroomsLevelZeroPartitionWallOrientation =
            dx === 0 ? "vertical" : "horizontal";
          candidates.push({
            roomId,
            cells: run,
            direction: [...direction],
            orientation,
            score: hashSeed(
              input.recipe.seed,
              mapId,
              roomId,
              start.x,
              start.z,
              dx,
              dz,
              length,
              "partition_candidate",
            ),
          });
        }
      }
    }
  }

  return candidates;
};

const buildBackroomsPartitionOverrides = (
  input: DungeonBakeInput,
  mapId: string,
  cells: ReadonlyMap<string, CellData>,
  avoidCells: readonly MacroCell[],
  priorityCell: MacroCell,
): FineCellOverride[] => {
  if (input.recipe.architecture.boundaryStyle !== "backrooms_drywall") {
    return [];
  }

  const candidates = buildBackroomsPartitionCandidates(
    input,
    mapId,
    cells,
    avoidCells,
  );
  const bestByRoom = new Map<string, BackroomsPartitionCandidate>();
  for (const candidate of candidates) {
    const current = bestByRoom.get(candidate.roomId);
    if (
      !current ||
      candidate.score < current.score ||
      (candidate.score === current.score &&
        compareMacroCells(candidate.cells[0], current.cells[0]) < 0)
    ) {
      bestByRoom.set(candidate.roomId, candidate);
    }
  }

  const randomizedRoomCandidates = [...bestByRoom.values()].sort(
    (left, right) =>
      hashSeed(input.recipe.seed, mapId, left.roomId, "partition_room") -
        hashSeed(input.recipe.seed, mapId, right.roomId, "partition_room") ||
      left.roomId.localeCompare(right.roomId),
  );
  const targetCount = Math.min(
    24,
    Math.max(6, Math.ceil(randomizedRoomCandidates.length * 0.6)),
    randomizedRoomCandidates.length,
  );
  const distanceFromPriorityCell = (candidate: BackroomsPartitionCandidate) =>
    Math.min(...candidate.cells.map((cell) =>
      Math.max(
        Math.abs(cell[0] - priorityCell[0]),
        Math.abs(cell[1] - priorityCell[1]),
      )));
  const nearbyCandidates = [...randomizedRoomCandidates].sort((left, right) =>
    distanceFromPriorityCell(left) - distanceFromPriorityCell(right) ||
    left.score - right.score ||
    left.roomId.localeCompare(right.roomId));
  const nearbyCount = Math.min(4, targetCount);
  const nearbyRoomIds = new Set(
    nearbyCandidates.slice(0, nearbyCount).map((candidate) => candidate.roomId),
  );
  const selected = [
    ...nearbyCandidates.slice(0, nearbyCount),
    ...randomizedRoomCandidates.filter((candidate) =>
      !nearbyRoomIds.has(candidate.roomId)),
  ].slice(0, targetCount);
  const styleOffset =
    hashSeed(input.recipe.seed, mapId, "partition_style_cycle") %
    BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES.length;
  const finishOffset =
    hashSeed(input.recipe.seed, mapId, "partition_finish_cycle") % 3;

  return selected.flatMap((candidate, runIndex) => {
    const style = BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES[
      (runIndex + styleOffset) %
        BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES.length
    ] as BackroomsLevelZeroPartitionWallStyle;
    const finish: BackroomsLevelZeroWallFinish =
      (runIndex + finishOffset) % 3 === 0 ? "damask" : "aged";
    const objectId = backroomsLevelZeroPartitionWallObjectId(
      style,
      candidate.orientation,
      finish,
    );
    const runTag = `backrooms_partition_${runIndex}_${finish}_${style}_${candidate.orientation}`;

    return candidate.cells.flatMap((macroCell) =>
      Array.from({ length: FINE_PER_MACRO }, (_, along): FineCellOverride => ({
        macro_cell: [...macroCell],
        fine_offset:
          candidate.orientation === "horizontal"
            ? [along, FINE_HALF_EXTENT]
            : [FINE_HALF_EXTENT, along],
        overrides: {
          active: true,
          walkable: false,
          blocks_los: true,
          height: 1,
          visual_height: 1.5,
          terrain: input.theme.architecture.wallTerrain,
          object_id: objectId,
          tag: runTag,
          surface_tag: "none",
        },
      })),
    );
  });
};

const applyBackroomsDrywallFaces = (
  input: DungeonBakeInput,
  mapId: string,
  cells: Map<string, CellData>,
) => {
  // Phase 1's temporary preset opts into a face-exposed wall kit. Solid cells
  // remain untouched as navigation/LOS data; only their presentation object
  // changes, so legacy presets and runtime collision keep their exact shape.
  if (input.recipe.architecture.boundaryStyle !== "backrooms_drywall") return;

  const faces = [
    { dx: 0, dz: -1, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.north },
    { dx: 1, dz: 0, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.east },
    { dx: 0, dz: 1, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.south },
    { dx: -1, dz: 0, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.west },
  ] as const;
  const roomIds = [...new Set(
    [...cells.values()]
      .filter(
        (cell) =>
          !cell.walkable &&
          cell.blocks_los &&
          cell.object_id === input.theme.architecture.wallObjectId,
      )
      .map((cell) => cell.room_id)
      .filter((roomId): roomId is string => Boolean(roomId)),
  )].sort(
    (left, right) =>
      hashSeed(input.recipe.seed, mapId, left, "damask_room") -
        hashSeed(input.recipe.seed, mapId, right, "damask_room") ||
      left.localeCompare(right),
  );
  const damaskRoomCount = Math.max(1, Math.floor(roomIds.length / 5));
  const entranceRoomId = input.spatial.graph.entranceNodeId;
  const damaskRoomIds = new Set([
    ...(roomIds.includes(entranceRoomId) ? [entranceRoomId] : []),
    ...roomIds.filter((roomId) => roomId !== entranceRoomId),
  ].slice(0, damaskRoomCount));

  cells.forEach((cell) => {
    if (
      cell.walkable ||
      !cell.blocks_los ||
      cell.object_id !== input.theme.architecture.wallObjectId
    ) {
      return;
    }

    const faceMask = faces.reduce((mask, face) => {
      const neighbor = cells.get(
        macroCellKey([cell.x + face.dx, cell.z + face.dz]),
      );
      return neighbor?.walkable ? mask | face.bit : mask;
    }, 0);

    cell.object_id = damaskRoomIds.has(cell.room_id || "")
      ? backroomsLevelZeroDamaskThinWallObjectId(faceMask)
      : backroomsLevelZeroThinWallObjectId(faceMask);
  });
};

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
  applyBackroomsDrywallFaces(input, mapId, cells);
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
    const priorityCell = (spawnsByMap.get(floor.mapId) ?? [])[0]?.cell;
    const fineCellOverrides = buildBackroomsPartitionOverrides(
      input,
      floor.mapId,
      cells,
      [
        ...(spawnsByMap.get(floor.mapId) ?? []).map(
          (spawn): MacroCell => [Number(spawn.cell[0]), Number(spawn.cell[1])],
        ),
        ...objects.map(
          (placement): MacroCell => [
            Number(placement.cell[0]),
            Number(placement.cell[1]),
          ],
        ),
        ...entities.map(
          (placement): MacroCell => [
            Number(placement.cell[0]),
            Number(placement.cell[1]),
          ],
        ),
        ...containers.map(
          (placement): MacroCell => [
            Number(placement.cell[0]),
            Number(placement.cell[1]),
          ],
        ),
      ],
      priorityCell
        ? [Number(priorityCell[0]), Number(priorityCell[1])]
        : [0, 0],
    );
    const objective = input.spatial.graph.nodes.find((node) => node.id === input.spatial.graph.objectiveNodeId && node.floorHint === floor.floorIndex);
    if (objective) objectiveCells[floor.mapId] = roomCenterCell(input.spatial, objective.id);
    try {
      maps.push(buildMap({
        id: floor.mapId,
        name: floor.displayName,
        bounds: { width: floor.width, height: floor.depth },
        cells: [...cells.values()],
        fineCellOverrides,
        spawns: spawnsByMap.get(floor.mapId)!,
        ambientLight: input.theme.ambientLight,
        presentationAmbientLight: input.theme.presentationAmbientLight,
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
