import { stableContentHash } from "../../generation-facing/stableHash";
import { DungeonEmbeddedDungeonSchema } from "../schema";
import type {
  DungeonDiagnostic,
  DungeonEmbeddedFloor,
  DungeonGraph,
  DungeonRecipeDef,
  DungeonRoomArchetypeDef,
  DungeonRoomTemplateDef,
  EmbeddedDungeon,
} from "../types";
import { canonicalEmbeddedDungeon } from "../canonical";
import { dungeonDiagnostic, failedStage, successfulStage, type DungeonStageOutput } from "../diagnostics";
import { DungeonSeedContext, type DungeonRandom } from "../seedContext";
import {
  instantiateDungeonRoomTemplate,
  rotatedTemplateBounds,
  type DungeonRotation,
  type InstantiatedDungeonTemplate,
} from "../templates";
import { DungeonOccupancy } from "./occupancy";
import {
  centeredMacroBounds,
  compareMacroCells,
  macroCellInBounds,
  macroCellKey,
  routeCorridor,
  widenCorridor,
  type MacroCell,
  type MacroGridBounds,
} from "./gridSearch";

type PlacedRoom = EmbeddedDungeon["rooms"][number];
type PlacedCorridor = EmbeddedDungeon["corridors"][number];
type PlacedTransition = EmbeddedDungeon["transitions"][number];

export interface DungeonRoomGeometry {
  nodeId: string;
  mapId: string;
  cells: Array<{
    cell: MacroCell;
    walkable: boolean;
    height: number;
    visualHeight: number;
    terrain?: string;
    objectId?: string;
    tag?: string;
    surfaceTag: "none" | "water" | "oil" | "blood" | "poison" | "firehazard" | "ice";
  }>;
  populationSockets: InstantiatedDungeonTemplate["populationSockets"];
}

export interface DungeonSpatialResult {
  graph: DungeonGraph;
  embedded: EmbeddedDungeon;
  roomGeometry: Record<string, DungeonRoomGeometry>;
  edgeSockets: Record<string, { from: MacroCell; to: MacroCell }>;
  embeddingBacktracks: number;
  corridorSearchVisited: number;
}

export interface DungeonEmbeddingInput {
  recipe: DungeonRecipeDef;
  graph: DungeonGraph;
  archetypes: readonly DungeonRoomArchetypeDef[];
  templates: readonly DungeonRoomTemplateDef[];
  seedContext: DungeonSeedContext;
  shouldCancel?: () => boolean;
}

export interface DungeonFloorPartitionResult {
  graph: DungeonGraph;
  floors: DungeonEmbeddedFloor[];
}

const floorMapId = (recipe: DungeonRecipeDef, floorIndex: number) => {
  const recipeToken = recipe.id.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "recipe";
  const seedHash = stableContentHash({ recipe: recipe.id, seed: recipe.seed }).slice(-10);
  return `dng_${recipeToken}_${seedHash}_f${floorIndex}`;
};

const criticalNodes = (graph: DungeonGraph) =>
  graph.nodes.filter((node) => node.mandatory).sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));

export const partitionDungeonFloors = (
  recipe: DungeonRecipeDef,
  sourceGraph: DungeonGraph,
  rng: DungeonRandom,
  archetypes: readonly DungeonRoomArchetypeDef[] = [],
): DungeonStageOutput<DungeonFloorPartitionResult> => {
  const graph = structuredClone(sourceGraph);
  const spine = criticalNodes(graph);
  const requested = recipe.outputMode === "single_map" ? 1 : rng.intBetween(recipe.scale.floorCount.min, recipe.scale.floorCount.max);
  const floorCount = Math.max(1, Math.min(requested, spine.length, 3));
  const floorByNode = new Map<string, number>();
  const validHints = graph.nodes.every((node) => Number.isInteger(node.floorHint) && node.floorHint! >= 0 && node.floorHint! < floorCount) &&
    new Set(graph.nodes.map((node) => node.floorHint)).size === floorCount;
  if (validHints) graph.nodes.forEach((node) => floorByNode.set(node.id, node.floorHint!));
  else spine.forEach((node, index) => {
    const floorIndex = Math.min(floorCount - 1, Math.floor(index * floorCount / spine.length));
    floorByNode.set(node.id, floorIndex);
  });
  // Optional branches remain with their mandatory attachment so every floor
  // group is connected before cross-floor transitions are introduced.
  const unresolved = graph.nodes.filter((node) => !floorByNode.has(node.id)).sort((left, right) => left.id.localeCompare(right.id));
  while (unresolved.length) {
    const before = unresolved.length;
    for (let index = unresolved.length - 1; index >= 0; index -= 1) {
      const node = unresolved[index];
      const neighbor = graph.edges.flatMap((edge) =>
        edge.fromNodeId === node.id ? [edge.toNodeId] : edge.toNodeId === node.id ? [edge.fromNodeId] : [])
        .find((id) => floorByNode.has(id));
      if (!neighbor) continue;
      floorByNode.set(node.id, floorByNode.get(neighbor)!);
      unresolved.splice(index, 1);
    }
    if (unresolved.length === before) break;
  }
  unresolved.forEach((node) => floorByNode.set(node.id, Math.min(floorCount - 1, Math.floor(node.depth * floorCount))));
  graph.nodes.forEach((node) => { node.floorHint = floorByNode.get(node.id) ?? 0; });
  const diagnostics: DungeonDiagnostic[] = [];
  graph.edges.forEach((edge) => {
    if (floorByNode.get(edge.fromNodeId) !== floorByNode.get(edge.toNodeId)) {
      const from = graph.nodes.find((node) => node.id === edge.fromNodeId)!;
      const to = graph.nodes.find((node) => node.id === edge.toNodeId)!;
      if (edge.gateId || graph.gates.some((gate) => gate.edgeId === edge.id)) diagnostics.push(dungeonDiagnostic(
        "fatal", "floor_partition", "DNG_GATED_VERTICAL_BOUNDARY",
        `Gated edge ${edge.id} cannot be converted into an unconditional vertical transition.`,
        { relatedIds: [edge.id, edge.gateId ?? "gate"] },
      ));
      if (!from.tags.includes("vertical_landing") || !to.tags.includes("vertical_landing")) diagnostics.push(dungeonDiagnostic(
        "fatal", "floor_partition", "DNG_VERTICAL_LANDING_ARCHETYPE_MISSING",
        `Cross-floor edge ${edge.id} does not connect planned vertical landing rooms.`,
        { relatedIds: [edge.id, from.id, to.id] },
      ));
      if (archetypes.length) {
        const isVertical = (node: DungeonGraph["nodes"][number]) => {
          const definition = archetypes.find((entry) => entry.id === node.archetypeId);
          return Boolean(definition && (definition.tags.includes("vertical") ||
            definition.requiredSocketKinds.includes("vertical") || definition.id.toLowerCase().includes("vertical")));
        };
        if (!isVertical(from) || !isVertical(to)) diagnostics.push(dungeonDiagnostic(
          "fatal", "floor_partition", "DNG_VERTICAL_LANDING_ARCHETYPE_MISSING",
          `Cross-floor edge ${edge.id} endpoints must both use vertical-capable archetypes.`,
          { relatedIds: [edge.id, from.archetypeId, to.archetypeId] },
        ));
      }
      edge.kind = "vertical";
      edge.tags = [...new Set([...edge.tags, "vertical", "floor_transition"])].sort();
    }
  });
  const floors: DungeonEmbeddedFloor[] = Array.from({ length: floorCount }, (_, floorIndex) => ({
    mapId: floorMapId(recipe, floorIndex),
    displayName: `${recipe.name} — Floor ${floorIndex + 1}`,
    floorIndex,
    width: recipe.scale.floorMapWidth,
    depth: recipe.scale.floorMapDepth,
    themeTags: [recipe.themeId, `floor_${floorIndex}`],
    nodeIds: graph.nodes.filter((node) => node.floorHint === floorIndex).map((node) => node.id).sort(),
  }));
  for (const floor of floors) {
    if (floor.nodeIds.length < 2 && graph.nodes.length > floorCount) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "floor_partition", "DNG_FLOOR_TOO_SMALL",
        `${floor.displayName} contains no meaningful room beyond its landing.`,
        { mapId: floor.mapId, relatedIds: floor.nodeIds },
      ));
    }
  }
  const metrics = { floorCount, crossFloorEdges: graph.edges.filter((edge) => edge.kind === "vertical").length };
  return diagnostics.some((entry) => entry.severity === "fatal")
    ? failedStage(diagnostics, metrics)
    : successfulStage({ graph, floors }, diagnostics, metrics);
};

