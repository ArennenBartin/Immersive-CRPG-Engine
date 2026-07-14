import { z } from "zod";

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

export const DungeonMinMaxIntSchema = z
  .object({ min: z.number().int(), max: z.number().int() })
  .superRefine(addRangeIssue);

export const DungeonMinMaxNumberSchema = z
  .object({ min: FiniteNumberSchema, max: FiniteNumberSchema })
  .superRefine(addRangeIssue);

export const DungeonWeightedRefSchema = z.object({
  id: NonEmptyIdSchema,
  weight: FiniteNumberSchema.positive(),
});

export const DUNGEON_STAGE_IDS = [
  "recipe",
  "topology",
  "archetypes",
  "gates",
  "progression",
  "floor_partition",
  "room_shapes",
  "embedding",
  "corridors",
  "infrastructure",
  "encounters",
  "hazards",
  "rewards",
  "dressing",
  "secrets",
  "geometry",
  "navigation",
  "population",
  "simulation",
  "audit",
  "bake",
] as const;

export const DungeonStageIdSchema = z.enum(DUNGEON_STAGE_IDS);

const stageIdSet = new Set<string>(DUNGEON_STAGE_IDS);
export const DungeonStageSaltsSchema = z
  .record(z.string(), z.string())
  .default({})
  .superRefine((salts, context) => {
    for (const key of Object.keys(salts)) {
      if (!stageIdSet.has(key)) {
        context.addIssue({
          code: "custom",
          path: [key],
          message: `Unknown dungeon stage ${key}`,
        });
      }
    }
  });

export const DungeonAdjacencyRuleSchema = z.object({
  fromArchetypeId: NonEmptyIdSchema,
  toArchetypeId: NonEmptyIdSchema,
  bidirectional: z.boolean().default(true),
});

