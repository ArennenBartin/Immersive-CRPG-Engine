import { DungeonGraphSchema, DungeonRecipeSchema } from "../schema";
import type {
  DungeonDiagnostic,
  DungeonGraph,
  DungeonGraphEdge,
  DungeonGraphMetrics,
  DungeonGraphNode,
  DungeonRecipeDef,
  DungeonRoomArchetypeDef,
} from "../types";
import { canonicalDungeonGraph } from "../canonical";
import { dungeonDiagnostic, failedStage, successfulStage, type DungeonStageOutput } from "../diagnostics";
import { DungeonSeedContext, type DungeonRandom } from "../seedContext";
import { simulateDungeonProgression } from "./progressionAudit";

export interface DungeonTopologyInput {
  recipe: DungeonRecipeDef;
  archetypes: readonly DungeonRoomArchetypeDef[];
  seedContext: DungeonSeedContext;
  keyItemIds?: readonly string[];
}

const sampleRange = (range: { min: number; max: number }, rng: DungeonRandom) =>
  rng.intBetween(range.min, range.max);

const adjacency = (
  nodes: readonly DungeonGraphNode[],
  edges: readonly DungeonGraphEdge[],
  excludedEdgeId?: string,
) => {
  const result = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (edge.id === excludedEdgeId) continue;
    result.get(edge.fromNodeId)?.push(edge.toNodeId);
    if (!edge.oneWay) result.get(edge.toNodeId)?.push(edge.fromNodeId);
  }
  for (const neighbors of result.values()) neighbors.sort();
  return result;
};

type DungeonGraphStructure = {
  nodes: readonly DungeonGraphNode[];
  edges: readonly DungeonGraphEdge[];
};

export const graphReachableFrom = (
  graph: DungeonGraphStructure,
  startNodeId: string,
  excludedEdgeId?: string,
): Set<string> => {
  const links = adjacency(graph.nodes, graph.edges, excludedEdgeId);
  const reached = new Set<string>();
  const queue = [startNodeId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (reached.has(current)) continue;
    reached.add(current);
    for (const next of links.get(current) ?? []) if (!reached.has(next)) queue.push(next);
  }
  return reached;
};

export const graphShortestDistance = (
  graph: DungeonGraphStructure,
  fromNodeId: string,
  toNodeId: string,
): number => {
  const links = adjacency(graph.nodes, graph.edges);
  const distance = new Map<string, number>([[fromNodeId, 0]]);
  const queue = [fromNodeId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === toNodeId) return distance.get(current)!;
    for (const next of links.get(current) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, distance.get(current)! + 1);
      queue.push(next);
    }
  }
  return Number.POSITIVE_INFINITY;
};

const makeNode = (
  id: string,
  depth: number,
  mandatory: boolean,
  tags: string[],
  branchId?: string,
): DungeonGraphNode => ({
  id,
  archetypeId: "pending",
  depth: Math.max(0, Math.min(1, depth)),
  branchId,
  mandatory,
  secret: false,
  tags: [...new Set(tags)].sort(),
  rewardTier: Math.max(0, depth * 3),
  pressureTier: Math.max(0, depth * 3),
});

const edgeExists = (edges: readonly DungeonGraphEdge[], left: string, right: string) =>
  edges.some((edge) =>
    (edge.fromNodeId === left && edge.toNodeId === right) ||
    (!edge.oneWay && edge.fromNodeId === right && edge.toNodeId === left));

const isSpecialArchetype = (definition: DungeonRoomArchetypeDef, tag: "entrance" | "objective") =>
  definition.tags.includes(tag) || definition.id.toLowerCase().includes(tag);

