import {
  generatedIdNamespace,
  hashMapOutput,
  normalizeGeneratedIdToken,
} from "../generation-facing/deterministicIds";
import {
  stableContentHash,
} from "../generation-facing/stableHash";
import {
  GamePackageSchema,
  MapDataSchema,
  type GamePackage,
  type MapGenerationSocketData,
  type MapData,
} from "../schema/game";
import {
  bakeDungeonMaps,
  type DungeonBakeResult,
} from "../dungeonGen/bake";
import {
  canonicalDungeonGraph,
  canonicalEmbeddedDungeon,
  hashDungeonContentLibrary,
} from "../dungeonGen/canonical";
import {
  dungeonDiagnostic,
  sortDungeonDiagnostics,
} from "../dungeonGen/diagnostics";
import {
  embedDungeon,
  type DungeonSpatialResult,
} from "../dungeonGen/embedding";
import { compareMacroCells, macroCellKey } from "../dungeonGen/embedding/gridSearch";
import { populateDungeon } from "../dungeonGen/population";
import { createDungeonSeedContext } from "../dungeonGen/seedContext";
import {
  DungeonGraphSchema,
  DungeonRecipeSchema,
} from "../dungeonGen/schema";
import {
  auditDungeonGraph,
  generateDungeonGraph,
  graphReachableFrom,
  simulateDungeonProgression,
} from "../dungeonGen/topology";
import type {
  DungeonDiagnostic,
  DungeonGraph,
  DungeonRecipeDef,
  EmbeddedDungeon,
} from "../dungeonGen/types";
import {
  auditDungeonRecipeReferences,
  validateDungeonBake,
} from "../dungeonGen/validation";
import {
  validateOrdinaryMap,
  type MapValidationReport,
} from "./mapReadinessValidator";

/**
 * Phase 9-10 adapter over the mature dungeon stages. This module is a pure
 * boundary: draft creation never receives authored maps, and bake only reads a
 * package snapshot and returns ordinary MapData. Studio owns the later,
 * explicit package transaction.
 */
export const FRACTURE_DUNGEON_DRAFT_CONTRACT_VERSION = "fracture_draft_v1";
export const FRACTURE_DUNGEON_SOCKET_PROP_KIND = "fracture_generation_socket";

export type FractureDungeonSocketCategory =
  | "entrance"
  | "culmination"
  | "landmark"
  | "artifact_origin"
  | "extraction"
  | "encounter"
  | "light_control"
  | "darkness";

export interface FractureDungeonOpportunity {
  id: string;
  category: FractureDungeonSocketCategory;
  nodeId: string;
  required: boolean;
  tags: string[];
}

export interface FractureDungeonDraftProvenance {
  contractVersion: typeof FRACTURE_DUNGEON_DRAFT_CONTRACT_VERSION;
  generatorId: string;
  generatorVersion: string;
  profileId: string;
  profileVersion: string;
  profileHash: string;
  seed: string;
  stageSalts: Record<string, string>;
  contentLibraryHash: string;
  attemptIndex: number;
  topologyHash: string;
}

export interface FractureDungeonDraft {
  id: string;
  profile: DungeonRecipeDef;
  graph: DungeonGraph;
  opportunities: FractureDungeonOpportunity[];
  provenance: FractureDungeonDraftProvenance;
  diagnostics: DungeonDiagnostic[];
}

export interface FractureDungeonDraftValidation {
  valid: boolean;
  topologyHash: string;
  reachableNodeIds: string[];
  diagnostics: DungeonDiagnostic[];
}

export interface CreateFractureDungeonDraftInput {
  profile: DungeonRecipeDef;
  gamePackage: GamePackage;
  debug?: boolean;
  shouldCancel?: () => boolean;
}

export interface CreateFractureDungeonDraftResult {
  success: boolean;
  draft?: FractureDungeonDraft;
  diagnostics: DungeonDiagnostic[];
  attemptCount: number;
}

export interface FractureDungeonPlacedSocket {
  /** Map-local ordinary identity; remaps with create-new-ID package bake. */
  id: string;
  /** Stable Phase 9 provenance back to the disposable topology opportunity. */
  sourceOpportunityId: string;
  category: FractureDungeonSocketCategory;
  nodeId: string;
  required: boolean;
  tags: string[];
  mapId: string;
  cell: [number, number];
}

/** @deprecated Name retained for API compatibility; sockets now use the
 * ordinary typed `MapData.generation_sockets` collection, never loose props. */
export type FractureDungeonSocketProp = MapGenerationSocketData;

interface LegacyFractureDungeonSocketProp {
  id: string;
  kind: typeof FRACTURE_DUNGEON_SOCKET_PROP_KIND;
  source_opportunity_id: string;
  socket_kind: FractureDungeonSocketCategory;
  node_id: string;
  cell: [number, number];
  required: boolean;
  tags: string[];
}

export interface BakeFractureDungeonDraftInput {
  draft: FractureDungeonDraft;
  gamePackage: GamePackage;
  generatedAt?: string;
  shouldCancel?: () => boolean;
}

export interface FractureDungeonBakeResult {
  success: boolean;
  draftId: string;
  topologyHash: string;
  outputHash?: string;
  graph?: DungeonGraph;
  embedded?: EmbeddedDungeon;
  maps: MapData[];
  sockets: FractureDungeonPlacedSocket[];
  validationReports: MapValidationReport[];
  diagnostics: DungeonDiagnostic[];
}

export interface RelocateFractureDungeonSocketResult {
  success: boolean;
  map: MapData;
  socket?: FractureDungeonSocketProp;
  diagnostics: DungeonDiagnostic[];
}