export const DungeonRecipeSchema = z
  .object({
    id: NonEmptyIdSchema,
    name: NonEmptyIdSchema,
    description: z.string().optional(),
    version: NonEmptyIdSchema.default("1.0.0"),
    generatorId: z.literal("dungeon").default("dungeon"),
    generatorVersion: z.literal("dungeon_v1").default("dungeon_v1"),
    seed: NonEmptyIdSchema,
    stageSalts: DungeonStageSaltsSchema,
    outputMode: z.enum(["single_map", "multi_map_floors"]),
    themeId: NonEmptyIdSchema,
    scale: z.object({
      floorCount: DungeonMinMaxIntSchema,
      roomCount: DungeonMinMaxIntSchema,
      roomWidth: DungeonMinMaxIntSchema,
      roomDepth: DungeonMinMaxIntSchema,
      floorMapWidth: PositiveIntSchema,
      floorMapDepth: PositiveIntSchema,
      floorHeightStep: FiniteNumberSchema.positive().optional(),
    }),
    topology: z.object({
      criticalPathLength: DungeonMinMaxIntSchema,
      branchCount: DungeonMinMaxIntSchema,
      branchLength: DungeonMinMaxIntSchema,
      loopCount: DungeonMinMaxIntSchema,
      secretCount: DungeonMinMaxIntSchema,
      lockCount: DungeonMinMaxIntSchema,
      optionalObjectiveCount: DungeonMinMaxIntSchema.optional(),
      requireReturnPath: z.boolean(),
    }),
    architecture: z.object({
      roomArchetypePool: z.array(DungeonWeightedRefSchema).min(1),
      roomTemplatePool: z.array(DungeonWeightedRefSchema).default([]),
      proceduralRoomBuilderPool: z.array(DungeonWeightedRefSchema).default([]),
      corridorWidth: DungeonMinMaxIntSchema,
      roomPadding: NonNegativeIntSchema,
      allowDiagonalCorridors: z.boolean().default(false),
      allowVerticalTransitions: z.boolean().default(true),
      verticalTransitionTypes: z.array(z.enum(["stairs", "ladder", "lift", "shaft", "portal"])).default(["stairs"]),
      boundaryStyle: NonEmptyIdSchema,
    }),
    population: z.object({
      infrastructureProfileId: NonEmptyIdSchema.optional(),
      ecologyProfileId: NonEmptyIdSchema.optional(),
      encounterProfileId: NonEmptyIdSchema.optional(),
      hazardProfileId: NonEmptyIdSchema.optional(),
      rewardProfileId: NonEmptyIdSchema.optional(),
      narrativeProfileId: NonEmptyIdSchema.optional(),
    }),
    difficulty: z.object({
      baseThreat: FiniteNumberSchema.nonnegative(),
      threatGrowthByDepth: FiniteNumberSchema.nonnegative(),
      optionalBranchThreatMultiplier: FiniteNumberSchema.nonnegative(),
      resourceBudget: FiniteNumberSchema.nonnegative(),
      hazardBudget: FiniteNumberSchema.nonnegative(),
      complexityBudget: FiniteNumberSchema.nonnegative(),
    }),
    constraints: z.object({
      requiredRoomArchetypes: z.array(NonEmptyIdSchema).default([]),
      forbiddenAdjacencies: z.array(DungeonAdjacencyRuleSchema).default([]),
      requiredTags: z.array(NonEmptyIdSchema).default([]),
      permittedVerbs: z.array(NonEmptyIdSchema).default([]),
      permittedChemistryMaterials: z.array(NonEmptyIdSchema).default([]),
      maxGenerationAttempts: PositiveIntSchema,
      maxEmbeddingBacktracks: NonNegativeIntSchema,
    }),
  })
  .superRefine((recipe, context) => {
    const positiveRanges: Array<[string, { min: number; max: number }]> = [
      ["scale.floorCount", recipe.scale.floorCount],
      ["scale.roomCount", recipe.scale.roomCount],
      ["scale.roomWidth", recipe.scale.roomWidth],
      ["scale.roomDepth", recipe.scale.roomDepth],
      ["topology.criticalPathLength", recipe.topology.criticalPathLength],
      ["topology.branchLength", recipe.topology.branchLength],
      ["architecture.corridorWidth", recipe.architecture.corridorWidth],
    ];
    for (const [path, range] of positiveRanges) {
      if (range.min < 1) {
        context.addIssue({ code: "custom", path: path.split("."), message: "range minimum must be at least 1" });
      }
    }
    if (recipe.scale.floorCount.max > 3) {
      context.addIssue({ code: "custom", path: ["scale", "floorCount", "max"], message: "dungeon_v1 supports at most 3 floors" });
    }
    if (recipe.outputMode === "single_map" && recipe.scale.floorCount.max !== 1) {
      context.addIssue({ code: "custom", path: ["scale", "floorCount"], message: "single_map recipes must generate exactly one floor" });
    }
    if (!recipe.architecture.roomTemplatePool.length && !recipe.architecture.proceduralRoomBuilderPool.length) {
      context.addIssue({
        code: "custom",
        path: ["architecture"],
        message: "at least one room template or procedural room builder is required",
      });
    }
    if (!recipe.architecture.allowVerticalTransitions && recipe.scale.floorCount.max > 1) {
      context.addIssue({
        code: "custom",
        path: ["architecture", "allowVerticalTransitions"],
        message: "multi-floor recipes must allow vertical transitions",
      });
    }
  });

export const DungeonThemeProfileSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  description: z.string().optional(),
  tags: z.array(NonEmptyIdSchema).default([]),
  architecture: z.object({
    floorObjectId: NonEmptyIdSchema.optional(),
    wallObjectId: NonEmptyIdSchema,
    doorObjectId: NonEmptyIdSchema,
    containerObjectId: NonEmptyIdSchema,
    pushableObjectId: NonEmptyIdSchema.optional(),
    stairObjectId: NonEmptyIdSchema.optional(),
    terminalObjectId: NonEmptyIdSchema.optional(),
    floorTerrain: NonEmptyIdSchema,
    wallTerrain: NonEmptyIdSchema,
    stairTerrain: NonEmptyIdSchema,
  }),
  population: z.object({
    encounterProfileIds: z.array(NonEmptyIdSchema).default([]),
    hazardProfileIds: z.array(NonEmptyIdSchema).default([]),
    rewardProfileIds: z.array(NonEmptyIdSchema).default([]),
    narrativeProfileIds: z.array(NonEmptyIdSchema).default([]),
  }).default({
    encounterProfileIds: [],
    hazardProfileIds: [],
    rewardProfileIds: [],
    narrativeProfileIds: [],
  }),
  keyItemPool: z.array(DungeonWeightedRefSchema).default([]),
  rewardItemPool: z.array(DungeonWeightedRefSchema).default([]),
  chemistryMaterialIds: z.array(NonEmptyIdSchema).default([]),
  presentationTags: z.array(NonEmptyIdSchema).default([]),
});

