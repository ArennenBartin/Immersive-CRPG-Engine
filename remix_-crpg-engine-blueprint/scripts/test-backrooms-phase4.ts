import assert from "node:assert/strict";
import {
  BackroomsSemanticGraphSchema,
  LEVEL0_CMT_PHASE4_ANCHORS,
  canonicalBackroomsGraph,
  createLevel0CmtBackroomsRecipe,
  evaluateBackroomsGraphQuality,
  generateBackroomsSemanticGraph,
  hashBackroomsGraph,
  splitBackroomsHubs,
  type BackroomsGraphEdge,
  type BackroomsGraphNode,
} from "../src/backroomsGen";

console.log("backrooms phase 4: deterministic semantic graph contract");
const recipe = createLevel0CmtBackroomsRecipe("phase4-determinism");
const first = generateBackroomsSemanticGraph({
  recipe,
  requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  debug: true,
});
const repeated = generateBackroomsSemanticGraph({
  recipe,
  requiredAnchors: [...LEVEL0_CMT_PHASE4_ANCHORS].reverse(),
  debug: true,
});
assert.equal(first.success, true, JSON.stringify(first.diagnostics));
assert.equal(repeated.success, true, JSON.stringify(repeated.diagnostics));
assert.ok(first.graph && first.quality && repeated.graph && repeated.quality);
assert.deepEqual(first.graph, repeated.graph, "anchor input order must not change canonical output");
assert.deepEqual(first.choiceTraces, repeated.choiceTraces);
assert.equal(first.graph.metrics.canonicalHash, hashBackroomsGraph(first.graph));
assert.deepEqual(first.graph, canonicalBackroomsGraph(first.graph));
assert.equal(BackroomsSemanticGraphSchema.safeParse(first.graph).success, true);

console.log("backrooms phase 4: immutable backbone and optional loop semantics");
assert.ok(first.graph.edges
  .filter((edge) => edge.kind === "backbone" || edge.kind === "anchor")
  .every((edge) => edge.immutable && !edge.mutableCandidate));
assert.ok(first.graph.edges
  .filter((edge) => edge.kind === "loop")
  .every((edge) => !edge.immutable && edge.mutableCandidate));
assert.ok(first.graph.requiredAnchorNodeIds.every((id) =>
  first.graph!.nodes.find((node) => node.id === id)?.required));
assert.equal(
  first.graph.edges.some((edge) => (edge as BackroomsGraphEdge & { shifted?: boolean }).shifted),
  false,
  "Phase 4 marks future mutable candidates but does not implement peripheral shifting",
);

const brokenBackbone = structuredClone(first.graph);
const anchorBackboneEdge = brokenBackbone.edges.find((edge) => edge.kind === "anchor")!;
anchorBackboneEdge.immutable = false;
const brokenBackboneQuality = evaluateBackroomsGraphQuality({ recipe, graph: brokenBackbone });
assert.equal(brokenBackboneQuality.ready, false);
assert.ok(brokenBackboneQuality.checks.some((check) =>
  check.code === "BRG_IMMUTABLE_BACKBONE" && !check.passed));

const disconnected = structuredClone(first.graph);
disconnected.edges = disconnected.edges.filter((edge) =>
  edge.fromNodeId !== disconnected.startNodeId && edge.toNodeId !== disconnected.startNodeId);
const disconnectedQuality = evaluateBackroomsGraphQuality({ recipe, graph: disconnected });
assert.equal(disconnectedQuality.ready, false);
assert.equal(disconnectedQuality.metrics.componentCount, 2);
assert.ok(disconnectedQuality.checks.some((check) =>
  check.code === "BRG_CONNECTED" && !check.passed));