interface PreparedRoom {
  nodeId: string;
  mapId: string;
  width: number;
  depth: number;
  rotation: DungeonRotation;
  template?: DungeonRoomTemplateDef;
  builderId?: string;
}

type DungeonLayoutStyle = "organic" | "directional_crawl";

const recipeLayoutStyle = (recipe: DungeonRecipeDef): DungeonLayoutStyle =>
  ((recipe.architecture as DungeonRecipeDef["architecture"] & { layoutStyle?: DungeonLayoutStyle }).layoutStyle ?? "organic");

const proceduralLocalCells = (
  builderId: string,
  width: number,
  depth: number,
): MacroCell[] => {
  const cells: MacroCell[] = [];
  const lArmWidth = Math.max(2, Math.ceil(width / 3));
  const lArmDepth = Math.max(2, Math.ceil(depth / 3));
  const junctionMinX = Math.floor((width - 2) / 2);
  const junctionMaxX = junctionMinX + 1;
  const junctionMinZ = Math.floor((depth - 2) / 2);
  const junctionMaxZ = junctionMinZ + 1;
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const walkable = builderId === "l_room_v1"
        ? x < lArmWidth || z >= depth - lArmDepth
        : builderId === "junction_room_v1"
          ? (x >= junctionMinX && x <= junctionMaxX) || (z >= junctionMinZ && z <= junctionMaxZ)
          : true;
      if (walkable) cells.push([x, z]);
    }
  }
  return cells;
};

const proceduralSockets = (
  nodeId: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  socketWidth: number,
  localCells: readonly MacroCell[],
): PlacedRoom["sockets"] => {
  const centeredBoundaryCell = (
    candidates: readonly MacroCell[],
    axis: 0 | 1,
    target: number,
  ) => [...candidates].sort((left, right) =>
    Math.abs(left[axis] - target) - Math.abs(right[axis] - target) || compareMacroCells(left, right))[0];
  const north = centeredBoundaryCell(localCells.filter((cell) => cell[1] === 0), 0, Math.floor(width / 2));
  const east = centeredBoundaryCell(localCells.filter((cell) => cell[0] === width - 1), 1, Math.floor(depth / 2));
  const south = centeredBoundaryCell(localCells.filter((cell) => cell[1] === depth - 1), 0, Math.floor(width / 2));
  const west = centeredBoundaryCell(localCells.filter((cell) => cell[0] === 0), 1, Math.floor(depth / 2));
  const socket = (
    id: string,
    local: MacroCell,
    facing: MacroCell,
    tags: string[],
  ): PlacedRoom["sockets"][number] => ({
    id: `${nodeId}:${id}`,
    cell: [x + local[0], z + local[1]],
    facing,
    width: socketWidth,
    elevation: 0,
    tags,
  });
  return [
    socket("north", north, [0, -1], ["main"]),
    socket("east", east, [1, 0], ["side"]),
    socket("south", south, [0, 1], ["main"]),
    socket("west", west, [-1, 0], ["side"]),
  ];
};

const proceduralRoom = (
  prepared: PreparedRoom,
  origin: MacroCell,
  socketWidth: number,
): { room: PlacedRoom; geometry: DungeonRoomGeometry } => {
  const builderId = prepared.builderId ?? "rectangular_room_v1";
  const localCells = proceduralLocalCells(builderId, prepared.width, prepared.depth);
  const cells: DungeonRoomGeometry["cells"] = localCells.map((cell) => ({
    cell: [origin[0] + cell[0], origin[1] + cell[1]],
    walkable: true,
    height: 0,
    visualHeight: 0,
    surfaceTag: "none",
    tag: "procedural_room",
  }));
  return {
    room: {
      nodeId: prepared.nodeId,
      mapId: prepared.mapId,
      builderId,
      origin: [...origin],
      rotation: prepared.rotation,
      bounds: { x: origin[0], z: origin[1], width: prepared.width, depth: prepared.depth },
      sockets: proceduralSockets(
        prepared.nodeId,
        origin[0],
        origin[1],
        prepared.width,
        prepared.depth,
        socketWidth,
        localCells,
      ),
      reservedCells: [],
    },
    geometry: { nodeId: prepared.nodeId, mapId: prepared.mapId, cells, populationSockets: [] },
  };
};