export const DungeonRoomArchetypeSchema = z
  .object({
    id: NonEmptyIdSchema,
    name: NonEmptyIdSchema,
    tags: z.array(NonEmptyIdSchema).default([]),
    minWidth: PositiveIntSchema,
    maxWidth: PositiveIntSchema,
    minDepth: PositiveIntSchema,
    maxDepth: PositiveIntSchema,
    minConnections: NonNegativeIntSchema,
    maxConnections: PositiveIntSchema,
    allowedOnCriticalPath: z.boolean(),
    allowedAsSecret: z.boolean(),
    allowedAsObjective: z.boolean(),
    pressureRange: DungeonMinMaxNumberSchema,
    rewardRange: DungeonMinMaxNumberSchema,
    hazardRange: DungeonMinMaxNumberSchema,
    requiredSocketKinds: z.array(NonEmptyIdSchema).default([]),
    requiredPlacementTags: z.array(NonEmptyIdSchema).default([]),
    forbiddenNeighborArchetypes: z.array(NonEmptyIdSchema).default([]),
  })
  .superRefine((archetype, context) => {
    if (archetype.maxWidth < archetype.minWidth) context.addIssue({ code: "custom", path: ["maxWidth"], message: "maxWidth must be >= minWidth" });
    if (archetype.maxDepth < archetype.minDepth) context.addIssue({ code: "custom", path: ["maxDepth"], message: "maxDepth must be >= minDepth" });
    if (archetype.maxConnections < archetype.minConnections) context.addIssue({ code: "custom", path: ["maxConnections"], message: "maxConnections must be >= minConnections" });
  });

export const DungeonMacroCoordSchema = z
  .array(z.number().int())
  .length(2)
  .transform((value): [number, number] => [value[0]!, value[1]!]);
export const DungeonCardinalFacingSchema = DungeonMacroCoordSchema.refine(
  ([x, z]) => Math.abs(x) + Math.abs(z) === 1,
  { message: "facing must be one cardinal unit vector" },
);
export const DungeonRotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);

export const DungeonTemplateCellSchema = z.object({
  cell: DungeonMacroCoordSchema,
  walkable: z.boolean(),
  height: FiniteNumberSchema.nonnegative().default(0),
  visualHeight: FiniteNumberSchema.nonnegative().default(0),
  terrain: NonEmptyIdSchema.optional(),
  objectId: NonEmptyIdSchema.optional(),
  tag: NonEmptyIdSchema.optional(),
  surfaceTag: z.enum(["none", "water", "oil", "blood", "poison", "firehazard", "ice"]).default("none"),
});

export const DungeonConnectionSocketSchema = z.object({
  id: NonEmptyIdSchema,
  cell: DungeonMacroCoordSchema,
  facing: DungeonCardinalFacingSchema,
  width: PositiveIntSchema.default(1),
  elevation: FiniteNumberSchema.default(0),
  connectionTypes: z.array(z.enum(["open", "door", "locked", "secret", "vertical"])).min(1),
  requiredClearance: PositiveIntSchema.default(1),
  tags: z.array(NonEmptyIdSchema).default([]),
  allowDoor: z.boolean().default(true),
  required: z.boolean().default(false),
});

export const DungeonPopulationSocketKindSchema = z.enum([
  "enemy_melee",
  "enemy_ranged",
  "enemy_support",
  "patrol_start",
  "reinforcement",
  "cover",
  "pushable",
  "container",
  "resource",
  "hazard_source",
  "liquid_source",
  "gas_source",
  "workstation",
  "document",
  "corpse",
  "shrine",
  "npc",
  "attend_node",
  "grid_lens",
  "light",
  "landmark",
]);

