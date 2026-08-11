import type { GamePackage, MapData, ObjectData } from "../schema/game";
import {
  buildBackroomsRenderChunks,
  selectActiveBackroomsRenderChunks,
} from "../utils/backroomsRenderChunks";
import { buildPersistentAuthoredTerrainCellsFor3D } from "../utils/renderSpace";
import { BACKROOMS_STAGE_IDS } from "./schema";
import { createBackroomsSeedContext } from "./seedContext";
import type {
  BackroomsAnomalyDressingPlan,
  BackroomsAnomalyProfileDef,
  BackroomsDiagnostic,
  BackroomsEmbeddedMap,
  BackroomsPacingPlan,
  BackroomsRecipeDef,
  BackroomsSemanticGraph,
} from "./types";
import type { BackroomsQualityReport } from "./quality";

export interface BackroomsStudioRoomReport {
  id: string;
  kind: string;
  tags: string[];
  templateId?: string;
  origin?: [number, number];
  bounds?: { x: number; z: number; width: number; depth: number };
  anomalyClass: "ordinary" | "low_intensity" | "recursive" | "hero";
  anomalyId?: string;
  graphDistanceFromStart?: number;
  wrongness?: number;
  progressionTier?: string;
  recurrenceStage?: string;
  scheduledEvent?: string;
}

export interface BackroomsStudioAnomalyReport {
  id: string;
  roomId?: string;
  anomalyId?: string;
  assetId?: string;
  assetSource?: string;
  assetLicense: string;
  anchor: string;
  transform: string;
  embeddedDepth: string;
  collisionPolicy: string;
  clearance: "pass" | "review";
  result: string;
}

export interface BackroomsStudioPerformanceReport {
  authoredCells: number;
  persistentPresentationCells: number;
  renderChunks: number;
  maximumActiveChunks: number;
  maximumActiveCells: number;
  estimatedInstances: number;
  estimatedTriangles: number;
  materialCount: number;
  estimatedDrawCalls: number;
  eagerFineCellsAvoided: number;
  withinBudget: boolean;
}

export interface BackroomsStudioReport {
  ready: boolean;
  seed: string;
  generatorVersion: string;
  stageSeeds: Array<{ stage: string; salt: string; seed: number }>;
  rooms: BackroomsStudioRoomReport[];
  anomalies: BackroomsStudioAnomalyReport[];
  diagnostics: BackroomsDiagnostic[];
  qualityChecks: BackroomsQualityReport["checks"];
  ordinaryRoomRatio: number;
  performance: BackroomsStudioPerformanceReport;
  provenance: Array<{
    objectId: string;
    name: string;
    source: string;
    format: string;
    license: string;
  }>;
}

const partTriangles = (part: ObjectData["parts"][number]): number => {
  const segments = Math.max(3, Number(part.segments || 12));
  if (part.shape === "plane") return 2;
  if (part.shape === "box") return 12;
  if (part.shape === "cylinder" || part.shape === "cone") return segments * 4;
  if (part.shape === "sphere" || part.shape === "ring") return segments * segments * 2;
  return 12;
};

const materialIdsForObject = (object?: ObjectData) => {
  if (!object) return ["material.default"];
  const names = [
    ...object.materials,
    ...object.parts.map((part) => part.material || "material.default"),
    ...(object.asset?.material_names ?? []),
  ];
  return names.length ? [...new Set(names)] : ["material.default"];
};

