import { z } from "zod";
import {
  DungeonPlacedCorridorSchema,
  DungeonPlacedRoomSchema,
} from "../dungeonGen/schema";

const NonEmptyIdSchema = z.string().trim().min(1);
const FiniteNumberSchema = z.number().finite();
const NonNegativeIntSchema = z.number().int().nonnegative();
const PositiveIntSchema = z.number().int().positive();

const addRangeIssue = (
  value: { min: number; max: number },
  context: z.RefinementCtx,
) => {
  if (value.max < value.min) {
    context.addIssue({
      code: "custom",
      path: ["max"],
      message: "max must be greater than or equal to min",
    });
  }
};

export const BackroomsMinMaxIntSchema = z
  .object({ min: z.number().int(), max: z.number().int() })
  .superRefine(addRangeIssue);

export const BackroomsMinMaxNumberSchema = z
  .object({ min: FiniteNumberSchema, max: FiniteNumberSchema })
  .superRefine(addRangeIssue);

export const BackroomsPositiveMinMaxIntSchema = z
  .object({ min: PositiveIntSchema, max: PositiveIntSchema })
  .superRefine(addRangeIssue);

export const BackroomsNonNegativeMinMaxIntSchema = z
  .object({ min: NonNegativeIntSchema, max: NonNegativeIntSchema })
  .superRefine(addRangeIssue);

export const BackroomsPositiveMinMaxNumberSchema = z
  .object({ min: FiniteNumberSchema.positive(), max: FiniteNumberSchema.positive() })
  .superRefine(addRangeIssue);

export const BackroomsRatioRangeSchema = z
  .object({
    min: FiniteNumberSchema.min(0).max(1),
    max: FiniteNumberSchema.min(0).max(1),
  })
  .superRefine(addRangeIssue);

export const BACKROOMS_STAGE_IDS = [
  "topology",
  "sectors",
  "anchors",
  "embedding",
  "recurrence",
  "ordinary_dressing",
  "anomalies",
  "transitions",
  "events",
] as const;

export const BackroomsStageIdSchema = z.enum(BACKROOMS_STAGE_IDS);

const stageIdSet = new Set<string>(BACKROOMS_STAGE_IDS);
export const BackroomsStageSaltsSchema = z
  .record(z.string(), z.string())
  .default({})
  .superRefine((salts, context) => {
    for (const key of Object.keys(salts)) {
      if (!stageIdSet.has(key)) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `Unknown Backrooms stage ${key}`,
        });
      }
    }
  });

export const BackroomsRecipeSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  description: z.string().optional(),
  version: NonEmptyIdSchema.default("1.0.0"),
  generatorId: z.literal("backrooms").default("backrooms"),
  generatorVersion: z.literal("backrooms_v1").default("backrooms_v1"),
  seed: NonEmptyIdSchema,
  stageSalts: BackroomsStageSaltsSchema,
  levelProfileId: NonEmptyIdSchema,
  scale: z.object({
    roomCount: BackroomsPositiveMinMaxIntSchema,
    mapWidth: PositiveIntSchema,
    mapDepth: PositiveIntSchema,
    targetTraversalMinutes: BackroomsPositiveMinMaxNumberSchema.optional(),
  }),
  navigation: z.object({
    incidentalDeadEndRatio: BackroomsRatioRangeSchema,
    loopDensity: BackroomsRatioRangeSchema,
    landmarkSpacingRooms: BackroomsNonNegativeMinMaxIntSchema,
    anchorSpacingRooms: BackroomsNonNegativeMinMaxIntSchema,
  }),
  pacing: z.object({
    maxQuietRoomsBeforeNoveltyBoost: NonNegativeIntSchema,
    setPieceCount: BackroomsNonNegativeMinMaxIntSchema,
    hostileEncounterRatio: BackroomsRatioRangeSchema,
  }),
  constraints: z.object({
    maxGenerationAttempts: PositiveIntSchema,
    maxEmbeddingBacktracks: NonNegativeIntSchema,
  }),
});

export const BackroomsTransitionRuleSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  fromLevelProfileId: NonEmptyIdSchema,
  toLevelProfileId: NonEmptyIdSchema,
  kind: z.enum(["threshold", "door", "noclip", "fall", "portal", "scripted"]),
  // Logical routing and its sensory treatment are deliberately separate.
  // A transition can be re-skinned or comfort-filtered without changing its
  // destination, spawn, collision, or topology.
  presentationProfileId: NonEmptyIdSchema.optional(),
  weight: FiniteNumberSchema.positive().default(1),
  oneWay: z.boolean().default(true),
  minGraphDistance: NonNegativeIntSchema.default(0),
  requiredRoomTags: z.array(NonEmptyIdSchema).default([]),
  forbiddenRoomTags: z.array(NonEmptyIdSchema).default([]),
  eventProfileId: NonEmptyIdSchema.optional(),
});