const realizePreparedRoom = (
  prepared: PreparedRoom,
  origin: MacroCell,
  socketWidth: number,
): { room: PlacedRoom; geometry: DungeonRoomGeometry } => {
  if (!prepared.template) return proceduralRoom(prepared, origin, socketWidth);
  const instantiated = instantiateDungeonRoomTemplate(prepared.template, {
    nodeId: prepared.nodeId,
    mapId: prepared.mapId,
    origin,
    rotation: prepared.rotation,
  });
  return {
    room: instantiated.room,
    geometry: {
      nodeId: prepared.nodeId,
      mapId: prepared.mapId,
      cells: instantiated.cells,
      populationSockets: instantiated.populationSockets,
    },
  };
};

const rectangleCells = (x: number, z: number, width: number, depth: number): MacroCell[] => {
  const cells: MacroCell[] = [];
  for (let dz = 0; dz < depth; dz += 1) for (let dx = 0; dx < width; dx += 1) cells.push([x + dx, z + dz]);
  return cells;
};

const paddedRectangleCells = (
  x: number,
  z: number,
  width: number,
  depth: number,
  padding: number,
): MacroCell[] => rectangleCells(x - padding, z - padding, width + padding * 2, depth + padding * 2)
  .filter(([cx, cz]) => cx < x || cx >= x + width || cz < z || cz >= z + depth);

const placedCenter = (room: PlacedRoom): MacroCell => [
  room.bounds.x + Math.floor(room.bounds.width / 2),
  room.bounds.z + Math.floor(room.bounds.depth / 2),
];

const organicCandidateOrigins = (
  prepared: PreparedRoom,
  placed: ReadonlyMap<string, PlacedRoom>,
  graph: DungeonGraph,
  bounds: MacroGridBounds,
  padding: number,
  rng: DungeonRandom,
): MacroCell[] => {
  if (!placed.size) {
    return [[-Math.floor(prepared.width / 2), -Math.floor(prepared.depth / 2)]];
  }
  const neighborIds = graph.edges.flatMap((edge) =>
    edge.fromNodeId === prepared.nodeId ? [edge.toNodeId] : edge.toNodeId === prepared.nodeId ? [edge.fromNodeId] : [])
    .filter((id) => placed.has(id));
  const anchors = (neighborIds.length ? neighborIds.map((id) => placed.get(id)!) : [...placed.values()])
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const candidates: Array<{ id: string; cell: MacroCell; score: number }> = [];
  for (const anchor of anchors) {
    const gapValues = [2 + padding, 3 + padding, 5 + padding];
    for (const gap of gapValues) {
      const alignedZ = anchor.bounds.z + Math.floor((anchor.bounds.depth - prepared.depth) / 2);
      const alignedX = anchor.bounds.x + Math.floor((anchor.bounds.width - prepared.width) / 2);
      const origins: MacroCell[] = [
        [anchor.bounds.x + anchor.bounds.width + gap, alignedZ],
        [anchor.bounds.x - prepared.width - gap, alignedZ],
        [alignedX, anchor.bounds.z + anchor.bounds.depth + gap],
        [alignedX, anchor.bounds.z - prepared.depth - gap],
      ];
      for (const cell of origins) {
        const corners: MacroCell[] = [cell, [cell[0] + prepared.width - 1, cell[1] + prepared.depth - 1]];
        if (corners.some((corner) => !macroCellInBounds(corner, bounds))) continue;
        const center: MacroCell = [cell[0] + Math.floor(prepared.width / 2), cell[1] + Math.floor(prepared.depth / 2)];
        const anchorCenter = placedCenter(anchor);
        const score = Math.abs(center[0]) + Math.abs(center[1]) +
          Math.abs(center[0] - anchorCenter[0]) + Math.abs(center[1] - anchorCenter[1]);
        candidates.push({ id: `${anchor.nodeId}:${cell[0]}:${cell[1]}`, cell, score });
      }
    }
  }
  // Modern ECMAScript sorting is stable, so the stream-controlled shuffle is
  // retained as the tie breaker among equally scored placements.
  return rng.shuffleById(candidates).sort((left, right) => left.score - right.score)
    .map((candidate) => candidate.cell);
};

