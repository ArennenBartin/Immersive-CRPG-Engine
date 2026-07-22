import { ItemSchema, type GamePackage } from "../../schema/game";
import {
  DungeonEncounterProfileSchema,
  DungeonHazardProfileSchema,
  DungeonNarrativeProfileSchema,
  DungeonRecipeSchema,
  DungeonRewardProfileSchema,
  DungeonRoomArchetypeSchema,
  DungeonRoomTemplateSchema,
  DungeonThemeProfileSchema,
} from "../schema";
import type {
  DungeonEncounterProfileDef,
  DungeonHazardProfileDef,
  DungeonNarrativeProfileDef,
  DungeonRecipeDef,
  DungeonRewardProfileDef,
  DungeonRoomArchetypeDef,
  DungeonRoomTemplateDef,
  DungeonThemeProfileDef,
} from "../types";

export const INSTITUTIONAL_RUIN_RECIPE_ID = "institutional_ruin_v1";
export const INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID = "institutional_ruin_single_map_v2";
export const FRACTURE_STARTER_LANTERN_ITEM_ID = "itm_fracture_starter_lantern";
export const INSTITUTIONAL_RUIN_THEME_ID = "institutional_ruin_theme_v1";
export const INSTITUTIONAL_RUIN_ENCOUNTER_PROFILE_ID = "institutional_ruin_encounters_v1";
export const INSTITUTIONAL_RUIN_HAZARD_PROFILE_ID = "institutional_ruin_hazards_v1";
export const INSTITUTIONAL_RUIN_REWARD_PROFILE_ID = "institutional_ruin_rewards_v1";
export const INSTITUTIONAL_RUIN_NARRATIVE_PROFILE_ID = "institutional_ruin_narrative_v1";
export const INSTITUTIONAL_RUIN_ENTRANCE_TEMPLATE_ID = "institutional_ruin_entrance_hall_v1";

const ARCHETYPE_IDS = {
  entrance: "dng_arch_entrance",
  connector: "dng_arch_connector",
  junction: "dng_arch_junction",
  combat: "dng_arch_combat_arena",
  hazard: "dng_arch_hazard_room",
  manipulation: "dng_arch_manipulation_room",
  resource: "dng_arch_resource_room",
  rest: "dng_arch_rest_staging",
  locked: "dng_arch_locked_room",
  secret: "dng_arch_secret_room",
  vertical: "dng_arch_vertical_room",
  landmark: "dng_arch_landmark_room",
  story: "dng_arch_story_trace",
  objective: "dng_arch_objective_room",
  shortcut: "dng_arch_return_shortcut",
  service: "dng_arch_service_room",
} as const;

interface ArchetypeOverrides {
  tags?: string[];
  minWidth?: number;
  maxWidth?: number;
  minDepth?: number;
  maxDepth?: number;
  minConnections?: number;
  maxConnections?: number;
  allowedOnCriticalPath?: boolean;
  allowedAsSecret?: boolean;
  allowedAsObjective?: boolean;
  pressureRange?: { min: number; max: number };
  rewardRange?: { min: number; max: number };
  hazardRange?: { min: number; max: number };
  requiredSocketKinds?: string[];
  requiredPlacementTags?: string[];
}

const archetype = (
  id: string,
  name: string,
  overrides: ArchetypeOverrides = {},
): DungeonRoomArchetypeDef => DungeonRoomArchetypeSchema.parse({
  id,
  name,
  tags: overrides.tags ?? [],
  minWidth: overrides.minWidth ?? 5,
  maxWidth: overrides.maxWidth ?? 9,
  minDepth: overrides.minDepth ?? 5,
  maxDepth: overrides.maxDepth ?? 9,
  minConnections: overrides.minConnections ?? 1,
  maxConnections: overrides.maxConnections ?? 4,
  allowedOnCriticalPath: overrides.allowedOnCriticalPath ?? true,
  allowedAsSecret: overrides.allowedAsSecret ?? false,
  allowedAsObjective: overrides.allowedAsObjective ?? false,
  pressureRange: overrides.pressureRange ?? { min: 0.15, max: 0.55 },
  rewardRange: overrides.rewardRange ?? { min: 0.1, max: 0.55 },
  hazardRange: overrides.hazardRange ?? { min: 0, max: 0.35 },
  requiredSocketKinds: overrides.requiredSocketKinds ?? [],
  requiredPlacementTags: overrides.requiredPlacementTags ?? [],
  forbiddenNeighborArchetypes: [],
});

