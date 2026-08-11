import { stableContentHash } from "../generation-facing/stableHash";
import { hashBackroomsGraph } from "./canonical";
import { BackroomsSemanticGraphSchema } from "./schema";
import type {
  BackroomsGraphEdge,
  BackroomsGraphMetrics,
  BackroomsGraphNode,
  BackroomsRecipeDef,
  BackroomsSemanticGraph,
} from "./types";

export interface BackroomsQualityCheck {
  code: string;
  label: string;
  blocking: boolean;
  passed: boolean;
  actual: string;
  expected: string;
}

export interface BackroomsQualityReport {
  ready: boolean;
  metrics: BackroomsGraphMetrics;
  checks: BackroomsQualityCheck[];
}

interface GraphStructure {
  nodes: readonly BackroomsGraphNode[];
  edges: readonly BackroomsGraphEdge[];
}

const adjacency = (
  graph: GraphStructure,
  edges: readonly BackroomsGraphEdge[] = graph.edges,
) => {
  const links = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    links.get(edge.fromNodeId)?.push(edge.toNodeId);
    links.get(edge.toNodeId)?.push(edge.fromNodeId);
  }
  for (const neighbors of links.values()) neighbors.sort();
  return links;
};

export const reachableBackroomsNodes = (
  graph: GraphStructure,
  startNodeId: string,
  edges: readonly BackroomsGraphEdge[] = graph.edges,
): Set<string> => {
  const links = adjacency(graph, edges);
  const reached = new Set<string>();
  const queue = [startNodeId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (reached.has(current) || !links.has(current)) continue;
    reached.add(current);
    for (const next of links.get(current) ?? []) {
      if (!reached.has(next)) queue.push(next);
    }
  }
  return reached;
};

export const shortestBackroomsPath = (
  graph: GraphStructure,
  fromNodeId: string,
  toNodeId: string,
): string[] | undefined => {
  const links = adjacency(graph);
  if (!links.has(fromNodeId) || !links.has(toNodeId)) return undefined;
  const previous = new Map<string, string>();
  const reached = new Set<string>([fromNodeId]);
  const queue = [fromNodeId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current === toNodeId) break;
    for (const next of links.get(current) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!reached.has(toNodeId)) return undefined;
  const path = [toNodeId];
  while (path[0] !== fromNodeId) {
    const parent = previous.get(path[0]);
    if (!parent) return undefined;
    path.unshift(parent);
  }
  return path;
};

export const backroomsGraphDistance = (
  graph: GraphStructure,
  fromNodeId: string,
  toNodeId: string,
): number => {
  const path = shortestBackroomsPath(graph, fromNodeId, toNodeId);
  return path ? path.length - 1 : Number.POSITIVE_INFINITY;
};

const componentCount = (graph: GraphStructure): number => {
  const remaining = new Set(graph.nodes.map((node) => node.id));
  let count = 0;
  while (remaining.size) {
    const start = [...remaining].sort()[0];
    for (const id of reachableBackroomsNodes(graph, start)) remaining.delete(id);
    count += 1;
  }
  return count;
};

const minimumPairDistance = (
  graph: GraphStructure,
  nodeIds: readonly string[],
  edges: readonly BackroomsGraphEdge[] = graph.edges,
): number | null => {
  const unique = [...new Set(nodeIds)].sort();
  if (unique.length < 2) return null;
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < unique.length; left += 1) {
    for (let right = left + 1; right < unique.length; right += 1) {
      minimum = Math.min(
        minimum,
        backroomsGraphDistance({ nodes: graph.nodes, edges }, unique[left], unique[right]),
      );
    }
  }
  return Number.isFinite(minimum) ? minimum : null;
};

