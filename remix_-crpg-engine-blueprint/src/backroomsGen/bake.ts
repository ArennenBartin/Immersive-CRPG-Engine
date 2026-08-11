import { buildMap } from "../generation-facing/mapContract";
import { DeterministicIdAllocator } from "../generation-facing/deterministicIds";
import { stableContentHash } from "../generation-facing/stableHash";
import {
  centeredMacroBounds,
  compareMacroCells,
  macroCellInBounds,
  macroCellKey,
  type MacroCell,
} from "../dungeonGen/embedding/gridSearch";
import { instantiateDungeonRoomTemplate } from "../dungeonGen/templates";
import type {
  CellData,
  MapData,
  MapGenerationSocketData,
  ObjectPlacementData,
  TriggerData,
} from "../schema/game";
import type { MapPerformanceBudgets } from "../engine-core/mapReadinessValidator";
import { FINE_HALF_EXTENT, FINE_PER_MACRO } from "../engine-core/gridCoordinates";
import { hashSeed } from "../engine-core/rng";
import { BACKROOMS_ANOMALY_OBJECTS } from "../data/backroomsAnomalyAssets";
import {
  BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
  BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES,
  BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS,
  BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
  backroomsLevelZeroDamaskThinWallObjectId,
  backroomsLevelZeroPartitionWallObjectId,
  backroomsLevelZeroThinWallObjectId,
  type BackroomsLevelZeroPartitionWallOrientation,
  type BackroomsLevelZeroPartitionWallStyle,
  type BackroomsLevelZeroWallFinish,
} from "../schema/presets";
import { dressBackroomsAnomalies } from "./anomalies";
import { backroomsDiagnostic, sortBackroomsDiagnostics } from "./diagnostics";
import { BACKROOMS_MUTABLE_PORTAL_PREFIX } from "./runtimeState";
import { BackroomsEmbeddedMapSchema, BackroomsRecipeSchema, BackroomsSemanticGraphSchema } from "./schema";
import { backroomsLevel0TemplateById } from "./templates";
import type {
  BackroomsDiagnostic,
  BackroomsAnomalyDressingPlan,
  BackroomsAnomalyProfileDef,
  BackroomsEmbeddedMap,
  BackroomsPacingPlan,
  BackroomsRecipeDef,
  BackroomsSemanticGraph,
} from "./types";

export interface BakeBackroomsMapInput {
  recipe: BackroomsRecipeDef;
  graph: BackroomsSemanticGraph;
  embedded: BackroomsEmbeddedMap;
  pacingPlan?: BackroomsPacingPlan;
  anomalyProfile?: BackroomsAnomalyProfileDef;
  generatedAt?: string;
  contentLibraryHash?: string;
  attemptIndex?: number;
}

export interface BackroomsBakeResult {
  success: boolean;
  map?: MapData;
  anomalies?: BackroomsAnomalyDressingPlan;
  diagnostics: BackroomsDiagnostic[];
}

/** Reviewed single-map budget for the deliberately large 52–68 room Level 0. */
export const BACKROOMS_LEVEL0_VALIDATION_BUDGETS: Partial<MapPerformanceBudgets> = {
  macroCells: { soft: 30_000, hard: 65_536 },
  fineCells: { soft: 270_000, hard: 65_536 * 9 },
  rooms: { soft: 150, hard: 200 },
  estimatedSerializedMapBytes: { soft: 5 * 1024 * 1024, hard: 8 * 1024 * 1024 },
};

const directions: readonly MacroCell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

type FineCellOverride = NonNullable<MapData["fine_cell_overrides"]>[number];

interface BackroomsPartitionCandidate {
  roomId: string;
  cells: MacroCell[];
  orientation: BackroomsLevelZeroPartitionWallOrientation;
  score: number;
}

const isBackroomsPartitionFloor = (
  cell: CellData | undefined,
  roomId: string,
) => Boolean(
  cell?.walkable &&
  cell.room_id === roomId &&
  cell.tag !== "connection",
);

