import {
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
  buildRecursiveChainPlacements,
  buildWallClippedPlacement,
} from "../data/backroomsAnomalyAssets";
import {
  compareMacroCells,
  macroCellKey,
  type MacroCell,
} from "../dungeonGen/embedding/gridSearch";
import { DeterministicIdAllocator } from "../generation-facing/deterministicIds";
import { stableContentHash } from "../generation-facing/stableHash";
import type { CellData, ObjectPlacementData } from "../schema/game";
import { backroomsDiagnostic, sortBackroomsDiagnostics } from "./diagnostics";
import { shortestBackroomsPath, backroomsGraphDistance } from "./quality";
import { planBackroomsWrongnessProgression } from "./progression";
import {
  BackroomsAnomalyDressingPlanSchema,
  BackroomsAnomalyProfileSchema,
} from "./schema";
import { createBackroomsSeedContext, type BackroomsRandom } from "./seedContext";
import { BACKROOMS_LEVEL0_TEMPLATE_IDS } from "./templates";
import { backroomsPhase7AnomalyAssetSpecById } from "./anomalyAssetSpecs";
import type {
  BackroomsAnomalyDressingPlan,
  BackroomsAnomalyEntryDef,
  BackroomsAnomalyPlacementLog,
  BackroomsAnomalyProfileDef,
  BackroomsAnomalyRejection,
  BackroomsDiagnostic,
  BackroomsEmbeddedMap,
  BackroomsPacingPlan,
  BackroomsRecipeDef,
  BackroomsSemanticGraph,
} from "./types";

export interface DressBackroomsAnomaliesInput {
  recipe: BackroomsRecipeDef;
  graph: BackroomsSemanticGraph;
  embedded: BackroomsEmbeddedMap;
  pacingPlan?: BackroomsPacingPlan;
  profile: BackroomsAnomalyProfileDef;
  cells: ReadonlyMap<string, CellData>;
  /** Ordinary dressing, sockets, triggers, partitions, and spawn clearance. */
  avoidCells?: readonly MacroCell[];
  attemptIndex?: number;
}

export interface BackroomsAnomalyDressingResult {
  placements: Array<ObjectPlacementData & { id: string }>;
  plan?: BackroomsAnomalyDressingPlan;
  diagnostics: BackroomsDiagnostic[];
}

interface RoomContext {
  id: string;
  room: BackroomsEmbeddedMap["rooms"][number];
  center: MacroCell;
  floorCells: MacroCell[];
  protected: boolean;
  criticalPath: boolean;
  preserveSightline: boolean;
  reservedCells: ReadonlySet<string>;
}

interface WallCandidate {
  id: string;
  cell: MacroCell;
  towardWall: MacroCell;
}

interface ChainCandidate {
  id: string;
  cells: MacroCell[];
  step: MacroCell;
}

interface FloorCandidate {
  id: string;
  cell: MacroCell;
}

type PlacementCandidate =
  | { id: string; kind: "wall"; wall: WallCandidate }
  | { id: string; kind: "chain"; chain: ChainCandidate }
  | { id: string; kind: "floor"; floor: FloorCandidate };

const CARDINALS: readonly MacroCell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const canonicalNumber = (value: number) => Object.is(value, -0) ? 0 : value;

const rangeValue = (
  rng: BackroomsRandom,
  range: { min: number; max: number },
) => range.min === range.max
  ? range.min
  : range.min + (range.max - range.min) * rng.next();

const targetCount = (
  roomCount: number,
  range: { min: number; max: number },
) => {
  const minimum = Math.ceil(roomCount * range.min - Number.EPSILON);
  const maximum = Math.floor(roomCount * range.max + Number.EPSILON);
  if (maximum < minimum) return Math.max(0, Math.round(roomCount * ((range.min + range.max) / 2)));
  return Math.max(minimum, Math.min(maximum, Math.round(
    roomCount * ((range.min + range.max) / 2),
  )));
};

const reserveWithRadius = (
  reserved: Set<string>,
  cell: MacroCell,
  radius: number,
) => {
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      reserved.add(macroCellKey([cell[0] + dx, cell[1] + dz]));
    }
  }
};