const isArchetypeLegal = (
  node: DungeonGraphNode,
  degree: number,
  definition: DungeonRoomArchetypeDef,
  definitions: ReadonlyMap<string, DungeonRoomArchetypeDef>,
  assigned: ReadonlyMap<string, string>,
  edges: readonly DungeonGraphEdge[],
  forbiddenAdjacencies: ReadonlyArray<DungeonRecipeDef["constraints"]["forbiddenAdjacencies"][number]>,
): boolean => {
  if (node.mandatory && !definition.allowedOnCriticalPath) return false;
  if (node.secret && !definition.allowedAsSecret) return false;
  if (node.tags.includes("objective") && !definition.allowedAsObjective) return false;
  if (degree < definition.minConnections || degree > definition.maxConnections) return false;
  const isEntrance = node.tags.includes("entrance");
  const isObjective = node.tags.includes("objective");
  const entranceDefinition = isSpecialArchetype(definition, "entrance");
  const objectiveDefinition = isSpecialArchetype(definition, "objective");
  const quietOrientationDefinition = definition.tags.some((tag) =>
    tag === "quiet" || tag === "orientation" || tag === "resource" || tag === "rest");
  const verticalDefinition = definition.tags.includes("vertical") ||
    definition.requiredSocketKinds.includes("vertical") || definition.id.toLowerCase().includes("vertical");
  if (node.tags.includes("vertical_landing") && !verticalDefinition) return false;
  if (isEntrance ? !entranceDefinition || objectiveDefinition : entranceDefinition) return false;
  if (isObjective ? !objectiveDefinition || entranceDefinition : objectiveDefinition) return false;
  if (!isEntrance && node.tags.includes("orientation") && node.tags.includes("quiet") && !quietOrientationDefinition) return false;
  for (const edge of edges) {
    const nodeIsFrom = edge.fromNodeId === node.id;
    const neighborId = nodeIsFrom ? edge.toNodeId : edge.toNodeId === node.id ? edge.fromNodeId : undefined;
    if (!neighborId) continue;
    const neighborArchetypeId = assigned.get(neighborId);
    if (!neighborArchetypeId) continue;
    const neighborDefinition = definitions.get(neighborArchetypeId);
    if (definition.forbiddenNeighborArchetypes.includes(neighborArchetypeId) ||
      neighborDefinition?.forbiddenNeighborArchetypes.includes(definition.id)) return false;
    if (forbiddenAdjacencies.some((rule) => {
      const orientedViolation = nodeIsFrom
        ? rule.fromArchetypeId === definition.id && rule.toArchetypeId === neighborArchetypeId
        : rule.fromArchetypeId === neighborArchetypeId && rule.toArchetypeId === definition.id;
      const reverseViolation = rule.bidirectional && (nodeIsFrom
        ? rule.toArchetypeId === definition.id && rule.fromArchetypeId === neighborArchetypeId
        : rule.toArchetypeId === neighborArchetypeId && rule.fromArchetypeId === definition.id);
      return orientedViolation || reverseViolation;
    })) return false;
  }
  return true;
};

const computeGraphMetrics = (
  nodes: readonly DungeonGraphNode[],
  edges: readonly DungeonGraphEdge[],
  entranceNodeId: string,
  objectiveNodeId: string,
  gates: DungeonGraph["gates"],
): DungeonGraphMetrics => {
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    degrees.set(edge.fromNodeId, (degrees.get(edge.fromNodeId) ?? 0) + 1);
    degrees.set(edge.toNodeId, (degrees.get(edge.toNodeId) ?? 0) + 1);
  });
  const optionalNodes = nodes.filter((node) => !node.mandatory);
  const longestOptionalRoute = optionalNodes.reduce((maximum, node) => {
    const distance = graphShortestDistance({ nodes, edges }, entranceNodeId, node.id);
    return Number.isFinite(distance) ? Math.max(maximum, distance) : maximum;
  }, 0);
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    criticalPathLength: nodes.filter((node) => node.mandatory).length,
    branchCount: new Set(nodes.map((node) => node.branchId).filter(Boolean)).size,
    loopCount: edges.filter((edge) => edge.tags.includes("loop")).length,
    secretCount: nodes.filter((node) => node.secret).length,
    averageNodeDegree: nodes.length
      ? [...degrees.values()].reduce((sum, degree) => sum + degree, 0) / nodes.length
      : 0,
    maximumNodeDegree: Math.max(0, ...degrees.values()),
    shortestEntranceToObjectivePath: graphShortestDistance({ nodes, edges }, entranceNodeId, objectiveNodeId),
    longestOptionalRoute,
    gateDepths: Object.fromEntries(gates.map((gate): [string, number] => [
      gate.id,
      nodes.find((node) => node.id === gate.sourceNodeId)?.depth ?? 0,
    ]).sort(([left], [right]) => left.localeCompare(right))),
    backtrackingDistance: graphShortestDistance({ nodes, edges }, objectiveNodeId, entranceNodeId),
    criticalPathNodeRatio: nodes.length ? nodes.filter((node) => node.mandatory).length / nodes.length : 0,
    pressureCurve: nodes.filter((node) => node.mandatory).sort((a, b) => a.depth - b.depth).map((node) => node.pressureTier),
    rewardCurve: nodes.filter((node) => node.mandatory).sort((a, b) => a.depth - b.depth).map((node) => node.rewardTier),
  };
};