export const TransitionPresentationActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("screen_tint"),
    color: z.string().min(1).default("#000000"),
    peakOpacity: FiniteNumberSchema.min(0).max(1).default(0.65),
    attackMs: NonNegativeIntSchema.default(120),
    holdMs: NonNegativeIntSchema.default(80),
    releaseMs: NonNegativeIntSchema.default(420),
  }),
  z.object({
    type: z.literal("screen_pulse"),
    color: z.string().min(1).default("#ffffff"),
    peakOpacity: FiniteNumberSchema.min(0).max(1).default(0.32),
    durationMs: NonNegativeIntSchema.default(280),
    repetitions: PositiveIntSchema.max(4).default(1),
  }),
  z.object({
    type: z.literal("play_sound"),
    soundId: NonEmptyIdSchema,
    volume: FiniteNumberSchema.min(0).max(1).default(0.5),
    playbackRate: FiniteNumberSchema.min(0.25).max(4).default(1),
  }),
]);

/**
 * Reusable, engine-level transition presentation. These profiles describe
 * transient screen/audio actions only; they never own a map destination or
 * mutate collision/topology.
 */
export const TransitionPresentationProfileSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  description: z.string().optional(),
  actions: z.array(TransitionPresentationActionSchema).default([]),
});

export const BackroomsMotifStageSchema = z.object({
  id: NonEmptyIdSchema,
  description: z.string().default(""),
  roomTags: z.array(NonEmptyIdSchema).default([]),
  objectIds: z.array(NonEmptyIdSchema).default([]),
  eventProfileId: NonEmptyIdSchema.optional(),
  anomalyProfileId: NonEmptyIdSchema.optional(),
});

export const BackroomsMotifSchema = z
  .object({
    id: NonEmptyIdSchema,
    name: NonEmptyIdSchema,
    tags: z.array(NonEmptyIdSchema).default([]),
    minSpacingRooms: NonNegativeIntSchema.default(0),
    maxOccurrences: PositiveIntSchema.default(1),
    stages: z.array(BackroomsMotifStageSchema).min(1),
  })
  .superRefine((motif, context) => {
    const seen = new Set<string>();
    motif.stages.forEach((stage, index) => {
      if (seen.has(stage.id)) {
        context.addIssue({
          code: "custom",
          path: ["stages", index, "id"],
          message: `Duplicate motif stage ID ${stage.id}`,
        });
      }
      seen.add(stage.id);
    });
  });

export const BackroomsEventEntrySchema = z.object({
  id: NonEmptyIdSchema,
  kind: z.enum(["quiet", "environmental", "narrative", "hostile"]),
  weight: FiniteNumberSchema.positive().default(1),
  roomTags: z.array(NonEmptyIdSchema).default([]),
  cutsceneId: NonEmptyIdSchema.optional(),
  dialogueId: NonEmptyIdSchema.optional(),
  encounterId: NonEmptyIdSchema.optional(),
  oneShot: z.boolean().default(false),
});

export const BackroomsEventProfileSchema = z
  .object({
    id: NonEmptyIdSchema,
    name: NonEmptyIdSchema,
    maxEventsPerMap: NonNegativeIntSchema,
    minSpacingRooms: NonNegativeIntSchema.default(0),
    events: z.array(BackroomsEventEntrySchema).min(1),
  })
  .superRefine((profile, context) => {
    const seen = new Set<string>();
    profile.events.forEach((event, index) => {
      if (seen.has(event.id)) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "id"],
          message: `Duplicate event ID ${event.id}`,
        });
      }
      seen.add(event.id);
    });
  });

export const BackroomsAnomalyClassSchema = z.enum([
  "low_intensity",
  "recursive",
  "hero",
]);

export const BackroomsAnomalyKindSchema = z.enum([
  "wrong_decoration",
  "recursive_chain",
  "partial_embed",
  "proportion_error",
  "repetition",
  "impossible_object",
]);

export const BackroomsWrongnessTierSchema = z.enum([
  "early_safe",
  "low_intensity",
  "recursive",
  "hero",
]);

export const BackroomsWrongnessProgressionSchema = z.object({
  enabled: z.boolean().default(false),
  /** Inclusive distance from start that remains free of generic anomalies. */
  earlySafeThrough: NonNegativeIntSchema.default(3),
  /** First graph distance that may receive recursive anomalies. */
  recursiveFrom: NonNegativeIntSchema.default(10),
  /** First graph distance that may receive rare hero anomalies. */
  heroFrom: NonNegativeIntSchema.default(16),
  /**
   * Optional authored-zone overrides. Early-safe tags always win; the other
   * tiers are resolved from strongest to weakest when a node has several tags.
   */
  zoneTags: z.object({
    earlySafe: z.array(NonEmptyIdSchema).default([]),
    lowIntensity: z.array(NonEmptyIdSchema).default([]),
    recursive: z.array(NonEmptyIdSchema).default([]),
    hero: z.array(NonEmptyIdSchema).default([]),
  }).default({
    earlySafe: [],
    lowIntensity: [],
    recursive: [],
    hero: [],
  }),
}).superRefine((progression, context) => {
  if (progression.recursiveFrom <= progression.earlySafeThrough) {
    context.addIssue({
      code: "custom",
      path: ["recursiveFrom"],
      message: "recursive progression must begin after the early-safe distance",
    });
  }
  if (progression.heroFrom <= progression.recursiveFrom) {
    context.addIssue({
      code: "custom",
      path: ["heroFrom"],
      message: "hero progression must begin after recursive progression",
    });
  }
});

