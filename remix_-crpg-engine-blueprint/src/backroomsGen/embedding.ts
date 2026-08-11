import { stableContentHash } from "../generation-facing/stableHash";
import {
  centeredMacroBounds,
  compareMacroCells,
  macroCellKey,
  routeCorridor,
  widenCorridor,
  type MacroCell,
} from "../dungeonGen/embedding/gridSearch";
import { DungeonOccupancy } from "../dungeonGen/embedding/occupancy";
import {
  instantiateDungeonRoomTemplate,
  rotatedTemplateBounds,
  type DungeonRotation,
} from "../dungeonGen/templates";
import type { DungeonRoomTemplateDef } from "../dungeonGen/types";
import { backroomsDiagnostic, sortBackroomsDiagnostics } from "./diagnostics";
import { BackroomsEmbeddedMapSchema, BackroomsRecipeSchema, BackroomsSemanticGraphSchema } from "./schema";
import { createBackroomsSeedContext } from "./seedContext";
import {
  BACKROOMS_LEVEL0_ROOM_TEMPLATES,
  BACKROOMS_LEVEL0_TEMPLATE_IDS,
  backroomsLevel0TemplateById,
} from "./templates";
import type {
  BackroomsDiagnostic,
  BackroomsEmbeddedMap,
  BackroomsGraphNode,
  BackroomsPacingPlan,
  BackroomsRecipeDef,
  BackroomsSemanticGraph,
} from "./types";

export interface EmbedBackroomsGraphInput {
  recipe: BackroomsRecipeDef;
  graph: BackroomsSemanticGraph;
  pacingPlan?: BackroomsPacingPlan;
  attemptIndex?: number;
  mapId?: string;
  displayName?: string;
}

export interface BackroomsEmbeddingResult {
  success: boolean;
  embedded?: BackroomsEmbeddedMap;
  diagnostics: BackroomsDiagnostic[];
}

const SLOT_PITCH = 17;
const SLOT_COLUMNS = 8;
const CORRIDOR_WIDTH = 3;
const ROTATIONS: readonly DungeonRotation[] = [0, 90, 180, 270];

const rectangleCells = (
  x: number,
  z: number,
  width: number,
  depth: number,
  padding = 0,
): MacroCell[] => {
  const cells: MacroCell[] = [];
  for (let row = z - padding; row < z + depth + padding; row += 1) {
    for (let column = x - padding; column < x + width + padding; column += 1) {
      cells.push([column, row]);
    }
  }
  return cells;
};

const graphDegrees = (graph: BackroomsSemanticGraph) => {
  const degrees = new Map(graph.nodes.map((node) => [node.id, 0]));
  graph.edges.forEach((edge) => {
    degrees.set(edge.fromNodeId, (degrees.get(edge.fromNodeId) ?? 0) + 1);
    degrees.set(edge.toNodeId, (degrees.get(edge.toNodeId) ?? 0) + 1);
  });
  return degrees;
};

/**
 * A deterministic depth-first order keeps every spanning-tree connection in
 * neighboring lattice slots. Non-tree loop edges are then routed through the
 * shared occupancy grid without changing the semantic graph.
 */
const spatialNodeOrder = (graph: BackroomsSemanticGraph): BackroomsGraphNode[] => {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const adjacent = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  graph.edges.forEach((edge) => {
    adjacent.get(edge.fromNodeId)!.push(edge.toNodeId);
    adjacent.get(edge.toNodeId)!.push(edge.fromNodeId);
  });
  adjacent.forEach((neighbors) => neighbors.sort((leftId, rightId) => {
    const left = nodes.get(leftId)!;
    const right = nodes.get(rightId)!;
    return left.ordinal - right.ordinal || left.id.localeCompare(right.id);
  }));

  const ordered: BackroomsGraphNode[] = [];
  const visited = new Set<string>();
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    ordered.push(nodes.get(nodeId)!);
    for (const neighborId of adjacent.get(nodeId) ?? []) visit(neighborId);
  };
  visit(graph.startNodeId);
  graph.nodes
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id))
    .forEach((node) => visit(node.id));
  return ordered;
};

