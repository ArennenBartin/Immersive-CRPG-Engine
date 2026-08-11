import { stableContentHash } from "../generation-facing/stableHash";
import type { BackroomsSemanticGraph } from "./types";

const byId = <T extends { id: string }>(left: T, right: T) =>
  left.id.localeCompare(right.id);

const sortedStrings = (values: readonly string[]) =>
  [...values].sort((left, right) => left.localeCompare(right));

export const canonicalBackroomsGraph = (
  graph: BackroomsSemanticGraph,
): BackroomsSemanticGraph => ({
  ...structuredClone(graph),
  nodes: [...graph.nodes]
    .map((node) => ({ ...structuredClone(node), tags: sortedStrings(node.tags) }))
    .sort(byId),
  edges: [...graph.edges]
    .map((edge) => ({ ...structuredClone(edge), tags: sortedStrings(edge.tags) }))
    .sort(byId),
  requiredAnchorNodeIds: sortedStrings(graph.requiredAnchorNodeIds),
  landmarkNodeIds: sortedStrings(graph.landmarkNodeIds),
  setPieceNodeIds: sortedStrings(graph.setPieceNodeIds),
});

/** Structural identity intentionally excludes derived metrics, including itself. */
export const hashBackroomsGraph = (graph: BackroomsSemanticGraph): string => {
  const canonical = canonicalBackroomsGraph(graph);
  return stableContentHash({
    nodes: canonical.nodes,
    edges: canonical.edges,
    startNodeId: canonical.startNodeId,
    culminationNodeId: canonical.culminationNodeId,
    transitionNodeId: canonical.transitionNodeId,
    requiredAnchorNodeIds: canonical.requiredAnchorNodeIds,
    landmarkNodeIds: canonical.landmarkNodeIds,
    setPieceNodeIds: canonical.setPieceNodeIds,
  });
};