const BackroomsWrongnessTierCountsSchema = z.object({
  earlySafe: NonNegativeIntSchema,
  lowIntensity: NonNegativeIntSchema,
  recursive: NonNegativeIntSchema,
  hero: NonNegativeIntSchema,
});

/** Inspectable summary of the enabled Phase 8 progression evaluation. */
export const BackroomsWrongnessProgressionSummarySchema = z.object({
  enabled: z.literal(true),
  configHash: NonEmptyIdSchema,
  maxGraphDistance: NonNegativeIntSchema,
  tierCounts: BackroomsWrongnessTierCountsSchema,
  averageWrongness: FiniteNumberSchema.min(0).max(1),
  maximumWrongness: FiniteNumberSchema.min(0).max(1),
});

/**
 * Authoring contract for geometry that visibly continues into opaque scenery.
 * The generator still bakes ordinary placements; this record only describes
 * how a deterministic dressing pass is allowed to choose their transforms.
 */
export const BackroomsPartialEmbedAnomalySchema = z.object({
  anchor: z.enum(["wall", "floor", "ceiling", "partition"]).default("wall"),
  mode: z.enum([
    "wall_clip",
    "floor_sink",
    "ceiling_intrusion",
    "partition_bisect",
    "corner_clip",
  ]),
  penetrationRatio: BackroomsRatioRangeSchema.default({ min: 0.35, max: 0.55 }),
  lateralOffsetCells: BackroomsMinMaxNumberSchema.optional(),
  verticalOffsetMeters: BackroomsMinMaxNumberSchema.optional(),
  rotationJitterDegrees: FiniteNumberSchema.nonnegative().default(0),
  collisionPolicy: z.enum(["none", "visible_bounds_only"]).default("none"),
  requireOpaqueBacking: z.boolean().default(true),
  keepClearanceCells: NonNegativeIntSchema.default(1),
});

export const BackroomsRecursiveAnomalySchema = z.object({
  copyCount: BackroomsPositiveMinMaxIntSchema.default({ min: 4, max: 6 }),
  scaleFalloff: BackroomsRatioRangeSchema.default({ min: 0.82, max: 0.88 }),
  rotationStepDegrees: BackroomsMinMaxNumberSchema.default({ min: 2, max: 7 }),
  tiltStepDegrees: BackroomsMinMaxNumberSchema.default({ min: 0, max: 4 }),
  sinkStepMeters: BackroomsMinMaxNumberSchema.default({ min: 0, max: 0.03 }),
  keepClearanceCells: NonNegativeIntSchema.default(1),
}).superRefine((value, context) => {
  if (value.scaleFalloff.min <= 0 || value.scaleFalloff.max >= 1) {
    context.addIssue({
      code: "custom",
      path: ["scaleFalloff"],
      message: "recursive scale falloff must remain greater than zero and less than one",
    });
  }
  if (value.rotationStepDegrees.min < 0 || value.tiltStepDegrees.min < 0 ||
      value.sinkStepMeters.min < 0) {
    context.addIssue({
      code: "custom",
      message: "recursive rotation, tilt, and sink ranges must be non-negative",
    });
  }
});

export const BackroomsWrongDecorationAnomalySchema = z.object({
  yawDegrees: BackroomsMinMaxNumberSchema.default({ min: 170, max: 190 }),
  pitchDegrees: BackroomsMinMaxNumberSchema.default({ min: 0, max: 3 }),
  wallInsetMeters: BackroomsMinMaxNumberSchema.default({ min: 0.04, max: 0.14 }),
  keepClearanceCells: NonNegativeIntSchema.default(1),
});

export const BackroomsAnomalyEntrySchema = z.object({
  id: NonEmptyIdSchema,
  class: BackroomsAnomalyClassSchema,
  kind: BackroomsAnomalyKindSchema,
  weight: FiniteNumberSchema.positive().default(1),
  assetIds: z.array(NonEmptyIdSchema).min(1),
  collisionPolicy: z
    .enum(["none", "first_only", "visible_bounds_only", "inherit"])
    .default("none"),
  requiredAnchor: z
    .enum(["floor", "wall", "ceiling", "partition", "corner", "reserved_room"])
    .optional(),
  minSpacingRooms: NonNegativeIntSchema.default(0),
  partialEmbed: BackroomsPartialEmbedAnomalySchema.optional(),
  recursive: BackroomsRecursiveAnomalySchema.optional(),
  wrongDecoration: BackroomsWrongDecorationAnomalySchema.optional(),
});