const connectedPlacedRooms = (
  nodeId: string,
  placed: ReadonlyMap<string, PlacedRoom>,
  graph: DungeonGraph,
) => graph.edges.flatMap((edge) =>
  edge.fromNodeId === nodeId ? [edge.toNodeId] : edge.toNodeId === nodeId ? [edge.fromNodeId] : [])
  .filter((id) => placed.has(id))
  .map((id) => placed.get(id)!)
  .sort((left, right) => left.nodeId.localeCompare(right.nodeId));

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const directionalTargetCenter = (
  prepared: PreparedRoom,
  placed: ReadonlyMap<string, PlacedRoom>,
  graph: DungeonGraph,
  bounds: MacroGridBounds,
  padding: number,
): MacroCell => {
  const node = graph.nodes.find((entry) => entry.id === prepared.nodeId)!;
  const inset = Math.max(4, padding + 3);
  const halfWidth = Math.floor(prepared.width / 2);
  const halfDepth = Math.floor(prepared.depth / 2);
  const minCenterX = bounds.minX + halfWidth + inset;
  const maxCenterX = bounds.maxX - (prepared.width - halfWidth - 1) - inset;
  const minCenterZ = bounds.minZ + halfDepth + inset;
  const maxCenterZ = bounds.maxZ - (prepared.depth - halfDepth - 1) - inset;
  const mandatory = criticalNodes(graph);
  if (node.mandatory) {
    const criticalIndex = Math.max(0, mandatory.findIndex((entry) => entry.id === node.id));
    const progress = mandatory.length <= 1 ? 0 : criticalIndex / (mandatory.length - 1);
    const laneReach = Math.min(13, Math.max(0, Math.floor((maxCenterX - minCenterX) / 3)));
    const lanePattern = [0, -1, 0, 1] as const;
    const targetX = clamp(lanePattern[criticalIndex % lanePattern.length] * laneReach, minCenterX, maxCenterX);
    const targetZ = Math.round(maxCenterZ + (minCenterZ - maxCenterZ) * progress);
    return [targetX, clamp(targetZ, minCenterZ, maxCenterZ)];
  }

  const branchNodes = graph.nodes.filter((entry) => entry.branchId === node.branchId)
    .sort((left, right) => left.id.localeCompare(right.id));
  const branchMember = Math.max(0, branchNodes.findIndex((entry) => entry.id === node.id));
  const attachmentId = graph.edges.flatMap((edge) => {
    if (edge.fromNodeId === branchNodes[0]?.id) return [edge.toNodeId];
    if (edge.toNodeId === branchNodes[0]?.id) return [edge.fromNodeId];
    return [];
  }).find((id) => graph.nodes.find((entry) => entry.id === id)?.mandatory);
  const attachment = attachmentId ? placed.get(attachmentId) : undefined;
  const anchor = attachment ? placedCenter(attachment) : connectedPlacedRooms(node.id, placed, graph).map(placedCenter)[0] ?? [0, 0];
  const branchNumber = Number(node.branchId?.match(/(\d+)$/)?.[1] ?? 0);
  const side = branchNumber % 2 === 0 ? -1 : 1;
  const lateralStep = 9 + branchMember * 7;
  const targetX = clamp(anchor[0] + side * lateralStep, minCenterX, maxCenterX);
  const targetZ = clamp(anchor[1] - 2 - branchMember * 2 + (branchNumber % 3 - 1) * 2, minCenterZ, maxCenterZ);
  return [targetX, targetZ];
};

const directionalCandidateOrigins = (
  prepared: PreparedRoom,
  placed: ReadonlyMap<string, PlacedRoom>,
  graph: DungeonGraph,
  bounds: MacroGridBounds,
  padding: number,
  rng: DungeonRandom,
): MacroCell[] => {
  const target = directionalTargetCenter(prepared, placed, graph, bounds, padding);
  const neighbors = connectedPlacedRooms(prepared.nodeId, placed, graph);
  const candidates = new Map<string, { id: string; cell: MacroCell; score: number }>();
  const addCandidate = (cell: MacroCell) => {
    const opposite: MacroCell = [cell[0] + prepared.width - 1, cell[1] + prepared.depth - 1];
    if (!macroCellInBounds(cell, bounds) || !macroCellInBounds(opposite, bounds)) return;
    const center: MacroCell = [cell[0] + Math.floor(prepared.width / 2), cell[1] + Math.floor(prepared.depth / 2)];
    const neighborDistances = neighbors.map((room) => {
      const roomCenter = placedCenter(room);
      return Math.abs(center[0] - roomCenter[0]) + Math.abs(center[1] - roomCenter[1]);
    });
    const maximumNeighborDistance = Math.max(0, ...neighborDistances);
    const neighborDistance = neighborDistances.reduce((sum, distance) => sum + distance, 0);
    const targetDistance = Math.abs(center[0] - target[0]) + Math.abs(center[1] - target[1]);
    const node = graph.nodes.find((entry) => entry.id === prepared.nodeId)!;
    let directionPenalty = 0;
    if (node.mandatory) {
      for (const room of neighbors) {
        const neighbor = graph.nodes.find((entry) => entry.id === room.nodeId);
        if (!neighbor?.mandatory || neighbor.depth >= node.depth) continue;
        const northwardProgress = placedCenter(room)[1] - center[1];
        if (northwardProgress < 2) directionPenalty += (2 - northwardProgress) * 120;
      }
    }
    const loopDistancePenalty = graph.edges
      .filter((edge) => edge.tags.includes("loop") &&
        (edge.fromNodeId === node.id || edge.toNodeId === node.id))
      .flatMap((edge) => {
        const otherId = edge.fromNodeId === node.id ? edge.toNodeId : edge.fromNodeId;
        const other = placed.get(otherId);
        if (!other) return [];
        const otherCenter = placedCenter(other);
        const distance = Math.abs(center[0] - otherCenter[0]) + Math.abs(center[1] - otherCenter[1]);
        return [Math.max(0, distance - 18) * 80];
      }).reduce((sum, penalty) => sum + penalty, 0);
    const longConnectionPenalty = Math.max(0, maximumNeighborDistance - 24) ** 2 * 40;
    const key = `${cell[0]}:${cell[1]}`;
    candidates.set(key, {
      id: `${prepared.nodeId}:${key}`,
      cell,
      score: targetDistance * 5 + neighborDistance * 2 + maximumNeighborDistance * 2 +
        directionPenalty + loopDistancePenalty + longConnectionPenalty,
    });
  };
  const originForCenter = (center: MacroCell): MacroCell =>
    [center[0] - Math.floor(prepared.width / 2), center[1] - Math.floor(prepared.depth / 2)];
  for (const dx of [0, -3, 3, -6, 6]) {
    for (const dz of [0, -2, 2, -4, 4]) addCandidate(originForCenter([target[0] + dx, target[1] + dz]));
  }
  for (const anchor of neighbors.length ? neighbors : [...placed.values()]) {
    for (const gap of [2 + padding, 4 + padding, 6 + padding]) {
      const alignedZ = anchor.bounds.z + Math.floor((anchor.bounds.depth - prepared.depth) / 2);
      const alignedX = anchor.bounds.x + Math.floor((anchor.bounds.width - prepared.width) / 2);
      addCandidate([anchor.bounds.x + anchor.bounds.width + gap, alignedZ]);
      addCandidate([anchor.bounds.x - prepared.width - gap, alignedZ]);
      addCandidate([alignedX, anchor.bounds.z + anchor.bounds.depth + gap]);
      addCandidate([alignedX, anchor.bounds.z - prepared.depth - gap]);
    }
  }
  return rng.shuffleById([...candidates.values()]).sort((left, right) => left.score - right.score)
    .map((candidate) => candidate.cell);
};