const blocking = (diagnostics: readonly DungeonDiagnostic[]) =>
  diagnostics.some((entry) => entry.severity === "fatal" || entry.severity === "error");

const canonicalProfile = (profile: DungeonRecipeDef) => {
  const { seed: _seed, ...withoutSeed } = profile;
  return withoutSeed;
};

export const hashFractureDungeonProfile = (profile: DungeonRecipeDef): string =>
  stableContentHash(canonicalProfile(DungeonRecipeSchema.parse(profile)));

const draftRunIdentity = (
  profile: DungeonRecipeDef,
  profileHash: string,
  attemptIndex: number,
) => stableContentHash({
  contractVersion: FRACTURE_DUNGEON_DRAFT_CONTRACT_VERSION,
  generatorId: profile.generatorId,
  generatorVersion: profile.generatorVersion,
  profileId: profile.id,
  profileVersion: profile.version,
  profileHash,
  seed: profile.seed,
  stageSalts: profile.stageSalts,
  attemptIndex,
});

const idSuffix = (hash: string) => hash.replace(/[^A-Za-z0-9]+/g, "_").slice(-16);

const namespaceGraph = (source: DungeonGraph, namespace: string): DungeonGraph => {
  const graph = canonicalDungeonGraph(source);
  const nodeIds = new Map(graph.nodes.map((node) => [node.id, `${namespace}:node:${node.id}`]));
  const edgeIds = new Map(graph.edges.map((edge) => [edge.id, `${namespace}:edge:${edge.id}`]));
  const gateIds = new Map(graph.gates.map((gate) => [gate.id, `${namespace}:gate:${gate.id}`]));
  const branchIds = new Map(
    graph.nodes.flatMap((node) => node.branchId ? [node.branchId] : [])
      .filter((value, index, values) => values.indexOf(value) === index)
      .map((branchId) => [branchId, `${namespace}:branch:${branchId}`]),
  );

  graph.nodes = graph.nodes.map((node) => ({
    ...node,
    id: nodeIds.get(node.id)!,
    branchId: node.branchId ? branchIds.get(node.branchId) : undefined,
  }));
  graph.edges = graph.edges.map((edge) => ({
    ...edge,
    id: edgeIds.get(edge.id)!,
    fromNodeId: nodeIds.get(edge.fromNodeId)!,
    toNodeId: nodeIds.get(edge.toNodeId)!,
    gateId: edge.gateId ? gateIds.get(edge.gateId) : undefined,
  }));
  graph.gates = graph.gates.map((gate) => ({
    ...gate,
    id: gateIds.get(gate.id)!,
    edgeId: edgeIds.get(gate.edgeId)!,
    sourceNodeId: gate.sourceNodeId ? nodeIds.get(gate.sourceNodeId) : undefined,
  }));
  graph.entranceNodeId = nodeIds.get(graph.entranceNodeId)!;
  graph.objectiveNodeId = nodeIds.get(graph.objectiveNodeId)!;
  graph.optionalObjectiveNodeIds = graph.optionalObjectiveNodeIds.map((id) => nodeIds.get(id)!);
  graph.metrics = {
    ...graph.metrics,
    gateDepths: Object.fromEntries(Object.entries(graph.metrics.gateDepths).map(([id, value]): [string, number] => [
      gateIds.get(id) ?? `${namespace}:gate:${id}`,
      value,
    ]).sort(([left], [right]) => left.localeCompare(right))),
  };
  return canonicalDungeonGraph(DungeonGraphSchema.parse(graph));
};

const opportunity = (
  draftId: string,
  category: FractureDungeonSocketCategory,
  index: number,
  nodeId: string,
  required: boolean,
  tags: string[] = [],
): FractureDungeonOpportunity => ({
  id: `${draftId}:socket:${category}:${String(index).padStart(2, "0")}`,
  category,
  nodeId,
  required,
  tags: [...new Set([category, ...tags])].sort(),
});

const deriveOpportunities = (draftId: string, graph: DungeonGraph): FractureDungeonOpportunity[] => {
  const ordered = [...graph.nodes].sort((left, right) =>
    left.depth - right.depth || left.id.localeCompare(right.id));
  const byId = new Map(ordered.map((node) => [node.id, node]));
  const entrance = byId.get(graph.entranceNodeId)!;
  const culmination = byId.get(graph.objectiveNodeId)!;
  const optional = ordered.filter((node) => !node.mandatory);
  const branchEnds = optional.filter((node) => node.tags.includes("branch_end"));
  const middle = ordered.filter((node) => node.id !== entrance.id && node.id !== culmination.id);
  const landmarkCandidates = [
    ...ordered.filter((node) => node.tags.includes("landmark")),
    ...middle.filter((node) => node.tags.includes("junction")),
    ...branchEnds,
    ...middle,
    culmination,
    entrance,
  ].filter((node, index, values) => values.findIndex((candidate) => candidate.id === node.id) === index);
  const landmarks = Array.from({ length: 3 }, (_, index) =>
    landmarkCandidates[index % Math.max(1, landmarkCandidates.length)] ?? entrance);
  const artifactNode = [...branchEnds, ...optional, ...middle].sort((left, right) =>
    right.depth - left.depth || left.id.localeCompare(right.id))[0] ?? culmination;
  const extractionNode = [...optional, ...middle].sort((left, right) =>
    right.depth - left.depth || left.id.localeCompare(right.id))[0] ?? entrance;
  const encounterNode = middle.find((node) => !node.tags.includes("quiet")) ?? culmination;
  const lightNode = landmarks[1] ?? entrance;
  const darkNode = branchEnds[0] ?? optional[0] ?? culmination;

  return [
    opportunity(draftId, "entrance", 0, entrance.id, true, entrance.tags),
    opportunity(draftId, "culmination", 0, culmination.id, true, culmination.tags),
    ...landmarks.map((node, index) => opportunity(draftId, "landmark", index, node.id, true, node.tags)),
    opportunity(draftId, "artifact_origin", 0, artifactNode.id, true, artifactNode.tags),
    opportunity(draftId, "extraction", 0, extractionNode.id, true, extractionNode.tags),
    opportunity(draftId, "encounter", 0, encounterNode.id, false, encounterNode.tags),
    opportunity(draftId, "light_control", 0, lightNode.id, false, lightNode.tags),
    opportunity(draftId, "darkness", 0, darkNode.id, false, darkNode.tags),
  ].sort((left, right) => left.id.localeCompare(right.id));
};