export const BackroomsAnomalyProfileSchema = z
  .object({
    id: NonEmptyIdSchema,
    name: NonEmptyIdSchema,
    density: z.object({
      ordinary: BackroomsRatioRangeSchema,
      lowIntensity: BackroomsRatioRangeSchema,
      recursive: BackroomsRatioRangeSchema,
      hero: BackroomsRatioRangeSchema,
    }),
    /** Omitted profiles retain the exact Phase 7 unprogressed selection path. */
    progression: BackroomsWrongnessProgressionSchema.optional(),
    neverAdjacentHero: z.boolean().default(true),
    maxAnomaliesPerMap: NonNegativeIntSchema,
    anomalies: z.array(BackroomsAnomalyEntrySchema).min(1),
  })
  .superRefine((profile, context) => {
    const densityRanges = Object.values(profile.density);
    const minimumTotal = densityRanges.reduce((sum, range) => sum + range.min, 0);
    const maximumTotal = densityRanges.reduce((sum, range) => sum + range.max, 0);
    if (minimumTotal > 1 || maximumTotal < 1) {
      context.addIssue({
        code: "custom",
        path: ["density"],
        message: "Anomaly density ranges must admit a distribution totaling 1",
      });
    }
    const seen = new Set<string>();
    profile.anomalies.forEach((anomaly, index) => {
      if (seen.has(anomaly.id)) {
        context.addIssue({
          code: "custom",
          path: ["anomalies", index, "id"],
          message: `Duplicate anomaly ID ${anomaly.id}`,
        });
      }
      seen.add(anomaly.id);
    });
  });

export const BackroomsAnomalyRoomClassSchema = z.enum([
  "ordinary",
  "low_intensity",
  "recursive",
  "hero",
]);

export const BackroomsAnomalyRoomAssignmentSchema = z.object({
  roomId: NonEmptyIdSchema,
  class: BackroomsAnomalyRoomClassSchema,
  anomalyId: NonEmptyIdSchema.optional(),
  graphDistanceFromStart: NonNegativeIntSchema.optional(),
  wrongness: FiniteNumberSchema.min(0).max(1).optional(),
  progressionTier: BackroomsWrongnessTierSchema.optional(),
});

export const BackroomsAnomalyPlacementLogSchema = z.object({
  id: NonEmptyIdSchema,
  anomalyId: NonEmptyIdSchema,
  class: BackroomsAnomalyClassSchema,
  kind: BackroomsAnomalyKindSchema,
  roomId: NonEmptyIdSchema,
  objectId: NonEmptyIdSchema,
  placementIds: z.array(NonEmptyIdSchema).min(1),
  /** Hash of the complete baked placements, including every transform. */
  placementHash: NonEmptyIdSchema,
});

export const BackroomsAnomalyRejectionSchema = z.object({
  id: NonEmptyIdSchema,
  roomId: NonEmptyIdSchema.optional(),
  anomalyId: NonEmptyIdSchema.optional(),
  code: NonEmptyIdSchema,
  reason: NonEmptyIdSchema,
});

const BackroomsAnomalyClassCountsSchema = z.object({
  ordinary: NonNegativeIntSchema,
  lowIntensity: NonNegativeIntSchema,
  recursive: NonNegativeIntSchema,
  hero: NonNegativeIntSchema,
});

const BackroomsAnomalyClassRatiosSchema = z.object({
  ordinary: FiniteNumberSchema.min(0).max(1),
  lowIntensity: FiniteNumberSchema.min(0).max(1),
  recursive: FiniteNumberSchema.min(0).max(1),
  hero: FiniteNumberSchema.min(0).max(1),
});

/** Inspectable Phase 7/8 artifact. Play mode never consumes this structure. */
export const BackroomsAnomalyDressingPlanSchema = z.object({
  profileId: NonEmptyIdSchema,
  roomCount: NonNegativeIntSchema,
  assignments: z.array(BackroomsAnomalyRoomAssignmentSchema).default([]),
  placements: z.array(BackroomsAnomalyPlacementLogSchema).default([]),
  rejections: z.array(BackroomsAnomalyRejectionSchema).default([]),
  targetCounts: BackroomsAnomalyClassCountsSchema,
  realizedCounts: BackroomsAnomalyClassCountsSchema,
  ratios: BackroomsAnomalyClassRatiosSchema,
  progression: BackroomsWrongnessProgressionSummarySchema.optional(),
  canonicalHash: NonEmptyIdSchema,
}).superRefine((plan, context) => {
  const assignmentIds = new Set<string>();
  plan.assignments.forEach((assignment, index) => {
    if (assignmentIds.has(assignment.roomId)) {
      context.addIssue({
        code: "custom",
        path: ["assignments", index, "roomId"],
        message: "anomaly dressing assigns each room exactly once",
      });
    }
    assignmentIds.add(assignment.roomId);
    if (assignment.class === "ordinary" && assignment.anomalyId) {
      context.addIssue({
        code: "custom",
        path: ["assignments", index, "anomalyId"],
        message: "ordinary rooms cannot reference an anomaly",
      });
    }
    if (assignment.class !== "ordinary" && !assignment.anomalyId) {
      context.addIssue({
        code: "custom",
        path: ["assignments", index, "anomalyId"],
        message: "anomalous rooms require an anomaly reference",
      });
    }
    if (plan.progression && (
      assignment.graphDistanceFromStart === undefined ||
      assignment.wrongness === undefined ||
      assignment.progressionTier === undefined
    )) {
      context.addIssue({
        code: "custom",
        path: ["assignments", index],
        message: "progressed anomaly assignments require distance, wrongness, and tier metadata",
      });
    }
  });
  if (plan.assignments.length !== plan.roomCount) {
    context.addIssue({
      code: "custom",
      path: ["assignments"],
      message: "anomaly dressing must classify every room",
    });
  }
  if (plan.progression) {
    const tierCounts = {
      earlySafe: plan.assignments.filter((entry) => entry.progressionTier === "early_safe").length,
      lowIntensity: plan.assignments.filter((entry) => entry.progressionTier === "low_intensity").length,
      recursive: plan.assignments.filter((entry) => entry.progressionTier === "recursive").length,
      hero: plan.assignments.filter((entry) => entry.progressionTier === "hero").length,
    };
    if (Object.keys(tierCounts).some((key) =>
      tierCounts[key as keyof typeof tierCounts] !==
        plan.progression!.tierCounts[key as keyof typeof tierCounts])) {
      context.addIssue({
        code: "custom",
        path: ["progression", "tierCounts"],
        message: "progression tier counts must match the room assignments",
      });
    }
  }
});