const buildPerformanceReport = (
  map: MapData,
  packageData: Pick<GamePackage, "object_library">,
): BackroomsStudioPerformanceReport => {
  const objectById = new Map(packageData.object_library.map((object) => [object.id, object]));
  const presentationCells = buildPersistentAuthoredTerrainCellsFor3D(map);
  const chunks = buildBackroomsRenderChunks(presentationCells);
  let maximumActiveChunks = 0;
  let maximumActiveCells = 0;
  let estimatedDrawCalls = 0;
  for (const center of chunks) {
    const active = selectActiveBackroomsRenderChunks(chunks, [center.chunkX, center.chunkZ]);
    maximumActiveChunks = Math.max(maximumActiveChunks, active.length);
    maximumActiveCells = Math.max(
      maximumActiveCells,
      active.reduce((total, chunk) => total + chunk.cells.length, 0),
    );
    estimatedDrawCalls = Math.max(
      estimatedDrawCalls,
      active.reduce((total, chunk) => {
        const materialKeys = new Set<string>(["ceiling"]);
        chunk.cells.forEach((cell) =>
          materialIdsForObject(cell.object_id ? objectById.get(cell.object_id) : undefined)
            .forEach((id) => materialKeys.add(id)));
        return total + materialKeys.size;
      }, 0),
    );
  }

  let architectureTriangles = 0;
  const materialIds = new Set<string>(["ceiling"]);
  for (const cell of presentationCells) {
    const object = cell.object_id ? objectById.get(cell.object_id) : undefined;
    materialIdsForObject(object).forEach((id) => materialIds.add(id));
    architectureTriangles += object?.parts.length
      ? object.parts.reduce((total, part) => total + partTriangles(part), 0)
      : 2;
    if (cell.walkable || object?.tags.includes("wall")) architectureTriangles += 2;
  }
  const placementTriangles = map.custom_object_placements.reduce((total, placement) =>
    total + Number(objectById.get(placement.object_id)?.asset?.stats?.triangles || 0), 0);
  const estimatedTriangles = architectureTriangles + placementTriangles;
  const estimatedInstances = presentationCells.length + map.custom_object_placements.length;
  const eagerFineCells = map.cells.length * 9;
  const withinBudget =
    maximumActiveCells <= 6_000 &&
    estimatedDrawCalls <= 70 &&
    estimatedTriangles <= 550_000;
  return {
    authoredCells: map.cells.length,
    persistentPresentationCells: presentationCells.length,
    renderChunks: chunks.length,
    maximumActiveChunks,
    maximumActiveCells,
    estimatedInstances,
    estimatedTriangles,
    materialCount: materialIds.size,
    estimatedDrawCalls,
    eagerFineCellsAvoided: Math.max(0, eagerFineCells - maximumActiveCells),
    withinBudget,
  };
};

const placementTransform = (placement: MapData["custom_object_placements"][number]) => {
  const scale = placement.scale?.map((value) => Number(value).toFixed(2)).join("/") || "1/1/1";
  const rotation = placement.rotation_offset?.map((value) =>
    `${(Number(value) * 180 / Math.PI).toFixed(1)}°`).join("/") || "0°/0°/0°";
  const offset = placement.plan_offset?.map((value) => Number(value).toFixed(2)).join("/") || "0/0";
  return `cell ${placement.cell.join(",")} → offset ${offset} → rotation ${rotation} → scale ${scale}`;
};