const topologyHashFor = (
  draft: Pick<FractureDungeonDraft, "profile" | "graph" | "opportunities" | "provenance">,
): string => stableContentHash({
  contractVersion: FRACTURE_DUNGEON_DRAFT_CONTRACT_VERSION,
  generatorId: draft.provenance.generatorId,
  generatorVersion: draft.provenance.generatorVersion,
  profileId: draft.provenance.profileId,
  profileVersion: draft.provenance.profileVersion,
  profileHash: draft.provenance.profileHash,
  seed: draft.provenance.seed,
  stageSalts: draft.provenance.stageSalts,
  attemptIndex: draft.provenance.attemptIndex,
  graph: canonicalDungeonGraph(draft.graph),
  opportunities: [...draft.opportunities].sort((left, right) => left.id.localeCompare(right.id)),
});

export const hashFractureDungeonTopology = (draft: FractureDungeonDraft): string =>
  topologyHashFor(draft);

const duplicateIds = (
  diagnostics: DungeonDiagnostic[],
  label: string,
  values: readonly string[],
) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  values.forEach((id) => seen.has(id) ? duplicates.add(id) : seen.add(id));
  if (duplicates.size) diagnostics.push(dungeonDiagnostic(
    "fatal",
    "topology",
    "FDG_DUPLICATE_STABLE_ID",
    `${label} contains duplicate stable IDs: ${[...duplicates].sort().join(", ")}.`,
    { relatedIds: [...duplicates].sort() },
  ));
};

export const validateFractureDungeonDraft = (
  draft: FractureDungeonDraft,
): FractureDungeonDraftValidation => {
  const diagnostics: DungeonDiagnostic[] = [];
  const parsedProfile = DungeonRecipeSchema.safeParse(draft.profile);
  const parsedGraph = DungeonGraphSchema.safeParse(draft.graph);
  if (!parsedProfile.success) diagnostics.push(...parsedProfile.error.issues.map((issue) => dungeonDiagnostic(
    "fatal", "recipe", "FDG_PROFILE_INVALID", `${issue.path.join(".") || "profile"}: ${issue.message}`,
  )));
  if (!parsedGraph.success) diagnostics.push(...parsedGraph.error.issues.map((issue) => dungeonDiagnostic(
    "fatal", "topology", "FDG_GRAPH_SCHEMA_INVALID", `${issue.path.join(".") || "graph"}: ${issue.message}`,
  )));
  if (!parsedProfile.success || !parsedGraph.success) return {
    valid: false,
    topologyHash: topologyHashFor(draft),
    reachableNodeIds: [],
    diagnostics: sortDungeonDiagnostics(diagnostics),
  };

  const graph = parsedGraph.data;
  diagnostics.push(...auditDungeonGraph(graph, parsedProfile.data));
  duplicateIds(diagnostics, "Graph nodes", graph.nodes.map((node) => node.id));
  duplicateIds(diagnostics, "Graph edges", graph.edges.map((edge) => edge.id));
  duplicateIds(diagnostics, "Graph gates", graph.gates.map((gate) => gate.id));
  duplicateIds(diagnostics, "Draft opportunities", draft.opportunities.map((entry) => entry.id));

  const reachable = graphReachableFrom(graph, graph.entranceNodeId);
  const unreachable = graph.nodes.filter((node) => !reachable.has(node.id));
  if (unreachable.length) diagnostics.push(dungeonDiagnostic(
    "fatal", "topology", "FDG_UNREACHABLE_BRANCH_NODE",
    `${unreachable.length} graph node${unreachable.length === 1 ? " is" : "s are"} unreachable from the entrance.`,
    { relatedIds: unreachable.map((node) => node.id).sort() },
  ));
  if (!reachable.has(graph.objectiveNodeId)) diagnostics.push(dungeonDiagnostic(
    "fatal", "topology", "FDG_CULMINATION_UNREACHABLE",
    "The culmination is unreachable from the entrance.", { relatedIds: [graph.objectiveNodeId] },
  ));
  if (!graph.edges.some((edge) => edge.tags.includes("loop"))) diagnostics.push(dungeonDiagnostic(
    "fatal", "topology", "FDG_LOOP_MISSING", "The fracture topology must contain at least one meaningful loop.",
  ));

  const progression = simulateDungeonProgression(graph, parsedProfile.data.topology.requireReturnPath);
  if (!progression.solvable || !progression.objectiveReachable ||
      (parsedProfile.data.topology.requireReturnPath && !progression.returnReachable)) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "progression", "FDG_GATE_DEPENDENCY_IMPOSSIBLE",
      "Gate dependencies do not permit a complete entrance-to-culmination progression.",
      {
        relatedIds: graph.gates
          .filter((gate) => !progression.openedGateIds.includes(gate.id))
          .map((gate) => gate.id),
      },
    ));
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const missingNodes = draft.opportunities.filter((entry) => !nodeIds.has(entry.nodeId));
  if (missingNodes.length) diagnostics.push(dungeonDiagnostic(
    "fatal", "topology", "FDG_SOCKET_NODE_MISSING",
    "One or more draft opportunities reference missing graph nodes.",
    { relatedIds: missingNodes.map((entry) => entry.id) },
  ));
  const count = (category: FractureDungeonSocketCategory) =>
    draft.opportunities.filter((entry) => entry.category === category).length;
  const requiredCategories: Array<[FractureDungeonSocketCategory, number]> = [
    ["entrance", 1],
    ["culmination", 1],
    ["landmark", 3],
    ["artifact_origin", 1],
    ["extraction", 1],
  ];
  for (const [category, minimum] of requiredCategories) {
    if (count(category) < minimum) diagnostics.push(dungeonDiagnostic(
      "fatal", "topology", "FDG_REQUIRED_SOCKET_CATEGORY_MISSING",
      `Draft requires at least ${minimum} ${category} socket${minimum === 1 ? "" : "s"}.`,
      { relatedIds: [category] },
    ));
  }

  const expectedProfileHash = hashFractureDungeonProfile(parsedProfile.data);
  if (draft.provenance.profileHash !== expectedProfileHash) diagnostics.push(dungeonDiagnostic(
    "fatal", "audit", "FDG_PROFILE_HASH_MISMATCH",
    `Draft profile hash is stale: expected ${expectedProfileHash}.`,
  ));
  const expectedTopologyHash = topologyHashFor(draft);
  if (draft.provenance.topologyHash !== expectedTopologyHash) diagnostics.push(dungeonDiagnostic(
    "fatal", "audit", "FDG_TOPOLOGY_HASH_MISMATCH",
    `Draft topology hash is stale: expected ${expectedTopologyHash}.`,
  ));
  if (
    draft.provenance.seed !== parsedProfile.data.seed ||
    draft.provenance.generatorVersion !== parsedProfile.data.generatorVersion ||
    draft.provenance.profileId !== parsedProfile.data.id ||
    draft.provenance.profileVersion !== parsedProfile.data.version
  ) diagnostics.push(dungeonDiagnostic(
    "fatal", "audit", "FDG_PROVENANCE_PROFILE_MISMATCH",
    "Draft provenance does not match its embedded profile.",
  ));

  const ordered = sortDungeonDiagnostics(diagnostics);
  return {
    valid: !blocking(ordered),
    topologyHash: expectedTopologyHash,
    reachableNodeIds: [...reachable].sort(),
    diagnostics: ordered,
  };
};