const templateForNode = (
  node: BackroomsGraphNode,
  degree: number,
  ordinaryIndex: number,
  recurrenceNodeIds: ReadonlySet<string>,
): DungeonRoomTemplateDef => {
  let templateId: string;
  if (recurrenceNodeIds.has(node.id)) {
    // Recognizable recurrence depends on the room silhouette remaining exact;
    // mutation belongs to dressing, not geometry.
    templateId = BACKROOMS_LEVEL0_TEMPLATE_IDS.openOffice;
  } else if (node.kind === "start") {
    templateId = BACKROOMS_LEVEL0_TEMPLATE_IDS.entryLobby;
  } else if (["anchor", "set_piece", "culmination", "transition"].includes(node.kind)) {
    templateId = BACKROOMS_LEVEL0_TEMPLATE_IDS.storyReserved;
  } else if (node.kind === "landmark") {
    templateId = BACKROOMS_LEVEL0_TEMPLATE_IDS.landmark;
  } else if (degree <= 1) {
    templateId = BACKROOMS_LEVEL0_TEMPLATE_IDS.serviceNook;
  } else {
    const ordinaryTemplates = [
      BACKROOMS_LEVEL0_TEMPLATE_IDS.openOffice,
      BACKROOMS_LEVEL0_TEMPLATE_IDS.longCorridor,
      BACKROOMS_LEVEL0_TEMPLATE_IDS.openOffice,
      BACKROOMS_LEVEL0_TEMPLATE_IDS.pillarField,
    ];
    templateId = ordinaryTemplates[ordinaryIndex % ordinaryTemplates.length];
  }
  const template = backroomsLevel0TemplateById.get(templateId);
  if (!template) throw new Error(`Missing Backrooms room template ${templateId}`);
  return template;
};

const roomCenter = (room: BackroomsEmbeddedMap["rooms"][number]): MacroCell => [
  room.bounds.x + Math.floor(room.bounds.width / 2),
  room.bounds.z + Math.floor(room.bounds.depth / 2),
];

const socketPairScore = (
  from: BackroomsEmbeddedMap["rooms"][number]["sockets"][number],
  to: BackroomsEmbeddedMap["rooms"][number]["sockets"][number],
  fromCenter: MacroCell,
  toCenter: MacroCell,
) => {
  const dx = toCenter[0] - fromCenter[0];
  const dz = toCenter[1] - fromCenter[1];
  const fromAlignment = from.facing[0] * dx + from.facing[1] * dz;
  const toAlignment = -(to.facing[0] * dx + to.facing[1] * dz);
  return (
    Math.abs(from.cell[0] - to.cell[0]) +
    Math.abs(from.cell[1] - to.cell[1]) -
    Math.sign(fromAlignment) * 4 -
    Math.sign(toAlignment) * 4
  );
};

const chooseSocketPair = (
  fromRoom: BackroomsEmbeddedMap["rooms"][number],
  toRoom: BackroomsEmbeddedMap["rooms"][number],
  socketUseCounts: ReadonlyMap<string, number>,
) => {
  const fromCenter = roomCenter(fromRoom);
  const toCenter = roomCenter(toRoom);
  return fromRoom.sockets.flatMap((from) => toRoom.sockets.map((to) => ({
    from,
    to,
    score:
      socketPairScore(from, to, fromCenter, toCenter) +
      ((socketUseCounts.get(from.id) ?? 0) + (socketUseCounts.get(to.id) ?? 0)) * 1_000,
    key: `${from.id}|${to.id}`,
  }))).sort((left, right) => left.score - right.score || left.key.localeCompare(right.key))[0];
};

const levelSlug = (recipe: BackroomsRecipeDef) => {
  // Preserve every existing Level 0 ID exactly. Other logical profiles gain
  // their own deterministic namespace without changing the runtime map type.
  if (recipe.levelProfileId === "backrooms.level0.cmt") return "level0";
  const profileTail = recipe.levelProfileId.split(".").find((part) =>
    /^level[0-9a-z_-]+$/i.test(part),
  );
  return (profileTail || "level")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_");
};

const defaultMapId = (recipe: BackroomsRecipeDef, graph: BackroomsSemanticGraph) =>
  `brg_${levelSlug(recipe)}_${stableContentHash({ recipeId: recipe.id, seed: recipe.seed, graph: graph.metrics.canonicalHash }).split(":")[1]}_f0`;