export const DungeonPopulationSocketSchema = z.object({
  id: NonEmptyIdSchema,
  kind: DungeonPopulationSocketKindSchema,
  cell: DungeonMacroCoordSchema,
  facing: DungeonCardinalFacingSchema.optional(),
  tags: z.array(NonEmptyIdSchema).default([]),
  requiredClearance: PositiveIntSchema.default(1),
  required: z.boolean().default(false),
});

export const DungeonLocalPathSchema = z.object({
  id: NonEmptyIdSchema,
  cells: z.array(DungeonMacroCoordSchema).min(1),
});

export const DungeonRoomTemplateSchema = z
  .object({
    id: NonEmptyIdSchema,
    name: NonEmptyIdSchema,
    description: z.string().optional(),
    archetypeIds: z.array(NonEmptyIdSchema).min(1),
    themeTags: z.array(NonEmptyIdSchema).default([]),
    bounds: z.object({ width: PositiveIntSchema, depth: PositiveIntSchema }),
    rotationModes: z.array(DungeonRotationSchema).min(1),
    cells: z.array(DungeonTemplateCellSchema).min(1),
    connectionSockets: z.array(DungeonConnectionSocketSchema).min(1),
    populationSockets: z.array(DungeonPopulationSocketSchema).default([]),
    reservedPaths: z.array(DungeonLocalPathSchema).default([]),
    requiredObjectRefs: z.array(NonEmptyIdSchema).default([]),
    requiredMaterialRefs: z.array(NonEmptyIdSchema).default([]),
  })
  .superRefine((template, context) => {
    const withinBounds = ([x, z]: readonly [number, number]) =>
      x >= 0 && z >= 0 && x < template.bounds.width && z < template.bounds.depth;
    const seenCells = new Set<string>();
    template.cells.forEach((entry, index) => {
      const key = `${entry.cell[0]}:${entry.cell[1]}`;
      if (!withinBounds(entry.cell)) context.addIssue({ code: "custom", path: ["cells", index, "cell"], message: "template cell is outside local bounds" });
      if (seenCells.has(key)) context.addIssue({ code: "custom", path: ["cells", index, "cell"], message: "duplicate template cell" });
      seenCells.add(key);
    });
    const socketIds = new Set<string>();
    template.connectionSockets.forEach((socket, index) => {
      if (!withinBounds(socket.cell)) context.addIssue({ code: "custom", path: ["connectionSockets", index, "cell"], message: "connection socket is outside local bounds" });
      const [x, z] = socket.cell;
      const [fx, fz] = socket.facing;
      const onFacingBoundary =
        (fx < 0 && x === 0) ||
        (fx > 0 && x === template.bounds.width - 1) ||
        (fz < 0 && z === 0) ||
        (fz > 0 && z === template.bounds.depth - 1);
      if (!onFacingBoundary) context.addIssue({ code: "custom", path: ["connectionSockets", index], message: "connection socket must face outward from a matching boundary" });
      if (socketIds.has(socket.id)) context.addIssue({ code: "custom", path: ["connectionSockets", index, "id"], message: "duplicate connection socket ID" });
      socketIds.add(socket.id);
    });
    const populationIds = new Set<string>();
    template.populationSockets.forEach((socket, index) => {
      if (!withinBounds(socket.cell)) context.addIssue({ code: "custom", path: ["populationSockets", index, "cell"], message: "population socket is outside local bounds" });
      if (populationIds.has(socket.id)) context.addIssue({ code: "custom", path: ["populationSockets", index, "id"], message: "duplicate population socket ID" });
      populationIds.add(socket.id);
    });
    template.reservedPaths.forEach((path, pathIndex) => path.cells.forEach((cell, cellIndex) => {
      if (!withinBounds(cell)) context.addIssue({ code: "custom", path: ["reservedPaths", pathIndex, "cells", cellIndex], message: "reserved path cell is outside local bounds" });
    }));
  });

export const DungeonEncounterRoleSchema = z.enum(["frontline", "ranged", "support", "ambush", "patrol"]);
export const DungeonEncounterActorSlotSchema = z
  .object({
    entityId: NonEmptyIdSchema,
    role: DungeonEncounterRoleSchema,
    minCount: NonNegativeIntSchema,
    maxCount: NonNegativeIntSchema,
    placementTag: NonEmptyIdSchema.optional(),
  })
  .superRefine((slot, context) => {
    if (slot.maxCount < slot.minCount) context.addIssue({ code: "custom", path: ["maxCount"], message: "maxCount must be >= minCount" });
  });