const deepFreeze = <T>(value: T): T => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
  return value;
};

export const createFractureDungeonDraft = (
  input: CreateFractureDungeonDraftInput,
): CreateFractureDungeonDraftResult => {
  const parsedProfile = DungeonRecipeSchema.safeParse(input.profile);
  const parsedPackage = GamePackageSchema.safeParse(input.gamePackage);
  if (!parsedProfile.success || !parsedPackage.success) {
    const diagnostics = [
      ...(parsedProfile.success ? [] : parsedProfile.error.issues.map((issue) => dungeonDiagnostic(
        "fatal", "recipe", "FDG_PROFILE_INVALID", `${issue.path.join(".") || "profile"}: ${issue.message}`,
      ))),
      ...(parsedPackage.success ? [] : parsedPackage.error.issues.map((issue) => dungeonDiagnostic(
        "fatal", "recipe", "FDG_PACKAGE_INVALID", `${issue.path.join(".") || "package"}: ${issue.message}`,
      ))),
    ];
    return { success: false, diagnostics: sortDungeonDiagnostics(diagnostics), attemptCount: 0 };
  }

  const profile = parsedProfile.data;
  const gamePackage = parsedPackage.data;
  const references = auditDungeonRecipeReferences(profile, gamePackage);
  if (!references.valid) return {
    success: false,
    diagnostics: sortDungeonDiagnostics(references.diagnostics),
    attemptCount: 0,
  };
  const profileHash = hashFractureDungeonProfile(profile);
  const contentLibraryHash = hashDungeonContentLibrary(gamePackage);
  const theme = gamePackage.dungeon_themes.find((entry) => entry.id === profile.themeId);
  const rewardProfile = gamePackage.dungeon_reward_profiles.find((entry) =>
    entry.id === profile.population.rewardProfileId);
  const keyItemIds = rewardProfile?.keyItemPool.map((entry) => entry.id) ??
    theme?.keyItemPool.map((entry) => entry.id) ?? [];
  const rejected: DungeonDiagnostic[] = [];

  for (let attemptIndex = 0; attemptIndex < profile.constraints.maxGenerationAttempts; attemptIndex += 1) {
    if (input.shouldCancel?.()) return {
      success: false,
      attemptCount: attemptIndex,
      diagnostics: [dungeonDiagnostic("fatal", "topology", "FDG_GENERATION_CANCELED", "Draft generation was canceled.")],
    };
    const seedContext = createDungeonSeedContext({
      generatorVersion: profile.generatorVersion,
      recipeId: profile.id,
      seed: profile.seed,
      stageSalts: profile.stageSalts,
      attemptIndex,
      debug: input.debug,
    });
    const generated = generateDungeonGraph({
      recipe: profile,
      archetypes: gamePackage.dungeon_room_archetypes,
      seedContext,
      keyItemIds,
    });
    if (!generated.value) {
      rejected.push(dungeonDiagnostic(
        "info", "topology", "FDG_DRAFT_ATTEMPT_REJECTED",
        `Topology attempt ${attemptIndex + 1} was rejected: ${generated.diagnostics.map((entry) => entry.code).join(", ")}.`,
      ));
      continue;
    }

    const runIdentity = draftRunIdentity(profile, profileHash, attemptIndex);
    const draftId = `fracture_draft_${idSuffix(runIdentity)}`;
    const graph = namespaceGraph(generated.value, draftId);
    const opportunities = deriveOpportunities(draftId, graph);
    const provenanceBase: Omit<FractureDungeonDraftProvenance, "topologyHash"> = {
      contractVersion: FRACTURE_DUNGEON_DRAFT_CONTRACT_VERSION,
      generatorId: profile.generatorId,
      generatorVersion: profile.generatorVersion,
      profileId: profile.id,
      profileVersion: profile.version,
      profileHash,
      seed: profile.seed,
      stageSalts: structuredClone(profile.stageSalts),
      contentLibraryHash,
      attemptIndex,
    };
    const draftWithoutHash = {
      id: draftId,
      profile: structuredClone(profile),
      graph,
      opportunities,
      provenance: { ...provenanceBase, topologyHash: "pending" },
      diagnostics: [],
    } satisfies FractureDungeonDraft;
    const topologyHash = topologyHashFor(draftWithoutHash);
    const candidate: FractureDungeonDraft = {
      ...draftWithoutHash,
      provenance: { ...provenanceBase, topologyHash },
      diagnostics: sortDungeonDiagnostics([...rejected, ...generated.diagnostics]),
    };
    const validation = validateFractureDungeonDraft(candidate);
    if (!validation.valid) {
      rejected.push(...validation.diagnostics.filter((entry) => entry.severity !== "info"));
      continue;
    }
    return {
      success: true,
      draft: deepFreeze(candidate),
      diagnostics: candidate.diagnostics,
      attemptCount: attemptIndex + 1,
    };
  }

  return {
    success: false,
    attemptCount: profile.constraints.maxGenerationAttempts,
    diagnostics: sortDungeonDiagnostics([
      ...rejected,
      dungeonDiagnostic(
        "fatal", "topology", "FDG_DRAFT_ATTEMPTS_EXHAUSTED",
        `Draft generation exhausted ${profile.constraints.maxGenerationAttempts} bounded attempts.`,
      ),
    ]),
  };
};

