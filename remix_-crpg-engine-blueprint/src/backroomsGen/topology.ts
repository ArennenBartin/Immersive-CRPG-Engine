import { canonicalBackroomsGraph } from "./canonical";
import { backroomsDiagnostic, sortBackroomsDiagnostics } from "./diagnostics";
import {
  BackroomsAnchorRequestSchema,
  BackroomsRecipeSchema,
  BackroomsSemanticGraphSchema,
} from "./schema";
import { createBackroomsSeedContext, type BackroomsRandom } from "./seedContext";
import {
  backroomsGraphDistance,
  evaluateBackroomsGraphQuality,
  measureBackroomsGraph,
  shortestBackroomsPath,
  type BackroomsQualityReport,
} from "./quality";
import type {
  BackroomsAnchorRequest,
  BackroomsDiagnostic,
  BackroomsGraphEdge,
  BackroomsGraphNode,
  BackroomsRecipeDef,
  BackroomsSemanticGraph,
} from "./types";

export interface BuildBackroomsSemanticGraphInput {
  recipe: BackroomsRecipeDef;
  requiredAnchors?: readonly BackroomsAnchorRequest[];
  attemptIndex?: number;
  debug?: boolean;
}

export interface BackroomsGraphGenerationResult {
  success: boolean;
  graph?: BackroomsSemanticGraph;
  quality?: BackroomsQualityReport;
  attempts: number;
  diagnostics: BackroomsDiagnostic[];
  choiceTraces: ReturnType<typeof createBackroomsSeedContext>["choiceTraces"];
}

interface SpecialNode {
  id: string;
  kind: BackroomsGraphNode["kind"];
  required: boolean;
  quiet: boolean;
  anchorId?: string;
  tags: string[];
}

const rangeIntegerBounds = (
  range: { min: number; max: number },
  count: number,
) => ({
  min: Math.ceil(range.min * count - Number.EPSILON),
  max: Math.floor(range.max * count + Number.EPSILON),
});

const degreesFor = (
  nodes: readonly BackroomsGraphNode[],
  edges: readonly BackroomsGraphEdge[],
) => {
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    degrees.set(edge.fromNodeId, (degrees.get(edge.fromNodeId) ?? 0) + 1);
    degrees.set(edge.toNodeId, (degrees.get(edge.toNodeId) ?? 0) + 1);
  }
  return degrees;
};

const edgeExists = (
  edges: readonly BackroomsGraphEdge[],
  left: string,
  right: string,
) => edges.some((edge) =>
  (edge.fromNodeId === left && edge.toNodeId === right) ||
  (edge.fromNodeId === right && edge.toNodeId === left));

const preservesNavigationPacing = (
  nodes: readonly BackroomsGraphNode[],
  edges: readonly BackroomsGraphEdge[],
  minimumRouteLength: number,
): boolean => {
  const routeLength = backroomsGraphDistance(
    { nodes, edges },
    "node.start",
    "node.transition",
  );
  return routeLength >= minimumRouteLength;
};

/**
 * Redistribute non-required spokes through a neighboring connective zone.
 * Normal generation caps degrees before this pass; this is the deterministic
 * correction gate for future profile changes and hand-built graph fixtures.
 */
export const splitBackroomsHubs = (
  nodes: readonly BackroomsGraphNode[],
  sourceEdges: readonly BackroomsGraphEdge[],
  maximumDegree = 4,
): BackroomsGraphEdge[] => {
  const edges = structuredClone(sourceEdges) as BackroomsGraphEdge[];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (let guard = 0; guard < edges.length * 2; guard += 1) {
    const degrees = degreesFor(nodes, edges);
    const hub = [...degrees.entries()]
      .filter(([, degree]) => degree > maximumDegree)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    if (!hub) break;
    const [hubId] = hub;
    const neighbors = edges.flatMap((edge) => {
      if (edge.fromNodeId === hubId) return [edge.toNodeId];
      if (edge.toNodeId === hubId) return [edge.fromNodeId];
      return [];
    });
    const relief = [...new Set(neighbors)]
      .filter((id) => nodeById.get(id)?.kind === "connective" && (degrees.get(id) ?? 0) < maximumDegree)
      .sort((left, right) => (degrees.get(left) ?? 0) - (degrees.get(right) ?? 0) || left.localeCompare(right))[0];
    if (!relief) break;
    const movable = edges
      .filter((edge) => !edge.immutable &&
        (edge.fromNodeId === hubId || edge.toNodeId === hubId))
      .filter((edge) => {
        const other = edge.fromNodeId === hubId ? edge.toNodeId : edge.fromNodeId;
        return other !== relief && !edgeExists(edges, relief, other);
      })
      .sort((left, right) => right.id.localeCompare(left.id))[0];
    if (!movable) break;
    if (movable.fromNodeId === hubId) movable.fromNodeId = relief;
    else movable.toNodeId = relief;
    movable.tags = [...new Set([...movable.tags, "hub_split"])].sort();
  }
  return edges;
};