export const INSTITUTIONAL_RUIN_ARCHETYPES: DungeonRoomArchetypeDef[] = [
  archetype(ARCHETYPE_IDS.entrance, "Entrance Hall", {
    tags: ["entrance", "orientation", "quiet"],
    minWidth: 7,
    minDepth: 7,
    minConnections: 1,
    maxConnections: 2,
    pressureRange: { min: 0, max: 0.15 },
    hazardRange: { min: 0, max: 0 },
    requiredPlacementTags: ["safe_spawn", "landmark"],
  }),
  archetype(ARCHETYPE_IDS.connector, "Connector", {
    tags: ["connector", "service"],
    minWidth: 3,
    maxWidth: 6,
    minDepth: 3,
    maxDepth: 8,
    maxConnections: 3,
  }),
  archetype(ARCHETYPE_IDS.junction, "Junction Landmark", {
    tags: ["junction", "landmark"],
    minConnections: 3,
    maxConnections: 5,
    requiredPlacementTags: ["landmark"],
  }),
  archetype(ARCHETYPE_IDS.combat, "Combat Arena", {
    tags: ["combat", "arena", "maneuver"],
    minWidth: 8,
    minDepth: 8,
    pressureRange: { min: 0.65, max: 1 },
    requiredPlacementTags: ["cover", "enemy_melee", "enemy_ranged"],
  }),
  archetype(ARCHETYPE_IDS.hazard, "Hazard Room", {
    tags: ["hazard", "systemic"],
    // Keep the dedicated hazard chamber on an optional route. Critical-path
    // hazards can still be authored through service/resource rooms whose
    // selected patterns explicitly allow them.
    allowedOnCriticalPath: false,
    pressureRange: { min: 0.45, max: 0.85 },
    hazardRange: { min: 0.5, max: 1 },
    requiredPlacementTags: ["hazard_source", "response"],
  }),
  archetype(ARCHETYPE_IDS.manipulation, "Manipulation Room", {
    tags: ["manipulation", "pushable", "breakable"],
    requiredPlacementTags: ["pushable"],
  }),
  archetype(ARCHETYPE_IDS.resource, "Storage and Resource Room", {
    tags: ["resource", "storage", "recovery"],
    pressureRange: { min: 0, max: 0.25 },
    rewardRange: { min: 0.55, max: 0.9 },
    hazardRange: { min: 0, max: 0.2 },
    requiredPlacementTags: ["resource", "container"],
  }),
  archetype(ARCHETYPE_IDS.rest, "Rest and Staging Room", {
    tags: ["rest", "staging", "quiet"],
    pressureRange: { min: 0, max: 0.1 },
    hazardRange: { min: 0, max: 0 },
  }),
  archetype(ARCHETYPE_IDS.locked, "Locked Archive", {
    tags: ["locked", "archive", "reward"],
    allowedAsSecret: true,
    rewardRange: { min: 0.65, max: 1 },
    requiredSocketKinds: ["locked"],
  }),
  archetype(ARCHETYPE_IDS.secret, "Secret Records Room", {
    tags: ["secret", "optional", "reward"],
    allowedOnCriticalPath: false,
    allowedAsSecret: true,
    rewardRange: { min: 0.7, max: 1 },
    requiredSocketKinds: ["secret"],
  }),
  archetype(ARCHETYPE_IDS.vertical, "Vertical Service Room", {
    tags: ["vertical", "stairs", "service"],
    minConnections: 2,
    requiredSocketKinds: ["vertical"],
  }),
  archetype(ARCHETYPE_IDS.landmark, "Institutional Landmark", {
    tags: ["landmark", "orientation"],
    minWidth: 7,
    minDepth: 7,
    requiredPlacementTags: ["landmark", "light"],
  }),
  archetype(ARCHETYPE_IDS.story, "Story Trace Room", {
    tags: ["story", "document", "evidence"],
    allowedAsSecret: true,
    requiredPlacementTags: ["document"],
  }),
  archetype(ARCHETYPE_IDS.objective, "Objective Chamber", {
    tags: ["objective", "climax", "landmark"],
    minWidth: 9,
    maxWidth: 12,
    minDepth: 9,
    maxDepth: 12,
    allowedAsObjective: true,
    pressureRange: { min: 0.7, max: 1 },
    rewardRange: { min: 0.8, max: 1 },
    requiredPlacementTags: ["objective", "landmark"],
  }),
  archetype(ARCHETYPE_IDS.shortcut, "Return Shortcut Room", {
    tags: ["shortcut", "loop", "return"],
    minConnections: 2,
    maxConnections: 3,
    requiredSocketKinds: ["locked", "open"],
  }),
  archetype(ARCHETYPE_IDS.service, "Institutional Service Room", {
    tags: ["service", "infrastructure", "mechanism"],
    requiredPlacementTags: ["workstation"],
  }),
];