const roomCenter = (room: EmbeddedDungeon["rooms"][number]): [number, number] => [
  room.bounds.x + Math.floor(room.bounds.width / 2),
  room.bounds.z + Math.floor(room.bounds.depth / 2),
];

const placeOpportunitySockets = (
  draft: FractureDungeonDraft,
  spatial: DungeonSpatialResult,
): { sockets: FractureDungeonPlacedSocket[]; diagnostics: DungeonDiagnostic[] } => {
  const diagnostics: DungeonDiagnostic[] = [];
  const sockets: FractureDungeonPlacedSocket[] = [];
  const usedByMap = new Map<string, Set<string>>();
  for (const entry of [...draft.opportunities].sort((left, right) => left.id.localeCompare(right.id))) {
    const room = spatial.embedded.rooms.find((candidate) => candidate.nodeId === entry.nodeId);
    const geometry = spatial.roomGeometry[entry.nodeId];
    if (!room || !geometry) {
      diagnostics.push(dungeonDiagnostic(
        entry.required ? "fatal" : "warning", "geometry", "FDG_SOCKET_ROOM_MISSING",
        `Opportunity ${entry.id} has no embedded room.`, { nodeId: entry.nodeId, relatedIds: [entry.id] },
      ));
      continue;
    }
    const used = usedByMap.get(room.mapId) ?? new Set<string>();
    usedByMap.set(room.mapId, used);
    const center = roomCenter(room);
    const candidates = geometry.cells.filter((cell) => cell.walkable)
      .map((cell) => [...cell.cell] as [number, number])
      .filter((cell) => !used.has(macroCellKey(cell)))
      .sort((left, right) =>
        Math.abs(left[0] - center[0]) + Math.abs(left[1] - center[1]) -
          (Math.abs(right[0] - center[0]) + Math.abs(right[1] - center[1])) ||
        compareMacroCells(left, right));
    const cell = candidates[0];
    if (!cell) {
      diagnostics.push(dungeonDiagnostic(
        entry.required ? "fatal" : "warning", "geometry", "FDG_SOCKET_CELL_UNAVAILABLE",
        `Opportunity ${entry.id} has no unused walkable cell in room ${entry.nodeId}.`,
        { nodeId: entry.nodeId, roomId: entry.nodeId, mapId: room.mapId, relatedIds: [entry.id] },
      ));
      continue;
    }
    used.add(macroCellKey(cell));
    sockets.push({
      id: `${generatedIdNamespace(room.mapId)}:generation_socket:${normalizeGeneratedIdToken(entry.id)}`,
      sourceOpportunityId: entry.id,
      category: entry.category,
      nodeId: entry.nodeId,
      required: entry.required,
      tags: [...entry.tags],
      mapId: room.mapId,
      cell,
    });
  }
  return { sockets, diagnostics };
};

const generationSocket = (socket: FractureDungeonPlacedSocket): FractureDungeonSocketProp => ({
  id: socket.id,
  kind: socket.category,
  source_opportunity_id: socket.sourceOpportunityId,
  node_id: socket.nodeId,
  cell: [...socket.cell],
  required: socket.required,
  tags: [...socket.tags],
});