const longestQuietRun = (
  graph: BackroomsSemanticGraph,
  path: readonly string[],
): number => {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  let current = 0;
  let longest = 0;
  for (const id of path) {
    if (nodes.get(id)?.quiet) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
};

export const measureBackroomsGraph = (
  graph: BackroomsSemanticGraph,
): BackroomsGraphMetrics => {
  const degrees = new Map(graph.nodes.map((node) => [node.id, 0]));
  graph.edges.forEach((edge) => {
    degrees.set(edge.fromNodeId, (degrees.get(edge.fromNodeId) ?? 0) + 1);
    degrees.set(edge.toNodeId, (degrees.get(edge.toNodeId) ?? 0) + 1);
  });
  const components = componentCount(graph);
  const cycleCount = Math.max(0, graph.edges.length - graph.nodes.length + components);
  const deadEnds = graph.nodes.filter((node) => (degrees.get(node.id) ?? 0) === 1);
  const incidentalDeadEnds = deadEnds.filter((node) => !node.required);
  const reached = reachableBackroomsNodes(graph, graph.startNodeId);
  const requiredIds = [...new Set(graph.requiredAnchorNodeIds)];
  const reachableRequired = requiredIds.filter((id) => reached.has(id)).length;
  const startToTransitionPath = shortestBackroomsPath(
    graph,
    graph.startNodeId,
    graph.transitionNodeId,
  ) ?? [];
  const routeDistances = graph.nodes.map((node) =>
    backroomsGraphDistance(graph, graph.startNodeId, node.id));
  const finiteRouteDistances = routeDistances.filter(Number.isFinite);
  const immutableEdges = graph.edges.filter((edge) => edge.immutable);
  const provisional = {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    componentCount: components,
    cycleCount,
    cycleDensity: graph.nodes.length ? cycleCount / graph.nodes.length : 0,
    deadEndCount: deadEnds.length,
    incidentalDeadEndCount: incidentalDeadEnds.length,
    incidentalDeadEndRate: graph.nodes.length
      ? incidentalDeadEnds.length / graph.nodes.length
      : 0,
    averageNodeDegree: graph.nodes.length
      ? [...degrees.values()].reduce((sum, degree) => sum + degree, 0) / graph.nodes.length
      : 0,
    maximumNodeDegree: Math.max(0, ...degrees.values()),
    requiredAnchorReachability: requiredIds.length
      ? reachableRequired / requiredIds.length
      : 1,
    startToCulminationPathLength: Number.isFinite(backroomsGraphDistance(graph, graph.startNodeId, graph.culminationNodeId))
      ? backroomsGraphDistance(graph, graph.startNodeId, graph.culminationNodeId)
      : 0,
    startToTransitionPathLength: startToTransitionPath.length
      ? startToTransitionPath.length - 1
      : 0,
    longestShortestRoute: finiteRouteDistances.length
      ? Math.max(...finiteRouteDistances)
      : 0,
    minimumAnchorSpacing: minimumPairDistance(
      graph,
      graph.nodes.filter((node) => node.kind === "anchor").map((node) => node.id),
      immutableEdges,
    ),
    minimumLandmarkSpacing: minimumPairDistance(graph, graph.landmarkNodeIds, immutableEdges),
    quietStretchEstimate: longestQuietRun(graph, startToTransitionPath),
    minimumSetPieceSeparation: minimumPairDistance(graph, graph.setPieceNodeIds, immutableEdges),
    canonicalHash: "pending",
  } satisfies BackroomsGraphMetrics;
  const graphWithMetrics = { ...graph, metrics: provisional };
  return { ...provisional, canonicalHash: hashBackroomsGraph(graphWithMetrics) };
};

const check = (
  code: string,
  label: string,
  blocking: boolean,
  passed: boolean,
  actual: string | number,
  expected: string,
): BackroomsQualityCheck => ({
  code,
  label,
  blocking,
  passed,
  actual: String(actual),
  expected,
});

export const evaluateBackroomsGraphQuality = ({
  recipe,
  graph,
}: {
  recipe: BackroomsRecipeDef;
  graph: BackroomsSemanticGraph;
}): BackroomsQualityReport => {
  const metrics = measureBackroomsGraph(graph);
  const graphWithMeasuredMetrics = { ...graph, metrics };
  const schemaValid = BackroomsSemanticGraphSchema.safeParse(graphWithMeasuredMetrics).success;
  const immutableEdges = graph.edges.filter((edge) => edge.immutable);
  const immutableReach = reachableBackroomsNodes(graph, graph.startNodeId, immutableEdges);
  const immutableRequiredReachability = graph.requiredAnchorNodeIds.every((id) =>
    immutableReach.has(id));
  const metricIdentityMatches = stableContentHash(graph.metrics) === stableContentHash(metrics);
  const checks = [
    check("BRG_SCHEMA", "Semantic graph schema", true, schemaValid, schemaValid ? "valid" : "invalid", "valid"),
    check("BRG_CONNECTED", "One connected component", true, metrics.componentCount === 1, metrics.componentCount, "exactly 1"),
    check("BRG_REQUIRED_ANCHORS", "Every required anchor is reachable", true, metrics.requiredAnchorReachability === 1, metrics.requiredAnchorReachability, "100%"),
    check("BRG_IMMUTABLE_BACKBONE", "Required anchors survive optional-edge removal", true, immutableRequiredReachability, immutableRequiredReachability ? "reachable" : "broken", "reachable through immutable edges"),
    check(
      "BRG_LOOP_DENSITY",
      "Cycle density",
      true,
      metrics.cycleDensity >= recipe.navigation.loopDensity.min &&
        metrics.cycleDensity <= recipe.navigation.loopDensity.max,
      metrics.cycleDensity.toFixed(4),
      `${recipe.navigation.loopDensity.min}–${recipe.navigation.loopDensity.max}`,
    ),
    check(
      "BRG_DEAD_END_RATE",
      "Incidental dead-end rate",
      true,
      metrics.incidentalDeadEndRate >= recipe.navigation.incidentalDeadEndRatio.min &&
        metrics.incidentalDeadEndRate <= recipe.navigation.incidentalDeadEndRatio.max,
      metrics.incidentalDeadEndRate.toFixed(4),
      `${recipe.navigation.incidentalDeadEndRatio.min}–${recipe.navigation.incidentalDeadEndRatio.max}`,
    ),
    check("BRG_HUB_DEGREE", "Maximum room degree", true, metrics.maximumNodeDegree <= 4, metrics.maximumNodeDegree, "≤ 4"),
    check(
      "BRG_ROUTE_LENGTH",
      "Start-to-transition route length",
      true,
      metrics.startToTransitionPathLength >= Math.floor(metrics.nodeCount * 0.35),
      metrics.startToTransitionPathLength,
      `≥ ${Math.floor(metrics.nodeCount * 0.35)} rooms`,
    ),
    check("BRG_METRICS_CANONICAL", "Stored metrics and canonical hash", true, metricIdentityMatches, metricIdentityMatches ? "canonical" : "stale", "canonical"),
    check(
      "BRG_ANCHOR_SPACING",
      "Minimum anchor spacing",
      false,
      metrics.minimumAnchorSpacing === null ||
        metrics.minimumAnchorSpacing >= recipe.navigation.anchorSpacingRooms.min,
      metrics.minimumAnchorSpacing ?? "n/a",
      `≥ ${recipe.navigation.anchorSpacingRooms.min} rooms`,
    ),
    check(
      "BRG_LANDMARK_SPACING",
      "Minimum landmark spacing",
      false,
      metrics.minimumLandmarkSpacing === null ||
        metrics.minimumLandmarkSpacing >= recipe.navigation.landmarkSpacingRooms.min,
      metrics.minimumLandmarkSpacing ?? "n/a",
      `≥ ${recipe.navigation.landmarkSpacingRooms.min} rooms`,
    ),
    check(
      "BRG_QUIET_STRETCH",
      "Quiet-stretch estimate",
      false,
      metrics.quietStretchEstimate <= recipe.pacing.maxQuietRoomsBeforeNoveltyBoost,
      metrics.quietStretchEstimate,
      `≤ ${recipe.pacing.maxQuietRoomsBeforeNoveltyBoost} rooms`,
    ),
    check(
      "BRG_SET_PIECE_SEPARATION",
      "Minimum set-piece separation",
      false,
      metrics.minimumSetPieceSeparation === null ||
        metrics.minimumSetPieceSeparation >= recipe.navigation.anchorSpacingRooms.min,
      metrics.minimumSetPieceSeparation ?? "n/a",
      `≥ ${recipe.navigation.anchorSpacingRooms.min} rooms`,
    ),
  ];
  return {
    ready: checks.filter((entry) => entry.blocking).every((entry) => entry.passed),
    metrics,
    checks,
  };
};