export const auditDungeonGraph = (
  graph: DungeonGraph,
  recipe: DungeonRecipeDef,
  archetypes: readonly DungeonRoomArchetypeDef[] = [],
): DungeonDiagnostic[] => {
  const diagnostics: DungeonDiagnostic[] = [];
  const reached = graphReachableFrom(graph, graph.entranceNodeId);
  const required = graph.nodes.filter((node) => node.mandatory);
  if (required.some((node) => !reached.has(node.id))) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "topology", "DNG_GRAPH_DISCONNECTED",
      "One or more mandatory graph nodes are disconnected from the entrance.",
      { relatedIds: required.filter((node) => !reached.has(node.id)).map((node) => node.id) },
    ));
  }
  const loops = graph.edges.filter((edge) => edge.tags.includes("loop")).length;
  if (loops < recipe.topology.loopCount.min || loops > recipe.topology.loopCount.max) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "topology", "DNG_LOOP_COUNT_SHORTFALL",
      `Generated ${loops} meaningful loops; recipe requires ${recipe.topology.loopCount.min}–${recipe.topology.loopCount.max}.`,
    ));
  }
  const branches = new Set(graph.nodes.map((node) => node.branchId).filter(Boolean)).size;
  if (branches < recipe.topology.branchCount.min || branches > recipe.topology.branchCount.max) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "topology", "DNG_BRANCH_COUNT_SHORTFALL",
      `Generated ${branches} branches; recipe requires ${recipe.topology.branchCount.min}–${recipe.topology.branchCount.max}.`,
    ));
  }
  const branchLengths = new Map<string, number>();
  graph.nodes.forEach((node) => {
    if (node.branchId) branchLengths.set(node.branchId, (branchLengths.get(node.branchId) ?? 0) + 1);
  });
  for (const [branchId, length] of branchLengths) {
    if (length < recipe.topology.branchLength.min || length > recipe.topology.branchLength.max) diagnostics.push(dungeonDiagnostic(
      "fatal", "topology", "DNG_BRANCH_LENGTH_OUT_OF_RANGE",
      `Branch ${branchId} has ${length} rooms; recipe requires ${recipe.topology.branchLength.min}–${recipe.topology.branchLength.max}.`,
      { relatedIds: [branchId] },
    ));
  }
  if (graph.nodes.length < recipe.scale.roomCount.min || graph.nodes.length > recipe.scale.roomCount.max) diagnostics.push(dungeonDiagnostic(
    "fatal", "topology", "DNG_ROOM_COUNT_OUT_OF_RANGE",
    `Generated ${graph.nodes.length} rooms; recipe requires ${recipe.scale.roomCount.min}–${recipe.scale.roomCount.max}.`,
  ));
  const criticalCount = graph.nodes.filter((node) => node.mandatory).length;
  if (criticalCount < recipe.topology.criticalPathLength.min || criticalCount > recipe.topology.criticalPathLength.max) diagnostics.push(dungeonDiagnostic(
    "fatal", "topology", "DNG_CRITICAL_PATH_LENGTH_OUT_OF_RANGE",
    `Generated ${criticalCount} critical rooms; recipe requires ${recipe.topology.criticalPathLength.min}–${recipe.topology.criticalPathLength.max}.`,
  ));
  const secrets = graph.nodes.filter((node) => node.secret).length;
  if (secrets < recipe.topology.secretCount.min || secrets > recipe.topology.secretCount.max) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "secrets", "DNG_SECRET_COUNT_SHORTFALL",
      `Generated ${secrets} secrets; recipe requires ${recipe.topology.secretCount.min}–${recipe.topology.secretCount.max}.`,
    ));
  }
  if (graph.gates.length < recipe.topology.lockCount.min || graph.gates.length > recipe.topology.lockCount.max) diagnostics.push(dungeonDiagnostic(
    "fatal", "gates", "DNG_GATE_COUNT_OUT_OF_RANGE",
    `Generated ${graph.gates.length} gates; recipe requires ${recipe.topology.lockCount.min}–${recipe.topology.lockCount.max}.`,
  ));
  if (graph.nodes.find((node) => node.id === graph.objectiveNodeId)?.secret) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "secrets", "DNG_OBJECTIVE_SECRET",
      "The required objective cannot be assigned to a secret node.",
      { nodeId: graph.objectiveNodeId },
    ));
  }
  const entranceArchetype = graph.nodes.find((node) => node.id === graph.entranceNodeId)?.archetypeId;
  const objectiveArchetype = graph.nodes.find((node) => node.id === graph.objectiveNodeId)?.archetypeId;
  if (entranceArchetype && graph.nodes.some((node) => node.id !== graph.entranceNodeId && node.archetypeId === entranceArchetype)) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "archetypes", "DNG_ENTRANCE_ARCHETYPE_DUPLICATE",
      `Entrance-only archetype ${entranceArchetype} was assigned outside the entrance.`,
    ));
  }
  if (objectiveArchetype && graph.nodes.some((node) => node.id !== graph.objectiveNodeId && node.archetypeId === objectiveArchetype)) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "archetypes", "DNG_OBJECTIVE_ARCHETYPE_DUPLICATE",
      `Objective-only archetype ${objectiveArchetype} was assigned outside the objective.`,
    ));
  }
  for (const edge of graph.edges) {
    const left = graph.nodes.find((node) => node.id === edge.fromNodeId)?.archetypeId;
    const right = graph.nodes.find((node) => node.id === edge.toNodeId)?.archetypeId;
    const violated = recipe.constraints.forbiddenAdjacencies.find((rule) =>
      (rule.fromArchetypeId === left && rule.toArchetypeId === right) ||
      (rule.bidirectional && rule.fromArchetypeId === right && rule.toArchetypeId === left));
    if (violated) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "archetypes", "DNG_FORBIDDEN_ADJACENCY",
        `Edge ${edge.id} violates forbidden adjacency ${violated.fromArchetypeId} → ${violated.toArchetypeId}.`,
        { relatedIds: [edge.id, violated.fromArchetypeId, violated.toArchetypeId] },
      ));
    }
  }
  const archetypeById = new Map(archetypes.map((entry) => [entry.id, entry]));
  const degreeByNode = new Map(graph.nodes.map((node) => [node.id, 0]));
  graph.edges.forEach((edge) => {
    degreeByNode.set(edge.fromNodeId, (degreeByNode.get(edge.fromNodeId) ?? 0) + 1);
    degreeByNode.set(edge.toNodeId, (degreeByNode.get(edge.toNodeId) ?? 0) + 1);
  });
  for (const node of graph.nodes) {
    const definition = archetypeById.get(node.archetypeId);
    if (!definition) continue;
    const degree = degreeByNode.get(node.id) ?? 0;
    if (degree < definition.minConnections || degree > definition.maxConnections) diagnostics.push(dungeonDiagnostic(
      "fatal", "archetypes", "DNG_ARCHETYPE_DEGREE_INVALID",
      `${node.archetypeId} requires ${definition.minConnections}–${definition.maxConnections} connections, but ${node.id} has ${degree}.`,
      { nodeId: node.id, relatedIds: [node.archetypeId] },
    ));
    for (const neighborId of graph.edges.flatMap((edge) =>
      edge.fromNodeId === node.id ? [edge.toNodeId] : edge.toNodeId === node.id ? [edge.fromNodeId] : [])) {
      const neighbor = graph.nodes.find((entry) => entry.id === neighborId);
      if (neighbor && definition.forbiddenNeighborArchetypes.includes(neighbor.archetypeId)) diagnostics.push(dungeonDiagnostic(
        "fatal", "archetypes", "DNG_ARCHETYPE_FORBIDDEN_NEIGHBOR",
        `${node.archetypeId} forbids neighbor ${neighbor.archetypeId}.`,
        { nodeId: node.id, relatedIds: [neighbor.id, node.archetypeId, neighbor.archetypeId] },
      ));
    }
  }
  if (recipe.topology.requireReturnPath && graph.edges.some((edge) => edge.oneWay && edge.tags.includes("critical"))) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "progression", "DNG_ONE_WAY_CRITICAL_RETURN",
      "A one-way critical edge prevents a guaranteed return path.",
    ));
  }
  diagnostics.push(...simulateDungeonProgression(graph, recipe.topology.requireReturnPath).diagnostics);
  return diagnostics;
};