const entranceTemplateCells = Array.from({ length: 7 * 7 }, (_, index) => {
  const x = index % 7;
  const z = Math.floor(index / 7);
  const socket = (x === 3 && (z === 0 || z === 6)) || (z === 3 && (x === 0 || x === 6));
  const walkable = socket || (x > 0 && x < 6 && z > 0 && z < 6);
  return {
    cell: [x, z] as [number, number],
    walkable,
    height: walkable ? 0 : 3,
    visualHeight: walkable ? 0 : 3.6,
    terrain: walkable ? "stone_floor" : "stone_wall",
    objectId: walkable ? undefined : "obj_wall_block",
    tag: socket ? "connection" : walkable ? "entrance_hall" : "boundary",
    surfaceTag: "none" as const,
  };
});

export const INSTITUTIONAL_RUIN_ROOM_TEMPLATES: DungeonRoomTemplateDef[] = [
  DungeonRoomTemplateSchema.parse({
    id: INSTITUTIONAL_RUIN_ENTRANCE_TEMPLATE_ID,
    name: "Institutional Ruin Entrance Hall",
    description: "A four-socket orientation hall with a protected spawn lane and authored population points.",
    archetypeIds: [ARCHETYPE_IDS.entrance, ARCHETYPE_IDS.junction, ARCHETYPE_IDS.landmark],
    themeTags: ["institutional_ruin", "stone", "entrance"],
    bounds: { width: 7, depth: 7 },
    rotationModes: [0, 90, 180, 270],
    cells: entranceTemplateCells,
    connectionSockets: [
      { id: "north", cell: [3, 0], facing: [0, -1], width: 1, elevation: 0, connectionTypes: ["open", "door"], tags: ["main"], required: true },
      { id: "east", cell: [6, 3], facing: [1, 0], width: 1, elevation: 0, connectionTypes: ["open", "door"], tags: ["side"] },
      { id: "south", cell: [3, 6], facing: [0, 1], width: 1, elevation: 0, connectionTypes: ["open", "door"], tags: ["main"], required: true },
      { id: "west", cell: [0, 3], facing: [-1, 0], width: 1, elevation: 0, connectionTypes: ["open", "door"], tags: ["side"] },
    ],
    populationSockets: [
      { id: "safe_spawn", kind: "landmark", cell: [3, 4], facing: [0, -1], tags: ["safe_spawn"], required: true },
      { id: "cover_left", kind: "cover", cell: [1, 2], tags: ["cover"] },
      { id: "cover_right", kind: "cover", cell: [5, 2], tags: ["cover"] },
      { id: "light_center", kind: "light", cell: [3, 3], tags: ["landmark", "light"] },
    ],
    reservedPaths: [
      { id: "critical_north_south", cells: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6]] },
    ],
    requiredObjectRefs: ["obj_wall_block", "obj_floor_plate"],
    requiredMaterialRefs: ["stone"],
  }),
];

export const INSTITUTIONAL_RUIN_ENCOUNTER_PROFILE: DungeonEncounterProfileDef =
  DungeonEncounterProfileSchema.parse({
    id: INSTITUTIONAL_RUIN_ENCOUNTER_PROFILE_ID,
    name: "Institutional Ruin Occupation",
    description: "Three ordinary-actor tactical situations with different spatial demands.",
    tags: ["institutional_ruin", "built_dungeon"],
    factionIds: ["f_guild"],
    maxCombatRoomRatio: 0.4,
    quietRoomRatio: 0.3,
    situations: [
      {
        id: "ruin_situation_guarded_threshold",
        name: "Guarded Threshold",
        tags: ["guard", "choke"],
        roomTags: ["connector", "locked"],
        pressure: "combat",
        threatCost: 2,
        requiredEntryCount: 1,
        requiresCover: true,
        actorSlots: [
          { entityId: "ent_training_bot", role: "frontline", minCount: 2, maxCount: 2 },
          { entityId: "ent_stealth_watcher", role: "ranged", minCount: 1, maxCount: 1, placementTag: "cover" },
        ],
      },
      {
        id: "ruin_situation_patrol_crossing",
        name: "Patrol Crossing",
        tags: ["patrol", "junction"],
        roomTags: ["junction", "landmark"],
        pressure: "tension",
        threatCost: 1.5,
        requiredEntryCount: 3,
        actorSlots: [
          { entityId: "ent_training_bot", role: "patrol", minCount: 1, maxCount: 2 },
          { entityId: "ent_stealth_watcher", role: "ambush", minCount: 1, maxCount: 1 },
        ],
      },
      {
        id: "ruin_situation_objective_hold",
        name: "Objective Hold",
        tags: ["climax", "objective"],
        roomTags: ["objective", "arena"],
        pressure: "climax",
        threatCost: 3.5,
        requiredEntryCount: 2,
        requiresCover: true,
        requiresElevation: true,
        actorSlots: [
          { entityId: "ent_training_bot", role: "frontline", minCount: 2, maxCount: 3 },
          { entityId: "ent_stealth_watcher", role: "ranged", minCount: 1, maxCount: 1 },
          { entityId: "ent_training_bot", role: "support", minCount: 0, maxCount: 1 },
        ],
      },
    ],
  });