export const isFractureDungeonSocketProp = (value: unknown): value is FractureDungeonSocketProp => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<FractureDungeonSocketProp>;
  return typeof record.kind === "string" &&
    ["entrance", "culmination", "landmark", "artifact_origin", "extraction", "encounter", "light_control", "darkness"].includes(record.kind) &&
    typeof record.id === "string" &&
    Array.isArray(record.cell) && record.cell.length === 2 &&
    record.cell.every((coordinate) => Number.isInteger(coordinate));
};

const isLegacySocketProp = (value: unknown): value is LegacyFractureDungeonSocketProp => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<LegacyFractureDungeonSocketProp>;
  return record.kind === FRACTURE_DUNGEON_SOCKET_PROP_KIND &&
    typeof record.id === "string" &&
    typeof record.source_opportunity_id === "string" &&
    typeof record.socket_kind === "string" &&
    typeof record.node_id === "string" &&
    Array.isArray(record.cell) && record.cell.length === 2 &&
    record.cell.every((coordinate) => Number.isInteger(coordinate));
};

const migrateLegacySocket = (socket: LegacyFractureDungeonSocketProp): FractureDungeonSocketProp => ({
  id: socket.id,
  kind: socket.socket_kind,
  source_opportunity_id: socket.source_opportunity_id,
  node_id: socket.node_id,
  cell: [...socket.cell],
  required: socket.required,
  tags: [...socket.tags],
});

export const fractureDungeonSocketsFromMap = (map: MapData): FractureDungeonSocketProp[] => [
  ...(map.generation_sockets ?? []).map((entry) => structuredClone(entry)),
  ...map.props.filter(isLegacySocketProp).map(migrateLegacySocket),
].sort((left, right) => left.id.localeCompare(right.id));

/**
 * Pure editor operation for a baked socket marker. It keeps the representation
 * ordinary (a typed map generation socket), marks generated provenance as manually edited,
 * and refreshes the map output hash without touching a package or store.
 */
export const relocateFractureDungeonSocket = (
  sourceMap: MapData,
  socketId: string,
  cell: [number, number],
): RelocateFractureDungeonSocketResult => {
  const parsed = MapDataSchema.safeParse(sourceMap);
  if (!parsed.success) return {
    success: false,
    map: structuredClone(sourceMap),
    diagnostics: parsed.error.issues.map((issue) => dungeonDiagnostic(
      "fatal", "bake", "FDG_MAP_SCHEMA_INVALID", `${issue.path.join(".") || "map"}: ${issue.message}`,
      { mapId: sourceMap.id },
    )),
  };
  const map = structuredClone(parsed.data);
  const source = fractureDungeonSocketsFromMap(map).find((entry) => entry.id === socketId);
  if (!isFractureDungeonSocketProp(source)) return {
    success: false,
    map,
    diagnostics: [dungeonDiagnostic(
      "error", "bake", "FDG_SOCKET_NOT_FOUND", `Map ${map.id} has no socket ${socketId}.`,
      { mapId: map.id, relatedIds: [socketId] },
    )],
  };
  const target = map.cells.find((entry) => entry.x === cell[0] && entry.z === cell[1]);
  if (!target?.walkable) return {
    success: false,
    map,
    socket: structuredClone(source),
    diagnostics: [dungeonDiagnostic(
      "error", "navigation", "FDG_SOCKET_MOVE_INVALID",
      `Socket ${socketId} must be moved onto a walkable map cell.`,
      { mapId: map.id, cell, relatedIds: [socketId] },
    )],
  };
  const collision = fractureDungeonSocketsFromMap(map).find((entry) =>
    entry.id !== socketId &&
    entry.cell[0] === cell[0] && entry.cell[1] === cell[1]);
  if (isFractureDungeonSocketProp(collision)) return {
    success: false,
    map,
    socket: structuredClone(source),
    diagnostics: [dungeonDiagnostic(
      "error", "bake", "FDG_SOCKET_MOVE_COLLISION",
      `Socket ${socketId} cannot overlap socket ${collision.id}.`,
      { mapId: map.id, cell, relatedIds: [socketId, collision.id] },
    )],
  };
  const moved: FractureDungeonSocketProp = { ...structuredClone(source), cell: [...cell] };
  map.generation_sockets = fractureDungeonSocketsFromMap(map).map((entry) =>
    entry.id === socketId ? moved : entry);
  map.props = map.props.filter((entry) => !isLegacySocketProp(entry));
  if (map.generation) {
    map.generation = { ...map.generation, manuallyModified: true, outputHash: "pending" };
    map.generation.outputHash = hashMapOutput(map);
  }
  return {
    success: true,
    map: MapDataSchema.parse(map),
    socket: moved,
    diagnostics: [],
  };
};

const addGenerationSockets = (
  maps: readonly MapData[],
  sockets: readonly FractureDungeonPlacedSocket[],
): MapData[] => maps.map((map) => MapDataSchema.parse({
  ...structuredClone(map),
  generation_sockets: [
    ...(map.generation_sockets ?? []).map((entry) => structuredClone(entry)),
    ...sockets.filter((socket) => socket.mapId === map.id).map(generationSocket),
  ].sort((left, right) => left.id.localeCompare(right.id)),
}));