const candidateOrigins = (
  prepared: PreparedRoom,
  placed: ReadonlyMap<string, PlacedRoom>,
  graph: DungeonGraph,
  bounds: MacroGridBounds,
  padding: number,
  rng: DungeonRandom,
  layoutStyle: DungeonLayoutStyle,
) => layoutStyle === "directional_crawl"
  ? directionalCandidateOrigins(prepared, placed, graph, bounds, padding, rng)
  : organicCandidateOrigins(prepared, placed, graph, bounds, padding, rng);

const floorPlacementOrder = (
  graph: DungeonGraph,
  nodeIds: readonly string[],
  layoutStyle: DungeonLayoutStyle = "organic",
) => {
  if (layoutStyle === "directional_crawl") {
    const allowed = new Set(nodeIds);
    const critical = criticalNodes(graph).filter((node) => allowed.has(node.id)).map((node) => node.id);
    const optional = graph.nodes.filter((node) => allowed.has(node.id) && !node.mandatory)
      .sort((left, right) => (left.branchId ?? "").localeCompare(right.branchId ?? "") ||
        left.id.localeCompare(right.id))
      .map((node) => node.id);
    const included = new Set([...critical, ...optional]);
    return [...critical, ...optional, ...nodeIds.filter((id) => !included.has(id)).sort()];
  }
  const allowed = new Set(nodeIds);
  const degree = new Map(nodeIds.map((id) => [id, 0]));
  graph.edges.forEach((edge) => {
    if (allowed.has(edge.fromNodeId) && allowed.has(edge.toNodeId)) {
      degree.set(edge.fromNodeId, (degree.get(edge.fromNodeId) ?? 0) + 1);
      degree.set(edge.toNodeId, (degree.get(edge.toNodeId) ?? 0) + 1);
    }
  });
  const start = allowed.has(graph.entranceNodeId)
    ? graph.entranceNodeId
    : criticalNodes(graph).find((node) => allowed.has(node.id))?.id ?? nodeIds[0];
  const reached = new Set<string>();
  const queue = [start];
  const result: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    if (reached.has(current)) continue;
    reached.add(current);
    result.push(current);
    const neighbors = graph.edges.flatMap((edge) =>
      edge.fromNodeId === current ? [edge.toNodeId] : edge.toNodeId === current ? [edge.fromNodeId] : [])
      .filter((id) => allowed.has(id) && !reached.has(id))
      .sort((left, right) => (degree.get(right) ?? 0) - (degree.get(left) ?? 0) || left.localeCompare(right));
    queue.push(...neighbors);
  }
  result.push(...nodeIds.filter((id) => !reached.has(id)).sort());
  return result;
};

const choosePreparedRooms = (
  input: DungeonEmbeddingInput,
  floors: readonly DungeonEmbeddedFloor[],
  shapeRng: DungeonRandom,
): PreparedRoom[] => {
  const archetypeById = new Map(input.archetypes.map((archetype) => [archetype.id, archetype]));
  const templateById = new Map(input.templates.map((template) => [template.id, template]));
  const mapByNode = new Map(floors.flatMap((floor) => floor.nodeIds.map((id) => [id, floor.mapId] as const)));
  const layoutStyle = recipeLayoutStyle(input.recipe);
  const requiredDirectionalBuilders = layoutStyle === "directional_crawl"
    ? ["rectangular_room_v1", "l_room_v1", "junction_room_v1"].filter((id) =>
      input.recipe.architecture.proceduralRoomBuilderPool.some((entry) => entry.id === id))
    : [];
  let templateCount = 0;
  let proceduralCount = 0;
  return [...input.graph.nodes].sort((left, right) => left.id.localeCompare(right.id)).map((node, index) => {
    const archetype = archetypeById.get(node.archetypeId);
    const compatibleTemplates = input.recipe.architecture.roomTemplatePool
      .map((entry) => ({ ...entry, template: templateById.get(entry.id) }))
      .filter((entry): entry is typeof entry & { template: DungeonRoomTemplateDef } =>
        Boolean(entry.template?.archetypeIds.includes(node.archetypeId)));
    const hasProcedural = input.recipe.architecture.proceduralRoomBuilderPool.length > 0;
    let useTemplate = compatibleTemplates.length > 0 && (!hasProcedural ||
      templateCount === 0 || (proceduralCount > 0 && shapeRng.chance(0.3)));
    if (layoutStyle === "directional_crawl" &&
      node.tags.includes("entrance") && compatibleTemplates.length) useTemplate = true;
    // Keep the objective procedural unless an objective-compatible template exists.
    if (node.tags.includes("objective") && !compatibleTemplates.length) useTemplate = false;
    if (useTemplate) {
      const template = shapeRng.weighted(compatibleTemplates.map((entry) => ({
        id: entry.id, weight: entry.weight, value: entry.template,
      })), `room-template:${node.id}`);
      const rotation = shapeRng.pick([...template.rotationModes].sort((a, b) => a - b)) as DungeonRotation;
      const bounds = rotatedTemplateBounds(template.bounds, rotation);
      templateCount += 1;
      return { nodeId: node.id, mapId: mapByNode.get(node.id)!, width: bounds.width, depth: bounds.depth, rotation, template };
    }
    const builder = requiredDirectionalBuilders.length
      ? requiredDirectionalBuilders[proceduralCount % requiredDirectionalBuilders.length]
      : shapeRng.weighted(input.recipe.architecture.proceduralRoomBuilderPool.map((entry) => ({
        id: entry.id, weight: entry.weight, value: entry.id,
      })), `room-builder:${node.id}`);
    proceduralCount += 1;
    const widthMin = Math.max(input.recipe.scale.roomWidth.min, archetype?.minWidth ?? 1);
    const widthMax = Math.min(input.recipe.scale.roomWidth.max, archetype?.maxWidth ?? input.recipe.scale.roomWidth.max);
    const depthMin = Math.max(input.recipe.scale.roomDepth.min, archetype?.minDepth ?? 1);
    const depthMax = Math.min(input.recipe.scale.roomDepth.max, archetype?.maxDepth ?? input.recipe.scale.roomDepth.max);
    // The directional preset spends its scale on route length and lateral
    // branches. Capping ordinary room footprints keeps the one-map result
    // under the fine-cell budget without shrinking objective/entrance minima.
    const directionalWidthMax = layoutStyle === "directional_crawl"
      ? Math.max(widthMin, Math.min(widthMax, 9))
      : widthMax;
    const directionalDepthMax = layoutStyle === "directional_crawl"
      ? Math.max(depthMin, Math.min(depthMax, 9))
      : depthMax;
    return {
      nodeId: node.id,
      mapId: mapByNode.get(node.id)!,
      width: shapeRng.intBetween(widthMin, directionalWidthMax),
      depth: shapeRng.intBetween(depthMin, directionalDepthMax),
      rotation: 0,
      builderId: builder,
    };
  });
};