export const INSTITUTIONAL_RUIN_HAZARD_PROFILE: DungeonHazardProfileDef =
  DungeonHazardProfileSchema.parse({
    id: INSTITUTIONAL_RUIN_HAZARD_PROFILE_ID,
    name: "Institutional Ruin Hazards",
    description: "Sparse readable water, electricity, fire-fuel, gas, and foam setups using ordinary chemistry state.",
    tags: ["institutional_ruin", "chemistry"],
    maxHazardRoomRatio: 0.3,
    safeStartRadius: 2,
    maxInitialActiveCells: 180,
    patterns: [
      {
        id: "ruin_hazard_flooded_lower_route",
        name: "Flooded Lower Route",
        kind: "flood",
        tags: ["water", "lower_route"],
        roomTags: ["hazard", "service"],
        hazardCost: 1,
        activeCellCount: { min: 4, max: 12 },
        initialChemistry: { materialId: "stone", liquidId: "water", temperature: 18, saturation: 100, integrity: 100, stability: 100, liquidVolume: 45 },
        sourceObjectIds: ["obj_rain_barrel"],
        responseObjectIds: ["obj_crate"],
        requiredVerbs: ["move"],
        criticalPathAllowed: true,
        requiresAlternateRoute: true,
      },
      {
        id: "ruin_hazard_live_water_channel",
        name: "Live Water Channel",
        kind: "electric_water",
        tags: ["water", "electric", "conductive"],
        roomTags: ["hazard", "service"],
        hazardCost: 2,
        activeCellCount: { min: 3, max: 8 },
        initialChemistry: { materialId: "metal", liquidId: "water", temperature: 22, saturation: 100, charge: 70, integrity: 100, stability: 100, liquidVolume: 35 },
        sourceObjectIds: ["obj_mechanism_workbench"],
        responseObjectIds: ["obj_terminal", "obj_crate"],
        requiredVerbs: ["interact", "move"],
        criticalPathAllowed: false,
        requiresAlternateRoute: true,
      },
      {
        id: "ruin_hazard_flammable_debris",
        name: "Flammable Debris Branch",
        kind: "flammable_debris",
        tags: ["fire", "wood", "optional"],
        roomTags: ["hazard", "secret", "service"],
        hazardCost: 1.5,
        activeCellCount: { min: 3, max: 10 },
        initialChemistry: { materialId: "wood", temperature: 25, integrity: 80, fuel: 85, stability: 75, scorch: 5 },
        sourceObjectIds: ["obj_crate", "obj_firewood_pile"],
        responseObjectIds: ["obj_rain_barrel"],
        requiredVerbs: ["douse", "break"],
        criticalPathAllowed: false,
      },
      {
        id: "ruin_hazard_miasma_service_room",
        name: "Miasma Service Room",
        kind: "gas",
        tags: ["gas", "ventilation"],
        roomTags: ["hazard", "service"],
        hazardCost: 1.5,
        activeCellCount: { min: 2, max: 7 },
        initialChemistry: { materialId: "stone", temperature: 24, integrity: 100, stability: 100, vapor: 55 },
        sourceObjectIds: ["obj_floor_hatch"],
        responseObjectIds: ["obj_crate"],
        requiredVerbs: ["move"],
        criticalPathAllowed: false,
        requiresAlternateRoute: true,
      },
      {
        id: "ruin_hazard_foam_response_cache",
        name: "Foam Response Cache",
        kind: "foam",
        tags: ["foam", "response", "resource"],
        roomTags: ["resource", "hazard"],
        hazardCost: 0.5,
        activeCellCount: { min: 1, max: 4 },
        initialChemistry: { materialId: "foam", temperature: 20, integrity: 100, foam: 85, stability: 100 },
        sourceObjectIds: ["obj_cupboard"],
        responseObjectIds: ["obj_cupboard"],
        requiredVerbs: ["interact"],
        criticalPathAllowed: true,
      },
    ],
  });