const evenlySpacedPositions = (count: number, available: number): number[] => {
  if (count <= 0) return [];
  if (count === 1) return [Math.floor((available - 1) / 2)];
  return Array.from({ length: count }, (_, index) =>
    Math.round((index * (available - 1)) / (count - 1)));
};

const chooseNearestFreePosition = (
  requested: number,
  available: ReadonlySet<number>,
) => [...available].sort((left, right) =>
  Math.abs(left - requested) - Math.abs(right - requested) || left - right)[0];

const makeEdge = (
  index: number,
  fromNodeId: string,
  toNodeId: string,
  kind: BackroomsGraphEdge["kind"],
  immutable: boolean,
  mutableCandidate = false,
  tags: string[] = [],
): BackroomsGraphEdge => ({
  id: `edge.${String(index).padStart(4, "0")}`,
  fromNodeId,
  toNodeId,
  kind,
  immutable,
  mutableCandidate,
  tags: [...new Set(tags)].sort(),
});

const buildAttempt = ({
  recipe,
  requiredAnchors = [],
  attemptIndex = 0,
  debug = false,
}: BuildBackroomsSemanticGraphInput) => {
  const seedContext = createBackroomsSeedContext({
    generatorVersion: recipe.generatorVersion,
    recipeId: recipe.id,
    seed: recipe.seed,
    stageSalts: recipe.stageSalts,
    attemptIndex,
    debug,
  });
  const rng = seedContext.stream("topology");
  const targetRooms = rng.intBetween(recipe.scale.roomCount.min, recipe.scale.roomCount.max);
  const cycleBounds = rangeIntegerBounds(recipe.navigation.loopDensity, targetRooms);
  const deadEndBounds = rangeIntegerBounds(recipe.navigation.incidentalDeadEndRatio, targetRooms);
  if (cycleBounds.max < cycleBounds.min || deadEndBounds.max < deadEndBounds.min) {
    throw new RangeError("Recipe ratio bands do not admit an integer graph target");
  }
  const targetCycles = rng.intBetween(cycleBounds.min, cycleBounds.max);
  const targetDeadEnds = rng.intBetween(deadEndBounds.min, deadEndBounds.max);
  const targetSetPieces = rng.intBetween(
    recipe.pacing.setPieceCount.min,
    recipe.pacing.setPieceCount.max,
  );
  const landmarkSpacing = rng.intBetween(
    recipe.navigation.landmarkSpacingRooms.min,
    recipe.navigation.landmarkSpacingRooms.max,
  );
  const targetLandmarks = landmarkSpacing > 0
    ? Math.max(1, Math.floor(targetRooms / landmarkSpacing))
    : 0;
  const minimumRouteLength = Math.floor(targetRooms * 0.35);

  const sortedAnchors = [...requiredAnchors].sort((left, right) =>
    left.id.localeCompare(right.id));
  const authoredSpecials = sortedAnchors.map((anchor, index): SpecialNode => ({
      id: `node.anchor.${String(index).padStart(3, "0")}`,
      kind: anchor.kind === "landmark"
        ? "landmark"
        : anchor.kind === "set_piece" ? "set_piece" : "anchor",
      required: true,
      quiet: anchor.quiet,
      anchorId: anchor.id,
      tags: [...new Set(["required_anchor", "story_reserved", ...anchor.tags])].sort(),
    }));
  const narrativeSpecials = authoredSpecials.filter((special) => special.kind !== "set_piece");
  const setPieceSpecials = [
    ...authoredSpecials.filter((special) => special.kind === "set_piece"),
    ...Array.from({ length: targetSetPieces }, (_, index): SpecialNode => ({
      id: `node.set_piece.${String(index).padStart(3, "0")}`,
      kind: "set_piece",
      required: true,
      quiet: false,
      anchorId: `generated.set_piece.${String(index).padStart(3, "0")}`,
      tags: ["required_anchor", "set_piece", "story_reserved"],
    })),
  ];
  const interleavedSpecials: SpecialNode[] = [];
  let narrativeIndex = 0;
  let setPieceIndex = 0;
  let useSetPiece = setPieceSpecials.length > narrativeSpecials.length;
  while (narrativeIndex < narrativeSpecials.length || setPieceIndex < setPieceSpecials.length) {
    if (useSetPiece && setPieceIndex < setPieceSpecials.length) {
      interleavedSpecials.push(setPieceSpecials[setPieceIndex++]);
    } else if (!useSetPiece && narrativeIndex < narrativeSpecials.length) {
      interleavedSpecials.push(narrativeSpecials[narrativeIndex++]);
    } else if (narrativeIndex < narrativeSpecials.length) {
      interleavedSpecials.push(narrativeSpecials[narrativeIndex++]);
    } else {
      interleavedSpecials.push(setPieceSpecials[setPieceIndex++]);
    }
    useSetPiece = !useSetPiece;
  }
  const internalSpecials: SpecialNode[] = [
    ...interleavedSpecials,
    {
      id: "node.culmination",
      kind: "culmination",
      required: true,
      quiet: false,
      anchorId: "culmination",
      tags: ["culmination", "required_anchor", "story_reserved"],
    },
  ];
  const specialCount = internalSpecials.length + 2;
  const minimumBackboneCount = specialCount + targetLandmarks;
  if (minimumBackboneCount > targetRooms) {
    throw new RangeError("Required anchors and landmarks exceed the sampled room count");
  }
  const desiredBranches = targetDeadEnds + targetCycles;
  const maximumBranches = targetRooms - minimumBackboneCount;
  const branchCount = Math.min(desiredBranches, maximumBranches);
  if (branchCount < targetDeadEnds) {
    throw new RangeError("Room count cannot satisfy the requested incidental dead-end band");
  }
  const backboneCount = targetRooms - branchCount;
  const specialSequence: SpecialNode[] = [
    {
      id: "node.start",
      kind: "start",
      required: true,
      quiet: false,
      anchorId: "start",
      tags: ["required_anchor", "start"],
    },
    ...internalSpecials,
    {
      id: "node.transition",
      kind: "transition",
      required: true,
      quiet: false,
      anchorId: "transition",
      tags: ["required_anchor", "story_reserved", "transition"],
    },
  ];
  const specialPositions = evenlySpacedPositions(specialSequence.length, backboneCount);
  const specialAt = new Map(specialPositions.map((position, index) =>
    [position, specialSequence[index]]));
  const quietModulo = Math.max(1, recipe.pacing.maxQuietRoomsBeforeNoveltyBoost + 1);
  const backboneNodes: BackroomsGraphNode[] = Array.from(
    { length: backboneCount },
    (_, ordinal) => {
      const special = specialAt.get(ordinal);
      if (special) return { ...special, ordinal };
      return {
        id: `node.connective.${String(ordinal).padStart(3, "0")}`,
        kind: "connective",
        ordinal,
        required: false,
        quiet: ordinal % quietModulo !== quietModulo - 1,
        tags: ["backrooms_connective"],
      };
    },
  );

  const landmarkCandidates = new Set(backboneNodes
    .filter((node) => node.kind === "connective")
    .map((node) => node.ordinal));
  const selectedLandmarkIds = backboneNodes
    .filter((node) => node.kind === "landmark")
    .map((node) => node.id);
  const selectedLandmarkPositions = backboneNodes
    .filter((node) => node.kind === "landmark")
    .map((node) => node.ordinal);
  const landmarkTargets = evenlySpacedPositions(targetLandmarks + 2, backboneCount).slice(1, -1);
  for (const requested of landmarkTargets) {
    const legalCandidates = new Set([...landmarkCandidates].filter((position) =>
      selectedLandmarkPositions.every((selected) =>
        Math.abs(position - selected) >= recipe.navigation.landmarkSpacingRooms.min)));
    const position = chooseNearestFreePosition(requested, legalCandidates);
    if (position === undefined) continue;
    landmarkCandidates.delete(position);
    selectedLandmarkPositions.push(position);
    const node = backboneNodes[position];
    node.kind = "landmark";
    node.quiet = false;
    node.tags = ["backrooms_landmark"];
    selectedLandmarkIds.push(node.id);
  }

  const branchNodes: BackroomsGraphNode[] = Array.from(
    { length: branchCount },
    (_, index) => ({
      id: `node.branch.${String(index).padStart(3, "0")}`,
      kind: "connective",
      ordinal: backboneCount + index,
      required: false,
      quiet: index % quietModulo !== quietModulo - 1,
      tags: ["backrooms_connective", "side_zone"],
    }),
  );
  const nodes = [...backboneNodes, ...branchNodes];
  let edgeIndex = 0;
  let edges: BackroomsGraphEdge[] = [];
  for (let index = 1; index < backboneNodes.length; index += 1) {
    const left = backboneNodes[index - 1];
    const right = backboneNodes[index];
    const anchorEdge = left.required || right.required;
    edges.push(makeEdge(
      edgeIndex++,
      left.id,
      right.id,
      anchorEdge ? "anchor" : "backbone",
      true,
      false,
      anchorEdge ? ["anchor_backbone", "required_backbone"] : ["required_backbone"],
    ));
  }

  const attachments = new Map<string, string>();
  for (const branch of branchNodes) {
    const degrees = degreesFor(nodes, edges);
    const candidates = backboneNodes
      .filter((node) => !node.required && node.kind !== "landmark")
      .filter((node) => (degrees.get(node.id) ?? 0) < 4)
      .map((node) => ({
        id: node.id,
        weight: Math.max(1, 5 - (degrees.get(node.id) ?? 0)),
        value: node.id,
      }));
    if (!candidates.length) throw new Error("No legal low-degree attachment remains for a side zone");
    const attachmentId = rng.weighted(candidates, `attach:${branch.id}`);
    attachments.set(branch.id, attachmentId);
    edges.push(makeEdge(edgeIndex++, attachmentId, branch.id, "ordinary", false, false, ["side_zone"]));
  }

  const convertibleLoopCount = Math.min(targetCycles, Math.max(0, branchCount - targetDeadEnds));
  const convertedBranches = rng.shuffleById(branchNodes).slice(0, convertibleLoopCount);
  for (const branch of convertedBranches) {
    const degrees = degreesFor(nodes, edges);
    const attachmentId = attachments.get(branch.id)!;
    const attachmentOrdinal = backboneNodes.find((node) => node.id === attachmentId)!.ordinal;
    const candidates = backboneNodes
      .filter((node) => !node.required && (degrees.get(node.id) ?? 0) < 4)
      .filter((node) => node.id !== attachmentId && !edgeExists(edges, node.id, branch.id))
      .filter((node) => {
        const separation = Math.abs(node.ordinal - attachmentOrdinal);
        if (separation < 3 || separation > 6) return false;
        const candidateEdge = makeEdge(
          edgeIndex,
          branch.id,
          node.id,
          "loop",
          false,
          true,
          ["deceptive_candidate", "loop"],
        );
        return preservesNavigationPacing(
          nodes,
          [...edges, candidateEdge],
          minimumRouteLength,
        );
      })
      .map((node) => ({
        id: node.id,
        weight: Math.max(1, 7 - Math.abs(node.ordinal - attachmentOrdinal)) *
          Math.max(1, 5 - (degrees.get(node.id) ?? 0)),
        value: node.id,
      }));
    if (!candidates.length) throw new Error(`No legal cross-connection remains for ${branch.id}`);
    const targetId = rng.weighted(candidates, `cross-connect:${branch.id}`);
    edges.push(makeEdge(edgeIndex++, branch.id, targetId, "loop", false, true, ["deceptive_candidate", "loop"]));
  }

  for (let loopIndex = convertedBranches.length; loopIndex < targetCycles; loopIndex += 1) {
    const degrees = degreesFor(nodes, edges);
    const protectedDeadEnds = new Set(branchNodes
      .filter((node) => (degrees.get(node.id) ?? 0) === 1)
      .map((node) => node.id));
    const eligible = nodes.filter((node) =>
      !node.required &&
      !protectedDeadEnds.has(node.id) &&
      (degrees.get(node.id) ?? 0) < 4);
    const pairs: Array<{ id: string; weight: number; value: readonly [string, string] }> = [];
    for (let left = 0; left < eligible.length; left += 1) {
      for (let right = left + 1; right < eligible.length; right += 1) {
        const a = eligible[left];
        const b = eligible[right];
        if (edgeExists(edges, a.id, b.id)) continue;
        const distance = backroomsGraphDistance({ nodes, edges }, a.id, b.id);
        if (!Number.isFinite(distance) || distance < 3) continue;
        const candidateEdge = makeEdge(
          edgeIndex,
          a.id,
          b.id,
          "loop",
          false,
          true,
          ["deceptive_candidate", "loop"],
        );
        if (!preservesNavigationPacing(
          nodes,
          [...edges, candidateEdge],
          minimumRouteLength,
        )) continue;
        pairs.push({
          id: `${a.id}|${b.id}`,
          weight: 1 / distance,
          value: [a.id, b.id],
        });
      }
    }
    if (!pairs.length) throw new Error("No legal low-degree pair remains for the target loop density");
    const [leftId, rightId] = rng.weighted(pairs, `additional-loop:${loopIndex}`);
    edges.push(makeEdge(edgeIndex++, leftId, rightId, "loop", false, true, ["deceptive_candidate", "loop"]));
  }

  edges = splitBackroomsHubs(nodes, edges);
  const transitionPath = shortestBackroomsPath(
    { nodes, edges },
    "node.start",
    "node.transition",
  ) ?? [];
  let quietRun = 0;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  for (const nodeId of transitionPath) {
    const node = nodeById.get(nodeId);
    if (!node?.quiet) {
      quietRun = 0;
      continue;
    }
    quietRun += 1;
    if (quietRun > recipe.pacing.maxQuietRoomsBeforeNoveltyBoost) {
      node.quiet = false;
      node.tags = [...new Set([...node.tags, "novelty_boost"])].sort();
      quietRun = 0;
    }
  }
  const requiredAnchorNodeIds = nodes
    .filter((node) => node.required && node.kind !== "start")
    .map((node) => node.id)
    .sort();
  const setPieceNodeIds = nodes
    .filter((node) => node.kind === "set_piece")
    .map((node) => node.id)
    .sort();
  const graph: BackroomsSemanticGraph = {
    nodes,
    edges,
    startNodeId: "node.start",
    culminationNodeId: "node.culmination",
    transitionNodeId: "node.transition",
    requiredAnchorNodeIds,
    landmarkNodeIds: [...new Set([
      ...selectedLandmarkIds,
      ...nodes.filter((node) => node.kind === "landmark").map((node) => node.id),
    ])].sort(),
    setPieceNodeIds,
    metrics: {
      nodeCount: 0,
      edgeCount: 0,
      componentCount: 0,
      cycleCount: 0,
      cycleDensity: 0,
      deadEndCount: 0,
      incidentalDeadEndCount: 0,
      incidentalDeadEndRate: 0,
      averageNodeDegree: 0,
      maximumNodeDegree: 0,
      requiredAnchorReachability: 0,
      startToCulminationPathLength: 0,
      startToTransitionPathLength: 0,
      longestShortestRoute: 0,
      minimumAnchorSpacing: null,
      minimumLandmarkSpacing: null,
      quietStretchEstimate: 0,
      minimumSetPieceSeparation: null,
      canonicalHash: "pending",
    },
  };
  graph.metrics = measureBackroomsGraph(graph);
  return {
    graph: BackroomsSemanticGraphSchema.parse(canonicalBackroomsGraph(graph)),
    seedContext,
  };
};