const reserveRoute = (
  reserved: Set<string>,
  from: MacroCell,
  to: MacroCell,
  radius = 1,
) => {
  let cursor: MacroCell = [from[0], from[1]];
  reserveWithRadius(reserved, cursor, radius);
  while (cursor[0] !== to[0]) {
    cursor = [cursor[0] + Math.sign(to[0] - cursor[0]), cursor[1]];
    reserveWithRadius(reserved, cursor, radius);
  }
  while (cursor[1] !== to[1]) {
    cursor = [cursor[0], cursor[1] + Math.sign(to[1] - cursor[1])];
    reserveWithRadius(reserved, cursor, radius);
  }
};

const buildRoomContexts = (
  input: DressBackroomsAnomaliesInput,
): RoomContext[] => {
  const protectedNodeIds = new Set([
    input.graph.startNodeId,
    input.graph.culminationNodeId,
    input.graph.transitionNodeId,
    ...input.graph.requiredAnchorNodeIds,
    ...(input.pacingPlan?.protectedNodeIds ?? []),
    ...(input.pacingPlan?.recurrence.map((entry) => entry.nodeId) ?? []),
  ]);
  const criticalPathIds = new Set(shortestBackroomsPath(
    input.graph,
    input.graph.startNodeId,
    input.graph.transitionNodeId,
  ) ?? []);
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const usedSockets = new Map<string, MacroCell[]>();
  for (const connection of input.embedded.connections) {
    usedSockets.set(connection.fromNodeId, [
      ...(usedSockets.get(connection.fromNodeId) ?? []),
      [connection.fromCell[0], connection.fromCell[1]],
    ]);
    usedSockets.set(connection.toNodeId, [
      ...(usedSockets.get(connection.toNodeId) ?? []),
      [connection.toCell[0], connection.toCell[1]],
    ]);
  }

  return input.embedded.rooms
    .slice()
    .sort((left, right) => left.nodeId.localeCompare(right.nodeId))
    .map((room): RoomContext => {
      const center: MacroCell = [
        room.bounds.x + Math.floor(room.bounds.width / 2),
        room.bounds.z + Math.floor(room.bounds.depth / 2),
      ];
      const floorCells = [...input.cells.values()]
        .filter((cell) =>
          cell.walkable &&
          cell.room_id === room.nodeId &&
          cell.tag !== "connection")
        .map((cell): MacroCell => [cell.x, cell.z])
        .sort(compareMacroCells);
      const node = nodeById.get(room.nodeId);
      const preserveSightline = Boolean(
        node?.tags.some((tag) => [
          "long_sightline",
          "parasite_reveal",
          "story_reserved",
        ].includes(tag)) ||
        room.templateId === BACKROOMS_LEVEL0_TEMPLATE_IDS.longCorridor ||
        room.templateId === BACKROOMS_LEVEL0_TEMPLATE_IDS.storyReserved,
      );
      const reservedCells = new Set<string>();
      for (const socketCell of usedSockets.get(room.nodeId) ?? []) {
        reserveRoute(reservedCells, socketCell, center, 1);
      }
      // Keep the authored center composition legible even in rooms that only
      // use one socket. Critical-route rooms retain a wider cross-sightline.
      reserveWithRadius(reservedCells, center, criticalPathIds.has(room.nodeId) ? 2 : 1);
      return {
        id: room.nodeId,
        room,
        center,
        floorCells,
        protected: protectedNodeIds.has(room.nodeId),
        criticalPath: criticalPathIds.has(room.nodeId),
        preserveSightline,
        reservedCells,
      };
    });
};

const candidateFloor = (
  input: DressBackroomsAnomaliesInput,
  room: RoomContext,
  cell: MacroCell,
  avoid: ReadonlySet<string>,
  clearance = 0,
) => {
  const mapCell = input.cells.get(macroCellKey(cell));
  let clearOfAvoid = true;
  for (let dz = -clearance; dz <= clearance && clearOfAvoid; dz += 1) {
    for (let dx = -clearance; dx <= clearance; dx += 1) {
      if (avoid.has(macroCellKey([cell[0] + dx, cell[1] + dz]))) {
        clearOfAvoid = false;
        break;
      }
    }
  }
  return Boolean(
    mapCell?.walkable &&
    mapCell.room_id === room.id &&
    mapCell.tag !== "connection" &&
    clearOfAvoid &&
    !room.reservedCells.has(macroCellKey(cell)),
  );
};

