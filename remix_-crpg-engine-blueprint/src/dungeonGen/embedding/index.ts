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

const proceduralSockets = (
  nodeId: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  socketWidth: number,
): PlacedRoom["sockets"] => [
  { id: `${nodeId}:north`, cell: [x + Math.floor(width / 2), z], facing: [0, -1], width: socketWidth, elevation: 0, tags: ["main"] },
  { id: `${nodeId}:east`, cell: [x + width - 1, z + Math.floor(depth / 2)], facing: [1, 0], width: socketWidth, elevation: 0, tags: ["side"] },
  { id: `${nodeId}:south`, cell: [x + Math.floor(width / 2), z + depth - 1], facing: [0, 1], width: socketWidth, elevation: 0, tags: ["main"] },
  { id: `${nodeId}:west`, cell: [x, z + Math.floor(depth / 2)], facing: [-1, 0], width: socketWidth, elevation: 0, tags: ["side"] },
];

const proceduralRoom = (
  prepared: PreparedRoom,
  origin: MacroCell,
  socketWidth: number,
): { room: PlacedRoom; geometry: DungeonRoomGeometry } => {
  const cells: DungeonRoomGeometry["cells"] = [];
  for (let z = origin[1]; z < origin[1] + prepared.depth; z += 1) {
    for (let x = origin[0]; x < origin[0] + prepared.width; x += 1) {
      cells.push({ cell: [x, z], walkable: true, height: 0, visualHeight: 0, surfaceTag: "none", tag: "procedural_room" });
    }
  }
  return {
    room: {
      nodeId: prepared.nodeId,
      mapId: prepared.mapId,
      builderId: prepared.builderId ?? "rectangular_room_v1",
      origin: [...origin],
      rotation: prepared.rotation,
      bounds: { x: origin[0], z: origin[1], width: prepared.width, depth: prepared.depth },
      sockets: proceduralSockets(prepared.nodeId, origin[0], origin[1], prepared.width, prepared.depth, socketWidth),
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

const candidateOrigins = (
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

const floorPlacementOrder = (graph: DungeonGraph, nodeIds: readonly string[]) => {
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
    const builder = shapeRng.weighted(input.recipe.architecture.proceduralRoomBuilderPool.map((entry) => ({
      id: entry.id, weight: entry.weight, value: entry.id,
    })), `room-builder:${node.id}`);
    proceduralCount += 1;
    const widthMin = Math.max(input.recipe.scale.roomWidth.min, archetype?.minWidth ?? 1);
    const widthMax = Math.min(input.recipe.scale.roomWidth.max, archetype?.maxWidth ?? input.recipe.scale.roomWidth.max);
    const depthMin = Math.max(input.recipe.scale.roomDepth.min, archetype?.minDepth ?? 1);
    const depthMax = Math.min(input.recipe.scale.roomDepth.max, archetype?.maxDepth ?? input.recipe.scale.roomDepth.max);
    return {
      nodeId: node.id,
      mapId: mapByNode.get(node.id)!,
      width: shapeRng.intBetween(widthMin, widthMax),
      depth: shapeRng.intBetween(depthMin, depthMax),
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
  const rooms: PlacedRoom[] = [];
  const roomGeometry: Record<string, DungeonRoomGeometry> = {};
  let embeddingBacktracks = 0;

  for (const floor of floors) {
    const bounds = centeredMacroBounds(floor.width, floor.depth);
    const occupancy = new DungeonOccupancy(bounds);
    const placed = new Map<string, PlacedRoom>();
    const geometry = new Map<string, DungeonRoomGeometry>();
    const order = floorPlacementOrder(graph, floor.nodeIds);
    const recurse = (index: number, current: DungeonOccupancy): DungeonOccupancy | undefined => {
      if (input.shouldCancel?.()) return undefined;
      if (index >= order.length) return current;
      const prepared = preparedByNode.get(order[index])!;
      const origins = candidateOrigins(prepared, placed, graph, bounds, input.recipe.architecture.roomPadding, embeddingRng);
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
  for (const edge of [...graph.edges].sort((left, right) => left.id.localeCompare(right.id))) {
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