const buildBackroomsPartitionCandidates = (
  recipe: BackroomsRecipeDef,
  mapId: string,
  cells: ReadonlyMap<string, CellData>,
  avoidCells: readonly MacroCell[],
  excludedRoomIds: ReadonlySet<string>,
): BackroomsPartitionCandidate[] => {
  const roomIds = [...new Set(
    [...cells.values()]
      .filter((cell) => isBackroomsPartitionFloor(cell, cell.room_id || ""))
      .map((cell) => cell.room_id)
      .filter((roomId): roomId is string =>
        typeof roomId === "string" &&
        roomId.length > 0 &&
        !excludedRoomIds.has(roomId)),
  )].sort();
  const candidates: BackroomsPartitionCandidate[] = [];

  for (const roomId of roomIds) {
    const roomFloors = [...cells.values()]
      .filter((cell) => isBackroomsPartitionFloor(cell, roomId))
      .sort((left, right) =>
        compareMacroCells([left.x, left.z], [right.x, right.z]));

    for (const start of roomFloors) {
      for (const direction of directions) {
        const [dx, dz] = direction;
        const anchor = cells.get(macroCellKey([start.x - dx, start.z - dz]));
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
          if (!longitudinal.every((cell) =>
            isBackroomsPartitionFloor(cells.get(macroCellKey(cell)), roomId))) {
            continue;
          }
          if (!longitudinal.every((cell) =>
            [-1, 1].every((side) => {
              const adjacent: MacroCell = [
                cell[0] + perpendicular[0] * side,
                cell[1] + perpendicular[1] * side,
              ];
              return isBackroomsPartitionFloor(
                cells.get(macroCellKey(adjacent)),
                roomId,
              );
            }))) {
            continue;
          }
          if (run.some((cell) =>
            avoidCells.some((avoid) =>
              Math.max(
                Math.abs(cell[0] - avoid[0]),
                Math.abs(cell[1] - avoid[1]),
              ) <= 1))) {
            continue;
          }
          candidates.push({
            roomId,
            cells: run,
            orientation: dx === 0 ? "vertical" : "horizontal",
            score: hashSeed(
              recipe.seed,
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
  recipe: BackroomsRecipeDef,
  mapId: string,
  cells: ReadonlyMap<string, CellData>,
  avoidCells: readonly MacroCell[],
  excludedRoomIds: ReadonlySet<string>,
  priorityCell: MacroCell,
): FineCellOverride[] => {
  const candidates = buildBackroomsPartitionCandidates(
    recipe,
    mapId,
    cells,
    avoidCells,
    excludedRoomIds,
  );
  const bestByRoom = new Map<string, BackroomsPartitionCandidate>();
  for (const candidate of candidates) {
    const current = bestByRoom.get(candidate.roomId);
    if (!current || candidate.score < current.score ||
        (candidate.score === current.score &&
          compareMacroCells(candidate.cells[0], current.cells[0]) < 0)) {
      bestByRoom.set(candidate.roomId, candidate);
    }
  }

  const randomizedRoomCandidates = [...bestByRoom.values()].sort((left, right) =>
    hashSeed(recipe.seed, mapId, left.roomId, "partition_room") -
      hashSeed(recipe.seed, mapId, right.roomId, "partition_room") ||
    left.roomId.localeCompare(right.roomId));
  const targetCount = Math.min(
    24,
    Math.max(6, Math.ceil(randomizedRoomCandidates.length * 0.6)),
    randomizedRoomCandidates.length,
  );
  // Phase 6 is several times larger than the Phase 1-5 proof maps. Purely
  // random room selection left its first visible partition more than fifty
  // macro cells from spawn, which made the feature look as though it had been
  // removed. Reserve a few slots for the nearest valid office rooms, then use
  // the seeded order for the remainder so the full map still feels varied.
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
  const styleOffset = hashSeed(recipe.seed, mapId, "partition_style_cycle") %
    BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES.length;
  const finishOffset = hashSeed(recipe.seed, mapId, "partition_finish_cycle") % 3;

  return selected.flatMap((candidate, runIndex) => {
    const style = BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES[
      (runIndex + styleOffset) % BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES.length
    ] as BackroomsLevelZeroPartitionWallStyle;
    const finish: BackroomsLevelZeroWallFinish =
      (runIndex + finishOffset) % 3 === 0 ? "damask" : "aged";
    const objectId = backroomsLevelZeroPartitionWallObjectId(
      style,
      candidate.orientation,
      finish,
    );
    const runTag =
      `backrooms_partition_${runIndex}_${finish}_${style}_${candidate.orientation}`;
    return candidate.cells.flatMap((macroCell) =>
      Array.from({ length: FINE_PER_MACRO }, (_, along): FineCellOverride => ({
        macro_cell: [...macroCell],
        fine_offset: candidate.orientation === "horizontal"
          ? [along, FINE_HALF_EXTENT]
          : [FINE_HALF_EXTENT, along],
        overrides: {
          active: true,
          walkable: false,
          blocks_los: true,
          height: 1,
          visual_height: 1.5,
          terrain: "stone_wall",
          object_id: objectId,
          tag: runTag,
          surface_tag: "none",
        },
      })),
    );
  });
};

const applyBackroomsDrywallFaces = (
  recipe: BackroomsRecipeDef,
  mapId: string,
  entranceRoomId: string,
  cells: Map<string, CellData>,
) => {
  const faces = [
    { dx: 0, dz: -1, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.north },
    { dx: 1, dz: 0, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.east },
    { dx: 0, dz: 1, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.south },
    { dx: -1, dz: 0, bit: BACKROOMS_LEVEL_ZERO_THIN_WALL_FACE_BITS.west },
  ] as const;
  const roomIds = [...new Set(
    [...cells.values()]
      .filter((cell) =>
        !cell.walkable &&
        cell.blocks_los &&
        cell.object_id === BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID)
      .map((cell) => cell.room_id)
      .filter((roomId): roomId is string => Boolean(roomId)),
  )].sort((left, right) =>
    hashSeed(recipe.seed, mapId, left, "damask_room") -
      hashSeed(recipe.seed, mapId, right, "damask_room") ||
    left.localeCompare(right));
  const damaskRoomCount = Math.max(1, Math.floor(roomIds.length / 5));
  const damaskRoomIds = new Set([
    ...(roomIds.includes(entranceRoomId) ? [entranceRoomId] : []),
    ...roomIds.filter((roomId) => roomId !== entranceRoomId),
  ].slice(0, damaskRoomCount));

  cells.forEach((cell) => {
    if (cell.walkable || !cell.blocks_los ||
        cell.object_id !== BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID) return;
    const faceMask = faces.reduce((mask, face) => {
      const neighbor = cells.get(macroCellKey([
        cell.x + face.dx,
        cell.z + face.dz,
      ]));
      return neighbor?.walkable ? mask | face.bit : mask;
    }, 0);
    cell.object_id = damaskRoomIds.has(cell.room_id || "")
      ? backroomsLevelZeroDamaskThinWallObjectId(faceMask)
      : backroomsLevelZeroThinWallObjectId(faceMask);
  });
};

const templateCellToMapCell = (
  entry: ReturnType<typeof instantiateDungeonRoomTemplate>["cells"][number],
  roomId: string,
): CellData => ({
  x: entry.cell[0],
  y: 0,
  z: entry.cell[1],
  active: true,
  walkable: entry.walkable,
  blocks_los: !entry.walkable,
  height: entry.height,
  visual_height: entry.visualHeight,
  terrain: entry.terrain,
  object_id: entry.objectId,
  room_id: roomId,
  tag: entry.tag,
  surface_tag: entry.surfaceTag,
});

const socketOpeningCells = (
  cell: readonly [number, number],
  facing: readonly [number, number],
  width: number,
): MacroCell[] => {
  const perpendicular: MacroCell = [-facing[1], facing[0]];
  const before = Math.floor((width - 1) / 2);
  const after = width - before - 1;
  const cells: MacroCell[] = [];
  for (let offset = -before; offset <= after; offset += 1) {
    cells.push([
      cell[0] + perpendicular[0] * offset,
      cell[1] + perpendicular[1] * offset,
    ]);
  }
  return cells;
};

const nearestWalkableCell = (
  cells: ReadonlyMap<string, CellData>,
  target: MacroCell,
  roomId: string,
): MacroCell => {
  const candidates = [...cells.values()]
    .filter((cell) => cell.walkable && cell.room_id === roomId)
    .sort((left, right) =>
      (Math.abs(left.x - target[0]) + Math.abs(left.z - target[1])) -
        (Math.abs(right.x - target[0]) + Math.abs(right.z - target[1])) ||
      compareMacroCells([left.x, left.z], [right.x, right.z]),
    );
  if (!candidates.length) throw new Error(`Room ${roomId} contains no walkable cell`);
  return [candidates[0].x, candidates[0].z];
};

const roomCenter = (room: BackroomsEmbeddedMap["rooms"][number]): MacroCell => [
  room.bounds.x + Math.floor(room.bounds.width / 2),
  room.bounds.z + Math.floor(room.bounds.depth / 2),
];

// Target spacing between ceiling fixtures, in macro cells. A fixture's pool is
// roughly three and a half macro cells across, so this leaves the pools just
// touching: a rhythm of bright patches with dimmer floor between them, rather
// than one even wash. One fixture at a room's centre left everything past the
// middle of a large office lit only by ambient, which is why the level read as
// uniformly beige instead of fluorescent-lit.
const CEILING_LIGHT_SPACING = 6;

// Cap on working fixtures per room, so one enormous open floor cannot alone
// consume the renderer's simultaneous-light budget.
//
// An earlier revision pinned this at 1 on the belief that fixture count was
// driving the traversal stutter. That was wrong: the measurement behind it had
// drifted, and the real cost was allocation churn in the visibility
// presentation. With that fixed, a full ceiling grid is affordable, and a grid
// is what makes a corridor read as a run of pools rather than one bright spot.
const CEILING_LIGHTS_PER_ROOM = 12;

// One room in every five keeps no working fixture at all.
const CEILING_LIGHT_DARK_ROOM_INTERVAL = 5;

// Spacing between corridor fixtures, in macro cells. Corridors are embedded
// separately from rooms, so a room-only lighting pass left every hallway lit
// only by spill from the rooms at either end -- which is exactly where a run of
// evenly spaced pools reads best.
const CORRIDOR_LIGHT_SPACING = 20;

/**
 * Lattice of ceiling-fixture targets covering a room, inset so the outermost
 * fixtures sit away from the walls rather than on them. Returns ideal targets;
 * the caller still snaps each to the nearest walkable cell.
 */
const ceilingGridCells = (
  room: BackroomsEmbeddedMap["rooms"][number],
): MacroCell[] => {
  const { x, z, width, depth } = room.bounds;
  const columns = Math.max(1, Math.round(width / CEILING_LIGHT_SPACING));
  const rows = Math.max(1, Math.round(depth / CEILING_LIGHT_SPACING));
  const targets: MacroCell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      targets.push([
        x + Math.floor(((column + 0.5) * width) / columns),
        z + Math.floor(((row + 0.5) * depth) / rows),
      ]);
    }
  }
  return targets;
};

const generationSocketKind = (
  node: BackroomsSemanticGraph["nodes"][number],
): MapGenerationSocketData["kind"] | undefined => {
  if (node.kind === "start") return "entrance";
  if (node.kind === "culmination") return "culmination";
  if (node.kind === "transition") return "extraction";
  if (["landmark", "anchor", "set_piece"].includes(node.kind)) return "landmark";
  return undefined;
};

export const bakeBackroomsMap = (
  input: BakeBackroomsMapInput,
): BackroomsBakeResult => {
  const recipeResult = BackroomsRecipeSchema.safeParse(input.recipe);
  const graphResult = BackroomsSemanticGraphSchema.safeParse(input.graph);
  const embeddedResult = BackroomsEmbeddedMapSchema.safeParse(input.embedded);
  if (!recipeResult.success || !graphResult.success || !embeddedResult.success) {
    const issues = [
      ...(!recipeResult.success ? recipeResult.error.issues : []),
      ...(!graphResult.success ? graphResult.error.issues : []),
      ...(!embeddedResult.success ? embeddedResult.error.issues : []),
    ];
    return {
      success: false,
      diagnostics: [backroomsDiagnostic(
        "fatal",
        "embedding",
        "BRG_BAKE_INPUT_INVALID",
        issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "),
      )],
    };
  }

  const recipe = recipeResult.data;
  const graph = graphResult.data;
  const embedded = embeddedResult.data;
  const diagnostics: BackroomsDiagnostic[] = [];
  const graphEdgeIds = new Set(graph.edges.map((edge) => edge.id));
  const realizedEdgeIds = new Set(embedded.connections.map((connection) => connection.edgeId));
  const missingEdges = [...graphEdgeIds].filter((edgeId) => !realizedEdgeIds.has(edgeId)).sort();
  if (missingEdges.length) {
    diagnostics.push(backroomsDiagnostic(
      "fatal",
      "embedding",
      "BRG_BAKE_EDGE_UNREALIZED",
      `Cannot bake: ${missingEdges.length} semantic graph edge${missingEdges.length === 1 ? " is" : "s are"} not spatially realized.`,
      missingEdges,
    ));
    return { success: false, diagnostics: sortBackroomsDiagnostics(diagnostics) };
  }

  const cells = new Map<string, CellData>();
  const usedSocketIds = new Set(embedded.connections.flatMap((connection) => [
    connection.fromSocketId,
    connection.toSocketId,
  ]));
  for (const room of embedded.rooms) {
    const roomTemplate = room.templateId ? backroomsLevel0TemplateById.get(room.templateId) : undefined;
    if (!roomTemplate) {
      diagnostics.push(backroomsDiagnostic(
        "fatal",
        "embedding",
        "BRG_BAKE_TEMPLATE_MISSING",
        `Placed room ${room.nodeId} references missing template ${room.templateId ?? "<none>"}.`,
        [room.nodeId, room.templateId ?? "missing"],
      ));
      continue;
    }
    const instance = instantiateDungeonRoomTemplate(roomTemplate, {
      nodeId: room.nodeId,
      mapId: embedded.mapId,
      origin: [...room.origin],
      rotation: room.rotation,
    });
    instance.cells.forEach((entry) => {
      const cell = templateCellToMapCell(entry, room.nodeId);
      cells.set(macroCellKey(entry.cell), cell);
    });

    // Templates expose broad sockets on every side so rotation and routing can
    // choose freely. Once edges are known, unused openings become ordinary
    // walls, preventing visible holes into unauthored space.
    instance.room.sockets
      .filter((socket) => !usedSocketIds.has(socket.id))
      .flatMap((socket) => socketOpeningCells(socket.cell, socket.facing, socket.width))
      .forEach(([x, z]) => {
        const key = macroCellKey([x, z]);
        if (!cells.has(key)) return;
        cells.set(key, {
          x,
          y: 0,
          z,
          active: true,
          walkable: false,
          blocks_los: true,
          height: 1,
          visual_height: 1.5,
          terrain: "stone_wall",
          object_id: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
          room_id: room.nodeId,
          tag: "boundary",
          surface_tag: "none",
        });
      });
  }
  if (diagnostics.some((entry) => entry.severity === "fatal")) {
    return { success: false, diagnostics: sortBackroomsDiagnostics(diagnostics) };
  }

  embedded.corridors.forEach((corridor) => corridor.cells.forEach(([x, z]) => {
    cells.set(macroCellKey([x, z]), {
      x,
      y: 0,
      z,
      active: true,
      walkable: true,
      blocks_los: false,
      height: 0,
      visual_height: 0,
      terrain: "soft",
      object_id: BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
      room_id: `connection:${corridor.edgeId}`,
      tag: "connection",
      surface_tag: "none",
    });
  }));

  // Corridors are painted after room shells so the selected sockets open into
  // them. Seal every remaining cardinal edge with a real wall cell; otherwise
  // a routed hallway can look complete in the embedding preview but open into
  // the void when the baked map is rendered.
  const mapBounds = centeredMacroBounds(embedded.width, embedded.depth);
  const walkableCells = [...cells.values()].filter((cell) => cell.walkable);
  for (const walkableCell of walkableCells) {
    for (const [dx, dz] of directions) {
      const boundary: MacroCell = [walkableCell.x + dx, walkableCell.z + dz];
      if (!macroCellInBounds(boundary, mapBounds) || cells.has(macroCellKey(boundary))) {
        continue;
      }
      cells.set(macroCellKey(boundary), {
        x: boundary[0],
        y: 0,
        z: boundary[1],
        active: true,
        walkable: false,
        blocks_los: true,
        height: 1,
        visual_height: 1.5,
        terrain: "stone_wall",
        object_id: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
        room_id: walkableCell.room_id ?? "corridor_boundary",
        tag: "boundary",
        surface_tag: "none",
      });
    }
  }

  // Phase 9 gives only optional/deceptive semantic edges invisible threshold
  // endpoints. The room/corridor geometry stays immutable; runtime persistence
  // may re-pair these endpoints only while all involved rooms are unobserved.
  // Required backbone and narrative-anchor edges never receive a portal ID.
  const mutableEdgeById = new Map(
    graph.edges
      .filter((edge) =>
        edge.mutableCandidate &&
        !edge.immutable &&
        edge.tags.includes("deceptive_candidate"),
      )
      .map((edge) => [edge.id, edge]),
  );
  const claimedPortalCells = new Set<string>();
  const mutablePortalCells: MacroCell[] = [];
  const nearestUnusedPortalCell = (
    target: MacroCell,
    roomId: string,
  ): MacroCell | undefined => {
    const candidate = [...cells.values()]
      .filter((cell) =>
        cell.active &&
        cell.walkable &&
        cell.room_id === roomId &&
        !claimedPortalCells.has(macroCellKey([cell.x, cell.z])),
      )
      .sort((left, right) =>
        (Math.abs(left.x - target[0]) + Math.abs(left.z - target[1])) -
          (Math.abs(right.x - target[0]) + Math.abs(right.z - target[1])) ||
        compareMacroCells([left.x, left.z], [right.x, right.z]),
      )[0];
    return candidate ? [candidate.x, candidate.z] : undefined;
  };
  for (const connection of embedded.connections
    .filter((entry) => mutableEdgeById.has(entry.edgeId))
    .slice()
    .sort((left, right) => left.edgeId.localeCompare(right.edgeId))) {
    const portalId = `${BACKROOMS_MUTABLE_PORTAL_PREFIX}${connection.edgeId}`;
    const fromCell = nearestUnusedPortalCell(
      [connection.fromCell[0], connection.fromCell[1]],
      connection.fromNodeId,
    );
    if (fromCell) claimedPortalCells.add(macroCellKey(fromCell));
    const toCell = nearestUnusedPortalCell(
      [connection.toCell[0], connection.toCell[1]],
      connection.toNodeId,
    );
    if (!fromCell || !toCell) {
      diagnostics.push(backroomsDiagnostic(
        "fatal",
        "recurrence",
        "BRG_PERIPHERAL_PORTAL_ENDPOINT_MISSING",
        `Mutable edge ${connection.edgeId} could not reserve two walkable room endpoints.`,
        [connection.edgeId, connection.fromNodeId, connection.toNodeId],
      ));
      continue;
    }
    claimedPortalCells.add(macroCellKey(toCell));
    for (const endpoint of [fromCell, toCell]) {
      const key = macroCellKey(endpoint);
      const cell = cells.get(key)!;
      cells.set(key, { ...cell, portal_id: portalId });
      mutablePortalCells.push(endpoint);
    }
  }
  if (diagnostics.some((entry) => entry.severity === "fatal")) {
    return { success: false, diagnostics: sortBackroomsDiagnostics(diagnostics) };
  }

  const allocator = new DeterministicIdAllocator({ mapId: embedded.mapId });
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const roomByNodeId = new Map(embedded.rooms.map((room) => [room.nodeId, room]));
  const startRoom = roomByNodeId.get(graph.startNodeId)!;
  const spawnCell = nearestWalkableCell(cells, roomCenter(startRoom), startRoom.nodeId);
  const generationSockets: MapGenerationSocketData[] = [];
  const recurrenceByNodeId = new Map(
    input.pacingPlan?.recurrence.map((entry) => [entry.nodeId, entry]) ?? [],
  );
  const eventsByNodeId = new Map(
    input.pacingPlan?.events.map((entry) => [entry.nodeId, entry]) ?? [],
  );
  for (const node of graph.nodes.slice().sort((left, right) => left.id.localeCompare(right.id))) {
    const kind = generationSocketKind(node);
    if (!kind) continue;
    const room = roomByNodeId.get(node.id)!;
    const cell = nearestWalkableCell(cells, roomCenter(room), room.nodeId);
    generationSockets.push({
      id: allocator.semantic("socket", node.id),
      kind,
      cell,
      label: node.anchorId ?? node.kind.replaceAll("_", " "),
      node_id: node.id,
      source_opportunity_id: node.anchorId ?? node.id,
      required: node.required,
      tags: [...new Set([
        ...node.tags,
        node.kind,
        "backrooms_phase5",
        ...(input.pacingPlan ? ["backrooms_phase6"] : []),
        ...(recurrenceByNodeId.has(node.id) ? ["recurrence"] : []),
        ...(recurrenceByNodeId.get(node.id)?.tags ?? []),
        ...(recurrenceByNodeId.has(node.id)
          ? [
              `motif:${recurrenceByNodeId.get(node.id)!.motifId}`,
              `motif_stage:${recurrenceByNodeId.get(node.id)!.stageIndex}`,
            ]
          : []),
      ])].sort(),
    });
  }

  for (const occurrence of input.pacingPlan?.recurrence ?? []) {
    if (generationSockets.some((socket) => socket.node_id === occurrence.nodeId)) continue;
    const room = roomByNodeId.get(occurrence.nodeId)!;
    generationSockets.push({
      id: allocator.semantic("motif_socket", occurrence.id),
      kind: "landmark",
      cell: nearestWalkableCell(cells, roomCenter(room), room.nodeId),
      label: `${occurrence.motifId} — stage ${occurrence.stageIndex + 1}`,
      node_id: occurrence.nodeId,
      source_opportunity_id: occurrence.id,
      required: occurrence.protected,
      tags: [...new Set([
        ...occurrence.tags,
        "recurrence",
        "backrooms_phase6",
        `motif:${occurrence.motifId}`,
        `motif_stage:${occurrence.stageIndex}`,
      ])].sort(),
    });
  }
  for (const event of input.pacingPlan?.events ?? []) {
    if (generationSockets.some((socket) => socket.node_id === event.nodeId)) continue;
    const room = roomByNodeId.get(event.nodeId)!;
    generationSockets.push({
      id: allocator.semantic("event_socket", event.id),
      kind: event.kind === "narrative" ? "landmark" : "light_control",
      cell: nearestWalkableCell(cells, roomCenter(room), room.nodeId),
      label: event.eventId,
      node_id: event.nodeId,
      source_opportunity_id: event.id,
      required: false,
      tags: ["backrooms_phase6", "noncombat_event", event.kind].sort(),
    });
  }

  const recurrenceNodeIds = new Set(input.pacingPlan?.recurrence.map((entry) => entry.nodeId) ?? []);
  const protectedNodeIds = new Set(input.pacingPlan?.protectedNodeIds ?? []);
  const lightPlacements: Array<
    ObjectPlacementData & { id: string; reservesFloor: boolean }
  > = embedded.rooms
    .slice()
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    .filter((room, index) =>
      // Every fifth room keeps its fixtures dark. Uniform lighting reads as a
      // flat wash however bright it is; the unlit rooms are what make the lit
      // ones look lit, and give the level somewhere to be afraid of.
      index % CEILING_LIGHT_DARK_ROOM_INTERVAL !== CEILING_LIGHT_DARK_ROOM_INTERVAL - 1 &&
      !recurrenceNodeIds.has(room.nodeId) &&
      !protectedNodeIds.has(room.nodeId))
    .flatMap((room) => {
      const seen = new Set<string>();
      const center = roomCenter(room);
      return ceilingGridCells(room)
        .map((target) => nearestWalkableCell(cells, target, room.nodeId))
        .filter((cell) => {
          // Small rooms collapse several lattice points onto the same walkable
          // cell; stacking fixtures there would just cost draw calls.
          const key = `${cell[0]}:${cell[1]}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        // Centre-most first, so index 0 is genuinely the room's own light and
        // the reservation below lands where it means something.
        .sort((left, right) =>
          (Math.abs(left[0] - center[0]) + Math.abs(left[1] - center[1])) -
            (Math.abs(right[0] - center[0]) + Math.abs(right[1] - center[1])) ||
          compareMacroCells(left, right))
        .slice(0, CEILING_LIGHTS_PER_ROOM)
        .map((cell, index) => ({
          id: allocator.semantic("light", `${room.nodeId}:${index}`),
          object_id: BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
          cell,
          facing: [0, 1] as [number, number],
          collision_mode: "none" as const,
          // Only the fixture nearest the room's centre reserves floor from
          // anomaly dressing. A ceiling panel hangs at roughly 2.7m and cannot
          // physically conflict with a desk beneath it, but the central one
          // stands in for "this room's light" — the spot a set piece staged
          // directly underneath would read as deliberately lit rather than
          // incidentally so. Letting every panel in a grid reserve floor
          // starves the anomaly budget in exactly the large open rooms that
          // most want a set piece.
          reservesFloor: index === 0,
        }));
    });
  // Hallway fixtures. A corridor is a run of cells rather than a rectangle, so
  // its lights step along the path instead of filling a lattice. Only walkable
  // cells qualify, and each fixture is scenery: corridors are the one place the
  // player is guaranteed to walk, so nothing here may narrow the lane.
  const corridorLightPlacements: Array<
    ObjectPlacementData & { id: string; reservesFloor: boolean }
  > = embedded.corridors
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .flatMap((corridor) => {
      const walkable = corridor.cells
        .filter((cell) => {
          const entry = cells.get(macroCellKey([cell[0], cell[1]]));
          return Boolean(entry?.walkable);
        })
        .slice()
        .sort((left, right) => compareMacroCells(left, right));
      if (!walkable.length) return [];
      const placements: Array<
        ObjectPlacementData & { id: string; reservesFloor: boolean }
      > = [];
      // `cells` is every cell the corridor occupies, width included, so
      // stepping the index walks ACROSS a three-wide hallway as readily as
      // along it. Space by actual distance instead: take a cell only when it is
      // clear of every fixture already placed in this corridor, which yields an
      // even run down the length whatever the width.
      const chosen: MacroCell[] = [];
      for (const cell of walkable) {
        const tooClose = chosen.some((placed) =>
          Math.max(
            Math.abs(placed[0] - cell[0]),
            Math.abs(placed[1] - cell[1]),
          ) < CORRIDOR_LIGHT_SPACING);
        if (tooClose) continue;
        chosen.push([cell[0], cell[1]]);
        placements.push({
          id: allocator.semantic(
            "corridor_light",
            `${corridor.id}:${cell[0]}:${cell[1]}`,
          ),
          object_id: BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
          cell: [cell[0], cell[1]],
          facing: [0, 1] as [number, number],
          collision_mode: "none" as const,
          // Corridors are too narrow to stage anomalies in anyway, and
          // reserving their floor would only eat into the dressing budget.
          reservesFloor: false,
        });
      }
      return placements;
    });

  const protectedLightPlacements: Array<ObjectPlacementData & { id: string }> = embedded.rooms
    .filter((room) => protectedNodeIds.has(room.nodeId) && !recurrenceNodeIds.has(room.nodeId))
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    .map((room) => ({
      id: allocator.semantic("story_light", room.nodeId),
      object_id: BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
      cell: nearestWalkableCell(cells, roomCenter(room), room.nodeId),
      facing: [0, 1],
      collision_mode: "none" as const,
    }));

  const motifPlacements: Array<ObjectPlacementData & { id: string }> = [];
  for (const occurrence of input.pacingPlan?.recurrence ?? []) {
    const room = roomByNodeId.get(occurrence.nodeId)!;
    const center = roomCenter(room);
    const centerCell = nearestWalkableCell(cells, center, room.nodeId);
    const chairCell = nearestWalkableCell(
      cells,
      [center[0] + 1, center[1]],
      room.nodeId,
    );
    const entranceSocket = room.sockets
      .filter((socket) => embedded.connections.some((connection) =>
        connection.fromSocketId === socket.id || connection.toSocketId === socket.id))
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    motifPlacements.push({
      id: allocator.semantic("motif_stain", occurrence.id),
      object_id: BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
      cell: centerCell,
      facing: [0, 1],
      collision_mode: "none",
    });
    if (occurrence.stageIndex <= 1) {
      motifPlacements.push({
        id: allocator.semantic("motif_chair", occurrence.id),
        object_id: "obj_chair",
        cell: chairCell,
        facing: occurrence.stageIndex === 1 && entranceSocket
          ? [...entranceSocket.facing]
          : [0, 1],
        collision_mode: "none",
      });
      motifPlacements.push({
        id: allocator.semantic("motif_fixture", occurrence.id),
        object_id: BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
        cell: centerCell,
        facing: [0, 1],
        collision_mode: "none",
      });
    } else {
      motifPlacements.push({
        id: allocator.semantic("motif_fixture", occurrence.id),
        object_id: BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
        cell: centerCell,
        facing: [0, 1],
        collision_mode: "none",
      });
    }
  }

  const triggers: TriggerData[] = (input.pacingPlan?.events ?? []).map((event) => {
    const room = roomByNodeId.get(event.nodeId)!;
    return {
      id: allocator.semantic("trigger", event.id),
      cell: nearestWalkableCell(cells, roomCenter(room), room.nodeId),
      type: "step",
      conditions: [],
      cutscene_id: event.cutsceneId,
      once: event.once,
    };
  });

  const partitionAvoidCells: MacroCell[] = [
    spawnCell,
    ...mutablePortalCells,
    ...generationSockets.map((socket): MacroCell => [socket.cell[0], socket.cell[1]]),
    ...triggers.map((trigger): MacroCell => [trigger.cell[0], trigger.cell[1]]),
    ...motifPlacements.map((placement): MacroCell => [placement.cell[0], placement.cell[1]]),
  ];
  const partitionExcludedRoomIds = new Set([
    ...recurrenceNodeIds,
    ...protectedNodeIds,
  ]);
  const fineCellOverrides = buildBackroomsPartitionOverrides(
    recipe,
    embedded.mapId,
    cells,
    partitionAvoidCells,
    partitionExcludedRoomIds,
    spawnCell,
  );
  applyBackroomsDrywallFaces(
    recipe,
    embedded.mapId,
    graph.startNodeId,
    cells,
  );
  const partitionMacroCells = (fineCellOverrides ?? []).map((override): MacroCell => [
    override.macro_cell[0],
    override.macro_cell[1],
  ]);
  const anomalyDressing = input.anomalyProfile
    ? dressBackroomsAnomalies({
        recipe,
        graph,
        embedded,
        pacingPlan: input.pacingPlan,
        profile: input.anomalyProfile,
        cells,
        avoidCells: [
          ...partitionAvoidCells,
          ...partitionMacroCells,
          ...lightPlacements
            .filter((placement) => placement.reservesFloor)
            .map((placement): MacroCell => [placement.cell[0], placement.cell[1]]),
          ...protectedLightPlacements.map((placement): MacroCell => [placement.cell[0], placement.cell[1]]),
        ],
        attemptIndex: input.attemptIndex,
      })
    : { placements: [], diagnostics: [] };
  diagnostics.push(...anomalyDressing.diagnostics);

  try {
    const canonicalResultHash = stableContentHash({
      graph: graph.metrics.canonicalHash,
      embedded: embedded.canonicalHash,
      pacing: input.pacingPlan?.canonicalHash,
      anomalies: anomalyDressing.plan?.canonicalHash,
    });
    const map = buildMap({
      id: embedded.mapId,
      name: embedded.displayName,
      bounds: { width: embedded.width, height: embedded.depth },
      cells: [...cells.values()],
      fineCellOverrides,
      spawns: [{
        id: allocator.semantic("spawn", "start"),
        cell: spawnCell,
        facing: [0, 1],
      }],
      placements: {
        objects: [
          ...lightPlacements,
          ...corridorLightPlacements,
          ...protectedLightPlacements,
          ...motifPlacements,
          ...anomalyDressing.placements,
        ],
      },
      generationSockets,
      triggers,
      // Level 0 is lit BY its fluorescents, not by an ambient wash. The old
      // values were high enough that the fixtures added almost nothing to a
      // floor that was already bright, so the level read as evenly beige and
      // the ceiling grid was decorative. Dropping the fill lets each pool carve
      // out its own patch of floor and leaves real darkness between them.
      //
      // The mechanical value stays above the presentation one: perception and
      // stealth keep enough light to reason about, so lowering the render fill
      // does not quietly turn the level into a blackout for the AI.
      ambientLight: 0.3,
      // The render floor sits well below the mechanical one on purpose. Level 0
      // should read as pools of fluorescent light with real darkness between
      // them, and a fixture can only look bright relative to what surrounds it.
      // Perception and stealth keep the higher `ambientLight` above, so pulling
      // the visible floor down does not blind the AI or change gameplay reach.
      presentationAmbientLight: 0.18,
      metadata: {
        generatorId: recipe.generatorId,
        generatorVersion: recipe.generatorVersion,
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        seed: recipe.seed,
        generatedAt: input.generatedAt ?? "1970-01-01T00:00:00.000Z",
        manuallyModified: false,
        stageSalts: recipe.stageSalts,
        contentLibraryHash: input.contentLibraryHash ?? stableContentHash({
          templates: [...backroomsLevel0TemplateById.keys()].sort(),
          floor: BACKROOMS_LEVEL_ZERO_FLOOR_OBJECT_ID,
          wall: BACKROOMS_LEVEL_ZERO_WALL_OBJECT_ID,
          thinWallKit: "level0_drywall_v2",
          partitionStyles: BACKROOMS_LEVEL_ZERO_PARTITION_WALL_STYLES,
          anomalyProfile: input.anomalyProfile,
          anomalyObjects: BACKROOMS_ANOMALY_OBJECTS,
          light: BACKROOMS_LEVEL_ZERO_LIGHT_OBJECT_ID,
          deadLight: BACKROOMS_LEVEL_ZERO_DEAD_LIGHT_OBJECT_ID,
          stain: BACKROOMS_LEVEL_ZERO_CARPET_STAIN_OBJECT_ID,
        }),
        canonicalResultHash,
        bundleId: `${recipe.id}:${recipe.seed}`,
        floorIndex: 0,
        floorCount: 1,
        attemptIndex: input.attemptIndex ?? 0,
        levelProfileId: recipe.levelProfileId,
      },
    });
    return {
      success: true,
      map,
      anomalies: anomalyDressing.plan,
      diagnostics: sortBackroomsDiagnostics(diagnostics),
    };
  } catch (error) {
    diagnostics.push(backroomsDiagnostic(
      "fatal",
      "embedding",
      "BRG_MAP_BUILD_FAILED",
      error instanceof Error ? error.message : String(error),
    ));
    return {
      success: false,
      anomalies: anomalyDressing.plan,
      diagnostics: sortBackroomsDiagnostics(diagnostics),
    };
  }
};