const wallCandidates = (
  input: DressBackroomsAnomaliesInput,
  room: RoomContext,
  avoid: ReadonlySet<string>,
  clearance: number,
): WallCandidate[] => {
  if (room.protected || room.preserveSightline) return [];
  return room.floorCells.flatMap((cell) => CARDINALS.flatMap((towardWall) => {
    if (!candidateFloor(input, room, cell, avoid, clearance)) return [];
    const wall = input.cells.get(macroCellKey([
      cell[0] + towardWall[0],
      cell[1] + towardWall[1],
    ]));
    if (wall?.walkable !== false || wall.blocks_los !== true) return [];
    const openNeighbors = CARDINALS.filter((direction) => candidateFloor(
      input,
      room,
      [cell[0] + direction[0], cell[1] + direction[1]],
      avoid,
    )).length;
    if (openNeighbors < 1) return [];
    const id = `${room.id}:${cell[0]}:${cell[1]}:${towardWall[0]}:${towardWall[1]}`;
    return [{ id, cell, towardWall }];
  })).sort((left, right) => left.id.localeCompare(right.id));
};

const floorCandidates = (
  input: DressBackroomsAnomaliesInput,
  room: RoomContext,
  avoid: ReadonlySet<string>,
  clearance: number,
): FloorCandidate[] => {
  if (room.protected || room.preserveSightline) return [];
  return room.floorCells.flatMap((cell) => {
    if (!candidateFloor(input, room, cell, avoid, clearance)) return [];
    const openNeighbors = CARDINALS.filter((direction) => candidateFloor(
      input,
      room,
      [cell[0] + direction[0], cell[1] + direction[1]],
      avoid,
    )).length;
    if (openNeighbors < 2) return [];
    return [{ id: `${room.id}:${cell[0]}:${cell[1]}`, cell }];
  }).sort((left, right) => left.id.localeCompare(right.id));
};

const chainCandidates = (
  input: DressBackroomsAnomaliesInput,
  room: RoomContext,
  avoid: ReadonlySet<string>,
  minimumCount: number,
  maximumCount: number,
  clearance: number,
): ChainCandidate[] => {
  const recursiveTemplateIds = new Set<string>([
        BACKROOMS_LEVEL0_TEMPLATE_IDS.openOffice,
        BACKROOMS_LEVEL0_TEMPLATE_IDS.pillarField,
        BACKROOMS_LEVEL0_TEMPLATE_IDS.landmark,
      ]);
  if (room.protected || room.preserveSightline ||
      !recursiveTemplateIds.has(room.room.templateId)) {
    return [];
  }
  const candidates: ChainCandidate[] = [];
  for (const start of room.floorCells) {
    for (const step of CARDINALS) {
      const perpendicular: MacroCell = [-step[1], step[0]];
      for (let count = minimumCount; count <= maximumCount; count += 1) {
        const cells = Array.from({ length: count }, (_, index): MacroCell => [
          start[0] + step[0] * index,
          start[1] + step[1] * index,
        ]);
        if (!cells.every((cell) => candidateFloor(input, room, cell, avoid, clearance))) continue;
        // At least one complete parallel lane remains open beside the image.
        const hasClearParallelLane = [-1, 1].some((side) => cells.every((cell) =>
          candidateFloor(input, room, [
            cell[0] + perpendicular[0] * side,
            cell[1] + perpendicular[1] * side,
          ], avoid)));
        if (!hasClearParallelLane) continue;
        const id = `${room.id}:${start[0]}:${start[1]}:${step[0]}:${step[1]}:${count}`;
        candidates.push({ id, cells, step });
      }
    }
  }
  return candidates.sort((left, right) => left.id.localeCompare(right.id));
};