export const buildBackroomsStudioReport = ({
  recipe,
  map,
  graph,
  embedded,
  quality,
  pacing,
  anomalies,
  anomalyProfile,
  diagnostics,
  packageData,
}: {
  recipe: BackroomsRecipeDef;
  map: MapData;
  graph: BackroomsSemanticGraph;
  embedded: BackroomsEmbeddedMap;
  quality?: BackroomsQualityReport;
  pacing?: BackroomsPacingPlan;
  anomalies?: BackroomsAnomalyDressingPlan;
  anomalyProfile?: BackroomsAnomalyProfileDef;
  diagnostics: BackroomsDiagnostic[];
  packageData: Pick<GamePackage, "object_library">;
}): BackroomsStudioReport => {
  const placedByNode = new Map(embedded.rooms.map((room) => [room.nodeId, room]));
  const assignmentByRoom = new Map(anomalies?.assignments.map((entry) => [entry.roomId, entry]));
  const recurrenceByRoom = new Map(pacing?.recurrence.map((entry) => [entry.nodeId, entry]));
  const eventByRoom = new Map(pacing?.events.map((entry) => [entry.nodeId, entry]));
  const rooms = graph.nodes.map((node): BackroomsStudioRoomReport => {
    const placed = placedByNode.get(node.id);
    const assignment = assignmentByRoom.get(node.id);
    return {
      id: node.id,
      kind: node.kind,
      tags: [...node.tags],
      templateId: placed?.templateId || placed?.builderId,
      origin: placed?.origin,
      bounds: placed?.bounds,
      anomalyClass: assignment?.class ?? "ordinary",
      anomalyId: assignment?.anomalyId,
      graphDistanceFromStart: assignment?.graphDistanceFromStart,
      wrongness: assignment?.wrongness,
      progressionTier: assignment?.progressionTier,
      recurrenceStage: recurrenceByRoom.get(node.id)?.stageId,
      scheduledEvent: eventByRoom.get(node.id)?.eventId,
    };
  });

  const objectById = new Map(packageData.object_library.map((object) => [object.id, object]));
  const anomalyById = new Map(anomalyProfile?.anomalies.map((entry) => [entry.id, entry]));
  const placementById = new Map(map.custom_object_placements.map((entry) => [entry.id, entry]));
  const anomalyReports: BackroomsStudioAnomalyReport[] = [
    ...(anomalies?.placements ?? []).flatMap((log) => {
      const placements = log.placementIds.flatMap((id) => {
        const placement = placementById.get(id);
        return placement ? [placement] : [];
      });
      const placement = placements[0];
      const object = objectById.get(log.objectId);
      const definition = anomalyById.get(log.anomalyId);
      const clearancePass = definition?.partialEmbed
        ? placements.every((entry) => entry.collision_mode === "none")
        : definition?.collisionPolicy === "none"
          ? placements.every((entry) => entry.collision_mode === "none")
          : definition?.collisionPolicy === "first_only"
            ? placements.slice(1).every((entry) => entry.collision_mode === "none")
            : true;
      return [{
        id: log.id,
        roomId: log.roomId,
        anomalyId: log.anomalyId,
        assetId: log.objectId,
        assetSource: object?.asset?.filename || object?.asset?.data_url || "procedural object",
        assetLicense: "Project-owned / license metadata not declared",
        anchor: definition?.requiredAnchor || "authored room surface",
        transform: placement ? placementTransform(placement) : "placement unavailable",
        embeddedDepth: definition?.partialEmbed
          ? `${Math.round(definition.partialEmbed.penetrationRatio.min * 100)}–${Math.round(definition.partialEmbed.penetrationRatio.max * 100)}% authored penetration`
          : "not embedded",
        collisionPolicy: definition?.collisionPolicy || placement?.collision_mode || "inherit",
        clearance: clearancePass ? "pass" as const : "review" as const,
        result: `placed · ${log.placementIds.length} instance${log.placementIds.length === 1 ? "" : "s"}`,
      }];
    }),
    ...(anomalies?.rejections ?? []).map((entry) => ({
      id: entry.id,
      roomId: entry.roomId,
      anomalyId: entry.anomalyId,
      assetLicense: "not applicable",
      anchor: "unresolved",
      transform: "not placed",
      embeddedDepth: "not placed",
      collisionPolicy: "none",
      clearance: "pass" as const,
      result: `${entry.code}: ${entry.reason}`,
    })),
  ];
  const usedObjectIds = new Set(map.custom_object_placements.map((placement) => placement.object_id));
  const provenance = [...usedObjectIds].sort().flatMap((objectId) => {
    const object = objectById.get(objectId);
    if (!object) return [];
    return [{
      objectId,
      name: object.display_name,
      source: object.asset?.filename || object.asset?.data_url || "procedural object definition",
      format: object.asset?.source_type || object.model_kind,
      license: "Project-owned / license metadata not declared",
    }];
  });
  const seedContext = createBackroomsSeedContext({
    generatorVersion: recipe.generatorVersion,
    recipeId: recipe.id,
    seed: recipe.seed,
    stageSalts: recipe.stageSalts,
  });
  const stageSeeds = BACKROOMS_STAGE_IDS.map((stage) => {
    const snapshot = seedContext.stream(stage).snapshot();
    return { stage, salt: snapshot.salt, seed: snapshot.initialSeed };
  });
  const ordinaryCount = rooms.filter((room) => room.anomalyClass === "ordinary").length;
  const performance = buildPerformanceReport(map, packageData);
  const ready =
    Boolean(quality?.ready) &&
    diagnostics.every((entry) => entry.severity !== "fatal" && entry.severity !== "error") &&
    anomalyReports.every((entry) => entry.clearance === "pass") &&
    performance.withinBudget;
  return {
    ready,
    seed: recipe.seed,
    generatorVersion: recipe.generatorVersion,
    stageSeeds,
    rooms,
    anomalies: anomalyReports,
    diagnostics,
    qualityChecks: quality?.checks ?? [],
    ordinaryRoomRatio: rooms.length ? ordinaryCount / rooms.length : 1,
    performance,
    provenance,
  };
};