const chooseSocketPair = (from: PlacedRoom, to: PlacedRoom) => {
  const pairs = from.sockets.flatMap((left) => to.sockets.map((right) => ({
    left,
    right,
    distance: Math.abs(left.cell[0] - right.cell[0]) + Math.abs(left.cell[1] - right.cell[1]),
    facingPenalty: Math.max(0, left.facing[0] * right.facing[0] + left.facing[1] * right.facing[1] + 1) * 10,
  })));
  return pairs.sort((a, b) => a.distance + a.facingPenalty - (b.distance + b.facingPenalty) ||
    a.left.id.localeCompare(b.left.id) || a.right.id.localeCompare(b.right.id))[0];
};

export const auditEmbeddedDungeon = (
  graph: DungeonGraph,
  embedded: EmbeddedDungeon,
): DungeonDiagnostic[] => {
  const diagnostics: DungeonDiagnostic[] = [];
  const roomByNode = new Map(embedded.rooms.map((room) => [room.nodeId, room]));
  for (const node of graph.nodes) {
    if (!roomByNode.has(node.id)) diagnostics.push(dungeonDiagnostic(
      "fatal", "geometry", "DNG_ROOM_NOT_EMBEDDED", `Graph node ${node.id} has no placed room.`, { nodeId: node.id },
    ));
  }
  for (const floor of embedded.maps) {
    const bounds = centeredMacroBounds(floor.width, floor.depth);
    const rooms = embedded.rooms.filter((room) => room.mapId === floor.mapId);
    for (let left = 0; left < rooms.length; left += 1) {
      const a = rooms[left];
      const corners: MacroCell[] = [[a.bounds.x, a.bounds.z], [a.bounds.x + a.bounds.width - 1, a.bounds.z + a.bounds.depth - 1]];
      if (corners.some((cell) => !macroCellInBounds(cell, bounds))) diagnostics.push(dungeonDiagnostic(
        "fatal", "geometry", "DNG_ROOM_OUT_OF_BOUNDS", `Room ${a.nodeId} exceeds ${floor.mapId} bounds.`,
        { nodeId: a.nodeId, mapId: floor.mapId },
      ));
      for (let right = left + 1; right < rooms.length; right += 1) {
        const b = rooms[right];
        const overlap = a.bounds.x <= b.bounds.x + b.bounds.width - 1 && a.bounds.x + a.bounds.width - 1 >= b.bounds.x &&
          a.bounds.z <= b.bounds.z + b.bounds.depth - 1 && a.bounds.z + a.bounds.depth - 1 >= b.bounds.z;
        if (overlap) diagnostics.push(dungeonDiagnostic(
          "fatal", "geometry", "DNG_ROOM_OVERLAP", `Rooms ${a.nodeId} and ${b.nodeId} overlap.`,
          { mapId: floor.mapId, relatedIds: [a.nodeId, b.nodeId] },
        ));
      }
    }
    for (const corridor of embedded.corridors.filter((entry) => entry.mapId === floor.mapId)) {
      const out = corridor.cells.find((cell) => !macroCellInBounds(cell, bounds));
      if (out) diagnostics.push(dungeonDiagnostic(
        "fatal", "geometry", "DNG_CORRIDOR_OUT_OF_BOUNDS", `Corridor ${corridor.id} exits map bounds.`,
        { mapId: floor.mapId, cell: out, relatedIds: [corridor.id] },
      ));
      const cellKeys = new Set(corridor.cells.map(macroCellKey));
      const reached = new Set<string>();
      const queue: MacroCell[] = corridor.cells.length ? [[...corridor.cells[0]]] : [];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const cell = queue[cursor];
        const key = macroCellKey(cell);
        if (reached.has(key)) continue;
        reached.add(key);
        const neighbors: MacroCell[] = [[cell[0] + 1, cell[1]], [cell[0] - 1, cell[1]], [cell[0], cell[1] + 1], [cell[0], cell[1] - 1]];
        neighbors.forEach((neighbor) => {
          const neighborKey = macroCellKey(neighbor);
          if (cellKeys.has(neighborKey) && !reached.has(neighborKey)) queue.push(neighbor);
        });
      }
      if (reached.size !== cellKeys.size) diagnostics.push(dungeonDiagnostic(
        "fatal", "geometry", "DNG_CORRIDOR_DISCONNECTED",
        `Corridor ${corridor.id} contains widened cells disconnected from its cardinal path.`,
        { mapId: floor.mapId, relatedIds: [corridor.id] },
      ));
      const graphEdge = graph.edges.find((edge) => edge.id === corridor.edgeId);
      const fromRoom = graphEdge ? roomByNode.get(graphEdge.fromNodeId) : undefined;
      const toRoom = graphEdge ? roomByNode.get(graphEdge.toNodeId) : undefined;
      const touchesFrom = fromRoom?.sockets.some((socket) => cellKeys.has(macroCellKey(socket.cell)));
      const touchesTo = toRoom?.sockets.some((socket) => cellKeys.has(macroCellKey(socket.cell)));
      if (!touchesFrom || !touchesTo) diagnostics.push(dungeonDiagnostic(
        "fatal", "geometry", "DNG_CORRIDOR_SOCKET_ENDPOINT_MISSING",
        `Corridor ${corridor.id} does not include both selected room socket endpoints.`,
        { mapId: floor.mapId, relatedIds: [corridor.id, graphEdge?.fromNodeId ?? "from", graphEdge?.toNodeId ?? "to"] },
      ));
    }
  }
  for (const edge of graph.edges) {
    const from = roomByNode.get(edge.fromNodeId);
    const to = roomByNode.get(edge.toNodeId);
    if (!from || !to) continue;
    const represented = from.mapId === to.mapId
      ? embedded.corridors.some((corridor) => corridor.edgeId === edge.id)
      : embedded.transitions.some((transition) => transition.edgeId === edge.id);
    if (!represented) diagnostics.push(dungeonDiagnostic(
      "fatal", "geometry", "DNG_EDGE_NOT_EMBEDDED", `Graph edge ${edge.id} has no corridor or transition.`,
      { relatedIds: [edge.id, edge.fromNodeId, edge.toNodeId] },
    ));
  }
  return diagnostics;
};