export const generateBackroomsSemanticGraph = (
  input: BuildBackroomsSemanticGraphInput,
): BackroomsGraphGenerationResult => {
  const parsedRecipe = BackroomsRecipeSchema.safeParse(input.recipe);
  if (!parsedRecipe.success) {
    return {
      success: false,
      attempts: 0,
      diagnostics: [backroomsDiagnostic(
        "fatal",
        "topology",
        "BRG_RECIPE_SCHEMA_INVALID",
        parsedRecipe.error.issues.map((issue) =>
          `${issue.path.join(".") || "recipe"}: ${issue.message}`).join("; "),
      )],
      choiceTraces: [],
    };
  }
  const anchors = input.requiredAnchors ?? [];
  const parsedAnchors = BackroomsAnchorRequestSchema.array().safeParse(anchors);
  const duplicateAnchorIds = new Set<string>();
  const seenAnchorIds = new Set<string>();
  anchors.forEach((anchor) => {
    if (seenAnchorIds.has(anchor.id)) duplicateAnchorIds.add(anchor.id);
    seenAnchorIds.add(anchor.id);
  });
  if (!parsedAnchors.success || duplicateAnchorIds.size) {
    return {
      success: false,
      attempts: 0,
      diagnostics: [backroomsDiagnostic(
        "fatal",
        "anchors",
        "BRG_ANCHOR_SCHEMA_INVALID",
        duplicateAnchorIds.size
          ? `Duplicate required anchor IDs: ${[...duplicateAnchorIds].sort().join(", ")}`
          : parsedAnchors.error.issues.map((issue) => issue.message).join("; "),
      )],
      choiceTraces: [],
    };
  }

  const diagnostics: BackroomsDiagnostic[] = [];
  let best:
    | { graph: BackroomsSemanticGraph; quality: BackroomsQualityReport; traces: BackroomsGraphGenerationResult["choiceTraces"] }
    | undefined;
  const maximumAttempts = parsedRecipe.data.constraints.maxGenerationAttempts;
  for (let attemptIndex = 0; attemptIndex < maximumAttempts; attemptIndex += 1) {
    try {
      const attempt = buildAttempt({
        recipe: parsedRecipe.data,
        requiredAnchors: parsedAnchors.data,
        attemptIndex,
        debug: input.debug,
      });
      const quality = evaluateBackroomsGraphQuality({
        recipe: parsedRecipe.data,
        graph: attempt.graph,
      });
      if (!best || quality.checks.filter((entry) => entry.blocking && entry.passed).length >
        best.quality.checks.filter((entry) => entry.blocking && entry.passed).length) {
        best = { graph: attempt.graph, quality, traces: attempt.seedContext.choiceTraces };
      }
      if (quality.ready) {
        return {
          success: true,
          graph: attempt.graph,
          quality,
          attempts: attemptIndex + 1,
          diagnostics: sortBackroomsDiagnostics(diagnostics),
          choiceTraces: attempt.seedContext.choiceTraces,
        };
      }
      diagnostics.push(...quality.checks
        .filter((check) => check.blocking && !check.passed)
        .map((check) => backroomsDiagnostic(
          "warning",
          "topology",
          check.code,
          `Attempt ${attemptIndex + 1}: ${check.label} was ${check.actual}; expected ${check.expected}.`,
        )));
    } catch (error) {
      diagnostics.push(backroomsDiagnostic(
        "warning",
        "topology",
        "BRG_ATTEMPT_REJECTED",
        `Attempt ${attemptIndex + 1}: ${error instanceof Error ? error.message : String(error)}`,
      ));
    }
  }
  return {
    success: false,
    graph: best?.graph,
    quality: best?.quality,
    attempts: maximumAttempts,
    diagnostics: sortBackroomsDiagnostics([
      ...diagnostics,
      backroomsDiagnostic(
        "fatal",
        "topology",
        "BRG_GENERATION_EXHAUSTED",
        `No semantic graph passed quality within ${maximumAttempts} deterministic attempts.`,
      ),
    ]),
    choiceTraces: best?.traces ?? [],
  };
};