export const generateDungeonGraph = (
  input: DungeonTopologyInput,
): DungeonStageOutput<DungeonGraph> => {
  const parsedRecipe = DungeonRecipeSchema.safeParse(input.recipe);
  if (!parsedRecipe.success) {
    return failedStage(parsedRecipe.error.issues.map((issue) => dungeonDiagnostic(
      "fatal", "recipe", "DNG_RECIPE_SCHEMA_INVALID",
      `${issue.path.join(".") || "recipe"}: ${issue.message}`,
    )));
  }
  const recipe = parsedRecipe.data;
  const topologyRng = input.seedContext.stream("topology");
  const archetypeRng = input.seedContext.stream("archetypes");
  const gateRng = input.seedContext.stream("gates");
  const secretRng = input.seedContext.stream("secrets");
  const diagnostics: DungeonDiagnostic[] = [];
  let sampledShape: { targetRooms: number; criticalLength: number; branchLengths: number[] } | undefined;
  for (let samplingAttempt = 0; samplingAttempt < 128 && !sampledShape; samplingAttempt += 1) {
    const criticalLength = sampleRange(recipe.topology.criticalPathLength, topologyRng);
    const branchCount = sampleRange(recipe.topology.branchCount, topologyRng);
    const branchLengths = Array.from({ length: branchCount }, () => sampleRange(recipe.topology.branchLength, topologyRng));
    const targetRooms = criticalLength + branchLengths.reduce((sum, length) => sum + length, 0);
    if (targetRooms >= recipe.scale.roomCount.min && targetRooms <= recipe.scale.roomCount.max) {
      sampledShape = { targetRooms, criticalLength, branchLengths };
    }
  }
  if (!sampledShape) return failedStage([dungeonDiagnostic(
    "fatal", "topology", "DNG_TOPOLOGY_RANGES_INFEASIBLE",
    "Room-count, critical-path, branch-count, and branch-length ranges have no sampled feasible intersection.",
  )]);
  const { targetRooms, criticalLength, branchLengths } = sampledShape;
  if (criticalLength < 2) {
    return failedStage([dungeonDiagnostic(
      "fatal", "topology", "DNG_CRITICAL_PATH_TOO_SHORT",
      "A dungeon needs at least an entrance and objective node.",
    )]);
  }

  const nodes: DungeonGraphNode[] = [];
  const edges: DungeonGraphEdge[] = [];
  const ordinaryConnectionKind = recipe.architecture.connectionMode === "open_only" ? "open" : "door";
  for (let index = 0; index < criticalLength; index += 1) {
    const depth = criticalLength === 1 ? 0 : index / (criticalLength - 1);
    const tags = ["critical"];
    if (index === 0) tags.push("entrance", "landmark");
    if (index === criticalLength - 1) tags.push("objective", "climax");
    else if (index === criticalLength - 2) tags.push("pre_objective", "staging", "quiet");
    else if (index > 0 && index < criticalLength - 1 && index % 3 === 0) tags.push("junction");
    if (recipe.architecture.layoutStyle === "directional_crawl" && index <= 2) {
      tags.push("orientation", "quiet");
      if (index === 1) tags.push("resource");
    }
    nodes.push(makeNode(`node_critical_${String(index).padStart(3, "0")}`, depth, true, tags));
    if (index > 0) {
      edges.push({
        id: `edge_critical_${String(index - 1).padStart(3, "0")}`,
        fromNodeId: nodes[index - 1].id,
        toNodeId: nodes[index].id,
        kind: ordinaryConnectionKind,
        oneWay: false,
        tags: ["critical"],
      });
    }
  }

  const requestedBranches = branchLengths.length;
  for (let branchIndex = 0; branchIndex < requestedBranches; branchIndex += 1) {
    const branchId = `branch_${String(branchIndex).padStart(2, "0")}`;
    const eligibleAttach = nodes.filter((node) => node.mandatory &&
      !node.tags.includes("entrance") && !node.tags.includes("objective"));
    const attachmentDegree = (nodeId: string) => edges.filter((edge) =>
      edge.fromNodeId === nodeId || edge.toNodeId === nodeId).length;
    const minimumDegree = Math.min(...eligibleAttach.map((node) => attachmentDegree(node.id)));
    const attachment = topologyRng.pick(eligibleAttach.filter((node) => attachmentDegree(node.id) === minimumDegree));
    const length = branchLengths[branchIndex];
    let previous = attachment;
    for (let member = 0; member < length; member += 1) {
      const depth = Math.min(1, attachment.depth + (member + 1) / Math.max(4, targetRooms));
      const node = makeNode(
        `node_${branchId}_${String(member).padStart(2, "0")}`,
        depth,
        false,
        ["branch", member === length - 1 ? "branch_end" : "connector"],
        branchId,
      );
      nodes.push(node);
      edges.push({
        id: `edge_${branchId}_${String(member).padStart(2, "0")}`,
        fromNodeId: previous.id,
        toNodeId: node.id,
        kind: member === 0 ? ordinaryConnectionKind : "open",
        oneWay: false,
        tags: ["branch", branchId],
      });
      previous = node;
    }
  }

  const requestedLocks = sampleRange(recipe.topology.lockCount, gateRng);
  const reserveCandidates = edges.filter((edge) => edge.tags.includes("critical"))
    .filter((edge) => {
      const target = nodes.find((node) => node.id === edge.toNodeId);
      return target && target.depth >= 0.3 && target.id !== nodes[criticalLength - 1].id;
    })
    .sort((left, right) => {
      const leftDepth = nodes.find((node) => node.id === left.toNodeId)?.depth ?? 0;
      const rightDepth = nodes.find((node) => node.id === right.toNodeId)?.depth ?? 0;
      return rightDepth - leftDepth || left.id.localeCompare(right.id);
    });
  const reservedGateEdges = gateRng.shuffleById(reserveCandidates).slice(0, requestedLocks);
  const reservedGateEdgeIds = new Set(reservedGateEdges.map((edge) => edge.id));

  const floorRng = input.seedContext.stream("floor_partition");
  const plannedFloorCount = recipe.outputMode === "single_map"
    ? 1
    : floorRng.intBetween(recipe.scale.floorCount.min, recipe.scale.floorCount.max);
  const plannedCuts: number[] = [];
  for (let floorIndex = 1; floorIndex < plannedFloorCount; floorIndex += 1) {
    const desired = Math.floor(criticalLength * floorIndex / plannedFloorCount);
    const candidates = Array.from({ length: Math.max(0, criticalLength - 3) }, (_, index) => index + 2)
      .filter((cut) => cut <= criticalLength - 2)
      .filter((cut) => !plannedCuts.includes(cut))
      .filter((cut) => !reservedGateEdgeIds.has(`edge_critical_${String(cut - 1).padStart(3, "0")}`))
      .sort((left, right) => Math.abs(left - desired) - Math.abs(right - desired) || left - right);
    if (!candidates.length) return failedStage([dungeonDiagnostic(
      "fatal", "floor_partition", "DNG_FLOOR_BOUNDARY_UNAVAILABLE",
      "No critical-path floor boundary can avoid gated edges while retaining meaningful floor groups.",
    )]);
    plannedCuts.push(candidates[0]);
  }
  plannedCuts.sort((left, right) => left - right);
  plannedCuts.forEach((cut) => {
    nodes[cut - 1].tags = [...new Set([...nodes[cut - 1].tags, "vertical_landing", "vertical_departure"])].sort();
    nodes[cut].tags = [...new Set([...nodes[cut].tags, "vertical_landing", "vertical_arrival"])].sort();
  });
  const plannedFloorFor = (node: DungeonGraphNode): number => {
    let mandatory = node;
    if (!node.mandatory) {
      const branchNodes = nodes.filter((candidate) => candidate.branchId === node.branchId);
      const attachmentId = edges.find((edge) => edge.tags.includes(node.branchId ?? "") &&
        branchNodes.some((candidate) => candidate.id === edge.toNodeId) &&
        nodes.find((candidate) => candidate.id === edge.fromNodeId)?.mandatory)?.fromNodeId;
      mandatory = nodes.find((candidate) => candidate.id === attachmentId) ?? node;
    }
    const index = nodes.findIndex((candidate) => candidate.id === mandatory.id);
    return plannedCuts.filter((cut) => index >= cut).length;
  };
  nodes.forEach((node) => { node.floorHint = plannedFloorFor(node); });

  const requestedLoops = sampleRange(recipe.topology.loopCount, topologyRng);
  for (let loopIndex = 0; loopIndex < requestedLoops; loopIndex += 1) {
    const candidates: Array<{ id: string; left: DungeonGraphNode; right: DungeonGraphNode; distance: number }> = [];
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        if (left.tags.includes("entrance") || left.tags.includes("objective") ||
          right.tags.includes("entrance") || right.tags.includes("objective")) continue;
        if (edgeExists(edges, left.id, right.id)) continue;
        if (plannedFloorFor(left) !== plannedFloorFor(right)) continue;
        const distance = graphShortestDistance({ nodes, edges }, left.id, right.id);
        if (!Number.isFinite(distance) || distance < 3) continue;
        // A useful loop must touch optional content or skip at least two spine edges.
        if (left.mandatory && right.mandatory && Math.abs(left.depth - right.depth) < 0.25) continue;
        // A shortcut may not cross either side of a reserved key gate. Otherwise
        // the vertical/corridor realization would encode a lock that can be
        // bypassed in the abstract graph.
        if ([...reservedGateEdgeIds].some((edgeId) => {
          const beforeGate = graphReachableFrom({ nodes, edges }, nodes[0].id, edgeId);
          return beforeGate.has(left.id) !== beforeGate.has(right.id);
        })) continue;
        candidates.push({ id: `${left.id}--${right.id}`, left, right, distance });
      }
    }
    if (!candidates.length) break;
    const compactCandidates = recipe.architecture.layoutStyle === "directional_crawl"
      ? (() => {
          const minimumDistance = Math.min(...candidates.map((candidate) => candidate.distance));
          return candidates.filter((candidate) => candidate.distance <= minimumDistance + 1);
        })()
      : candidates;
    const selected = topologyRng.pick(topologyRng.shuffleById(compactCandidates).slice(0, Math.min(8, compactCandidates.length)));
    edges.push({
      id: `edge_loop_${String(loopIndex).padStart(2, "0")}`,
      fromNodeId: selected.left.id,
      toNodeId: selected.right.id,
      kind: ordinaryConnectionKind,
      oneWay: false,
      tags: ["loop", "shortcut", `distance_${selected.distance}`],
    });
  }

  const requestedSecrets = Math.min(
    sampleRange(recipe.topology.secretCount, secretRng),
    nodes.filter((node) => !node.mandatory).length,
  );
  const secretCandidates = secretRng.shuffleById(nodes.filter((node) => !node.mandatory && node.tags.includes("branch_end")));
  for (const node of secretCandidates.slice(0, requestedSecrets)) {
    node.secret = true;
    node.tags = [...new Set([...node.tags, "secret"])].sort();
    const incoming = edges.find((edge) => edge.toNodeId === node.id || edge.fromNodeId === node.id);
    if (incoming) {
      incoming.kind = "secret";
      incoming.tags = [...new Set([...incoming.tags, "secret"])].sort();
    }
  }

  const optionalObjectiveCount = recipe.topology.optionalObjectiveCount
    ? sampleRange(recipe.topology.optionalObjectiveCount, topologyRng)
    : 0;
  const optionalObjectiveNodeIds = topologyRng.shuffleById(
    nodes.filter((node) => !node.mandatory && !node.secret),
  ).slice(0, optionalObjectiveCount).map((node) => node.id).sort();

  const definitionById = new Map(input.archetypes.map((definition) => [definition.id, definition]));
  const degreeByNode = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => {
    degreeByNode.set(edge.fromNodeId, (degreeByNode.get(edge.fromNodeId) ?? 0) + 1);
    degreeByNode.set(edge.toNodeId, (degreeByNode.get(edge.toNodeId) ?? 0) + 1);
  });
  const pool = recipe.architecture.roomArchetypePool.filter((entry) => definitionById.has(entry.id));
  const priority = new Map<string, number>();
  for (const node of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const entry of [...pool].sort((left, right) => left.id.localeCompare(right.id))) {
      priority.set(`${node.id}|${entry.id}`, -Math.log(Math.max(Number.EPSILON, archetypeRng.next())) / entry.weight);
    }
  }
  const requiredRemaining = new Map<string, number>();
  recipe.constraints.requiredRoomArchetypes.forEach((id) => requiredRemaining.set(id, (requiredRemaining.get(id) ?? 0) + 1));
  const assigned = new Map<string, string>();
  let assignmentSearches = 0;
  const candidatesFor = (node: DungeonGraphNode) => pool.filter((entry) => {
    const definition = definitionById.get(entry.id)!;
    return isArchetypeLegal(
      node, degreeByNode.get(node.id) ?? 0, definition, definitionById, assigned, edges,
      recipe.constraints.forbiddenAdjacencies,
    );
  });
  const assignNext = (): boolean => {
    assignmentSearches += 1;
    if (assignmentSearches > 250_000) return false;
    const unassigned = nodes.filter((node) => !assigned.has(node.id));
    if (!unassigned.length) return [...requiredRemaining.values()].every((count) => count <= 0);
    // Every outstanding required archetype must still have enough legal hosts.
    for (const [requiredId, count] of requiredRemaining) {
      if (count <= 0) continue;
      if (unassigned.filter((node) => candidatesFor(node).some((entry) => entry.id === requiredId)).length < count) return false;
    }
    const rankedNodes = unassigned.map((node) => ({ node, candidates: candidatesFor(node) }))
      .sort((left, right) => left.candidates.length - right.candidates.length ||
        Number(right.node.tags.includes("entrance") || right.node.tags.includes("objective")) -
          Number(left.node.tags.includes("entrance") || left.node.tags.includes("objective")) ||
        (degreeByNode.get(right.node.id) ?? 0) - (degreeByNode.get(left.node.id) ?? 0) ||
        left.node.id.localeCompare(right.node.id));
    const selected = rankedNodes[0];
    if (!selected?.candidates.length) return false;
    const ordered = [...selected.candidates].sort((left, right) =>
      Number((requiredRemaining.get(right.id) ?? 0) > 0) - Number((requiredRemaining.get(left.id) ?? 0) > 0) ||
      (priority.get(`${selected.node.id}|${left.id}`) ?? 0) - (priority.get(`${selected.node.id}|${right.id}`) ?? 0) ||
      left.id.localeCompare(right.id));
    for (const candidate of ordered) {
      assigned.set(selected.node.id, candidate.id);
      const consumedRequired = (requiredRemaining.get(candidate.id) ?? 0) > 0;
      if (consumedRequired) requiredRemaining.set(candidate.id, requiredRemaining.get(candidate.id)! - 1);
      if (assignNext()) return true;
      if (consumedRequired) requiredRemaining.set(candidate.id, requiredRemaining.get(candidate.id)! + 1);
      assigned.delete(selected.node.id);
    }
    return false;
  };
  if (!assignNext()) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "archetypes", "DNG_ARCHETYPE_ASSIGNMENT_UNSATISFIABLE",
      "No complete legal archetype assignment satisfies degree, special-room, adjacency, and required-archetype constraints.",
      { relatedIds: [...requiredRemaining].filter(([, count]) => count > 0).map(([id]) => id) },
    ));
  }
  nodes.forEach((node) => { node.archetypeId = assigned.get(node.id) ?? "missing"; });

  const gates: DungeonGraph["gates"] = [];
  for (let gateIndex = 0; gateIndex < reservedGateEdges.length; gateIndex += 1) {
    const edge = edges.find((candidate) => candidate.id === reservedGateEdges[gateIndex].id)!;
    const reachableBeforeGate = [...graphReachableFrom({ nodes, edges }, nodes[0].id, edge.id)]
      .map((id) => nodes.find((node) => node.id === id)!)
      .filter((node) => node.id !== nodes[0].id && node.id !== nodes[criticalLength - 1].id && !node.secret)
      .filter((node) => node.floorHint === nodes.find((candidate) => candidate.id === edge.fromNodeId)?.floorHint)
      .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
    if (!reachableBeforeGate.length) continue;
    const source = gateRng.pick(reachableBeforeGate.slice(0, Math.max(1, Math.ceil(reachableBeforeGate.length * 0.75))));
    const requiredId = input.keyItemIds?.[gateIndex % Math.max(1, input.keyItemIds.length)] ??
      `dng_key_${recipe.id}_${String(gateIndex).padStart(2, "0")}`;
    const gateId = `gate_key_${String(gateIndex).padStart(2, "0")}`;
    gates.push({
      id: gateId,
      edgeId: edge.id,
      type: "key",
      requiredId,
      sourceNodeId: source.id,
      mandatory: true,
      consumeOnUse: false,
    });
    edge.kind = "locked";
    edge.gateId = gateId;
    edge.tags = [...new Set([...edge.tags, "gate", "locked"])].sort();
    source.tags = [...new Set([...source.tags, "key_source"])].sort();
  }
  if (gates.length < requestedLocks) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "gates", "DNG_GATE_COUNT_SHORTFALL",
      `Only ${gates.length} non-bypassable critical gates could be assigned; recipe requested ${requestedLocks}.`,
    ));
  }

  const graph: DungeonGraph = {
    nodes,
    edges,
    entranceNodeId: nodes[0].id,
    objectiveNodeId: nodes[criticalLength - 1].id,
    optionalObjectiveNodeIds,
    gates,
    metrics: computeGraphMetrics(nodes, edges, nodes[0].id, nodes[criticalLength - 1].id, gates),
  };
  diagnostics.push(...auditDungeonGraph(graph, recipe, input.archetypes));
  const parsedGraph = DungeonGraphSchema.safeParse(canonicalDungeonGraph(graph));
  if (!parsedGraph.success) {
    diagnostics.push(...parsedGraph.error.issues.map((issue) => dungeonDiagnostic(
      "fatal", "topology", "DNG_GRAPH_SCHEMA_INVALID",
      `${issue.path.join(".")}: ${issue.message}`,
    )));
  }
  const metrics = {
    nodes: nodes.length,
    edges: edges.length,
    loops: graph.metrics.loopCount,
    branches: graph.metrics.branchCount,
    secrets: graph.metrics.secretCount,
    gates: gates.length,
  };
  return diagnostics.some((entry) => entry.severity === "fatal") || !parsedGraph.success
    ? failedStage(diagnostics, metrics)
    : successfulStage(parsedGraph.data, diagnostics, metrics);
};

export { simulateDungeonProgression } from "./progressionAudit";
export type { DungeonProgressionResult } from "./progressionAudit";