export const embedBackroomsGraph = (
  input: EmbedBackroomsGraphInput,
): BackroomsEmbeddingResult => {
  const recipeResult = BackroomsRecipeSchema.safeParse(input.recipe);
  const graphResult = BackroomsSemanticGraphSchema.safeParse(input.graph);
  if (!recipeResult.success || !graphResult.success) {
    return {
      success: false,
      diagnostics: [backroomsDiagnostic(
        "fatal",
        "embedding",
        "BRG_EMBED_INPUT_INVALID",
        [...(!recipeResult.success ? recipeResult.error.issues : []), ...(!graphResult.success ? graphResult.error.issues : [])]
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      )],
    };
  }

  const recipe = recipeResult.data;
  const graph = graphResult.data;
  const mapId = input.mapId ?? defaultMapId(recipe, graph);
  const bounds = centeredMacroBounds(recipe.scale.mapWidth, recipe.scale.mapDepth);
  const occupancy = new DungeonOccupancy(bounds);
  const nodeOrder = spatialNodeOrder(graph);
  const rows = Math.ceil(nodeOrder.length / SLOT_COLUMNS);
  const usedWidth = SLOT_COLUMNS * SLOT_PITCH;
  const usedDepth = rows * SLOT_PITCH;
  if (usedWidth > recipe.scale.mapWidth || usedDepth > recipe.scale.mapDepth) {
    return {
      success: false,
      diagnostics: [backroomsDiagnostic(
        "fatal",
        "embedding",
        "BRG_EMBED_GRID_TOO_SMALL",
        `${nodeOrder.length} rooms require ${usedWidth}x${usedDepth} macro cells; recipe provides ${recipe.scale.mapWidth}x${recipe.scale.mapDepth}.`,
      )],
    };
  }

  const gridStartX = bounds.minX + Math.floor((recipe.scale.mapWidth - usedWidth) / 2);
  const gridStartZ = bounds.minZ + Math.floor((recipe.scale.mapDepth - usedDepth) / 2);
  const degrees = graphDegrees(graph);
  const seedContext = createBackroomsSeedContext({
    generatorVersion: recipe.generatorVersion,
    recipeId: recipe.id,
    seed: recipe.seed,
    stageSalts: recipe.stageSalts,
    attemptIndex: input.attemptIndex ?? 0,
  });
  const embeddingRng = seedContext.stream("embedding");
  const rooms: BackroomsEmbeddedMap["rooms"] = [];
  const diagnostics: BackroomsDiagnostic[] = [];
  let ordinaryIndex = embeddingRng.int(BACKROOMS_LEVEL0_ROOM_TEMPLATES.length);
  const recurrenceNodeIds = new Set(
    input.pacingPlan?.recurrence.map((entry) => entry.nodeId) ?? [],
  );
  let backtracks = 0;

  for (let index = 0; index < nodeOrder.length; index += 1) {
    const node = nodeOrder[index];
    const row = Math.floor(index / SLOT_COLUMNS);
    const inRow = index % SLOT_COLUMNS;
    const column = row % 2 === 0 ? inRow : SLOT_COLUMNS - 1 - inRow;
    const slotCenter: MacroCell = [
      gridStartX + column * SLOT_PITCH + Math.floor(SLOT_PITCH / 2),
      gridStartZ + row * SLOT_PITCH + Math.floor(SLOT_PITCH / 2),
    ];
    const roomTemplate = templateForNode(
      node,
      degrees.get(node.id) ?? 0,
      ordinaryIndex++,
      recurrenceNodeIds,
    );
    const rotationOffset = embeddingRng.int(ROTATIONS.length);
    let placed = false;

    for (let rotationAttempt = 0; rotationAttempt < ROTATIONS.length; rotationAttempt += 1) {
      const rotation = ROTATIONS[(rotationOffset + rotationAttempt) % ROTATIONS.length];
      const rotatedBounds = rotatedTemplateBounds(roomTemplate.bounds, rotation);
      const origin: MacroCell = [
        slotCenter[0] - Math.floor(rotatedBounds.width / 2),
        slotCenter[1] - Math.floor(rotatedBounds.depth / 2),
      ];
      const paddingCells = rectangleCells(origin[0], origin[1], rotatedBounds.width, rotatedBounds.depth, 1);
      const roomCells = rectangleCells(origin[0], origin[1], rotatedBounds.width, rotatedBounds.depth);
      if (!occupancy.claimAll(paddingCells, { ownerId: node.id, kind: "padding" })) {
        backtracks += 1;
        continue;
      }
      if (!occupancy.claimAll(roomCells, { ownerId: node.id, kind: "room" })) {
        backtracks += 1;
        continue;
      }
      rooms.push(instantiateDungeonRoomTemplate(roomTemplate, {
        nodeId: node.id,
        mapId,
        origin,
        rotation,
      }).room);
      placed = true;
      break;
    }

    if (!placed) {
      diagnostics.push(backroomsDiagnostic(
        "fatal",
        "embedding",
        "BRG_ROOM_PLACEMENT_FAILED",
        `No rotation of ${roomTemplate.id} fit the reserved lattice slot for ${node.id}.`,
        [node.id, roomTemplate.id],
      ));
      break;
    }
  }

  if (backtracks > recipe.constraints.maxEmbeddingBacktracks) {
    diagnostics.push(backroomsDiagnostic(
      "fatal",
      "embedding",
      "BRG_EMBED_BACKTRACK_LIMIT",
      `Embedding used ${backtracks} backtracks; recipe allows ${recipe.constraints.maxEmbeddingBacktracks}.`,
    ));
  }
  if (diagnostics.some((entry) => entry.severity === "fatal")) {
    return { success: false, diagnostics: sortBackroomsDiagnostics(diagnostics) };
  }

  const roomByNodeId = new Map(rooms.map((room) => [room.nodeId, room]));
  const roomBlocked = new Set(occupancy.cells("room").map(macroCellKey));
  const corridors: BackroomsEmbeddedMap["corridors"] = [];
  const connections: BackroomsEmbeddedMap["connections"] = [];
  const socketUseCounts = new Map<string, number>();

  for (const edge of graph.edges.slice().sort((left, right) => left.id.localeCompare(right.id))) {
    const fromRoom = roomByNodeId.get(edge.fromNodeId)!;
    const toRoom = roomByNodeId.get(edge.toNodeId)!;
    const pair = chooseSocketPair(fromRoom, toRoom, socketUseCounts);
    const blocked = new Set(roomBlocked);
    blocked.delete(macroCellKey(pair.from.cell));
    blocked.delete(macroCellKey(pair.to.cell));
    const route = routeCorridor({
      start: [...pair.from.cell],
      goal: [...pair.to.cell],
      bounds,
      blocked,
      turnPenalty: 7,
      boundaryPenalty: 3,
      maxVisited: 120_000,
    });
    if (!route.success) {
      diagnostics.push(backroomsDiagnostic(
        "fatal",
        "embedding",
        "BRG_CORRIDOR_ROUTE_FAILED",
        `Could not realize semantic edge ${edge.id}: ${route.reason ?? "no route"}.`,
        [edge.id, edge.fromNodeId, edge.toNodeId],
      ));
      continue;
    }
    const widened = widenCorridor(route.cells, CORRIDOR_WIDTH, bounds)
      .filter((cell) =>
        !roomBlocked.has(macroCellKey(cell)) ||
        macroCellKey(cell) === macroCellKey(pair.from.cell) ||
        macroCellKey(cell) === macroCellKey(pair.to.cell),
      )
      .sort(compareMacroCells);
    const corridorId = `corridor.${edge.id}`;
    corridors.push({
      id: corridorId,
      edgeId: edge.id,
      mapId,
      cells: widened,
      width: CORRIDOR_WIDTH,
    });
    connections.push({
      edgeId: edge.id,
      corridorId,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      fromSocketId: pair.from.id,
      toSocketId: pair.to.id,
      fromCell: [...pair.from.cell],
      toCell: [...pair.to.cell],
      width: CORRIDOR_WIDTH,
    });
    socketUseCounts.set(pair.from.id, (socketUseCounts.get(pair.from.id) ?? 0) + 1);
    socketUseCounts.set(pair.to.id, (socketUseCounts.get(pair.to.id) ?? 0) + 1);
  }

  if (diagnostics.some((entry) => entry.severity === "fatal")) {
    return { success: false, diagnostics: sortBackroomsDiagnostics(diagnostics) };
  }
  const structural = {
    mapId,
    displayName:
      input.displayName ??
      `Backrooms — ${levelSlug(recipe).replace(/^level/, "Level ")}`,
    width: recipe.scale.mapWidth,
    depth: recipe.scale.mapDepth,
    rooms: rooms.slice().sort((left, right) => left.nodeId.localeCompare(right.nodeId)),
    corridors: corridors.slice().sort((left, right) => left.id.localeCompare(right.id)),
    connections: connections.slice().sort((left, right) => left.edgeId.localeCompare(right.edgeId)),
    backtracks,
  };
  const embedded = BackroomsEmbeddedMapSchema.parse({
    ...structural,
    canonicalHash: stableContentHash(structural),
  });
  return { success: true, embedded, diagnostics: sortBackroomsDiagnostics(diagnostics) };
};