const candidatesForEntry = (
  input: DressBackroomsAnomaliesInput,
  room: RoomContext,
  entry: BackroomsAnomalyEntryDef,
  avoid: ReadonlySet<string>,
): PlacementCandidate[] => {
  if (entry.kind === "partial_embed" || entry.kind === "wrong_decoration" ||
      entry.kind === "proportion_error") {
    if (entry.kind === "partial_embed") {
      const mode = entry.partialEmbed?.mode ?? "wall_clip";
      if (mode === "partition_bisect" && entry.requiredAnchor === "partition") {
        return floorCandidates(
          input,
          room,
          avoid,
          entry.partialEmbed?.keepClearanceCells ?? 1,
        ).map((floor) => ({
          id: `${entry.id}:${floor.id}`,
          kind: "floor" as const,
          floor,
        }));
      }
      if (!["wall_clip", "corner_clip"].includes(mode) ||
          ![undefined, "wall", "corner"].includes(entry.requiredAnchor)) {
        return [];
      }
    } else if (![undefined, "wall", "floor"].includes(entry.requiredAnchor)) {
      return [];
    }
    const clearance = entry.kind === "partial_embed"
      ? entry.partialEmbed?.keepClearanceCells ?? 1
      : entry.wrongDecoration?.keepClearanceCells ?? 1;
    return wallCandidates(input, room, avoid, clearance).map((wall) => ({
      id: `${entry.id}:${wall.id}`,
      kind: "wall" as const,
      wall,
    }));
  }
  if (entry.kind === "recursive_chain" || entry.kind === "repetition") {
    if (![undefined, "floor"].includes(entry.requiredAnchor)) return [];
    const config = entry.recursive ?? {
      copyCount: { min: 4, max: 6 },
      scaleFalloff: { min: 0.82, max: 0.88 },
      rotationStepDegrees: { min: 2, max: 7 },
      tiltStepDegrees: { min: 0, max: 4 },
      sinkStepMeters: { min: 0, max: 0.03 },
      keepClearanceCells: 1,
    };
    return chainCandidates(
      input,
      room,
      avoid,
      config.copyCount.min,
      config.copyCount.max,
      config.keepClearanceCells,
    ).map((chain) => ({
      id: `${entry.id}:${chain.id}`,
      kind: "chain" as const,
      chain,
    }));
  }
  if (entry.kind === "impossible_object" &&
      [undefined, "floor", "reserved_room"].includes(entry.requiredAnchor)) {
    return floorCandidates(input, room, avoid, 2)
      .filter(() => !room.criticalPath)
      .map((floor) => ({
        id: `${entry.id}:${floor.id}`,
        kind: "floor" as const,
        floor,
      }));
  }
  return [];
};