export const DungeonEncounterSituationSchema = z
  .object({
    id: NonEmptyIdSchema,
    name: NonEmptyIdSchema,
    tags: z.array(NonEmptyIdSchema).default([]),
    roomTags: z.array(NonEmptyIdSchema).default([]),
    weight: FiniteNumberSchema.positive().default(1),
    encounterId: NonEmptyIdSchema.optional(),
    actorSlots: z.array(DungeonEncounterActorSlotSchema).default([]),
    pressure: z.enum(["quiet", "discovery", "tension", "combat", "hazard", "recovery", "landmark", "climax"]),
    threatCost: FiniteNumberSchema.nonnegative(),
    requiredEntryCount: PositiveIntSchema.default(1),
    requiresCover: z.boolean().default(false),
    requiresElevation: z.boolean().default(false),
    requiresHazard: z.boolean().default(false),
    requiresPushable: z.boolean().default(false),
    allowReinforcements: z.boolean().default(false),
  })
  .superRefine((situation, context) => {
    if (!situation.encounterId && !situation.actorSlots.length) {
      context.addIssue({ code: "custom", path: ["actorSlots"], message: "a situation needs an encounterId or at least one actor slot" });
    }
  });

export const DungeonEncounterProfileSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  description: z.string().optional(),
  tags: z.array(NonEmptyIdSchema).default([]),
  factionIds: z.array(NonEmptyIdSchema).default([]),
  situations: z.array(DungeonEncounterSituationSchema).min(1),
  maxCombatRoomRatio: FiniteNumberSchema.min(0).max(1).default(0.45),
  quietRoomRatio: FiniteNumberSchema.min(0).max(1).default(0.25),
});

export const DungeonInitialChemistrySchema = z.object({
  materialId: NonEmptyIdSchema.optional(),
  liquidId: NonEmptyIdSchema.optional(),
  temperature: FiniteNumberSchema.min(-100).max(125).optional(),
  saturation: FiniteNumberSchema.min(0).max(100).optional(),
  charge: FiniteNumberSchema.min(0).max(100).optional(),
  integrity: FiniteNumberSchema.min(0).max(100).optional(),
  foam: FiniteNumberSchema.min(0).max(100).optional(),
  fuel: FiniteNumberSchema.min(0).max(100).optional(),
  stability: FiniteNumberSchema.min(0).max(100).optional(),
  scorch: FiniteNumberSchema.min(0).max(100).optional(),
  frozen: z.boolean().optional(),
  liquidVolume: FiniteNumberSchema.min(0).max(400).optional(),
  vapor: FiniteNumberSchema.min(0).max(100).optional(),
});

export const DungeonHazardPatternSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  tags: z.array(NonEmptyIdSchema).default([]),
  roomTags: z.array(NonEmptyIdSchema).default([]),
  kind: z.enum(["flood", "electric_water", "flammable_debris", "fire", "gas", "ice", "foam", "unstable_structure"]),
  weight: FiniteNumberSchema.positive().default(1),
  hazardCost: FiniteNumberSchema.nonnegative(),
  activeCellCount: DungeonMinMaxIntSchema,
  initialChemistry: DungeonInitialChemistrySchema,
  sourceObjectIds: z.array(NonEmptyIdSchema).default([]),
  responseObjectIds: z.array(NonEmptyIdSchema).default([]),
  requiredVerbs: z.array(NonEmptyIdSchema).default([]),
  criticalPathAllowed: z.boolean().default(true),
  requiresAlternateRoute: z.boolean().default(false),
});

export const DungeonHazardProfileSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  description: z.string().optional(),
  tags: z.array(NonEmptyIdSchema).default([]),
  patterns: z.array(DungeonHazardPatternSchema).min(1),
  maxHazardRoomRatio: FiniteNumberSchema.min(0).max(1).default(0.35),
  safeStartRadius: NonNegativeIntSchema.default(2),
  maxInitialActiveCells: PositiveIntSchema.default(250),
});

