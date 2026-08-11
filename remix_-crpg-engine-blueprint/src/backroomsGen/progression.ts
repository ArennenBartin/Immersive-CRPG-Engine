import { stableContentHash } from "../generation-facing/stableHash";
import { BackroomsWrongnessProgressionSchema } from "./schema";
import type {
  BackroomsSemanticGraph,
  BackroomsWrongnessProgressionDef,
  BackroomsWrongnessProgressionSummary,
  BackroomsWrongnessTier,
} from "./types";

export interface BackroomsRoomWrongness {
  roomId: string;
  graphDistanceFromStart: number;
  wrongness: number;
  progressionTier: BackroomsWrongnessTier;
  zoneTag?: string;
}

export interface BackroomsWrongnessProgressionPlan {
  config: BackroomsWrongnessProgressionDef;
  summary: BackroomsWrongnessProgressionSummary;
  rooms: readonly BackroomsRoomWrongness[];
  byRoomId: ReadonlyMap<string, BackroomsRoomWrongness>;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const graphDistancesFromStart = (
  graph: BackroomsSemanticGraph,
): Map<string, number> => {
  const links = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    links.get(edge.fromNodeId)?.push(edge.toNodeId);
    links.get(edge.toNodeId)?.push(edge.fromNodeId);
  }
  for (const neighbors of links.values()) neighbors.sort();
  const distances = new Map<string, number>([[graph.startNodeId, 0]]);
  const queue = [graph.startNodeId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const nodeId = queue[cursor];
    const nextDistance = distances.get(nodeId)! + 1;
    for (const neighbor of links.get(nodeId) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, nextDistance);
      queue.push(neighbor);
    }
  }
  if (distances.size !== graph.nodes.length) {
    throw new Error("Wrongness progression requires one connected semantic graph");
  }
  return distances;
};

const authoredZoneTier = (
  tags: readonly string[],
  progression: BackroomsWrongnessProgressionDef,
): { tier: BackroomsWrongnessTier; tag: string } | undefined => {
  const tagSet = new Set(tags);
  const match = (values: readonly string[]) => values.find((tag) => tagSet.has(tag));
  const earlySafe = match(progression.zoneTags.earlySafe);
  if (earlySafe) return { tier: "early_safe", tag: earlySafe };
  const hero = match(progression.zoneTags.hero);
  if (hero) return { tier: "hero", tag: hero };
  const recursive = match(progression.zoneTags.recursive);
  if (recursive) return { tier: "recursive", tag: recursive };
  const lowIntensity = match(progression.zoneTags.lowIntensity);
  if (lowIntensity) return { tier: "low_intensity", tag: lowIntensity };
  return undefined;
};

const distanceTier = (
  graphDistance: number,
  progression: BackroomsWrongnessProgressionDef,
): BackroomsWrongnessTier => {
  if (graphDistance <= progression.earlySafeThrough) return "early_safe";
  if (graphDistance < progression.recursiveFrom) return "low_intensity";
  if (graphDistance < progression.heroFrom) return "recursive";
  return "hero";
};

const tierWrongness = (
  tier: BackroomsWrongnessTier,
  normalizedDistance: number,
) => {
  if (tier === "early_safe") return 0;
  if (tier === "low_intensity") return 0.15 + clamp01(normalizedDistance) * 0.3;
  if (tier === "recursive") return 0.5 + clamp01(normalizedDistance) * 0.3;
  return 0.85 + clamp01(normalizedDistance) * 0.15;
};

/**
 * Deterministically evaluates Phase 8 wrongness without consuming a random
 * stream. Distance protects the opening absolutely; authored tags may demote
 * or promote later rooms to a deliberate zone tier.
 */
export const planBackroomsWrongnessProgression = ({
  graph,
  progression: sourceProgression,
}: {
  graph: BackroomsSemanticGraph;
  progression: BackroomsWrongnessProgressionDef;
}): BackroomsWrongnessProgressionPlan => {
  const progression = BackroomsWrongnessProgressionSchema.parse(sourceProgression);
  if (!progression.enabled) {
    throw new Error("Disabled wrongness progression must use the Phase 7 selection path");
  }
  const distances = graphDistancesFromStart(graph);
  const maxGraphDistance = Math.max(0, ...distances.values());
  const rooms = graph.nodes
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node): BackroomsRoomWrongness => {
      const graphDistanceFromStart = distances.get(node.id)!;
      // The opening is an absolute safe zone even if an author accidentally
      // puts a stronger zone tag on one of its nodes.
      const authored = graphDistanceFromStart <= progression.earlySafeThrough
        ? undefined
        : authoredZoneTier(node.tags, progression);
      const progressionTier = authored?.tier ?? distanceTier(
        graphDistanceFromStart,
        progression,
      );
      const normalizedDistance = maxGraphDistance
        ? graphDistanceFromStart / maxGraphDistance
        : 0;
      return {
        roomId: node.id,
        graphDistanceFromStart,
        wrongness: tierWrongness(progressionTier, normalizedDistance),
        progressionTier,
        ...(authored ? { zoneTag: authored.tag } : {}),
      };
    });
  const tierCounts = {
    earlySafe: rooms.filter((room) => room.progressionTier === "early_safe").length,
    lowIntensity: rooms.filter((room) => room.progressionTier === "low_intensity").length,
    recursive: rooms.filter((room) => room.progressionTier === "recursive").length,
    hero: rooms.filter((room) => room.progressionTier === "hero").length,
  };
  const summary: BackroomsWrongnessProgressionSummary = {
    enabled: true,
    configHash: stableContentHash(progression),
    maxGraphDistance,
    tierCounts,
    averageWrongness: rooms.length
      ? rooms.reduce((sum, room) => sum + room.wrongness, 0) / rooms.length
      : 0,
    maximumWrongness: Math.max(0, ...rooms.map((room) => room.wrongness)),
  };
  return {
    config: progression,
    summary,
    rooms,
    byRoomId: new Map(rooms.map((room) => [room.roomId, room])),
  };
};
