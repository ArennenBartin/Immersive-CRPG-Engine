import type {
  DungeonDiagnostic,
  DungeonGate,
  DungeonGraph,
  DungeonGraphEdge,
} from "../types";
import { dungeonDiagnostic } from "../diagnostics";

interface ProgressionState {
  nodeId: string;
  inventory: Record<string, number>;
  collectedSources: string[];
  openedGates: string[];
}

export interface DungeonProgressionResult {
  solvable: boolean;
  objectiveReachable: boolean;
  returnReachable: boolean;
  reachableNodeIds: string[];
  openedGateIds: string[];
  acquiredResourceIds: string[];
  diagnostics: DungeonDiagnostic[];
}

const stateKey = (state: ProgressionState) => [
  state.nodeId,
  state.openedGates.join(","),
  state.collectedSources.join(","),
  Object.entries(state.inventory).filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, count]) => `${id}:${count}`).join(","),
].join("|");

const collectAtNode = (
  state: ProgressionState,
  nodeId: string,
  gates: readonly DungeonGate[],
): ProgressionState => {
  const sources = gates
    .filter((gate) => gate.sourceNodeId === nodeId && gate.requiredId)
    .sort((left, right) => left.id.localeCompare(right.id));
  let next = state;
  for (const source of sources) {
    const sourceKey = `${source.id}@${nodeId}`;
    if (next.collectedSources.includes(sourceKey)) continue;
    const inventory = { ...next.inventory };
    inventory[source.requiredId!] = (inventory[source.requiredId!] ?? 0) + 1;
    next = {
      ...next,
      inventory,
      collectedSources: [...next.collectedSources, sourceKey].sort(),
    };
  }
  return next;
};

const traverseEdge = (
  state: ProgressionState,
  edge: DungeonGraphEdge,
  gateById: ReadonlyMap<string, DungeonGate>,
): ProgressionState | undefined => {
  let nextNode: string | undefined;
  if (edge.fromNodeId === state.nodeId) nextNode = edge.toNodeId;
  else if (!edge.oneWay && edge.toNodeId === state.nodeId) nextNode = edge.fromNodeId;
  if (!nextNode) return undefined;
  if (!edge.gateId || state.openedGates.includes(edge.gateId)) return { ...state, nodeId: nextNode };
  const gate = gateById.get(edge.gateId);
  if (!gate) return undefined;
  if (gate.type === "soft") return { ...state, nodeId: nextNode, openedGates: [...state.openedGates, gate.id].sort() };
  if (!gate.requiredId || (state.inventory[gate.requiredId] ?? 0) <= 0) return undefined;
  const inventory = { ...state.inventory };
  if (gate.consumeOnUse) inventory[gate.requiredId] -= 1;
  return {
    ...state,
    nodeId: nextNode,
    inventory,
    openedGates: [...state.openedGates, gate.id].sort(),
  };
};

/** Exact bounded state search; inventory is a multiset, not a boolean set. */
export const simulateDungeonProgression = (
  graph: DungeonGraph,
  requireReturnPath = false,
): DungeonProgressionResult => {
  const gateById = new Map(graph.gates.map((gate) => [gate.id, gate]));
  const edges = [...graph.edges].sort((left, right) => left.id.localeCompare(right.id));
  const initial = collectAtNode({
    nodeId: graph.entranceNodeId,
    inventory: {},
    collectedSources: [],
    openedGates: [],
  }, graph.entranceNodeId, graph.gates);
  const queue: ProgressionState[] = [initial];
  const seen = new Set<string>();
  const reachable = new Set<string>();
  const opened = new Set<string>();
  const acquired = new Set<string>();
  let objectiveReachable = false;
  let returnReachable = !requireReturnPath;
  let explored = 0;
  const MAX_STATES = 200_000;

  for (let cursor = 0; cursor < queue.length && explored < MAX_STATES; cursor += 1) {
    let state = queue[cursor];
    state = collectAtNode(state, state.nodeId, graph.gates);
    const key = stateKey(state);
    if (seen.has(key)) continue;
    seen.add(key);
    explored += 1;
    reachable.add(state.nodeId);
    state.openedGates.forEach((id) => opened.add(id));
    Object.entries(state.inventory).forEach(([id, count]) => { if (count > 0) acquired.add(id); });
    if (state.nodeId === graph.objectiveNodeId) {
      objectiveReachable = true;
      if (!requireReturnPath) returnReachable = true;
      // Keep searching: the objective state still needs a legal return.
      if (requireReturnPath && !state.collectedSources.includes("__objective__")) {
        queue.push({ ...state, nodeId: state.nodeId, collectedSources: [...state.collectedSources, "__objective__"].sort() });
      }
    }
    if (requireReturnPath && state.nodeId === graph.entranceNodeId && state.collectedSources.includes("__objective__")) {
      returnReachable = true;
    }
    for (const edge of edges) {
      const traversed = traverseEdge(state, edge, gateById);
      if (traversed) queue.push(collectAtNode(traversed, traversed.nodeId, graph.gates));
    }
  }

  const diagnostics: DungeonDiagnostic[] = [];
  if (explored >= MAX_STATES) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "progression", "DNG_PROGRESSION_STATE_LIMIT",
      `Progression search exceeded ${MAX_STATES} states.`,
    ));
  }
  if (!objectiveReachable) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "progression", "DNG_OBJECTIVE_UNREACHABLE",
      `Objective ${graph.objectiveNodeId} is unreachable under gate rules.`,
      { nodeId: graph.objectiveNodeId },
    ));
  }
  if (requireReturnPath && !returnReachable) {
    diagnostics.push(dungeonDiagnostic(
      "fatal", "progression", "DNG_RETURN_UNREACHABLE",
      "The objective can be reached but the entrance cannot be revisited.",
      { nodeId: graph.entranceNodeId },
    ));
  }
  for (const gate of graph.gates.filter((entry) => entry.mandatory)) {
    if (!opened.has(gate.id)) {
      diagnostics.push(dungeonDiagnostic(
        "fatal", "progression", "DNG_GATE_UNSOLVED",
        `Mandatory gate ${gate.id} never opens.`,
        { relatedIds: [gate.id, gate.edgeId, ...(gate.sourceNodeId ? [gate.sourceNodeId] : [])] },
      ));
    }
  }
  return {
    solvable: diagnostics.every((entry) => entry.severity !== "fatal"),
    objectiveReachable,
    returnReachable,
    reachableNodeIds: [...reachable].sort(),
    openedGateIds: [...opened].sort(),
    acquiredResourceIds: [...acquired].sort(),
    diagnostics,
  };
};