export const BackroomsLevelProfileSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  description: z.string().optional(),
  roomTags: z.array(NonEmptyIdSchema).default([]),
  wallObjectIds: z.array(NonEmptyIdSchema).default([]),
  floorObjectIds: z.array(NonEmptyIdSchema).default([]),
  ceilingObjectIds: z.array(NonEmptyIdSchema).default([]),
  lightObjectIds: z.array(NonEmptyIdSchema).default([]),
  ordinaryDressingObjectIds: z.array(NonEmptyIdSchema).default([]),
  presentationProfileId: NonEmptyIdSchema.optional(),
  transitionRuleIds: z.array(NonEmptyIdSchema).default([]),
  motifIds: z.array(NonEmptyIdSchema).default([]),
  eventProfileIds: z.array(NonEmptyIdSchema).default([]),
  anomalyProfileId: NonEmptyIdSchema.optional(),
});

export const BackroomsAnchorRequestSchema = z.object({
  id: NonEmptyIdSchema,
  kind: z.enum(["narrative", "landmark", "set_piece"]).default("narrative"),
  tags: z.array(NonEmptyIdSchema).default([]),
  quiet: z.boolean().default(false),
});

export const BackroomsGraphNodeSchema = z.object({
  id: NonEmptyIdSchema,
  kind: z.enum([
    "start",
    "connective",
    "anchor",
    "landmark",
    "set_piece",
    "culmination",
    "transition",
  ]),
  ordinal: NonNegativeIntSchema,
  required: z.boolean(),
  quiet: z.boolean(),
  anchorId: NonEmptyIdSchema.optional(),
  tags: z.array(NonEmptyIdSchema).default([]),
});

export const BackroomsGraphEdgeSchema = z.object({
  id: NonEmptyIdSchema,
  fromNodeId: NonEmptyIdSchema,
  toNodeId: NonEmptyIdSchema,
  kind: z.enum(["backbone", "anchor", "ordinary", "loop"]),
  immutable: z.boolean(),
  mutableCandidate: z.boolean().default(false),
  tags: z.array(NonEmptyIdSchema).default([]),
});

export const BackroomsGraphMetricsSchema = z.object({
  nodeCount: NonNegativeIntSchema,
  edgeCount: NonNegativeIntSchema,
  componentCount: NonNegativeIntSchema,
  cycleCount: NonNegativeIntSchema,
  cycleDensity: FiniteNumberSchema.nonnegative(),
  deadEndCount: NonNegativeIntSchema,
  incidentalDeadEndCount: NonNegativeIntSchema,
  incidentalDeadEndRate: FiniteNumberSchema.min(0).max(1),
  averageNodeDegree: FiniteNumberSchema.nonnegative(),
  maximumNodeDegree: NonNegativeIntSchema,
  requiredAnchorReachability: FiniteNumberSchema.min(0).max(1),
  startToCulminationPathLength: NonNegativeIntSchema,
  startToTransitionPathLength: NonNegativeIntSchema,
  longestShortestRoute: NonNegativeIntSchema,
  minimumAnchorSpacing: NonNegativeIntSchema.nullable(),
  minimumLandmarkSpacing: NonNegativeIntSchema.nullable(),
  quietStretchEstimate: NonNegativeIntSchema,
  minimumSetPieceSeparation: NonNegativeIntSchema.nullable(),
  canonicalHash: NonEmptyIdSchema,
});