console.log("backrooms phase 4: deterministic hub splitting");
const hubNodes: BackroomsGraphNode[] = ["hub", "a", "b", "c", "d", "e"].map(
  (id, ordinal) => ({
    id,
    kind: "connective",
    ordinal,
    required: id === "hub",
    quiet: true,
    tags: [],
  }),
);
const hubEdges: BackroomsGraphEdge[] = ["a", "b", "c", "d", "e"].map(
  (id, index) => ({
    id: `hub-edge-${index}`,
    fromNodeId: "hub",
    toNodeId: id,
    kind: index === 0 ? "backbone" : "ordinary",
    immutable: index === 0,
    mutableCandidate: false,
    tags: [],
  }),
);
const splitOnce = splitBackroomsHubs(hubNodes, hubEdges);
const splitTwice = splitBackroomsHubs(hubNodes, hubEdges);
assert.deepEqual(splitOnce, splitTwice);
const splitDegrees = new Map(hubNodes.map((node) => [node.id, 0]));
splitOnce.forEach((edge) => {
  splitDegrees.set(edge.fromNodeId, splitDegrees.get(edge.fromNodeId)! + 1);
  splitDegrees.set(edge.toNodeId, splitDegrees.get(edge.toNodeId)! + 1);
});
assert.ok(Math.max(...splitDegrees.values()) <= 4);
assert.ok(splitOnce.some((edge) => edge.tags.includes("hub_split")));

console.log("backrooms phase 4: 32-seed quality corpus");
const hashes = new Set<string>();
for (let index = 0; index < 32; index += 1) {
  const seed = `backrooms-phase4-corpus-${String(index).padStart(2, "0")}`;
  const corpusRecipe = createLevel0CmtBackroomsRecipe(seed);
  const result = generateBackroomsSemanticGraph({
    recipe: corpusRecipe,
    requiredAnchors: LEVEL0_CMT_PHASE4_ANCHORS,
  });
  assert.equal(result.success, true, `${seed}: ${JSON.stringify(result.diagnostics)}`);
  assert.ok(result.graph && result.quality, `${seed}: graph and quality report are required`);
  const { graph, quality } = result;
  hashes.add(graph.metrics.canonicalHash);
  assert.equal(quality.ready, true, `${seed}: ${JSON.stringify(quality.checks.filter((check) => check.blocking && !check.passed))}`);
  assert.ok(
    quality.checks.every((check) => check.passed),
    `${seed}: ${JSON.stringify(quality.checks.filter((check) => !check.passed))}`,
  );
  assert.equal(graph.metrics.componentCount, 1, `${seed}: graph disconnected`);
  assert.equal(graph.metrics.requiredAnchorReachability, 1, `${seed}: required anchor unreachable`);
  assert.ok(
    graph.metrics.cycleDensity >= corpusRecipe.navigation.loopDensity.min &&
      graph.metrics.cycleDensity <= corpusRecipe.navigation.loopDensity.max,
    `${seed}: cycle density ${graph.metrics.cycleDensity}`,
  );
  assert.ok(
    graph.metrics.incidentalDeadEndRate >= corpusRecipe.navigation.incidentalDeadEndRatio.min &&
      graph.metrics.incidentalDeadEndRate <= corpusRecipe.navigation.incidentalDeadEndRatio.max,
    `${seed}: dead-end rate ${graph.metrics.incidentalDeadEndRate}`,
  );
  assert.equal(
    graph.metrics.cycleCount,
    graph.edges.length - graph.nodes.length + 1,
    `${seed}: cycle rank mismatch`,
  );
  assert.ok(graph.metrics.maximumNodeDegree <= 4, `${seed}: excessive hub`);
  assert.ok(
    graph.metrics.startToTransitionPathLength >= Math.floor(graph.nodes.length * 0.35),
    `${seed}: route collapsed to ${graph.metrics.startToTransitionPathLength}`,
  );
  assert.equal(graph.metrics.canonicalHash, hashBackroomsGraph(graph));
  assert.equal(BackroomsSemanticGraphSchema.safeParse(graph).success, true);
}
assert.ok(hashes.size >= 28, `expected seed variety, received ${hashes.size} unique graphs`);

console.log("Backrooms Phase 4 semantic graph and 32-seed quality corpus passed.");