const finalizeMapProvenance = (
  maps: readonly MapData[],
  draft: FractureDungeonDraft,
  outputHash: string,
  generatedAt: string,
): MapData[] => maps.map((map) => {
  if (!map.generation) throw new Error(`Generated map ${map.id} has no generation metadata`);
  const next = MapDataSchema.parse({
    ...structuredClone(map),
    generation: {
      ...map.generation,
      generatorId: draft.provenance.generatorId,
      generatorVersion: draft.provenance.generatorVersion,
      recipeId: draft.provenance.profileId,
      recipeVersion: draft.provenance.profileVersion,
      seed: draft.provenance.seed,
      generatedAt,
      manuallyModified: false,
      sourceSnapshotHash: draft.provenance.topologyHash,
      stageSalts: structuredClone(draft.provenance.stageSalts),
      contentLibraryHash: draft.provenance.contentLibraryHash,
      canonicalResultHash: outputHash,
      outputHash: "pending",
    },
  });
  next.generation!.outputHash = hashMapOutput(next);
  return MapDataSchema.parse(next);
});

const validatePlacedSockets = (
  draft: FractureDungeonDraft,
  gamePackage: GamePackage,
  bake: DungeonBakeResult,
  maps: readonly MapData[],
  sockets: readonly FractureDungeonPlacedSocket[],
): { diagnostics: DungeonDiagnostic[]; reports: MapValidationReport[] } => {
  const diagnostics: DungeonDiagnostic[] = [];
  duplicateIds(diagnostics, "Placed sockets", sockets.map((entry) => entry.id));
  const requiredIds = new Set(draft.opportunities.filter((entry) => entry.required).map((entry) => entry.id));
  const placedIds = new Set(sockets.map((entry) => entry.sourceOpportunityId));
  const missingRequired = [...requiredIds].filter((id) => !placedIds.has(id));
  if (missingRequired.length) diagnostics.push(dungeonDiagnostic(
    "fatal", "geometry", "FDG_REQUIRED_SOCKET_NOT_PLACED",
    "One or more required draft sockets were not placed.", { relatedIds: missingRequired.sort() },
  ));

  const generatedIds = new Set(maps.map((map) => map.id));
  const packageWithMaps = GamePackageSchema.parse({
    ...gamePackage,
    maps: [...gamePackage.maps.filter((map) => !generatedIds.has(map.id)), ...maps],
  });
  const reports = maps.map((map) => {
    const mapSockets = sockets.filter((socket) => socket.mapId === map.id);
    const cells = new Map(map.cells.map((cell) => [`${cell.x}:${cell.z}`, cell]));
    for (const socket of mapSockets) {
      const cell = cells.get(macroCellKey(socket.cell));
      if (!cell || !cell.walkable) diagnostics.push(dungeonDiagnostic(
        "fatal", "navigation", "FDG_SOCKET_CELL_INVALID",
        `Socket ${socket.id} is not on a walkable map cell.`,
        { mapId: map.id, cell: socket.cell, relatedIds: [socket.id] },
      ));
      if (!fractureDungeonSocketsFromMap(map).some((prop) => prop.id === socket.id)) diagnostics.push(dungeonDiagnostic(
        "fatal", "bake", "FDG_SOCKET_PROP_MISSING",
        `Socket ${socket.id} was not preserved in the ordinary map socket collection.`,
        { mapId: map.id, cell: socket.cell, relatedIds: [socket.id] },
      ));
    }
    const report = validateOrdinaryMap(map, {
      package: packageWithMaps,
      primarySpawnId: bake.primarySpawnIds[map.id],
      requiredCells: mapSockets.filter((socket) => socket.required).map((socket) => ({
        id: socket.id,
        cell: socket.cell,
      })),
      requiredExitIds: map.exits.map((exit) => exit.id).filter((id): id is string => Boolean(id)),
      returnRouteRequired: draft.profile.topology.requireReturnPath,
      safeStartRadius: 2,
    });
    for (const issue of report.issues) diagnostics.push(dungeonDiagnostic(
      issue.severity === "error" ? "fatal" : issue.severity,
      "audit", issue.code, issue.message,
      { mapId: map.id, cell: issue.cells?.[0], relatedIds: issue.placementIds },
    ));
    if (!map.generation ||
        map.generation.sourceSnapshotHash !== draft.provenance.topologyHash ||
        map.generation.generatorVersion !== draft.provenance.generatorVersion ||
        map.generation.seed !== draft.provenance.seed ||
        map.generation.outputHash !== hashMapOutput(map)) diagnostics.push(dungeonDiagnostic(
      "fatal", "audit", "FDG_MAP_PROVENANCE_INVALID",
      `Map ${map.id} has missing or stale fracture-generation provenance.`, { mapId: map.id },
    ));
    return report;
  });
  return { diagnostics, reports };
};

const failedBake = (
  draft: FractureDungeonDraft,
  diagnostics: DungeonDiagnostic[],
  partial: Partial<Pick<FractureDungeonBakeResult, "graph" | "embedded" | "maps" | "sockets" | "validationReports">> = {},
): FractureDungeonBakeResult => ({
  success: false,
  draftId: draft.id,
  topologyHash: draft.provenance.topologyHash,
  maps: partial.maps ?? [],
  sockets: partial.sockets ?? [],
  validationReports: partial.validationReports ?? [],
  graph: partial.graph,
  embedded: partial.embedded,
  diagnostics: sortDungeonDiagnostics(diagnostics),
});