const buildPlacements = ({
  entry,
  candidate,
  room,
  rng,
  allocator,
}: {
  entry: BackroomsAnomalyEntryDef;
  candidate: PlacementCandidate;
  room: RoomContext;
  rng: BackroomsRandom;
  allocator: DeterministicIdAllocator;
}): Array<ObjectPlacementData & { id: string }> => {
  const assetIds = [...entry.assetIds].sort();
  const objectId = rng.pick(assetIds);
  const assetSpec = backroomsPhase7AnomalyAssetSpecById.get(objectId);
  const placementPrefix = allocator.semantic("anomaly", `${room.id}:${entry.id}`);
  if (candidate.kind === "chain") {
    const config = entry.recursive ?? {
      copyCount: { min: 4, max: 6 },
      scaleFalloff: { min: 0.82, max: 0.88 },
      rotationStepDegrees: { min: 2, max: 7 },
      tiltStepDegrees: { min: 0, max: 4 },
      sinkStepMeters: { min: 0, max: 0.03 },
      keepClearanceCells: 1,
    };
    const placements = buildRecursiveChainPlacements({
      idPrefix: placementPrefix,
      objectId,
      originCell: [candidate.chain.cells[0][0], candidate.chain.cells[0][1]],
      step: [candidate.chain.step[0], candidate.chain.step[1]],
      facing: [
        canonicalNumber(-candidate.chain.step[1]),
        canonicalNumber(candidate.chain.step[0]),
      ],
      count: candidate.chain.cells.length,
      scaleFalloff: rangeValue(rng, config.scaleFalloff),
      rotationStepDegrees: rangeValue(rng, config.rotationStepDegrees),
      tiltStepDegrees: rangeValue(rng, config.tiltStepDegrees),
      sinkStep: rangeValue(rng, config.sinkStepMeters),
    });
    // Phase 7 dressing is scenery. Even the first copy stays non-blocking so
    // an authored footprint can never silently close a route after baking.
    return placements.map((placement) => ({
      ...placement,
      id: placement.id!,
      collision_mode: "none" as const,
    }));
  }

  if (candidate.kind === "floor") {
    const facing = rng.pick(CARDINALS);
    return [{
      id: `${placementPrefix}_00`,
      object_id: objectId,
      cell: [candidate.floor.cell[0], candidate.floor.cell[1]],
      facing: [facing[0], facing[1]],
      ...(assetSpec?.heightOffset
        ? { height_offset: assetSpec.heightOffset }
        : {}),
      collision_mode: "none",
    }];
  }

  const wall = candidate.wall;
  if (entry.kind === "partial_embed") {
    const config = entry.partialEmbed ?? {
      anchor: "wall" as const,
      mode: "wall_clip" as const,
      penetrationRatio: { min: 0.35, max: 0.55 },
      rotationJitterDegrees: 0,
      collisionPolicy: "none" as const,
      requireOpaqueBacking: true,
      keepClearanceCells: 1,
    };
    const placement = buildWallClippedPlacement({
        id: `${placementPrefix}_00`,
        objectId,
        cell: [wall.cell[0], wall.cell[1]],
        towardWall: [wall.towardWall[0], wall.towardWall[1]],
        penetrationRatio: rangeValue(rng, config.penetrationRatio),
        tiltDegrees: config.rotationJitterDegrees
          ? (rng.next() * 2 - 1) * config.rotationJitterDegrees
          : 0,
      });
    const lateral = config.lateralOffsetCells
      ? rangeValue(rng, config.lateralOffsetCells)
      : 0;
    const vertical = config.verticalOffsetMeters
      ? rangeValue(rng, config.verticalOffsetMeters)
      : undefined;
    return [{
      ...placement,
      id: `${placementPrefix}_00`,
      plan_offset: [
        canonicalNumber((placement.plan_offset?.[0] ?? 0) - wall.towardWall[1] * lateral),
        canonicalNumber((placement.plan_offset?.[1] ?? 0) + wall.towardWall[0] * lateral),
      ],
      ...(vertical === undefined ? {} : { height_offset: vertical }),
      collision_mode: "none",
    }];
  }

  const config = entry.wrongDecoration ?? {
    yawDegrees: { min: 170, max: 190 },
    pitchDegrees: { min: 0, max: 3 },
    wallInsetMeters: { min: 0.04, max: 0.14 },
    keepClearanceCells: 1,
  };
  const yaw = rangeValue(rng, config.yawDegrees) * Math.PI / 180;
  const pitch = rangeValue(rng, config.pitchDegrees) * Math.PI / 180;
  const inset = rangeValue(rng, config.wallInsetMeters);
  return [{
    id: `${placementPrefix}_00`,
    object_id: objectId,
    cell: [wall.cell[0], wall.cell[1]],
    // Face out from the backing wall; each authored module's profile supplies
    // the additional "wrong" yaw (for example a backwards desk is baked
    // backwards already, while clocks only need slight crookedness).
    facing: [
      canonicalNumber(-wall.towardWall[0]),
      canonicalNumber(-wall.towardWall[1]),
    ],
    plan_offset: [
      canonicalNumber(wall.towardWall[0] * inset),
      canonicalNumber(wall.towardWall[1] * inset),
    ],
    rotation_offset: [pitch, yaw, 0],
    ...(assetSpec?.heightOffset
      ? { height_offset: assetSpec.heightOffset }
      : {}),
    ...(entry.kind === "proportion_error"
      ? { scale: [0.9, 1.12, 1.04] as [number, number, number] }
      : {}),
    collision_mode: "none",
  }];
};

const classKey = (value: BackroomsAnomalyEntryDef["class"]) =>
  value === "low_intensity" ? "lowIntensity" as const : value;