export const BackroomsSemanticGraphSchema = z
  .object({
    nodes: z.array(BackroomsGraphNodeSchema).min(3),
    edges: z.array(BackroomsGraphEdgeSchema).min(2),
    startNodeId: NonEmptyIdSchema,
    culminationNodeId: NonEmptyIdSchema,
    transitionNodeId: NonEmptyIdSchema,
    requiredAnchorNodeIds: z.array(NonEmptyIdSchema).default([]),
    landmarkNodeIds: z.array(NonEmptyIdSchema).default([]),
    setPieceNodeIds: z.array(NonEmptyIdSchema).default([]),
    metrics: BackroomsGraphMetricsSchema,
  })
  .superRefine((graph, context) => {
    const nodeIds = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "duplicate graph node ID" });
      }
      nodeIds.add(node.id);
    });
    const edgeIds = new Set<string>();
    const endpointPairs = new Set<string>();
    graph.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        context.addIssue({ code: "custom", path: ["edges", index, "id"], message: "duplicate graph edge ID" });
      }
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.fromNodeId)) {
        context.addIssue({ code: "custom", path: ["edges", index, "fromNodeId"], message: "missing source node" });
      }
      if (!nodeIds.has(edge.toNodeId)) {
        context.addIssue({ code: "custom", path: ["edges", index, "toNodeId"], message: "missing target node" });
      }
      if (edge.fromNodeId === edge.toNodeId) {
        context.addIssue({ code: "custom", path: ["edges", index], message: "self edges are not permitted" });
      }
      const pair = [edge.fromNodeId, edge.toNodeId].sort().join("|");
      if (endpointPairs.has(pair)) {
        context.addIssue({ code: "custom", path: ["edges", index], message: "duplicate graph connection" });
      }
      endpointPairs.add(pair);
      if (edge.immutable && edge.mutableCandidate) {
        context.addIssue({ code: "custom", path: ["edges", index, "mutableCandidate"], message: "immutable edges cannot be mutable candidates" });
      }
    });
    const checkNodeReference = (id: string, path: (string | number)[]) => {
      if (!nodeIds.has(id)) context.addIssue({ code: "custom", path, message: `missing graph node ${id}` });
    };
    checkNodeReference(graph.startNodeId, ["startNodeId"]);
    checkNodeReference(graph.culminationNodeId, ["culminationNodeId"]);
    checkNodeReference(graph.transitionNodeId, ["transitionNodeId"]);
    graph.requiredAnchorNodeIds.forEach((id, index) => checkNodeReference(id, ["requiredAnchorNodeIds", index]));
    graph.landmarkNodeIds.forEach((id, index) => checkNodeReference(id, ["landmarkNodeIds", index]));
    graph.setPieceNodeIds.forEach((id, index) => checkNodeReference(id, ["setPieceNodeIds", index]));
  });

export const BackroomsRealizedConnectionSchema = z.object({
  edgeId: NonEmptyIdSchema,
  corridorId: NonEmptyIdSchema,
  fromNodeId: NonEmptyIdSchema,
  toNodeId: NonEmptyIdSchema,
  fromSocketId: NonEmptyIdSchema,
  toSocketId: NonEmptyIdSchema,
  fromCell: z.tuple([z.number().int(), z.number().int()]),
  toCell: z.tuple([z.number().int(), z.number().int()]),
  width: PositiveIntSchema,
});

/**
 * Phase 5's inspectable spatial artifact. It deliberately reuses dungeon room
 * and corridor placement schemas, while the final boundary remains ordinary
 * MapData. The runtime never consumes this structure.
 */
export const BackroomsEmbeddedMapSchema = z
  .object({
    mapId: NonEmptyIdSchema,
    displayName: NonEmptyIdSchema,
    width: PositiveIntSchema,
    depth: PositiveIntSchema,
    rooms: z.array(DungeonPlacedRoomSchema).min(1),
    corridors: z.array(DungeonPlacedCorridorSchema).default([]),
    connections: z.array(BackroomsRealizedConnectionSchema).default([]),
    backtracks: NonNegativeIntSchema.default(0),
    canonicalHash: NonEmptyIdSchema,
  })
  .superRefine((embedded, context) => {
    const roomNodeIds = new Set<string>();
    embedded.rooms.forEach((room, index) => {
      if (room.mapId !== embedded.mapId) {
        context.addIssue({ code: "custom", path: ["rooms", index, "mapId"], message: "room belongs to a different map" });
      }
      if (roomNodeIds.has(room.nodeId)) {
        context.addIssue({ code: "custom", path: ["rooms", index, "nodeId"], message: "duplicate placed graph node" });
      }
      roomNodeIds.add(room.nodeId);
    });
    const corridorIds = new Set<string>();
    const corridorEdgeIds = new Set<string>();
    embedded.corridors.forEach((corridor, index) => {
      if (corridor.mapId !== embedded.mapId) {
        context.addIssue({ code: "custom", path: ["corridors", index, "mapId"], message: "corridor belongs to a different map" });
      }
      if (corridorIds.has(corridor.id)) {
        context.addIssue({ code: "custom", path: ["corridors", index, "id"], message: "duplicate corridor ID" });
      }
      corridorIds.add(corridor.id);
      corridorEdgeIds.add(corridor.edgeId);
    });
    const connectionEdgeIds = new Set<string>();
    embedded.connections.forEach((connection, index) => {
      if (connectionEdgeIds.has(connection.edgeId)) {
        context.addIssue({ code: "custom", path: ["connections", index, "edgeId"], message: "graph edge was realized more than once" });
      }
      connectionEdgeIds.add(connection.edgeId);
      if (!corridorIds.has(connection.corridorId) || !corridorEdgeIds.has(connection.edgeId)) {
        context.addIssue({ code: "custom", path: ["connections", index], message: "connection does not reference its realized corridor" });
      }
      if (!roomNodeIds.has(connection.fromNodeId) || !roomNodeIds.has(connection.toNodeId)) {
        context.addIssue({ code: "custom", path: ["connections", index], message: "connection references an unplaced graph node" });
      }
    });
  });