export const bakeFractureDungeonDraft = (
  input: BakeFractureDungeonDraftInput,
): FractureDungeonBakeResult => {
  const draft = structuredClone(input.draft);
  const draftValidation = validateFractureDungeonDraft(draft);
  if (!draftValidation.valid) return failedBake(draft, draftValidation.diagnostics);
  const parsedPackage = GamePackageSchema.safeParse(input.gamePackage);
  if (!parsedPackage.success) return failedBake(draft, parsedPackage.error.issues.map((issue) => dungeonDiagnostic(
    "fatal", "recipe", "FDG_PACKAGE_INVALID", `${issue.path.join(".") || "package"}: ${issue.message}`,
  )));
  const gamePackage = parsedPackage.data;
  const contentLibraryHash = hashDungeonContentLibrary(gamePackage);
  if (contentLibraryHash !== draft.provenance.contentLibraryHash) return failedBake(draft, [dungeonDiagnostic(
    "fatal", "audit", "FDG_CONTENT_LIBRARY_CHANGED",
    "The generator content library changed after this draft was created. Generate a new draft before baking.",
  )]);
  const references = auditDungeonRecipeReferences(draft.profile, gamePackage);
  if (!references.valid) return failedBake(draft, references.diagnostics);
  if (input.shouldCancel?.()) return failedBake(draft, [dungeonDiagnostic(
    "fatal", "bake", "FDG_GENERATION_CANCELED", "Fracture bake was canceled.",
  )]);

  const seedContext = createDungeonSeedContext({
    generatorVersion: draft.provenance.generatorVersion,
    recipeId: draft.provenance.profileId,
    seed: draft.provenance.seed,
    stageSalts: draft.provenance.stageSalts,
    attemptIndex: draft.provenance.attemptIndex,
  });
  const embedding = embedDungeon({
    recipe: draft.profile,
    graph: draft.graph,
    archetypes: gamePackage.dungeon_room_archetypes,
    templates: gamePackage.dungeon_room_templates,
    seedContext,
    shouldCancel: input.shouldCancel,
  });
  if (!embedding.value) return failedBake(draft, embedding.diagnostics, { graph: draft.graph });

  const theme = gamePackage.dungeon_themes.find((entry) => entry.id === draft.profile.themeId)!;
  const population = populateDungeon({
    recipe: draft.profile,
    spatial: embedding.value,
    gamePackage,
    theme,
    archetypes: gamePackage.dungeon_room_archetypes,
    encounterProfile: gamePackage.dungeon_encounter_profiles.find((entry) =>
      entry.id === draft.profile.population.encounterProfileId),
    hazardProfile: gamePackage.dungeon_hazard_profiles.find((entry) =>
      entry.id === draft.profile.population.hazardProfileId),
    rewardProfile: gamePackage.dungeon_reward_profiles.find((entry) =>
      entry.id === draft.profile.population.rewardProfileId),
    narrativeProfile: gamePackage.dungeon_narrative_profiles.find((entry) =>
      entry.id === draft.profile.population.narrativeProfileId),
    seedContext,
    shouldCancel: input.shouldCancel,
  });
  if (!population.value) return failedBake(
    draft, [...embedding.diagnostics, ...population.diagnostics],
    { graph: embedding.value.graph, embedded: embedding.value.embedded },
  );

  const generatedAt = input.generatedAt ?? "1970-01-01T00:00:00.000Z";
  const baked = bakeDungeonMaps({
    recipe: draft.profile,
    spatial: embedding.value,
    population: population.value,
    theme,
    contentLibraryHash,
    generatedAt,
    attemptIndex: draft.provenance.attemptIndex,
    shouldCancel: input.shouldCancel,
  });
  if (!baked.value) return failedBake(
    draft, [...embedding.diagnostics, ...population.diagnostics, ...baked.diagnostics],
    { graph: embedding.value.graph, embedded: embedding.value.embedded },
  );

  const placed = placeOpportunitySockets(draft, embedding.value);
  if (blocking(placed.diagnostics)) return failedBake(
    draft,
    [...embedding.diagnostics, ...population.diagnostics, ...baked.diagnostics, ...placed.diagnostics],
    {
      graph: embedding.value.graph,
      embedded: embedding.value.embedded,
      maps: baked.value.maps,
      sockets: placed.sockets,
    },
  );
  const mapsWithSockets = addGenerationSockets(baked.value.maps, placed.sockets);
  const outputHash = stableContentHash({
    contractVersion: FRACTURE_DUNGEON_DRAFT_CONTRACT_VERSION,
    topologyHash: draft.provenance.topologyHash,
    embedded: canonicalEmbeddedDungeon(embedding.value.embedded),
    sockets: placed.sockets,
    maps: mapsWithSockets.map((map) => ({ id: map.id, outputHash: hashMapOutput(map) }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
  const maps = finalizeMapProvenance(mapsWithSockets, draft, outputHash, generatedAt);
  const finalizedBake: DungeonBakeResult = { ...baked.value, maps };
  const baseValidation = validateDungeonBake({
    recipe: draft.profile,
    gamePackage,
    bake: finalizedBake,
  });
  const socketValidation = validatePlacedSockets(
    draft, gamePackage, finalizedBake, maps, placed.sockets,
  );
  const diagnostics = sortDungeonDiagnostics([
    ...embedding.diagnostics,
    ...population.diagnostics,
    ...baked.diagnostics,
    ...placed.diagnostics,
    ...baseValidation.diagnostics,
    ...socketValidation.diagnostics,
  ]);
  return {
    success: !blocking(diagnostics),
    draftId: draft.id,
    topologyHash: draft.provenance.topologyHash,
    outputHash,
    graph: embedding.value.graph,
    embedded: embedding.value.embedded,
    maps,
    sockets: placed.sockets,
    validationReports: socketValidation.reports,
    diagnostics,
  };
};