export const INSTITUTIONAL_RUIN_REWARD_PROFILE: DungeonRewardProfileDef =
  DungeonRewardProfileSchema.parse({
    id: INSTITUTIONAL_RUIN_REWARD_PROFILE_ID,
    name: "Institutional Ruin Supplies",
    description: "Existing ordinary engine items distributed by depth and optional-route value.",
    tags: ["institutional_ruin", "supplies"],
    guaranteedResourceRooms: 2,
    keyItemPool: [{ id: "itm_practice_key", weight: 1 }],
    containerObjectIds: [{ id: "obj_chest", weight: 1 }],
    tiers: [
      { id: "ruin_reward_early", minDepth: 0, maxDepth: 0.4, itemPool: [{ id: "itm_field_ration", weight: 2 }, { id: "itm_health_tonic", weight: 1 }], minItemCount: 1, maxItemCount: 2, resourceCost: 1 },
      { id: "ruin_reward_mid", minDepth: 0.25, maxDepth: 0.75, itemPool: [{ id: "itm_health_tonic", weight: 2 }, { id: "itm_training_token", weight: 1 }], minItemCount: 1, maxItemCount: 2, resourceCost: 1.5 },
      { id: "ruin_reward_deep", minDepth: 0.65, maxDepth: 1, itemPool: [{ id: "itm_training_token", weight: 2 }, { id: "itm_health_tonic", weight: 1 }], minItemCount: 2, maxItemCount: 3, resourceCost: 2.5 },
    ],
  });

export const INSTITUTIONAL_RUIN_NARRATIVE_PROFILE: DungeonNarrativeProfileDef =
  DungeonNarrativeProfileSchema.parse({
    id: INSTITUTIONAL_RUIN_NARRATIVE_PROFILE_ID,
    name: "Institutional Ruin Traces",
    description: "Authored engine demonstration records arranged as optional environmental traces.",
    tags: ["institutional_ruin", "story_trace"],
    minTraceRooms: 2,
    maxTraceRoomRatio: 0.3,
    traces: [
      { id: "ruin_trace_field_note", name: "Abandoned Field Note", tags: ["document"], roomTags: ["story", "resource"], documentId: "doc_demo_note", objectId: "obj_bookshelf", cutsceneId: "cut_read_demo_note", placementTag: "document" },
      { id: "ruin_trace_dead_terminal", name: "Service Terminal", tags: ["terminal", "work"], roomTags: ["service", "landmark"], objectId: "obj_terminal", dialogueId: "dia_demo_terminal", placementTag: "workstation" },
      { id: "ruin_trace_broken_memorial", name: "Broken Memorial", tags: ["shrine", "damage"], roomTags: ["story", "secret"], objectId: "obj_broken_statue", placementTag: "shrine" },
    ],
  });

export const INSTITUTIONAL_RUIN_THEME: DungeonThemeProfileDef =
  DungeonThemeProfileSchema.parse({
    id: INSTITUTIONAL_RUIN_THEME_ID,
    name: "Abandoned Institutional Ruin",
    description: "Setting-neutral stone service architecture using the engine's ordinary base assets.",
    tags: ["institutional_ruin", "built", "excavated", "stone"],
    architecture: {
      floorObjectId: "obj_floor_plate",
      wallObjectId: "obj_wall_block",
      doorObjectId: "obj_p_door",
      containerObjectId: "obj_chest",
      pushableObjectId: "obj_crate",
      stairObjectId: "obj_ladder",
      terminalObjectId: "obj_terminal",
      floorTerrain: "stone_floor",
      wallTerrain: "stone_wall",
      stairTerrain: "stone_stair",
    },
    population: {
      encounterProfileIds: [INSTITUTIONAL_RUIN_ENCOUNTER_PROFILE_ID],
      hazardProfileIds: [INSTITUTIONAL_RUIN_HAZARD_PROFILE_ID],
      rewardProfileIds: [INSTITUTIONAL_RUIN_REWARD_PROFILE_ID],
      narrativeProfileIds: [INSTITUTIONAL_RUIN_NARRATIVE_PROFILE_ID],
    },
    keyItemPool: [{ id: "itm_practice_key", weight: 1 }],
    rewardItemPool: [
      { id: "itm_health_tonic", weight: 2 },
      { id: "itm_field_ration", weight: 2 },
      { id: "itm_training_token", weight: 1 },
    ],
    chemistryMaterialIds: ["stone", "metal", "wood", "water", "oil", "foam"],
    presentationTags: ["dim", "institutional", "weathered"],
  });