export const BackroomsAmbienceLayerSchema = z.object({
  id: NonEmptyIdSchema,
  role: z.enum(["base_hum", "electrical_texture", "rare_anomaly"]),
  musicId: NonEmptyIdSchema.optional(),
  musicUrl: NonEmptyIdSchema.optional(),
  soundId: NonEmptyIdSchema.optional(),
  soundUrl: NonEmptyIdSchema.optional(),
  volume: FiniteNumberSchema.min(0).max(1),
  loop: z.boolean().default(false),
  minSpacingRooms: NonNegativeIntSchema.default(0),
  maxOccurrences: NonNegativeIntSchema.default(0),
}).superRefine((layer, context) => {
  if (!layer.musicId && !layer.musicUrl && !layer.soundId && !layer.soundUrl) {
    context.addIssue({ code: "custom", message: "ambience layer requires an audio reference" });
  }
  if (layer.role === "base_hum" && !layer.loop) {
    context.addIssue({ code: "custom", path: ["loop"], message: "base hum must loop" });
  }
});

export const BackroomsAmbienceProfileSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  layers: z.array(BackroomsAmbienceLayerSchema).min(1),
}).superRefine((profile, context) => {
  const ids = new Set<string>();
  profile.layers.forEach((layer, index) => {
    if (ids.has(layer.id)) {
      context.addIssue({ code: "custom", path: ["layers", index, "id"], message: "duplicate ambience layer ID" });
    }
    ids.add(layer.id);
  });
  if (profile.layers.filter((layer) => layer.role === "base_hum").length !== 1) {
    context.addIssue({ code: "custom", path: ["layers"], message: "ambience profile requires exactly one base hum" });
  }
});

export const BackroomsRecurrenceOccurrenceSchema = z.object({
  id: NonEmptyIdSchema,
  motifId: NonEmptyIdSchema,
  stageId: NonEmptyIdSchema,
  stageIndex: NonNegativeIntSchema,
  nodeId: NonEmptyIdSchema,
  graphDistanceFromPrevious: NonNegativeIntSchema.nullable(),
  protected: z.boolean().default(false),
  tags: z.array(NonEmptyIdSchema).default([]),
});

export const BackroomsScheduledEventSchema = z.object({
  id: NonEmptyIdSchema,
  eventProfileId: NonEmptyIdSchema,
  eventId: NonEmptyIdSchema,
  nodeId: NonEmptyIdSchema,
  cutsceneId: NonEmptyIdSchema,
  kind: z.enum(["quiet", "environmental", "narrative", "hostile"]),
  once: z.boolean().default(true),
  noveltyDebtBefore: NonNegativeIntSchema,
});

export const BackroomsPacingSampleSchema = z.object({
  nodeId: NonEmptyIdSchema,
  traversalIndex: NonNegativeIntSchema,
  quietStreak: NonNegativeIntSchema,
  noveltyDebt: NonNegativeIntSchema,
  noveltySourceIds: z.array(NonEmptyIdSchema).default([]),
});

export const BackroomsPacingPlanSchema = z.object({
  motifId: NonEmptyIdSchema,
  eventProfileId: NonEmptyIdSchema,
  ambienceProfile: BackroomsAmbienceProfileSchema,
  protectedNodeIds: z.array(NonEmptyIdSchema).default([]),
  recurrence: z.array(BackroomsRecurrenceOccurrenceSchema).default([]),
  events: z.array(BackroomsScheduledEventSchema).default([]),
  samples: z.array(BackroomsPacingSampleSchema).default([]),
  maximumQuietStreak: NonNegativeIntSchema,
  mandatoryHostileActors: NonNegativeIntSchema.default(0),
  canonicalHash: NonEmptyIdSchema,
}).superRefine((plan, context) => {
  const protectedIds = new Set(plan.protectedNodeIds);
  const recurrenceIds = new Set<string>();
  plan.recurrence.forEach((entry, index) => {
    if (recurrenceIds.has(entry.id)) {
      context.addIssue({ code: "custom", path: ["recurrence", index, "id"], message: "duplicate recurrence occurrence ID" });
    }
    recurrenceIds.add(entry.id);
    if (entry.protected && !protectedIds.has(entry.nodeId)) {
      context.addIssue({ code: "custom", path: ["recurrence", index, "protected"], message: "protected recurrence node is missing from protectedNodeIds" });
    }
  });
  const eventIds = new Set<string>();
  plan.events.forEach((entry, index) => {
    if (eventIds.has(entry.id)) {
      context.addIssue({ code: "custom", path: ["events", index, "id"], message: "duplicate scheduled event ID" });
    }
    eventIds.add(entry.id);
    if (entry.kind === "hostile") {
      context.addIssue({ code: "custom", path: ["events", index, "kind"], message: "Phase 6 pacing events must remain non-combat" });
    }
  });
});

export const BackroomsDiagnosticSchema = z.object({
  severity: z.enum(["fatal", "error", "warning", "info"]),
  stage: BackroomsStageIdSchema,
  code: NonEmptyIdSchema,
  message: NonEmptyIdSchema,
  relatedIds: z.array(NonEmptyIdSchema).optional(),
});

const addDuplicateIdIssues = <T extends { id: string }>(
  values: readonly T[],
  path: string,
  context: z.RefinementCtx,
) => {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      context.addIssue({
        code: "custom",
        path: [path, index, "id"],
        message: `Duplicate ${path} ID ${value.id}`,
      });
    }
    seen.add(value.id);
  });
};