export const DungeonRewardTierSchema = z.object({
  id: NonEmptyIdSchema,
  minDepth: FiniteNumberSchema.min(0).max(1),
  maxDepth: FiniteNumberSchema.min(0).max(1),
  itemPool: z.array(DungeonWeightedRefSchema).min(1),
  minItemCount: PositiveIntSchema.default(1),
  maxItemCount: PositiveIntSchema.default(1),
  resourceCost: FiniteNumberSchema.nonnegative(),
}).superRefine((tier, context) => {
  if (tier.maxDepth < tier.minDepth) context.addIssue({ code: "custom", path: ["maxDepth"], message: "maxDepth must be >= minDepth" });
  if (tier.maxItemCount < tier.minItemCount) context.addIssue({ code: "custom", path: ["maxItemCount"], message: "maxItemCount must be >= minItemCount" });
});

export const DungeonRewardProfileSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  description: z.string().optional(),
  tags: z.array(NonEmptyIdSchema).default([]),
  tiers: z.array(DungeonRewardTierSchema).min(1),
  keyItemPool: z.array(DungeonWeightedRefSchema).default([]),
  containerObjectIds: z.array(DungeonWeightedRefSchema).default([]),
  guaranteedResourceRooms: NonNegativeIntSchema.default(1),
});

export const DungeonNarrativeTraceSchema = z
  .object({
    id: NonEmptyIdSchema,
    name: NonEmptyIdSchema,
    tags: z.array(NonEmptyIdSchema).default([]),
    roomTags: z.array(NonEmptyIdSchema).default([]),
    weight: FiniteNumberSchema.positive().default(1),
    documentId: NonEmptyIdSchema.optional(),
    objectId: NonEmptyIdSchema.optional(),
    entityId: NonEmptyIdSchema.optional(),
    dialogueId: NonEmptyIdSchema.optional(),
    cutsceneId: NonEmptyIdSchema.optional(),
    placementTag: NonEmptyIdSchema.optional(),
  })
  .superRefine((trace, context) => {
    if (!trace.documentId && !trace.objectId && !trace.entityId && !trace.dialogueId && !trace.cutsceneId) {
      context.addIssue({ code: "custom", path: [], message: "narrative trace must reference at least one ordinary content record" });
    }
  });

export const DungeonNarrativeProfileSchema = z.object({
  id: NonEmptyIdSchema,
  name: NonEmptyIdSchema,
  description: z.string().optional(),
  tags: z.array(NonEmptyIdSchema).default([]),
  traces: z.array(DungeonNarrativeTraceSchema).min(1),
  minTraceRooms: NonNegativeIntSchema.default(1),
  maxTraceRoomRatio: FiniteNumberSchema.min(0).max(1).default(0.35),
});

export const DungeonGateSchema = z.object({
  id: NonEmptyIdSchema,
  edgeId: NonEmptyIdSchema,
  type: z.enum(["key", "switch", "breakable", "verb", "soft"]),
  requiredId: NonEmptyIdSchema.optional(),
  sourceNodeId: NonEmptyIdSchema.optional(),
  mandatory: z.boolean(),
  consumeOnUse: z.boolean().default(false),
});

export const DungeonGraphNodeSchema = z.object({
  id: NonEmptyIdSchema,
  archetypeId: NonEmptyIdSchema,
  depth: FiniteNumberSchema.min(0).max(1),
  branchId: NonEmptyIdSchema.optional(),
  mandatory: z.boolean(),
  secret: z.boolean(),
  floorHint: NonNegativeIntSchema.optional(),
  tags: z.array(NonEmptyIdSchema).default([]),
  rewardTier: FiniteNumberSchema.nonnegative(),
  pressureTier: FiniteNumberSchema.nonnegative(),
});

export const DungeonGraphEdgeSchema = z.object({
  id: NonEmptyIdSchema,
  fromNodeId: NonEmptyIdSchema,
  toNodeId: NonEmptyIdSchema,
  kind: z.enum(["open", "door", "locked", "secret", "vertical"]),
  gateId: NonEmptyIdSchema.optional(),
  oneWay: z.boolean().default(false),
  tags: z.array(NonEmptyIdSchema).default([]),
});