export const createInstitutionalRuinRecipe = (
  seed = "institutional-ruin-001",
): DungeonRecipeDef => DungeonRecipeSchema.parse({
  id: INSTITUTIONAL_RUIN_RECIPE_ID,
  name: "Institutional Ruin",
  description: "Two linked floors, 16–20 rooms, a key gate, a secret, a meaningful loop, tactical situations, and systemic hazards.",
  version: "1.0.0",
  generatorId: "dungeon",
  generatorVersion: "dungeon_v1",
  seed,
  stageSalts: {},
  outputMode: "multi_map_floors",
  themeId: INSTITUTIONAL_RUIN_THEME_ID,
  scale: {
    floorCount: { min: 2, max: 2 },
    roomCount: { min: 16, max: 20 },
    roomWidth: { min: 5, max: 10 },
    roomDepth: { min: 5, max: 10 },
    floorMapWidth: 64,
    floorMapDepth: 64,
    floorHeightStep: 3,
  },
  topology: {
    criticalPathLength: { min: 8, max: 10 },
    branchCount: { min: 2, max: 3 },
    branchLength: { min: 2, max: 3 },
    loopCount: { min: 1, max: 1 },
    secretCount: { min: 1, max: 2 },
    lockCount: { min: 1, max: 1 },
    optionalObjectiveCount: { min: 0, max: 1 },
    requireReturnPath: true,
  },
  architecture: {
    roomArchetypePool: INSTITUTIONAL_RUIN_ARCHETYPES.map((entry) => ({
      id: entry.id,
      weight: entry.id === ARCHETYPE_IDS.connector || entry.id === ARCHETYPE_IDS.service ? 3 : 1,
    })),
    roomTemplatePool: [{ id: INSTITUTIONAL_RUIN_ENTRANCE_TEMPLATE_ID, weight: 2 }],
    proceduralRoomBuilderPool: [{ id: "rectangular_room_v1", weight: 8 }],
    corridorWidth: { min: 1, max: 2 },
    roomPadding: 1,
    allowDiagonalCorridors: false,
    allowVerticalTransitions: true,
    verticalTransitionTypes: ["stairs", "ladder"],
    boundaryStyle: "institutional_stone",
  },
  population: {
    encounterProfileId: INSTITUTIONAL_RUIN_ENCOUNTER_PROFILE_ID,
    hazardProfileId: INSTITUTIONAL_RUIN_HAZARD_PROFILE_ID,
    rewardProfileId: INSTITUTIONAL_RUIN_REWARD_PROFILE_ID,
    narrativeProfileId: INSTITUTIONAL_RUIN_NARRATIVE_PROFILE_ID,
  },
  difficulty: {
    baseThreat: 2,
    threatGrowthByDepth: 2.5,
    optionalBranchThreatMultiplier: 1.25,
    resourceBudget: 8,
    hazardBudget: 6,
    complexityBudget: 12,
  },
  constraints: {
    requiredRoomArchetypes: [
      ARCHETYPE_IDS.entrance,
      ARCHETYPE_IDS.junction,
      ARCHETYPE_IDS.resource,
      ARCHETYPE_IDS.hazard,
      ARCHETYPE_IDS.combat,
      ARCHETYPE_IDS.vertical,
      ARCHETYPE_IDS.locked,
      ARCHETYPE_IDS.objective,
      ARCHETYPE_IDS.shortcut,
    ],
    forbiddenAdjacencies: [
      { fromArchetypeId: ARCHETYPE_IDS.entrance, toArchetypeId: ARCHETYPE_IDS.hazard, bidirectional: true },
      { fromArchetypeId: ARCHETYPE_IDS.rest, toArchetypeId: ARCHETYPE_IDS.combat, bidirectional: true },
    ],
    requiredTags: ["built", "return_path", "optional_branch", "loop", "secret", "key_gate"],
    permittedVerbs: ["move", "interact", "push", "break", "douse", "burn"],
    permittedChemistryMaterials: ["stone", "metal", "wood", "water", "oil", "foam"],
    maxGenerationAttempts: 32,
    maxEmbeddingBacktracks: 2_000,
  },
});