const addReferenceIssue = (
  id: string,
  knownIds: ReadonlySet<string>,
  path: (string | number)[],
  label: string,
  context: z.RefinementCtx,
) => {
  if (!knownIds.has(id)) {
    context.addIssue({
      code: "custom",
      path,
      message: `Unknown ${label} reference ${id}`,
    });
  }
};

/**
 * Cross-reference gate for a package's Backrooms authoring library. Individual
 * item schemas remain independently editable; this library schema is the
 * readiness boundary used before generation begins.
 */
export const BackroomsDefinitionLibrarySchema = z
  .object({
    backrooms_recipes: z.array(BackroomsRecipeSchema).default([]),
    backrooms_level_profiles: z.array(BackroomsLevelProfileSchema).default([]),
    backrooms_transition_rules: z.array(BackroomsTransitionRuleSchema).default([]),
    transition_presentation_profiles: z
      .array(TransitionPresentationProfileSchema)
      .default([]),
    backrooms_motifs: z.array(BackroomsMotifSchema).default([]),
    backrooms_event_profiles: z.array(BackroomsEventProfileSchema).default([]),
    backrooms_anomaly_profiles: z.array(BackroomsAnomalyProfileSchema).default([]),
  })
  .superRefine((library, context) => {
    const collections: ReadonlyArray<
      readonly [string, readonly { id: string }[]]
    > = [
      ["backrooms_recipes", library.backrooms_recipes],
      ["backrooms_level_profiles", library.backrooms_level_profiles],
      ["backrooms_transition_rules", library.backrooms_transition_rules],
      ["transition_presentation_profiles", library.transition_presentation_profiles],
      ["backrooms_motifs", library.backrooms_motifs],
      ["backrooms_event_profiles", library.backrooms_event_profiles],
      ["backrooms_anomaly_profiles", library.backrooms_anomaly_profiles],
    ];
    for (const [path, values] of collections) {
      addDuplicateIdIssues(values, path, context);
    }

    const levelIds = new Set(library.backrooms_level_profiles.map(({ id }) => id));
    const transitionIds = new Set(library.backrooms_transition_rules.map(({ id }) => id));
    const presentationIds = new Set(
      library.transition_presentation_profiles.map(({ id }) => id),
    );
    const motifIds = new Set(library.backrooms_motifs.map(({ id }) => id));
    const eventProfileIds = new Set(library.backrooms_event_profiles.map(({ id }) => id));
    const anomalyProfileIds = new Set(library.backrooms_anomaly_profiles.map(({ id }) => id));

    library.backrooms_recipes.forEach((recipe, index) => {
      addReferenceIssue(recipe.levelProfileId, levelIds, ["backrooms_recipes", index, "levelProfileId"], "level profile", context);
    });
    library.backrooms_level_profiles.forEach((profile, profileIndex) => {
      profile.transitionRuleIds.forEach((id, index) => addReferenceIssue(id, transitionIds, ["backrooms_level_profiles", profileIndex, "transitionRuleIds", index], "transition rule", context));
      profile.motifIds.forEach((id, index) => addReferenceIssue(id, motifIds, ["backrooms_level_profiles", profileIndex, "motifIds", index], "motif", context));
      profile.eventProfileIds.forEach((id, index) => addReferenceIssue(id, eventProfileIds, ["backrooms_level_profiles", profileIndex, "eventProfileIds", index], "event profile", context));
      if (profile.anomalyProfileId) addReferenceIssue(profile.anomalyProfileId, anomalyProfileIds, ["backrooms_level_profiles", profileIndex, "anomalyProfileId"], "anomaly profile", context);
      if (profile.presentationProfileId) addReferenceIssue(profile.presentationProfileId, presentationIds, ["backrooms_level_profiles", profileIndex, "presentationProfileId"], "presentation profile", context);
    });
    library.backrooms_transition_rules.forEach((rule, index) => {
      addReferenceIssue(rule.fromLevelProfileId, levelIds, ["backrooms_transition_rules", index, "fromLevelProfileId"], "level profile", context);
      addReferenceIssue(rule.toLevelProfileId, levelIds, ["backrooms_transition_rules", index, "toLevelProfileId"], "level profile", context);
      if (rule.eventProfileId) addReferenceIssue(rule.eventProfileId, eventProfileIds, ["backrooms_transition_rules", index, "eventProfileId"], "event profile", context);
      if (rule.presentationProfileId) addReferenceIssue(rule.presentationProfileId, presentationIds, ["backrooms_transition_rules", index, "presentationProfileId"], "presentation profile", context);
    });
    library.backrooms_motifs.forEach((motif, motifIndex) => {
      motif.stages.forEach((stage, stageIndex) => {
        if (stage.eventProfileId) addReferenceIssue(stage.eventProfileId, eventProfileIds, ["backrooms_motifs", motifIndex, "stages", stageIndex, "eventProfileId"], "event profile", context);
        if (stage.anomalyProfileId) addReferenceIssue(stage.anomalyProfileId, anomalyProfileIds, ["backrooms_motifs", motifIndex, "stages", stageIndex, "anomalyProfileId"], "anomaly profile", context);
      });
    });
  });