export const embedDungeon = (
  input: DungeonEmbeddingInput,
): DungeonStageOutput<DungeonSpatialResult> => {
  const partition = partitionDungeonFloors(input.recipe, input.graph, input.seedContext.stream("floor_partition"), input.archetypes);
  if (!partition.value) return failedStage(partition.diagnostics, partition.metrics);
  const graph = partition.value.graph;
  const floors = partition.value.floors;
  const archetypeById = new Map(input.archetypes.map((entry) => [entry.id, entry]));
  const emptySizeIntersections = graph.nodes.filter((node) => {
    const archetype = archetypeById.get(node.archetypeId);
    return archetype && (Math.max(input.recipe.scale.roomWidth.min, archetype.minWidth) >
      Math.min(input.recipe.scale.roomWidth.max, archetype.maxWidth) ||
      Math.max(input.recipe.scale.roomDepth.min, archetype.minDepth) >
      Math.min(input.recipe.scale.roomDepth.max, archetype.maxDepth));
  });
  if (emptySizeIntersections.length) return failedStage(emptySizeIntersections.map((node) => dungeonDiagnostic(
    "fatal", "recipe", "DNG_ARCHETYPE_SIZE_INTERSECTION_EMPTY",
    `Archetype ${node.archetypeId} has no room-size intersection with the recipe for node ${node.id}.`,
    { nodeId: node.id, relatedIds: [node.archetypeId] },
  )));
  const shapeRng = input.seedContext.stream("room_shapes");
  const embeddingRng = input.seedContext.stream("embedding");
  const corridorRng = input.seedContext.stream("corridors");
  const preparedRooms = choosePreparedRooms({ ...input, graph }, floors, shapeRng);
  const preparedByNode = new Map(preparedRooms.map((room) => [room.nodeId, room]));
  const layoutStyle = recipeLayoutStyle(input.recipe);
  const rooms: PlacedRoom[] = [];
  const roomGeometry: Record<string, DungeonRoomGeometry> = {};
  let embeddingBacktracks = 0;

  for (const floor of floors) {
    const bounds = centeredMacroBounds(floor.width, floor.depth);
    const occupancy = new DungeonOccupancy(bounds);
    const placed = new Map<string, PlacedRoom>();
    const geometry = new Map<string, DungeonRoomGeometry>();
    const order = floorPlacementOrder(graph, floor.nodeIds, layoutStyle);
    const recurse = (index: number, current: DungeonOccupancy): DungeonOccupancy | undefined => {
      if (input.shouldCancel?.()) return undefined;
      if (index >= order.length) return current;
      const prepared = preparedByNode.get(order[index])!;
      const origins = candidateOrigins(
        prepared,
        placed,
        graph,
        bounds,
        input.recipe.architecture.roomPadding,
        embeddingRng,
        layoutStyle,
      );
      for (const origin of origins) {
        const roomCells = rectangleCells(origin[0], origin[1], prepared.width, prepared.depth);
        const paddingCells = paddedRectangleCells(
          origin[0], origin[1], prepared.width, prepared.depth, input.recipe.architecture.roomPadding,
        ).filter((cell) => macroCellInBounds(cell, bounds));
        const next = current.clone();
        if (!next.claimAll(roomCells, { ownerId: prepared.nodeId, kind: "room" })) continue;
        if (!next.claimAll(paddingCells, { ownerId: prepared.nodeId, kind: "padding" }, ["padding"])) continue;
        const realized = realizePreparedRoom(prepared, origin, input.recipe.architecture.corridorWidth.min);
        placed.set(prepared.nodeId, realized.room);
        geometry.set(prepared.nodeId, realized.geometry);
        const completed = recurse(index + 1, next);
        if (completed) return completed;
        placed.delete(prepared.nodeId);
        geometry.delete(prepared.nodeId);
        embeddingBacktracks += 1;
        if (embeddingBacktracks > input.recipe.constraints.maxEmbeddingBacktracks) return undefined;
      }
      return undefined;
    };
    const completed = recurse(0, occupancy);
    if (!completed) {
      return failedStage([dungeonDiagnostic(
        "fatal", "embedding", input.shouldCancel?.() ? "DNG_GENERATION_CANCELED" : "DNG_EMBEDDING_EXHAUSTED",
        input.shouldCancel?.()
          ? "Dungeon embedding was canceled."
          : `Could not place ${floor.nodeIds.length} rooms on ${floor.mapId} within ${input.recipe.constraints.maxEmbeddingBacktracks} backtracks.`,
        { mapId: floor.mapId },
      )], { embeddingBacktracks });
    }
    rooms.push(...placed.values());
    for (const [nodeId, value] of geometry) roomGeometry[nodeId] = value;
  }

  const roomByNode = new Map(rooms.map((room) => [room.nodeId, room]));
  const corridors: PlacedCorridor[] = [];
  const transitions: PlacedTransition[] = [];
  const edgeSockets: DungeonSpatialResult["edgeSockets"] = {};
  let corridorSearchVisited = 0;
  const edgeRouteRank = (edge: DungeonGraph["edges"][number]) => {
    if (edge.tags.includes("critical")) return 0;
    if (edge.tags.includes("branch")) return 1;
    if (edge.tags.includes("loop")) return 3;
    return 2;
  };
  const edgeOrder = [...graph.edges].sort((left, right) =>
    (layoutStyle === "directional_crawl" ? edgeRouteRank(left) - edgeRouteRank(right) : 0) ||
      left.id.localeCompare(right.id));
  for (const edge of edgeOrder) {
    const from = roomByNode.get(edge.fromNodeId)!;
    const to = roomByNode.get(edge.toNodeId)!;
    const pair = chooseSocketPair(from, to);
    if (!pair) {
      return failedStage([dungeonDiagnostic(
        "fatal", "corridors", "DNG_SOCKET_PAIR_UNAVAILABLE", `No socket pair can realize edge ${edge.id}.`,
        { relatedIds: [edge.id, from.nodeId, to.nodeId] },
      )], { embeddingBacktracks });
    }
    edgeSockets[edge.id] = { from: [...pair.left.cell], to: [...pair.right.cell] };
    if (from.mapId !== to.mapId) {
      const kind = corridorRng.pick([...input.recipe.architecture.verticalTransitionTypes].sort()) as PlacedTransition["kind"];
      const forwardId = `transition_${edge.id}_forward`;
      const reverseId = `transition_${edge.id}_reverse`;
      transitions.push({
        id: forwardId, edgeId: edge.id, kind,
        fromMapId: from.mapId, fromCell: [...pair.left.cell],
        toMapId: to.mapId, toCell: [...pair.right.cell], pairedTransitionId: reverseId,
      }, {
        id: reverseId, edgeId: edge.id, kind,
        fromMapId: to.mapId, fromCell: [...pair.right.cell],
        toMapId: from.mapId, toCell: [...pair.left.cell], pairedTransitionId: forwardId,
      });
      continue;
    }
    const floor = floors.find((candidate) => candidate.mapId === from.mapId)!;
    const bounds = centeredMacroBounds(floor.width, floor.depth);
    const blocked = new Set<string>();
    for (const room of rooms.filter((candidate) => candidate.mapId === from.mapId)) {
      rectangleCells(room.bounds.x, room.bounds.z, room.bounds.width, room.bounds.depth)
        .forEach((cell) => blocked.add(macroCellKey(cell)));
    }
    blocked.delete(macroCellKey(pair.left.cell));
    blocked.delete(macroCellKey(pair.right.cell));
    const route = routeCorridor({
      start: [...pair.left.cell],
      goal: [...pair.right.cell],
      bounds,
      blocked,
      turnPenalty: 5,
      maxVisited: floor.width * floor.depth * 4,
      cellCost: (cell) => corridors.some((corridor) => corridor.mapId === from.mapId && corridor.cells.some((candidate) =>
        candidate[0] === cell[0] && candidate[1] === cell[1])) ? 20 : 0,
    });
    corridorSearchVisited += route.visited;
    if (!route.success) {
      return failedStage([dungeonDiagnostic(
        "fatal", "corridors", "DNG_CORRIDOR_ROUTE_FAILED",
        `Could not route edge ${edge.id}: ${route.reason}.`, { mapId: from.mapId, relatedIds: [edge.id] },
      )], { embeddingBacktracks, corridorSearchVisited });
    }
    if (layoutStyle === "directional_crawl" && route.cells.length - 1 > 28) {
      return failedStage([dungeonDiagnostic(
        "fatal", "corridors", "DNG_DIRECTIONAL_CORRIDOR_TOO_LONG",
        `Directional corridor ${edge.id} is ${route.cells.length - 1} cells long; the limit is 28.`,
        { mapId: from.mapId, relatedIds: [edge.id] },
      )], { embeddingBacktracks, corridorSearchVisited });
    }
    const width = corridorRng.intBetween(input.recipe.architecture.corridorWidth.min, input.recipe.architecture.corridorWidth.max);
    const widened = widenCorridor(route.cells, width, bounds);
    const endpointKeys = new Set(route.cells.slice(0, 2).concat(route.cells.slice(-2)).map(macroCellKey));
    const illegal = widened.find((cell) => blocked.has(macroCellKey(cell)) && !endpointKeys.has(macroCellKey(cell)));
    // A wide route may taper at room sockets, but may never cut through an
    // unrelated room. Remove only the colliding widened fringe; centerline was
    // already proven legal by A*.
    const cells = widened.filter((cell) => !blocked.has(macroCellKey(cell)) || endpointKeys.has(macroCellKey(cell)));
    if (illegal && cells.length < route.cells.length) {
      return failedStage([dungeonDiagnostic(
        "fatal", "corridors", "DNG_CORRIDOR_WIDTH_COLLISION",
        `Width ${width} cannot be applied to edge ${edge.id} without cutting through a room.`,
        { mapId: from.mapId, cell: illegal, relatedIds: [edge.id] },
      )], { embeddingBacktracks, corridorSearchVisited });
    }
    corridors.push({
      id: `corridor_${edge.id}`,
      edgeId: edge.id,
      mapId: from.mapId,
      cells: cells.sort(compareMacroCells),
      width,
    });
  }

  const embedded: EmbeddedDungeon = canonicalEmbeddedDungeon({ maps: floors, rooms, corridors, transitions });
  const diagnostics = auditEmbeddedDungeon(graph, embedded);
  const parsed = DungeonEmbeddedDungeonSchema.safeParse(embedded);
  if (!parsed.success) diagnostics.push(...parsed.error.issues.map((issue) => dungeonDiagnostic(
    "fatal", "geometry", "DNG_EMBEDDED_SCHEMA_INVALID", `${issue.path.join(".")}: ${issue.message}`,
  )));
  const metrics = {
    embeddingBacktracks,
    corridorSearchVisited,
    rooms: rooms.length,
    corridors: corridors.length,
    transitions: transitions.length,
  };
  return diagnostics.some((entry) => entry.severity === "fatal") || !parsed.success
    ? failedStage(diagnostics, metrics)
    : successfulStage({ graph, embedded: parsed.data, roomGeometry, edgeSockets, embeddingBacktracks, corridorSearchVisited }, diagnostics, metrics);
};

export * from "./gridSearch";
export * from "./occupancy";