export const FRACTURE_STARTER_LANTERN: GamePackage["items"][number] = ItemSchema.parse({
  id: FRACTURE_STARTER_LANTERN_ITEM_ID,
  display_name: "Expedition Lantern",
  description: "A durable survey lantern placed beside the entrance to a generated fracture.",
  icon: "◉",
  category: "key",
  spatial: {
    shape: [[0, 0]],
    weight_kg: 1.2,
    bulk: 1,
    stack_limit: 1,
  },
  light_source: {
    intensity: 0.9,
    radius: 14,
    color: "#ffd27a",
    active_by_default: true,
    extinguishable: true,
    mobility: "portable",
    persistent: true,
    stimulus_tags: ["light", "lantern", "portable_light", "carried_light"],
    exposes_carrier: true,
  },
});

/**
 * The current rule-definition preset. It deliberately uses one large open
 * floor while the legacy v1 recipe remains available for door, gate, secret,
 * and multi-floor regression coverage.
 */
export const createInstitutionalRuinSingleMapRecipe = (
  seed = "institutional-ruin-single-map-001",
): DungeonRecipeDef => DungeonRecipeSchema.parse({
  id: INSTITUTIONAL_RUIN_SINGLE_MAP_RECIPE_ID,
  name: "Institutional Ruin — Single Map",
  description: "One large, doorless institutional ruin with a directional crawl, lateral branches, a compact loop, and a guaranteed entrance lantern.",
  version: "2.1.0",
  generatorId: "dungeon",
  generatorVersion: "dungeon_v1",
  seed,
  stageSalts: {},
  outputMode: "single_map",
  themeId: INSTITUTIONAL_RUIN_THEME_ID,
  scale: {
    floorCount: { min: 1, max: 1 },
    roomCount: { min: 16, max: 20 },
    roomWidth: { min: 5, max: 12 },
    roomDepth: { min: 5, max: 12 },
    floorMapWidth: 72,
    floorMapDepth: 72,
    floorHeightStep: 3,
  },
  topology: {
    criticalPathLength: { min: 8, max: 10 },
    branchCount: { min: 2, max: 3 },
    branchLength: { min: 2, max: 3 },
    loopCount: { min: 1, max: 1 },
    secretCount: { min: 0, max: 0 },
    lockCount: { min: 0, max: 0 },
    optionalObjectiveCount: { min: 0, max: 1 },
    requireReturnPath: true,
  },
  architecture: {
    connectionMode: "open_only",
    layoutStyle: "directional_crawl",
    roomArchetypePool: INSTITUTIONAL_RUIN_ARCHETYPES
      .filter((entry) => entry.id !== ARCHETYPE_IDS.locked &&
        entry.id !== ARCHETYPE_IDS.secret && entry.id !== ARCHETYPE_IDS.vertical)
      .map((entry) => ({
        id: entry.id,
        weight: entry.id === ARCHETYPE_IDS.connector || entry.id === ARCHETYPE_IDS.service
          ? 3
          : entry.id === ARCHETYPE_IDS.resource || entry.id === ARCHETYPE_IDS.rest || entry.id === ARCHETYPE_IDS.landmark
            ? 2
            : 1,
      })),
    roomTemplatePool: [{ id: INSTITUTIONAL_RUIN_ENTRANCE_TEMPLATE_ID, weight: 4 }],
    proceduralRoomBuilderPool: [
      { id: "rectangular_room_v1", weight: 1 },
      { id: "l_room_v1", weight: 1 },
      { id: "junction_room_v1", weight: 1 },
    ],
    corridorWidth: { min: 3, max: 3 },
    roomPadding: 1,
    allowDiagonalCorridors: false,
    allowVerticalTransitions: false,
    verticalTransitionTypes: [],
    boundaryStyle: "institutional_stone",
  },
  population: {
    encounterProfileId: INSTITUTIONAL_RUIN_ENCOUNTER_PROFILE_ID,
    hazardProfileId: INSTITUTIONAL_RUIN_HAZARD_PROFILE_ID,
    rewardProfileId: INSTITUTIONAL_RUIN_REWARD_PROFILE_ID,
    narrativeProfileId: INSTITUTIONAL_RUIN_NARRATIVE_PROFILE_ID,
    startingLightItemId: FRACTURE_STARTER_LANTERN_ITEM_ID,
  },
  difficulty: {
    baseThreat: 1.5,
    threatGrowthByDepth: 3,
    optionalBranchThreatMultiplier: 1.25,
    resourceBudget: 8,
    hazardBudget: 4,
    complexityBudget: 12,
  },
  constraints: {
    requiredRoomArchetypes: [
      ARCHETYPE_IDS.entrance,
      ARCHETYPE_IDS.junction,
      ARCHETYPE_IDS.resource,
      ARCHETYPE_IDS.rest,
      ARCHETYPE_IDS.combat,
      ARCHETYPE_IDS.landmark,
      ARCHETYPE_IDS.objective,
      ARCHETYPE_IDS.shortcut,
    ],
    forbiddenAdjacencies: [
      { fromArchetypeId: ARCHETYPE_IDS.entrance, toArchetypeId: ARCHETYPE_IDS.hazard, bidirectional: true },
      { fromArchetypeId: ARCHETYPE_IDS.rest, toArchetypeId: ARCHETYPE_IDS.combat, bidirectional: true },
    ],
    requiredTags: ["built", "single_map", "return_path", "optional_branch", "loop", "open_plan"],
    permittedVerbs: ["move", "interact", "push", "break", "douse", "burn"],
    permittedChemistryMaterials: ["stone", "metal", "wood", "water", "oil", "foam"],
    maxGenerationAttempts: 48,
    maxEmbeddingBacktracks: 3_000,
  },
});