export const DungeonGraphMetricsSchema = z.object({
  nodeCount: NonNegativeIntSchema,
  edgeCount: NonNegativeIntSchema,
  criticalPathLength: NonNegativeIntSchema,
  branchCount: NonNegativeIntSchema,
  loopCount: NonNegativeIntSchema,
  secretCount: NonNegativeIntSchema,
  averageNodeDegree: FiniteNumberSchema.nonnegative(),
  maximumNodeDegree: NonNegativeIntSchema,
  shortestEntranceToObjectivePath: NonNegativeIntSchema,
  longestOptionalRoute: NonNegativeIntSchema,
  gateDepths: z.record(z.string(), FiniteNumberSchema.min(0).max(1)).default({}),
  backtrackingDistance: NonNegativeIntSchema,
  criticalPathNodeRatio: FiniteNumberSchema.min(0).max(1),
  pressureCurve: z.array(FiniteNumberSchema).default([]),
  rewardCurve: z.array(FiniteNumberSchema).default([]),
});

export const DungeonGraphSchema = z
  .object({
    nodes: z.array(DungeonGraphNodeSchema).min(2),
    edges: z.array(DungeonGraphEdgeSchema).min(1),
    entranceNodeId: NonEmptyIdSchema,
    objectiveNodeId: NonEmptyIdSchema,
    optionalObjectiveNodeIds: z.array(NonEmptyIdSchema).default([]),
    gates: z.array(DungeonGateSchema).default([]),
    metrics: DungeonGraphMetricsSchema,
  })
  .superRefine((graph, context) => {
    const nodeIds = new Set<string>();
    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "duplicate graph node ID" });
      nodeIds.add(node.id);
    });
    const edgeIds = new Set<string>();
    graph.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) context.addIssue({ code: "custom", path: ["edges", index, "id"], message: "duplicate graph edge ID" });
      edgeIds.add(edge.id);
      if (!nodeIds.has(edge.fromNodeId)) context.addIssue({ code: "custom", path: ["edges", index, "fromNodeId"], message: "missing source node" });
      if (!nodeIds.has(edge.toNodeId)) context.addIssue({ code: "custom", path: ["edges", index, "toNodeId"], message: "missing target node" });
    });
    if (!nodeIds.has(graph.entranceNodeId)) context.addIssue({ code: "custom", path: ["entranceNodeId"], message: "entrance node is missing" });
    if (!nodeIds.has(graph.objectiveNodeId)) context.addIssue({ code: "custom", path: ["objectiveNodeId"], message: "objective node is missing" });
    const gateIds = new Set<string>();
    graph.gates.forEach((gate, index) => {
      if (gateIds.has(gate.id)) context.addIssue({ code: "custom", path: ["gates", index, "id"], message: "duplicate gate ID" });
      gateIds.add(gate.id);
      if (!edgeIds.has(gate.edgeId)) context.addIssue({ code: "custom", path: ["gates", index, "edgeId"], message: "gate references a missing edge" });
      if (gate.sourceNodeId && !nodeIds.has(gate.sourceNodeId)) context.addIssue({ code: "custom", path: ["gates", index, "sourceNodeId"], message: "gate source references a missing node" });
    });
    graph.edges.forEach((edge, index) => {
      if (edge.gateId && !gateIds.has(edge.gateId)) context.addIssue({ code: "custom", path: ["edges", index, "gateId"], message: "edge references a missing gate" });
    });
  });

export const DungeonRectSchema = z.object({
  x: z.number().int(),
  z: z.number().int(),
  width: PositiveIntSchema,
  depth: PositiveIntSchema,
});

export const DungeonPlacedSocketSchema = z.object({
  id: NonEmptyIdSchema,
  cell: DungeonMacroCoordSchema,
  facing: DungeonCardinalFacingSchema,
  width: PositiveIntSchema,
  elevation: FiniteNumberSchema,
  tags: z.array(NonEmptyIdSchema).default([]),
});