/**
 * Phase 7's deterministic sparse-wrongness pass. It runs after ordinary room
 * dressing and returns only ordinary ObjectPlacementData for the final bake.
 * Any invalid profile or exhausted candidate search degrades to fewer (or no)
 * anomalies without changing topology, cells, or connectivity.
 */
export const dressBackroomsAnomalies = (
  input: DressBackroomsAnomaliesInput,
): BackroomsAnomalyDressingResult => {
  const parsedProfile = BackroomsAnomalyProfileSchema.safeParse(input.profile);
  if (!parsedProfile.success) {
    return {
      placements: [],
      diagnostics: [backroomsDiagnostic(
        "warning",
        "anomalies",
        "BRG_ANOMALY_PROFILE_REJECTED",
        `Anomaly dressing fell back to ordinary rooms: ${parsedProfile.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      )],
    };
  }

  try {
    const profile = parsedProfile.data;
    const rooms = buildRoomContexts({ ...input, profile });
    const roomCount = rooms.length;
    const progression = profile.progression?.enabled
      ? planBackroomsWrongnessProgression({
          graph: input.graph,
          progression: profile.progression,
        })
      : undefined;
    const entriesByClass = new Map<BackroomsAnomalyEntryDef["class"], BackroomsAnomalyEntryDef[]>([
      ["low_intensity", profile.anomalies.filter((entry) => entry.class === "low_intensity")],
      ["recursive", profile.anomalies.filter((entry) => entry.class === "recursive")],
      ["hero", profile.anomalies.filter((entry) => entry.class === "hero")],
    ]);
    let lowIntensityTarget = entriesByClass.get("low_intensity")?.length
      ? targetCount(roomCount, profile.density.lowIntensity)
      : 0;
    let recursiveTarget = entriesByClass.get("recursive")?.length
      ? targetCount(roomCount, profile.density.recursive)
      : 0;
    let heroTarget = entriesByClass.get("hero")?.length
      ? targetCount(roomCount, profile.density.hero)
      : 0;
    // A profile with no validated hero asset explicitly produces zero heroes.
    // Keep class minima first if an unusually small author profile supplies a
    // tighter room budget than its density midpoint.
    while (lowIntensityTarget + recursiveTarget + heroTarget > profile.maxAnomaliesPerMap) {
      if (lowIntensityTarget > Math.ceil(roomCount * profile.density.lowIntensity.min)) {
        lowIntensityTarget -= 1;
      } else if (recursiveTarget > Math.ceil(roomCount * profile.density.recursive.min)) {
        recursiveTarget -= 1;
      } else if (heroTarget > 0) {
        heroTarget -= 1;
      } else {
        break;
      }
    }
    if (progression) {
      // Enabled progression is conservative even when an authored density was
      // accidentally configured too aggressively: ordinary rooms must remain
      // a strict majority, with high-impact classes yielding first.
      const maximumAnomalousRooms = Math.max(0, Math.floor((roomCount - 1) / 2));
      while (lowIntensityTarget + recursiveTarget + heroTarget > maximumAnomalousRooms) {
        if (heroTarget > 0) heroTarget -= 1;
        else if (recursiveTarget > 0) recursiveTarget -= 1;
        else if (lowIntensityTarget > 0) lowIntensityTarget -= 1;
        else break;
      }
    }
    const targetCounts = {
      ordinary: roomCount - lowIntensityTarget - recursiveTarget - heroTarget,
      lowIntensity: lowIntensityTarget,
      recursive: recursiveTarget,
      hero: heroTarget,
    };

    const seedContext = createBackroomsSeedContext({
      generatorVersion: input.recipe.generatorVersion,
      recipeId: input.recipe.id,
      seed: input.recipe.seed,
      stageSalts: input.recipe.stageSalts,
      attemptIndex: input.attemptIndex ?? 0,
    });
    const rng = seedContext.stream("anomalies");
    const allocator = new DeterministicIdAllocator({ mapId: input.embedded.mapId });
    const avoid = new Set((input.avoidCells ?? []).map(macroCellKey));
    const placements: Array<ObjectPlacementData & { id: string }> = [];
    const logs: BackroomsAnomalyPlacementLog[] = [];
    const rejections: BackroomsAnomalyRejection[] = [];
    const assignments = new Map<string, { class: "low_intensity" | "recursive" | "hero"; anomalyId: string }>();
    const selectedByClass = new Map<BackroomsAnomalyEntryDef["class"], string[]>([
      ["low_intensity", []],
      ["recursive", []],
      ["hero", []],
    ]);

    const selectClass = (
      anomalyClass: BackroomsAnomalyEntryDef["class"],
      target: number,
    ) => {
      const entries = entriesByClass.get(anomalyClass) ?? [];
      if (target <= 0 || entries.length === 0) return;
      const progressionTierRank = {
        early_safe: 0,
        low_intensity: 1,
        recursive: 2,
        hero: 3,
      } as const;
      const requiredTier = anomalyClass === "low_intensity"
        ? "low_intensity" as const
        : anomalyClass;
      const eligibleRooms = rooms
        .filter((room) => {
          if (room.protected || assignments.has(room.id)) return false;
          if (!progression) return true;
          const roomProgression = progression.byRoomId.get(room.id);
          return Boolean(roomProgression &&
            progressionTierRank[roomProgression.progressionTier] >=
              progressionTierRank[requiredTier]);
        })
        .map((room) => ({ id: room.id, room }));
      const candidateRooms = progression
        ? (["low_intensity", "recursive", "hero"] as const)
            .filter((tier) => progressionTierRank[tier] >= progressionTierRank[requiredTier])
            .flatMap((tier) => rng.shuffleById(eligibleRooms.filter(({ room }) =>
              progression.byRoomId.get(room.id)?.progressionTier === tier)))
        : rng.shuffleById(eligibleRooms);
      for (const { room } of candidateRooms) {
        if ((selectedByClass.get(anomalyClass)?.length ?? 0) >= target) break;
        const viableEntries = entries.flatMap((entry) => {
          const minimumSpacing = Math.max(
            entry.minSpacingRooms,
            anomalyClass === "hero" && profile.neverAdjacentHero ? 2 : 0,
          );
          const spaced = (selectedByClass.get(anomalyClass) ?? []).every((otherRoomId) =>
            backroomsGraphDistance(input.graph, room.id, otherRoomId) >= minimumSpacing);
          if (!spaced) return [];
          const candidates = candidatesForEntry(input, room, entry, avoid);
          return candidates.length ? [{ entry, candidates }] : [];
        });
        if (!viableEntries.length) continue;
        const selected = rng.weighted(viableEntries.map(({ entry, candidates }) => ({
          id: entry.id,
          weight: entry.weight,
          value: { entry, candidates },
        })), `${anomalyClass}:${room.id}:entry`);
        const candidate = rng.pick(selected.candidates);
        const anomalyPlacements = buildPlacements({
          entry: selected.entry,
          candidate,
          room,
          rng,
          allocator,
        });
        if (!anomalyPlacements.length) continue;
        anomalyPlacements.forEach((placement) => {
          placements.push(placement);
          avoid.add(macroCellKey([
            Math.round(placement.cell[0]),
            Math.round(placement.cell[1]),
          ]));
        });
        assignments.set(room.id, {
          class: anomalyClass,
          anomalyId: selected.entry.id,
        });
        selectedByClass.get(anomalyClass)!.push(room.id);
        logs.push({
          id: `${selected.entry.id}:${room.id}`,
          anomalyId: selected.entry.id,
          class: anomalyClass,
          kind: selected.entry.kind,
          roomId: room.id,
          objectId: anomalyPlacements[0].object_id,
          placementIds: anomalyPlacements.map((placement) => placement.id).sort(),
          placementHash: stableContentHash(anomalyPlacements),
        });
      }
      const missing = target - (selectedByClass.get(anomalyClass)?.length ?? 0);
      for (let index = 0; index < missing; index += 1) {
        rejections.push({
          id: `${anomalyClass}:shortfall:${String(index).padStart(2, "0")}`,
          code: "candidate_exhausted",
          reason: `No safe ${anomalyClass} anchor remained after protected lanes and ordinary dressing were reserved.`,
        });
      }
    };

    if (progression) {
      // Phase 8 establishes subtle wrongness first, then admits recursive and
      // hero moments only inside their later graph-distance/zone bands.
      selectClass("low_intensity", lowIntensityTarget);
      selectClass("recursive", recursiveTarget);
      selectClass("hero", heroTarget);
    } else {
      // Preserve Phase 7's exact RNG/selection order when progression is off.
      selectClass("hero", heroTarget);
      selectClass("recursive", recursiveTarget);
      selectClass("low_intensity", lowIntensityTarget);
    }

    const roomAssignments = rooms.map((room) => {
      const selected = assignments.get(room.id);
      const roomProgression = progression?.byRoomId.get(room.id);
      const assignment = selected
        ? { roomId: room.id, class: selected.class, anomalyId: selected.anomalyId }
        : { roomId: room.id, class: "ordinary" as const };
      return roomProgression
        ? {
            ...assignment,
            graphDistanceFromStart: roomProgression.graphDistanceFromStart,
            wrongness: roomProgression.wrongness,
            progressionTier: roomProgression.progressionTier,
          }
        : assignment;
    });
    const realizedCounts = {
      ordinary: roomAssignments.filter((entry) => entry.class === "ordinary").length,
      lowIntensity: roomAssignments.filter((entry) => entry.class === "low_intensity").length,
      recursive: roomAssignments.filter((entry) => entry.class === "recursive").length,
      hero: roomAssignments.filter((entry) => entry.class === "hero").length,
    };
    const ratios = {
      ordinary: roomCount ? realizedCounts.ordinary / roomCount : 1,
      lowIntensity: roomCount ? realizedCounts.lowIntensity / roomCount : 0,
      recursive: roomCount ? realizedCounts.recursive / roomCount : 0,
      hero: roomCount ? realizedCounts.hero / roomCount : 0,
    };
    const provisional = {
      profileId: profile.id,
      roomCount,
      assignments: roomAssignments,
      placements: logs,
      rejections,
      targetCounts,
      realizedCounts,
      ratios,
      ...(progression ? { progression: progression.summary } : {}),
    };
    const plan = BackroomsAnomalyDressingPlanSchema.parse({
      ...provisional,
      canonicalHash: stableContentHash(provisional),
    });
    const diagnostics: BackroomsDiagnostic[] = [
      backroomsDiagnostic(
        "info",
        "anomalies",
        "BRG_ANOMALY_DRESSING_SUMMARY",
        `${progression ? "Phase 8" : "Phase 7"} placed ${logs.length} anomalous room${logs.length === 1 ? "" : "s"} (${realizedCounts.lowIntensity} low, ${realizedCounts.recursive} recursive, ${realizedCounts.hero} hero); ${realizedCounts.ordinary}/${roomCount} rooms remain ordinary.`,
        [profile.id],
      ),
      ...logs.map((log) => backroomsDiagnostic(
        "info",
        "anomalies",
        "BRG_ANOMALY_PLACED",
        `${log.anomalyId} placed ${log.placementIds.length} object${log.placementIds.length === 1 ? "" : "s"} in ${log.roomId}.`,
        [log.anomalyId, log.roomId, ...log.placementIds],
      )),
      ...rejections.map((rejection) => backroomsDiagnostic(
        "warning",
        "anomalies",
        "BRG_ANOMALY_REJECTED",
        rejection.reason,
        [rejection.id, ...(rejection.roomId ? [rejection.roomId] : [])],
      )),
    ];
    return {
      placements,
      plan,
      diagnostics: sortBackroomsDiagnostics(diagnostics),
    };
  } catch (error) {
    return {
      placements: [],
      diagnostics: [backroomsDiagnostic(
        "warning",
        "anomalies",
        "BRG_ANOMALY_DRESSING_FALLBACK",
        `Anomaly dressing fell back to an ordinary map: ${error instanceof Error ? error.message : String(error)}`,
        [input.profile.id],
      )],
    };
  }
};

// Kept explicit so tests and future asset manifests can audit the fallback kit
// without coupling to the implementation's candidate builders.
export const BACKROOMS_PHASE7_FALLBACK_ANOMALY_OBJECT_IDS = [
  BACKROOMS_DESK_OBJECT_ID,
  BACKROOMS_FILING_CABINET_OBJECT_ID,
] as const;