export interface DungeonGeneratorAuthoringContent {
  items: GamePackage["items"];
  recipes: DungeonRecipeDef[];
  themes: DungeonThemeProfileDef[];
  roomArchetypes: DungeonRoomArchetypeDef[];
  roomTemplates: DungeonRoomTemplateDef[];
  encounterProfiles: DungeonEncounterProfileDef[];
  hazardProfiles: DungeonHazardProfileDef[];
  rewardProfiles: DungeonRewardProfileDef[];
  narrativeProfiles: DungeonNarrativeProfileDef[];
}

export const createInstitutionalRuinGeneratorContent = (
  seed?: string,
): DungeonGeneratorAuthoringContent => ({
  items: [FRACTURE_STARTER_LANTERN],
  recipes: [
    createInstitutionalRuinRecipe(seed),
    createInstitutionalRuinSingleMapRecipe(seed),
  ],
  themes: [INSTITUTIONAL_RUIN_THEME],
  roomArchetypes: INSTITUTIONAL_RUIN_ARCHETYPES,
  roomTemplates: INSTITUTIONAL_RUIN_ROOM_TEMPLATES,
  encounterProfiles: [INSTITUTIONAL_RUIN_ENCOUNTER_PROFILE],
  hazardProfiles: [INSTITUTIONAL_RUIN_HAZARD_PROFILE],
  rewardProfiles: [INSTITUTIONAL_RUIN_REWARD_PROFILE],
  narrativeProfiles: [INSTITUTIONAL_RUIN_NARRATIVE_PROFILE],
});

const mergeMissingById = <T extends { id: string }>(
  existing: readonly T[],
  additions: readonly T[],
): T[] => {
  const existingIds = new Set(existing.map((entry) => entry.id));
  return [
    ...existing,
    ...additions.filter((entry) => !existingIds.has(entry.id)),
  ];
};

/**
 * Explicit, non-destructive preset merge. Existing package records always win
 * on ID collisions; no maps or unrelated content are replaced.
 */
export const mergeDungeonGeneratorAuthoringContent = (
  pkg: GamePackage,
  content: DungeonGeneratorAuthoringContent,
): GamePackage => ({
  ...pkg,
  items: mergeMissingById(pkg.items, content.items),
  dungeon_recipes: mergeMissingById(pkg.dungeon_recipes, content.recipes),
  dungeon_themes: mergeMissingById(pkg.dungeon_themes, content.themes),
  dungeon_room_archetypes: mergeMissingById(pkg.dungeon_room_archetypes, content.roomArchetypes),
  dungeon_room_templates: mergeMissingById(pkg.dungeon_room_templates, content.roomTemplates),
  dungeon_encounter_profiles: mergeMissingById(pkg.dungeon_encounter_profiles, content.encounterProfiles),
  dungeon_hazard_profiles: mergeMissingById(pkg.dungeon_hazard_profiles, content.hazardProfiles),
  dungeon_reward_profiles: mergeMissingById(pkg.dungeon_reward_profiles, content.rewardProfiles),
  dungeon_narrative_profiles: mergeMissingById(pkg.dungeon_narrative_profiles, content.narrativeProfiles),
});

export const installInstitutionalRuinGeneratorContent = (
  pkg: GamePackage,
): GamePackage => mergeDungeonGeneratorAuthoringContent(
  pkg,
  createInstitutionalRuinGeneratorContent(),
);