export const DungeonPlacedRoomSchema = z.object({
  nodeId: NonEmptyIdSchema,
  mapId: NonEmptyIdSchema,
  templateId: NonEmptyIdSchema.optional(),
  builderId: NonEmptyIdSchema.optional(),
  origin: DungeonMacroCoordSchema,
  rotation: DungeonRotationSchema,
  bounds: DungeonRectSchema,
  sockets: z.array(DungeonPlacedSocketSchema).default([]),
  reservedCells: z.array(DungeonMacroCoordSchema).default([]),
});

export const DungeonPlacedCorridorSchema = z.object({
  id: NonEmptyIdSchema,
  edgeId: NonEmptyIdSchema,
  mapId: NonEmptyIdSchema,
  cells: z.array(DungeonMacroCoordSchema).min(1),
  width: PositiveIntSchema,
});

export const DungeonPlacedTransitionSchema = z.object({
  id: NonEmptyIdSchema,
  edgeId: NonEmptyIdSchema,
  kind: z.enum(["stairs", "ladder", "lift", "shaft", "portal"]),
  fromMapId: NonEmptyIdSchema,
  fromCell: DungeonMacroCoordSchema,
  toMapId: NonEmptyIdSchema,
  toCell: DungeonMacroCoordSchema,
  pairedTransitionId: NonEmptyIdSchema,
});

export const DungeonEmbeddedFloorSchema = z.object({
  mapId: NonEmptyIdSchema,
  displayName: NonEmptyIdSchema,
  floorIndex: NonNegativeIntSchema,
  width: PositiveIntSchema,
  depth: PositiveIntSchema,
  themeTags: z.array(NonEmptyIdSchema).default([]),
  nodeIds: z.array(NonEmptyIdSchema).min(1),
});

export const DungeonEmbeddedDungeonSchema = z.object({
  maps: z.array(DungeonEmbeddedFloorSchema).min(1).max(3),
  rooms: z.array(DungeonPlacedRoomSchema).min(1),
  corridors: z.array(DungeonPlacedCorridorSchema).default([]),
  transitions: z.array(DungeonPlacedTransitionSchema).default([]),
});

export const DungeonDiagnosticSchema = z.object({
  severity: z.enum(["fatal", "error", "warning", "info"]),
  stage: DungeonStageIdSchema,
  code: NonEmptyIdSchema,
  message: NonEmptyIdSchema,
  nodeId: NonEmptyIdSchema.optional(),
  roomId: NonEmptyIdSchema.optional(),
  mapId: NonEmptyIdSchema.optional(),
  cell: DungeonMacroCoordSchema.optional(),
  relatedIds: z.array(NonEmptyIdSchema).optional(),
  suggestedFix: z.string().optional(),
});

export const DungeonGenerationMetricsSchema = z.object({
  attemptCount: PositiveIntSchema,
  stageDurationMs: z.record(z.string(), FiniteNumberSchema.nonnegative()).default({}),
  totalDurationMs: FiniteNumberSchema.nonnegative(),
  embeddingBacktracks: NonNegativeIntSchema,
  rejectionCodes: z.record(z.string(), NonNegativeIntSchema).default({}),
  mapCount: NonNegativeIntSchema,
  macroCellCount: NonNegativeIntSchema,
  estimatedFineCellCount: NonNegativeIntSchema,
  roomCount: NonNegativeIntSchema,
  actorCount: NonNegativeIntSchema,
  objectCount: NonNegativeIntSchema,
  initialActiveChemistryCells: NonNegativeIntSchema,
  estimatedSaveBytes: NonNegativeIntSchema,
});

export const DungeonGenerationResultSchema = z.object({
  success: z.boolean(),
  recipeId: NonEmptyIdSchema,
  recipeVersion: NonEmptyIdSchema,
  seed: NonEmptyIdSchema,
  generatorVersion: NonEmptyIdSchema,
  contentLibraryHash: NonEmptyIdSchema,
  canonicalResultHash: NonEmptyIdSchema.optional(),
  graph: DungeonGraphSchema.optional(),
  embedded: DungeonEmbeddedDungeonSchema.optional(),
  bakedMapIds: z.array(NonEmptyIdSchema).default([]),
  diagnostics: z.array(DungeonDiagnosticSchema).default([]),
  attemptCount: PositiveIntSchema,
  metrics: DungeonGenerationMetricsSchema,
});
